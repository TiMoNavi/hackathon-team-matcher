#!/usr/bin/env python3
"""Fixed T1/T2 browser wrapper. Run only from the owned chat harness.

Requires the existing eight-message/revoked-empty synthetic fixture. It never
seeds, resets receipts, starts/stops services, sends messages or changes read
gates. The only configuration mutation is takeover on, restored off in finally.
Credentials stay in memory and reach the fixed Node child through stdin only.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

import verify_reading as v

h = v.h
INTEGRATION = h.BACKEND.parent / 'frontend/对话 群聊页面/integration'
OUTPUT = INTEGRATION / 'artifacts/entry-browser'
CHILD_REPORT = 'integration/artifacts/entry-browser/entry-browser-report.json'
WRAPPER_REPORT = 'integration/artifacts/entry-browser/entry-browser-wrapper-report.json'
FIXED_COUNTS = {'user': 3, 'profile': 3, 'message': 3, 'user_message': 6, 'message_entry': 8, 'file': 0, 'space': 0}
GATES = ('ui_enabled', 'chat_read_enabled', 'chat_ui_read_enabled', 'chat_entry_takeover_enabled')
CHILD_STAGES = {'preflight', 'native-login-a', 'native-index', 'native-history', 'viewport-layout',
                'deep-link-reload', 'focus-install', 'focus-switch', 'focus-clear', 'focus-restore',
                'native-login-b', 'mixed-coverage', 'safe-output'}


def require(value, message='Fixed browser precondition refused.'):
    h.require(value, message)


def positive(value):
    return type(value) is int and 0 < value <= 9007199254740991


def fixture_snapshot(info, value):
    require(all(info.get('counts', {}).get(key) == expected for key, expected in FIXED_COUNTS.items()))
    require(all(info.get('modules', {}).get(name, {}).get('enabled') is True for name in h.CHAT_MODULES))
    require(info.get('baseline_installed') is True and info.get('empty_business_data') is False)
    require(value.get('status') == 'passed' and value.get('database') == h.DB)
    ids = value['synthetic_ids']
    require(set(ids) == {'actors', 'conversations', 'entries'})
    require(set(ids['actors']) == {'a', 'b', 'outsider'} and set(ids['conversations']) == {'history', 'empty', 'unmanaged'})
    for group in (list(ids['actors'].values()), list(ids['conversations'].values()), ids['entries']):
        require(all(positive(item) for item in group) and len(group) == len(set(group)))
    require(len(ids['entries']) == 7)  # v.snapshot separately verifies owned SQL append #8.
    metadata = value['metadata']
    require(len(metadata) == 2)
    indexed = {int(row['message_id']): row for row in metadata}
    require(set(indexed) == {ids['conversations']['history'], ids['conversations']['empty']})
    require(indexed[ids['conversations']['history']]['status'] == 'active'
            and int(indexed[ids['conversations']['history']]['last_seq']) == 8)
    require(indexed[ids['conversations']['empty']]['status'] == 'revoked'
            and int(indexed[ids['conversations']['empty']]['last_seq']) == 0)
    reads = {}
    for role in ('a', 'b'):
        rows = [row for row in value['read_state'] if int(row['message_id']) == ids['conversations']['history']
                and int(row['user_id']) == ids['actors'][role]]
        require(len(rows) == 1 and int(rows[0]['generation']) > 0 and int(rows[0]['read_seq']) in (7, 8))
        reads[role] = int(rows[0]['read_seq'])
    return ids, reads


def accounts(config):
    file = h.RUNTIME / 'c04-fixture.json'
    h.checked_path(file, mode=0o600)
    require(file.resolve(strict=True) == file and file.stat().st_nlink == 1)
    require(file.stat().st_size <= 8192)
    source = json.loads(file.read_text())
    require(source.get('kind') == 'chat-c04-synthetic-v1' and source.get('nonce') == config['nonce'])
    require(set(source.get('actors', {})) == {'a', 'b', 'outsider'})
    result = {}
    for role in ('a', 'b', 'outsider'):
        row = source['actors'][role]
        require(row.get('username') == 'chat_c04_' + role and isinstance(row.get('password'), str)
                and re.fullmatch('[a-f0-9]{48}', row['password']) is not None)
        if role in ('a', 'b'):
            result[role] = {'username': row['username'], 'password': row['password']}
    return result


def write_report(report):
    require(INTEGRATION.resolve(strict=True) == INTEGRATION)
    for directory in (INTEGRATION / 'artifacts', OUTPUT):
        if not directory.exists() and not directory.is_symlink():
            directory.mkdir(mode=0o700)
        h.checked_path(directory, directory=True)
        require(directory.resolve(strict=True) == directory)
    target = OUTPUT / 'entry-browser-wrapper-report.json'
    if target.exists() or target.is_symlink():
        h.checked_path(target)
        require(target.stat().st_nlink == 1)
    require(hasattr(os, 'O_NOFOLLOW'))
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_uid == os.geteuid())
        stream.truncate(0)
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write(chr(10))


def child_summary(result):
    require(len(result.stdout) < 4096)
    value = json.loads(result.stdout.strip())
    require(set(value) == {'passed', 'checks', 'normalNativeFormLogins', 'receiptWrites', 'failedStage', 'report'})
    require(type(value['passed']) is bool and all(type(value[key]) is int and 0 <= value[key] <= 1000
                for key in ('checks', 'normalNativeFormLogins', 'receiptWrites')))
    require(value['report'] == CHILD_REPORT and (value['failedStage'] is None
            or isinstance(value['failedStage'], str) and value['failedStage'] in CHILD_STAGES))
    require(value['receiptWrites'] == 0)
    return value


def main():
    stage = 'guard'
    failed_stage = None
    before = None
    original = None
    changed = False
    summary = None
    report = {'stage': 'T1-T2-isolated-entry-browser-wrapper', 'passed': False, 'target': 'http://127.0.0.1:8124',
              'fixture': 'eight-messages-empty-revoked', 'normalNativeFormLogins': 0,
              'readState': {'before': None, 'after': None, 'unchanged': False},
              'snapshotUnchanged': False, 'nativeSeenUnchanged': False, 'gatesRestored': False,
              'credentialsTransport': 'private-memory-to-child-stdin', 'credentialsReturned': False,
              'receiptWrites': 0, 'receiptWriteVerification': 'not-exercised-all-put-blocked',
              'messageSendAttempted': False, 'dataResetAttempted': False, 'childReport': CHILD_REPORT}
    try:
        require(len(sys.argv) == 1, 'Target overrides are unsupported.')
        with h.locked():
            config = h.runtime_guard()
            h.database_guard(config)
            require(h.owned_server() is not None, 'The fixed owned server must be running.')
            original = h.control('inspect')
            require(all(original.get(key) is True for key in GATES[:3])
                    and original.get('chat_entry_takeover_enabled') is False, 'Read gates must be on and takeover off.')
            before = v.snapshot()
            ids, reads = fixture_snapshot(original, before)
            report['readState']['before'] = reads
            private = accounts(config)
            payload = {'kind': 'chat-entry-browser-stdin-v1', 'parent_pid': os.getpid(), 'actors': {},
                       'conversations': ids['conversations'], 'read_seq': reads}
            for role in ('a', 'b'):
                payload['actors'][role] = {**private[role], 'id': ids['actors'][role]}
            script = INTEGRATION / 'scripts/verify-entry-browser.mjs'
            h.checked_path(script)
            require(script.resolve(strict=True) == script)
            try:
                stage = 'enable-takeover'
                changed = True
                enabled = h.control('chat-takeover-on')
                require(all(enabled.get(key) is True for key in GATES))
                require(v.snapshot() == before, 'Takeover switch changed chat records.')
                stage = 'browser'
                env = h.clean_environment()
                for name in ('NODE_OPTIONS', 'NODE_PATH', 'PLAYWRIGHT_BROWSERS_PATH', 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD',
                             'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'DEBUG'):
                    env.pop(name, None)
                result = subprocess.run(['node', str(script)], cwd=INTEGRATION, input=json.dumps(payload),
                                        capture_output=True, text=True, timeout=300, env=env)
                summary = child_summary(result)
                report['normalNativeFormLogins'] = summary['normalNativeFormLogins']
                report['child'] = summary
                require(result.returncode == 0 and summary['passed'] is True)
            except Exception:
                failed_stage = stage
                raise
            finally:
                # Never restore a receipt, message, native seen timestamp or fixture row.
                if changed:
                    try:
                        stage = 'restore-takeover'
                        restored = h.control('chat-takeover-off')
                        report['gatesRestored'] = all(restored.get(key) == original.get(key) for key in GATES)
                        stage = 'after-snapshot'
                        after = v.snapshot()
                        _, after_reads = fixture_snapshot(restored, after)
                        report['readState']['after'] = after_reads
                        report['readState']['unchanged'] = reads == after_reads
                        report['snapshotUnchanged'] = before == after
                        report['nativeSeenUnchanged'] = before['native_seen'] == after['native_seen']
                        require(report['gatesRestored'] and report['snapshotUnchanged'], 'Post-browser state differs; no reset performed.')
                    except Exception:
                        failed_stage = stage
                        raise
            stage = 'complete'
            report['passed'] = True
    except Exception:
        report['failure'] = {'stage': failed_stage or stage, 'reason': 'Sanitized verification failure; private diagnostics suppressed.'}
    try:
        write_report(report)
    except Exception:
        report['passed'] = False
        report['failure'] = {'stage': 'safe-output', 'reason': 'Artifact path refused; private diagnostics suppressed.'}
    print(json.dumps({'passed': report['passed'], 'normalNativeFormLogins': report['normalNativeFormLogins'],
                      'readState': report['readState'], 'snapshotUnchanged': report['snapshotUnchanged'],
                      'nativeSeenUnchanged': report['nativeSeenUnchanged'], 'gatesRestored': report['gatesRestored'],
                      'receiptWrites': report['receiptWrites'], 'failedStage': report.get('failure', {}).get('stage'),
                      'report': WRAPPER_REPORT}))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
