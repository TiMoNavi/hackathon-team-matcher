// apps/server/src/lib/privacy.ts
import type { Ctx } from "../context";
import { getBlockedSets } from "./blocks";
import { visiblePostWhere } from "./postVisibility";

export async function canViewProfileContent(ctx: Ctx, authorId: string): Promise<boolean> {
  const me = ctx.profileId;
  if (!me) return false;

  // blocks (beide Richtungen)
  const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
  if (blockedByMe.has(authorId) || blockedMe.has(authorId)) return false;

  // eigener content
  if (authorId === me) return true;

  const author = await ctx.prisma.profile.findUnique({
    where: { id: authorId },
    select: { isPrivate: true },
  });
  if (!author) return false;

  if (!author.isPrivate) return true;

  // private -> braucht follow
  const rel = await ctx.prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: me, followingId: authorId } },
    select: { followerId: true },
  });

  return !!rel;
}



export async function assertCanViewPost(ctx: Ctx, postId: string): Promise<{ authorId: string }> {
  const p = await ctx.prisma.post.findFirst({
    where: { AND: [{ id: postId }, visiblePostWhere(ctx)] },
    select: { authorId: true },
  });
  if (!p) throw new Error("Not found");

  return { authorId: p.authorId };
}
