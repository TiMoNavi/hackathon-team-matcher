import type { Ctx } from "../context";
import crypto from "node:crypto";
import { getSignedGetUrl, getSignedPutUrl } from "../s3";
import { getBlockedSets } from "../lib/blocks";
import { ensureCommunityThread, removeCommunityThreadMember } from "../chat/service";
import { assertNoProfanity } from "../graphql/profanity-guard";
import { visiblePostWhere } from "../lib/postVisibility";
import { candidateInfluenceUnits, diversifyInfluencedFeed, influenceCandidateCount, influenceRankingPolicy, rankInfluencedPosts } from "../lib/communityInfluenceRanking";

import { GroupLinkType, GroupLinkVisibility } from "@prisma/client";
const GROUP_IMAGE_MAX_BYTES = Number(process.env.MAX_GROUP_IMAGE_BYTES ?? 5 * 1024 * 1024);

function makeCode() {
  return crypto.randomBytes(6).toString("base64url"); // kurz & URL-sicher
}

function makeSlug() {
  return crypto.randomBytes(8).toString("base64url").slice(0, 10);
}

function groupContextKey(groupId: string) {
  return `group:${groupId}`;
}

async function assertCanViewGroup(ctx: Ctx, groupId: string, membersOnly = false) {
  if (!ctx.profileId) throw new Error("Not authenticated");

  const group = await ctx.prisma.groupLink.findUnique({ where: { id: groupId } });
  if (!group || !group.isActive) throw new Error("Group not found");
  if (!membersOnly && group.visibility === "PUBLIC") return group;
  if (group.ownerId === ctx.profileId) return group;

  const membership = await ctx.prisma.groupLinkMember.findUnique({
    where: {
      groupLinkId_profileId: {
        groupLinkId: groupId,
        profileId: ctx.profileId,
      },
    },
  });

  if (!membership) throw new Error("Forbidden");
  return group;
}

async function assertOwnsGroup(ctx: Ctx, groupId: string) {
  if (!ctx.profileId) throw new Error("Not authenticated");
  const group = await ctx.prisma.groupLink.findUnique({ where: { id: groupId } });
  if (!group || !group.isActive) throw new Error("Group not found");
  if (group.ownerId !== ctx.profileId) throw new Error("Forbidden");
  return group;
}

