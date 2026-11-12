import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Test-only resolution for unmounted pure modules. No build, HTTP or database.
const root = new URL('../src/chat/', import.meta.url);
const imports = new Set(['./send-input.js', './group-contracts.js', './group-action-state.js']);
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(root.href) && imports.has(specifier)) {
    return next(new URL(specifier.replace(/\.js$/, '.ts'), context.parentURL).href, context);
  }
  return next(specifier, context);
} });
const contracts = await import('../src/chat/group-contracts.ts');
const { createGroupActionState } = await import('../src/chat/group-action-state.ts');
const chunks = [];
let bytes = 0;
for await (const chunk of process.stdin) {
  bytes += chunk.length;
  assert.ok(bytes <= 1024 * 1024, 'Synthetic group fixture exceeds one MiB.');
  chunks.push(chunk);
}
const fixture = JSON.parse(Buffer.concat(chunks).toString('utf8'));
assert.equal(fixture.schema_version, 1);
assert.equal(fixture.kind, 'matcher-chat-c07p-synthetic-contract');
assert.ok(Array.isArray(fixture.cases) && fixture.cases.length >= 12);
const operations = new Set(['create', 'invite', 'accept', 'decline', 'withdraw', 'leave', 'detail']);
const names = new Set();
const positive = [];
function inputFor(item) {
  const { client_command_id, ...body } = item.command;
  assert.equal(typeof client_command_id, 'string');
  return { targetId: item.target_id, body };
}
function actionState(item) {
  const state = createGroupActionState(contracts.groupActionCodec, () => item.command.client_command_id);
  state.activateAccount(item.actor_id);
  state.activateScope('synthetic:' + item.operation + ':' + (item.target_id ?? 'new'));
  return state;
}
for (const item of fixture.cases) {
  assert.equal(typeof item.name, 'string');
  assert.ok(item.name.length && !names.has(item.name));
  names.add(item.name);
  assert.ok(operations.has(item.operation));
  const parsed = contracts.parseGroupReceipt(item.payload, item.actor_id);
  assert.deepEqual(parsed, item.payload, item.name);
  assert.ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.data));
  if (item.operation === 'detail') {
    assert.equal(item.command, null);
    assert.equal(parsed.data.invitation.id, item.target_id);
  } else {
    assert.deepEqual(contracts.parseGroupCommand(item.operation, item.command), item.command);
    const input = inputFor(item);
    assert.deepEqual(contracts.buildGroupCommand(item.operation, input, item.command.client_command_id), item.command);
    const state = actionState(item);
    const ticket = state.submit(item.operation, input, 'submit');
    assert.equal(state.resolve(ticket, item.payload), 'applied', item.name + ' real receipt');
    assert.equal(state.snapshot().phase, 'succeeded');
    assert.equal(state.snapshot().input, null, 'Successful command clears sensitive input.');
    const intent = state.takeRefreshIntent();
    assert.equal(intent.conversations, true);
    assert.equal(intent.invitations, true);
    assert.equal(state.takeRefreshIntent(), null, 'Refresh intent is consumed once.');
    state.dispose();
  }
  positive.push(item.name);
}
for (const operation of operations) assert.ok(fixture.cases.some((x) => x.operation === operation), 'Missing operation: ' + operation);
const create = fixture.cases.find((x) => x.operation === 'create' && !x.payload.data.replayed);
const accepted = fixture.cases.find((x) => x.operation === 'accept' && !x.payload.data.replayed);
const pending = fixture.cases.find((x) => x.payload.data.invitation?.status === 'pending' && x.actor_id === x.payload.data.invitation.invitee_id);
assert.ok(create && accepted && pending);
assert.ok(fixture.cases.some((x) => x.operation === 'accept' && x.payload.data.replayed && x.payload.data.membership?.status === 'left' && x.payload.data.group === null), 'Missing accept replay after leaving.');
assert.ok(fixture.cases.some((x) => x.payload.data.invitation?.status === 'pending' && x.payload.data.membership?.status === 'left'), 'Missing re-invitation after leaving.');
assert.ok(fixture.cases.some((x) => x.operation === 'leave' && x.payload.data.replayed && x.payload.data.membership?.status === 'active' && x.payload.data.membership.generation > 1), 'Missing leave replay after rejoining.');
const negative = [];
function rejects(name, item, mutate, command = false) {
  const value = structuredClone(item.payload);
  mutate(value);
  assert.throws(() => command
    ? contracts.groupActionCodec.confirm(item.operation, inputFor(item), item.command.client_command_id, value, item.actor_id)
    : contracts.parseGroupReceipt(value, item.actor_id), undefined, name);
  negative.push(name);
}
rejects('unknown response field', create, (x) => { x.data.messages = []; });
rejects('unknown private group field', create, (x) => { x.data.group.members = []; });
rejects('unsafe identifier', create, (x) => { x.data.group.conversation_id = Number.MAX_SAFE_INTEGER + 1; });
rejects('string identifier', create, (x) => { x.data.group.owner_id = String(x.data.group.owner_id); });
rejects('zero membership version', create, (x) => { x.data.membership.version = 0; });
rejects('foreign actor membership', create, (x) => { x.data.membership.user_id++; });
rejects('cross-conversation membership', create, (x) => { x.data.membership.conversation_id++; });
rejects('unrecognized conversation type', create, (x) => { x.data.group.type = 'discussion'; });
rejects('null group title', create, (x) => { x.data.group.title = null; });
rejects('oversized group title', create, (x) => { x.data.group.title = '群'.repeat(101); });
rejects('control character title', create, (x) => { x.data.group.title = 'x\u0000'; });
rejects('group without current membership', create, (x) => { x.data.membership = null; });
rejects('active membership without group', create, (x) => { x.data.group = null; });
rejects('invalid request identifier', create, (x) => { x.meta.request_id = ''; });
rejects('replayed string', create, (x) => { x.data.replayed = 'false'; });
rejects('pending with resolved timestamp', pending, (x) => { x.data.invitation.resolved_at = x.data.invitation.created_at; });
rejects('expiry not after creation', pending, (x) => { x.data.invitation.expires_at = x.data.invitation.created_at; });
rejects('fractional timestamp', pending, (x) => { x.data.invitation.created_at = x.data.invitation.created_at.replace('Z', '.123Z'); });
rejects('invitation for neither party', pending, (x) => { x.data.invitation.invitee_id += 1000; });
rejects('terminal without resolution', accepted, (x) => { x.data.invitation.resolved_at = null; });
rejects('accepted after expiry', accepted, (x) => { x.data.invitation.resolved_at = x.data.invitation.expires_at; });
rejects('fresh create mismatched title', create, (x) => { x.data.group.title += 'x'; }, true);
rejects('fresh accept unchanged version', accepted, (x) => { x.data.invitation.version = accepted.command.expected_version; }, true);
rejects('fresh accept skipped version', accepted, (x) => { x.data.invitation.version = accepted.command.expected_version + 2; }, true);
rejects('fresh accept wrong invitation', accepted, (x) => { x.data.invitation.id++; }, true);

