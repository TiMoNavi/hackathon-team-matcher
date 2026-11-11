#!/usr/bin/env python3
"""Independent offline checks for the explicitly fictional S7 people fixture."""
import collections
import datetime as dt
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[5]
DATASET = ROOT / 'docs/用户画像收集/examples/s7-people_2026-11-12.json'

def run():
    data = json.loads(DATASET.read_text())
    people = data['people']
    checks = []
    def check(ok, message):
        if not ok:
            raise AssertionError(message)
        checks.append(message)

    check(data['synthetic'] is True and '完全虚构' in data['notice'], 'dataset explicitly declares wholly fictional people')
    check(len(people) == 100 and [p['number'] for p in people] == list(range(1, 101)), 'exactly 100 people in stable numeric order')
    for field in ['fixture_key', 'username', 'email', 'nickname']:
        check(len({p[field] for p in people}) == 100, field + ' is unique for every person')
    check(all(p['synthetic'] is True and '模拟' in p['nickname'] for p in people), 'every nickname retains a visible simulation marker')
    check(all(re.fullmatch(r's7_sim_\d{3}', p['fixture_key']) and p['username'] == p['fixture_key'] for p in people), 'simulation usernames and fixture keys use explicit stable namespace')
    check(all(p['email'] == p['username'] + '@example.invalid' for p in people), 'all account emails use non-deliverable example.invalid')
    check(all(any(a['key'] == 'bio' and '完全虚构' in a['value'] for a in p['global']['attributes']) for p in people), 'every biography explicitly identifies fictional content')
    memberships = collections.Counter(k for p in people for k in p['spaces'])
    optin = collections.Counter(k for p in people for k, v in p['spaces'].items() if v['discoverable'])
    check(dict(memberships) == {'primary': 100, 'secondary': 20}, 'primary and secondary memberships are exactly 100 and 20')
    check(dict(optin) == {'primary': 90, 'secondary': 18}, 'primary and secondary opt-in counts are exactly 90 and 18')
    check([p['number'] for p in people if 'secondary' in p['spaces']] == list(range(81, 101)), 'secondary memberships are people 81 through 100')
    for space in ['primary', 'secondary']:
        check([p['number'] for p in people if space in p['spaces'] and not p['spaces'][space]['discoverable']] == data['boundary_cases'][space + '_optout'], space + ' opt-outs match declared boundary examples')
    check(all(p['spaces']['primary']['attributes'] != p['spaces']['secondary']['attributes'] for p in people if 'secondary' in p['spaces']), 'every dual-Space person has distinct activity context')
    confirmed = []; drafts = []; labels = collections.Counter(); skill_codes = set(); roles = set()
    for person in people:
        for scope, block in [('global', person['global']), *person['spaces'].items()]:
            for attr in block['attributes']:
                check_scope = not attr['key'].startswith('event_') if scope == 'global' else attr['key'].startswith('event_')
                if not check_scope:
                    raise AssertionError('cross-scope attribute: ' + str(person['number']) + '/' + scope + '/' + attr['key'])
                confirmed.append(attr); labels[attr['key']] += 1
                if attr['key'] == 'skill': skill_codes.add(attr['value']['code'])
                if attr['key'] == 'role': roles.add(attr['value']['code'])
                if attr['key'] == 'event_availability':
                    start = dt.datetime.fromisoformat(attr['value']['starts_at'].replace('Z', '+00:00'))
                    end = dt.datetime.fromisoformat(attr['value']['ends_at'].replace('Z', '+00:00'))
                    if start.tzinfo is None or end.tzinfo is None or start >= end: raise AssertionError('invalid availability')
            drafts.extend(block['draft_attributes'])
    check(len(confirmed) == 3948 and len(drafts) == 32, 'actual attribute counts match 3948 confirmed fixture entries and 32 drafts')
    check(dict(collections.Counter(a['visibility'] for a in confirmed)) == data['statistics']['visibility'], 'visibility distribution matches actual fixture entries')
    check(dict(labels) == data['statistics']['field_counts'], 'field count summary matches actual fixture entries')
    check(len(skill_codes) >= 30 and len(roles) >= 10, 'dataset includes varied skill and role codes')
    check(all(a['visibility'] in {'authenticated', 'friends', 'private'} for a in confirmed + drafts), 'every entry has explicit supported visibility')
    check([p['number'] for p in people if any(a['key'] == 'skill' and a['value']['code'] == 'wasm-component-model' and a['visibility'] == 'authenticated' for a in p['global']['attributes'])] == [100], 'only last person has the visible rare skill')
    for sentinel, visibility, key in [('private-sentinel-skill', 'private', 'private_skill_people'), ('friends-sentinel-skill', 'friends', 'friends_skill_people')]:
        found = [p['number'] for p in people if any(a['key'] == 'skill' and a['value']['code'] == sentinel and a['visibility'] == visibility for a in p['global']['attributes'])]
        check(found == data['boundary_cases'][key], sentinel + ' appears only on declared private or friends entries')
        check(not any(a['key'] == 'skill' and a['value']['code'] == sentinel and a['visibility'] == 'authenticated' for a in confirmed), sentinel + ' never appears in authenticated entries')
    check([p['number'] for p in people if p['global']['draft_attributes']] == data['boundary_cases']['draft_people'], 'unconfirmed examples stay in distinct draft collections')
    check(not any(a['key'] == 'skill' and a['value']['code'] == 'draft-sentinel-skill' for a in confirmed), 'draft sentinel does not appear in confirmed fixture entries')
    def walk(value):
        if isinstance(value, dict):
            for sub in value.values(): yield from walk(sub)
        elif isinstance(value, list):
            for sub in value: yield from walk(sub)
        elif isinstance(value, str): yield value
    urls = [v for v in walk(people) if v.startswith(('http://', 'https://'))]
    check(urls and all(urlsplit(url).hostname == 'example.org' and urlsplit(url).username is None for url in urls), 'all external-looking URLs are example.org fixtures without credentials')
    check(all('event_' not in a['key'] for p in people for a in p['global']['attributes']), 'activity fields never leak into global fixture context')
    return {'status': 'passed', 'scope': 'Independent offline fictional dataset audit; no database, HTTP, network or model calls.', 'checks': len(checks), 'checks_passed': checks, 'distribution': {'memberships': dict(memberships), 'optin': dict(optin), 'confirmed_attributes': len(confirmed), 'draft_attributes': len(drafts), 'unique_skills': len(skill_codes), 'unique_roles': len(roles)}, 'model_calls': 0, 'network_calls': 0}

if __name__ == '__main__':
    print(json.dumps(run(), ensure_ascii=False, indent=2))
