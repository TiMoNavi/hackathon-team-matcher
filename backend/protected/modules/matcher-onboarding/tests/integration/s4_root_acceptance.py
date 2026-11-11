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
assert re.fullmatch(r'humhub_profile_s4_test_[a-z0-9_]+', database)
backend = Path(__file__).resolve().parents[5]
php = [str(backend / '.runtime/php-mysql/bin/php'), '-c', str(backend / '.runtime/php.ini')]
created = subprocess.run(php + [str(Path(__file__).with_name('s4_fixture.php')), database], capture_output=True, text=True)
assert created.returncode == 0, 'Synthetic fixture creation failed'
fixture = json.loads(created.stdout)
(backend / '.runtime/profile-s4' / database / 'root-fixture.json').write_text(json.dumps(fixture))
checks = []

def check(name, condition):
    assert condition, name
    checks.append(name)

class Client:
    def __init__(self, user=None):
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        if user is not None:
            status, body, _ = self.call('GET', '/__s4_test/login?id=' + str(user))
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

def versions(session, kind):
    return {scope: {key: draft[key] for key in ['draft_version', 'base_revision']} for scope, draft in session[kind].items() if draft is not None}

def change(session, action, **values):
    return owner.data('PUT', '/api/v1/onboarding/sessions/' + session['id'], {'expected_version': session['version'], 'action': action, **values})

def keys(profile):
    return {item['key'] for item in profile['attributes']}

def transition(action):
    p = subprocess.run(php + [str(Path(__file__).with_name('s4_root_transition.php')), database, action], capture_output=True, text=True)
    assert p.returncode == 0, 'Synthetic membership transition failed'

