#!/usr/bin/env python3
"""S7 routing smoke: allocated loopback root clone, new session, synthetic person 082 only."""
import http.cookiejar
import argparse
import json
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[6]
MANIFEST = ROOT / 'backend/.runtime/profile-s7/humhub_profile_s7_test_root_e54d7303/people-manifest.json'
ORIGIN = 'http://127.0.0.1:8098'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--settings-put', action='store_true', help='Also submit the existing discovery setting unchanged, incrementing only its version.')
args = parser.parse_args()
data = json.loads(MANIFEST.read_text())
owner = data['people']['s7_sim_082']['id']
primary = data['spaces']['primary']['id']
secondary = data['spaces']['secondary']['id']
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
checks = []
csrf = None

def request(path, method='GET', body=None, query=None, expected=200, code=None, with_csrf=True):
    url = ORIGIN + path + ('?' + urllib.parse.urlencode(query) if query else '')
    headers = {'Accept': 'application/json'}
    if csrf is not None and with_csrf:
        headers['X-CSRF-Token'] = csrf
    raw = None
    if body is not None:
        headers['Content-Type'] = 'application/json'
        raw = json.dumps(body).encode()
    req = urllib.request.Request(url, data=raw, headers=headers, method=method)
    try:
        response = opener.open(req, timeout=60)
    except urllib.error.HTTPError as error:
        response = error
    payload = json.loads(response.read())
    actual_code = payload.get('error', {}).get('code')
    if response.status != expected or (code is not None and actual_code != code):
        raise AssertionError(f'{method} {path}: expected {expected}/{code}, got {response.status}/{actual_code}')
    checks.append({'method': method, 'path': path, 'status': response.status, 'code': actual_code})
    return payload.get('data', payload)

login = request('/__s7_test/login', query={'id': owner})
csrf = login['csrf']
request('/api/v1/me/current-event', expected=409, code='CURRENT_EVENT_REQUIRED')
request(f'/api/v1/events/{primary}/discovery', expected=409, code='CURRENT_EVENT_REQUIRED')
request('/api/v1/me/current-event', 'PUT', {'space_id': primary, 'expected_revision': None}, expected=400, with_csrf=False)
selected = request('/api/v1/me/current-event', 'PUT', {'space_id': primary, 'expected_revision': None})
request('/api/v1/me/current-event')
setting = request(f'/api/v1/me/events/{primary}/discovery-settings')
if args.settings_put:
    changed = request(f'/api/v1/me/events/{primary}/discovery-settings', 'PUT', {'expected_version': setting['version'], 'discoverable': setting['discoverable']})
    if changed['version'] != setting['version'] + 1 or changed['discoverable'] != setting['discoverable']:
        raise AssertionError('Same-value settings PUT must preserve consent and increment its version.')
    request(f'/api/v1/me/events/{primary}/discovery-settings', 'PUT', {'expected_version': setting['version'], 'discoverable': setting['discoverable']}, expected=409, code='DISCOVERY_VERSION_CONFLICT')
page = request(f'/api/v1/events/{primary}/discovery')
if len(page['items']) != 24:
    raise AssertionError('Default page must contain 24 real authorized cards.')
first = page['items'][0]['owner_id']
request(f'/api/v1/events/{primary}/discovery/people/{first}')
for path, query in [
    (f'/api/v1/events/{primary}/discovery', {'spaceId': secondary}),
    (f'/api/v1/me/events/{primary}/discovery-settings', {'spaceId': secondary}),
    (f'/api/v1/events/{primary}/discovery/people/{first}', {'ownerId': owner}),
    ('/api/v1/me/current-event', {'space_id': secondary}),
]:
    request(path, query=query, expected=422, code='UNKNOWN_QUERY_FIELD')
request(f'/api/v1/events/{primary}/discovery', query={'filters': json.dumps({'skill': {'0': 'php'}})}, expected=422, code='INVALID_DISCOVERY_QUERY')
request(f'/api/v1/events/{secondary}/discovery', expected=409, code='CURRENT_EVENT_MISMATCH')
request('/api/v1/me/current-event', 'PUT', {'space_id': secondary, 'expected_revision': selected['selection_revision']})
request(f'/api/v1/events/{secondary}/discovery')
request(f'/api/v1/events/{secondary}/discovery/people/{data["people"]["s7_sim_001"]["id"]}', expected=404, code='DISCOVERY_PERSON_NOT_FOUND')
request('/api/v1/me/current-event', 'PUT', {'space_id': primary, 'expected_revision': selected['selection_revision']}, expected=409, code='CONTEXT_CHANGED')
request('/api/v1/me/current-event/extra', expected=404, code='NOT_FOUND')
scope = 'synthetic loopback root clone; profiles and discovery consent unchanged'
if args.settings_put:
    scope += '; person 082 settings version incremented once by a same-value PUT'
print(json.dumps({'status': 'passed', 'checks': len(checks), 'passed': checks, 'scope': scope}, ensure_ascii=False, indent=2))
