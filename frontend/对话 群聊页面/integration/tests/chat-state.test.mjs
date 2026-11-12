import assert from "node:assert/strict";
import test from "node:test";
import { http, state, activeState, fakeApi, deferred, conversationPage, context, errorEnvelope, message, messagePage, readState, response, summary } from "./chat-test-helpers.mjs";
const { ChatApiError, createChatApi } = http;
const { createChatState } = state;
const problem = (status, code) => new ChatApiError(status, code, "Synthetic server error", true, "synthetic-request", { field: "synthetic" });
function realState(fetcher) {
  const store = createChatState();
  store.activateSession(7, createChatApi({ apiBase: "/api/v1", csrfToken: "synthetic-csrf", fetcher }));
  return store;
}
function assertEmptySensitive(store) {
  assert.equal(store.snapshot().conversations.items.length, 0);
  assert.equal(store.snapshot().active?.messages.length ?? 0, 0);
  assert.equal(store.snapshot().active?.context ?? null, null);
  assert.equal(store.snapshot().active?.unreadCount ?? null, null);
}

test("inactive state has no fixtures, counts or requests; activation and selection are inert", () => {
  const fake = fakeApi(); const store = createChatState();
  assert.equal(store.snapshot().status, "inactive");
  assert.equal(store.snapshot().conversations.hasMore, null);
  let updates = 0; const unsubscribe = store.subscribe(() => updates++);
  store.activateSession(7, fake.api); store.selectConversation(2);
  assert.equal(fake.calls.length, 0); assert.equal(store.snapshot().active.unreadCount, null);
  assert.deepEqual(store.snapshot().active.messages, []); assert.ok(updates > 0);
  assert.ok(Object.isFrozen(store.snapshot()) && Object.isFrozen(store.snapshot().active));
  unsubscribe(); store.dispose();
});

test("empty success differs from loading and failure, and no state transition sends read receipts", async () => {
  const { store, calls } = activeState();
  await store.loadConversations(); assert.equal(store.snapshot().conversations.phase, "ready");
  assert.equal(store.snapshot().conversations.hasMore, false);
  store.selectConversation(1); await store.loadHistory();
  assert.equal(store.snapshot().active.phase, "ready"); assert.equal(store.snapshot().active.unreadCount, 0);
  assert.equal(store.snapshot().active.hasOlder, false);
  assert.deepEqual(calls.map((call) => call[0]), ["list", "history"]);
  const failed = activeState({ history: () => { throw problem(503, "DEPENDENCY_UNAVAILABLE"); } });
  failed.store.selectConversation(1); await failed.store.loadHistory();
  assert.equal(failed.store.snapshot().active.phase, "error");
  assert.equal(failed.store.snapshot().active.unreadCount, null);
  assert.equal(failed.store.snapshot().active.error.code, "DEPENDENCY_UNAVAILABLE");
  assert.equal(failed.calls.length, 1);
});

test("list and older-message pagination preserve server order, deduplicate overlaps and use opaque cursors", async () => {
  const { store, calls } = activeState({
    list: (options) => options.cursor ? conversationPage([summary(2), summary(3)]) : conversationPage([summary(1), summary(2)], "opaque-list"),
    history: (id, options) => options.cursor ? messagePage(id, [message(1), message(2), message(3)]) : messagePage(id, [message(3), message(4)], { has_more: true, next_cursor: "opaque-older" }),
  });
  await store.loadConversations(); await store.loadMoreConversations();
  assert.deepEqual(store.snapshot().conversations.items.map((entry) => entry.id), [1, 2, 3]);
  assert.equal(calls[1][1].cursor, "opaque-list");
  store.selectConversation(1); await store.loadHistory(); await store.loadOlder();
  assert.deepEqual(store.snapshot().active.messages.map((entry) => entry.seq), [1, 2, 3, 4]);
  assert.equal(calls[3][2].cursor, "opaque-older"); assert.equal(store.snapshot().active.hasOlder, false);
  await assert.rejects(store.loadOlder(), (error) => error.code === "INVALID_STATE_OPERATION");
});

test("increment is explicit and bounded; unread values come only from the server", async () => {
  const { store, calls } = activeState({ history: () => messagePage(1, [message(3)], { unread_count: 77 }), increment: () => messagePage(1, [message(8)], { has_more: true, unread_count: 12 }) });
  store.selectConversation(1); await store.loadHistory(); await store.loadNewer();
  assert.deepEqual(store.snapshot().active.messages.map((entry) => entry.seq), [3, 8]);
  assert.equal(store.snapshot().active.unreadCount, 12); assert.equal(store.snapshot().active.hasMoreNewer, true);
  assert.equal(calls[1][2].afterSeq, 3); assert.equal(calls.length, 2);
  assert.equal(store.snapshot().active.nextCursor, null);
});

