import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { graphql, print, validate, type GraphQLSchema } from "graphql";
import { SEARCH_COMMUNITIES, SUGGESTED_COMMUNITIES } from "../../ciaorelated/src/graphql/queries/communities";
import { feedPostId, withCommunitySuggestions } from "../../ciaorelated/src/lib/communityDiscovery";

export async function testCommunityDiscovery(t: TestContext, prisma: PrismaClient, schema: GraphQLSchema) {
  const accountId = "privacy_test_account";
  const id = (name: string) => `privacy_test_discovery_${name}`;
  const viewer = id("viewer"), owner = id("owner"), followed = id("followed"), sibling = id("sibling");
  const query = async (source: string, profileId: string | undefined = viewer, variableValues?: Record<string, unknown>) =>
    graphql({ schema, source, variableValues, contextValue: { prisma, accountId, profileId } });
  const success = (result: any) => { assert.equal(result.errors, undefined, JSON.stringify(result.errors)); return result.data; };
  const search = async (q: string, offset = 0, limit = 24, profileId = viewer) =>
    success(await query(print(SEARCH_COMMUNITIES), profileId, { q, offset, limit })).searchCommunities;
  const suggestions = async (profileId = viewer) =>
    success(await query(print(SUGGESTED_COMMUNITIES), profileId, { limit: 8 })).suggestedCommunities;
  const suggestedIds = async (profileId = viewer) => (await suggestions(profileId)).map((s: any) => s.community.id);

  for (const profileId of [viewer, owner, followed, sibling]) {
    await prisma.profile.create({ data: { id: profileId, username: profileId, accountId, termsVersionAccepted: 1 } });
  }
  const createGroup = async (name: string, extra: Record<string, any> = {}) => prisma.groupLink.create({ data: {
    id: id(name), code: id(name), slug: id(name), title: `Discovery ${name}`, ownerId: owner,
    visibility: "PUBLIC", type: "DROP", ...extra,
    context: { create: { id: id(name), key: `group:${id(name)}`, kind: "TOPIC", label: `Discovery ${name}` } },
  } });
  const followedGroup = await createGroup("followed_group", { members: { create: { profileId: followed } } });
  const activeGroup = await createGroup("active_group");
  const plainGroup = await createGroup("plain_group");
  const hiddenGroup = await createGroup("secret_group", { visibility: "PRIVATE", imageKey: "secret-cover.jpg", members: { create: { profileId: viewer } } });
  const privateAudienceGroup = await createGroup("nonmember_secret", { visibility: "PRIVATE" });
  const inactiveGroup = await createGroup("inactive_group", { isActive: false });
  const expiredGroup = await createGroup("expired_group", { expiresAt: new Date(Date.now() - 1000) });
  const ownGroup = await createGroup("own_group", { ownerId: viewer });
  const joinedGroup = await createGroup("joined_group", { members: { create: { profileId: viewer } } });
  const literalGroup = await createGroup("literal_group", { title: "Discovery 100%_literal" });
  const noWildcardGroup = await createGroup("not_literal", { title: "Discovery 100XYliteral" });
  await prisma.follow.create({ data: { followerId: viewer, followingId: followed } });
  await prisma.post.create({ data: {
    id: id("active_post"), authorId: owner,
    postContexts: { create: { contextId: activeGroup.id, source: "IMPORT" } },
  } });
  // A post with a second, private audience must not generate an activity reason.
  await prisma.post.create({ data: {
    id: id("private_post"), authorId: owner,
    postContexts: { create: [plainGroup.id, privateAudienceGroup.id].map(contextId => ({ contextId, source: "IMPORT" })) },
  } });

  await t.test("discovery documents match the real GraphQL schema", () => {
    for (const doc of [SEARCH_COMMUNITIES, SUGGESTED_COMMUNITIES]) assert.deepEqual(validate(schema, doc), []);
  });
  await t.test("search finds public DROP communities but never private, expired or disabled ones", async () => {
    const result = await search("  discovery  ");
    const ids = result.items.map((g: any) => g.id);
    for (const group of [followedGroup, activeGroup, plainGroup, ownGroup, joinedGroup]) assert.ok(ids.includes(group.id));
    for (const group of [hiddenGroup, inactiveGroup, expiredGroup]) assert.ok(!ids.includes(group.id));
    assert.equal(result.items.find((g: any) => g.id === followedGroup.id).type, "DROP");
    assert.equal(result.items.find((g: any) => g.id === joinedGroup.id).viewerIsMember, true);
    assert.equal(result.items.find((g: any) => g.id === ownGroup.id).viewerIsOwner, true);
    assert.equal((await search("secret_group")).items.length, 0, "Even a member cannot discover private communities in public search");
    assert.ok(!JSON.stringify(result).includes("secret-cover"));
  });
  await t.test("search treats wildcard characters literally and handles blank input", async () => {
    assert.deepEqual((await search("100%_")).items.map((g: any) => g.id), [literalGroup.id]);
    assert.ok(!(await search("100%_")).items.some((g: any) => g.id === noWildcardGroup.id));
    const blank = await search("   ");
    assert.deepEqual(blank.items, []);
    assert.equal(blank.hasMore, false);
    assert.equal((await search("' OR 1=1 --")).items.length, 0);
  });
  await t.test("search pagination is stable and clamps invalid page sizes", async () => {
    const all = await search("Discovery");
    let offset = 0;
    const ids: string[] = [];
    for (;;) {
      const page = await search("Discovery", offset, 2);
      ids.push(...page.items.map((g: any) => g.id));
      offset += page.items.length;
      if (!page.hasMore) break;
      assert.equal(page.items.length, 2);
      assert.ok(offset <= 24);
    }
    assert.deepEqual(ids, all.items.map((g: any) => g.id));
    assert.equal(new Set(ids).size, ids.length);
    assert.equal((await search("Discovery", -1, 0)).items.length, 1);
    assert.ok((await search("Discovery", 0, 100)).items.length <= 24);
  });
  await t.test("suggestions rank followed profiles then visible activity; exclude own/joined communities", async () => {
    const rows = await suggestions();
    const ids = rows.map((s: any) => s.community.id);
    assert.equal(ids[0], followedGroup.id);
    assert.equal(rows[0].reason, "FOLLOWING");
    assert.equal(ids[1], activeGroup.id);
    assert.equal(rows[1].reason, "ACTIVE");
    assert.equal(rows.find((s: any) => s.community.id === plainGroup.id)?.reason, "PUBLIC");
    assert.ok(rows.every((s: any) => s.community.visibility === "PUBLIC" && !s.community.viewerIsMember && !s.community.viewerIsOwner));
    for (const group of [ownGroup, joinedGroup, hiddenGroup, inactiveGroup, expiredGroup]) assert.ok(!ids.includes(group.id));
    assert.ok(!JSON.stringify(rows).includes("secret-cover"));
  });
  await t.test("joining hides a suggestion for this profile only; leaving makes it eligible again", async () => {
    success(await query('mutation($slug:String!){ joinGroupLink(slug:$slug){ id } }', viewer, { slug: followedGroup.slug }));
    assert.ok(!(await suggestedIds()).includes(followedGroup.id));
    assert.ok((await suggestedIds(sibling)).includes(followedGroup.id), "Profiles sharing an account remain independent");
    success(await query('mutation($groupId:ID!){ leaveGroup(groupId:$groupId) }', viewer, { groupId: followedGroup.id }));
    assert.ok((await suggestedIds()).includes(followedGroup.id));
  });
  await t.test("blocked/banned owners disappear; blocked/banned members do not supply recommendation reasons", async () => {
    for (const [blockerId, blockedId] of [[owner, viewer], [viewer, owner]]) {
      await prisma.userBlock.create({ data: { blockerId, blockedId } });
      assert.equal((await search("Discovery active_group")).items.length, 0);
      assert.ok(!(await suggestedIds()).includes(activeGroup.id));
      await prisma.userBlock.delete({ where: { blockerId_blockedId: { blockerId, blockedId } } });
    }
    await prisma.profile.update({ where: { id: owner }, data: { bannedUntil: new Date(Date.now() + 60000) } });
    assert.equal((await search("Discovery active_group")).items.length, 0);
    assert.ok(!(await suggestedIds()).includes(activeGroup.id));
    await prisma.profile.update({ where: { id: owner }, data: { bannedUntil: null } });
    await prisma.userBlock.create({ data: { blockerId: followed, blockedId: viewer } });
    assert.equal((await suggestions()).find((s: any) => s.community.id === followedGroup.id)?.reason, "PUBLIC");
    await prisma.userBlock.delete({ where: { blockerId_blockedId: { blockerId: followed, blockedId: viewer } } });
    await prisma.profile.update({ where: { id: followed }, data: { bannedUntil: new Date(Date.now() + 60000) } });
    assert.equal((await suggestions()).find((s: any) => s.community.id === followedGroup.id)?.reason, "PUBLIC");
    await prisma.profile.update({ where: { id: followed }, data: { bannedUntil: null } });
  });
  await t.test("discovery requires authentication and handles nullable limits", async () => {
    for (const source of ['{searchCommunities(q:"Discovery"){items{id}}}', '{suggestedCommunities{community{id}}}']) {
      const result = await graphql({ schema, source, contextValue: { prisma } });
      assert.match(result.errors?.[0].message ?? "", /Not authenticated/);
    }
    success(await query('{ searchCommunities(q:"Discovery",limit:null,offset:null){items{id}} suggestedCommunities(limit:null){community{id}} }'));
  });
  await t.test("local recommendation rows leave feed offsets and real post view IDs untouched", () => {
    const items = [{ id: "row1", post: { id: "p1" } }, { id: "profiles", kind: "SUGGESTED_PROFILES" }, { id: "p2" }, { id: "row3", post: { id: "p3" } }, { id: "p4" }];
    const original = JSON.stringify(items);
    const rendered = withCommunitySuggestions(items, true);
    assert.equal(rendered[4].kind, "COMMUNITY_SUGGESTIONS");
    assert.equal(rendered.filter(item => item.kind === "COMMUNITY_SUGGESTIONS").length, 1);
    assert.equal(feedPostId(rendered[4]), null);
    assert.equal(feedPostId(items[1]), null);
    assert.equal(feedPostId(items[0]), "p1");
    assert.equal(feedPostId(undefined), null);
    assert.equal(JSON.stringify(items), original);
    assert.equal(items.length, 5, "Server offset excludes the local row");
    assert.equal(withCommunitySuggestions(items, false), items, "Following feed stays untouched");
    assert.equal(withCommunitySuggestions([], true).length, 1);
    assert.equal(withCommunitySuggestions(items.slice(0, 2), true).at(-1)?.kind, "COMMUNITY_SUGGESTIONS");
  });

  // joinGroupLink can provision a chat; clear non-cascading references before account cleanup.
  await prisma.threadMember.deleteMany({ where: { userId: { in: [viewer, owner, followed, sibling] } } });
}
