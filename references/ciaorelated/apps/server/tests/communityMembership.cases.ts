import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { graphql, type GraphQLSchema } from "graphql";

export async function testCommunityMembership(t: TestContext, prisma: PrismaClient, schema: GraphQLSchema) {
  const id = (name: string) => `privacy_test_history_${name}`;
  const accountId = "privacy_test_account";
  const owner = id("owner"), member = id("member"), sibling = id("sibling");
  const source = (operation: string, profileId: string, variableValues: Record<string, unknown>) =>
    graphql({ schema, source: operation, variableValues, contextValue: { prisma, accountId, profileId } });
  const success = (result: any) => { assert.equal(result.errors, undefined, JSON.stringify(result.errors)); return result.data; };
  for (const profileId of [owner, member, sibling]) {
    await prisma.profile.create({ data: { id: profileId, username: profileId, accountId, termsVersionAccepted: 1 } });
  }
  const group = await prisma.groupLink.create({ data: {
    id: id("group"), code: id("group"), slug: id("group"), title: "History private", ownerId: owner,
    context: { create: { key: `group:${id("group")}`, kind: "TOPIC", label: "History private" } },
  }, include: { context: true } });
  const post = await prisma.post.create({ data: { authorId: owner, postContexts: { create: { contextId: group.context!.id, source: "IMPORT" } } } });
  const where = (profileId = member) => ({ groupLinkId_profileId: { groupLinkId: group.id, profileId } });
  const history = (profileId = member) => prisma.communityMembershipHistory.findUniqueOrThrow({
    where: where(profileId), include: { periods: { orderBy: [{ startedAt: "asc" }, { id: "asc" }] } },
  });
  const join = async (profileId = member) => success(await source('mutation($slug:String!){ joinGroupLink(slug:$slug){id} }', profileId, { slug: group.slug }));
  const leave = async (profileId = member) => success(await source('mutation($groupId:ID!){ leaveGroup(groupId:$groupId) }', profileId, { groupId: group.id }));

  await t.test("history baseline preserves surviving membership evidence without inventing owner dates", async () => {
    const baseline = await prisma.communityMembershipHistory.findUniqueOrThrow({
      where: { groupLinkId_profileId: { groupLinkId: "privacy_legacy_group", profileId: "privacy_legacy_member" } }, include: { periods: true },
    });
    assert.equal(baseline.firstJoinedAt.toISOString(), "2026-01-15T12:00:00.000Z");
    assert.equal(baseline.origin, "BACKFILL");
    assert.equal(baseline.periods.length, 1);
    assert.equal(baseline.periods[0].endedAt, null);
    const ownerBaseline = await prisma.communityMembershipHistory.findUniqueOrThrow({
      where: { groupLinkId_profileId: { groupLinkId: "privacy_legacy_group", profileId: "privacy_legacy_owner" } },
    });
    assert.equal(ownerBaseline.firstJoinedAt.getTime(), ownerBaseline.recordedAt.getTime());
  });
  await t.test("new owners receive a history position without manufacturing membership rows", async () => {
    const row = await history(owner);
    assert.equal(row.origin, "OWNER");
    assert.equal(row.firstJoinedAt.getTime(), group.createdAt.getTime());
    assert.equal(row.periods.length, 1);
    assert.equal(await prisma.groupLinkMember.count({ where: { groupLinkId: group.id, profileId: owner } }), 0);
  });
  await t.test("repeat joins cannot replace first join or create multiple open periods", async () => {
    await join();
    const first = await history();
    await join();
    await join();
    const again = await history();
    assert.equal(again.firstJoinedAt.getTime(), first.firstJoinedAt.getTime());
    assert.equal(again.recordedAt.getTime(), first.recordedAt.getTime());
    assert.equal(again.periods.length, 1);
    assert.equal(again.periods[0].id, first.periods[0].id);
    assert.equal(again.origin, "JOIN");
    await assert.rejects(prisma.$transaction(tx => tx.communityMembershipPeriod.create({ data: { groupLinkId: group.id, profileId: member, startedAt: new Date() } })), /Unique constraint/);
  });
  await t.test("exit preserves history but revokes content; rejoin starts a separate interval", async () => {
    const first = await history();
    await leave();
    const departed = await history();
    assert.equal(await prisma.groupLinkMember.findUnique({ where: where() }), null);
    assert.ok(departed.periods[0].endedAt);
    const denied = success(await source('query($id:ID!){post(id:$id){id}}', member, { id: post.id }));
    assert.equal(denied.post, null, "History must not authorize private content");
    await join();
    const returned = await history();
    assert.equal(returned.firstJoinedAt.getTime(), first.firstJoinedAt.getTime());
    assert.equal(returned.periods.length, 2);
    const closed = returned.periods.find(p => p.endedAt !== null)!;
    const open = returned.periods.find(p => p.endedAt === null)!;
    assert.ok(open.startedAt >= closed.endedAt!);
    assert.equal(success(await source('query($id:ID!){post(id:$id){id}}', member, { id: post.id })).post.id, post.id);
  });
  await t.test("owner removal retains history like an exit, including repeated removal", async () => {
    const first = await history();
    for (let i = 0; i < 2; i++) success(await source('mutation($groupId:ID!,$profileId:ID!){removeGroupLinkMember(groupId:$groupId,profileId:$profileId)}', owner, { groupId: group.id, profileId: member }));
    const removed = await history();
    assert.equal(removed.firstJoinedAt.getTime(), first.firstJoinedAt.getTime());
    assert.ok(removed.periods.every(p => p.endedAt));
    await join();
    assert.equal((await history()).periods.length, first.periods.length + 1);
  });
  await t.test("rollback and same-transaction exit/rejoin keep interval boundaries consistent", async () => {
    const before = await history();
    await assert.rejects(prisma.$transaction(async tx => {
      await tx.groupLinkMember.delete({ where: where() });
      throw new Error("Expected rollback");
    }), /Expected rollback/);
    assert.deepEqual(await history(), before);
    await prisma.$transaction(async tx => {
      await tx.groupLinkMember.delete({ where: where() });
      await tx.groupLinkMember.create({ data: { groupLinkId: group.id, profileId: member } });
    });
    const after = await history();
    const closed = after.periods.filter(p => p.endedAt !== null);
    const open = after.periods.filter(p => p.endedAt === null);
    assert.equal(open.length, 1);
    assert.ok(closed.every(p => p.endedAt! <= open[0].startedAt));
    await assert.rejects(prisma.$transaction(tx => tx.groupLinkMember.update({ where: where(), data: { joinedAt: new Date("2025-01-01") } })), /COMMUNITY_MEMBERSHIP_IDENTITY_IMMUTABLE/);
  });
  await t.test("profiles on the same account have independent history and exits", async () => {
    await prisma.groupLinkMember.create({ data: { groupLinkId: group.id, profileId: sibling } });
    assert.equal((await history(sibling)).periods.length, 1);
    await leave();
    assert.equal((await history()).periods.filter(p => p.endedAt === null).length, 0);
    assert.equal((await history(sibling)).periods.filter(p => p.endedAt === null).length, 1);
  });
  await t.test("implicit owners remain active; changing ownership closes only a departed owner", async () => {
    await prisma.groupLinkMember.create({ data: { groupLinkId: group.id, profileId: owner } });
    await prisma.groupLinkMember.delete({ where: where(owner) });
    assert.equal((await history(owner)).periods.length, 1);
    assert.equal((await history(owner)).periods[0].endedAt, null);
    await prisma.groupLink.update({ where: { id: group.id }, data: { ownerId: sibling } });
    assert.ok((await history(owner)).periods[0].endedAt);
    assert.equal((await history(sibling)).periods.length, 1);
    await prisma.groupLink.update({ where: { id: group.id }, data: { ownerId: owner } });
    assert.equal((await history(owner)).periods.length, 2);
    assert.equal((await history(sibling)).periods[0].endedAt, null, "Former owner is still a current member");
  });
  await t.test("deleting a profile or community removes its history and intervals", async () => {
    await prisma.profile.delete({ where: { id: sibling } });
    assert.equal(await prisma.communityMembershipHistory.count({ where: { profileId: sibling } }), 0);
    assert.equal(await prisma.communityMembershipPeriod.count({ where: { profileId: sibling } }), 0);
    assert.ok(await prisma.communityMembershipHistory.count({ where: { groupLinkId: group.id } }));
    await prisma.groupLink.delete({ where: { id: group.id } });
    assert.equal(await prisma.communityMembershipHistory.count({ where: { groupLinkId: group.id } }), 0);
    assert.equal(await prisma.communityMembershipPeriod.count({ where: { groupLinkId: group.id } }), 0);
  });
  await prisma.threadMember.deleteMany({ where: { userId: { in: [owner, member, sibling] } } });
}
