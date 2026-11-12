#!/usr/bin/env python3
"""Rerun the received recommendation review with the new read-only N05 fixture.

Preserves the historical review scripts and assertions. Only temporary browser
route fixtures gain the newly mounted GET /me/events response. No live database,
real authentication, or deployment is involved.
"""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import harness as h

root = h.BACKEND.parent
source = root / 'docs/推荐模块/sources/recommendation-page-live-integration-independent_2026-11-12'
temporary = Path(tempfile.mkdtemp(prefix='n05-recommendation-review-package-'))
for original in source.iterdir():
    if original.is_file():
        shutil.copy2(original, temporary / original.name)
for name, envelope in [('browser-review.mjs', 'envelope'), ('recommendation-browser-races.mjs', 'success')]:
    target = temporary / name
    text = target.read_text()
    anchor = "if(p==='/api/v1/me/current-event')"
    assert text.count(anchor) == 1
    addition = "if(p==='/api/v1/me/events')return json(200," + envelope + "({items:[],next_cursor:null,has_more:false,limit:24}));\n  "
    target.write_text(text.replace(anchor, addition + anchor))
environment = h.clean_environment()
environment['MATCHER_REVIEW_ROOT'] = str(root)
result = subprocess.run([sys.executable, str(temporary / 'run.py')], cwd=root, env=environment, capture_output=True, text=True)
print(json.dumps({'fixture_extension': 'GET /api/v1/me/events only', 'historical_scripts_modified': False,
                  'temporary_review_package': str(temporary), 'exit_code': result.returncode}))
print(result.stdout)
if result.returncode and result.stderr:
    print('Review failed; inspect the synthetic temporary report. Raw diagnostics suppressed.', file=sys.stderr)
sys.exit(result.returncode)
