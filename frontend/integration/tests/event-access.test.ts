import test from "node:test";
import assert from "node:assert/strict";
import { parseBootstrap } from "../src/contracts.ts";
import { ApiFailure, type Fetcher } from "../src/http.ts";
import { EventAccessClient, EventAccessController, createJoinKey, eventAccessFeedback, invitationTokenIsValid, parseInvitationReceipt, parseMemberEvents, receiptBlocksMembership } from "../src/event-access.ts";

const bootstrap = parseBootstrap({ schema_version: 1, base_path: "/prefix/matcher/app", api_base: "/prefix/api/v1", native_home_url: "/prefix/dashboard", native_login_url: "/prefix/user/auth/login", csrf_header: "X-CSRF-Token", csrf_token: "synthetic-csrf" }, "https://test.invalid");
const meta = { request_id: "0123456789abcdef01234567" };
const member = { space_id: 7, name: "虚构测试活动", membership_id: 10, membership_role: "member" };
const selected = { space_id: 7, selection_revision: "selection-" + "a".repeat(32), access_version: "synthetic-access-version" };
const receipt = { receipt_id: "receipt-" + "b".repeat(32), invitation_id: "inv-" + "c".repeat(32), space_id: 7, membership_id: 10, outcome: "joined", consumed_use: true, created_at: "2026-11-12T12:00:00Z", membership_current: true };
const token = "S".repeat(43); const key = "synthetic-join-key";
const page = (items: unknown[] = [member], next_cursor: string | null = null, limit = 24) => ({ items, next_cursor, has_more: next_cursor !== null, limit });
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ data, meta }), { status, headers: { "Content-Type": "application/json" } });
const fail = (status: number, code: string, details: unknown = []) => new Response(JSON.stringify({ error: { code, message: "UNTRUSTED_SERVER_TEXT", retryable: false, details }, meta }), { status, headers: { "Content-Type": "application/json" } });
const signal = () => new AbortController().signal;
const invalid = (error: unknown) => error instanceof ApiFailure && error.code === "INVALID_RESPONSE";
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const baseline: Fetcher = async (url) => url.includes("/me/events?") ? ok(page()) : ok(selected);

test("member page validates native membership roles, unique IDs and signed-cursor pagination shape", () => {
  assert.deepEqual(parseMemberEvents(page()), page());
  for (const membership_role of ["owner", "admin", "moderator", "member"]) assert.equal(parseMemberEvents(page([{ ...member, membership_role }])).items[0].membership_role, membership_role);
  assert.deepEqual(parseMemberEvents(page([], null, 48)), page([], null, 48));
  for (const value of [page([member, member]), page([{ ...member, space_id: 0 }]), page([{ ...member, membership_id: "10" }]), page([{ ...member, membership_role: "invited" }]), page([{ ...member, name: " " }]), page([], null, 49), page([], "signed.cursor"), { ...page(), has_more: true }, { ...page(), next_cursor: "bad\nvalue" }]) assert.throws(() => parseMemberEvents(value));
});

test("invitation receipt validates UTC dates, opaque IDs and actual booleans", () => {
  assert.deepEqual(parseInvitationReceipt(receipt), receipt);
  assert.equal(parseInvitationReceipt({ ...receipt, outcome: "already_member", consumed_use: false }).outcome, "already_member");
  for (const patch of [{ receipt_id: "receipt-x" }, { invitation_id: "inv-" + "C".repeat(32) }, { outcome: ["joined"] }, { consumed_use: false }, { membership_current: "true" }, { membership_id: 0 }, { created_at: "2026-02-30T12:00:00Z" }, { created_at: "2026-11-12T12:00:00+00:00" }, { created_at: "2026-11-12T12:00:00.000Z" }]) assert.throws(() => parseInvitationReceipt({ ...receipt, ...patch }));
});

test("joined-event GET uses bounded pagination, the configured prefix and no mutation", async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  const client = new EventAccessClient(bootstrap, async (url, options) => { calls.push({ url, options }); return ok(page([], null, 48)); });
  await client.events(signal(), "signed+cursor/part=", 48);
  assert.equal(calls[0].url, "/prefix/api/v1/me/events?limit=48&cursor=signed%2Bcursor%2Fpart%3D");
  assert.equal(calls[0].options.method, "GET"); assert.equal(calls[0].options.body, undefined);
  assert.equal(calls[0].options.credentials, "same-origin"); assert.equal(calls[0].options.redirect, "error"); assert.equal(calls[0].options.cache, "no-store");
  const mismatched = new EventAccessClient(bootstrap, async () => ok(page()));
  await assert.rejects(() => mismatched.events(signal(), null, 48), invalid);
});

