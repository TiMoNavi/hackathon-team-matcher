#!/usr/bin/env python3
"""Independent S5-B HTTP acceptance using synthetic isolated accounts only."""
import argparse
import http.cookiejar
import json
from pathlib import Path
import re
import urllib.error
import urllib.request
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('base')
parser.add_argument('fixture')
parser.add_argument('--login-path', default='/__s5b_test/login')
args = parser.parse_args()
assert re.fullmatch(r'http://127[.]0[.]0[.]1:(809[1-9]|81[0-9]{2})', args.base)
fixture_path = Path(args.fixture).resolve()
assert '/.runtime/' in str(fixture_path) and 's5b' in str(fixture_path)
fixture = json.loads(fixture_path.read_text())
checks = []
requests = 0

def check(name, condition):
    checks.append({'name': name, 'passed': bool(condition)})
    if not condition:
        raise AssertionError(name)

class Client:
    def __init__(self, user=None):
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        if user is not None:
            status, payload, _ = self.call('GET', args.login_path + '?id=' + str(user))
            assert status == 200 and payload.get('csrf'), 'Synthetic login failed'
            self.csrf = payload['csrf']

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
        request = urllib.request.Request(args.base + path, method=method, headers=headers, data=data)
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

def versions(session, name):
    return {scope: {key: draft[key] for key in ['draft_version', 'base_revision']}
            for scope, draft in session[name].items() if draft is not None}

