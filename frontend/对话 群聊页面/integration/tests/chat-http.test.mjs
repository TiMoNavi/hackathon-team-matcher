import assert from "node:assert/strict";
import test from "node:test";
import { http, conversationPage, message, messagePage, readState, errorEnvelope, response, deferred } from "./chat-test-helpers.mjs";
const { ChatApiError, createChatApi } = http;
const config = (fetcher) => ({ apiBase: "/api/v1", csrfToken: "synthetic-csrf", fetcher });

test("construction is inert and explicit reads use fixed same-origin uncached endpoints", async () => {
  const calls = []; const api = createChatApi(config(async (...args) => { calls.push(args); return response(conversationPage()); }));
  assert.equal(calls.length, 0);
  await api.list();
  assert.equal(calls[0][0], "/api/v1/conversations?limit=24");
  const init = calls[0][1];
  assert.equal(init.method, "GET"); assert.equal(init.credentials, "same-origin"); assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error");
  assert.equal(init.headers.Accept, "application/json"); assert.equal(init.headers["X-CSRF-Token"], undefined); assert.ok(init.signal instanceof AbortSignal);
});

test("paths and query combinations reject unsafe IDs, arbitrary endpoints and invalid options before fetch", async () => {
  let count = 0; const api = createChatApi(config(async () => { count++; return response(conversationPage()); }));
  for (const value of ["1", "../1", "https://example.test/1", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => api.history(value), ChatApiError);
  for (const options of [{ limit: 0 }, { limit: 49 }, { limit: "24" }, { cursor: "" }, { signal: {} }, { endpoint: "/x" }, { after_seq: 2 }]) assert.throws(() => api.list(options), ChatApiError);
  assert.throws(() => api.increment(1, { afterSeq: 0, cursor: "opaque" }), ChatApiError);
  assert.throws(() => api.increment(1, { afterSeq: -1 }), ChatApiError);
  assert.throws(() => api.history(1, { afterSeq: 1 }), ChatApiError);
  for (const change of [{ apiBase: "https://example.test/api/v1" }, { apiBase: "//example.test" }, { csrfToken: "bad\nvalue" }, { csrfToken: "" }, { actorId: 7 }]) assert.throws(() => createChatApi({ ...config(async () => {}), ...change }), ChatApiError);
  assert.equal(count, 0);
});

test("opaque cursors are query encoded and never interpreted as redirect or pathname", async () => {
  let url; const api = createChatApi(config(async (input) => { url = input; return response(messagePage()); }));
  const cursor = "opaque?after_seq=77&redirect=https://example.test/#x";
  await api.history(1, { limit: 48, cursor });
  const parsed = new URL(url, "https://same-origin.invalid");
  assert.equal(parsed.pathname, "/api/v1/conversations/1/messages");
  assert.equal(parsed.searchParams.get("cursor"), cursor); assert.equal(parsed.searchParams.get("after_seq"), null);
});

test("read-state is explicit PUT with session CSRF and no caller-supplied actor", async () => {
  let call; const api = createChatApi(config(async (...args) => { call = args; return response(readState(2, 8)); }));
  await api.readState(2, { readSeq: 8 });
  assert.equal(call[0], "/api/v1/conversations/2/read-state");
  assert.equal(call[1].method, "PUT"); assert.equal(call[1].headers["X-CSRF-Token"], "synthetic-csrf");
  assert.equal(call[1].body, '{"read_seq":8}');
  assert.throws(() => api.readState(2, { readSeq: 8, user_id: 99 }), ChatApiError);
});

test("all server error categories keep status, code, message, details and request ID with no retry", async () => {
  for (const status of [400, 401, 403, 404, 409, 410, 422, 429, 503]) {
    let count = 0; const payload = errorEnvelope("SERVER_CODE", { retryable: true });
    const api = createChatApi(config(async () => { count++; return response(payload, status); }));
    await assert.rejects(api.list(), (error) => error instanceof ChatApiError && error.status === status && error.code === "SERVER_CODE"
      && error.message === payload.error.message && error.retryable && error.requestId === payload.meta.request_id && error.details.fields[0] === "synthetic");
    assert.equal(count, 1);
  }
});

test("malformed status, content type, envelope, JSON and cross-conversation results fail closed", async () => {
  const inputs = [response(conversationPage(), 201), response(conversationPage(), 200, { "Content-Type": "text/html" }), new Response("not json", { status: 200, headers: { "Content-Type": "application/json" } }), response({ data: {} }), response({ error: {} }, 401)];
  for (const result of inputs) await assert.rejects(createChatApi(config(async () => result)).list(), (error) => error.code === "INVALID_RESPONSE" && error.status === result.status);
  const wrong = createChatApi(config(async () => response(messagePage(2, [message(1, 2)]))));
  await assert.rejects(wrong.history(1), (error) => error.code === "INVALID_RESPONSE");
  const redirect = response(conversationPage()); Object.defineProperty(redirect, "redirected", { value: true });
  await assert.rejects(createChatApi(config(async () => redirect)).list(), (error) => error.code === "INVALID_RESPONSE");
});

test("increment responses must advance after_seq; read-state cannot acknowledge less than requested", async () => {
  let url; const api = createChatApi(config(async (input) => { url = input; return response(messagePage(1, [message(9)], { has_more: true })); }));
  assert.equal((await api.increment(1, { afterSeq: 8 })).data.has_more, true);
  assert.equal(url, "/api/v1/conversations/1/messages?limit=24&after_seq=8");
  await assert.rejects(api.increment(1, { afterSeq: 9 }), (error) => error.code === "INVALID_RESPONSE");
  await assert.rejects(createChatApi(config(async () => response(readState(1, 2)))).readState(1, { readSeq: 3 }), (error) => error.code === "INVALID_RESPONSE");
});

test("network errors never trigger retries and explicit abort discards success even if fetch ignores it", async () => {
  let count = 0; const api = createChatApi(config(async () => { count++; throw new Error("must not expose transport details"); }));
  await assert.rejects(api.list(), (error) => error.code === "NETWORK_ERROR" && error.retryable && !error.message.includes("transport"));
  assert.equal(count, 1);
  const wait = deferred(); const cancel = new AbortController();
  const late = createChatApi(config(() => wait.promise)); const pending = late.list({ signal: cancel.signal });
  cancel.abort(); wait.resolve(response(conversationPage()));
  await assert.rejects(pending, (error) => error.code === "REQUEST_ABORTED");
  const never = new AbortController(); never.abort();
  await assert.rejects(api.list({ signal: never.signal }), (error) => error.code === "REQUEST_ABORTED"); assert.equal(count, 1);
});

test("aborted transports still propagate observed 401, and disposal is explicit and permanent", async () => {
  const wait = deferred(); const cancel = new AbortController(); const api = createChatApi(config(() => wait.promise));
  const pending = api.list({ signal: cancel.signal }); cancel.abort(); wait.resolve(response(errorEnvelope("AUTH_REQUIRED"), 401));
  await assert.rejects(pending, (error) => error.status === 401 && error.code === "AUTH_REQUIRED");
  api.dispose(); api.dispose();
  await assert.rejects(api.list(), (error) => error.code === "CLIENT_DISPOSED");
});

test("optional actor consistency header is validated and accompanies every endpoint without becoming authentication", async () => {
  const calls = []; const api = createChatApi({ ...config(async (url, init) => {
    calls.push([url, init]);
    return response(url.includes("read-state") ? readState(1, 1) : url.includes("messages") ? messagePage(1, [message(1)]) : conversationPage());
  }), expectedActorId: 7 });
  await api.list(); await api.history(1); await api.increment(1, { afterSeq: 0 }); await api.readState(1, { readSeq: 1 });
  assert.equal(calls.length, 4);
  for (const [, init] of calls) { assert.equal(init.headers["X-Matcher-Chat-Actor"], "7"); assert.equal(init.credentials, "same-origin"); assert.equal(init.headers.Authorization, undefined); }
  assert.equal(calls[3][1].body, '{"read_seq":1}');
  for (const id of [0, -1, 1.5, "7", Number.MAX_SAFE_INTEGER + 1, null]) assert.throws(() => createChatApi({ ...config(async () => {}), expectedActorId: id }), ChatApiError);
});
