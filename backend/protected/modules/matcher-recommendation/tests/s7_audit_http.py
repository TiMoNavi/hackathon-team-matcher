#!/usr/bin/env python3
"""Independent real HTTP + allocated MySQL audit. Only synthetic users and loopback 8099."""
import datetime as dt
import http.cookiejar
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[5]
DB = 'humhub_profile_s7_test_audit_c51bb175'
ORIGIN = 'http://127.0.0.1:8099'
PHP = ROOT / 'backend/.runtime/php-mysql/bin/php'
PHP_INI = ROOT / 'backend/.runtime/php.ini'
SQL = Path(__file__).with_name('s7_audit_sql.php')
DATA = json.loads((ROOT / 'docs/用户画像收集/examples/s7-people_2026-11-12.json').read_text())
CHECKS = []
REQUESTS = 0
def check(ok, name):
    if not ok: raise AssertionError(name)
    CHECKS.append(name)
def sql(action='metadata', value=''):
    run = subprocess.run([str(PHP), '-c', str(PHP_INI), str(SQL), DB, action, value], cwd=ROOT, env={**os.environ, 'MATCHER_S7_TEST_DB': DB}, capture_output=True, text=True)
    if run.returncode: raise AssertionError('Independent SQL fixture command failed: ' + action + '; ' + (run.stdout + run.stderr)[-1500:])
    return json.loads(run.stdout)
class Client:
    def __init__(self, user_id=None):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        if user_id is not None:
            status, payload, _ = self.request('/__s7_test/login', query={'id': user_id})
            if status != 200 or payload.get('user_id') != user_id: raise AssertionError('Synthetic fixture login failed')
            self.csrf = payload['csrf']
    def request(self, path, method='GET', body=None, query=None, csrf=True):
        global REQUESTS
        REQUESTS += 1
        if not path.startswith('/') or path.startswith('//'): raise AssertionError('Only explicit loopback paths are allowed')
        url = ORIGIN + path + (('?' + urllib.parse.urlencode(query)) if query else '')
        headers = {'Accept': 'application/json'}
        raw = None
        if body is not None:
            raw = json.dumps(body).encode(); headers['Content-Type'] = 'application/json'
        if csrf and self.csrf: headers['X-CSRF-Token'] = self.csrf
        request = urllib.request.Request(url, data=raw, headers=headers, method=method)
        try: response = self.opener.open(request, timeout=60)
        except urllib.error.HTTPError as error: response = error
        raw_response = response.read().decode()
        try: payload = json.loads(raw_response)
        except json.JSONDecodeError: raise AssertionError('Expected JSON from local API, status=' + str(response.status) + '; snippet=' + raw_response[:400])
        return response.status, payload, dict(response.headers)
    def ok(self, path, method='GET', body=None, query=None):
        status, payload, headers = self.request(path, method, body, query)
        if status != 200: raise AssertionError('Expected 200 for ' + path + ': ' + json.dumps(payload, ensure_ascii=False))
        if not isinstance(payload.get('meta', {}).get('request_id'), str): raise AssertionError('Missing request_id')
        if 'no-store' not in headers.get('Cache-Control', ''): raise AssertionError('Missing no-store')
        return payload['data']
    def error(self, path, expected, code=None, **kwargs):
        status, payload, _ = self.request(path, **kwargs)
        valid = status == expected and 'data' not in payload and isinstance(payload.get('error'), dict) and (code is None or payload['error']['code'] == code)
        if not valid: raise AssertionError('HTTP mismatch for ' + path + ': expected ' + str(expected) + '/' + str(code) + ', actual ' + str(status) + '/' + str(payload.get('error', {}).get('code')))
        check(valid, 'HTTP rejects ' + path + ' with ' + str(expected) + (('/' + code) if code else ''))
        check(isinstance(payload.get('meta', {}).get('request_id'), str) and {'code','message','retryable','details'} <= payload['error'].keys(), 'error uses the complete documented envelope')
    def select(self, space_id):
        status, payload, _ = self.request('/api/v1/me/current-event')
        revision = payload['data']['selection_revision'] if status == 200 else None
        return self.ok('/api/v1/me/current-event', 'PUT', {'space_id': space_id, 'expected_revision': revision})
    def all(self, space, filters=None, sort='recent', limit=24):
        query = {'sort': sort, 'limit': limit}
        if filters is not None: query['filters'] = json.dumps(filters)
        people = []; pages = 0
        while True:
            result = self.ok('/api/v1/events/' + str(space) + '/discovery', query=query)
            people += result['items']; pages += 1
            if pages > 10: raise AssertionError('Unexpected endless pagination')
            if not result['has_more']:
                if result['next_cursor'] is not None or not result['exhausted']: raise AssertionError('Bad final-page state')
                return people, pages
            query['cursor'] = result['next_cursor']

