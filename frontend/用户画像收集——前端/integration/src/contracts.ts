// Existing P1/P8 read DTOs only. New narrative/review contracts are not inferred.
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Visibility = "authenticated" | "friends" | "private";
export type ProfileScope = { kind: "global" } | { kind: "space"; space_id: number };
export type FieldDefinition = Readonly<{ key: string; label: string; scope: "global" | "event"; schema_version: number; value_schema: JsonValue; cardinality: "one" | "many"; max_items: number; visibility_choices: readonly Visibility[]; default_visibility: Visibility; display_order: number; editable: boolean }>;
export type ProfileAttribute = Readonly<{ attribute_id: string; key: string; value: JsonValue; visibility: Visibility; confirmation: "confirmed" | "pending" | "draft"; last_confirmed_at: string | null; display_label: string | null; sort_order: number; schema_version: number }>;
export type ProfileRead = Readonly<{ scope: string; space_id: number | null; revision: number; permission_version: number; attributes: readonly ProfileAttribute[]; field_definitions: readonly FieldDefinition[]; schema_version: number; policy_version: string }>;
export type EditingDraftRef = Readonly<{ id: string; draft_version: number; base_revision: number; status: "editing" | "confirmed" | "archived" }>;
export type OwnerProfileRead = ProfileRead & Readonly<{ editing_draft: EditingDraftRef | null }>;
export type ProfileDraftRead = EditingDraftRef & Readonly<{ scope: string; space_id: number | null; current_revision: number; preview_attributes: readonly ProfileAttribute[]; field_definitions: readonly FieldDefinition[]; policy_version: string }>;
export type ProfilePreviewRead = Readonly<{ profile: ProfileRead; contacts: ProfileRead; perspective: "owner" | "authenticated" | "friends"; simulated: true; draft_id: string | null; base_revision: number }>;
export type SourceKind = "github" | "resume" | "web" | "text";
export type SourceSummary = Readonly<{ id: string; kind: SourceKind; version: number; status: "running" | "ready" | "failed"; label: string; latest_snapshot_id: string | null; last_job_id: string | null; created_at: string; updated_at: string }>;
export type SourceCapabilities = Readonly<{ readers: Readonly<Record<SourceKind, Readonly<{ kind: SourceKind; enabled: boolean; available: boolean; imported_before: boolean; reason: string | null }>>>; generation_mode: "rules"; llm_calls: 0 }>;

