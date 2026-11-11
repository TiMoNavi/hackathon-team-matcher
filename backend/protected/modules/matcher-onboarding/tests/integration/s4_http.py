#!/usr/bin/env python3
"""Exercise session/CSRF API contracts on synthetic users in an isolated S4 database."""
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
assert re.fullmatch(r'humhub_profile_s4_test_[a-z0-9_]+', database)
backend = Path(__file__).resolve().parents[5]
fixture_run = subprocess.run([str(backend / '.runtime/php-mysql/bin/php'), '-c', str(backend / '.runtime/php.ini'), str(Path(__file__).with_name('s4_fixture.php')), database], capture_output=True, text=True)
assert fixture_run.returncode == 0, 'Synthetic fixture creation failed'
fixture = json.loads(fixture_run.stdout)
checks = []

def check(name, condition):
    assert condition, name
    checks.append(name)

class Client:
    def __init__(self, user_id=None):
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        if user_id:
            status, body, _ = self.call('GET', '/__s4_test/login?id=' + str(user_id))
            assert status == 200
            self.csrf = body['csrf']

    def call(self, method, path, data=None, key=None, csrf=True, content_type='application/json'):
        headers = {'Accept': 'application/json'}
        if csrf and self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        if key:
            headers['Idempotency-Key'] = key
        raw = None
        if data is not None:
            headers['Content-Type'] = content_type
            raw = json.dumps(data).encode()
        request = urllib.request.Request(base + path, data=raw, method=method, headers=headers)
        try:
            response = self.http.open(request, timeout=25)
        except urllib.error.HTTPError as error:
            response = error
        body = response.read()
        if 'application/json' in response.headers.get('Content-Type', ''):
            body = json.loads(body)
        return response.status, body, dict(response.headers)

    def data(self, method, path, data=None, key=None):
        if method == 'POST' and key is None:
            key = uuid.uuid4().hex
        status, body, headers = self.call(method, path, data, key)
        assert status in (200, 201), (path, status, body)
        assert body['meta']['request_id'] and 'no-store' in headers.get('Cache-Control', '')
        return body['data']

def versions(session, kind):
    return {scope: {'draft_version': draft['draft_version'], 'base_revision': draft['base_revision']} for scope, draft in session[kind].items() if draft is not None}

owner = Client(fixture['users']['owner'])
viewer = Client(fixture['users']['viewer'])
outsider = Client(fixture['users']['stranger'])
anonymous = Client()
space_a, space_b = fixture['spaces']
sessions = '/api/v1/onboarding/sessions'
batches = '/api/v1/me/profile/question-batches'
syntheses = '/api/v1/me/profile/syntheses'
me = '/api/v1/me/profile'

