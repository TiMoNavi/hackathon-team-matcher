#!/usr/bin/env python3
"""Check the profile documents, local evidence and frozen sources without printing their content."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urlsplit

root = Path(__file__).resolve().parents[2]
folder = root / 'docs/用户画像收集'
pattern = re.escape('[') + '([^]]+)' + re.escape('](') + '([^)]+)' + re.escape(')')
broken = []
unclosed = []
documents = sorted(folder.glob('*.md'))
for document in documents:
    body = document.read_text()
    for label, target in re.findall(pattern, body):
        if urlsplit(target).scheme:
            continue
        relative = unquote(target.split('#', 1)[0])
        if relative and not (document.parent / relative).exists():
            broken.append({'document': document.name, 'target': target})
    if sum(line.startswith(chr(96) * 3) for line in body.splitlines()) % 2:
        unclosed.append(document.name)
json_errors = []
for source in (folder / 'sources').glob('*.json'):
    try:
        json.loads(source.read_text())
    except (ValueError, UnicodeError):
        json_errors.append(source.name)
frozen = {
    'docs/简介冻结禁止修改.md': '65cce6d5825b048bb8c074da63e485a224ff4c9488ba864526ba41ba3915be3c',
    'docs/首次注册与开场引导_用户原稿_冻结.md': '370e3bf56aa473a60908c3f6ad49d1d573fa0bc33f848118f9fcef769894aa03',
    'leagcy/docs/用户画像收集/01_原始输入_附件全文.txt': '787622d4f1761fbb148936193afa3fa1941b32a9fd22aca2e98fd66c6c693b12',
}
frozen_ok = all(hashlib.sha256((root / name).read_bytes()).hexdigest() == digest for name, digest in frozen.items())
reference = subprocess.run(['git', '-C', str(root / 'references/humhub'), 'status', '--porcelain'], capture_output=True, text=True)
reference_ok = reference.returncode == 0 and reference.stdout.strip() == ''
tasks = (folder / 'task.md').read_text().splitlines()
report = {
    'status': 'passed' if not broken and not unclosed and not json_errors and frozen_ok and reference_ok and not (root / 'task.md').exists() else 'failed',
    'markdown_documents': len(documents), 'broken_relative_links': broken,
    'unclosed_fences': unclosed, 'invalid_source_json': json_errors,
    'frozen_files_unchanged': frozen_ok, 'reference_humhub_clean': reference_ok,
    'task_is_in_profile_directory': not (root / 'task.md').exists(),
    's1_completed': sum('[x] S1.' in line for line in tasks),
    's2_completed': sum('[x] S2.' in line for line in tasks),
    's3_completed': sum('[x] S3.' in line for line in tasks),
    'remaining_implementation_tasks': sum(line.startswith('- [ ] S') for line in tasks),
}
(folder / 'sources/s3-document-check_2026-11-11.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + chr(10))
print(json.dumps(report, ensure_ascii=False))
raise SystemExit(0 if report['status'] == 'passed' else 1)
