import assert from "node:assert/strict";
import test from "node:test";
import { deferred, conversationPage, context, errorEnvelope, message, messagePage, readState, response, summary } from "./chat-test-helpers.mjs";
const { parseReadBootstrap } = await import("../src/chat/read-bootstrap.ts");
const { createReadController } = await import("../src/chat/read-controller.ts");
const { attachReadLifecycle } = await import("../src/chat/read-lifecycle.ts");
const { parseReadPath, readPath } = await import("../src/chat/navigation.ts");
const { conversationTitle, messagePreview, messageAuthor, intersectViewRects, visibleReadSeq } = await import("../src/chat/read-presentation.ts");
const origin = "https://same-origin.invalid";
const bootstrap = (change = {}) => ({ schema_version: 2, integration_stage: "read", base_path: "/matcher/chat", api_base: "/api/v1", native_home_url: "/dashboard", native_login_url: "/user/auth/login", native_chat_url: "/mail/mail/index", csrf_header: "X-CSRF-Token", csrf_token: "synthetic-read-csrf", actor_id: 7, ...change });
const client = (fetcher) => createReadController(parseReadBootstrap(bootstrap(), origin), fetcher);

test("read bootstrap is a distinct ten-field version with native actor partition and exact native route fields", () => {
  const value = parseReadBootstrap(bootstrap(), origin);
  assert.ok(Object.isFrozen(value)); assert.equal(Object.keys(value).length, 10); assert.equal(value.actor_id, 7);
  const front = parseReadBootstrap(bootstrap({ native_home_url: "/index.php?r=dashboard%2Fdashboard", native_login_url: "/index.php?r=user%2Fauth%2Flogin", native_chat_url: "/index.php?r=mail%2Fmail%2Findex" }), origin);
  assert.equal(front.native_chat_url, "/index.php?r=mail%2Fmail%2Findex");
  for (const key of Object.keys(bootstrap())) { const value = bootstrap(); delete value[key]; assert.throws(() => parseReadBootstrap(value, origin)); }
  for (const change of [{ schema_version: 1 }, { integration_stage: "shell" }, { actor_id: 0 }, { actor_id: "7" }, { actor_id: Number.MAX_SAFE_INTEGER + 1 }, { current_event: 1 }, { capabilities: { send: true } }, { csrf_token: "bad token" }, { api_base: "https://example.test/api/v1" }]) assert.throws(() => parseReadBootstrap(bootstrap(change), origin));
  for (const link of ["//example.test/mail/mail/index", "/mail/mail/show?id=1", "/mail/mail/index?returnUrl=/x", "/index.php?r=mail/mail/index&r=mail/mail/index", "/index.php?r=mail/mail/index&returnUrl=/x", "/x/../mail/mail/index", "/mail/mail/index#data"]) assert.throws(() => parseReadBootstrap(bootstrap({ native_chat_url: link }), origin));
});

test("read navigation accepts only safe decimal routes and carries no authorization", () => {
  assert.deepEqual(parseReadPath("/matcher/chat"), { conversationId: null });
  assert.equal(parseReadPath(readPath(Number.MAX_SAFE_INTEGER)).conversationId, Number.MAX_SAFE_INTEGER);
  for (const path of ["/matcher/chat/", "/matcher/chat/conversations/0", "/matcher/chat/conversations/01", "/matcher/chat/conversations/9007199254740992", "/matcher/chat/conversations/1?actor=7", "/matcher/chat/conversations/%31", "/matcher/chat/../mail"]) assert.throws(() => parseReadPath(path));
  for (const id of [-1, 0, "1", 0.5, Infinity]) assert.throws(() => readPath(id));
});

