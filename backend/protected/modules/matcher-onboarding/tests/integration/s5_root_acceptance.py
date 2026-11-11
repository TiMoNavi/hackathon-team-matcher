#!/usr/bin/env python3
"""Independent HTTP acceptance with isolated synthetic users and real session/CSRF checks."""
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
assert re.fullmatch(r'humhub_profile_s5_test_[a-z0-9_]+', database)
backend = Path(__file__).resolve().parents[5]
php = [str(backend / '.runtime/php-mysql/bin/php'), '-c', str(backend / '.runtime/php.ini')]
created = subprocess.run(php + [str(Path(__file__).with_name('s5_fixture.php')), database], capture_output=True, text=True)
assert created.returncode == 0, 'Synthetic fixture creation failed'
fixture = json.loads(created.stdout)
(backend / '.runtime/profile-s5' / database / 'root-fixture.json').write_text(json.dumps(fixture))
checks = []

def check(name, condition):
    assert condition, name
    checks.append(name)

class Client:
    def __init__(self, user=None):
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        if user is not None:
            status, body, _ = self.call('GET', '/__s5_test/login?id=' + str(user))
            assert status == 200
            self.csrf = body['csrf']

    def call(self, method, path, body=None, csrf=True, key=None):
        headers = {'Accept': 'application/json'}
        if csrf and self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        if method == 'POST':
            headers['Idempotency-Key'] = key or str(uuid.uuid4())
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(base + path, method=method, headers=headers, data=data)
        try:
            response = self.http.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        raw = response.read()
        payload = json.loads(raw) if 'application/json' in response.headers.get('Content-Type', '') else raw
        return response.status, payload, response.headers

    def data(self, method, path, body=None, key=None):
        status, payload, headers = self.call(method, path, body, key=key)
        assert status in (200, 201), (path, status, payload)
        assert payload['meta']['request_id'] and 'no-store' in headers.get('Cache-Control', '')
        return payload['data']

def upload(client, filename, content, path='/api/v1/me/profile/sources/resume', extra=None, csrf=True, key=None):
    boundary='S5'+uuid.uuid4().hex
    chunks=[]
    for name,value in (extra or {}).items():
        chunks.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"\r\n\r\n'+str(value)+'\r\n').encode())
    chunks.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="'+filename+'"\r\nContent-Type: application/octet-stream\r\n\r\n').encode()+content+b'\r\n')
    chunks.append(('--'+boundary+'--\r\n').encode())
    headers={'Content-Type':'multipart/form-data; boundary='+boundary,'Accept':'application/json','Idempotency-Key':key or str(uuid.uuid4())}
    if csrf and client.csrf:headers['X-CSRF-Token']=client.csrf
    request=urllib.request.Request(base+path,data=b''.join(chunks),headers=headers,method='POST')
    try:response=client.http.open(request,timeout=40)
    except urllib.error.HTTPError as error:response=error
    return response.status,json.loads(response.read())

def ok_upload(*args,**kwargs):
    status,body=upload(*args,**kwargs)
    assert status in (200,201),(status,body)
    return body['data']

