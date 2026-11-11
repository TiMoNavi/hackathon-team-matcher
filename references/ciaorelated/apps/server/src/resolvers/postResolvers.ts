import { visiblePostWhere } from "../lib/postVisibility";
import { captureCommunityInteraction } from "../lib/communityInfluenceEvents";
// apps/server/src/resolvers/postResolvers.ts
import type { Ctx } from "../context";
import crypto from "node:crypto";
import { getSignedPutUrl, getSignedGetUrl, deleteObjects } from "../s3";
import type { CreatePostInput } from "../types/graphql";
import { notify } from "../lib/notify";
import { Prisma } from "@prisma/client";
import { removeMemberIfNoAcceptedPosts } from "../helpers/vlogMembership";
import { ensureTermsAccepted } from "../helpers/termsAccepted";
import { assertNotBanned } from "../lib/guards";
import { assertNoProfanity } from "../graphql/profanity-guard";
import { assertCanViewPost, canViewProfileContent } from "../lib/privacy";
import { setPostTagNotificationStatus } from "../lib/notificationStatus";
import { ensureContext, indexPostContexts, applyLikeContextLift, applyAuthorContextImportOnLike } from "../lib/context/engine";
import { requireVerifiedEmail } from "../lib/requireVerifiedEmail";
import { indexPostHashtags } from "../lib/context/postHashtags";
import { maybePromoteHashtagContexts } from "../lib/context/hashtagPromotion";
import { geocodeCity } from "../lib/geo/geocodeCity";
import { normalizePlaceLabel } from "../lib/geo/placeLabel";


const PLACEHOLDER = "https://via.placeholder.com/600?text=No+Image";

const dashboardDateKey = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const addDays = (date: Date, days: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

function validLatLng(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const outLat = Number(lat);
  const outLng = Number(lng);
  if (!Number.isFinite(outLat) || !Number.isFinite(outLng)) return null;
  if (outLat < -90 || outLat > 90 || outLng < -180 || outLng > 180) return null;
  return { lat: outLat, lng: outLng };
}

async function resolvePostLocationGeo(input: { location?: string | null; locationLat?: unknown; locationLng?: unknown }) {
  const cleanLocation = normalizePlaceLabel(input.location);
  if (!cleanLocation) return { location: cleanLocation, locationLat: null, locationLng: null };

  const explicit = validLatLng(input.locationLat, input.locationLng);
  if (explicit) return { location: cleanLocation, locationLat: explicit.lat, locationLng: explicit.lng };

  try {
    const geo = await geocodeCity(cleanLocation);
    if (geo) return { location: cleanLocation, locationLat: geo.lat, locationLng: geo.lng };
  } catch {}

  return { location: cleanLocation, locationLat: null, locationLng: null };
}

const urlCache = new Map<string, { url: string; exp: number }>();
const inflight = new Map<string, Promise<string>>();

/** kleine Hilfe zum gezielten Invalidieren einzelner Keys */
function invalidateSignedUrl(key?: string | null) {
  if (key) urlCache.delete(key);
}

function groupContextKey(groupId: string) {
  return `group:${groupId}`;
}

async function attachGroupContextToPost(tx: any, postId: string, groupLinkId: string, profileId: string) {
  const group = await tx.groupLink.findUnique({ where: { id: groupLinkId } });
  if (!group || !group.isActive) throw new Error("Community not found");

  if (group.ownerId !== profileId) {
    const membership = await tx.groupLinkMember.findUnique({
      where: {
        groupLinkId_profileId: {
          groupLinkId,
          profileId,
        },
      },
    });
    if (!membership) throw new Error("You are not a member of this community");
  }

  const context = await ensureContext(tx, {
    kind: "TOPIC",
    key: groupContextKey(group.id),
    groupLinkId: group.id,
    label: group.title,
    cityScoped: false,
  });

  await tx.postContext.upsert({
    where: {
      postId_contextId_source: {
        postId,
        contextId: context.id,
        source: "IMPORT",
      },
    },
    update: { weight: 4 },
    create: {
      postId,
      contextId: context.id,
      source: "IMPORT",
      weight: 4,
    },
  });
}

async function clearGroupContextFromPost(tx: any, postId: string) {
  const rows = await tx.postContext.findMany({
    where: {
      postId,
      source: "IMPORT",
      context: { key: { startsWith: "group:" } },
    },
    select: { contextId: true },
  });
  if (!rows.length) return;
  await tx.postContext.deleteMany({
    where: {
      postId,
      source: "IMPORT",
      contextId: { in: rows.map((row: any) => row.contextId) },
    },
  });
}

/** Presigned-GET-URL cachen + einfacher Singleflight gegen Stampedes */
async function signedGetCached(key: string, ttlSec = 900) {
  const now = Math.floor(Date.now() / 1000);
  const hit = urlCache.get(key);
  if (hit && hit.exp - 30 > now) return hit.url; // 30s Puffer

  const running = inflight.get(key);
  if (running) return running;

  const p = (async () => {
    const url = await getSignedGetUrl(key, ttlSec);
    urlCache.set(key, { url, exp: now + ttlSec });
    inflight.delete(key);
    return url;
  })();

  inflight.set(key, p);
  return p;
}
async function ensureMembership(tx: any, vlogId: string, userId: string, accept: boolean) {
  const existing = await tx.vlogMember.findUnique({
    where: { vlogId_userId: { vlogId, userId } },
    select: { status: true },
  });

  if (!existing) {
    await tx.vlogMember.create({
      data: { vlogId, userId, role: "MEMBER", status: accept ? "ACCEPTED" : "PENDING" },
    });
    if (accept) {
      await tx.vlog.update({ where: { id: vlogId }, data: { memberCount: { increment: 1 } } });
    }
    return;
  }

  if (accept && existing.status !== "ACCEPTED") {
    await tx.vlogMember.update({
      where: { vlogId_userId: { vlogId, userId } },
      data: { status: "ACCEPTED", role: "MEMBER" },
    });
    await tx.vlog.update({ where: { id: vlogId }, data: { memberCount: { increment: 1 } } });
  }
}

function requireProfileId(ctx: Ctx): string {
  const id = ctx.profileId;
  if (!id) throw new Error("Not authenticated");
  return id;
}

// ✅ Vlog-Access fürs Posten: nur Owner oder ACCEPTED Member
async function assertCanPostToVlogs(tx: any, vlogIds: string[], me: string) {
  const ids = Array.from(new Set((vlogIds ?? []).map(String).filter(Boolean)));
  if (!ids.length) return;

  const vlogs = await tx.vlog.findMany({
    where: { id: { in: ids } },
    select: { id: true, ownerId: true },
  });
  const ownerByVlog = new Map(vlogs.map((v: any) => [v.id, v.ownerId]));

  const memberships = await tx.vlogMember.findMany({
    where: { vlogId: { in: ids }, userId: me, status: "ACCEPTED" },
    select: { vlogId: true },
  });
  const memberSet = new Set(memberships.map((m: any) => m.vlogId));

  // Unknown IDs?
  const found = new Set(vlogs.map((v: any) => v.id));
  const missing = ids.filter(id => !found.has(id));
  if (missing.length) throw new Error("Vlog not found");

  // Access check
  const forbidden = ids.filter((id) => ownerByVlog.get(id) !== me && !memberSet.has(id));
  if (forbidden.length) throw new Error("Forbidden (not a vlog member)");
}

// ganz oben in postResolvers.ts hinzufügen (z. B. unter den anderen helpers)
async function canDeleteComment(ctx: Ctx, commentId: string) {
  const me = ctx.profileId;
  if (!me) return false;

  const c = await ctx.prisma.comment.findUnique({
    where: { id: commentId },
    select: { authorId: true, post: { select: { authorId: true } } },
  });
  if (!c) return false;
  return c.authorId === me || c.post?.authorId === me;
}

async function acceptVlogTagImmediately(tx: any, vlogId: string, postId: string) {
  // Setze ACCEPTED, wenn es nicht schon so ist
  const tag = await tx.postVlogTag.findUnique({
    where: { postId_vlogId: { postId, vlogId } },
    select: { status: true },
  });

  if (!tag || tag.status !== "ACCEPTED") {
    await tx.postVlogTag.upsert({
      where: { postId_vlogId: { postId, vlogId } },
      update: { status: "ACCEPTED" },
      create: { postId, vlogId, status: "ACCEPTED" },
    });
    await tx.vlog.update({
      where: { id: vlogId },
      data: { postCount: { increment: 1 } },
    });
  }
}


async function notifyVlogMembersNewPost(tx: any, args: {
  vlogId: string;
  postId: string;
  actorId: string;
  mediaKind: "IMAGE" | "VIDEO" | "POST";
}) {
  const { vlogId, postId, actorId, mediaKind } = args;

  // Owner + ACCEPTED Members
  const vlog = await tx.vlog.findUnique({
    where: { id: vlogId },
    select: {
      ownerId: true,
      title: true,
      slug: true,
      members: { // falls relation anders heißt: vlogMember / VlogMember etc.
        where: { status: "ACCEPTED" },
        select: { userId: true },
      },
    },
  });

  if (!vlog) return;

  const recipientIds = new Set<string>();
  recipientIds.add(vlog.ownerId);
  for (const m of (vlog.members ?? [])) recipientIds.add(m.userId);
  recipientIds.delete(actorId); // Autor nicht benachrichtigen

  for (const recipientId of recipientIds) {
    await notify({
      prisma: tx as any,
      recipientId,
      kind: "VLOG_NEW_POST",
      channel: "ACTIVITY",
      fromUserId: actorId,
      actorId,
      vlogId,
      postId,
      payload: {
        mediaKind, // für body "Foto/Video/Beitrag"
        vlogSlug: vlog.slug,
      },
    });
  }
}

const Comment = {
  content: (c: any) => c.content ?? c.text, // DB:text -> GraphQL:content
};

function toStringArray(input: unknown, limit = 12): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];

  for (const v of input) {
    const s = typeof v === "string" ? v : String(v ?? "");
    const t = s.trim();
    if (!t) continue;
    if (!out.includes(t)) out.push(t); // dedupe
    if (out.length >= limit) break;
  }

  return out;
}


