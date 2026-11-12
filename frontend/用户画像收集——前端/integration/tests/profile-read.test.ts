import test from "node:test";
import assert from "node:assert/strict";
import { parseDraft, parseFieldDefinition, parseLegacySessionProgress, parseOwnerProfile, parsePreview, parseSourceCapabilities, parseSources, type ProfileScope } from "../src/contracts.ts";
import { ProfileReadClient, UNCONNECTED_PROFILE_OPERATIONS } from "../src/profile-client.ts";
import { ProfileReadFailure, readProfileJson } from "../src/http.ts";
import { ownerDraftDocument, ownerProfileDocument, simulatedDocument, unicodeCharacterCount, utf8ByteCount, valueText } from "../src/document-mapping.ts";

const id = "11111111-1111-4111-a111-111111111111", id2 = "22222222-2222-4222-a222-222222222222";
const sessionId = "33333333-3333-4333-a333-333333333333";
const globalScope = { kind: "global" } as const;
const signal = () => new AbortController().signal;
const definition = (key = "bio", scope = "global") => ({ key, label: key === "bio" ? "自我介绍" : "字段标签", scope, kind: "profile", schema_version: 2, value_schema: { type: "string", minLength: 1, maxLength: 10000 }, cardinality: "one", max_items: 1, required_when: [], visibility_choices: ["authenticated", "friends", "private"], default_visibility: "authenticated", native_binding: null, storage_kind: "inline", display_order: 1, editable: true });
const attribute = (patch = {}) => ({ attribute_id: id, key: "bio", value: "  保留原始换行\n第二行🙂  ", visibility: "private", confirmation: "confirmed", last_confirmed_at: "2026-11-12 12:00:00", display_label: null, record_group_id: null, sort_order: 0, schema_version: 2, ...patch });
const profile = (patch = {}) => ({ scope: "global", space_id: null, revision: 2, permission_version: 1, attributes: [attribute()], field_definitions: [definition()], schema_version: 2, policy_version: "s2-2026-11-11", legacy_candidates: [{ key: "headline", value: "不应成为正式条目的旧候选", confirmation: "legacy_candidate", visibility: "private" }], editing_draft: null, ...patch });
const draft = (patch = {}) => ({ id: id2, state_id: 2, draft_kind: "profile", base_revision: 2, base_identity_version: 1, draft_version: 3, fields: [{ op: "upsert", ...attribute({ confirmation: "pending" }) }], origin: "manual", initiator_id: 1, status: "editing", confirmation_hash: null, confirmed_revision: null, created_at: "2026-11-12 12:00:00", updated_at: "2026-11-12 12:00:00", scope: "global", space_id: null, current_revision: 2, preview_attributes: [attribute({ confirmation: "pending", last_confirmed_at: null })], field_definitions: [definition()], policy_version: "s2-2026-11-11", ...patch });
const preview = (patch = {}) => ({ profile: profile({ attributes: [attribute({ visibility: "authenticated" })], field_definitions: [definition()] }), contacts: profile({ attributes: [], field_definitions: [] }), perspective: "authenticated", simulated: true, draft_id: null, base_revision: 2, ...patch });
const source = (patch = {}) => ({ id, owner_id: 1, kind: "text", version: 1, status: "ready", label: "虚构本人文字来源", external_id: "text:private-internal-reference", canonical_url: null, latest_snapshot_id: id2, last_job_id: sessionId, created_at: "2026-11-12 12:00:00", updated_at: "2026-11-12 12:00:00", snapshot: null, last_job: { id: sessionId, execution_status: "succeeded", applicability: "current" }, generation_mode: "rules", llm_calls: 0, ...patch });
const capabilities = () => ({ readers: Object.fromEntries(["github", "resume", "web", "text"].map((kind) => [kind, { kind, enabled: true, available: true, imported_before: false, reason: null, provider_user_id: "PRIVATE_PROVIDER_REFERENCE", max_bytes: 5242880 }])), generation_mode: "rules", llm_calls: 0 });
const progress = (patch = {}) => ({ schema_version: 1, session_id: sessionId, session_version: 4, scope_key: "global", space_id: null, stage: "review", stage_index: 2, stage_count: 5, state: "waiting_input", phase: "review", label_code: "review_materials", message: "请核对资料并确认展示范围。", updated_at: "2026-11-12 12:00:00", revision_token: "a".repeat(64), poll_after_ms: 0, percent: null, next_actions: ["review_confirm"], questions: { total: 0, answered: 0, skipped: 0, remaining: 0, current_index: null }, reasons: [], tasks_has_more: false, tasks: [], ...patch });
const meta = { request_id: "0123456789abcdef01234567" };
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ data, meta }), { status, headers: { "Content-Type": "application/json" } });
const fail = (status: number, code: string) => new Response(JSON.stringify({ error: { code, message: "SYNTHETIC_PRIVATE_SERVER_TEXT", retryable: false, details: { value: "SYNTHETIC_PRIVATE_DETAIL" } }, meta }), { status, headers: { "Content-Type": "application/json" } });
const invalid = (error: unknown) => error instanceof ProfileReadFailure && error.code === "INVALID_RESPONSE";