test("invalid invitation, resource, revision and page inputs never send requests", async () => {
  let calls = 0; const client = new EventAccessClient(bootstrap, async () => { calls++; return ok(receipt); });
  for (const value of ["", token + "=", token + "x", token.slice(1), " https://outside.invalid/"]) { assert.equal(invitationTokenIsValid(value), false); await assert.rejects(() => client.redeem(value, key, signal())); }
  for (const value of ["short", "bad key with spaces", "x".repeat(129)]) await assert.rejects(() => client.redeem(token, value, signal()));
  for (const id of ["../me", "https://outside.invalid", "receipt-1"]) await assert.rejects(() => client.receipt(id, signal()));
  for (const limit of [0, 49, 1.5]) await assert.rejects(() => client.events(signal(), null, limit));
  for (const cursor of ["", "a\nb", "x".repeat(4097)]) await assert.rejects(() => client.events(signal(), cursor));
  await assert.rejects(() => client.select(0, null, signal())); await assert.rejects(() => client.select(7, "made-up", signal()));
  assert.equal(calls, 0); assert.match(createJoinKey(), /^[A-Za-z0-9._:-]{8,128}$/);
});

test("redeem submits only token and explicit join intent with CSRF and one idempotency key", async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  const client = new EventAccessClient(bootstrap, async (url, options) => { calls.push({ url, options }); return ok(receipt); });
  assert.deepEqual(await client.redeem(token, key, signal()), receipt);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, "/prefix/api/v1/event-invitations/redeem");
  assert.doesNotMatch(calls[0].url, new RegExp(token)); assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].options.body)), { token, confirmation_intent: "join" });
  assert.deepEqual(calls[0].options.headers, { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": "synthetic-csrf", "Idempotency-Key": key });
  assert.equal(calls[0].options.credentials, "same-origin"); assert.equal(calls[0].options.cache, "no-store"); assert.equal(calls[0].options.redirect, "error");
});

test("selection PUT carries the exact observed revision and validates the selected Space", async () => {
  let body: unknown; let method: unknown;
  const client = new EventAccessClient(bootstrap, async (_url, options) => { body = JSON.parse(String(options.body)); method = options.method; return ok(selected); });
  await client.select(7, selected.selection_revision, signal());
  assert.equal(method, "PUT"); assert.deepEqual(body, { space_id: 7, expected_revision: selected.selection_revision });
  await client.select(7, null, signal()); assert.deepEqual(body, { space_id: 7, expected_revision: null });
  await assert.rejects(() => client.select(8, selected.selection_revision, signal()), invalid);
});

test("mutation transport invokes native fetch without binding the client as its receiver", async () => {
  const client = new EventAccessClient(bootstrap, async function (this: unknown, _url, options) {
    assert.equal(this, undefined, "Browser-native fetch rejects an EventAccessClient receiver.");
    return ok(options.method === "POST" ? receipt : selected);
  });
  await client.redeem(token, key, signal()); await client.select(7, null, signal());
});

test("only CURRENT_EVENT_REQUIRED with status409 means a genuinely unselected current event", async () => {
  const absent = new EventAccessClient(bootstrap, async () => fail(409, "CURRENT_EVENT_REQUIRED"));
  assert.deepEqual(await absent.current(signal()), { status: "unselected" });
  for (const [status, code] of [[403, "CURRENT_EVENT_REQUIRED"], [409, "CONTEXT_CHANGED"], [503, "DEPENDENCY_UNAVAILABLE"]] as const) {
    const client = new EventAccessClient(bootstrap, async () => fail(status, code)); await assert.rejects(() => client.current(signal()), (error: unknown) => error instanceof ApiFailure && error.status === status);
  }
  const network = new EventAccessClient(bootstrap, async () => { throw new Error("offline"); });
  await assert.rejects(() => network.current(signal()));
});

