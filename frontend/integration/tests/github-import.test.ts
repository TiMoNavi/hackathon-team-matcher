import test from "node:test";
import assert from "node:assert/strict";
import { parseBootstrap } from "../src/contracts.ts";
import { ApiFailure, type Fetcher } from "../src/http.ts";
import { parseGithubImportReceipt, parseGithubSourceProgress, readGithubImport } from "../src/github-import.ts";

const bootstrap = parseBootstrap({ schema_version: 1, base_path: "/matcher/app", api_base: "/api/v1", native_home_url: "/dashboard", native_login_url: "/user/auth/login", csrf_header: "X-CSRF-Token", csrf_token: "synthetic-only" }, "https://test.invalid");
const id = "11111111-2222-4333-a444-555555555555";
const meta = { request_id: "0123456789abcdef01234567" };
const progress = { id, source_id: id, kind: "github", status: "ready", progress: { schema_version: 1, state: "ready", percent: null } };
const ok = (data: unknown) => new Response(JSON.stringify({ data, meta }), { headers: { "Content-Type": "application/json" } });
const fail = (status: number, code: string) => new Response(JSON.stringify({ error: { code, message: "untrusted", retryable: false, details: [] }, meta }), { status, headers: { "Content-Type": "application/json" } });
const signal = () => new AbortController().signal;

test("receipt is strictly typed and source references are allowed only for attempted imports", () => {
  assert.deepEqual(parseGithubImportReceipt({ state: "succeeded", source_id: id, provider_subject: "discard" }), { state: "succeeded", source_id: id });
  for (const state of ["not_requested", "pending", "running", "failed", "skipped_existing", "revoked", "unavailable"]) assert.deepEqual(parseGithubImportReceipt({ state, source_id: null }), { state, source_id: null });
  for (const value of [null, {}, { state: "constructor", source_id: null }, { state: "succeeded", source_id: null }, { state: "succeeded", source_id: "../owner" }, { state: "revoked", source_id: id }, { state: "unavailable", source_id: id }, { state: "running", source_id: id }, { state: "pending", source_id: 1 }]) assert.throws(() => parseGithubImportReceipt(value));
});

test("existing source progress validates identity, type, version, state and absence of invented percentage", () => {
  assert.deepEqual(parseGithubSourceProgress(progress, id), { state: "succeeded" });
  for (const value of [{ ...progress, source_id: "other" }, { ...progress, kind: "resume" }, { ...progress, status: "failed" }, { ...progress, progress: { ...progress.progress, schema_version: 2 } }, { ...progress, progress: { ...progress.progress, percent: 100 } }, { ...progress, progress: { ...progress.progress, state: "constructor" } }]) assert.throws(() => parseGithubSourceProgress(value, id));
  assert.deepEqual(parseGithubSourceProgress({ ...progress, status: "deleted" }, id), { state: "revoked" });
  assert.deepEqual(parseGithubSourceProgress({ ...progress, progress: { ...progress.progress, state: "superseded" } }, id), { state: "superseded" });
});

test("status with no source makes only a no-store read and never starts a mutation", async () => {
  const calls: string[] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push(url); assert.equal(init.method, "GET"); assert.equal(init.credentials, "same-origin"); assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error"); assert.equal(init.body, undefined);
    assert.deepEqual(init.headers, { Accept: "application/json" }); return ok({ state: "failed", source_id: null });
  };
  assert.deepEqual(await readGithubImport(bootstrap, signal(), fetcher), { state: "failed" });
  assert.deepEqual(calls, ["/api/v1/auth/github/import-status"]);
});

test("known sources reuse the existing compact P1 progress endpoint", async () => {
  const calls: string[] = [];
  const fetcher: Fetcher = async (url, init) => { calls.push(url); assert.equal(init.method, "GET"); return ok(calls.length === 1 ? { state: "succeeded", source_id: id } : progress); };
  assert.deepEqual(await readGithubImport(bootstrap, signal(), fetcher), { state: "succeeded" });
  assert.deepEqual(calls, ["/api/v1/auth/github/import-status", "/api/v1/me/profile/sources/" + id + "/progress"]);
});

test("deleted, revoked and superseded source state overrides an earlier succeeded receipt", async () => {
  for (const state of ["revoked", "superseded"]) {
    let calls = 0;
    const result = await readGithubImport(bootstrap, signal(), async () => ok(++calls === 1 ? { state: "succeeded", source_id: id } : { ...progress, progress: { ...progress.progress, state } }));
    assert.deepEqual(result, { state }); assert.equal(calls, 2);
  }
  let calls = 0;
  assert.deepEqual(await readGithubImport(bootstrap, signal(), async () => ++calls === 1 ? ok({ state: "succeeded", source_id: id }) : fail(404, "SOURCE_NOT_FOUND")), { state: "revoked" });
});

test("unavailable, denied or malformed results cannot become a successful source or retry", async () => {
  let calls = 0;
  await assert.rejects(() => readGithubImport(bootstrap, signal(), async () => { calls++; return fail(401, "AUTHENTICATION_REQUIRED"); }), (error: unknown) => error instanceof ApiFailure && error.status === 401);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(() => readGithubImport(bootstrap, signal(), async () => { calls++; return ok({ state: "unknown", source_id: id }); }), (error: unknown) => error instanceof ApiFailure && error.code === "INVALID_RESPONSE");
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(() => readGithubImport(bootstrap, signal(), async () => { calls++; throw new Error("synthetic failure"); })); assert.equal(calls, 1);
});
