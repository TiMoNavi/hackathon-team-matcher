// apps/server/src/resolvers/postDetailResolvers.ts
import type { Ctx } from "../context";
import { getBlockedSets } from "../lib/blocks";
import { visiblePostWhere } from "../lib/postVisibility";

export default {
  Query: {
    post: async (_:unknown, { id }: { id: string }, ctx: Ctx) => {
      const admin = !!ctx.isAdmin;

      const p = await ctx.prisma.post.findFirst({
        where: { AND: [{ id }, visiblePostWhere(ctx)] },
        include: { author: true },
      });
      if (!p) return null;

      const pending = await ctx.prisma.postMedia.count({
        where: { postId: id, processStatus: { in: ["PENDING", "PROCESSING"] } },
      });
      if (pending > 0) {
        if (!admin && (!ctx.profileId || ctx.profileId !== p.authorId)) throw new Error("Forbidden");
      }

      // Blocks
      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hidden = new Set([...blockedByMe, ...blockedMe]);
      if (p.authorId && hidden.has(p.authorId)) {
        throw new Error("Forbidden");
      }

      return p;
    },
  },

  Post: {
    taggedUsers: async (p: any, _args: unknown, ctx: Ctx) => {
      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hidden = new Set([...blockedByMe, ...blockedMe]);

      const rows = await ctx.prisma.postTag.findMany({
        where: { postId: p.id },
        orderBy: { createdAt: "asc" },
        include: { user: true },
      });

      const safe = rows.filter(r => !hidden.has(r.user.id));
      return safe.map(r => ({
        user: r.user,
        status: r.status,
        showOnProfile: !!r.showOnProfile,
      }));
    },

    acceptedVlogs: async (p: any, _args: unknown, ctx: Ctx) =>
      (async () => {
        const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
        const hidden = new Set([...blockedByMe, ...blockedMe]);

        const vlogs = await ctx.prisma.vlog.findMany({
          where: { tags: { some: { postId: p.id, status: "ACCEPTED" } } },
          include: { owner: true },
        });
        return vlogs.filter(v => v.owner && !hidden.has(v.owner.id));
      })(),

    hasAcceptedVlog: async (p:any, _a:unknown, ctx:Ctx) => {
      const n = await ctx.prisma.postVlogTag.count({
        where: { postId: p.id, status: "ACCEPTED" },
      });
      return n > 0;
    },

    isMine: (p:any, _a:unknown, ctx:Ctx) => !!ctx.profileId && p.authorId === ctx.profileId,

    iAmTagged: async (p:any, _a:unknown, ctx:Ctx) => {
      if (!ctx.profileId) return false;
      const n = await ctx.prisma.postTag.count({
        where: { postId: p.id, userId: ctx.profileId }
      });
      return n > 0;
    },

    iShowOnProfile: async (p:any, _a:unknown, ctx:Ctx) => {
      if (!ctx.profileId) return false;
      const tag = await ctx.prisma.postTag.findUnique({
        where: { postId_userId: { postId: p.id, userId: ctx.profileId } },
        select: { showOnProfile: true },
      });
      return !!tag?.showOnProfile;
    },
  },

  Mutation: {
    setSharedPostOnProfile: async (_:unknown, { postId, show }: { postId:string; show:boolean }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const userId = ctx.profileId;

      await ctx.prisma.$transaction(async (tx) => {
        const where = { postId_userId: { postId, userId } };

        const existing = await tx.postTag.findUnique({
          where,
          select: { status: true },
        });

        if (!existing) throw new Error("Tag not found");
        if (existing.status !== "ACCEPTED") throw new Error("Tag not accepted");

        await tx.postTag.update({
          where,
          data: { showOnProfile: show },
        });

        if (!show) {
          await tx.notification.deleteMany({
            where: {
              recipientId: userId,
              kind: { in: ["POST_SHARE_REQUEST", "POST_SHARE_APPROVED", "POST_SHARE_REJECTED"] },
              payload: { path: ["postId"], equals: postId },
            },
          });
        }
      });


      return true;
    },

    untagSelf: async (_:unknown, { postId }: { postId:string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const userId = ctx.profileId;

      await ctx.prisma.$transaction(async (tx) => {
        await tx.postTag.deleteMany({ where: { postId, userId } });
        await tx.notification.deleteMany({
          where: {
            recipientId: userId,
            kind: { in: ["POST_SHARE_REQUEST", "POST_SHARE_APPROVED", "POST_SHARE_REJECTED"] },
            payload: { path: ["postId"], equals: postId },
          },
        });
      });

      return true;
    },

    setPostGridVisibility: async (_:unknown, { postId, visible }: { postId:string; visible:boolean }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const post = await ctx.prisma.post.findUnique({ where: { id: postId } });
      if (!post || post.authorId !== ctx.profileId) throw new Error("Forbidden");
      await ctx.prisma.post.update({ where: { id: postId }, data: { hideFromGrid: !visible } });
      return true;
    },
  },
};