test("only the exact GET recovery error exposes a selection revision without event metadata", async () => {
  const details = { selection_revision: selected.selection_revision };
  const client = new EventAccessClient(bootstrap, async () => fail(403, "CURRENT_EVENT_ACCESS_REVOKED", details));
  assert.deepEqual(await client.current(signal()), { status: "revoked", selection_revision: selected.selection_revision });
  for (const [status, code, value] of [
    [401, "CURRENT_EVENT_ACCESS_REVOKED", details], [409, "CURRENT_EVENT_ACCESS_REVOKED", details], [403, "ACCESS_DENIED", details],
    [403, "CURRENT_EVENT_ACCESS_REVOKED", []], [403, "CURRENT_EVENT_ACCESS_REVOKED", {}], [403, "CURRENT_EVENT_ACCESS_REVOKED", { selection_revision: null }],
    [403, "CURRENT_EVENT_ACCESS_REVOKED", { selection_revision: "selection-" + "A".repeat(32) }],
    [403, "CURRENT_EVENT_ACCESS_REVOKED", { ...details, space_id: 7 }], [403, "CURRENT_EVENT_ACCESS_REVOKED", { ...details, access_version: selected.access_version }],
  ] as const) { const rejected = new EventAccessClient(bootstrap, async () => fail(status, code, value)); await assert.rejects(() => rejected.current(signal())); }
  // The special case belongs to GET current-event only; command denials remain denials.
  await assert.rejects(() => client.select(7, selected.selection_revision, signal()), (error: unknown) => error instanceof ApiFailure && error.status === 403);
  await assert.rejects(() => client.events(signal()), (error: unknown) => error instanceof ApiFailure && error.status === 403);
});

test("receipt reads match the requested ID and do not redeem or rejoin", async () => {
  const calls: string[] = []; const client = new EventAccessClient(bootstrap, async (url, options) => { calls.push(url); assert.equal(options.method, "GET"); return ok({ ...receipt, membership_current: false }); });
  assert.equal((await client.receipt(receipt.receipt_id, signal())).membership_current, false);
  assert.deepEqual(calls, ["/prefix/api/v1/event-invitation-receipts/" + receipt.receipt_id]);
  await assert.rejects(() => client.receipt("receipt-" + "d".repeat(32), signal()), invalid);
});

test("all activity mutations share a duplicate lock and release it after the response", async () => {
  const response = deferred<Response>(); let calls = 0;
  const client = new EventAccessClient(bootstrap, async () => { calls++; return calls === 1 ? response.promise : ok(selected); });
  const joining = client.redeem(token, key, signal());
  for (const operation of [() => client.redeem(token, key, signal()), () => client.select(7, null, signal())]) await assert.rejects(operation, (error: unknown) => error instanceof ApiFailure && error.code === "CLIENT_REQUEST_PENDING");
  assert.equal(calls, 1); response.resolve(ok(receipt)); await joining; await client.select(7, null, signal()); assert.equal(calls, 2);
});

test("malformed success, HTML, wrong status and server failures are never automatic retries", async () => {
  const responses = [ok(receipt, 201), new Response(null, { status: 204 }), new Response("<html>login</html>", { headers: { "Content-Type": "text/html" } }), new Response(JSON.stringify({ data: receipt, error: {}, meta }), { headers: { "Content-Type": "application/json" } }), new Response(JSON.stringify({ data: receipt, meta: {} }), { headers: { "Content-Type": "application/json" } }), fail(503, "MEMBERSHIP_UNAVAILABLE"), null];
  for (const response of responses) { let calls = 0; const client = new EventAccessClient(bootstrap, async () => { calls++; if (!response) throw new Error("offline"); return response; }); await assert.rejects(() => client.redeem(token, key, signal())); assert.equal(calls, 1); }
});

test("initial refresh only reads current actor memberships and server selection", async () => {
  const calls: string[] = []; const controller = new EventAccessController(new EventAccessClient(bootstrap, async (url, options) => { calls.push(url); assert.equal(options.method, "GET"); return baseline(url, options); }));
  await controller.refresh(); assert.equal(controller.snapshot().status, "ready"); assert.equal(controller.snapshot().items.length, 1);
  assert.deepEqual(calls.sort(), ["/prefix/api/v1/me/current-event", "/prefix/api/v1/me/events?limit=24"]); controller.dispose();
});

