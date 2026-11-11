import { visiblePostWhere } from "../lib/postVisibility";
// apps/server/src/resolvers/userResolvers.ts
import type { Ctx } from "../context";
import { getSignedPutUrl, getSignedGetUrl, deleteObjects, s3ObjectExists } from "../s3";
import crypto from "node:crypto";
import { getBlockedSets, userIdNotBlockedWhere, authorNotBlockedWhere } from "../lib/blocks";
import { assertNoProfanity } from "../graphql/profanity-guard";
import { normalizeUsername, validateUsernameOrThrow } from "../lib/username";
import { ensureTermsAccepted } from "../helpers/termsAccepted";
import { assertNotBanned } from "../lib/guards";
import { assertCanViewPost, canViewProfileContent } from "../lib/privacy";
import { GraphQLError } from "graphql";


const AVATAR_MAX_BYTES = Number(process.env.MAX_AVATAR_BYTES ?? 5 * 1024 * 1024);
const AVATAR_URL_TTL_SECONDS = 60 * 60 * 24 * 7; 
function isHttpUrl(s?: string | null) {
  return !!s && /^https?:\/\//i.test(s);
}
function looksLikeS3Key(s?: string | null) {
  return !!s && !isHttpUrl(s) && !s.startsWith("data:");
}

function deriveAvatarThumbKey(rawKey: string): string {
  // profiles/<id>/avatar-<uuid>.<ext>  -> profiles/<id>/avatar-<uuid>-thumb.jpg
  return rawKey.replace(/\.(png|jpg|jpeg|webp)$/i, "-thumb.jpg");
}

const isPresignedS3Url = (url: string) =>
  url.includes("X-Amz-Algorithm=") && url.includes("X-Amz-Signature=");

const extractKeyFromS3Url = (url: string) => {
  // funktioniert für virtual-hosted-style: https://bucket.s3.region.amazonaws.com/<key>?...
  try {
    const u = new URL(url);
    const key = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
    return key || null;
  } catch {
    return null;
  }
};


async function resolveAvatarUrl(raw?: string | null) {
  if (!raw) return null;
  if (isHttpUrl(raw)) return raw;
  if (looksLikeS3Key(raw)) {
    try { return await getSignedGetUrl(raw, AVATAR_URL_TTL_SECONDS); } catch { return null; }
  }
  return null;
}


