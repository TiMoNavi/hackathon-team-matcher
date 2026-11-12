import test from "node:test";
import assert from "node:assert/strict";
import { parseBootstrap, parseCurrentEvent, parseIdentity } from "../src/contracts.ts";
import { ApiFailure, getJson, type Fetcher } from "../src/http.ts";
import { SessionReader } from "../src/session.ts";

const bootstrap = parseBootstrap({ schema_version: 1, base_path: "/matcher/app", api_base: "/api/v1", native_home_url: "/dashboard/dashboard", native_login_url: "/user/auth/login", csrf_header: "X-CSRF-Token", csrf_token: "synthetic-test-only" }, "https://test.invalid");
const meta = { request_id: "0123456789abcdef01234567" };
const identity = { user_id: 1, nickname: null, identity_version: 0, avatar_ref: null };
const event = { space_id: 2, selection_revision: "selection-" + "a".repeat(32), access_version: "fixture-version" };
const ok = (data: unknown) => new Response(JSON.stringify({ data, meta }), { headers: { "Content-Type": "application/json; charset=UTF-8" } });
const fail = (status: number, code: string, details: unknown = []) => new Response(JSON.stringify({ error: { code, message: "Synthetic error", retryable: status >= 500, details }, meta }), { status, headers: { "Content-Type": "application/json" } });
function sequence(responses: Response[]) {
  const calls: { url: string; options: RequestInit }[] = [];
  const fetcher: Fetcher = async (url, options) => { calls.push({ url, options }); const response = responses.shift(); assert.ok(response, "unexpected extra request"); return response; };
  return { calls, fetcher };
}

test("bootstrap accepts only the two same-origin native fallback routes", () => {
  for (const value of ["//outside.invalid/path", "https://outside.invalid/path", "/user/search", "/index.php?r=user/auth/login&returnUrl=outside"]) {
    assert.throws(() => parseBootstrap({ ...bootstrap, native_login_url: value }, "https://test.invalid"));
  }
  assert.equal(parseBootstrap({ ...bootstrap, native_login_url: "/index.php?r=user%2Fauth%2Flogin" }, "https://test.invalid").native_login_url, "/index.php?r=user%2Fauth%2Flogin");
  assert.equal(parseBootstrap({ ...bootstrap, native_home_url: "/dashboard" }, "https://test.invalid").native_home_url, "/dashboard");
  assert.equal(parseBootstrap({ ...bootstrap, base_path: "/community/matcher/app", api_base: "/community/api/v1", native_home_url: "/community/dashboard", native_login_url: "/community/user/auth/login" }, "https://test.invalid").native_home_url, "/community/dashboard");
  assert.throws(() => parseBootstrap({ ...bootstrap, native_home_url: "/other/dashboard" }, "https://test.invalid"));
  assert.throws(() => parseBootstrap({ ...bootstrap, native_login_url: "/other/user/auth/login" }, "https://test.invalid"));
  assert.throws(() => parseBootstrap({ ...bootstrap, api_base: "/other/api/v1" }, "https://test.invalid"));
  assert.throws(() => parseBootstrap({ ...bootstrap, csrf_header: "Authorization" }, "https://test.invalid"));
});

test("identity and event DTOs reject placeholders and preserve legitimate null identity fields", () => {
  assert.deepEqual(parseIdentity(identity), identity);
  assert.throws(() => parseIdentity({ ...identity, user_id: "1" }));
  assert.throws(() => parseIdentity({ ...identity, identity_version: -1 }));
  assert.throws(() => parseCurrentEvent({ ...event, selection_revision: "stale" }));
  assert.throws(() => parseCurrentEvent({ ...event, space_id: 0 }));
});

test("HTTP boundary rejects HTML, malformed JSON and a successful envelope containing an error", async () => {
  for (const response of [new Response("<html>sign in</html>", { headers: { "Content-Type": "text/html" } }), new Response("{", { headers: { "Content-Type": "application/json" } }), new Response(JSON.stringify({ data: identity, error: {}, meta }), { headers: { "Content-Type": "application/json" } })]) {
    await assert.rejects(() => getJson("/api/v1/me", parseIdentity, new AbortController().signal, async () => response), (error: unknown) => error instanceof ApiFailure && error.code === "INVALID_RESPONSE");
  }
});

