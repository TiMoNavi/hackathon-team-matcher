import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const chatRoot = new URL('../src/chat/', import.meta.url);
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.startsWith(chatRoot.href) && specifier === './send-input.js') {
    return nextResolve(new URL('./send-input.ts', context.parentURL).href, context);
  }
  return nextResolve(specifier, context);
} });
const contracts = await import('../src/chat/group-contracts.ts');
const { createGroupActionState, GroupActionStateError } = await import('../src/chat/group-action-state.ts');
const { GroupContractError, parseGroup, parseGroupInvitation, parseGroupMembership, parseGroupReceipt, parseGroupCommand, parseGroupActionInput, buildGroupCommand, validateGroupTitle, groupActionCodec } = contracts;
const key = (n = 1) => '12345678-1234-4234-8234-' + String(n).padStart(12, '0');
const group = (changes = {}) => ({ conversation_id: 10, type: 'group', title: '协作群', owner_id: 1, version: 1, active_member_count: 1, ...changes });
const membership = (changes = {}) => ({ conversation_id: 10, user_id: 1, generation: 1, join_seq: 0, status: 'active', version: 1, ...changes });
const invitation = (changes = {}) => ({ id: 20, conversation_id: 10, inviter_id: 1, invitee_id: 2, status: 'pending', version: 1, created_at: '2026-11-13T00:00:00Z', expires_at: '2026-11-16T00:00:00Z', resolved_at: null, ...changes });
const terminal = (status = 'accepted', changes = {}) => invitation({ status, version: 2, resolved_at: status === 'expired' ? '2026-11-16T00:00:00Z' : '2026-11-13T01:00:00Z', ...changes });
const envelope = (changes = {}) => ({ data: { group: group(), invitation: null, membership: membership(), replayed: false, ...changes }, meta: { request_id: 'synthetic-group-test' } });
const intents = { create: 'create_group', invite: 'invite_to_group', accept: 'accept_group_invitation', decline: 'decline_group_invitation', withdraw: 'withdraw_group_invitation', leave: 'leave_group' };
function input(action, changes = {}) {
  return { targetId: action === 'create' ? null : ['accept', 'decline', 'withdraw'].includes(action) ? 20 : 10, body: { confirmation_intent: intents[action], ...(action === 'create' ? { title: '协作群' } : action === 'invite' ? { target_user_id: 2 } : { expected_version: 1 }), ...changes } };
}
function active(actor = 1) {
  let next = 0; const state = createGroupActionState(groupActionCodec, () => key(++next));
  state.activateAccount(actor); state.activateScope('authorized-scope'); return state;
}
const invalid = (callback) => assert.throws(callback, GroupContractError);
const unavailable = (callback) => assert.throws(callback, GroupActionStateError);