owner = Client(fixture['users']['owner'])
viewer = Client(fixture['users']['viewer'])
stranger = Client(fixture['users']['stranger'])
anonymous = Client()
space_a, space_b = fixture['spaces']
sessions = '/api/v1/onboarding/sessions'
check('anonymous_create_rejected', anonymous.call('POST', sessions, {})[0] == 401)
check('create_requires_csrf', owner.call('POST', sessions, {}, csrf=False)[0] == 400)
check('unjoined_space_rejected', stranger.call('POST', sessions, {'space_id': space_a})[0] == 403)
check('forged_space_rejected', owner.call('POST', sessions, {'space_id': 2147483647})[0] == 403)
check('ai_is_explicitly_unavailable', owner.call('POST', sessions, {'generation_mode': 'ai'})[0] == 503)
key = str(uuid.uuid4())
session = owner.data('POST', sessions, {'space_id': space_a, 'generation_mode': 'rules'}, key)
check('new_session_materials_rules_zero_llm', session['stage'] == 'materials' and session['generation_mode'] == 'rules' and session['llm_calls'] == 0)
check('creation_idempotency_same_session', owner.data('POST', sessions, {'space_id': space_a, 'generation_mode': 'rules'}, key)['id'] == session['id'])
check('idempotency_payload_change_rejected', owner.call('POST', sessions, {'space_id': space_a}, key=key)[0] == 409)
check('new_key_resumes_active_context', owner.data('POST', sessions, {'space_id': space_a})['id'] == session['id'])
path = sessions + '/' + session['id']
check('other_account_session_is_not_found', viewer.call('GET', path)[0] == 404)
check('stale_session_version_rejected', owner.call('PUT', path, {'expected_version': 0, 'action': 'move', 'stage': 'review'})[0] == 409)
check('cannot_skip_to_final_stage', owner.call('PUT', path, {'expected_version': session['version'], 'action': 'move', 'stage': 'privacy'})[0] == 422)
session = change(session, 'save_materials', global_fields=[
    {'key': 'headline', 'value': 'S4 synthetic builder'},
    {'key': 'bio', 'value': 'S4 private review text', 'visibility': 'private'},
    {'key': 'contact_wechat', 'value': 'synthetic_s4_contact'},
], space_fields=[{'key': 'event_goal', 'value': {'codes': ['prototype'], 'free_text': 'Space A only'}}], draft_versions=versions(session, 'input_drafts'))
check('materials_save_is_not_publication', owner.data('GET', '/api/v1/me/profile')['attributes'] == [])
check('space_materials_are_also_pending', owner.data('GET', '/api/v1/me/profile?space_id=' + str(space_a))['attributes'] == [])
session = change(session, 'move', stage='review')
session = change(session, 'review_confirm', confirmation_intent='confirm', draft_versions=versions(session, 'input_drafts'))
check('review_explicitly_confirms_two_scopes', 'headline' in keys(session['profiles']['global']) and 'event_goal' in keys(session['profiles']['space']) and session['stage'] == 'questions')
public = viewer.data('GET', '/api/v1/spaces/' + str(space_a) + '/profiles/' + str(fixture['users']['owner']))
check('review_private_bio_stays_hidden', 'bio' not in keys(public['global']) and 'S4 private review text' not in json.dumps(public))
check('contact_not_embedded_in_ordinary_profile', 'contact_wechat' not in keys(public['global']))
session = owner.data('POST', '/api/v1/me/profile/question-batches', {'session_id': session['id'], 'expected_version': session['version'], 'generation_mode': 'rules'})
batch = session['question_batch']
check('saved_batch_has_three_to_eight_questions', 3 <= len(batch['questions']) <= 8)
check('saved_questions_have_stable_codes', all(q['id'] == q['template_id'] and len({x['code'] for x in q['options']}) == len(q['options']) for q in batch['questions']))
check('question_batch_owner_only', viewer.call('GET', '/api/v1/me/profile/question-batches/' + batch['id'])[0] == 404)
check('refresh_restores_exact_question_order', [q['id'] for q in owner.data('GET', path)['question_batch']['questions']] == [q['id'] for q in batch['questions']])
first = batch['questions'][0]
answer_path = '/api/v1/me/profile/question-batches/' + batch['id'] + '/answers/'
check('unknown_option_rejected', owner.call('PUT', answer_path + first['id'], {'expected_version': 0, 'answer_type': 'options', 'selected_options': ['not_a_saved_choice']})[0] == 422)
check('other_account_answer_write_rejected', viewer.call('PUT', answer_path + first['id'], {'expected_version': 0, 'answer_type': 'skipped'})[0] == 404)
check('incomplete_batch_cannot_generate', owner.call('POST', '/api/v1/me/profile/syntheses', {'session_id': session['id'], 'expected_version': session['version'], 'expected_batch_version': batch['version']})[0] == 422)
for i, question in enumerate(batch['questions']):
    payload = {'expected_version': 0, 'answer_type': 'options', 'selected_options': [question['options'][0]['code']]}
    if question['target_key'] == 'communication_preference':
        payload = {'expected_version': 0, 'answer_type': 'free_text', 'free_text': 'I prefer an agreed written plan.'}
    elif i == len(batch['questions']) - 1:
        payload = {'expected_version': 0, 'answer_type': 'skipped'}
    batch = owner.data('PUT', answer_path + question['id'], payload)
