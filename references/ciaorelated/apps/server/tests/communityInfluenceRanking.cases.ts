import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { graphql, type GraphQLSchema } from "graphql";
import { recordCommunityInfluenceSettlement } from "../src/lib/communityInfluenceLedger";
import { candidateInfluenceUnits, diversifyInfluencedFeed, effectiveInfluenceUnits, influenceCandidateCount,
  influencePostEligible, influencePromotion, influenceRankingPolicy, rankInfluencedPosts } from "../src/lib/communityInfluenceRanking";

export async function testCommunityInfluenceRanking(t: TestContext, prisma: PrismaClient, schema: GraphQLSchema) {
  const now = new Date(), start = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const env = { ENABLE_COMMUNITY_INFLUENCE_RANKING: "true", COMMUNITY_INFLUENCE_RANKING_STARTS_AT: start };
  const policy = influenceRankingPolicy(now, env)!;
  const U = 1_000_000n;
  const post = (id: string, minutes = 0, authorId = id) => ({ id, authorId, createdAt: new Date(now.getTime() - minutes * 60_000) });
  await t.test("ranking needs explicit valid activation and bounded parameters", () => {
    assert.equal(influenceRankingPolicy(now, {}), null);
    assert.equal(influenceRankingPolicy(now, { ...env, ENABLE_COMMUNITY_INFLUENCE_RANKING: "false" }), null);
    for (const value of ["", "yesterday", "2026-02-30T00:00:00Z", "2999-01-01T00:00:00Z"]) {
      assert.equal(influenceRankingPolicy(now, { ...env, COMMUNITY_INFLUENCE_RANKING_STARTS_AT: value }), null);
    }
    for (const [key, value] of [["MAX_AGE_HOURS", "169"], ["HALF_LIFE_HOURS", "-1"], ["MAX_PROMOTION", "21"], ["HALF_STRENGTH_POINTS", "NaN"]]) {
      assert.equal(influenceRankingPolicy(now, { ...env, [`COMMUNITY_INFLUENCE_RANKING_${key}`]: value }), null);
    }
    assert.ok(policy); assert.equal(influenceCandidateCount(61), 120);
  });
  await t.test("new-post eligibility, freshness decay and finite boost even with huge balances", () => {
    assert.equal(influencePromotion(post("new"), 0n, policy, now), 0);
    assert.equal(influencePromotion(post("before", 24 * 60 + 1), 10n ** 30n, policy, now), 0);
    assert.equal(influencePromotion(post("future", -1), 10n ** 30n, policy, now), 0);
    const olderPolicy = { ...policy, startsAt: new Date(now.getTime() - 100 * 3_600_000) };
    assert.equal(influencePostEligible(post("expired", 72 * 60), olderPolicy, now), false);
    const fresh = influencePromotion(post("fresh"), 5000n * U, policy, now);
    assert.equal(fresh, 6);
    assert.equal(influencePromotion(post("one-day", 24 * 60), 5000n * U, policy, now), fresh / 2);
    assert.ok(influencePromotion(post("huge"), 10n ** 400n, policy, now) <= policy.maxPromotion);
    assert.ok(influencePromotion(post("a"), 100n * U, policy, now) > influencePromotion(post("b"), 50n * U, policy, now));
  });
  await t.test("bounded promotion preserves relevance windows, stable pages, ties and unique posts", () => {
    const posts = Array.from({ length: 130 }, (_, i) => post(String(i).padStart(3, "0"), i));
    const balances = new Map([["012", 10n ** 20n], ["060", 10n ** 20n], ["100", 10n ** 20n]]);
    const ranked = rankInfluencedPosts(posts, balances, policy, now);
    assert.equal(ranked[0].id, "000", "Even extreme influence cannot jump arbitrary relevance positions");
    assert.ok(ranked.findIndex(p => p.id === "012") < 12);
    assert.ok(ranked.findIndex(p => p.id === "060") >= 60);
    assert.deepEqual(rankInfluencedPosts(posts.slice(0, 60), balances, policy, now), ranked.slice(0, 60));
    assert.deepEqual(rankInfluencedPosts(posts, new Map(), policy, now), posts);
    assert.equal(rankInfluencedPosts([...posts, posts[0]], balances, policy, now).length, 130);
    assert.deepEqual(rankInfluencedPosts([post("a"), post("z")], new Map(), policy, now).map(p => p.id), ["z", "a"]);
  });
  await t.test("author variety keeps profile recommendation slots and remains stable across windows", () => {
    const items = Array.from({ length: 120 }, (_, i) => ({ id: String(i), author: i % 4 === 3 ? "b" : "a" }));
    items[5].author = "";
    const ranked = diversifyInfluencedFeed(items, item => item.author);
    assert.equal(ranked[2].author, "b"); assert.equal(ranked[5].id, "5");
    assert.equal(new Set(ranked.map(p => p.id)).size, 120);
    assert.deepEqual(diversifyInfluencedFeed(items.slice(0, 60), item => item.author), ranked.slice(0, 60));
    assert.deepEqual(diversifyInfluencedFeed(items.slice(0, 3), () => "a"), items.slice(0, 3));
  });
  await t.test("disabled/no eligible ranking makes no balance query; eligible candidates use one batch", async () => {
    let calls = 0;
    const db = { $queryRaw: async () => { calls++; return []; } } as any;
    await candidateInfluenceUnits(db, [post("a")], null, now);
    await candidateInfluenceUnits(db, [post("a", 1500)], policy, now);
    assert.equal(calls, 0);
    await candidateInfluenceUnits(db, Array.from({ length: 200 }, (_, i) => post(String(i))), policy, now);
    assert.equal(calls, 1);
  });

  const id = (s: string) => `ranking_test_${s}`;
  const viewer = id("viewer"), owner = id("owner"), rich = id("rich"), normal = id("normal"), recipient = id("recipient");
  const hidden = id("hidden"), banned = id("banned"), privateAuthor = id("private_author");
  const group = id("group"), group2 = id("group2"), privateGroup = id("private_group");
  const account = id("account"), past = new Date("2025-01-01Z");
  const query = async (source: string, variables = {}) => {
    const result = await graphql({ schema, source, variableValues: variables, contextValue: { prisma, profileId: viewer, accountId: account } });
    assert.equal(result.errors, undefined, JSON.stringify(result.errors)); return result.data as any;
  };
  const home = async (offset = 0, limit = 20, mode = "SONGVERWANDT") =>
    (await query(`query($offset:Int,$limit:Int,$mode:HomeFeedMode){homeFeed(offset:$offset,limit:$limit,mode:$mode){id kind post{id author{id}}}}`, { offset, limit, mode })).homeFeed;
  const moments = async (offset = 0, limit = 20) =>
    (await query(`query($offset:Int,$limit:Int){communityMomentsFeed(offset:$offset,limit:$limit){id author{id}}}`, { offset, limit })).communityMomentsFeed;
  const book = (groupLinkId: string, profileId: string, points: bigint) => recordCommunityInfluenceSettlement(prisma, {
    groupLinkId, periodStart: new Date("2025-01-02Z"), periodEnd: new Date("2025-01-03Z"),
    policyVersion: "ranking-test-v1", evidenceHash: "c".repeat(64), budgetUnits: points * U, credits: [{ profileId, units: points * U }],
  });
  const createPost = (suffix: string, authorId: string, minutes: number, communities: string[] = []) => prisma.post.create({ data: {
    id: id(suffix), authorId, createdAt: post("", minutes).createdAt,
    postContexts: { create: communities.map(contextId => ({ contextId, source: "IMPORT" as const })) },
  } });
  const savedEnv = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  await prisma.account.create({ data: { id: account } });
  for (const profileId of [viewer, owner, rich, normal, recipient, hidden, banned, privateAuthor]) await prisma.profile.create({ data: {
    id: profileId, username: profileId, accountId: account, createdAt: past, isPrivate: profileId === privateAuthor,
  } });
  for (const [groupId, visibility] of [[group, "PUBLIC"], [group2, "PUBLIC"], [privateGroup, "PRIVATE"]] as const) await prisma.groupLink.create({ data: {
    id: groupId, code: groupId, title: groupId, ownerId: owner, visibility, createdAt: past,
    members: { create: (visibility === "PUBLIC" ? [viewer, rich, normal, recipient, hidden, banned, privateAuthor] : [rich]).map(profileId => ({ profileId, joinedAt: past })) },
    context: { create: { id: groupId, key: `group:${groupId}`, kind: "TOPIC", label: groupId } },
  } });
  for (const followingId of [rich, normal, recipient]) await prisma.follow.create({ data: { followerId: viewer, followingId } });
  await book(group, rich, 600_000n);
  try {
    Object.assign(process.env, env);
    await t.test("all earned community positions add up without a top-N limit", async () => {
      for (let i = 0; i < 6; i++) {
        const groupId = id(`extra_${i}`);
        await prisma.groupLink.create({ data: { id: groupId, code: groupId, title: groupId, ownerId: rich, visibility: "PUBLIC", createdAt: past } });
        await book(groupId, rich, 100n);
      }
      assert.equal((await effectiveInfluenceUnits(prisma, [rich])).get(rich), 600_600n * U);
    });
    await t.test("personalized Home and Moments promote eligible posts; chronology-only views stay unchanged", async () => {
      for (let i = 0; i < 8; i++) await createPost(`simple_${i}`, normal, i, [group]);
      await createPost("boosted", rich, 9, [group]);
      process.env.ENABLE_COMMUNITY_INFLUENCE_RANKING = "false";
      const before = await home(), momentsBefore = await moments(), followingBefore = await home(0, 20, "FOLLOWING");
      const directSource = `query($g:ID!,$p:ID!){groupLinkPosts(groupId:$g){id} postsByUser(userId:$p,kind:POST){id}}`;
      const directBefore = await query(directSource, { g: group, p: normal });
      process.env.ENABLE_COMMUNITY_INFLUENCE_RANKING = "true";
      const after = await home(), momentsAfter = await moments();
      assert.ok(after.findIndex((p: any) => p.post?.id === id("boosted")) < before.findIndex((p: any) => p.post?.id === id("boosted")));
      assert.ok(momentsAfter.findIndex((p: any) => p.id === id("boosted")) < momentsBefore.findIndex((p: any) => p.id === id("boosted")));
      assert.deepEqual(await home(0, 20, "FOLLOWING"), followingBefore);
      assert.deepEqual(await query(directSource, { g: group, p: normal }), directBefore);
      assert.equal((await query("{myCommunityInfluence{rankingEnabled}}" )).myCommunityInfluence.rankingEnabled, true);
    });
    await t.test("assignment changes subsequent rankings without copies or permanently boosted posts", async () => {
      await createPost("recipient_post", recipient, 10, [group]);
      await prisma.communityInfluenceSupport.create({ data: { groupLinkId: group, profileId: rich, recipientId: recipient } });
      const assigned = await moments();
      assert.ok(assigned.findIndex((p: any) => p.id === id("recipient_post")) < assigned.findIndex((p: any) => p.id === id("boosted")));
      await prisma.communityInfluenceSupport.delete({ where: { groupLinkId_profileId: { groupLinkId: group, profileId: rich } } });
      const revoked = await moments();
      assert.ok(revoked.findIndex((p: any) => p.id === id("boosted")) < revoked.findIndex((p: any) => p.id === id("recipient_post")));
      const denied = await prisma.userBlock.create({ data: { blockerId: rich, blockedId: owner } });
      assert.equal((await effectiveInfluenceUnits(prisma, [rich])).get(rich), 600n * U);
      await prisma.userBlock.delete({ where: { id: denied.id } });
    });
    await t.test("ranking cannot surface private-community, private-personal, blocked or banned content", async () => {
      await createPost("private_community", rich, 0, [privateGroup]);
      await createPost("private_personal", privateAuthor, 0);
      await createPost("private_author_public_post", privateAuthor, 0, [group]);
      await createPost("blocked_post", hidden, 0, [group]);
      await createPost("banned_post", banned, 0, [group]);
      await prisma.userBlock.create({ data: { blockerId: hidden, blockedId: viewer } });
      await prisma.profile.update({ where: { id: banned }, data: { bannedUntil: new Date("2999-01-01") } });
      const all = [...(await home(0, 50)).map((p: any) => p.post?.id), ...(await moments(0, 60)).map((p: any) => p.id)];
      for (const suffix of ["private_community", "private_personal", "blocked_post", "banned_post"]) assert.ok(!all.includes(id(suffix)), suffix);
      assert.ok(all.includes(id("private_author_public_post")));
    });
    await t.test("static multi-page feeds are consistent across page sizes and mixed/duplicate contexts", async () => {
      await prisma.post.deleteMany({ where: { author: { accountId: account } } });
      for (let i = 0; i < 190; i++) await createPost(`page_${String(i).padStart(3, "0")}`, [rich, normal, recipient][i % 3], i,
        i % 3 === 0 ? [group, group2] : i % 3 === 1 ? [group] : []);
      await prisma.connection.create({ data: { fromId: viewer, toId: owner, groupLinkId: group } });
      // Unfollow a source so Home also exercises context-ranked suggestions.
      await prisma.follow.deleteMany({ where: { followerId: viewer, followingId: normal } });
      for (const fetch of [home, moments]) {
        const small = [], large = [];
        for (let offset = 0; offset < 150; offset += 10) small.push(...await fetch(offset, 10));
        for (let offset = 0; offset < 150; offset += 50) large.push(...await fetch(offset, 50));
        assert.deepEqual(small, large);
        assert.equal(new Set(small.map((p: any) => p.id)).size, small.length);
      }
    });
    await t.test("switching ranking off restores the original ranking path and overview status", async () => {
      process.env.ENABLE_COMMUNITY_INFLUENCE_RANKING = "false";
      const before = await home();
      process.env.ENABLE_COMMUNITY_INFLUENCE_RANKING = "true";
      await home();
      process.env.ENABLE_COMMUNITY_INFLUENCE_RANKING = "false";
      assert.deepEqual(await home(), before);
      assert.equal((await query("{myCommunityInfluence{rankingEnabled}}" )).myCommunityInfluence.rankingEnabled, false);
    });
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await prisma.account.delete({ where: { id: account } });
  }
}
