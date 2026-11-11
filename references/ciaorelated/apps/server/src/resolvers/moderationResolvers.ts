// apps/server/src/resolvers/moderationResolvers.ts
import { Prisma } from "@prisma/client";
import type { Ctx } from "../context";

const THRESHOLD = 6;     // ENV machen, wenn du magst
const BAN_DAYS  = 7;

// Optional: einfache Admin-Prüfung
async function ensureAdmin(ctx: Ctx) {
  if (ctx.isAdmin) return;
  throw new Error("Not authorized");
}

function mapReportToAdmin(r: any) {
  const offender = r.targetUser ?? r.post?.author ?? r.comment?.author ?? null;
  return {
    id: r.id,
    reason: r.reason,
    details: r.details,
    status: r.status,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt ?? null,
    reporterId: r.reporterId,
    postId: r.postId ?? null,
    commentId: r.commentId ?? null,
    targetUserId: r.targetUserId ?? null,
    contentPostId: r.postId ?? r.comment?.postId ?? null,
    offenderId: offender?.id ?? null,
    offenderUsername: offender?.username ?? null,
  };
}

export async function deletePostByAdmin(tx: any, postId: string) {
  const post = await tx.post.findUnique({ where: { id: postId } });
  if (!post) return;

  // hole akzeptierte Vlog-Tags für postCount--
  const tags = await tx.postVlogTag.findMany({
    where: { postId, status: "ACCEPTED" },
    select: { vlogId: true },
  });

  // S3-Keys sammeln
  const keys:string[] = [];
  if (post.imageKey) keys.push(post.imageKey);
  if (post.videoKey) keys.push(post.videoKey);
  if (post.thumbKey) keys.push(post.thumbKey);

  await tx.$transaction(async (t:any) => {
    await t.postVlogTag.deleteMany({ where: { postId } });
    await t.comment.deleteMany({ where: { postId } });
    await t.like.deleteMany({ where: { postId } });
    await t.post.delete({ where: { id: postId } });

    if (tags.length) {
      await Promise.all(
        Array.from(new Set(tags.map((x:any)=>x.vlogId))).map(vlogId =>
          t.vlog.update({ where: { id: vlogId }, data: { postCount: { decrement: 1 } } })
        )
      );
    }
  });

  if (keys.length) {
    try { const { deleteObjects } = await import("../s3"); await deleteObjects(keys); } catch {}
  }
}

export async function deleteCommentByAdmin(tx:any, commentId:string) {
  const c = await tx.comment.findUnique({ where: { id: commentId }, select: { postId:true } });
  if (!c) return;
  await tx.$transaction(async (t:any) => {
    await t.comment.delete({ where: { id: commentId } });
    await t.post.update({ where: { id: c.postId }, data: { commentCount: { decrement: 1 } } });
  });
}