export function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export const isVersion = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
export const isPositiveId = (value: unknown): value is number => isVersion(value) && value > 0 && value <= 2147483647;
const isVisibility = (value: unknown): value is Visibility => value === "authenticated" || value === "friends" || value === "private";
const text = (value: unknown): value is string => typeof value === "string";
const nonempty = (value: unknown): value is string => text(value) && value.length > 0;
const nullableText = (value: unknown): value is string | null => value === null || text(value);
const nullableUuid = (value: unknown): value is string | null => value === null || isUuid(value);
const requireShape = (condition: unknown): void => { if (!condition) throw new Error("INVALID_PROFILE_READ"); };
export function cloneJson(value: unknown, depth = 0): JsonValue {
  if (depth > 32) throw new Error("INVALID_PROFILE_VALUE");
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((part) => cloneJson(part, depth + 1));
  if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, part]) => [key, cloneJson(part, depth + 1)]));
  throw new Error("INVALID_PROFILE_VALUE");
}
export function scopeMatches(value: { scope: string; space_id: number | null }, requested: ProfileScope): boolean { return requested.kind === "global" ? value.scope === "global" && value.space_id === null : isPositiveId(requested.space_id) && value.scope === "space:" + requested.space_id && value.space_id === requested.space_id; }
function scope(value: Record<string, unknown>) {
  requireShape(value.space_id === null ? value.scope === "global" : isPositiveId(value.space_id) && value.scope === "space:" + value.space_id);
  return { scope: value.scope as string, space_id: value.space_id as number | null };
}
export function parseFieldDefinition(value: unknown): FieldDefinition {
  if (!object(value) || !nonempty(value.key) || !nonempty(value.label) || value.scope !== "global" && value.scope !== "event" || value.kind !== "profile" || !isVersion(value.schema_version) || !object(value.value_schema) || value.cardinality !== "one" && value.cardinality !== "many" || !isPositiveId(value.max_items) || !Array.isArray(value.visibility_choices) || !value.visibility_choices.every(isVisibility) || !isVisibility(value.default_visibility) || !value.visibility_choices.includes(value.default_visibility) || !isVersion(value.display_order) || typeof value.editable !== "boolean") throw new Error("INVALID_FIELD_DEFINITION");
  return { key: value.key, label: value.label, scope: value.scope as "global" | "event", schema_version: value.schema_version, value_schema: cloneJson(value.value_schema), cardinality: value.cardinality as "one" | "many", max_items: value.max_items, visibility_choices: [...value.visibility_choices] as Visibility[], default_visibility: value.default_visibility, display_order: value.display_order, editable: value.editable };
}
export function parseAttribute(value: unknown): ProfileAttribute {
  if (!object(value) || !isUuid(value.attribute_id) || !nonempty(value.key) || !("value" in value) || !isVisibility(value.visibility) || value.confirmation !== "confirmed" && value.confirmation !== "pending" && value.confirmation !== "draft" || !nullableText(value.last_confirmed_at) || !nullableText(value.display_label) || !isVersion(value.sort_order) || !isVersion(value.schema_version)) throw new Error("INVALID_ATTRIBUTE");
  return { attribute_id: value.attribute_id, key: value.key, value: cloneJson(value.value), visibility: value.visibility, confirmation: value.confirmation, last_confirmed_at: value.last_confirmed_at, display_label: value.display_label, sort_order: value.sort_order, schema_version: value.schema_version };
}
function collection<T>(value: unknown, parse: (item: unknown) => T, key: (item: T) => string): readonly T[] {
  if (!Array.isArray(value)) throw new Error("INVALID_COLLECTION"); const result = value.map(parse); requireShape(new Set(result.map(key)).size === result.length); return result;
}
function profileParts(value: Record<string, unknown>, attributeKey: string) {
  const expected = scope(value); const definitions = collection(value.field_definitions, parseFieldDefinition, (item) => item.key);
  const attributes = collection(value[attributeKey], parseAttribute, (item) => item.attribute_id); const keys = new Set(definitions.map((field) => field.key));
  requireShape(definitions.every((field) => field.scope === (expected.space_id === null ? "global" : "event")) && attributes.every((item) => keys.has(item.key)) && nonempty(value.policy_version));
  return { ...expected, attributes, field_definitions: definitions, policy_version: value.policy_version as string };
}
export function parseProfile(value: unknown): ProfileRead {
  if (!object(value) || !isVersion(value.revision) || !isVersion(value.permission_version) || !isVersion(value.schema_version)) throw new Error("INVALID_PROFILE_READ");
  return { ...profileParts(value, "attributes"), revision: value.revision, permission_version: value.permission_version, schema_version: value.schema_version };
}
function parseDraftRef(value: unknown): EditingDraftRef {
  if (!object(value) || !isUuid(value.id) || !isPositiveId(value.draft_version) || !isVersion(value.base_revision) || value.status !== "editing" && value.status !== "confirmed" && value.status !== "archived") throw new Error("INVALID_DRAFT_REFERENCE");
  return { id: value.id, draft_version: value.draft_version, base_revision: value.base_revision, status: value.status };
}
export function parseOwnerProfile(value: unknown): OwnerProfileRead {
  const profile = parseProfile(value); if (!object(value) || !("editing_draft" in value)) throw new Error("INVALID_OWNER_PROFILE");
  const editing = value.editing_draft === null ? null : parseDraftRef(value.editing_draft); requireShape(editing === null || editing.status === "editing");
  // Legacy candidates and raw operation buffers are not official profile entries.
  return { ...profile, editing_draft: editing };
}
export function parseDraft(value: unknown): ProfileDraftRead {
  if (!object(value) || !isVersion(value.current_revision) || value.draft_kind !== "profile") throw new Error("INVALID_PROFILE_DRAFT");
  const parts = profileParts(value, "preview_attributes");
  return { ...parseDraftRef(value), scope: parts.scope, space_id: parts.space_id, current_revision: value.current_revision, preview_attributes: parts.attributes, field_definitions: parts.field_definitions, policy_version: parts.policy_version };
}
export function parsePreview(value: unknown): ProfilePreviewRead {
  if (!object(value) || value.simulated !== true || value.perspective !== "owner" && value.perspective !== "authenticated" && value.perspective !== "friends" || !nullableUuid(value.draft_id) || !isVersion(value.base_revision)) throw new Error("INVALID_PROFILE_PREVIEW");
  const profile = parseProfile(value.profile), contacts = parseProfile(value.contacts);
  requireShape(profile.scope === contacts.scope && profile.space_id === contacts.space_id && profile.revision === contacts.revision && profile.attributes.every((item) => !item.key.startsWith("contact_")) && contacts.attributes.every((item) => item.key.startsWith("contact_")));
  return { profile, contacts, perspective: value.perspective, simulated: true, draft_id: value.draft_id, base_revision: value.base_revision };
}
const kinds: readonly SourceKind[] = ["github", "resume", "web", "text"];
export function parseSources(value: unknown): readonly SourceSummary[] {
  if (!object(value)) throw new Error("INVALID_SOURCE_LIST");
  return collection(value.sources, (item): SourceSummary => {
    if (!object(item) || !isUuid(item.id) || !kinds.includes(item.kind as SourceKind) || !isPositiveId(item.version) || item.status !== "running" && item.status !== "ready" && item.status !== "failed" || !text(item.label) || !nullableUuid(item.latest_snapshot_id) || !nullableUuid(item.last_job_id) || !nonempty(item.created_at) || !nonempty(item.updated_at) || item.snapshot !== null || item.generation_mode !== "rules" || item.llm_calls !== 0) throw new Error("INVALID_SOURCE_SUMMARY");
    return { id: item.id, kind: item.kind as SourceKind, version: item.version, status: item.status, label: item.label, latest_snapshot_id: item.latest_snapshot_id, last_job_id: item.last_job_id, created_at: item.created_at, updated_at: item.updated_at };
  }, (item) => item.id);
}
export function parseSourceCapabilities(value: unknown): SourceCapabilities {
  if (!object(value) || !object(value.readers) || value.generation_mode !== "rules" || value.llm_calls !== 0) throw new Error("INVALID_SOURCE_CAPABILITIES");
  const readers = value.readers;
  const entries = kinds.map((kind) => { const row = readers[kind]; if (!object(row) || row.kind !== kind || typeof row.enabled !== "boolean" || typeof row.available !== "boolean" || typeof row.imported_before !== "boolean" || !nullableText(row.reason) || !row.enabled && row.available) throw new Error("INVALID_SOURCE_READER"); return [kind, { kind, enabled: row.enabled, available: row.available, imported_before: row.imported_before, reason: row.reason }]; });
  return { readers: Object.fromEntries(entries) as SourceCapabilities["readers"], generation_mode: "rules", llm_calls: 0 };
}