test("joining refreshes membership reads but never selects the joined activity automatically", async () => {
  const writes: RequestInit[] = []; const controller = new EventAccessController(new EventAccessClient(bootstrap, async (url, options) => { if (options.method === "POST") { writes.push(options); return ok(receipt); } return url.includes("current-event") ? fail(409, "CURRENT_EVENT_REQUIRED") : ok(page()); }));
  await controller.refresh(); await controller.join(token, key);
  assert.equal(writes.length, 1); assert.equal(writes[0].method, "POST"); assert.equal(controller.snapshot().selection?.status, "unselected"); assert.equal(controller.snapshot().receipt?.membership_current, true); controller.dispose();
});

test("explicit selection sends the observed revision and not a fabricated fallback", async () => {
  const bodies: unknown[] = []; const controller = new EventAccessController(new EventAccessClient(bootstrap, async (url, options) => { if (options.method === "PUT") { bodies.push(JSON.parse(String(options.body))); return ok(selected); } return baseline(url, options); }));
  assert.equal(await controller.select(7), false); await controller.refresh(); assert.equal(await controller.select(8), false); assert.equal(await controller.select(7), true);
  assert.deepEqual(bodies, [{ space_id: 7, expected_revision: selected.selection_revision }]); controller.dispose();
  const nullBodies: unknown[] = []; const empty = new EventAccessController(new EventAccessClient(bootstrap, async (url, options) => { if (options.method === "PUT") { nullBodies.push(JSON.parse(String(options.body))); return ok(selected); } return url.includes("current-event") ? fail(409, "CURRENT_EVENT_REQUIRED") : ok(page()); }));
  await empty.refresh(); await empty.select(7); assert.deepEqual(nullBodies, [{ space_id: 7, expected_revision: null }]); empty.dispose();
});

test("selection conflicts remove usable revision until explicit refresh and never retry PUT", async () => {
  let writes = 0; const controller = new EventAccessController(new EventAccessClient(bootstrap, async (url, options) => { if (options.method === "PUT") { writes++; return fail(409, "CONTEXT_CHANGED"); } return baseline(url, options); }));
  await controller.refresh(); assert.equal(await controller.select(7), false); assert.equal(controller.snapshot().selection, null); assert.equal(controller.snapshot().status, "error");
  await controller.select(7); assert.equal(writes, 1); await controller.refresh(); await controller.select(7); assert.equal(writes, 2); controller.dispose();
});

test("failed current-event read never enables selection with expected_revision null", async () => {
  let writes = 0; const controller = new EventAccessController(new EventAccessClient(bootstrap, async (url, options) => { if (options.method !== "GET") writes++; return url.includes("current-event") ? fail(503, "DEPENDENCY_UNAVAILABLE") : ok(page()); }));
  await controller.refresh(); assert.equal(controller.snapshot().selection, null); assert.equal(controller.snapshot().status, "error"); await controller.select(7); assert.equal(writes, 0); controller.dispose();
});

test("revoked selection clears prior event and receipt while a legal member can explicitly CAS-switch", async () => {
  let revoked = false; let authorityLoss = 0; const writes: unknown[] = [];
  const next = { ...member, space_id: 8, membership_id: 18, name: "仍可参加的虚构活动" };
  const controller = new EventAccessController(new EventAccessClient(bootstrap, async (url, options) => {
    if (options.method === "POST") return ok(receipt);
    if (options.method === "PUT") { writes.push(JSON.parse(String(options.body))); return ok({ ...selected, space_id: 8, selection_revision: "selection-" + "d".repeat(32) }); }
    if (url.includes("/me/events?")) return ok(page(revoked ? [next] : [member]));
    return revoked ? fail(403, "CURRENT_EVENT_ACCESS_REVOKED", { selection_revision: selected.selection_revision }) : ok(selected);
  }), () => { authorityLoss++; });
  await controller.refresh(); await controller.join(token, key); assert.ok(controller.snapshot().receipt);
  revoked = true; await controller.refresh();
  assert.equal(controller.snapshot().status, "ready"); assert.equal(controller.snapshot().receipt, null);
  assert.deepEqual(controller.snapshot().selection, { status: "revoked", selection_revision: selected.selection_revision });
  assert.deepEqual(controller.snapshot().items, [next]); assert.equal(authorityLoss, 0); assert.equal(writes.length, 0);
  assert.equal(await controller.select(7), false); assert.equal(await controller.select(8), true);
  assert.deepEqual(writes, [{ space_id: 8, expected_revision: selected.selection_revision }]); controller.dispose();
});

