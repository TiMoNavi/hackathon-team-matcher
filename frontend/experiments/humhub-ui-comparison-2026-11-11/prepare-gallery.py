#!/usr/bin/env python3
"""Publish only verified screenshots and safe summary fields to the gallery."""
from pathlib import Path
import json
import shutil

root = Path(__file__).resolve().parent
gallery = root / 'gallery'
(gallery / 'assets').mkdir(parents=True, exist_ok=True)
data = {'date': '2026-11-11', 'passed': 0, 'total': 0, 'routes': []}
for route in ['route1-native', 'route2-plugin', 'route3-standalone']:
    report = json.loads((root / 'evidence' / route / 'browser-report.json').read_text())
    assert report['passed'], f'{route}: failed browser checks'
    data['passed'] += report['passed_count']
    data['total'] += report['check_count']
    data['routes'].append({'id': route, 'url': report['url'], 'passed': report['passed_count'], 'total': report['check_count'], 'initial_resource_decoded_bytes': report['initial_resource_decoded_bytes']})
    for view in ['desktop', 'mobile', 'detail']:
        shutil.copy2(root / 'evidence' / route / (view + '.png'), gallery / 'assets' / (route + '-' + view + '.png'))
(gallery / 'data.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(data, ensure_ascii=False))
