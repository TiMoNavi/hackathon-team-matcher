import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { graphql, parse, validate, type GraphQLSchema } from "graphql";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { recordCommunityInfluenceSettlement } from "../src/lib/communityInfluenceLedger";
import { formatInfluence } from "../../ciaorelated/src/lib/communityInfluence";
import { effectiveInfluenceUnits } from "../src/lib/communityInfluenceRanking";

const overviewQuery = `query Overview($offset:Int,$limit:Int) { myCommunityInfluence(offset:$offset,limit:$limit) {
  profile { id username avatarUrl } earnedUnits retainedUnits assignedUnits receivedUnits availableUnits rankingEnabled earningStartsAt hasMore
  positions { communityId title visibility isMember canAssign earnState supportState earnedUnits communityUnits participationUnits resonanceUnits
    entryPosition growthCount settledThrough recipient { id username avatarUrl } }
} }`;
const mutation = `mutation Assign($communityId:ID!,$recipientId:ID,$expectedProfileId:ID!) {
  setCommunityInfluenceRecipient(communityId:$communityId,recipientId:$recipientId,expectedProfileId:$expectedProfileId)
}`;

export async function testCommunityInfluenceSupport(t: TestContext, prisma: PrismaClient, schema: GraphQLSchema) {
  const prefix = "support_test_", id = (s: string) => prefix + s;
  const a = id("a"), b = id("b"), c = id("c"), d = id("d"), group = id("group"), privateGroup = id("private");
  const date = (n: number) => new Date(Date.UTC(2025, 0, n));
  const U = 1_000_000n;
  const query = (source: string, profileId: string | undefined = a, variableValues: any = {}, accountId = id("account")) =>
    graphql({ schema, source, variableValues, contextValue: { prisma, profileId, accountId } });
  const success = (result: any) => { assert.equal(result.errors, undefined, JSON.stringify(result.errors)); return result.data; };
  const overview = async (who = a, variables = {}) => {
    const result = success(await query(overviewQuery, who, variables)).myCommunityInfluence;
    const ranking = await effectiveInfluenceUnits(prisma, [who]);
    assert.equal(String(ranking.get(who) ?? 0n), result.availableUnits, "Ranking and overview must route/suspend support identically");
    return result;
  };
  const assign = (who: string, recipientId: string | null, communityId = group, expectedProfileId = who) =>
    query(mutation, who, { communityId, recipientId, expectedProfileId });
  const pos = (o: any) => o.positions.find((p: any) => p.communityId === group);
  const book = (day: number, credits: { profileId: string; units: bigint }[]) => recordCommunityInfluenceSettlement(prisma, {
    groupLinkId: group, periodStart: date(day), periodEnd: date(day + 1), policyVersion: "support-test-v1", evidenceHash: "b".repeat(64),
    budgetUnits: credits.reduce((n, c) => n + c.units, 0n), credits,
  });
  await prisma.account.create({ data: { id: id("account") } });
  for (const profileId of [a, b, c, d]) await prisma.profile.create({ data: { id: profileId, username: profileId, accountId: id("account"), isPrivate: profileId === c, createdAt: date(1) } });
  for (const [groupId, visibility] of [[group, "PUBLIC"], [privateGroup, "PRIVATE"]] as const) await prisma.groupLink.create({ data: {
    id: groupId, code: groupId, title: groupId, ownerId: a, visibility, createdAt: date(1), members: { create: { profileId: b, joinedAt: date(1) } },
  } });
  await book(2, [{ profileId: a, units: 100n * U }, { profileId: b, units: 20n * U }]);
  try {
    await t.test("support migration is inert; overview exposes only own positions and exact totals", async () => {
      assert.equal(await prisma.communityInfluenceSupport.count(), 0);
      const o = await overview();
      assert.equal(o.profile.id, a); assert.equal(o.earnedUnits, String(100n * U));
      assert.equal(o.retainedUnits, o.earnedUnits); assert.equal(o.availableUnits, o.earnedUnits);
      assert.equal(o.receivedUnits, "0"); assert.equal(o.assignedUnits, "0"); assert.equal(o.rankingEnabled, false);
      assert.equal(pos(o).recipient.id, a); assert.equal(pos(o).supportState, "SELF");
      assert.equal(new Date(pos(o).settledThrough).toISOString(), date(3).toISOString());
      assert.equal(o.positions.find((p: any) => p.communityId === privateGroup).earnState, "PRIVATE");
      assert.equal((await overview(c)).positions.length, 0);
      assert.equal(schema.getType("CommunityInfluenceProfile")!.toString(), "CommunityInfluenceProfile");
      assert.ok((await query("{ myCommunityInfluence { profile { account { id } } } }", a)).errors);
    });
    await t.test("entire own position routes once; future credits follow without moving the ledger", async () => {
      success(await assign(a, b)); success(await assign(a, b));
      assert.equal(await prisma.communityInfluenceSupport.count({ where: { profileId: a } }), 1);
      assert.equal((await overview()).retainedUnits, "0");
      assert.equal((await overview()).assignedUnits, String(100n * U));
      assert.equal((await overview(b)).receivedUnits, String(100n * U));
      await book(3, [{ profileId: a, units: 50n * U }]);
      const o = await overview(b);
      assert.equal(o.availableUnits, String(170n * U)); assert.equal(o.earnedUnits, String(20n * U));
      assert.equal((await overview()).assignedUnits, String(150n * U));
      assert.equal(await prisma.communityInfluenceCredit.count({ where: { groupLinkId: group } }), 3);
    });
    await t.test("received support cannot pass through chains or cycles, including same-account profiles", async () => {
      success(await assign(b, c));
      assert.equal((await overview(c)).receivedUnits, String(20n * U));
      assert.equal((await overview(b)).availableUnits, String(150n * U));
      assert.ok((await assign(c, d)).errors, "Receiving support does not create an owned position");
      success(await assign(b, a));
      assert.equal((await overview(a)).availableUnits, String(20n * U));
      assert.equal((await overview(b)).availableUnits, String(150n * U));
      success(await assign(b, c));
    });
    await t.test("switch and revoke remove prior support immediately, with no copied balances", async () => {
      success(await assign(a, c));
      assert.equal((await overview(b)).receivedUnits, "0");
      assert.equal((await overview(c)).receivedUnits, String(170n * U));
      success(await assign(a, null)); success(await assign(a, a));
      assert.equal((await overview(c)).receivedUnits, String(20n * U));
      assert.equal((await overview(a)).retainedUnits, String(150n * U));
      assert.equal(await prisma.communityInfluenceSupport.count({ where: { profileId: a } }), 0);
    });
    await t.test("authentication, ownership, profile-switch guard and private source cannot be bypassed", async () => {
      assert.ok((await graphql({ schema, source: overviewQuery, contextValue: { prisma } })).errors);
      assert.ok((await query(overviewQuery, a, {}, "wrong-account")).errors);
      assert.ok((await assign(a, b, group, b)).errors);
      assert.ok((await assign(c, b)).errors);
      assert.ok((await assign(a, b, privateGroup)).errors);
      assert.ok((await assign(a, "missing")).errors);
      assert.equal((await overview(a)).retainedUnits, String(150n * U));
    });
    await t.test("blocks in either direction suspend support, hide targets and prevent new assignments", async () => {
      success(await assign(a, c));
      for (const [blockerId, blockedId] of [[a, c], [c, a]]) {
        const block = await prisma.userBlock.create({ data: { blockerId, blockedId } });
        assert.equal((await overview(c)).receivedUnits, String(20n * U));
        assert.equal((await overview(a)).assignedUnits, "0");
        assert.equal(pos(await overview(a)).recipient, null);
        assert.equal(pos(await overview(a)).supportState, "UNAVAILABLE");
        assert.ok((await assign(a, c)).errors);
        await prisma.userBlock.delete({ where: { id: block.id } });
        assert.equal((await overview(c)).receivedUnits, String(170n * U));
      }
      const block = await prisma.userBlock.create({ data: { blockerId: b, blockedId: a } });
      assert.equal((await overview(c)).receivedUnits, String(150n * U), "Source blocking its community owner suspends that source consistently");
      await prisma.userBlock.delete({ where: { id: block.id } });
    });
    await t.test("banned recipients/sources and unavailable communities pause totals without deleting credits", async () => {
      await prisma.profile.update({ where: { id: c }, data: { bannedUntil: new Date("2999-01-01") } });
      assert.equal((await overview(a)).assignedUnits, "0"); assert.ok((await assign(a, c)).errors);
      assert.ok((await query(overviewQuery, c)).errors);
      await prisma.profile.update({ where: { id: c }, data: { bannedUntil: null } });
      await prisma.profile.update({ where: { id: b }, data: { bannedUntil: new Date("2999-01-01") } });
      assert.equal((await overview(c)).receivedUnits, String(150n * U));
      await prisma.profile.update({ where: { id: b }, data: { bannedUntil: null } });
      await prisma.groupLink.update({ where: { id: group }, data: { isActive: false } });
      assert.equal((await overview(c)).receivedUnits, "0");
      assert.equal((await overview(a)).earnedUnits, String(150n * U));
      assert.ok((await assign(a, b)).errors);
      success(await assign(a, null));
      await prisma.groupLink.update({ where: { id: group }, data: { isActive: true } });
    });
    await t.test("public exit preserves assignable credits; private exit hides its metadata", async () => {
      await prisma.groupLinkMember.deleteMany({ where: { profileId: b } });
      const o = await overview(b);
      assert.equal(o.positions.length, 1); assert.equal(pos(o).earnState, "PAUSED");
      assert.equal(pos(o).canAssign, true); assert.equal(pos(o).earnedUnits, String(20n * U));
      success(await assign(b, a));
      assert.equal((await overview(a)).receivedUnits, String(20n * U));
    });
    await t.test("recipient search is compact, literal, bounded and hides blocked/banned targets", async () => {
      const search = (q: string) => query("query($q:String!){ communityInfluenceRecipients(q:$q,limit:2){id username} }", a, { q });
      assert.equal(success(await search(" ")).communityInfluenceRecipients.length, 0);
      assert.equal(success(await search("%")).communityInfluenceRecipients.length, 0);
      assert.ok(success(await search(prefix)).communityInfluenceRecipients.every((p: any) => p.id !== a));
      const block = await prisma.userBlock.create({ data: { blockerId: c, blockedId: a } });
      await prisma.profile.update({ where: { id: d }, data: { bannedUntil: new Date("2999-01-01") } });
      assert.deepEqual(success(await search(prefix)).communityInfluenceRecipients.map((p: any) => p.id), [b]);
      await prisma.userBlock.delete({ where: { id: block.id } });
      await prisma.profile.update({ where: { id: d }, data: { bannedUntil: null } });
      const page = await overview(a, { limit: 1 });
      assert.equal(page.positions.length, 1); assert.equal(page.hasMore, true);
      assert.equal(page.earnedUnits, String(150n * U));
      assert.notEqual(page.positions[0].communityId, (await overview(a, { limit: 1, offset: 1 })).positions[0].communityId);
    });
    await t.test("deleted recipients fall back to self; history deletion cascades assignments", async () => {
      success(await assign(a, c));
      await prisma.profile.delete({ where: { id: c } });
      assert.equal(pos(await overview(a)).supportState, "SELF");
      assert.equal((await overview(a)).retainedUnits, String(150n * U));
      await assert.rejects(prisma.$transaction(tx => tx.communityInfluenceSupport.update({ where: { groupLinkId_profileId: { groupLinkId: group, profileId: a } }, data: { recipientId: a } })), /CommunityInfluenceSupport_not_self/);
      await prisma.groupLink.delete({ where: { id: group } });
      assert.equal(await prisma.communityInfluenceSupport.count({ where: { groupLinkId: group } }), 0);
      assert.equal((await overview(a)).earnedUnits, "0");
    });
    await t.test("mobile influence documents validate and large balances keep exact digits", () => {
      const file = readFileSync(resolve("apps/ciaorelated/src/graphql/queries/influence.ts"), "utf8");
      for (const match of file.matchAll(/gql`([\s\S]*?)`/g)) assert.deepEqual(validate(schema, parse(match[1])), []);
      assert.equal(formatInfluence("9007199254740993000000", "en"), "9,007,199,254,740,993");
      assert.equal(formatInfluence("123456789", "de"), "123,45");
      assert.equal(formatInfluence("1000000"), "1"); assert.equal(formatInfluence("0"), "0");
    });
  } finally { await prisma.account.deleteMany({ where: { id: id("account") } }); }
}
