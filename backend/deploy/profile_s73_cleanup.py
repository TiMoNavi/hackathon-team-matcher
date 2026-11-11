#!/usr/bin/env python3
"""Remove only the two S7.3 clones after their acceptance evidence has passed."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / 'backend/.runtime'
SOURCES = ROOT / 'docs/用户画像收集/sources'
TARGETS = {'root': ('humhub_profile_s73_test_root_4a70f3d1', 8102), 'audit': ('humhub_profile_s73_test_audit_b7a2c940', 8103)}

def require(condition, reason):
    if not condition:
        raise RuntimeError(reason)

def port_open(port):
    with socket.socket() as client:
        client.settimeout(0.2)
        return client.connect_ex(('127.0.0.1', port)) == 0

def mysql(sql):
    proc = subprocess.run([str(RUNTIME / 'php-mysql/bin/mysql'), '--defaults-extra-file=' + str(RUNTIME / 'mysql-root.cnf'), '-N', '-B', '-e', sql], capture_output=True, text=True)
    require(proc.returncode == 0, 'Exact-target database cleanup failed; credentials and SQL diagnostics omitted.')
    return proc.stdout.strip()

def main():
    require(sys.argv[1:] == ['--execute'], 'Use --execute after the S7.3 acceptance reports pass.')
    marker_path = RUNTIME / 'profile-s73-test-dbs.json'
    marker = json.loads(marker_path.read_text())
    require(marker['databases'] == {role: target for role, (target, _) in TARGETS.items()}, 'Unexpected clone manifest.')
    for name in ['s73_audit_http', 's73_audit_performance_review', 's73-http-final', 's73-main-browser', 's73-main-preservation']:
        require(json.loads((SOURCES / (name + '_2026-11-12.json')).read_text())['status'] == 'passed', 'Required acceptance evidence has not passed: ' + name)
    main_pids = {name: int((RUNTIME / (name + '.pid')).read_text().strip()) for name in ['web', 'mysql', 'queue', 'scheduler', 'profile-ai']}
    for pid in main_pids.values():
        os.kill(pid, 0)
    require(port_open(8090), 'Main preview is not available before cleanup.')
    for target, port in TARGETS.values():
        directory = RUNTIME / 'profile-s73' / target
        pid_file = directory / 'http.pid'
        if pid_file.exists():
            pid = int(pid_file.read_text().strip())
            require(pid not in main_pids.values(), 'Test PID unexpectedly belongs to a main service.')
            result = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], capture_output=True, text=True)
            if result.returncode == 0:
                require('s73_http_router.php' in result.stdout and '127.0.0.1:' + str(port) in result.stdout, 'Test PID ownership no longer matches.')
                os.kill(pid, signal.SIGTERM)
        for _ in range(20):
            if not port_open(port):
                break
            time.sleep(0.1)
        require(not port_open(port), 'Test HTTP port remains active.')
        grant_count = int(mysql("SELECT COUNT(*) FROM mysql.db WHERE Db='" + target + "' AND User='humhub_preview' AND Host='localhost'"))
        if grant_count:
            mysql("REVOKE ALL PRIVILEGES ON " + target + ".* FROM 'humhub_preview'@'localhost'")
        mysql('DROP DATABASE IF EXISTS ' + target)
        require(mysql("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + target + "'") == '0', 'Test database still exists.')
        require(mysql("SELECT COUNT(*) FROM mysql.db WHERE Db='" + target + "' AND User='humhub_preview' AND Host='localhost'") == '0', 'Test database grant still exists.')
        if directory.exists():
            require(directory.resolve().parent == (RUNTIME / 'profile-s73').resolve(), 'Unexpected runtime path.')
            shutil.rmtree(directory)
    for name, pid in main_pids.items():
        require(int((RUNTIME / (name + '.pid')).read_text().strip()) == pid, 'Main service PID changed: ' + name)
        os.kill(pid, 0)
    require(port_open(8090), 'Main preview stopped during cleanup.')
    require(mysql('SELECT COUNT(*) FROM humhub_preview.user') == '103', 'Main account count changed.')
    require(mysql('SELECT COUNT(*) FROM humhub_preview.space') == '4', 'Main Space count changed.')
    marker['status'] = 'cleaned'
    marker['cleaned_at_utc'] = datetime.now(timezone.utc).isoformat()
    marker_path.write_text(json.dumps(marker, ensure_ascii=False, indent=2) + chr(10))
    report = {'status': 'passed', 'removed_databases': [target for target, _ in TARGETS.values()], 'removed_ports': [port for _, port in TARGETS.values()], 'scoped_grants_removed': True, 'isolated_runtime_directories_removed': True, 'main_service_pids_unchanged': True, 'main_http_8090_available': True, 'main_accounts': 103, 'main_spaces': 4, 'backup_pointer_retained': (RUNTIME / 'profile-s73-backup-path').exists(), 'synthetic_dataset_retained': (ROOT / 'docs/用户画像收集/examples/s73-people_2026-11-12.json').exists()}
    (SOURCES / 's73-cleanup_2026-11-12.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + chr(10))
    print(json.dumps(report, ensure_ascii=False))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'failed', 'error_type': type(error).__name__, 'reason': str(error) if isinstance(error, RuntimeError) else 'Cleanup stopped; inspect the exact-target preconditions.'}))
        raise SystemExit(1)
