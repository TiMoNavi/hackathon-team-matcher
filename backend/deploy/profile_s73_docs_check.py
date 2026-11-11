#!/usr/bin/env python3
"""Validate S7.3 documentation, retained evidence and the untouched frontend baseline."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urlsplit

root = Path(__file__).resolve().parents[2]
folder = root / 'docs/用户画像收集'
output = folder / 'sources/s73-document-check_2026-11-12.json'
pattern = re.escape('[') + '([^]]+)' + re.escape('](') + '([^)]+)' + re.escape(')')
broken = []
unclosed = []
documents = sorted(folder.rglob('*.md'))
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
        if source.name.startswith(('s73-', 's73_')) and 'before-fix' not in source.name and 'before_fix' not in source.name and 'status' in data and data['status'] not in ['passed', 'ok'] and 'checkpoint' not in source.name:
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
baseline = json.loads((root / 'backend/.runtime/profile-s73-frontend-baseline.json').read_text())
changed_frontend = [item['path'] for item in baseline if not (root / item['path']).is_file() or hashlib.sha256((root / item['path']).read_bytes()).hexdigest() != item['sha256']]
frontend_paths = {str(path.relative_to(root)) for module in ['matcher-user-profile', 'matcher-onboarding'] for part in ['assets', 'views'] for path in (root / 'backend/protected/modules' / module / part).rglob('*') if path.is_file()}
baseline_paths = {item['path'] for item in baseline}
new_frontend = sorted(frontend_paths - baseline_paths)
tasks = (folder / 'task.md').read_text().splitlines()
completed = {stage: sum('[x] ' + stage + '.' in line for line in tasks) for stage in ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']}
remaining = sum(line.startswith('- [ ] S') for line in tasks)
task_ok = not (root / 'task.md').exists() and completed == {'S1':8, 'S2':9, 'S3':9, 'S4':9, 'S5':7, 'S6':6, 'S7':3} and remaining == 4
cleanup = json.loads((folder / 'sources/s73-cleanup_2026-11-12.json').read_text())
marker = json.loads((root / 'backend/.runtime/profile-s73-test-dbs.json').read_text())
cleanup_ok = cleanup['status'] == 'passed' and marker['status'] == 'cleaned' and all(not (root / 'backend/.runtime/profile-s73' / target).exists() for target in marker['databases'].values())
seed = json.loads((folder / 'sources/s7-main-seed_2026-11-12.json').read_text())
replay = json.loads((folder / 'sources/s7-main-replay_2026-11-12.json').read_text())
seed_ok = seed['created_people'] == 100 and replay['created_people'] == 0 and replay['preserved_people'] == 100 and seed['current_content_sha256'] == replay['current_content_sha256'] and seed['current_space_members'] == {'primary':100,'secondary':20} and seed['current_discoverable'] == {'primary':90,'secondary':18}
dataset_ok = hashlib.sha256((folder / 'examples/s7-people_2026-11-12.json').read_bytes()).hexdigest() == '7ab26a247d8cfd1daa06022feaacec73dbff16cc3a52975edb57562af02cc77d'
secret_files = []
for item in [*folder.rglob('*.md'), *folder.rglob('*.json'), root / 'AGENTS.md']:
    if re.search(r'sk-[A-Za-z0-9]{24,}', item.read_text()):
        secret_files.append(str(item.relative_to(root)))
core_baseline = json.loads((root / 'backend/.runtime/profile-s73-core-baseline.json').read_text())
core_changed = [x['path'] for x in core_baseline if not (root / x['path']).is_file() or hashlib.sha256((root / x['path']).read_bytes()).hexdigest() != x['sha256']]
example = json.loads((folder / 'sources/s72-main-examples_2026-11-12.json').read_text())
example_replay = json.loads((folder / 'sources/s72-main-examples-replay_2026-11-12.json').read_text())
example_ok = example['ideas_mapped'] == 3 and example['publications_mapped'] == 4 and example['conversations_mapped'] == 4 and example['mapping'] == example_replay['mapping'] and example['message_entries_in_example_conversations'] == 0 and all(x['added_rows'] == 0 and x['existing_rows_unchanged'] for x in example_replay['preservation'].values())
browser = json.loads((folder / 'sources/s73-main-browser_2026-11-12.json').read_text())
browser_ok = browser['status'] == 'passed' and len(browser['checks']) == 100 and all(x['passed'] for x in browser['checks'])
s73seed = json.loads((folder / 'sources/s73-root-seed_2026-11-12.json').read_text())
s73replay = json.loads((folder / 'sources/s73-root-replay_2026-11-12.json').read_text())
s73_seed_ok = s73seed['created_people'] == 400 and s73replay['created_people'] == 0 and s73replay['preserved_people'] == 400 and s73seed['current_content_sha256'] == s73replay['current_content_sha256'] and s73seed['current_space_members'] == {'primary':400,'secondary':80} and s73seed['current_discoverable'] == {'primary':360,'secondary':72}
s73_dataset_ok = hashlib.sha256((folder / 'examples/s73-people_2026-11-12.json').read_bytes()).hexdigest() == '90bc52cf4df27b27af97068f875c870a636ebbc4e073d127bd0b050464297fe6'
preservation = json.loads((folder / 'sources/s73-main-preservation_2026-11-12.json').read_text())
preservation_ok = preservation['status'] == 'passed' and preservation['original_accounts'] == 103 and preservation['original_spaces'] == 4 and preservation['main_total_accounts'] == 103 and preservation['main_total_spaces'] == 4 and preservation['scale_accounts_on_main'] == 0 and all(x['unchanged'] for x in preservation['checks'])
http_before = json.loads((folder / 'sources/s73-http-baseline_2026-11-12.json').read_text())
http_after = json.loads((folder / 'sources/s73-http-final_2026-11-12.json').read_text())
http_ok = http_before['status'] == http_after['status'] == 'passed' and http_before['dataset_sha256'] == http_after['dataset_sha256'] and http_before['scenarios'].keys() == http_after['scenarios'].keys() and all(http_before['scenarios'][k]['ordered_result_sha256'] == http_after['scenarios'][k]['ordered_result_sha256'] for k in http_before['scenarios'])
perf_before = json.loads((folder / 'sources/s73-performance-baseline_2026-11-12.json').read_text())
perf_after = json.loads((folder / 'sources/s73-performance-final_2026-11-12.json').read_text())
perf_ok = perf_before['status'] == perf_after['status'] == 'passed' and perf_before['scenarios'].keys() == perf_after['scenarios'].keys() and perf_before['model_calls'] == perf_after['model_calls'] == 0 and perf_before['writes_during_measured_read'] == perf_after['writes_during_measured_read'] == 0
for name in perf_before['scenarios']:
    before = perf_before['scenarios'][name]['samples']; after = perf_after['scenarios'][name]['samples']
    perf_ok = perf_ok and len(before) == len(after) == 3 and {x['owner_id_order_sha256'] for x in before} == {x['owner_id_order_sha256'] for x in after} and {x['query_count'] for x in before + after} == {66} and {x['returned_rows'] for x in before + after} == {47644}
for name in ['ordinary_source', 'browse_use_case', 'p1_profile_batch', 'p8_batch']:
    perf_ok = perf_ok and perf_before['source_sha256'][name] == perf_after['source_sha256'][name]
audit_http = json.loads((folder / 'sources/s73_audit_http_2026-11-12.json').read_text())
audit_rules = json.loads((folder / 'sources/s73_audit_rules_2026-11-12.json').read_text())
audit_performance = json.loads((folder / 'sources/s73_audit_performance_review_2026-11-12.json').read_text())
audit_ok = all(x['status'] == 'passed' for x in [audit_http, audit_rules, audit_performance]) and audit_http['synthetic_people'] == 400 and audit_http['filter_cases'] == 39 and audit_http['model_calls'] == 0 and audit_http['side_effects_before'] == audit_http['side_effects_after']
passed = not any([broken, unclosed, invalid_json, failed_evidence, changed_frontend, new_frontend]) and frozen_ok and reference_ok and task_ok and cleanup_ok and seed_ok and dataset_ok and not secret_files and not core_changed and example_ok and browser_ok and s73_seed_ok and s73_dataset_ok and preservation_ok and http_ok and perf_ok and audit_ok
report = {
    'status': 'passed' if passed else 'failed', 'markdown_documents': len(documents),
    'broken_relative_links': broken, 'unclosed_fences': unclosed, 'invalid_source_json': invalid_json, 'failed_s73_evidence': failed_evidence,
    'frozen_files_unchanged': frozen_ok, 'reference_humhub_clean': reference_ok,
    'frontend_baseline_files': len(baseline), 'frontend_files_unchanged': not changed_frontend and not new_frontend,
    'changed_frontend_files': changed_frontend, 'new_frontend_files': new_frontend,
    'completed_tasks': completed, 'remaining_implementation_tasks': remaining, 'task_location_and_counts_correct': task_ok,
    'isolated_environments_cleaned': cleanup_ok, 'main_seed_replay_verified': seed_ok, 'dataset_sha256_unchanged': dataset_ok, 'credential_pattern_files': secret_files, 'protected_core_mail_files': len(core_baseline), 'changed_core_mail_files': core_changed, 'main_example_replay_verified': example_ok, 'main_browser_100_checks_passed': browser_ok, 'isolated_400_seed_replay_verified': s73_seed_ok, 'isolated_400_dataset_hash_correct': s73_dataset_ok, 'original_103_accounts_4_spaces_preserved': preservation_ok, 'http_baseline_final_same_results': http_ok, 'performance_same_candidates_reads_and_permission_logic': perf_ok, 'independent_400_http_rules_performance_passed': audit_ok,
}
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False))
raise SystemExit(0 if passed else 1)
