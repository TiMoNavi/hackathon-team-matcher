import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { deferred, errorEnvelope, response } from './chat-test-helpers.mjs';

const chatRoot = new URL('../src/chat/', import.meta.url);
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.startsWith(chatRoot.href) && specifier === './group-contracts.js') {
    return nextResolve(new URL('./group-contracts.ts', context.parentURL).href, context);
  }
  return nextResolve(specifier, context);
} });
const { createGroupApi } = await import('../src/chat/group-http.ts');
const { ChatApiError } = await import('../src/chat/http.ts');
const { groupActionCodec, buildGroupCommand } = await import('../src/chat/group-contracts.ts');
const { createGroupActionState } = await import('../src/chat/group-action-state.ts');
const key = '12345678-1234-4234-8234-123456789012';
const group = (changes = {}) => ({ conversation_id: 10, type: 'group', title: '协作群', owner_id: 1, version: 1, active_member_count: 1, ...changes });
const member = (changes = {}) => ({ conversation_id: 10, user_id: 1, generation: 1, join_seq: 0, status: 'active', version: 1, ...changes });
const invitation = (changes = {}) => ({ id: 20, conversation_id: 10, inviter_id: 1, invitee_id: 2, status: 'pending', version: 1,
  created_at: '2026-11-13T00:00:00Z', expires_at: '2026-11-16T00:00:00Z', resolved_at: null, ...changes });
const terminal = (status) => invitation({ status, version: 2, resolved_at: '2026-11-13T01:00:00Z' });
const envelope = (changes = {}) => ({ data: { group: group(), invitation: null, membership: member(), replayed: false, ...changes }, meta: { request_id: 'synthetic-group-http' } });
const config = (fetcher, actor = 1) => ({ apiBase: '/api/v1', csrfToken: 'synthetic-group-csrf', expectedActorId: actor, fetcher });
const api = (fetcher, actor = 1) => createGroupApi(config(fetcher, actor));
const intents = { create: 'create_group', invite: 'invite_to_group', accept: 'accept_group_invitation', decline: 'decline_group_invitation', withdraw: 'withdraw_group_invitation', leave: 'leave_group' };
const command = (action, changes = {}) => ({ client_command_id: key, confirmation_intent: intents[action],
  ...(action === 'create' ? { title: '协作群' } : action === 'invite' ? { target_user_id: 2 } : { expected_version: 1 }), ...changes });
const target = (action) => action === 'create' ? null : ['invite', 'leave'].includes(action) ? 10 : 20;
const invoke = (client, action, value = command(action), options = {}) => action === 'create' ? client.create(value, options) : client[action](target(action), value, options);
const receipts = {
  create: () => envelope(),
  invite: () => envelope({ invitation: invitation() }),
  accept: () => envelope({ group: group({ version: 2, active_member_count: 2 }), invitation: terminal('accepted'), membership: member({ user_id: 2 }) }),
  decline: () => envelope({ group: null, invitation: terminal('declined'), membership: null }),
  withdraw: () => envelope({ invitation: terminal('withdrawn') }),
  leave: () => envelope({ group: null, membership: member({ user_id: 2, status: 'left', version: 2 }) }),
};
const actor = (action) => ['accept', 'decline', 'leave'].includes(action) ? 2 : 1;
const failure = (code, status) => (error) => error instanceof ChatApiError && error.code === code && (status === undefined || error.status === status);

test('construction is inert, session-scoped and requires the expected actor', () => {
  let calls = 0; const fetcher = async () => { calls++; return response(envelope(), 201); };
  const client = api(fetcher); assert.equal(calls, 0); assert.ok(Object.isFrozen(client));
  assert.deepEqual(Object.keys(client).sort(), ['accept', 'create', 'decline', 'dispose', 'invitation', 'invite', 'leave', 'withdraw']);
  for (const value of [null, [], {}, { ...config(fetcher), expectedActorId: undefined }, { ...config(fetcher), expectedActorId: '1' },
    { ...config(fetcher), expectedActorId: Number.MAX_SAFE_INTEGER + 1 }, { ...config(fetcher), actor_id: 1 },
    { ...config(fetcher), apiBase: 'https://external.invalid/api/v1' }, { ...config(fetcher), csrfToken: '' },
    { ...config(fetcher), csrfToken: 'bad\r\n' }, { ...config(fetcher), fetcher: true }]) assert.throws(() => createGroupApi(value), failure('INVALID_REQUEST'));
  client.dispose(); assert.equal(calls, 0);
});

