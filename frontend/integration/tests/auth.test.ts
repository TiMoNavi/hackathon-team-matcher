import test from "node:test";
import assert from "node:assert/strict";
import { parseBootstrap } from "../src/contracts.ts";
import { ApiFailure, postJson, type Fetcher } from "../src/http.ts";
import { AuthClient, authFeedback, emailIsValid, githubFailure, githubStartUrl, parseAuthCapabilities, parseAuthReceipt, parseEmailChallenge, parseLogoutReceipt, safeAuthNext } from "../src/auth.ts";

const origin = "https://test.invalid";
const bootstrap = parseBootstrap({ schema_version: 1, base_path: "/matcher/app", api_base: "/api/v1", native_home_url: "/dashboard", native_login_url: "/user/auth/login", csrf_header: "X-CSRF-Token", csrf_token: "synthetic-test-only" }, origin);
const meta = { request_id: "0123456789abcdef01234567" };
const challenge = { challenge_id: "challenge-" + "a".repeat(48), expires_in: 600, resend_after: 60 };
const receipt = { authenticated: true, bound: false, next_url: "/matcher/app" };
const signal = () => new AbortController().signal;
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ data, meta }), { status, headers: { "Content-Type": "application/json" } });
const fail = (status: number, code: string, details: unknown = []) => new Response(JSON.stringify({ error: { code, message: "UNTRUSTED_PROVIDER_TEXT", retryable: false, details }, meta }), { status, headers: { "Content-Type": "application/json" } });
const invalid = (error: unknown) => error instanceof ApiFailure && error.code === "INVALID_RESPONSE";

test("capabilities and challenge contracts reject truthy strings, wrong TTLs and malformed identifiers", () => {
  assert.deepEqual(parseAuthCapabilities({ email_available: true, github_available: false }), { email_available: true, github_available: false });
  for (const value of [{ email_available: "true", github_available: false }, {}, null]) assert.throws(() => parseAuthCapabilities(value));
  assert.deepEqual(parseEmailChallenge(challenge), challenge);
  for (const value of [{ ...challenge, expires_in: 599 }, { ...challenge, resend_after: 0 }, { ...challenge, challenge_id: "challenge-" + "A".repeat(48) }, { ...challenge, challenge_id: "challenge-1" }]) assert.throws(() => parseEmailChallenge(value));
});

test("authentication receipts require actual success, matching intent and exact safe destination", () => {
  assert.deepEqual(parseAuthReceipt(receipt, "login", bootstrap, origin), receipt);
  assert.deepEqual(parseAuthReceipt({ ...receipt, bound: true }, "bind", bootstrap, origin), { ...receipt, bound: true });
  for (const value of [{ ...receipt, authenticated: false }, { ...receipt, bound: true }, { ...receipt, bound: "false" }, { ...receipt, authenticated: undefined }]) assert.throws(() => parseAuthReceipt(value, "login", bootstrap, origin));
  assert.throws(() => parseAuthReceipt(receipt, "bind", bootstrap, origin));
  for (const value of ["https://outside.invalid", "//outside.invalid/matcher/app", "/user/registration", "/matcher/app?next=outside", "/matcher/app#fragment", "/matcher/app/", "/temporary/../matcher/app", "/matcher\\app", " /matcher/app"]) assert.throws(() => safeAuthNext(value, bootstrap, origin));
});

test("email requests carry same-origin session and memory-only CSRF with exact accepted status", async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  const client = new AuthClient(bootstrap, origin, async (url, options) => { calls.push({ url, options }); return ok(challenge, 202); });
  assert.deepEqual(await client.sendEmail(" synthetic@example.invalid ", "login", signal()), challenge);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, "/api/v1/auth/email-codes");
  assert.equal(calls[0].options.method, "POST"); assert.equal(calls[0].options.credentials, "same-origin"); assert.equal(calls[0].options.cache, "no-store"); assert.equal(calls[0].options.redirect, "error");
  assert.deepEqual(calls[0].options.headers, { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": "synthetic-test-only" });
  assert.deepEqual(JSON.parse(String(calls[0].options.body)), { email: "synthetic@example.invalid", purpose: "login", return_to: "/matcher/app" });
  const wrongStatus = new AuthClient(bootstrap, origin, async () => ok(challenge, 200));
  await assert.rejects(() => wrongStatus.sendEmail("synthetic@example.invalid", "login", signal()), invalid);
});

