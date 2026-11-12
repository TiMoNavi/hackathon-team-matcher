// Offline preparation-layer checks. This does not mount a page, contact a backend,
// use a real session, read credentials, call a model or claim RP1/N11 acceptance.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sources = join(project, 'lib/recommendation-runtime');
const output = mkdtempSync(join(tmpdir(), 'matcher-recommendation-runtime-'));
let passed = 0;
try {
  const compiled = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), ...readdirSync(sources).filter(file => file.endsWith('.ts')).map(file => join(sources, file)),
    '--outDir', output, '--target', 'ES2020', '--module', 'commonjs', '--moduleResolution', 'node', '--lib', 'ES2020,DOM',
    '--strict', '--skipLibCheck', '--esModuleInterop', '--incremental', 'false', '--noEmit', 'false'], { cwd: project, encoding: 'utf8' });
  assert.equal(compiled.status, 0, `${compiled.stdout || ''}${compiled.stderr || ''}`);
  const decode = require(join(output, 'decode.js'));
  const { createOrdinaryDiscoveryReads } = require(join(output, 'client.js'));
  const { prepareQuery, discoverySearch } = require(join(output, 'query.js'));
  const state = require(join(output, 'state.js'));

  // Shape follows NativeOrdinaryDiscoverySource + P8 DiscoveryBatchService.
  const context = (space = 17, revision = 'a', access = 'access-test-1') => ({ space_id: space, selection_revision: `selection-${revision.repeat(32)}`, access_version: access });
  const person = (id = 11, space = 17) => ({
    owner_id: id, space_id: space, display_name: `虚构参与者 ${id}`, identity_version: 1, avatar_ref: null,
    global: { revision: 2, permission_version: 1, attributes: [
      { attribute_id: `${id}-headline`, key: 'headline', value: '虚构资料：希望合作做活动工具', visibility: 'authenticated', confirmation: 'confirmed', last_confirmed_at: '2026-11-12 00:00:00', schema_version: 2 },
      { attribute_id: `${id}-skill`, key: 'skill', value: { code: 'php', label: 'PHP' }, visibility: 'authenticated', confirmation: 'confirmed', last_confirmed_at: '2026-11-12 00:00:00', schema_version: 2 },
    ] },
    space: { revision: 1, permission_version: 1, attributes: [] },
    updated_at: '2026-11-12T00:00:00.000000Z',
    relationship: { state: 'none', friend: false, pending_out: false, pending_in: false, version: 'native-relationship:test' },
    discovery_version: 1, privacy_policy_version: 'discovery-fields-v2',
  });
  const page = (ids, { cursor = null, space = 17, sort = 'recent', limit = 24 } = {}) => ({
    space_id: space, target_type: 'person', sort, items: ids.map(id => person(id, space)), next_cursor: cursor, has_more: cursor !== null, exhausted: cursor === null, limit,
  });
  const success = data => ({ ok: true, data, requestId: 'runtime-test' });
  const failed = (status, code) => ({ ok: false, error: decode.failure('http', status, code, 'Synthetic failure', 'runtime-test') });
  const jsonResponse = (data, status = 200) => ({ status, contentType: 'application/json; charset=UTF-8', body: JSON.stringify({ data, meta: { request_id: 'runtime-test' } }) });
  const errorResponse = (status, code, details = []) => ({ status, contentType: 'application/json', body: JSON.stringify({ error: { code, message: 'Synthetic failure', retryable: status >= 500, details }, meta: { request_id: 'runtime-test' } }) });
  const queued = responses => {
    const requests = [];
    const transport = async request => {
      requests.push(request);
      assert.ok(responses.length > 0, `Unexpected request: ${request.url}`);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    };
    return { requests, client: createOrdinaryDiscoveryReads(transport) };
  };
  const ready = () => {
    const started = state.beginCurrentEventRead(state.initialDiscoveryState());
    return state.completeCurrentEventRead(started.state, started.ticket, success(context()));
  };
  const listed = (ids = [11, 12], options) => {
    const started = state.beginDiscoveryRead(ready());
    return state.completeDiscoveryRead(started.state, started.ticket, success(page(ids, options)));
  };
  async function check(name, run) { await test(name, async () => { await run(); passed++; }); }

  await check('Actual discovery projection keeps SQL confirmation time and opaque nullable avatar', () => {
    const actual = decode.decodePerson(person());
    assert.equal(actual.global.attributes[0].last_confirmed_at, '2026-11-12 00:00:00');
    assert.equal(actual.avatar_ref, null);
    assert.equal(actual.global.attributes[1].value.code, 'php');
    assert.equal('english' in actual, false);
    assert.equal('chapters' in actual, false);
  });
  await check('Optional missing profile content stays empty without synthetic cards', () => {
    const sparse = person(); sparse.global.attributes = [];
    assert.deepEqual(decode.decodePerson(sparse).global.attributes, []);
  });
  await check('Narrow projection discards unrecognized source and storage metadata', () => {
    const source = person(); source.raw_source = 'must-not-propagate'; source.global.attributes[0].provenance = 'must-not-propagate';
    const actual = decode.decodePerson(source);
    assert.equal(JSON.stringify(actual).includes('must-not-propagate'), false);
    assert.equal(source.raw_source, 'must-not-propagate');
  });
  for (const visibility of ['private', 'friends']) await check(`Reject ${visibility} attributes rather than adapting an overview as discovery`, () => {
    const source = person(); source.global.attributes[0].visibility = visibility;
    assert.throws(() => decode.decodePerson(source), decode.ContractError);
  });
  await check('Reject unconfirmed and null profile values', () => {
    const source = person(); source.global.attributes[0].confirmation = 'pending';
    assert.throws(() => decode.decodePerson(source));
    source.global.attributes[0].confirmation = 'confirmed'; source.global.attributes[0].value = null;
    assert.throws(() => decode.decodePerson(source));
  });
  await check('Reject overview-only DTO and inconsistent relationship flags', () => {
    const source = person(); delete source.display_name;
    assert.throws(() => decode.decodePerson(source));
    const other = person(); other.relationship.friend = true;
    assert.throws(() => decode.decodePerson(other));
  });
  await check('Reject duplicate attribute IDs and numeric IDs encoded as strings', () => {
    const source = person(); source.space.attributes = [source.global.attributes[0]];
    assert.throws(() => decode.decodePerson(source));
    assert.throws(() => decode.decodePerson({ ...person(), owner_id: '11' }));
  });
  for (const count of [0, 1, 2, 24, 48]) await check(`Decode ${count} real results without an AI five-person cap`, () => {
    assert.equal(decode.decodePage(page(Array.from({ length: count }, (_, i) => i + 11), { limit: 48 })).items.length, count);
  });
  await check('Reject cross-activity cards, duplicate people and impossible pagination', () => {
    const cross = page([11]); cross.items[0].space_id = 18;
    assert.throws(() => decode.decodePage(cross));
    assert.throws(() => decode.decodePage(page([11, 11])));
    assert.throws(() => decode.decodePage({ ...page([11]), has_more: true }));
    assert.throws(() => decode.decodePage(page([], { cursor: 'opaque' })));
  });
  await check('Current-event decoder requires real selection revision form', () => {
    assert.deepEqual(decode.decodeCurrentEvent(context()), context());
    assert.throws(() => decode.decodeCurrentEvent({ ...context(), selection_revision: 'v1' }));
    assert.equal(decode.contextMatches(context(), context(17, 'b')), false);
    assert.equal(decode.contextMatches(context(), context(17, 'a', 'new-access')), false);
  });
  await check('Query encodes approved filter objects and opaque cursor in URLSearchParams', () => {
    const query = prepareQuery({ sort: 'relevance', limit: 48, cursor: 'opaque+/=?&', filters: { skill: ['TypeScript', 'PHP'], event_seeking: { role_codes: ['design'] }, event_availability: [{ starts_at: '2026-11-14T09:00:00+08:00', ends_at: '2026-11-14T12:00:00+08:00' }] } });
    const params = new URLSearchParams(discoverySearch(query));
    assert.equal(params.get('cursor'), 'opaque+/=?&');
    assert.deepEqual(JSON.parse(params.get('filters')), query.filters);
    assert.equal(params.get('target_type'), 'person');
    assert.equal(query.filters.skill[0], 'TypeScript');
  });
  await check('Query rejects unsupported fields, nonarray codes, invalid limit and empty seeking', () => {
    for (const query of [{ actor_id: 11 }, { filters: { private: ['yes'] } }, { filters: { skill: 'php' } }, { limit: 0 }, { limit: 49 }, { filters: { event_seeking: {} } }, { sort: null }, { limit: null }, { filters: null }]) assert.throws(() => prepareQuery(query));
  });
  await check('Current-event read makes one fixed same-origin GET and no automatic action', async () => {
    const { client, requests } = queued([jsonResponse(context())]);
    assert.equal((await client.readCurrentEvent()).ok, true);
    assert.deepEqual(requests.map(r => [r.method, r.url, r.credentials, r.cache, r.redirect]), [['GET', '/api/v1/me/current-event', 'same-origin', 'no-store', 'error']]);
  });
  await check('Successful list reads cost two GETs, with authority postcheck', async () => {
    const { client, requests } = queued([jsonResponse(page([11, 12])), jsonResponse(context())]);
    const result = await client.readPage(context(), { filters: { skill: ['php'] } });
    assert.equal(result.ok, true); assert.equal(result.data.items.length, 2);
    assert.equal(requests.length, 2); assert.equal(requests[1].url, '/api/v1/me/current-event');
    const query = new URL(requests[0].url, 'https://synthetic.invalid').searchParams;
    assert.deepEqual(JSON.parse(query.get('filters')), { skill: ['php'] });
    assert.equal(query.has('selection_revision'), false);
    assert.ok(requests.every(r => r.method === 'GET' && r.url.startsWith('/api/v1/')));
  });
  await check('Successful person read is scoped and also rechecks current-event', async () => {
    const { client, requests } = queued([jsonResponse(person()), jsonResponse(context())]);
    assert.equal((await client.readPerson(context(), 11)).ok, true);
    assert.equal(requests[0].url, '/api/v1/events/17/discovery/people/11'); assert.equal(requests.length, 2);
  });
  for (const changedContext of [context(18), context(17, 'b'), context(17, 'a', 'new-access')]) await check(`Postcheck rejects context change ${changedContext.space_id}/${changedContext.selection_revision.slice(-1)}/${changedContext.access_version}`, async () => {
    const { client } = queued([jsonResponse(page([11])), jsonResponse(changedContext)]);
    const result = await client.readPage(context());
    assert.equal(result.ok, false); assert.equal(result.error.code, 'CONTEXT_CHANGED'); assert.equal(result.error.invalidation, 'activity');
  });
  await check('Revocation discovered by postcheck withholds an otherwise valid person', async () => {
    const { client } = queued([jsonResponse(person()), errorResponse(403, 'ACCESS_DENIED')]);
    const result = await client.readPerson(context(), 11);
    assert.equal(result.ok, false); assert.equal(result.error.status, 403); assert.equal('data' in result, false);
  });
  await check('Mismatched owner, activity, limit and sort are invalid responses', async () => {
    for (const data of [page([11], { space: 18 }), page([11], { limit: 48 }), page([11], { sort: 'relevance' })]) {
      const { client, requests } = queued([jsonResponse(data)]);
      assert.equal((await client.readPage(context())).error.code, 'INVALID_RESPONSE'); assert.equal(requests.length, 1);
    }
    const { client } = queued([jsonResponse(person(12))]);
    assert.equal((await client.readPerson(context(), 11)).error.code, 'INVALID_RESPONSE');
  });
  await check('Invalid local inputs make zero transport calls', async () => {
    const { client, requests } = queued([]);
    assert.equal((await client.readPage(context(), { filters: { email: ['x'] } })).error.kind, 'invalid-request');
    assert.equal((await client.readPerson(context(), -1)).error.kind, 'invalid-request');
    assert.equal(requests.length, 0);
  });
  for (const [status, code, effect] of [[401, 'AUTHENTICATION_REQUIRED', 'session'], [403, 'ACCESS_DENIED', 'activity'], [409, 'CURRENT_EVENT_REQUIRED', 'activity'], [409, 'DISCOVERY_CURSOR_INVALID', 'list'], [410, 'DISCOVERY_CURSOR_EXPIRED', 'list']]) await check(`HTTP ${status} ${code} remains an error with ${effect} invalidation`, async () => {
    const { client, requests } = queued([errorResponse(status, code)]);
    const result = await client.readPage(context());
    assert.equal(result.ok, false); assert.equal(result.error.code, code); assert.equal(result.error.invalidation, effect); assert.equal(requests.length, 1);
  });
  await check('Error details objects and empty arrays are accepted without blind retry', async () => {
    for (const details of [[], { reason: 'projection_unavailable' }]) {
      const { client, requests } = queued([errorResponse(503, 'DISCOVERY_UNAVAILABLE', details)]);
      const result = await client.readPage(context());
      assert.equal(result.error.kind, 'http'); assert.equal(result.error.retryable, true); assert.equal(requests.length, 1);
    }
  });
  await check('HTML 200 and malformed JSON are failures, never empty lists', async () => {
    for (const response of [{ status: 200, contentType: 'text/html', body: '<html>login</html>' }, { status: 200, contentType: 'application/json', body: '{' }, jsonResponse({})]) {
      const { client } = queued([response]); const result = await client.readPage(context());
      assert.equal(result.ok, false); assert.equal(result.error.kind, 'invalid-response'); assert.equal('data' in result, false);
    }
  });
  await check('Even non-JSON 401/403 clears the corresponding scope', async () => {
    for (const [status, effect] of [[401, 'session'], [403, 'activity']]) {
      const { client } = queued([{ status, contentType: 'text/html', body: '<html>unavailable</html>' }]);
      assert.equal((await client.readPage(context())).error.invalidation, effect);
    }
  });
  await check('Network errors retain unknown outcome and do not repeat a GET automatically', async () => {
    const { client, requests } = queued([new Error('synthetic disconnection')]);
    const result = await client.readPage(context());
    assert.equal(result.error.code, 'NETWORK_ERROR'); assert.equal(result.error.status, null); assert.equal(requests.length, 1);
  });
  await check('Malformed transport result is returned as an error without throwing to a component', async () => {
    const { client } = queued([null]); const result = await client.readCurrentEvent();
    assert.equal(result.ok, false); assert.equal(result.error.kind, 'invalid-response');
  });
  await check('Authority refresh removes existing cards immediately and rejects old authority response', () => {
    const initial = listed(); const snapshot = JSON.stringify(initial);
    const first = state.beginCurrentEventRead(initial);
    assert.equal(first.state.list.items.length, 0); assert.equal(first.state.context, null);
    const second = state.beginCurrentEventRead(first.state);
    assert.equal(state.completeCurrentEventRead(second.state, first.ticket, success(context())), second.state);
    assert.equal(JSON.stringify(initial), snapshot);
  });
  await check('No context means no page or person ticket', () => {
    const initial = state.initialDiscoveryState();
    assert.equal(state.beginDiscoveryRead(initial).ticket, null); assert.equal(state.beginPersonRead(initial, 11).ticket, null);
  });
  await check('Zero people is a successful explicit empty/exhausted state', () => {
    const current = listed([]); assert.equal(current.list.status, 'empty'); assert.equal(current.list.exhausted, true); assert.equal(current.list.error, null);
  });
  await check('One or two people stay one or two; exhausted list cannot wrap or fetch next', () => {
    for (const ids of [[11], [11, 12]]) { const current = listed(ids); assert.equal(current.list.items.length, ids.length); assert.equal(state.beginNextPageRead(current).ticket, null); }
  });
  await check('Cursor pagination appends distinct people and blocks double fetch', () => {
    const current = listed([11, 12], { cursor: 'signed-cursor' });
    const next = state.beginNextPageRead(current); assert.equal(next.ticket.query.cursor, 'signed-cursor');
    assert.equal(state.beginNextPageRead(next.state).ticket, null);
    const completed = state.completeDiscoveryRead(next.state, next.ticket, success(page([13])));
    assert.deepEqual(completed.list.items.map(p => p.owner_id), [11, 12, 13]); assert.equal(completed.list.exhausted, true);
  });
  await check('Changing filters clears cursor and old detail; older query cannot publish', () => {
    const first = state.beginDiscoveryRead(ready(), { filters: { skill: ['php'] } });
    const second = state.beginDiscoveryRead(first.state, { filters: { skill: ['typescript'] } });
    assert.equal(second.ticket.query.cursor, null); assert.equal(second.state.detail.person, null);
    assert.equal(state.completeDiscoveryRead(second.state, first.ticket, success(page([11]))), second.state);
    assert.deepEqual(state.completeDiscoveryRead(second.state, second.ticket, success(page([12]))).list.items.map(p => p.owner_id), [12]);
  });
  await check('Switching activity clears all people and rejects late page from previous epoch', () => {
    const first = state.beginDiscoveryRead(ready()); const switched = state.invalidateContext(first.state);
    assert.equal(switched.context, null); assert.equal(switched.list.items.length, 0); assert.equal(switched.detail.person, null);
    assert.equal(state.completeDiscoveryRead(switched, first.ticket, success(page([11]))), switched);
    const loading = state.beginCurrentEventRead(switched); const current = state.completeCurrentEventRead(loading.state, loading.ticket, success(context(17, 'b')));
    assert.equal(state.completeDiscoveryRead(current, first.ticket, success(page([11]))), current);
  });
  await check('List network failure is error, not empty; append preserves previously displayed rows', () => {
    const first = state.beginDiscoveryRead(ready()); const network = { ok: false, error: decode.failure('network', null, 'NETWORK_ERROR', 'Unknown outcome') };
    const errored = state.completeDiscoveryRead(first.state, first.ticket, network);
    assert.equal(errored.list.status, 'error'); assert.equal(errored.list.exhausted, null);
    const next = state.beginNextPageRead(listed([11], { cursor: 'next' }));
    const kept = state.completeDiscoveryRead(next.state, next.ticket, network);
    assert.deepEqual(kept.list.items.map(p => p.owner_id), [11]); assert.equal(kept.list.status, 'error'); assert.notEqual(state.beginNextPageRead(kept).ticket, null);
  });
  for (const [status, code] of [[401, 'AUTHENTICATION_REQUIRED'], [403, 'ACCESS_DENIED'], [409, 'CONTEXT_CHANGED']]) await check(`${code} clears existing scope even during pagination`, () => {
    const next = state.beginNextPageRead(listed([11], { cursor: 'next' }));
    const result = state.completeDiscoveryRead(next.state, next.ticket, failed(status, code));
    assert.equal(result.context, null); assert.equal(result.list.items.length, 0); assert.equal(result.contextError.code, code);
  });
  await check('Cursor invalidation drops stale rows while preserving the authority snapshot for explicit reload', () => {
    const next = state.beginNextPageRead(listed([11], { cursor: 'next' }));
    const result = state.completeDiscoveryRead(next.state, next.ticket, failed(409, 'DISCOVERY_CURSOR_INVALID'));
    assert.equal(result.list.items.length, 0); assert.equal(result.list.status, 'error'); assert.notEqual(result.context, null); assert.equal(result.list.nextCursor, null);
  });
  await check('Repeated cursors and duplicated people cannot produce infinite paging', () => {
    for (const response of [page([11]), page([12], { cursor: 'next' })]) {
      const next = state.beginNextPageRead(listed([11], { cursor: 'next' }));
      const result = state.completeDiscoveryRead(next.state, next.ticket, success(response));
      assert.equal(result.list.status, 'error'); assert.equal(result.list.error.code, 'DISCOVERY_CHANGED');
    }
  });
  await check('Person A response cannot replace B after focus changes', () => {
    const a = state.beginPersonRead(listed(), 11); const b = state.beginPersonRead(a.state, 12);
    assert.equal(state.completePersonRead(b.state, a.ticket, success(person(11))), b.state);
    const result = state.completePersonRead(b.state, b.ticket, success(person(12)));
    assert.equal(result.detail.ownerId, 12); assert.equal(result.detail.person.owner_id, 12);
  });
  for (const [status, code] of [[401, 'AUTHENTICATION_REQUIRED'], [403, 'ACCESS_DENIED'], [404, 'DISCOVERY_PERSON_NOT_FOUND']]) await check(`Late person A ${status} clears same-context display even after B succeeds`, async () => {
    const a = state.beginPersonRead(listed(), 11); const b = state.beginPersonRead(a.state, 12);
    const displayed = state.completePersonRead(b.state, b.ticket, success(person(12)));
    const { client } = queued([errorResponse(status, code)]);
    const result = state.completePersonRead(displayed, a.ticket, await client.readPerson(a.ticket.context, 11));
    assert.equal(result.list.items.length, 0); assert.equal(result.detail.person, null);
    if (status === 404) { assert.notEqual(result.context, null); assert.equal(result.list.error.code, code); }
    else { assert.equal(result.context, null); assert.equal(result.contextError.code, code); }
  });
  for (const [status, code] of [[401, 'AUTHENTICATION_REQUIRED'], [403, 'ACCESS_DENIED'], [409, 'DISCOVERY_CHANGED']]) await check(`Old filter page ${status} invalidates the same-context newer list`, async () => {
    const old = state.beginDiscoveryRead(ready(), { filters: { skill: ['php'] } });
    const next = state.beginDiscoveryRead(old.state, { filters: { skill: ['typescript'] } });
    const displayed = state.completeDiscoveryRead(next.state, next.ticket, success(page([12, 13])));
    const { client } = queued([errorResponse(status, code)]);
    const result = state.completeDiscoveryRead(displayed, old.ticket, await client.readPage(old.ticket.context, old.ticket.query));
    assert.equal(result.list.items.length, 0); assert.equal(result.list.nextCursor, null);
    if (status === 409) { assert.notEqual(result.context, null); assert.equal(result.list.error.code, code); }
    else { assert.equal(result.context, null); assert.equal(result.contextError.code, code); }
  });
  await check('Previous-epoch denial cannot erase a newer activity or same-activity selection', async () => {
    for (const nextContext of [context(18), context(17, 'b')]) {
      const oldPage = state.beginDiscoveryRead(ready());
      const oldLoaded = state.completeDiscoveryRead(oldPage.state, oldPage.ticket, success(page([11, 12])));
      const oldPerson = state.beginPersonRead(oldLoaded, 11);
      const selecting = state.beginCurrentEventRead(oldPerson.state);
      const selected = state.completeCurrentEventRead(selecting.state, selecting.ticket, success(nextContext));
      const newPage = state.beginDiscoveryRead(selected);
      const displayed = state.completeDiscoveryRead(newPage.state, newPage.ticket, success(page([21], { space: nextContext.space_id })));
      for (const [status, code] of [[401, 'AUTHENTICATION_REQUIRED'], [403, 'ACCESS_DENIED'], [404, 'DISCOVERY_PERSON_NOT_FOUND']]) {
        const { client } = queued([errorResponse(status, code), errorResponse(status, code)]);
        assert.equal(state.completePersonRead(displayed, oldPerson.ticket, await client.readPerson(oldPerson.ticket.context, 11)), displayed);
        assert.equal(state.completeDiscoveryRead(displayed, oldPage.ticket, await client.readPage(oldPage.ticket.context)), displayed);
      }
    }
  });
  await check('Late ordinary network failures leave the newer same-context person and list intact', async () => {
    const a = state.beginPersonRead(listed(), 11); const b = state.beginPersonRead(a.state, 12);
    const displayedPerson = state.completePersonRead(b.state, b.ticket, success(person(12)));
    const personClient = queued([new Error('synthetic network failure')]).client;
    assert.equal(state.completePersonRead(displayedPerson, a.ticket, await personClient.readPerson(a.ticket.context, 11)), displayedPerson);
    const old = state.beginDiscoveryRead(ready()); const next = state.beginDiscoveryRead(old.state, { filters: { skill: ['php'] } });
    const displayedPage = state.completeDiscoveryRead(next.state, next.ticket, success(page([12])));
    const pageClient = queued([new Error('synthetic network failure')]).client;
    assert.equal(state.completeDiscoveryRead(displayedPage, old.ticket, await pageClient.readPage(old.ticket.context)), displayedPage);
  });
  await check('Closing details rejects their late response and a pool-external ID has no ticket', () => {
    const started = state.beginPersonRead(listed(), 11); const closed = state.closePerson(started.state);
    assert.equal(state.completePersonRead(closed, started.ticket, success(person(11))), closed);
    assert.equal(state.beginPersonRead(listed(), 999).ticket, null);
  });
  await check('Person version changes invalidate the cursor-bound list without mixing snapshots', () => {
    for (const version of ['revision', 'permission_version']) {
      const started = state.beginPersonRead(listed(), 11); const newer = person(11); newer.global[version] += 1;
      const result = state.completePersonRead(started.state, started.ticket, success(newer));
      assert.equal(result.list.status, 'error'); assert.equal(result.list.error.code, 'DISCOVERY_CHANGED'); assert.equal(result.detail.person, null);
    }
  });
  await check('Attribute schema and discovery policy changes cannot silently reuse a list snapshot', () => {
    for (const change of [p => { p.global.attributes[0].schema_version = 3; }, p => { p.privacy_policy_version = 'discovery-fields-v3'; }]) {
      const started = state.beginPersonRead(listed(), 11); const newer = person(11); change(newer);
      const result = state.completePersonRead(started.state, started.ticket, success(newer));
      assert.equal(result.list.error.code, 'DISCOVERY_CHANGED'); assert.equal(result.detail.person, null);
    }
  });
  await check('Removed person and detail-level revocation remove cached display', () => {
    const gone = state.beginPersonRead(listed(), 11);
    const missing = state.completePersonRead(gone.state, gone.ticket, failed(404, 'DISCOVERY_PERSON_NOT_FOUND'));
    assert.equal(missing.list.items.length, 0); assert.equal(missing.detail.person, null);
    const denied = state.completePersonRead(gone.state, gone.ticket, failed(403, 'ACCESS_DENIED'));
    assert.equal(denied.context, null); assert.equal(denied.list.items.length, 0);
  });
  await check('Malformed result injected through a custom port cannot enter state', () => {
    const started = state.beginDiscoveryRead(ready()); const malformed = page([11]); malformed.items[0].space_id = 18;
    assert.equal(state.completeDiscoveryRead(started.state, started.ticket, success(malformed)).list.status, 'error');
    const selected = state.beginPersonRead(listed(), 11);
    assert.equal(state.completePersonRead(selected.state, selected.ticket, success(person(12))).detail.status, 'error');
  });
  await check('Only the actual local ticket can complete; reconstructed ticket is not an authority', () => {
    const started = state.beginDiscoveryRead(ready());
    assert.equal(state.completeDiscoveryRead(started.state, { ...started.ticket }, success(page([11]))), started.state);
  });
  console.log(JSON.stringify({ scope: 'offline ordinary-discovery preparation layer', passed, realHttpRequests: 0, modelCalls: 0, uiMounted: false, successfulPageOrPersonTransportCalls: 2 }));
} finally {
  rmSync(output, { recursive: true, force: true });
}