test("a malformed recovery or member-list denial clears the actor instead of becoming recovery", async () => {
  for (const route of ["current", "members"]) {
    let notified = 0; const controller = new EventAccessController(new EventAccessClient(bootstrap, async (url) => {
      if (url.includes("/me/events?")) return route === "members" ? fail(403, "ACCESS_DENIED") : ok(page());
      return fail(403, "CURRENT_EVENT_ACCESS_REVOKED", route === "current" ? { selection_revision: selected.selection_revision, space_id: 7 } : { selection_revision: selected.selection_revision });
    }), () => { notified++; });
    await controller.refresh(); assert.equal(controller.snapshot().status, "forbidden"); assert.equal(controller.snapshot().selection, null); assert.equal(controller.snapshot().items.length, 0); assert.equal(notified, 1); controller.dispose();
  }
});

test("uncertain join retains the same key and payload only for an explicit recovery action", async () => {
  const calls: { key: string | null; body: unknown }[] = [];
  const controller = new EventAccessController(new EventAccessClient(bootstrap, async (url, options) => { if (options.method === "POST") { calls.push({ key: new Headers(options.headers).get("Idempotency-Key"), body: JSON.parse(String(options.body)) }); if (calls.length === 1) throw new Error("lost response"); return ok(receipt); } return baseline(url, options); }));
  await controller.refresh(); await controller.join(token, key); assert.equal(controller.snapshot().joinUncertain, true); assert.equal(calls.length, 1);
  await controller.join("T".repeat(43), "different-key"); await controller.select(7); assert.equal(calls.length, 1);
  await controller.retryJoin(); assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]); assert.equal(controller.snapshot().joinUncertain, false); assert.equal(controller.snapshot().receipt?.receipt_id, receipt.receipt_id); controller.dispose();
});

test("a replayed receipt with lost membership cannot authorize activity selection", async () => {
  let puts = 0; const controller = new EventAccessController(new EventAccessClient(bootstrap, async (url, options) => { if (options.method === "POST") return ok({ ...receipt, membership_current: false }); if (options.method === "PUT") puts++; return baseline(url, options); }));
  await controller.refresh(); await controller.join(token, key); assert.equal(controller.snapshot().receipt?.membership_current, false); assert.equal(await controller.select(7), false); assert.equal(puts, 0); controller.dispose();
});

test("a historical failed receipt does not block a new authorized membership incarnation", async () => {
  let membershipId = member.membership_id; const bodies: unknown[] = [];
  const controller = new EventAccessController(new EventAccessClient(bootstrap, async (url, options) => {
    if (options.method === "POST") return ok({ ...receipt, membership_current: false });
    if (options.method === "PUT") { bodies.push(JSON.parse(String(options.body))); return ok(selected); }
    return url.includes("current-event") ? fail(409, "CURRENT_EVENT_REQUIRED") : ok(page([{ ...member, membership_id: membershipId }]));
  }));
  await controller.refresh(); await controller.join(token, key);
  const old = controller.snapshot().receipt; assert.ok(old);
  assert.equal(receiptBlocksMembership(old, controller.snapshot().items[0]), true);
  assert.equal(await controller.select(7), false);
  // Another explicit, legitimate invitation creates a new native membership.
  membershipId = 42; await controller.refresh();
  assert.equal(controller.snapshot().receipt?.membership_current, false);
  assert.equal(receiptBlocksMembership(old, controller.snapshot().items[0]), false);
  assert.equal(await controller.select(7), true);
  assert.deepEqual(bodies, [{ space_id: 7, expected_revision: null }]);
  assert.equal(receiptBlocksMembership(old, { ...controller.snapshot().items[0], space_id: 8 }), false);
  controller.dispose();
});