test("controller construction is inert and start uses only existing direct-chat endpoints, without me or current-event", async () => {
  const calls = []; const page = client(async (url, init) => { calls.push([url, init]); return response(conversationPage()); });
  assert.equal(calls.length, 0); assert.equal(page.snapshot().status, "idle");
  await page.start("/matcher/chat");
  assert.equal(page.snapshot().chat.actorId, 7); assert.equal(page.snapshot().chat.conversations.phase, "ready");
  assert.deepEqual(calls.map(([url]) => url), ["/api/v1/conversations?limit=24"]);
  assert.equal(calls[0][1].method, "GET"); assert.equal(calls[0][1].headers["X-CSRF-Token"], undefined);
  assert.equal(calls[0][1].headers["X-Matcher-Chat-Actor"], "7");
  await assert.rejects(page.start("/matcher/chat"));
});

test("successful list may be empty; deep links authorize history independently without a fabricated list row", async () => {
  const calls = []; const page = client(async (url) => { calls.push(url); return response(url.includes("/messages") ? messagePage(19) : conversationPage()); });
  await page.start("/matcher/chat/conversations/19");
  assert.equal(page.snapshot().chat.conversations.items.length, 0); assert.equal(page.snapshot().chat.active.id, 19);
  assert.equal(page.snapshot().chat.active.phase, "ready"); assert.equal(page.snapshot().chat.active.messages.length, 0);
  assert.deepEqual(calls, ["/api/v1/conversations?limit=24", "/api/v1/conversations/19/messages?limit=24"]);
});

test("list failure is an error, never fixture fallback, empty success or a hidden automatic retry", async () => {
  let count = 0; const page = client(async () => { count++; return response(errorEnvelope("DEPENDENCY_UNAVAILABLE", { retryable: true }), 503); });
  await page.start("/matcher/chat/conversations/1");
  assert.equal(page.snapshot().chat.conversations.phase, "error"); assert.equal(page.snapshot().chat.conversations.hasMore, null);
  assert.equal(page.snapshot().chat.active, null); assert.equal(count, 1);
});

test("manual list recovery resumes the requested deep link with fresh object authorization", async () => {
  const calls = []; let lists = 0;
  const page = client(async (url, init) => {
    calls.push([url, init.method]);
    if (url.includes("/messages")) return response(messagePage(19));
    return lists++ === 0 ? response(errorEnvelope("DEPENDENCY_UNAVAILABLE"), 503) : response(conversationPage());
  });
  await page.start("/matcher/chat/conversations/19");
  assert.equal(calls.length, 1); assert.equal(page.snapshot().chat.active, null);
  await page.refreshList();
  assert.deepEqual(calls, [["/api/v1/conversations?limit=24", "GET"], ["/api/v1/conversations?limit=24", "GET"], ["/api/v1/conversations/19/messages?limit=24", "GET"]]);
  assert.equal(page.snapshot().chat.active.id, 19); assert.equal(page.snapshot().chat.active.phase, "ready");
  assert.equal(page.snapshot().chat.conversations.items.length, 0);
});

test("leaving a deep link during manual recovery cannot reopen the old conversation", async () => {
  const wait = deferred(); const calls = []; let lists = 0;
  const page = client(async (url) => {
    calls.push(url);
    return lists++ === 0 ? response(errorEnvelope("DEPENDENCY_UNAVAILABLE"), 503) : wait.promise;
  });
  await page.start("/matcher/chat/conversations/19");
  const pending = page.refreshList(); await page.navigate("/matcher/chat");
  wait.resolve(response(conversationPage())); await pending;
  assert.equal(page.snapshot().chat.active, null); assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => !url.includes("/messages")));
});

test("deep-link recovery cannot revive a suspended session or a denied conversation", async () => {
  const wait = deferred(); let calls = 0;
  const suspended = client(async () => calls++ === 0 ? response(errorEnvelope("DEPENDENCY_UNAVAILABLE"), 503) : wait.promise);
  await suspended.start("/matcher/chat/conversations/19");
  const pending = suspended.refreshList(); suspended.suspend();
  wait.resolve(response(conversationPage())); await pending;
  assert.equal(suspended.snapshot().status, "suspended"); assert.equal(suspended.snapshot().chat.active, null); assert.equal(calls, 2);
  let lists = 0; let histories = 0;
  const denied = client(async (url) => {
    if (url.includes("/messages")) { histories++; return response(errorEnvelope("NOT_AVAILABLE"), 404); }
    return lists++ === 0 ? response(errorEnvelope("DEPENDENCY_UNAVAILABLE"), 503) : response(conversationPage());
  });
  await denied.start("/matcher/chat/conversations/19"); await denied.refreshList();
  assert.equal(histories, 1); assert.equal(denied.snapshot().chat.active.phase, "revoked");
  assert.equal(denied.snapshot().chat.active.messages.length, 0); assert.equal(denied.snapshot().chat.conversations.items.length, 0);
});

