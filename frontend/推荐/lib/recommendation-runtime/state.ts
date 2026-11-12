import type { CurrentEvent, DiscoveryPage, DiscoveryPerson, DiscoveryQuery, PreparedDiscoveryQuery, ReadFailure, ReadResult } from './contracts';
import { contextMatches, decodeCurrentEvent, decodePage, decodePerson, failure } from './decode';
import { prepareQuery } from './query';

/**
 * Pure local state transitions, without React, timers, storage or effects.
 * Tickets are local request identities, not server grants. Keep the actual ticket
 * object until completion; never reconstruct it from a URL or browser storage.
 */
export interface ContextTicket { readonly kind: 'current-event'; readonly epoch: number; readonly sequence: number }
interface ScopedTicket { readonly epoch: number; readonly sequence: number; readonly context: CurrentEvent }
export interface PageTicket extends ScopedTicket { readonly kind: 'page'; readonly query: PreparedDiscoveryQuery; readonly append: boolean }
export interface PersonTicket extends ScopedTicket { readonly kind: 'person'; readonly ownerId: number }

interface ListState {
  readonly status: 'idle' | 'loading' | 'ready' | 'empty' | 'loading-more' | 'error';
  readonly items: readonly DiscoveryPerson[];
  readonly query: PreparedDiscoveryQuery | null;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  /** null means no successful list response, not an empty/exhausted result. */
  readonly exhausted: boolean | null;
  readonly error: ReadFailure | null;
  readonly request: PageTicket | null;
}
interface DetailState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly ownerId: number | null;
  readonly person: DiscoveryPerson | null;
  readonly error: ReadFailure | null;
  readonly request: PersonTicket | null;
}
export interface DiscoveryState {
  readonly epoch: number;
  readonly nextSequence: number;
  readonly context: CurrentEvent | null;
  readonly contextStatus: 'idle' | 'loading' | 'ready' | 'error';
  readonly contextError: ReadFailure | null;
  readonly contextRequest: ContextTicket | null;
  readonly list: ListState;
  readonly detail: DetailState;
}
export interface Started<T> { readonly state: DiscoveryState; readonly ticket: T | null }

const emptyList = (): ListState => ({ status: 'idle', items: [], query: null, nextCursor: null, hasMore: false, exhausted: null, error: null, request: null });
const emptyDetail = (): DetailState => ({ status: 'idle', ownerId: null, person: null, error: null, request: null });
export function initialDiscoveryState(): DiscoveryState {
  return { epoch: 0, nextSequence: 1, context: null, contextStatus: 'idle', contextError: null, contextRequest: null, list: emptyList(), detail: emptyDetail() };
}

/** Call immediately when the host changes activity or learns of lost access. */
export function invalidateContext(state: DiscoveryState, error: ReadFailure | null = null): DiscoveryState {
  return { ...state, epoch: state.epoch + 1, context: null, contextStatus: error ? 'error' : 'idle', contextError: error,
    contextRequest: null, list: emptyList(), detail: emptyDetail() };
}
export function beginCurrentEventRead(state: DiscoveryState): { readonly state: DiscoveryState; readonly ticket: ContextTicket } {
  // Starting an authority refresh removes old data until that read succeeds.
  const cleared = invalidateContext(state);
  const ticket: ContextTicket = { kind: 'current-event', epoch: cleared.epoch, sequence: cleared.nextSequence };
  return { ticket, state: { ...cleared, nextSequence: cleared.nextSequence + 1, contextStatus: 'loading', contextRequest: ticket } };
}
export function completeCurrentEventRead(state: DiscoveryState, ticket: ContextTicket, result: ReadResult<CurrentEvent>): DiscoveryState {
  if (state.contextRequest !== ticket || ticket.epoch !== state.epoch) return state;
  if (!result.ok) return invalidateContext(state, result.error);
  try {
    return { ...state, context: decodeCurrentEvent(result.data), contextStatus: 'ready', contextError: null, contextRequest: null };
  } catch { return invalidateContext(state, invalidResponse()); }
}
function scoped(state: DiscoveryState, ticket: ScopedTicket): boolean {
  return state.context !== null && ticket.epoch === state.epoch && contextMatches(state.context, ticket.context);
}
function invalidResponse(): ReadFailure { return failure('invalid-response', null, 'INVALID_RESPONSE', 'The discovery result does not match the active read.'); }
function changed(): ReadFailure { return failure('http', 409, 'DISCOVERY_CHANGED', 'The visible profile or list changed. Reload the list.'); }
function listError(state: DiscoveryState, error: ReadFailure, retainItems = false): DiscoveryState {
  if (error.invalidation === 'session' || error.invalidation === 'activity') return invalidateContext(state, error);
  const list = retainItems && error.invalidation === 'none' ? state.list : { ...emptyList(), query: state.list.query };
  return { ...state, list: { ...list, status: 'error', error, request: null }, detail: emptyDetail() };
}

