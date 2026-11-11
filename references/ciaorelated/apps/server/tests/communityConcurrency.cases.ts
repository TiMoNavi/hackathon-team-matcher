import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { graphql, type GraphQLSchema } from "graphql";
import { recordCommunityInfluenceSettlement } from "../src/lib/communityInfluenceLedger";
import { effectiveInfluenceUnits } from "../src/lib/communityInfluenceRanking";

export async function testCommunityConcurrency(t: TestContext, prisma: PrismaClient, schema: GraphQLSchema) {
  await t.test("real PostgreSQL concurrent settlement, membership and support writes", { skip: process.env.TEST_DATABASE_ENGINE !== "postgres" }, async () => {
    const id = (s: string) => `concurrent_test_${s}`;
    const account = id("account"), owner = id("owner"), member = id("member"), a = id("a"), b = id("b"), group = id("group");
    const past = new Date("2025-01-01Z");
    await prisma.account.create({ data: { id: account } });
    try {
      for (const profileId of [owner, member, a, b]) await prisma.profile.create({ data: { id: profileId, username: profileId, accountId: account, createdAt: past } });
      await prisma.groupLink.create({ data: { id: group, code: group, slug: group, title: group, ownerId: owner, visibility: "PUBLIC", createdAt: past } });
      const joined = await Promise.all(Array.from({ length: 4 }, () => graphql({
        schema, source: `mutation($slug: String!) { joinGroupLink(slug: $slug) { id chatThread { id } } }`,
        variableValues: { slug: group }, contextValue: { prisma, profileId: member, accountId: account },
      })));
      for (const result of joined) assert.equal(result.errors, undefined, JSON.stringify(result.errors));
      assert.equal(new Set(joined.map(r => (r.data?.joinGroupLink as any).chatThread.id)).size, 1);
      assert.equal(await prisma.groupLinkMember.count({ where: { groupLinkId: group, profileId: member } }), 1);
      assert.equal(await prisma.communityMembershipHistory.count({ where: { groupLinkId: group, profileId: member } }), 1);
      assert.equal(await prisma.communityMembershipPeriod.count({ where: { groupLinkId: group, profileId: member, endedAt: null } }), 1);
      const input = { groupLinkId: group, periodStart: new Date("2025-01-02Z"), periodEnd: new Date("2025-01-03Z"),
        policyVersion: "concurrent-test-v1", evidenceHash: "d".repeat(64), budgetUnits: 100n, credits: [{ profileId: owner, units: 100n }] };
      const booked = await Promise.all(Array.from({ length: 4 }, () => recordCommunityInfluenceSettlement(prisma, input)));
      assert.equal(booked.filter(r => !r.reused).length, 1);
      assert.equal(new Set(booked.map(r => r.settlement.id)).size, 1);
      assert.equal(await prisma.communityInfluenceCredit.count({ where: { groupLinkId: group } }), 1);
      const source = `mutation($g:ID!,$to:ID,$me:ID!){setCommunityInfluenceRecipient(communityId:$g,recipientId:$to,expectedProfileId:$me)}`;
      const assigned = await Promise.all([a, b, null, a].map(to => graphql({ schema, source,
        variableValues: { g: group, to, me: owner }, contextValue: { prisma, profileId: owner, accountId: account },
      })));
      for (const result of assigned) assert.equal(result.errors, undefined, JSON.stringify(result.errors));
      const balances = await effectiveInfluenceUnits(prisma, [owner, a, b]);
      assert.equal([...balances.values()].reduce((n, value) => n + value, 0n), 100n);
      assert.equal([...balances.values()].filter(n => n > 0n).length, 1);
      assert.ok(await prisma.communityInfluenceSupport.count({ where: { groupLinkId: group } }) <= 1);
    } finally {
      await prisma.threadMember.deleteMany({ where: { userId: { in: [owner, member, a, b] } } });
      await prisma.thread.deleteMany({ where: { groupKey: `community:${group}` } });
      await prisma.account.delete({ where: { id: account } });
    }
  });
}
