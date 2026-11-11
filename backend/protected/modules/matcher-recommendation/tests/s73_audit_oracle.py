"""Independent fixture oracle; never imports production code or generator expectations."""
import datetime as dt
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
DATA_PATH = ROOT / 'docs/用户画像收集/examples/s73-people_2026-11-12.json'
VIEWER_NUMBER = 321
PUBLIC_KEYS = {'direction', 'interest', 'event_goal', 'headline', 'bio', 'seeking', 'role', 'skill', 'project', 'event_role', 'event_contribution', 'event_seeking', 'mbti', 'personality', 'collaboration_preference', 'communication_preference', 'event_contact_preference', 'event_collaboration_mode', 'event_availability'}
CODE_KEYS = ('role', 'skill', 'interest', 'direction', 'event_role')

def load():
    raw = DATA_PATH.read_bytes(); data = json.loads(raw)
    assert data['synthetic'] is True
    assert len(data['people']) == 400
    assert [p['number'] for p in data['people']] == list(range(1, 401))
    assert [p['username'] for p in data['people']] == [f's73_sim_{n:03d}' for n in range(1, 401)]
    for visibility in ('private', 'friends'):
        entries = [a for p in data['people'] for a in p['global']['attributes'] if a['key'] == 'skill' and a['value'].get('code') == 's73-' + visibility + '-sentinel-skill']
        assert entries and all(a['visibility'] == visibility for a in entries)
    drafts = [a for p in data['people'] for a in p['global'].get('draft_attributes', []) if a['key'] == 'skill' and a['value'].get('code') == 's73-draft-sentinel-skill']
    assert drafts, 'Draft exclusion must test actual draft values'
    return data, hashlib.sha256(raw).hexdigest()

def utc(value):
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(dt.timezone.utc)

def normalized(values):
    return {x.strip().lower() for x in values if isinstance(x, str)}

def public_attrs(person, space):
    return [a for a in person['global']['attributes'] + person['spaces'][space]['attributes'] if a['key'] in PUBLIC_KEYS and a.get('visibility') == 'authenticated' and a.get('confirmation', 'confirmed') == 'confirmed']

def covers(values, wanted):
    # Independent endpoint sweep; adjacent windows cover their shared boundary.
    intervals = sorted((utc(v['starts_at']), utc(v['ends_at'])) for v in values)
    for request in wanted:
        cursor, end = utc(request['starts_at']), utc(request['ends_at'])
        for start, stop in intervals:
            if stop <= cursor: continue
            if start > cursor: break
            cursor = max(cursor, stop)
            if cursor >= end: break
        if cursor < end: return False
    return True

def score(person, space, filters):
    attrs = public_attrs(person, space); result = 0
    for field, wanted in (filters or {}).items():
        values = [a['value'] for a in attrs if a['key'] == field]
        if field == 'event_availability':
            if not covers(values, wanted): return None
        elif field == 'event_seeking':
            for part, codes in wanted.items():
                hits = normalized(codes) & normalized(c for v in values for c in v.get(part, []))
                if not hits: return None
                result += len(hits)
        else:
            hits = normalized(wanted) & normalized(v.get('code') for v in values)
            if not hits: return None
            result += len(hits)
    return result

def expected(data, manifest, space='primary', filters=None, sort='recent', viewer=VIEWER_NUMBER):
    ranked = []
    for person in data['people']:
        if person['number'] == viewer or space not in person['spaces'] or not person['spaces'][space]['discoverable']: continue
        hits = score(person, space, filters)
        if hits is None: continue
        uid = manifest['users'][str(person['number'])]
        key = hits if sort == 'relevance' else utc(manifest['latest_confirmations'][space][str(uid)])
        ranked.append((key, uid))
    return [uid for _, uid in sorted(ranked, reverse=True)]

