import { Prisma } from "@prisma/client";
import type { Ctx } from "../context";
import { visiblePostSql } from "../lib/postVisibility";

function publicCommunityWhere(profileId: string): Prisma.GroupLinkWhereInput {
  return {
    visibility: "PUBLIC", isActive: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    owner: {
      OR: [{ bannedUntil: null }, { bannedUntil: { lt: new Date() } }],
      blocksByMe: { none: { blockedId: profileId } },
      blockedMe: { none: { blockerId: profileId } },
    },
  };
}

export default {
  Query: {
    searchCommunities: async (_: unknown, args: { q: string; offset?: number | null; limit?: number | null }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const q = args.q.trim().slice(0, 80);
      if (!q) return { items: [], hasMore: false };
      const limit = Math.min(24, Math.max(1, args.limit ?? 6));
      // Treat wildcard characters as literal text, not a request for every community.
      const contains = q.replace(/[\\%_]/g, "\\$&");
      const rows = await ctx.prisma.groupLink.findMany({
        where: { ...publicCommunityWhere(ctx.profileId), title: { contains, mode: "insensitive" } },
        orderBy: [{ title: "asc" }, { id: "asc" }],
        skip: Math.max(0, args.offset ?? 0), take: limit + 1,
        include: {
          _count: { select: { members: true } },
          members: { where: { profileId: ctx.profileId }, select: { profileId: true }, take: 1 },
        },
      });
      return {
        items: rows.slice(0, limit).map(group => ({ ...group, viewerIsMember: group.members.length > 0 || group.ownerId === ctx.profileId })),
        hasMore: rows.length > limit,
      };
    },

    suggestedCommunities: async (_: unknown, { limit = 6 }: { limit?: number | null }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const me = ctx.profileId;
      const take = Math.min(8, Math.max(1, limit ?? 6));
      // Rank public candidates in SQL before LIMIT. No private memberships or
      // inaccessible posts contribute a recommendation reason.
      const ranked = await ctx.prisma.$queryRaw<Array<{ id: string; reason: string }>>`
        WITH candidates AS (
          SELECT g.* FROM "GroupLink" g JOIN "Profile" owner ON owner.id = g."ownerId"
          WHERE g.visibility = 'PUBLIC' AND g."isActive"
            AND g."systemKey" IS NULL
            AND (g."expiresAt" IS NULL OR g."expiresAt" > NOW())
            AND (owner."bannedUntil" IS NULL OR owner."bannedUntil" < NOW())
            AND g."ownerId" <> ${me}
            AND NOT EXISTS (SELECT 1 FROM "GroupLinkMember" m WHERE m."groupLinkId" = g.id AND m."profileId" = ${me})
            AND NOT EXISTS (SELECT 1 FROM "UserBlock" b WHERE
              (b."blockerId" = ${me} AND b."blockedId" = owner.id) OR
              (b."blockedId" = ${me} AND b."blockerId" = owner.id))
        ), ranked AS (
          SELECT g.id, g."createdAt",
            (SELECT COUNT(*) FROM "Follow" f JOIN "Profile" p ON p.id = f."followingId"
              WHERE f."followerId" = ${me}
                AND (p."bannedUntil" IS NULL OR p."bannedUntil" < NOW())
                AND NOT EXISTS (SELECT 1 FROM "UserBlock" b WHERE
                  (b."blockerId" = ${me} AND b."blockedId" = p.id) OR
                  (b."blockedId" = ${me} AND b."blockerId" = p.id))
                AND (p.id = g."ownerId" OR EXISTS (SELECT 1 FROM "GroupLinkMember" m
                  WHERE m."groupLinkId" = g.id AND m."profileId" = p.id))) AS following_count,
            (SELECT MAX(p."createdAt") FROM "Context" c
              JOIN "PostContext" pc ON pc."contextId" = c.id
              JOIN "Post" p ON p.id = pc."postId"
              WHERE c."groupLinkId" = g.id AND pc.source = 'IMPORT'
                AND p."createdAt" >= NOW() - INTERVAL '30 days'
                AND ${visiblePostSql(ctx, Prisma.sql`p.id`)}) AS latest_post
          FROM candidates g
        )
        SELECT id, CASE WHEN following_count > 0 THEN 'FOLLOWING'
          WHEN latest_post IS NOT NULL THEN 'ACTIVE' ELSE 'PUBLIC' END AS reason
        FROM ranked
        ORDER BY following_count DESC, latest_post DESC NULLS LAST, "createdAt" DESC, id ASC
        LIMIT ${take}
      `;
      if (!ranked.length) return [];
      const groups = await ctx.prisma.groupLink.findMany({
        where: {
          ...publicCommunityWhere(me), id: { in: ranked.map(row => row.id) },
          systemKey: null,
          ownerId: { not: me }, members: { none: { profileId: me } },
        },
        include: { _count: { select: { members: true } } },
      });
      const byId = new Map(groups.map(group => [group.id, { ...group, viewerIsMember: false }]));
      return ranked.flatMap(row => {
        const community = byId.get(row.id);
        return community ? [{ community, reason: row.reason }] : [];
      });
    },
  },
};
