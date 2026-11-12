import type { CurrentEvent, DiscoveryAttribute, DiscoveryPage, DiscoveryPerson, DiscoveryScope, Invalidation, JsonValue, ReadFailure } from './contracts';

export class ContractError extends Error {
  constructor(message = 'The response does not match the ordinary discovery contract.') { super(message); this.name = 'ContractError'; }
}

export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ContractError();
  return value as Record<string, unknown>;
}
export function string(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new ContractError();
  return value;
}
export function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new ContractError();
  return value;
}
export function positiveId(value: unknown): number { return integer(value, 1, 2147483647); }
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') throw new ContractError(); return value; }
function array(value: unknown): unknown[] { if (!Array.isArray(value)) throw new ContractError(); return value; }
function nullableString(value: unknown): string | null { return value === null ? null : string(value); }
function timestamp(value: unknown): string {
  const text = string(value);
  // Preserve original timezone and precision; this is display data, not a time-match engine.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(text) || !Number.isFinite(Date.parse(text))) throw new ContractError();
  return text;
}
function json(value: unknown, depth = 0): JsonValue {
  if (depth > 24) throw new ContractError();
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(item => json(item, depth + 1));
  const input = object(value);
  return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, json(item, depth + 1)]));
}

export function decodeCurrentEvent(value: unknown): CurrentEvent {
  const input = object(value); const revision = string(input.selection_revision);
  if (!/^selection-[a-f0-9]{32}$/.test(revision)) throw new ContractError();
  return { space_id: positiveId(input.space_id), selection_revision: revision, access_version: string(input.access_version) };
}

function attribute(value: unknown): DiscoveryAttribute {
  const input = object(value);
  // An overview response (which can contain friends fields) is NOT a discovery response.
  if (input.visibility !== 'authenticated' || input.confirmation !== 'confirmed' || input.value === null) throw new ContractError();
  return { attribute_id: string(input.attribute_id), key: string(input.key), value: json(input.value),
    // P1 currently returns SQL UTC strings here; only updated_at is ISO-normalized.
    visibility: 'authenticated', confirmation: 'confirmed', last_confirmed_at: string(input.last_confirmed_at),
    schema_version: integer(input.schema_version, 1) };
}
function scope(value: unknown): DiscoveryScope {
  const input = object(value); const attributes = array(input.attributes).map(attribute);
  if (new Set(attributes.map(item => item.attribute_id)).size !== attributes.length) throw new ContractError();
  return { revision: integer(input.revision), permission_version: integer(input.permission_version), attributes };
}
export function decodePerson(value: unknown): DiscoveryPerson {
  const input = object(value); const relation = object(input.relationship); const state = relation.state;
  if (state !== 'none' && state !== 'friend' && state !== 'pending_out' && state !== 'pending_in') throw new ContractError();
  const friend = boolean(relation.friend); const outgoing = boolean(relation.pending_out); const incoming = boolean(relation.pending_in);
  if (friend !== (state === 'friend') || outgoing !== (state === 'pending_out') || incoming !== (state === 'pending_in')) throw new ContractError();
  const global = scope(input.global); const space = scope(input.space);
  const ids = [...global.attributes, ...space.attributes].map(item => item.attribute_id);
  if (new Set(ids).size !== ids.length) throw new ContractError();
  return { owner_id: positiveId(input.owner_id), space_id: positiveId(input.space_id), display_name: string(input.display_name),
    identity_version: integer(input.identity_version, 1), avatar_ref: nullableString(input.avatar_ref), global, space, updated_at: timestamp(input.updated_at),
    relationship: { state, friend, pending_out: outgoing, pending_in: incoming, version: string(relation.version) },
    discovery_version: integer(input.discovery_version), privacy_policy_version: string(input.privacy_policy_version) };
}
export function decodePage(value: unknown): DiscoveryPage {
  const input = object(value); const sort = input.sort;
  if (input.target_type !== 'person' || (sort !== 'recent' && sort !== 'relevance')) throw new ContractError();
  const spaceId = positiveId(input.space_id); const items = array(input.items).map(decodePerson); const limit = integer(input.limit, 1, 48);
  const hasMore = boolean(input.has_more); const exhausted = boolean(input.exhausted); const cursor = nullableString(input.next_cursor);
  if (hasMore === exhausted || hasMore !== (cursor !== null) || items.length > limit || (hasMore && items.length === 0)
    || items.some(item => item.space_id !== spaceId) || new Set(items.map(item => item.owner_id)).size !== items.length) throw new ContractError();
  return { space_id: spaceId, target_type: 'person', sort, items, next_cursor: cursor, has_more: hasMore, exhausted, limit };
}

export function invalidationFor(status: number | null, code: string): Invalidation {
  if (status === 401) return 'session';
  if (status === 403 || ['CURRENT_EVENT_REQUIRED', 'CURRENT_EVENT_MISMATCH', 'CONTEXT_CHANGED'].includes(code)) return 'activity';
  if (status === 409 || status === 410 || code === 'DISCOVERY_PERSON_NOT_FOUND') return 'list';
  return 'none';
}
export function failure(kind: ReadFailure['kind'], status: number | null, code: string, message: string, requestId: string | null = null, retryable = false): ReadFailure {
  return { kind, status, code, message, requestId, retryable, invalidation: invalidationFor(status, code) };
}
export function contextMatches(a: CurrentEvent, b: CurrentEvent): boolean {
  return a.space_id === b.space_id && a.selection_revision === b.selection_revision && a.access_version === b.access_version;
}