check('anonymous_workflow_rejected', anonymous.call('POST', sessions, {})[0] == 401)
check('session_write_requires_csrf', owner.call('POST', sessions, {}, uuid.uuid4().hex, csrf=False)[0] == 400)
check('session_create_requires_idempotency_key', owner.call('POST', sessions, {})[0] == 400)
check('unknown_owner_override_rejected', owner.call('POST', sessions, {'owner_id': fixture['users']['viewer']}, uuid.uuid4().hex)[0] == 422)
check('non_object_json_rejected', owner.call('POST', sessions, [], uuid.uuid4().hex)[0] == 400)
check('unsupported_content_type_rejected', owner.call('POST', sessions, {}, uuid.uuid4().hex, content_type='text/plain')[0] == 415)
check('oversized_body_rejected', owner.call('POST', sessions, {'padding': 'x' * 262145}, uuid.uuid4().hex)[0] == 413)
check('unavailable_ai_is_explicit', owner.call('POST', sessions, {'generation_mode': 'ai'}, uuid.uuid4().hex)[0] == 503)
check('outsider_space_session_rejected', outsider.call('POST', sessions, {'space_id': space_a}, uuid.uuid4().hex)[0] == 403)
key = uuid.uuid4().hex
session = owner.data('POST', sessions, {'space_id': space_a, 'generation_mode': 'rules'}, key)
check('rules_session_starts_on_materials', session['stage'] == 'materials' and session['generation_mode'] == 'rules' and session['llm_calls'] == 0)
check('create_receipt_replays_exact_session', owner.data('POST', sessions, {'space_id': space_a, 'generation_mode': 'rules'}, key)['id'] == session['id'])
check('same_key_conflicting_payload_rejected', owner.call('POST', sessions, {'space_id': space_a}, key)[0] == 409)
session_path = sessions + '/' + session['id']
check('session_get_is_owner_only', viewer.call('GET', session_path)[0] == 404)
check('session_get_reloads_persisted_state', owner.data('GET', session_path)['version'] == session['version'])
check('skip_ahead_to_privacy_is_rejected', owner.call('PUT', session_path, {'expected_version': session['version'], 'action': 'move', 'stage': 'privacy'})[0] == 422)
check('action_payload_fields_are_strict', owner.call('PUT', session_path, {'expected_version': session['version'], 'action': 'move', 'stage': 'review', 'confirmation_intent': 'confirm'})[0] == 422)
old_version = session['version']
session = owner.data('PUT', session_path, {'expected_version': old_version, 'action': 'save_materials', 'draft_versions': versions(session, 'input_drafts'), 'global_fields': [{'key': 'bio', 'value': 'S4 synthetic private introduction', 'visibility': 'private'}], 'space_fields': []})
check('save_materials_keeps_values_in_draft', not session['profiles']['global']['attributes'] and session['input_drafts']['global']['fields'])
check('session_revision_conflict_is_409', owner.call('PUT', session_path, {'expected_version': old_version, 'action': 'move', 'stage': 'review'})[0] == 409)
session = owner.data('PUT', session_path, {'expected_version': session['version'], 'action': 'move', 'stage': 'review'})
check('review_requires_explicit_confirmation', owner.call('PUT', session_path, {'expected_version': session['version'], 'action': 'review_confirm', 'draft_versions': versions(session, 'input_drafts')})[0] == 422)
session = owner.data('PUT', session_path, {'expected_version': session['version'], 'action': 'review_confirm', 'confirmation_intent': 'confirm', 'draft_versions': versions(session, 'input_drafts')})
check('review_confirmation_preserves_private_choice', session['stage'] == 'questions' and session['profiles']['global']['attributes'][0]['visibility'] == 'private')
key = uuid.uuid4().hex
prepare = {'session_id': session['id'], 'expected_version': session['version'], 'generation_mode': 'rules'}
session = owner.data('POST', batches, prepare, key)
batch = session['question_batch']
check('question_batch_route_is_live', 3 <= len(batch['questions']) <= 8 and batch['generation_mode'] == 'rules' and batch['llm_calls'] == 0)
check('batch_creation_retry_reuses_saved_batch', owner.data('POST', batches, prepare, key)['question_batch']['id'] == batch['id'])
batch_path = batches + '/' + batch['id']
check('question_batch_get_is_owner_only', viewer.call('GET', batch_path)[0] == 404)
check('question_ids_and_options_survive_http_reload', owner.data('GET', batch_path)['questions'] == batch['questions'])
check('synthesis_requires_answers_or_skip', owner.call('POST', syntheses, {'session_id': session['id'], 'expected_version': session['version'], 'expected_batch_version': batch['version']}, uuid.uuid4().hex)[0] == 422)
for index, question in enumerate(batch['questions']):
    path = batch_path + '/answers/' + question['id']
    if index == 0:
        check('answer_route_requires_put', owner.call('GET', path)[0] == 405)
        check('answer_write_is_owner_only', viewer.call('PUT', path, {'expected_version': 0, 'answer_type': 'skipped'})[0] == 404)
        check('answer_cannot_select_forged_option', owner.call('PUT', path, {'expected_version': 0, 'answer_type': 'options', 'selected_options': ['not_a_real_code']})[0] == 422)
    batch = owner.data('PUT', path, {'expected_version': 0, 'answer_type': 'options', 'selected_options': [question['options'][0]['code']]})
