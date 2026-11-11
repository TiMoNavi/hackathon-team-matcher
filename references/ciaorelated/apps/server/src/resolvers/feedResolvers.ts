import { visiblePostWhere } from "../lib/postVisibility";

import type { Ctx } from "../context";
import { getBlockedSets, notBlockedFilter, authorNotBlockedWhere } from "../lib/blocks";
import { candidateInfluenceUnits, diversifyInfluencedFeed, influenceCandidateCount, influenceRankingPolicy, newestFirst, rankInfluencedPosts } from "../lib/communityInfluenceRanking";




/** Exponentieller Zeitverfall: z.B. Halbwertszeit ~ 12h */
function recencyBoost(createdAt: Date, halfLifeHours = 12) {
  const ageH = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  const lambda = Math.log(2) / halfLifeHours;
  return Math.exp(-lambda * ageH); // 1.0 (frisch) -> 0 (alt)
}

/** sanftes Saturation-Log für Counts */
function softCount(x: number, k = 10) {
  return Math.log(1 + x / Math.max(1, k));
}
const POST_SELECT = {
  id: true, kind: true,
  imageKey: true, videoKey: true, thumbKey: true,
  caption: true, location: true,
  likeCount: true, commentCount: true,
  createdAt: true, updatedAt: true,

  // IMPORTANT: `User.isPrivate` is non-nullable in GraphQL schema.
  // If we don't select `isPrivate` here, GraphQL can crash with
  // "Cannot return null for non-nullable field User.isPrivate".
  author: { select: { id: true, username: true, avatarUrl: true, isPrivate: true } },
} as const;