def expected_ids(manifest, space_key, filters=None):
    result = []
    for person in DATA['people']:
        block = person['spaces'].get(space_key)
        if person['number'] == 81 or block is None or not block['discoverable']: continue
        attrs = person['global']['attributes'] + block['attributes']
        attrs = [a for a in attrs if a['visibility'] == 'authenticated']
        matched = True
        for key, wanted in (filters or {}).items():
            values = [a['value'] for a in attrs if a['key'] == key]
            if key == 'event_seeking':
                matched &= all(set(codes).intersection(c for v in values for c in v.get(part, [])) for part, codes in wanted.items())
            elif key == 'event_availability':
                spans = sorted((dt.datetime.fromisoformat(v['starts_at'].replace('Z', '+00:00')), dt.datetime.fromisoformat(v['ends_at'].replace('Z', '+00:00'))) for v in values)
                merged = []
                for start, end in spans:
                    if merged and start <= merged[-1][1]: merged[-1][1] = max(merged[-1][1], end)
                    else: merged.append([start, end])
                matched &= all(any(a <= dt.datetime.fromisoformat(w['starts_at'].replace('Z', '+00:00')) and b >= dt.datetime.fromisoformat(w['ends_at'].replace('Z', '+00:00')) for a,b in merged) for w in wanted)
            else: matched &= bool(set(wanted).intersection(v.get('code') for v in values))
        if matched: result.append(manifest['users'][str(person['number'])])
    return sorted(result)

