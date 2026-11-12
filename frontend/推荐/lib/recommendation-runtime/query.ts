import type { DiscoveryFilters, DiscoveryQuery, PreparedDiscoveryQuery } from './contracts';
import { ContractError, integer, object, string } from './decode';

const codeKeys = ['direction', 'role', 'skill', 'interest', 'event_role'] as const;
function onlyKeys(input: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new ContractError('Unsupported discovery query field.');
}
function codes(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) throw new ContractError('Use 1–30 code values.');
  return value.map(item => {
    const code = string(item);
    if ([...code].length > 64 || !code.trim() || /[\u0000-\u001f\u007f]/.test(code)) throw new ContractError('Invalid discovery code.');
    return code;
  });
}

/** Validate wire shape only. Filtering, matching and value meanings remain server-owned. */
export function prepareQuery(query: DiscoveryQuery = {}): PreparedDiscoveryQuery {
  const input = object(query); onlyKeys(input, ['sort', 'limit', 'filters', 'cursor']);
  const sort = input.sort === undefined ? 'recent' : input.sort; if (sort !== 'recent' && sort !== 'relevance') throw new ContractError('Unsupported discovery sort.');
  const limit = integer(input.limit === undefined ? 24 : input.limit, 1, 48); const cursor = input.cursor === undefined || input.cursor === null ? null : string(input.cursor);
  if (cursor !== null && cursor.length > 4096) throw new ContractError('Invalid discovery cursor.');
  const raw = object(input.filters === undefined ? {} : input.filters); onlyKeys(raw, [...codeKeys, 'event_seeking', 'event_availability']);
  const filters: Record<string, unknown> = {};
  for (const key of codeKeys) if (raw[key] !== undefined) filters[key] = codes(raw[key]);
  if (raw.event_seeking !== undefined) {
    const seeking = object(raw.event_seeking); onlyKeys(seeking, ['role_codes', 'skill_codes']);
    if (Object.keys(seeking).length === 0) throw new ContractError('Seeking requires code arrays.');
    filters.event_seeking = Object.fromEntries(Object.entries(seeking).map(([key, value]) => [key, codes(value)]));
  }
  if (raw.event_availability !== undefined) {
    if (!Array.isArray(raw.event_availability) || raw.event_availability.length < 1 || raw.event_availability.length > 20) throw new ContractError('Use 1–20 availability windows.');
    filters.event_availability = raw.event_availability.map(value => {
      const window = object(value); onlyKeys(window, ['starts_at', 'ends_at']);
      // Do not convert time zones or implement overlap rules in the browser.
      return { starts_at: string(window.starts_at), ends_at: string(window.ends_at) };
    });
  }
  return { sort, limit, cursor, filters: filters as DiscoveryFilters };
}

export function discoverySearch(query: PreparedDiscoveryQuery): string {
  const params = new URLSearchParams({ target_type: 'person', sort: query.sort, limit: String(query.limit), filters: JSON.stringify(query.filters) });
  if (query.cursor !== null) params.set('cursor', query.cursor);
  return params.toString();
}
