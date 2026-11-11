import { createHash } from "node:crypto";

export const INFLUENCE_UNIT = 1_000_000n;
export const DAY_MS = 86_400_000;

// Initial calibration, not a fixed pool: personal earnings never divide by member count.
export const DEFAULT_INFLUENCE_POLICY = Object.freeze({
  growthReferenceMinProfiles: 100,
  growthPoints: 8,
  sharedActivityMilliPoints: 250,
  participationPoints: 1,
  resonancePoints: 2,
  maxActiveProfilesPerDay: 20,
  maxAuthorsPerActorPerDay: 10,
  maxReactorsPerAuthorPerDay: 20,
});
export type InfluencePolicy = { -readonly [K in keyof typeof DEFAULT_INFLUENCE_POLICY]: number };

export function parseInfluencePolicy(value: unknown): InfluencePolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INFLUENCE_INVALID_POLICY");
  const input = value as Record<string, unknown>;
  const policy: InfluencePolicy = { ...DEFAULT_INFLUENCE_POLICY };
  if (Object.keys(input).length !== Object.keys(policy).length) throw new Error("INFLUENCE_INVALID_POLICY");
  for (const key of Object.keys(policy) as (keyof InfluencePolicy)[]) {
    const n = input[key];
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 1 || n > 10_000) throw new Error("INFLUENCE_INVALID_POLICY");
    policy[key] = n;
  }
  return policy;
}

export const influenceHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v)).digest("hex");
export const influencePolicyVersion = (policy: InfluencePolicy) => `community-v2:${influenceHash(policy).slice(0, 24)}`;

export type InfluenceMember = {
  profileId: string;
  firstJoinedAt: Date;
  seniorityAt: Date;
  eligible: boolean;
  entryPosition?: number | null;
  growthCount?: bigint;
  periods: { startedAt: Date; endedAt: Date | null }[];
};
export type InfluenceSignal = {
  id: string;
  kind: "JOIN" | "INTERACTION";
  actorId: string;
  authorId: string | null;
  occurredAt: Date;
};
export type InfluenceCredit = {
  profileId: string;
  units: bigint;
  communityUnits: bigint;
  participationUnits: bigint;
  resonanceUnits: bigint;
  growthCount: bigint;
};

export function memberAt(member: InfluenceMember, at: Date): boolean {
  return member.periods.some(p => p.startedAt <= at && (!p.endedAt || p.endedAt > at));
}

// Freeze the first known position. Tied seniority dates share one position; the
// Dach baseline therefore still honours profile creation, without awarding old growth.
export function influenceEntryPositions(members: InfluenceMember[]): Map<string, number> {
  const ordered = [...members].sort((a, b) => a.seniorityAt.getTime() - b.seniorityAt.getTime());
  const result = new Map<string, number>();
  let position = 1;
  ordered.forEach((member, index) => {
    if (index && member.seniorityAt.getTime() !== ordered[index - 1].seniorityAt.getTime()) position = index + 1;
    const value = member.entryPosition ?? position;
    if (!Number.isSafeInteger(value) || value < 1) throw new Error("INFLUENCE_INVALID_GROWTH_POSITION");
    result.set(member.profileId, value);
  });
  return result;
}

// Credit differences, not the full cumulative value on every run. The reference
// softens tiny-community swings; no growth means zero early advantage.
export function cumulativeGrowthUnits(growth: bigint, entryPosition: number, policy: InfluencePolicy): bigint {
  if (growth < 0n || growth > BigInt(Number.MAX_SAFE_INTEGER) || !Number.isSafeInteger(entryPosition) || entryPosition < 1) {
    throw new Error("INFLUENCE_INVALID_GROWTH_POSITION");
  }
  const reference = Math.max(policy.growthReferenceMinProfiles, entryPosition);
  const bonus = BigInt(Math.floor(Math.log2(1 + Number(growth) / reference) * Number(INFLUENCE_UNIT)));
  return BigInt(policy.growthPoints) * growth * (INFLUENCE_UNIT + bonus);
}

function lowerBound(values: number[], target: number): number {
  let low = 0, high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] < target) low = middle + 1; else high = middle;
  }
  return low;
}

// Offline range counting avoids a members x joins loop during a large drop.
// A Fenwick tree holds event times of strictly later first joins. Each member
// queries only their active intervals, so neither same-time joins nor gaps earn growth.
function observedGrowth(members: InfluenceMember[], events: InfluenceSignal[], start: Date, end: Date): Map<string, bigint> {
  const byId = new Map(members.map(m => [m.profileId, m]));
  const times = events.map(e => e.occurredAt.getTime());
  const ordered = events.map((event, index) => ({ index, joined: byId.get(event.actorId)!.firstJoinedAt.getTime() }))
    .sort((a, b) => b.joined - a.joined);
  const tree = new Float64Array(events.length + 1);
  const prefix = (count: number) => {
    let sum = 0;
    for (let i = count; i > 0; i -= i & -i) sum += tree[i];
    return sum;
  };
  const result = new Map<string, bigint>();
  let cursor = 0;
  for (const member of [...members].sort((a, b) => b.firstJoinedAt.getTime() - a.firstJoinedAt.getTime())) {
    while (cursor < ordered.length && ordered[cursor].joined > member.firstJoinedAt.getTime()) {
      for (let i = ordered[cursor].index + 1; i < tree.length; i += i & -i) tree[i]++;
      cursor++;
    }
    if (!member.eligible) continue;
    let count = 0;
    for (const period of member.periods) {
      const from = Math.max(start.getTime(), period.startedAt.getTime());
      const until = Math.min(end.getTime(), period.endedAt?.getTime() ?? end.getTime());
      if (from < until) count += prefix(lowerBound(times, until)) - prefix(lowerBound(times, from));
    }
    if (count) result.set(member.profileId, BigInt(count));
  }
  return result;
}

