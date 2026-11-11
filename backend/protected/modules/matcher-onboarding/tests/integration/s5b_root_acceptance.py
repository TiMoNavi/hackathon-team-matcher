#!/usr/bin/env python3
"""Real HTTP/session/SQL acceptance with fixed web DNS/HTTP and real HTML/text parsers."""
import http.cookiejar
import json
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.request
import uuid

base, database = sys.argv[1:3]
assert re.fullmatch(r'http://127[.]0[.]0[.]1:(809[1-9]|81[0-9]{2})', base)
assert re.fullmatch(r'humhub_profile_s5b_test_[a-z0-9_]+', database)
backend = Path(__file__).resolve().parents[5]
php = [str(backend / '.runtime/php-mysql/bin/php'), '-c', str(backend / '.runtime/php.ini')]
created = subprocess.run(php + [str(Path(__file__).with_name('s5b_fixture.php')), database], capture_output=True, text=True)
assert created.returncode == 0, 'Synthetic fixture creation failed'
fixture = json.loads(created.stdout)
(backend / '.runtime/profile-s5b' / database / 'root-fixture.json').write_text(json.dumps(fixture))
checks = []
requests = 0

def check(name, condition):
    checks.append({'name': name, 'passed': bool(condition)})
    assert condition, name

class Client:
    def __init__(self, user=None):
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        if user is not None:
            status, body, _ = self.call('GET', '/__s5b_test/login?id=' + str(user))
            assert status == 200, 'Synthetic login failed'
            self.csrf = body['csrf']

    def call(self, method, path, body=None, csrf=True, key=None):
        global requests
        requests += 1
        headers = {'Accept': 'application/json'}
        if csrf and self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        if method == 'POST' and key != '':
            headers['Idempotency-Key'] = key or str(uuid.uuid4())
        data = None
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode()
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(base + path, method=method, headers=headers, data=data)
        try:
            response = self.http.open(request, timeout=40)
        except urllib.error.HTTPError as error:
            response = error
        raw = response.read()
        payload = json.loads(raw) if 'application/json' in response.headers.get('Content-Type', '') else None
        return response.status, payload, response.headers

    def data(self, method, path, body=None, key=None):
        status, payload, headers = self.call(method, path, body, key=key)
        assert status in (200, 201), (path, status, (payload or {}).get('error'))
        assert payload['meta']['request_id'] and 'no-store' in headers.get('Cache-Control', '')
        return payload['data']

def upload(client, filename, content):
    global requests
    requests += 1
    boundary = 'S5B' + uuid.uuid4().hex
    data = ('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="' + filename + '"\r\nContent-Type: application/octet-stream\r\n\r\n').encode() + content + ('\r\n--' + boundary + '--\r\n').encode()
    headers = {'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Accept': 'application/json', 'Idempotency-Key': str(uuid.uuid4()), 'X-CSRF-Token': client.csrf}
    request = urllib.request.Request(base + '/api/v1/me/profile/sources/resume', data=data, headers=headers, method='POST')
    try:
        response = client.http.open(request, timeout=40)
    except urllib.error.HTTPError as error:
        response = error
    payload = json.loads(response.read())
    assert response.status == 201, ('resume_upload', response.status, payload.get('error'))
    return payload['data']

