#!/usr/bin/env python3
"""Deterministic fictional S7.3 data and independent Python filtering oracle.
No database, HTTP, model, private input, or writes to the original S7 fixture.
"""
import argparse
import copy
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/用户画像收集/examples'
DATASET = 's73-people_2026-11-12'
SOURCE = OUT / 's7-people_2026-11-12.json'
PRIMARY_OUT = list(range(10, 400, 10)) + [399]
SECONDARY_OUT = list(range(330, 400, 10)) + [399]
RARE = 's73-wasm-component-model'


def attr(key, value, visibility='authenticated'):
    return {'key': key, 'value': value, 'visibility': visibility}


def timestamp(text):
    return datetime.fromisoformat(text.replace('Z', '+00:00')).astimezone(timezone.utc)


def coverage(available, required):
    """Independent sweep advances a cursor through every requested UTC interval."""
    windows = sorted((timestamp(v['starts_at']), timestamp(v['ends_at'])) for v in available)
    for query in required:
        cursor, end = timestamp(query['starts_at']), timestamp(query['ends_at'])
        for start, stop in windows:
            if stop <= cursor:
                continue
            if start > cursor:
                break
            cursor = max(cursor, stop)
            if cursor >= end:
                break
        if cursor < end:
            return False
    return True


def oracle(data, alias, filters):
    """Dataset-only oracle, intentionally independent of production PHP imports."""
    result = []
    for person in data['people']:
        context = person['spaces'].get(alias)
        if not context or not context['discoverable']:
            continue
        values = {}
        for block in (person['global'], context):
            for item in block['attributes']:
                if item['visibility'] == 'authenticated':
                    values.setdefault(item['key'], []).append(item['value'])
        score, matches = 0, True
        for field, requested in filters.items():
            if field == 'event_availability':
                if not coverage(values.get(field, []), requested):
                    matches = False
                    break
                continue
            groups = requested if field == 'event_seeking' else {'code': requested}
            for part, codes in groups.items():
                found = set()
                for value in values.get(field, []):
                    terms = [value.get('code', '')] if part == 'code' else value.get(part, [])
                    found.update(term.strip().lower() for term in terms)
                hits = found & {term.strip().lower() for term in codes}
                if not hits:
                    matches = False
                    break
                score += len(hits)
            if not matches:
                break
        if matches:
            result.append({'number': person['number'], 'score': score})
    return result


def interval(start, stop, day='28'):
    return {'starts_at': f'2026-11-{day}T{start}:00Z', 'ends_at': f'2026-11-{day}T{stop}:00Z'}


def test_cases():
    cases = [('all-primary', 'primary', {}), ('all-secondary', 'secondary', {})]
    for field, values in [('role', ['frontend', 'systems', 'writer']),
                          ('skill', ['react', 'postgresql', 'test-design']),
                          ('interest', ['education', 'privacy', 'science']),
                          ('direction', ['education', 'developer-tools', 'care']),
                          ('event_role', ['frontend', 'qa', 'writer'])]:
        cases += [(f'{field}-single', 'primary', {field: values[:1]}),
                  (f'{field}-multi-or', 'primary', {field: values}),
                  (f'{field}-second-query-item', 'primary', {field: ['s73-no-match', values[1]]})]
    cases += [('rare-last', 'primary', {'skill': [RARE]}),
              ('rare-last-secondary', 'secondary', {'skill': [RARE]}),
              ('no-match', 'primary', {'skill': ['s73-no-match']}),
              ('private-sentinel', 'primary', {'skill': ['s73-private-sentinel-skill']}),
              ('friends-sentinel', 'primary', {'skill': ['s73-friends-sentinel-skill']}),
              ('draft-sentinel', 'primary', {'skill': ['s73-draft-sentinel-skill']}),
              ('draft-event-sentinel', 'primary', {'event_role': ['s73-draft-event-sentinel']}),
              ('fields-and', 'primary', {'role': ['frontend'], 'skill': ['react']}),
              ('fields-and-no-match', 'primary', {'role': ['frontend'], 'skill': [RARE]}),
              ('normalized-deduplicated-codes', 'primary', {'skill': [' REACT ', 'react', 'POSTGRESQL']})]
    for alias in ('primary', 'secondary'):
        for part in ('role_codes', 'skill_codes'):
            for pos in (2, 3):
                marker = f's73-{alias}-{part}-item-{pos}'
                cases.append((f'{alias}-{part}-stored-item-{pos}', alias, {'event_seeking': {part: [marker]}}))
                cases.append((f'{alias}-{part}-stored-item-{pos}-other-space', 'secondary' if alias == 'primary' else 'primary', {'event_seeking': {part: [marker]}}))
        cases.append((f'{alias}-seeking-groups-and', alias, {'event_seeking': {
            'role_codes': [f's73-{alias}-role_codes-item-2'],
            'skill_codes': [f's73-{alias}-skill_codes-item-3']}}))
    windows = [('complete-adjacent-or-overlap', [interval('01:00', '05:00')]),
               ('exact-left-boundary', [interval('01:00', '03:00')]),
               ('gap-not-covered', [interval('02:30', '03:30')]),
               ('partial-overlap-insufficient', [interval('00:30', '02:00')]),
               ('zero-width-touch-insufficient', [interval('05:00', '06:00')]),
               ('two-separated-requests', [interval('01:00', '02:00'), interval('12:00', '13:00')]),
               ('offset-equivalent', [{'starts_at': '2026-11-28T09:00:00+08:00', 'ends_at': '2026-11-28T13:00:00+08:00'}]),
               ('entire-day-no-match', [interval('00:00', '23:00')]),
               ('secondary-day', [interval('01:00', '05:00', '29')])]
    for label, required in windows:
        for alias in ('primary', 'secondary'):
            cases.append((f'{alias}-time-{label}', alias, {'event_availability': required}))
    return [{'id': label, 'space_alias': alias, 'filters': query} for label, alias, query in cases]