test('group title preserves unicode and whitespace bytes within exact limits', () => {
  for (const title of ['协作群', '  a  ', '🙂'.repeat(100), '中'.repeat(100), '\ufeff', '<tag>&text', 'é']) assert.equal(validateGroupTitle(title), title);
  for (const title of ['', ' ', '\u00a0\u3000', '\t', 'a\n', '\u007f', '\u0085', '\ud800', '\udfff', '🙂'.repeat(101), null, 1, []]) invalid(() => validateGroupTitle(title));
});
test('every command has strict operation fields and no client actor or route data', () => {
  for (const action of Object.keys(intents)) {
    const value = input(action); const body = buildGroupCommand(action, value, key());
    assert.deepEqual(body, { ...value.body, client_command_id: key() });
    assert.ok(Object.isFrozen(body)); assert.ok(Object.isFrozen(parseGroupActionInput(action, value).body));
    for (const extra of ['actor_id', 'conversation_id', 'space_id', 'members', 'accountEpoch']) invalid(() => parseGroupCommand(action, { ...body, [extra]: 1 }));
    invalid(() => parseGroupCommand(action, { ...body, confirmation_intent: 'model_says_yes' }));
    invalid(() => parseGroupCommand(action, { ...body, client_command_id: 'invalid' }));
    invalid(() => parseGroupActionInput(action, { ...value, targetId: action === 'create' ? 10 : null }));
  }
  invalid(() => parseGroupCommand('unknown', {}));
  invalid(() => parseGroupActionInput('create', { ...input('create'), extra: true }));
});
test('command numbers reject coercion, unsafe values and missing version', () => {
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', true, null, undefined]) {
    invalid(() => buildGroupCommand('accept', input('accept', { expected_version: value }), key()));
    invalid(() => buildGroupCommand('invite', input('invite', { target_user_id: value }), key()));
  }
  invalid(() => parseGroupCommand('accept', { client_command_id: key(), confirmation_intent: intents.accept }));
  invalid(() => buildGroupCommand('create', input('create'), key().toUpperCase().replace('1234', 'ABCD')));
});
test('DTO parsers reject extra/private fields, arrays, unsafe IDs and wrong type', () => {
  for (const [parse, value] of [[parseGroup, group()], [parseGroupInvitation, invitation()], [parseGroupMembership, membership()]]) {
    assert.ok(Object.isFrozen(parse(value)));
    invalid(() => parse({ ...value, private_profile: 'synthetic' }));
    invalid(() => parse([])); invalid(() => parse(Object.create(value)));
    invalid(() => parse({ ...value, conversation_id: Number.MAX_SAFE_INTEGER + 1 }));
  }
  invalid(() => parseGroup(group({ type: 'discussion' })));
  invalid(() => parseGroup(group({ title: null })));
  invalid(() => parseGroupMembership(membership({ status: 'pending' })));
  invalid(() => parseGroupMembership(membership({ generation: 0 })));
  invalid(() => parseGroupMembership(membership({ join_seq: -1 })));
});
test('invitation times are real UTC seconds and match terminal status', () => {
  for (const status of ['accepted', 'declined', 'withdrawn', 'expired']) assert.equal(parseGroupInvitation(terminal(status)).status, status);
  for (const date of ['2026-02-30T00:00:00Z', '2026-11-13T24:00:00Z', '2026-11-13T00:00:00.1Z', '2026-11-13T00:00:00+00:00', 'yesterday']) invalid(() => parseGroupInvitation(invitation({ created_at: date })));
  invalid(() => parseGroupInvitation(invitation({ expires_at: '2026-11-13T00:00:00Z' })));
  invalid(() => parseGroupInvitation(invitation({ resolved_at: '2026-11-13T01:00:00Z' })));
  invalid(() => parseGroupInvitation(terminal('accepted', { resolved_at: null })));
  for (const status of ['accepted', 'declined', 'withdrawn']) {
    invalid(() => parseGroupInvitation(terminal(status, { resolved_at: '2026-11-16T00:00:00Z' })));
    invalid(() => parseGroupInvitation(terminal(status, { resolved_at: '2026-11-12T23:59:59Z' })));
  }
  invalid(() => parseGroupInvitation(terminal('expired', { resolved_at: '2026-11-15T23:59:59Z' })));
  invalid(() => parseGroupInvitation(invitation({ invitee_id: 1 })));
});
test('pending invitation never grants current group or active membership', () => {
  const fresh = envelope({ group: null, invitation: invitation(), membership: null });
  assert.deepEqual(parseGroupReceipt(fresh, 2), fresh);
  const rejoin = envelope({ group: null, invitation: invitation(), membership: membership({ user_id: 2, status: 'left', version: 2 }) });
  assert.deepEqual(parseGroupReceipt(rejoin, 2), rejoin);
  invalid(() => parseGroupReceipt(envelope({ group: group({ active_member_count: 2 }), invitation: invitation(), membership: membership({ user_id: 2 }) }), 2));
});
test('receipt binds actor, conversation, owner and membership projection', () => {
  assert.ok(Object.isFrozen(parseGroupReceipt(envelope(), 1).data));
  const base = envelope({ invitation: invitation() });
  for (const mutate of [
    x => { x.data.membership.user_id = 2; },
    x => { x.data.invitation.conversation_id = 11; },
    x => { x.data.invitation.inviter_id = 3; },
    x => { x.data.membership.status = 'left'; },
    x => { x.data.group = null; },
    x => { x.data.replayed = 'false'; },
    x => { x.data.messages = []; },
    x => { x.meta.request_id = 'x'.repeat(129); },
    x => { x.meta.request_id = 'unsafe\n'; },
    x => { x.meta.extra = true; },
  ]) { const value = structuredClone(base); mutate(value); invalid(() => parseGroupReceipt(value, 1)); }
  invalid(() => parseGroupReceipt(base, 3));
  invalid(() => parseGroupReceipt(envelope({ group: null, membership: null }), 1));
  invalid(() => parseGroupReceipt(envelope({ membership: membership({ user_id: 2 }) }), 2));
});
test('fresh create requires exactly one owner in first empty member generation', () => {
  assert.equal(groupActionCodec.confirm('create', input('create'), key(), envelope(), 1).conversationId, 10);
  for (const mutate of [
    x => { x.data.group.title = 'other'; },
    x => { x.data.group.version = 2; },
    x => { x.data.group.active_member_count = 2; },
    x => { x.data.membership.generation = 2; },
    x => { x.data.membership.version = 2; },
    x => { x.data.membership.join_seq = 1; },
    x => { x.data.invitation = invitation(); },
  ]) { const value = envelope(); mutate(value); invalid(() => groupActionCodec.confirm('create', input('create'), key(), value, 1)); }
  const current = envelope({ group: group({ version: 3, active_member_count: 2 }), replayed: true });
  assert.equal(groupActionCodec.confirm('create', input('create'), key(), current, 1).conversationId, 10);
});
test('invite confirmation binds target and recipient, replay may show current terminal status', () => {
  const value = envelope({ invitation: invitation() });
  assert.equal(groupActionCodec.confirm('invite', input('invite'), key(), value, 1).invitationId, 20);
  for (const changes of [{ invitee_id: 3 }, { conversation_id: 11 }, { version: 2 }]) invalid(() => groupActionCodec.confirm('invite', input('invite'), key(), envelope({ invitation: invitation(changes) }), 1));
  invalid(() => groupActionCodec.confirm('invite', input('invite'), key(), envelope({ invitation: terminal() }), 1));
  assert.equal(groupActionCodec.confirm('invite', input('invite'), key(), envelope({ invitation: terminal(), replayed: true }), 1).invitationId, 20);
});
test('accept/decline/withdraw match exact invitation version and correct actor', () => {
  const accepted = envelope({ group: group({ version: 2, active_member_count: 2 }), invitation: terminal(), membership: membership({ user_id: 2 }) });
  const declined = envelope({ group: null, invitation: terminal('declined'), membership: null });
  const withdrawn = envelope({ invitation: terminal('withdrawn') });
  for (const [action, actor, value] of [['accept', 2, accepted], ['decline', 2, declined], ['withdraw', 1, withdrawn]]) {
    assert.equal(groupActionCodec.confirm(action, input(action), key(), value, actor).invitationId, 20);
    for (const version of [1, 3]) {
      const corrupt = structuredClone(value); corrupt.data.invitation.version = version;
      invalid(() => groupActionCodec.confirm(action, input(action), key(), corrupt, actor));
      corrupt.data.replayed = true; invalid(() => groupActionCodec.confirm(action, input(action), key(), corrupt, actor));
    }
    invalid(() => groupActionCodec.confirm(action, { ...input(action), targetId: 21 }, key(), value, actor));
    invalid(() => groupActionCodec.confirm(action, input(action), key(), value, actor === 1 ? 2 : 1));
  }
  invalid(() => groupActionCodec.confirm('accept', input('accept'), key(), envelope({ group: null, invitation: terminal(), membership: null }), 2));
  invalid(() => groupActionCodec.confirm('decline', input('decline'), key(), { ...accepted, data: { ...accepted.data, invitation: terminal('declined') } }, 2));
  invalid(() => groupActionCodec.confirm('withdraw', input('withdraw'), key(), envelope({ group: null, invitation: terminal('withdrawn'), membership: null }), 1));
});
test('old accepted receipt after leave/rejoin is refresh-only current membership', () => {
  const left = envelope({ group: null, invitation: terminal(), membership: membership({ user_id: 2, status: 'left', version: 2 }), replayed: true });
  const joined = envelope({ group: group({ version: 4, active_member_count: 2 }), invitation: terminal(), membership: membership({ user_id: 2, generation: 2, join_seq: 30, version: 3 }), replayed: true });
  for (const value of [left, joined]) {
    const result = groupActionCodec.confirm('accept', input('accept'), key(), value, 2);
    assert.deepEqual(Object.keys(result).sort(), ['conversationId', 'conversations', 'invitationId', 'invitations']);
    assert.equal(result.conversationId, 10);
  }
});
test('leave binds membership version, replay may show a later joined generation', () => {
  const left = envelope({ group: null, membership: membership({ user_id: 2, status: 'left', version: 2 }) });
  assert.equal(groupActionCodec.confirm('leave', input('leave'), key(), left, 2).conversationId, 10);
  for (const version of [1, 3]) invalid(() => groupActionCodec.confirm('leave', input('leave'), key(), envelope({ group: null, membership: membership({ user_id: 2, status: 'left', version }) }), 2));
  const joined = envelope({ group: group({ version: 4, active_member_count: 2 }), membership: membership({ user_id: 2, generation: 2, join_seq: 30, version: 3 }), replayed: true });
  assert.equal(groupActionCodec.confirm('leave', input('leave'), key(), joined, 2).conversationId, 10);
});
test('state requires account, authorized scope, and explicit submit intent', () => {
  const state = createGroupActionState(groupActionCodec, key);
  unavailable(() => state.submit('create', input('create'), 'submit'));
  state.activateAccount(1); unavailable(() => state.submit('create', input('create'), 'submit'));
  state.activateScope('group-form');
  unavailable(() => state.submit('create', input('create'), 'automatic'));
  assert.equal(state.snapshot().phase, 'idle');
  const attempt = state.submit('create', input('create'), 'submit');
  assert.equal(attempt.actorId, 1); assert.equal(state.snapshot().phase, 'submitting');
  unavailable(() => state.submit('create', input('create'), 'submit'));
  unavailable(() => state.retry('retry')); unavailable(() => state.discard('discard'));
});
test('submission snapshots input immutably and never exposes caller mutations', () => {
  const state = active(); const value = input('create'); const attempt = state.submit('create', value, 'submit');
  value.body.title = 'changed after submit'; value.targetId = 99;
  assert.equal(attempt.input.body.title, '协作群'); assert.equal(attempt.input.targetId, null);
  assert.ok(Object.isFrozen(attempt)); assert.ok(Object.isFrozen(attempt.input)); assert.ok(Object.isFrozen(attempt.input.body));
  assert.throws(() => { attempt.input.body.title = 'mutated'; }, TypeError);
  assert.equal(state.resolve(attempt, envelope()), 'applied');
});
test('unknown outcome retries use the same payload/key and a fresh attempt', () => {
  const state = active(); const first = state.submit('create', input('create'), 'submit');
  assert.equal(state.reject(first, { status: 0, code: 'TRANSPORT_FAILED' }), 'applied');
  assert.equal(state.snapshot().phase, 'outcome_unknown'); assert.equal(state.snapshot().canRetry, true);
  unavailable(() => state.retry('automatic')); unavailable(() => state.submit('create', input('create'), 'submit'));
  unavailable(() => state.discard('discard'));
  const retry = state.retry('retry');
  assert.equal(retry.commandId, first.commandId); assert.equal(retry.input, first.input); assert.ok(retry.attempt > first.attempt);
  assert.equal(state.resolve(first, envelope()), 'ignored');
  assert.equal(state.resolve(retry, envelope({ replayed: true })), 'applied');
});
test('5xx and malformed success retain original command for explicit recovery', () => {
  for (const status of [500, 503]) {
    const state = active(); const attempt = state.submit('create', input('create'), 'submit');
    state.reject(attempt, { status, code: 'SERVER_UNAVAILABLE' }); assert.equal(state.snapshot().phase, 'outcome_unknown');
    assert.equal(state.retry('retry').commandId, attempt.commandId);
  }
  const state = active(); const attempt = state.submit('create', input('create'), 'submit');
  assert.equal(state.resolve(attempt, envelope({ group: group({ title: 'different' }) })), 'invalid');
  assert.equal(state.snapshot().error.code, 'INVALID_RESPONSE');
  assert.equal(state.snapshot().input.body.title, '协作群'); assert.equal(state.snapshot().refresh, null);
  assert.equal(state.retry('retry').commandId, attempt.commandId);
});
test('business input failures and stale versions cannot silently retry', () => {
  for (const [status, phase] of [[422, 'failed'], [409, 'conflict'], [429, 'failed']]) {
    const state = active(); const attempt = state.submit('invite', input('invite'), 'submit');
    state.reject(attempt, { status, code: 'SYNTHETIC_BUSINESS_FAILURE' });
    assert.equal(state.snapshot().phase, phase); assert.equal(state.snapshot().canRetry, false);
    unavailable(() => state.retry('retry')); unavailable(() => state.submit('invite', input('invite'), 'submit'));
    state.discard('discard'); const next = state.submit('invite', input('invite'), 'submit');
    assert.notEqual(next.commandId, attempt.commandId);
  }
});
test('explicitly acknowledged unknown discard permits a new command', () => {
  const state = active(); const first = state.submit('create', input('create'), 'submit');
  state.reject(first, { status: 0, code: 'TRANSPORT_FAILED' }); state.discard('discard', true);
  const next = state.submit('create', input('create'), 'submit'); assert.notEqual(next.commandId, first.commandId);
  assert.equal(state.resolve(first, envelope()), 'ignored');
});
test('success stores only one consumable refresh intent and clears draft/command', () => {
  const state = active(); const attempt = state.submit('create', input('create'), 'submit');
  state.resolve(attempt, envelope()); const snapshot = state.snapshot();
  assert.equal(snapshot.phase, 'succeeded'); assert.equal(snapshot.input, null); assert.equal(snapshot.commandId, null);
  assert.equal(snapshot.action, null); assert.equal(snapshot.error, null); assert.equal(snapshot.canRetry, false);
  assert.deepEqual(state.takeRefreshIntent(), { conversations: true, invitations: true, conversationId: 10, invitationId: null });
  assert.equal(state.takeRefreshIntent(), null); assert.equal(state.resolve(attempt, envelope()), 'ignored');
});
test('scope changes ignore stale success and non-auth failures', () => {
  const state = active(); const old = state.submit('create', input('create'), 'submit');
  state.activateScope('new-authorized-scope'); const fresh = state.submit('create', input('create'), 'submit');
  assert.equal(state.resolve(old, envelope()), 'ignored');
  assert.equal(state.reject(old, { status: 403, code: 'FORBIDDEN' }), 'ignored');
  assert.equal(state.snapshot().phase, 'submitting'); assert.equal(state.resolve(fresh, envelope()), 'applied');
});
test('same-session late 401 invalidates even a newer scope', () => {
  const state = active(); const old = state.submit('create', input('create'), 'submit');
  state.activateScope('new-authorized-scope'); const fresh = state.submit('create', input('create'), 'submit');
  assert.equal(state.reject(old, { status: 401, code: 'AUTHENTICATION_REQUIRED' }), 'applied');
  assert.equal(state.snapshot().status, 'signed-out'); assert.equal(state.snapshot().actorId, null);
  assert.equal(state.snapshot().input, null); assert.equal(state.resolve(fresh, envelope()), 'ignored');
});
test('account switch and same-actor login fence all old results including 401', () => {
  for (const nextActor of [1, 2]) {
    const state = active(); const old = state.submit('create', input('create'), 'submit');
    const epoch = old.accountEpoch; state.activateAccount(nextActor); state.activateScope('fresh-login');
    assert.ok(state.snapshot().accountEpoch > epoch);
    assert.equal(state.reject(old, { status: 401, code: 'AUTHENTICATION_REQUIRED' }), 'ignored');
    assert.equal(state.resolve(old, envelope()), 'ignored'); assert.equal(state.snapshot().status, 'active');
    assert.equal(state.snapshot().actorId, nextActor);
  }
});
test('revocation clears command data and requires newly authorized scope', () => {
  for (const [status, code] of [[403, 'FORBIDDEN'], [404, 'UNAVAILABLE'], [409, 'AUTHORIZATION_CHANGED'], [409, 'CONTEXT_CHANGED']]) {
    const state = active(); const old = state.submit('create', input('create'), 'submit'); state.reject(old, { status, code });
    assert.equal(state.snapshot().status, 'revoked'); assert.equal(state.snapshot().input, null);
    assert.equal(state.snapshot().commandId, null); assert.equal(state.snapshot().scopeKey, null);
    unavailable(() => state.submit('create', input('create'), 'submit'));
    state.activateScope('fresh-authorized-scope'); assert.equal(state.resolve(old, envelope()), 'ignored');
    assert.equal(state.snapshot().phase, 'idle');
  }
});
test('reset/revoke/dispose invalidate outstanding attempts and dispose stays terminal', () => {
  for (const method of ['reset', 'revokeScope', 'dispose']) {
    const state = active(); const attempt = state.submit('create', input('create'), 'submit'); state[method]();
    assert.equal(state.resolve(attempt, envelope()), 'ignored'); assert.equal(state.snapshot().input, null); assert.equal(state.snapshot().refresh, null);
    unavailable(() => state.submit('create', input('create'), 'submit'));
    if (method === 'dispose') {
      state.reset(); state.dispose(); assert.equal(state.snapshot().status, 'disposed');
      unavailable(() => state.activateAccount(1)); unavailable(() => state.activateScope('x'));
      assert.equal(state.reject(attempt, { status: 401, code: 'AUTHENTICATION_REQUIRED' }), 'ignored');
    }
  }
});
test('forged attempt objects cannot resolve or invalidate the session', () => {
  const state = active(); const attempt = state.submit('create', input('create'), 'submit');
  const forgery = { ...attempt }; assert.equal(state.resolve(forgery, envelope()), 'ignored');
  assert.equal(state.reject(forgery, { status: 401, code: 'AUTHENTICATION_REQUIRED' }), 'ignored');
  assert.equal(state.snapshot().status, 'active'); assert.equal(state.resolve(attempt, envelope()), 'applied');
});
test('invalid codec input or key leaves the action idle without half a command', () => {
  const state = active(); invalid(() => state.submit('create', input('create', { title: '' }), 'submit'));
  assert.equal(state.snapshot().phase, 'idle'); assert.equal(state.snapshot().commandId, null);
  const badKeyState = createGroupActionState(groupActionCodec, () => 'broken'); badKeyState.activateAccount(1); badKeyState.activateScope('x');
  assert.throws(() => badKeyState.submit('create', input('create'), 'submit')); assert.equal(badKeyState.snapshot().phase, 'idle');
});
test('codec refresh pollution never becomes stored capabilities', () => {
  const codec = { parseInput: () => ({ payload: 'synthetic' }), confirm: () => ({ conversations: true, invitations: true, conversationId: 10, invitationId: null, send: true }) };
  const state = createGroupActionState(codec, key); state.activateAccount(1); state.activateScope('x');
  const attempt = state.submit('create', {}, 'submit'); assert.equal(state.resolve(attempt, {}), 'invalid');
  assert.equal(state.snapshot().refresh, null); assert.equal(state.snapshot().phase, 'outcome_unknown');
});