test("owner read preserves real field definitions, numeric revisions and exact text without admitting legacy candidates", () => {
  const parsed = parseOwnerProfile(profile()); assert.equal(parsed.attributes[0].value, attribute().value);
  assert.equal(parsed.attributes[0].visibility, "private"); assert.equal(parsed.field_definitions[0].value_schema && typeof parsed.field_definitions[0].value_schema, "object");
  assert.equal(parsed.revision, 2); assert.equal(parsed.editing_draft, null);
  assert.equal("legacy_candidates" in parsed, false); assert.equal("native_binding" in parsed.field_definitions[0], false);
});

test("malformed profile types, duplicate IDs and unknown field keys are rejected rather than replaced by empty success", () => {
  for (const patch of [{ revision: "2" }, { permission_version: -1 }, { scope: "space:7" }, { attributes: [attribute(), attribute()] }, { attributes: [attribute({ key: "unknown" })] }, { attributes: [attribute({ visibility: "everyone" })] }, { attributes: [attribute({ confirmation: "legacy_candidate" })] }, { field_definitions: [definition(), definition()] }]) assert.throws(() => parseOwnerProfile(profile(patch)));
  for (const patch of [{ scope: ["global"] }, { cardinality: ["one"] }, { editable: "true" }, { value_schema: null }, { visibility_choices: ["private"], default_visibility: "authenticated" }]) assert.throws(() => parseFieldDefinition({ ...definition(), ...patch }));
});

test("draft recovery returns stable reference and private preview without claiming formal confirmation", () => {
  const owner = parseOwnerProfile(profile({ editing_draft: draft() })); assert.deepEqual(owner.editing_draft, { id: id2, base_revision: 2, draft_version: 3, status: "editing" });
  const parsed = parseDraft(draft()); assert.equal(parsed.preview_attributes[0].confirmation, "pending"); assert.equal("fields" in parsed, false);
  const document = ownerDraftDocument(parsed); assert.equal(document.context, "owner_draft"); assert.equal(document.draftVersion, 3); assert.equal(document.profile[0].confirmation, "pending");
  assert.throws(() => parseOwnerProfile(profile({ editing_draft: draft({ status: "confirmed" }) })));
});

test("native unconfirmed draft markers remain explicitly unconfirmed on the owner read", () => {
  const parsed = parseOwnerProfile(profile({ attributes: [attribute({ confirmation: "draft", last_confirmed_at: null, value: null })] }));
  const mapped = ownerProfileDocument(parsed); assert.equal(mapped.profile[0].confirmation, "draft"); assert.equal(mapped.profile[0].value, null);
});

