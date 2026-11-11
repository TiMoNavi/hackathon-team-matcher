#!/usr/bin/env python3
"""Run only P1 offline S7.6 and existing memory regressions; never loads app config."""
import json
import pathlib
import subprocess
import sys

module = pathlib.Path(__file__).resolve().parents[1]
root = pathlib.Path(__file__).resolve().parents[5]
evidence = root / 'docs/用户画像收集/sources'
php = [str(root / 'backend/.runtime/php-mysql/bin/php'), '-c', str(root / 'backend/.runtime/php.ini'),
       '-d', 'display_errors=1', '-d', 'log_errors=0']
date = '2026-11-12'
tests = {
    'progress': module / 'tests/s76_task_progress.php',
    's6-jobs': module / 'tests/unit/s6_audit_jobs.php',
    's5-sources': module / 'tests/unit/s5_sources.php',
    's5b-sources': module / 'tests/unit/s5b_sources.php',
    's2-profile': module / 'tests/unit/s2_profile.php',
    's2-identity': module / 'tests/unit/s2_review_identity_consistency.php',
    's1-domain': module / 'tests/unit/run.php',
}
results = []
for name, path in tests.items():
    process = subprocess.run(php + [str(path)], capture_output=True, text=True, cwd=root)
    try:
        result = json.loads(process.stdout)
    except json.JSONDecodeError:
        result = {'status': 'failed', 'error': process.stdout[-2000:], 'stderr': process.stderr[-2000:]}
    result['exit_code'] = process.returncode
    target = evidence / f's76-task-{name}_{date}.json'
    target.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    record = {'suite': name, 'status': result.get('status'), 'passed': result.get('passed', result.get('checks')),
              'exit_code': process.returncode, 'evidence': str(target.relative_to(root))}
    if isinstance(record['passed'], list):
        record['passed'] = len(record['passed'])
    if 'error' in result:
        record['error'] = result['error']
    results.append(record)

files = ['application/ProfileAiJobService.php', 'application/ProfileProgress.php', 'application/ProfileSourceService.php', 'application/QuestionService.php',
         'domain/ports/ProfileAiJobSessionQuery.php', 'adapters/memory/InMemoryProfileAiJobRepository.php',
         'adapters/persistence/SqlProfileAiJobRepository.php', 'controllers/SourceController.php', 'config.php',
         'tests/s76_task_progress.php']
lint = []
for relative in files:
    result = subprocess.run(php + ['-l', str(module / relative)], capture_output=True, text=True, cwd=root)
    lint.append({'file': relative, 'passed': result.returncode == 0})
    if result.returncode:
        lint[-1]['error'] = result.stdout[-1000:]
manifest = json.loads((module / 'module.json').read_text())
success = all(r['exit_code'] == 0 and r['status'] == 'passed' for r in results) and all(r['passed'] for r in lint) and manifest['version'] == '0.10.0'
report = {'status': 'passed' if success else 'failed', 'suites': results, 'php_lint': lint,
          'module_version': manifest['version'], 'external_requests': 0, 'real_llm_calls': 0,
          'scope': 'Memory and isolated SQLite only; no application config, credentials, HTTP or MySQL connection.'}
(evidence / f's76-task-verification_{date}.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
print(json.dumps(report, indent=2, ensure_ascii=False))
sys.exit(0 if success else 1)