test("bootstrap exit routes cannot be repointed to native chat, the plugin, or arbitrary return targets", () => {
  for (const field of ["native_home_url", "native_login_url"]) {
    for (const value of ["/matcher/chat", "/mail/mail/index", "/index.php?r=mail%2Fmail%2Findex", "//outside.invalid/dashboard", "/dashboard?returnUrl=/matcher/chat"]) {
      assert.throws(() => parseReadBootstrap(bootstrap({ [field]: value }), origin));
    }
  }
  for (const change of [{ takeover_state: "paused" }, { schema_version: 3 }, { integration_stage: "paused" }]) {
    assert.throws(() => parseReadBootstrap(bootstrap(change), origin));
  }
});

test("group and discussion responses cannot enter the read UI even with otherwise valid DTOs", async () => {
  for (const type of ["group", "discussion"]) {
    const extra = type === "discussion" ? { space_id: 1, idea_activity_id: 1 } : {};
    const list = client(async () => response(conversationPage([summary(1, { type, ...extra })])));
    await list.start("/matcher/chat"); assert.equal(list.snapshot().chat.conversations.phase, "error"); assert.equal(list.snapshot().chat.conversations.items.length, 0);
    const detail = client(async (url) => response(url.includes("/messages") ? messagePage(1, [message()], { context: context(1, { type, ...extra }) }) : conversationPage()));
    await detail.start("/matcher/chat/conversations/1"); assert.equal(detail.snapshot().chat.active.phase, "revoked"); assert.equal(detail.snapshot().chat.active.messages.length, 0);
  }
});

test("loading, selecting and paginating issue no read receipt; explicit visible intent is CSRF protected", async () => {
  const calls = []; const page = client(async (url, init) => { calls.push([url, init]);
    if (init.method === "PUT") return response(readState(1, 2));
    return response(url.includes("/messages") ? messagePage(1, [message(1), message(2)], { unread_count: 2 }) : conversationPage([summary(1)]));
  });
  await page.start("/matcher/chat/conversations/1");
  assert.equal(calls.filter(([, init]) => init.method === "PUT").length, 0);
  for (const intent of [{ conversationId: 1, seq: 2, visible: false, focused: true }, { conversationId: 1, seq: 2, visible: true, focused: false }, { conversationId: 2, seq: 2, visible: true, focused: true }, { conversationId: 1, seq: 99, visible: true, focused: true }]) assert.throws(() => page.acknowledgeVisible(intent));
  await page.acknowledgeVisible({ conversationId: 1, seq: 2, visible: true, focused: true });
  const write = calls.find(([, init]) => init.method === "PUT"); assert.equal(write[1].headers["X-CSRF-Token"], "synthetic-read-csrf"); assert.equal(write[1].body, '{"read_seq":2}');
  assert.equal(await page.acknowledgeVisible({ conversationId: 1, seq: 2, visible: true, focused: true }), "ignored");
  assert.equal(calls.filter(([, init]) => init.method === "PUT").length, 1);
});

test("suspension removes private data, aborts pending work and cannot resume with the same bootstrap", async () => {
  const wait = deferred(); let signal; const page = client(async (url, init) => { if (!url.includes("/messages")) return response(conversationPage([summary(1)])); signal = init.signal; return wait.promise; });
  const start = page.start("/matcher/chat/conversations/1");
  await new Promise((resolve) => setImmediate(resolve));
  page.suspend(); assert.equal(signal.aborted, true);
  wait.resolve(response(messagePage(1, [message()]))); await start;
  assert.equal(page.snapshot().status, "suspended"); assert.equal(page.snapshot().chat.active, null); assert.equal(page.snapshot().chat.actorId, null); assert.equal(page.snapshot().chat.conversations.items.length, 0);
  await assert.rejects(page.start("/matcher/chat")); assert.throws(() => page.refreshList());
  page.dispose(); assert.equal(page.snapshot().status, "disposed");
});