test("server previews retain their simulated perspective and independent contact projection", () => {
  const contact = attribute({ attribute_id: id2, key: "contact_other", display_label: "关于我", value: { label: "虚构联系", value: "synthetic" }, visibility: "authenticated" });
  const parsed = parsePreview(preview({ contacts: profile({ attributes: [contact], field_definitions: [definition("contact_other")] }) }));
  const document = simulatedDocument(parsed); assert.equal(document.simulated, true); assert.equal(document.context, "server_preview");
  assert.equal(document.profile.length, 1); assert.equal(document.contacts[0].fieldKey, "contact_other"); assert.equal(document.contacts[0].title, "关于我");
  assert.throws(() => parsePreview(preview({ profile: profile({ attributes: [contact], field_definitions: [definition("contact_other")] }) })));
  assert.throws(() => parsePreview(preview({ contacts: profile() }))); assert.throws(() => parsePreview(preview({ simulated: false })));
});

test("owner mapping never treats title, category or visibility as permission to mix contacts into detail", () => {
  const parsed = parseOwnerProfile(profile({ attributes: [attribute({ display_label: "联系方式" }), attribute({ attribute_id: id2, key: "contact_phone", display_label: "自我介绍", value: "synthetic-contact", visibility: "authenticated" })], field_definitions: [definition(), definition("contact_phone")] }));
  const mapped = ownerProfileDocument(parsed); assert.equal(mapped.profile[0].fieldKey, "bio"); assert.equal(mapped.contacts[0].fieldKey, "contact_phone");
  assert.equal(mapped.contacts[0].category, "unmapped"); assert.equal(mapped.profile[0].storageScope, "global"); assert.equal(mapped.profile[0].visibility, "private");
});

test("same-label entries retain stable IDs, ordering and full values; unknown future categories remain unmapped", () => {
  const parsed = parseOwnerProfile(profile({ attributes: [attribute({ sort_order: 2, display_label: "相同标题" }), attribute({ attribute_id: id2, sort_order: 1, display_label: "相同标题", value: "第二条", key: "future_field" })], field_definitions: [definition(), definition("future_field")] }));
  const mapped = ownerProfileDocument(parsed); assert.deepEqual(mapped.profile.map((item) => item.id), [id2, id]);
  assert.equal(mapped.profile[0].category, "unmapped"); assert.equal(mapped.profile[1].text, attribute().value);
});

test("editing a mapped structured value cannot mutate the authoritative read object", () => {
  const parsed = parseOwnerProfile(profile({ attributes: [attribute({ value: { title: "原始项目", nested: ["原文"] } })] }));
  const mapped = ownerProfileDocument(parsed); const value = mapped.profile[0].value as { title: string; nested: string[] };
  value.title = "本地编辑"; value.nested.push("新片段"); assert.deepEqual(parsed.attributes[0].value, { title: "原始项目", nested: ["原文"] });
});

test("Space storage scope, display category and per-item audience stay separate", () => {
  const parsed = parseOwnerProfile(profile({ scope: "space:7", space_id: 7, attributes: [attribute({ key: "event_goal", visibility: "friends" })], field_definitions: [definition("event_goal", "event")] }));
  const mapped = ownerProfileDocument(parsed).profile[0]; assert.equal(mapped.category, "activity"); assert.equal(mapped.storageScope, "space:7"); assert.equal(mapped.visibility, "friends");
  assert.throws(() => parseOwnerProfile(profile({ scope: "space:7", space_id: 8 })));
});

test("pure text mapping counts Unicode characters and UTF8 bytes without trimming or claiming storage support", () => {
  const long = "🙂".repeat(19998) + "\n中"; assert.equal(unicodeCharacterCount(long), 20000); assert.equal(utf8ByteCount(long), 79996);
  assert.equal(valueText(long), long); assert.equal(valueText("  \n原文\n  "), "  \n原文\n  ");
  const structured = { title: "项目", paragraphs: [long, "另一段"] }; assert.deepEqual(JSON.parse(valueText(structured)), structured);
  // This is a pure representation check, not evidence of a new20,000-char API.
  assert.equal(UNCONNECTED_PROFILE_OPERATIONS.includes("narrative_segment_write"), true);
});

