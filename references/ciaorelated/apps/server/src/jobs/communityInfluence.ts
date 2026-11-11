import { Prisma, type GroupLink, type PrismaClient } from "@prisma/client";
import { recordCommunityInfluenceSettlementInTransaction } from "../lib/communityInfluenceLedger";
import {
  calculateCommunityInfluence, DAY_MS, DEFAULT_INFLUENCE_POLICY, influenceHash,
  influencePolicyVersion, parseInfluencePolicy, influenceEntryPositions, type InfluenceSignal,
} from "../lib/communityInfluencePolicy";

const floorDay = (date: Date) => new Date(Math.floor(date.getTime() / DAY_MS) * DAY_MS);

async function assertUtcDatabase(db: Pick<Prisma.TransactionClient, "$queryRaw">) {
  // Existing membership/default timestamps are TIMESTAMP WITHOUT TIME ZONE.
  // Activation must not mix local-clock legacy timestamps with UTC event times.
  const [row] = await db.$queryRaw<{ zone: string }[]>`SELECT current_setting('TimeZone') AS zone`;
  if (!["UTC", "ETC/UTC", "GMT", "ETC/GMT", "ETC/GMT0", "UCT", "ZULU"].includes(row.zone.toUpperCase())) {
    throw new Error(`INFLUENCE_REQUIRES_UTC_DATABASE actual=${row.zone}`);
  }
}

export async function configureCommunityInfluence(prisma: PrismaClient, options: { apply?: boolean; policy?: unknown } = {}) {
  await assertUtcDatabase(prisma);
  const policy = parseInfluencePolicy(options.policy ?? DEFAULT_INFLUENCE_POLICY);
  const policyVersion = influencePolicyVersion(policy);
  const existing = await prisma.communityInfluenceSettings.findUnique({ where: { id: "default" } });
  if (existing) {
    if (influencePolicyVersion(parseInfluencePolicy(existing.policy)) !== existing.policyVersion) throw new Error("INFLUENCE_POLICY_MISMATCH");
    if (existing.policyVersion !== policyVersion) throw new Error("INFLUENCE_POLICY_ALREADY_LOCKED");
    return { applied: true, reused: true, settings: existing };
  }
  // Administrative activation never invents historical events or partial first days.
  const startsAt = new Date(floorDay(new Date()).getTime() + DAY_MS);
  const data = { id: "default", startsAt, policyVersion, policy };
  if (!options.apply) return { applied: false, reused: false, settings: data };
  const settings = await prisma.communityInfluenceSettings.create({ data });
  return { applied: true, reused: false, settings };
}

async function qualifiedEvents(tx: Prisma.TransactionClient, groupLinkId: string, start: Date, end: Date): Promise<InfluenceSignal[]> {
  const from = Prisma.sql`${start.toISOString()}::timestamp(3)`;
  const until = Prisma.sql`${end.toISOString()}::timestamp(3)`;
  return tx.$queryRaw<InfluenceSignal[]>`
    SELECT e.id, e.kind, e."actorId", e."authorId", e."occurredAt"
    FROM "CommunityInfluenceEvent" e
    WHERE e."groupLinkId" = ${groupLinkId} AND e."occurredAt" >= ${from} AND e."occurredAt" < ${until}
      AND (e.kind = 'JOIN' OR (
        EXISTS (SELECT 1 FROM "Post" p WHERE p.id = e."postId" AND p."authorId" = e."authorId")
        AND EXISTS (SELECT 1 FROM "PostContext" pc JOIN "Context" c ON c.id = pc."contextId"
          WHERE pc."postId" = e."postId" AND pc.source = 'IMPORT' AND c."groupLinkId" = e."groupLinkId")
        AND NOT EXISTS (SELECT 1 FROM "PostContext" pc JOIN "Context" c ON c.id = pc."contextId"
          LEFT JOIN "GroupLink" g ON g.id = c."groupLinkId"
          WHERE pc."postId" = e."postId" AND pc.source = 'IMPORT'
            AND (c."groupLinkId" IS NOT NULL OR c.key LIKE 'group:%')
            AND (g.id IS NULL OR g.visibility <> 'PUBLIC' OR NOT g."isActive"))
        AND (EXISTS (SELECT 1 FROM "Like" l WHERE l."postId" = e."postId"
            AND l."userId" = e."actorId" AND l."createdAt" < ${until})
          OR EXISTS (SELECT 1 FROM "Comment" c WHERE c."postId" = e."postId"
            AND c."authorId" = e."actorId" AND c."createdAt" < ${until}))
        AND NOT EXISTS (SELECT 1 FROM "UserBlock" b
          WHERE (b."blockerId" = e."actorId" AND b."blockedId" = e."authorId")
             OR (b."blockerId" = e."authorId" AND b."blockedId" = e."actorId"))
      )) ORDER BY e."occurredAt", e.id
  `;
}