test("401 from a real client clears controller identity partition and active/list content", async () => {
  const page = client(async (url) => url.includes("/messages") ? response(errorEnvelope("AUTH_REQUIRED"), 401) : response(conversationPage([summary(1)])));
  await page.start("/matcher/chat/conversations/1");
  assert.equal(page.snapshot().status, "signed-out"); assert.equal(page.snapshot().chat.actorId, null); assert.equal(page.snapshot().chat.active, null); assert.equal(page.snapshot().chat.conversations.items.length, 0);
});

test("navigation ignores a late old conversation and back-to-list cancels selected detail", async () => {
  const wait = deferred(); const page = client(async (url) => { if (!url.includes("/messages")) return response(conversationPage()); if (url.includes("/1/")) return wait.promise; return response(messagePage(2, [message(1, 2)])); });
  await page.start("/matcher/chat"); const pending = page.navigate("/matcher/chat/conversations/1"); await page.navigate("/matcher/chat/conversations/2");
  wait.resolve(response(messagePage(1, [message()]))); await pending; assert.equal(page.snapshot().chat.active.id, 2);
  await page.navigate("/matcher/chat"); assert.equal(page.snapshot().chat.active, null);
});

test("visibility marker calculation excludes hidden/unfocused, clipped and outside messages", () => {
  const viewport = { top: 20, bottom: 120, left: 0, right: 100 };
  const markers = [{ seq: 1, rect: { top: 19, bottom: 20, left: 5, right: 6 } }, { seq: 2, rect: { top: 40, bottom: 41, left: 5, right: 6 } }, { seq: 3, rect: { top: 80, bottom: 81, left: 5, right: 6 } }, { seq: 4, rect: { top: 119, bottom: 121, left: 5, right: 6 } }, { seq: 5, rect: { top: 90, bottom: 91, left: 101, right: 102 } }];
  assert.equal(visibleReadSeq(markers, viewport, true, true), 3);
  assert.equal(visibleReadSeq(markers, viewport, false, true), null); assert.equal(visibleReadSeq(markers, viewport, true, false), null);
  assert.equal(visibleReadSeq(markers, { ...viewport, bottom: 20 }, true, true), null);
});

test("unavailable sender, absent title and empty/deleted history remain honest presentation states", () => {
  assert.equal(conversationTitle(summary()), "私聊会话"); assert.equal(conversationTitle(undefined), "私聊会话");
  assert.equal(messagePreview(null), "暂无消息"); assert.equal(messageAuthor(message(1, 1, { sender: { status: "unavailable" } }), 7), "发送者信息未提供");
  assert.equal(messageAuthor(message(), 7), "你");
  assert.equal(messagePreview(message(1, 1, { kind: "deleted", body: null, sender: { status: "unavailable" } })), "此消息已删除");
});

test("read markers outside the visual viewport or clipping ancestor cannot become read intent", () => {
  const scrollArea = { top: 20, bottom: 800, left: 0, right: 500 };
  const visualViewport = { top: 100, bottom: 420, left: 0, right: 320 };
  const ancestor = { top: 0, bottom: 360, left: 10, right: 500 };
  const visible = intersectViewRects([scrollArea, visualViewport, ancestor]);
  assert.deepEqual(visible, { top: 100, bottom: 360, left: 10, right: 320 });
  const markers = [{ seq: 1, rect: { top: 110, bottom: 111, left: 15, right: 16 } }, { seq: 2, rect: { top: 400, bottom: 401, left: 15, right: 16 } }, { seq: 3, rect: { top: 600, bottom: 601, left: 15, right: 16 } }];
  assert.equal(visibleReadSeq(markers, visible, true, true), 1);
  assert.equal(intersectViewRects([scrollArea, { top: 900, bottom: 1000, left: 0, right: 500 }]), null);
  assert.equal(intersectViewRects([{ ...scrollArea, bottom: NaN }]), null);
});

