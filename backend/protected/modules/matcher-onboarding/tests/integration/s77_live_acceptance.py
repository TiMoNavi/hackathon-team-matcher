#!/usr/bin/env python3
"""Root-controlled S7.7 live acceptance; this harness never starts a model worker.

--prepare creates one synthetic fixture and queues extract.
--observe watches the selected pending job while root runs the separate worker.
--resume installs successful work and advances only uncompleted HTTP actions.
--retry JOB_ID is the only way this harness submits a failed job again.
Every write has a durable intent; uncertain HTTP outcomes stop for inspection.
"""
import argparse
import copy
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

DB = 'humhub_profile_s77_test_root_f3a9d621'
BASE = 'http://127.0.0.1:8106'
HERE = Path(__file__).resolve().parent
BACKEND = HERE.parents[4]
RUNTIME = BACKEND / '.runtime/profile-s77' / DB
CHECKPOINT = RUNTIME / 'live-checkpoint.json'
PHP = [str(BACKEND / '.runtime/php-mysql/bin/php'), '-c', str(BACKEND / '.runtime/php.ini')]
S = '/api/v1/onboarding/sessions'
P = '/api/v1/me/profile'
J = P + '/ai-jobs'
Q = P + '/question-batches'
Y = P + '/syntheses'
BIO = 'S77 本人确认的私有介绍，偏好明确任务和及时沟通。'
FINAL_BIO = 'S77 本人最终编辑的私有介绍，保留逐条控制。'
SOURCE_TEXT = ('这是虚构的 S7.7 验收资料。\n城市：杭州\n技能：Python、TypeScript\n'
               '自我介绍：我主要做后端开发，喜欢把明确的问题做成可运行的小工具。\n'
               '项目：合成协作工具\n贡献：我负责 API 和数据库设计，实现了资料导入功能。\n'
               '技术栈：Python、PostgreSQL\n链接：https://example.org/s77-synthetic-project\n')
state = {}
readonly = False
checkpoint_writable = False


