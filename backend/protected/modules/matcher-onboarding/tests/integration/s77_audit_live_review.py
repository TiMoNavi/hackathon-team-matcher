#!/usr/bin/env python3
"""Read only exported S7.7 evidence. No application, database, or network import."""
import hashlib
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[6]
SOURCES = REPO / 'docs/用户画像收集/sources'
DATE = '2026-11-12'
checks = []
files = {}


def check(name, passed):
    checks.append({'name': name, 'passed': bool(passed)})


def read(name):
    data = (SOURCES / name).read_bytes()
    files[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
    return json.loads(data)


main = read('s77-live-http_' + DATE + '.json')
check('root_exact_target', main['database'] == 'humhub_profile_s77_test_root_f3a9d621' and main['origin'] == 'http://127.0.0.1:8106')
check('all_57_workflow_checks_pass', main['status'] == 'passed' and main['passed'] == len(main['checks']) == 57 and all(x['passed'] is True for x in main['checks']))
names = {x['name'] for x in main['checks']}
required = {'extraction_does_not_publish', 'explicit_review_before_questions', 'three_to_eight_ai_questions', 'stable_options_free_entry_last', 'exit_relogin_restores_batch_and_answer', 'exit_relogin_restores_question_position', 'options_free_text_skip_saved', 'all_questions_resolved_before_compose', 'ai_output_is_editable', 'manual_private_input_preserved', 'manual_output_survives_relogin', 'ready_is_not_completed', 'only_explicit_confirmation_completes', 'authenticated_city_visible_via_authorized_entry', 'private_bio_hidden_from_viewer', 'contacts_excluded_from_ordinary_profile', 'friends_contact_hidden_from_nonfriend', 'next_space_keeps_global_and_starts_empty'}
check('profile_confirmation_privacy_and_resume_assertions_present', required <= names)
check('no_pending_retry_unknown_or_late_accounting', main['pending_job'] is None and main['automatic_retries'] == 0 and main['unknown_call_records'] == 0 and main['late_accounting_updates'] == [])
check('three_calls_within_authorized_six_slot_limit', main['known_llm_calls'] == main['worker_attempts_reserved'] == main['planned_calls'] == 3 and main['hard_request_limit'] == 6)
check('three_distinct_model_jobs', len(main['model_operations']) == len({x['job_id'] for x in main['model_operations']}) == 3)
forbidden = {'raw_text', 'source_text', 'snapshot', 'candidates', 'input', 'input_json', 'input_data', 'context', 'context_json', 'result', 'result_json', 'receipts', 'receipts_json', 'profiles', 'preview_attributes', 'fields', 'answers', 'messages', 'prompt', 'content', 'api_key', 'authorization', 'access_token', 'refresh_token', 'password', 'secret'}


def safe(node):
    if isinstance(node, dict):
        return not ({str(k).lower() for k in node} & forbidden) and all(safe(v) for v in node.values())
    return not isinstance(node, list) or all(safe(x) for x in node)


check('final_report_contains_no_raw_payload_or_credential_fields', safe(main) and main['raw_material_in_report'] is False)
expected = {'extract': (31166, 6940), 'questions': (24983, 7910), 'compose': (13931, 7845)}
totals = {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0, 'duration_ms': 0, 'llm_calls': 0}
observer_requests = observer_samples = merged_samples = 0
operations = []
for index, op in enumerate(['extract', 'questions', 'compose'], 1):
    job = next(x for x in main['model_operations'] if x['operation'] == op)
    worker = read('s77-live-' + op + '-worker_' + DATE + '.json')
    observe = read('s77-live-' + op + '-observe_' + DATE + '.json')
    check(op + '_worker_and_http_job_match', worker['worker'] == 'completed' and worker['job']['id'] == worker['job']['job_id'] == job['job_id'] and worker['job']['operation'] == op and worker['job']['metrics'] == job['metrics'])
    check(op + '_successful_current_first_attempt', job['execution_status'] == worker['job']['execution_status'] == 'succeeded' and job['applicability'] == worker['job']['applicability'] == 'current' and job['error_code'] is None and worker['job']['error_code'] is None and job['attempt'] == 1 and job['retry_of'] is None)
    check(op + '_cumulative_worker_slot', worker['attempts_reserved'] == index)
    m = job['metrics']; usage = m['usage']
    check(op + '_exact_model_and_complete_usage', m['model'] == 'gemini-3.8-flash' and m['llm_calls'] == 1 and m['accounting_complete'] is True and usage['reported'] is True and usage['prompt_tokens'] + usage['completion_tokens'] == usage['total_tokens'])
    check(op + '_duration_and_token_total_match', (m['duration_ms'], usage['total_tokens']) == expected[op])
    progress = main['progress_observations'][job['job_id']]
    check(op + '_independent_observer_saw_queued_running_ready', observe['status'] == 'observed' and observe['job_id'] == job['job_id'] and observe['states'] == ['queued', 'running', 'ready'] and set(progress['states']) == set(observe['states']) and observe['real_worker_started_by_harness'] is False)
    check(op + '_observer_and_merged_sample_counts', observe['http_requests'] == observe['samples'] + 1 and progress['samples'] == observe['samples'] + 2)
    check(op + '_exported_worker_and_observer_have_no_private_payload', safe(worker) and safe(observe))
    observer_requests += observe['http_requests']; observer_samples += observe['samples']; merged_samples += progress['samples']
    for key in ['prompt_tokens', 'completion_tokens', 'total_tokens']:
        totals[key] += usage[key]
    totals['duration_ms'] += m['duration_ms']; totals['llm_calls'] += m['llm_calls']
    operations.append({'operation': op, 'duration_ms': m['duration_ms'], 'usage': usage, 'llm_calls': m['llm_calls'], 'attempt': job['attempt']})
check('http_count_reconciles_across_seven_exports', observer_requests == main['observer_http_requests'] == 131 and main['workflow_http_requests'] == 90 and main['http_requests'] == main['workflow_http_requests'] + observer_requests == 221)
check('sample_count_excludes_logins_and_includes_flow_probes', observer_samples == 128 and merged_samples == 134)
check('token_and_duration_aggregates_match', totals == {'prompt_tokens': 12509, 'completion_tokens': 10186, 'total_tokens': 22695, 'duration_ms': 70080, 'llm_calls': 3})
report = {'status': 'passed' if all(x['passed'] for x in checks) else 'failed', 'review_type': 'Independent read-only exported evidence reconciliation, not a repeated gateway or HTTP run', 'passed': sum(x['passed'] for x in checks), 'failed': sum(not x['passed'] for x in checks), 'checks': checks, 'source_files': files, 'verified_workflow_checks': 57, 'verified_http_requests': 221, 'verified_operations': operations, 'verified_live_totals': totals, 'reviewer_real_model_calls': 0, 'reviewer_network_calls': 0, 'reviewer_database_connections': 0, 'material_scope': 'synthetic_only in source report describes fabricated inputs; the recorded model path is production P6 and three actual gateway calls', 'limitations': ['Does not independently repeat network execution or inspect gateway credentials.', 'Exported files retain checks and metrics, not original input or model response text.', 'Checks confirm evidence consistency; upstream workflow assertions are reported separately from these reconciliation checks.']}
target = SOURCES / ('s77_audit_live_review_' + DATE + '.json')
target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + chr(10))
print(json.dumps({k: report[k] for k in ['status', 'passed', 'failed', 'verified_http_requests', 'verified_live_totals', 'reviewer_network_calls', 'reviewer_database_connections']}, ensure_ascii=False, indent=2))
raise SystemExit(0 if report['status'] == 'passed' else 1)
