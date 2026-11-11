#!/usr/bin/env python3
"""Independent S7.7 HTTP/MySQL acceptance. Exact audit target, synthetic adapters only."""
import http.cookiejar
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request
import uuid

DB = 'humhub_profile_s77_test_audit_a8c52e14'
BASE = 'http://127.0.0.1:8107'
HERE = Path(__file__).resolve().parent
BACKEND = HERE.parents[4]
PHP = [str(BACKEND / '.runtime/php-mysql/bin/php'), '-c', str(BACKEND / '.runtime/php.ini')]
ENV = dict(os.environ, MATCHER_S77_TEST_DB=DB)
assert os.environ.get('MATCHER_S77_TEST_DB', DB) == DB, 'S77 audit database rejected before connection'
checks = []
requests = 0
fixture = None
S = '/api/v1/onboarding/sessions'
Q = '/api/v1/me/profile/question-batches'
Y = '/api/v1/me/profile/syntheses'
P = '/api/v1/me/profile'
J = P + '/ai-jobs'
R = P + '/sources'
MARKER = 'S77_AUDIT_PRIVATE'

def check(name, condition):
    checks.append({'name': name, 'passed': bool(condition)})
    if not condition:
        raise AssertionError(name)

def command(action, arg='', mode='success', extra=''):
    return PHP + [str(HERE / 's77_audit_driver.php'), DB, action, str(arg), mode, extra]

def cli(action, arg='', mode='success', extra=''):
    result = subprocess.run(command(action, arg, mode, extra), capture_output=True, text=True, env=ENV, timeout=30)
    if result.returncode:
        raise AssertionError('S77 audit CLI failed: ' + action + ' (exit ' + str(result.returncode) + ')')
    return json.loads(result.stdout)

class Client:
    def __init__(self, user=None):
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        if user is not None:
            status, body, _ = self.call('GET', '/__s77_audit/login?id=' + str(user))
            assert status == 200 and body.get('csrf'), 'Synthetic native login failed'
            self.csrf = body['csrf']

    def call(self, method, path, body=None, csrf=True):
        global requests
        requests += 1
        headers = {'Accept': 'application/json'}
        if csrf and self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        if method == 'POST':
            headers['Idempotency-Key'] = 's77_audit_' + uuid.uuid4().hex
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

def fields_by_key(profile):
    return {x['key']: x for x in profile['attributes']}

def prepared(c, space):
    s = c.data('POST', S, {'space_id': space})
    s = update(c, s, 'save_materials', draft_versions=versions(s, 'input_drafts'), global_fields=[{'key': 'city', 'value': '杭州', 'visibility': 'private'}, {'key': 'bio', 'value': MARKER + '_ORIGINAL', 'visibility': 'private'}], space_fields=[])
    s = update(c, s, 'move', stage='review')
    return update(c, s, 'review_confirm', confirmation_intent='confirm', draft_versions=versions(s, 'input_drafts'))

def generate(c, s, operation, batch=None):
    body = {'session_id': s['id'], 'expected_version': s['version'], 'generation_mode': 'ai'}
    if batch is not None:
        body['expected_batch_version'] = batch['version']
    job = c.data('POST', Q if operation == 'questions' else Y, body, expected=(202,))
    done = cli('work', job['id'])
    check(operation + '_real_p6_synthetic_transport_success', done['execution_status'] == 'succeeded' and done['metrics']['llm_calls'] == 1 and done['metrics']['usage']['total_tokens'] == 30)
    return current(c, s), job

def answer_batch(c, b):
    used = []
    for q in b['questions']:
        body = {'expected_version': 0, 'answer_type': 'skipped'}
        if q['target_key'] in ['role', 'event_goal', 'event_role']:
            code = {'role': 'backend', 'event_goal': 'prototype', 'event_role': 'design'}[q['target_key']]
            body = {'expected_version': 0, 'answer_type': 'options', 'selected_options': [code]}
        elif q['target_key'] == 'interest':
            body = {'expected_version': 0, 'answer_type': 'free_text', 'free_text': '合成数据可视化'}
        used.append(body['answer_type'])
        b = c.data('PUT', Q + '/' + b['id'] + '/answers/' + q['id'], body)
    check('options_free_text_and_skip_saved', set(used) == {'options', 'free_text', 'skipped'})
    return b

