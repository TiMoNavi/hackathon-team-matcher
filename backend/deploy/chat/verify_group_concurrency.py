#!/usr/bin/env python3
"""Fixed C07A SQL barriers, rollback and quota; no arbitrary targets."""
import json
import os
import selectors
import subprocess
import sys
import time
import verify_groups as g

h, v = g.h, g.v
REPORT = h.BACKEND.parent / 'docs/群聊模块升级/sources/c07a-lifecycle-sql_2026-11-13.json'
PROBE = h.BACKEND / 'protected/modules/matcher-chat/tests/isolated-groups.php'
stage = 'guard'
children = []


class Child:
    def __init__(self, mode):
        self.mode = mode
        self.buffer = b''
        self.p = subprocess.Popen(h.php_command() + [str(PROBE), mode], stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=h.clean_environment())
        children.append(self)

    def line(self, timeout=25):
        deadline = time.monotonic() + timeout
        while b'\n' not in self.buffer:
            with selectors.DefaultSelector() as selector:
                selector.register(self.p.stdout, selectors.EVENT_READ)
                ready = selector.select(max(0, deadline - time.monotonic()))
            h.require(bool(ready), 'SQL probe handshake timed out.')
            chunk = os.read(self.p.stdout.fileno(), 4096)
            h.require(bool(chunk), 'SQL probe closed before handshake.')
            self.buffer += chunk
            h.require(len(self.buffer) < 16000, 'SQL probe output bound exceeded.')
        line, self.buffer = self.buffer.split(b'\n', 1)
        return line.decode('utf8')

    def signal(self, expected):
        h.require(self.line() == expected, 'SQL probe fixed handshake mismatch.')

    def release(self):
        self.p.stdin.write(b'continue\n')
        self.p.stdin.flush()

    def finish(self):
        value = json.loads(self.line())
        self.p.wait(timeout=25)
        h.require(self.p.returncode == 0 and value.get('status') == 'passed'
                  and value.get('mode') == self.mode, 'Fixed SQL probe failed.')
        h.require(not self.buffer.strip() and not self.p.stdout.read(4096).strip()
                  and not self.p.stderr.read(4096).strip(), 'Unexpected SQL diagnostics.')
        return value

    def waiting(self):
        with selectors.DefaultSelector() as selector:
            selector.register(self.p.stdout, selectors.EVENT_READ)
            ready = selector.select(0.25)
        h.require(not ready and self.p.poll() is None and not self.buffer,
                  'Peer finished before the lock holder released.')


def single(mode):
    child = Child(mode)
    child.signal('__CHAT_C07_ATTEMPTING__')
    return child.finish()


def pair(left_mode, right_mode):
    left = Child(left_mode)
    left.signal('__CHAT_C07_ATTEMPTING__')
    left.signal('__CHAT_C07_READY__')
    right = Child(right_mode)
    right.signal('__CHAT_C07_ATTEMPTING__')
    right.waiting()
    left.release()
    return {'holder': left.finish(), 'peer': right.finish(), 'independent_processes': True,
            'peer_pending_until_holder_release': True}


def cleanup():
    failures = []
    for child in children:
        try:
            if child.p.poll() is None:
                child.p.kill()
                child.p.wait(timeout=10)
        except Exception:
            failures.append('owned child cleanup')
    for action in ['refriend', 'unblock']:
        try:
            g.fixture(action)
        except Exception:
            failures.append(action)
    h.require(not failures, 'Fixed cleanup failed: '+', '.join(failures))


