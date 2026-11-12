#!/usr/bin/env python3
"""Own the fixed harness lock before starting the chat-only browser exercise."""
import json
import subprocess
import sys
import harness as h

try:
    h.require(len(sys.argv) == 1, 'Browser target overrides are unsupported.')
    with h.locked():
        config = h.runtime_guard(); h.database_guard(config)
        h.require(h.owned_server() is not None, 'The fixed owned server must be running.')
        file = h.RUNTIME / 'c04-fixture.json'; h.checked_path(file, mode=0o600)
        private = json.loads(file.read_text())
        h.require(private['kind'] == 'chat-c04-synthetic-v1' and private['nonce'] == config['nonce'], 'Fixture provenance mismatch.')
        info = h.control('inspect')
        h.require(info['chat_read_enabled'] and info['chat_ui_read_enabled'], 'Both read gates must be enabled.')
        folder = h.BACKEND.parent / 'frontend/对话 群聊页面/integration'
        command = ['node', str(folder / 'scripts/verify-read-browser.mjs')]
        result = subprocess.run(command, cwd=folder, capture_output=True, text=True, timeout=240, env=h.clean_environment())
        # The Node script's summary has a strict small allowlist. Never forward its stderr.
        summary = json.loads(result.stdout.strip())
        h.require(set(summary) == {'passed','checks','normalNativeFormLogins','receiptWrites','failedStage','report'}, 'Browser summary shape mismatch.')
        h.require(type(summary['passed']) is bool and all(type(summary[k]) is int for k in ['checks','normalNativeFormLogins','receiptWrites'])
            and (summary['failedStage'] is None or isinstance(summary['failedStage'],str) and len(summary['failedStage']) < 80)
            and summary['report'] == 'integration/artifacts/read-browser/read-browser-report.json', 'Browser result refused.')
        print(json.dumps(summary))
        if result.returncode != 0 or summary['passed'] is not True: sys.exit(1)
except Exception as exc:
    print(json.dumps({'status':'failed','reason':str(exc) if isinstance(exc,h.Refusal) else type(exc).__name__,'private_diagnostics_suppressed':True})); sys.exit(1)