check('each_answer_has_independent_version', len(batch['answers']) == len(batch['questions']) and all(answer['version'] == 1 for answer in batch['answers']))
session = owner.data('GET', session_path)
key = uuid.uuid4().hex
request = {'session_id': session['id'], 'expected_version': session['version'], 'expected_batch_version': batch['version'], 'generation_mode': 'rules'}
session = owner.data('POST', syntheses, request, key)
check('rules_synthesis_returns_editable_scoped_drafts', session['stage'] == 'draft' and session['output_drafts']['global']['fields'] and session['output_drafts']['space']['fields'])
check('rules_synthesis_does_not_publish_answers', len(session['profiles']['global']['attributes']) == 1 and not session['profiles']['space']['attributes'])
check('synthesis_receipt_replays_same_outputs', owner.data('POST', syntheses, request, key)['resource_refs']['output_drafts'] == session['resource_refs']['output_drafts'])
first = batch['questions'][0]
batch = owner.data('PUT', batch_path + '/answers/' + first['id'], {'expected_version': 1, 'answer_type': 'free_text', 'free_text': 'S4 synthetic changed goal'})
check('changed_answer_marks_synthesis_stale', owner.data('GET', session_path)['needs_resynthesis'])
check('old_synthesis_cannot_advance_to_confirmation', owner.call('PUT', session_path, {'expected_version': session['version'], 'action': 'move', 'stage': 'privacy'})[0] == 409)
session = owner.data('POST', syntheses, {'session_id': session['id'], 'expected_version': session['version'], 'expected_batch_version': batch['version']})
check('resynthesis_preserves_prior_resource_history', len(session['resource_refs']['history']) >= 1)
session = owner.data('PUT', session_path, {'expected_version': session['version'], 'action': 'move', 'stage': 'privacy'})
complete = {'expected_version': session['version'], 'action': 'complete', 'confirmation_intent': 'confirm', 'expected_batch_version': batch['version'], 'draft_versions': versions(session, 'output_drafts')}
completed = owner.data('PUT', session_path, complete)
check('complete_publishes_to_shared_ordinary_profiles', completed['status'] == 'completed' and len(owner.data('GET', me)['attributes']) > 1)
check('repeat_confirmation_is_idempotent', owner.data('PUT', session_path, complete)['version'] == completed['version'])
check('published_profile_preserves_original_private_field', next(item for item in owner.data('GET', me)['attributes'] if item['key'] == 'bio')['visibility'] == 'private')
global_session = owner.data('POST', sessions, {'generation_mode': 'rules'})
global_path = sessions + '/' + global_session['id']
check('global_session_has_no_space_draft', global_session['space_id'] is None and global_session['input_drafts']['space'] is None)
draft = owner.data('POST', me + '/drafts', {})
draft = owner.data('PUT', me + '/drafts/' + draft['id'], {'expected_version': draft['draft_version'], 'fields': [{'key': 'city', 'value': 'S4 latest city'}]})
owner.data('POST', me + '/drafts/' + draft['id'] + '/confirm', {'expected_version': draft['draft_version'], 'base_revision': draft['base_revision'], 'confirmation_intent': 'confirm'})
check('ordinary_edit_is_visible_to_onboarding', owner.data('GET', global_path)['profile_changed'])
check('stale_onboarding_cannot_overwrite_ordinary_edit', owner.call('PUT', global_path, {'expected_version': global_session['version'], 'action': 'save_materials', 'draft_versions': versions(global_session, 'input_drafts'), 'global_fields': [{'key': 'city', 'value': 'S4 obsolete city'}]})[0] == 409)
global_session = owner.data('PUT', global_path, {'expected_version': global_session['version'], 'action': 'reconcile'})
check('explicit_reconcile_adopts_current_versions_and_keeps_history', not global_session['profile_changed'] and global_session['stage'] == 'review' and global_session['resource_refs']['history'])
check('reconcile_keeps_confirmed_city', next(item['value'] for item in global_session['profiles']['global']['attributes'] if item['key'] == 'city') == 'S4 latest city')
print(json.dumps({'status': 'passed', 'passed': len(checks), 'checks': checks, 'generation_mode': 'rules', 'server_reported_llm_calls': completed['llm_calls']}, ensure_ascii=False))
