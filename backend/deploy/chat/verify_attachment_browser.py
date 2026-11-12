#!/usr/bin/env python3
"""C05B attachment browser wrapper; owned synthetic credentials pass only through child stdin."""
import json
import os
from pathlib import Path
import subprocess
import sys
import verify_attachments as s

h = s.h
INTEGRATION = h.BACKEND.parent / 'frontend/对话 群聊页面/integration'
SCRIPT = h.HERE / 'verify-attachment-browser.mjs'
OUT = INTEGRATION / 'artifacts/attachment-browser'
GATES = ['ui_enabled', 'chat_read_enabled', 'chat_ui_read_enabled', 'chat_send_enabled', 'chat_attachments_enabled', 'chat_entry_takeover_enabled']

def main():
    stage = 'guard'; before = original = None; changed = False; summary = None
    report = {'passed': False, 'fixture': 'chat-c05b-attachment-v1', 'target': 'http://127.0.0.1:8124',
              'synthetic_only': True, 'credentials_returned': False, 'credentials_transport': 'anonymous-child-stdin',
              'real_ai_calls': 0, 'legacy_preserved': False, 'gates_restored': False}
    try:
        h.require(len(sys.argv) == 1, 'No browser overrides.')
        with h.locked():
            config = h.runtime_guard(); h.database_guard(config)
            h.require(h.owned_server() is not None, 'Owned 8124 must run.')
            original = h.control('inspect')
            h.require(original['baseline_installed'] and all(original[k] for k in GATES[:-1]) and not original[GATES[-1]], 'Fixed browser gates not ready.')
            before = s.fixture(); ids = before['synthetic_ids']
            h.require(before['friendship_rows'] == 2 and before['blocked_rows'] == 0 and before['message_count'] <= 20, 'Synthetic send scope not ready.')
            private = s.accounts(config)
            payload = {'kind': 'chat-c05b-browser-stdin-v1', 'parent_pid': os.getpid(),
                       'actors': {role: {**private[role], 'id': ids['actors'][role]} for role in ['a', 'b']},
                       'conversation_id': ids['conversation_id'], 'initial_message_count': before['message_count'], 'last_seq': before['last_seq']}
            h.checked_path(SCRIPT); h.require(SCRIPT.resolve(strict=True) == SCRIPT, 'Browser script symlink refused.')
            try:
                stage = 'enable-takeover'; changed = True; h.control('chat-takeover-on')
                stage = 'browser'
                env = h.clean_environment()
                for key in ['NODE_OPTIONS', 'NODE_PATH', 'PLAYWRIGHT_BROWSERS_PATH', 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD', 'DEBUG']:
                    env.pop(key, None)
                result = subprocess.run(['node', str(SCRIPT)], cwd=INTEGRATION, input=json.dumps(payload), capture_output=True,
                                        text=True, timeout=240, env=env)
                h.require(len(result.stdout) < 4096, 'Unexpected browser output size.')
                summary = json.loads(result.stdout.strip())
                h.require(set(summary) == {'passed', 'checks', 'normalNativeFormLogins', 'newMessages', 'sendPosts', 'uploadPosts', 'cancelDeletes', 'failedStage', 'report'}, 'Browser summary contract mismatch.')
                h.require(summary['report'] == 'integration/artifacts/attachment-browser/attachment-browser-report.json'
                          and all(type(summary[k]) is int and 0 <= summary[k] <= 1000 for k in ['checks', 'normalNativeFormLogins', 'newMessages', 'sendPosts', 'uploadPosts', 'cancelDeletes']), 'Invalid browser summary values.')
                report['child'] = summary
                h.require(result.returncode == 0 and summary['passed'] and summary['normalNativeFormLogins'] == 2
                          and summary['newMessages'] == 2 and summary['sendPosts'] == 3 and summary['uploadPosts'] == 3 and summary['cancelDeletes'] == 1, 'Browser send checks failed.')
                report['passed'] = True
            finally:
                stage_before_restore = stage; stage = 'restore'
                if changed: h.control('chat-takeover-off')
                after = s.fixture(); final = h.control('inspect')
                report.update({'legacy_preserved': before['legacy_hash'] == after['legacy_hash'] and after['legacy_preserved'],
                               'queue_preserved': before['queue_count'] == after['queue_count'],
                               'native_seen_unchanged': before['native_seen'] == after['native_seen'],
                               'new_messages': after['message_count'] - before['message_count'],
                               'fixture_messages': after['message_count'], 'read_state_before': before['read_state'], 'read_state_after': after['read_state'],
                               'gates_restored': all(original[k] == final[k] for k in GATES)})
                if report['passed']:
                    h.require(report['legacy_preserved'] and report['queue_preserved'] and report['native_seen_unchanged']
                              and report['gates_restored'] and report['new_messages'] == 2, 'Browser storage preservation failed.')
                stage = stage_before_restore
    except Exception as error:
        report['passed'] = False; report['failed_stage'] = stage
        report['reason'] = str(error) if isinstance(error, h.Refusal) else type(error).__name__
    finally:
        for directory in [INTEGRATION / 'artifacts', OUT]:
            if not directory.exists() and not directory.is_symlink(): directory.mkdir(mode=0o700)
            h.checked_path(directory, directory=True); h.require(directory.resolve(strict=True) == directory, 'Unsafe browser output directory.')
        target = OUT / 'attachment-browser-wrapper-report.json'
        h.require(not target.is_symlink(), 'Unsafe browser report path.')
        if target.exists(): h.checked_path(target); h.require(target.stat().st_nlink == 1, 'Unsafe browser report links.')
        with os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600), 'w') as stream:
            stream.truncate(0); json.dump(report, stream, ensure_ascii=False, indent=2); stream.write(chr(10))
        print(json.dumps({k: value for k, value in report.items() if k not in ['read_state_before', 'read_state_after']}, ensure_ascii=False))
    return 0 if report['passed'] else 1

if __name__ == '__main__':
    sys.exit(main())