export type LegacySessionProgress = Readonly<{ schema_version: 1; session_id: string; session_version: number; scope_key: string; space_id: number | null; stage: "materials" | "review" | "questions" | "draft" | "privacy" | "completed"; stage_index: number; stage_count: 5; state: string; phase: string; label_code: string; updated_at: string; revision_token: string; poll_after_ms: number; percent: null; next_actions: readonly string[]; questions: Readonly<{ total: number; answered: number; skipped: number; remaining: number; current_index: number | null }>; reasons: readonly string[]; tasks_has_more: boolean }>;
export function parseLegacySessionProgress(value: unknown): LegacySessionProgress {
  const stages = ["materials", "review", "questions", "draft", "privacy", "completed"];
  if (!object(value) || value.schema_version !== 1 || !isUuid(value.session_id) || !isPositiveId(value.session_version) || !text(value.stage) || !stages.includes(value.stage) || value.stage_count !== 5 || !isPositiveId(value.stage_index) || value.stage_index > 5 || value.percent !== null || !isVersion(value.poll_after_ms) || !nonempty(value.state) || !nonempty(value.phase) || !nonempty(value.label_code) || !nonempty(value.updated_at) || !text(value.revision_token) || !/^[a-f0-9]{64}$/.test(value.revision_token) || !Array.isArray(value.next_actions) || !value.next_actions.every(text) || !Array.isArray(value.reasons) || !value.reasons.every(text) || typeof value.tasks_has_more !== "boolean" || !object(value.questions)) throw new Error("INVALID_SESSION_PROGRESS");
  const location = scope({ scope: value.scope_key, space_id: value.space_id }); const q = value.questions;
  if (!isVersion(q.total) || !isVersion(q.answered) || !isVersion(q.skipped) || !isVersion(q.remaining) || q.total !== q.answered + q.skipped + q.remaining || !(q.total === 0 ? q.current_index === null : isVersion(q.current_index) && q.current_index < q.total)) throw new Error("INVALID_QUESTION_COUNTS");
  requireShape(value.stage === "completed" ? value.stage_index === 5 : value.stage_index === stages.indexOf(value.stage) + 1);
  return { schema_version: 1, session_id: value.session_id, session_version: value.session_version, scope_key: location.scope, space_id: location.space_id, stage: value.stage as LegacySessionProgress["stage"], stage_index: value.stage_index, stage_count: 5, state: value.state, phase: value.phase, label_code: value.label_code, updated_at: value.updated_at, revision_token: value.revision_token, poll_after_ms: value.poll_after_ms, percent: null, next_actions: [...value.next_actions] as string[], questions: { total: q.total, answered: q.answered, skipped: q.skipped, remaining: q.remaining, current_index: q.current_index as number | null }, reasons: [...value.reasons] as string[], tasks_has_more: value.tasks_has_more };
}