test("lifecycle clears DOM before state and reloads once on focus/visibility restoration", () => {
  const host = new EventTarget(); const doc = new EventTarget(); let focused = true; doc.visibilityState = "visible"; doc.hasFocus = () => focused;
  const calls = []; const detach = attachReadLifecycle({ suspend: () => calls.push("suspend"), dispose: () => calls.push("dispose") }, host, doc, () => calls.push("conceal"), () => calls.push("reload"));
  focused = false; host.dispatchEvent(new Event("blur")); assert.deepEqual(calls, ["conceal", "suspend"]);
  doc.visibilityState = "hidden"; doc.dispatchEvent(new Event("visibilitychange"));
  host.dispatchEvent(new Event("focus")); assert.equal(calls.includes("reload"), false);
  focused = true; doc.visibilityState = "visible"; doc.dispatchEvent(new Event("visibilitychange")); host.dispatchEvent(new Event("focus"));
  assert.equal(calls.filter((entry) => entry === "reload").length, 1);
  detach(); const length = calls.length; host.dispatchEvent(new Event("blur")); assert.equal(calls.length, length); assert.equal(calls.at(-1), "dispose");
});

test("background mount and restored bfcache cannot display cached data or start requests", () => {
  const host = new EventTarget(); const doc = new EventTarget(); doc.visibilityState = "hidden"; doc.hasFocus = () => true;
  const calls = []; const detach = attachReadLifecycle({ suspend: () => calls.push("suspend"), dispose() {} }, host, doc, () => calls.push("conceal"), () => calls.push("reload"));
  assert.deepEqual(calls, ["conceal", "suspend"]);
  doc.visibilityState = "visible"; const event = new Event("pageshow"); Object.defineProperty(event, "persisted", { value: true }); host.dispatchEvent(event);
  assert.equal(calls.at(-1), "reload"); detach();
});

test("continuous-focus account changes are rejected before message projection and clear the real client controller", async () => {
  let sessionActor = 7; let projectedBodies = 0; const calls = [];
  const page = client(async (url, init) => {
    calls.push([url, init]);
    // This synthetic server is session-authoritative: a header cannot choose
    // another user, and its mismatch branch executes before private projection.
    if (init.headers["X-Matcher-Chat-Actor"] !== String(sessionActor)) return response(errorEnvelope("SESSION_CHANGED"), 401);
    if (url.includes("messages")) { projectedBodies++; return response(messagePage(1, [message(1, 1, { body: "SYNTHETIC_ACTOR_SEVEN" })])); }
    return response(conversationPage([summary(1)]));
  });
  await page.start("/matcher/chat/conversations/1"); assert.equal(projectedBodies, 1);
  // No blur, visibility event or controller replacement happens here.
  sessionActor = 8; await page.newer();
  assert.equal(projectedBodies, 1); assert.equal(calls.at(-1)[1].headers["X-Matcher-Chat-Actor"], "7");
  assert.equal(page.snapshot().status, "signed-out"); assert.equal(page.snapshot().chat.actorId, null); assert.equal(page.snapshot().chat.active, null); assert.equal(page.snapshot().chat.conversations.items.length, 0);
});

test("same-actor session renewal still relies on server CSRF and does not auto-retry an old token", async () => {
  let puts = 0; const page = client(async (url, init) => {
    if (init.method === "PUT") { puts++; return response(errorEnvelope("CSRF_INVALID"), 400); }
    return response(url.includes("messages") ? messagePage(1, [message(1)], { unread_count: 1 }) : conversationPage([summary(1)]));
  });
  await page.start("/matcher/chat/conversations/1");
  await page.acknowledgeVisible({ conversationId: 1, seq: 1, visible: true, focused: true });
  assert.equal(puts, 1); assert.equal(page.snapshot().chat.active.error.status, 400); assert.equal(page.snapshot().chat.active.readSeq, 0);
});