// One transaction owns both the evidence snapshot and its ledger entry. Event
// writers use a shared group lock; separate workers cannot close a day twice.
export async function settleCommunityInfluence(prisma: PrismaClient, options: {
  groupLinkId: string; start: Date; end: Date; apply?: boolean;
}) {
  return prisma.$transaction(async tx => {
    await assertUtcDatabase(tx);
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    const [group] = await tx.$queryRaw<GroupLink[]>`SELECT * FROM "GroupLink" WHERE id = ${options.groupLinkId} FOR UPDATE`;
    if (!group || group.visibility !== "PUBLIC" || !group.isActive) throw new Error("INFLUENCE_COMMUNITY_UNAVAILABLE");
    const settings = await tx.communityInfluenceSettings.findUnique({ where: { id: "default" } });
    if (!settings) throw new Error("INFLUENCE_NOT_ACTIVATED");
    const policy = parseInfluencePolicy(settings.policy);
    if (settings.policyVersion !== influencePolicyVersion(policy)) throw new Error("INFLUENCE_POLICY_MISMATCH");
    const { start, end } = options;
    const firstStart = new Date(Math.max(settings.startsAt.getTime(), group.createdAt.getTime()));
    const expectedEnd = new Date(Math.min(floorDay(start).getTime() + DAY_MS, group.expiresAt?.getTime() ?? Infinity));
    const closedBefore = new Date(Date.now() - 5 * 60_000);
    if (start < firstStart || end > closedBefore || end.getTime() !== expectedEnd.getTime() || start >= end) {
      throw new Error("INFLUENCE_INVALID_WINDOW");
    }
    const existing = await tx.communityInfluenceSettlement.findUnique({ where: {
      groupLinkId_periodStart_periodEnd: { groupLinkId: group.id, periodStart: start, periodEnd: end },
    } });
    if (existing) return { reused: true, applied: true, settlement: existing };
    const previous = await tx.communityInfluenceSettlement.findFirst({ where: { groupLinkId: group.id }, orderBy: { periodEnd: "desc" } });
    if (previous && previous.policyVersion !== settings.policyVersion) throw new Error("INFLUENCE_POLICY_TRANSITION_REQUIRED");
    if (start.getTime() !== (previous?.periodEnd ?? firstStart).getTime()) {
      throw new Error(`INFLUENCE_NONCONTIGUOUS_WINDOW expected=${(previous?.periodEnd ?? firstStart).toISOString()} received=${start.toISOString()}`);
    }
    const histories = await tx.communityMembershipHistory.findMany({
      where: { groupLinkId: group.id, firstJoinedAt: { lt: end } },
      select: { profileId: true, firstJoinedAt: true, seniorityAt: true, influenceEntryPosition: true, influenceGrowthCount: true,
        profile: { select: { bannedUntil: true } },
        periods: { where: { startedAt: { lt: end }, OR: [{ endedAt: null }, { endedAt: { gte: start } }] },
          orderBy: { startedAt: "asc" }, select: { startedAt: true, endedAt: true } },
      }, orderBy: { profileId: "asc" },
    });
    const now = new Date();
    const members = histories.map(({ profile, influenceEntryPosition, influenceGrowthCount, ...history }) => ({
      ...history, entryPosition: influenceEntryPosition, growthCount: influenceGrowthCount,
      eligible: !profile.bannedUntil || profile.bannedUntil < now,
    }));
    const events = await qualifiedEvents(tx, group.id, start, end);
    const credits = calculateCommunityInfluence({ start, end, members, events, policy });
    const positions = influenceEntryPositions(members);
    const budgetUnits = credits.reduce((sum, c) => sum + c.units, 0n);
    const input = { groupLinkId: group.id, periodStart: start, periodEnd: end,
      policyVersion: settings.policyVersion, evidenceHash: influenceHash({ policy, start, end, members, events }), budgetUnits, credits };
    if (!options.apply) return { reused: false, applied: false, preview: input };
    const booked = await recordCommunityInfluenceSettlementInTransaction(tx, input);
    if (!booked.reused) {
      const growth = new Map(credits.map(c => [c.profileId, c.growthCount]));
      const changed = members.filter(m => m.entryPosition === null || (growth.get(m.profileId) ?? 0n) > 0n);
      for (let offset = 0; offset < changed.length; offset += 500) {
        const rows = changed.slice(offset, offset + 500).map(m => Prisma.sql`(${m.profileId}::text, ${positions.get(m.profileId)!}::integer, ${(growth.get(m.profileId) ?? 0n).toString()}::bigint)`);
        await tx.$executeRaw`
          UPDATE "CommunityMembershipHistory" h SET "influenceEntryPosition" = v.position,
            "influenceGrowthCount" = h."influenceGrowthCount" + v.growth
          FROM (VALUES ${Prisma.join(rows)}) AS v(profile_id, position, growth)
          WHERE h."groupLinkId" = ${group.id} AND h."profileId" = v.profile_id
        `;
      }
    }
    return { ...booked, applied: true };
  }, { maxWait: 10_000, timeout: 60_000 });
}