test("invalid local input and mutation paths make no HTTP requests", async () => {
  let calls = 0;
  const fetcher: Fetcher = async () => { calls++; throw new Error("Unexpected request"); };
  const client = new AuthClient(bootstrap, origin, fetcher);
  for (const email of ["", "no-at-sign", "has space@example.invalid", "a".repeat(255) + "@example.invalid"]) { assert.equal(emailIsValid(email), false); await assert.rejects(() => client.sendEmail(email, "login", signal())); }
  for (const code of ["12345", "1234567", "abcdef", "123 56"]) await assert.rejects(() => client.verifyEmail(challenge.challenge_id, code, "login", signal()));
  await assert.rejects(() => client.verifyEmail("invalid", "000000", "login", signal()));
  for (const path of ["/me", "https://outside.invalid/auth/logout", "/auth/logout?next=outside", "/auth/../me", "/auth/logout#fragment"]) await assert.rejects(() => postJson(bootstrap, path, {}, (value) => value, signal(), fetcher));
  assert.equal(calls, 0);
});

test("send, verify and logout share a duplicate-request lock that releases on completion", async () => {
  let resolve!: (value: Response) => void; let calls = 0;
  const client = new AuthClient(bootstrap, origin, async () => { calls++; return calls === 1 ? new Promise<Response>((done) => { resolve = done; }) : ok({ authenticated: false }); });
  const pending = client.sendEmail("synthetic@example.invalid", "login", signal());
  for (const operation of [() => client.sendEmail("synthetic@example.invalid", "login", signal()), () => client.verifyEmail(challenge.challenge_id, "000000", "login", signal()), () => client.logout(signal())]) await assert.rejects(operation, (error: unknown) => error instanceof ApiFailure && error.code === "CLIENT_REQUEST_PENDING");
  assert.equal(calls, 1); resolve(ok(challenge, 202)); await pending; await client.logout(signal()); assert.equal(calls, 2);
});

test("capability reads never start OAuth or mutate accounts", async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  const client = new AuthClient(bootstrap, origin, async (url, options) => { calls.push({ url, options }); return ok({ email_available: false, github_available: true }); });
  await client.capabilities(signal());
  assert.equal(calls.length, 1); assert.equal(calls[0].url, "/api/v1/auth/capabilities"); assert.equal(calls[0].options.method, "GET"); assert.equal(calls[0].options.body, undefined);
  for (const purpose of ["login", "bind"] as const) { const url = new URL(githubStartUrl(bootstrap, purpose), origin); assert.equal(url.origin, origin); assert.equal(url.pathname, "/api/v1/auth/github/start"); assert.equal(url.searchParams.get("intent"), purpose); assert.equal(url.searchParams.get("return_to"), bootstrap.base_path); }
  assert.equal(calls.length, 1);
});

test("verification submits only challenge and code and validates a matching bind receipt", async () => {
  const calls: { url: string; body: unknown }[] = [];
  const client = new AuthClient(bootstrap, origin, async (url, options) => { calls.push({ url, body: JSON.parse(String(options.body)) }); return ok({ ...receipt, bound: true }); });
  const result = await client.verifyEmail(challenge.challenge_id, "000000", "bind", signal()); assert.equal(result.bound, true);
  assert.deepEqual(calls, [{ url: "/api/v1/auth/email/verify", body: { challenge_id: challenge.challenge_id, code: "000000" } }]);
  await assert.rejects(() => client.verifyEmail(challenge.challenge_id, "000000", "login", signal()), invalid);
});