def run():
    global stage
    h.require(len(sys.argv) == 1, 'No SQL probe overrides.')
    h.require(not REPORT.exists() and not REPORT.is_symlink(), 'Completed SQL evidence exists; do not replay destructive test transitions.')
    config = h.runtime_guard()
    h.database_guard(config)
    h.checked_path(PROBE)
    v.check('owned server running', h.owned_server() is not None)
    state = h.control('inspect')
    v.check('group opt-in and direct read enabled', state['chat_groups_opt_in'] and state['chat_read_enabled'] and state['chat_ui_read_enabled'])
    before = g.fixture()
    v.check('fixed friends initially valid', before['friendship_rows'] == 2 and before['blocked_rows'] == 0)
    file = h.RUNTIME / 'c07a-fixture.json'
    h.checked_path(file, mode=0o600)
    private = json.loads(file.read_text())
    v.check('owned native credentials', private['kind'] == 'chat-c07a-group-v1' and private['nonce'] == config['nonce'])
    a = v.Client()
    a.login(private['actors']['a'])
    results = []
    new_writes = 0
    try:
        stage = 'prepare-through-http'
        for base, title in [(20, 'Synthetic C07A concurrency'), (30, 'Synthetic C07A unfriend'), (40, 'Synthetic C07A block')]:
            status, _, data = a.json('/api/v1/conversations/groups', method='POST',
                data=g.command('create', base, title), csrf=True)
            v.check('dedicated group created '+str(base), status in [200, 201])
            group = data['data']['group']['conversation_id']
            new_writes += status == 201
            status, _, data = a.json('/api/v1/conversations/'+str(group)+'/invitations', method='POST',
                data=g.command('invite', base+1, before['synthetic_ids']['actors']['b']), csrf=True)
            v.check('dedicated invitation pending '+str(base), status in [200, 201] and data['data']['invitation']['status'] == 'pending')
            new_writes += status == 201
        prepared = g.fixture()
        for mode in ['rollback-create', 'rollback-accept', 'quota-rollback']:
            stage = mode
            result = single(mode)
            results.append(result)
            if mode.startswith('rollback-'):
                v.check(mode+' full database rollback', result['result']['full_rollback'])
            else:
                for operation in ['create', 'invite']:
                    v.check(operation+' persistent quota and rollback', result['result'][operation]['quota_observed'])
        stage = 'same-accept-overlap'
        result = pair('hold-accept', 'try-accept')
        results.append(result)
        first, second = result['holder']['result'], result['peer']['result']
        v.check('one acceptance and one replay', not first['replayed'] and second['replayed']
                and first['conversation_id'] == second['conversation_id'] and first['membership_generation'] == second['membership_generation'] == 1)
        stage = 'native-unfriend-before-accept'
        result = pair('hold-unfriend', 'try-unfriend')
        results.append(result)
        v.check('unfriend commits before rejected accept', result['holder']['result']['native_change_committed']
                and result['peer']['result']['authorization_denied'] == 'GROUP_TARGET_UNAVAILABLE'
                and result['peer']['result']['membership_added'] is False)
        g.fixture('refriend')
        stage = 'native-block-before-accept'
        result = pair('hold-block', 'try-block')
        results.append(result)
        v.check('block commits before rejected accept', result['holder']['result']['native_change_committed']
                and result['peer']['result']['authorization_denied'] == 'GROUP_TARGET_UNAVAILABLE'
                and result['peer']['result']['membership_added'] is False)
    finally:
        cleanup()
    after = g.fixture()
    v.check('only one accepted membership and receipt persisted', after['receipt_count'] == prepared['receipt_count']+1
            and len(after['native_members']) == len(prepared['native_members'])+1
            and len(after['members']) == len(prepared['members'])+1)
    v.check('rollback leaves group and invite counts', after['group_count'] == prepared['group_count']
            and after['invitation_count'] == prepared['invitation_count'])
    v.check('legacy revoked data messages files and queue preserved', after['legacy_hash'] == before['legacy_hash']
            and after['old_terminal_revoked'] and after['total_message_count'] == 28 and after['file_count'] == 16 and after['queue_count'] == 1)
    v.check('fixed friendship and block restored', after['friendship_rows'] == 2 and after['blocked_rows'] == 0)
    report = {'status': 'passed', 'database': h.DB, 'http_requests_for_fixture': v.requests,
        'http_new_fixture_writes': new_writes, 'checks': len(v.checks), 'assertions': v.checks, 'cases': results,
        'group_count': after['group_count'], 'invitation_count': after['invitation_count'], 'receipt_count': after['receipt_count'],
        'legacy_preserved': True, 'credentials_returned': False, 'real_ai_calls': 0,
        'limitations': ['SQL overlaps use independent processes with held-lock barriers, not concurrent HTTP requests.',
            'Native relation mutations use real SQL rows; native AR hooks, reverse lock ordering and deadlock recovery are not claimed.',
            'Quota and rollback can advance auto-increment allocations; no sequence reset or fixture data deletion.',
            'Group messages, attachments, browser UI and activity discussions remain outside C07-A1.']}
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({k: value for k, value in report.items() if k not in ['assertions', 'cases']}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        with h.locked():
            run()
    except Exception as error:
        report = {'status': 'failed', 'stage': stage, 'http_requests': v.requests, 'checks': len(v.checks),
                  'reason': str(error) if isinstance(error, h.Refusal) else 'Private diagnostics suppressed.'}
        failure = REPORT.with_name('c07a-lifecycle-sql-failure_2026-11-13.json')
        if not failure.is_symlink():
            failure.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
        print(json.dumps(report, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
