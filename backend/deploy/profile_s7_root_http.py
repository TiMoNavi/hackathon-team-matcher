#!/usr/bin/env python3
"""Root smoke and installation replay checks on the allocated S7 clone only."""
import http.cookiejar
import json
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
DB = 'humhub_profile_s7_test_root_e54d7303'
BASE = 'http://127.0.0.1:8098'
OUT = ROOT / 'docs/用户画像收集/sources'
SEED = json.loads((OUT / 's7-root-people-seed_2026-11-12.json').read_text())
CHECKS = []

def check(ok, name):
    if not ok:
        raise AssertionError(name)
    CHECKS.append(name)

class Client:
    def __init__(self, owner):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        status, body = self.call('/__s7_test/login?id=' + str(owner))
        check(status == 200 and body['user_id'] == owner, 'synthetic owner login succeeds')
        self.csrf = body['csrf']

    def call(self, path, method='GET', body=None):
        if not path.startswith('/') or path.startswith('//'):
            raise AssertionError('Loopback path required')
        headers = {'Accept': 'application/json'}
        if self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        raw = None
        if body is not None:
            raw = json.dumps(body).encode()
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(BASE + path, data=raw, headers=headers, method=method)
        try:
            response = self.opener.open(request, timeout=60)
        except urllib.error.HTTPError as error:
            response = error
        return response.status, json.loads(response.read())

    def ok(self, path, method='GET', body=None):
        status, result = self.call(path, method, body)
        if status != 200:
            raise AssertionError('Unexpected HTTP status ' + str(status) + ' at ' + path + ': ' + str(result.get('error', {}).get('code')))
        return result['data']

    def select(self, space):
        status, body = self.call('/api/v1/me/current-event')
        revision = body['data']['selection_revision'] if status == 200 else None
        return self.ok('/api/v1/me/current-event', 'PUT', {'space_id': space, 'expected_revision': revision})

    def all(self, space):
        items = []
        path = '/api/v1/events/' + str(space) + '/discovery'
        cursor = None
        for _ in range(10):
            page = self.ok(path + ('?' + urllib.parse.urlencode({'cursor': cursor}) if cursor else ''))
            items.extend(page['items'])
            if not page['has_more']:
                return items
            cursor = page['next_cursor']
        raise AssertionError('Unbounded pagination')

def run():
    check(SEED['target'] == DB and SEED['mapped_people'] == 100, 'test uses exact seeded root clone')
    primary, secondary = SEED['primary_space_id'], SEED['secondary_space_id']
    viewer = Client(SEED['people']['81'])
    candidate = Client(SEED['people']['100'])
    viewer.select(primary)
    candidate.select(primary)
    listing = '/api/v1/events/' + str(primary) + '/discovery'
    cards = viewer.all(primary)
    check(len(cards) == len({c['owner_id'] for c in cards}) == 89, 'four default pages contain exactly 89 distinct eligible others')
    check(all(c['space_id'] == primary for c in cards), 'all cards use current verified Space')
    filters = urllib.parse.urlencode({'filters': json.dumps({'skill': ['wasm-component-model']})})
    rare = viewer.ok(listing + '?' + filters)
    check([c['owner_id'] for c in rare['items']] == [SEED['people']['100']], 'last person rare skill survives full candidate scan')
    durations = []
    for _ in range(3):
        start = time.perf_counter()
        viewer.ok(listing)
        durations.append(round((time.perf_counter() - start) * 1000, 2))
    check(all(c['relationship']['state'] == 'none' for c in cards), 'fresh synthetic fixtures have genuine no-relationship status')
    viewer.select(secondary)
    check(len(viewer.all(secondary)) == 17, 'switching Space returns its 17 eligible others')
    status, _ = viewer.call(listing)
    check(status == 409, 'old Space request cannot override current selection')
    viewer.select(primary)
    identity = candidate.ok('/api/v1/me')
    settings_path = '/api/v1/me/events/' + str(primary) + '/discovery-settings'
    settings = candidate.ok(settings_path)
    changed_name = '模拟100｜安装后修改保留'
    try:
        candidate.ok('/api/v1/me', 'PATCH', {'expected_version': identity['identity_version'], 'nickname': changed_name})
        candidate.ok(settings_path, 'PUT', {'expected_version': settings['version'], 'discoverable': False})
        check(viewer.ok(listing + '?' + filters)['items'] == [], 'explicit owner opt-out removes person before seed replay')
        command = [str(ROOT / 'backend/.runtime/php-mysql/bin/php'), '-c', str(ROOT / 'backend/.runtime/php.ini'), str(ROOT / 'backend/deploy/profile_s7_people.php'), 'seed', '--target=' + DB, '--viewer-id=1']
        process = subprocess.run(command, capture_output=True, text=True)
        if process.returncode:
            raise AssertionError('Guarded root clone replay failed')
        replay = json.loads(process.stdout)
        (OUT / 's7-root-modified-replay_2026-11-12.json').write_text(json.dumps(replay, ensure_ascii=False, indent=2) + chr(10))
        check(replay['created_people'] == 0 and replay['preserved_people'] == 100, 'replay creates no duplicate users')
        check(replay['current_discoverable'] == {'primary': 89, 'secondary': 18}, 'replay preserves owner opt-out separately for each Space')
        check(candidate.ok('/api/v1/me')['nickname'] == changed_name, 'replay preserves later owner-confirmed nickname')
        check(candidate.ok(settings_path)['discoverable'] is False, 'replay preserves later owner discovery choice')
        check(replay['suppressed_side_effects'] == {'queue': 0, 'activity': 0, 'mail': 0}, 'completed fixture replay has no social or mail side effects')
    finally:
        current = candidate.ok('/api/v1/me')
        if current['nickname'] != identity['nickname']:
            candidate.ok('/api/v1/me', 'PATCH', {'expected_version': current['identity_version'], 'nickname': identity['nickname']})
        current = candidate.ok(settings_path)
        if current['discoverable'] != settings['discoverable']:
            candidate.ok(settings_path, 'PUT', {'expected_version': current['version'], 'discoverable': settings['discoverable']})
    check(len(viewer.all(primary)) == 89, 'root synthetic choices restored after verification')
    report = {'status': 'passed', 'environment': 'isolated_root_clone', 'checks': len(CHECKS), 'checks_passed': CHECKS, 'synthetic_people': 100, 'http_first_page_sample_ms': durations, 'sample_scope': 'three local 100-person first-page observations; not a load or 300-400-person benchmark', 'llm_calls': 0}
    (OUT / 's7-root-http_2026-11-12.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + chr(10))
    print(json.dumps(report, ensure_ascii=False))

if __name__ == '__main__':
    run()