test("source list and capabilities expose only existing read metadata, not raw imported text or provider identity", () => {
  const list = parseSources({ sources: [source()] }); assert.equal(list[0].kind, "text"); assert.equal("external_id" in list[0], false); assert.equal("last_job" in list[0], false);
  const parsed = parseSourceCapabilities(capabilities()); assert.equal(parsed.readers.github.imported_before, false); assert.equal("provider_user_id" in parsed.readers.github, false);
  assert.throws(() => parseSources({ sources: [source({ snapshot: { raw_text: "private" } })] }));
  assert.throws(() => parseSources({ sources: [source({ status: "deleted" })] })); assert.throws(() => parseSourceCapabilities({ ...capabilities(), llm_calls: 1 }));
});

test("legacy progress stays five-stage with unknown percent and cannot become a ten-step completion receipt", () => {
  const parsed = parseLegacySessionProgress(progress()); assert.equal(parsed.stage_count, 5); assert.equal(parsed.percent, null);
  assert.deepEqual(parsed.next_actions, ["review_confirm"]); assert.equal("message" in parsed, false);
  for (const patch of [{ percent: 40 }, { stage_count: 10 }, { stage_index: 3 }, { stage: "G03" }, { questions: { total: 2, answered: 2, skipped: 1, remaining: 0, current_index: 0 } }]) assert.throws(() => parseLegacySessionProgress(progress(patch)));
});

test("client issues exactly the existing owner GET endpoints and has no write or automatic resume action", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = new ProfileReadClient("/prefix/api/v1", async (url, init) => { calls.push({ url, init }); return ok(url.includes("/preview?") ? preview() : url.includes("/drafts/") ? draft() : url.endsWith("/sources") ? { sources: [source()] } : url.endsWith("source-capabilities") ? capabilities() : url.endsWith("/progress") ? progress() : profile()); });
  await client.profile(globalScope, signal()); await client.draft(id2, globalScope, signal()); await client.preview(globalScope, "authenticated", signal()); await client.sources(signal()); await client.sourceCapabilities(signal()); await client.legacySessionProgress(sessionId, globalScope, signal());
  assert.deepEqual(calls.map((call) => call.url), ["/prefix/api/v1/me/profile?scope=global", "/prefix/api/v1/me/profile/drafts/" + id2 + "?scope=global", "/prefix/api/v1/me/profile/preview?scope=global&perspective=authenticated", "/prefix/api/v1/me/profile/sources", "/prefix/api/v1/me/profile/source-capabilities", "/prefix/api/v1/onboarding/sessions/" + sessionId + "/progress"]);
  for (const { init } of calls) { assert.equal(init.method, "GET"); assert.equal(init.body, undefined); assert.equal(init.credentials, "same-origin"); assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error"); }
  assert.equal("review_confirm" in client, false); assert.equal("confirm" in client, false); assert.equal("start" in client, false); assert.equal("upload" in client, false);
});

test("Space reads send explicit scope and reject stale A/B responses without adding unknown context fields", async () => {
  const scope: ProfileScope = { kind: "space", space_id: 7 }; let path = "";
  const client = new ProfileReadClient("/api/v1", async (url) => { path = url; return ok(profile({ scope: "space:7", space_id: 7, attributes: [], field_definitions: [] })); });
  assert.equal((await client.profile(scope, signal())).space_id, 7); assert.equal(path, "/api/v1/me/profile?scope=space&space_id=7");
  const wrong = new ProfileReadClient("/api/v1", async () => ok(profile({ scope: "space:8", space_id: 8, attributes: [], field_definitions: [] })));
  await assert.rejects(() => wrong.profile(scope, signal()), invalid);
});

test("preview and draft reads reject wrong server reference or perspective", async () => {
  const wrongDraft = new ProfileReadClient("/api/v1", async () => ok(draft({ id })));
  await assert.rejects(() => wrongDraft.draft(id2, globalScope, signal()), invalid);
  const wrongPreview = new ProfileReadClient("/api/v1", async () => ok(preview({ perspective: "owner" })));
  await assert.rejects(() => wrongPreview.preview(globalScope, "friends", signal()), invalid);
  const wrongSession = new ProfileReadClient("/api/v1", async () => ok(progress({ session_id: id })));
  await assert.rejects(() => wrongSession.legacySessionProgress(sessionId, globalScope, signal()), invalid);
});

