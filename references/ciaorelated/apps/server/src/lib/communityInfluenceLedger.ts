import { createHash } from "node:crypto";
import type { GroupLink, Prisma, PrismaClient } from "@prisma/client";

const MAX_UNITS = 9_223_372_036_854_775_807n;
const CHUNK_SIZE = 500;

export type CommunityInfluenceSettlementInput = {
  groupLinkId: string;
  periodStart: Date;
  periodEnd: Date;
  policyVersion: string;
  evidenceHash: string;
  budgetUnits: bigint;
  credits: ReadonlyArray<{ profileId: string; units: bigint; communityUnits?: bigint; participationUnits?: bigint; resonanceUnits?: bigint; growthCount?: bigint }>;
};

function normalizeInput(input: CommunityInfluenceSettlementInput) {
  const { groupLinkId, policyVersion, evidenceHash, budgetUnits } = input;
  const periodStart = new Date(input.periodStart.getTime());
  const periodEnd = new Date(input.periodEnd.getTime());
  if (!groupLinkId.trim() || !Number.isFinite(periodStart.getTime()) || !Number.isFinite(periodEnd.getTime()) ||
      periodStart >= periodEnd || periodEnd > new Date()) throw new Error("INFLUENCE_INVALID_PERIOD");
  if (!/^[a-zA-Z0-9_.:-]{1,64}$/.test(policyVersion) || !/^[a-f0-9]{64}$/.test(evidenceHash)) {
    throw new Error("INFLUENCE_INVALID_PROVENANCE");
  }
  if (typeof budgetUnits !== "bigint" || budgetUnits < 0n || budgetUnits > MAX_UNITS) throw new Error("INFLUENCE_INVALID_BUDGET");
  const seen = new Set<string>();
  let creditedUnits = 0n;
  const credits = input.credits.map(({ profileId, units, communityUnits = units, participationUnits = 0n, resonanceUnits = 0n, growthCount = 0n }) => {
    if (!profileId.trim() || seen.has(profileId)) throw new Error("INFLUENCE_DUPLICATE_OR_INVALID_PROFILE");
    if (typeof units !== "bigint" || units <= 0n || units > MAX_UNITS) throw new Error("INFLUENCE_INVALID_CREDIT");
    if (typeof growthCount !== "bigint" || growthCount < 0n || growthCount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("INFLUENCE_INVALID_GROWTH_COUNT");
    if ([communityUnits, participationUnits, resonanceUnits].some(n => typeof n !== "bigint" || n < 0n) ||
        communityUnits + participationUnits + resonanceUnits !== units) throw new Error("INFLUENCE_INVALID_BREAKDOWN");
    seen.add(profileId);
    creditedUnits += units;
    return { profileId, units, communityUnits, participationUnits, resonanceUnits, growthCount };
  }).sort((a, b) => a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0);
  if (creditedUnits > budgetUnits) throw new Error("INFLUENCE_BUDGET_EXCEEDED");
  const inputHash = createHash("sha256").update(JSON.stringify({
    groupLinkId, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), policyVersion, evidenceHash,
    budgetUnits: budgetUnits.toString(), credits: credits.map(c => [c.profileId, c.units.toString()]),
    // Keep hashes of legacy, unsegmented credits stable.
    ...(credits.some(c => c.participationUnits || c.resonanceUnits) ? {
      breakdown: credits.map(c => [c.profileId, c.communityUnits.toString(), c.participationUnits.toString(), c.resonanceUnits.toString()]),
    } : {}),
    ...(credits.some(c => c.growthCount) ? { growth: credits.map(c => [c.profileId, c.growthCount.toString()]) } : {}),
  })).digest("hex");
  return { groupLinkId, periodStart, periodEnd, policyVersion, evidenceHash, budgetUnits, creditedUnits, inputHash, credits };
}