def run():
    owner = Client(fixture['users']['viewer'])
    other = Client(fixture['users']['owner'])
    anonymous = Client()
    sources = '/api/v1/me/profile/sources'
    extractions = '/api/v1/me/profile/extractions'
    capabilities = '/api/v1/me/profile/source-capabilities'
    sessions = '/api/v1/onboarding/sessions'
    check('anonymous_source_list_rejected', anonymous.call('GET', sources)[0] == 401)
    check('anonymous_capabilities_rejected', anonymous.call('GET', capabilities)[0] == 401)
    caps = owner.data('GET', capabilities)['readers']
    check('four_reader_kinds_enabled', all(caps[k]['enabled'] for k in ('github', 'resume', 'web', 'text')))
    check('web_text_readers_available', caps['web']['available'] and caps['text']['available'])
    text = '姓名：S5B 独立合成用户\n城市：杭州\n自我介绍：只采用明确字段\n技能：Python、TypeScript\n\n项目：独立验收工具\n贡献：验证资料来源边界\n技术栈：Python\n链接：https://example.invalid/s5b-project\n\n私有原文标记 AUDIT-S5B-PRIVATE-SOURCE-ONLY\n'.replace('\\n', '\n')
    payload = {'kind': 'text', 'text': text, 'label': '独立合成资料', 'ownership': 'self'}
    check('text_import_requires_login', anonymous.call('POST', sources, payload)[0] == 401)
    check('text_import_requires_csrf', owner.call('POST', sources, payload, csrf=False)[0] == 400)
    check('text_import_requires_request_key', owner.call('POST', sources, payload, key='')[0] == 400)
    check('ownership_declaration_required', owner.call('POST', sources, {k:v for k,v in payload.items() if k != 'ownership'})[0] == 422)
    check('third_party_ownership_rejected', owner.call('POST', sources, {**payload, 'ownership':'third_party'})[0] == 422)
    for key,value in [('url','https://example.invalid'),('owner_id',fixture['users']['owner']),('visibility','authenticated')]:
        check('text_rejects_extra_'+key, owner.call('POST',sources,{**payload,key:value})[0] == 422)
    check('oversized_json_rejected', owner.call('POST', sources, {**payload,'text':'a'*300000})[0] == 413)
    check('empty_text_rejected', owner.call('POST', sources, {**payload,'text':'  '})[0] == 422)
    for label,url in [('loopback_literal','http://127.0.0.1/'),('loopback_numeric','http://2130706433/'),('loopback_ipv6','http://[::1]/'),('credentials','https://user:password@example.org/'),('file_scheme','file:///etc/passwd'),('unsupported_port','https://example.org:8090/')]:
        check('web_rejects_'+label,owner.call('POST',sources,{'kind':'web','url':url,'ownership':'self'})[0] == 422)
    check('web_rejects_text',owner.call('POST',sources,{'kind':'web','url':'https://example.org/','text':'forged','ownership':'self'})[0] == 422)
    session = owner.data('POST',sessions,{'space_id':fixture['spaces'][0]})
    draft = session['input_drafts']['global']
    draft = owner.data('PUT','/api/v1/me/profile/drafts/'+draft['id'],{'expected_version':draft['draft_version'],'fields':[{'key':'bio','value':'Manual private introduction stays','visibility':'private'}]})
    request_key = str(uuid.uuid4())
    source = owner.data('POST',sources,payload,request_key)
    check('real_text_pipeline_ready',source['kind']=='text' and source['status']=='ready')
    check('chinese_newlines_preserved',source['snapshot']['raw_text']==text)
    check('ownership_marked_self_declared',source['snapshot']['metadata']['ownership_basis']=='self_declared')
    check('source_zero_models',source['llm_calls']==0 and source['snapshot']['metadata']['llm_calls']==0)
    check('text_canonical_url_null',source['canonical_url'] is None)
    section_ids = {s['id'] for s in source['snapshot']['sections']}
    check('evidence_resolves_saved_sections',all(c['evidence'] and set(c['evidence'])<=section_ids for c in source['snapshot']['candidates']))
    check('explicit_fields_mapped',{'real_name','city','skill','project'}<={c['key'] for c in source['snapshot']['candidates']})
    check('import_does_not_publish',owner.data('GET','/api/v1/me/profile')['attributes']==[])
    check('same_key_replays_source',owner.data('POST',sources,payload,request_key)['id']==source['id'])
    check('same_text_reuses_snapshot',owner.data('POST',sources,payload)['latest_snapshot_id']==source['latest_snapshot_id'])
    check('same_key_changed_text_conflicts',owner.call('POST',sources,{**payload,'text':text+'changed'},key=request_key)[0]==409)
    path = sources+'/'+source['id']
    check('list_omits_raw_snapshot',all(s['snapshot'] is None for s in owner.data('GET',sources)['sources']))
    check('foreign_read_not_found',other.call('GET',path)[0]==404)
    check('foreign_delete_not_found',other.call('DELETE',path,{'expected_version':source['version']})[0]==404)
    check('foreign_refresh_not_found',other.call('POST',path+'/refresh',{'expected_version':source['version'],'text':text,'ownership':'self'})[0]==404)
    check('source_read_no_store','no-store' in owner.call('GET',path)[2].get('Cache-Control',''))
    adopt = {'source_id':source['id'],'expected_version':source['version'],'draft_id':draft['id'],'expected_draft_version':draft['draft_version'],'candidate_ids':[c['id'] for c in source['snapshot']['candidates']]}
    check('foreign_adoption_not_found',other.call('POST',extractions,adopt)[0]==404)
    check('stale_source_adoption_rejected',owner.call('POST',extractions,{**adopt,'expected_version':0})[0]==409)
    check('unrelated_candidate_rejected',owner.call('POST',extractions,{**adopt,'candidate_ids':['unrelated-candidate']})[0]==422)
    applied = owner.data('POST',extractions,adopt)
    check('manual_private_field_preserved',any(a['key']=='bio' and a['value']=='Manual private introduction stays' and a['visibility']=='private' for a in applied['draft']['preview_attributes']))
    check('new_fields_default_authenticated',all(a['visibility']=='authenticated' for a in applied['draft']['preview_attributes'] if a['key']!='bio'))
    check('adoption_does_not_publish',owner.data('GET','/api/v1/me/profile')['attributes']==[])
    check('raw_text_not_copied_to_draft','AUDIT-S5B-PRIVATE-SOURCE-ONLY' not in json.dumps(applied['draft']))
    check('text_retry_requires_original_content',owner.call('POST',path+'/refresh',{'expected_version':source['version'],'ownership':'self'})[0]==422)
    check('changed_text_cannot_replace_source',owner.call('POST',path+'/refresh',{'expected_version':source['version'],'text':text+'changed','ownership':'self'})[0]==409)
    refreshed = owner.data('POST',path+'/refresh',{'expected_version':source['version'],'text':text,'ownership':'self'})
    check('text_refresh_versioned',refreshed['version']==source['version']+1 and refreshed['latest_snapshot_id']!=source['latest_snapshot_id'])
    check('old_evidence_version_rejected',owner.call('POST',extractions,adopt)[0]==409)
    deleted = owner.data('DELETE',path,{'expected_version':refreshed['version']})
    check('delete_scrubs_identity_snapshot',deleted['status']=='deleted' and deleted['snapshot'] is None and deleted['canonical_url'] is None and deleted['external_id'] is None)
    check('deleted_read_not_found',owner.call('GET',path)[0]==404)
    check('deleted_adoption_not_found',owner.call('POST',extractions,{**adopt,'expected_version':deleted['version']})[0]==404)
    current_draft = owner.data('GET','/api/v1/me/profile/drafts/'+draft['id'])
    check('adopted_values_survive_source_deletion',any(a['key']=='project' for a in current_draft['preview_attributes']))
    session = owner.data('GET',sessions+'/'+session['id'])
    def change(action,**extra):
        return owner.data('PUT',sessions+'/'+session['id'],{'expected_version':session['version'],'action':action,**extra})
    session = change('move',stage='review')
    session = change('review_confirm',confirmation_intent='confirm',draft_versions=versions(session,'input_drafts'))
    check('explicit_review_confirms_adopted_facts',session['stage']=='questions' and any(a['key']=='project' for a in session['profiles']['global']['attributes']))
    visible = other.data('GET','/api/v1/spaces/'+str(fixture['spaces'][0])+'/profiles/'+str(fixture['users']['viewer']))
    check('private_bio_hidden_from_member',all(a['key']!='bio' for a in visible['global']['attributes']))
    check('raw_source_absent_from_visible_profile','AUDIT-S5B-PRIVATE-SOURCE-ONLY' not in json.dumps(visible))
    session = owner.data('POST','/api/v1/me/profile/question-batches',{'session_id':session['id'],'expected_version':session['version'],'generation_mode':'rules'})
    batch = session['question_batch']
    for q in batch['questions']:
        batch = owner.data('PUT','/api/v1/me/profile/question-batches/'+batch['id']+'/answers/'+q['id'],{'expected_version':0,'answer_type':'skipped'})
    session = owner.data('POST','/api/v1/me/profile/syntheses',{'session_id':session['id'],'expected_version':session['version'],'expected_batch_version':batch['version'],'generation_mode':'rules'})
    check('imported_facts_reach_rules_draft',session['stage']=='draft' and any(a['key']=='project' for a in session['output_drafts']['global']['preview_attributes']))
    session = change('move',stage='privacy')
    session = change('complete',confirmation_intent='confirm',draft_versions=versions(session,'output_drafts'),expected_batch_version=batch['version'])
    check('full_backend_flow_without_model',session['status']=='completed' and session['llm_calls']==0)
    next_space = owner.data('POST',sessions,{'space_id':fixture['spaces'][1]})
    check('globals_preserved_next_space_empty',any(a['key']=='project' for a in next_space['profiles']['global']['attributes']) and next_space['profiles']['space']['attributes']==[])
    return {'status':'passed','passed':len(checks),'checks':checks,'http_requests':requests,'scope':'isolated real HTTP/session/CSRF and SQL; real local text reader; no browser or AI','raw_source_in_report':False,'llm_calls':0}

try:
    print(json.dumps(run(),ensure_ascii=False,indent=2))
except Exception as error:
    print(json.dumps({'status':'failed','passed':sum(c['passed'] for c in checks),'checks':checks,'http_requests':requests,'error':str(error)},ensure_ascii=False,indent=2))
    raise SystemExit(1)
