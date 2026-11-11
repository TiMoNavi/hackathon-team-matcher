#!/usr/bin/env python3
"""Explicit live-gateway acceptance using only isolated, synthetic source material."""
import http.cookiejar
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.request
import uuid

base, database = sys.argv[1:3]
assert os.environ.get('MATCHER_S6_LIVE_GATEWAY') == '1', 'Explicit live-gateway opt-in required'
assert base == 'http://127.0.0.1:8096'
assert re.fullmatch(r'humhub_profile_s6_test_root_[a-f0-9]{8}', database)
backend = Path(__file__).resolve().parents[5]
php = [str(backend / '.runtime/php-mysql/bin/php'), '-c', str(backend / '.runtime/php.ini')]
resume_after_apply = '--resume-after-apply' in sys.argv[3:]
resume_after_compose = '--resume-after-compose' in sys.argv[3:]
if not (resume_after_apply or resume_after_compose):
    fixture_run = subprocess.run(php + [str(Path(__file__).with_name('s6_fixture.php')), database], capture_output=True, text=True, timeout=30)
    assert fixture_run.returncode == 0, 'Synthetic fixture creation failed'
    fixture = json.loads(fixture_run.stdout)
    (backend / '.runtime/profile-s6' / database / 'live-fixture.json').write_text(json.dumps(fixture))
else:
    fixture = json.loads((backend / '.runtime/profile-s6' / database / 'live-fixture.json').read_text())
checks = []
metrics = []
http_requests = 0
if resume_after_apply or resume_after_compose:
    checkpoint_name = 'live-after-compose.json' if resume_after_compose else 'live-after-apply.json'
    checkpoint = json.loads((backend / '.runtime/profile-s6' / checkpoint_name).read_text())
    assert checkpoint['model_operations'][0]['execution_status'] == 'succeeded'
    checks = [item for item in checkpoint['checks'] if item['passed']]
    metrics = checkpoint['model_operations']
    http_requests = checkpoint['http_requests']

def check(name, condition):
    checks.append({'name': name, 'passed': bool(condition)})
    assert condition, name

class Client:
    def __init__(self, user=None):
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        if user is not None:
            status, body, _ = self.call('GET', '/__s6_test/login?id=' + str(user))
            assert status == 200, 'Synthetic login failed'
            self.csrf = body['csrf']

    def call(self, method, path, body=None, key=None):
        global http_requests
        http_requests += 1
        headers = {'Accept': 'application/json'}
        if self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        if method == 'POST':
            headers['Idempotency-Key'] = key or str(uuid.uuid4())
        raw = None
        if body is not None:
            raw = json.dumps(body, ensure_ascii=False).encode()
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(base + path, method=method, data=raw, headers=headers)
        try:
            response = self.http.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        data = response.read()
        payload = json.loads(data) if 'application/json' in response.headers.get('Content-Type', '') else None
        return response.status, payload, response.headers

    def data(self, method, path, body=None, key=None, status_codes=(200, 201, 202)):
        status, payload, headers = self.call(method, path, body, key)
        assert status in status_codes, (path, status, (payload or {}).get('error', {}).get('code'))
        assert payload['meta']['request_id'] and 'no-store' in headers.get('Cache-Control', '')
        return payload['data']

def versions(session, name):
    return {scope: {key: draft[key] for key in ['draft_version', 'base_revision']} for scope, draft in session[name].items() if draft is not None}

