import { Prisma } from "@prisma/client";
import type { Ctx } from "../context";

export const communityContextWhere: Prisma.ContextWhereInput = {
  OR: [{ key: { startsWith: "group:" } }, { groupLinkId: { not: null } }],
};

export function readableGroupWhere(profileId: string): Prisma.GroupLinkWhereInput {
  return {
    isActive: true,
    OR: [
      { visibility: "PUBLIC" },
      { ownerId: profileId },
      { members: { some: { profileId } } },
    ],
  };
}

// Apply before pagination. Community audience replaces profile audience, but
// never overrides blocks or bans. Orphan community contexts fail closed.
export function visiblePostWhere(ctx: Pick<Ctx, "profileId">): Prisma.PostWhereInput {
  const me = ctx.profileId;
  if (!me) return { id: { in: [] } };
  return {
    AND: [
      { author: { AND: [
        { OR: [{ bannedUntil: null }, { bannedUntil: { lt: new Date() } }] },
        { blocksByMe: { none: { blockedId: me } } },
        { blockedMe: { none: { blockerId: me } } },
      ] } },
      { postContexts: { none: { context: { AND: [
        communityContextWhere,
        { OR: [{ groupLinkId: null }, { groupLink: { isNot: readableGroupWhere(me) } }] },
      ] } } } },
      { OR: [
        { postContexts: { some: { context: communityContextWhere } } },
        { authorId: me },
        { author: { isPrivate: false } },
        { author: { followers: { some: { followerId: me } } } },
      ] },
    ],
  };
}

export async function canViewPost(ctx: Ctx, postId: string): Promise<boolean> {
  return !!await ctx.prisma.post.findFirst({
    where: { AND: [{ id: postId }, visiblePostWhere(ctx)] }, select: { id: true },
  });
}

// Raw feed/search queries use the same audience rules before LIMIT or aggregation.
// postId must be a constant SQL column expression, never a user-supplied identifier.
export function visiblePostSql(ctx: Pick<Ctx, "profileId">, postId: Prisma.Sql): Prisma.Sql {
  const me = ctx.profileId;
  if (!me) return Prisma.sql`FALSE`;
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "Post" vp JOIN "Profile" va ON va.id = vp."authorId"
    WHERE vp.id = ${postId}
      AND (va."bannedUntil" IS NULL OR va."bannedUntil" < NOW())
      AND NOT EXISTS (SELECT 1 FROM "UserBlock" vb WHERE
        (vb."blockerId" = ${me} AND vb."blockedId" = va.id) OR
        (vb."blockedId" = ${me} AND vb."blockerId" = va.id))
      AND NOT EXISTS (
        SELECT 1 FROM "PostContext" vpc JOIN "Context" vc ON vc.id = vpc."contextId"
        LEFT JOIN "GroupLink" vg ON vg.id = vc."groupLinkId"
        WHERE vpc."postId" = vp.id AND (vc.key LIKE 'group:%' OR vc."groupLinkId" IS NOT NULL)
          AND (vg.id IS NULL OR NOT vg."isActive" OR NOT (
            vg.visibility = 'PUBLIC' OR vg."ownerId" = ${me} OR EXISTS (
              SELECT 1 FROM "GroupLinkMember" vm WHERE vm."groupLinkId" = vg.id AND vm."profileId" = ${me}
            )
          ))
      )
      AND (NOT va."isPrivate" OR va.id = ${me}
        OR EXISTS (SELECT 1 FROM "Follow" vf WHERE vf."followerId" = ${me} AND vf."followingId" = va.id)
        OR EXISTS (SELECT 1 FROM "PostContext" vpc JOIN "Context" vc ON vc.id = vpc."contextId"
          WHERE vpc."postId" = vp.id AND (vc.key LIKE 'group:%' OR vc."groupLinkId" IS NOT NULL)))
  )`;
}
