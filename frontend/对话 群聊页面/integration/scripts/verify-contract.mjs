import assert from 'node:assert/strict';
import {
  parseConversationPage, parseMessagePage, parseReadState, parseErrorEnvelope,
} from '../src/chat/contracts.ts';
import { http, state } from '../tests/chat-test-helpers.mjs';

// Input is generated exclusively by matcher-chat/tests/export-contract.php.
// No network, application boot, database, identity, or production fixture is used.
const chunks = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  assert.ok(size <= 1024 * 1024, 'Synthetic contract exceeds its size limit.');
  chunks.push(chunk);
}
const fixture = JSON.parse(Buffer.concat(chunks).toString('utf8'));
assert.equal(fixture.schema_version, 1);
assert.equal(fixture.kind, 'matcher-chat-c04p-synthetic-contract');
assert.ok(Array.isArray(fixture.cases) && fixture.cases.length >= 8);
const parsers = {
  conversations: parseConversationPage,
  history: (value) => parseMessagePage(value, 'history'),
  increment: (value) => parseMessagePage(value, 'increment'),
  'read-state': parseReadState,
  error: parseErrorEnvelope,
};
const names = new Set();
const checked = [];
for (const scenario of fixture.cases) {
  assert.equal(typeof scenario.name, 'string');
  assert.ok(scenario.name.length > 0 && !names.has(scenario.name), 'Invalid or duplicate scenario name.');
  names.add(scenario.name);
  assert.ok(Object.hasOwn(parsers, scenario.kind), 'Unknown scenario kind.');
  assert.ok(Number.isSafeInteger(scenario.status), 'Invalid synthetic HTTP status.');
  assert.ok(scenario.kind === 'error' ? scenario.status >= 400 && scenario.status <= 599 : scenario.status === 200);
  const parsed = parsers[scenario.kind](scenario.payload);
  assert.deepEqual(parsed, scenario.payload, 'PHP and TypeScript disagree on the response.');
  assert.ok(Object.isFrozen(parsed));
  checked.push(scenario.name);
}
for (const kind of Object.keys(parsers)) assert.ok(fixture.cases.some((item) => item.kind === kind), 'Missing scenario kind: ' + kind);
assert.ok(fixture.cases.some((item) => item.kind === 'conversations' && item.payload.data.items.length === 0), 'Missing real empty use-case response.');
assert.ok(fixture.cases.some((item) => item.kind === 'increment' && item.payload.data.has_more === true), 'Missing bounded increment response.');

// Deliberately corrupt actual PHP outputs rather than maintaining a second DTO.
const negatives = [];
function rejects(name, scenario, mutate) {
  const value = structuredClone(scenario.payload);
  mutate(value);
  assert.throws(() => parsers[scenario.kind](value), undefined, name);
  negatives.push(name);
}
const history = fixture.cases.find((item) => item.kind === 'history' && item.payload.data.items.length >= 2);
const listing = fixture.cases.find((item) => item.kind === 'conversations' && item.payload.data.items.length > 0);
const increment = fixture.cases.find((item) => item.kind === 'increment');
const read = fixture.cases.find((item) => item.kind === 'read-state');
const error = fixture.cases.find((item) => item.kind === 'error');
assert.ok(history && listing && increment && read && error, 'Synthetic scenario coverage is incomplete.');
rejects('unsafe native identifier', listing, (x) => { x.data.items[0].id = Number.MAX_SAFE_INTEGER + 1; });
rejects('unknown private projection', listing, (x) => { x.data.items[0].private_profile = 'synthetic'; });
rejects('untyped legacy conversation', listing, (x) => { x.data.items[0].type = 'legacy'; });
rejects('cross-conversation message', history, (x) => { x.data.items[0].conversation_id = x.data.context.conversation_id + 1; });
rejects('duplicate sequence', history, (x) => { x.data.items[1].seq = x.data.items[0].seq; });
rejects('unsorted history', history, (x) => { x.data.items.reverse(); });
rejects('unsafe sequence', history, (x) => { x.data.items[0].seq = Number.MAX_SAFE_INTEGER + 1; });
rejects('history boundary exposure', history, (x) => { x.data.context.history_after_seq = x.data.items[0].seq; });
rejects('unavailable attachment capability', history, (x) => { x.data.items[0].attachments = [{ id: 1 }]; });
rejects('increment cannot reuse backward cursor', increment, (x) => { x.data.next_cursor = 'synthetic-old-page-cursor'; });
rejects('negative read position', read, (x) => { x.data.read_seq = -1; });
rejects('missing request id', read, (x) => { delete x.meta.request_id; });
rejects('error retry flag is not a string', error, (x) => { x.error.retryable = 'false'; });
rejects('missing list projection revision', listing, (x) => { delete x.data.authorization_revision; });
rejects('missing message projection revision', history, (x) => { delete x.data.context.authorization_revision; });

