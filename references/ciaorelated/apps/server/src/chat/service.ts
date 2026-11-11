import { Prisma, type PrismaClient } from "@prisma/client";
import { pubsub } from "./pubsub";
import { EVENTS } from "./events";
import { GraphQLError } from "graphql";
import { sendExpoPush } from "../lib/push"; // ✅ nutzt deine push.ts

// ----------------- Utils -----------------
function uniqSorted(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean))).sort();
}
function dmKeyFor(a: string, b: string) {
  return [a, b].sort().join(":");
}
function communityGroupKey(groupId: string) {
  return `community:${groupId}`;
}
function newGroupThreadKey() {
  return `group:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

// ----------------- Blocks (Chat Safety) -----------------
async function getHiddenUserIds(prisma: PrismaClient, meId: string) {
  const [byMe, meBy] = await Promise.all([
    prisma.userBlock.findMany({ where: { blockerId: meId }, select: { blockedId: true } }),
    prisma.userBlock.findMany({ where: { blockedId: meId }, select: { blockerId: true } }),
  ]);

  return new Set<string>([
    ...byMe.map((b) => b.blockedId),
    ...meBy.map((b) => b.blockerId),
  ]);
}

async function assertThreadNotBlocked(prisma: PrismaClient, meId: string, threadId: string) {
  const hidden = await getHiddenUserIds(prisma, meId);
  if (!hidden.size) return;

  const blockedMember = await prisma.threadMember.findFirst({
    where: { threadId, userId: { in: [...hidden] } },
    select: { userId: true },
  });

  if (blockedMember) throw new GraphQLError("BLOCKED");
}

// ThreadMember can lag behind a community exit; GroupLink membership is authoritative.
export async function assertThreadAccess(prisma: PrismaClient, userId: string, threadId: string) {
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, members: { some: { userId } } },
  });
  if (!thread) throw new GraphQLError("NO_ACCESS_TO_THREAD");
  if (thread.groupKey?.startsWith("community:")) {
    const group = await prisma.groupLink.findFirst({
      where: {
        id: thread.groupKey.slice("community:".length), isActive: true, systemKey: null,
        OR: [{ ownerId: userId }, { members: { some: { profileId: userId } } }],
      },
      select: { id: true },
    });
    if (!group) throw new GraphQLError("NO_ACCESS_TO_THREAD");
  }
  await assertThreadNotBlocked(prisma, userId, threadId);
  return thread;
}

async function accessibleThreads<T extends { groupKey: string | null }>(prisma: PrismaClient, userId: string, threads: T[]) {
  const groupIds = threads.flatMap(t => t.groupKey?.startsWith("community:") ? [t.groupKey.slice("community:".length)] : []);
  if (!groupIds.length) return threads;
  const groups = await prisma.groupLink.findMany({
    where: {
      id: { in: groupIds }, isActive: true, systemKey: null,
      OR: [{ ownerId: userId }, { members: { some: { profileId: userId } } }],
    },
    select: { id: true },
  });
  const allowed = new Set(groups.map(g => communityGroupKey(g.id)));
  return threads.filter(t => !t.groupKey?.startsWith("community:") || allowed.has(t.groupKey));
}


// ----------------- Delete Message -----------------
export async function deleteMessage(prisma: PrismaClient, profileId: string, messageId: string) {
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, senderId: true, threadId: true },
  });

  if (!msg) throw new GraphQLError("NOT_FOUND");
  if (msg.senderId !== profileId) throw new GraphQLError("FORBIDDEN");

  await prisma.message.delete({ where: { id: messageId } });

  // Optional: unread updated für alle Mitglieder neu publishen
  const members = await prisma.threadMember.findMany({ where: { threadId: msg.threadId } });
  for (const mem of members) {
    await pubsub.publish(EVENTS.UNREAD_UPDATED, {
      unreadUpdated: await unreadCount(prisma, mem.userId),
      userId: mem.userId,
    });
  }

  return { id: msg.id, threadId: msg.threadId };
}

// ----------------- Threads (Liste) -----------------
export async function listThreads(prisma: PrismaClient, userId: string) {
  const hidden = await getHiddenUserIds(prisma, userId);

  const threadsAll = await prisma.thread.findMany({
    where: { members: { some: { userId } } },
    orderBy: { updatedAt: "desc" },
    include: {
      members: { include: { user: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const memberThreads = await accessibleThreads(prisma, userId, threadsAll);
  const threads = hidden.size
    ? memberThreads.filter((t) => !t.members.some((m: any) => hidden.has(m.userId)))
    : memberThreads;


  const mems = await prisma.threadMember.findMany({
    where: { userId },
    select: { threadId: true, lastReadAt: true },
  });
  const lastReadMap = new Map(mems.map((m) => [m.threadId, m.lastReadAt]));

  return Promise.all(
    threads.map(async (t) => {
      const lastReadAt = lastReadMap.get(t.id) ?? new Date(0);

      // ✅ FIX: eigene Messages NICHT als unread zählen
      const unread = await prisma.message.count({
        where: {
          threadId: t.id,
          createdAt: { gt: lastReadAt },
          senderId: { not: userId },
        },
      });

      return {
        id: t.id,
        title: t.title,
        imageKey: (t as any).imageKey ?? null,
        ownerId: (t as any).ownerId ?? null,
        groupKey: t.groupKey,
        kind: (t as any).kind ?? (t.groupKey ? "GROUP" : "DM"),
        isGroupChat: ((t as any).kind ?? (t.groupKey ? "GROUP" : "DM")) !== "DM",
        members: t.members.map((m) => m.user),
        lastMessageAt: t.messages[0]?.createdAt ?? t.createdAt,
        unreadCount: unread,
      };
    })
  );
}

export async function messages(
  prisma: PrismaClient,
  userId: string,
  threadId: string,
  cursor?: string,
  take = 30
) {
  await assertThreadAccess(prisma, userId, threadId);

  const items = await prisma.message.findMany({
    where: { threadId },
    orderBy: { createdAt: "desc" },
    take,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
    include: { sender: true },
  });

  const edges = items.map((m) => ({ node: m, cursor: m.id }));
  const last = items.length > 0 ? items[items.length - 1] : undefined;

  return {
    edges: edges.reverse(),
    nextCursor: last ? last.id : undefined,
  };
}


// ----------------- Send Message -----------------
export async function sendMessage(
  prisma: PrismaClient,
  userId: string,
  input: {
    threadId: string;
    clientId?: string;
    kind: string;
    text?: string;
    media?: any;
    replyToId?: string;
    storyId?: string; // ✅ NEU
  }
) {
  const clientId = String(input.clientId ?? "").trim().slice(0, 120) || null;

  // Basic validation
  if (input.kind === "text" && !input.text?.trim()) throw new Error("Text required");
  if (input.kind !== "text") {
    if (!input.media?.key || !input.media?.mime) {
      throw new Error("media.key and media.mime required");
    }
  }

  const thread = await assertThreadAccess(prisma, userId, input.threadId);

  if (String(thread.kind) === "DISABLED") {
    throw new GraphQLError("CHAT_DISABLED");
  }

  if (String(thread.kind) === "BROADCAST") {
    const groupId = thread.groupKey?.startsWith("community:") ? thread.groupKey.slice("community:".length) : null;
    if (!groupId) throw new GraphQLError("BROADCAST_NOT_CONFIGURED");
    const group = await prisma.groupLink.findUnique({
      where: { id: groupId },
      select: { ownerId: true, isActive: true },
    });
    if (!group?.isActive || group.ownerId !== userId) throw new GraphQLError("BROADCAST_ONLY");
  }

  // ✅ Thread-Mitglieder holen (für Story Safety + Push)
  let members = await prisma.threadMember.findMany({
    where: { threadId: input.threadId },
    select: { userId: true },
  });
  if (thread.groupKey?.startsWith("community:")) {
    const group = await prisma.groupLink.findUnique({
      where: { id: thread.groupKey.slice("community:".length) },
      select: { ownerId: true, isActive: true, members: { select: { profileId: true } } },
    });
    if (!group?.isActive) throw new GraphQLError("NO_ACCESS_TO_THREAD");
    const currentMembers = new Set([group.ownerId, ...group.members.map(m => m.profileId)]);
    members = members.filter(m => currentMembers.has(m.userId));
  }
  const memberIds = new Set(members.map((m) => m.userId));

  // ✅ Sendername separat holen (damit TS nicht über msg.sender stolpert)
  const senderProfile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  const senderName = senderProfile?.username || "Jemand";

  // ✅ Story-Safety-Check (optional)
  let safeStoryId: string | null = null;
  if (input.storyId) {
    const story = await prisma.story.findUnique({
      where: { id: input.storyId },
      select: { id: true, authorId: true },
    });

    if (!story) throw new GraphQLError("STORY_NOT_FOUND");
    if (!memberIds.has(story.authorId)) throw new GraphQLError("STORY_NOT_IN_THREAD");

    safeStoryId = story.id;
  }

  const now = new Date();

  if (clientId) {
    const existing = await prisma.message.findFirst({
      where: { threadId: input.threadId, senderId: userId, clientId },
    });
    if (existing) return existing;
  }

  let msg;
  try {
    // ✅ Wichtig: kein msg.sender mehr nötig
    msg = await prisma.message.create({
      data: {
        threadId: input.threadId,
        senderId: userId,
        clientId,
        kind: input.kind,
        text: input.text ?? null,
        s3Key: input.media?.key ?? null,
        mime: input.media?.mime ?? null,
        width: input.media?.width ?? null,
        height: input.media?.height ?? null,
        durationMs: input.media?.durationMs ?? null,
        replyToId: input.replyToId ?? null,

        // ✅ NEU: Story-Kontext speichern
        storyId: safeStoryId,
      },
      // (du kannst include: { sender: true } drin lassen, aber wir brauchen es nicht)
    });
  } catch (e) {
    if (clientId && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.message.findFirst({
        where: { threadId: input.threadId, senderId: userId, clientId },
      });
      if (existing) return existing;
    }
    throw e;
  }

  // Thread.bump
  await prisma.thread.update({
    where: { id: input.threadId },
    data: { updatedAt: now },
  });

  // ✅ Sender hat seine eigene Nachricht "gelesen"
  await prisma.threadMember.update({
    where: { threadId_userId: { threadId: input.threadId, userId } },
    data: { lastReadAt: now },
  });

  // Publish
  await pubsub.publish(EVENTS.MESSAGE_ADDED, { messageAdded: msg, threadId: input.threadId });

  // ✅ UnreadUpdated für ALLE Mitglieder publishen (inkl Sender)
  for (const mem of members) {
    await pubsub.publish(EVENTS.UNREAD_UPDATED, {
      unreadUpdated: await unreadCount(prisma, mem.userId),
      userId: mem.userId,
    });
  }

  // ✅ Push nur an andere Mitglieder (nicht Sender)
  for (const mem of members) {
    if (mem.userId === userId) continue;

    const rec = await prisma.profile.findUnique({
      where: { id: mem.userId },
      select: { pushToken: true },
    });

    const token = rec?.pushToken;
    if (!token) continue;

    const title = `Nachricht von ${senderName}`;
    const body =
      msg.kind === "text"
        ? (msg.text?.slice(0, 140) || "Neue Nachricht")
        : msg.kind === "image"
        ? "📷 Bild"
        : msg.kind === "video"
        ? "🎥 Video"
        : "Neue Nachricht";

    await sendExpoPush({
      to: token,
      title,
      body,
      data: {
        kind: "CHAT_MESSAGE",
        threadId: msg.threadId,
        messageId: msg.id,
        storyId: safeStoryId ?? undefined,
        recipientId: mem.userId, // ✅ wichtig für Multiaccount-Switch beim Tap
      },
    }).catch(() => {});
  }

  return msg;
}



// ----------------- Mark Read -----------------
export async function markThreadRead(prisma: PrismaClient, userId: string, threadId: string) {
  await assertThreadAccess(prisma, userId, threadId);
  await prisma.threadMember.update({
    where: { threadId_userId: { threadId, userId } },
    data: { lastReadAt: new Date() },
  });

  await pubsub.publish(EVENTS.UNREAD_UPDATED, {
    unreadUpdated: await unreadCount(prisma, userId),
    userId,
  });

  return true;
}

// ----------------- Unread Count -----------------
export async function unreadCount(prisma: PrismaClient, userId: string) {
  const allMemberships = await prisma.threadMember.findMany({ where: { userId }, include: { thread: true } });
  const allowedThreads = await accessibleThreads(prisma, userId, allMemberships.map(m => m.thread));
  const allowedIds = new Set(allowedThreads.map(t => t.id));
  const memberships = allMemberships.filter(m => allowedIds.has(m.threadId));

  // Threads mit geblockten Teilnehmern ignorieren
  const hidden = await getHiddenUserIds(prisma, userId);
  const hiddenIds = [...hidden];

  let blockedThreadIds = new Set<string>();
  if (hiddenIds.length && memberships.length) {
    const hits = await prisma.threadMember.findMany({
      where: {
        threadId: { in: memberships.map((m) => m.threadId) },
        userId: { in: hiddenIds },
      },
      select: { threadId: true },
    });
    blockedThreadIds = new Set(hits.map((h) => h.threadId));
  }

  const perThread = await Promise.all(
    memberships
      .filter((m) => !blockedThreadIds.has(m.threadId))
      .map(async (m) => {
        const count = await prisma.message.count({
          where: {
            threadId: m.threadId,
            createdAt: { gt: m.lastReadAt },
            senderId: { not: userId },
          },
        });
        return { threadId: m.threadId, count };
      })
  );

  const total = perThread.reduce((a, b) => a + b.count, 0);
  return { total, perThread };
}


// ----------------- Create Thread (DM/Group mit De-Dupe) -----------------
export async function createThread(
  prisma: PrismaClient,
  requesterId: string,
  memberUserIds: string[],
  title?: string,
  imageKey?: string | null
) {
  const members = uniqSorted(memberUserIds);
  if (members.length < 2) throw new Error("need at least 2 members");
  if (!members.includes(requesterId)) throw new GraphQLError("FORBIDDEN");

  // Block-Safety: wenn irgendein Block innerhalb der Member-Liste existiert => Thread nicht erlauben
  const blocking = await prisma.userBlock.findFirst({
    where: {
      blockerId: { in: members },
      blockedId: { in: members },
    },
    select: { id: true },
  });
  if (blocking) throw new GraphQLError("BLOCKED");

  // DM-Fall (2 Mitglieder) → via dmKey de-dupen
  if (members.length === 2) {
    const dmKey = dmKeyFor(members[0], members[1]);

    const existing = await prisma.thread.findUnique({ where: { dmKey } });
    if (existing) return existing;

    return prisma.$transaction(async (tx) => {
      const thread = await tx.thread.create({ data: { title: title ?? null, dmKey, kind: "DM" } });
      await tx.threadMember.createMany({
        data: members.map((userId) => ({ threadId: thread.id, userId })),
      });
      return thread;
    });
  }

  const safeTitle = String(title ?? "").trim();
  if (!safeTitle) throw new GraphQLError("GROUP_TITLE_REQUIRED");

  // Gruppen-Threads werden nicht dedupliziert: gleiche Mitglieder dürfen mehrere Gruppen haben.
  const groupKey = newGroupThreadKey();

  return prisma.$transaction(async (tx) => {
    const thread = await tx.thread.create({
      data: {
        title: safeTitle,
        groupKey,
        kind: "GROUP",
        ownerId: requesterId,
        imageKey: imageKey ?? null,
      } as any,
    });
    await tx.threadMember.createMany({
      data: members.map((userId) => ({ threadId: thread.id, userId })),
    });
    return thread;
  });
}

export async function ensureCommunityThread(prisma: PrismaClient, groupId: string) {
  const group = await prisma.groupLink.findUnique({
    where: { id: groupId },
    select: { id: true, title: true, ownerId: true, isActive: true, systemKey: true },
  });
  if (!group || !group.isActive) throw new GraphQLError("GROUP_NOT_FOUND");
  if (group.systemKey === "BVRLY") return null;

  const rows = await prisma.groupLinkMember.findMany({
    where: { groupLinkId: group.id },
    select: { profileId: true },
  });
  const memberIds = uniqSorted([group.ownerId, ...rows.map((row) => row.profileId)]);
  const groupKey = communityGroupKey(group.id);

  return prisma.$transaction(async (tx) => {
    let thread = await tx.thread.findUnique({ where: { groupKey } });
    if (!thread) {
      // Concurrent joins must converge on the same community thread.
      await tx.thread.createMany({
        data: [{ title: group.title, groupKey, kind: "COMMUNITY" }],
        skipDuplicates: true,
      });
      thread = await tx.thread.findUniqueOrThrow({ where: { groupKey } });
    }

    if (thread.title !== group.title) {
      await tx.thread.update({
        where: { id: thread.id },
        data: { title: group.title },
      });
    }

    if (memberIds.length) {
      const existing = await tx.threadMember.findMany({
        where: { threadId: thread.id },
        select: { userId: true },
      });
      const existingIds = new Set(existing.map((member) => member.userId));
      const missing = memberIds.filter((userId) => !existingIds.has(userId));

      if (missing.length) {
        await tx.threadMember.createMany({
          data: missing.map((userId) => ({ threadId: thread.id, userId })),
          skipDuplicates: true,
        });
      }
    }

    return tx.thread.findUnique({ where: { id: thread.id } });
  });
}

export async function removeCommunityThreadMember(prisma: PrismaClient, groupId: string, profileId: string) {
  const thread = await prisma.thread.findUnique({
    where: { groupKey: communityGroupKey(groupId) },
    select: { id: true },
  });
  if (!thread) return;

  await prisma.threadMember.deleteMany({
    where: {
      threadId: thread.id,
      userId: profileId,
    },
  });
}
