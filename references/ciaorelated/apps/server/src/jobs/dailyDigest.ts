// apps/server/src/jobs/dailyDigest.ts
import type { PrismaClient } from "@prisma/client";
import { notify } from "../lib/notify";
import { visiblePostWhere } from "../lib/postVisibility";

type NotifSettings = {
  pushEnabled?: boolean;
  digestEnabled?: boolean;
};

function getNotifSettings(v: unknown): { pushEnabled: boolean; digestEnabled: boolean } {
  const s =
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as NotifSettings)
      : ({} as NotifSettings);

  const pushEnabled = s.pushEnabled ?? true;
  // server-authoritative: push aus ⇒ digest aus
  const digestEnabled = pushEnabled ? (s.digestEnabled ?? true) : false;

  return { pushEnabled, digestEnabled };
}

function viennaDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export async function runDailyDigest(prisma: PrismaClient) {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dateKey = viennaDateKey(now);

  // 1) Empfänger mit aktivem Digest (Defaults: true)
  const recipients = await prisma.profile.findMany({
    select: { id: true, notificationSettings: true },
  });

  const recipientIds = recipients
    .filter((r) => {
      const s = getNotifSettings(r.notificationSettings);
      return s.pushEnabled && s.digestEnabled;
    })
    .map((r) => r.id);

  if (recipientIds.length === 0) return;

  // 2) Dedup: max. 1 Digest pro Tag & Empfänger
  const already = await prisma.notification.findMany({
    where: {
      recipientId: { in: recipientIds },
      kind: "SYSTEM",
      AND: [
        { payload: { path: ["type"], equals: "DAILY_DIGEST" } as any },
        { payload: { path: ["dateKey"], equals: dateKey } as any },
      ],
    } as any,
    select: { recipientId: true },
  });

  const alreadySet = new Set(already.map((n) => n.recipientId));
  const finalRecipientIds = recipientIds.filter((id) => !alreadySet.has(id));
  if (finalRecipientIds.length === 0) return;

  // 3) Alle Follows dieser Empfänger
  const follows = await prisma.follow.findMany({
    where: { followerId: { in: finalRecipientIds } },
    select: { followerId: true, followingId: true },
  });

  const followingByRecipient = new Map<string, string[]>();
  for (const f of follows) {
    const arr = followingByRecipient.get(f.followerId) ?? [];
    arr.push(f.followingId);
    followingByRecipient.set(f.followerId, arr);
  }

  const recipientsWithFollowing = finalRecipientIds.filter(
    (id) => (followingByRecipient.get(id)?.length ?? 0) > 0
  );
  if (recipientsWithFollowing.length === 0) return;

  // 4) Alle gefolgten Author-IDs sammeln
  const allFollowedIds = Array.from(
    new Set(
      recipientsWithFollowing.flatMap((rid) => followingByRecipient.get(rid) ?? [])
    )
  );
  if (allFollowedIds.length === 0) return;

  // 5) Alle Posts der letzten 24h dieser Authors
  const posts = await prisma.post.findMany({
    where: {
      authorId: { in: allFollowedIds },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 5000, // Sicherheitslimit
    select: {
      id: true,
      authorId: true,
      author: { select: { username: true } },
      createdAt: true,
    },
  });

  if (posts.length === 0) return;

  type PostRow = (typeof posts)[number];

  const postsByAuthor = new Map<string, PostRow[]>();
  for (const p of posts) {
    const arr = postsByAuthor.get(p.authorId) ?? [];
    arr.push(p);
    postsByAuthor.set(p.authorId, arr);
  }

  // 6) Pro Empfänger Digest erzeugen
  for (const recipientId of recipientsWithFollowing) {
    const followingIds = followingByRecipient.get(recipientId) ?? [];
    if (!followingIds.length) continue;

    const myPosts: PostRow[] = [];
    for (const authorId of followingIds) {
      const arr = postsByAuthor.get(authorId);
      if (arr?.length) myPosts.push(...arr);
    }

    if (myPosts.length === 0) continue;

    const readable = await prisma.post.findMany({
      where: { AND: [{ id: { in: myPosts.map(p => p.id) } }, visiblePostWhere({ profileId: recipientId })] },
      select: { id: true },
    });
    const readableIds = new Set(readable.map(p => p.id));
    for (let i = myPosts.length - 1; i >= 0; i--) {
      if (!readableIds.has(myPosts[i].id)) myPosts.splice(i, 1);
    }
    if (!myPosts.length) continue;

    myPosts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const capped = myPosts.slice(0, 80);
    const postIds = capped.map((p) => p.id);
    if (!postIds.length) continue;

    const usernames = Array.from(
      new Set(capped.map((p) => p.author?.username).filter(Boolean))
    ) as string[];

    const preview = usernames.slice(0, 2);
    const suffix = usernames.length > 2 ? " und weitere" : "";

    const text =
      `In den letzten 24h gab es ${myPosts.length} neue Beiträge von Personen, denen du folgst. ` +
      `${preview.join(", ")}${suffix} haben Neues gepostet.`;

    await notify({
      prisma,
      recipientId,
      kind: "SYSTEM",
      channel: "ACTIVITY",
      postId: postIds[0],
      payload: {
        type: "DAILY_DIGEST",
        dateKey,
        text,
        postIds,
        usernamesPreview: preview,
        count: myPosts.length,
        since: since.toISOString(),
      },
    });
  }
}