async function markPostTagRequestHandled(prisma: any, recipientId: string, postId: string, status: "ACCEPTED" | "REJECTED") {
  // wir suchen die neuesten Notifications für diesen post/recipient
  const rows = await prisma.notification.findMany({
    where: {
      recipientId,
      postId,
      isRead: false,
      OR: [{ channel: "ACTIVITY" }, { channel: "BOTH" }],
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  // die Request ist bei dir über payload.type gekennzeichnet
  const targets = rows.filter((n: any) => n?.payload?.type === "POST_TAG_REQUEST");

  await Promise.all(
    targets.map((n: any) =>
      prisma.notification.update({
        where: { id: n.id },
        data: {
          isRead: true,
          payload: {
            ...(n.payload ?? {}),
            status,
            type: status === "ACCEPTED" ? "POST_TAG_APPROVED" : "POST_TAG_REJECTED",
            text: status === "ACCEPTED" ? "Markierung akzeptiert." : "Markierung abgelehnt.",
          },
        },
      })
    )
  );
}


const resolvers = {
  /* ────────────────────────────── Query ────────────────────────────── */
  Query: {
    feed: (_: unknown, { offset = 0, limit = 10 }: { offset?: number; limit?: number }, ctx: Ctx) =>
      ctx.prisma.post.findMany({
        where: { AND: [visiblePostWhere(ctx), { author: { isPrivate: false } ,
                media: { none: { processStatus: { in: ["PENDING", "PROCESSING"] } } },}] },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: { author: true },
      }),


    getSignedPostDownload: async (_: unknown, { postId }: { postId: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      await assertCanViewPost(ctx, postId);
      const pending = await ctx.prisma.postMedia.count({
        where: { postId, processStatus: { in: ["PENDING", "PROCESSING"] } },
      });
      if (pending > 0) throw new Error("Post is still processing");

      const post = await ctx.prisma.post.findUnique({ where: { id: postId } });
      if (!post) throw new Error("Not found");
      if (post.authorId !== ctx.profileId) throw new Error("Forbidden");

      const key = post.imageKey ?? post.videoKey ?? post.thumbKey;
      if (!key) return PLACEHOLDER;
      return signedGetCached(key, 900);
    },

    postsByUser: async (_: unknown, { userId, kind, offset = 0, limit = 12 }: any, ctx: Ctx) =>{
      return ctx.prisma.post.findMany({
        where: { AND: [visiblePostWhere(ctx), { authorId: userId, kind, media: { none: { processStatus: { in: ["PENDING", "PROCESSING"] } } }, }] },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: { author: true },
      });},

    // ⚠️ NEU: zeigt nur Posts, in denen userId getaggt ist UND das Tag akzeptiert ist UND showOnProfile=true
    taggedPosts: async (
      _: unknown,
      { userId, offset = 0, limit = 12 }: any,
      ctx: Ctx
    ) => {
      // 0) Darf der Viewer überhaupt das Profil userId sehen?
      const ok = await canViewProfileContent(ctx, userId);
      if (!ok) return [];

      // 1) Kandidaten: Posts wo userId ACCEPTED getaggt ist
      // 2) OWNER-CHECK: falls Autor privat ist, muss der Profilinhaber (userId) dem Autor folgen
      const posts = await ctx.prisma.post.findMany({
        where: { AND: [visiblePostWhere(ctx), {
          tags: { some: { userId, status: "ACCEPTED" } },

          // ✅ Owner-basierte Sichtbarkeit (entscheidend für "wenn ICH entfolge -> keiner sieht es auf meinem Profil")
          OR: [
            // Autor ist öffentlich
            { author: { isPrivate: false } },

            // Owner ist selbst der Autor
            { authorId: userId },

            // Autor ist privat -> Owner folgt dem Autor
            {
              author: {
                isPrivate: true,
                followers: {
                  some: { followerId: userId }, // Follow: followerId=owner -> followingId=author
                },
              },
            },
          ],
        }] },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: { author: true },
      });

      // 3) VIEWER-CHECK: Besucher dürfen private Autoren nur sehen, wenn SIE dürfen
      // (z.B. Besucher folgt dem privaten Autor nicht -> dann fliegt der Post wieder raus)
      const out: any[] = [];
      for (const p of posts) {
        try {
          await assertCanViewPost(ctx, p.id);
          out.push(p);
        } catch {
          // not visible to viewer -> skip
        }
      }

      return out;
    },




      postComments: async (_: unknown, args: { postId: string; offset?: number; limit?: number }, ctx: Ctx) => {
        const { postId, offset = 0, limit = 20 } = args;

        // ✅ minimal: privacy + blocks greifen
        await assertCanViewPost(ctx, postId);

        return ctx.prisma.comment.findMany({
          where: { postId },
          orderBy: { createdAt: "asc" },
          skip: Math.max(0, offset),
          take: Math.min(100, Math.max(1, limit)),
          include: { author: true, post: true },
        });
      },
    postLikers: async (_: unknown, args: { postId: string; offset?: number; limit?: number }, ctx: Ctx) => {
        const { postId, offset = 0, limit = 50 } = args;

        // ✅ privacy + blocks greifen
        await assertCanViewPost(ctx, postId);

        const likes = await ctx.prisma.like.findMany({
          where: { postId },
          orderBy: { createdAt: "desc" },
          skip: Math.max(0, offset),
          take: Math.min(100, Math.max(1, limit)),
          select: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
                avatarUrl: true,   // ✅ wichtig: daraus macht dein GraphQL resolver avatarThumbUrl
                isPrivate: true,
              },
            },
          },
        });

        // GraphQL User entspricht Profile
        return likes.map((l) => l.user);
      },

    myProfessionalDashboard: async (_: unknown, { days = 30 }: { days?: number }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const safeDays = Math.min(365, Math.max(1, Number(days) || 30));
      const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
      const previousSince = new Date(Date.now() - safeDays * 2 * 24 * 60 * 60 * 1000);
      const today = new Date();
      const dayKeys = Array.from({ length: safeDays }, (_, index) =>
        dashboardDateKey(addDays(today, index - safeDays + 1))
      );

      const ownPostWhere = { post: { authorId: ctx.profileId } };
      const [totalPostViewsAgg, viewsAgg, previousViewsAgg, viewRows, dailyLikes, dailyComments, likes, comments, newFollowers] = await Promise.all([
        ctx.prisma.post.aggregate({
          where: { AND: [visiblePostWhere(ctx), { authorId: ctx.profileId }] },
          _sum: { viewCount: true, uniqueViewCount: true },
        }),
        ctx.prisma.postView.aggregate({
          where: { ...ownPostWhere, viewedAt: { gte: since } },
          _sum: { count: true },
        }),
        ctx.prisma.postView.aggregate({
          where: { ...ownPostWhere, viewedAt: { gte: previousSince, lt: since } },
          _sum: { count: true },
        }),
        ctx.prisma.postView.findMany({
          where: { ...ownPostWhere, viewedAt: { gte: since } },
          select: { viewedAt: true, count: true, viewerId: true },
        }),
        ctx.prisma.like.findMany({
          where: { ...ownPostWhere, createdAt: { gte: since } },
          select: { createdAt: true },
        }),
        ctx.prisma.comment.findMany({
          where: { ...ownPostWhere, createdAt: { gte: since } },
          select: { createdAt: true },
        }),
        ctx.prisma.like.count({ where: { ...ownPostWhere, createdAt: { gte: since } } }),
        ctx.prisma.comment.count({ where: { ...ownPostWhere, createdAt: { gte: since } } }),
        ctx.prisma.follow.count({ where: { followingId: ctx.profileId, createdAt: { gte: since } } }),
      ]);

      const totalViews = totalPostViewsAgg._sum.viewCount ?? 0;
      const periodViews = viewsAgg._sum.count ?? 0;
      const seriesMap = new Map(
        dayKeys.map((date) => [date, { date, views: 0, uniqueViews: 0, interactions: 0 }])
      );

      for (const row of viewRows) {
        const date = dashboardDateKey(row.viewedAt);
        const point = seriesMap.get(date);
        if (!point) continue;
        point.views += row.count ?? 0;
        point.uniqueViews += 1;
      }

      for (const row of dailyLikes) {
        const point = seriesMap.get(dashboardDateKey(row.createdAt));
        if (point) point.interactions += 1;
      }

      for (const row of dailyComments) {
        const point = seriesMap.get(dashboardDateKey(row.createdAt));
        if (point) point.interactions += 1;
      }

      const series = Array.from(seriesMap.values());
      const seriesViews = series.reduce((sum, point) => sum + point.views, 0);
      const missingLegacyViews = Math.max(0, totalViews - seriesViews);
      if (missingLegacyViews > 0 && series.length > 0) {
        series[series.length - 1].views += missingLegacyViews;
      }
      const reachedProfiles = new Set(viewRows.map((row) => row.viewerId).filter(Boolean)).size;

      return {
        totalViews,
        totalUniqueViews: totalPostViewsAgg._sum.uniqueViewCount ?? 0,
        views: Math.max(periodViews, totalViews),
        previousViews: previousViewsAgg._sum.count ?? 0,
        reachedProfiles,
        series,
        likes,
        comments,
        interactions: likes + comments,
        newFollowers,
      };
    },

    myProfileViewers: async (_: unknown, { offset = 0, limit = 30 }: { offset?: number; limit?: number }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const rows = await ctx.prisma.profileView.findMany({
        where: { targetId: ctx.profileId },
        orderBy: { viewedAt: "desc" },
        skip: Math.max(0, offset),
        take: Math.min(100, Math.max(1, limit)),
        include: { viewer: true },
      });

      return rows.map((row) => ({
        viewedAt: row.viewedAt,
        seen: !!row.seenAt && row.seenAt >= row.viewedAt,
        viewer: row.viewer,
      }));
    },



    userByUsername: (_: unknown, { username }: { username: string }, ctx: Ctx) =>
      ctx.prisma.profile.findUnique({ where: { username } }),

    userById: (_: unknown, { id }: { id: string }, ctx: Ctx) =>
      ctx.prisma.profile.findUnique({ where: { id } }),
  },

  /* ──────────────────────────── Mutation ───────────────────────────── */
  Mutation: {
    getSignedPostUpload: async (_: unknown, { mime, size }: any, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const isVideo = (mime ?? "").startsWith("video/");

      const MAX_IMG   = Number(process.env.MAX_POST_IMAGE_BYTES ?? 10 * 1024 * 1024);
      const MAX_VIDEO = Number(process.env.MAX_POST_VIDEO_BYTES ?? 100 * 1024 * 1024);
      const MAX = isVideo ? MAX_VIDEO : MAX_IMG;
      if (size > MAX) throw new Error("File too large");

      const ext = isVideo
        ? (mime === "video/quicktime" ? "mov" : mime === "video/webm" ? "webm" : "mp4")
        : (mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg");

      const key = `profiles/${ctx.profileId}/posts/${crypto.randomUUID()}.${ext}`;
      const putUrl = await getSignedPutUrl(key, mime);
      return { key, putUrl };
    },


    addComment: async (
      _: unknown,
      { postId, content }: { postId: string; content: string },
      ctx: Ctx
    ) => {
      // 1) Auth & Narrowing -> userId ist garantiert string
      if (!ctx.profileId) throw new Error("Not authenticated");
      assertNoProfanity({ content }, ["content"]);

      const userId: string = ctx.profileId;
      await ensureTermsAccepted(ctx);await assertNotBanned(ctx);;


      const text = (content ?? "").trim();
      if (!text) throw new Error("Empty comment");
      await assertCanViewPost(ctx, postId);

      // 2) Post existiert + Autor ermitteln
      const post = await ctx.prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, authorId: true },
      });
      if (!post) throw new Error("Post not found");

      // 3) In TX: Kommentar anlegen + Zähler erhöhen + ggf. Notification
      const created = await ctx.prisma.$transaction(async (tx) => {
        // Variante A: direkte FK (unchecked create)
        const c = await tx.comment.create({
          data: {
            postId,
            authorId: userId,       // ✅ jetzt garantiert string
            content: text,
          },
          include: {
            author: { select: { id: true, username: true, avatarUrl: true } }, // ✅ Relation laden
          },
        });

        await tx.post.update({
          where: { id: postId },
          data: { commentCount: { increment: 1 } },
        });

        await captureCommunityInteraction(tx, userId, postId);

        // Keine Notification, wenn Self-Comment
        if (post.authorId !== userId) {
          await notify({
            prisma: tx,
            channel: "ACTIVITY",
            kind: "COMMENT",
            recipientId: post.authorId,
            fromUserId: userId,
            postId,
            payload: { text },
          });
        }

        return c;
      });

      // 4) Rückgabe in deiner GQL-Form (inkl. post{id})
      return {
        __typename: "Comment",
        id: created.id,
        content: created.content,
        createdAt: created.createdAt,
        author: {
          __typename: "Profile",
          id: created.author.id,
          username: created.author.username,
          avatarUrl: created.author.avatarUrl,
        },
        post: { __typename: "Post", id: postId },
      };
    },



    deleteComment: async (_: unknown, args: { commentId: string }, ctx: Ctx) => {
      const meId = requireProfileId(ctx);
      if (!ctx.profileId) throw new Error("Not authenticated");
      const { commentId } = args;

      const ok = await canDeleteComment(ctx, commentId);
      if (!ok) throw new Error("Forbidden");

      // für Zähler brauchen wir postId
      const c = await ctx.prisma.comment.findUnique({ where: { id: commentId }, select: { postId: true } });
      if (!c) return true;

      await ctx.prisma.$transaction(async (tx) => {
        await tx.comment.delete({ where: { id: commentId } });
        await tx.post.update({
          where: { id: c.postId },
          data: { commentCount: { decrement: 1 } },
        });
      });

      return true;
    },


    /* -------- Post bearbeiten (Caption/Location + Vlog-Verlinkungen) -------- */
    updatePost: async (_: unknown, { input }: { input: any }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      await ensureTermsAccepted(ctx);await assertNotBanned(ctx);;
      assertNoProfanity(input, ["caption", "location", "interests"]);


      const prev = await ctx.prisma.post.findUnique({ where: { id: input.id } });

      if (!prev) throw new Error("Not found");
      if (prev.authorId !== ctx.profileId) throw new Error("Forbidden");

      const nextInterests: string[] | undefined =
        input.interests === undefined ? undefined : toStringArray(input.interests, 12);

      const locationInputChanged =
        input.location !== undefined || input.locationLat !== undefined || input.locationLng !== undefined;
      const resolvedLocation = locationInputChanged
        ? await resolvePostLocationGeo({
            location: input.location,
            locationLat: input.locationLat,
            locationLng: input.locationLng,
          })
        : {
            location: prev.location ?? null,
            locationLat: (prev as any).locationLat ?? null,
            locationLng: (prev as any).locationLng ?? null,
          };

      const vlogsChanged =
        (Array.isArray(input.addVlogIds) && input.addVlogIds.length > 0) ||
        (Array.isArray(input.removeVlogIds) && input.removeVlogIds.length > 0);
      const communityChanged = Object.prototype.hasOwnProperty.call(input, "groupLinkId");


      const updated = await ctx.prisma.$transaction(async (tx) => {
        const p = await tx.post.update({
          where: { id: input.id },
          data: {
            caption:  input.caption  !== undefined ? input.caption : prev.caption,
            location: resolvedLocation.location,
            locationLat: resolvedLocation.locationLat,
            locationLng: resolvedLocation.locationLng,
            ...(nextInterests !== undefined ? { interests: { set: nextInterests } } : {}),
          },
          include: { author: true },
        });
        // ✅ Re-index (nur wenn caption/location wirklich geändert wurden)
        const captionChanged =
          input.caption !== undefined && (input.caption ?? null) !== (prev.caption ?? null);
        const locationChanged =
          locationInputChanged &&
          (
            (resolvedLocation.location ?? null) !== (prev.location ?? null) ||
            (resolvedLocation.locationLat ?? null) !== ((prev as any).locationLat ?? null) ||
            (resolvedLocation.locationLng ?? null) !== ((prev as any).locationLng ?? null)
          );

        const nextSet = new Set(nextInterests ?? []);
        const prevSet = new Set(prev.interests ?? []);

        const interestsChanged =
          input.interests !== undefined &&
          (nextSet.size !== prevSet.size || [...nextSet].some((x) => !prevSet.has(x)));


        if (captionChanged || locationChanged || interestsChanged) {
          const nextCaption = input.caption ?? prev.caption ?? null;
          const nextLocation = resolvedLocation.location ?? null;
          const nextInterestsForIndex = nextInterests ?? prev.interests ?? [];


          await indexPostHashtags(tx as any, p.id, nextCaption);
          await indexPostContexts(tx as any, p.id, {
            caption: nextCaption,
            location: nextLocation,
            interestLabels: nextInterestsForIndex, // ✅ nur wenn indexPostContexts das akzeptiert
          });

        }

        if (communityChanged) {
          // A private post must not become public by removing its community.
          const privateContext = await tx.postContext.findFirst({
            where: { postId: p.id, context: { key: { startsWith: "group:" },
              OR: [{ groupLinkId: null }, { groupLink: { visibility: "PRIVATE" } }],
            } },
            select: { context: { select: { groupLinkId: true, key: true } } },
          });
          if (privateContext) {
            const existingGroupId = privateContext.context.groupLinkId ?? privateContext.context.key.slice(6);
            if (input.groupLinkId !== existingGroupId) throw new Error("PRIVATE_COMMUNITY_POST_CANNOT_MOVE");
          }
          await clearGroupContextFromPost(tx as any, p.id);
          const nextGroupLinkId = input.groupLinkId ? String(input.groupLinkId) : null;
          if (nextGroupLinkId) {
            await attachGroupContextToPost(tx as any, p.id, nextGroupLinkId, ctx.profileId!);
          }
        }


        if (Array.isArray(input.addVlogIds) && input.addVlogIds.length) {
          const inputVlogIds = toStringArray(input.addVlogIds, 50);

          await assertCanPostToVlogs(tx, inputVlogIds, ctx.profileId!);

          // ✅ Mitgliedschaft: immer ACCEPTED (aber nur, wenn erlaubt – siehe Guard)
          for (const vlogId of inputVlogIds) {
            await ensureMembership(tx, vlogId, ctx.profileId!, true);
          }

          // ✅ Tags: immer ACCEPTED (postCount++ nur beim ersten Mal)
          for (const vlogId of inputVlogIds) {
            await acceptVlogTagImmediately(tx, vlogId, p.id);
            await notifyVlogMembersNewPost(tx, {
              vlogId,
              postId: p.id,
              actorId: p.authorId,
              mediaKind: p.videoKey ? "VIDEO" : (p.imageKey ? "IMAGE" : "POST"),
            });
          }
          
        }



        // Vlog-Links entfernen
        if (Array.isArray(input.removeVlogIds) && input.removeVlogIds.length) {
          const removeVlogIds = Array.from(new Set(input.removeVlogIds as string[]));

          // 1) Welche Tags existieren wirklich + Status prüfen
          const existing = await tx.postVlogTag.findMany({
            where: { postId: p.id, vlogId: { in: removeVlogIds } },
            select: { vlogId: true, status: true },
          });

          // 2) Nur ACCEPTED wirkt auf vlog.postCount
          const acceptedVlogIds = Array.from(
            new Set(existing.filter(t => t.status === "ACCEPTED").map(t => t.vlogId))
          );

          if (acceptedVlogIds.length) {
            await Promise.all(
              acceptedVlogIds.map(vlogId =>
                tx.vlog.update({
                  where: { id: vlogId },
                  data: { postCount: { decrement: 1 } },
                })
              )
            );
          }

          // 3) Tags löschen
          await tx.postVlogTag.deleteMany({
            where: { postId: p.id, vlogId: { in: removeVlogIds } },
          });

          // 4) Membership aufräumen, wenn Autor keine ACCEPTED Posts mehr im Vlog hat
          for (const vlogId of removeVlogIds) {
            await removeMemberIfNoAcceptedPosts(tx, vlogId, p.authorId);
          }
        }
        if (vlogsChanged) {
          const accepted = await tx.postVlogTag.findMany({
            where: { postId: p.id, status: "ACCEPTED" },
            select: { vlogId: true },
          });
          await indexPostContexts(tx as any, p.id, {
            caption: (input.caption ?? prev.caption) ?? null,
            location: resolvedLocation.location ?? null,
            interestLabels: nextInterests ?? prev.interests ?? [],
            taggedVlogIds: accepted.map(x => x.vlogId),
          });
        }

        return p;
      });

      // 🔄 Cache-Invalidierung NUR wenn Keys gewechselt haben
      if (prev.imageKey !== updated.imageKey) invalidateSignedUrl(prev.imageKey);
      if (prev.videoKey !== updated.videoKey) invalidateSignedUrl(prev.videoKey);
      if (prev.thumbKey !== updated.thumbKey) invalidateSignedUrl(prev.thumbKey);

      const imageUrl = updated.imageKey ? await signedGetCached(updated.imageKey, 900) : null;
      const videoUrl = updated.videoKey ? await signedGetCached(updated.videoKey, 900) : null;
      const thumbUrl = updated.thumbKey ? await signedGetCached(updated.thumbKey, 900) : null;
      return { ...updated, imageUrl, videoUrl, thumbUrl };
    },


    /* -------- Einzelne Vlog-Tag Anfrage (aus Edit UI) -------- */
    requestVlogTag: async (_: unknown, { postId, vlogId }: { postId: string; vlogId: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const post = await ctx.prisma.post.findUnique({ where: { id: postId } });
      if (!post) throw new Error("Not found");
      if (post.authorId !== ctx.profileId) throw new Error("Forbidden");

      await ctx.prisma.$transaction(async (tx) => {
        await assertCanPostToVlogs(tx, [vlogId], ctx.profileId!);
        await ensureMembership(tx, vlogId, ctx.profileId!, true);
        await acceptVlogTagImmediately(tx, vlogId, postId);
        await notifyVlogMembersNewPost(tx, {
          vlogId,
          postId,
          actorId: ctx.profileId!,
          mediaKind: post.videoKey ? "VIDEO" : (post.imageKey ? "IMAGE" : "POST"),
        });
      });

      
      return true;
    },

    /* -------- Post anlegen (Einzel-Media) -------- */
    createPost: async (_: unknown, { input }: { input: CreatePostInput }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      await requireVerifiedEmail(ctx);
      await ensureTermsAccepted(ctx);
      await assertNotBanned(ctx);
      assertNoProfanity(input, ["text", "caption", "location","attachments[].caption"]);
      
      const looksVideo =
        (input.mime ?? "").startsWith("video/") ||
        /\.(mp4|mov|m4v|webm|avi)$/i.test(input.key);
      
      const interestLabels = toStringArray(
        (input as any).interestLabels ?? (input as any).interests ?? [],
        12
      );
      const resolvedLocation = await resolvePostLocationGeo({
        location: input.location,
        locationLat: (input as any).locationLat,
        locationLng: (input as any).locationLng,
      });

      const data: any = {
        kind: input.kind,
        authorId: ctx.profileId,
        caption: input.caption ?? null,
        location: resolvedLocation.location,
        locationLat: resolvedLocation.locationLat,
        locationLng: resolvedLocation.locationLng,
        imageKey: looksVideo ? null : input.key,
        videoKey: looksVideo ? input.key : null,
        thumbKey: input.thumbKey ?? null,

        interests: { set: interestLabels },
      };

      const post = await ctx.prisma.$transaction(async (tx) => {
        const created = await tx.post.create({ data, include: { author: true } });
        await indexPostContexts(tx as any, created.id, {
          location: resolvedLocation.location,
          caption: input.caption ?? null,
          interestLabels,
          taggedVlogIds: (input as any).taggedVlogIds ?? [],
        });

        await indexPostHashtags(tx as any, created.id, input.caption ?? null);

        const groupLinkId = (input as any).groupLinkId ? String((input as any).groupLinkId) : null;
        if (groupLinkId) {
          await attachGroupContextToPost(tx, created.id, groupLinkId, ctx.profileId!);
        }


        
        const editMeta = (input as any).editMeta ?? (input as any).edit ?? null;
        // ✅ Für SINGLE Posts ebenfalls PostMedia anlegen
        const media = await tx.postMedia.create({
          data: {
            postId: created.id,
            idx: 0,
            kind: looksVideo ? "VIDEO" : "IMAGE",
            key: input.key,
            thumbKey: (input as any).thumbKey ?? null,
            mime: input.mime ?? (looksVideo ? "video/mp4" : "image/jpeg"),
            width: (input as any).width ?? null,
            height: (input as any).height ?? null,
            durationS: (input as any).durationS ?? null,

            processStatus: looksVideo && editMeta ? "PENDING" : "NONE",
            edit: editMeta,

          },
        });

        // ✅ Job-Tabelle befüllen (wie bei Carousel)
        if (looksVideo && editMeta) {
          await tx.mediaProcessingJob.upsert({
            where: { mediaId: media.id },
            update: { status: "PENDING" },
            create: { mediaId: media.id, status: "PENDING" },
          });
        }
        // ✅ NEW: IMAGE Thumb-Job, falls kein thumbKey kommt
        if (!looksVideo && !(input as any).thumbKey) {
          await tx.mediaProcessingJob.upsert({
            where: { mediaId: media.id },
            update: { status: "PENDING" },
            create: { mediaId: media.id, status: "PENDING" },
          });

          await tx.postMedia.update({
            where: { id: media.id },
            data: { processStatus: "PENDING" }, // optional wenn du Status fürs UI willst
          });
        }

        // Personen-Tags (⛔️ nicht sich selbst; PENDING + Notify an Empfänger)
        if (input.taggedUserIds?.length) {
          const userIds = Array.from(new Set(input.taggedUserIds.filter(id => id !== ctx.profileId)));
          // Tags anlegen (idempotent)
          const existing = await tx.postTag.findMany({
            where: { postId: created.id, userId: { in: userIds } },
            select: { userId: true, status: true },
          });
          const existMap = new Map(existing.map(e => [e.userId, e.status]));

          const toCreate = userIds.filter(id => !existMap.has(id));
          if (toCreate.length) {
            await tx.postTag.createMany({
              data: toCreate.map(userId => ({ postId: created.id, userId, status: "PENDING", showOnProfile: false })),
              skipDuplicates: true,
            });
          }

          const toNotify = userIds.filter(id => existMap.get(id) !== "PENDING");
          for (const recipientId of toNotify) {
            await notify({
              prisma: tx as any,
              recipientId,
              kind: "POST_SHARE_REQUEST",
              channel: "ACTIVITY",
              fromUserId: ctx.profileId,
              actorId: ctx.profileId,
              postId: created.id,
              payload: { text: "Möchte einen Beitrag auf deinem Profil teilen." },
            });
            }
        }

        // Profil-Counter
        await tx.profile.update({
          where: { id: ctx.profileId! },
          data: input.kind === "POST"
            ? { postCount: { increment: 1 } }
            : { reelCount: { increment: 1 } },
        });

        if ((input as any).taggedVlogIds?.length) {
          const inputVlogIds = Array.from(
            new Set(((input as any).taggedVlogIds as string[]).filter(Boolean))
          );

          // ✅ nur Owner oder ACCEPTED Member
          await assertCanPostToVlogs(tx, inputVlogIds, ctx.profileId!);

          // ✅ Membership: immer ACCEPTED
          for (const vlogId of inputVlogIds) {
            await ensureMembership(tx, vlogId, ctx.profileId!, true);
          }

          // ✅ Tag: immer ACCEPTED (postCount++ nur wenn neu)
          for (const vlogId of inputVlogIds) {
            await acceptVlogTagImmediately(tx, vlogId, created.id);

            await notifyVlogMembersNewPost(tx, {
              vlogId,
              postId: created.id,
              actorId: ctx.profileId!,
              mediaKind: looksVideo ? "VIDEO" : "IMAGE",
            });
          }
          
        }




        return created;
      });

      //const imageUrl = post.imageKey ? await getSignedGetUrl(post.imageKey) : null;
      //const videoUrl = post.videoKey ? await getSignedGetUrl(post.videoKey) : null;
      //const thumbUrl = post.thumbKey ? await getSignedGetUrl(post.thumbKey) : null;

      const imageUrl = post.imageKey ? await signedGetCached(post.imageKey, 900) : null;
      const videoUrl = post.videoKey ? await signedGetCached(post.videoKey, 900) : null;
      const thumbUrl = post.thumbKey ? await signedGetCached(post.thumbKey, 900) : null;


      return { ...post, imageUrl, videoUrl, thumbUrl };
    },

    /* -------- Post anlegen (Carousel) -------- */
    createCarouselPost: async (_: unknown, { input }: { input: {
      caption?: string; location?: string; locationLat?: number | null; locationLng?: number | null;
      media: Array<{ idx: number; kind: "IMAGE"|"VIDEO"; key: string; thumbKey?: string|null; mime: string; width?: number|null; height?: number|null; durationS?: number|null; }>;
      groupLinkId?: string | null;
      taggedUserIds?: string[];
      taggedVlogIds?: string[];
    }}, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      await requireVerifiedEmail(ctx);
      await ensureTermsAccepted(ctx);await assertNotBanned(ctx);;
      if (!input.media?.length) throw new Error("Media required");
       assertNoProfanity(input, ["caption", "location"]);

      const first = input.media.slice().sort((a,b)=>a.idx-b.idx)[0];
      const resolvedLocation = await resolvePostLocationGeo({
        location: input.location,
        locationLat: (input as any).locationLat,
        locationLng: (input as any).locationLng,
      });

      const post = await ctx.prisma.$transaction(async (tx) => {
        const interestLabels = toStringArray(
          (input as any).interestLabels ?? (input as any).interests ?? [],
          12
        );
        const created = await tx.post.create({
          data: {
            kind: "POST",
            authorId: ctx.profileId!,
            caption: input.caption ?? null,
            location: resolvedLocation.location,
            locationLat: resolvedLocation.locationLat,
            locationLng: resolvedLocation.locationLng,
            imageKey: first.kind === "IMAGE" ? first.key : null,
            videoKey: first.kind === "VIDEO" ? first.key : null,
            thumbKey: first.thumbKey ?? null,

            interests: { set: interestLabels },
          },
          include: { author: true },
        });

        await indexPostContexts(tx as any, created.id, {
          location: resolvedLocation.location,
          caption: input.caption ?? null,
          interestLabels,
          taggedVlogIds: (input as any).taggedVlogIds ?? [],
        });

        await indexPostHashtags(tx as any, created.id, input.caption ?? null);

        const groupLinkId = (input as any).groupLinkId ? String((input as any).groupLinkId) : null;
        if (groupLinkId) {
          await attachGroupContextToPost(tx, created.id, groupLinkId, ctx.profileId!);
        }




        for (const m of input.media) {
          const editMeta = (m as any).edit ?? null;
          const media = await tx.postMedia.create({
            data: {
              postId: created.id,
              idx: m.idx,
              kind: m.kind,
              key: m.key,
              thumbKey: m.thumbKey ?? null,
              mime: m.mime,
              width: m.width ?? null,
              height: m.height ?? null,
              durationS: m.durationS ?? null,

              // ✅ NEU (kommt vom Client als m.edit)
              processStatus: m.kind === "VIDEO" && editMeta ? "PENDING" : "NONE",
              edit: editMeta,
            },
          });

        
          const normalizedKind =
              m.kind === "IMAGE" || m.kind === "VIDEO"
                ? m.kind
                : ((String(m.mime ?? "").startsWith("video/") ||
            /\.(mp4|mov|m4v|webm|avi)$/i.test(m.key)) ? "VIDEO" : "IMAGE");

            console.log(normalizedKind);

          // ✅ NEU: Job-Tabelle befüllen
          if (normalizedKind === "VIDEO" && editMeta) {
            await tx.mediaProcessingJob.upsert({
              where: { mediaId: media.id },
              update: { status: "PENDING" },
              create: { mediaId: media.id, status: "PENDING" },
            });
          }
          // ✅ NEW: IMAGE Thumb-Job, falls kein thumbKey kommt
          if (normalizedKind === "IMAGE" && !m.thumbKey) {
            await tx.mediaProcessingJob.upsert({
              where: { mediaId: media.id },
              update: { status: "PENDING" },
              create: { mediaId: media.id, status: "PENDING" },
            });

            await tx.postMedia.update({
              where: { id: media.id },
              data: { processStatus: "PENDING" }, // optional fürs UI
            });
          }

        }

        


        // Personen-Tags (PENDING + Notify; nicht self)
        if (input.taggedUserIds?.length) {
          const toTag = Array.from(new Set(input.taggedUserIds)).filter(id => id !== ctx.profileId);
          if (toTag.length) {
            await tx.postTag.createMany({
              data: toTag.map((id) => ({ postId: created.id, userId: id, status: "PENDING", showOnProfile: false })),
              skipDuplicates: true,
            });
            for (const uid of toTag) {
              await notify({
                prisma: tx as any,
                recipientId: uid,
                kind: "POST_SHARE_REQUEST",
                channel: "ACTIVITY",
                fromUserId: ctx.profileId,
                actorId: ctx.profileId,
                postId: created.id,
                payload: { type: "POST_TAG_REQUEST", status: "PENDING", text: "Jemand möchte dich in einem Beitrag markieren." },
              });
            }
          }
        }

        // Vlog-Tagging (Owner=ich → sofort ACCEPTED & ohne Notify; sonst PENDING & Notify)
        if ((input as any).taggedVlogIds?.length) {

          const inputVlogIds = Array.from(
            new Set(((input as any).taggedVlogIds as string[]).filter(Boolean))
          );

          // ✅ nur Owner oder ACCEPTED Member
          await assertCanPostToVlogs(tx, inputVlogIds, ctx.profileId!);

          // ✅ Membership: immer ACCEPTED
          for (const vlogId of inputVlogIds) {
            await ensureMembership(tx, vlogId, ctx.profileId!, true);
          }

          // ✅ Tag: immer ACCEPTED
          for (const vlogId of inputVlogIds) {
            await acceptVlogTagImmediately(tx, vlogId, created.id);

            await notifyVlogMembersNewPost(tx, {
              vlogId,
              postId: created.id,
              actorId: ctx.profileId!,
              mediaKind: "POST", // carousel = Beitrag (oder du bestimmst nach first.kind)
            });

          }

          
        }



        return created;
      });

      const imageUrl = post.imageKey ? await getSignedGetUrl(post.imageKey) : null;
      const videoUrl = post.videoKey ? await getSignedGetUrl(post.videoKey) : null;
      const thumbUrl = post.thumbKey ? await getSignedGetUrl(post.thumbKey) : null;

      return { ...post, imageUrl, videoUrl, thumbUrl };
    },

    /* -------- Post löschen -------- */
    deletePost: async (_: unknown, { id }: { id: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      await ctx.prisma.$transaction(async (tx) => {
        const post = await tx.post.findUnique({ where: { id }, select: {
          id: true,
          authorId: true,
          kind: true,
          imageKey: true,
          videoKey: true,
          thumbKey: true,
        }});
        if (!post) throw new Error("Not found");
        if (post.authorId !== ctx.profileId) throw new Error("Forbidden");

        // betroffene Vlogs ermitteln (Status wichtig)
        const tags = await tx.postVlogTag.findMany({
          where: { postId: id },
          select: { vlogId: true, status: true },
        });

        const acceptedVlogIds = Array.from(
          new Set(tags.filter(t => t.status === "ACCEPTED").map(t => t.vlogId))
        );

        // postCount-- nur für ACCEPTED
        await Promise.all(
          acceptedVlogIds.map(vlogId =>
            tx.vlog.update({ where: { id: vlogId }, data: { postCount: { decrement: 1 } } })
          )
        );

        // Assets löschen (außerhalb DB wäre ideal, aber ok)
        const keys: string[] = [];
        if (post.imageKey) keys.push(post.imageKey);
        if (post.videoKey) keys.push(post.videoKey);
        if (post.thumbKey) keys.push(post.thumbKey);
        if (keys.length) {
          await deleteObjects(keys);
          for (const k of keys) invalidateSignedUrl(k);
        }

        // Tags löschen, dann Post löschen
        await tx.postVlogTag.deleteMany({ where: { postId: id } });
        await tx.post.delete({ where: { id } });

        // Profil-Counter
        await tx.profile.update({
          where: { id: ctx.profileId },
          data: post.kind === "POST"
            ? { postCount: { decrement: 1 } }
            : { reelCount: { decrement: 1 } },
        });

        // memberCount nur für Vlogs, wo der Post ACCEPTED war
        for (const vlogId of acceptedVlogIds) {
          await removeMemberIfNoAcceptedPosts(tx, vlogId, post.authorId);
        }
      });

      return true;
    },




    /* -------- Likes -------- */
    likePost: async (_: unknown, { postId }: { postId: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      // ✅ Privacy/Block Guard
      await assertCanViewPost(ctx, postId);

  

      await ctx.prisma.$transaction(async (tx) => {
      const existing = await tx.like.findUnique({
        where: { userId_postId: { userId: ctx.profileId!, postId } },
        select: { userId: true },
      });

      // If already liked, do nothing (prevents double context lift on retries)
      if (existing) return;

      await tx.like.create({
        data: { userId: ctx.profileId!, postId },
      });
      await captureCommunityInteraction(tx, ctx.profileId!, postId);

      // Lift contexts from the post itself
      await applyLikeContextLift(tx as any, ctx.profileId!, postId, +1);

      // ✅ 2) NEW: Promote hashtag contexts only when interaction happens
      // (this is your "rooms arise from reactions" rule)
      await maybePromoteHashtagContexts(tx as any, postId);

      // Import a small slice of the author's top contexts (identity transfer)
      const p = await tx.post.findUnique({
        where: { id: postId },
        select: { authorId: true },
      });

      if (p?.authorId && p.authorId !== ctx.profileId) {
        await applyAuthorContextImportOnLike(tx as any, ctx.profileId!, p.authorId, { factor: 0.12, limit: 12 });
      }
    });



      // Empfänger ermitteln
      const post = await ctx.prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, authorId: true },
      });
      if (!post) throw new Error("Post not found");

      // ⛔️ KEINE Notification bei Self-Like
      if (post.authorId !== ctx.profileId) {
        await notify({
          prisma: ctx.prisma,
          channel: "ACTIVITY",
          kind: "LIKE",
          recipientId: post.authorId,
          fromUserId: ctx.profileId,
          postId,
          payload: {},
        });
      }

      // likeCount zurückgeben (je nach Schema Count oder persistentes Feld)
      const counted = await ctx.prisma.post.findUniqueOrThrow({
        where: { id: postId },
        include: { _count: { select: { likes: true } } },
      });
      return { id: counted.id, likeCount: counted._count.likes, isLiked: true, __typename: "Post" };
    },

    unlikePost: async (_: unknown, { postId }: { postId: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      await assertCanViewPost(ctx, postId);

      await ctx.prisma.$transaction(async (tx) => {
        const existing = await tx.like.findUnique({
          where: { userId_postId: { userId: ctx.profileId!, postId } },
          select: { userId: true },
        });
        if (!existing) return;

        await tx.like.delete({
          where: { userId_postId: { userId: ctx.profileId!, postId } },
        });

        await applyLikeContextLift(tx as any, ctx.profileId!, postId, -1);

        // ✅ optional: normalerweise NICHT "demote" bei unlike (wie du schon sagst)
        // (und hashtagPromotion NICHT bei unlike!)
      });

      const counted = await ctx.prisma.post.findUniqueOrThrow({
        where: { id: postId },
        include: { _count: { select: { likes: true } } },
      });

      return { id: counted.id, likeCount: counted._count.likes, isLiked: false, __typename: "Post" };
    },

    markPostViewed: async (_: unknown, { postId }: { postId: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const post = await ctx.prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, authorId: true },
      });
      if (!post) throw new Error("Post not found");

      await assertCanViewPost(ctx, postId);

      if (post.authorId !== ctx.profileId) {
        await ctx.prisma.$transaction(async (tx) => {
          const existing = await tx.postView.findUnique({
            where: { postId_viewerId: { postId, viewerId: ctx.profileId! } },
            select: { postId: true },
          });
          if (existing) {
            await tx.postView.update({
              where: { postId_viewerId: { postId, viewerId: ctx.profileId! } },
              data: { viewedAt: new Date(), count: { increment: 1 } },
            });
            await tx.post.update({
              where: { id: postId },
              data: { viewCount: { increment: 1 } },
            });
            return;
          }

          await tx.postView.create({
            data: { postId, viewerId: ctx.profileId!, count: 1 },
          });
          await tx.post.update({
            where: { id: postId },
            data: {
              viewCount: { increment: 1 },
              uniqueViewCount: { increment: 1 },
            },
          });
        });
      }

      return ctx.prisma.post.findUniqueOrThrow({
        where: { id: postId },
        include: { author: true },
      });
    },

    markProfileViewed: async (_: unknown, { profileId }: { profileId: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      if (!profileId || profileId === ctx.profileId) return true;

      const ok = await canViewProfileContent(ctx, profileId);
      if (!ok) return true;

      await ctx.prisma.profileView.upsert({
        where: {
          targetId_viewerId: {
            targetId: profileId,
            viewerId: ctx.profileId,
          },
        },
        update: { viewedAt: new Date(), seenAt: null },
        create: {
          targetId: profileId,
          viewerId: ctx.profileId,
        },
      });

      return true;
    },

    markProfileViewersSeen: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      await ctx.prisma.profileView.updateMany({
        where: {
          targetId: ctx.profileId,
          OR: [
            { seenAt: null },
            { seenAt: { lt: new Date() } },
          ],
        },
        data: { seenAt: new Date() },
      });
      return true;
    },


  

    /* -------- Personen-Tagging Opt‑in -------- */
    requestUserTag: async (_:unknown, { postId, userId }: { postId:string; userId:string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      if (ctx.profileId === userId) throw new Error("Cannot tag yourself");

      const post = await ctx.prisma.post.findUnique({ where: { id: postId } });
      if (!post) throw new Error("Not found");
      if (post.authorId !== ctx.profileId) throw new Error("Forbidden");

      await ctx.prisma.postTag.upsert({
        where: { postId_userId: { postId, userId } },
        update: { status: "PENDING", showOnProfile: false },
        create: { postId, userId, status: "PENDING", showOnProfile: false },
      });

      await notify({
        prisma: ctx.prisma as any,
        recipientId: userId,
        kind: "POST_SHARE_REQUEST",
        channel: "ACTIVITY",
        fromUserId: ctx.profileId,
        actorId: ctx.profileId,
        postId,
        payload: {
          type: "POST_TAG_REQUEST",
          status: "PENDING",
          text: "Jemand möchte dich in einem Beitrag markieren.",
        },
      });

      return true;
    },

      
    approvePostTag: async (_:unknown, { postId, userId }: { postId:string; userId:string }, ctx: Ctx) => {
      if (!ctx.profileId || ctx.profileId !== userId) throw new Error("Forbidden");

      await ctx.prisma.postTag.update({
        where: { postId_userId: { postId, userId } },
        data: { status: "ACCEPTED", showOnProfile: true },
      });

      // ✅ Request-Notification beim "getaggten" User (recipient) als handled markieren
      await setPostTagNotificationStatus(ctx.prisma, userId, postId, "ACCEPTED");

      // Autor benachrichtigen (optional)
      const post = await ctx.prisma.post.findUnique({ where: { id: postId } });
      if (post) {
        await notify({
          prisma: ctx.prisma as any,
          recipientId: post.authorId,
          kind: "POST_SHARE_APPROVED",
          channel: "INBOX",
          fromUserId: ctx.profileId,
          actorId: ctx.profileId,
          postId,
          payload: { type: "POST_TAG_APPROVED", text: "Markierung akzeptiert" },
        });
      }

      return true;
    },



    rejectPostTag: async (_:unknown, { postId, userId }: { postId:string; userId:string }, ctx: Ctx) => {
      if (!ctx.profileId || ctx.profileId !== userId) throw new Error("Forbidden");

      await ctx.prisma.postTag.update({
        where: { postId_userId: { postId, userId } },
        data: { status: "REJECTED", showOnProfile: false },
      });

      // ✅ Request-Notification beim "getaggten" User als handled markieren
      await setPostTagNotificationStatus(ctx.prisma, userId, postId, "REJECTED");

      const post = await ctx.prisma.post.findUnique({ where: { id: postId } });
      if (post) {
        await notify({
          prisma: ctx.prisma as any,
          recipientId: post.authorId,
          kind: "POST_SHARE_REJECTED",
          channel: "INBOX",
          fromUserId: ctx.profileId,
          actorId: ctx.profileId,
          postId,
          payload: { type: "POST_TAG_REJECTED", text: "Markierung abgelehnt" },
        });
      }
      return true;
    },


    setSharedPostOnProfile: async (_: any, _args: any, ctx: any) => {
      const { postId, show } = _args as { postId: string; show: boolean };
      if (!ctx.profileId) throw new Error("Not authenticated");

      const where = { postId_userId: { postId, userId: ctx.profileId } };

      const existing = await ctx.prisma.postTag.findUnique({
        where,
        select: { status: true },
      });
      if (!existing) throw new Error("Tag not found");
      if (existing.status !== "ACCEPTED") throw new Error("Tag not accepted");

      await ctx.prisma.postTag.update({
        where,
        data: { showOnProfile: show }, // ✅ NUR toggle, status bleibt wie er ist
      });

      return true;
    },


  },

  /* ──────────────────────────── Field Resolvers ─────────────────────────── */
  Post: {
    imageUrl: async (p: any) => {
      if (p.imageUrl) return p.imageUrl;
      if (p.imageKey) return await signedGetCached(p.imageKey, 900);
      return PLACEHOLDER;
    },
    videoUrl: async (p: any) => (p.videoKey ? signedGetCached(p.videoKey, 900) : null),

    thumbUrl: async (p: any) => {
      if (!p.thumbKey) return null;
      return await signedGetCached(p.thumbKey, 900);
    },
    

    likeCount: (parent: any, _: any, ctx: Ctx) =>
      ctx.prisma.like.count({ where: { postId: parent.id } }),

    viewCount: async (parent: any, _: any, ctx: Ctx) => {
      if (typeof parent.viewCount === "number") return parent.viewCount;
      const agg = await ctx.prisma.postView.aggregate({
        where: { postId: parent.id },
        _sum: { count: true },
      });
      return agg._sum.count ?? 0;
    },

    uniqueViewCount: async (parent: any, _: any, ctx: Ctx) => {
      if (typeof parent.uniqueViewCount === "number") return parent.uniqueViewCount;
      return ctx.prisma.postView.count({ where: { postId: parent.id } });
    },

    comments: async (parent: any, args: { offset?: number; limit?: number }, ctx: Ctx) => {
      const { offset = 0, limit = 20 } = args ?? {};

      // ✅ minimal: privacy + blocks greifen
      await assertCanViewPost(ctx, parent.id);

      return ctx.prisma.comment.findMany({
        where: { postId: parent.id },
        orderBy: { createdAt: "asc" },
        skip: Math.max(0, offset),
        take: Math.min(100, Math.max(1, limit)),
        include: { author: true, post: true },
      });
    },

    commentCount: async (parent: any, _args: any, ctx: Ctx) => {
      // Variante A (denormalisiert):
      if (typeof parent.commentCount === "number") return parent.commentCount;
      // Variante B (on the fly):
      return ctx.prisma.comment.count({ where: { postId: parent.id } });
    },

    isLiked: async (parent: any, _: any, ctx: Ctx) => {
      if (!ctx.profileId) return false;
      const like = await ctx.prisma.like.findUnique({
        where: { userId_postId: { userId: ctx.profileId, postId: parent.id } },
      });
      return !!like;
    },

    // ✅ Personen-Tags zurückgeben
    taggedUsers: async (p: { id: string }, _args: unknown, ctx: Ctx) => {
      await assertCanViewPost(ctx, p.id);

      const rows = await ctx.prisma.postTag.findMany({
        where: { postId: p.id, status: "ACCEPTED" },
        orderBy: { createdAt: "asc" },
        include: { user: true },
      });

      return rows
        .filter(r => r.user)
        .map(r => ({
          user: r.user,
          status: r.status,
          showOnProfile: r.showOnProfile,
          __typename: "TaggedUser",
        }));
    },

    communityContext: async (p: { id: string; communityContext?: any }, _args: unknown, ctx: Ctx) => {
      if (p.communityContext?.groupId) return p.communityContext;

      const row = await ctx.prisma.postContext.findFirst({
        where: {
          postId: p.id,
          source: "IMPORT",
          context: { key: { startsWith: "group:" } },
        },
        include: { context: true },
      });
      const groupId = row?.context?.key?.startsWith("group:")
        ? row.context.key.slice("group:".length)
        : null;
      if (!groupId) return null;

      const group = await ctx.prisma.groupLink.findUnique({
        where: { id: groupId },
        select: { id: true, title: true, type: true, slug: true, visibility: true },
      });
      if (!group) return null;

      return {
        groupId: group.id,
        title: group.title,
        type: group.type,
        visibility: group.visibility,
        slug: group.slug,
      };
    },



    // ✅ Vlogs (accepted & pending)
    taggedVlogs: (p: any, _args: unknown, ctx: Ctx) =>
     ctx.profileId
        ? ctx.prisma.vlog.findMany({
            where: {
              tags: { some: { postId: p.id, status: "ACCEPTED" } },
              OR: [
                { ownerId: ctx.profileId },
                { members: { some: { userId: ctx.profileId, status: "ACCEPTED" } } },
              ],
            },
          })
        : [],

    pendingVlogs: async (p:any, _a:unknown, ctx:Ctx) => {
      return [];
    },

    // 🔎 Nützlich für dein PostDetailScreen
    isMine: (p: any, _a: any, ctx: Ctx) => !!ctx.profileId && p.authorId === ctx.profileId,
    iAmTagged: async (p: any, _a: any, ctx: Ctx) => {
      if (!ctx.profileId) return false;
      const t = await ctx.prisma.postTag.findUnique({
        where: { postId_userId: { postId: p.id, userId: ctx.profileId } },
        select: { status: true },
      });
      return !!t && t.status !== "REJECTED";
    },
    iShowOnProfile: async (p: any, _a: any, ctx: Ctx) => {
      if (!ctx.profileId) return false;
      const t = await ctx.prisma.postTag.findUnique({
        where: { postId_userId: { postId: p.id, userId: ctx.profileId } },
        select: { showOnProfile: true },
      });
      return !!t?.showOnProfile;
    },
    acceptedVlogs: (p: any, _a: any, ctx: Ctx) =>
      ctx.profileId
        ? ctx.prisma.vlog.findMany({
            where: {
              tags: { some: { postId: p.id, status: "ACCEPTED" } },
              OR: [
                { ownerId: ctx.profileId },
                { members: { some: { userId: ctx.profileId, status: "ACCEPTED" } } },
              ],
            },
          })
        : [],

    hasAcceptedVlog: async (p: any, _a: any, ctx: Ctx) => {
      const c = await ctx.prisma.postVlogTag.count({
        where: { postId: p.id, status: "ACCEPTED" },
      });
      return c > 0;
    },
  },
  Comment
};

export default resolvers;
