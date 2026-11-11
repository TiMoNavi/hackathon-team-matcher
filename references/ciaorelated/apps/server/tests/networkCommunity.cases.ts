import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { graphql, type GraphQLSchema } from "graphql";
import { setupNetworkCommunity } from "../src/lib/networkCommunity";
import { assertThreadAccess, ensureCommunityThread } from "../src/chat/service";

export async function testNetworkCommunity(t: TestContext, prisma: PrismaClient, schema: GraphQLSchema) {
  const id = (name: string) => `net_test_${name}`;
  const accountId = id("account");
  const owner = id("owner"), member = id("member"), sibling = id("sibling");
  const earlyDate = new Date("2025-02-01T12:00:00Z");
  const source = (operation: string, profileId: string, variableValues?: Record<string, unknown>) =>
    graphql({ schema, source: operation, variableValues, contextValue: { prisma, accountId, profileId } });
  const success = (result: any) => { assert.equal(result.errors, undefined, JSON.stringify(result.errors)); return result.data; };
  const initialize = (apply = false) => setupNetworkCommunity(prisma, { ownerId: owner, apply });
  await prisma.account.create({ data: { id: accountId, emailVerifiedAt: new Date() } });
  for (const profileId of [owner, member, sibling]) {
    await prisma.profile.create({ data: { id: profileId, username: profileId, accountId, createdAt: earlyDate, termsVersionAccepted: 1 } });
  }
  let groupId = "";
  let slug = "";
  const where = (profileId = member) => ({ groupLinkId_profileId: { groupLinkId: groupId, profileId } });
  const history = (profileId = member) => prisma.communityMembershipHistory.findUniqueOrThrow({
    where: where(profileId), include: { periods: { orderBy: [{ startedAt: "asc" }, { id: "asc" }] } },
  });
  const leave = async (profileId = member) => success(await source('mutation($id:ID!){leaveGroup(groupId:$id)}', profileId, { id: groupId }));
  const join = async (profileId = member) => success(await source('mutation($slug:String!){joinGroupLink(slug:$slug){id chatThread{id}}}', profileId, { slug }));
  try {
    await t.test("network migration and default setup are inert until explicit activation", async () => {
      assert.equal(await prisma.groupLink.count({ where: { systemKey: "BVRLY" } }), 0);
      assert.equal(await prisma.groupLinkMember.count({ where: { profileId: { in: [owner, member, sibling] } } }), 0);
      const baseline = await prisma.communityMembershipHistory.findUniqueOrThrow({ where: {
        groupLinkId_profileId: { groupLinkId: "privacy_legacy_group", profileId: "privacy_legacy_member" },
      } });
      assert.equal(baseline.seniorityAt.getTime(), baseline.firstJoinedAt.getTime());
      const preview = await initialize();
      assert.equal(preview.applied, false);
      assert.equal(preview.groupId, null);
      assert.equal(preview.profilesToEnroll, await prisma.profile.count());
      assert.equal(await prisma.groupLink.count({ where: { systemKey: "BVRLY" } }), 0);
      await assert.rejects(setupNetworkCommunity(prisma, { ownerId: "missing", apply: true }), /OWNER_UNAVAILABLE/);
      await assert.rejects(setupNetworkCommunity(prisma, { ownerId: "" }), /OWNER_REQUIRED/);
      await prisma.profile.update({ where: { id: owner }, data: { bannedUntil: new Date("2099-01-01") } });
      await assert.rejects(initialize(true), /OWNER_UNAVAILABLE/);
      await prisma.profile.update({ where: { id: owner }, data: { bannedUntil: null } });
    });

    await t.test("activation enrolls existing profiles without connections or chats and separates seniority", async () => {
      const connectionCount = await prisma.connection.count();
      const threadCount = await prisma.thread.count();
      const count = await prisma.profile.count();
      const result = await initialize(true);
      groupId = result.groupId!;
      const group = await prisma.groupLink.findUniqueOrThrow({ where: { id: groupId }, include: { context: true } });
      slug = group.slug!;
      assert.equal(group.visibility, "PUBLIC");
      assert.equal(group.type, "COMMUNITY");
      assert.equal(group.systemKey, "BVRLY");
      assert.equal(group.context?.key, `group:${groupId}`);
      assert.equal(result.enrolled, count);
      assert.equal(await prisma.groupLinkMember.count({ where: { groupLinkId: groupId } }), count);
      assert.equal(await prisma.communityMembershipHistory.count({ where: { groupLinkId: groupId } }), count);
      assert.equal(await prisma.connection.count(), connectionCount);
      assert.equal(await prisma.thread.count(), threadCount);
      for (const profileId of [owner, member, sibling]) {
        const row = await history(profileId);
        assert.equal(row.seniorityAt.getTime(), earlyDate.getTime());
        assert.ok(row.firstJoinedAt >= group.createdAt);
        assert.ok(row.firstJoinedAt > row.seniorityAt);
        assert.equal(row.periods.length, 1);
        assert.equal(row.periods[0].startedAt.getTime(), row.firstJoinedAt.getTime());
      }
      const publicResult = success(await source('query($id:ID!){groupLink(id:$id){isNetworkCommunity visibility viewerIsMember}}', member, { id: groupId }));
      assert.equal(publicResult.groupLink.isNetworkCommunity, true);
      assert.equal(publicResult.groupLink.viewerIsMember, true);
      assert.equal((await initialize(true)).enrolled, 0);
      assert.equal((await initialize()).profilesToEnroll, 0);
      await assert.rejects(setupNetworkCommunity(prisma, { ownerId: sibling, apply: true }), /OWNER_MISMATCH/);
    });

    await t.test("exit and owner removal survive setup reruns and profile updates; intentional rejoin preserves seniority", async () => {
      const first = await history();
      await leave();
      await prisma.profile.update({ where: { id: member }, data: { name: "Updated name" } });
      assert.equal((await initialize(true)).enrolled, 0);
      assert.equal((await initialize()).profilesToEnroll, 0);
      assert.equal(await prisma.groupLinkMember.findUnique({ where: where() }), null);
      assert.ok((await history()).periods[0].endedAt);
      assert.equal((await history(sibling)).periods[0].endedAt, null);
      const search = success(await source('{searchCommunities(q:"Bvrly"){items{id}} suggestedCommunities{community{id}}}', member));
      assert.ok(search.searchCommunities.items.some((g: any) => g.id === groupId), "Intentional rejoin remains discoverable");
      assert.ok(!search.suggestedCommunities.some((r: any) => r.community.id === groupId), "Do not recommend automatic re-enrollment after exit");
      assert.equal((await join()).joinGroupLink.chatThread, null);
      await join();
      const returned = await history();
      assert.equal(returned.firstJoinedAt.getTime(), first.firstJoinedAt.getTime());
      assert.equal(returned.seniorityAt.getTime(), first.seniorityAt.getTime());
      assert.equal(returned.periods.length, 2);
      assert.equal(returned.periods.filter(p => p.endedAt === null).length, 1);
      assert.equal(await prisma.connection.count({ where: { groupLinkId: groupId } }), 0);
      success(await source('mutation($id:ID!,$profile:ID!){removeGroupLinkMember(groupId:$id,profileId:$profile)}', owner, { id: groupId, profile: sibling }));
      assert.equal((await initialize(true)).enrolled, 0);
      assert.equal(await prisma.groupLinkMember.findUnique({ where: where(sibling) }), null);
      assert.ok((await history(sibling)).periods[0].endedAt);
    });

    await t.test("direct, nested and API-created profiles enroll independently, atomically and once", async () => {
      const direct = await prisma.profile.create({ data: { id: id("direct"), username: id("direct"), accountId } });
      const nested = await prisma.account.create({ data: {
        id: id("nested_account"), profiles: { create: [
          { id: id("nested"), username: id("nested") }, { id: id("nested_two"), username: id("nested_two") },
        ] },
      }, include: { profiles: true } });
      const api = success(await source('mutation{createProfile(input:{username:"net_test_api"}){id}}', owner)).createProfile;
      const profiles = [direct, ...nested.profiles, await prisma.profile.findUniqueOrThrow({ where: { id: api.id } })];
      for (const profile of profiles) {
        const row = await history(profile.id);
        assert.equal(row.seniorityAt.getTime(), profile.createdAt.getTime());
        assert.equal(row.periods.length, 1);
        assert.ok(await prisma.groupLinkMember.findUnique({ where: where(profile.id) }));
      }
      await assert.rejects(prisma.$transaction(async tx => {
        await tx.profile.create({ data: { id: id("rollback"), username: id("rollback"), accountId } });
        throw new Error("Expected rollback");
      }), /Expected rollback/);
      assert.equal(await prisma.communityMembershipHistory.count({ where: { profileId: id("rollback") } }), 0);
      assert.equal(await prisma.groupLinkMember.count({ where: { profileId: id("rollback") } }), 0);
      assert.equal(await prisma.connection.count({ where: { groupLinkId: groupId } }), 0);
      assert.equal(await prisma.thread.count({ where: { groupKey: `community:${groupId}` } }), 0);
      await prisma.profile.delete({ where: { id: direct.id } });
      assert.equal(await prisma.communityMembershipHistory.count({ where: { profileId: direct.id } }), 0);
      assert.equal(await prisma.communityMembershipPeriod.count({ where: { profileId: direct.id } }), 0);
    });

    await t.test("Dach membership adds only explicit posts to Moments; ordinary shared-member mixing remains", async () => {
      const personal = await prisma.post.create({ data: { authorId: owner, caption: "Network personal" } });
      const communityPost = success(await source('mutation($input:CreatePostInput!){createPost(input:$input){id}}', owner, {
        input: { kind: "POST", key: "tests/network.jpg", thumbKey: "tests/network-thumb.jpg", mime: "image/jpeg", groupLinkId: groupId },
      })).createPost;
      const mixed = success(await source('{communityMomentsFeed(limit:60){id}}', member)).communityMomentsFeed;
      assert.ok(mixed.some((p: any) => p.id === communityPost.id));
      assert.ok(!mixed.some((p: any) => p.id === personal.id));
      const ordinary = success(await source('mutation{createGroupLink(title:"Bvrly",type:COMMUNITY,visibility:PUBLIC){id isNetworkCommunity}}', owner)).createGroupLink;
      assert.equal(ordinary.isNetworkCommunity, false, "Matching the name does not grant system behavior");
      await prisma.groupLinkMember.create({ data: { groupLinkId: ordinary.id, profileId: member } });
      const normalHistory = await prisma.communityMembershipHistory.findUniqueOrThrow({ where: {
        groupLinkId_profileId: { groupLinkId: ordinary.id, profileId: member },
      } });
      assert.equal(normalHistory.seniorityAt.getTime(), normalHistory.firstJoinedAt.getTime());
      assert.ok(success(await source('{communityMomentsFeed(limit:60){id}}', member)).communityMomentsFeed.some((p: any) => p.id === personal.id));
      assert.ok(await ensureCommunityThread(prisma, ordinary.id), "Ordinary community chat still works");
    });

    await t.test("network chat cannot be created, enabled, listed or accessed even through stale rows", async () => {
      assert.equal(await ensureCommunityThread(prisma, groupId), null);
      assert.equal(success(await source('query($id:ID!){communityThread(groupId:$id){id}}', member, { id: groupId })).communityThread, null);
      const enable = await source('mutation($id:ID!){setCommunityChatKind(groupId:$id,kind:COMMUNITY){id}}', owner, { id: groupId });
      assert.match(enable.errors?.[0].message ?? "", /NETWORK_COMMUNITY_CHAT_UNAVAILABLE/);
      success(await source('mutation($id:ID!){updateGroupLink(id:$id,input:{title:"Bvrly"}){id}}', owner, { id: groupId }));
      assert.equal(await prisma.thread.count({ where: { groupKey: `community:${groupId}` } }), 0);
      const stale = await prisma.thread.create({ data: {
        groupKey: `community:${groupId}`, kind: "COMMUNITY", members: { create: [{ userId: owner }, { userId: member }] },
      } });
      try {
        for (const profileId of [owner, member]) await assert.rejects(assertThreadAccess(prisma, profileId, stale.id), /NO_ACCESS_TO_THREAD/);
        assert.ok(!success(await source('{threads{id}}', member)).threads.some((row: any) => row.id === stale.id));
        const denied = await source('mutation($id:ID!){sendMessage(input:{threadId:$id,kind:text,text:"No chat"}){id}}', member, { id: stale.id });
        assert.match(denied.errors?.[0].message ?? "", /NO_ACCESS_TO_THREAD/);
      } finally {
        await prisma.threadMember.deleteMany({ where: { threadId: stale.id } });
        await prisma.thread.delete({ where: { id: stale.id } });
      }
    });

    await t.test("system marker is unique, immutable and unavailable in public creation/update inputs", async () => {
      await assert.rejects(prisma.$transaction(tx => tx.groupLink.update({ where: { id: groupId }, data: { systemKey: null } })), /COMMUNITY_SYSTEM_KEY_IMMUTABLE/);
      await assert.rejects(prisma.$transaction(tx => tx.groupLink.create({ data: {
        code: id("duplicate"), title: "Duplicate", ownerId: owner, systemKey: "BVRLY", visibility: "PUBLIC", type: "COMMUNITY",
      } })), /Unique constraint/);
      await assert.rejects(prisma.$transaction(tx => tx.groupLink.update({ where: { id: groupId }, data: { type: "DROP" } })), /GroupLink_system_public_community/);
      const create = await source('mutation{createGroupLink(title:"Forged",type:COMMUNITY,systemKey:"BVRLY"){id}}', member);
      assert.match(create.errors?.[0].message ?? "", /Unknown argument/);
      const update = await source('mutation($id:ID!){updateGroupLink(id:$id,input:{systemKey:"BVRLY"}){id}}', member, { id: groupId });
      assert.match(update.errors?.[0].message ?? "", /not defined/);
    });

    await t.test("inactive or expired network communities do not enroll new profiles or silently reactivate", async () => {
      await prisma.groupLink.update({ where: { id: groupId }, data: { isActive: false } });
      await prisma.profile.create({ data: { id: id("inactive"), username: id("inactive"), accountId } });
      assert.equal(await prisma.groupLinkMember.findUnique({ where: where(id("inactive")) }), null);
      await assert.rejects(initialize(true), /NETWORK_COMMUNITY_INACTIVE/);
      await prisma.groupLink.update({ where: { id: groupId }, data: { isActive: true, expiresAt: new Date("2020-01-01") } });
      await prisma.profile.create({ data: { id: id("expired"), username: id("expired"), accountId } });
      assert.equal(await prisma.groupLinkMember.findUnique({ where: where(id("expired")) }), null);
      await assert.rejects(initialize(true), /NETWORK_COMMUNITY_INACTIVE/);
    });
  } finally {
    const profiles = await prisma.profile.findMany({ where: { accountId: { in: [accountId, id("nested_account")] } }, select: { id: true } });
    await prisma.message.deleteMany({ where: { senderId: { in: profiles.map(p => p.id) } } });
    await prisma.threadMember.deleteMany({ where: { userId: { in: profiles.map(p => p.id) } } });
    await prisma.account.deleteMany({ where: { id: { in: [accountId, id("nested_account")] } } });
    if (groupId) {
      assert.equal(await prisma.communityMembershipHistory.count({ where: { groupLinkId: groupId } }), 0);
      assert.equal(await prisma.communityMembershipPeriod.count({ where: { groupLinkId: groupId } }), 0);
      await prisma.context.deleteMany({ where: { key: `group:${groupId}` } });
    }
  }
}
