#!/usr/bin/env python3
"""Offline regression of existing contracts affected by AI composition acceptance."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
MODULES = ROOT / 'backend/protected/modules'
RUNTIME = ROOT / 'backend/.runtime'
SOURCES = ROOT / 'docs/用户画像收集/sources'
scripts = [
    'matcher-user-profile/tests/unit/run.php',
    'matcher-user-profile/tests/unit/s2_profile.php',
    'matcher-user-profile/tests/discovery_batch/run.php',
    'matcher-profile-privacy/tests/unit/run.php',
    'matcher-profile-privacy/tests/discovery_batch/run.php',
    'matcher-recommendation/tests/browse/run.php',
    'matcher-recommendation/tests/s7_audit_browse.php',
    'matcher-user-profile/tests/unit/s5_sources.php',
    'matcher-user-profile/tests/unit/s5b_sources.php',
    'matcher-user-profile/tests/unit/s6_audit_jobs.php',
    'matcher-onboarding/tests/unit/run.php',
    'matcher-onboarding/tests/unit/s6_workflow.php',
    'matcher-onboarding/tests/unit/s6_worker_recovery.php',
]
results = []
for script in scripts:
    proc = subprocess.run([str(RUNTIME / 'php-mysql/bin/php'), '-c', str(RUNTIME / 'php.ini'), str(MODULES / script)], capture_output=True, text=True)
    try:
        result = json.loads(proc.stdout)
    except ValueError:
        result = {'status': 'unparseable_output'}
    ok = proc.returncode == 0 and (result.get('status') in ['passed', 'ok'] or result.get('passed') is True)
    results.append({'script': script, 'passed': ok, 'exit_code': proc.returncode, 'result': result})
    print(json.dumps({'script': script, 'passed': ok}))
report = {'status': 'passed' if all(item['passed'] for item in results) else 'failed', 'scope': 'Existing offline/in-memory/ephemeral SQLite contracts; no live database, reader or model calls.', 'scripts': len(results), 'results': results}
(SOURCES / 's77-regression_2026-11-12.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
raise SystemExit(0 if report['status'] == 'passed' else 1)
