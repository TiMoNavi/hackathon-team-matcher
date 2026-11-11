import { visiblePostWhere } from "../lib/postVisibility";
// apps/server/src/resolvers/shareResolvers.ts
import type { Ctx } from "../context";
import { notify } from "../lib/notify";
import { getBlockedSets } from "../lib/blocks";
import { canViewProfileContent } from "../lib/privacy";


export default {
  Mutation: {
    // apps/server/src/resolvers/shareResolvers.ts
    requestSharePostWithUsers: async (_:unknown, { postId, userIds }: { postId:string; userIds:string[] }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const post = await ctx.prisma.post.findUnique({ where: { id: postId } });
      if (!post || post.authorId !== ctx.profileId) throw new Error("Forbidden");

      const uniq = Array.from(new Set(userIds)).filter((x): x is string => !!x);

      // ✅ Targets laden (privacy)
      const targets = await ctx.prisma.profile.findMany({
        where: { id: { in: uniq } },
        select: { id: true, username: true, isPrivate: true },
      });

      const targetMap = new Map(targets.map(t => [t.id, t]));

      // ✅ Für private Targets muss author ihnen folgen (oder self)
      const privateIds = targets.filter(t => t.isPrivate && t.id !== ctx.profileId).map(t => t.id);

      let allowedPrivate = new Set<string>();
      if (privateIds.length) {
        const follows = await ctx.prisma.follow.findMany({
          where: { followerId: ctx.profileId, followingId: { in: privateIds } },
          select: { followingId: true },
        });
        allowedPrivate = new Set(follows.map(f => f.followingId));
      }

      const blocked: string[] = [];
      const finalIds: string[] = [];

      for (const id of uniq) {
        const t = targetMap.get(id);
        if (!t) continue;

        if (!t.isPrivate) { finalIds.push(id); continue; }

        // private:
        if (id === ctx.profileId) { finalIds.push(id); continue; }
        if (allowedPrivate.has(id)) { finalIds.push(id); continue; }

        blocked.push(`@${t.username}`);
      }

      if (blocked.length) {
        throw new Error(`Du kannst private Profile nur markieren, wenn du ihnen folgst: ${blocked.join(", ")}`);
      }

      await ctx.prisma.$transaction(async tx => {
        await tx.postTag.createMany({
          data: finalIds.map(uid => ({ postId, userId: uid, status: "PENDING", showOnProfile: false })),
          skipDuplicates: true,
        });

        for (const uid of finalIds) {
          await notify({
            prisma: tx,
            recipientId: uid,
            kind: "POST_SHARE_REQUEST",
            channel: "ACTIVITY",
            fromUserId: ctx.profileId,
            actorId: ctx.profileId,
            postId,
            payload: { text: "Neue Beitragsanfrage" },
          });
        }
      });

      return true;
    },


    setPostTagShowOnProfile: async (_: any, { postId, show }: { postId: string; show: boolean }, ctx: Ctx) => {
      const meId = ctx.profileId;
      if (!meId) throw new Error("Not authenticated");

      // nur dein eigener Tag-Datensatz darf geändert werden
      const tag = await ctx.prisma.postTag.findUnique({
        where: {
          postId_userId: {
            postId,
            userId: meId,
          },
        },
        select: { status: true, showOnProfile: true },
      });

      if (!tag) throw new Error("Tag not found");
      if (tag.status !== "ACCEPTED") throw new Error("Tag not accepted");

      await ctx.prisma.postTag.update({
        where: {
          postId_userId: {
            postId,
            userId: meId,
          },
        },
        data: { showOnProfile: show },
      });

      return true;
    },


    // Empfänger akzeptiert
    approveSharedPost: async (_:unknown, { postId }: { postId:string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const tag = await ctx.prisma.postTag.findUnique({ where: { postId_userId: { postId, userId: ctx.profileId } } });
      if (!tag) throw new Error("Not found");

      await ctx.prisma.$transaction(async tx => {
        await tx.postTag.update({
          where: { postId_userId: { postId, userId: ctx.profileId! } },
          data: { status: "ACCEPTED", showOnProfile: true },
        });

        const post = await tx.post.findUnique({ where: { id: postId }, select: { authorId: true } });

        if (post?.authorId) {
          await notify({
            prisma: tx,
            recipientId: post.authorId,        // Autor wird informiert
            kind: "POST_SHARE_APPROVED",
            channel: "ACTIVITY",
            fromUserId: ctx.profileId,         // der, der zugestimmt hat
            actorId: ctx.profileId,
            postId,
          });
        }
      });

      return true;
    },

    // Empfänger lehnt ab
    rejectSharedPost: async (_:unknown, { postId }: { postId:string }, ctx: Ctx) => {
      if (!ctx.profileId) throw new Error("Not authenticated");

      const tag = await ctx.prisma.postTag.findUnique({ where: { postId_userId: { postId, userId: ctx.profileId } } });
      if (!tag) throw new Error("Not found");

      await ctx.prisma.$transaction(async tx => {
        await tx.postTag.update({
          where: { postId_userId: { postId, userId: ctx.profileId! } },
          data: { status: "REJECTED", showOnProfile: false },
        });

        const post = await tx.post.findUnique({ where: { id: postId }, select: { authorId: true } });

        if (post?.authorId) {
          await notify({
            prisma: tx,
            recipientId: post.authorId,
            kind: "POST_SHARE_REJECTED",
            channel: "ACTIVITY",
            fromUserId: ctx.profileId,
            actorId: ctx.profileId,
            postId,
          });
        }
      });

      return true;
    },

    

    
  },

  Query: {
    // Raster-Datenquelle je Tab:
    profileGrid : async (
  _: unknown,
  args: { userId: string; tab: string; offset?: number; limit?: number },
  ctx: Ctx
) => {
  
  const { userId, tab, offset = 0, limit = 24 } = args;
  const me = ctx.profileId ?? null;
  

  // ─────────────────────────────────────────────────────────────
  // Blocks (viewer darf geblockte profile nicht sehen / umgekehrt)
  // ─────────────────────────────────────────────────────────────
  const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
  if (me && (blockedByMe.has(userId) || blockedMe.has(userId))) return [];

  // ─────────────────────────────────────────────────────────────
  // Zielprofil-Privacy: wenn privat und viewer nicht follower -> []
  // ─────────────────────────────────────────────────────────────
  const canSeeTarget = await canViewProfileContent(ctx, userId);
  if (!canSeeTarget) {
    // Only the target's own readable community posts, never their private tags.
    if (tab !== "posts") return [];
    return ctx.prisma.post.findMany({
      where: { AND: [visiblePostWhere(ctx), { authorId: userId, hideFromGrid: false }] },
      orderBy: { createdAt: "desc" }, skip: offset, take: limit,
      include: { author: true },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // POSTS TAB (own + sharedVisible)
  // ─────────────────────────────────────────────────────────────
  if (tab === "posts") {
    // für korrektes mischen nach datum:
    // hol mehr aus beiden quellen und paginiere NACH merge+filter
    const fetchN = offset + limit;

    const own = await ctx.prisma.post.findMany({
      where: { AND: [visiblePostWhere(ctx), { authorId: userId, hideFromGrid: false }] },
      orderBy: { createdAt: "desc" },
      take: fetchN,
      include: {
        author: true,
        tagsVlogs: { select: { vlogId: true, status: true } },
      },
    });

    // in profileGrid -> if (tab === "posts") { ... }

    const sharedVisible = await ctx.prisma.post.findMany({
      where: { AND: [visiblePostWhere(ctx), {
        tags: {
          some: {
            userId,               // Profilbesitzer
            status: "ACCEPTED",
            showOnProfile: true,
          },
        },

        // ✅ NEU: owner-based visibility rule
        OR: [
          // Autor ist public
          { author: { isPrivate: false } },

          // Autor ist der Owner selbst
          { authorId: userId },

          // Autor ist private -> nur wenn Owner dem Autor folgt
          {
            author: {
              followers: {          // followers = Follow[] wo followingId = author.id
                some: { followerId: userId }, // Owner folgt dem Autor
              },
            },
          },
        ],
      }] },

      orderBy: { createdAt: "desc" },
      skip: 0,
      take: fetchN,
      include: {
        author: true,
        tagsVlogs: { select: { vlogId: true, status: true } },
      },
    });


    // dedupe
    const map = new Map<string, any>();
    for (const p of own) map.set(p.id, p);
    for (const p of sharedVisible) map.set(p.id, p);

    // gemischt nach datum sortieren
    const merged = Array.from(map.values()).sort((a, b) => {
      const at = new Date(a.createdAt).getTime();
      const bt = new Date(b.createdAt).getTime();
      return bt - at;
    });

    // ✅ privacy filter: posts raus, deren autor viewer nicht sehen darf
    const filtered: any[] = [];
    for (const p of merged) {
      const authorId = p?.authorId ?? p?.author?.id;
      if (!authorId) continue;

      // wenn autor geblockt/blocked: raus (zusätzlicher safety-gurt)
      if (me && (blockedByMe.has(authorId) || blockedMe.has(authorId))) continue;

      filtered.push(p); // Audience already checked before pagination.
    }

    return filtered.slice(offset, offset + limit);
  }

  // ─────────────────────────────────────────────────────────────
  // TAGGED TAB (accepted tags)
  // ─────────────────────────────────────────────────────────────
  if (tab === "tagged") {
    // wir holen bis offset+limit und paginieren nach dem filter
    const tagged = await ctx.prisma.post.findMany({
      where: { AND: [visiblePostWhere(ctx), {
        tags: { some: { userId, status: "ACCEPTED" } },

        OR: [
          { author: { isPrivate: false } },
          { authorId: userId },
          { author: { followers: { some: { followerId: userId } } } },
        ],
      }] },
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: offset + limit,
      include: {
        author: { select: { id: true, username: true, avatarUrl: true, isPrivate: true } },
        tagsVlogs: { select: { vlogId: true, status: true } },
      },
    });


    const filtered: any[] = [];
    for (const p of tagged) {
      const authorId = p?.authorId ?? p?.author?.id;
      if (!authorId) continue;

      if (me && (blockedByMe.has(authorId) || blockedMe.has(authorId))) continue;

      filtered.push(p);
    }

    return filtered.slice(offset, offset + limit);
  }

  // ─────────────────────────────────────────────────────────────
  // COMMUNITY TAB
  // Keep the legacy "vlogs" tab name for older clients, but show posts that
  // were explicitly published into a community context.
  // ─────────────────────────────────────────────────────────────
  if (tab === "vlogs") {
    // hideFromGrid soll nur das Haupt-Profilgrid beeinflussen. Im Community-Tab
    // bleiben Community-Posts erreichbar, damit sie wieder hinzugefügt werden können.
    const rows = await ctx.prisma.post.findMany({
      where: { AND: [visiblePostWhere(ctx), {
        authorId: userId,
        postContexts: {
          some: {
            source: "IMPORT",
            context: {
              key: { startsWith: "group:" },
            },
          },
        },
      }] },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      include: {
        author: true,
        tagsVlogs: { select: { vlogId: true, status: true } },
      },
    });
    return rows;
  }



  // ─────────────────────────────────────────────────────────────
  // fallback: own posts
  // ─────────────────────────────────────────────────────────────
  return ctx.prisma.post.findMany({
    where: { AND: [visiblePostWhere(ctx), { authorId: userId, hideFromGrid: false }] },
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: limit,
    include: {
      author: true,
      tagsVlogs: { select: { vlogId: true, status: true } },
    },
  });
}  },
};
