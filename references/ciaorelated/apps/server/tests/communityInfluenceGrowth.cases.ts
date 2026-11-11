import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import {
  calculateCommunityInfluence, cumulativeGrowthUnits, influenceEntryPositions, DEFAULT_INFLUENCE_POLICY as policy,
  INFLUENCE_UNIT as U, DAY_MS, type InfluenceMember, type InfluenceSignal,
} from "../src/lib/communityInfluencePolicy";

const day = (n: number) => new Date(Date.UTC(2025, 0, n));
const member = (profileId: string, joined: Date, overrides: Partial<InfluenceMember> = {}): InfluenceMember => ({
  profileId, firstJoinedAt: joined, seniorityAt: joined, eligible: true,
  periods: [{ startedAt: joined, endedAt: null }], ...overrides,
});
const event = (m: InfluenceMember): InfluenceSignal => ({
  id: m.profileId, actorId: m.profileId, authorId: null, kind: "JOIN", occurredAt: m.firstJoinedAt,
});
const calc = (members: InfluenceMember[], events: InfluenceSignal[], start = day(3)) =>
  calculateCommunityInfluence({ members, events, start, end: new Date(start.getTime() + DAY_MS), policy });

export async function testCommunityInfluenceGrowth(t: TestContext) {
  await t.test("joining alone earns zero even in a huge existing community or in many communities", () => {
    const old = member("old", day(1), { growthCount: 100_000n, entryPosition: 1 });
    const newest = member("new", day(3), { entryPosition: 100_001 });
    for (let group = 0; group < 100; group++) {
      const credits = calc([old, newest], [event(newest)]);
      assert.equal(credits.find(c => c.profileId === newest.profileId), undefined);
    }
    assert.equal(cumulativeGrowthUnits(0n, 1, policy), 0n);
    assert.equal(cumulativeGrowthUnits(0n, 100_001, policy), 0n);
    assert.deepEqual(calc([old, newest], []), []);
  });

  await t.test("10 to 10000: quiet early membership greatly outgrows entry at 9000, without a 20-join cap", () => {
    const members: InfluenceMember[] = Array.from({ length: 10 }, (_, i) => member(`p${i + 1}`, day(1), { entryPosition: i + 1 }));
    for (let n = 11; n <= 10_000; n++) members.push(member(`p${n}`, new Date(day(3).getTime() + n * 10), { entryPosition: n }));
    const result = calc(members, members.slice(10).map(event));
    const early = result.find(c => c.profileId === "p10")!;
    const late = result.find(c => c.profileId === "p9000")!;
    assert.equal(early.growthCount, 9990n);
    assert.equal(late.growthCount, 1000n);
    assert.equal(early.communityUnits, cumulativeGrowthUnits(9990n, 10, policy));
    assert.equal(late.communityUnits, cumulativeGrowthUnits(1000n, 9000, policy));
    assert.ok(early.communityUnits > 60n * late.communityUnits);
    assert.equal(result.find(c => c.profileId === "p10000"), undefined);
    assert.equal(early.participationUnits, 0n);
    assert.equal(early.resonanceUnits, 0n);
    assert.ok(early.communityUnits > cumulativeGrowthUnits(2n, 10, policy) * 10_000n);
  });

  await t.test("a new member inherits neither the community's historical size nor growth of current members", () => {
    const newcomer = member("new", day(2), { entryPosition: 9000, growthCount: 0n });
    const next = member("next", day(3), { entryPosition: 9001 });
    const result = calc([member("old", day(1), { growthCount: 8000n, entryPosition: 10 }), newcomer, next], [event(next)]);
    const credit = result.find(c => c.profileId === "new")!;
    assert.equal(credit.growthCount, 1n);
    assert.equal(credit.communityUnits, cumulativeGrowthUnits(1n, 9000, policy));
    assert.ok(credit.communityUnits < 9n * U);
    assert.ok(result.find(c => c.profileId === "old")!.communityUnits > credit.communityUnits);
  });

  await t.test("activity in a non-growing community has no automatic early multiplier", () => {
    const members = [member("old", day(1), { entryPosition: 1, growthCount: 100_000n }), member("new", day(2), { entryPosition: 100_001 })];
    const result = calc(members, [{ id: "reaction", kind: "INTERACTION", actorId: "new", authorId: "old", occurredAt: day(3) }]);
    assert.equal(result.find(c => c.profileId === "old")!.communityUnits, U / 4n);
    assert.equal(result.find(c => c.profileId === "new")!.communityUnits, U / 4n);
    assert.equal(result.find(c => c.profileId === "new")!.participationUnits, U);
    assert.equal(result.find(c => c.profileId === "old")!.resonanceUnits, 2n * U);
    assert.ok(result.every(c => c.growthCount === 0n));
  });

  await t.test("burst growth and the same growth spread across days yield exactly the same cumulative credits", () => {
    const simulate = (batches: number[]) => {
      const members = [member("early", day(1), { entryPosition: 1, growthCount: 0n })];
      let total = 0n, joined = 0;
      for (let i = 0; i < batches.length; i++) {
        const start = day(3 + i), events: InfluenceSignal[] = [];
        for (let j = 0; j < batches[i]; j++) {
          const m = member(`new${joined++}`, new Date(start.getTime() + (j + 1) * 1000));
          members.push(m); events.push(event(m));
        }
        const positions = influenceEntryPositions(members), credits = calc(members, events, start);
        for (const m of members) {
          m.entryPosition ??= positions.get(m.profileId);
          const c = credits.find(c => c.profileId === m.profileId);
          m.growthCount = (m.growthCount ?? 0n) + (c?.growthCount ?? 0n);
        }
        total += credits.find(c => c.profileId === "early")!.units;
      }
      return { total, growth: members[0].growthCount };
    };
    assert.deepEqual(simulate([60]), simulate([20, 20, 20]));
    assert.equal(simulate([60]).total, cumulativeGrowthUnits(60n, 1, policy));
  });

  await t.test("absence neither earns growth nor increases the counter used after rejoining", () => {
    const start = day(3).getTime();
    const early = member("early", day(1), { entryPosition: 1, growthCount: 5n, periods: [
      { startedAt: day(1), endedAt: new Date(start + 1000) },
      { startedAt: new Date(start + 3000), endedAt: null },
    ] });
    const a = member("a", new Date(start + 500)), b = member("b", new Date(start + 2000)), c = member("c", new Date(start + 4000));
    const result = calc([early, a, b, c], [event(a), event(b), event(c)]).find(c => c.profileId === "early")!;
    assert.equal(result.growthCount, 2n);
    assert.equal(result.communityUnits, cumulativeGrowthUnits(7n, 1, policy) - cumulativeGrowthUnits(5n, 1, policy));
  });

  await t.test("simultaneous first joins cannot award each other growth, and event timestamps do not change that", () => {
    const a = member("a", day(3)), b = member("b", day(3));
    const events = [event(a), { ...event(b), occurredAt: new Date(day(3).getTime() + 100) }];
    assert.deepEqual(calc([a, b], events), []);
    const result = calc([member("old", day(1)), a, b], events);
    assert.equal(result.length, 1);
    assert.equal(result[0].growthCount, 2n);
  });

  await t.test("Dach seniority affects only future growth; stored positions do not shift after other profiles disappear", () => {
    const older = member("older", day(2), { seniorityAt: day(-100), growthCount: 0n });
    const newer = member("newer", day(2), { seniorityAt: day(-1), growthCount: 0n });
    const positions = influenceEntryPositions([older, newer]);
    assert.equal(positions.get("older"), 1);
    assert.equal(positions.get("newer"), 2);
    assert.deepEqual(calc([older, newer], []), []);
    newer.entryPosition = 2;
    assert.equal(influenceEntryPositions([newer]).get("newer"), 2);
    assert.ok(cumulativeGrowthUnits(1000n, 10, policy) > cumulativeGrowthUnits(1000n, 9000, policy));
  });

  await t.test("multiple earned community positions add fully, with no activity or top-community gate", () => {
    const m = member("quiet", day(1), { growthCount: 50n, entryPosition: 1 });
    const n = member("new", day(3));
    const perGroup = calc([m, n], [event(n)]).find(c => c.profileId === "quiet")!;
    assert.ok(perGroup.units > 0n);
    assert.equal(Array.from({ length: 50 }, () => calc([m, n], [event(n)]).find(c => c.profileId === "quiet")!.units)
      .reduce((a, b) => a + b, 0n), 50n * perGroup.units);
  });

  await t.test("growth range counting matches a naive membership oracle across out-of-order join commits and gaps", () => {
    const start = day(3).getTime(), end = start + DAY_MS;
    const existing = Array.from({ length: 30 }, (_, i) => member(`old${i}`, day(1), { periods: [
      { startedAt: day(1), endedAt: new Date(start + i * 13) },
      { startedAt: new Date(start + 1000 + i * 17), endedAt: null },
    ] }));
    const fresh = Array.from({ length: 70 }, (_, i) => member(`fresh${i}`, new Date(start + (i + 1) * 30)));
    const events = fresh.map((m, i) => ({ ...event(m), occurredAt: new Date(m.firstJoinedAt.getTime() + (69 - i) % 9 * 50) }));
    const members = [...existing, ...fresh], result = calc(members, [...events].reverse());
    for (const m of members) {
      const expected = events.filter(e => members.find(p => p.profileId === e.actorId)!.firstJoinedAt > m.firstJoinedAt &&
        m.periods.some(p => p.startedAt <= e.occurredAt && (!p.endedAt || p.endedAt > e.occurredAt)) && e.occurredAt.getTime() < end).length;
      assert.equal(result.find(c => c.profileId === m.profileId)?.growthCount ?? 0n, BigInt(expected), m.profileId);
    }
  });

  await t.test("growth accounting rejects negative, unsafe or invalid checkpoints", () => {
    for (const count of [-1n, BigInt(Number.MAX_SAFE_INTEGER) + 1n]) assert.throws(() => cumulativeGrowthUnits(count, 1, policy), /INVALID_GROWTH_POSITION/);
    assert.throws(() => cumulativeGrowthUnits(1n, 0, policy), /INVALID_GROWTH_POSITION/);
  });
}