owner=Client(fixture['users']['viewer']);viewer=Client(fixture['users']['owner']);anonymous=Client()
cap='/api/v1/me/profile/source-capabilities';sources='/api/v1/me/profile/sources';extractions='/api/v1/me/profile/extractions'
check('anonymous_capabilities_denied',anonymous.call('GET',cap)[0]==401)
check('anonymous_sources_denied',anonymous.call('GET',sources)[0]==401)
capabilities=owner.data('GET',cap)['readers']
check('two_enabled_readers_present',all(capabilities[k]['enabled'] for k in ('github','resume')))
check('real_local_resume_parser_available',capabilities['resume']['available'])
check('unlinked_account_detected_without_username_input',not capabilities['github']['linked'] and not capabilities['github']['available'])
check('forged_github_username_rejected',owner.call('POST',sources,{'kind':'github','username':'octocat'})[0]==422)
check('github_import_requires_verified_login',owner.call('POST',sources,{'kind':'github'})[0]==409)
check('json_file_path_rejected',owner.call('POST',sources+'/resume',{'tmp_path':'/etc/passwd'})[0]==415)
text='姓名：S5 合成用户\n城市：杭州\n自我介绍：从简历提取的介绍\n邮箱：s5-root@example.invalid\n技能：Python、TypeScript\n\n项目：S5 合成工具\n贡献：实现接口\n技术栈：Python\n链接：https://example.invalid/project\n\n私有材料标记 ROOT-S5-PRIVATE-RAW-ONLY\n'.encode()
check('upload_requires_csrf',upload(owner,'synthetic.md',text,csrf=False)[0]==400)
check('anonymous_upload_denied',upload(anonymous,'synthetic.md',text)[0]==401)
session=owner.data('POST','/api/v1/onboarding/sessions',{'space_id':fixture['spaces'][0]})
draft=session['input_drafts']['global']
draft=owner.data('PUT','/api/v1/me/profile/drafts/'+draft['id'],{'expected_version':draft['draft_version'],'fields':[{'key':'bio','value':'Owner manual draft remains','visibility':'private'}]})
key=str(uuid.uuid4());source=ok_upload(owner,'synthetic.md',text,key=key)
check('real_markdown_upload_produces_ready_source',source['status']=='ready')
check('original_text_preserved_privately',source['snapshot']['raw_text']==text.decode())
check('paragraphs_include_locations',all(s['locator'] for s in source['snapshot']['sections']))
check('explicit_fields_mapped_to_candidates',{'real_name','city','contact_email','project','skill'}.issubset({c['key'] for c in source['snapshot']['candidates']}))
check('all_candidates_have_evidence',all(c['evidence'] for c in source['snapshot']['candidates']))
check('duplicate_request_reuses_source',ok_upload(owner,'synthetic.md',text,key=key)['id']==source['id'])
check('same_file_new_request_reuses_snapshot',ok_upload(owner,'copy.md',text)['latest_snapshot_id']==source['latest_snapshot_id'])
check('list_omits_private_text',all(s['snapshot'] is None for s in owner.data('GET',sources)['sources']))
path=sources+'/'+source['id']
check('other_user_cannot_read_source',viewer.call('GET',path)[0]==404)
check('other_user_cannot_delete_source',viewer.call('DELETE',path,{'expected_version':source['version']})[0]==404)
check('source_read_is_no_store',owner.call('GET',path)[2].get('Cache-Control','').find('no-store')>=0)
payload={'source_id':source['id'],'expected_version':source['version'],'draft_id':draft['id'],'expected_draft_version':draft['draft_version'],'candidate_ids':[c['id'] for c in source['snapshot']['candidates']]}
check('stale_source_version_rejected',owner.call('POST',extractions,{**payload,'expected_version':0})[0]==409)
check('foreign_candidate_rejected',owner.call('POST',extractions,{**payload,'candidate_ids':['foreign-candidate']})[0]==422)
check('other_user_cannot_apply_source',viewer.call('POST',extractions,payload)[0]==404)
apply_key=str(uuid.uuid4());result=owner.data('POST',extractions,payload,apply_key)
check('adoption_skips_existing_manual_bio',any(s['reason']=='existing_value' for s in result['skipped']))
check('adoption_preserves_manual_value_and_visibility',any(a['key']=='bio' and a['value']=='Owner manual draft remains' and a['visibility']=='private' for a in result['draft']['preview_attributes']))
check('adoption_does_not_confirm_profile',owner.data('GET','/api/v1/me/profile')['attributes']==[])
check('adoption_contains_no_model_calls',result['generation_mode']=='rules' and result['llm_calls']==0)
check('repeat_adoption_request_is_idempotent',owner.data('POST',extractions,payload,apply_key)['draft']['draft_version']==result['draft']['draft_version'])
again=owner.data('POST',extractions,{**payload,'expected_draft_version':result['draft']['draft_version']})
check('new_adoption_request_deduplicates_candidates',again['applied']==[])
session=owner.data('GET','/api/v1/onboarding/sessions/'+session['id'])
check('onboarding_reads_same_imported_draft',session['input_drafts']['global']['draft_version']==result['draft']['draft_version'])
check('import_stays_in_materials_until_user_moves',session['stage']=='materials')
refreshed=ok_upload(owner,'synthetic.md',text,path=path+'/refresh',extra={'expected_version':source['version']})
check('explicit_refresh_creates_new_snapshot',refreshed['version']==source['version']+1 and refreshed['latest_snapshot_id']!=source['latest_snapshot_id'])
check('refresh_invalidates_old_candidate_version',owner.call('POST',extractions,payload)[0]==409)
check('wrong_file_cannot_replace_source_identity',upload(owner,'new.md',text+b'new',path=path+'/refresh',extra={'expected_version':refreshed['version']})[0]==409)
deleted=owner.data('DELETE',path,{'expected_version':refreshed['version']})
check('delete_clears_visible_text',deleted['status']=='deleted' and deleted['snapshot'] is None)
check('deleted_source_cannot_be_read',owner.call('GET',path)[0]==404)
check('deleted_source_removed_from_list',not owner.data('GET',sources)['sources'])
check('deleted_source_cannot_be_applied',owner.call('POST',extractions,{**payload,'expected_version':deleted['version']})[0]==404)
failed=ok_upload(owner,'broken.pdf',b'%PDF-1.4 damaged synthetic document')
check('damaged_pdf_has_explicit_failed_record',failed['status']=='failed' and failed['last_job']['execution_status']=='failed')
check('failed_parser_does_not_expose_raw_or_trace',failed['snapshot'] is None and failed['last_job']['error_code']=='RESUME_INVALID_DOCUMENT')
check('source_original_is_not_in_ordinary_profile','ROOT-S5-PRIVATE-RAW-ONLY' not in json.dumps(owner.data('GET','/api/v1/me/profile')))
print(json.dumps({'status':'passed','passed':len(checks),'checks':checks,'scope':'isolated real HTTP, native auth/CSRF, real local Markdown parser and source persistence'},ensure_ascii=False,indent=2))