/** Scoring: Justierbar */
function baseScore(p: { likeCount: number; commentCount: number; createdAt: Date }) {
  const popularity = 0.7 * softCount(p.likeCount, 8) + 1.0 * softCount(p.commentCount, 4);
  const freshness  = 1.2 * recencyBoost(p.createdAt, 12);
  return popularity + freshness;
}
export default {
  Query: {

    // ReelsScreen baseline discovery feed (no dynamic context required)
    // - includes reels from me + following
    // - mixes in public suggested reels (context-weighted if available)
    // - respects blocks + bans + privacy
    
    reelsFeed: async (
      _: any,
      { offset = 0, limit = 20 }: { offset?: number; limit?: number },
      ctx: Ctx
    ) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const me = ctx.profileId;
      const now = new Date();
      const safeOffset = Math.max(0, Number(offset) || 0);
      const safeLimit = Math.min(60, Math.max(1, Number(limit) || 20));

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hiddenAuthorIds = [...new Set([...blockedByMe, ...blockedMe])];

      const followingIds = (
        await ctx.prisma.follow.findMany({
          where: { followerId: me },
          select: { followingId: true },
        })
      ).map((f) => f.followingId);

      // -----------------------------
      // Pagination strategy:
      // We fetch a bit more than needed so interleaving won't run dry.
      // -----------------------------
      const OVERSCAN = Math.max(40, safeLimit * 4); // tune
      const want = safeOffset + safeLimit + OVERSCAN;

      // -----------------------------
      // A) Network reels (me + following)
      // -----------------------------
      const networkReels = await ctx.prisma.post.findMany({
        where: { AND: [visiblePostWhere(ctx), {
          kind: "POST",
          authorId: { in: [me, ...followingIds], notIn: hiddenAuthorIds },
          author: { OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }] },
        }] },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: want, // instead of fixed 200
        select: POST_SELECT,
      });

      const networkIdSet = new Set(networkReels.map((p) => p.id));

      // -----------------------------
      // B) Explore reels (public, not followed)
      // -----------------------------
      const exploreRaw = await ctx.prisma.post.findMany({
        where: { AND: [visiblePostWhere(ctx), {
          kind: "POST",
          id: { notIn: [...networkIdSet] },
          authorId: { notIn: [me, ...followingIds, ...hiddenAuthorIds] },
          author: {
            AND: [
              { OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }] },
            ],
          },
        }] },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: want, // instead of fixed 300
        select: POST_SELECT,
      });

      // context score (if any) to bias explore without trapping
      const exploreScores = exploreRaw.length
        ? await ctx.prisma.$queryRaw<Array<{ postId: string; score: number }>>`
            SELECT
              pc."postId" AS "postId",
              COALESCE(SUM(pc.weight * prc.weight), 0)::float AS "score"
            FROM "PostContext" pc
            JOIN "ProfileContext" prc
              ON prc."contextId" = pc."contextId"
            WHERE prc."profileId" = ${me}
              AND pc."postId" = ANY(${exploreRaw.map((p) => p.id)}::text[])
            GROUP BY pc."postId"
          `
        : [];

      const exploreScoreMap = new Map<string, number>();
      for (const r of exploreScores) exploreScoreMap.set(r.postId, Number(r.score) || 0);

      const explore = [...exploreRaw].sort((a: any, b: any) => {
        const sa = (exploreScoreMap.get(a.id) ?? 0) + 0.35 * baseScore(a as any);
        const sb = (exploreScoreMap.get(b.id) ?? 0) + 0.35 * baseScore(b as any);
        return (sb - sa) || (b.createdAt.getTime() - a.createdAt.getTime());
      });

      // -----------------------------
      // Interleave: 2 network, 1 explore
      // Build enough items for (offset + limit)
      // -----------------------------
      const out: any[] = [];
      let iN = 0;
      let iE = 0;

      while (out.length < safeOffset + safeLimit && (iN < networkReels.length || iE < explore.length)) {
        // 2 network
        for (let k = 0; k < 2 && out.length < safeOffset + safeLimit; k++) {
          const p = networkReels[iN++];
          if (p) out.push(p);
        }
        // 1 explore
        if (out.length < safeOffset + safeLimit) {
          const p = explore[iE++];
          if (p) out.push(p);
        }

        // drain remaining if one side ends
        if (iN >= networkReels.length && iE < explore.length) {
          while (out.length < safeOffset + safeLimit && iE < explore.length) out.push(explore[iE++]);
        }
        if (iE >= explore.length && iN < networkReels.length) {
          while (out.length < safeOffset + safeLimit && iN < networkReels.length) out.push(networkReels[iN++]);
        }
      }

      // de-dupe deterministic
      const unique = Array.from(new Map(out.map((p: any) => [p.id, p])).values());

      // return page
      return unique.slice(safeOffset, safeOffset + safeLimit);
    },


    feed: async (_: any, { offset = 0, limit = 20 }: { offset?: number; limit?: number }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

     
      // 2) Grobe Vorauswahl (neueste) – HIER Block-Filter anwenden (authorId NOT IN …)
      const POOL = 200;
      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hiddenAuthorIds = [...new Set([...blockedByMe, ...blockedMe])];

      const f = await ctx.prisma.follow.findMany({
        where: { followerId: ctx.profileId },
        select: { followingId: true },
      });
      const authorIds = new Set<string>([ctx.profileId, ...f.map(x => x.followingId)]);
      if (authorIds.size === 0) return [];

      const now = new Date();
      const raw = await ctx.prisma.post.findMany({
        where: { AND: [visiblePostWhere(ctx), {
          kind: "POST",
          // nur ich + Gefolgte …
          authorId: {
            in: [...authorIds],
            // … und gleichzeitig geblockte ausschließen (beide Richtungen)
            notIn: hiddenAuthorIds,
          },
          // zusätzlich: Autoren, die (temporär) gebannt sind, ausschließen
          author: { OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }] },
        }] },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], // deterministisch
        take: POOL,
        include: {
          author: { select: { id: true, username: true, avatarUrl: true, isPrivate: true } },
          _count: { select: { likes: true } },
        },
      });

      // 3) Likes dieses Profils in den letzten 24h
      const liked = await ctx.prisma.like.findMany({
        where: {
          userId: ctx.profileId, // wichtig: userId in Like-Tabelle
          postId: { in: raw.map((p: any) => p.id) },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        select: { postId: true },
      });
      const likedSet = new Set(liked.map((l: any) => l.postId));

      // 4) Scoring
      const SCORES = raw.map((p: any) => {
        let s = baseScore(p);
        if (p.authorId === ctx.profileId) {
          const freshBoost = recencyBoost(p.createdAt, 6);
          const ageH = (Date.now() - p.createdAt.getTime()) / (1000 * 60 * 60);
          if (ageH < 24) s += 0.4 * freshBoost;
        }
        if (likedSet.has(p.id)) s += 0.8;
        const tie = (p.id.charCodeAt(0) % 10) / 1000;
        return { post: p, score: s + tie };
      });

      // 5) Sortieren + Seite schneiden
      SCORES.sort(
        (a: any, b: any) => (b.score - a.score) || (b.post.createdAt.getTime() - a.post.createdAt.getTime())
      );
      return SCORES.slice(offset, offset + limit).map((x: any) => x.post);
    },

    homeFeed: async (
      _: any,
      { offset = 0, limit = 20, mode = "SONGVERWANDT" }: { offset?: number; limit?: number; mode?: "SONGVERWANDT" | "FOLLOWING" },
      ctx: Ctx
    ) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const me = ctx.profileId;
      const safeOffset = Math.max(0, Number(offset) || 0);
      const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
      const rankingNow = new Date();
      const ranking = mode === "FOLLOWING" ? null : influenceRankingPolicy(rankingNow);
      const need = ranking ? influenceCandidateCount(safeOffset + safeLimit) : safeOffset + safeLimit;
      const overscan = Math.max(80, safeLimit * 4);
      const poolPosts = ranking ? need : need + overscan;
      const poolSuggestedPosts = ranking ? need : need + overscan;
      const suggestedProfileBlocksNeeded = Math.ceil(need / 8) + 2;
      const poolSuggestedUsers = ranking ? 240 : Math.min(240, suggestedProfileBlocksNeeded * 10);

      // --------------------------------------------------
      // 0) Block- & Basisdaten
      // --------------------------------------------------
      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hiddenAuthorIds = [...new Set([...blockedByMe, ...blockedMe])];
      const now = new Date();

      const following = await ctx.prisma.follow.findMany({
        where: { followerId: me },
        select: { followingId: true },
      });
      const followingIds = following.map((f) => f.followingId);

      if (mode === "FOLLOWING") {
        if (!followingIds.length) return [];

        const followingPosts = await ctx.prisma.post.findMany({
          where: { AND: [visiblePostWhere(ctx), {
            kind: "POST",
            authorId: { in: followingIds, notIn: hiddenAuthorIds },
            author: { OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }] },
          }] },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: safeOffset,
          take: safeLimit,
          select: POST_SELECT,
        });

        return followingPosts.map((post) => ({
          id: post.id,
          kind: "POST",
          post,
          title: null,
          users: null,
          source: null,
        }));
      }

      // --------------------------------------------------
      // 0.1) Connections (Group Networks)
      // --------------------------------------------------
      const connections = await ctx.prisma.connection.findMany({
        where: { fromId: me, OR: [{ groupLinkId: null }, { groupLink: { systemKey: null } }] },
        select: {
          toId: true,
          groupLink: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      const connectionGroups = connections
        .map((c: any) => c.groupLink)
        .filter(Boolean) as Array<{ id: string; title: string }>;
      const connectionAuthorIds = [
        ...new Set(connections.map((c: any) => c.toId)),
      ];
      const connectionGroupIds = [
        ...new Set(connectionGroups.map((group) => group.id)),
      ];
      const groupContextKeys = connectionGroupIds.map((id) => `group:${id}`);

      // groupId -> GroupLink-Quelle (für Feed-Badge)
      const connectionSourceByGroup = new Map<
        string,
        { id: string; title: string }
      >();

      for (const group of connectionGroups) {
        if (!connectionSourceByGroup.has(group.id)) {
          connectionSourceByGroup.set(group.id, {
            id: group.id,
            title: group.title,
          });
        }
      }

      const feedAuthorIds = new Set<string>([
        me,
        ...followingIds,
      ]);

      // --------------------------------------------------
      // 1) Hilfsfunktionen: Context- & Netzwerk-Scoring
      // --------------------------------------------------

      // score(post) = Σ(PostContext.weight × ProfileContext.weight)
      const getContextScoresForPosts = async (postIds: string[]) => {
        const m = new Map<string, number>();
        if (!postIds.length) return m;

        const rows = await ctx.prisma.$queryRaw<
          Array<{ postId: string; score: number }>
        >`
          SELECT
            pc."postId" AS "postId",
            COALESCE(SUM(pc.weight * prc.weight), 0)::float AS "score"
          FROM "PostContext" pc
          JOIN "ProfileContext" prc
            ON prc."contextId" = pc."contextId"
          WHERE prc."profileId" = ${me}
            AND pc."postId" = ANY(${postIds}::text[])
          GROUP BY pc."postId"
        `;

        for (const r of rows) m.set(r.postId, Number(r.score) || 0);
        return m;
      };

      // score(profile) = Σ(shared ProfileContext weights)
      const getContextScoresForProfiles = async (profileIds: string[]) => {
        const m = new Map<string, number>();
        if (!profileIds.length) return m;

        const rows = await ctx.prisma.$queryRaw<
          Array<{ profileId: string; score: number }>
        >`
          SELECT
            other."profileId" AS "profileId",
            COALESCE(SUM(meC.weight * other.weight), 0)::float AS "score"
          FROM "ProfileContext" meC
          JOIN "ProfileContext" other
            ON other."contextId" = meC."contextId"
          WHERE meC."profileId" = ${me}
            AND other."profileId" = ANY(${profileIds}::text[])
          GROUP BY other."profileId"
        `;

        for (const r of rows) m.set(r.profileId, Number(r.score) || 0);
        return m;
      };

      // Gemeinsame Follows (wir folgen denselben)
      const getSharedFollowingCounts = async (candidateIds: string[]) => {
        const m = new Map<string, number>();
        if (!candidateIds.length || !followingIds.length) return m;

        const rows = await ctx.prisma.$queryRaw<
          Array<{ candidateId: string; cnt: number }>
        >`
          SELECT
            f2."followerId" AS "candidateId",
            COUNT(*)::int AS "cnt"
          FROM "Follow" f1
          JOIN "Follow" f2
            ON f2."followingId" = f1."followingId"
          WHERE f1."followerId" = ${me}
            AND f2."followerId" = ANY(${candidateIds}::text[])
          GROUP BY f2."followerId"
        `;

        for (const r of rows) m.set(r.candidateId, Number(r.cnt) || 0);
        return m;
      };

      // Wie viele meiner Following folgen diesem Profil
      const getFollowedByMyFollowingCounts = async (candidateIds: string[]) => {
        const m = new Map<string, number>();
        if (!candidateIds.length || !followingIds.length) return m;

        const rows = await ctx.prisma.$queryRaw<
          Array<{ candidateId: string; cnt: number }>
        >`
          SELECT
            f."followingId" AS "candidateId",
            COUNT(*)::int AS "cnt"
          FROM "Follow" f
          WHERE f."followerId" = ANY(${followingIds}::text[])
            AND f."followingId" = ANY(${candidateIds}::text[])
          GROUP BY f."followingId"
        `;

        for (const r of rows) m.set(r.candidateId, Number(r.cnt) || 0);
        return m;
      };

      const log1p = (x: number) => Math.log(1 + Math.max(0, x));

      // --------------------------------------------------
      // 2) A) Base Posts (ich + following)
      // --------------------------------------------------
      let basePosts = await ctx.prisma.post.findMany({
        where: { AND: [visiblePostWhere(ctx), {
          kind: "POST",
          authorId: { in: [...feedAuthorIds], notIn: hiddenAuthorIds },
          author: { OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }] },
        }] },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: poolPosts,
        select: POST_SELECT,
      });
      const basePostIdSet = new Set(basePosts.map((p) => p.id));

      // --------------------------------------------------
      // 2.1) Community Posts (nur explizit verknüpfte Posts)
      // --------------------------------------------------
      const communityRows = !groupContextKeys.length ? [] : ranking
        ? (await ctx.prisma.post.findMany({
            where: { AND: [visiblePostWhere(ctx)], kind: "POST",
              authorId: { notIn: [...followingIds, me, ...hiddenAuthorIds] },
              postContexts: { some: { source: "IMPORT", context: { key: { in: groupContextKeys } } } },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: poolSuggestedPosts,
            select: { ...POST_SELECT, postContexts: {
              where: { source: "IMPORT", context: { key: { in: groupContextKeys } } },
              orderBy: { contextId: "asc" }, take: 1, select: { context: { select: { key: true } } },
            } },
          })).map(post => ({ post, context: post.postContexts[0]?.context }))
        : await ctx.prisma.postContext.findMany({
            where: {
              source: "IMPORT",
              context: { key: { in: groupContextKeys } },
              post: {
                AND: [visiblePostWhere(ctx)],
                kind: "POST",
                authorId: { notIn: [...followingIds, me, ...hiddenAuthorIds] },
                author: {
                  AND: [
                    {
                      OR: [
                        { bannedUntil: null },
                        { bannedUntil: { lt: now } },
                      ],
                    },
                  ],
                },
              },
            },
            orderBy: { post: { createdAt: "desc" } },
            take: poolSuggestedPosts,
            include: {
              context: { select: { key: true } },
              post: { select: POST_SELECT },
            },
          });

      const communitySourceByPost = new Map<
        string,
        { id: string; title: string }
      >();
      const communityPosts: typeof basePosts = [];
      const seenCommunityPosts = new Set<string>();

      for (const row of communityRows) {
        const contextKey = row.context?.key ?? "";
        const groupId = contextKey.startsWith("group:")
          ? contextKey.slice("group:".length)
          : null;
        if (!groupId) continue;

        const source = connectionSourceByGroup.get(groupId);
        if (!source || seenCommunityPosts.has(row.post.id)) continue;

        seenCommunityPosts.add(row.post.id);
        communitySourceByPost.set(row.post.id, source);
        communityPosts.push(row.post);
      }
      const communityPostIdSet = new Set(communityPosts.map((p) => p.id));

      // --------------------------------------------------
      // 3) B) Suggested Posts (context-refined)
      // --------------------------------------------------
      const suggestedPostsRaw = await ctx.prisma.post.findMany({
        where: { AND: [visiblePostWhere(ctx), {
          kind: "POST",
          id: { notIn: [...basePostIdSet, ...communityPostIdSet] },
          ...(ranking && groupContextKeys.length ? { NOT: { postContexts: { some: {
            source: "IMPORT" as const, context: { key: { in: groupContextKeys } },
          } } } } : {}),
          authorId: {
            notIn: [
              ...followingIds,
              me,
              ...hiddenAuthorIds,
              ...connectionAuthorIds,
            ],
          },
          author: {
            AND: [
              { OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }] },
            ],
          },
        }] },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: poolSuggestedPosts,
        select: POST_SELECT,
      });

      const suggestedCandidates = ranking
        ? [...communityPosts, ...suggestedPostsRaw].sort(newestFirst).slice(0, poolSuggestedPosts)
        : [...communityPosts, ...suggestedPostsRaw];
      const suggestedPostScores = await getContextScoresForPosts(suggestedCandidates.map(p => p.id));
      const influence = await candidateInfluenceUnits(ctx.prisma, [...basePosts, ...suggestedCandidates], ranking, rankingNow);
      if (ranking) basePosts = rankInfluencedPosts(basePosts, influence, ranking, rankingNow);

      const suggestedRelevance = (a: typeof basePosts[number], b: typeof basePosts[number]) => {
          const sa =
            (communitySourceByPost.has(a.id) ? 8 : 0) +
            (suggestedPostScores.get(a.id) ?? 0);
          const sb =
            (communitySourceByPost.has(b.id) ? 8 : 0) +
            (suggestedPostScores.get(b.id) ?? 0);
          return sb - sa || b.createdAt.getTime() - a.createdAt.getTime();
        };
      const suggestedPosts = ranking
        ? rankInfluencedPosts(suggestedCandidates, influence, ranking, rankingNow, suggestedRelevance)
        : suggestedCandidates.sort(suggestedRelevance);

      // --------------------------------------------------
      // 4) C) Suggested Profiles (NETZWERK FIRST)
      // --------------------------------------------------
      const suggestedUsersRaw = await ctx.prisma.profile.findMany({
        where: {
          id: { notIn: [...followingIds, me, ...hiddenAuthorIds] },
          OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }],
        },
        orderBy: [{ followerCount: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        take: poolSuggestedUsers,
      });

      const candidateIds = suggestedUsersRaw.map((u) => u.id);

      const [
        profileContextScores,
        sharedFollowing,
        followedByMyFollowing,
      ] = await Promise.all([
        getContextScoresForProfiles(candidateIds),
        getSharedFollowingCounts(candidateIds),
        getFollowedByMyFollowingCounts(candidateIds),
      ]);

      const suggestedUsers = [...suggestedUsersRaw].sort((a, b) => {
        const aNet =
          1.2 * log1p(sharedFollowing.get(a.id) ?? 0) +
          1.0 * log1p(followedByMyFollowing.get(a.id) ?? 0);
        const bNet =
          1.2 * log1p(sharedFollowing.get(b.id) ?? 0) +
          1.0 * log1p(followedByMyFollowing.get(b.id) ?? 0);

        const aCtx = profileContextScores.get(a.id) ?? 0;
        const bCtx = profileContextScores.get(b.id) ?? 0;

        const aScore = aNet + 0.25 * aCtx;
        const bScore = bNet + 0.25 * bCtx;

        return (
          (bNet - aNet) ||
          (bScore - aScore) ||
          (b.followerCount - a.followerCount) ||
          (b.createdAt.getTime() - a.createdAt.getTime())
        );
      });

      // --------------------------------------------------
      // 5) Interleave (wie gehabt)
      // --------------------------------------------------
      const items: any[] = [];

      let p = 0;
      let sp = 0;
      let uBlock = 0;
      let normalSinceLastUserBlock = 0;

      const pushUserBlock = () => {
        const start = uBlock * 10;
        const users = suggestedUsers.slice(start, start + 10);
        if (!users.length) return false;
        items.push({
          id: `suggested_profiles:${me}:${uBlock}`,
          kind: "SUGGESTED_PROFILES",
          title: "Für dich vorgeschlagen",
          users,
          post: null,
        });
        uBlock++;
        normalSinceLastUserBlock = 0;
        return true;
      };

      const pushSuggestedPost = () => {
        const next = suggestedPosts[sp++];
        if (!next) return false;
        const communitySource = communitySourceByPost.get(next.id);
        items.push({
          id: `suggested_post:${next.id}`,
          kind: "SUGGESTED_POST",
          post: next,
          title: "Für dich vorgeschlagen",
          users: null,
          source: communitySource
            ? {
                kind: "GROUP",
                groupId: communitySource.id,
                title: communitySource.title,
              }
            : null,
        });
        return true;
      };

      

      while (items.length < need && (p < basePosts.length || sp < suggestedPosts.length)) {
        if (normalSinceLastUserBlock >= 8 && pushUserBlock()) continue;
        if (items.length > 0 && items.length % 7 === 0 && pushSuggestedPost()) continue;

        const nextPost = basePosts[p++];
        if (nextPost) {
          items.push({ id: nextPost.id, kind: "POST", post: nextPost, title: null, users: null, source: null });
          normalSinceLastUserBlock++;
          continue;
        }

        if (pushSuggestedPost()) continue;
        break;
      }

      while (items.length < need) {
        if (!pushUserBlock()) break;
      }

      const rankedItems = ranking ? diversifyInfluencedFeed(items, item => item.post?.author?.id) : items;
      return rankedItems.slice(safeOffset, safeOffset + safeLimit);
    },


    // apps/server/src/resolvers/feedResolvers.ts (oder wo exploreFeed liegt)


    // POST_SELECT kommt bei dir schon irgendwo her – 그대로 verwenden.
    exploreFeed: async (
      _: any,
      { limit = 30, cursor }: { limit?: number; cursor?: string },
      ctx: Ctx
    ) => {
      const me = ctx.profileId ?? null;
      const safeLimit = Math.min(60, Math.max(1, Number(limit) || 30));

      // Block-Sets laden
      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hiddenAuthorIds = [...new Set([...blockedByMe, ...blockedMe])];

      // 1) Following ermitteln
      const followingIds = me
        ? (
            await ctx.prisma.follow.findMany({
              where: { followerId: me },
              select: { followingId: true },
            })
          ).map((f: any) => f.followingId)
        : [];

      const now = new Date();

      let cursorPoint: { id: string; createdAt: Date } | null = null;
      if (cursor) {
        try {
          const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
          if (parsed?.id && parsed?.createdAt) {
            cursorPoint = { id: String(parsed.id), createdAt: new Date(parsed.createdAt) };
          }
        } catch {
          const fallback = await ctx.prisma.post.findUnique({
            where: { id: cursor },
            select: { id: true, createdAt: true },
          });
          cursorPoint = fallback;
        }
      }

      const cursorWhere = cursorPoint
        ? {
            OR: [
              { createdAt: { lt: cursorPoint.createdAt } },
              { createdAt: cursorPoint.createdAt, id: { lt: cursorPoint.id } },
            ],
          }
        : {};

      const posts = await ctx.prisma.post.findMany({
        where: { AND: [visiblePostWhere(ctx), {
          ...cursorWhere,
          kind: "POST",
          authorId: { notIn: [me ?? "", ...hiddenAuthorIds] },
          author: {
            AND: [
              { OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }] },
            ],
          },
        }] },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: safeLimit + 1,
        select: POST_SELECT,
      });

      const page = posts.slice(0, safeLimit);
      const last = page[page.length - 1];
      const nextCursor =
        posts.length > safeLimit && last
          ? Buffer.from(JSON.stringify({ id: last.id, createdAt: last.createdAt.toISOString() })).toString("base64url")
          : null;
      const edges = page.map((p) => ({ cursor: p.id, node: p }));
      return { edges, nextCursor };
    }


  
  

  },
};
