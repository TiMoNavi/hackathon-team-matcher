// apps/server/src/resolvers/notificationResolvers.ts
import type { Ctx } from "../context";
import { Prisma } from "@prisma/client";
import { getBlockedSets } from "../lib/blocks";
import { bundleActivityEdges } from "../lib/activityBundler";
import { getSignedGetUrlCached } from "../s3_cached";
import { visiblePostWhere } from "../lib/postVisibility";

const EMPTY_CONN = { edges: [], nextCursor: null as string | null };

function toConn<T>(edges: T[], limit: number, offset: number, hasMore: boolean) {
  return {
    edges,
    nextCursor: hasMore ? String(offset + limit) : null,
  };
}

export default {
  Query: {
    inbox: async (
      _: unknown,
      { offset = 0, limit = 20 }: { offset?: number; limit?: number },
      ctx: Ctx
    ) => {
      if (!ctx.profileId) return EMPTY_CONN;

      const where: Prisma.NotificationWhereInput = {
        AND: [{ OR: [{ postId: null }, { post: visiblePostWhere(ctx) }] }],
        recipientId: ctx.profileId,
        channel: { in: ["INBOX", "BOTH"] as any },
      };

      const rows = await ctx.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: {
          fromUser: true,
          vlog: true,
          post: { include: { author: true } },
        },
      });

      // ✅ wichtig: Cursor darf NICHT von visible.length abhängen
      const hasMore = rows.length === limit;

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hidden = new Set([...blockedByMe, ...blockedMe]);

      const visible = rows.filter((n) => {
        if (n.fromUserId && hidden.has(n.fromUserId)) return false;
        if (n.actorId && hidden.has(n.actorId)) return false;
        if (n.post?.authorId && hidden.has(n.post.authorId)) return false;
        return true;
      });

      return toConn(visible as any, limit, offset, hasMore);
    },

    activity: async (
      _: unknown,
      { offset = 0, limit = 20 }: { offset?: number; limit?: number },
      ctx: Ctx
    ) => {
      if (!ctx.profileId) return EMPTY_CONN;

      const where: Prisma.NotificationWhereInput = {
        AND: [{ OR: [{ postId: null }, { post: visiblePostWhere(ctx) }] }],
        recipientId: ctx.profileId,
        // ✅ Activity = alles (ACTIVITY + INBOX + BOTH)
        channel: { in: ["ACTIVITY", "INBOX", "BOTH"] as any },
      };

      const rows = await ctx.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: {
          fromUser: true,
          vlog: { select: { id: true, title: true, slug: true } },
          post: { include: { author: true } },
        },
      });

      const hasMore = rows.length === limit;

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hidden = new Set([...blockedByMe, ...blockedMe]);

      const visible = rows.filter((n) => {
        if (n.fromUserId && hidden.has(n.fromUserId)) return false;
        if (n.actorId && hidden.has(n.actorId)) return false;
        if (n.post?.authorId && hidden.has(n.post.authorId)) return false;
        return true;
      });

      // ✅ nur "bundle-safe" bundlen (keine Requests, damit CTA stabil bleibt)
      const bundleSafe = visible.filter((n) => {
        const t = (n as any)?.payload?.type;
        const isRequest =
          n.kind === "FOLLOW_REQUEST" ||
          n.kind === "VLOG_TAG_REQUEST" ||
          n.kind === "POST_SHARE_REQUEST" ||
          t === "POST_TAG_REQUEST";
        return !isRequest;
      });

      const bundleSafeIds = new Set(bundleSafe.map((n: any) => n.id));
      const passthrough = visible.filter((n: any) => !bundleSafeIds.has(n.id));

      const bundled = bundleActivityEdges(bundleSafe);

      // ✅ final sort nach latestAt/createdAt desc
      const merged = [...bundled, ...passthrough].sort((a: any, b: any) => {
        const at = new Date((a.latestAt ?? a.createdAt) as string).getTime();
        const bt = new Date((b.latestAt ?? b.createdAt) as string).getTime();
        return bt - at;
      });

      return toConn(merged as any, limit, offset, hasMore);
    },

    unreadCounts: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hidden = new Set([...blockedByMe, ...blockedMe]);

      const baseWhere = (channels: ("INBOX" | "ACTIVITY" | "BOTH")[]) => ({
        AND: [{ OR: [{ postId: null }, { post: visiblePostWhere(ctx) }] }],
        recipientId: ctx.profileId,
        isRead: false,
        OR: channels.map((c) => ({ channel: c })) as any,
      });

      const [rowsInbox, rowsActivity] = await Promise.all([
        // 🔔 Inbox: zählt einzelne Notifications
        ctx.prisma.notification.findMany({
          where: baseWhere(["INBOX", "BOTH"]),
          include: { post: true },
        }),

        // 🔔 Activity: Rohdaten (werden gleich gebündelt)
        ctx.prisma.notification.findMany({
          where: baseWhere(["ACTIVITY", "INBOX", "BOTH"]),
          orderBy: { createdAt: "desc" },
          include: { post: true },
        }),
      ]);

      // 🚫 Block-Filter
      const filterVisible = (rows: any[]) =>
        rows.filter((n) => {
          if (n.fromUserId && hidden.has(n.fromUserId)) return false;
          if (n.actorId && hidden.has(n.actorId)) return false;
          if (n.post?.authorId && hidden.has(n.post.authorId)) return false;
          return true;
        });

      const inboxVisible = filterVisible(rowsInbox);
      const activityVisible = filterVisible(rowsActivity);

      // ------------------------------------------------------------------
      // 🧠 ACTIVITY-BÜNDEL-LOGIK (nur fürs Badge)
      // ------------------------------------------------------------------

      const STORY_WINDOW = 24 * 60 * 60 * 1000;
      const LIKE_WINDOW = 24 * 60 * 60 * 1000;

      const used = new Set<string>();
      let activityCount = 0;

      for (let i = 0; i < activityVisible.length; i++) {
        const n = activityVisible[i];
        if (!n?.id || used.has(n.id)) continue;

        // 📚 STORY_POSTED → alle innerhalb 24h = 1
        if (n.kind === "STORY_POSTED") {
          used.add(n.id);

          for (let j = i + 1; j < activityVisible.length; j++) {
            const x = activityVisible[j];
            if (!x?.id || used.has(x.id)) continue;
            if (x.kind !== "STORY_POSTED") continue;

            const diff =
              new Date(n.createdAt).getTime() -
              new Date(x.createdAt).getTime();

            if (diff > STORY_WINDOW) break;

            used.add(x.id);
          }

          activityCount += 1;
          continue;
        }

        // ❤️ LIKE → gleicher Post innerhalb 24h = 1
        if (n.kind === "LIKE") {
          const pid = n.post?.id ?? n.payload?.postId ?? null;
          used.add(n.id);

          if (pid) {
            for (let j = i + 1; j < activityVisible.length; j++) {
              const x = activityVisible[j];
              if (!x?.id || used.has(x.id)) continue;
              if (x.kind !== "LIKE") continue;

              const xpid = x.post?.id ?? x.payload?.postId ?? null;
              if (xpid !== pid) continue;

              const diff =
                new Date(n.createdAt).getTime() -
                new Date(x.createdAt).getTime();

              if (diff > LIKE_WINDOW) break;

              used.add(x.id);
            }
          }

          activityCount += 1;
          continue;
        }

        // 📌 Alles andere (Requests, Kommentare, System etc.)
        used.add(n.id);
        activityCount += 1;
      }

      // ------------------------------------------------------------------

      return {
        inbox: inboxVisible.length,
        activity: activityCount,
      };
    },

  },

  Mutation: {
    markNotificationRead: async (_: unknown, { id }: { id: string }, ctx: Ctx) => {
      if (!ctx.profileId) return false;

      const n = await ctx.prisma.notification.findUnique({ where: { id } });
      if (!n || n.recipientId !== ctx.profileId) return false;

      await ctx.prisma.notification.update({
        where: { id },
        data: { isRead: true },
      });

      return true;
    },

    markAllNotificationsRead: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.profileId) return false;

      await ctx.prisma.notification.updateMany({
        where: { recipientId: ctx.profileId, isRead: false },
        data: { isRead: true },
      });

      return true;
    },

    markNotificationsRead: async (_: any, { ids }: { ids: string[] }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("UNAUTHORIZED");
      if (!Array.isArray(ids) || ids.length === 0) return true;

      await ctx.prisma.notification.updateMany({
        where: {
          id: { in: ids },
          recipientId: ctx.profileId,
        },
        data: { isRead: true },
      });

      return true;
    },

    markAllRead: async (
      _: unknown,
      { channel }: { channel: "INBOX" | "ACTIVITY" | "BOTH" },
      ctx: Ctx
    ) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const channels =
        channel === "BOTH"
          ? ["INBOX", "ACTIVITY", "BOTH"]
          : channel === "ACTIVITY"
          ? ["ACTIVITY", "INBOX", "BOTH"] // ✅ Activity = alles
          : ["INBOX", "BOTH"];

      await ctx.prisma.notification.updateMany({
        where: {
          recipientId: ctx.profileId,
          OR: channels.map((c) => ({ channel: c })) as any,
        },
        data: { isRead: true },
      });

      return true;
    },
  },

  // ✅ Union resolver (Notification | ActivityBundle)
  ActivityEdge: {
    __resolveType(obj: any) {
      if (obj?.__typename) return obj.__typename;
      if (obj?.latestAt && Array.isArray(obj?.ids)) return "ActivityBundle";
      return "Notification";
    },
  },
  ActivityBundle: {
    storyIds: (b: any) => (Array.isArray(b.storyIds) ? b.storyIds : []),
    ids: (b: any) => (Array.isArray(b.ids) ? b.ids : []),
    actors: (b: any) => (Array.isArray(b.actors) ? b.actors : []),
    isRead: (b: any) => !!b.isRead,
  },


  Notification: {
    kind: (n: any) => n.kind,

    recipient: (n: any, _a: any, ctx: Ctx) =>
      ctx.prisma.profile.findUnique({ where: { id: n.recipientId } }),

    fromUser: async (n: any, _a: any, ctx: Ctx) => {
      if (!n.fromUserId) return null;
      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      if ([...blockedByMe, ...blockedMe].includes(n.fromUserId)) return null;
      return ctx.prisma.profile.findUnique({ where: { id: n.fromUserId } });
    },

    actor: async (n: any, _a: any, ctx: Ctx) => {
      if (!n.actorId) return null;
      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      if ([...blockedByMe, ...blockedMe].includes(n.actorId)) return null;
      return ctx.prisma.profile.findUnique({ where: { id: n.actorId } });
    },

    vlog: (n: any, _args: any, ctx: Ctx) => {
      if (!n.vlogId) return null;
      return ctx.prisma.vlog.findUnique({
        where: { id: n.vlogId },
        select: { id: true, title: true, slug: true },
      });
    },

    post: async (n: any, _a: any, ctx: Ctx) => {
      if (!n.postId) return null;

      const p = await ctx.prisma.post.findUnique({ where: { id: n.postId } });
      if (!p) return null;

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      if (p.authorId && [...blockedByMe, ...blockedMe].includes(p.authorId)) return null;

      return p;
    },
  },
  MiniUser: {
    avatarUrl: (u: any) => {
      const v = u?.avatarUrl;
      if (!v) return null;
      if (typeof v === "string" && v.startsWith("http")) return v;
      return getSignedGetUrlCached(v);
    },
    avatarThumbUrl: (u: any) => {
      const v = u?.avatarThumbKey ?? u?.avatarUrl;
      if (!v) return null;
      if (typeof v === "string" && v.startsWith("http")) return v;
      return getSignedGetUrlCached(v);
    },
  },

  PostMini: {
    imageUrl: (p: any) =>
      p?.imageUrl
        ? p.imageUrl.startsWith("http")
          ? p.imageUrl
          : getSignedGetUrlCached(p.imageUrl)
        : null,

    thumbUrl: (p: any) =>
      p?.thumbUrl
        ? p.thumbUrl.startsWith("http")
          ? p.thumbUrl
          : getSignedGetUrlCached(p.thumbUrl)
        : null,

    videoUrl: (p: any) =>
      p?.videoUrl
        ? p.videoUrl.startsWith("http")
          ? p.videoUrl
          : getSignedGetUrlCached(p.videoUrl)
        : null,
  },
};