def generate():
    source_raw = SOURCE.read_bytes()
    source = json.loads(source_raw)
    assert source['dataset_id'] == 's7-people_2026-11-12' and len(source['people']) == 100
    people = []
    for number in range(1, 401):
        old = source['people'][(number - 1) % 100]
        name = f's73_sim_{number:03d}'
        person = json.loads(json.dumps(old, ensure_ascii=False).replace(old['username'], name).replace('/s7/', '/s73/').replace('private-sentinel-skill', 's73-private-sentinel-skill').replace('friends-sentinel-skill', 's73-friends-sentinel-skill').replace('draft-sentinel-skill', 's73-draft-sentinel-skill').replace('draft-event-sentinel', 's73-draft-event-sentinel'))
        person.update(number=number, fixture_key=name, username=name, email=name + '@example.invalid', nickname=f'模拟·S73-{number:03d}')
        cohort = (number - 1) // 100 + 1
        values = person['global']['attributes']
        values[:] = [a for a in values if not (a['key'] == 'skill' and a['value']['code'] == 'wasm-component-model')]
        for item in values:
            if item['key'] in ('real_name', 'headline', 'bio'):
                item['value'] += f'〔S7.3虚构人物{number:03d}，第{cohort}批独立练习〕'
            elif item['key'] == 'project':
                item['value']['title'] += f'·S73-{number:03d}'
                item['value']['contribution'] += f' 另负责第{cohort}批样例的独立核验和交接。'
            elif item['key'] == 'education':
                item['value']['school'] += f'·虚构{cohort}分院'
        if number == 400:
            values.append(attr('skill', {'code': RARE, 'label': 'S7.3唯一虚构组件模型技能', 'self_level': 'expert'}))
        primary = copy.deepcopy(person['spaces']['primary'])
        secondary = copy.deepcopy(person['spaces'].get('secondary', primary))
        person['spaces'] = {'primary': primary}
        if number >= 321:
            person['spaces']['secondary'] = secondary
        for alias, block in person['spaces'].items():
            block['discoverable'] = number not in (PRIMARY_OUT if alias == 'primary' else SECONDARY_OUT)
            for item in block['attributes']:
                if item['key'] == 'event_seeking':
                    for part in ('role_codes', 'skill_codes'):
                        first = item['value'][part][0]
                        item['value'][part] = [first, f's73-{alias}-{part}-item-2']
                        if number % 3 != 0:
                            item['value'][part].append(f's73-{alias}-{part}-item-3')
                    item['value']['free_text'] = f'虚构{number:03d}在{alias}独立需求；不得挪用另一活动的需求。'
                elif item['key'] == 'event_goal':
                    item['value']['free_text'] += f'〔S73-{number:03d}/{alias}独立目标〕'
            block['attributes'][:] = [a for a in block['attributes'] if a['key'] != 'event_availability']
            day = '28' if alias == 'primary' else '29'
            pattern = (number - 1) % 6
            periods = [[('01:00', '05:00')], [('01:00', '03:00'), ('03:00', '05:00')],
                       [('01:00', '04:00'), ('03:00', '05:00')], [('01:00', '02:30'), ('03:00', '05:00')],
                       [('02:00', '04:00')], [('01:00', '03:00'), ('03:00', '05:00')]][pattern]
            for position, (start, stop) in enumerate(periods):
                value = interval(start, stop, day)
                if pattern == 5 and position == 1:
                    value = {'starts_at': f'2026-11-{day}T11:00:00+08:00', 'ends_at': f'2026-11-{day}T13:00:00+08:00'}
                block['attributes'].append(attr('event_availability', {**value, 'timezone': 'Asia/Shanghai'}))
            block['attributes'].append(attr('event_availability', {**interval('12:00', '14:00', day), 'timezone': 'Asia/Shanghai'}))
        people.append(person)
    attrs = [a for p in people for block in [p['global'], *p['spaces'].values()] for a in block['attributes']]
    drafts = [a for p in people for block in [p['global'], *p['spaces'].values()] for a in block['draft_attributes']]
    data = {'dataset_id': DATASET, 'schema_version': 1, 'field_catalog_version': 2, 'synthetic': True,
            'notice': '400名完全虚构的S7.3测试人物；确认仅是fixture经普通owner用例确认，不是真人、抓取或AI结果。',
            'source': {'dataset_id': source['dataset_id'], 'sha256': hashlib.sha256(source_raw).hexdigest(), 'transformation': '公开虚构模板的确定性变换；不读取任何真人资料'},
            'spaces': {'primary': {'name': 'S7.3 规模验证主活动（400人）', 'description': '仅隔离克隆的400名虚构测试人物，不对应真实活动。'},
                       'secondary': {'name': 'S7.3 规模验证第二活动（80人）', 'description': '仅虚构321至400，拥有独立活动需求与时间。'}},
            'statistics': {'people': 400, 'space_members': {'primary': 400, 'secondary': 80}, 'discoverable': {'primary': 360, 'secondary': 72},
                           'confirmed_attributes': len(attrs), 'draft_attributes': len(drafts),
                           'visibility': dict(sorted(Counter(a['visibility'] for a in attrs).items())),
                           'field_counts': dict(sorted(Counter(a['key'] for a in attrs).items()))},
            'boundary_cases': {'last_person': 400, 'last_person_rare_skill': RARE, 'primary_optout': PRIMARY_OUT, 'secondary_optout': SECONDARY_OUT,
                               'private_skill_people': [p['number'] for p in people if any(a['key'] == 'skill' and a['value']['code'] == 's73-private-sentinel-skill' for a in p['global']['attributes'])],
                               'friends_skill_people': [p['number'] for p in people if any(a['key'] == 'skill' and a['value']['code'] == 's73-friends-sentinel-skill' for a in p['global']['attributes'])],
                               'draft_people': [p['number'] for p in people if p['global']['draft_attributes']],
                               'time_pattern': '(number-1)%6: complete, adjacent, overlapping, gap, partial, mixed-offset adjacent'},
            'people': people}
    data['oracle_cases'] = []
    for case in test_cases():
        matched = oracle(data, case['space_alias'], case['filters'])
        case['expected_numbers'] = [row['number'] for row in matched]
        case['expected_scores'] = {str(row['number']): row['score'] for row in matched}
        data['oracle_cases'].append(case)
    assert len(oracle(data, 'primary', {})) == 360 and len(oracle(data, 'secondary', {})) == 72
    assert oracle(data, 'primary', {'skill': [RARE]}) == [{'number': 400, 'score': 1}]
    assert coverage([interval('01:00', '03:00'), interval('03:00', '05:00')], [interval('01:00', '05:00')])
    assert not coverage([interval('01:00', '02:30'), interval('03:00', '05:00')], [interval('01:00', '05:00')])
    return data


