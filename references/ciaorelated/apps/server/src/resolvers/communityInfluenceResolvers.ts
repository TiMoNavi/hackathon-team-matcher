import { GraphQLError } from "graphql";
import { Prisma } from "@prisma/client";
import type { Ctx } from "../context";
import { getSignedGetUrl } from "../s3";
import { influenceRankingPolicy } from "../lib/communityInfluenceRanking";

const profileSelect = { id: true, username: true, name: true, avatarUrl: true, avatarThumbKey: true, bannedUntil: true } as const;
const groupSelect = { id: true, title: true, type: true, visibility: true, imageKey: true, isActive: true, expiresAt: true,
  ownerId: true, owner: { select: { bannedUntil: true } } } as const;
const fail = (code: string): never => { throw new GraphQLError(code, { extensions: { code } }); };
const banned = (p: { bannedUntil: Date | null }, now: Date) => !!p.bannedUntil && p.bannedUntil >= now;
const live = (g: { visibility: string; isActive: boolean; expiresAt: Date | null; owner: { bannedUntil: Date | null } }, now: Date) =>
  g.visibility === "PUBLIC" && g.isActive && (!g.expiresAt || g.expiresAt > now) && !banned(g.owner, now);

async function viewer(ctx: Ctx, db: Pick<Prisma.TransactionClient, "profile"> = ctx.prisma) {
  if (!ctx.profileId) return fail("UNAUTHENTICATED");
  const p = await db.profile.findUnique({ where: { id: ctx.profileId }, select: { ...profileSelect, accountId: true } });
  if (!p || (ctx.accountId && p.accountId !== ctx.accountId)) return fail("UNAUTHENTICATED");
  if (banned(p, new Date())) return fail("INFLUENCE_PROFILE_UNAVAILABLE");
  return p;
}

async function mediaUrl(key: string | null) {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  try { return await getSignedGetUrl(key); } catch { return null; }
}

