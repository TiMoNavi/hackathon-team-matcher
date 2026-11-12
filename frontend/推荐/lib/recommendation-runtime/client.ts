import type { CurrentEvent, DiscoveryPage, DiscoveryPerson, GetTransport, OrdinaryDiscoveryReads, ReadResult } from './contracts';
import { contextMatches, decodeCurrentEvent, decodePage, decodePerson, failure, object, positiveId, string } from './decode';
import { discoverySearch, prepareQuery } from './query';

/**
 * Fixed same-origin read routes. No fetch default, cookies, storage, AI, mutations,
 * overview-to-model bridge, retry loop or public capability contract is introduced.
 */
export function createOrdinaryDiscoveryReads(transport: GetTransport): OrdinaryDiscoveryReads {
  async function get<T>(url: string, decode: (value: unknown) => T): Promise<ReadResult<T>> {
    let response;
    try { response = await transport({ method: 'GET', url, credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } }); }
    catch { return { ok: false, error: failure('network', null, 'NETWORK_ERROR', 'The read could not be completed. Its outcome is unknown.') }; }
    const status = response?.status;
    let requestId: string | null = null;
    try {
      if (!Number.isInteger(status) || status < 100 || status > 599
        || typeof response.contentType !== 'string' || !/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/i.test(response.contentType.trim())
        || typeof response.body !== 'string') throw new Error();
      const envelope = object(JSON.parse(response.body)); requestId = string(object(envelope.meta).request_id);
      if (status < 200 || status >= 300) {
        if ('data' in envelope) throw new Error();
        const error = object(envelope.error); const code = string(error.code); const message = string(error.message);
        if (typeof error.retryable !== 'boolean' || error.details === null || typeof error.details !== 'object'
          || (Array.isArray(error.details) && error.details.length !== 0)) throw new Error();
        // The public error message/code is retained; arbitrary nested details are not copied.
        return { ok: false, error: failure('http', status, code, message, requestId, error.retryable) };
      }
      if (status !== 200 || 'error' in envelope || !('data' in envelope)) throw new Error();
      return { ok: true, data: decode(envelope.data), requestId };
    } catch {
      return { ok: false, error: failure('invalid-response', Number.isInteger(status) ? status : null, 'INVALID_RESPONSE', 'The server did not return a valid discovery response.', requestId) };
    }
  }
  const readCurrentEvent = () => get('/api/v1/me/current-event', decodeCurrentEvent);
  async function checkedRead<T>(context: CurrentEvent, url: string, decode: (value: unknown) => T): Promise<ReadResult<T>> {
    const result = await get(url, decode);
    if (!result.ok) return result;
    // Existing person/page responses do not echo the selection/access versions.
    // Re-read the authority before publishing, including same-Space A→B→A changes.
    const current = await readCurrentEvent();
    if (!current.ok) return current;
    if (!contextMatches(context, current.data)) return { ok: false, error: failure('http', 409, 'CONTEXT_CHANGED', 'The current activity selection changed. Reload the current activity.', current.requestId) };
    return result;
  }
  function invalidRequest<T>(): ReadResult<T> {
    return { ok: false, error: failure('invalid-request', null, 'INVALID_REQUEST', 'Use the current activity and supported ordinary discovery GET parameters.') };
  }
  return {
    readCurrentEvent,
    async readPage(context, query = {}): Promise<ReadResult<DiscoveryPage>> {
      let current; let prepared;
      try { current = decodeCurrentEvent(context); prepared = prepareQuery(query); } catch { return invalidRequest(); }
      return checkedRead(current, `/api/v1/events/${current.space_id}/discovery?${discoverySearch(prepared)}`, value => {
        const page = decodePage(value);
        if (page.space_id !== current.space_id || page.limit !== prepared.limit || page.sort !== prepared.sort) throw new Error();
        return page;
      });
    },
    async readPerson(context, ownerId): Promise<ReadResult<DiscoveryPerson>> {
      let current; let owner;
      try { current = decodeCurrentEvent(context); owner = positiveId(ownerId); } catch { return invalidRequest(); }
      return checkedRead(current, `/api/v1/events/${current.space_id}/discovery/people/${owner}`, value => {
        const person = decodePerson(value);
        if (person.space_id !== current.space_id || person.owner_id !== owner) throw new Error();
        return person;
      });
    },
  };
}
