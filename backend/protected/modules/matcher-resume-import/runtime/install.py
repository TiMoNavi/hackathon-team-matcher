#!/usr/bin/env python3
"""Install only the hash-locked resume parser into the backend's private runtime."""
import json
from pathlib import Path
import subprocess
import sys
import venv

if sys.version_info < (3, 9):
    raise SystemExit('Python 3.9 or newer is required.')
folder = Path(__file__).resolve().parent
runtime = folder.parents[3] / '.runtime' / 'resume-python'
venv.EnvBuilder(with_pip=True).create(runtime)
python = runtime / 'bin' / 'python3'
subprocess.run([str(python), '-m', 'pip', 'install', '--disable-pip-version-check', '--require-hashes', '--only-binary=:all:', '-r', str(folder / 'requirements.lock')], check=True)
result = subprocess.run([str(python), '-I', str(folder / 'parse_document.py')], input=json.dumps({'action':'capabilities'}), text=True, capture_output=True, check=True)
parsed = json.loads(result.stdout)
if parsed.get('status') != 'ok' or not parsed.get('result', {}).get('available'):
    raise SystemExit('The installed parser did not pass its capability check.')
print(json.dumps({'status':'ready','runtime':'backend/.runtime/resume-python','formats':['pdf','docx','md','txt'],'dependencies':'requirements.lock'}))