test("logout needs a real false receipt and never treats an empty response as success", async () => {
  assert.deepEqual(parseLogoutReceipt({ authenticated: false }), { authenticated: false });
  for (const value of [{ authenticated: true }, {}, null]) assert.throws(() => parseLogoutReceipt(value));
  for (const response of [ok({}), new Response(null, { status: 204 }), ok({ authenticated: false }, 202)]) { const client = new AuthClient(bootstrap, origin, async () => response); await assert.rejects(() => client.logout(signal()), invalid); }
});

test("network errors, invalid responses and server failures never trigger automatic retries", async () => {
  for (const response of [null, fail(503, "MAIL_DELIVERY_FAILED"), new Response("<html>login</html>", { headers: { "Content-Type": "text/html" } })]) {
    let calls = 0; const client = new AuthClient(bootstrap, origin, async () => { calls++; if (!response) throw new TypeError("offline"); return response; });
    await assert.rejects(() => client.sendEmail("synthetic@example.invalid", "login", signal())); await new Promise((resolve) => setTimeout(resolve, 0)); assert.equal(calls, 1);
  }
});

test("registration is an explicit exact-path action and remains an authentication failure", async () => {
  const client = new AuthClient(bootstrap, origin, async () => fail(409, "REGISTRATION_REQUIRED", { next_url: "/user/registration" }));
  await assert.rejects(() => client.verifyEmail(challenge.challenge_id, "000000", "login", signal()), (error: unknown) => { assert.ok(error instanceof ApiFailure); const feedback = authFeedback(error); assert.equal(feedback.registrationUrl, "/user/registration"); assert.match(feedback.message, /还需补充注册资料/); return true; });
  for (const [status, code, next] of [[200, "REGISTRATION_REQUIRED", "/user/registration"], [409, "IDENTITY_CONFLICT", "/user/registration"], [409, "REGISTRATION_REQUIRED", "//outside.invalid"], [409, "REGISTRATION_REQUIRED", "/user/registration?return_to=outside"], [409, "REGISTRATION_REQUIRED", "/user/registration#fragment"], [409, "REGISTRATION_REQUIRED", "/x/../user/registration"]] as const) assert.equal(authFeedback(new ApiFailure(status, code, false, null, { next_url: next })).registrationUrl, null);
});

test("rate limits honor safe server waits without turning other errors into countdowns", () => {
  assert.equal(authFeedback(new ApiFailure(429, "RATE_LIMITED", false, null, { retry_after: 120 })).retryAfter, 120);
  for (const value of [0, -1, "60", 1.5, 86401, null]) assert.equal(authFeedback(new ApiFailure(429, "RATE_LIMITED", false, null, { retry_after: value })).retryAfter, 60);
  assert.equal(authFeedback(new ApiFailure(400, "INVALID_CODE", false, null, { retry_after: 120 })).retryAfter, 0);
});

test("fixed feedback never reflects untrusted error content or inherited object keys", async () => {
  for (const code of ["UNKNOWN", "__proto__", "toString", "REGISTRATION_REQUIRED"]) { const feedback = authFeedback(new ApiFailure(409, code)); assert.equal(typeof feedback.message, "string"); assert.equal(feedback.registrationUrl, null); assert.doesNotMatch(feedback.message, /邮箱已验证|UNTRUSTED_PROVIDER_TEXT/); }
  const client = new AuthClient(bootstrap, origin, async () => fail(400, "INVALID_CODE"));
  await assert.rejects(() => client.verifyEmail(challenge.challenge_id, "000000", "login", signal()), (error: unknown) => { assert.doesNotMatch(authFeedback(error).message, /UNTRUSTED_PROVIDER_TEXT/); return true; });
  for (const code of ["cancelled", "failed", "identity_conflict", "account_unavailable", "registration_required", "unavailable"]) assert.equal(typeof githubFailure(`?auth_error=${code}`), "string");
  for (const search of ["", "?auth_error=__proto__", "?auth_error=UNTRUSTED_PROVIDER_TEXT", "?message=UNTRUSTED_PROVIDER_TEXT"]) assert.equal(githubFailure(search), null);
});
