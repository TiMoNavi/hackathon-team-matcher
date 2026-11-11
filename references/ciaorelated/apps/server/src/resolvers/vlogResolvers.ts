import { visiblePostWhere } from "../lib/postVisibility";
// apps/server/src/resolvers/vlogResolvers.ts
import type { Ctx } from "../context";

import { getSignedGetUrlCached } from "../s3_cached";
import { notify } from "../lib/notify";
import { ForbiddenError, UserInputError } from "apollo-server-errors";
import { removeMemberIfNoAcceptedPosts, ensureMember } from "../helpers/vlogMembership";
import { ensureTermsAccepted } from "../helpers/termsAccepted";
import { getBlockedSets, authorNotBlockedWhere } from "../lib/blocks";
import { assertNotBanned } from "../lib/guards";
import { notBannedAuthor, notBannedOwner } from "../lib/notBanned";
import { assertNoProfanity } from "../graphql/profanity-guard";
import { canViewProfileContent } from "../lib/privacy";
import { setVlogTagNotificationStatus } from "../lib/notificationStatus";
import { deleteObjects, getSignedGetUrl } from "../s3";
import { normalizeSlug } from "../lib/slug";

const PLACEHOLDER = "https://via.placeholder.com/1200x800?text=Vlog";
function isHttpUrl(s: string) {
  return /^https?:\/\//i.test(s);
}

