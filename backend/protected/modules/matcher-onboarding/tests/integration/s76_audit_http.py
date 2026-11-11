#!/usr/bin/env python3
"""Independent S7.6 HTTP/MySQL acceptance. Exact audit target, synthetic adapters only."""
import http.cookiejar
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request
import uuid

DB = 'humhub_profile_s76_test_audit_6b49d027'
BASE = 'http://127.0.0.1:8105'
HERE = Path(__file__).resolve().parent
BACKEND = HERE.parents[4]
PHP = [str(BACKEND / '.runtime/php-mysql/bin/php'), '-c', str(BACKEND / '.runtime/php.ini')]
ENV = dict(os.environ, MATCHER_S76_TEST_DB=DB)
assert os.environ.get('MATCHER_S76_TEST_DB', DB) == DB, 'S76 audit database rejected before connection'
checks = []
requests = 0
fixture = None
S = '/api/v1/onboarding/sessions'
Q = '/api/v1/me/profile/question-batches'
Y = '/api/v1/me/profile/syntheses'
P = '/api/v1/me/profile'
J = P + '/ai-jobs'
R = P + '/sources'
MARKER = 'S76_AUDIT_PRIVATE'

def check(name, condition):
    checks.append({'name': name, 'passed': bool(condition)})
    if not condition:
        raise AssertionError(name)

def command(action, arg='', mode='success', extra=''):
    return PHP + [str(HERE / 's76_audit_driver.php'), DB, action, str(arg), mode, extra]

def cli(action, arg='', mode='success', extra=''):
    result = subprocess.run(command(action, arg, mode, extra), capture_output=True, text=True, env=ENV, timeout=30)
    if result.returncode:
        raise AssertionError('S76 audit CLI failed: ' + action + ' (exit ' + str(result.returncode) + ')')
    return json.loads(result.stdout)

def native_upgrade():
    # The production deploy command is explicitly supplied by the parent; its exact clone argument is mandatory.
    result = subprocess.run(PHP + [str(BACKEND / 'deploy/profile_s76.php'), 'upgrade', DB], capture_output=True, text=True, env=ENV, timeout=60)
    assert result.returncode == 0, 'S76 native clone upgrade failed'
    payload = json.loads(result.stdout)
    assert payload['status'] == 'passed' and payload['environment'] == 'isolated_test_clone' and payload['native_rows_unchanged'] is True
    return payload

class Client:
    def __init__(self, user=None):
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        if user is not None:
            status, body, _ = self.call('GET', '/__s76_audit/login?id=' + str(user))
            assert status == 200 and body.get('csrf'), 'Synthetic native login failed'
            self.csrf = body['csrf']

    def call(self, method, path, body=None, csrf=True):
        global requests
        requests += 1
        headers = {'Accept': 'application/json'}
        if csrf and self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        if method == 'POST':
            headers['Idempotency-Key'] = 's76_audit_' + uuid.uuid4().hex
        raw = None
        if body is not None:
            raw = json.dumps(body, ensure_ascii=False).encode()
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(BASE + path, data=raw, method=method, headers=headers)
        try:
            response = self.http.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        raw = response.read()
        payload = json.loads(raw) if 'application/json' in response.headers.get('Content-Type', '') else None
        return response.status, payload, dict(response.headers)

    def data(self, method, path, body=None, expected=(200, 201)):
        status, payload, headers = self.call(method, path, body)
        assert status in expected, 'HTTP ' + str(status) + ' ' + method + ' ' + path + ' code=' + str((payload or {}).get('error', {}).get('code'))
        assert payload['meta']['request_id']
        cache = headers.get('Cache-Control', '')
        assert 'private' in cache and 'no-store' in cache, 'Missing private/no-store headers'
        return payload['data']

def versions(s, kind):
    return {scope: {'draft_version': d['draft_version'], 'base_revision': d['base_revision']} for scope, d in s[kind].items() if d is not None}