test('all six mutations preserve exact commands, fixed routes and native-session transport', async () => {
  const paths = { create: 'conversations/groups', invite: 'conversations/10/invitations', accept: 'group-invitations/20/accept',
    decline: 'group-invitations/20/decline', withdraw: 'group-invitations/20/withdraw', leave: 'conversations/10/leave' };
  for (const action of Object.keys(intents)) {
    const calls = []; const client = api(async (url, init) => { calls.push([url, init]); return response(receipts[action](), 201); }, actor(action));
    const result = await invoke(client, action); assert.deepEqual(result, receipts[action]()); assert.equal(calls.length, 1);
    const [url, init] = calls[0]; assert.equal(url, '/api/v1/' + paths[action]); assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), command(action)); assert.equal(init.headers['X-CSRF-Token'], 'synthetic-group-csrf');
    assert.equal(init.headers['X-Matcher-Chat-Actor'], String(actor(action))); assert.equal(init.headers.Accept, 'application/json');
    assert.equal(init.headers['Content-Type'], 'application/json'); assert.equal(init.credentials, 'same-origin');
    assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal);
    client.dispose();
  }
});

test('invitation detail is an exact actor-bound GET with no body or CSRF', async () => {
  const expected = envelope({ group: null, invitation: invitation(), membership: null }); let initSeen;
  const client = api(async (url, init) => { assert.equal(url, '/api/v1/group-invitations/20'); initSeen = init; return response(expected); }, 2);
  assert.deepEqual(await client.invitation(20), expected); assert.equal(initSeen.method, 'GET');
  assert.equal(Object.hasOwn(initSeen, 'body'), false); assert.equal(Object.hasOwn(initSeen.headers, 'X-CSRF-Token'), false);
  assert.equal(Object.hasOwn(initSeen.headers, 'Content-Type'), false); assert.equal(initSeen.headers['X-Matcher-Chat-Actor'], '2');
  assert.equal(initSeen.credentials, 'same-origin'); assert.equal(initSeen.cache, 'no-store'); assert.equal(initSeen.redirect, 'error');
});

test('201 is new, 200 is replay, and all other successful statuses are rejected', async () => {
  for (const action of Object.keys(intents)) {
    const current = receipts[action](); current.data.replayed = true;
    assert.equal((await invoke(api(async () => response(current, 200), actor(action)), action)).data.replayed, true);
    for (const [payload, status] of [[receipts[action](), 200], [current, 201], [receipts[action](), 202]]) {
      await assert.rejects(invoke(api(async () => response(payload, status), actor(action)), action), failure('INVALID_RESPONSE', status));
    }
  }
});

test('invalid input cannot fetch or smuggle actor, activity, URL, epoch or member fields', () => {
  let calls = 0; const client = api(async () => { calls++; return response(envelope(), 201); });
  for (const action of Object.keys(intents)) {
    for (const value of [null, [], {}, command(action, { client_command_id: 'bad' }), command(action, { confirmation_intent: 'model_says_yes' }),
      ...['actor_id', 'space_id', 'url', 'accountEpoch', 'members', 'conversation_id'].map(field => command(action, { [field]: 1 }))]) {
      assert.throws(() => invoke(client, action, value), failure('INVALID_REQUEST'));
    }
    for (const options of [null, [], { signal: true }, { retry: true }, { expectedActorId: 2 }]) {
      assert.throws(() => invoke(client, action, command(action), options), failure('INVALID_REQUEST'));
    }
  }
  for (const value of [0, -1, 1.5, '20', Number.MAX_SAFE_INTEGER + 1, null, true]) {
    for (const method of ['invitation', 'invite', 'accept', 'decline', 'withdraw', 'leave']) {
      assert.throws(() => client[method](value, method === 'invitation' ? {} : command(method)), failure('INVALID_REQUEST'));
    }
  }
  assert.equal(calls, 0);
});

