// apps/server/src/resolvers/followResolvers.ts
import type { Ctx } from "../context";
import { notify } from "../lib/notify";
import { getBlockedSets } from "../lib/blocks";
import { Prisma } from "@prisma/client";


type Db = Prisma.TransactionClient; // <- wichtig

async function createFollowIdempotent(tx: Db, followerId: string, followingId: string) {
  try {
    await tx.follow.create({ data: { followerId, followingId } });

    await tx.profile.update({
      where: { id: followerId },
      data: { followingCount: { increment: 1 } },
    });
    await tx.profile.update({
      where: { id: followingId },
      data: { followerCount: { increment: 1 } },
    });

    return true;
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return false;
    }
    throw e;
  }
}

async function deleteFollowIdempotent(tx: Db, followerId: string, followingId: string) {
  const existed = await tx.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
    select: { followerId: true },
  });
  if (!existed) return false;

  await tx.follow.delete({
    where: { followerId_followingId: { followerId, followingId } },
  });

  await tx.profile.update({
    where: { id: followerId },
    data: { followingCount: { decrement: 1 } },
  });
  await tx.profile.update({
    where: { id: followingId },
    data: { followerCount: { decrement: 1 } },
  });

  return true;
}

const followResolvers = {
  Mutation: {
    /**
     * FOLLOW
     * - public profile  -> follow direkt
     * - private profile -> follow request
     */
    follow: async (_: unknown, { userId }: { userId: string }, ctx: Ctx) => {
      const me = ctx.profileId;
      if (!me) throw new Error("Not authenticated");
      if (!userId || userId === me) return true;

      // Block-Status prüfen
      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      if (blockedByMe.has(userId)) throw new Error("Cannot follow a user you blocked.");
      if (blockedMe.has(userId)) throw new Error("This user has blocked you.");

      // Zielprofil prüfen
      const target = await ctx.prisma.profile.findUnique({
        where: { id: userId },
        select: { id: true, isPrivate: true },
      });
      if (!target) throw new Error("User not found");

      // schon gefolgt? => idempotent
      const existingFollow = await ctx.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: me, followingId: userId } },
        select: { followerId: true },
      });
      if (existingFollow) return true;

      // =========================
      // PRIVATE -> REQUEST
      // =========================
      if (target.isPrivate) {
        // request idempotent anlegen
        const createdReq = await ctx.prisma.$transaction(async (tx) => {
          try {
            await tx.followRequest.create({
              data: { requesterId: me, targetId: userId },
            });
            return true;
          } catch (e: any) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
              return false; // request exists
            }
            throw e;
          }
        });

        // notify nur wenn request neu
        if (createdReq) {
          await notify({
            prisma: ctx.prisma,
            channel: "ACTIVITY", // (oder INBOX wenn du willst)
            kind: "FOLLOW_REQUEST",
            recipientId: userId,
            fromUserId: me,
            actorId: me,
            payload: { type: "FOLLOW_REQUEST", status: "PENDING",text: "Neue Follow-Anfrage" },
          });
        }

        return true;
      }

      // =========================
      // PUBLIC -> FOLLOW
      // =========================
      const created = await ctx.prisma.$transaction(async (tx) => {
        return createFollowIdempotent(tx, me, userId);
      });

      if (created) {
        await notify({
          prisma: ctx.prisma,
          channel: "ACTIVITY",
          kind: "FOLLOW",
          recipientId: userId,
          fromUserId: me,
          actorId: me,
          payload: { text: "Folgt dir jetzt" },
        });
      }

      return true;
    },

    removeFollower: async (_: unknown, { userId }: { userId: string }, ctx: Ctx) => {
      const me = ctx.profileId;
      if (!me) throw new Error("Not authenticated");

      const followerId = userId;
      if (!followerId || followerId === me) return true;

      await ctx.prisma.$transaction(async (tx) => {
        // Follower entfernen: followerId -> me
        await deleteFollowIdempotent(tx, followerId, me);

        // Falls es nur eine offene Anfrage war (oder zusätzlich), auch entfernen
        await tx.followRequest.deleteMany({
          where: { requesterId: followerId, targetId: me },
        });
      });

      return true;
    },



    /**
     * UNFOLLOW
     * - wenn gefolgt -> entfolgen + counter korrekt
     * - wenn Anfrage offen -> Anfrage zurückziehen
     */
    unfollow: async (_: unknown, { userId }: { userId: string }, ctx: Ctx) => {
      const me = ctx.profileId;
      if (!me) throw new Error("Not authenticated");
      if (!userId || userId === me) return true;

      await ctx.prisma.$transaction(async (tx) => {
        const removed = await deleteFollowIdempotent(tx, me, userId);
        if (removed) return;

        // Falls kein Follow existiert -> Anfrage zurückziehen (idempotent)
        await tx.followRequest.deleteMany({
          where: { requesterId: me, targetId: userId },
        });
      });

      return true;
    },

    /**
     * FOLLOW REQUEST ACCEPT
     * (Profilinhaber bestätigt)
     *
     * Signatur: acceptFollowRequest(userId: ID!)
     * => userId ist der REQUESTER (der mir folgen will)
     */
    acceptFollowRequest: async (_: unknown, { userId }: { userId: string }, ctx: Ctx) => {
      const targetId = ctx.profileId;
      if (!targetId) throw new Error("Not authenticated");

      const requesterId = userId;
      if (!requesterId || requesterId === targetId) return true;

      const { blockedByMe, blockedMe } = await getBlockedSets(ctx);
      if (blockedByMe.has(requesterId) || blockedMe.has(requesterId)) throw new Error("Blocked");

      // Wir merken uns: gab es wirklich eine Request?
      const { hadRequest, createdFollow } = await ctx.prisma.$transaction(async (tx) => {
        const req = await tx.followRequest.findUnique({
          where: { requesterId_targetId: { requesterId, targetId } },
          select: { requesterId: true },
        });
        if (!req) return { hadRequest: false, createdFollow: false };

        await tx.followRequest.delete({
          where: { requesterId_targetId: { requesterId, targetId } },
        });

        const createdFollow = await createFollowIdempotent(tx, requesterId, targetId);
        return { hadRequest: true, createdFollow };
      });

      // ✅ WICHTIG: Status IMMER updaten, sobald die Request existierte
      if (hadRequest) {
        await ctx.prisma.notification.updateMany({
          where: {
            recipientId: targetId,
            kind: "FOLLOW_REQUEST",
            fromUserId: requesterId,
          },
          data: {
            payload: {
              type: "FOLLOW_REQUEST",
              status: "ACCEPTED",
              handledAt: new Date().toISOString(),
            } as any,
            isRead: true,
          },
        });

        // ✅ Notify nur wenn Follow wirklich neu entstanden ist (sonst spam)
        if (createdFollow) {
          await notify({
            prisma: ctx.prisma,
            channel: "ACTIVITY",
            kind: "FOLLOW_REQUEST_ACCEPTED",
            recipientId: requesterId,
            fromUserId: targetId,
            actorId: targetId,
            payload: { text: "Deine Anfrage wurde akzeptiert" },
          });
        }
      }

      return true;
    },


    /**
     * FOLLOW REQUEST REJECT
     * Signatur: rejectFollowRequest(userId: ID!)
     */
    rejectFollowRequest: async (_: unknown, { userId }: { userId: string }, ctx: Ctx) => {
      const targetId = ctx.profileId;
      if (!targetId) throw new Error("Not authenticated");
      const requesterId = userId;
      if (!requesterId || requesterId === targetId) return true;

      await ctx.prisma.followRequest.deleteMany({ where: { requesterId, targetId } });

      await ctx.prisma.notification.updateMany({
        where: { recipientId: targetId, kind: "FOLLOW_REQUEST", fromUserId: requesterId },
        data: {
          payload: { type: "FOLLOW_REQUEST", status: "REJECTED", handledAt: new Date().toISOString() } as any,
          isRead: true,
        },
      });

      return true;
    },
  },
};

export default followResolvers;
