// apps/server/src/chat/resolvers.ts
import { GraphQLError } from "graphql";
import type { PrismaClient } from "@prisma/client";
import { pubsub } from "./pubsub";
import { EVENTS } from "./events";
import * as svc from "./service";
import type { Ctx } from "../context";
import { getSignedGetUrl, signPutForChat } from "../s3";
import { GetObjectCommand,S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { withFilter } from "graphql-subscriptions";

// optionaler AsyncIterable-Check (für saubere Fehlermeldungen)
function isAsyncIterable(obj: any): obj is AsyncIterable<any> {
  return obj && typeof obj[Symbol.asyncIterator] === "function";
}

function requireAuth(ctx: Ctx): asserts ctx is Ctx & { profileId: string } {
  if (!ctx.profileId) throw new GraphQLError("UNAUTHORIZED");
}

async function signChatUpload(mime: string, filename?: string) {
  const safe = (filename || "upload").replace(/[^\w.\-]+/g, "_");
  const key = `chat/${Date.now()}-${Math.random().toString(36).slice(2)}-${safe}`;
  return signPutForChat(key, mime); // <- liefert { putUrl, getUrl, publicUrl, key, mime }
}

async function signGet(key: string) {
  const Bucket = process.env.S3_BUCKET!;
  const cmd = new GetObjectCommand({ Bucket, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: 15 * 60 }); // 15 min
}

const s3 = new S3Client({
  region: process.env.S3_REGION || 'eu-north-1',
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});



// thread-spezifische Topics
const topicMsg = (threadId: string) => `${EVENTS.MESSAGE_ADDED}:${threadId}`;
const topicTyping = (threadId: string) => `${EVENTS.TYPING}:${threadId}`;

export const resolvers = {
  // -----------------------------
  // Queries
  // -----------------------------
  Query: {
    threads: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.profileId) return [];
      // inkl. lastMessageAt & unreadCount via Service
      return svc.listThreads(ctx.prisma as PrismaClient, ctx.profileId);
    },

    thread: async (_: unknown, { threadId }: { threadId: string }, ctx: Ctx) => {
      requireAuth(ctx);
      return svc.assertThreadAccess(ctx.prisma, ctx.profileId, threadId);
    },

    messages: async (
      _: unknown,
      args: { threadId: string; cursor?: string; take?: number },
      ctx: Ctx
    ) => {
      if (!ctx.profileId) return { edges: [], nextCursor: null };
      return svc.messages(
        ctx.prisma as PrismaClient,
        ctx.profileId,
        args.threadId,
        args.cursor,
        args.take ?? 30
      );

    },

    unreadCount: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.profileId) return { total: 0, perThread: [] };
      return svc.unreadCount(ctx.prisma as PrismaClient, ctx.profileId);
    },
  },

  // -----------------------------
  // Mutations
  // -----------------------------
  Mutation: {
    deleteMessage: async (_: unknown, { messageId }: { messageId: string }, ctx: Ctx) => {
      requireAuth(ctx);

      const deleted = await svc.deleteMessage(
        ctx.prisma as PrismaClient,
        ctx.profileId,
        messageId
      );

      // OPTIONAL: publish event, damit andere Teilnehmer es live sehen
      await pubsub.publish(topicMsg(deleted.threadId), {
        messageAdded: { id: `__deleted__:${deleted.id}` }, // (siehe Hinweis unten)
      });

      return true;
    },
    sendMessage: async (
      _ : unknown,
      { input }: { input: { threadId: string; clientId?: string; kind: string; text?: string; media?: any; replyToId?: string; storyId?: string } },
      ctx: Ctx
    ) => {
      requireAuth(ctx);

      // ✅ Service macht Sicherheitschecks (Thread membership + Story safety) und speichert storyId
      const msg = await svc.sendMessage(
        ctx.prisma as PrismaClient,
        ctx.profileId,
        input
      );

      // OPTIONAL zusätzlich: thread-spezifisches Topic publishen
      await pubsub.publish(topicMsg(msg.threadId), { messageAdded: msg });

      return msg;
    },




    async toggleMessageLike(_:unknown, { messageId }: { messageId:string }, ctx: Ctx) {
      if (!ctx.profileId) throw new Error("UNAUTHORIZED");
      // existiert Nachricht?
      const msg = await ctx.prisma.message.findUnique({ where: { id: messageId }});
      if (!msg) throw new Error("NOT_FOUND");
      await svc.assertThreadAccess(ctx.prisma, ctx.profileId, msg.threadId);

      const key = { messageId_userId: { messageId, userId: ctx.profileId } };
      const existing = await ctx.prisma.messageLike.findUnique({ where: key });

      if (existing) {
        await ctx.prisma.messageLike.delete({ where: key });
      } else {
        await ctx.prisma.messageLike.create({ data: { messageId, userId: ctx.profileId }});
      }

      // aktualisierte Nachricht zurück (für likeCount/likedByMe Felder)
      return ctx.prisma.message.findUnique({ where: { id: messageId }});
    },
  

    markThreadRead: async (_: unknown, { threadId }: { threadId: string }, ctx: Ctx) => {
      requireAuth(ctx);
      return svc.markThreadRead(ctx.prisma as PrismaClient, ctx.profileId, threadId);
    },

    signUpload: async (_:unknown, { mime, filename }: { mime:string; filename?:string }) => {
      return signPutForChat(`chat/${Date.now()}-${Math.random().toString(36).slice(2)}-${(filename||'file').replace(/[^\w.\-]+/g,'_')}`, mime);
    },


    createThread: async (
      _: unknown,
      { memberUserIds, title, imageKey }: { memberUserIds: string[]; title?: string; imageKey?: string | null },
      ctx: Ctx
    ) => {
      requireAuth(ctx);
      const members = Array.isArray(memberUserIds) ? [...memberUserIds] : [];
      if (!members.includes(ctx.profileId)) members.push(ctx.profileId);
      return svc.createThread(ctx.prisma as PrismaClient, ctx.profileId, members, title, imageKey);
    },

    updateThreadSettings: async (
      _: unknown,
      { threadId, title, imageKey }: { threadId: string; title: string; imageKey?: string | null },
      ctx: Ctx
    ) => {
      requireAuth(ctx);
      const safeTitle = String(title ?? "").trim();
      if (!safeTitle) throw new GraphQLError("GROUP_TITLE_REQUIRED");

      const [thread] = await (ctx.prisma as PrismaClient).$queryRaw<
        Array<{ id: string; kind: string; groupKey: string | null; ownerId: string | null }>
      >`SELECT id, kind::text AS kind, "groupKey", "ownerId" FROM "Thread" WHERE id = ${threadId} LIMIT 1`;
      if (!thread) throw new GraphQLError("THREAD_NOT_FOUND");
      if (String(thread.kind) !== "GROUP" || !thread.groupKey?.length) throw new GraphQLError("NOT_GROUP_THREAD");
      if (thread.ownerId !== ctx.profileId) throw new GraphQLError("FORBIDDEN");

      return (ctx.prisma as PrismaClient).thread.update({
        where: { id: threadId },
        data: {
          title: safeTitle,
          ...(typeof imageKey !== "undefined" ? { imageKey: imageKey || null } : {}),
        } as any,
      });
    },

    removeThreadMember: async (_: unknown, { threadId, userId }: { threadId: string; userId: string }, ctx: Ctx) => {
      requireAuth(ctx);
      const [thread] = await (ctx.prisma as PrismaClient).$queryRaw<
        Array<{ id: string; kind: string; groupKey: string | null; ownerId: string | null }>
      >`SELECT id, kind::text AS kind, "groupKey", "ownerId" FROM "Thread" WHERE id = ${threadId} LIMIT 1`;
      if (!thread) throw new GraphQLError("THREAD_NOT_FOUND");
      if (String(thread.kind) !== "GROUP" || !thread.groupKey?.length) throw new GraphQLError("NOT_GROUP_THREAD");
      if (thread.ownerId !== ctx.profileId) throw new GraphQLError("FORBIDDEN");
      if (userId === thread.ownerId) throw new GraphQLError("OWNER_CANNOT_BE_REMOVED");

      await (ctx.prisma as PrismaClient).threadMember.deleteMany({
        where: { threadId, userId },
      });
      return true;
    },

    setCommunityChatKind: async (_: unknown, { groupId, kind }: { groupId: string; kind: string }, ctx: Ctx) => {
      requireAuth(ctx);
      if (kind !== "COMMUNITY" && kind !== "BROADCAST" && kind !== "DISABLED") throw new GraphQLError("INVALID_THREAD_KIND");

      const group = await (ctx.prisma as PrismaClient).groupLink.findUnique({
        where: { id: groupId },
        select: { id: true, ownerId: true, isActive: true, systemKey: true },
      });
      if (!group || !group.isActive) throw new GraphQLError("GROUP_NOT_FOUND");
      if (group.ownerId !== ctx.profileId) throw new GraphQLError("FORBIDDEN");
      if (group.systemKey === "BVRLY") throw new GraphQLError("NETWORK_COMMUNITY_CHAT_UNAVAILABLE");

      const thread = await svc.ensureCommunityThread(ctx.prisma as PrismaClient, group.id);
      if (!thread) throw new GraphQLError("THREAD_NOT_FOUND");

      return (ctx.prisma as PrismaClient).thread.update({
        where: { id: thread.id },
        data: { kind: kind as any },
      });
    },

    setTyping: async (_: unknown, { threadId, typing }: { threadId: string; typing: boolean }, ctx: Ctx) => {
      if (!ctx.profileId) return false;
      await svc.assertThreadAccess(ctx.prisma, ctx.profileId, threadId);
      await pubsub.publish(topicTyping(threadId), { isTyping: typing });
      return true;
    },
  },

  // -----------------------------
  // Subscriptions
  // -----------------------------
  Subscription: {
    messageAdded: {
      subscribe: async (_: unknown, args: { threadId: string }, ctx: Ctx) => {
        requireAuth(ctx);
        await svc.assertThreadAccess(ctx.prisma, ctx.profileId, args.threadId);
        const iter = pubsub.asyncIterator([topicMsg(args.threadId)]);
        if (!isAsyncIterable(iter)) throw new Error("messageAdded source is not AsyncIterable");
        return iter;
      },
      resolve: async (payload: any, args: { threadId: string }, ctx: Ctx) => {
        requireAuth(ctx);
        await svc.assertThreadAccess(ctx.prisma, ctx.profileId, args.threadId);
        return payload.messageAdded;
      },
    },

    typing: {
      subscribe: async (_: unknown, args: { threadId: string }, ctx: Ctx) => {
        requireAuth(ctx);
        await svc.assertThreadAccess(ctx.prisma, ctx.profileId, args.threadId);
        const iter = pubsub.asyncIterator([topicTyping(args.threadId)]);
        if (!isAsyncIterable(iter)) throw new Error("typing source is not AsyncIterable");
        return iter;
      },
      resolve: async (payload: any, args: { threadId: string }, ctx: Ctx) => {
        requireAuth(ctx);
        await svc.assertThreadAccess(ctx.prisma, ctx.profileId, args.threadId);
        return Boolean(payload.isTyping);
      },
    },

    unreadUpdated: {
      subscribe: withFilter(
        () => {
          const iter = pubsub.asyncIterator([EVENTS.UNREAD_UPDATED]);
          if (!isAsyncIterable(iter)) throw new Error("unreadUpdated source is not AsyncIterable");
          return iter;
        },
        (payload: any, _vars: unknown, ctx: Ctx) => {
          // ✅ nur Events für den eingeloggten User
          return Boolean(ctx?.profileId) && payload?.userId === ctx.profileId;
        }
      ),
      resolve: (payload: any) => payload?.unreadUpdated ?? null,
    },
  },

  // -----------------------------
  // Field Resolvers
  // -----------------------------
  Message: {
    sender: (m: any, _a: unknown, ctx: Ctx) =>
      (ctx.prisma as PrismaClient).profile.findUnique({ where: { id: m.senderId } }),
    async media(m:any) {
      if (!m.s3Key || !m.mime) return null;
      const cmd = new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: m.s3Key });
      const url = await getSignedUrl(s3, cmd, { expiresIn: 15 * 60 }); // 15 Min
      return {
        url,
        mime: m.mime,
        width: m.width ?? null,
        height: m.height ?? null,
        durationMs: m.durationMs ?? null,
      };
    },
    async likeCount(m:any, _a:any, { prisma }: Ctx) {
      return prisma.messageLike.count({ where: { messageId: m.id } });
    },
    async likedByMe(m:any, _a:any, ctx: Ctx) {
      if (!ctx.profileId) return false;
      const rec = await ctx.prisma.messageLike.findUnique({
        where: { messageId_userId: { messageId: m.id, userId: ctx.profileId } },
      });
      return Boolean(rec);
    },
    story: async (m: any, _a: any, ctx: Ctx) => {
      const storyId = m.storyId ?? null;
      if (!storyId) return null;

      const s = await ctx.prisma.story.findUnique({
        where: { id: storyId },
      });

      if (!s) return null;

      // expired => null
      const ageMs = Date.now() - new Date(s.createdAt).getTime();
      if (ageMs > 24 * 60 * 60 * 1000) return null;

      // ✅ wenn author fehlt, lieber story als "nicht verfügbar" behandeln
      if (!s.authorId) return null;

      // optional: check author exists (verhindert non-null crash)
      const authorExists = await ctx.prisma.profile.findUnique({
        where: { id: s.authorId },
        select: { id: true },
      });
      if (!authorExists) return null;

      return s;
    },

    storyExpired: async (m: any, _a: any, ctx: Ctx) => {
      const storyId = m.storyId ?? null;
      if (!storyId) return false;

      const s = await ctx.prisma.story.findUnique({
        where: { id: storyId },
        select: { createdAt: true, authorId: true },
      });

      if (!s) return true;

      // author missing/deleted => treat as unavailable
      if (!s.authorId) return true;

      const authorExists = await ctx.prisma.profile.findUnique({
        where: { id: s.authorId },
        select: { id: true },
      });
      if (!authorExists) return true;

      const ageMs = Date.now() - new Date(s.createdAt).getTime();
      return ageMs > 24 * 60 * 60 * 1000;
    },


  },

  Thread: {
    members: async (t: any, _a: unknown, ctx: Ctx) => {
      const mems = await (ctx.prisma as PrismaClient).threadMember.findMany({
        where: { threadId: t.id },
        include: { user: true },
      });
      return mems.map((m) => m.user);
    },
    imageUrl: async (t: any) => {
      const key = typeof t?.imageKey === "string" ? t.imageKey : "";
      if (!key) return null;
      if (/^https?:\/\//i.test(key)) return key;
      return getSignedGetUrl(key);
    },
    viewerIsOwner: (t: any, _a: unknown, ctx: Ctx) => !!ctx.profileId && t?.ownerId === ctx.profileId,
    lastMessageAt: async (t: any, _a: unknown, ctx: Ctx) => {
      const last = await (ctx.prisma as PrismaClient).message.findFirst({
        where: { threadId: t.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      return last?.createdAt ?? null;
    },
    unreadCount: async (t: any, _a: unknown, ctx: Ctx) => {
      requireAuth(ctx);
      const mem = await (ctx.prisma as PrismaClient).threadMember.findUnique({
        where: { threadId_userId: { threadId: t.id, userId: ctx.profileId! } },
      });
      if (!mem) return 0;
      return (ctx.prisma as PrismaClient).message.count({
        where: {
          threadId: t.id,
          createdAt: { gt: mem.lastReadAt },
          senderId: { not: ctx.profileId }, // ✅ eigene Messages NICHT zählen
        },
      });
    },
    kind: (t: any) => t?.kind ?? (t?.groupKey ? "GROUP" : "DM"),
    isGroupChat: (t: any) => (t?.kind ? t.kind !== "DM" : Boolean(t?.groupKey)),
    community: async (t: any, _a: unknown, ctx: Ctx) => {
      const groupKey = typeof t?.groupKey === "string" ? t.groupKey : "";
      if (!groupKey.startsWith("community:")) return null;

      const groupId = groupKey.slice("community:".length);
      if (!groupId) return null;

      return (ctx.prisma as PrismaClient).groupLink.findFirst({
        where: { id: groupId, isActive: true },
      });
    },
  },
};
