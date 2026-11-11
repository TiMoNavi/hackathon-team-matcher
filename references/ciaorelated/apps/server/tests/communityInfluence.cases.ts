import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { graphql, type GraphQLSchema } from "graphql";
import {
  calculateCommunityInfluence, DEFAULT_INFLUENCE_POLICY as policy, INFLUENCE_UNIT as U,
  influencePolicyVersion, parseInfluencePolicy, cumulativeGrowthUnits, type InfluenceMember, type InfluenceSignal,
} from "../src/lib/communityInfluencePolicy";
import { configureCommunityInfluence, runCommunityInfluence, settleCommunityInfluence } from "../src/jobs/communityInfluence";
import { captureCommunityInteraction } from "../src/lib/communityInfluenceEvents";
import { setupNetworkCommunity } from "../src/lib/networkCommunity";

const date = (day: number, hour = 0) => new Date(Date.UTC(2025, 2, day, hour));
const member = (profileId: string, day: number, end?: number): InfluenceMember => ({
  profileId, firstJoinedAt: date(day), seniorityAt: date(day), eligible: true,
  periods: [{ startedAt: date(day), endedAt: end ? date(end) : null }],
});
const signal = (id: string, actorId: string, authorId: string | null, hour = 12): InfluenceSignal => ({
  id, actorId, authorId, kind: authorId ? "INTERACTION" : "JOIN", occurredAt: date(3, hour),
});
const calculate = (members: InfluenceMember[], events: InfluenceSignal[]) =>
  calculateCommunityInfluence({ start: date(3), end: date(4), members, events, policy });
const amount = (credits: ReturnType<typeof calculate>, id: string) => credits.find(c => c.profileId === id)?.units ?? 0n;