test("read state requires explicit visible seq and never invents unread or peer-read state", async () => {
  const { store, calls } = activeState({ list: () => conversationPage([summary(1, { unread_count: 3 })]),
    history: () => messagePage(1, [message(2), message(5)], { read_seq: 2, unread_count: 3 }),
    readState: (id, query) => readState(id, Math.max(query.readSeq, 5), { unread_count: 1 }) });
  await store.loadConversations(); store.selectConversation(1); await store.loadHistory();
  await assert.rejects(store.markRead(9), (error) => error.code === "INVALID_STATE_OPERATION");
  await assert.rejects(store.markRead(3), (error) => error.code === "INVALID_STATE_OPERATION");
  await store.markRead(5);
  assert.equal(store.snapshot().active.readSeq, 5); assert.equal(store.snapshot().active.unreadCount, 1);
  assert.equal(store.snapshot().conversations.items[0].unread_count, 1);
  assert.equal(calls.filter((call) => call[0] === "readState").length, 1);
  assert.equal("peerRead" in store.snapshot().active, false);
});

test("conversation switching aborts transport and ignores late success without restoring previous messages", async () => {
  const wait = deferred(); const { store, calls } = activeState({ history: (id) => id === 1 ? wait.promise : messagePage(2, [message(1, 2)]) });
  store.selectConversation(1); const pending = store.loadHistory();
  store.selectConversation(2); await store.loadHistory();
  assert.equal(calls[0][2].signal.aborted, true);
  wait.resolve(messagePage(1, [message(1)])); assert.equal(await pending, "ignored");
  assert.equal(store.snapshot().active.id, 2); assert.equal(store.snapshot().active.messages[0].conversation_id, 2);
});

test("abort, reset, dispose and actor changes invalidate pending responses and clear sensitive state", async () => {
  for (const action of ["abort", "reset", "dispose", "actor"]) {
    const wait = deferred(); const { store, api, isDisposed } = activeState({ history: () => wait.promise });
    store.selectConversation(1); const pending = store.loadHistory();
    if (action === "actor") store.activateSession(8, fakeApi().api); else store[action]();
    wait.resolve(messagePage(1, [message()])); assert.equal(await pending, "ignored");
    assertEmptySensitive(store);
    if (action !== "abort") assert.equal(isDisposed(), true);
    if (action === "actor") assert.equal(store.snapshot().actorId, 8);
    if (action === "dispose") assert.throws(() => store.activateSession(7, api), ChatApiError);
  }
});

test("a caller AbortSignal and duplicate in-flight action cannot silently create extra requests", async () => {
  const wait = deferred(); const { store, calls } = activeState({ history: () => wait.promise });
  const cancel = new AbortController(); store.selectConversation(1);
  const pending = store.loadHistory({ signal: cancel.signal });
  await assert.rejects(store.loadHistory(), (error) => error.code === "INVALID_STATE_OPERATION");
  cancel.abort(); wait.resolve(messagePage(1, [message()]));
  assert.equal(await pending, "aborted"); assert.equal(store.snapshot().active.phase, "idle"); assert.equal(calls.length, 1);
});

test("403 and 404 remove the active conversation and its summary, while preserving other authorized summaries", async () => {
  for (const status of [403, 404]) {
    const { store } = activeState({ list: () => conversationPage([summary(1), summary(2)]), history: () => messagePage(1, [message()]), increment: () => { throw problem(status, "NOT_FOUND"); } });
    await store.loadConversations(); store.selectConversation(1); await store.loadHistory(); await store.loadNewer();
    assert.equal(store.snapshot().active.phase, "revoked"); assert.equal(store.snapshot().active.messages.length, 0);
    assert.deepEqual(store.snapshot().conversations.items.map((entry) => entry.id), [2]);
    assert.equal(store.snapshot().active.error.status, status);
  }
});