test('receipt binds requested actor, target, title, recipient and exact decision version', async () => {
  const cases = [
    ['create', x => { x.data.group.title = 'different'; }],
    ['create', x => { x.data.membership.user_id = 2; }],
    ['invite', x => { x.data.invitation.invitee_id = 3; }],
    ['invite', x => { x.data.invitation.conversation_id = 11; }],
    ['accept', x => { x.data.invitation.id = 21; }],
    ['accept', x => { x.data.invitation.version = 3; }],
    ['decline', x => { x.data.invitation.status = 'accepted'; }],
    ['withdraw', x => { x.data.invitation.version = 1; }],
    ['leave', x => { x.data.membership.version = 3; }],
    ['leave', x => { x.data.membership.conversation_id = 11; }],
  ];
  for (const [action, mutate] of cases) {
    const payload = receipts[action](); mutate(payload);
    await assert.rejects(invoke(api(async () => response(payload, 201), actor(action)), action), failure('INVALID_RESPONSE', 201));
  }
});

test('detail rejects wrong IDs, mutation replay flags and forbidden member projections', async () => {
  const pending = () => envelope({ group: null, invitation: invitation(), membership: null });
  for (const mutate of [x => { x.data.invitation.id = 21; }, x => { x.data.replayed = true; },
    x => { x.data.group = group(); }, x => { x.data.membership = member({ user_id: 1 }); },
    x => { x.data.invitation.created_at = '2026-02-30T00:00:00Z'; }, x => { x.data.messages = []; }]) {
    const payload = pending(); mutate(payload);
    await assert.rejects(api(async () => response(payload), 2).invitation(20), failure('INVALID_RESPONSE', 200));
  }
  await assert.rejects(api(async () => response(pending(), 201), 2).invitation(20), failure('INVALID_RESPONSE', 201));
});

test('malformed JSON, MIME, redirects, DTOs and errors never become accepted receipts', async () => {
  const redirect = response(envelope(), 201); Object.defineProperty(redirect, 'redirected', { value: true });
  const badResponses = [new Response('{', { status: 201, headers: { 'Content-Type': 'application/json' } }),
    response(envelope(), 201, { 'Content-Type': 'text/html' }), response(envelope(), 201, {}), redirect,
    response({}, 201), response({ data: {} }, 201), response({ malformed: true }, 503), new Response(null, { status: 204 })];
  for (const value of badResponses) await assert.rejects(api(async () => value).create(command('create')), failure('INVALID_RESPONSE'));
  assert.equal((await api(async () => response(envelope(), 201, { 'Content-Type': 'application/vnd.api+json; charset=utf-8' })).create(command('create'))).data.group.conversation_id, 10);
});

test('business and availability failures preserve structured errors without implicit retries', async () => {
  for (const [status, code] of [[401, 'SESSION_CHANGED'], [403, 'GROUP_ACCESS_DENIED'], [404, 'GROUP_NOT_FOUND'],
    [409, 'VERSION_CONFLICT'], [422, 'INVALID_GROUP_COMMAND'], [429, 'RATE_LIMITED'], [503, 'CHAT_GROUPS_UNAVAILABLE']]) {
    let calls = 0; const payload = errorEnvelope(code); const client = api(async () => { calls++; return response(payload, status); });
    await assert.rejects(client.create(command('create')), error => {
      assert.ok(failure(code, status)(error)); assert.equal(error.message, payload.error.message);
      assert.equal(error.requestId, payload.meta.request_id); assert.deepEqual(error.details, payload.error.details); assert.equal(error.retryable, false); return true;
    });
    assert.equal(calls, 1);
  }
});

test('network outcome uses the original command only after caller explicitly retries', async () => {
  const calls = []; const client = api(async (_url, init) => {
    calls.push(init.body); if (calls.length === 1) throw new Error('synthetic lost response'); return response(envelope({ replayed: true }), 200);
  });
  await assert.rejects(client.create(command('create')), failure('NETWORK_ERROR', 0)); assert.equal(calls.length, 1);
  assert.equal((await client.create(command('create'))).data.replayed, true); assert.equal(calls.length, 2); assert.equal(calls[0], calls[1]);
});

test('an already aborted request does not fetch', async () => {
  let calls = 0; const controller = new AbortController(); controller.abort();
  const client = api(async () => { calls++; return response(envelope(), 201); });
  await assert.rejects(client.create(command('create'), { signal: controller.signal }), failure('REQUEST_ABORTED', 0));
  assert.equal(calls, 0);
});