function looksLikeS3Key(s: string) {
  return s.includes("/") && !s.includes(" ");
}
function coverKeyToThumb(key: string) {
  // wenn du beim Upload eine 320px-Variante speicherst:
  // z.B. original: covers/<id>.jpg  → thumb: covers/<id>_320.jpg
  return key.replace(/(\.\w+)$/, "_320$1");
}
async function assertUniqueVlogSlug(prisma: any, slug: string, excludeId?: string) {
  const hit = await prisma.vlog.findFirst({
    where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (hit) throw new Error("Slug already taken");
}

// Helper: signed cover + edge bauen
async function buildVlogEdge(ctx: Ctx, v: any, distanceKm?: number | null) {
  let coverUrl: string | null = null;
  let coverThumbUrl: string | null = null;

  if (v.coverKey) {
    const ok = await canSeeCover(ctx, v.id, v.privacy, v.ownerId);
    if (ok) {
      try {
        [coverUrl, coverThumbUrl] = await Promise.all([
          getSignedGetUrlCached(v.coverKey),
          getSignedGetUrlCached(coverKeyToThumb(v.coverKey)),
        ]);
      } catch {}
    }
  }

  return {
    id: v.id,
    slug: v.slug,
    title: v.title,
    description: v.description,
    privacy: v.privacy,
    memberCount: v.memberCount,
    postCount: v.postCount,
    coverUrl: coverUrl ?? PLACEHOLDER,
    coverThumbUrl: coverThumbUrl ?? PLACEHOLDER,
    owner: v.owner,
    updatedAt: v.updatedAt ?? v.createdAt ?? new Date(0),
    // optional: nur befüllt, wenn z. B. vlogsNear
    distanceKm: typeof distanceKm === "number" ? distanceKm : null,
    lat: v.lat ?? null,
    lng: v.lng ?? null,
    __typename: "VlogEdge",
  };
}


function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
/**
 * Helper: prüft, ob ctx.profileId OWNER/ADMIN des Vlogs ist
 */
async function assertVlogAdmin(prisma: Ctx["prisma"], vlogId: string, me: string) {
  const v = await prisma.vlog.findUnique({
    where: { id: vlogId },
    select: { ownerId: true },
  });
  if (!v) throw new Error("Not found");
  if (v.ownerId === me) return; // 👈 Owner darf immer

  const m = await prisma.vlogMember.findUnique({
    where: { vlogId_userId: { vlogId, userId: me } },
    select: { role: true, status: true },
  });

  if (!m || m.status !== "ACCEPTED" || (m.role !== "OWNER" && m.role !== "ADMIN")) {
    throw new ForbiddenError("Not allowed"); // 👈 liefert extensions.code=FORBIDDEN
  }
}
async function canSeeCover(ctx: Ctx, vlogId: string, vlogPrivacy: string, ownerId: string) {
  const me = ctx.profileId ?? null;
  if (!me) return false;
  if (ownerId === me) return true;
  return isAcceptedMember(ctx.prisma, vlogId, me);
}

function requireProfileId(ctx: Ctx): string {
  const id = ctx.profileId;
  if (!id) throw new Error("Not authenticated");
  return id;
}

/**
 * Helper: prüft, ob ctx.profileId Mitglied (ACCEPTED) ist
 */
async function isAcceptedMember(prisma: Ctx["prisma"], vlogId: string, me?: string | null) {
  if (!me) return false;
  const m = await prisma.vlogMember.findUnique({
    where: { vlogId_userId: { vlogId, userId: me } },
    select: { status: true },
  });
  return !!m && m.status === "ACCEPTED";
}
function requireMe(ctx: Ctx): string {
  if (!ctx.profileId) throw new Error("Not authenticated");
  return ctx.profileId; // garantiert string
}



const resolvers = {
  
  Query: {
    vlogMembers: async (_: unknown, { vlogId }: { vlogId: string }, ctx: Ctx) => {
      const me = requireMe(ctx);
      await assertVlogAdmin(ctx.prisma, vlogId, me);

      return ctx.prisma.vlogMember.findMany({
        where: { vlogId },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        include: {
          vlog: { include: { owner: { select: { id: true, username: true, avatarUrl: true } } } },
          user: true,
        },
      });
    },
    // Cursor-Feed für Vlogs (public + meine privaten)
    vlogsFeed: async (_:unknown, { limit = 20, cursor }: any, ctx: Ctx) => {
      const take = Math.min(50, Math.max(1, limit));
      const me = ctx.profileId ?? null;
      if (!me) {
        return { edges: [], nextCursor: null, __typename: "VlogConnection" };
      }


      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hiddenOwners = new Set([...blockedByMe, ...blockedMe]);
      const now = new Date();

      const rows = await ctx.prisma.vlog.findMany({
        where: {
          ...notBannedOwner(now),
          OR: [
            { ownerId: me },
            { members: { some: { userId: me, status: "ACCEPTED" } } },
          ],
        },
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: { owner: { select: { id:true, username:true, avatarUrl:true } } },
      });

      const safe = rows.filter(v => !hiddenOwners.has(v.ownerId));
      const edges = await Promise.all(safe.map(v => buildVlogEdge(ctx, v)));
      const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;
      return { edges, nextCursor, __typename: "VlogConnection" };
    },



    vlogsICanPostTo: async (_:unknown, __:unknown, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      
      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hidden = new Set([...blockedByMe, ...blockedMe]);

      const now = new Date();

      const asOwner = await ctx.prisma.vlog.findMany({
        where: { ownerId: ctx.profileId, ...notBannedOwner(now) },
        orderBy: { createdAt: "desc" },
      });
      const asMember = await ctx.prisma.vlog.findMany({
       where: {
          ...notBannedOwner(now),
          members: { some: { userId: ctx.profileId, status: "ACCEPTED" } },
        },
        orderBy: { createdAt: "desc" },
      });

      const map = new Map<string, any>();
      for (const v of [...asOwner, ...asMember]) {
        if (!hidden.has(v.ownerId)) map.set(v.id, v);
      }
      return Array.from(map.values());
    },


    myVlogPosts: async (
      _: unknown,
      { userId, offset = 0, limit = 24 }: { userId: string; offset?: number; limit?: number },
      ctx: Ctx
    ) => {
      const ok = await canViewProfileContent(ctx, userId);
      if (!ok) return [];
      // Wenn Viewer und Autor geblockt sind → keine Ergebnisse
      const now = new Date();
      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      if (blockedByMe.has(userId) || blockedMe.has(userId)) return [];

      return ctx.prisma.post.findMany({
        where: { AND: [visiblePostWhere(ctx), {
          authorId: userId,
          tagsVlogs: { some: { status: "ACCEPTED" } },
          ...notBannedAuthor(now),
          // authorId ist schon fest → authorNotBlockedWhere wäre no-op
        }] },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: { author: true },
      });
    },

  

    // Detail: via slug
    vlogBySlug: async (_:unknown, { slug }: { slug: string }, ctx: Ctx) => {
      const now = new Date();
      const v = await ctx.prisma.vlog.findUnique({
        where: {
          slug,
          ...notBannedOwner(now),
        },
        include: { owner: { select: { id:true, username:true, avatarUrl:true } } },
      });
      if (!v) return null;

      const me = ctx.profileId ?? null;
      if (!me) return null;
      if (v.ownerId !== me) {
        const m = await ctx.prisma.vlogMember.findUnique({
          where: { vlogId_userId: { vlogId: v.id, userId: me } },
          select: { status: true },
        });
        if (!m || m.status !== "ACCEPTED") return null;
      }

      

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      if (blockedByMe.has(v.ownerId) || blockedMe.has(v.ownerId)) return null;

      return v;
    },


    // Meine Vlogs (Mitglied) – akzeptiert
    myVlogs: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const now = new Date();
      const rows = await ctx.prisma.vlog.findMany({
        where: {
          ...notBannedOwner(now),
          OR: [
            { ownerId: ctx.profileId },
            { members: { some: { userId: ctx.profileId, status: "ACCEPTED" } } },
          ],
        },
        orderBy: { createdAt: "desc" },
        include: { owner: { select: { id: true, username: true, avatarUrl: true } } },
      });

      // gleiche Kanten-Form wie vlogsFeed / vlogsSearch
      const edges = await Promise.all(rows.map((v) => buildVlogEdge(ctx, v)));
      return edges; // Array von { id, slug, title, description, coverUrl, privacy, memberCount, postCount, owner, __typename: "VlogEdge" }
    },

    // Posts eines Vlogs (nur wenn public oder Mitglied)
    vlogPosts: async (_:unknown, { vlogId, offset = 0, limit = 20 }: any, ctx: Ctx) => {
      const me = ctx.profileId ?? null;

      const vlog = await ctx.prisma.vlog.findUnique({
        where: { id: vlogId },
        select: { id: true, privacy: true, ownerId: true },
      });
      if (!vlog) return [];

      // ✅ PRIVATE-ONLY Gate
      if (!me) return [];
      if (vlog.ownerId !== me) {
        const m = await ctx.prisma.vlogMember.findUnique({
          where: { vlogId_userId: { vlogId, userId: me } },
          select: { status: true },
        });
        if (!m || m.status !== "ACCEPTED") return [];
      }

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const now = new Date();

      return ctx.prisma.post.findMany({
        where: { AND: [visiblePostWhere(ctx), {
          tagsVlogs: { some: { vlogId, status: "ACCEPTED" } },
          ...authorNotBlockedWhere(blockedByMe, blockedMe),
          ...notBannedAuthor(now),
        }] },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: Math.min(60, limit),
        include: { author: true },
      });
    },



    pendingVlogTagsByMe: async (_:unknown, { offset = 0, limit = 30 }: any, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      const now = new Date();
      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hidden = new Set([...blockedByMe, ...blockedMe]);

      const myVlogIds = await ctx.prisma.vlog.findMany({
        where: { ownerId: ctx.profileId },
        select: { id: true },
      }).then((r:any) => r.map((x:any) => x.id));

      if (myVlogIds.length === 0) return [];

      const rows = await ctx.prisma.postVlogTag.findMany({
        where: { vlogId: { in: myVlogIds }, status: "PENDING", post: { ...notBannedAuthor(now) }, },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: Math.min(100, limit),
        include: {
          post: { include: { author: true } },
          vlog: { select: { id: true, title: true, slug: true } },
        },
      });

      return rows.filter(r => !r.post?.authorId || !hidden.has(r.post.authorId));
    },


    vlogsSearch: async (
      _: any,
      { q, limit = 50, canPostToOnly = false }: { q: string; limit?: number; canPostToOnly?: boolean },
      ctx: Ctx
    ) => {
      const query = (q ?? "").trim();
      if (!query) return { edges: [], nextCursor: null, __typename: "VlogConnection" };

      const take = Math.min(50, Math.max(1, limit));
      const me = ctx.profileId ?? null;
      if (!me) return { edges: [], nextCursor: null, __typename: "VlogConnection" };
      const now = new Date();

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hiddenOwners = new Set([...blockedByMe, ...blockedMe]);

      // Basis: Textsuche + ban filter
      const whereBase: any = {
        AND: [
          {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { slug: { contains: query, mode: "insensitive" } },
              { owner: { username: { contains: query, mode: "insensitive" } } },
            ],
          },
          {
            ...notBannedOwner(now),
          },
        ],
      };


      // Sichtbarkeit: public ODER owner=me ODER accepted member=me
      const whereVisibility: any = {
        OR: [
          { ownerId: me },
+         { members: { some: { userId: me, status: "ACCEPTED" } } },
        ],
      };

      // Optional: "canPostToOnly" -> nur Vlogs wo ich owner oder accepted member bin
      const whereCanPostToOnly: any =
        canPostToOnly
          ? {
              OR: [
                { ownerId: me },
                { members: { some: { userId: me, status: "ACCEPTED" } } },
              ],
            }
          : null;

      const where: any = whereCanPostToOnly
        ? { AND: [whereBase, whereVisibility, whereCanPostToOnly] }
        : { AND: [whereBase, whereVisibility] };

      const rows = await ctx.prisma.vlog.findMany({
        where,
        take,
        orderBy: [{ title: "asc" }, { id: "asc" }],
        include: { owner: { select: { id: true, username: true, avatarUrl: true } } },
      });

      // Block filter (zusätzlich, falls OR/Join irgendwo durchrutscht)
      const safe = rows.filter(v => !hiddenOwners.has(v.ownerId));

      const edges = await Promise.all(safe.map((v: any) => buildVlogEdge(ctx, v)));
      return { edges, nextCursor: null, __typename: "VlogConnection" };
    },



    // 📍 Nearby/Radar – Bounding Box + Haversine-Filter, nach Distanz sortiert
    vlogsNear: async (_:unknown, { lat, lng, radiusKm = 50, limit = 50 }: { lat:number; lng:number; radiusKm?:number; limit?:number }, ctx: Ctx) => {
      const me = ctx.profileId ?? null;
      if (!me) return { edges: [], nextCursor: null, __typename: "VlogConnection" };
      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hiddenOwners = new Set([...blockedByMe, ...blockedMe]);
      const now = new Date();
      const candidates = await ctx.prisma.vlog.findMany({
        where: {
          ...notBannedOwner(now),
          lat: { not: null },
          lng: { not: null },
          OR: [
            { ownerId: me },
            { members: { some: { userId: me, status: "ACCEPTED" } } },
          ],
        },
        take: 500,
        include: { owner: { select: { id:true, username:true, avatarUrl:true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });

      const filteredOwners = candidates.filter(v => !hiddenOwners.has(v.ownerId));

      const edgesRaw = [];
      for (const v of filteredOwners) {
        const d = haversineKm(lat, lng, v.lat as number, v.lng as number);
        if (d <= radiusKm) edgesRaw.push(await buildVlogEdge(ctx, v, d));
      }

      edgesRaw.sort((a:any,b:any)=> (a.distanceKm ?? 9e9) - (b.distanceKm ?? 9e9));
      const edges = edgesRaw.slice(0, Math.max(1, Math.min(limit, 200)));
      return { edges, nextCursor: null, __typename: "VlogConnection" };
    },

    reelsVlogs: async (
      _: unknown,
      { limit = 40, days = 30 }: { limit?: number; days?: number },
      ctx: Ctx
    ) => {
      const me = ctx.profileId ?? null;
      if (!me) return { edges: [], nextCursor: null, __typename: "VlogConnection" };
      const since = new Date(Date.now() - Math.max(1, days) * 24 * 3600 * 1000);
      const now2 = new Date();
      // --- Follows/Mutuals ohne "status" ---
      let followingIds: string[] = [];
      let followersOfMe: string[] = [];
      if (me) {
        const following = await ctx.prisma.follow.findMany({
          where: { followerId: me },
          select: { followingId: true },
        });
        followingIds = following.map(f => f.followingId);

        const followers = await ctx.prisma.follow.findMany({
          where: { followingId: me },
          select: { followerId: true },
        });
        followersOfMe = followers.map(f => f.followerId);
      }
      const followingSet = new Set(followingIds);
      const mutualSet = new Set(followersOfMe.filter(id => followingSet.has(id)));

      // --- Kandidaten: public ODER meine (Owner/Mitglied) ---
      const candidates = await ctx.prisma.vlog.findMany({
        where: {
          ...notBannedOwner(now2), 
          OR: [
            { ownerId: me },
            { members: { some: { userId: me, status: "ACCEPTED" } } },
          ],
        },
        // mehr als limit laden, später ranken/abschneiden
        take: Math.min(300, Math.max(60, limit)),
        orderBy: [{ updatedAt: "desc" }, { postCount: "desc" }, { id: "asc" }],
        include: { owner: { select: { id: true, username: true, avatarUrl: true } } },
      });
      if (!candidates.length) {
        return { edges: [], nextCursor: null, __typename: "VlogConnection" };
      }

      // Geblockte Owner filtern
      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      const hiddenOwners = new Set([...blockedByMe, ...blockedMe]);
      const candidatesSafe = candidates.filter(v => !hiddenOwners.has(v.ownerId));

      if (!candidatesSafe.length) {
        return { edges: [], nextCursor: null, __typename: "VlogConnection" };
      }

      const vlogIds = candidatesSafe.map(v => v.id);


      

      // --- Engagement der letzten X Tage aus Posts (nur akzeptierte Tags) ---
      const tags = await ctx.prisma.postVlogTag.findMany({
        where: {
          vlogId: { in: vlogIds },
          status: "ACCEPTED",
          post: { createdAt: { gte: since } },
        },
        select: {
          vlogId: true,
          post: {
            select: {
              id: true,
              authorId: true,
              createdAt: true,
              likeCount: true,
              commentCount: true,
            },
          },
        },
      });

      // Recency-Decay (Halbwertszeit ~14 Tage)
      const now = Date.now();
      const halfLifeDays = 14;
      const lambda = Math.log(2) / halfLifeDays;

      type Acc = { score: number; hadFriendAuthor: boolean };
      const agg = new Map<string, Acc>();

      for (const t of tags) {
        const p = t.post;
        const ageDays = Math.max(0, (now - new Date(p.createdAt).getTime()) / 86_400_000);
        const decay = Math.exp(-lambda * ageDays);

        // Kommentare wertiger als Likes (+2 Grundwert)
        const base = (p.likeCount ?? 0) * 1 + (p.commentCount ?? 0) * 2 + 2;
        const add = base * decay;

        const a = agg.get(t.vlogId) ?? { score: 0, hadFriendAuthor: false };
        a.score += add;
        if (me && (mutualSet.has(p.authorId) || followingSet.has(p.authorId))) {
          a.hadFriendAuthor = true;
        }
        agg.set(t.vlogId, a);
      }

      const ranked = candidatesSafe.map(v => {
      const a = agg.get(v.id) ?? { score: 0, hadFriendAuthor: false };

      let boost = 1;
      if (me && mutualSet.has(v.ownerId)) boost *= 1.4;
      else if (me && followingSet.has(v.ownerId)) boost *= 1.2;
      if (a.hadFriendAuthor) boost *= 1.15;

      const structure =
        1 +
        Math.min(
          0.25,
          Math.log(1 + (v.memberCount ?? 0)) / 20 + Math.log(1 + (v.postCount ?? 0)) / 30
        );

      let score = (a.score + 0.0001) * boost * structure;
      score *= 0.98 + Math.random() * 0.04; // leichte Streuung

      return { v, score, hadFriendAuthor: a.hadFriendAuthor };
    });

    ranked.sort((x, y) => y.score - x.score);

    // 👇 Popular (streng Top) + Explore-Mix (Popular + Friends + Variety)
    const RETURN_N = Math.max(20, Math.min(limit ?? 120, 120)); // mehr zurückgeben
    const STRICT_TOP_N = Math.max(10, Math.floor(RETURN_N * 0.6));
    const FRIEND_QUOTA  = Math.floor(RETURN_N * 0.25);

    const topStrict = ranked.slice(0, STRICT_TOP_N).map(r => r.v);
    const inTop = new Set(topStrict.map(v => v.id));

    const friendList = ranked
      .filter(r =>
        mutualSet.has(r.v.ownerId) ||
        followingSet.has(r.v.ownerId) ||
        r.hadFriendAuthor
      )
      .map(r => r.v)
      .filter(v => !inTop.has(v.id));

    const friendAdds = [];
    for (const v of friendList) {
      if (friendAdds.length >= FRIEND_QUOTA) break;
      friendAdds.push(v);
      inTop.add(v.id);
    }

    // Vielfalt aus Rest auffüllen
    for (const r of ranked) {
      if (topStrict.length + friendAdds.length >= RETURN_N) break;
      if (!inTop.has(r.v.id)) {
        friendAdds.push(r.v);
        inTop.add(r.v.id);
      }
    }

    const selected = [...topStrict, ...friendAdds]; // erste Elemente = echte Popular
    const edges = await Promise.all(selected.map((v:any) => buildVlogEdge(ctx, v)));

    return { edges, nextCursor: null, __typename: "VlogConnection" };
    },



    // Suche nach Vlogs (public + meine privaten)
  searchVlogs: async (
  _: unknown,
  {
    q,
    limit = 10,
    canPostToOnly = false,
  }: {
    q: string;
    limit?: number;
    canPostToOnly?: boolean;
  },
  ctx: Ctx
) => {
  const query = (q ?? "").trim();
  if (!query) return [];

  // 🔍 Textsuche: Titel ODER Owner-Username (optional auch slug)
  const searchWhere: any = {
    OR: [
      { title: { contains: query, mode: "insensitive" } },
      { owner: { username: { contains: query, mode: "insensitive" } } },
      // { slug: { contains: query, mode: "insensitive" } }, // ✅ falls du willst
    ],
  };

  console.log(
    "searchVlogs ctx.profileId",
    ctx.profileId,
    "canPostToOnly",
    canPostToOnly,
    "q",
    query
  );

  let where: any;

  if (canPostToOnly && ctx.profileId) {
    // 📝 Nur Vlogs, wo ich posten darf
    where = {
      AND: [
        searchWhere,
        {
          OR: [
            { ownerId: ctx.profileId },
            {
              members: {
                some: {
                  userId: ctx.profileId,
                  status: "ACCEPTED",
                },
              },
            },
          ],
        },
      ],
    };
  } else {
    // 🎬 Discovery: nur PUBLIC (✅ kein isDeleted, weil Feld existiert nicht)
    where = {
      AND: [
        searchWhere,
        {
          privacy: "PUBLIC",
        },
      ],
    };

    // ✅ Optional: wenn du “public + meine privaten” willst:
    // where = {
    //   AND: [
    //     searchWhere,
    //     ctx.profileId
    //       ? {
    //           OR: [
    //             { privacy: "PUBLIC" },
    //             { ownerId: ctx.profileId },
    //             { members: { some: { userId: ctx.profileId } } },
    //           ],
    //         }
    //       : { privacy: "PUBLIC" },
    //   ],
    // };
  }

  const rows = await ctx.prisma.vlog.findMany({
    where,
    take: Math.min(limit, 25),
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      privacy: true,
      owner: {
        select: {
          id: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
  });

  return rows;
},

},

  Mutation: {
    leaveVlog: async (_: unknown, { vlogId }: { vlogId: string }, ctx: Ctx) => {
      const me = requireProfileId(ctx);

      const vlog = await ctx.prisma.vlog.findUnique({
        where: { id: vlogId },
        select: { id: true, ownerId: true },
      });
      if (!vlog) throw new Error("Not found");

      if (vlog.ownerId === me) {
        throw new Error("Owner cannot leave own vlog");
      }

      // membership prüfen
      const mem = await ctx.prisma.vlogMember.findUnique({
        where: { vlogId_userId: { vlogId, userId: me } },
        select: { status: true, role: true },
      });
      if (!mem || mem.status !== "ACCEPTED") {
        throw new Error("Not a member");
      }

      await ctx.prisma.$transaction(async (tx) => {
        // 1) Alle Post↔Vlog Links von MIR entfernen
        // wir brauchen: welche Tags sind ACCEPTED (wegen postCount decrement)
        const myTags = await tx.postVlogTag.findMany({
          where: {
            vlogId,
            post: { authorId: me },
          },
          select: { postId: true, status: true },
        });

        const acceptedCount = myTags.filter((t) => t.status === "ACCEPTED").length;

        // 2) Tags löschen (damit werden es "normale Posts")
        await tx.postVlogTag.deleteMany({
          where: {
            vlogId,
            post: { authorId: me },
          },
        });

        // 3) vlog.postCount runter (nur ACCEPTED zählen)
        if (acceptedCount > 0) {
          await tx.vlog.update({
            where: { id: vlogId },
            data: { postCount: { decrement: acceptedCount } },
          });
        }

        // 4) Mitgliedschaft entfernen + memberCount--
        await tx.vlogMember.delete({
          where: { vlogId_userId: { vlogId, userId: me } },
        });

        await tx.vlog.update({
          where: { id: vlogId },
          data: { memberCount: { decrement: 1 } },
        });
      });

      return true;
    },
    setVlogMembers: async (_: unknown, { vlogId, userIds }: { vlogId: string; userIds: string[] }, ctx: Ctx) => {
      const me = requireMe(ctx);
      await assertVlogAdmin(ctx.prisma, vlogId, me);

      const uniq = Array.from(new Set((userIds ?? []).map(String))).filter(Boolean);

      return ctx.prisma.$transaction(async (tx: any) => {
        const vlog = await tx.vlog.findUnique({
          where: { id: vlogId },
          select: { ownerId: true },
        });
        if (!vlog) throw new UserInputError("Not found");

        // keep owner always
        const keep = new Set<string>([vlog.ownerId, ...uniq]);

        // current accepted non-owner members
        const current = await tx.vlogMember.findMany({
          where: { vlogId, status: "ACCEPTED" },
          select: { userId: true, role: true },
        });

        const currentKeepable = current.filter((m: any) => m.role !== "OWNER");
        
        const currentIds = new Set<string>(currentKeepable.map((m:any) => m.userId));

        // to add: in keep but not currently accepted
        const toAdd = [...keep].filter((uid) => uid !== vlog.ownerId && !currentIds.has(uid));

        // to remove: currently accepted but not in keep
        const toRemove = [...currentIds].filter((uid) => !keep.has(uid));
        

        // add (ACCEPTED direct)
        for (const uid of toAdd) {
          await ensureMember(tx, vlogId, uid, true); // accept=true => ACCEPTED + memberCount++
        }

        // remove (only if not owner)
        for (const uid of toRemove) {
          await tx.vlogMember.deleteMany({
            where: { vlogId, userId: uid, role: { not: "OWNER" } },
          });
          await tx.vlog.update({ where: { id: vlogId }, data: { memberCount: { decrement: 1 } } });
        }

        return true;
      });
    },
    // Vlog anlegen

    createVlog: async (
      _: unknown,
      { input }: { input: {
        title: string;
        slug: string;
        description?: string | null;
        coverKey?: string | null;
        privacy?: "PUBLIC" | "PRIVATE";
        lat: number;
        lng: number;
      }},
      ctx: Ctx
    ) => {
      const me = requireMe(ctx);
      await ensureTermsAccepted(ctx);
      await assertNotBanned(ctx);
      assertNoProfanity(input, ["title", "description", "slug"]);

      const title = String(input.title ?? "").trim();
      if (!title) throw new Error("Titel fehlt");

      const rawSlug = String(input.slug ?? "").trim();
      const slug = normalizeSlug(rawSlug);
      if (!slug) throw new Error("Ungültiger Slug");

      const lat = Number(input.lat);
      const lng = Number(input.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("lat/lng required");
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error("invalid coordinates");

      // ✅ Uniqueness vorab (bessere Fehlermeldung)
      const existing = await ctx.prisma.vlog.findFirst({
        where: { slug },
        select: { id: true },
      });
      if (existing) throw new Error("Slug bereits vergeben.");

      try {
        return await ctx.prisma.$transaction(async (tx) => {
          const created = await tx.vlog.create({
            data: {
              title,
              slug,
              description: typeof input.description === "string" ? input.description.trim() : (input.description ?? null),
              coverKey: Object.prototype.hasOwnProperty.call(input, "coverKey") ? (input.coverKey ?? null) : null,

              // ✅ deine Regel: Vlogs sind immer privat
              privacy: "PRIVATE",

              ownerId: me,
              lat,
              lng,
            },
            include: {
              owner: { select: { id: true, username: true, avatarUrl: true } },
            },
          });

          // ✅ Cover-Thumb Job anstoßen (wenn coverKey S3-Key ist)
          if (created.coverKey && looksLikeS3Key(created.coverKey)) {
            await tx.vlogCoverProcessingJob.upsert({
              where: { vlogId: created.id },
              update: { status: "PENDING", lastError: null },
              create: { vlogId: created.id, status: "PENDING" },
            });
          }


          // Owner als Member (idempotent)
          await tx.vlogMember.upsert({
            where: { vlogId_userId: { vlogId: created.id, userId: me } },
            update: { role: "OWNER", status: "ACCEPTED" },
            create: { vlogId: created.id, userId: me, role: "OWNER", status: "ACCEPTED" },
          });

          return created;
        });
      } catch (e: any) {
        if (e?.code === "P2002") {
          const target = e?.meta?.target;
          const hitsSlug =
            (Array.isArray(target) && target.includes("slug")) ||
            (typeof target === "string" && target.includes("slug"));

          if (hitsSlug) throw new Error("Slug bereits vergeben.");

          // wichtig: sonst echte Ursache anzeigen
          throw new Error(`Unique conflict: ${JSON.stringify(target)}`);
        }
        throw e;
      }
    },


    deleteVlog: async (_: unknown, { id }: { id: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      // Nur Owner darf löschen
      const v = await ctx.prisma.vlog.findUnique({ where: { id }, select: { ownerId: true, title: true } });
      if (!v) throw new Error("Not found");
      if (v.ownerId !== ctx.profileId) throw new Error("Forbidden");

      // Dank onDelete: Cascade in Prisma werden Members/Tags/Notifications mit entfernt
      await ctx.prisma.$transaction(async (tx:any) => {
      // betroffene Post-Verknüpfungen holen
      const tags = await tx.postVlogTag.findMany({
        where: { vlogId: id, status: { in: ["ACCEPTED", "PENDING"] } },
        select: { postId: true, post: { select: { authorId: true } } },
      });

      // Tags löschen (wir lassen die Posts intakt)
      await tx.postVlogTag.deleteMany({ where: { vlogId: id } });

      // Autoren benachrichtigen (einmal pro Post)
      for (const t of tags) {
        await notify({
          prisma: tx as any,
          recipientId: t.post.authorId,
          kind: "VLOG_DELETED",
          channel: "ACTIVITY",
          postId: t.postId,
          payload: { text: `„${v.title}“ wurde gelöscht`, deletedVlogId: id, vlogTitle: v.title },
        });
      }

      await tx.vlog.delete({ where: { id } });
    });
      return true;
    },

    updateVlog: async (
      _: unknown,
      { id, input }: { id: string; input: any },
      ctx: Ctx
    ) => {
      const me = requireMe(ctx);
      await assertVlogAdmin(ctx.prisma, id, me);
      const before = await ctx.prisma.vlog.findUnique({
        where: { id },
        select: { coverKey: true },
      });


      assertNoProfanity(input, ["title", "description", "slug"]);

      const patch: any = {
        title: typeof input.title === "string" ? input.title.trim() : undefined,
        description:
          typeof input.description === "string"
            ? input.description.trim()
            : undefined,

        // coverKey: nur ändern wenn explizit gesendet
        coverKey: Object.prototype.hasOwnProperty.call(input, "coverKey")
          ? input.coverKey
          : undefined,

        privacy: undefined,
      };

      /* ---------- SLUG: NUR wenn explizit gesendet ---------- */
      if (Object.prototype.hasOwnProperty.call(input, "slug")) {
        const raw = String(input.slug ?? "").trim();
        const normalized = normalizeSlug(raw);

        if (!normalized) {
          throw new Error("Ungültiger Slug");
        }

        // Uniqueness-Check (außer aktueller Vlog)
        const hit = await ctx.prisma.vlog.findFirst({
          where: {
            slug: normalized,
            id: { not: id },
          },
          select: { id: true },
        });

        if (hit) {
          throw new Error("Slug bereits vergeben.");
        }

        patch.slug = normalized;
      }

      /* ---------- Koordinaten ---------- */
      if (
        Object.prototype.hasOwnProperty.call(input, "lat") ||
        Object.prototype.hasOwnProperty.call(input, "lng")
      ) {
        const lat = Number(input.lat);
        const lng = Number(input.lng);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new Error("Both lat and lng must be provided");
        }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          throw new Error("invalid coordinates");
        }

        patch.lat = lat;
        patch.lng = lng;
      }

      try {

        const updated = await ctx.prisma.vlog.update({
          where: { id },
          data: patch,
          include: { owner: { select: { id: true, username: true, avatarUrl: true } } },
        });

        // ✅ Job anstoßen, wenn coverKey explizit gesetzt wurde und S3-Key ist
        if (Object.prototype.hasOwnProperty.call(input, "coverKey")) {
          const nextKey = updated.coverKey;

          if (nextKey && looksLikeS3Key(nextKey)) {
            await ctx.prisma.vlogCoverProcessingJob.upsert({
              where: { vlogId: id },
              update: { status: "PENDING", lastError: null },
              create: { vlogId: id, status: "PENDING" },
            });
          }

          // ✅ Cleanup: altes Cover + Thumb löschen, wenn geändert
          const oldKey = before?.coverKey ?? null;
          if (oldKey && oldKey !== nextKey && looksLikeS3Key(oldKey)) {
            try {
              await deleteObjects([oldKey, coverKeyToThumb(oldKey)]);
            } catch {}
          }
        }
        return updated;
        
      } catch (e: any) {
        // DB-Fallback (sollte selten greifen)
        if (e?.code === "P2002") {
          throw new Error("Slug bereits vergeben.");
        }
        throw e;
      }
    },



    withdrawVlogPost: async (
      _parent: unknown,
      { vlogId, postId }: { vlogId: string; postId: string },
      ctx: Ctx
    ) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      if (!vlogId || !postId) throw new UserInputError("vlogId and postId required");

      // 1) Relation inkl. Post- und Vlog-Owner laden
      // ⚠️  Passe den Modelnamen hier an DEIN Prisma-Schema an:
      // Beispiele: ctx.prisma.vlogPostTag | postVlogTag | vlogPost
      const rel = await ctx.prisma.postVlogTag.findFirst({
        where: { vlogId, postId },
        include: {
          post: { select: { id: true, authorId: true } },
          vlog: { select: { id: true, ownerId: true, postCount: true } },
        },
      });

      // Nichts zu tun (idempotent)
      if (!rel) return true;

      // 2) Berechtigungen
      const isAuthor = rel.post.authorId === ctx.profileId;
      const isVlogOwner = rel.vlog.ownerId === ctx.profileId;

      // Nur Post-Autor (und optional Vlog-Owner) dürfen entfernen
      if (!isAuthor && !isVlogOwner) {
        // Debug-Log hilft dir sofort beim nächsten Test
        console.warn(
          "[withdrawVlogPost] forbidden",
          { caller: ctx.profileId, authorId: rel.post.authorId, vlogOwnerId: rel.vlog.ownerId }
        );
        throw new ForbiddenError("Not allowed to withdraw this post from the vlog.");
      }

      // 3) Status & Zählerpflege (falls ihr einen Status habt)
      const acceptedSet = new Set(["ACCEPTED", "APPROVED"]);
      const wasAccepted = rel.status ? acceptedSet.has(rel.status) : true; // wenn kein Feld existiert, als akzeptiert behandeln

      // 4) Transaktion: Relation löschen + postCount ggf. dekrementieren
      await ctx.prisma.$transaction(async (tx: any) => {
        await tx.postVlogTag.deleteMany({ where: { vlogId, postId } });

        if (wasAccepted) {
          await tx.vlog.update({ where: { id: vlogId }, data: { postCount: { decrement: 1 } } });
          await removeMemberIfNoAcceptedPosts(tx, vlogId, rel.post.authorId);
        }
      });


      // (Optional) weitere Seiteneffekte / Events
      // z.B. wenn ihr ein denormalisiertes Flag am Post habt, hier updaten

      return true;
    },

    // Beitritt anfragen (PRIVATE) oder joinen (PUBLIC -> accepted)
    requestJoinVlog: async (_: unknown, { vlogId }: { vlogId: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      return ctx.prisma.$transaction(async (tx: any) => {
        const vlog = await tx.vlog.findUnique({ where: { id: vlogId }, select: { privacy: true } });
        if (!vlog) throw new Error("Not found");

        const existing = await tx.vlogMember.findUnique({
          where: { vlogId_userId: { vlogId, userId: ctx.profileId } },
        });

        if (existing) {
          // idempotent
          if (vlog.privacy === "PUBLIC" && existing.status !== "ACCEPTED") {
            await tx.vlogMember.update({
              where: { vlogId_userId: { vlogId, userId: ctx.profileId } },
              data: { status: "ACCEPTED" },
            });
            await tx.vlog.update({ where: { id: vlogId }, data: { memberCount: { increment: 1 } } });
          }
          return true;
        }

        if (vlog.privacy === "PUBLIC") {
          await tx.vlogMember.create({
            data: { vlogId, userId: ctx.profileId, role: "MEMBER", status: "ACCEPTED" },
          });
          await tx.vlog.update({ where: { id: vlogId }, data: { memberCount: { increment: 1 } } });
          return true;
        } else {
          await tx.vlogMember.create({
            data: { vlogId, userId: ctx.profileId, role: "MEMBER", status: "PENDING" },
          });
          return true;
        }
      });
    },

    // Anfrage beantworten (Owner/Admin)
    respondJoinRequest: async (
      _: unknown,
      { vlogId, userId, accept }: { vlogId: string; userId: string; accept: boolean },
      ctx: Ctx
    ) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      await assertVlogAdmin(ctx.prisma, vlogId, ctx.profileId);

      return ctx.prisma.$transaction(async (tx: any) => {
        const m = await tx.vlogMember.findUnique({ where: { vlogId_userId: { vlogId, userId } } });
        if (!m) throw new Error("Not found");

        if (accept) {
          if (m.status !== "ACCEPTED") {
            await tx.vlogMember.update({
              where: { vlogId_userId: { vlogId, userId } },
              data: { status: "ACCEPTED" },
            });
            await tx.vlog.update({ where: { id: vlogId }, data: { memberCount: { increment: 1 } } });
          }
        } else {
          if (m.status === "ACCEPTED") {
            await tx.vlog.update({ where: { id: vlogId }, data: { memberCount: { decrement: 1 } } });
          }
          await tx.vlogMember.update({
            where: { vlogId_userId: { vlogId, userId } },
            data: { status: "REJECTED" },
          });
        }
        return true;
      });
    },

    addVlogAdmin: async (_: unknown, { vlogId, userId }: { vlogId: string; userId: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      await assertVlogAdmin(ctx.prisma, vlogId, ctx.profileId);

      await ctx.prisma.vlogMember.update({
        where: { vlogId_userId: { vlogId, userId } },
        data: { role: "ADMIN", status: "ACCEPTED" },
      });
      return true;
    },

    removeVlogMember: async (_: unknown, { vlogId, userId }: { vlogId: string; userId: string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");
      await assertVlogAdmin(ctx.prisma, vlogId, ctx.profileId);

      return ctx.prisma.$transaction(async (tx: any) => {
        const m = await tx.vlogMember.findUnique({ where: { vlogId_userId: { vlogId, userId } } });
        if (!m) return true; // idempotent

        await tx.vlogMember.delete({ where: { vlogId_userId: { vlogId, userId } } });
        if (m.status === "ACCEPTED") {
          await tx.vlog.update({ where: { id: vlogId }, data: { memberCount: { decrement: 1 } } });
        }
        return true;
      });
    },

    // Post an Vlog taggen (PENDING). Freigabe via approvePostForVlog
    tagVlogOnPost: async (_:unknown, { postId, vlogId }: any, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);

      const vlog = await ctx.prisma.vlog.findUnique({
        where: { id: vlogId },
        select: { id: true, ownerId: true },
      });
      if (!vlog) throw new Error("Vlog not found");

      // Wenn ich den Owner blocke oder er mich → verbieten
      if (blockedByMe.has(vlog.ownerId)) throw new ForbiddenError("You blocked the vlog owner.");
      if (blockedMe.has(vlog.ownerId)) throw new ForbiddenError("The vlog owner blocked you.");

      const existing = await ctx.prisma.postVlogTag.findUnique({
        where: { postId_vlogId: { postId, vlogId } },
        select: { status: true },
      });

      return ctx.prisma.$transaction(async (tx:any) => {
        if (vlog.ownerId === ctx.profileId) {
          if (!existing || existing.status !== "ACCEPTED") {
            await tx.postVlogTag.upsert({
              where: { postId_vlogId: { postId, vlogId } },
              update: { status: "ACCEPTED" },
              create: { postId, vlogId, status: "ACCEPTED" },
            });
            const p = await tx.post.findUnique({
              where: { id: postId },
              select: { authorId: true },
            });
            if (p?.authorId) {
              await ensureMember(tx, vlogId, p.authorId, true);
            }


            await tx.vlog.update({ where: { id: vlogId }, data: { postCount: { increment: 1 } } });
          }
          return true;
        }

        if (!existing || existing.status !== "PENDING") {
          await tx.postVlogTag.upsert({
            where: { postId_vlogId: { postId, vlogId } },
            update: { status: "PENDING" },
            create: { postId, vlogId, status: "PENDING" },
          });

          const admins = await tx.vlogMember.findMany({
            where: { vlogId, status: "ACCEPTED", role: { in: ["ADMIN", "OWNER"] } },
            select: { userId: true },
          });

          const recipients = new Set<string>([vlog.ownerId, ...admins.map((a:any) => a.userId)]);
          recipients.delete(ctx.profileId!);

          for (const recipientId of recipients) {
            // Wenn Empfänger mich geblockt hat, skippen
            if (blockedMe.has(recipientId)) continue;

            await notify({
              prisma: tx as any,
              recipientId,
              kind: "VLOG_TAG_REQUEST",
              channel: "ACTIVITY",
              fromUserId: ctx.profileId,
              actorId: ctx.profileId,
              postId,
              vlogId,
              payload: {
                text: "Neue Beitragsanfrage",
                status: "PENDING",
                type: "VLOG_TAG_REQUEST",
                vlogId,      // ✅ add
                postId,      // ✅ add (optional, aber hilft)
              },
            });

          }
        }

        return true;
      });
    },



  approvePostForVlog: async (_: unknown, { vlogId, postId }: any, ctx: Ctx) => {
    if (!ctx.profileId) throw new Error("Not authenticated");

    const vlog = await ctx.prisma.vlog.findUnique({ where: { id: vlogId } });
    if (!vlog) throw new Error("Vlog not found");

    // Rechte: Owner/Admin
    if (vlog.ownerId !== ctx.profileId) {
      const me = await ctx.prisma.vlogMember.findUnique({
        where: { vlogId_userId: { vlogId, userId: ctx.profileId } },
      });
      if (!me || (me.role !== "ADMIN" && me.role !== "OWNER")) throw new Error("Forbidden");
    }

    const tag = await ctx.prisma.postVlogTag.findUnique({
      where: { postId_vlogId: { postId, vlogId } },
      select: { status: true },
    });
    if (!tag) throw new Error("Tag not found");

    await ctx.prisma.$transaction(async (tx: any) => {
      const post = await tx.post.findUnique({
        where: { id: postId },
        select: { authorId: true },
      });
      if (!post?.authorId) throw new Error("Post not found");

      if (tag.status !== "ACCEPTED") {
        await tx.postVlogTag.update({
          where: { postId_vlogId: { postId, vlogId } },
          data: { status: "ACCEPTED" },
        });

        // ✅ Author wird jetzt "gültiger Member" (zählt für memberCount)
        await ensureMember(tx, vlogId, post.authorId, true);


        await tx.vlog.update({
          where: { id: vlogId },
          data: { postCount: { increment: 1 } },
        });
      }

      const admins = await tx.vlogMember.findMany({
        where: { vlogId, status: "ACCEPTED", role: { in: ["ADMIN", "OWNER"] } },
        select: { userId: true },
      });

      const recipients = new Set<string>([vlog.ownerId, ...admins.map((a: any) => a.userId)]);

      await Promise.all(
        [...recipients].map((rid) =>
          setVlogTagNotificationStatus(tx, rid, postId, vlogId, "ACCEPTED")
        )
      );

      await notify({
        prisma: tx as any,
        recipientId: post.authorId,
        kind: "VLOG_TAG_APPROVED",
        channel: "ACTIVITY",
        fromUserId: ctx.profileId,
        actorId: ctx.profileId,
        postId,
        vlogId,
        payload: { text: `Deine Beitragsanfrage wurde in ${vlog.title} akzeptiert` },
      });

      await ensureMember(tx, vlogId, ctx.profileId!, true);
    });


  return true;
},

rejectPostForVlog: async (_: unknown, { vlogId, postId }: any, ctx: Ctx) => {
  if (!ctx.profileId) throw new Error("Not authenticated");

  const vlog = await ctx.prisma.vlog.findUnique({ where: { id: vlogId } });
  if (!vlog) throw new Error("Vlog not found");

  const post = await ctx.prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true },
  });

  let isAdmin = false;
  if (vlog.ownerId === ctx.profileId) isAdmin = true;
  else {
    const me = await ctx.prisma.vlogMember.findUnique({
      where: { vlogId_userId: { vlogId, userId: ctx.profileId } },
      select: { role: true },
    });
    isAdmin = !!me && (me.role === "ADMIN" || me.role === "OWNER");
  }

  const isAuthor = post?.authorId === ctx.profileId;
  if (!isAdmin && !isAuthor) throw new Error("Forbidden");

  const tag = await ctx.prisma.postVlogTag.findUnique({
    where: { postId_vlogId: { postId, vlogId } },
    select: { status: true },
  });
  if (!tag) throw new Error("Tag not found");

  await ctx.prisma.$transaction(async (tx: any) => {
    if (tag.status === "ACCEPTED") {
      await tx.vlog.update({
        where: { id: vlogId },
        data: { postCount: { decrement: 1 } },
      });
    }

    // ✅ Admins/Owner laden
    const admins = await tx.vlogMember.findMany({
      where: { vlogId, status: "ACCEPTED", role: { in: ["ADMIN", "OWNER"] } },
      select: { userId: true },
    });

    const recipients = new Set<string>([vlog.ownerId, ...admins.map((a: any) => a.userId)]);

    // ✅ Request Notification bei ALLEN als handled markieren
    await Promise.all(
      [...recipients].map((rid) =>
        setVlogTagNotificationStatus(tx, rid, postId, vlogId, "REJECTED")
      )
    );

    await tx.postVlogTag.update({
      where: { postId_vlogId: { postId, vlogId } },
      data: { status: "REJECTED" },
    });
    
    if (post?.authorId) {
      await removeMemberIfNoAcceptedPosts(tx, vlogId, post.authorId);
    }


    if (isAdmin && post?.authorId) {
      await notify({
        prisma: tx as any,
        recipientId: post.authorId,
        kind: "VLOG_TAG_REJECTED",
        channel: "ACTIVITY",
        fromUserId: ctx.profileId,
        actorId: ctx.profileId,
        postId,
        vlogId,
        payload: { text: `Deine Beitragsanfrage in ${vlog.title} wurde abgelehnt` },
      });
    }

  
  });

  return true;
},

  },

  VlogOwner: {
    async avatarUrl(o: any) {
      const raw = o?.avatarUrl as string | null | undefined;
      if (!raw) return null;
      if (isHttpUrl(raw)) return raw;
      if (looksLikeS3Key(raw)) {
        try {
          return await getSignedGetUrl(raw, 900);
        } catch {
          return null;
        }
      }
      return null;
    },
  },

  Vlog: {
    coverUrl: async (v: any, _: unknown, ctx: Ctx) => {
      // 1) Bereits aufgelöste URL (z.B. aus DB / JOIN)
      const pre = (v as any).coverUrl as string | null | undefined;
      if (pre && isHttpUrl(pre)) return pre;

      // 2) Kein Cover vorhanden
      if (!v.coverKey) return null;

      // 3) Privacy / Zugriff
      const allowed = await canSeeCover(ctx, v.id, v.privacy, v.ownerId);
      if (!allowed) return null;

      // 4) Signed URL
      try {
        return await getSignedGetUrlCached(v.coverKey);
      } catch {
        return null;
      }
    },

    coverThumbUrl: async (v: any, _: unknown, ctx: Ctx) => {
      // 1) Bereits gesetzt (z.B. JOIN oder Projection)
      const pre = (v as any).coverThumbUrl as string | null | undefined;
      if (pre && isHttpUrl(pre)) return pre;

      // 2) Kein Cover vorhanden
      if (!v.coverKey) return null;

      // 3) Privacy / Zugriff
      const allowed = await canSeeCover(ctx, v.id, v.privacy, v.ownerId);
      if (!allowed) return null;

      const thumbKey = coverKeyToThumb(v.coverKey);

      // 4) Thumb versuchen → fallback Original
      try {
        // optional sauberer:
        // if (await s3ObjectExists(thumbKey)) {
        //   return await getSignedGetUrlCached(thumbKey);
        // }

        return await getSignedGetUrlCached(thumbKey);
      } catch {
        try {
          return await getSignedGetUrlCached(v.coverKey);
        } catch {
          return null;
        }
      }
    },

    owner: async (v: any, _: any, ctx: Ctx) => {
      // v.ownerId oder v.owner?.id – je nach DB shape
      const ownerId = v.ownerId ?? v.owner?.id;
      if (!ownerId) return null;

      // User GraphQL Typ basiert bei dir auf Prisma "profile"
      return ctx.prisma.profile.findUnique({
        where: { id: ownerId },
      });
    },
    isMember: async (v: any, _args: unknown, ctx: Ctx) =>
    isAcceptedMember(ctx.prisma, v.id, ctx.profileId),
    isAdmin: async (v: any, _args: unknown, ctx: Ctx) => {
      if (!ctx.profileId) return false;
      const m = await ctx.prisma.vlogMember.findUnique({
        where: { vlogId_userId: { vlogId: v.id, userId: ctx.profileId } },
        select: { role: true, status: true },
      });
      return !!m && m.status === "ACCEPTED" && (m.role === "OWNER" || m.role === "ADMIN");
    },
  },
};

export default resolvers;