test("known global authorization error codes clear every list and message projection, including list failures", async () => {
  for (const code of ["AUTHORIZATION_CHANGED", "CURSOR_CONTEXT_CHANGED"]) {
    for (const operation of ["increment", "list"]) {
      let listCount = 0;
      const { store } = activeState({ list: () => { if (operation === "list" && listCount++) throw problem(409, code); return conversationPage([summary(1), summary(2)]); },
        history: () => messagePage(1, [message()]), increment: () => { throw problem(409, code); } });
      await store.loadConversations(); store.selectConversation(1); await store.loadHistory();
      await (operation === "list" ? store.loadConversations() : store.loadNewer());
      assertEmptySensitive(store); assert.equal(store.snapshot().conversations.error.code, code);
    }
  }
});

test("single-conversation revocation invalidates pending list results that could reintroduce its summary", async () => {
  const wait = deferred(); const { store } = activeState({ list: () => wait.promise, history: () => { throw problem(404, "NOT_FOUND"); } });
  const listPending = store.loadConversations(); store.selectConversation(1); await store.loadHistory();
  wait.resolve(conversationPage([summary(1), summary(2)])); assert.equal(await listPending, "ignored"); assertEmptySensitive(store);
});

test("context generation, malformed overlap and repeated cursor failures never keep old private text", async () => {
  for (const changed of [messagePage(1, [], { context: context(1, { authorization_version: 2 }) }), messagePage(1, [message(2, 1, { id: 101 })]), messagePage(1, [message(1)])]) {
    const { store } = activeState({ history: () => messagePage(1, [message()]), increment: () => changed });
    store.selectConversation(1); await store.loadHistory(); await store.loadNewer();
    assert.equal(store.snapshot().active.phase, "revoked"); assert.equal(store.snapshot().active.messages.length, 0);
  }
  const { store } = activeState({ history: () => messagePage(1, [message()], { has_more: true, next_cursor: "same" }) });
  store.selectConversation(1); await store.loadHistory(); await store.loadOlder(); assertEmptySensitive(store);
});

test("real client plus state observes an aborted same-session 401 and clears all cached private data", async () => {
  const wait = deferred(); let observed;
  const store = realState(async (url, init) => {
    if (!url.includes("/messages")) return response(conversationPage([summary(1), summary(2)]));
    if (url.includes("/1/")) { observed = init.signal; return wait.promise; }
    return response(messagePage(2, [message(1, 2)]));
  });
  await store.loadConversations(); store.selectConversation(1); const pending = store.loadHistory();
  store.selectConversation(2); await store.loadHistory(); assert.equal(observed.aborted, true);
  wait.resolve(response(errorEnvelope("AUTH_REQUIRED"), 401)); await pending;
  assert.equal(store.snapshot().status, "signed-out"); assert.equal(store.snapshot().actorId, null); assertEmptySensitive(store);
});

test("real client late 401 from an old actor/session cannot sign out the new session", async () => {
  const wait = deferred(); const store = realState(() => wait.promise);
  store.selectConversation(1); const pending = store.loadHistory();
  store.activateSession(8, createChatApi({ apiBase: "/api/v1", csrfToken: "synthetic-new-csrf", fetcher: async () => response(conversationPage([summary(2)])) }));
  await store.loadConversations(); wait.resolve(response(errorEnvelope("AUTH_REQUIRED"), 401));
  assert.equal(await pending, "ignored"); assert.equal(store.snapshot().status, "active"); assert.equal(store.snapshot().actorId, 8); assert.equal(store.snapshot().conversations.items[0].id, 2);
});

test("real client empty increment or read-state revision change clears all old sender and conversation projections", async () => {
  for (const operation of ["increment", "read"]) {
    const store = realState(async (url, init) => {
      if (init.method === "PUT") return response(readState(1, 1, { context: context(1, { authorization_revision: 2 }) }));
      if (url.includes("after_seq")) return response(messagePage(1, [], { context: context(1, { authorization_revision: 2 }) }));
      if (url.includes("/messages")) return response(messagePage(1, [message()]));
      return response(conversationPage([summary(1), summary(2)]));
    });
    await store.loadConversations(); store.selectConversation(1); await store.loadHistory();
    assert.equal(store.snapshot().active.messages[0].sender.status, "available");
    await (operation === "read" ? store.markRead(1) : store.loadNewer());
    assertEmptySensitive(store); assert.equal(store.snapshot().active.phase, "revoked");
    assert.equal(store.snapshot().conversations.error.code, "AUTHORIZATION_CHANGED");
  }
});