test("401 and403 clear memberships, receipt, selection and pending retry state", async () => {
  for (const status of [401, 403]) {
    let revoked = false; let notified = 0;
    const controller = new EventAccessController(new EventAccessClient(bootstrap, async (url, options) => { if (revoked) return fail(status, status === 401 ? "AUTHENTICATION_REQUIRED" : "ACCESS_DENIED"); if (options.method === "POST") return ok(receipt); return baseline(url, options); }), () => { notified++; });
    await controller.refresh(); await controller.join(token, key); assert.ok(controller.snapshot().receipt); revoked = true; await controller.refresh();
    const state = controller.snapshot(); assert.equal(state.status, status === 401 ? "signed_out" : "forbidden"); assert.deepEqual(state.items, []); assert.equal(state.selection, null); assert.equal(state.receipt, null); assert.equal(state.joinUncertain, false); assert.equal(notified, 1); controller.dispose();
  }
});

test("late successful reads cannot overwrite a newer completed activity refresh", async () => {
  const stale = deferred<Response>(); let listReads = 0;
  const controller = new EventAccessController(new EventAccessClient(bootstrap, async (url) => { if (url.includes("/me/events?")) { listReads++; return listReads === 1 ? stale.promise : ok(page([{ ...member, name: "最新活动名称" }])); } return ok(selected); }));
  const old = controller.refresh(); await controller.refresh(); stale.resolve(ok(page([{ ...member, name: "过期活动名称" }]))); await old;
  assert.equal(controller.snapshot().items[0].name, "最新活动名称"); controller.dispose();
});

test("a late401 still invalidates the same actor scope even after a newer read succeeded", async () => {
  const stale = deferred<Response>(); let listReads = 0; let notified = 0;
  const controller = new EventAccessController(new EventAccessClient(bootstrap, async (url) => { if (url.includes("/me/events?")) { listReads++; return listReads === 1 ? stale.promise : ok(page()); } return ok(selected); }), () => { notified++; });
  const old = controller.refresh(); await controller.refresh(); assert.equal(controller.snapshot().status, "ready"); stale.resolve(fail(401, "AUTHENTICATION_REQUIRED")); await old;
  assert.equal(controller.snapshot().status, "signed_out"); assert.equal(controller.snapshot().items.length, 0); assert.equal(notified, 1); controller.dispose();
});

test("disposed actor results cannot invalidate a new identity or repopulate private state", async () => {
  const late = deferred<Response>(); let notified = 0; const controller = new EventAccessController(new EventAccessClient(bootstrap, async (url) => url.includes("/me/events?") ? late.promise : ok(selected)), () => { notified++; });
  const read = controller.refresh(); controller.dispose(); late.resolve(fail(401, "AUTHENTICATION_REQUIRED")); await read;
  assert.equal(notified, 0); assert.deepEqual(controller.snapshot().items, []); assert.equal(controller.snapshot().selection, null);
});

test("load-more follows the signed cursor, rejects duplicate pages and handles revoked access", async () => {
  const first = Array.from({ length: 24 }, (_, index) => ({ ...member, space_id: index + 1, membership_id: index + 100 }));
  let mode: "valid" | "duplicate" | "revoked" = "valid";
  const controller = new EventAccessController(new EventAccessClient(bootstrap, async (url) => { if (url.includes("current-event")) return ok(selected); if (!url.includes("cursor=")) return ok(page(first, "signed.first")); if (mode === "revoked") return fail(403, "ACCESS_DENIED"); if (mode === "duplicate") return ok(page([first[0]])); return ok(page([{ ...member, space_id: 25, membership_id: 125 }])); }));
  await controller.refresh(); await controller.more(); assert.equal(controller.snapshot().items.length, 25); assert.equal(controller.snapshot().nextCursor, null);
  mode = "duplicate"; await controller.refresh(); await controller.more(); assert.equal(controller.snapshot().items.length, 24); assert.equal(controller.snapshot().error?.code, "INVALID_RESPONSE");
  mode = "revoked"; await controller.more(); assert.equal(controller.snapshot().status, "forbidden"); assert.equal(controller.snapshot().items.length, 0); controller.dispose();
});

test("fixed activity feedback never reflects server text, arbitrary codes or object prototypes", () => {
  for (const code of ["__proto__", "constructor", "toString", "UNTRUSTED_SERVER_TEXT", "INVITATION_UNAVAILABLE"]) { const message = eventAccessFeedback(new ApiFailure(409, code)); assert.equal(typeof message, "string"); assert.doesNotMatch(message, /UNTRUSTED_SERVER_TEXT|__proto__|constructor/); }
  assert.equal(eventAccessFeedback(null), "");
});
