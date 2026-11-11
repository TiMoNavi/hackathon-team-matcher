import test from "node:test";
import assert from "node:assert/strict";
import { graphql, parse, validate } from "graphql";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { testCommunityDiscovery } from "./communityDiscovery.cases";
import { testCommunityMembership } from "./communityMembership.cases";
import { testNetworkCommunity } from "./networkCommunity.cases";
import { testCommunityInfluenceLedger } from "./communityInfluenceLedger.cases";
import { testCommunityInfluence } from "./communityInfluence.cases";
import { testCommunityInfluenceGrowth } from "./communityInfluenceGrowth.cases";
import { testCommunityInfluenceSupport } from "./communityInfluenceSupport.cases";
import { testCommunityInfluenceRanking } from "./communityInfluenceRanking.cases";
import { testCommunityConcurrency } from "./communityConcurrency.cases";
import { testCommunityRelease } from "./communityRelease.cases";

test("community audience and API regression suite", async (t) => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url, "Set TEST_DATABASE_URL to a disposable local database with the schema and migration applied");
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Tests only run against localhost");
  assert.equal(process.env.DATABASE_URL, url, "DATABASE_URL must equal TEST_DATABASE_URL");
  assert.equal(process.env.DOTENV_CONFIG_PATH, "/dev/null", "Disable application .env loading for tests");

  const { prisma, createContext } = await import("../src/context");
  const { visiblePostWhere, visiblePostSql, canViewPost } = await import("../src/lib/postVisibility");
  const { protectPostResults } = await import("../src/graphql/post-visibility");
  const { typeDefs } = await import("../src/schema");
  const { resolvers } = await import("../src/resolvers");
  const schema = protectPostResults(makeExecutableSchema({ typeDefs, resolvers }));
  const ctx = (profileId?: string) => ({ prisma, profileId, accountId: "privacy_test_account" });
  const query = (source: string, profileId?: string, variableValues?: Record<string, unknown>) =>
    graphql({ schema, source, variableValues, contextValue: ctx(profileId) });
  const success = (result: any) => { assert.equal(result.errors, undefined, JSON.stringify(result.errors)); return result.data; };
  const id = (name: string) => `privacy_test_${name}`;
  const owner = id("owner"), member = id("member"), outsider = id("outsider"), privateAuthor = id("private_author");
  const publicGroup = id("public_group"), privateGroup = id("private_group");
  const publicPost = id("public_post"), privatePost = id("private_post"), personalPost = id("personal_post");
  const ownPublicPost = id("own_public_post"), orphanPost = id("orphan_post");
  try {
    await prisma.account.create({ data: { id: id("account"), emailVerifiedAt: new Date() } });
    for (const profileId of [owner, member, outsider, privateAuthor]) {
      await prisma.profile.create({ data: {
        id: profileId, username: profileId, accountId: id("account"),
        isPrivate: profileId === privateAuthor, termsVersionAccepted: 1,
        city: "Salzburg", cityLat: 47.8, cityLng: 13.04,
      } });
    }
    for (const [groupId, visibility] of [[publicGroup, "PUBLIC"], [privateGroup, "PRIVATE"]] as const) {
      await prisma.groupLink.create({ data: {
        id: groupId, title: groupId, code: groupId, slug: groupId, ownerId: owner, visibility,
        members: { create: [{ profileId: member }, { profileId: privateAuthor }] },
        context: { create: { id: groupId, key: `group:${groupId}`, kind: "TOPIC", label: groupId } },
      } });
    }
    for (const [postId, authorId, groupId] of [
      [publicPost, privateAuthor, publicGroup], [privatePost, owner, privateGroup],
      [personalPost, privateAuthor, null], [ownPublicPost, owner, null],
    ]) {
      await prisma.post.create({ data: {
        id: postId!, authorId: authorId!, caption: postId, imageKey: `tests/${postId}.jpg`,
        ...(groupId ? { postContexts: { create: { contextId: groupId, source: "IMPORT" } } } : {}),
      } });
    }
    await prisma.post.create({ data: {
      id: orphanPost, authorId: owner,
      postContexts: { create: { source: "IMPORT", context: { create: { key: "group:deleted", kind: "TOPIC", label: "Deleted private" } } } },
    } });
    await prisma.postMedia.create({ data: { postId: privatePost, idx: 0, kind: "IMAGE", mime: "image/jpeg", key: "tests/private-media.jpg" } });
    await prisma.follow.create({ data: { followerId: outsider, followingId: owner } });

    await t.test("legacy migration defaults to private and backfills contexts", async () => {
      const legacy = await prisma.groupLink.findUnique({ where: { id: "privacy_legacy_group" }, include: { context: true } });
      assert.ok(legacy, "Seed a historical group/context before applying the new migration");
      assert.equal(legacy.visibility, "PRIVATE");
      assert.equal(legacy.context?.id, "privacy_legacy_context");
      assert.equal(await canViewPost(ctx(outsider), "privacy_legacy_post"), false);
    });

    await t.test("SQL and Prisma enforce the same audience, including same-account profiles", async () => {
      for (const viewer of [undefined, owner, member, outsider, privateAuthor]) {
        const orm = await prisma.post.findMany({ where: visiblePostWhere(ctx(viewer)), select: { id: true }, orderBy: { id: "asc" } });
        const sql = await prisma.$queryRaw<Array<{ id: string }>>`SELECT p.id FROM "Post" p WHERE ${visiblePostSql(ctx(viewer), Prisma.sql`p.id`)} ORDER BY p.id`;
        assert.deepEqual(sql.map(p => p.id), orm.map(p => p.id), String(viewer));
      }
      assert.equal(await canViewPost(ctx(outsider), privatePost), false);
      assert.equal(await canViewPost(ctx(member), privatePost), true);
      assert.equal(await canViewPost(ctx(outsider), publicPost), true);
      assert.equal(await canViewPost(ctx(outsider), personalPost), false);
      assert.equal(await canViewPost(ctx(owner), orphanPost), false);
    });

    await t.test("nested/direct posts and signed media are inaccessible to nonmembers", async () => {
      const denied = success(await query(`query($id: ID!){ post(id:$id){ id caption imageUrl media { imageUrl } } }`, outsider, { id: privatePost }));
      assert.equal(denied.post, null);
      const allowed = success(await query(`query($id: ID!){ post(id:$id){ id imageUrl media { imageUrl } } }`, member, { id: privatePost }));
      assert.ok(allowed.post.imageUrl.includes("X-Amz-Signature"));
      assert.ok(allowed.post.media[0].imageUrl.includes("X-Amz-Signature"));
      const nested = success(await query(`query($id: ID!){ userById(id:$id){ posts { id } } }`, outsider, { id: owner }));
      assert.ok(!nested.userById.posts.some((p: any) => p.id === privatePost));
    });

    await t.test("public posts on private profiles and before-pagination filtering", async () => {
      const result = success(await query(`query($id: ID!){ profileGrid(userId:$id,tab:"posts"){ id } postsByUser(userId:$id,kind:POST){ id } }`, outsider, { id: privateAuthor }));
      assert.deepEqual(result.profileGrid.map((p: any) => p.id), [publicPost]);
      assert.deepEqual(result.postsByUser.map((p: any) => p.id), [publicPost]);
      const posts = await prisma.post.findMany({ where: { AND: [visiblePostWhere(ctx(outsider)), { authorId: owner }] }, take: 1 });
      assert.equal(posts[0].id, ownPublicPost);
    });

    await t.test("public community readable; private community and all community chats require membership", async () => {
      const publicResult = success(await query(`query($id:ID!){ groupLink(id:$id){ visibility } groupLinkPosts(groupId:$id){ id } groupLinkMembers(groupId:$id){ id } }`, outsider, { id: publicGroup }));
      assert.equal(publicResult.groupLink.visibility, "PUBLIC");
      assert.equal(publicResult.groupLinkPosts[0].id, publicPost);
      assert.ok((await query(`query($id:ID!){ groupLink(id:$id){ id } }`, outsider, { id: privateGroup })).errors);
      assert.ok((await query(`query($id:ID!){ communityThread(groupId:$id){ id } }`, outsider, { id: publicGroup })).errors);
    });

    await t.test("DROP creation defaults private; explicit public creation; visibility immutable", async () => {
      const a = success(await query('mutation { createGroupLink(title:"Test drop",type:DROP){ id type visibility } }', owner)).createGroupLink;
      assert.equal(a.type, "DROP"); assert.equal(a.visibility, "PRIVATE");
      const b = success(await query('mutation { createGroupLink(title:"Public drop",type:DROP,visibility:PUBLIC){ id visibility } }', owner)).createGroupLink;
      assert.equal(b.visibility, "PUBLIC");
      assert.ok((await query(`mutation($id:ID!){ updateGroupLink(id:$id,input:{visibility:PUBLIC}){ id } }`, owner, { id: a.id })).errors);
      await assert.rejects(prisma.groupLink.update({ where: { id: a.id }, data: { visibility: "PUBLIC" } }), /COMMUNITY_VISIBILITY_IMMUTABLE/);
      await assert.rejects(prisma.groupLink.update({ where: { id: b.id }, data: { visibility: "PRIVATE" } }), /COMMUNITY_VISIBILITY_IMMUTABLE/);
      assert.equal(success(await query(`mutation($id:ID!){ updateGroupLink(id:$id,input:{title:"Updated title"}){ title visibility } }`, owner, { id: a.id })).updateGroupLink.visibility, "PRIVATE");
    });

    await t.test("leaving revokes access, joining by link restores it", async () => {
      success(await query(`mutation($id:ID!){ leaveGroup(groupId:$id) }`, member, { id: privateGroup }));
      assert.equal(await canViewPost(ctx(member), privatePost), false);
      success(await query(`mutation($slug:String!){ joinGroupLink(slug:$slug){ id } }`, member, { slug: privateGroup }));
      assert.equal(await canViewPost(ctx(member), privatePost), true);
    });

    await t.test("stale chat memberships cannot bypass community access, including live delivery", async () => {
      const chat = await import("../src/chat/service");
      const { resolvers: chatResolvers } = await import("../src/chat/resolvers");
      const thread = await chat.ensureCommunityThread(prisma, privateGroup);
      assert.ok(thread);
      const args = { threadId: thread.id };
      const msg = await prisma.message.create({ data: { ...args, senderId: owner, kind: "text", text: "Members only" } });
      await prisma.threadMember.create({ data: { ...args, userId: outsider } });
      const memberIterator = await chatResolvers.Subscription.messageAdded.subscribe(null, args, ctx(member));
      await memberIterator.return?.();
      assert.equal((await chatResolvers.Subscription.messageAdded.resolve({ messageAdded: msg }, args, ctx(member))).id, msg.id);
      await prisma.groupLinkMember.delete({ where: { groupLinkId_profileId: { groupLinkId: privateGroup, profileId: member } } });
      for (const viewer of [outsider, member]) {
        assert.ok((await query('query($threadId:ID!){ thread(threadId:$threadId){ id } }', viewer, args)).errors);
        await assert.rejects(chat.messages(prisma, viewer, thread.id), /NO_ACCESS_TO_THREAD/);
        await assert.rejects(chat.sendMessage(prisma, viewer, { ...args, kind: "text", text: "Denied" }), /NO_ACCESS_TO_THREAD/);
        await assert.rejects(chatResolvers.Subscription.messageAdded.subscribe(null, args, ctx(viewer)), /NO_ACCESS_TO_THREAD/);
        await assert.rejects(chatResolvers.Subscription.messageAdded.resolve({ messageAdded: msg }, args, ctx(viewer)), /NO_ACCESS_TO_THREAD/);
        await assert.rejects(chatResolvers.Subscription.typing.resolve({ isTyping: true }, args, ctx(viewer)), /NO_ACCESS_TO_THREAD/);
        assert.ok(!(await chat.listThreads(prisma, viewer)).some(t => t.id === thread.id));
        assert.ok(!(await chat.unreadCount(prisma, viewer)).perThread.some(t => t.threadId === thread.id));
      }
      await prisma.threadMember.deleteMany({ where: { ...args, userId: outsider } });
      await prisma.groupLinkMember.create({ data: { groupLinkId: privateGroup, profileId: member } });
      success(await query('mutation($groupId:ID!,$profileId:ID!){ removeGroupLinkMember(groupId:$groupId,profileId:$profileId) }', owner, { groupId: privateGroup, profileId: member }));
      assert.equal(await canViewPost(ctx(member), privatePost), false);
      success(await query('mutation($slug:String!){ joinGroupLink(slug:$slug){ id } }', member, { slug: privateGroup }));
    });

    await t.test("shared stories and notification previews cannot reveal private posts", async () => {
      const story = await prisma.story.create({ data: {
        authorId: owner, mediaKey: "tests/shared.jpg", mime: "image/jpeg",
        editJson: JSON.stringify({ sharedPost: { postId: privatePost } }),
      } });
      for (const viewer of [outsider, member]) {
        const result = success(await query('query($id:ID!){ story(id:$id){ id mediaUrl editJson } }', viewer, { id: story.id }));
        assert.equal(Boolean(result.story), viewer === member);
      }
      await prisma.notification.createMany({ data: [
        { recipientId: outsider, fromUserId: owner, kind: "LIKE", channel: "BOTH", postId: privatePost },
        { recipientId: outsider, fromUserId: owner, kind: "SYSTEM", channel: "BOTH", payload: { postIds: [privatePost], text: "Private caption" } },
        { recipientId: outsider, fromUserId: owner, kind: "LIKE", channel: "BOTH", postId: publicPost },
      ] });
      const result = success(await query('{ inbox { edges { payload post { id imageUrl } } } }', outsider));
      assert.ok(!JSON.stringify(result).includes(privatePost));
      assert.ok(!JSON.stringify(result).includes("Private caption"));
      assert.ok(JSON.stringify(result).includes(publicPost));
      await prisma.notification.deleteMany({ where: { recipientId: outsider } });
      const { notify } = await import("../src/lib/notify");
      assert.equal(await notify({ prisma, recipientId: outsider, kind: "LIKE", postId: privatePost }), null);
      assert.equal(await notify({ prisma, recipientId: outsider, kind: "SYSTEM", payload: { postIds: [privatePost] } }), null);
      assert.equal(await prisma.notification.count({ where: { recipientId: outsider } }), 0);
    });

    await t.test("Moments mix retains accessible personal posts of shared members", async () => {
      success(await query('mutation($slug:String!){ joinGroupLink(slug:$slug){ id } }', outsider, { slug: publicGroup }));
      const result = success(await query('{ communityMomentsFeed { id } }', outsider));
      const ids = result.communityMomentsFeed.map((p: any) => p.id);
      assert.ok(ids.includes(ownPublicPost));
      assert.ok(ids.includes(publicPost));
      assert.ok(!ids.includes(privatePost));
      assert.ok(!ids.includes(personalPost));
      success(await query('mutation($id:ID!){ leaveGroup(groupId:$id) }', outsider, { id: publicGroup }));
    });

    await t.test("deleting a community leaves its posts private instead of widening the audience", async () => {
      const group = await prisma.groupLink.create({ data: {
        code: id("deleted"), title: "Deleted", ownerId: owner,
        context: { create: { key: `group:${id("deleted")}`, kind: "TOPIC", label: "Deleted" } },
      }, include: { context: true } });
      const post = await prisma.post.create({ data: {
        authorId: owner, postContexts: { create: { contextId: group.context!.id, source: "IMPORT" } },
      } });
      await prisma.groupLink.delete({ where: { id: group.id } });
      assert.equal(await canViewPost(ctx(owner), post.id), false);
      assert.equal(await canViewPost(ctx(outsider), post.id), false);
    });

    await t.test("private associations cannot be removed or moved; captions remain editable", async () => {
      for (const groupLinkId of [null, publicGroup]) {
        const res = await query(`mutation($input:UpdatePostInput!){ updatePost(input:$input){ id } }`, owner, { input: { id: privatePost, groupLinkId } });
        assert.match(res.errors?.[0].message ?? "", /PRIVATE_COMMUNITY_POST_CANNOT_MOVE/);
      }
      success(await query(`mutation($input:UpdatePostInput!){ updatePost(input:$input){ id } }`, owner, { input: { id: privatePost, caption: "Edited" } }));
      assert.equal(await canViewPost(ctx(outsider), privatePost), false);
    });

    await t.test("nonmembers cannot comment, like or record views", async () => {
      for (const operation of ['addComment(postId:$id,content:"hello"){id}', 'likePost(postId:$id){id}', 'markPostViewed(postId:$id){id}']) {
        const result = await query(`mutation($id:ID!){ ${operation} }`, outsider, { id: privatePost });
        assert.ok(result.errors, operation);
        assert.match(result.errors[0].message, /Not found|Forbidden/);
      }
      assert.equal(await prisma.comment.count({ where: { postId: privatePost } }), 0);
    });

    await t.test("blocks, bans and deactivated communities override visibility", async () => {
      await prisma.userBlock.create({ data: { blockerId: privateAuthor, blockedId: outsider } });
      assert.equal(await canViewPost(ctx(outsider), publicPost), false);
      await prisma.userBlock.deleteMany({ where: { blockerId: privateAuthor } });
      await prisma.profile.update({ where: { id: privateAuthor }, data: { bannedUntil: new Date(Date.now() + 60000) } });
      assert.equal(await canViewPost(ctx(member), publicPost), false);
      await prisma.profile.update({ where: { id: privateAuthor }, data: { bannedUntil: null } });
      await prisma.groupLink.update({ where: { id: publicGroup }, data: { isActive: false } });
      assert.equal(await canViewPost(ctx(owner), publicPost), false);
      await prisma.groupLink.update({ where: { id: publicGroup }, data: { isActive: true } });
    });

    await t.test("unauthenticated or mismatched profile headers do not grant access", async () => {
      const req = (authorization?: string, profile = owner) => ({ headers: { authorization, "x-profile-id": profile } } as any);
      assert.equal((await createContext({ req: req() })).profileId, undefined);
      assert.equal((await createContext({ req: req("Bearer invalid") })).profileId, undefined);
      const token = jwt.sign({ accountId: id("account") }, process.env.JWT_SECRET!);
      assert.equal((await createContext({ req: req(`Bearer ${token}`) })).profileId, owner);
      assert.equal((await createContext({ req: req(`Bearer ${token}`, "privacy_legacy_owner") })).profileId, undefined);
    });

    await t.test("feeds and raw context search exclude private content", async () => {
      const result = success(await query('{ feed { id } reelsFeed { id } communityMomentsFeed { id } homeFeed { post { id } } contextBubbles { key } searchContexts(q:"privacy"){ label } }', outsider));
      assert.ok(!JSON.stringify(result).includes(privatePost));
      assert.ok(!JSON.stringify(result).includes(privateGroup));
      success(await query(`query($key:String!){ suggestPostsByContext(contextKey:$key){ id } }`, outsider, { key: `group:${privateGroup}` }));
    });

    await t.test("modified mobile documents validate against the real schema", () => {
      for (const path of ['GroupLinkSheet.tsx', 'CommunitySpaceScreen.tsx', 'PostEditScreen.tsx', 'GroupsScreen.tsx', 'create/post/components/PublishForm.tsx']) {
        const text = readFileSync(resolve(__dirname, '../../ciaorelated/src/screens', path), 'utf8');
        for (const match of text.matchAll(/gql`([\s\S]*?)`/g)) {
          if (match[1].includes('${')) continue;
          assert.deepEqual(validate(schema, parse(match[1])).map(e => e.message), [], path);
        }
      }
    });

    await t.test("single and carousel creation enforce membership and attach the typed community", async () => {
      for (const carousel of [false, true]) {
        const inputType = carousel ? "CreateCarouselPostInput" : "CreatePostInput";
        const operation = carousel ? "createCarouselPost" : "createPost";
        const source = `mutation($input:${inputType}!){ ${operation}(input:$input){ id communityContext { groupId visibility } } }`;
        const media = { key: "tests/new.jpg", thumbKey: "tests/thumb.jpg", mime: "image/jpeg" };
        const base = carousel ? { media: [{ ...media, idx: 0, kind: "IMAGE" }] } : { ...media, kind: "POST" };
        const denied = await query(source, outsider, { input: { ...base, groupLinkId: privateGroup } });
        assert.match(denied.errors?.[0].message ?? "", /Forbidden|member/i);
        const created = success(await query(source, member, { input: { ...base, groupLinkId: privateGroup } }))[operation];
        assert.equal(created.communityContext.visibility, "PRIVATE");
        assert.equal(await canViewPost(ctx(outsider), created.id), false);
        const context = await prisma.postContext.findFirst({ where: { postId: created.id }, include: { context: true } });
        assert.equal(context?.context.groupLinkId, privateGroup);
        const ordinary = success(await query(source, owner, { input: base }))[operation];
        assert.equal(ordinary.communityContext, null);
        assert.equal(await canViewPost(ctx(outsider), ordinary.id), true);
      }
    });

    await t.test("response checks are batched but not cached across mutation fields", async () => {
      let checks = 0;
      let accessible = true;
      const boundarySchema = protectPostResults(makeExecutableSchema({
        typeDefs: 'type Post { id: ID! } type Item { post: Post } type Query { items: [Item!]! } type Mutation { before: Post revoke: Boolean! after: Post }',
        resolvers: {
          Query: { items: () => Array.from({ length: 12 }, () => ({ post: { id: publicPost } })) },
          Mutation: { before: () => ({ id: publicPost }), revoke: () => { accessible = false; return true; }, after: () => ({ id: publicPost }) },
        },
      }));
      const contextValue = { profileId: member, prisma: { post: { findMany: async () => { checks++; return accessible ? [{ id: publicPost }] : []; } } } };
      success(await graphql({ schema: boundarySchema, source: '{ items { post { id } } }', contextValue }));
      assert.equal(checks, 1);
      const result = success(await graphql({ schema: boundarySchema, source: 'mutation { before { id } revoke after { id } }', contextValue }));
      assert.equal(result.before.id, publicPost);
      assert.equal(result.after, null);
      assert.equal(checks, 3);
    });
    await testCommunityDiscovery(t, prisma, schema);
    await testCommunityMembership(t, prisma, schema);
    await testNetworkCommunity(t, prisma, schema);
    await testCommunityInfluenceLedger(t, prisma, schema);
    await testCommunityInfluence(t, prisma, schema);
    await testCommunityInfluenceGrowth(t);
    await testCommunityInfluenceSupport(t, prisma, schema);
    await testCommunityInfluenceRanking(t, prisma, schema);
    await testCommunityConcurrency(t, prisma, schema);
    await testCommunityRelease(t, prisma);
  } finally {
    try {
      await prisma.message.deleteMany({ where: { senderId: { in: [owner, member, outsider, privateAuthor] } } });
      await prisma.threadMember.deleteMany({ where: { userId: { in: [owner, member, outsider, privateAuthor] } } });
      await prisma.account.deleteMany({ where: { id: id("account") } });
      await prisma.context.deleteMany({ where: { OR: [{ key: { startsWith: `group:${id("")}` } }, { key: "group:deleted" }] } });
    } finally { await prisma.$disconnect(); }
  }
});