export default {
  Query: {
    myCommunityInfluence: async (_: unknown, args: { offset?: number | null; limit?: number | null }, ctx: Ctx) =>
      ctx.prisma.$transaction(async tx => {
        const me = await viewer(ctx, tx), now = new Date();
        const histories = await tx.communityMembershipHistory.findMany({
          where: { OR: [{ profileId: me.id }, { influenceSupport: { recipientId: me.id } }] },
          select: { groupLinkId: true, profileId: true, firstJoinedAt: true, influenceEntryPosition: true, influenceGrowthCount: true,
            groupLink: { select: groupSelect }, profile: { select: profileSelect },
            periods: { where: { endedAt: null }, select: { id: true }, take: 1 },
            influenceSupport: { select: { recipientId: true, recipient: { select: profileSelect } } } },
          orderBy: [{ firstJoinedAt: "asc" }, { groupLinkId: "asc" }],
        });
        const sources = [...new Set([me.id, ...histories.map(h => h.profileId)])];
        const blocks = await tx.userBlock.findMany({ where: { OR: [{ blockerId: { in: sources } }, { blockedId: { in: sources } }] }, select: { blockerId: true, blockedId: true } });
        const pairKey = (a: string, b: string) => JSON.stringify([a, b].sort());
        const blockedPairs = new Set(blocks.map(b => pairKey(b.blockerId, b.blockedId)));
        const blocked = (a: string, b: string) => blockedPairs.has(pairKey(a, b));
        // Aggregate source-owned credits only. Received support never becomes assignable.
        const sums = await tx.communityInfluenceCredit.groupBy({
          by: ["groupLinkId", "profileId"], where: { history: { OR: [{ profileId: me.id }, { influenceSupport: { recipientId: me.id } }] } },
          _sum: { units: true, communityUnits: true, participationUnits: true, resonanceUnits: true },
        });
        const balances = new Map(sums.map(s => [JSON.stringify([s.groupLinkId, s.profileId]), s._sum]));
        const groupIds = [...new Set(histories.map(h => h.groupLinkId))];
        const settlements = await tx.communityInfluenceSettlement.groupBy({ by: ["groupLinkId"], where: { groupLinkId: { in: groupIds } }, _max: { periodEnd: true } });
        const through = new Map(settlements.map(s => [s.groupLinkId, s._max.periodEnd]));
        const settings = await tx.communityInfluenceSettings.findUnique({ where: { id: "default" }, select: { startsAt: true } });
        let earned = 0n, retained = 0n, assigned = 0n, received = 0n;
        const positions = [];
        for (const h of histories) {
          const g = h.groupLink, support = h.influenceSupport;
          const sum = balances.get(JSON.stringify([h.groupLinkId, h.profileId]));
          const amount = sum?.units ?? 0n;
          const usable = live(g, now) && !banned(h.profile, now) && !blocked(h.profileId, g.ownerId);
          if (h.profileId !== me.id) {
            if (usable && !blocked(me.id, h.profileId)) received += amount;
            continue;
          }
          earned += amount;
          const isMember = h.periods.length > 0;
          // Leaving a private community must not expose its subsequent metadata.
          if (g.visibility === "PRIVATE" && !isMember) continue;
          const target = support?.recipientId ? support.recipient : me;
          const targetAvailable = !!target && !banned(target, now) && !blocked(me.id, target.id);
          const supportState = !targetAvailable ? "UNAVAILABLE" : target.id === me.id ? "SELF" : "ASSIGNED";
          if (usable && targetAvailable) {
            if (target.id === me.id) retained += amount; else assigned += amount;
          }
          positions.push({ communityId: g.id, title: blocked(me.id, g.ownerId) ? "" : g.title,
            type: g.type, visibility: g.visibility, imageKey: blocked(me.id, g.ownerId) ? null : g.imageKey,
            isMember, joinedAt: h.firstJoinedAt, entryPosition: h.influenceEntryPosition,
            growthCount: h.influenceGrowthCount.toString(), settledThrough: through.get(g.id) ?? null,
            earnState: g.visibility === "PRIVATE" ? "PRIVATE" : !usable ? "UNAVAILABLE" : isMember ? "ACTIVE" : "PAUSED",
            canAssign: usable, supportState, recipient: targetAvailable ? target : null,
            earnedUnits: amount.toString(), communityUnits: (sum?.communityUnits ?? 0n).toString(),
            participationUnits: (sum?.participationUnits ?? 0n).toString(), resonanceUnits: (sum?.resonanceUnits ?? 0n).toString() });
        }
        const offset = Math.max(0, args.offset ?? 0), limit = Math.min(50, Math.max(1, args.limit ?? 20));
        return { profile: me, earnedUnits: earned.toString(), retainedUnits: retained.toString(), assignedUnits: assigned.toString(),
          receivedUnits: received.toString(), availableUnits: (retained + received).toString(),
          earningStartsAt: settings?.startsAt ?? null, rankingEnabled: influenceRankingPolicy(now) !== null,
          positions: positions.slice(offset, offset + limit), hasMore: positions.length > offset + limit };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }),

    communityInfluenceRecipients: async (_: unknown, { q, limit }: { q: string; limit?: number | null }, ctx: Ctx) => {
      const me = await viewer(ctx);
      const text = q.trim().slice(0, 80);
      if (!text) return [];
      const contains = text.replace(/[\\%_]/g, "\\$&");
      return ctx.prisma.profile.findMany({ where: {
        id: { not: me.id }, AND: [
          { OR: [{ bannedUntil: null }, { bannedUntil: { lt: new Date() } }] },
          { OR: [{ username: { contains, mode: "insensitive" } }, { name: { contains, mode: "insensitive" } }] },
        ], blocksByMe: { none: { blockedId: me.id } }, blockedMe: { none: { blockerId: me.id } },
      }, select: profileSelect, orderBy: [{ username: "asc" }, { id: "asc" }], take: Math.min(20, Math.max(1, limit ?? 20)) });
    },
  },
  Mutation: {
    setCommunityInfluenceRecipient: async (_: unknown, { communityId, recipientId, expectedProfileId }: { communityId: string; recipientId?: string | null; expectedProfileId: string }, ctx: Ctx) =>
      ctx.prisma.$transaction(async tx => {
        const me = await viewer(ctx, tx);
        if (me.id !== expectedProfileId) return fail("INFLUENCE_PROFILE_CHANGED");
        await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
        // Same lock order as settlement: community, then history. Serializes switches.
        await tx.$queryRaw`SELECT id FROM "GroupLink" WHERE id = ${communityId} FOR SHARE`;
        await tx.$queryRaw`SELECT "profileId" FROM "CommunityMembershipHistory" WHERE "groupLinkId" = ${communityId} AND "profileId" = ${me.id} FOR UPDATE`;
        const where = { groupLinkId_profileId: { groupLinkId: communityId, profileId: me.id } };
        const history = await tx.communityMembershipHistory.findUnique({ where, select: { groupLink: { select: groupSelect } } });
        if (!history) return fail("INFLUENCE_POSITION_NOT_FOUND");
        if (!recipientId || recipientId === me.id) {
          await tx.communityInfluenceSupport.deleteMany({ where: { groupLinkId: communityId, profileId: me.id } });
          return true;
        }
        if (!live(history.groupLink, new Date())) return fail("INFLUENCE_COMMUNITY_UNAVAILABLE");
        const recipient = await tx.profile.findUnique({ where: { id: recipientId }, select: profileSelect });
        const denied = await tx.userBlock.findFirst({ where: { OR: [
          { blockerId: me.id, blockedId: { in: [recipientId, history.groupLink.ownerId] } },
          { blockedId: me.id, blockerId: { in: [recipientId, history.groupLink.ownerId] } },
        ] }, select: { id: true } });
        if (!recipient || banned(recipient, new Date()) || denied) return fail("INFLUENCE_RECIPIENT_UNAVAILABLE");
        await tx.communityInfluenceSupport.upsert({ where, create: { groupLinkId: communityId, profileId: me.id, recipientId }, update: { recipientId } });
        return true;
      }),
  },
  CommunityInfluenceProfile: { avatarUrl: (p: { avatarUrl: string | null; avatarThumbKey: string | null }) => mediaUrl(p.avatarThumbKey || p.avatarUrl) },
  CommunityInfluencePosition: { imageUrl: (p: { imageKey: string | null }) => mediaUrl(p.imageKey) },
};