def run():
    owner = Client(fixture['users']['owner'])
    other = Client(fixture['users']['viewer'])
    sources = '/api/v1/me/profile/sources'
    capabilities = '/api/v1/me/profile/source-capabilities'
    def count():
        return owner.call('GET', '/__s5b_test/web-state')[1]['requests']
    count_before = count()
    caps = owner.data('GET', capabilities)['readers']
    check('four_kinds_enabled', all(caps[k]['enabled'] for k in ('github', 'resume', 'web', 'text')))
    check('local_readers_ready', all(caps[k]['available'] for k in ('resume', 'web', 'text')))
    check('unlinked_github_still_requires_native_identity', not caps['github']['linked'] and owner.call('POST', sources, {'kind': 'github'})[0] == 409)
    check('capabilities_does_not_fetch', count() == count_before)
    payload = {'kind': 'web', 'url': 'HTTPS://PROFILE.EXAMPLE.ORG:443/start#fragment', 'ownership': 'self'}
    check('web_csrf_required', owner.call('POST', sources, payload, csrf=False)[0] == 400)
    check('web_declaration_required', owner.call('POST', sources, {k:v for k,v in payload.items() if k != 'ownership'})[0] == 422)
    check('web_cannot_choose_another_owner', owner.call('POST', sources, {**payload, 'owner_id': fixture['users']['viewer']})[0] == 422)
    check('rejected_requests_do_not_fetch', count() == count_before)
    key = str(uuid.uuid4())
    source = owner.data('POST', sources, payload, key)
    check('web_import_with_real_parser_ready', source['kind'] == 'web' and source['status'] == 'ready')
    check('redirect_chain_fetches_each_target_once', count() == count_before + 2)
    check('original_canonical_url_retained', source['canonical_url'] == 'https://profile.example.org/start')
    snapshot = source['snapshot']
    check('final_url_only_in_snapshot_metadata', snapshot['metadata']['final_url'] == 'https://final.example.org/landing' and snapshot['canonical_url'] == source['canonical_url'])
    check('ownership_is_declaration', snapshot['metadata']['ownership_basis'] == 'self_declared')
    check('no_script_or_style_in_text', 'ROOT-S5B-SCRIPT' not in snapshot['raw_text'] and 'ROOT-S5B-STYLE' not in snapshot['raw_text'])
    check('html_title_is_source_label', source['label'] == 'S5B Synthetic Profile')
    check('explicit_candidates_are_mapped', {'real_name', 'city', 'bio', 'skill'} <= {c['key'] for c in snapshot['candidates']})
    check('all_candidates_have_section_evidence', all(set(c['evidence']) <= {s['id'] for s in snapshot['sections']} for c in snapshot['candidates']))
    check('web_import_zero_models', source['llm_calls'] == 0 and snapshot['metadata']['llm_calls'] == 0)
    path = sources + '/' + source['id']
    owner.data('GET', path)
    check('list_omits_private_snapshot', all(s['snapshot'] is None for s in owner.data('GET', sources)['sources']))
    owner.data('GET', capabilities)
    check('ordinary_source_reads_never_fetch', count() == count_before + 2)
    check('duplicate_key_reuses_existing_source', owner.data('POST', sources, payload, key)['id'] == source['id'])
    check('normalized_url_reuses_existing_snapshot', owner.data('POST', sources, {**payload, 'url': 'https://profile.example.org/start#other'})['latest_snapshot_id'] == source['latest_snapshot_id'])
    check('changed_target_same_key_rejected', owner.call('POST', sources, {**payload, 'url': 'https://profile.example.org/transient'}, key=key)[0] == 409)
    check('deduplication_does_not_fetch', count() == count_before + 2)
    check('other_user_read_not_found', other.call('GET', path)[0] == 404)
    check('other_user_refresh_not_found', other.call('POST', path + '/refresh', {'expected_version': source['version']})[0] == 404)
    check('other_user_delete_not_found', other.call('DELETE', path, {'expected_version': source['version']})[0] == 404)
    check('refresh_cannot_change_url', owner.call('POST', path + '/refresh', {'expected_version': source['version'], 'url': 'https://profile.example.org/transient'})[0] == 422)
    check('refresh_stale_version_rejected', owner.call('POST', path + '/refresh', {'expected_version': 0})[0] == 409)
    check('rejected_refreshes_never_fetch', count() == count_before + 2)
    refresh_key = str(uuid.uuid4())
    refreshed = owner.data('POST', path + '/refresh', {'expected_version': source['version']}, refresh_key)
    check('refresh_reuses_stored_original_url', refreshed['canonical_url'] == source['canonical_url'] and count() == count_before + 4)
    check('refresh_creates_versioned_snapshot', refreshed['version'] == source['version'] + 1 and refreshed['latest_snapshot_id'] != source['latest_snapshot_id'])
    owner.data('POST', path + '/refresh', {'expected_version': source['version']}, refresh_key)
    check('refresh_retry_does_not_fetch', count() == count_before + 4)
    session = owner.data('POST', '/api/v1/onboarding/sessions', {'space_id': fixture['spaces'][0]})
    draft = session['input_drafts']['global']
    selection = {'source_id': source['id'], 'expected_version': refreshed['version'], 'draft_id': draft['id'], 'expected_draft_version': draft['draft_version'], 'candidate_ids': [c['id'] for c in refreshed['snapshot']['candidates']]}
    applied = owner.data('POST', '/api/v1/me/profile/extractions', selection)
    check('web_candidates_adopted_into_existing_draft', bool(applied['applied']) and any(a['key'] == 'skill' for a in applied['draft']['preview_attributes']))
    check('source_or_adoption_does_not_publish', owner.data('GET', '/api/v1/me/profile')['attributes'] == [])
    check('raw_material_not_copied_to_draft', 'ROOT-S5B-PRIVATE-SOURCE-ONLY' not in json.dumps(applied['draft']))
    deleted = owner.data('DELETE', path, {'expected_version': refreshed['version']})
    check('delete_revokes_and_scrubs_source', deleted['status'] == 'deleted' and deleted['last_job']['applicability'] == 'revoked' and deleted['snapshot'] is None and deleted['canonical_url'] is None)
    check('deleted_source_is_inaccessible', owner.call('GET', path)[0] == 404)
    check('explicitly_adopted_draft_survives_deletion', owner.data('GET', '/api/v1/me/profile/drafts/' + draft['id'])['preview_attributes'] == applied['draft']['preview_attributes'])
    failed_key = str(uuid.uuid4())
    failed = owner.data('POST', sources, {**payload, 'url': 'https://profile.example.org/transient'}, failed_key)
    check('network_failure_retains_retry_target', failed['status'] == 'failed' and failed['canonical_url'] == 'https://profile.example.org/transient' and failed['snapshot'] is None and failed['last_job']['error_code'] == 'WEB_HTTP_FAILED')
    failed_count = count()
    owner.data('POST', sources, {**payload, 'url': 'https://profile.example.org/transient'}, failed_key)
    check('failed_import_not_implicitly_retried', count() == failed_count)
    retry = owner.data('POST', sources + '/' + failed['id'] + '/refresh', {'expected_version': failed['version']})
    check('explicit_retry_recovers_same_source', retry['id'] == failed['id'] and retry['status'] == 'ready' and retry['version'] == failed['version'] + 1)
    blocked = owner.data('POST', sources, {**payload, 'url': 'https://profile.example.org/internal-redirect'})
    check('redirect_to_internal_address_rejected', blocked['status'] == 'failed' and blocked['last_job']['error_code'] == 'INVALID_WEB_URL')
    check('network_error_record_has_no_raw_text_or_trace', blocked['snapshot'] is None and 'trace' not in json.dumps(blocked))
    before_local = count()
    material = '姓名：本地合成简历\n城市：上海\n技能：Python、TypeScript\n'
    pasted = owner.data('POST', sources, {'kind': 'text', 'text': material, 'ownership': 'self'})
    resume = upload(owner, 'synthetic.md', material.encode())
    check('text_reader_uses_same_source_pipeline', pasted['status'] == 'ready' and pasted['snapshot']['raw_text'] == material)
    check('existing_resume_upload_still_works', resume['kind'] == 'resume' and resume['status'] == 'ready')
    mapped = lambda source: [(c['id'], c['key'], c['value']) for c in source['snapshot']['candidates']]
    check('resume_and_text_share_stable_candidate_mapping', mapped(resume) == mapped(pasted))
    check('local_imports_do_not_fetch_websites', count() == before_local)
    check('web_text_resume_sources_coexist', {'web', 'text', 'resume'} <= {s['kind'] for s in owner.data('GET', sources)['sources']})
    return {'status': 'passed', 'passed': len(checks), 'checks': checks, 'http_requests': requests, 'scope': 'isolated real HTTP/session/CSRF/SQL; fixed DNS/HTTP, real HTML/text/resume parsers', 'llm_calls': 0, 'raw_material_in_report': False}

try:
    print(json.dumps(run(), ensure_ascii=False, indent=2))
except Exception as error:
    print(json.dumps({'status': 'failed', 'passed': sum(c['passed'] for c in checks), 'checks': checks, 'http_requests': requests, 'error': str(error)}, ensure_ascii=False, indent=2))
    raise SystemExit(1)