export function beginDiscoveryRead(state: DiscoveryState, query: DiscoveryQuery = {}): Started<PageTicket> {
  if (state.contextStatus !== 'ready' || state.context === null) return { state, ticket: null };
  let prepared: PreparedDiscoveryQuery;
  try { prepared = prepareQuery(query); }
  catch { return { state: listError(state, failure('invalid-request', null, 'INVALID_REQUEST', 'Unsupported discovery query.')), ticket: null }; }
  // New filters always start at the first page. Only beginNextPageRead consumes cursors.
  if (prepared.cursor !== null) return { state: listError(state, failure('invalid-request', null, 'INVALID_REQUEST', 'Start a new list without a cursor.')), ticket: null };
  const ticket: PageTicket = { kind: 'page', epoch: state.epoch, sequence: state.nextSequence, context: { ...state.context }, query: prepared, append: false };
  return { ticket, state: { ...state, nextSequence: state.nextSequence + 1, list: { ...emptyList(), status: 'loading', query: prepared, request: ticket }, detail: emptyDetail() } };
}
export function beginNextPageRead(state: DiscoveryState): Started<PageTicket> {
  const list = state.list;
  if (state.contextStatus !== 'ready' || state.context === null || list.request !== null || !list.hasMore || list.nextCursor === null || list.query === null) return { state, ticket: null };
  const ticket: PageTicket = { kind: 'page', epoch: state.epoch, sequence: state.nextSequence, context: { ...state.context },
    query: { ...list.query, cursor: list.nextCursor }, append: true };
  return { ticket, state: { ...state, nextSequence: state.nextSequence + 1, list: { ...list, status: 'loading-more', request: ticket, error: null } } };
}
export function completeDiscoveryRead(state: DiscoveryState, ticket: PageTicket, result: ReadResult<DiscoveryPage>): DiscoveryState {
  if (!scoped(state, ticket)) return state;
  // A superseded request cannot publish data, but a same-context authorization
  // or collection invalidation still applies to already displayed people.
  // Conservatively reload even for an old-query cursor conflict; no silent retry.
  if (!result.ok && result.error.invalidation !== 'none') return listError(state, result.error);
  if (state.list.request !== ticket) return state;
  if (!result.ok) return listError(state, result.error, ticket.append);
  let page: DiscoveryPage;
  try {
    page = decodePage(result.data);
    if (page.space_id !== ticket.context.space_id || page.sort !== ticket.query.sort || page.limit !== ticket.query.limit) throw new Error();
  } catch { return listError(state, invalidResponse()); }
  const previous = ticket.append ? state.list.items : []; const ids = new Set(previous.map(item => item.owner_id));
  if (page.items.some(item => ids.has(item.owner_id)) || (ticket.query.cursor !== null && page.next_cursor === ticket.query.cursor)) return listError(state, changed());
  const items = [...previous, ...page.items];
  return { ...state, list: { status: items.length === 0 ? 'empty' : 'ready', items, query: { ...ticket.query, cursor: null },
    nextCursor: page.next_cursor, hasMore: page.has_more, exhausted: page.exhausted, error: null, request: null } };
}

export function beginPersonRead(state: DiscoveryState, ownerId: number): Started<PersonTicket> {
  // This local guard is only a legal UI entry, never a replacement for server authorization.
  if (state.contextStatus !== 'ready' || state.context === null || !state.list.items.some(item => item.owner_id === ownerId)) return { state, ticket: null };
  const ticket: PersonTicket = { kind: 'person', epoch: state.epoch, sequence: state.nextSequence, context: { ...state.context }, ownerId };
  return { ticket, state: { ...state, nextSequence: state.nextSequence + 1, detail: { ...emptyDetail(), status: 'loading', ownerId, request: ticket } } };
}
function projectionVersion(person: DiscoveryPerson): string {
  const attributeSchemas = (scope: DiscoveryPerson['global']) => scope.attributes.map(item => [item.attribute_id, item.key, item.schema_version]).sort();
  return JSON.stringify([person.identity_version, person.discovery_version, person.privacy_policy_version, person.relationship.version,
    person.global.revision, person.global.permission_version, person.space.revision, person.space.permission_version,
    attributeSchemas(person.global), attributeSchemas(person.space)]);
}
export function completePersonRead(state: DiscoveryState, ticket: PersonTicket, result: ReadResult<DiscoveryPerson>): DiscoveryState {
  if (!scoped(state, ticket)) return state;
  // Moving focus from A to B does not make an A revocation irrelevant: A may
  // remain in the list. Use the normal decoded ReadFailure classification and
  // clear the same-context projection before applying the late-success guard.
  if (!result.ok && result.error.invalidation !== 'none') return listError(state, result.error);
  if (state.detail.request !== ticket) return state;
  if (!result.ok) {
    return { ...state, detail: { ...emptyDetail(), status: 'error', ownerId: ticket.ownerId, error: result.error } };
  }
  let person: DiscoveryPerson;
  try {
    person = decodePerson(result.data);
    if (person.owner_id !== ticket.ownerId || person.space_id !== ticket.context.space_id) throw new Error();
  } catch { return { ...state, detail: { ...emptyDetail(), status: 'error', ownerId: ticket.ownerId, error: invalidResponse() } }; }
  const card = state.list.items.find(item => item.owner_id === ticket.ownerId);
  // The existing cursor is bound to a profile/permission snapshot. A newer detail
  // must not be mixed into that list; re-read it instead of inventing a fresh cursor.
  if (!card || projectionVersion(card) !== projectionVersion(person)) return listError(state, changed());
  return { ...state, detail: { status: 'ready', ownerId: ticket.ownerId, person, error: null, request: null } };
}
export function closePerson(state: DiscoveryState): DiscoveryState { return { ...state, detail: emptyDetail() }; }