def run():
    owner = Client(fixture['users']['owner'])
    other = Client(fixture['users']['viewer'])
    anonymous = Client()
    sessions = '/api/v1/onboarding/sessions'
    jobs = '/api/v1/me/profile/ai-jobs'
    session = owner.data('POST', sessions, {'space_id': fixture['spaces'][0]})
    if resume_after_compose:
        diagnostic = json.loads((backend / '.runtime/profile-s6' / database / 'gateway-diagnostic.json').read_text())
        assert diagnostic['status'] == 'succeeded' and diagnostic['attempt'] == 3
        composed = owner.data('GET', jobs + '/' + diagnostic['job_id'])
        metrics.append({'operation': 'compose', 'explicit_retry': True, 'execution_status': composed['execution_status'], 'error_code': composed.get('error_code'), **composed['metrics']})
        check('compose_real_model_succeeded_after_explicit_retry', composed['execution_status'] == 'succeeded' and composed['applicability'] == 'current')
        check('compose_requested_model_and_actual_call_recorded', composed['metrics']['model'] == 'gemini-3.8-flash' and composed['metrics']['llm_calls'] == 1)
        check('compose_usage_reported', composed['metrics']['usage']['reported'] and composed['metrics']['usage']['total_tokens'] > 0)
        check('compose_review_items_returned', isinstance(composed['result']['review_items'], list))
        return finish(owner, other, session, composed, session['question_batch'])
    if not resume_after_apply:
        source = owner.data('POST', '/api/v1/me/profile/sources', {
            'kind': 'text', 'ownership': 'self', 'label': 'S6 合成验收资料',
            'text': '这是虚构测试资料。\n姓名：S6 合成用户\n城市：杭州\n自我介绍：我主要做后端开发，喜欢把明确的问题做成可运行的小工具。\n技能：Python、TypeScript\n项目：合成协作工具\n贡献：我负责 API 和数据库设计，实现了资料导入功能。\n技术栈：Python、PostgreSQL\n链接：https://example.org/synthetic-project\n我希望与有产品和设计经验的伙伴一起做原型。\n'
        })
        check('synthetic_source_ready_before_ai', source['status'] == 'ready')

    def generate(operation, path, payload):
        key = str(uuid.uuid4())
        queued = owner.data('POST', path, {**payload, 'generation_mode': 'ai'}, key, (202,))
        check(operation + '_returns_durable_queued_job', queued['execution_status'] == 'queued' and queued['generation_mode'] == 'ai')
        job_id = queued['job_id']
        replay = owner.data('POST', path, {**payload, 'generation_mode': 'ai'}, key, (202,))
        check(operation + '_request_replay_same_job', replay['job_id'] == job_id)
        check(operation + '_foreign_job_unreadable', other.call('GET', jobs + '/' + job_id)[0] == 404)
        check(operation + '_anonymous_job_unreadable', anonymous.call('GET', jobs + '/' + job_id)[0] == 401)
        before = owner.data('GET', jobs + '/' + job_id)
        check(operation + '_poll_does_not_invoke_model', before['execution_status'] == 'queued' and before['metrics']['llm_calls'] == 0)
        worker = subprocess.run(php + [str(backend / 'deploy/profile_s6_live_worker.php'), database, job_id], capture_output=True, text=True, timeout=180)
        assert worker.returncode == 0, operation + ' live worker failed without exposing diagnostics'
        job = owner.data('GET', jobs + '/' + job_id)
        metrics.append({'operation': operation, 'execution_status': job['execution_status'], 'error_code': job.get('error_code'), **job.get('metrics', {})})
        check(operation + '_real_model_succeeded', job['execution_status'] == 'succeeded' and job['applicability'] == 'current')
        check(operation + '_requested_model_and_actual_call_recorded', job['metrics']['model'] == 'gemini-3.8-flash' and job['metrics']['llm_calls'] == 1)
        check(operation + '_usage_reported', job['metrics']['usage']['reported'] and job['metrics']['usage']['total_tokens'] > 0)
        check(operation + '_review_items_returned', isinstance(job['result']['review_items'], list))
        return job

    if not resume_after_apply:
        extraction = generate('extract', '/api/v1/me/profile/extractions', {'session_id': session['id'], 'expected_version': session['version'], 'sources': [{'source_id': source['id'], 'expected_version': source['version']}]})
        candidates = extraction['result']['candidates']
        check('model_produced_supported_candidates', bool(candidates) and any(c['key'] in ('project', 'skill', 'bio') for c in candidates))
        check('model_candidates_have_evidence', all(c['evidence'] for c in candidates))
        check('extraction_does_not_publish', owner.data('GET', '/api/v1/me/profile')['attributes'] == [])
        draft = session['input_drafts']['global']
        owner.data('POST', jobs + '/' + extraction['job_id'] + '/apply', {'draft_id': draft['id'], 'expected_draft_version': draft['draft_version'], 'candidate_ids': [c['id'] for c in candidates]})
        session = owner.data('GET', sessions + '/' + session['id'])
        draft = session['input_drafts']['global']
        check('ai_candidates_reach_existing_profile_draft', bool(draft['preview_attributes']))
    else:
        assert session['stage'] == 'materials' and session['input_drafts']['global']['preview_attributes']
    draft = session['input_drafts']['global']
    bio = next((a for a in draft['preview_attributes'] if a['key'] == 'bio'), None)
    bio_patch = {'key': 'bio', 'value': 'S6 本人手工确认的私有介绍', 'visibility': 'private'}
    if bio is not None:
        bio_patch['attribute_id'] = bio['attribute_id']
    owner.data('PUT', '/api/v1/me/profile/drafts/' + draft['id'], {'expected_version': draft['draft_version'], 'fields': [bio_patch]})
    session = owner.data('GET', sessions + '/' + session['id'])
    session = owner.data('PUT', sessions + '/' + session['id'], {'expected_version': session['version'], 'action': 'move', 'stage': 'review'})
    session = owner.data('PUT', sessions + '/' + session['id'], {'expected_version': session['version'], 'action': 'review_confirm', 'confirmation_intent': 'confirm', 'draft_versions': versions(session, 'input_drafts')})
    check('user_explicitly_confirms_before_ai_questions', session['stage'] == 'questions')
    questions = generate('questions', '/api/v1/me/profile/question-batches', {'session_id': session['id'], 'expected_version': session['version']})
    session = owner.data('GET', sessions + '/' + session['id'])
    batch = session['question_batch']
    check('ai_batch_attached_to_same_session', batch['id'] == questions['result']['question_batch_id'] and batch['generation_mode'] == 'ai')
    check('bounded_plan_style_questions', 3 <= len(batch['questions']) <= 8)
    check('every_question_has_options', all(q['options'] and q['prompt'] for q in batch['questions']))
    check('every_question_ends_in_free_text_control', all(q.get('free_text_option', {}).get('position') == 'last' and q['allow_free_text'] for q in batch['questions']))
    for index, question in enumerate(batch['questions']):
        if index == 1:
            answer = {'answer_type': 'free_text', 'free_text': '我喜欢先列出工作清单，再分头实现，遇到阻塞时及时沟通。'}
        elif index == 0:
            answer = {'answer_type': 'options', 'selected_options': [question['options'][0]['code']]}
        else:
            answer = {'answer_type': 'skipped'}
        batch = owner.data('PUT', '/api/v1/me/profile/question-batches/' + batch['id'] + '/answers/' + question['id'], {'expected_version': 0, **answer})
    check('options_free_text_and_skip_all_saved', {'options', 'free_text', 'skipped'} <= {a['answer_type'] for a in batch['answers']})
    session = owner.data('GET', sessions + '/' + session['id'])
    composed = generate('compose', '/api/v1/me/profile/syntheses', {'session_id': session['id'], 'expected_version': session['version'], 'expected_batch_version': batch['version']})
    return finish(owner, other, session, composed, batch)