def cases(data):
    """Use raw positions, never fixture boundary_cases or expected metadata."""
    people = [p for p in data['people'] if p['number'] != VIEWER_NUMBER and p['spaces']['primary']['discoverable']]
    result = []
    for key in CODE_KEYS:
        positions = {}
        for person in people:
            values = [a['value']['code'] for a in public_attrs(person, 'primary') if a['key'] == key]
            for position, code in enumerate(values): positions.setdefault(position, set()).add(code)
        for position, codes in sorted(positions.items()): result.append((f'{key}_position_{position}', {key: [sorted(codes)[0]]}))
        codes = sorted(set().union(*positions.values()))
        if len(codes) >= 2: result.append((f'{key}_or', {key: codes[:2]}))
    for part in ('role_codes', 'skill_codes'):
        positions = {}
        for person in people:
            for attr in public_attrs(person, 'primary'):
                if attr['key'] != 'event_seeking': continue
                for pos, code in enumerate(attr['value'].get(part, [])): positions.setdefault(pos, set()).add(code)
        for pos, codes in sorted(positions.items()): result.append((f'event_seeking_{part}_{pos}', {'event_seeking': {part: [sorted(codes)[0]]}}))
    counts = {}
    for person in people:
        for code in {a['value']['code'] for a in public_attrs(person, 'primary') if a['key'] == 'skill'}: counts[code] = counts.get(code, 0) + 1
    rare = [a['value']['code'] for a in public_attrs(data['people'][-1], 'primary') if a['key'] == 'skill' and counts[a['value']['code']] == 1]
    assert rare, 'Person 400 needs a unique public skill'
    result.append(('last_person_rare', {'skill': [rare[-1]]}))
    for token in ('s73-private-sentinel-skill', 's73-friends-sentinel-skill', 's73-draft-sentinel-skill', 'definitely-absent-s73-code'):
        result.append((token, {'skill': [token]}))
    seed = people[-1]
    chosen = {k: [a['value']['code'] for a in public_attrs(seed, 'primary') if a['key'] == k] for k in ('role','skill','event_role')}
    result.append(('different_fields_and', {k:v[-2:] for k,v in chosen.items() if v}))
    seeking = next(a['value'] for a in public_attrs(seed, 'primary') if a['key'] == 'event_seeking')
    result.append(('seeking_components_and', {'event_seeking':{k:v[-1:] for k,v in seeking.items() if k in ('role_codes','skill_codes') and v}}))
    result.append(('normalized_duplicate_codes', {'skill':['  ' + rare[-1].upper() + '  ', rare[-1]]}))
    all_spans = []; union = None; adjacent = None; overlapping = None
    for person in people:
        spans = sorted((utc(a['value']['starts_at']), utc(a['value']['ends_at'])) for a in public_attrs(person, 'primary') if a['key'] == 'event_availability')
        all_spans.extend(spans)
        for left, right in zip(spans, spans[1:]):
            if left[0] < right[0] <= left[1] < right[1]:
                union = (left[0],right[1])
                if left[1] == right[0]: adjacent = union
                else: overlapping = union
    assert all_spans and adjacent and overlapping, 'Fixture needs both adjacent and overlapping availability'
    def interval(a,b): return {'starts_at':a.isoformat(), 'ends_at':b.isoformat()}
    left, right = all_spans[0]
    result.extend([
        ('complete_window', {'event_availability':[interval(left,right)]}),
        ('joined_window', {'event_availability':[interval(*union)]}),
        ('adjacent_window', {'event_availability':[interval(*adjacent)]}),
        ('overlapping_window', {'event_availability':[interval(*overlapping)]}),
        ('overlap_does_not_cover_extension', {'event_availability':[interval(union[0], union[1]+dt.timedelta(minutes=1))]}),
        ('joined_window_timezone', {'event_availability':[interval(union[0].astimezone(dt.timezone(dt.timedelta(hours=8))),union[1].astimezone(dt.timezone(dt.timedelta(hours=8))))]}),
        ('all_windows_required', {'event_availability':[interval(left,right),interval(*union)]}),
        ('partial_overlap_insufficient', {'event_availability':[interval(left-dt.timedelta(minutes=1),right+dt.timedelta(days=90))]}),
    ])
    return result, rare[-1]

if __name__ == '__main__':
    data, digest = load(); probes, rare = cases(data)
    print(json.dumps({'dataset_sha256':digest, 'people':len(data['people']), 'probe_count':len(probes), 'probe_names':[name for name,_ in probes], 'rare_skill':rare}, ensure_ascii=False, indent=2))