def full_flow(c, user_id, space, viewer, mode):
    if mode == 'ai':
        s = c.data('POST', S, {'space_id': space})
        source = cli('source-import', user_id)
        job = extract(c, s, source)
        before = cli('journal')
        compact('extract_queued', jobprogress(c, job))
        check('queued_read_does_not_generate', cli('journal') == before)
        def running():
            p = jobprogress(c, job)
            check('p6_transport_running_is_observable', p['state'] == 'running' and p['phase'] == 'extracting' and p['percent'] is None)
        done = delayed('work', job['id'], running)
        check('extraction_passes_real_p6_validation', done['execution_status'] == 'succeeded' and len(done['result']['candidates']) == 2)
        check('candidate_does_not_publish', c.data('GET', P)['attributes'] == [] and cli('native', user_id)['values']['city'] in (None, ''))
        d = s['input_drafts']['global']
        applied = c.data('POST', J + '/' + job['id'] + '/apply', {'draft_id': d['id'], 'expected_draft_version': d['draft_version'], 'candidate_ids': [x['id'] for x in done['result']['candidates']]})
        check('adoption_is_unconfirmed_only', c.data('GET', P)['attributes'] == [] and cli('native', user_id)['values']['city'] in (None, ''))
        check('candidate_job_owner_only', viewer.call('GET', J + '/' + job['id'])[0] == 404)
        s = current(c, s); d = s['input_drafts']['global']; city = next(x for x in d['preview_attributes'] if x['key'] == 'city')
        c.data('PUT', P + '/drafts/' + d['id'], {'expected_version': d['draft_version'], 'fields': [{'attribute_id': city['attribute_id'], 'key': 'city', 'value': '杭州', 'visibility': 'private'}, {'key': 'bio', 'value': MARKER + '_ORIGINAL', 'visibility': 'private'}]})
        s = update(c, current(c, s), 'move', stage='review')
        s = update(c, s, 'review_confirm', confirmation_intent='confirm', draft_versions=versions(s, 'input_drafts'))
        s, qjob = generate(c, s, 'questions')
    else:
        s = prepared(c, space)
        s = c.data('POST', Q, {'session_id': s['id'], 'expected_version': s['version'], 'generation_mode': 'rules'})
    b = s['question_batch']; total = len(b['questions'])
    check(mode + '_question_count_contract', 3 <= total <= 8)
    if mode == 'ai':
        check('ai_free_option_last_and_outside_enum', all(q['free_text_option'] == {'code': 'other', 'label': '其他，我来填写', 'position': 'last', 'max_length': 1000} and 'other' not in [o['code'] for o in q['options']] and q['allow_skip'] for q in b['questions']))
    b = answer_batch(c, b)
    s = update(c, current(c, s), 'question_position', question_index=2)
    restored = Client(user_id).data('POST', S, {'space_id': space})
    check(mode + '_save_exit_restores_batch_answers', restored['id'] == s['id'] and restored['question_batch']['id'] == b['id'] and restored['question_batch']['answers'] == b['answers'] and restored['progress']['questions']['current_index'] == 2)
    if mode == 'ai':
        s, cjob = generate(c, s, 'compose', b)
    else:
        s = c.data('POST', Y, {'session_id': s['id'], 'expected_version': s['version'], 'expected_batch_version': b['version'], 'generation_mode': 'rules'})
    g = {x['key']: x for x in s['output_drafts']['global']['preview_attributes']}
    check(mode + '_private_inputs_remain_private', g['city']['visibility'] == 'private' and g['bio']['visibility'] == 'private')
    if mode == 'ai':
        check('ai_prose_inherits_stricter_global_scope', g['headline']['visibility'] == 'private')
    check(mode + '_generation_does_not_confirm_new_role', 'role' not in fields_by_key(c.data('GET', P)))
    d = s['output_drafts']['global']
    c.data('PUT', P + '/drafts/' + d['id'], {'expected_version': d['draft_version'], 'fields': [{'attribute_id': g['bio']['attribute_id'], 'key': 'bio', 'value': MARKER + '_HAND_EDIT', 'visibility': 'private'}]})
    s = current(c, s)
    if mode == 'ai':
        q = next(q for q in b['questions'] if q['target_key'] == 'role')
        b = c.data('PUT', Q + '/' + b['id'] + '/answers/' + q['id'], {'expected_version': 1, 'answer_type': 'options', 'selected_options': ['frontend']})
        check('answer_change_marks_output_stale', 'needs_resynthesis' in progress(c, s)['reasons'])
        s, _ = generate(c, s, 'compose', b)
    check(mode + '_manual_output_survives_resume_or_recompose', any(x['value'] == MARKER + '_HAND_EDIT' and x['visibility'] == 'private' for x in current(c, s)['output_drafts']['global']['preview_attributes']))
    s = update(c, s, 'move', stage='privacy')
    check(mode + '_privacy_is_not_final_confirmation', s['status'] != 'completed' and fields_by_key(c.data('GET', P))['bio']['value'] == MARKER + '_ORIGINAL')
    s = update(c, s, 'complete', confirmation_intent='confirm', draft_versions=versions(s, 'output_drafts'), expected_batch_version=b['version'])
    own = c.data('GET', P); native = cli('native', user_id)
    check(mode + '_final_confirmation_updates_native_values_once', s['status'] == 'completed' and all(native['values'][key] == fields_by_key(own)[key]['value'] for key in ['city', 'bio', 'headline']) and native['native_values_not_duplicated'])
    shown = viewer.data('GET', '/api/v1/spaces/' + str(space) + '/profiles/' + str(user_id))
    check(mode + '_ordinary_public_read_uses_confirmed_scopes', 'role' in fields_by_key(shown['global']) and 'bio' not in fields_by_key(shown['global']) and 'city' not in fields_by_key(shown['global']) and MARKER not in json.dumps(shown))
    check(mode + '_completed_counts_match_saved_answers', s['progress']['questions']['total'] == total and s['progress']['questions']['remaining'] == 0)
    return s, own