// Exercise late responses and explicit retry with actual PHP use-case output.
const state = actionState(accepted);
const first = state.submit('accept', inputFor(accepted), 'submit');
assert.equal(state.reject(first, { status: 0, code: 'NETWORK_FAILURE' }), 'applied');
assert.equal(state.snapshot().phase, 'outcome_unknown');
assert.throws(() => state.submit('accept', inputFor(accepted), 'submit'));
const retry = state.retry('retry');
assert.equal(retry.commandId, first.commandId);
assert.deepEqual(retry.input, first.input);
assert.equal(state.resolve(first, accepted.payload), 'ignored');
assert.equal(state.resolve(retry, accepted.payload), 'applied');
state.activateScope('synthetic:new-scope');
const stale = state.submit('accept', inputFor(accepted), 'submit');
state.activateAccount(accepted.actor_id);
state.activateScope('synthetic:new-session');
assert.equal(state.resolve(stale, accepted.payload), 'ignored');
assert.equal(state.reject(stale, { status: 401, code: 'UNAUTHENTICATED' }), 'ignored');
const conflict = state.submit('accept', inputFor(accepted), 'submit');
state.reject(conflict, { status: 409, code: 'VERSION_CONFLICT' });
assert.equal(state.snapshot().phase, 'conflict');
assert.throws(() => state.retry('retry'));
state.dispose();
assert.equal(state.snapshot().input, null);

process.stdout.write(JSON.stringify({ status: 'passed', positive_cases: positive.length, negative_cases: negative.length,
  state_scenarios: 4, positive, negative, database_connections: 0, http_requests: 0,
  scope: 'Actual offline PHP group use-case outputs through TypeScript parser, codec and action state; no production wiring.' }) + '\n');