class Halt(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def atomic(path, value):
    temp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    temp.chmod(0o600)
    temp.replace(path)


def save():
    if checkpoint_writable and not readonly:
        atomic(CHECKPOINT, state)


def check(name, condition):
    state.setdefault('checks', {})[name] = bool(condition)
    save()
    if not condition:
        raise Halt('CHECK_FAILED:' + name)


class Client:
    def __init__(self, user=None):
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        if user is not None:
            status, payload, _ = self.call('GET', '/__s77_test/login?id=' + str(user))
            if status != 200 or not payload.get('csrf'):
                raise Halt('SYNTHETIC_LOGIN_FAILED')
            self.csrf = payload['csrf']

    def call(self, method, path, body=None, key=None):
        state['http_requests'] = state.get('http_requests', 0) + 1
        headers = {'Accept': 'application/json'}
        if self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        if method == 'POST':
            headers['Idempotency-Key'] = key or 's77_root_' + uuid.uuid4().hex
        raw = None
        if body is not None:
            raw = json.dumps(body, ensure_ascii=False).encode()
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(BASE + path, method=method, data=raw, headers=headers)
        try:
            response = self.http.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        data = response.read()
        payload = json.loads(data) if 'application/json' in response.headers.get('Content-Type', '') else {}
        return response.status, payload, response.headers

    def data(self, method, path, body=None, key=None, accepted=(200, 201, 202)):
        status, payload, headers = self.call(method, path, body, key)
        if status not in accepted:
            code = (payload.get('error') or {}).get('code', 'NO_JSON_ERROR')
            raise Halt('HTTP_' + str(status) + ':' + str(code))
        if not payload.get('meta', {}).get('request_id') or 'no-store' not in headers.get('Cache-Control', '') or 'private' not in headers.get('Cache-Control', ''):
            raise Halt('RESPONSE_ENVELOPE_OR_PRIVACY_HEADERS_INVALID')
        return payload['data']


def once(client, name, method, path, payload, capture=None, accepted=(200, 201, 202)):
    entry = state.setdefault('writes', {}).get(name)
    if entry:
        if entry['status'] != 'completed':
            raise Halt('UNCERTAIN_HTTP_WRITE_REQUIRES_EXPLICIT_INSPECTION:' + name)
        return None
    entry = {'status': 'started', 'method': method, 'path': path, 'key': 's77_root_' + uuid.uuid4().hex,
             'payload_sha256': hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()}
    state['writes'][name] = entry
    save()
    result = client.data(method, path, payload, entry['key'], accepted)
    if capture:
        capture(result)
    entry['status'] = 'completed'
    save()
    return result


def current(client):
    return client.data('GET', S + '/' + state['session_id'])


def versions(session, name):
    return {scope: {key: draft[key] for key in ('draft_version', 'base_revision')}
            for scope, draft in session[name].items() if draft is not None}


def compact(name, value):
    forbidden = {'raw_text', 'snapshot', 'candidates', 'input', 'input_json', 'context', 'context_json',
                 'result', 'result_json', 'receipts', 'profiles', 'preview_attributes', 'fields', 'answers'}
    def clean(node):
        if isinstance(node, dict):
            return not (forbidden & node.keys()) and all(clean(v) for v in node.values())
        return not isinstance(node, list) or all(clean(v) for v in node)
    projection = value.get('progress', value)
    check(name + '_honest_percent', projection.get('schema_version') == 1 and projection.get('percent') is None)
    check(name + '_no_private_payload', clean(value))


def record_job(job):
    safe = {k: job.get(k) for k in ('job_id', 'operation', 'execution_status', 'applicability', 'error_code', 'attempt', 'retry_of', 'metrics')}
    state.setdefault('model_operations', {})[job['job_id']] = safe
    save()


def record_state(job_id, projection):
    item = state.setdefault('progress_observations', {}).setdefault(job_id, {'states': [], 'samples': 0})
    if projection['state'] not in item['states']:
        item['states'].append(projection['state'])
    item['samples'] += 1
    save()


def probe(client, job_id):
    before = client.data('GET', J + '/' + job_id)
    jp = client.data('GET', J + '/' + job_id + '/progress')
    sp = client.data('GET', S + '/' + state['session_id'] + '/progress')
    compact('job_' + job_id, jp)
    compact('session_' + job_id, sp)
    if state.get('source_id'):
        sourcep = client.data('GET', P + '/sources/' + state['source_id'] + '/progress')
        compact('source_' + state['source_id'], sourcep)
    after = client.data('GET', J + '/' + job_id)
    # Only compare a stable snapshot; a concurrent explicit worker may finish between GETs.
    if before['execution_status'] == after['execution_status']:
        late = (before['execution_status'] in ('failed', 'cancelled') and after['metrics'].get('accounting_complete') is True
                and (before['metrics'].get('accounting_complete') is False
                     or (before['execution_status'] == 'cancelled' and before['metrics'].get('llm_calls') == 0
                         and isinstance(after['metrics'].get('llm_calls'), int) and after['metrics']['llm_calls'] > 0)))
        late = late or (before['execution_status'] == 'cancelled' and before['metrics'].get('llm_calls') == 0
                        and after['metrics'].get('llm_calls') is None and after['metrics'].get('accounting_complete') is False)
        if late:
            state.setdefault('late_accounting_updates', []).append(job_id)
        check('stable_GET_metrics_' + job_id, before['metrics'] == after['metrics'] or late)
    record_state(job_id, jp['progress'])
    record_job(after)
    return after


def read_ledger():
    path = RUNTIME / 'live-worker-ledger.json'
    if not path.exists():
        return []
    ledger = json.loads(path.read_text())
    if (ledger.get('database') != DB or ledger.get('schema_version') != 1
            or ledger.get('max_worker_attempts') != 6 or not isinstance(ledger.get('attempts'), list)
            or len(ledger['attempts']) > 6):
        raise Halt('EXISTING_WORKER_LEDGER_INVALID')
    return ledger['attempts']


def worker_slots():
    return len(read_ledger())


def queue(client, operation, path, payload, retry_of=None):
    if len(state.get('jobs', [])) >= 6 or worker_slots() >= 6:
        raise Halt('EXPERIMENT_HARD_LIMIT_6_REACHED')
    name = 'retry_' + retry_of if retry_of else 'queue_' + operation
    def capture(job):
        state['pending_job'] = {'job_id': job['job_id'], 'operation': operation}
        state.setdefault('jobs', []).append({'job_id': job['job_id'], 'operation': operation, 'retry_of': retry_of})
    once(client, name, 'POST', path, payload, capture, accepted=(202,))
    job = probe(client, state['pending_job']['job_id'])
    check(operation + '_durable_queued', job['execution_status'] == 'queued' and job['metrics']['llm_calls'] == 0)
    viewer = Client(state['fixture']['users']['viewer'])
    anonymous = Client()
    check(operation + '_foreign_job_hidden', viewer.call('GET', J + '/' + job['job_id'])[0] == 404)
    check(operation + '_anonymous_job_hidden', anonymous.call('GET', J + '/' + job['job_id'])[0] == 401)
    return 'awaiting_manual_worker'


def consume_pending(client):
    pending = state.get('pending_job')
    if not pending:
        return
    job = probe(client, pending['job_id'])
    if job['execution_status'] in ('queued', 'running'):
        raise Halt('AWAITING_MANUAL_WORKER')
    if job['execution_status'] != 'succeeded' or job['applicability'] != 'current':
        raise Halt('EXPLICIT_RETRY_OR_RECOVERY_REQUIRED:' + str(job.get('error_code')))
    operation = pending['operation']
    check(operation + '_production_P6_success', job['metrics']['model'] == 'gemini-3.8-flash' and job['metrics']['llm_calls'] == 1)
    check(operation + '_accounting_explicit', job['metrics'].get('accounting_complete') is True and isinstance(job['metrics']['usage']['reported'], bool))
    check(operation + '_review_items_present', isinstance(job['result']['review_items'], list))
    state.setdefault('completed_jobs', {})[operation] = pending['job_id']
    state['pending_job'] = None
    save()


def update_session(client, name, action, **payload):
    session = current(client)
    return once(client, name, 'PUT', S + '/' + session['id'], {'expected_version': session['version'], 'action': action, **payload})


def patch_fields(draft, fields):
    for field in fields:
        existing = next((a for a in draft['preview_attributes'] if a['key'] == field['key']), None)
        if existing:
            field['attribute_id'] = existing['attribute_id']
    return fields


def flow(client):
    consume_pending(client)
    if not state.get('session_id'):
        once(client, 'create_session', 'POST', S, {'space_id': state['fixture']['spaces'][0]}, lambda s: state.update(session_id=s['id']))
    if not state.get('source_id'):
        once(client, 'create_source', 'POST', P + '/sources', {'kind': 'text', 'ownership': 'self', 'label': 'S77 合成验收资料', 'text': SOURCE_TEXT}, lambda s: state.update(source_id=s['id'], source_version=s['version']))
    session = current(client)
    if 'extract' not in state.get('completed_jobs', {}):
        return queue(client, 'extract', P + '/extractions', {'generation_mode': 'ai', 'session_id': session['id'], 'expected_version': session['version'], 'sources': [{'source_id': state['source_id'], 'expected_version': state['source_version']}]})
    if 'apply_extract' not in state.get('writes', {}):
        extraction = client.data('GET', J + '/' + state['completed_jobs']['extract'])
        candidates = extraction['result']['candidates']
        check('extraction_supported_candidates', bool(candidates) and all(c['evidence'] for c in candidates))
        check('extraction_does_not_publish', client.data('GET', P)['attributes'] == [])
        draft = session['input_drafts']['global']
        once(client, 'apply_extract', 'POST', J + '/' + extraction['job_id'] + '/apply', {'draft_id': draft['id'], 'expected_draft_version': draft['draft_version'], 'candidate_ids': [c['id'] for c in candidates]})
    if 'manual_input' not in state.get('writes', {}):
        session = current(client); draft = session['input_drafts']['global']
        fields = patch_fields(draft, [{'key': 'bio', 'value': BIO, 'visibility': 'private'}, {'key': 'city', 'value': '杭州', 'visibility': 'authenticated'}, {'key': 'contact_email', 'value': 's77-synthetic@example.invalid', 'visibility': 'friends'}])
        once(client, 'manual_input', 'PUT', P + '/drafts/' + draft['id'], {'expected_version': draft['draft_version'], 'fields': fields})
    if 'review_move' not in state.get('writes', {}):
        update_session(client, 'review_move', 'move', stage='review')
    if 'review_confirm' not in state.get('writes', {}):
        session = current(client)
        update_session(client, 'review_confirm', 'review_confirm', confirmation_intent='confirm', draft_versions=versions(session, 'input_drafts'))
    session = current(client)
    if 'questions' not in state.get('completed_jobs', {}):
        check('explicit_review_before_questions', session['stage'] == 'questions')
        return queue(client, 'questions', Q, {'generation_mode': 'ai', 'session_id': session['id'], 'expected_version': session['version']})
    batch = session['question_batch']
    if 'compose' not in state.get('completed_jobs', {}):
        check('three_to_eight_ai_questions', batch['generation_mode'] == 'ai' and 3 <= len(batch['questions']) <= 8)
        check('stable_options_free_entry_last', all(q['options'] and q['allow_skip'] and q['allow_free_text'] and q['free_text_option']['position'] == 'last' and q['free_text_option']['code'] == 'other' and 'other' not in [o['code'] for o in q['options']] for q in batch['questions']))
        for index, question in enumerate(batch['questions']):
            if index == 0:
                answer = {'answer_type': 'options', 'selected_options': [question['options'][0]['code']]}
            elif index == 1:
                answer = {'answer_type': 'free_text', 'free_text': '每次先明确目标，及时同步进展。'}
            else:
                answer = {'answer_type': 'skipped'}
            once(client, 'answer_' + question['id'], 'PUT', Q + '/' + batch['id'] + '/answers/' + question['id'], {'expected_version': 0, **answer})
            if index == 0 and 'saved_position' not in state.get('writes', {}):
                update_session(client, 'saved_position', 'question_position', question_index=1)
                reopened = Client(state['fixture']['users']['owner'])
                restored = current(reopened)
                check('exit_relogin_restores_batch_and_answer', restored['question_batch']['id'] == batch['id'] and len(restored['question_batch']['answers']) == 1)
                check('exit_relogin_restores_question_position', restored['progress']['questions']['current_index'] == 1)
        session = current(client); batch = session['question_batch']
        check('options_free_text_skip_saved', {'options', 'free_text', 'skipped'} <= {a['answer_type'] for a in batch['answers']})
        check('all_questions_resolved_before_compose', session['progress']['questions']['remaining'] == 0)
        return queue(client, 'compose', Y, {'generation_mode': 'ai', 'session_id': session['id'], 'expected_version': session['version'], 'expected_batch_version': batch['version']})
    if 'final_manual_edit' not in state.get('writes', {}):
        session = current(client); draft = session['output_drafts']['global']
        check('ai_output_is_editable', session['stage'] == 'draft' and draft['status'] == 'editing')
        check('manual_private_input_preserved', any(a['key'] == 'bio' and a['value'] == BIO and a['visibility'] == 'private' for a in draft['preview_attributes']))
        fields = patch_fields(draft, [{'key': 'bio', 'value': FINAL_BIO, 'visibility': 'private'}, {'key': 'city', 'value': '杭州', 'visibility': 'authenticated'}, {'key': 'contact_email', 'value': 's77-synthetic@example.invalid', 'visibility': 'friends'}])
        once(client, 'final_manual_edit', 'PUT', P + '/drafts/' + draft['id'], {'expected_version': draft['draft_version'], 'fields': fields})
        restored = current(Client(state['fixture']['users']['owner']))
        check('manual_output_survives_relogin', any(a['key'] == 'bio' and a['value'] == FINAL_BIO for a in restored['output_drafts']['global']['preview_attributes']))
    if 'privacy_move' not in state.get('writes', {}):
        update_session(client, 'privacy_move', 'move', stage='privacy')
    if 'complete' not in state.get('writes', {}):
        session = current(client)
        check('ready_is_not_completed', session['status'] != 'completed')
        update_session(client, 'complete', 'complete', confirmation_intent='confirm', draft_versions=versions(session, 'output_drafts'), expected_batch_version=session['question_batch']['version'])
    session = current(client)
    check('only_explicit_confirmation_completes', session['status'] == 'completed' and session['progress']['state'] == 'completed')
    viewer = Client(state['fixture']['users']['viewer'])
    visible = viewer.data('GET', '/api/v1/spaces/' + str(state['fixture']['spaces'][0]) + '/profiles/' + str(state['fixture']['users']['owner']))
    check('authenticated_city_visible_via_authorized_entry', any(a['key'] == 'city' and a['value'] == '杭州' for a in visible['global']['attributes']))
    check('private_bio_hidden_from_viewer', all(a['key'] != 'bio' for a in visible['global']['attributes']))
    check('contacts_excluded_from_ordinary_profile', all(not a['key'].startswith('contact_') for a in visible['global']['attributes']))
    contacts = viewer.data('GET', '/api/v1/spaces/' + str(state['fixture']['spaces'][0]) + '/profiles/' + str(state['fixture']['users']['owner']) + '/contacts')
    check('friends_contact_hidden_from_nonfriend', all(a['key'] != 'contact_email' for a in contacts['attributes']))
    if not state.get('next_session_id'):
        once(client, 'next_space', 'POST', S, {'space_id': state['fixture']['spaces'][1]}, lambda s: state.update(next_session_id=s['id']))
    next_session = client.data('GET', S + '/' + state['next_session_id'])
    check('next_space_keeps_global_and_starts_empty', bool(next_session['profiles']['global']['attributes']) and next_session['profiles']['space']['attributes'] == [])
    state['status'] = 'passed'
    save()
    return 'passed'


def report(status):
    observations = copy.deepcopy(state.get('progress_observations', {}))
    observer_requests = 0
    for item in state.get('jobs', []):
        path = RUNTIME / ('live-observe-' + item['job_id'] + '.json')
        if path.exists():
            watched = json.loads(path.read_text())
            observer_requests += watched.get('http_requests', 0)
            prior = observations.setdefault(item['job_id'], {'states': [], 'samples': 0})
            prior['states'] = sorted(set(prior['states']) | set(watched['states']))
            prior['samples'] += watched['samples']
    merged = {job_id: dict(item) for job_id, item in state.get('model_operations', {}).items()}
    attempts = read_ledger()
    for entry in attempts:
        job_id = entry['job_id']
        item = merged.setdefault(job_id, {'job_id': job_id, 'operation': entry['operation']})
        recorded = item.get('metrics', {})
        worker_metrics = entry.get('metrics', {})
        http_complete = (recorded.get('accounting_complete') is True and item.get('execution_status') in ('succeeded', 'failed', 'cancelled'))
        if item.get('execution_status') == 'cancelled' and recorded.get('llm_calls') == 0:
            http_complete = False
        if worker_metrics.get('accounting_complete') is True or not http_complete:
            # A reserved attempt has unknown consumption until terminal accounting is available.
            item['metrics'] = worker_metrics
        for key in ('execution_status', 'applicability', 'error_code'):
            if key in entry:
                item[key] = entry[key]
        item['worker_status'] = entry['status']
    metrics = list(merged.values())
    calls = [m.get('metrics', {}).get('llm_calls') for m in metrics]
    return {'status': status, 'database': DB, 'origin': BASE, 'passed': sum(state.get('checks', {}).values()),
            'checks': [{'name': k, 'passed': v} for k, v in state.get('checks', {}).items()],
            'http_requests': state.get('http_requests', 0) + observer_requests,
            'workflow_http_requests': state.get('http_requests', 0), 'observer_http_requests': observer_requests, 'model_operations': metrics,
            'known_llm_calls': sum(n for n in calls if isinstance(n, int)), 'unknown_call_records': sum(n is None for n in calls),
            'worker_attempts_reserved': len(attempts), 'hard_request_limit': 6, 'planned_calls': 3,
            'late_accounting_updates': sorted(set(state.get('late_accounting_updates', []))),
            'progress_observations': observations, 'pending_job': state.get('pending_job'),
            'synthetic_only': True, 'raw_material_in_report': False, 'automatic_retries': 0}


def observe(seconds):
    pending = state.get('pending_job')
    if not pending:
        raise Halt('NO_PENDING_JOB_TO_OBSERVE')
    start = time.monotonic(); states = []; samples = 0; prior_requests = 0
    request_baseline = state.get('http_requests', 0)
    path = RUNTIME / ('live-observe-' + pending['job_id'] + '.json')
    if path.exists():
        previous = json.loads(path.read_text()); states = previous['states']; samples = previous['samples']
        prior_requests = previous.get('http_requests', 0)
    try:
        client = Client(state['fixture']['users']['owner'])
        while time.monotonic() - start < seconds:
            payload = client.data('GET', J + '/' + pending['job_id'] + '/progress')
            compact('observer', payload)
            p = payload['progress']; samples += 1
            if p['state'] not in states:
                states.append(p['state'])
            atomic(path, {'job_id': pending['job_id'], 'states': states, 'samples': samples, 'percent_is_null': True,
                          'http_requests': prior_requests + state['http_requests'] - request_baseline})
            if p['state'] not in ('queued', 'running'):
                break
            time.sleep(max(0.1, min(1.0, p['poll_after_ms'] / 1000)))
    finally:
        atomic(path, {'job_id': pending['job_id'], 'states': states, 'samples': samples,
                      'http_requests': prior_requests + state.get('http_requests', 0) - request_baseline})
    return {'status': 'observed', 'job_id': pending['job_id'], 'states': states, 'samples': samples,
            'http_requests': prior_requests + state['http_requests'] - request_baseline, 'real_worker_started_by_harness': False}


def main():
    global state, readonly, checkpoint_writable
    checkpoint_writable = False
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--prepare', action='store_true')
    modes.add_argument('--resume', action='store_true')
    modes.add_argument('--observe', action='store_true')
    modes.add_argument('--retry', metavar='FAILED_JOB_ID')
    parser.add_argument('--seconds', type=float, default=105)
    args = parser.parse_args()
    if os.environ.get('MATCHER_S77_LIVE_GATEWAY') != '1' or os.environ.get('MATCHER_S77_TEST_DB', DB) != DB:
        raise Halt('EXPLICIT_ROOT_TEST_OPT_IN_REQUIRED')
    os.umask(0o077)
    if args.prepare:
        if CHECKPOINT.exists():
            raise Halt('CHECKPOINT_EXISTS_USE_RESUME')
        RUNTIME.mkdir(parents=True, exist_ok=True)
        state = {'schema_version': 1, 'database': DB, 'origin': BASE, 'status': 'fixture_pending', 'checks': {}, 'writes': {}, 'jobs': [], 'http_requests': 0}
        checkpoint_writable = True
        save()
        fixture = subprocess.run(PHP + [str(HERE / 's77_root_fixture.php'), DB], capture_output=True, text=True, timeout=30, env=dict(os.environ, MATCHER_S77_TEST_DB=DB))
        if fixture.returncode:
            raise Halt('SYNTHETIC_FIXTURE_FAILED_DIAGNOSTICS_REDACTED')
        state['fixture'] = json.loads(fixture.stdout); state['status'] = 'in_progress'; save()
    else:
        state = json.loads(CHECKPOINT.read_text())
    if state.get('database') != DB or state.get('origin') != BASE or not state.get('fixture'):
        raise Halt('CHECKPOINT_TARGET_OR_FIXTURE_INVALID')
    readonly = args.observe
    checkpoint_writable = not readonly
    if not readonly:
        uncertain = [name for name, entry in state.get('writes', {}).items() if entry['status'] != 'completed']
        if uncertain:
            raise Halt('UNCERTAIN_HTTP_WRITE_REQUIRES_EXPLICIT_INSPECTION:' + uncertain[0])
    if args.observe:
        if not 1 <= args.seconds <= 120:
            raise Halt('OBSERVE_SECONDS_MUST_BE_1_TO_120')
        return observe(args.seconds)
    owner = Client(state['fixture']['users']['owner'])
    if args.retry:
        if (state.get('pending_job') or {}).get('job_id') != args.retry:
            raise Halt('RETRY_MUST_SELECT_EXACT_PENDING_JOB')
        failed = probe(owner, args.retry)
        if failed['execution_status'] != 'failed' or failed['applicability'] != 'current':
            raise Halt('ONLY_CURRENT_FAILED_JOB_IS_RETRYABLE')
        status = queue(owner, failed['operation'], J + '/' + args.retry + '/retry', {}, args.retry)
    else:
        status = flow(owner)
    if status == 'passed':
        observed = report(status)['progress_observations']
        for operation, job_id in state['completed_jobs'].items():
            check(operation + '_observed_queued_running_ready', {'queued', 'running', 'ready'} <= set(observed.get(job_id, {}).get('states', [])))
    save()
    return report(status)


if __name__ == '__main__':
    try:
        print(json.dumps(main(), ensure_ascii=False, indent=2))
    except Exception as error:
        save()
        try:
            output = report('stopped') if state.get('fixture') else {'status': 'stopped', 'details_redacted': True}
        except Exception:
            output = {'status': 'stopped', 'details_redacted': True, 'ledger_unreadable': True}
        output['error_code'] = error.code if isinstance(error, Halt) else type(error).__name__
        print(json.dumps(output, ensure_ascii=False, indent=2))
        sys.exit(1)
