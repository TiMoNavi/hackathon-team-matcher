#!/usr/bin/env python3
"""Loopback HTTP timing over the exact S73 clone; no external or model requests."""
import http.cookiejar
import hashlib
import json
from pathlib import Path
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/用户画像收集/sources'
BASE = 'http://127.0.0.1:8102'
STAGE = sys.argv[1] if len(sys.argv) == 2 else ''
if STAGE not in ['baseline', 'final']:
    raise SystemExit('Use baseline or final')
seed = json.loads((OUT / 's73-root-seed_2026-11-12.json').read_text())
assert seed['target'] == 'humhub_profile_s73_test_root_4a70f3d1' and seed['mapped_people'] == 400
viewer = seed['people']['321']; space = seed['primary_space_id']
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

def call(path, method='GET', body=None, csrf=None):
    headers = {'Accept':'application/json'}
    raw = None
    if body is not None:
        raw = json.dumps(body).encode(); headers['Content-Type'] = 'application/json'
    if csrf: headers['X-CSRF-Token'] = csrf
    request = urllib.request.Request(BASE + path, data=raw, headers=headers, method=method)
    start = time.perf_counter()
    try: response = client.open(request, timeout=90)
    except urllib.error.HTTPError as error: response = error
    payload = response.read()
    duration = (time.perf_counter() - start) * 1000
    result = json.loads(payload)
    return response.status, result, duration, len(payload)

status, login, _, _ = call('/__s73_test/login?id=' + str(viewer))
assert status == 200 and login['user_id'] == viewer
status, current, _, _ = call('/api/v1/me/current-event')
revision = current['data']['selection_revision'] if status == 200 else None
status, selected, _, _ = call('/api/v1/me/current-event', 'PUT', {'space_id':space,'expected_revision':revision}, login['csrf'])
assert status == 200 and selected['data']['space_id'] == space
scenarios = {
    'recent_first': {},
    'rare_last_person': {'filters': json.dumps({'skill':['s73-wasm-component-model']})},
    'empty_filter': {'filters': json.dumps({'skill':['s73-no-such-verified-code']})},
}
result = {}
for name, query in scenarios.items():
    samples = []; expected = None
    for i in range(3):
        path = '/api/v1/events/' + str(space) + '/discovery' + ('?' + urllib.parse.urlencode(query) if query else '')
        status, body, duration, size = call(path)
        assert status == 200, (name,status,body.get('error',{}).get('code'))
        page = body['data']; ids = [x['owner_id'] for x in page['items']]
        if expected is None: expected = ids
        assert ids == expected
        if name == 'recent_first': assert len(ids) == 24 and page['has_more']
        if name == 'rare_last_person': assert ids == [seed['people']['400']]
        if name == 'empty_filter': assert ids == [] and page['exhausted']
        samples.append({'elapsed_ms':round(duration,3),'response_bytes':size,'items':len(ids)})
    result[name] = {'repetitions':3,'median_http_ms':round(statistics.median(x['elapsed_ms'] for x in samples),3),'ordered_result_sha256':hashlib.sha256(json.dumps(expected,separators=(',', ':')).encode()).hexdigest(),'samples':samples}
report = {'status':'passed','stage':STAGE,'scope':'loopback PHP development server, real 400-person MySQL Space, single sequential client; includes HTTP/session selection reads and response transfer; not a concurrency benchmark','synthetic_people':400,'optin':360,'dataset_sha256':hashlib.sha256((ROOT / 'docs/用户画像收集/examples/s73-people_2026-11-12.json').read_bytes()).hexdigest(),'scenarios':result,'llm_calls':0}
(OUT / ('s73-http-' + STAGE + '_2026-11-12.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+chr(10))
print(json.dumps({name:entry['median_http_ms'] for name,entry in result.items()}))