export async function testCommunityInfluence(t: TestContext, prisma: PrismaClient, schema: GraphQLSchema) {
  await t.test("first growth earns a small initial advantage, not an automatic factor-four reward", () => {
    const credits = calculate([member("early", 1), member("later", 2), member("new", 3)], [
      signal("growth", "new", null, 1), signal("action", "later", "early"),
    ]);
    assert.equal(credits.find(c => c.profileId === "early")?.communityUnits, cumulativeGrowthUnits(1n, 1, policy) + U / 4n);
    assert.ok(cumulativeGrowthUnits(1n, 1, policy) < 9n * U);
    assert.equal(credits.find(c => c.profileId === "later")?.participationUnits, U);
    assert.ok(amount(credits, "early") > amount(credits, "later"));
    assert.equal(credits.find(c => c.profileId === "new")?.communityUnits, U / 4n);
  });

  await t.test("personal activity is not diluted by community size; tied join dates are fair", () => {
    const members = [member("early", 1), member("later", 2)];
    const events = [signal("a", "later", "early")];
    const large = calculate([...members, ...Array.from({ length: 500 }, (_, i) => member(`silent${i}`, 2))], events);
    const small = calculate(members, events);
    assert.equal(large.find(c => c.profileId === "later")?.participationUnits, U);
    assert.equal(small.find(c => c.profileId === "later")?.participationUnits, U);
    const tied = calculate([member("a", 1), member("b", 1), member("new", 3)], [signal("j", "new", null)]);
    assert.equal(amount(tied, "a"), amount(tied, "b"));
  });

  await t.test("diverse sustained participation and resonance can overcome a finite early lead", () => {
    const members = [member("early", 1), ...Array.from({ length: 20 }, (_, i) => member(`p${i}`, 2)), member("later", 2)];
    members.at(-1)!.seniorityAt = new Date(date(2).getTime() + 3_600_000);
    const light = calculate(members, [signal("light", "later", "p0")]);
    const meaningful = calculate(members, [
      ...Array.from({ length: 10 }, (_, i) => signal(`out${i}`, "later", `p${i}`)),
      ...Array.from({ length: 20 }, (_, i) => signal(`in${i}`, `p${i}`, "later")),
    ]);
    const later = meaningful.find(c => c.profileId === "later")!;
    assert.equal(later.participationUnits, 10n * U);
    assert.equal(later.resonanceUnits, 40n * U);
    assert.ok(30n * amount(light, "later") < 320n * U + 30n * amount(light, "early"));
    assert.ok(30n * amount(meaningful, "later") > 320n * U + 30n * amount(meaningful, "early"));
  });

  await t.test("spam caps apply per actor-author per day; self-reactions and event order cannot inflate credits", () => {
    const members = [member("a", 1), member("b", 2)];
    const event = signal("one", "b", "a");
    const spam = Array.from({ length: 200 }, (_, i) => ({ ...event, id: `spam${i}` }));
    assert.deepEqual(calculate(members, [...spam, signal("self", "a", "a")]), calculate(members, [event]));
    assert.deepEqual(calculate(members, spam.reverse()), calculate(members, [event]));
    assert.deepEqual(calculate(members, []), []);
  });

  await t.test("growth needs net increase and continuous first membership; absence gets no catch-up", () => {
    const early = member("early", 1), old = member("old", 2, 3), fresh = member("new", 3);
    assert.deepEqual(calculate([early, old, fresh], [signal("j", "new", null)]), []);
    fresh.periods = [{ startedAt: date(3), endedAt: date(3, 5) }, { startedAt: date(3, 8), endedAt: null }];
    assert.deepEqual(calculate([early, fresh], [signal("j", "new", null, 1)]), []);
    early.periods = [{ startedAt: date(1), endedAt: date(3, 2) }, { startedAt: date(3, 18), endedAt: null }];
    const others = [member("a", 2), member("b", 2)];
    assert.equal(amount(calculate([early, ...others], [signal("gap", "a", "b", 12)]), "early"), 0n);
    assert.ok(amount(calculate([early, ...others], [signal("back", "a", "b", 19)]), "early") > 0n);
  });

  await t.test("policy parsing rejects missing, noninteger or unbounded values", () => {
    assert.deepEqual(parseInfluencePolicy(policy), policy);
    for (const value of [{}, { ...policy, growthReferenceMinProfiles: 0 }, { ...policy, growthPoints: 1.5 }, { ...policy, growthPoints: Infinity },
      { ...policy, earlyMaxMilli: 4000, maxGrowthPerDay: 20 }]) {
      assert.throws(() => parseInfluencePolicy(value), /INVALID_POLICY/);
    }
  });

  const id = (name: string) => `accrual_test_${name}`;
  const accountId = id("account"), owner = id("owner"), actor = id("actor"), sibling = id("sibling"), outsider = id("outsider");
  const groupId = id("public"), privateId = id("private"), publicPost = id("post");
  const query = (source: string, profileId: string, variableValues?: Record<string, unknown>) => graphql({
    schema, source, variableValues, contextValue: { prisma, accountId, profileId },
  });
  const success = (result: any) => { assert.equal(result.errors, undefined, JSON.stringify(result.errors)); return result.data; };
  const react = async (postId: string, profileId = actor) => success(await query('mutation($id:ID!){likePost(postId:$id){id}}', profileId, { id: postId }));
  const balance = async (profileId = owner) => (await prisma.communityInfluenceCredit.aggregate({ where: { groupLinkId: groupId, profileId }, _sum: { units: true } }))._sum.units ?? 0n;
  await prisma.account.create({ data: { id: accountId, emailVerifiedAt: new Date() } });
  for (const profileId of [owner, actor, sibling, outsider]) await prisma.profile.create({ data: {
    id: profileId, username: profileId, accountId, createdAt: date(1), termsVersionAccepted: 1,
  } });
  for (const [group, visibility] of [[groupId, "PUBLIC"], [privateId, "PRIVATE"]] as const) {
    await prisma.groupLink.create({ data: { id: group, code: group, title: group, ownerId: owner, visibility, createdAt: date(1),
      context: { create: { id: `${group}_ctx`, key: `group:${group}`, kind: "TOPIC", label: group } },
      members: { create: [{ profileId: actor, joinedAt: date(2) }, { profileId: sibling, joinedAt: date(2) }] },
    } });
  }
  const post = async (postId: string, community: string | null, authorId = owner) => prisma.post.create({ data: {
    id: postId, authorId, createdAt: date(3), imageKey: "tests/influence.jpg",
    ...(community ? { postContexts: { create: { contextId: `${community}_ctx`, source: "IMPORT" } } } : {}),
  } });
  await post(publicPost, groupId);
  let dachId: string | undefined;
  try {
    await t.test("activation rejects a non-UTC database instead of mixing local membership times and UTC", async () => {
      try {
        await prisma.$executeRawUnsafe("SET TIME ZONE 'Etc/GMT-1'");
        await assert.rejects(configureCommunityInfluence(prisma, { apply: true }), /REQUIRES_UTC_DATABASE/);
        assert.equal(await prisma.communityInfluenceSettings.count(), 0);
      } finally { await prisma.$executeRawUnsafe("SET TIME ZONE 'UTC'"); }
    });
    await t.test("activation preview and missing settings produce no events or credits", async () => {
      const preview = await configureCommunityInfluence(prisma);
      assert.equal(preview.applied, false);
      assert.ok(preview.settings.startsAt > new Date());
      assert.equal(preview.settings.startsAt.getUTCHours(), 0);
      assert.equal(await prisma.communityInfluenceSettings.count(), 0);
      assert.equal((await runCommunityInfluence(prisma, { apply: true })).active, false);
      await react(publicPost);
      assert.equal(await prisma.communityInfluenceEvent.count(), 0);
      await prisma.like.delete({ where: { userId_postId: { userId: actor, postId: publicPost } } });
      const activation = await configureCommunityInfluence(prisma, { apply: true });
      assert.equal(activation.applied, true);
      assert.equal((await configureCommunityInfluence(prisma, { apply: true })).reused, true);
      await assert.rejects(configureCommunityInfluence(prisma, { apply: true, policy: { ...policy, growthPoints: 9 } }), /POLICY_ALREADY_LOCKED/);
      // Isolated fixture time only. The production command never allows backdating.
      await prisma.communityInfluenceSettings.update({ where: { id: "default" }, data: { startsAt: date(3) } });
    });

    await t.test("real like/comment mutations journal once per profile-post, independently of account", async () => {
      await react(publicPost);
      await react(publicPost);
      await prisma.like.delete({ where: { userId_postId: { userId: actor, postId: publicPost } } });
      await react(publicPost);
      success(await query('mutation($id:ID!){addComment(postId:$id,content:"Useful comment"){id}}', actor, { id: publicPost }));
      await react(publicPost, sibling);
      await react(publicPost, owner);
      assert.equal(await prisma.communityInfluenceEvent.count({ where: { groupLinkId: groupId } }), 2);
      const before = await prisma.communityInfluenceEvent.findMany({ where: { groupLinkId: groupId } });
      await prisma.comment.deleteMany({ where: { postId: publicPost } });
      success(await query('mutation($id:ID!){addComment(postId:$id,content:"Another useful comment"){id}}', actor, { id: publicPost }));
      assert.deepEqual(await prisma.communityInfluenceEvent.findMany({ where: { groupLinkId: groupId } }), before);
    });

    await t.test("private, personal, orphan/mixed-audience, outsider and banned reactions earn no events", async () => {
      for (const [suffix, group] of [["private_post", privateId], ["personal", null], ["mixed", groupId]] as const) {
        await post(id(suffix), group);
        if (suffix === "mixed") await prisma.postContext.create({ data: { postId: id(suffix), contextId: `${privateId}_ctx`, source: "IMPORT" } });
        await react(id(suffix));
      }
      await react(publicPost, outsider);
      await post(id("banned"), groupId);
      await prisma.profile.update({ where: { id: actor }, data: { bannedUntil: new Date("2099-01-01") } });
      await prisma.$transaction(tx => captureCommunityInteraction(tx, actor, id("banned")));
      await prisma.profile.update({ where: { id: actor }, data: { bannedUntil: null } });
      assert.equal(await prisma.communityInfluenceEvent.count({ where: { groupLinkId: { in: [groupId, privateId] } } }), 2);
    });

    await t.test("first-join trigger is atomic; exits and rejoining do not create new growth events", async () => {
      await prisma.groupLinkMember.create({ data: { groupLinkId: groupId, profileId: outsider, joinedAt: date(3, 1) } });
      const first = await prisma.communityInfluenceEvent.findFirstOrThrow({ where: { groupLinkId: groupId, kind: "JOIN" } });
      await prisma.groupLinkMember.delete({ where: { groupLinkId_profileId: { groupLinkId: groupId, profileId: outsider } } });
      await prisma.groupLinkMember.create({ data: { groupLinkId: groupId, profileId: outsider } });
      assert.equal(await prisma.communityInfluenceEvent.count({ where: { groupLinkId: groupId, kind: "JOIN" } }), 1);
      assert.equal((await prisma.communityInfluenceEvent.findUniqueOrThrow({ where: { id: first.id } })).occurredAt.getTime(), first.occurredAt.getTime());
      await assert.rejects(prisma.$transaction(async tx => {
        await tx.groupLink.create({ data: { id: id("rollback"), code: id("rollback"), title: "rollback", visibility: "PUBLIC", ownerId: owner } });
        await tx.groupLinkMember.create({ data: { groupLinkId: id("rollback"), profileId: actor } });
        throw new Error("abort capture");
      }), /abort capture/);
      assert.equal(await prisma.communityInfluenceEvent.count({ where: { groupLinkId: id("rollback") } }), 0);
    });

    await t.test("Dach backfill is not new growth and personal public posts do not generate Dach activity", async () => {
      dachId = (await setupNetworkCommunity(prisma, { ownerId: owner, apply: true })).groupId!;
      assert.equal(await prisma.communityInfluenceEvent.count({ where: { groupLinkId: dachId } }), 0);
      await prisma.profile.create({ data: { id: id("fresh"), username: id("fresh"), accountId } });
      assert.equal(await prisma.communityInfluenceEvent.count({ where: { groupLinkId: dachId, kind: "JOIN", actorId: id("fresh") } }), 1);
      const freshEvent = await prisma.communityInfluenceEvent.findFirstOrThrow({ where: { actorId: id("fresh"), kind: "JOIN" } });
      const freshPeriod = await prisma.communityMembershipPeriod.findFirstOrThrow({ where: { profileId: id("fresh"), groupLinkId: dachId } });
      assert.ok(freshEvent.occurredAt >= freshPeriod.startedAt, `Membership ${freshPeriod.startedAt.toISOString()} must precede event ${freshEvent.occurredAt.toISOString()}`);
      await post(id("network_personal"), null);
      await react(id("network_personal"));
      assert.equal(await prisma.communityInfluenceEvent.count({ where: { groupLinkId: dachId, kind: "INTERACTION" } }), 0);
      await prisma.groupLink.delete({ where: { id: dachId } }); dachId = undefined;
    });

    await t.test("closed daily calculation previews without writes and books exact separated totals once", async () => {
      // Place captured evidence in an already closed fixture day.
      await prisma.communityInfluenceEvent.updateMany({ where: { groupLinkId: groupId, kind: "INTERACTION" }, data: { occurredAt: date(3, 12) } });
      await prisma.like.updateMany({ where: { postId: publicPost }, data: { createdAt: date(3, 12) } });
      await prisma.comment.updateMany({ where: { postId: publicPost }, data: { createdAt: date(3, 12) } });
      const window = { groupLinkId: groupId, start: date(3), end: date(4) };
      const preview = await settleCommunityInfluence(prisma, window);
      assert.equal(preview.applied, false);
      assert.equal(await balance(), 0n);
      const applied = await settleCommunityInfluence(prisma, { ...window, apply: true });
      assert.equal(applied.applied, true);
      const credits = await prisma.communityInfluenceCredit.findMany({ where: { groupLinkId: groupId } });
      assert.equal(credits.find(c => c.profileId === actor)?.participationUnits, U);
      assert.equal(credits.find(c => c.profileId === owner)?.resonanceUnits, 4n * U);
      for (const c of credits) assert.equal(c.units, c.communityUnits + c.participationUnits + c.resonanceUnits);
      const before = await balance();
      await prisma.like.deleteMany({ where: { postId: publicPost } });
      await prisma.comment.deleteMany({ where: { postId: publicPost } });
      assert.equal((await settleCommunityInfluence(prisma, { ...window, apply: true })).reused, true);
      assert.equal(await balance(), before);
      assert.equal(await prisma.communityInfluenceSettlement.count({ where: { groupLinkId: groupId } }), 1);
    });

    await t.test("window gaps, partial-day replay, private communities and policy drift cannot mint credits", async () => {
      await assert.rejects(settleCommunityInfluence(prisma, { groupLinkId: groupId, start: date(6), end: date(7), apply: true }), /NONCONTIGUOUS/);
      await assert.rejects(settleCommunityInfluence(prisma, { groupLinkId: groupId, start: date(4), end: date(4, 12), apply: true }), /INVALID_WINDOW/);
      await assert.rejects(settleCommunityInfluence(prisma, { groupLinkId: privateId, start: date(3), end: date(4), apply: true }), /COMMUNITY_UNAVAILABLE/);
      await prisma.communityInfluenceSettings.update({ where: { id: "default" }, data: { policy: { ...policy, growthPoints: 9 } } });
      await assert.rejects(settleCommunityInfluence(prisma, { groupLinkId: groupId, start: date(4), end: date(5), apply: true }), /POLICY_MISMATCH/);
      const changedPolicy = { ...policy, growthPoints: 9 };
      await prisma.communityInfluenceSettings.update({ where: { id: "default" }, data: {
        policy: changedPolicy, policyVersion: influencePolicyVersion(changedPolicy),
      } });
      await assert.rejects(settleCommunityInfluence(prisma, { groupLinkId: groupId, start: date(4), end: date(5), apply: true }), /POLICY_TRANSITION_REQUIRED/);
      const { growthReferenceMinProfiles, ...previousPolicy } = policy;
      await prisma.communityInfluenceSettings.update({ where: { id: "default" }, data: {
        policy: { ...previousPolicy, earlyMaxMilli: 4000, maxGrowthPerDay: 20 }, policyVersion: "community-v1:test",
      } });
      await assert.rejects(settleCommunityInfluence(prisma, { groupLinkId: groupId, start: date(4), end: date(5), apply: true }), /INVALID_POLICY/);
      await prisma.communityInfluenceSettings.update({ where: { id: "default" }, data: { policy, policyVersion: influencePolicyVersion(policy) } });
    });

    await t.test("deleted reactions earn nothing and preview runner writes nothing", async () => {
      await prisma.communityInfluenceEvent.updateMany({ where: { groupLinkId: groupId, kind: "INTERACTION" }, data: { occurredAt: date(4, 12) } });
      const before = await balance();
      await settleCommunityInfluence(prisma, { groupLinkId: groupId, start: date(4), end: date(5), apply: true });
      assert.equal(await balance(), before, "removed likes/comments are not counted");
      const count = await prisma.communityInfluenceSettlement.count();
      const run = await runCommunityInfluence(prisma);
      assert.equal(run.active, true);
      assert.deepEqual(run.errors, []);
      assert.equal(await prisma.communityInfluenceSettlement.count(), count);
    });

    await t.test("qualified first growth is booked for existing members, not the newcomer; job catches up only once", async () => {
      await prisma.groupLinkMember.create({ data: { groupLinkId: groupId, profileId: id("fresh"), joinedAt: date(5, 10) } });
      await prisma.communityInfluenceEvent.updateMany({ where: { groupLinkId: groupId, actorId: id("fresh"), kind: "JOIN" }, data: { occurredAt: date(5, 10) } });
      const before = await balance();
      await settleCommunityInfluence(prisma, { groupLinkId: groupId, start: date(5), end: date(6), apply: true });
      const earned = cumulativeGrowthUnits(1n, 1, policy);
      assert.equal(await balance(), before + earned);
      assert.equal(await balance(id("fresh")), 0n);
      const receipt = await prisma.communityInfluenceSettlement.findFirstOrThrow({ where: { groupLinkId: groupId, periodStart: date(5) } });
      const catchup = await runCommunityInfluence(prisma, { apply: true });
      assert.deepEqual(catchup.errors, []);
      assert.ok(catchup.days > 0);
      assert.equal(await balance(), before + earned);
      const history = await prisma.communityMembershipHistory.findUniqueOrThrow({ where: { groupLinkId_profileId: { groupLinkId: groupId, profileId: owner } } });
      assert.equal(history.influenceGrowthCount, 1n);
      assert.equal(history.influenceEntryPosition, 1);
      const credit = await prisma.communityInfluenceCredit.findUniqueOrThrow({ where: { settlementId_profileId: { settlementId: receipt.id, profileId: owner } } });
      assert.equal(credit.growthCount, 1n);
      assert.equal(await prisma.communityInfluenceSettlement.count({ where: { id: receipt.id } }), 1);
    });

    await t.test("growth checkpoint and receipt roll back together, resume cumulatively, and survive leave/rejoin", async () => {
      const latest = await prisma.communityInfluenceSettlement.findFirstOrThrow({ where: { groupLinkId: groupId }, orderBy: { periodEnd: "desc" } });
      const start = latest.periodEnd, end = new Date(start.getTime() + 86_400_000);
      const joinedAt = new Date(start.getTime() + 3_600_000);
      await prisma.profile.create({ data: { id: id("next"), username: id("next"), accountId, createdAt: joinedAt } });
      await prisma.groupLinkMember.create({ data: { groupLinkId: groupId, profileId: id("next"), joinedAt } });
      await prisma.communityInfluenceEvent.updateMany({ where: { groupLinkId: groupId, actorId: id("next"), kind: "JOIN" }, data: { occurredAt: joinedAt } });
      const where = { groupLinkId_profileId: { groupLinkId: groupId, profileId: owner } };
      const before = await prisma.communityMembershipHistory.findUniqueOrThrow({ where });
      const beforeBalance = await balance();
      const nextWhere = { groupLinkId_profileId: { groupLinkId: groupId, profileId: id("next") } };
      const nextBefore = await prisma.communityMembershipHistory.findUniqueOrThrow({ where: nextWhere });
      assert.equal(nextBefore.influenceEntryPosition, null);
      await settleCommunityInfluence(prisma, { groupLinkId: groupId, start, end });
      assert.deepEqual(await prisma.communityMembershipHistory.findUniqueOrThrow({ where: nextWhere }), nextBefore);
      assert.deepEqual(await prisma.communityMembershipHistory.findUniqueOrThrow({ where }), before);
      const aborted = { $transaction: (callback: any, options: any) => prisma.$transaction(async tx => {
        await callback(tx); throw new Error("abort after checkpoint");
      }, options) } as PrismaClient;
      await assert.rejects(settleCommunityInfluence(aborted, { groupLinkId: groupId, start, end, apply: true }), /abort after checkpoint/);
      assert.deepEqual(await prisma.communityMembershipHistory.findUniqueOrThrow({ where }), before);
      assert.deepEqual(await prisma.communityMembershipHistory.findUniqueOrThrow({ where: nextWhere }), nextBefore);
      assert.equal(await balance(), beforeBalance);
      assert.equal(await prisma.communityInfluenceSettlement.count({ where: { groupLinkId: groupId, periodStart: start } }), 0);
      await settleCommunityInfluence(prisma, { groupLinkId: groupId, start, end, apply: true });
      assert.equal((await prisma.communityMembershipHistory.findUniqueOrThrow({ where })).influenceGrowthCount, 2n);
      assert.ok((await prisma.communityMembershipHistory.findUniqueOrThrow({ where: nextWhere })).influenceEntryPosition! > 0);
      assert.equal((await prisma.communityInfluenceCredit.aggregate({
        where: { groupLinkId: groupId, profileId: owner }, _sum: { growthCount: true },
      }))._sum.growthCount, 2n);
      assert.equal(await balance(), beforeBalance + cumulativeGrowthUnits(2n, 1, policy) - cumulativeGrowthUnits(1n, 1, policy));
      await settleCommunityInfluence(prisma, { groupLinkId: groupId, start, end, apply: true });
      assert.equal((await prisma.communityMembershipHistory.findUniqueOrThrow({ where })).influenceGrowthCount, 2n);
      const actorWhere = { groupLinkId_profileId: { groupLinkId: groupId, profileId: actor } };
      const actorState = await prisma.communityMembershipHistory.findUniqueOrThrow({ where: actorWhere });
      await prisma.groupLinkMember.delete({ where: actorWhere });
      await prisma.groupLinkMember.create({ data: { groupLinkId: groupId, profileId: actor } });
      assert.equal((await prisma.communityMembershipHistory.findUniqueOrThrow({ where: actorWhere })).influenceGrowthCount, actorState.influenceGrowthCount);
      assert.equal((await prisma.communityMembershipHistory.findUniqueOrThrow({ where: actorWhere })).influenceEntryPosition, actorState.influenceEntryPosition);
    });

    await t.test("journal deletion follows profile/post deletion and invalid event shapes are rejected", async () => {
      await assert.rejects(prisma.$transaction(tx => tx.communityInfluenceEvent.create({ data: {
        groupLinkId: groupId, actorId: actor, authorId: actor, postId: publicPost,
        kind: "INTERACTION", eventKey: "invalid-self",
      } })), /CommunityInfluenceEvent_shape_check/);
      await prisma.post.delete({ where: { id: publicPost } });
      assert.equal(await prisma.communityInfluenceEvent.count({ where: { postId: publicPost } }), 0);
      const own = await balance();
      await prisma.profile.delete({ where: { id: id("fresh") } });
      assert.equal(await prisma.communityInfluenceEvent.count({ where: { actorId: id("fresh") } }), 0);
      assert.equal(await balance(), own, "settled earnings of other members are not retroactively rewritten");
    });
  } finally {
    await prisma.communityInfluenceSettings.deleteMany();
    if (dachId) await prisma.groupLink.deleteMany({ where: { id: dachId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
  }
}
