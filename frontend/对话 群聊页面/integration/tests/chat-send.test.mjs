import assert from "node:assert/strict";
import test from "node:test";
import { conversationPage, context, deferred, envelope, errorEnvelope, message, messagePage, response, summary } from "./chat-test-helpers.mjs";
const { createChatApi, ChatApiError } = await import("../src/chat/http.ts");
const { parseSendReceipt } = await import("../src/chat/contracts.ts");
const { createReadController } = await import("../src/chat/read-controller.ts");
const { parseReadBootstrap } = await import("../src/chat/read-bootstrap.ts");
const { createSendDraft } = await import("../src/chat/send-draft.ts");
const { isSendKey, validateMessageBody, validateClientMessageId } = await import("../src/chat/send-input.ts");
const shared = await import("../src/chat/client.ts");
const key = "01234567-89ab-4cde-8fab-0123456789ab";
const key2 = "11234567-89ab-4cde-8fab-0123456789ab";
const sendPermissions = { read: true, send: true, invite: false, leave: false };
const authority = (id = 1, changes = {}) => context(id, { permissions: sendPermissions, ...changes });
const history = (items = [], changes = {}) => messagePage(1, items, { context: authority(), ...changes });
const receipt = (body = "hello", changes = {}) => envelope({ message: message(1, 1, { body }), client_message_id: key, replayed: false,
  read_seq: 0, unread_count: 0, context: authority(), ...changes });
const config = parseReadBootstrap({ schema_version: 2, integration_stage: "read", base_path: "/matcher/chat", api_base: "/api/v1", native_home_url: "/dashboard", native_login_url: "/user/auth/login", native_chat_url: "/mail/mail/index", csrf_header: "X-CSRF-Token", csrf_token: "synthetic-c05-csrf", actor_id: 7 }, "https://same-origin.invalid");
const api = (fetcher) => createChatApi({ apiBase: "/api/v1", csrfToken: "synthetic-c05-csrf", expectedActorId: 7, fetcher });
const load = async (fetcher) => { const value = createReadController(config, fetcher); await value.start("/matcher/chat/conversations/1"); return value; };
const list = () => conversationPage([summary(1, { permissions: sendPermissions })]);

test("text validation keeps exact Unicode payload and counts codepoints without normalization", () => {
  for (const value of ["  hello\n", "\t你好\r\n", "😀".repeat(4000), "e\u0301", "\uFEFF", "\u200B"]) assert.equal(validateMessageBody(value), value);
  for (const value of ["", " \t\r\n", "\u2003\u00a0", "x".repeat(4001), "😀".repeat(4001), "a\0", "\u007f", "\u0085", "\u009f", "\uD800", 1]) assert.throws(() => validateMessageBody(value));
  assert.equal(validateClientMessageId(key), key);
  for (const value of [key.toUpperCase(), key.replace("4cde", "3cde"), "not-a-key", null]) assert.throws(() => validateClientMessageId(value));
});

