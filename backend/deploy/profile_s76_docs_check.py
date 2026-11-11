#!/usr/bin/env python3
"""Check final S7.6 receipts, documentation and protected project surfaces."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'docs/用户画像收集'
RUNTIME = ROOT / 'backend/.runtime'
SOURCES = DOCS / 'sources'
OUTPUT = SOURCES / 's76-document-check_2026-11-12.json'
checks = {}
broken = []
unclosed = []
for document in DOCS.rglob('*.md'):
    text = document.read_text()
    for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', text):
        if urlsplit(target).scheme:
            continue
        relative = unquote(target.split('#', 1)[0])
        resolved = (document.parent / relative).resolve()
        if relative and not resolved.exists() and resolved != OUTPUT.resolve():
            broken.append({'document': str(document.relative_to(DOCS)), 'target': target})
    if sum(line.startswith(chr(96) * 3) for line in text.splitlines()) % 2:
        unclosed.append(document.name)
checks['relative_links'] = not broken
checks['markdown_fences'] = not unclosed
invalid = []
for source in SOURCES.glob('*.json'):
    try:
        json.loads(source.read_text())
    except (ValueError, UnicodeError):
        invalid.append(source.name)
checks['source_json'] = not invalid
required = ['s76-task-verification', 's76-regression', 's76-root-upgrade', 's76-root-upgrade-repeat', 's76-main-upgrade', 's76-main-browser', 's76-main-preservation', 's76_audit_http', 's76-cleanup']
evidence = {}
for name in required:
    path = SOURCES / (name + '_2026-11-12.json')
    data = json.loads(path.read_text()) if path.exists() else {}
    evidence[name] = data
    checks[name] = data.get('status') == 'passed'
browser = evidence['s76-main-browser']
checks['main_browser_109_checks'] = len(browser.get('checks', [])) == 109 and all(row['passed'] for row in browser.get('checks', []))
preserved = evidence['s76-main-preservation']
checks['original_data_preserved'] = preserved.get('main_total_accounts') == 103 and preserved.get('main_total_spaces') == 4 and all(row['unchanged'] for row in preserved.get('checks', []))
upgrade = evidence['s76-main-upgrade']
checks['installed_versions'] = upgrade.get('modules', {}).get('matcher-user-profile', {}).get('installed_version') == '0.10.0' and upgrade.get('modules', {}).get('matcher-onboarding', {}).get('installed_version') == '0.4.0'
checks['private_backup_verified'] = upgrade.get('backup_checksum_verified') is True
frozen = {
    'docs/简介冻结禁止修改.md': '65cce6d5825b048bb8c074da63e485a224ff4c9488ba864526ba41ba3915be3c',
    'docs/首次注册与开场引导_用户原稿_冻结.md': '370e3bf56aa473a60908c3f6ad49d1d573fa0bc33f848118f9fcef769894aa03',
    'leagcy/docs/用户画像收集/01_原始输入_附件全文.txt': '787622d4f1761fbb148936193afa3fa1941b32a9fd22aca2e98fd66c6c693b12',
    'docs/用户画像收集/examples/s7-people_2026-11-12.json': '7ab26a247d8cfd1daa06022feaacec73dbff16cc3a52975edb57562af02cc77d',
    'docs/用户画像收集/examples/s73-people_2026-11-12.json': '90bc52cf4df27b27af97068f875c870a636ebbc4e073d127bd0b050464297fe6',
}
checks['frozen_and_datasets_unchanged'] = all(hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == digest for path, digest in frozen.items())
protected = {}
for kind in ['core', 'frontend']:
    baseline = json.loads((RUNTIME / ('profile-s76-' + kind + '-baseline.json')).read_text())
    changed = [row['path'] for row in baseline if not (ROOT / row['path']).is_file() or hashlib.sha256((ROOT / row['path']).read_bytes()).hexdigest() != row['sha256']]
    protected[kind] = {'files': len(baseline), 'changed': changed}
    checks[kind + '_unchanged'] = not changed
    if kind == 'frontend':
        actual = {str(path.relative_to(ROOT)) for module in ['matcher-user-profile', 'matcher-onboarding'] for part in ['assets', 'views'] for path in (ROOT / 'backend/protected/modules' / module / part).rglob('*') if path.is_file()}
        checks['frontend_file_set_unchanged'] = actual == {row['path'] for row in baseline}
reference = subprocess.run(['git', '-C', str(ROOT / 'references/humhub'), 'status', '--porcelain'], capture_output=True, text=True)
checks['reference_humhub_clean'] = reference.returncode == 0 and not reference.stdout.strip()
tasks = (DOCS / 'task.md').read_text().splitlines()
completed = {stage: sum('[x] ' + stage + '.' in line for line in tasks) for stage in ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']}
remaining = sum(line.startswith('- [ ] S') for line in tasks)
checks['task_counts'] = completed == {'S1': 8, 'S2': 9, 'S3': 9, 'S4': 9, 'S5': 7, 'S6': 6, 'S7': 4} and remaining == 3 and not (ROOT / 'task.md').exists()
marker = json.loads((RUNTIME / 'profile-s76-test-dbs.json').read_text())
checks['test_runtime_cleaned'] = marker['status'] == 'cleaned' and all(not (RUNTIME / 'profile-s76' / name).exists() for name in marker['databases'].values())
credential_paths = [str(path.relative_to(ROOT)) for path in [*DOCS.rglob('*.md'), *DOCS.rglob('*.json'), ROOT / 'AGENTS.md'] if re.search(r'sk-[A-Za-z0-9]{24,}', path.read_text())]
checks['no_credential_patterns'] = not credential_paths
report = {'status': 'passed' if all(checks.values()) else 'failed', 'checks': checks, 'broken_links': broken, 'unclosed_fences': unclosed, 'invalid_json': invalid, 'protected': protected, 'completed_tasks': completed, 'remaining_tasks': remaining, 'credential_pattern_paths': credential_paths}
OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + chr(10))
print(json.dumps(report, ensure_ascii=False))
raise SystemExit(0 if report['status'] == 'passed' else 1)