const resolvers = {
  Query: {
    me: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.profileId) return null;

      const me = await ctx.prisma.profile.findUnique({
        where: { id: ctx.profileId },
        select: {
          id: true,
          username: true,
          name: true,
          avatarUrl: true,
          bio: true,
          createdAt: true,

          city: true,
          educationLevel: true,
          educationOrg: true,
          educationField: true,
          educationGradYear: true,
          interests: true,
          onboardingCompletedAt: true,

          // Terms
          termsVersionAccepted: true,
          termsAcceptedAt: true,

          // Zähler
          postCount: true,
          reelCount: true,
          followerCount: true,
          followingCount: true,

          // Primäres Profil-Flag
          isPrimary: true,

          // 🔴 Neu: Ban-Felder
          bannedUntil: true,
          bannedReason: true,

          // Für Profil-Switcher
          account: {
            select: {
              id: true,
              email: true,
              phoneNumber: true,
              emailVerifiedAt: true,
              phoneVerifiedAt: true,
              profiles: {
                select: { id: true, username: true, isPrimary: true, avatarUrl: true }
              },
            
            },
          },
        },
      });

      // Optionales Debugging
      // console.log("[me] bannedUntil:", me?.bannedUntil, "reason:", me?.bannedReason);

      return me;
    },

    checkUsernameAvailable: async (_: unknown, { username }: { username: string }, ctx: Ctx) => {
      const u = normalizeUsername(username);
      // Optional: früh invalid melden (spart DB-Call)
      try { validateUsernameOrThrow(u); } catch { return false; }
      const found = await ctx.prisma.profile.findUnique({ where: { username: u } });
      return !found;
    },


    searchUsers: async (
      _: unknown,
      {
        q,
        offset,
        limit,
      }: { q: string; offset?: number | null; limit?: number | null },
      ctx: Ctx
    ) => {
      const term = q.trim();
      if (!term) return [];
      const safeOffset = offset ?? 0;
      const safeLimit = limit ?? 20;

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);

      return ctx.prisma.profile.findMany({
        where: {
          // mich selbst raus
          id: ctx.profileId ? { not: ctx.profileId } : undefined,
          // geblockte raus
          ...userIdNotBlockedWhere(blockedByMe, blockedMe),
          // Suchkriterien
          OR: [
            { username: { contains: term, mode: "insensitive" } },
            { name: { contains: term, mode: "insensitive" } },
          ],
        },
        orderBy: { username: "asc" },
        skip: safeOffset,
        take: safeLimit,
      });
    },
    followers: async (
      _: unknown,
      { userId, offset, limit }: { userId: string; offset?: number | null; limit?: number | null },
      ctx: Ctx
    ) => {
      const safeOffset = offset ?? 0;
      const safeLimit = limit ?? 50;

      // 🔒 Private-Profil-Schutz (owner / follower / public)
      const ok = await canViewProfileContent(ctx, userId);
      if (!ok) throw new GraphQLError("Forbidden", {
        extensions: { code: "FORBIDDEN" },
      });

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);

      const rows = await ctx.prisma.follow.findMany({
        where: {
          followingId: userId,
          follower: {
            ...userIdNotBlockedWhere(blockedByMe, blockedMe),
          },
        },
        orderBy: { createdAt: "desc" },
        skip: safeOffset,
        take: safeLimit,
        select: {
          follower: {
            select: {
              id: true,
              username: true,
              name: true,
              avatarUrl: true,
              bio: true,
              createdAt: true,
              accountId: true,
              isPrivate: true,
              isPrimary: true,
              followerCount: true,
              followingCount: true,
              termsVersionAccepted: true,
              termsAcceptedAt: true,
            },
          },
        },
      });

      return rows.map((r) => r.follower);
    },

    following: async (
      _: unknown,
      { userId, offset, limit }: { userId: string; offset?: number | null; limit?: number | null },
      ctx: Ctx
    ) => {
      const safeOffset = offset ?? 0;
      const safeLimit = limit ?? 50;

      // 🔒 Private-Profil-Schutz
      const ok = await canViewProfileContent(ctx, userId);
      if (!ok) throw new GraphQLError("Forbidden", {
        extensions: { code: "FORBIDDEN" },
      });

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);

      const rows = await ctx.prisma.follow.findMany({
        where: {
          followerId: userId,
          following: {
            ...userIdNotBlockedWhere(blockedByMe, blockedMe),
          },
        },
        orderBy: { createdAt: "desc" },
        skip: safeOffset,
        take: safeLimit,
        select: {
          following: {
            select: {
              id: true,
              username: true,
              name: true,
              avatarUrl: true,
              bio: true,
              createdAt: true,
              accountId: true,
              isPrivate: true,
              isPrimary: true,
              followerCount: true,
              followingCount: true,
              termsVersionAccepted: true,
              termsAcceptedAt: true,
            },
          },
        },
      });

      return rows.map((r) => r.following);
    },



    meMini: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.profileId) return null;
      return ctx.prisma.profile.findUnique({
        where: { id: ctx.profileId },
      });
    },
  },

  Mutation: {
    getSignedAvatarUpload: async (
      _: unknown,
      { mime, size }: { mime: string; size: number },
      ctx: Ctx
    ) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      if (!mime?.startsWith("image/")) throw new Error("Only images allowed");
      if (size > AVATAR_MAX_BYTES) throw new Error("File too large");

      const ext =
        mime === "image/png" ? "png" :
        mime === "image/webp" ? "webp" : "jpg";

      const key = `profiles/${ctx.profileId}/avatar-${crypto.randomUUID()}.${ext}`;
      const putUrl = await getSignedPutUrl(key, mime);
      return { key, putUrl };
    },
    setProfilePrivate: async (_: unknown, { isPrivate }: { isPrivate: boolean }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      await ensureTermsAccepted(ctx);
      await assertNotBanned(ctx);

      await ctx.prisma.profile.update({
        where: { id: ctx.profileId },
        data: { isPrivate: !!isPrivate },
      });

      return true;
    },
    registerPushToken: async (_: unknown, { token }: { token: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      if (!token || typeof token !== "string") return false;

      await ctx.prisma.profile.update({
        where: { id: ctx.profileId },
        data: {
          pushToken: token,
          pushTokenUpdatedAt: new Date(),
        },
      });

      return true;
    },
    updateMe: async (_: unknown, { input }: {
    input: { name?: string; username?: string; bio?: string; avatarUrl?: string; };
    }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      // 🔐 Profanity-Check auf frei eingegebene Textfelder (ohne username – der wird separat streng validiert)
      assertNoProfanity(input, ["name", "bio"]);

      // 🔤 Username normalisieren & validieren, falls übergeben
      let normalizedUsername: string | undefined = undefined;
      if (typeof input.username === "string") {
        normalizedUsername = normalizeUsername(input.username);
        validateUsernameOrThrow(normalizedUsername);

        // Einzigartigkeit gegen den NORMALISIERTEN Wert prüfen
        const taken = await ctx.prisma.profile.findUnique({ where: { username: normalizedUsername } });
        if (taken && taken.id !== ctx.profileId) throw new Error("Benutzername bereits vergeben.");
      }

      // altes Avatar merken (für evtl. Cleanup)
      const before = await ctx.prisma.profile.findUnique({
        where: { id: ctx.profileId }, select: { avatarUrl: true }
      });

      const updated = await ctx.prisma.profile.update({
        where: { id: ctx.profileId },
        data: {
          name: input.name ?? undefined,
          username: normalizedUsername ?? undefined,      // ⬅️ nur den normalisierten Wert speichern
          bio: input.bio ?? undefined,
          avatarUrl: input.avatarUrl ?? undefined,        // http-URL ODER S3-Key
        },
      });
      
      // ✅ Avatar-Thumb Job anstoßen (nur bei echten Uploads / S3 keys)
      if (input.avatarUrl && looksLikeS3Key(input.avatarUrl)) {
        await ctx.prisma.avatarProcessingJob.upsert({
          where: { profileId: ctx.profileId },
          update: { status: "PENDING", lastError: null },
          create: { profileId: ctx.profileId, status: "PENDING" },
        });
      }


      if (looksLikeS3Key(before?.avatarUrl) && before!.avatarUrl !== updated.avatarUrl) {
        try {
          await deleteObjects([
            before!.avatarUrl!,
            deriveAvatarThumbKey(before!.avatarUrl!), // optional, aber empfohlen
          ]);
        } catch {}
      }

      return updated;
    },



    follow: async (_: unknown, { userId }: { userId: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      if (ctx.profileId === userId) return true;

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      if (blockedByMe.has(userId)) throw new Error("Cannot follow a user you blocked.");
      if (blockedMe.has(userId)) throw new Error("This user has blocked you.");

      await ctx.prisma.$transaction(async (tx:any) => {
        await tx.follow.upsert({
          where: {
            followerId_followingId: {
              followerId: ctx.profileId!,
              followingId: userId,
            },
          },
          update: {},
          create: { followerId: ctx.profileId!, followingId: userId },
        });
        await tx.profile.update({
          where: { id: ctx.profileId! },
          data: { followingCount: { increment: 1 } },
        });
        await tx.profile.update({
          where: { id: userId },
          data: { followerCount: { increment: 1 } },
        });
      });

      return true;
    },


    unfollow: async (_: unknown, { userId }: { userId: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      if (ctx.profileId === userId) return true;

      await ctx.prisma.$transaction(async (tx:any) => {
        const deleted = await tx.follow.deleteMany({
          where: { followerId: ctx.profileId!, followingId: userId },
        });
        if (deleted.count > 0) {
          await tx.profile.update({
            where: { id: ctx.profileId! },
            data: { followingCount: { decrement: 1 } },
          });
          await tx.profile.update({
            where: { id: userId },
            data: { followerCount: { decrement: 1 } },
          });
        }
      });

      return true;
    },
  },

  
  // GraphQL-Typ heißt weiterhin "User", das zugrunde liegende Prisma-Model ist "profile"
  User: {
    isPrivate: (u: any) => !!u.isPrivate,
    async avatarUrl(u: any, _: unknown, __: Ctx) {
      const raw = u.avatarUrl as string | null | undefined;
      if (!raw) return null;
      if (isHttpUrl(raw)) {
        if (isPresignedS3Url(raw)) {
          const key = extractKeyFromS3Url(raw);
          if (key) return await getSignedGetUrl(key, AVATAR_URL_TTL_SECONDS);
        }
        return raw;          // bereits öffentlich
      }
      if (looksLikeS3Key(raw)) {
        try { return await getSignedGetUrl(raw, AVATAR_URL_TTL_SECONDS); } catch { return null; }
      }
      return null;
    },
    async avatarThumbUrl(u: any, _: unknown, ctx: Ctx) {
      const raw = u.avatarUrl as string | null | undefined;
      if (!raw) return null;

      if (isHttpUrl(raw)) {
        if (isPresignedS3Url(raw)) {
          const key = extractKeyFromS3Url(raw);
          if (key) return await getSignedGetUrl(key, AVATAR_URL_TTL_SECONDS);
        }
        return raw;
      }


      if (looksLikeS3Key(raw)) {
        const thumbKey = deriveAvatarThumbKey(raw);

        const thumbExists = await s3ObjectExists(thumbKey).catch(() => false);
        if (thumbExists) return await getSignedGetUrl(thumbKey, AVATAR_URL_TTL_SECONDS);

        return await getSignedGetUrl(raw, AVATAR_URL_TTL_SECONDS);
      }

      return null;
    },




    followRequested: async (p: any, _: any, ctx: Ctx) => {
      const me = ctx.profileId;
      if (!me || me === p.id) return false;

      const req = await ctx.prisma.followRequest.findUnique({
        where: {
          requesterId_targetId: {
            requesterId: me,
            targetId: p.id,
          },
        },
        select: { requesterId: true },
      });

      return !!req;
    },

    sharedCommunities: async (u: any, { limit = 6 }: { limit?: number }, ctx: Ctx) => {
      const me = ctx.profileId;
      if (!me || !u?.id || me === u.id) return [];

      const take = Math.min(20, Math.max(1, Number(limit) || 6));

      const [myMemberRows, theirMemberRows, myOwnedRows, theirOwnedRows] = await Promise.all([
        ctx.prisma.groupLinkMember.findMany({
          where: { profileId: me },
          select: { groupLinkId: true },
        }),
        ctx.prisma.groupLinkMember.findMany({
          where: { profileId: u.id },
          select: { groupLinkId: true },
        }),
        ctx.prisma.groupLink.findMany({
          where: { ownerId: me, isActive: true },
          select: { id: true },
        }),
        ctx.prisma.groupLink.findMany({
          where: { ownerId: u.id, isActive: true },
          select: { id: true },
        }),
      ]);

      const mine = new Set([
        ...myMemberRows.map((row) => row.groupLinkId),
        ...myOwnedRows.map((row) => row.id),
      ]);
      const theirs = new Set([
        ...theirMemberRows.map((row) => row.groupLinkId),
        ...theirOwnedRows.map((row) => row.id),
      ]);
      const sharedIds = Array.from(mine).filter((id) => theirs.has(id)).slice(0, take);
      if (!sharedIds.length) return [];

      return ctx.prisma.groupLink.findMany({
        where: { id: { in: sharedIds }, isActive: true },
        orderBy: { createdAt: "desc" },
      });
    },

    account: (u: any, _: unknown, ctx: Ctx) => {
      if (u.account) {
        // Falls im Payload schon `account` drin ist
        return u.account;
      }
      if (!u.accountId) return null;
      return ctx.prisma.account.findUnique({
        where: { id: u.accountId },
      });
    },
    isMe: (u: any, _: unknown, ctx: Ctx) =>
      !!ctx.profileId && ctx.profileId === u.id,

    isAdmin: (u: any, _: unknown, ctx: Ctx) =>
      !!ctx.profileId && ctx.profileId === u.id && !!ctx.isAdmin,

    totalLikeCount: async (u: any, _: unknown, ctx: Ctx) => {
      if (!u?.id) return 0;
      return ctx.prisma.like.count({
        where: {
          post: {
            authorId: u.id,
          },
        },
      });
    },


    isFollowing: async (u: any, _: unknown, ctx: Ctx) => {
      if (!ctx.profileId) return false;
      if (ctx.profileId === u.id) return false;

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      if (blockedByMe.has(u.id) || blockedMe.has(u.id)) return false;

      const row = await ctx.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: ctx.profileId,
            followingId: u.id,
          },
        },
        select: { followerId: true },
      });
      return !!row;
    },


    posts: async (parent: { id: string }, _: unknown, ctx: Ctx) => {
      const me = ctx.profileId ?? null;

      if (me) {
        const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
        // Wenn ich den Profilinhaber blocke oder er mich, keine Posts liefern
        if (blockedByMe.has(parent.id) || blockedMe.has(parent.id)) return [];
      }

      return ctx.prisma.post.findMany({
        where: { AND: [visiblePostWhere(ctx), {
          authorId: parent.id,
          // (Optional zusätzlicher Schutz – falls jemand Fremdposts hier einschleust)
          ...(me
            ? (() => {
                // authorNotBlockedWhere müsste hier immer true sein, da authorId === parent.id
                // aber belassen wir als Absicherung (no-op, wenn nicht geblockt)
                return {};
              })()
            : {}),
        }] },
        include: { author: true },
      });
    },


    // user.resolvers.ts
    postCount: async (user: any, _: any, ctx: Ctx) => {
      const ok = await canViewProfileContent(ctx, user.id);
      if (!ok) return ctx.prisma.post.count({
        where: { AND: [visiblePostWhere(ctx), { authorId: user.id, hideFromGrid: false }] },
      });

      const targetId = user.id;          // Profil, dessen Count wir berechnen
      const viewerId = ctx.profileId ?? null; // aktueller eingeloggter User

      // Blocks: wenn Viewer und Target gegenseitig blockiert → 0
      if (viewerId) {
        const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
        if (blockedByMe.has(targetId) || blockedMe.has(targetId)) return 0;
      }

      // A) eigene normale Posts (nicht im Vlog)
      const ownNormal = await ctx.prisma.post.count({
        where: { AND: [visiblePostWhere(ctx), {
          authorId: targetId,
          tagsVlogs: { none: {} },
        }] },
      });

      // B) Posts anderer, in denen target getaggt ist (sonst doppelt)
      const taggedInOthers = await ctx.prisma.post.count({
        where: { AND: [visiblePostWhere(ctx), {
          authorId: { not: targetId },
          tags: { some: { userId: targetId, status: "ACCEPTED" } },
        }] },
      });
      return ownNormal + taggedInOthers;
    },





    reelCount: async (user: any, _: any, ctx: Ctx) => {
      const ok = await canViewProfileContent(ctx, user.id);
      if (!ok) return 0;

      return ctx.prisma.post.count({
        where: { AND: [visiblePostWhere(ctx), {
          authorId: user.id,
          OR: [
            { kind: "REEL" as any },
            { tagsVlogs: { some: { status: "ACCEPTED" } } },
          ],
        }] },
      });
    },

    connectionCount: async (u: any, _: any, ctx: Ctx) => {
      const rows = await ctx.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "Connection" c
        WHERE c."fromId" = ${u.id}
          AND c."groupLinkId" IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM "GroupLinkMember" m
            WHERE m."groupLinkId" = c."groupLinkId"
              AND m."profileId" = c."fromId"
          )
          AND EXISTS (
            SELECT 1
            FROM "GroupLinkMember" m
            WHERE m."groupLinkId" = c."groupLinkId"
              AND m."profileId" = c."toId"
          )
      `;
      return Number(rows[0]?.count ?? 0);
    },







    tagged: async (user: { id: string }, args: { offset?: number; limit?: number }, ctx: Ctx) => {
      const me = ctx.profileId;
      if (!me) throw new Error("Not authenticated");

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      if (blockedByMe.has(user.id) || blockedMe.has(user.id)) return [];

      // Kandidaten + OWNER-CHECK (owner = user.id)
      const posts = await ctx.prisma.post.findMany({
        where: { AND: [visiblePostWhere(ctx), {
          tags: { some: { userId: user.id, status: "ACCEPTED" } },
          AND: [
            {
              OR: [
                { author: { isPrivate: false } },
                { authorId: user.id },
                {
                  author: {
                    isPrivate: true,
                    followers: { some: { followerId: user.id } }, // owner folgt author
                  },
                },
              ],
            },
          ],
        }] },
        orderBy: { createdAt: "desc" },
        skip: args.offset ?? 0,
        take: args.limit ?? 12,
        include: { author: true },
      });

      // Viewer-Check (viewer = ctx.profileId)
      const out: any[] = [];
      for (const p of posts) {
        try { await assertCanViewPost(ctx, p.id); out.push(p); } catch {}
      }
      return out;
    },},

};

export default resolvers;