test('caller abort and dispose suppress late successes when transport ignores cancellation', async () => {
  for (const cancelByDispose of [false, true]) {
    const wait = deferred(); let transportSignal; const controller = new AbortController();
    const client = api(async (_url, init) => { transportSignal = init.signal; return wait.promise; });
    const pending = client.create(command('create'), { signal: controller.signal });
    if (cancelByDispose) client.dispose(); else controller.abort();
    assert.equal(transportSignal.aborted, true); wait.resolve(response(envelope(), 201));
    await assert.rejects(pending, failure('REQUEST_ABORTED', 0));
    if (cancelByDispose) await assert.rejects(client.create(command('create')), failure('CLIENT_DISPOSED', 0));
  }
});

test('abort during JSON decoding rejects the late payload', async () => {
  const decoding = deferred(); const started = deferred(); const controller = new AbortController();
  const client = api(async () => ({ status: 201, ok: true, redirected: false, headers: new Headers({ 'Content-Type': 'application/json' }),
    json: () => { started.resolve(); return decoding.promise; } }));
  const pending = client.create(command('create'), { signal: controller.signal }); await started.promise;
  controller.abort(); decoding.resolve(envelope()); await assert.rejects(pending, failure('REQUEST_ABORTED', 0));
});

test('observed 401 survives cancellation so account state can invalidate the same session', async () => {
  for (const cancelByDispose of [false, true]) {
    const wait = deferred(); const controller = new AbortController(); const client = api(async () => wait.promise);
    const pending = client.create(command('create'), { signal: controller.signal });
    if (cancelByDispose) client.dispose(); else controller.abort();
    wait.resolve(response(errorEnvelope('SESSION_CHANGED'), 401)); await assert.rejects(pending, failure('SESSION_CHANGED', 401));
  }
});

test('state and HTTP retain the same key across explicit recovery and produce only refresh intent', async () => {
  const state = createGroupActionState(groupActionCodec, () => key); state.activateAccount(1); state.activateScope('synthetic-group-form');
  const first = state.submit('create', { targetId: null, body: { confirmation_intent: 'create_group', title: '协作群' } }, 'submit');
  const bodies = []; const client = api(async (_url, init) => { bodies.push(init.body); if (bodies.length === 1) throw new Error('lost'); return response(envelope({ replayed: true }), 200); });
  try { await client.create(buildGroupCommand(first.action, first.input, first.commandId)); assert.fail('expected transport failure'); }
  catch (error) { assert.equal(state.reject(first, error), 'applied'); }
  assert.equal(state.snapshot().phase, 'outcome_unknown'); assert.equal(bodies.length, 1);
  const retry = state.retry('retry'); const result = await client.create(buildGroupCommand(retry.action, retry.input, retry.commandId));
  assert.equal(state.resolve(retry, result), 'applied'); assert.equal(bodies[0], bodies[1]);
  assert.deepEqual(state.takeRefreshIntent(), { conversations: true, invitations: true, conversationId: 10, invitationId: null });
  assert.equal(state.snapshot().input, null); assert.equal(state.takeRefreshIntent(), null); assert.equal(bodies.length, 2);
});

test('late HTTP 401 clears the same account epoch but cannot clear a later login', async () => {
  for (const relogin of [false, true]) {
    const state = createGroupActionState(groupActionCodec, () => key); state.activateAccount(1); state.activateScope('first-form');
    const attempt = state.submit('create', { targetId: null, body: { confirmation_intent: 'create_group', title: '协作群' } }, 'submit');
    const wait = deferred(); const client = api(async () => wait.promise); const pending = client.create(buildGroupCommand(attempt.action, attempt.input, attempt.commandId));
    client.dispose(); if (relogin) state.activateAccount(1); state.activateScope('second-form');
    wait.resolve(response(errorEnvelope('SESSION_CHANGED'), 401));
    try { await pending; assert.fail('expected expired session'); }
    catch (error) { assert.ok(failure('SESSION_CHANGED', 401)(error)); assert.equal(state.reject(attempt, error), relogin ? 'ignored' : 'applied'); }
    assert.equal(state.snapshot().status, relogin ? 'active' : 'signed-out');
  }
});

test('accepted-command replay after leave is current left membership, never access permission', async () => {
  const current = envelope({ group: null, invitation: terminal('accepted'), membership: member({ user_id: 2, status: 'left', version: 2 }), replayed: true });
  const result = await api(async () => response(current), 2).accept(20, command('accept'));
  assert.deepEqual(result, current); assert.equal(result.data.group, null); assert.equal(Object.hasOwn(result.data, 'permissions'), false);
});