def update(c, s, action, **payload):
    return c.data('PUT', S + '/' + s['id'], {'expected_version': s['version'], 'action': action, **payload})

def current(c, s):
    return c.data('GET', S + '/' + s['id'])

def progress(c, s):
    return c.data('GET', S + '/' + s['id'] + '/progress')

def compact(name, value):
    required = {'schema_version', 'state', 'phase', 'label_code', 'message', 'updated_at', 'poll_after_ms', 'percent', 'next_actions'}
    check(name + '_schema', required <= value.keys() and value['schema_version'] == 1 and value['percent'] is None)
    forbidden = {'raw_text', 'snapshot', 'candidates', 'input', 'input_json', 'context', 'context_json', 'result_json', 'receipts', 'receipts_json', 'profiles', 'preview_attributes', 'fields', 'answers'}
    def clean(node):
        if isinstance(node, dict):
            return not (forbidden & node.keys()) and all(clean(v) for v in node.values())
        if isinstance(node, list):
            return all(clean(v) for v in node)
        return True
    check(name + '_contains_no_private_payload', clean(value) and MARKER not in json.dumps(value, ensure_ascii=False))

def stage(c, s, expected, index):
    p = progress(c, s)
    compact('session_' + expected, p)
    check('session_' + expected + '_stage', p['stage'] == expected and p['stage_index'] == index and p['stage_count'] == 5 and len(p['steps']) == 5)
    check('session_' + expected + '_dto_compatible', current(c, s)['progress'] == p)
    return p

def draft_confirm(c, fields):
    d = c.data('POST', P + '/drafts', {})
    d = c.data('PUT', P + '/drafts/' + d['id'], {'expected_version': d['draft_version'], 'fields': fields})
    return c.data('POST', P + '/drafts/' + d['id'] + '/confirm', {'expected_version': d['draft_version'], 'base_revision': d['base_revision'], 'confirmation_intent': 'confirm'})

def extract(c, s, source):
    return c.data('POST', P + '/extractions', {'generation_mode': 'ai', 'session_id': s['id'], 'expected_version': s['version'], 'sources': [{'source_id': source['id'], 'expected_version': source['version']}]}, expected=(202,))

def jobprogress(c, j):
    payload = c.data('GET', J + '/' + j['id'] + '/progress')
    return {**payload, **payload['progress']}

def sourceprogress(c, source):
    payload = c.data('GET', R + '/' + source['id'] + '/progress')
    return {**payload, **payload['progress']}

def delayed(action, arg, during, kind='ai', extra=''):
    before = cli('journal')[kind]['entered']
    child = subprocess.Popen(command(action, arg, 'delay', extra), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=ENV)
    try:
        for _ in range(25):
            if cli('journal')[kind]['entered'] > before:
                break
            time.sleep(.04)
        else:
            raise AssertionError('Synthetic adapter did not enter delayed phase')
        during()
        out, _ = child.communicate(timeout=20)
        assert child.returncode == 0, 'Delayed synthetic command failed'
        return json.loads(out)
    finally:
        if child.poll() is None:
            child.kill(); child.wait()

def rules_flow(c, space):
    s = c.data('POST', S, {'space_id': space})
    s = update(c, s, 'move', stage='review')
    s = update(c, s, 'review_confirm', confirmation_intent='confirm', draft_versions=versions(s, 'input_drafts'))
    s = c.data('POST', Q, {'session_id': s['id'], 'expected_version': s['version'], 'generation_mode': 'rules'})
    b = s['question_batch']
    for q in b['questions']:
        b = c.data('PUT', Q + '/' + b['id'] + '/answers/' + q['id'], {'expected_version': 0, 'answer_type': 'skipped'})
    s = c.data('POST', Y, {'session_id': s['id'], 'expected_version': s['version'], 'expected_batch_version': b['version'], 'generation_mode': 'rules'})
    s = update(c, s, 'move', stage='privacy')
    return update(c, s, 'complete', confirmation_intent='confirm', draft_versions=versions(s, 'output_drafts'), expected_batch_version=b['version'])

