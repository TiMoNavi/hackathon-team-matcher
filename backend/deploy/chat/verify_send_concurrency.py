#!/usr/bin/env python3
"""Two independent PHP/SQL processes, fixed C05 pairs and explicit lock barriers."""
import json
import os
import selectors
import subprocess
import sys
import time
import verify_sending as s

h, v = s.h, s.v
REPORT = h.BACKEND.parent / 'docs/群聊模块升级/sources/c05-send-sql_2026-11-12.json'
PROBE = h.BACKEND / 'protected/modules/matcher-chat/tests/isolated-send.php'
stage = 'guard'
children = []

class Child:
    def __init__(self, mode):
        self.mode = mode; self.buffer = b''; self.lines = []
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
            self.buffer += chunk; h.require(len(self.buffer) < 16000, 'SQL probe output bound exceeded.')
        line, self.buffer = self.buffer.split(b'\n', 1); value = line.decode('utf8'); self.lines.append(value); return value
    def signal(self, expected):
        h.require(self.line() == expected, 'SQL probe fixed handshake mismatch.')
    def release(self):
        self.p.stdin.write(b'continue\n'); self.p.stdin.flush()
    def finish(self):
        value = json.loads(self.line()); self.p.wait(timeout=25)
        h.require(self.p.returncode == 0 and value.get('status') == 'passed' and value.get('mode') == self.mode, 'Fixed SQL probe failed.')
        h.require(not self.buffer.strip() and not self.p.stdout.read(4096).strip() and not self.p.stderr.read(4096).strip(), 'Unexpected SQL diagnostics.')
        return value
    def waiting(self):
        with selectors.DefaultSelector() as selector:
            selector.register(self.p.stdout, selectors.EVENT_READ)
            ready = selector.select(0.25)
        h.require(not ready and self.p.poll() is None and not self.buffer, 'Peer finished before the lock holder released.')

def single(mode):
    child = Child(mode); child.signal('__CHAT_C05_ATTEMPTING__'); return child.finish()

def pair(left_mode, right_mode):
    left = Child(left_mode); left.signal('__CHAT_C05_ATTEMPTING__'); left.signal('__CHAT_C05_READY__')
    right = Child(right_mode); right.signal('__CHAT_C05_ATTEMPTING__'); right.waiting()
    left.release(); first = left.finish()
    if right_mode.startswith('hold-'):
        right.signal('__CHAT_C05_READY__'); right.release()
    second = right.finish()
    return {'holder': first, 'peer': second, 'independent_processes': True, 'peer_pending_until_holder_release': True}

def run():
    global stage
    h.require(len(sys.argv) == 1, 'No SQL probe overrides.')
    config = h.runtime_guard(); h.database_guard(config); h.checked_path(PROBE)
    info = h.control('inspect'); v.check('real send gate enabled', info['chat_send_enabled'])
    before = s.fixture(); results = []; new = 0
    v.check('owned pair initially friends and unblocked', before['friendship_rows'] == 2 and before['blocked_rows'] == 0)
    try:
        stage = 'same-key-overlap'
        result = pair('hold-send', 'dedupe-send'); results.append(result)
        v.check('same-key concurrent peer replays holder message', result['holder']['http_status'] in [200, 201]
                and result['peer']['http_status'] == 200 and result['peer']['replayed'] and result['holder']['seq'] == result['peer']['seq'])
        new += int(result['holder']['http_status'] == 201)
        stage = 'different-body-overlap'
        result = pair('hold-send', 'changed-send'); results.append(result)
        v.check('same-key different body conflict after holder', result['peer']['http_status'] == 409 and result['peer']['error_code'] == 'IDEMPOTENCY_CONFLICT')
        stage = 'distinct-key-overlap'
        result = pair('hold-send', 'try-send'); results.append(result)
        v.check('different key obtains a distinct later sequence', result['peer']['http_status'] in [200, 201] and result['peer']['seq'] > result['holder']['seq'])
        new += int(result['peer']['http_status'] == 201)
        stage = 'send-before-unfriend'
        result = pair('hold-new-unfriend', 'delete-friend'); results.append(result)
        v.check('send lock serializes before native-table unfriend', result['holder']['http_status'] in [200, 201] and result['peer']['deleted_friendship_rows'] == 2)
        new += int(result['holder']['http_status'] == 201)
        result = single('try-send'); results.append(result)
        v.check('unfriend blocks existing-key replay', result['http_status'] == 403 and result['error_code'] == 'SEND_FORBIDDEN')
        s.fixture('refriend')
        stage = 'unfriend-before-send'
        result = pair('hold-unfriend', 'try-new-unfriend'); results.append(result)
        v.check('pending unfriend commits before send authority', result['holder']['deleted_friendship_rows'] == 2 and result['peer']['http_status'] == 403)
        s.fixture('refriend')
        stage = 'send-before-block'
        result = pair('hold-new-block', 'hold-block'); results.append(result)
        v.check('missing block key locked until accepted send finishes', result['holder']['http_status'] in [200, 201] and result['peer']['blocked_pair_count'] == 1)
        new += int(result['holder']['http_status'] == 201)
        s.fixture('unblock')
        stage = 'block-before-send'
        result = pair('hold-block', 'try-new-block'); results.append(result)
        v.check('pending block commits before send authority', result['holder']['blocked_pair_count'] == 1 and result['peer']['http_status'] == 403)
        s.fixture('unblock')
        stage = 'atomic-failure'
        result = single('rollback-send'); results.append(result)
        v.check('after-receipt failure rolls back native text seq and receipt', result['rollback_verified'] and result['no_new_message'])
        stage = 'durable-quota'
        result = single('quota-rollback'); results.append(result)
        v.check('actual SQL sliding quota rejects then fully rolls back', result['quota_denied'] and result['all_temporary_rows_rolled_back'])
    finally:
        for child in children:
            if child.p.poll() is None:
                child.p.kill(); child.p.wait(timeout=10)
        s.fixture('refriend'); s.fixture('unblock')
    after = s.fixture()
    v.check('C04 eight messages and receipt data preserved', after['legacy_hash'] == before['legacy_hash'] and after['legacy_preserved'])
    v.check('only fixed accepted new sends persisted', after['message_count'] == before['message_count'] + new)
    v.check('read states and original queue unchanged', after['read_state'] == before['read_state'] and after['native_seen'] == before['native_seen'] and after['queue_count'] == before['queue_count'])
    report = {'status': 'passed', 'database': h.DB, 'check_count': len(v.checks), 'checks': v.checks, 'cases': results,
              'new_messages': new, 'fixture_messages': after['message_count'], 'legacy_preserved': True,
              'credentials_returned': False, 'http_requests': 0, 'real_ai_calls': 0,
              'limitations': ['SQL relation changes model native table writes; native AR hooks, lock-order variants and deadlock retries not validated.',
                              'Overlaps use independent processes and held-lock handshakes; no HTTP concurrency claim.',
                              'Quota rollback may advance native auto-increment allocation; no row reset or ID reuse performed.']}
    h.require(not REPORT.is_symlink(), 'Unsafe SQL report path.')
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + chr(10))
    print(json.dumps({k: value for k, value in report.items() if k not in ['checks', 'cases']}, ensure_ascii=False))

if __name__ == '__main__':
    try:
        with h.locked(): run()
    except Exception as error:
        print(json.dumps({'status': 'failed', 'stage': stage, 'reason': str(error) if isinstance(error, h.Refusal) else type(error).__name__, 'checks': len(v.checks)}, ensure_ascii=False)); sys.exit(1)
