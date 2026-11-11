// server/src/lib/guards.ts
import type { Ctx} from "../context";


export async function canDeleteComment(ctx: Ctx, commentId: string) {
  const comment = await ctx.prisma.comment.findUnique({
    where: { id: commentId },
    select: { authorId: true, post: { select: { authorId: true } } },
  });
  if (!comment) return false;
  const me = ctx.profileId ?? null;
  return !!me && (comment.authorId === me || comment.post.authorId === me);
}

export async function assertNotBanned(ctx: Ctx) {
  if (!ctx.profileId) throw new Error("Not authenticated");
  const me = await ctx.prisma.profile.findUnique({
    where: { id: ctx.profileId },
    select: { bannedUntil: true },
  });
  if (me?.bannedUntil && me.bannedUntil > new Date()) {
    throw new Error(`Dein Account ist bis ${me.bannedUntil.toISOString()} gesperrt`);
  }
}