check('answers_save_individually_with_versions', len(batch['answers']) == len(batch['questions']) and all(a['version'] == 1 for a in batch['answers']))
check('answer_stale_version_rejected', owner.call('PUT', answer_path + first['id'], {'expected_version': 0, 'answer_type': 'skipped'})[0] == 409)
session = change(session, 'question_position', question_index=2)
check('position_survives_reload', owner.data('GET', path)['resource_refs']['question_index'] == 2)
request = {'session_id': session['id'], 'expected_version': session['version'], 'expected_batch_version': batch['version'], 'generation_mode': 'rules'}
session = owner.data('POST', '/api/v1/me/profile/syntheses', request)
check('synthesis_returns_pending_two_scope_drafts', session['stage'] == 'draft' and session['output_drafts']['global']['status'] == 'editing' and session['output_drafts']['space']['status'] == 'editing')
check('synthesis_does_not_publish_answers', 'role' not in keys(owner.data('GET', '/api/v1/me/profile')))
replayed = owner.data('POST', '/api/v1/me/profile/syntheses', request)
check('synthesis_retry_reuses_output_ids', replayed['resource_refs']['output_drafts'] == session['resource_refs']['output_drafts'])
original_output_ids = dict(session['resource_refs']['output_drafts'])
headline = next(item for item in session['output_drafts']['global']['preview_attributes'] if item['key'] == 'headline')
session = change(session, 'save_drafts', global_fields=[{'attribute_id': headline['attribute_id'], 'key': 'headline', 'value': 'Owner revised this generated draft', 'visibility': headline['visibility']}], space_fields=[], draft_versions=versions(session, 'output_drafts'))
session = change(session, 'move', stage='questions')
session = owner.data('POST', '/api/v1/me/profile/syntheses', {'session_id': session['id'], 'expected_version': session['version'], 'expected_batch_version': batch['version'], 'generation_mode': 'rules'})
check('unchanged_answers_can_return_to_generated_draft', session['stage'] == 'draft')
check('return_to_existing_draft_preserves_ids', session['resource_refs']['output_drafts'] == original_output_ids)
check('return_to_existing_draft_preserves_owner_edits', next(item['value'] for item in session['output_drafts']['global']['preview_attributes'] if item['key'] == 'headline') == 'Owner revised this generated draft')
session = change(session, 'move', stage='privacy')
old_retry = owner.data('POST', '/api/v1/me/profile/syntheses', request)
check('old_synthesis_retry_does_not_move_new_progress_back', old_retry['stage'] == 'privacy' and old_retry['version'] == session['version'])
pending = session['output_drafts']['global']
preview = owner.data('GET', '/api/v1/me/profile/preview?draft_id=' + pending['id'] + '&perspective=authenticated')
check('privacy_preview_uses_real_policy', preview['simulated'] is True and 'bio' not in keys(preview['profile']))
check('foreign_draft_cannot_be_read', viewer.call('GET', '/api/v1/me/profile/drafts/' + pending['id'])[0] in (403, 404))
check('completion_requires_confirmation_intent', owner.call('PUT', path, {'expected_version': session['version'], 'action': 'complete', 'draft_versions': versions(session, 'output_drafts'), 'expected_batch_version': batch['version']})[0] == 422)
complete_payload = {'expected_version': session['version'], 'action': 'complete', 'confirmation_intent': 'confirm', 'draft_versions': versions(session, 'output_drafts'), 'expected_batch_version': batch['version']}
session = owner.data('PUT', path, complete_payload)
check('final_confirmation_completes_session', session['status'] == 'completed' and session['stage'] == 'completed')
check('ordinary_profile_sees_same_confirmed_result', keys(owner.data('GET', '/api/v1/me/profile')) == keys(session['profiles']['global']) and 'role' in keys(session['profiles']['global']))
check('same_completion_retry_is_idempotent', owner.data('PUT', path, complete_payload)['version'] == session['version'])
check('two_scopes_stay_separate', not any(x.startswith('event_') for x in keys(session['profiles']['global'])) and all(x.startswith('event_') for x in keys(session['profiles']['space'])))
other = owner.data('POST', sessions, {'space_id': space_b})
check('next_space_reuses_globals_and_starts_context_empty', keys(other['profiles']['global']) == keys(session['profiles']['global']) and other['profiles']['space']['attributes'] == [])
transition('remove_membership')
try:
    check('membership_revocation_blocks_saved_session', owner.call('GET', path)[0] == 403)
    check('membership_revocation_blocks_batch', owner.call('GET', '/api/v1/me/profile/question-batches/' + batch['id'])[0] == 403)
finally:
    transition('restore_membership')
check('restored_membership_restores_owner_session', owner.data('GET', path)['status'] == 'completed')
check('all_workflow_results_report_zero_model_calls', session['llm_calls'] == 0 and batch['llm_calls'] == 0 and other['llm_calls'] == 0)
print(json.dumps({'status': 'passed', 'passed': len(checks), 'checks': checks}, ensure_ascii=False))