export default {
  Query: {
    myGroupLinks: async (_: any, __: any, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      return ctx.prisma.groupLink.findMany({
        where: { ownerId: ctx.profileId },
        orderBy: { createdAt: "desc" },
      });
    },
    myJoinedGroupLinks: async (_: any, __: any, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const profileId = ctx.profileId;

      const rows = await ctx.prisma.groupLinkMember.findMany({
        where: { profileId },
        orderBy: { joinedAt: "desc" },
        include: { groupLink: true }, // ✅
      });


      return rows.map(r => r.groupLink);
    },

    groupLink: async (_: any, { id }: { id: string }, ctx: Ctx) => {
      return assertCanViewGroup(ctx, id);
    },

    groupLinkPosts: async (_: any, { groupId, offset = 0, limit = 20 }: { groupId: string; offset?: number; limit?: number }, ctx: Ctx) => {
      await assertCanViewGroup(ctx, groupId);

      const context = await ctx.prisma.context.findUnique({
        where: { key: groupContextKey(groupId) },
        select: { id: true },
      });
      if (!context) return [];

      const rows = await ctx.prisma.postContext.findMany({
        where: { contextId: context.id, post: visiblePostWhere(ctx) },
        orderBy: { post: { createdAt: "desc" } },
        skip: Math.max(0, offset),
        take: Math.min(50, Math.max(1, limit)),
        include: {
          post: {
            include: { author: true },
          },
        },
      });

      return rows
        .map((row) => row.post)
        .filter((post) => post && (!post.author?.bannedUntil || post.author.bannedUntil < new Date()));
    },

    groupLinkMembers: async (_: any, { groupId, limit = 24 }: { groupId: string; limit?: number }, ctx: Ctx) => {
      const group = await assertCanViewGroup(ctx, groupId);

      const rows = await ctx.prisma.groupLinkMember.findMany({
        where: { groupLinkId: groupId },
        orderBy: { joinedAt: "desc" },
        take: Math.min(60, Math.max(1, limit)),
        include: { profile: true },
      });

      const members = rows.map((row) => row.profile).filter(Boolean);
      const hasOwner = members.some((member) => member.id === group.ownerId);
      if (hasOwner) return members;

      const owner = await ctx.prisma.profile.findUnique({ where: { id: group.ownerId } });
      return owner ? [owner, ...members] : members;
    },

    communityThread: async (_: any, { groupId }: { groupId: string }, ctx: Ctx) => {
      await assertCanViewGroup(ctx, groupId, true);
      return ensureCommunityThread(ctx.prisma as any, groupId);
    },

    communityMomentsFeed: async (_: any, { offset = 0, limit = 20 }: { offset?: number; limit?: number }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const me = ctx.profileId;
      const safeOffset = Math.max(0, Number(offset) || 0);
      const safeLimit = Math.min(60, Math.max(1, Number(limit) || 20));
      const rankingNow = new Date();
      const ranking = influenceRankingPolicy(rankingNow);
      const need = ranking ? influenceCandidateCount(safeOffset + safeLimit) : safeOffset + safeLimit;
      const take = ranking ? need : Math.max(need + 30, safeLimit * 4);
      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hiddenAuthorIds = [...new Set([...blockedByMe, ...blockedMe])];

      const [memberships, ownedGroups] = await Promise.all([
        ctx.prisma.groupLinkMember.findMany({
          where: { profileId: me, groupLink: { isActive: true } },
          select: { groupLinkId: true },
        }),
        ctx.prisma.groupLink.findMany({
          where: { ownerId: me, isActive: true },
          select: { id: true },
        }),
      ]);

      const groupIds = Array.from(new Set([
        ...memberships.map((m) => m.groupLinkId),
        ...ownedGroups.map((g) => g.id),
      ]));
      if (!groupIds.length) return [];

      const groupKeys = groupIds.map(groupContextKey);

      const reasonGroups = await ctx.prisma.groupLink.findMany({
        where: { id: { in: groupIds } },
        select: { id: true, title: true, type: true, slug: true, systemKey: true },
      });
      const reasonGroupById = new Map(reasonGroups.map((group) => [group.id, group]));
      // Network membership alone is not a personal-content recommendation reason.
      const memberMixGroupIds = reasonGroups.filter(group => group.systemKey === null).map(group => group.id);

      const [memberRows, groupOwners] = await Promise.all([
        ctx.prisma.groupLinkMember.findMany({
          where: {
            groupLinkId: { in: memberMixGroupIds },
            profileId: { not: me },
          },
          select: { profileId: true, groupLinkId: true },
        }),
        ctx.prisma.groupLink.findMany({
          where: { id: { in: memberMixGroupIds }, ownerId: { not: me } },
          select: { id: true, ownerId: true },
        }),
      ]);

      const sharedGroupsByProfile = new Map<string, any[]>();
      const addSharedGroupForProfile = (profileId: string, groupId: string) => {
        const group = reasonGroupById.get(groupId);
        if (!group) return;
        const next = sharedGroupsByProfile.get(profileId) ?? [];
        if (next.some((item) => item.groupId === group.id)) return;
        next.push({
          groupId: group.id,
          title: group.title,
          type: group.type,
          slug: group.slug,
        });
        sharedGroupsByProfile.set(profileId, next);
      };

      for (const row of memberRows) {
        addSharedGroupForProfile(row.profileId, row.groupLinkId);
      }
      for (const owner of groupOwners) {
        addSharedGroupForProfile(owner.ownerId, owner.id);
      }

      const reasonForProfile = (profileId: string) => {
        const sharedGroups = sharedGroupsByProfile.get(profileId) ?? [];
        const first = sharedGroups[0];
        if (!first) return null;
        return {
          ...first,
          reason: sharedGroups.length > 1 ? "SHARED_COMMUNITIES" : "SHARED_MEMBER",
          sharedCount: sharedGroups.length,
        };
      };

      const sharedAuthorIds = Array.from(new Set([
        ...memberRows.map((m) => m.profileId),
        ...groupOwners.map((g) => g.ownerId),
      ]));

      const explicitRows = ranking ? (await ctx.prisma.post.findMany({
        where: { kind: "POST", authorId: { notIn: hiddenAuthorIds }, AND: [visiblePostWhere(ctx)],
          postContexts: { some: { source: "IMPORT", context: { key: { in: groupKeys } } } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take,
        include: { author: true, media: true },
      })).map(post => ({ post })) : await ctx.prisma.postContext.findMany({
        where: {
          source: "IMPORT",
          context: { key: { in: groupKeys } },
          post: {
            kind: "POST",
            authorId: { notIn: hiddenAuthorIds },
            AND: [visiblePostWhere(ctx)],
          },
        },
        orderBy: { post: { createdAt: "desc" } },
        take,
        include: {
          post: {
            include: { author: true, media: true },
          },
        },
      });

      let explicitPosts = explicitRows
        .map((row) => row.post)
        .filter(Boolean);
      const explicitIds = new Set(explicitPosts.map((p) => p.id));

      let memberPosts = sharedAuthorIds.length
        ? await ctx.prisma.post.findMany({
            where: {
              kind: "POST",
              id: { notIn: [...explicitIds] },
              ...(ranking ? { NOT: { postContexts: { some: {
                source: "IMPORT" as const, context: { key: { in: groupKeys } },
              } } } } : {}),
              authorId: {
                in: sharedAuthorIds,
                notIn: [me, ...hiddenAuthorIds],
              },
              AND: [visiblePostWhere(ctx)],
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take,
            include: { author: true, media: true },
          })
        : [];

      const influence = await candidateInfluenceUnits(ctx.prisma, [...explicitPosts, ...memberPosts], ranking, rankingNow);
      if (ranking) {
        explicitPosts = rankInfluencedPosts(explicitPosts, influence, ranking, rankingNow);
        memberPosts = rankInfluencedPosts(memberPosts, influence, ranking, rankingNow);
      }

      const combined: any[] = [];
      const seen = new Set<string>();
      let e = 0;
      let m = 0;

      while (combined.length < (ranking ? need : need + 20) && (e < explicitPosts.length || m < memberPosts.length)) {
        for (let i = 0; i < 2 && e < explicitPosts.length; i++) {
          const post = explicitPosts[e++];
          if (post?.id && !seen.has(post.id)) {
            seen.add(post.id);
            combined.push(post);
          }
        }

        if (m < memberPosts.length) {
          const post = memberPosts[m++];
          if (post?.id && !seen.has(post.id)) {
            seen.add(post.id);
            combined.push({
              ...post,
              communityContext: reasonForProfile(post.authorId),
            });
          }
        }

        if (e >= explicitPosts.length && m < memberPosts.length) {
          const post = memberPosts[m++];
          if (post?.id && !seen.has(post.id)) {
            seen.add(post.id);
            combined.push({
              ...post,
              communityContext: reasonForProfile(post.authorId),
            });
          }
        }
      }

      const ranked = ranking ? diversifyInfluencedFeed(combined.slice(0, need), post => post.authorId) : combined;
      return ranked.slice(safeOffset, safeOffset + safeLimit);
    },

  },

  GroupLink: {
    isNetworkCommunity: (group: any) => group.systemKey === "BVRLY",

    imageUrl: async (group: any) => {
      const key = typeof group?.imageKey === "string" ? group.imageKey : "";
      if (!key) return null;
      if (/^https?:\/\//i.test(key)) return key;
      return getSignedGetUrl(key);
    },

    imageThumbUrl: async (group: any) => {
      const key = typeof group?.imageKey === "string" ? group.imageKey : "";
      if (!key) return null;
      if (/^https?:\/\//i.test(key)) return key;
      return getSignedGetUrl(key);
    },

    owner: (group: any, _args: any, ctx: Ctx) =>
      ctx.prisma.profile.findUnique({ where: { id: group.ownerId } }),

    memberCount: (group: any, _args: any, ctx: Ctx) =>
      group._count?.members ?? ctx.prisma.groupLinkMember.count({ where: { groupLinkId: group.id } }),

    viewerIsOwner: (group: any, _args: any, ctx: Ctx) =>
      !!ctx.profileId && group.ownerId === ctx.profileId,

    viewerIsMember: async (group: any, _args: any, ctx: Ctx) => {
      if (!ctx.profileId) return false;
      if (group.ownerId === ctx.profileId) return true;
      if (typeof group.viewerIsMember === "boolean") return group.viewerIsMember;
      const membership = await ctx.prisma.groupLinkMember.findUnique({
        where: {
          groupLinkId_profileId: {
            groupLinkId: group.id,
            profileId: ctx.profileId,
          },
        },
      });
      return !!membership;
    },
  },

  Mutation: {
    getSignedGroupLinkImageUpload: async (_: any, { groupId, mime, size }: { groupId: string; mime: string; size: number }, ctx: Ctx) => {
      await assertOwnsGroup(ctx, groupId);
      if (!mime?.startsWith("image/")) throw new Error("Only images allowed");
      if (size > GROUP_IMAGE_MAX_BYTES) throw new Error("File too large");

      const ext =
        mime === "image/png" ? "png" :
        mime === "image/webp" ? "webp" : "jpg";

      const key = `group-links/${groupId}/image-${crypto.randomUUID()}.${ext}`;
      const putUrl = await getSignedPutUrl(key, mime);
      return { key, putUrl };
    },

    updateGroupLink: async (_: any, { id, input }: { id: string; input: { title?: string | null; imageKey?: string | null } }, ctx: Ctx) => {
      await assertOwnsGroup(ctx, id);
      if (Object.prototype.hasOwnProperty.call(input, "visibility")) throw new Error("COMMUNITY_VISIBILITY_IMMUTABLE");

      const data: any = {};
      if (Object.prototype.hasOwnProperty.call(input, "title")) {
        const title = String(input.title ?? "").trim();
        if (!title) throw new Error("Title required");
        if (title.length > 80) throw new Error("Title too long");
        assertNoProfanity({ title }, ["title"]);
        data.title = title;
      }
      if (Object.prototype.hasOwnProperty.call(input, "imageKey")) {
        const imageKey = String(input.imageKey ?? "").trim();
        data.imageKey = imageKey || null;
      }

      const updated = await ctx.prisma.groupLink.update({
        where: { id },
        data,
      });

      await ensureCommunityThread(ctx.prisma as any, id);
      return updated;
    },

    removeGroupLinkMember: async (_: any, { groupId, profileId }: { groupId: string; profileId: string }, ctx: Ctx) => {
      const group = await assertOwnsGroup(ctx, groupId);
      if (profileId === group.ownerId) throw new Error("Owner cannot be removed");

      await ctx.prisma.$transaction(async (tx) => {
        await tx.connection.deleteMany({
          where: {
            groupLinkId: groupId,
            OR: [{ fromId: profileId }, { toId: profileId }],
          },
        });

        await tx.groupLinkMember.deleteMany({
          where: { groupLinkId: groupId, profileId },
        });
      });

      await removeCommunityThreadMember(ctx.prisma as any, groupId, profileId);
      return true;
    },

    createGroupLink: async (_: any, { title, type, visibility = "PRIVATE" }: { title: string; type: GroupLinkType; visibility?: GroupLinkVisibility | null }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      title = String(title).trim();
      if (!title || title.length > 80) throw new Error("Invalid title");
      assertNoProfanity({ title }, ["title"]);
      const slug = makeSlug();

      return ctx.prisma.groupLink.create({
        data: {
          ownerId: ctx.profileId,
          title,
          type,
          visibility: visibility ?? "PRIVATE",
          code: makeCode(),
          slug,
        },
      });
    },

    leaveGroup: async (_: any, { groupId }: { groupId: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      await ctx.prisma.$transaction(async (tx) => {


        const profileId = ctx.profileId;
        if (!profileId) throw new Error("Not authenticated");

        const group = await tx.groupLink.findUnique({
          where: { id: groupId },
          select: { ownerId: true },
        });
        if (!group) throw new Error("Group not found");
        if (group.ownerId === profileId) {
          throw new Error("Owner cannot leave the community before transferring ownership");
        }

        // 1) Connections entfernen, die über diesen GroupLink laufen
        await tx.connection.deleteMany({
          where: {
            groupLinkId: groupId,
            OR: [
              { fromId: profileId },
              { toId: profileId },
            ],
          },
        });

        
        // 2) Membership entfernen
        await tx.groupLinkMember.delete({
          where: {
            groupLinkId_profileId: {
              groupLinkId: groupId,
              profileId,
            },
          },
        });
      });

      await removeCommunityThreadMember(ctx.prisma as any, groupId, ctx.profileId);

      return true;
    },




    joinGroupLink: async (_: any, { slug }: { slug: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const me = ctx.profileId;

      // 🔹 Gruppe inkl. Titel laden
      const link = await ctx.prisma.groupLink.findUnique({
        where: { slug },
        select: {
          id: true,
          title: true,
          isActive: true,
          systemKey: true,
        },
      });

      if (!link || !link.isActive) throw new Error("Invalid link");

      // 1) Mitgliedschaft anlegen
      await ctx.prisma.groupLinkMember.createMany({
        data: [{
          groupLinkId: link.id,
          profileId: me,
        }],
        skipDuplicates: true,
      });

      if (link.systemKey === "BVRLY") return { id: link.id, title: link.title, chatThread: null };

      // 2) Andere Mitglieder laden
      const others = await ctx.prisma.groupLinkMember.findMany({
        where: {
          groupLinkId: link.id,
          profileId: { not: me },
        },
        select: { profileId: true },
      });

      const otherIds = others.map(o => o.profileId);

      // 3) Connections anlegen
      if (otherIds.length) {
        await ctx.prisma.connection.createMany({
          data: otherIds.map(otherId => ({
            fromId: me,
            toId: otherId,
            groupLinkId: link.id,
          })),
          skipDuplicates: true,
        });

        await ctx.prisma.connection.createMany({
          data: otherIds.map(otherId => ({
            fromId: otherId,
            toId: me,
            groupLinkId: link.id,
          })),
          skipDuplicates: true,
        });
      }

      const chatThread = await ensureCommunityThread(ctx.prisma as any, link.id);

      // ✅ WICHTIG: Gruppe zurückgeben (für JoinGroupScreen)
      return {
        id: link.id,
        title: link.title,
        chatThread,
      };
    },

  },
};
