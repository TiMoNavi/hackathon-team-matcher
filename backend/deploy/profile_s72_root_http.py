#!/usr/bin/env python3
"""Root S7.2 HTTP smoke and preservation of owner choices during fixture replay."""
import http.cookiejar
import json
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
DB = 'humhub_profile_s72_test_root_23fd1b71'
BASE = 'http://127.0.0.1:8100'
OUT = ROOT / 'docs/用户画像收集/sources'
SEED = json.loads((OUT / 's7-main-seed_2026-11-12.json').read_text())
CHECKS = []

def check(ok, name):
    if not ok:
        raise AssertionError(name)
    CHECKS.append(name)

class Client:
    def __init__(self, owner):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        status, body = self.call('/__s72_test/login?id=' + str(owner))
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
    primary, secondary = SEED['primary_space_id'], SEED['secondary_space_id']
    owner_id, viewer_id = SEED['people']['81'], SEED['people']['82']
    owner, viewer = Client(owner_id), Client(viewer_id)
    owner.select(primary)
    viewer.select(primary)
    overview_path = '/api/v1/events/' + str(primary) + '/profiles/' + str(owner_id) + '/overview'
    relations_path = '/api/v1/events/' + str(primary) + '/profiles/' + str(owner_id) + '/relations?kind=idea_groups'
    overview = viewer.ok(overview_path)
    check(overview['school_overview']['key'] == 'education' and overview['primary_portfolio_link']['key'] == 'portfolio_link', 'selected synthetic school and main homepage appear')
    check(overview['global']['scope'] == 'global' and overview['space']['scope'] == 'space:' + str(primary), 'global and current Space profile remain separate')
    relations = viewer.ok(relations_path)
    check(len(relations['items']) >= 1, 'formal shared idea relation appears')
    item = relations['items'][0]
    check('message_id' not in item and ('模拟' in item['title'] or '虚构' in item['title']), 'relation contains synthetic formal metadata without raw conversation id')
    detail = viewer.ok(item['href'])
    check(detail['summary'] == item['summary'], 'authorized metadata detail agrees with relation summary')
    original = owner.ok('/api/v1/me/profile/presentation')
    share_path = '/api/v1/me/profile/relation-sharing?space_id=' + str(primary)
    share_item = next(x for x in owner.ok(share_path + '&kind=idea_groups')['items'] if x['id'] == item['id'])
    def save_presentation(current, school, link):
        return owner.ok('/api/v1/me/profile/presentation', 'PUT', {'expected_version': current['version'], 'education_attribute_id': school, 'primary_portfolio_attribute_id': link, 'confirmation_intent': 'confirm'})
    def share(current, visibility):
        return owner.ok(share_path, 'PUT', {'expected_version': current['sharing_version'], 'kind': 'idea_groups', 'object_id': item['id'], 'visibility': visibility, 'confirmation_intent': 'confirm'})
    try:
        save_presentation(original, None, None)
        share(share_item, 'private')
        check(viewer.ok(overview_path)['school_overview'] is None and viewer.ok(overview_path)['primary_portfolio_link'] is None, 'explicit clearing leaves both overview references empty')
        check(item['id'] not in [x['id'] for x in viewer.ok(relations_path)['items']], 'owner private choice removes participation disclosure')
        command = [str(ROOT / 'backend/.runtime/php-mysql/bin/php'), '-c', str(ROOT / 'backend/.runtime/php.ini'), str(ROOT / 'backend/deploy/profile_s72_examples.php'), 'seed', DB]
        process = subprocess.run(command, capture_output=True, text=True)
        if process.returncode:
            raise AssertionError('Guarded S72 replay failed')
        replay = json.loads(process.stdout)
        (OUT / 's72-root-modified-replay_2026-11-12.json').write_text(json.dumps(replay, ensure_ascii=False, indent=2) + chr(10))
        current = owner.ok('/api/v1/me/profile/presentation')
        check(current['education_attribute_id'] is None and current['primary_portfolio_attribute_id'] is None, 'fixture replay preserves owner-cleared presentation')
        current_share = next(x for x in owner.ok(share_path + '&kind=idea_groups')['items'] if x['id'] == item['id'])
        check(current_share['visibility'] == 'private', 'fixture replay preserves owner-private relation')
        check(item['id'] not in [x['id'] for x in viewer.ok(relations_path)['items']], 'replay does not republish owner participation')
    finally:
        current = owner.ok('/api/v1/me/profile/presentation')
        save_presentation(current, original['education_attribute_id'], original['primary_portfolio_attribute_id'])
        current_share = next(x for x in owner.ok(share_path + '&kind=idea_groups')['items'] if x['id'] == item['id'])
        share(current_share, share_item['visibility'])
    viewer.select(secondary)
    secondary_relations = viewer.ok('/api/v1/events/' + str(secondary) + '/profiles/' + str(owner_id) + '/relations?kind=idea_groups')
    check(len(secondary_relations['items']) >= 1 and all(x['event_id'] == str(secondary) for x in secondary_relations['items']), 'same long-term idea has distinct current Space relation')
    check(not set(x['id'] for x in secondary_relations['items']) & set(x['id'] for x in relations['items']), 'primary and secondary IdeaActivity ids are distinct')
    status, _ = viewer.call(overview_path)
    check(status in [403,409], 'stale Space overview cannot override current selection')
    report = {'status': 'passed', 'environment': 'isolated_root_s72_clone', 'checks': len(CHECKS), 'checks_passed': CHECKS, 'llm_calls': 0}
    (OUT / 's72-root-http_2026-11-12.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + chr(10))
    print(json.dumps(report, ensure_ascii=False))

if __name__ == '__main__':
    run()