def run():
    global fixture
    # Wrong target is rejected before configuration loading, even if no clone exists.
    for target in ['', 'humhub_preview', 'humhub_profile_s76_test_root_e25c8a91', DB + '_other']:
        result = subprocess.run(PHP + ['-d', 'display_errors=1', str(HERE / 's76_audit_bootstrap.php'), target], env=dict(os.environ, MATCHER_S76_TEST_DB=target), capture_output=True, text=True)
        check('preconnect_guard_' + (target or 'empty'), result.returncode != 0 and 'rejected before connection' in result.stdout + result.stderr)
    result = subprocess.run(PHP + [str(HERE / 's76_audit_fixture.php'), DB], capture_output=True, text=True, env=ENV, timeout=30)
    assert result.returncode == 0, 'Audit fixture creation failed'
    fixture = json.loads(result.stdout)
    check('exact_fixture_target', fixture['database'] == DB and fixture['origin'] == BASE)
    original = cli('legacy')
    check('original_100_synthetic_people_present', original['people'] == 100)
    owner = Client(fixture['users']['owner']); viewer = Client(fixture['users']['viewer']); outsider = Client(fixture['users']['stranger']); anonymous = Client()
    a, b = fixture['spaces']
    before_calls = cli('journal')
    s = owner.data('POST', S, {'space_id': a, 'generation_mode': 'rules'})
    p0 = stage(owner, s, 'materials', 1)
    check('session_starts_without_ai_tasks', p0['tasks'] == [] and p0['questions']['total'] == 0 and p0['state'] == 'waiting_input')
    check('anonymous_progress_denied', anonymous.call('GET', S + '/' + s['id'] + '/progress')[0] == 401)
    check('other_owner_progress_not_found', viewer.call('GET', S + '/' + s['id'] + '/progress')[0] == 404)
    check('outsider_session_start_denied', outsider.call('POST', S, {'space_id': a})[0] == 403)
    check('progress_only_allows_get', owner.call('POST', S + '/' + s['id'] + '/progress', {})[0] == 405)
    s = update(owner, s, 'save_materials', draft_versions=versions(s, 'input_drafts'), global_fields=[{'key': 'bio', 'value': MARKER + '_BIO', 'visibility': 'private'}], space_fields=[])
    s = update(owner, s, 'move', stage='review'); stage(owner, s, 'review', 2)
    s = update(owner, s, 'review_confirm', confirmation_intent='confirm', draft_versions=versions(s, 'input_drafts')); stage(owner, s, 'questions', 3)
    s = owner.data('POST', Q, {'session_id': s['id'], 'expected_version': s['version'], 'generation_mode': 'rules'}); batch = s['question_batch']
    p = progress(owner, s); total = len(batch['questions'])
    check('saved_question_count_is_actual', 3 <= total <= 8 and p['questions']['total'] == total and p['questions']['remaining'] == total)
    prior_token = p['revision_token']; prior_version = s['version']
    for index, question in enumerate(batch['questions']):
        body = {'expected_version': 0, 'answer_type': 'skipped'}
        if index == 0:
            body = {'expected_version': 0, 'answer_type': 'options', 'selected_options': [question['options'][0]['code']]}
        elif index == 1:
            body = {'expected_version': 0, 'answer_type': 'free_text', 'free_text': 'S76合成自由回答'}
        batch = owner.data('PUT', Q + '/' + batch['id'] + '/answers/' + question['id'], body)
        p = progress(owner, s)
        answered = min(index + 1, 2); skipped = max(index - 1, 0)
        check('question_count_after_' + str(index + 1), p['questions']['answered'] == answered and p['questions']['skipped'] == skipped and p['questions']['remaining'] == total - answered - skipped)
        if index == 0:
            check('answer_changes_token_without_session_version', p['revision_token'] != prior_token and p['session_version'] == prior_version)
    s = update(owner, current(owner, s), 'question_position', question_index=2)
    resumed_client = Client(fixture['users']['owner']); resumed = resumed_client.data('POST', S, {'space_id': a})
    check('save_exit_restores_session_answers_and_position', resumed['id'] == s['id'] and resumed['question_batch']['answers'] == batch['answers'] and progress(resumed_client, resumed)['questions']['current_index'] == 2)
    s = owner.data('POST', Y, {'session_id': s['id'], 'expected_version': s['version'], 'expected_batch_version': batch['version'], 'generation_mode': 'rules'}); stage(owner, s, 'draft', 4)
    d = s['output_drafts']['global']; bio = next(x for x in d['preview_attributes'] if x['key'] == 'bio')
    owner.data('PUT', P + '/drafts/' + d['id'], {'expected_version': d['draft_version'], 'fields': [{'attribute_id': bio['attribute_id'], 'key': 'bio', 'value': MARKER + '_HAND_EDIT', 'visibility': 'private'}]})
    s = current(owner, s); resumed = Client(fixture['users']['owner']).data('POST', S, {'space_id': a})
    check('save_exit_retains_manual_output_edit', resumed['output_drafts']['global']['id'] == d['id'] and any(x['value'] == MARKER + '_HAND_EDIT' for x in resumed['output_drafts']['global']['preview_attributes']))
    first = batch['questions'][0]; batch = owner.data('PUT', Q + '/' + batch['id'] + '/answers/' + first['id'], {'expected_version': 1, 'answer_type': 'skipped'})
    stale = progress(owner, s)
    check('answer_change_requires_explicit_resynthesis', stale['state'] == 'needs_attention' and 'needs_resynthesis' in stale['reasons'] and 'synthesize' in stale['next_actions'])
    s = owner.data('POST', Y, {'session_id': s['id'], 'expected_version': s['version'], 'expected_batch_version': batch['version'], 'generation_mode': 'rules'})
    s = update(owner, s, 'move', stage='privacy'); p = stage(owner, s, 'privacy', 5)
    check('privacy_stage_is_not_completed_before_confirmation', p['state'] != 'completed' and not p['steps'][-1]['completed'])
    s = update(owner, s, 'complete', confirmation_intent='confirm', draft_versions=versions(s, 'output_drafts'), expected_batch_version=batch['version'])
    p = stage(owner, s, 'completed', 5)
    check('explicit_complete_stops_polling', p['state'] == 'completed' and p['poll_after_ms'] == 0 and all(x['completed'] for x in p['steps']))
    before = cli('fingerprint'); saved_token = p['revision_token']
    for _ in range(3):
        p = progress(owner, s)
        assert p['revision_token'] == saved_token
    check('terminal_progress_is_persistently_read_only', cli('fingerprint') == before and cli('journal') == before_calls)
    check('rules_flow_server_reports_zero_model_calls', s['llm_calls'] == 0 and batch['llm_calls'] == 0)

    # Ordinary P1 drafts and P8 scopes stay independent of onboarding.
    life = Client(fixture['users']['lifecycle']); ls = life.data('POST', S, {'space_id': a})
    draft_confirm(life, [{'key': 'city', 'value': 'S76合成城市'}, {'key': 'bio', 'value': MARKER + '_PRIVATE', 'visibility': 'private'}, {'key': 'contact_email', 'value': 's76_audit@example.invalid', 'visibility': 'friends'}])
    lp = progress(life, ls)
    check('ordinary_profile_edit_marks_saved_flow_changed', lp['state'] == 'needs_attention' and 'profile_changed' in lp['reasons'] and 'reconcile' in lp['next_actions'])
    public = viewer.data('GET', '/api/v1/spaces/' + str(a) + '/profiles/' + str(fixture['users']['lifecycle']))
    check('p8_hides_private_fields', 'bio' not in {x['key'] for x in public['global']['attributes']} and 'city' in {x['key'] for x in public['global']['attributes']})
    contacts = viewer.data('GET', '/api/v1/spaces/' + str(a) + '/profiles/' + str(fixture['users']['lifecycle']) + '/contacts')
    check('p8_contacts_keep_separate_scope', contacts['attributes'] == [])
    ls = update(life, current(life, ls), 'reconcile'); check('explicit_reconcile_restores_review', progress(life, ls)['stage'] == 'review' and not current(life, ls)['profile_changed'])

    # Source processing uses synthetic reader with real persisted running state.
    ai = Client(fixture['users']['ai']); ais = ai.data('POST', S, {'space_id': a})
    def reading():
        source = cli('find-source', fixture['users']['ai'])
        rp = sourceprogress(ai, source); compact('source_running', rp)
        check('source_running_projects_reading_source', rp['phase'] == 'reading_source' and rp['poll_after_ms'] > 0)
    source = delayed('source-import', fixture['users']['ai'], reading, kind='reader')
    sp = sourceprogress(ai, source); compact('source_ready', sp)
    check('source_ready_stops_polling', sp['state'] == 'ready' and sp['poll_after_ms'] == 0)
    check('source_progress_owner_only', viewer.call('GET', R + '/' + source['id'] + '/progress')[0] == 404)
    failed_source = cli('source-import', fixture['users']['ai'], 'fail')
    sp = sourceprogress(ai, failed_source); compact('source_failed', sp)
    check('source_failure_stops_polling', sp['state'] == 'failed' and sp['poll_after_ms'] == 0)
    check('unbound_global_sources_not_session_tasks', progress(ai, ais)['tasks'] == [])

    # AI tasks are invoked solely through an injected, validated synthetic engine.
    job = extract(ai, ais, source); jp = jobprogress(ai, job); compact('job_queued', jp)
    check('ai_queued_polls_and_does_not_call_model', jp['state'] == 'queued' and jp['poll_after_ms'] == 1000 and cli('journal')['ai']['entered'] == before_calls['ai']['entered'])
    check('job_progress_owner_only', viewer.call('GET', J + '/' + job['id'] + '/progress')[0] == 404)
    check('current_session_queued_task_is_processing', progress(ai, ais)['state'] == 'processing' and any(x.get('id', x.get('job_id')) == job['id'] for x in progress(ai, ais)['tasks']))
    def running():
        running_progress = jobprogress(ai, job); compact('job_running', running_progress)
        check('ai_running_has_real_operation_phase', running_progress['state'] == 'running' and running_progress['phase'] == 'extracting' and running_progress['poll_after_ms'] == 1000)
    done = delayed('work', job['id'], running)
    check('synthetic_ai_success_is_persisted', done['execution_status'] == 'succeeded')
    jp = jobprogress(ai, job); compact('job_ready', jp)
    check('ready_job_stops_polling', jp['state'] == 'ready' and jp['poll_after_ms'] == 0)
    before = cli('fingerprint'); calls = cli('journal')
    for _ in range(3):
        jobprogress(ai, job); progress(ai, ais); ai.data('GET', R + '/' + source['id'] + '/progress')
    check('all_compact_polls_do_not_write_or_call_adapters', cli('fingerprint') == before and cli('journal') == calls)
    failjob = extract(ai, ais, source); cli('work', failjob['id'], 'fail'); jp = jobprogress(ai, failjob)
    check('ai_failure_exposes_manual_retry', jp['state'] == 'failed' and jp['poll_after_ms'] == 0 and 'retry' in jp['next_actions'])
    retry = ai.data('POST', J + '/' + failjob['id'] + '/retry', {}, expected=(202,)); cli('work', retry['id']);
    check('explicit_retry_creates_new_job_and_recovers', retry['id'] != failjob['id'] and retry['attempt'] == 2 and jobprogress(ai, retry)['state'] == 'ready' and jobprogress(ai, failjob)['state'] == 'superseded')
    cancelled = extract(ai, ais, source); ai.data('POST', J + '/' + cancelled['id'] + '/cancel', {})
    jp = jobprogress(ai, cancelled)
    check('cancel_preserves_revoked_applicability_precedence', jp['state'] == 'revoked' and jp['execution_status'] == 'cancelled' and jp['poll_after_ms'] == 0)
    before = cli('journal'); check('cancelled_worker_does_not_generate', cli('work', cancelled['id']) is None and cli('journal') == before)
    outdated = extract(ai, ais, source); d = current(ai, ais)['input_drafts']['global']
    ai.data('PUT', P + '/drafts/' + d['id'], {'expected_version': d['draft_version'], 'fields': [{'key': 'bio', 'value': MARKER + '_NEWER_DRAFT', 'visibility': 'private'}]})
    jp = jobprogress(ai, outdated); compact('job_superseded', jp)
    check('input_change_invalidates_queued_result', jp['state'] == 'superseded' and jp['poll_after_ms'] == 0)
    ais = current(ai, ais)
    interrupted = extract(ai, ais, source); cli('age-running', interrupted['id']); before = cli('journal'); jp = jobprogress(ai, interrupted)
    check('expired_lease_recovers_without_resend', jp['state'] == 'failed' and jp['poll_after_ms'] == 0 and cli('journal') == before)
    retry2 = ai.data('POST', J + '/' + interrupted['id'] + '/retry', {}, expected=(202,)); cli('work', retry2['id'], 'fail')
    retry3 = ai.data('POST', J + '/' + retry2['id'] + '/retry', {}, expected=(202,)); cli('work', retry3['id'], 'fail')
    check('third_failed_attempt_does_not_offer_retry', 'retry' not in jobprogress(ai, retry3)['next_actions'])
    # Fresh same-owner session must never receive another session's tasks.
    other_session = ai.data('POST', S, {'space_id': b})
    check('same_owner_other_space_has_no_foreign_tasks', progress(ai, other_session)['tasks'] == [])
    before = cli('journal');
    for _ in range(22):
        history = extract(ai, ais, source); ai.data('POST', J + '/' + history['id'] + '/cancel', {})
    active = [extract(ai, ais, source) for _ in range(10)]; taskset = progress(ai, ais)['tasks']
    check('bounded_task_history_keeps_all_ten_active_tasks', len(taskset) <= 20 and {x['id'] for x in active} <= {x.get('id', x.get('job_id')) for x in taskset} and cli('journal') == before)
    for active_job in active:
        ai.data('POST', J + '/' + active_job['id'] + '/cancel', {})
    job = extract(ai, ais, source); cli('work', job['id'])
    check('deletion_target_is_current_saved_success', jobprogress(ai, job)['state'] == 'ready')
    ai.data('DELETE', R + '/' + source['id'], {'expected_version': source['version']})
    check('source_deletion_revokes_saved_success', jobprogress(ai, job)['state'] == 'revoked')
    check('deleted_source_progress_is_not_found', ai.call('GET', R + '/' + source['id'] + '/progress')[0] == 404)
    invalidated = cli('inspect', fixture['users']['ai'])['jobs']
    check('invalidated_jobs_scrub_private_input_and_result', all(not x['has_input'] and not x['has_result'] for x in invalidated if x['applicability'] in ('superseded', 'revoked')))
    revoked = Client(fixture['users']['revoked']); rs = revoked.data('POST', S, {'space_id': a}); rsource = cli('source-import', fixture['users']['revoked']); rjob = extract(revoked, rs, rsource)
    cli('revoke-space', str(fixture['users']['revoked']) + ':' + str(a))
    check('removed_member_cannot_poll_session', revoked.call('GET', S + '/' + rs['id'] + '/progress')[0] == 403)
    rjp = jobprogress(revoked, rjob); compact('job_membership_revoked', rjp)
    check('removed_member_job_is_revoked_and_terminal', rjp['state'] == 'revoked' and rjp['poll_after_ms'] == 0)

    # Upgrade compatibility: a genuinely completed AI flow with old refs has real counts.
    old = Client(fixture['users']['legacy_ai']); old_s = old.data('POST', S, {'space_id': a})
    old_s = update(old, old_s, 'move', stage='review')
    old_s = update(old, old_s, 'review_confirm', confirmation_intent='confirm', draft_versions=versions(old_s, 'input_drafts'))
    qjob = old.data('POST', Q, {'session_id': old_s['id'], 'expected_version': old_s['version'], 'generation_mode': 'ai'}, expected=(202,))
    check('ai_question_job_phase_is_explicit', jobprogress(old, qjob)['phase'] == 'preparing_questions')
    check('synthetic_ai_questions_install', cli('work', qjob['id'])['execution_status'] == 'succeeded')
    old_s = current(old, old_s); old_b = old_s['question_batch']
    for q in old_b['questions']:
        old_b = old.data('PUT', Q + '/' + old_b['id'] + '/answers/' + q['id'], {'expected_version': 0, 'answer_type': 'skipped'})
    cjob = old.data('POST', Y, {'session_id': old_s['id'], 'expected_version': old_s['version'], 'expected_batch_version': old_b['version'], 'generation_mode': 'ai'}, expected=(202,))
    check('ai_compose_job_phase_is_explicit', jobprogress(old, cjob)['phase'] == 'composing_profile')
    check('synthetic_ai_compose_installs', cli('work', cjob['id'])['execution_status'] == 'succeeded')
    old_s = current(old, old_s); old_s = update(old, old_s, 'move', stage='privacy')
    old_s = update(old, old_s, 'complete', confirmation_intent='confirm', draft_versions=versions(old_s, 'output_drafts'), expected_batch_version=old_b['version'])
    old_p = progress(old, old_s); total = len(old_b['questions'])
    check('new_ai_completed_counts_are_real', old_p['questions']['total'] == total and old_p['questions']['skipped'] == total and old_p['questions']['remaining'] == 0)
    cli('legacy-completed', old_s['id']); before = cli('fingerprint'); calls = cli('journal')
    old_p = progress(old, old_s); compact('legacy_ai_completed', old_p)
    check('old_ai_completed_without_snapshot_keeps_real_counts', old_p['state'] == 'completed' and old_p['questions']['total'] == total and old_p['questions']['skipped'] == total and old_p['questions']['remaining'] == 0)
    check('old_ai_completed_get_does_not_backfill_or_generate', cli('fingerprint') == before and cli('journal') == calls)
    check('other_owner_cannot_read_legacy_completed_counts', viewer.call('GET', S + '/' + old_s['id'] + '/progress')[0] == 404)
    draft_confirm(old, [{'key': 'city', 'value': 'S76旧流程完成后修改'}])
    check('later_profile_edit_keeps_historical_completed_counts', progress(old, old_s)['questions']['total'] == total)
    cli('revoke-space', str(fixture['users']['legacy_ai']) + ':' + str(a))
    check('space_revocation_denies_legacy_completed_counts', old.call('GET', S + '/' + old_s['id'] + '/progress')[0] == 403)

    # Module lifecycle changes are confined to the audit clone.
    offsource = cli('source-import', fixture['users']['ai'])
    offjob = extract(ai, other_session, offsource)
    before = cli('fingerprint'); cli('module', 'matcher-onboarding-ai:disable')
    check('disable_p6_retains_saved_data', cli('fingerprint') == before)
    try:
        before = cli('journal'); disabled_flow = rules_flow(viewer, b)
        check('rules_five_stages_work_with_p6_disabled', disabled_flow['status'] == 'completed' and disabled_flow['llm_calls'] == 0 and cli('journal') == before)
        check('saved_job_progress_works_with_p6_disabled', jobprogress(ai, job)['state'] == 'revoked')
        check('active_saved_job_progress_works_with_p6_disabled', jobprogress(ai, offjob)['state'] == 'queued' and progress(ai, other_session)['state'] == 'processing')
        check('p6_disabled_capability_is_explicit', ai.data('GET', P + '/ai-capabilities')['ai']['available'] is False)
    finally:
        cli('module', 'matcher-onboarding-ai:enable')
    check('p6_reenabled_without_changing_saved_progress', jobprogress(ai, job)['state'] == 'revoked')
    ai.data('POST', J + '/' + offjob['id'] + '/cancel', {})
    ls = current(life, ls); lp = progress(life, ls); before = cli('fingerprint'); cli('module', 'matcher-onboarding:disable')
    check('disable_p2_retains_saved_data', cli('fingerprint') == before)
    try:
        check('p2_route_unavailable_while_disabled', life.call('GET', S + '/' + ls['id'] + '/progress')[0] == 404)
        check('p1_still_reads_with_p2_disabled', any(x['key'] == 'city' for x in life.data('GET', P)['attributes']))
        ordinary = life.data('GET', P); city = next(x for x in ordinary['attributes'] if x['key'] == 'city')
        draft_confirm(life, [{'attribute_id': city['attribute_id'], 'key': 'city', 'value': 'S76禁用期间合成修改'}])
        shown = viewer.data('GET', '/api/v1/spaces/' + str(a) + '/profiles/' + str(fixture['users']['lifecycle']))
        check('p1_write_and_p8_privacy_work_with_p2_disabled', any(x['value'] == 'S76禁用期间合成修改' for x in shown['global']['attributes']) and MARKER not in json.dumps(shown))
    finally:
        cli('module', 'matcher-onboarding:enable')
    restored = current(life, ls); restored_progress = progress(life, ls)
    check('p2_reenable_restores_same_session_references', restored['id'] == ls['id'] and restored['version'] == ls['version'] and restored['resource_refs'] == ls['resource_refs'])
    check('p2_restored_flow_reports_intervening_profile_change', restored_progress['state'] == 'needs_attention' and 'profile_changed' in restored_progress['reasons'] and restored_progress['revision_token'] != lp['revision_token'])
    before = cli('fingerprint'); upgrade1 = native_upgrade(); upgrade2 = native_upgrade()
    check('repeated_native_upgrade_keeps_all_persisted_records', cli('fingerprint') == before and upgrade1['migrations'] == upgrade2['migrations'])
    check('native_upgrade_records_current_versions', upgrade2['modules']['matcher-user-profile']['installed_version'] == '0.10.0' and upgrade2['modules']['matcher-onboarding']['installed_version'] == '0.4.0')
    check('repeat_install_keeps_completed_progress', progress(owner, s)['state'] == 'completed')
    check('original_100_people_are_unchanged', cli('legacy') == original)
    journal = cli('journal')
    check('all_synthetic_adapters_run_outside_transactions', journal['ai']['active_transactions'] == 0 and journal['reader']['active_transactions'] == 0)
    delta = {kind: {key: journal[kind][key] - before_calls[kind][key] for key in journal[kind]} for kind in journal}
    return {'status': 'passed', 'passed': len(checks), 'failed': 0, 'checks': checks, 'http_requests': requests, 'real_llm_calls': 0, 'synthetic_adapter_journal': journal, 'synthetic_adapter_run_delta': delta, 'database': DB, 'origin': BASE, 'fixture_user_count': len(fixture['users']), 'scope': 'Actual HTTP/native session/CSRF/MySQL, validated synthetic engine and no-network reader; no browser, external gateway, main database or frontend changes.'}

if __name__ == '__main__':
    try:
        report = run()
    except Exception as error:
        report = {'status': 'failed', 'passed': sum(x['passed'] for x in checks), 'failed': sum(not x['passed'] for x in checks), 'checks': checks, 'http_requests': requests, 'real_llm_calls': 0, 'error_type': type(error).__name__, 'error': str(error), 'database': DB, 'origin': BASE}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report['status'] == 'passed' else 1)