// Reproduce privacy invalidation across the real PHP DTO, HTTP client and state.
// The fetcher returns synthetic Response objects; no HTTP request is made.
function scenario(name) {
  const result = fixture.cases.find((item) => item.name === name);
  assert.ok(result, 'Missing cross-layer scenario: ' + name);
  return result;
}
const projectionList = scenario('projection-before-list');
const projectionHistory = scenario('projection-before-history');
const projectionIncrement = scenario('projection-after-increment');
const projectionFreshList = scenario('projection-after-list');
const oldRevision = projectionHistory.payload.data.context.authorization_revision;
const newRevision = projectionIncrement.payload.data.context.authorization_revision;
assert.ok(newRevision > oldRevision);
assert.equal(projectionIncrement.payload.data.items.length, 0);
const responses = [projectionList, projectionHistory, projectionIncrement, projectionFreshList];
const observed = [];
let disposed = false;
const client = http.createChatApi({
  apiBase: '/api/v1', csrfToken: 'synthetic-cross-contract-token',
  fetcher: async (url, init) => {
    assert.ok(!disposed);
    assert.equal(init.method, 'GET');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    const response = responses.shift();
    assert.ok(response, 'Unexpected implicit request.');
    observed.push(url);
    return new Response(JSON.stringify(response.payload), { status: response.status, headers: { 'content-type': 'application/json' } });
  },
});
const chat = state.createChatState();
chat.activateSession(1, client);
assert.equal(observed.length, 0);
assert.equal(await chat.loadConversations(), 'applied');
chat.selectConversation(projectionHistory.payload.data.context.conversation_id);
assert.equal(observed.length, 1);
assert.equal(await chat.loadHistory(), 'applied');
assert.ok(chat.snapshot().active.messages.some((entry) => entry.sender.status === 'available'));
assert.ok(chat.snapshot().conversations.items.length > 0);
assert.equal(await chat.loadNewer(), 'failed');
assert.equal(chat.snapshot().active?.messages.length ?? 0, 0);
assert.equal(chat.snapshot().conversations.items.length, 0);
assert.equal(await chat.loadConversations(), 'applied');
assert.equal(chat.snapshot().conversations.items.length, projectionFreshList.payload.data.items.length);
assert.equal(chat.snapshot().active?.messages.length ?? 0, 0);
chat.dispose(); disposed = true;
assert.equal(chat.snapshot().status, 'disposed');
assert.equal(chat.snapshot().conversations.items.length, 0);
assert.equal(chat.snapshot().active, null);
assert.equal(responses.length, 0);
assert.equal(observed.length, 4);

// A stale response must not restore an older projection, including after a
// rejection has emptied visible state. Keep using unmodified PHP responses.
const staleResponses = [projectionFreshList, projectionHistory, projectionList, projectionFreshList];
let staleRequestCount = 0;
const staleClient = http.createChatApi({
  apiBase: '/api/v1', csrfToken: 'synthetic-cross-contract-token',
  fetcher: async () => {
    const response = staleResponses.shift();
    assert.ok(response, 'Unexpected request during stale projection recovery.');
    staleRequestCount++;
    return new Response(JSON.stringify(response.payload), { status: response.status, headers: { 'content-type': 'application/json' } });
  },
});
const staleChat = state.createChatState();
staleChat.activateSession(1, staleClient);
assert.equal(await staleChat.loadConversations(), 'applied');
staleChat.selectConversation(projectionHistory.payload.data.context.conversation_id);
assert.equal(await staleChat.loadHistory(), 'failed');
assert.equal(staleChat.snapshot().active?.messages.length ?? 0, 0);
assert.equal(staleChat.snapshot().conversations.items.length, 0);
assert.equal(await staleChat.loadConversations(), 'failed');
assert.equal(staleChat.snapshot().conversations.items.length, 0);
assert.equal(await staleChat.loadConversations(), 'applied');
assert.equal(staleChat.snapshot().conversations.authorizationRevision, newRevision);
assert.equal(staleResponses.length, 0);
assert.equal(staleRequestCount, 4);
staleChat.dispose();

console.log(JSON.stringify({
  status: 'passed', mode: 'offline-php-usecases-to-typescript-parser',
  positive_cases: checked.length, negative_cases: negatives.length,
  positive_names: checked, negative_names: negatives,
  projection_invalidation: 'passed', projection_downgrade_rejection: 'passed',
  synthetic_client_requests: observed.length + staleRequestCount,
  real_http_requests: 0, database_connections: 0, real_authentication: false,
}));
