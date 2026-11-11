#!/usr/bin/env python3
"""Validate S7 documentation, retained evidence and the untouched frontend baseline."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urlsplit

root = Path(__file__).resolve().parents[2]
folder = root / 'docs/用户画像收集'
output = folder / 'sources/s7-document-check_2026-11-12.json'
pattern = re.escape('[') + '([^]]+)' + re.escape('](') + '([^)]+)' + re.escape(')')
broken = []
unclosed = []
documents = sorted([*folder.glob('*.md'), *folder.glob('examples/s7*.md')])
for document in documents:
    body = document.read_text()
    for _, target in re.findall(pattern, body):
        if urlsplit(target).scheme:
            continue
        relative = unquote(target.split('#', 1)[0])
        resolved = (document.parent / relative).resolve()
        if relative and not resolved.exists() and resolved != output.resolve():
            broken.append({'document': document.name, 'target': target})
    if sum(line.startswith(chr(96) * 3) for line in body.splitlines()) % 2:
        unclosed.append(document.name)
invalid_json = []
failed_evidence = []
for source in (folder / 'sources').glob('*.json'):
    if source == output:
        continue
    try:
        data = json.loads(source.read_text())
        if source.name.startswith(('s7-', 's7_')) and 'before-fix' not in source.name and data.get('status') not in ['passed', 'ok']:
            failed_evidence.append(source.name)
    except (ValueError, UnicodeError):
        invalid_json.append(source.name)
frozen = {
    'docs/简介冻结禁止修改.md': '65cce6d5825b048bb8c074da63e485a224ff4c9488ba864526ba41ba3915be3c',
    'docs/首次注册与开场引导_用户原稿_冻结.md': '370e3bf56aa473a60908c3f6ad49d1d573fa0bc33f848118f9fcef769894aa03',
    'leagcy/docs/用户画像收集/01_原始输入_附件全文.txt': '787622d4f1761fbb148936193afa3fa1941b32a9fd22aca2e98fd66c6c693b12',
}
frozen_ok = all(hashlib.sha256((root / name).read_bytes()).hexdigest() == digest for name, digest in frozen.items())
reference = subprocess.run(['git', '-C', str(root / 'references/humhub'), 'status', '--porcelain'], capture_output=True, text=True)
reference_ok = reference.returncode == 0 and reference.stdout.strip() == ''
baseline = json.loads((root / 'backend/.runtime/profile-s7-frontend-baseline.json').read_text())
changed_frontend = [item['path'] for item in baseline if not (root / item['path']).is_file() or hashlib.sha256((root / item['path']).read_bytes()).hexdigest() != item['sha256']]
frontend_paths = {str(path.relative_to(root)) for module in ['matcher-user-profile', 'matcher-onboarding'] for part in ['assets', 'views'] for path in (root / 'backend/protected/modules' / module / part).rglob('*') if path.is_file()}
baseline_paths = {item['path'] for item in baseline}
new_frontend = sorted(frontend_paths - baseline_paths)
tasks = (folder / 'task.md').read_text().splitlines()
completed = {stage: sum('[x] ' + stage + '.' in line for line in tasks) for stage in ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']}
remaining = sum(line.startswith('- [ ] S') for line in tasks)
task_ok = not (root / 'task.md').exists() and completed == {'S1':8, 'S2':9, 'S3':9, 'S4':9, 'S5':7, 'S6':6, 'S7':1} and remaining == 6
cleanup = json.loads((folder / 'sources/s7-cleanup_2026-11-12.json').read_text())
marker = json.loads((root / 'backend/.runtime/profile-s7-test-dbs.json').read_text())
cleanup_ok = cleanup['status'] == 'passed' and marker['status'] == 'cleaned' and all(not (root / 'backend/.runtime/profile-s7' / target).exists() for target in marker['databases'].values())
seed = json.loads((folder / 'sources/s7-main-seed_2026-11-12.json').read_text())
replay = json.loads((folder / 'sources/s7-main-replay_2026-11-12.json').read_text())
seed_ok = seed['created_people'] == 100 and replay['created_people'] == 0 and replay['preserved_people'] == 100 and seed['current_content_sha256'] == replay['current_content_sha256'] and seed['current_space_members'] == {'primary':100,'secondary':20} and seed['current_discoverable'] == {'primary':90,'secondary':18}
dataset_ok = hashlib.sha256((folder / 'examples/s7-people_2026-11-12.json').read_bytes()).hexdigest() == '7ab26a247d8cfd1daa06022feaacec73dbff16cc3a52975edb57562af02cc77d'
secret_files = []
for item in [*folder.rglob('*.md'), *folder.rglob('*.json'), root / 'AGENTS.md']:
    if re.search(r'sk-[A-Za-z0-9]{24,}', item.read_text()):
        secret_files.append(str(item.relative_to(root)))
passed = not any([broken, unclosed, invalid_json, failed_evidence, changed_frontend, new_frontend]) and frozen_ok and reference_ok and task_ok and cleanup_ok and seed_ok and dataset_ok and not secret_files
report = {
    'status': 'passed' if passed else 'failed', 'markdown_documents': len(documents),
    'broken_relative_links': broken, 'unclosed_fences': unclosed, 'invalid_source_json': invalid_json, 'failed_s7_evidence': failed_evidence,
    'frozen_files_unchanged': frozen_ok, 'reference_humhub_clean': reference_ok,
    'frontend_baseline_files': len(baseline), 'frontend_files_unchanged': not changed_frontend and not new_frontend,
    'changed_frontend_files': changed_frontend, 'new_frontend_files': new_frontend,
    'completed_tasks': completed, 'remaining_implementation_tasks': remaining, 'task_location_and_counts_correct': task_ok,
    'isolated_environments_cleaned': cleanup_ok, 'main_seed_replay_verified': seed_ok, 'dataset_sha256_unchanged': dataset_ok, 'credential_pattern_files': secret_files,
}
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False))
raise SystemExit(0 if passed else 1)