test("IME composition, 229 and modifiers cannot submit; plain Enter and Shift newline are distinct", () => {
  const event = { key: "Enter", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isComposing: false, keyCode: 13 };
  assert.equal(isSendKey(event, false), true);
  for (const change of [{ isComposing: true }, { keyCode: 229 }, { shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { key: "a" }]) assert.equal(isSendKey({ ...event, ...change }, false), false);
  assert.equal(isSendKey(event, true), false);
});

test("shared client imports and path builders are inert and expose no friend or create endpoint", () => {
  let calls = 0; const client = shared.createChatApi({ apiBase: "/api/v1", csrfToken: "synthetic", fetcher: async () => { calls++; return response(list()); } });
  assert.equal(calls, 0); assert.equal(shared.chatListPath(), "/matcher/chat"); assert.equal(shared.chatConversationPath(19), "/matcher/chat/conversations/19");
  for (const value of [null, 0, -1, "1", 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => shared.chatConversationPath(value));
  assert.ok(!Object.keys(client).some((name) => /friend|create|invite/i.test(name))); client.dispose(); assert.equal(calls, 0);
});

test("send receipt strictly binds six fields and permits only authorized replayed text or tombstone", () => {
  assert.ok(Object.isFrozen(parseSendReceipt(receipt()).data));
  const deleted = message(1, 1, { kind: "deleted", body: null, sender: { status: "unavailable" } });
  assert.equal(parseSendReceipt(receipt("old", { replayed: true, message: deleted })).data.message.body, null);
  assert.equal(parseSendReceipt(receipt("old", { replayed: true, message: message(1, 1, { body: "edited" }) })).data.message.body, "edited");
  for (const change of [{ extra: true }, { client_message_id: "invalid" }, { message: deleted }, { replayed: true, message: message(1, 1, { kind: "system" }) }, { message: message(1, 2) }, { context: authority(1, { type: "group" }) }, { read_seq: -1 }]) assert.throws(() => parseSendReceipt(receipt("hello", change)));
  assert.equal(parseSendReceipt(receipt("\uFEFF")).data.message.body, "\uFEFF");
});

test("POST uses native session CSRF and exact original key/body; 201 and replayed 200 remain distinct", async () => {
  const calls = []; const body = "  hello\n";
  const client = api(async (url, init) => { calls.push([url, init]); return response(receipt(body, { replayed: calls.length > 1 }), calls.length === 1 ? 201 : 200); });
  const sent = await client.sendText(1, { clientMessageId: key, body }); const replay = await client.sendText(1, { clientMessageId: key, body });
  assert.equal(sent.data.replayed, false); assert.equal(replay.data.replayed, true);
  for (const [url, init] of calls) {
    assert.equal(url, "/api/v1/conversations/1/messages"); assert.equal(init.method, "POST"); assert.equal(init.headers["X-CSRF-Token"], "synthetic-c05-csrf");
    assert.equal(init.headers["X-Matcher-Chat-Actor"], "7"); assert.equal(init.credentials, "same-origin"); assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error");
    assert.deepEqual(JSON.parse(init.body), { client_message_id: key, body });
  }
});

test("send HTTP parser rejects mismatched new receipts but accepts edited or deleted current replay projections", async () => {
  for (const [payload, status] of [[receipt("wrong"), 201], [receipt("hello", { client_message_id: key2 }), 201], [receipt(), 200], [receipt("hello", { replayed: true }), 201], [receipt(), 202]]) {
    await assert.rejects(api(async () => response(payload, status)).sendText(1, { clientMessageId: key, body: "hello" }), (error) => error.code === "INVALID_RESPONSE");
  }
  for (const current of [message(1, 1, { body: "edited" }), message(1, 1, { kind: "deleted", body: null, sender: { status: "unavailable" } })]) {
    const value = await api(async () => response(receipt("hello", { replayed: true, message: current }), 200)).sendText(1, { clientMessageId: key, body: "hello" });
    assert.deepEqual(value.data.message, current);
  }
});

test("invalid send inputs never fetch and network failures never auto-retry", async () => {
  let calls = 0; const client = api(async () => { calls++; throw new Error("synthetic transport loss"); });
  for (const options of [{ clientMessageId: "bad", body: "hello" }, { clientMessageId: key, body: " " }, { clientMessageId: key, body: "x", actor_id: 8 }, { clientMessageId: key, body: "x", attachments: [] }]) assert.throws(() => client.sendText(1, options));
  assert.equal(calls, 0); await assert.rejects(client.sendText(1, { clientMessageId: key, body: "hello" }), (error) => error.code === "NETWORK_ERROR"); assert.equal(calls, 1);
});

test("draft retains original uncertain attempt; explicit re-edit allocates a fresh key", () => {
  const keys = [key, key2]; const draft = createSendDraft(() => keys.shift()); draft.edit("  original\n");
  assert.deepEqual(draft.begin(false), { body: "  original\n", clientMessageId: key });
  assert.throws(() => draft.begin(false)); assert.throws(() => draft.edit("changed"));
  draft.fail(new ChatApiError(0, "NETWORK_ERROR", "unknown")); assert.equal(draft.snapshot().phase, "outcome_unknown");
  assert.deepEqual(draft.begin(true), { body: "  original\n", clientMessageId: key });
  draft.fail(new ChatApiError(429, "RATE_LIMITED", "rate")); assert.equal(draft.snapshot().phase, "failed");
  draft.editAgain(); draft.edit("changed"); assert.equal(draft.begin(false).clientMessageId, key2);
  draft.reset(); assert.equal(draft.snapshot().body, ""); assert.equal(draft.snapshot().clientMessageId, null);
});

test("only a ready direct context with server send permission can edit or POST", async () => {
  let posts = 0; const controller = await load(async (url, init) => { if (init.method === "POST") posts++; return response(url.includes("messages") ? messagePage() : conversationPage([summary()])); });
  assert.throws(() => controller.editDraft("hello")); await assert.rejects(controller.submitDraft()); assert.equal(posts, 0);
});

test("successful send uses one POST and one bounded increment, preserving intervening seqs and server unread", async () => {
  const calls = []; let postedBody;
  const controller = await load(async (url, init) => {
    calls.push([url, init]);
    if (init.method === "POST") { postedBody = JSON.parse(init.body); return response(receipt(postedBody.body, { client_message_id: postedBody.client_message_id, message: message(3, 1, { body: postedBody.body }), unread_count: 2 }), 201); }
    if (url.includes("after_seq")) return response(history([message(2, 1, { body: "concurrent peer" }), message(3, 1, { body: postedBody.body })], { unread_count: 2 }));
    return response(url.includes("messages") ? history([message(1)]) : list());
  });
  controller.editDraft("  exact body\n"); await controller.submitDraft();
  const snapshot = controller.snapshot(); assert.equal(snapshot.draft.phase, "sent"); assert.equal(snapshot.draft.body, ""); assert.equal(snapshot.draft.messageId, 103);
  assert.deepEqual(snapshot.chat.active.messages.map((item) => item.seq), [1, 2, 3]); assert.equal(snapshot.chat.active.readSeq, 0); assert.equal(snapshot.chat.active.unreadCount, 2);
  assert.equal(calls.filter(([, init]) => init.method === "POST").length, 1); assert.equal(calls.filter(([url]) => url.includes("after_seq")).length, 1);
  assert.equal(calls.filter(([, init]) => init.method === "PUT").length, 0); assert.equal(postedBody.body, "  exact body\n");
});

test("double submit cannot issue a second POST while first is pending", async () => {
  const wait = deferred(); let posts = 0; let body;
  const controller = await load(async (url, init) => {
    if (init.method === "POST") { posts++; body = JSON.parse(init.body); return wait.promise; }
    return response(url.includes("messages") ? history() : list());
  });
  controller.editDraft("hello"); const pending = controller.submitDraft(); await assert.rejects(controller.submitDraft()); assert.equal(posts, 1);
  wait.resolve(response(receipt("hello", { client_message_id: body.client_message_id }), 201)); await pending;
  assert.equal(posts, 1); assert.equal(controller.snapshot().draft.phase, "sent");
});

test("lost response retains key/body across manual GET and explicit retry confirms same persistent message", async () => {
  const posts = []; const controller = await load(async (url, init) => {
    if (init.method === "POST") { const value = JSON.parse(init.body); posts.push(value); if (posts.length === 1) throw new Error("synthetic loss"); return response(receipt(value.body, { client_message_id: value.client_message_id, replayed: true }), 200); }
    return response(url.includes("messages") ? history(posts.length > 1 ? [message(1, 1, { body: posts[0].body })] : []) : list());
  });
  controller.editDraft("uncertain"); await controller.submitDraft(); assert.equal(controller.snapshot().draft.phase, "outcome_unknown");
  await controller.refreshHistory(); assert.equal(controller.snapshot().draft.phase, "outcome_unknown"); assert.equal(posts.length, 1);
  await controller.retryDraft(); assert.deepEqual(posts[0], posts[1]); assert.equal(controller.snapshot().draft.phase, "sent");
});

test("malformed send 201/200/503 retains same-scope unknown attempt without trusting payload", async () => {
  for (const status of [201, 200, 503]) {
    const posts = []; const controller = await load(async (url, init) => {
      if (init.method === "POST") { const value = JSON.parse(init.body); posts.push(value); return posts.length === 1 ? response({ malformed: true }, status) : response(receipt(value.body, { client_message_id: value.client_message_id, replayed: true }), 200); }
      return response(url.includes("messages") ? history() : list());
    });
    controller.editDraft("uncertain malformed"); await controller.submitDraft();
    assert.equal(controller.snapshot().draft.phase, "outcome_unknown"); assert.equal(controller.snapshot().draft.body, "uncertain malformed"); assert.equal(controller.snapshot().chat.active.messages.length, 0);
    await controller.retryDraft(); assert.deepEqual(posts[0], posts[1]); assert.equal(controller.snapshot().draft.phase, "sent");
  }
});

test("replayed edited or deleted message clears stale body and refreshes current history, never restores original", async () => {
  for (const current of [message(1, 1, { body: "edited current" }), message(1, 1, { kind: "deleted", body: null, sender: { status: "unavailable" } })]) {
    let posts = 0; const seen = []; const urls = [];
    const controller = await load(async (url, init) => {
      urls.push(url);
      if (init.method === "POST") { posts++; const value = JSON.parse(init.body); if (posts === 1) throw new Error("lost"); return response(receipt(value.body, { client_message_id: value.client_message_id, replayed: true, message: current }), 200); }
      return response(url.includes("messages") ? history([posts > 1 ? current : message(1, 1, { body: "old stored" })]) : list());
    });
    controller.editDraft("old stored"); await controller.submitDraft();
    const stop = controller.subscribe(() => { if (controller.snapshot().draft.phase === "sent") seen.push(controller.snapshot().chat.active.messages.map((item) => item.body)); });
    await controller.retryDraft(); stop();
    assert.equal(controller.snapshot().draft.phase, "sent"); assert.deepEqual(controller.snapshot().chat.active.messages, [current]);
    assert.ok(seen.every((items) => !items.includes("old stored"))); assert.equal(urls.filter((url) => url.includes("after_seq")).length, 0);
    assert.equal(controller.snapshot().chat.conversations.items.length, 0);
  }
});

test("explicit failures retain original attempt; re-edit sends different body with a fresh key", async () => {
  const posts = []; const controller = await load(async (url, init) => {
    if (init.method === "POST") { posts.push(JSON.parse(init.body)); return response(errorEnvelope("RATE_LIMITED"), 429); }
    return response(url.includes("messages") ? history() : list());
  });
  controller.editDraft("first"); await controller.submitDraft(); assert.equal(controller.snapshot().draft.phase, "failed");
  await controller.retryDraft(); assert.deepEqual(posts[0], posts[1]);
  controller.editFailedDraft(); controller.editDraft("second"); await controller.submitDraft();
  assert.notEqual(posts[2].client_message_id, posts[0].client_message_id); assert.equal(posts[2].body, "second");
});

test("auth denial during send clears drafts, keys, titles and messages", async () => {
  for (const status of [401, 403, 404]) {
    const controller = await load(async (url, init) => init.method === "POST" ? response(errorEnvelope(status === 401 ? "SESSION_CHANGED" : "SEND_FORBIDDEN"), status)
      : response(url.includes("messages") ? history([message(1)]) : list()));
    controller.editDraft("private draft"); await controller.submitDraft(); const value = controller.snapshot();
    assert.equal(value.draft.body, ""); assert.equal(value.draft.clientMessageId, null); assert.equal(value.chat.conversations.items.length, 0);
    assert.equal(value.chat.active?.messages.length ?? 0, 0); if (status === 401) assert.equal(value.status, "signed-out");
  }
});

test("changed authorization receipt cannot preserve a pending draft or append a message", async () => {
  const controller = await load(async (url, init) => {
    if (init.method === "POST") { const value = JSON.parse(init.body); return response(receipt(value.body, { client_message_id: value.client_message_id, context: authority(1, { authorization_revision: 2 }) }), 201); }
    return response(url.includes("messages") ? history([message(1)]) : list());
  });
  controller.editDraft("private"); await controller.submitDraft();
  assert.equal(controller.snapshot().draft.body, ""); assert.equal(controller.snapshot().chat.active.messages.length, 0); assert.equal(controller.snapshot().chat.conversations.items.length, 0);
});

test("navigation/suspension discards late send success and never auto-retries or revives original draft", async () => {
  for (const change of ["navigate", "suspend"]) {
    const wait = deferred(); let posted; let signal; let posts = 0;
    const controller = await load(async (url, init) => {
      if (init.method === "POST") { posted = JSON.parse(init.body); signal = init.signal; posts++; return wait.promise; }
      return response(url.includes("messages") ? history() : list());
    });
    controller.editDraft("private late"); const pending = controller.submitDraft();
    if (change === "navigate") await controller.navigate("/matcher/chat"); else controller.suspend();
    assert.equal(signal.aborted, true); wait.resolve(response(receipt(posted.body, { client_message_id: posted.client_message_id }), 201)); await pending;
    assert.equal(posts, 1); assert.equal(controller.snapshot().draft.body, ""); assert.equal(controller.snapshot().draft.clientMessageId, null); assert.equal(controller.snapshot().chat.active, null);
  }
});

test("late same-session 401 on an aborted send still clears identity while unknown response cannot", async () => {
  const wait = deferred(); const controller = await load(async (url, init) => init.method === "POST" ? wait.promise : response(url.includes("messages") ? history() : list()));
  controller.editDraft("private late auth"); const pending = controller.submitDraft(); await controller.navigate("/matcher/chat");
  wait.resolve(response(errorEnvelope("SESSION_CHANGED"), 401)); await pending;
  assert.equal(controller.snapshot().status, "signed-out"); assert.equal(controller.snapshot().draft.body, ""); assert.equal(controller.snapshot().chat.actorId, null);
});

test("known persistence remains sent if subsequent GET fails, with no second POST or invented history", async () => {
  let posts = 0; const controller = await load(async (url, init) => {
    if (init.method === "POST") { posts++; const value = JSON.parse(init.body); return response(receipt(value.body, { client_message_id: value.client_message_id }), 201); }
    if (url.includes("after_seq")) return response(errorEnvelope("CHAT_DEPENDENCY_UNAVAILABLE"), 503);
    return response(url.includes("messages") ? history() : list());
  });
  controller.editDraft("confirmed"); await controller.submitDraft();
  assert.equal(posts, 1); assert.equal(controller.snapshot().draft.phase, "sent"); assert.equal(controller.snapshot().chat.active.messages.length, 0);
  assert.equal(controller.snapshot().chat.active.error.status, 503);
});