def run():
    started = time.monotonic(); manifest = sql(); users = manifest['users']; primary = manifest['spaces']['primary']; secondary = manifest['spaces']['secondary']
    check(manifest['counts'] == {'primary': {'members': 100, 'optin': 90}, 'secondary': {'members': 20, 'optin': 18}}, 'MySQL contains exact 100/20 memberships and 90/18 opt-ins')
    check(manifest['synthetic_ai_jobs'] == 0, 'synthetic users begin with zero AI jobs')
    check(manifest['profile_counts'] == {'states':220, 'confirmed_attributes_including_nickname':4048, 'nickname_attributes':100, 'editing_drafts':22}, 'MySQL has 220 scopes, 3948 ordinary plus 100 nickname entries, and 22 editing drafts')
    probe = sql('default_settings_probe')
    check(probe['status'] == 'passed' and probe['checks'] == 3, 'real MySQL absent settings default false, explicit first write succeeds, stale first-write CAS fails')
    guest = Client(); listing = '/api/v1/events/' + str(primary) + '/discovery'
    guest.error(listing, 401, 'AUTHENTICATION_REQUIRED')
    viewer = Client(users['81']); other = Client(users['82']); candidate = Client(users['100'])
    viewer.error('/api/v1/me/current-event', 409, 'CURRENT_EVENT_REQUIRED')
    viewer.error(listing, 409, 'CURRENT_EVENT_REQUIRED')
    viewer.error('/api/v1/me/current-event', 422, 'UNKNOWN_QUERY_FIELD', query={'space_id': primary})
    viewer.error('/api/v1/me/current-event', 409, 'CURRENT_EVENT_REQUIRED')
    viewer.error('/api/v1/me/current-event', 400, 'INVALID_REQUEST', method='PUT', body={'space_id': primary, 'expected_revision': None}, csrf=False)
    selected = viewer.select(primary); other.select(primary); candidate.select(primary)
    check(selected['space_id'] == primary, 'explicit selection returns the requested qualified Space')
    viewer.error('/api/v1/me/current-event', 409, 'CONTEXT_CHANGED', method='PUT', body={'space_id': primary, 'expected_revision': None})
    viewer.error('/api/v1/me/current-event', 422, 'UNKNOWN_FIELD', method='PUT', body={'space_id': primary, 'expected_revision': selected['selection_revision'], 'actor_id': users['82']})
    page = viewer.ok(listing)
    check(len(page['items']) == 24 and page['limit'] == 24 and page['has_more'], 'real HTTP default page has 24 items and continuation')
    token = page['next_cursor']
    cards, pages = viewer.all(primary)
    check(sorted(c['owner_id'] for c in cards) == expected_ids(manifest, 'primary') and len(cards) == 89 and pages == 4, 'four real pages exhaust exactly 89 eligible other people without duplicates')
    check(all(c['space_id'] == primary and '模拟' in c['display_name'] for c in cards), 'every card is bound to primary Space and explicitly synthetic')
    check(all(c['owner_id'] != users['81'] for c in cards), 'viewer is excluded from own candidate list')
    for card in cards:
        for scope in ['global', 'space']:
            for attr in card[scope]['attributes']:
                if attr['confirmation'] != 'confirmed' or attr['visibility'] != 'authenticated' or attr['key'].startswith('contact_'):
                    raise AssertionError('A nonpublic, unconfirmed or contact entry escaped card projection')
    check(True, 'all actual card entries are confirmed authenticated and exclude contact fields')
    serialized = json.dumps(cards)
    check(all(x not in serialized for x in ['private-sentinel-skill','friends-sentinel-skill','draft-sentinel-skill','source_snapshot','source_text']), 'private friends draft and source sentinels do not appear in actual cards')
    check(len(viewer.ok(listing, query={'limit': 48})['items']) == 48, 'real HTTP supports maximum page size 48')
    for query in [{'limit': 49}, {'sort': 'id'}, {'target_type': 'idea'}, {'filters': '[]'}, {'filters': '{'}, {'filters': json.dumps({'unknown': ['x']})}, {'viewer_id': users['82']}, {'spaceId':secondary}, {'ownerId':users['81']}]:
        viewer.error(listing, 422, query=query)
    for filters in [{'skill':{'0':'php'}}, {'event_seeking':[]}, {'event_seeking':{'role_codes':{'0':'backend'}}}, {'event_availability':{'0':{'starts_at':'2026-11-28T04:00:00Z','ends_at':'2026-11-28T06:00:00Z'}}}]:
        viewer.error(listing, 422, query={'filters':json.dumps(filters)})
    for filters in [{'skill':['wasm-component-model']}, {'skill':['private-sentinel-skill']}, {'skill':['friends-sentinel-skill']}, {'skill':['draft-sentinel-skill']}, {'skill':['definitely-absent-s7-code']}, {'skill':['typescript','python'], 'role':['frontend','backend']}, {'event_seeking':{'role_codes':['hardware','designer'], 'skill_codes':['embedded-c','figma']}}]:
        found,_ = viewer.all(primary, filters)
        check(sorted(c['owner_id'] for c in found) == expected_ids(manifest, 'primary', filters), 'real authorized filtering agrees with independent fixture oracle: ' + json.dumps(filters, sort_keys=True))
    availability = {'event_availability':[{'starts_at':'2026-11-28T04:00:00Z','ends_at':'2026-11-28T06:00:00Z'}]}
    found,_ = viewer.all(primary, availability)
    check(sorted(c['owner_id'] for c in found) == expected_ids(manifest, 'primary', availability), 'HTTP UTC full-window coverage agrees with independent fixture oracle')
    viewer.error(listing, 409, 'DISCOVERY_CURSOR_INVALID', query={'cursor': token, 'sort':'relevance'})
    viewer.error(listing, 409, 'DISCOVERY_CURSOR_INVALID', query={'cursor': token, 'filters':json.dumps({'skill':['python']})})
    other.error(listing, 409, 'DISCOVERY_CURSOR_INVALID', query={'cursor': token})
    viewer.error(listing, 409, 'DISCOVERY_CURSOR_INVALID', query={'cursor': token[:-1] + ('A' if token[-1] != 'A' else 'B')})
    settings = '/api/v1/me/events/' + str(primary) + '/discovery-settings'
    original = viewer.ok(settings)
    viewer.error(settings, 400, 'INVALID_REQUEST', method='PUT', body={'expected_version':original['version'], 'discoverable':False}, csrf=False)
    viewer.error(settings, 422, 'INVALID_DISCOVERY_SETTINGS', method='PUT', body={'expected_version':original['version'], 'discoverable':'false'})
    changed = viewer.ok(settings, 'PUT', {'expected_version':original['version'], 'discoverable':False})
    try:
        check(changed['discoverable'] is False and changed['version'] == original['version'] + 1, 'explicit opt-out persists with one version increment')
        viewer.error(settings, 409, 'DISCOVERY_VERSION_CONFLICT', method='PUT', body={'expected_version':original['version'], 'discoverable':True})
        check(len(viewer.all(primary)[0]) == 89, 'viewer opt-out does not remove membership or ability to browse')
    finally:
        current = viewer.ok(settings); viewer.ok(settings, 'PUT', {'expected_version':current['version'], 'discoverable':original['discoverable']})
    rare_detail = listing + '/people/' + str(users['100']); check(viewer.ok(rare_detail)['owner_id'] == users['100'], 'last synthetic person is accessible in legitimate detail')
    viewer.error(rare_detail, 422, 'UNKNOWN_QUERY_FIELD', query={'ownerId':users['81']})
    before = viewer.ok(listing)['next_cursor']; rare_setting = candidate.ok(settings)
    candidate.ok(settings, 'PUT', {'expected_version':rare_setting['version'], 'discoverable':False})
    try:
        viewer.error(rare_detail, 404, 'DISCOVERY_PERSON_NOT_FOUND')
        viewer.error(listing, 409, 'DISCOVERY_CURSOR_INVALID', query={'cursor':before})
        check(viewer.all(primary, {'skill':['wasm-component-model']})[0] == [], 'turning candidate opt-in off removes rare skill without cross-Space refill')
    finally:
        current = candidate.ok(settings); candidate.ok(settings, 'PUT', {'expected_version':current['version'], 'discoverable':rare_setting['discoverable']})
    try:
        for state in ['pending_out', 'pending_in', 'friend']:
            sql('relationship', state)
            peer = viewer.ok(listing + '/people/' + str(users['82']))
            check(peer['relationship']['state'] == state and peer['relationship'][state] is True, 'ordinary detail preserves real relationship ' + state)
            check(users['82'] in [p['owner_id'] for p in viewer.all(primary)[0]], 'ordinary list keeps ' + state + ' candidate')
        sql('relationship_hidden', 'friend')
        hidden_friend = viewer.ok(listing + '/people/' + str(users['8']))
        check(hidden_friend['relationship']['friend'] is True and 'friends-sentinel-skill' not in json.dumps(hidden_friend), 'existing friendship still cannot put friends-only skill in ordinary discovery detail')
        check(viewer.all(primary, {'skill':['friends-sentinel-skill']})[0] == [], 'existing friendship still cannot use friends-only skill for discovery filtering')
        for direction in ['outgoing', 'incoming', 'space']:
            sql('block', direction)
            viewer.error(listing + '/people/' + str(users['83']), 404, 'DISCOVERY_PERSON_NOT_FOUND')
            check(users['83'] not in [p['owner_id'] for p in viewer.all(primary)[0]], 'blocked candidate excluded for direction ' + direction)
        sql('block', 'none'); sql('membership', 'candidate_remove')
        viewer.error(listing + '/people/' + str(users['83']), 404, 'DISCOVERY_PERSON_NOT_FOUND')
        check(users['83'] not in [p['owner_id'] for p in viewer.all(primary)[0]], 'nonmember candidate is excluded without refill')
        sql('membership', 'candidate_restore')
        for visibility in ['private', 'friends']:
            old_cursor = viewer.ok(listing)['next_cursor']; sql('rare_visibility', visibility)
            viewer.error(listing, 409, 'DISCOVERY_CURSOR_INVALID', query={'cursor':old_cursor})
            check(viewer.all(primary, {'skill':['wasm-component-model']})[0] == [], 'confirmed rare skill cannot match after visibility becomes ' + visibility)
            check('wasm-component-model' not in json.dumps(viewer.ok(rare_detail)), 'detail drops newly ' + visibility + ' skill')
        sql('rare_visibility', 'authenticated')
        sql('membership', 'viewer_remove')
        viewer.error(listing, 403, 'ACCESS_DENIED')
        viewer.error(listing, 403, 'ACCESS_DENIED', query={'filters':json.dumps({'skill':['definitely-absent-s7-code']})})
    finally:
        sql('relationship', 'none'); sql('relationship_hidden', 'none'); sql('block', 'none'); sql('membership', 'candidate_restore'); sql('membership', 'viewer_restore'); sql('rare_visibility', 'authenticated')
    old_cursor = viewer.ok(listing)['next_cursor']; viewer.select(secondary)
    viewer.error(listing, 409, 'CURRENT_EVENT_MISMATCH')
    viewer.error(rare_detail, 409, 'CURRENT_EVENT_MISMATCH')
    secondary_cards,_ = viewer.all(secondary)
    check(sorted(c['owner_id'] for c in secondary_cards) == expected_ids(manifest, 'secondary') and len(secondary_cards) == 17, 'switching Space returns exactly its 17 eligible other members')
    viewer.error('/api/v1/events/' + str(secondary) + '/discovery/people/' + str(users['1']), 404, 'DISCOVERY_PERSON_NOT_FOUND')
    primary_rare = DATA['people'][99]['spaces']['primary']['attributes']; secondary_rare = viewer.ok('/api/v1/events/' + str(secondary) + '/discovery/people/' + str(users['100']))
    expected_role = [a['value'] for a in DATA['people'][99]['spaces']['secondary']['attributes'] if a['key'] == 'event_role' and a['visibility'] == 'authenticated']
    check([a['value'] for a in secondary_rare['space']['attributes'] if a['key'] == 'event_role'] == expected_role, 'second Space detail uses its independent activity role')
    viewer.select(primary); viewer.error(listing, 409, 'DISCOVERY_CURSOR_INVALID', query={'cursor':old_cursor})
    final = sql()
    check(final['counts'] == manifest['counts'] and final['synthetic_ai_jobs'] == 0, 'cleanup restores memberships and opt-ins; ordinary HTTP creates no AI jobs')
    return {'status':'passed','scope':'Independent real session, CSRF, HTTP and synthetic-only MySQL verification on allocated audit clone and loopback 8099.', 'checks':len(CHECKS),'checks_passed':CHECKS,'http_requests':REQUESTS,'elapsed_seconds':round(time.monotonic()-started,3),'database':DB,'synthetic_people':100,'memberships':final['counts'],'profile_counts':final['profile_counts'],'model_calls':0,'synthetic_ai_jobs':final['synthetic_ai_jobs'],'limitations':['100-person functional dataset, not a 300–400-person performance acceptance','15-minute expiry boundary is verified with injected clock in independent memory suite']}
if __name__ == '__main__':
    print(json.dumps(run(), ensure_ascii=False, indent=2))