const moderationResolvers = {
  Mutation: {
    async reportContent(_: any, { input }: any, ctx: Ctx) {
      // 0) Auth-Guard
      if (!ctx.profileId) throw new Error("Not authenticated");
      const reporterId: string = ctx.profileId;

      const { postId, targetUserId, commentId, reason, details } = input ?? {};
      const picks = [!!postId, !!targetUserId, !!commentId].filter(Boolean).length;
      if (picks !== 1) {
        throw new Error("Exactly one of postId, targetUserId, commentId is required");
      }

      // 1) offenderId ermitteln
      let offenderId: string | null = null;

      if (typeof targetUserId === "string") {
        offenderId = targetUserId;
      }

      if (typeof postId === "string") {
        const post = await ctx.prisma.post.findUnique({
          where: { id: postId },
          select: { authorId: true },
        });
        if (!post) throw new Error("Post not found");
        offenderId = post.authorId;
      }

      if (typeof commentId === "string") {
        const comment = await ctx.prisma.comment.findUnique({
          where: { id: commentId },
          select: { authorId: true },
        });
        if (!comment) throw new Error("Comment not found");
        offenderId = comment.authorId;
      }

      // 2) Doppelmeldungen des gleichen Reporters vermeiden (App-Ebene)
      const existing = await ctx.prisma.report.findFirst({
        where: {
          reporterId,
          ...(postId ? { postId } : {}),
          ...(commentId ? { commentId } : {}),
          ...(targetUserId ? { targetUserId } : {}),
        },
      });
      if (existing) {
        return false; // oder throw new Error("You already reported this content");
      }

      // 3) Report speichern (nur vorhandene Felder setzen)
      const data: Prisma.ReportUncheckedCreateInput = {
        reporterId,
        reason,
        ...(details ? { details } : {}),
        ...(postId ? { postId } : {}),
        ...(commentId ? { commentId } : {}),
        ...(targetUserId ? { targetUserId } : {}),
      };

      const created = await ctx.prisma.report.create({ data });

      // 4) Optional: Auto-Moderation basierend auf DISTINCT-Reportern in 24h
      if (offenderId) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Reporter, die Posts des Offenders gemeldet haben
        const postReporters = await ctx.prisma.report.findMany({
          where: {
            createdAt: { gte: since },
            post: { authorId: offenderId }, // Relation-Filter
          },
          select: { reporterId: true },
          distinct: ["reporterId"],
        });

        // Reporter, die Comments des Offenders gemeldet haben
        const commentReporters = await ctx.prisma.report.findMany({
          where: {
            createdAt: { gte: since },
            comment: { authorId: offenderId }, // Relation-Filter
          },
          select: { reporterId: true },
          distinct: ["reporterId"],
        });

        // Reporter, die den User direkt gemeldet haben
        const userReporters = await ctx.prisma.report.findMany({
          where: {
            createdAt: { gte: since },
            targetUserId: offenderId,
          },
          select: { reporterId: true },
          distinct: ["reporterId"],
        });

        const uniq = new Set<string>([
          ...postReporters.map(r => r.reporterId),
          ...commentReporters.map(r => r.reporterId),
          ...userReporters.map(r => r.reporterId),
        ]);
        const distinctCount = uniq.size;

        // Falls du 'bannedUntil' nutzt:
        if (distinctCount >= THRESHOLD) {
          const offender = await ctx.prisma.profile.findUnique({
            where: { id: offenderId },
            select: { bannedUntil: true },
          });

          const activeBan = offender?.bannedUntil && offender.bannedUntil > new Date();
          if (!activeBan) {
            const until = new Date(Date.now() + BAN_DAYS * 24 * 60 * 60 * 1000);
            await ctx.prisma.profile.update({
              where: { id: offenderId },
              data: {
                bannedUntil: until,
                bannedReason: `Automatic ${BAN_DAYS}-day suspension after multiple reports`,
              },
            });
          }
        }
      }

      return true; // oder `true`, falls dein Schema Boolean erwartet
    },
    async resolveReport(
      _: any,
      { reportId, action = "NONE", notes }: { reportId: string; action?: "NONE" | "DELETE_CONTENT" | "SUSPEND_USER"; notes?: string },
      ctx: Ctx
    ) {
      await ensureAdmin(ctx);

      const report = await ctx.prisma.report.findUnique({
        where: { id: reportId },
        include: { post: true, comment: true, targetUser: true },
      });
      if (!report) throw new Error("Report not found");
      if (report.status === "RESOLVED") return true;

      // 1) Maßnahme ausführen (optional)
      switch (action) {
        case "DELETE_CONTENT":
          await ctx.prisma.$transaction(async (tx:any) => {
            if (report.postId) await deletePostByAdmin(tx, report.postId);
            else if (report.commentId) await deleteCommentByAdmin(tx, report.commentId);
          });
          break;

        case "SUSPEND_USER":
          {
            // Ziel-User (entweder direkt gemeldet oder Autor von Post/Comment)
            let offenderId = report.targetUserId ?? null;

            if (!offenderId && report.postId) {
              const post = await ctx.prisma.post.findUnique({
                where: { id: report.postId },
                select: { authorId: true },
              });
              offenderId = post?.authorId ?? null;
            }
            if (!offenderId && report.commentId) {
              const comment = await ctx.prisma.comment.findUnique({
                where: { id: report.commentId },
                select: { authorId: true },
              });
              offenderId = comment?.authorId ?? null;
            }

            if (offenderId) {
              const until = new Date(Date.now() + BAN_DAYS * 24 * 60 * 60 * 1000);
              await ctx.prisma.profile.update({
                where: { id: offenderId },
                data: {
                  bannedUntil: until,
                  bannedReason:
                    notes ??
                    `Suspended ${BAN_DAYS} days by moderation action`,
                },
              });
            }
          }
          break;

        case "NONE":
        default:
          // nichts extra
          break;
      }

      // 2) Report schließen
      await ctx.prisma.report.update({
        where: { id: report.id },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });

      // (Optional) Moderations-Log anlegen
      // await ctx.prisma.moderationAction.create({ data: { ... } });

      return true;
    },

    blockUser: async (_: unknown, { userId }: { userId: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      if (userId === ctx.profileId) throw new Error("Cannot block yourself");

      await ctx.prisma.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId: ctx.profileId, blockedId: userId } },
        update: {},
        create: { blockerId: ctx.profileId, blockedId: userId },
      });

      return true;
    },

    unblockUser: async (_: unknown, { userId }: { userId: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      await ctx.prisma.userBlock.deleteMany({
        where: { blockerId: ctx.profileId, blockedId: userId },
      });
      return true;
    },
    adminUnsuspendUser: async (_: unknown, { userId }: { userId: string }, ctx: Ctx) => {
      await ensureAdmin(ctx);
      await ctx.prisma.profile.update({
        where: { id: userId },
        data: { bannedUntil: null, bannedReason: null },
      });
      return true;
    },
  },Query:{
    blockedUsers: async (_:unknown, __:unknown, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const rows = await ctx.prisma.userBlock.findMany({
        where: { blockerId: ctx.profileId },
        select: { blocked: { select: { id: true, username: true, avatarUrl: true } } },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(r => r.blocked);
    },
    async openReports(_:any, { offset=0, limit=50 }, ctx:any) {
      await ensureAdmin(ctx);
      const rows = await ctx.prisma.report.findMany({
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
        skip: Math.max(0, offset),
        take: Math.min(100, Math.max(1, limit)),
        include: {
          post: { include: { author: true } },
          comment: { include: { author: true } },
          targetUser: true,
        },
      });
      return rows.map(mapReportToAdmin);
    },
    reportsOverdue24h: async (_:unknown, __:unknown, ctx: Ctx) => {
      await ensureAdmin(ctx);
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const where = { status: "OPEN" as const, createdAt: { lt: cutoff } };
      const [total, rows] = await Promise.all([
        ctx.prisma.report.count({ where }),
        ctx.prisma.report.findMany({
          where,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, reason: true, status: true, createdAt: true },
        }),
      ]);

      return { total, nodes: rows };
    },
    adminSuspendedUsers: async (_: unknown, { offset = 0, limit = 50 }: any, ctx: Ctx) => {
      await ensureAdmin(ctx);
      return ctx.prisma.profile.findMany({
        where: { bannedUntil: { gt: new Date() } },
        orderBy: { bannedUntil: "desc" },
        skip: Math.max(0, offset),
        take: Math.min(100, Math.max(1, limit)),
      });
    },

    async reports(_:any, { filter, offset=0, limit=50 }:any, ctx:any) {
      await ensureAdmin(ctx);
      const rows = await ctx.prisma.report.findMany({
        where: {
          ...(filter?.status ? { status: filter.status } : {}),
          ...(filter?.reason ? { reason: filter.reason } : {}),
          ...(filter?.reporterId ? { reporterId: filter.reporterId } : {}),
          ...(filter?.targetUserId ? { targetUserId: filter.targetUserId } : {}),
        },
        orderBy: { createdAt: "desc" },
        skip: Math.max(0, offset),
        take: Math.min(100, Math.max(1, limit)),
        include: {
          post: { include: { author: true } },
          comment: { include: { author: true } },
          targetUser: true,
        },
      });
      return rows.map(mapReportToAdmin);
    },

  }
};

export default moderationResolvers;