test("invalid API paths, resource IDs and scopes never send requests", async () => {
  let calls = 0; const client = new ProfileReadClient("/api/v1", async () => { calls++; return ok(profile()); });
  for (const base of ["https://outside.invalid/api/v1", "//outside.invalid/api/v1", "/api/v1?leak=yes", "/x/../api/v1", "/api\\v1"]) assert.throws(() => new ProfileReadClient(base));
  for (const url of ["https://outside.invalid/api/v1/me", "//outside.invalid/api/v1/me", "/api/v1/../me", "/me"]) await assert.rejects(() => readProfileJson(url, (value) => value, signal(), async () => { calls++; return ok({}); }));
  for (const resource of ["../me", "not-an-id", "https://outside.invalid"]) assert.throws(() => client.draft(resource, globalScope, signal()));
  assert.throws(() => client.profile({ kind: "space", space_id: 0 }, signal())); assert.equal(calls, 0);
});

test("HTTP rejects HTML, malformed envelopes and success carrying errors without returning a fallback", async () => {
  for (const response of [new Response("<html>login</html>", { headers: { "Content-Type": "text/html" } }), new Response("not-json", { headers: { "Content-Type": "application/json" } }), ok(profile(), 201), new Response(JSON.stringify({ data: profile(), error: {}, meta }), { headers: { "Content-Type": "application/json" } }), new Response(JSON.stringify({ data: profile(), meta: {} }), { headers: { "Content-Type": "application/json" } })]) {
    let calls = 0; const client = new ProfileReadClient("/api/v1", async () => { calls++; return response; }); await assert.rejects(() => client.profile(globalScope, signal()), invalid); assert.equal(calls, 1);
  }
});

test("authorization failures preserve status while private server messages and detail payloads stay out of errors", async () => {
  for (const status of [401, 403, 409, 503]) {
    let calls = 0; const client = new ProfileReadClient("/api/v1", async () => { calls++; return fail(status, "PROFILE_TEST_FAILURE"); });
    await assert.rejects(() => client.profile(globalScope, signal()), (error: unknown) => { assert.ok(error instanceof ProfileReadFailure); assert.equal(error.status, status); assert.equal(error.code, "PROFILE_TEST_FAILURE"); assert.doesNotMatch(JSON.stringify(error) + String(error), /SYNTHETIC_PRIVATE/); return true; }); assert.equal(calls, 1);
  }
});

test("invalid error-code text cannot smuggle private server prose into a client failure", async () => {
  const client = new ProfileReadClient("/api/v1", async () => fail(422, "private prose should not be an error code"));
  await assert.rejects(() => client.profile(globalScope, signal()), invalid);
});

test("native read transport has no client receiver and every read remains explicit", async () => {
  let calls = 0; const client = new ProfileReadClient("/api/v1", async function (this: unknown) { assert.equal(this, undefined); calls++; return ok(profile()); });
  assert.equal(calls, 0); await client.profile(globalScope, signal()); assert.equal(calls, 1); await new Promise((resolve) => setTimeout(resolve, 0)); assert.equal(calls, 1);
});

test("cancelled reads cannot return late private content; early abort makes no request", async () => {
  let calls = 0; const aborted = new AbortController(); aborted.abort();
  const client = new ProfileReadClient("/api/v1", async () => { calls++; return ok(profile()); });
  await assert.rejects(() => client.profile(globalScope, aborted.signal), (error: unknown) => error instanceof ProfileReadFailure && error.code === "READ_CANCELLED"); assert.equal(calls, 0);
  let resolve!: (value: Response) => void; const pending = new ProfileReadClient("/api/v1", async () => new Promise<Response>((done) => { resolve = done; }));
  const controller = new AbortController(); const read = pending.profile(globalScope, controller.signal); controller.abort(); resolve(ok(profile()));
  await assert.rejects(() => read, (error: unknown) => error instanceof ProfileReadFailure && error.code === "READ_CANCELLED");
});
