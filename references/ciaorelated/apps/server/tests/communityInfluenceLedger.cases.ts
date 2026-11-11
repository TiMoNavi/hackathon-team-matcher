import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { TestContext } from "node:test";
import type { PrismaClient } from "@prisma/client";
import type { GraphQLSchema } from "graphql";
import { recordCommunityInfluenceSettlement, type CommunityInfluenceSettlementInput } from "../src/lib/communityInfluenceLedger";

export async function testCommunityInfluenceLedger(t: TestContext, prisma: PrismaClient, schema: GraphQLSchema) {
  const id = (name: string) => `ledger_test_${name}`;
  const accountId = id("account"), owner = id("owner"), member = id("member"), sibling = id("sibling");
  const groupId = id("group"), privateId = id("private"), otherId = id("other");
  const date = (day: number) => new Date(Date.UTC(2025, 0, day));
  const evidenceHash = createHash("sha256").update("isolated ledger test evidence, not a production policy").digest("hex");
  const input = (start: number, overrides: Partial<CommunityInfluenceSettlementInput> = {}): CommunityInfluenceSettlementInput => ({
    groupLinkId: groupId, periodStart: date(start), periodEnd: date(start + 1), policyVersion: "test-only-v1", evidenceHash,
    budgetUnits: 100n, credits: [{ profileId: owner, units: 60n }, { profileId: member, units: 40n }], ...overrides,
  });
  const record = (value: CommunityInfluenceSettlementInput) => recordCommunityInfluenceSettlement(prisma, value);
  const balance = async (profileId: string, community = groupId) => (await prisma.communityInfluenceCredit.aggregate({
    where: { groupLinkId: community, profileId }, _sum: { units: true },
  }))._sum.units ?? 0n;
  const count = () => prisma.communityInfluenceSettlement.count({ where: { groupLinkId: groupId } });

  await prisma.account.create({ data: { id: accountId } });
  for (const profileId of [owner, member, sibling]) {
    await prisma.profile.create({ data: { id: profileId, username: profileId, accountId, createdAt: new Date("2024-01-01") } });
  }
  for (const [community, visibility] of [[groupId, "PUBLIC"], [privateId, "PRIVATE"], [otherId, "PUBLIC"]] as const) {
    await prisma.groupLink.create({ data: {
      id: community, code: community, title: community, ownerId: owner, createdAt: date(1), visibility,
      members: { create: [{ profileId: member, joinedAt: date(3) }, { profileId: sibling, joinedAt: date(3) }] },
    } });
  }
  try {
    await t.test("influence migration creates no credits and exposes no client-side minting API", async () => {
      assert.equal(await prisma.communityInfluenceSettlement.count(), 0);
      assert.equal(await prisma.communityInfluenceCredit.count(), 0);
      assert.deepEqual(Object.keys(schema.getMutationType()!.getFields()).filter(name => /influence|settlement|credit/i.test(name)), ["setCommunityInfluenceRecipient"]);
    });

    await t.test("exact and reordered retries reuse one settlement; changed evidence, policy or allocation conflict", async () => {
      const first = await record(input(4));
      assert.equal(first.reused, false);
      assert.equal(first.settlement.creditedUnits, 100n);
      const again = await record(input(4, { credits: [{ profileId: member, units: 40n }, { profileId: owner, units: 60n }] }));
      assert.equal(again.reused, true);
      assert.equal(again.settlement.id, first.settlement.id);
      assert.equal(await count(), 1);
      assert.equal(await balance(owner), 60n);
      assert.equal(await balance(member), 40n);
      for (const change of [
        { policyVersion: "test-only-v2" }, { evidenceHash: "b".repeat(64) }, { budgetUnits: 101n },
        { credits: [{ profileId: owner, units: 40n }, { profileId: member, units: 60n }] },
        { credits: [{ profileId: owner, units: 60n, growthCount: 1n }, { profileId: member, units: 40n }] },
      ]) await assert.rejects(record(input(4, change)), /INFLUENCE_SETTLEMENT_CONFLICT/);
      assert.equal(await count(), 1);
      assert.equal(await balance(member), 40n);
    });

    await t.test("overlapping windows cannot mint twice; adjacent windows and other communities are independent", async () => {
      for (const [start, end] of [[3, 5], [4, 6], [3, 6]] as const) {
        await assert.rejects(record(input(start, { periodEnd: date(end), credits: [] })), /INFLUENCE_OVERLAPPING_PERIOD/);
      }
      await assert.rejects(record(input(4, {
        periodStart: new Date(date(4).getTime() + 1), periodEnd: new Date(date(5).getTime() - 1), credits: [],
      })), /INFLUENCE_OVERLAPPING_PERIOD/);
      await record(input(5));
      await record(input(4, { groupLinkId: otherId }));
      assert.equal(await balance(member), 80n);
      assert.equal(await balance(member, otherId), 40n);
    });

    await t.test("units stay exact above JavaScript safe-integer range and cannot exceed the budget", async () => {
      const exact = 9_007_199_254_740_993n;
      await record(input(6, { budgetUnits: exact, credits: [{ profileId: sibling, units: exact }] }));
      assert.equal(await balance(sibling), exact);
      const invalid = [
        { budgetUnits: -1n }, { budgetUnits: 9_223_372_036_854_775_808n },
        { budgetUnits: 99n }, { credits: [{ profileId: member, units: 0n }] },
        { credits: [{ profileId: member, units: -1n }] },
        { credits: [{ profileId: member, units: 1n, growthCount: -1n }] },
        { credits: [{ profileId: member, units: 1n, growthCount: BigInt(Number.MAX_SAFE_INTEGER) + 1n }] },
        { credits: [{ profileId: member, units: 1n }, { profileId: member, units: 1n }] },
      ];
      for (const change of invalid) await assert.rejects(record(input(7, change)), /INFLUENCE_(INVALID|BUDGET_EXCEEDED|DUPLICATE)/);
      await record(input(7, { budgetUnits: 0n, credits: [] }));
      assert.equal((await record(input(7, { budgetUnits: 0n, credits: [] }))).reused, true);
    });

    await t.test("invalid dates, unfinished periods and missing provenance are rejected", async () => {
      const before = await count();
      for (const change of [
        { periodStart: new Date("invalid") }, { periodEnd: date(8) }, { periodEnd: date(7) },
        { periodEnd: new Date("2999-01-01") }, { policyVersion: "" }, { evidenceHash: "not-a-digest" },
      ]) await assert.rejects(record(input(8, change)), /INFLUENCE_INVALID/);
      assert.equal(await count(), before);
    });

    await t.test("only public active communities and overlapping membership periods can receive new credits", async () => {
      await assert.rejects(record(input(8, { groupLinkId: privateId })), /INFLUENCE_COMMUNITY_UNAVAILABLE/);
      await assert.rejects(record(input(8, { groupLinkId: "missing" })), /INFLUENCE_COMMUNITY_NOT_FOUND/);
      await assert.rejects(record(input(2)), /INFLUENCE_INELIGIBLE_PROFILE/, "Member did not join until day 3");
      await assert.rejects(record(input(0)), /INFLUENCE_OUTSIDE_COMMUNITY_LIFETIME/);
      await prisma.groupLink.update({ where: { id: groupId }, data: { isActive: false } });
      await assert.rejects(record(input(8)), /INFLUENCE_COMMUNITY_UNAVAILABLE/);
      assert.equal((await record(input(4))).reused, true, "Retry reports an existing receipt without minting more");
      await prisma.groupLink.update({ where: { id: groupId }, data: { isActive: true, expiresAt: date(8) } });
      await assert.rejects(record(input(8)), /INFLUENCE_OUTSIDE_COMMUNITY_LIFETIME/);
      await prisma.groupLink.update({ where: { id: groupId }, data: { expiresAt: null } });
      await prisma.profile.update({ where: { id: member }, data: { bannedUntil: new Date("2999-01-01") } });
      await assert.rejects(record(input(8)), /INFLUENCE_INELIGIBLE_PROFILE/);
      assert.equal(await balance(member), 80n, "Suspension does not erase existing accounting");
      await prisma.profile.update({ where: { id: member }, data: { bannedUntil: null } });
    });

    await t.test("exit keeps credits, absence earns nothing, and rejoin cannot claim absent intervals", async () => {
      await prisma.groupLinkMember.delete({ where: { groupLinkId_profileId: { groupLinkId: groupId, profileId: member } } });
      // Controlled historic boundaries, only inside this disposable test database.
      await prisma.communityMembershipPeriod.updateMany({ where: { groupLinkId: groupId, profileId: member }, data: { endedAt: date(8) } });
      await assert.rejects(record(input(8)), /INFLUENCE_INELIGIBLE_PROFILE/);
      assert.equal(await balance(member), 80n);
      await prisma.groupLinkMember.create({ data: { groupLinkId: groupId, profileId: member, joinedAt: date(10) } });
      await assert.rejects(record(input(9)), /INFLUENCE_INELIGIBLE_PROFILE/);
      await record(input(10));
      assert.equal(await balance(member), 120n);
      const first = await prisma.communityMembershipHistory.findUniqueOrThrow({ where: {
        groupLinkId_profileId: { groupLinkId: groupId, profileId: member },
      } });
      assert.equal(first.firstJoinedAt.getTime(), date(3).getTime());
      assert.equal(await balance(owner), 180n, "Separate profiles on one account keep separate balances");
      await prisma.communityMembershipPeriod.create({ data: {
        groupLinkId: groupId, profileId: member, startedAt: new Date(date(9).getTime() + 1000), endedAt: new Date(date(9).getTime() + 1000),
      } });
      await assert.rejects(record(input(9)), /INFLUENCE_INELIGIBLE_PROFILE/, "Zero-duration membership does not qualify");
    });

    await t.test("failure after writes rolls back the receipt and every credit before a successful retry", async () => {
      const before = await balance(member);
      const aborted = { $transaction: (work: any, options: any) => prisma.$transaction(async tx => {
        await work(tx);
        throw new Error("Expected interruption after writes");
      }, options) } as PrismaClient;
      await assert.rejects(recordCommunityInfluenceSettlement(aborted, input(11)), /Expected interruption/);
      assert.equal(await prisma.communityInfluenceSettlement.count({ where: { groupLinkId: groupId, periodStart: date(11) } }), 0);
      assert.equal(await balance(member), before);
      await record(input(11));
      assert.equal(await balance(member), before + 40n);
    });

    await t.test("database constraints reject cross-community credits, duplicate recipients and nonpositive units", async () => {
      const receipt = await prisma.communityInfluenceSettlement.findFirstOrThrow({ where: { groupLinkId: groupId } });
      await assert.rejects(prisma.$transaction(tx => tx.communityInfluenceCredit.create({ data: {
        settlementId: receipt.id, groupLinkId: otherId, profileId: sibling, units: 1n, communityUnits: 1n,
      } })), /Foreign key constraint/);
      await assert.rejects(prisma.$transaction(tx => tx.communityInfluenceCredit.create({ data: {
        settlementId: receipt.id, groupLinkId: groupId, profileId: owner, units: 1n, communityUnits: 1n,
      } })), /Unique constraint/);
      await assert.rejects(prisma.$transaction(tx => tx.communityInfluenceCredit.create({ data: {
        settlementId: receipt.id, groupLinkId: groupId, profileId: sibling, units: 0n,
      } })), /CommunityInfluenceCredit_positive/);
      await assert.rejects(prisma.$transaction(tx => tx.communityInfluenceCredit.create({ data: {
        settlementId: receipt.id, groupLinkId: groupId, profileId: sibling, units: 1n, communityUnits: 1n, growthCount: -1n,
      } })), /CommunityInfluenceCredit_growth_check/);
      for (const data of [{ influenceGrowthCount: -1n }, { influenceEntryPosition: 0 }]) {
        await assert.rejects(prisma.$transaction(tx => tx.communityMembershipHistory.update({
          where: { groupLinkId_profileId: { groupLinkId: groupId, profileId: owner } }, data,
        })), /CommunityMembershipHistory_influence_growth_check/);
      }
    });

    await t.test("deleting a profile or community removes its credits without resurrecting them on retry", async () => {
      const before = await balance(owner);
      await prisma.profile.delete({ where: { id: member } });
      assert.equal(await balance(member), 0n);
      assert.equal((await record(input(4))).reused, true);
      assert.equal(await balance(member), 0n);
      assert.equal(await balance(owner), before);
      await prisma.groupLink.delete({ where: { id: groupId } });
      assert.equal(await count(), 0);
      assert.equal(await prisma.communityInfluenceCredit.count({ where: { groupLinkId: groupId } }), 0);
      await assert.rejects(record(input(4)), /INFLUENCE_COMMUNITY_NOT_FOUND/);
    });
  } finally {
    await prisma.account.deleteMany({ where: { id: accountId } });
  }
}