def run():
    global fixture
    for target in ['', 'humhub_preview', 'humhub_profile_s77_test_root_f3a9d621', DB + '_other']:
        result = subprocess.run(PHP + ['-d', 'display_errors=1', str(HERE / 's77_audit_bootstrap.php'), target], env=dict(os.environ, MATCHER_S77_TEST_DB=target), capture_output=True, text=True)
        check('preconnect_guard_' + (target or 'empty'), result.returncode != 0 and 'rejected before connection' in result.stdout + result.stderr)
    result = subprocess.run(PHP + [str(HERE / 's77_audit_fixture.php'), DB], capture_output=True, text=True, env=ENV, timeout=30)
    assert result.returncode == 0, 'Audit fixture creation failed'
    fixture = json.loads(result.stdout)
    check('fixture_targets_exact_audit_environment', fixture['database'] == DB and fixture['origin'] == BASE)
    original = cli('legacy'); before_calls = cli('journal'); a, b = fixture['spaces']
    viewer = Client(fixture['users']['viewer']); ai = Client(fixture['users']['ai']); rules = Client(fixture['users']['owner'])
    ais, aip = full_flow(ai, fixture['users']['ai'], a, viewer, 'ai')
    before = cli('journal')
    rs, rp = full_flow(rules, fixture['users']['owner'], a, viewer, 'rules')
    check('rules_flow_zero_model_calls', rs['llm_calls'] == 0 and cli('journal') == before)
    for key in ['city', 'bio', 'interest']:
        check('rules_ai_shared_invariant_' + key, fields_by_key(aip)[key]['value'] == fields_by_key(rp)[key]['value'] and fields_by_key(aip)[key]['visibility'] == fields_by_key(rp)[key]['visibility'])
    other = ai.data('POST', S, {'space_id': b})
    check('different_space_starts_with_empty_preferences', other['input_drafts']['space']['preview_attributes'] == [] and other['progress']['tasks'] == [])
    space_before = ai.data('GET', P + '?space_id=' + str(a))
    other = update(ai, other, 'save_materials', draft_versions=versions(other, 'input_drafts'), global_fields=[], space_fields=[{'key': 'event_goal', 'value': {'codes': ['learn']}, 'visibility': 'authenticated'}])
    other = update(ai, other, 'move', stage='review')
    other = update(ai, other, 'review_confirm', confirmation_intent='confirm', draft_versions=versions(other, 'input_drafts'))
    check('different_space_confirmation_preserves_first_space', ai.data('GET', P + '?space_id=' + str(a)) == space_before and fields_by_key(ai.data('GET', P + '?space_id=' + str(b)))['event_goal']['value'] == {'codes': ['learn']})

    # Current job/batch must fail closed after confirmed content or visibility changes.
    for kind in ['privacy', 'content']:
        c = Client(fixture['users'][kind]); s = prepared(c, a); s, j = generate(c, s, 'questions'); batch = s['question_batch']
        p = c.data('GET', P); city = fields_by_key(p)['city']
        if kind == 'privacy':
            c.data('PATCH', P + '/visibility', {'expected_version': p['revision'], 'confirmation_intent': 'confirm', 'changes': [{'attribute_id': city['attribute_id'], 'visibility': 'friends'}]})
        else:
            draft_confirm(c, [{'attribute_id': city['attribute_id'], 'key': 'city', 'value': '上海', 'visibility': 'private'}])
        invalid = c.data('GET', J + '/' + j['id'])
        check(kind + '_change_hides_old_question_result', invalid['applicability'] == 'superseded' and invalid['result'] is None)
        status, body, _ = c.call('PUT', Q + '/' + batch['id'] + '/answers/' + batch['questions'][0]['id'], {'expected_version': 0, 'answer_type': 'skipped'})
        check(kind + '_change_rejects_old_batch_answer', status == 409)
        check(kind + '_change_requires_explicit_reconcile', 'reconcile' in progress(c, s)['next_actions'])

    # Cancelling, timeout, invalid provider output, and a lease-expired late worker.
    life = Client(fixture['users']['lifecycle']); ls = life.data('POST', S, {'space_id': a}); source = cli('source-import', fixture['users']['lifecycle'])
    cancelled = extract(life, ls, source); life.data('POST', J + '/' + cancelled['id'] + '/cancel', {})
    before = cli('journal'); stopped = cli('work', cancelled['id'])
    check('cancelled_job_never_reaches_transport', stopped is None and cli('journal') == before and jobprogress(life, cancelled)['state'] == 'revoked')
    timeout = extract(life, ls, source); failed = cli('work', timeout['id'], 'fail')
    check('transport_timeout_is_explicit_without_rules_fallback', failed['execution_status'] == 'failed' and failed['error_code'] == 'AI_TIMEOUT' and failed['metrics']['llm_calls'] == 1 and failed['metrics']['usage']['reported'] is False and failed['result'] is None)
    retry = life.data('POST', J + '/' + timeout['id'] + '/retry', {}, expected=(202,)); recovered = cli('work', retry['id'])
    check('explicit_retry_has_new_job_and_single_request', retry['id'] != timeout['id'] and retry['attempt'] == 2 and recovered['execution_status'] == 'succeeded' and recovered['metrics']['llm_calls'] == 1)
    invalid = extract(life, ls, source); rejected = cli('work', invalid['id'], 'invalid')
    check('actual_p6_rejects_invalid_synthetic_output', rejected['execution_status'] == 'failed' and rejected['error_code'] == 'AI_OUTPUT_INVALID' and rejected['metrics']['usage']['total_tokens'] == 30 and rejected['result'] is None)
    late = extract(life, ls, source)
    def expire_running():
        cli('age-running', late['id']); old = life.data('GET', J + '/' + late['id'])
        check('lease_timeout_records_unknown_accounting_without_resend', old['execution_status'] == 'failed' and old['error_code'] == 'AI_WORKER_INTERRUPTED' and old['metrics']['llm_calls'] is None and old['metrics']['accounting_complete'] is False)
    delayed('work', late['id'], expire_running)
    late_result = life.data('GET', J + '/' + late['id'])
    check('late_worker_cannot_reinstall_but_records_actual_usage', late_result['execution_status'] == 'failed' and late_result['error_code'] == 'AI_WORKER_INTERRUPTED' and late_result['result'] is None and late_result['metrics']['llm_calls'] == 1 and late_result['metrics']['usage']['total_tokens'] == 30)
    saved = extract(life, ls, source); cli('work', saved['id'])
    life.data('DELETE', R + '/' + source['id'], {'expected_version': source['version']})
    saved_result = life.data('GET', J + '/' + saved['id'])
    check('source_deletion_revokes_saved_result', saved_result['applicability'] == 'revoked' and saved_result['result'] is None)
    scrub = cli('inspect', fixture['users']['lifecycle'])['jobs']
    check('revoked_private_job_payloads_are_scrubbed', all(not x['has_input'] and not x['has_result'] for x in scrub if x['applicability'] == 'revoked'))
    revoked = Client(fixture['users']['revoked']); revs = revoked.data('POST', S, {'space_id': a}); revsource = cli('source-import', fixture['users']['revoked']); revjob = extract(revoked, revs, revsource)
    def revoke_during_transport():
        cli('revoke-space', str(fixture['users']['revoked']) + ':' + str(a))
    delayed('work', revjob['id'], revoke_during_transport)
    revoked_result = revoked.data('GET', J + '/' + revjob['id'])
    check('space_revocation_blocks_late_result', revoked_result['applicability'] == 'revoked' and revoked_result['result'] is None and revoked.call('GET', S + '/' + revs['id'])[0] == 403)

    # Module switches and all ordinary reads are real HTTP, with call-count evidence.
    fresh_source = cli('source-import', fixture['users']['lifecycle']); queued = extract(life, ls, fresh_source)
    cli('module', 'matcher-onboarding-ai:disable')
    try:
        before = cli('fingerprint'); calls = cli('journal')
        compact('p6_disabled_saved_task', jobprogress(life, queued)); progress(life, ls); life.data('GET', R + '/' + fresh_source['id'] + '/progress')
        check('disabled_p6_read_only_progress_remains_available', cli('fingerprint') == before and cli('journal') == calls and life.data('GET', P + '/ai-capabilities')['ai']['available'] is False)
        rules_b = viewer.data('POST', S, {'space_id': b}); rules_b = update(viewer, rules_b, 'move', stage='review'); rules_b = update(viewer, rules_b, 'review_confirm', confirmation_intent='confirm', draft_versions=versions(rules_b, 'input_drafts'))
        rules_b = viewer.data('POST', Q, {'session_id': rules_b['id'], 'expected_version': rules_b['version'], 'generation_mode': 'rules'})
        check('disabled_p6_explicit_rules_still_generates_questions', rules_b['question_batch']['generation_mode'] == 'rules' and cli('journal') == calls)
    finally:
        cli('module', 'matcher-onboarding-ai:enable')
    check('p6_reenabled_preserves_and_runs_existing_queue', jobprogress(life, queued)['state'] == 'queued' and cli('work', queued['id'])['execution_status'] == 'succeeded')
    calls = cli('journal'); before = cli('fingerprint')
    for c, s in [(ai, ais), (rules, rs)]:
        c.data('GET', P); progress(c, s); c.data('GET', P + '/ai-capabilities')
    check('completed_profiles_and_progress_read_only', cli('fingerprint') == before and cli('journal') == calls)
    viewer.data('PUT', '/api/v1/me/current-event', {'space_id': a, 'expected_revision': None})
    discovery = viewer.data('GET', '/api/v1/events/' + str(a) + '/discovery?limit=24')
    viewer.data('GET', '/api/v1/spaces/' + str(a) + '/profiles/' + str(fixture['users']['ai']))
    viewer.data('GET', '/api/v1/spaces/' + str(a) + '/profiles/' + str(fixture['users']['ai']) + '/contacts')
    check('authorized_discovery_and_profile_reads_zero_llm', cli('journal') == calls and MARKER not in json.dumps(discovery))
    check('discovery_rejects_different_current_space', viewer.call('GET', '/api/v1/events/' + str(b) + '/discovery')[0] == 409)
    check('original_preview_synthetic_100_unchanged', original['people'] == 100 and cli('legacy') == original)
    journal = cli('journal'); check('all_transport_and_reader_calls_outside_transactions', journal['ai']['active_transactions'] == 0 and journal['reader']['active_transactions'] == 0)
    delta = {kind: {key: journal[kind][key] - before_calls[kind][key] for key in journal[kind]} for kind in journal}
    return {'status': 'passed', 'passed': len(checks), 'failed': 0, 'checks': checks, 'http_requests': requests, 'real_llm_calls': 0, 'synthetic_adapter_journal': journal, 'synthetic_adapter_run_delta': delta, 'database': DB, 'origin': BASE, 'fixture_user_count': len(fixture['users']), 'scope': 'Actual native HTTP/CSRF/MySQL and real P6 StructuredProfileAiEngine with no-network ModelTransport; no real model, main database or production modification.'}

if __name__ == '__main__':
    try:
        report = run()
    except Exception as error:
        report = {'status': 'failed', 'passed': sum(x['passed'] for x in checks), 'failed': sum(not x['passed'] for x in checks), 'checks': checks, 'http_requests': requests, 'real_llm_calls': 0, 'error_type': type(error).__name__, 'error': str(error), 'database': DB, 'origin': BASE}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report['status'] == 'passed' else 1)