def documentation(data, checksum):
    lines = ['# S7.3 四百人固定合成数据', '', '2026-11-12。400名新人物全部虚构，只供两座指定隔离克隆的规模验收，不安装到主预览。原有100人数据与安装工具保持原样。', '',
             f'[JSON]({DATASET}.json) · [生成器与Python oracle](../../../backend/deploy/profile_s73_people_generate.py) · [安装器](../../../backend/deploy/profile_s73_people.php) · [离线确认验证](../../../backend/deploy/profile_s73_people_validate.php)', '',
             f'JSON SHA-256 {checksum}。来源为已公开标记虚构的S7模板，来源哈希 {data["source"]["sha256"]}。没有使用真人数据、联网抓取或模型。', '',
             '## 固定边界', '',
             '- 新身份为s73_sim_001至s73_sim_400；昵称、简历、学校与项目明确标记模拟，每人有独立简介和项目标题。',
             '- primary含400名合成人物、360个开启发现；secondary仅含321–400共80名、72个开启。管理员属于查看条件，不计入合成人数。',
             '- 主活动关闭10至390每十位及399；第二活动关闭330至390每十位及399。400在两活动开启，唯一公开稀有技能为s73-wasm-component-model。',
             '- 角色、技能、兴趣与需求有单值和多值例子；需求role_codes/skill_codes含两项或三项，位置二三各有仅属于该Space的哨兵编码。',
             '- private/friends技能和未确认技能、活动角色草稿留作排除样例。作品只用example.org，邮箱只用example.invalid。',
             '- 时段为2026-11-28（主）和11-29（次），含完整、相邻、重叠、缺口、部分覆盖与混合时区等六种模式；每人另有12:00–14:00 UTC。',
             '- Python oracle按确认字段和authenticated范围计算，字段内OR、字段间AND、需求两组AND。时间采用独立游标覆盖算法，不调用PHP筛选实现。', '',
             f'确认属性 {data["statistics"]["confirmed_attributes"]}，草稿属性 {data["statistics"]["draft_attributes"]}，查询 {len(data["oracle_cases"])}。expected_numbers为合成人物编号升序，expected_scores为编码命中数；数据库ID由私有安装账本映射。查询集不预设recent顺序或动态撤权结果。', '',
             '## 运行与保护', '',
             '安装器只接受humhub_profile_s73_test_root_4a70f3d1或humhub_profile_s73_test_audit_b7a2c940，要求MATCHER_S73_TEST_DB与--target一致、显式--prefix=s73_sim_及管理员viewer-id。所有其他目标在引导连接前拒绝。使用现有本机HumHub连接配置并切换至指定克隆。', '',
             '~~~sh', 'python3 backend/deploy/profile_s73_people_generate.py --check', 'backend/.runtime/php-mysql/bin/php -c backend/.runtime/php.ini backend/deploy/profile_s73_people_validate.php', 'backend/.runtime/php-mysql/bin/php -c backend/.runtime/php.ini backend/deploy/profile_s73_people_guard_test.php', 'MATCHER_S73_TEST_DB=humhub_profile_s73_test_root_4a70f3d1 backend/.runtime/php-mysql/bin/php -c backend/.runtime/php.ini backend/deploy/profile_s73_people.php seed --target=humhub_profile_s73_test_root_4a70f3d1 --viewer-id=1 --prefix=s73_sim_', '~~~', '',
             '安装使用原生User/Space、P1正式草稿确认和ManageDiscoverySettings本人流程，每人独立事务。不修改旧账号、旧Space或未登记拥有的同名对象。通知、活动广播、邮件及队列被拦截；随机口令不打印、不存入账本。私有账本位于backend/.runtime/profile-s73/目标库/people-manifest.json，GUID/ID和数据哈希确认所有权，重放保留用户修改。', '',
             'inspect不产生安装数据；seed每人提交后记录进度，可中断后继续。发现版本非零即保留当前选择，完整用户不重写P1属性。输出仅合成ID映射、数量、哈希和被抑制的副作用数。离线验证不连接数据库或HTTP，本文件不是实际安装、索引或性能验收报告。', '',
             '## 独立期望集', '', '|查询|Space|期望人数|', '|---|---|---|']
    lines += [f'|{c["id"]}|{c["space_alias"]}|{len(c["expected_numbers"])}|' for c in data['oracle_cases']]
    lines += ['', '## 合成人物目录', '', '|编号|昵称|主角色|主发现|第二活动|', '|---|---|---|---|---|']
    for p in data['people']:
        role = next(a['value']['label'] for a in p['global']['attributes'] if a['key'] == 'role')
        lines.append(f'|{p["number"]}|{p["nickname"]}|{role}|{"开" if p["spaces"]["primary"]["discoverable"] else "关"}|{"独立偏好" if "secondary" in p["spaces"] else "未加入"}|')
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Read-only deterministic verification')
    args = parser.parse_args()
    data = generate()
    raw = (json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    checksum = hashlib.sha256(raw).hexdigest()
    md = documentation(data, checksum)
    if args.check:
        assert (OUT / f'{DATASET}.json').read_bytes() == raw, 'JSON differs from deterministic fixture'
        assert (OUT / f'{DATASET}.md').read_text() == md, 'Markdown differs from generated documentation'
    else:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / f'{DATASET}.json').write_bytes(raw)
        (OUT / f'{DATASET}.md').write_text(md)
    print(json.dumps({'status': 'passed' if args.check else 'generated', 'sha256': checksum, 'bytes': len(raw),
                      'oracle_cases': len(data['oracle_cases']), 'database_connections': 0, 'network_requests': 0, 'llm_calls': 0, **data['statistics']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