export async function runCommunityInfluence(prisma: PrismaClient, options: { apply?: boolean } = {}) {
  const settings = await prisma.communityInfluenceSettings.findUnique({ where: { id: "default" } });
  if (!settings) return { active: false, communities: 0, days: 0, errors: [] as string[] };
  const closedBefore = new Date(Date.now() - 5 * 60_000);
  const activation = Prisma.sql`${settings.startsAt.toISOString()}::timestamp(3)`;
  const cutoff = Prisma.sql`${closedBefore.toISOString()}::timestamp(3)`;
  // Oldest outstanding day first: bounded work, without starving later group IDs.
  const groups = await prisma.$queryRaw<{ id: string; cursor: Date; expiresAt: Date | null }[]>`
    SELECT g.id, GREATEST(g."createdAt", ${activation}, COALESCE(s.last, ${activation})) AS cursor, g."expiresAt"
    FROM "GroupLink" g LEFT JOIN LATERAL (
      SELECT MAX("periodEnd") AS last FROM "CommunityInfluenceSettlement" WHERE "groupLinkId" = g.id
    ) s ON TRUE
    WHERE g.visibility = 'PUBLIC' AND g."isActive"
      AND LEAST(date_trunc('day', GREATEST(g."createdAt", ${activation}, COALESCE(s.last, ${activation}))) + interval '1 day',
        COALESCE(g."expiresAt", 'infinity'::timestamp)) <= ${cutoff}
      AND (g."expiresAt" IS NULL OR GREATEST(g."createdAt", ${activation}, COALESCE(s.last, ${activation})) < g."expiresAt")
    ORDER BY cursor, g.id LIMIT 100
  `;
  const result = { active: true, communities: groups.length, days: 0, errors: [] as string[], previews: [] as {
    groupLinkId: string; start: Date; end: Date; recipients: number; totalUnits: bigint;
    communityUnits: bigint; participationUnits: bigint; resonanceUnits: bigint;
  }[] };
  for (const group of groups) {
    let start = group.cursor;
    for (let day = 0; day < 7; day++) {
      const end = new Date(Math.min(floorDay(start).getTime() + DAY_MS, group.expiresAt?.getTime() ?? Infinity));
      if (end > closedBefore || end <= start) break;
      try {
        const outcome = await settleCommunityInfluence(prisma, { groupLinkId: group.id, start, end, apply: options.apply });
        if ("preview" in outcome && outcome.preview) {
          const p = outcome.preview;
          result.previews.push({ groupLinkId: group.id, start, end, recipients: p.credits.length, totalUnits: p.budgetUnits,
            communityUnits: p.credits.reduce((n, c) => n + c.communityUnits, 0n),
            participationUnits: p.credits.reduce((n, c) => n + c.participationUnits, 0n),
            resonanceUnits: p.credits.reduce((n, c) => n + c.resonanceUnits, 0n),
          });
        }
        result.days++;
      } catch (error) {
        result.errors.push(`${group.id}: ${error instanceof Error ? error.message : "settlement failed"}`);
        break;
      }
      if (!options.apply) break; // Preview does not advance the persisted cursor.
      start = end;
    }
  }
  return result;
}