export function calculateCommunityInfluence(input: {
  start: Date; end: Date; members: InfluenceMember[]; events: InfluenceSignal[]; policy: InfluencePolicy;
}): InfluenceCredit[] {
  const { start, end, members, policy } = input;
  if (!(start < end) || end.getTime() - start.getTime() > DAY_MS) throw new Error("INFLUENCE_INVALID_WINDOW");
  const byId = new Map(members.map(m => [m.profileId, m]));
  const positions = influenceEntryPositions(members);
  const credits = new Map<string, InfluenceCredit>();
  const credit = (id: string, part: "communityUnits" | "participationUnits" | "resonanceUnits", units: bigint) => {
    const c = credits.get(id) ?? { profileId: id, units: 0n, communityUnits: 0n, participationUnits: 0n, resonanceUnits: 0n, growthCount: 0n };
    c[part] += units; c.units += units; credits.set(id, c);
  };
  const events = input.events.filter(e => e.occurredAt >= start && e.occurredAt < end)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id));
  const lastInstant = new Date(end.getTime() - 1);
  // Exits can consume first joins, but returning old members never supply growth credit.
  let growthLeft = Math.max(0,
    members.filter(m => m.eligible && memberAt(m, lastInstant)).length -
    members.filter(m => m.eligible && memberAt(m, new Date(start.getTime() - 1))).length);
  const grown = new Set<string>(), active = new Set<string>(), pairs = new Set<string>();
  const participation = new Map<string, number>(), resonance = new Map<string, Set<string>>();
  const growthEvents: InfluenceSignal[] = [];
  for (const event of events) {
    if (event.kind !== "JOIN" || growthLeft <= 0 || grown.has(event.actorId)) continue;
    const actor = byId.get(event.actorId);
    if (!actor?.eligible || actor.firstJoinedAt > event.occurredAt) continue;
    if (!actor.periods.some(p => p.startedAt <= actor.firstJoinedAt && p.startedAt <= event.occurredAt && (!p.endedAt || p.endedAt >= end))) continue;
    grown.add(actor.profileId); growthLeft--;
    growthEvents.push(event);
  }
  for (const [profileId, count] of observedGrowth(members, growthEvents, start, end)) {
    const previous = byId.get(profileId)!.growthCount ?? 0n;
    const position = positions.get(profileId)!;
    credit(profileId, "communityUnits", cumulativeGrowthUnits(previous + count, position, policy) - cumulativeGrowthUnits(previous, position, policy));
    credits.get(profileId)!.growthCount = count;
  }
  const sharedCredit = (event: InfluenceSignal, base: bigint) => {
    for (const member of members) {
      if (!member.eligible || !memberAt(member, event.occurredAt)) continue;
      credit(member.profileId, "communityUnits", base);
    }
  };
  for (const event of events) {
    if (event.kind !== "INTERACTION") continue;
    const actor = byId.get(event.actorId);
    if (!actor?.eligible || !memberAt(actor, event.occurredAt)) continue;
    const author = event.authorId ? byId.get(event.authorId) : undefined;
    if (!author?.eligible || author.profileId === actor.profileId) continue;
    const pair = JSON.stringify([actor.profileId, author.profileId]);
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    if (!active.has(actor.profileId) && active.size < policy.maxActiveProfilesPerDay) {
      active.add(actor.profileId);
      sharedCredit(event, BigInt(policy.sharedActivityMilliPoints) * INFLUENCE_UNIT / 1000n);
    }
    const actions = participation.get(actor.profileId) ?? 0;
    if (actions < policy.maxAuthorsPerActorPerDay) {
      credit(actor.profileId, "participationUnits", BigInt(policy.participationPoints) * INFLUENCE_UNIT);
      participation.set(actor.profileId, actions + 1);
    }
    const reactors = resonance.get(author.profileId) ?? new Set<string>();
    if (memberAt(author, event.occurredAt) && !reactors.has(actor.profileId) && reactors.size < policy.maxReactorsPerAuthorPerDay) {
      credit(author.profileId, "resonanceUnits", BigInt(policy.resonancePoints) * INFLUENCE_UNIT);
      reactors.add(actor.profileId); resonance.set(author.profileId, reactors);
    }
  }
  return [...credits.values()].sort((a, b) => a.profileId.localeCompare(b.profileId));
}