test("real client fresh history on newer revision clears every old summary and accepts only the reauthorized page", async () => {
  let historyCount = 0; const store = realState(async (url) => {
    if (!url.includes("/messages")) return response(conversationPage([summary(1), summary(2)]));
    if (historyCount++ === 0) return response(messagePage(1, [message()]));
    return response(messagePage(1, [message(1, 1, { sender: { status: "unavailable" } })], { context: context(1, { authorization_revision: 2 }) }));
  });
  await store.loadConversations(); store.selectConversation(1); await store.loadHistory(); await store.loadHistory();
  assert.equal(store.snapshot().conversations.items.length, 0); assert.equal(store.snapshot().active.context.authorization_revision, 2);
  assert.deepEqual(store.snapshot().active.messages[0].sender, { status: "unavailable" });
});

test("fresh lists replace every old projection on revision change; continuation pages cannot cross revisions", async () => {
  for (const more of [false, true]) {
    let listCount = 0; const store = realState(async (url) => {
      if (url.includes("/messages")) return response(messagePage(1, [message()]));
      return response(listCount++ === 0 ? conversationPage([summary(1)], "older-list") : conversationPage([summary(2)], null, 2));
    });
    await store.loadConversations(); store.selectConversation(1); await store.loadHistory();
    await (more ? store.loadMoreConversations() : store.loadConversations());
    if (more) assertEmptySensitive(store);
    else { assert.equal(store.snapshot().active, null); assert.deepEqual(store.snapshot().conversations.items.map((entry) => entry.id), [2]); assert.equal(store.snapshot().conversations.authorizationRevision, 2); }
  }
});

test("initial concurrent list/detail responses cannot downgrade the observed authorization revision", async () => {
  for (const first of ["list", "history"]) {
    const list = deferred(); const history = deferred();
    const store = realState((url) => url.includes("/messages") ? history.promise : list.promise);
    store.selectConversation(1); const listPending = store.loadConversations(); const historyPending = store.loadHistory();
    if (first === "list") { list.resolve(response(conversationPage([summary(2)], null, 2))); await listPending; history.resolve(response(messagePage(1, [message()]))); await historyPending; }
    else { history.resolve(response(messagePage(1, [message(2)], { context: context(1, { authorization_revision: 2 }) }))); await historyPending; list.resolve(response(conversationPage([summary(1)]))); await listPending; }
    // Fail closed if the transport delivered a lower revision after the first
    // baseline. Neither old sender text nor an old list can become current.
    assertEmptySensitive(store);
  }
});

test("established revision upgrades invalidate other pending work even when transport ignores abort", async () => {
  const late = deferred(); let listCount = 0; let historyCount = 0;
  const store = realState(async (url) => {
    if (!url.includes("/messages")) return response(listCount++ === 0 ? conversationPage([summary(1)]) : conversationPage([summary(2)], null, 2));
    return historyCount++ === 0 ? response(messagePage(1, [message()])) : late.promise;
  });
  await store.loadConversations(); store.selectConversation(1); await store.loadHistory();
  const pending = store.loadHistory(); await store.loadConversations();
  late.resolve(response(messagePage(1, [message()]))); assert.equal(await pending, "ignored");
  assert.equal(store.snapshot().active, null); assert.deepEqual(store.snapshot().conversations.items.map((entry) => entry.id), [2]);
});

test("invalid read responses cannot regress a current-generation receipt or reuse a revoked context", async () => {
  const { store } = activeState({ history: () => messagePage(1, [message(1), message(2)], { read_seq: 2 }), readState: () => readState(1, 1) });
  store.selectConversation(1); await store.loadHistory(); await store.markRead(1);
  assertEmptySensitive(store); assert.equal(store.snapshot().active.phase, "revoked");
});

test("revoking caches preserves the same-session highest observed revision against later stale reads", async () => {
  const store = realState(async (url) => {
    if (url.includes("after_seq")) return response(messagePage(1, [], { context: context(1, { authorization_revision: 2 }) }));
    if (url.includes("/messages")) return response(messagePage(1, [message()]));
    return response(conversationPage([summary(1)]));
  });
  await store.loadConversations(); store.selectConversation(1); await store.loadHistory(); await store.loadNewer();
  assertEmptySensitive(store);
  store.selectConversation(1); await store.loadHistory(); assertEmptySensitive(store);
  await store.loadConversations(); assertEmptySensitive(store);
  assert.equal(store.snapshot().conversations.error.code, "AUTHORIZATION_CHANGED");
  // A new session legitimately starts a separate revision scope.
  store.activateSession(7, createChatApi({ apiBase: "/api/v1", csrfToken: "synthetic-new-session", fetcher: async () => response(conversationPage([summary(1)])) }));
  await store.loadConversations(); assert.equal(store.snapshot().conversations.items.length, 1);
});