test("error envelopes accept empty arrays and structured detail objects", async () => {
  for (const details of [[], { reason: "fixture" }]) {
    await assert.rejects(() => getJson("/api/v1/me", parseIdentity, new AbortController().signal, async () => fail(503, "UNAVAILABLE", details)), (error: unknown) => error instanceof ApiFailure && error.code === "UNAVAILABLE" && error.requestId === meta.request_id);
  }
});

test("401 clears identity and never requests current-event", async () => {
  const transport = sequence([fail(401, "AUTHENTICATION_REQUIRED")]);
  const reader = new SessionReader(bootstrap, transport.fetcher); await reader.refresh();
  assert.equal(reader.snapshot().status, "signed_out"); assert.equal(reader.snapshot().identity, null);
  assert.deepEqual(transport.calls.map((call) => call.url), ["/api/v1/me"]);
  assert.equal(transport.calls[0].options.credentials, "same-origin");
  assert.equal(transport.calls[0].options.cache, "no-store");
  assert.equal(transport.calls[0].options.method, "GET"); reader.dispose();
});

test("409 CURRENT_EVENT_REQUIRED preserves a valid identity as an unselected activity", async () => {
  const transport = sequence([ok(identity), fail(409, "CURRENT_EVENT_REQUIRED")]);
  const reader = new SessionReader(bootstrap, transport.fetcher); await reader.refresh();
  assert.deepEqual(reader.snapshot(), { status: "ready", identity, event: { status: "unselected" } }); reader.dispose();
});

test("event authorization loss and context changes remove the previous selection", async () => {
  for (const [status, code, expected] of [[403, "ACCESS_DENIED", "forbidden"], [409, "CONTEXT_CHANGED", "conflict"], [401, "AUTHENTICATION_REQUIRED", "signed_out"]] as const) {
    const transport = sequence([ok(identity), ok(event), ok(identity), fail(status, code)]);
    const reader = new SessionReader(bootstrap, transport.fetcher); await reader.refresh(); assert.equal(reader.snapshot().event.status, "selected");
    await reader.refresh(); const state = reader.snapshot();
    assert.equal(expected === "signed_out" ? state.status : state.event.status, expected);
    assert.ok(!("value" in state.event)); if (status === 401) assert.equal(state.identity, null); reader.dispose();
  }
});

test("a late response from a cancelled refresh cannot restore the previous actor", async () => {
  let resolveOld!: (response: Response) => void; let calls = 0; let oldSignal: AbortSignal | null = null;
  const reader = new SessionReader(bootstrap, async (_url, options) => {
    calls++;
    if (calls === 1) { oldSignal = options.signal as AbortSignal; return new Promise<Response>((resolve) => { resolveOld = resolve; }); }
    return calls === 2 ? ok({ ...identity, user_id: 9 }) : ok(event);
  });
  const old = reader.refresh(); await reader.refresh(); assert.equal((oldSignal as AbortSignal | null)?.aborted, true);
  resolveOld(ok(identity)); await old;
  assert.equal(reader.snapshot().identity?.user_id, 9); assert.equal(reader.snapshot().event.status, "selected"); assert.equal(calls, 3); reader.dispose();
});

test("an explicit refresh recovers from a network failure without automatic retries", async () => {
  let calls = 0;
  const reader = new SessionReader(bootstrap, async () => { calls++; if (calls === 1) throw new TypeError("offline"); return calls === 2 ? ok(identity) : fail(409, "CURRENT_EVENT_REQUIRED"); });
  await reader.refresh(); assert.equal(reader.snapshot().status, "error"); assert.equal(calls, 1);
  await reader.refresh(); assert.equal(reader.snapshot().status, "ready"); assert.equal(reader.snapshot().event.status, "unselected"); assert.equal(calls, 3); reader.dispose();
});