def finish(owner, other, session, composed, batch):
    sessions = '/api/v1/onboarding/sessions'
    session = owner.data('GET', sessions + '/' + session['id'])
    check('ai_composition_returns_editable_draft', session['stage'] == 'draft' and session['output_drafts']['global']['status'] == 'editing')
    check('composition_job_keeps_draft_reference', composed['result']['output_drafts']['global'] == session['output_drafts']['global']['id'])
    check('manual_private_bio_survives_ai_composition', any(a['key'] == 'bio' and a['value'] == 'S6 本人手工确认的私有介绍' and a['visibility'] == 'private' for a in session['output_drafts']['global']['preview_attributes']))
    session = owner.data('PUT', sessions + '/' + session['id'], {'expected_version': session['version'], 'action': 'move', 'stage': 'privacy'})
    session = owner.data('PUT', sessions + '/' + session['id'], {'expected_version': session['version'], 'action': 'complete', 'confirmation_intent': 'confirm', 'draft_versions': versions(session, 'output_drafts'), 'expected_batch_version': batch['version']})
    check('real_ai_flow_completes_only_after_user_confirmation', session['status'] == 'completed')
    visible = other.data('GET', '/api/v1/spaces/' + str(fixture['spaces'][0]) + '/profiles/' + str(fixture['users']['owner']))
    check('private_bio_hidden_after_ai_flow', all(a['key'] != 'bio' for a in visible['global']['attributes']))
    next_session = owner.data('POST', sessions, {'space_id': fixture['spaces'][1]})
    check('next_space_keeps_globals_and_has_empty_context', bool(next_session['profiles']['global']['attributes']) and next_session['profiles']['space']['attributes'] == [])
    return {'status': 'passed', 'passed': len(checks), 'checks': checks, 'http_requests': http_requests, 'model_operations': metrics, 'llm_calls': sum(m['llm_calls'] for m in metrics), 'synthetic_only': True, 'raw_material_in_report': False, 'resumed_after_successful_extract_and_apply': resume_after_apply or resume_after_compose, 'explicit_compose_retry': resume_after_compose, 'scope': 'real specified gateway through production P6, isolated native HTTP/SQL workflow; no frontend edits'}

try:
    print(json.dumps(run(), ensure_ascii=False, indent=2))
except Exception as error:
    print(json.dumps({'status': 'failed', 'passed': sum(c['passed'] for c in checks), 'checks': checks, 'http_requests': http_requests, 'model_operations': metrics, 'error': str(error)}, ensure_ascii=False, indent=2))
    raise SystemExit(1)