// Internal only: caller supplies qualified credits, never a public minting API.
export async function recordCommunityInfluenceSettlement(prisma: PrismaClient, input: CommunityInfluenceSettlementInput) {
  return prisma.$transaction(tx => recordCommunityInfluenceSettlementInTransaction(tx, input), { maxWait: 10_000, timeout: 60_000 });
}

export async function recordCommunityInfluenceSettlementInTransaction(tx: Prisma.TransactionClient, input: CommunityInfluenceSettlementInput) {
  const { credits, ...data } = normalizeInput(input);
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    // Serialize settlements for one community, including differently shaped windows.
    // A retry cannot bypass this by changing policyVersion or using another job ID.
    const [group] = await tx.$queryRaw<Pick<GroupLink, "id" | "visibility" | "isActive" | "createdAt" | "expiresAt">[]>`
      SELECT id, visibility, "isActive", "createdAt", "expiresAt"
      FROM "GroupLink" WHERE id = ${data.groupLinkId} FOR UPDATE
    `;
    if (!group) throw new Error("INFLUENCE_COMMUNITY_NOT_FOUND");
    const existing = await tx.communityInfluenceSettlement.findUnique({ where: {
      groupLinkId_periodStart_periodEnd: { groupLinkId: data.groupLinkId, periodStart: data.periodStart, periodEnd: data.periodEnd },
    } });
    if (existing) {
      if (existing.inputHash !== data.inputHash) throw new Error("INFLUENCE_SETTLEMENT_CONFLICT");
      return { settlement: existing, reused: true };
    }
    if (group.visibility !== "PUBLIC" || !group.isActive) throw new Error("INFLUENCE_COMMUNITY_UNAVAILABLE");
    if (data.periodStart < group.createdAt || (group.expiresAt && data.periodEnd > group.expiresAt)) {
      throw new Error("INFLUENCE_OUTSIDE_COMMUNITY_LIFETIME");
    }
    const overlapping = await tx.communityInfluenceSettlement.findFirst({ where: {
      groupLinkId: data.groupLinkId, periodStart: { lt: data.periodEnd }, periodEnd: { gt: data.periodStart },
    }, select: { id: true } });
    if (overlapping) throw new Error("INFLUENCE_OVERLAPPING_PERIOD");

    for (let offset = 0; offset < credits.length; offset += CHUNK_SIZE) {
      const chunk = credits.slice(offset, offset + CHUNK_SIZE);
      const eligible = await tx.communityMembershipHistory.findMany({ where: {
        groupLinkId: data.groupLinkId, profileId: { in: chunk.map(c => c.profileId) },
        profile: { OR: [{ bannedUntil: null }, { bannedUntil: { lt: new Date() } }] },
        periods: { some: {
          startedAt: { lt: data.periodEnd }, OR: [{ endedAt: null }, { endedAt: { gt: data.periodStart } }],
        } },
      }, select: { profileId: true, periods: {
        where: { startedAt: { lt: data.periodEnd }, OR: [{ endedAt: null }, { endedAt: { gt: data.periodStart } }] },
        select: { startedAt: true, endedAt: true },
      } } });
      const hasPositiveMembership = eligible.every(history => history.periods.some(period =>
        Math.max(period.startedAt.getTime(), data.periodStart.getTime()) <
        Math.min(period.endedAt?.getTime() ?? data.periodEnd.getTime(), data.periodEnd.getTime())
      ));
      if (eligible.length !== chunk.length || !hasPositiveMembership) throw new Error("INFLUENCE_INELIGIBLE_PROFILE");
    }

    const settlement = await tx.communityInfluenceSettlement.create({ data });
    for (let offset = 0; offset < credits.length; offset += CHUNK_SIZE) {
      await tx.communityInfluenceCredit.createMany({ data: credits.slice(offset, offset + CHUNK_SIZE).map(credit => ({
        ...credit, settlementId: settlement.id, groupLinkId: data.groupLinkId,
      })) });
    }
    return { settlement, reused: false };
}
