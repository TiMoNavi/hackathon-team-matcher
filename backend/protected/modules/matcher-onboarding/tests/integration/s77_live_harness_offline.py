#!/usr/bin/env python3
"""No HTTP, database or private configuration: durable live-tool safety checks."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('s77_live', HERE / 's77_live_acceptance.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
checks = {}


def check(name, value):
    checks[name] = bool(value)
    assert value, name


class FakeClient:
    def __init__(self, fail=False):
        self.calls = 0
        self.fail = fail

    def data(self, *args):
        self.calls += 1
        if self.fail:
            raise TimeoutError('synthetic uncertain HTTP response')
        return {'id': 'synthetic_id'}


with tempfile.TemporaryDirectory(prefix='s77_harness_offline_') as tmp:
    h.RUNTIME = Path(tmp)
    h.CHECKPOINT = h.RUNTIME / 'checkpoint.json'
    h.checkpoint_writable = True
    h.state = {'database': h.DB, 'origin': h.BASE, 'writes': {}, 'checks': {}}
    client = FakeClient()
    h.once(client, 'create', 'POST', '/synthetic', {'value': 'synthetic'}, lambda result: h.state.update(saved_id=result['id']))
    saved = json.loads(h.CHECKPOINT.read_text())
    check('mutation_and_captured_resource_checkpointed_together', saved['saved_id'] == 'synthetic_id' and saved['writes']['create']['status'] == 'completed')
    check('checkpoint_stores_hash_not_payload', 'payload' not in saved['writes']['create'] and len(saved['writes']['create']['payload_sha256']) == 64)
    check('checkpoint_is_owner_only', h.CHECKPOINT.stat().st_mode & 0o777 == 0o600)
    h.once(client, 'create', 'POST', '/synthetic', {'value': 'synthetic'})
    check('successful_write_never_reissued_on_resume', client.calls == 1)
    uncertain = FakeClient(fail=True)
    try:
        h.once(uncertain, 'unknown', 'PUT', '/synthetic', {})
    except TimeoutError:
        pass
    check('uncertain_write_intent_persists', json.loads(h.CHECKPOINT.read_text())['writes']['unknown']['status'] == 'started')
    try:
        h.once(uncertain, 'unknown', 'PUT', '/synthetic', {})
        raise AssertionError('uncertain write was repeated')
    except h.Halt as error:
        check('uncertain_write_requires_explicit_inspection', error.code.startswith('UNCERTAIN_HTTP_WRITE_') and uncertain.calls == 1)
    h.state = {'jobs': [{}] * 6}
    try:
        h.queue(client, 'extract', '/synthetic', {})
        raise AssertionError('budget accepted')
    except h.Halt as error:
        check('six_job_budget_blocks_before_HTTP', error.code == 'EXPERIMENT_HARD_LIMIT_6_REACHED' and client.calls == 1)
    h.state = {'checks': {}, 'model_operations': {}}
    h.record_job({'job_id': 'unknown_job', 'operation': 'compose', 'execution_status': 'failed', 'applicability': 'current', 'metrics': {'llm_calls': None, 'accounting_complete': False, 'usage': {'reported': False, 'total_tokens': None}}})
    h.record_job({'job_id': 'known_job', 'operation': 'extract', 'execution_status': 'failed', 'applicability': 'current', 'metrics': {'llm_calls': 1, 'accounting_complete': True, 'usage': {'reported': False, 'total_tokens': None}}})
    report = h.report('stopped')
    check('unknown_call_accounting_not_coerced_to_zero', report['unknown_call_records'] == 1 and report['known_llm_calls'] == 1)
    check('failed_operations_retained_in_report', len(report['model_operations']) == 2 and all(j['execution_status'] == 'failed' for j in report['model_operations']))
    def ledger(entries):
        (h.RUNTIME / 'live-worker-ledger.json').write_text(json.dumps({'schema_version': 1, 'database': h.DB, 'max_worker_attempts': 6, 'attempts': entries}))
    h.state = {'model_operations': {'reserved': {'job_id': 'reserved', 'execution_status': 'queued', 'metrics': {'llm_calls': 0, 'accounting_complete': True}}}}
    ledger([{'job_id': 'reserved', 'operation': 'extract', 'status': 'started', 'metrics': {'llm_calls': None, 'accounting_complete': False}}])
    r = h.report('stopped')
    check('reserved_unknown_overrides_stale_queued_zero', r['unknown_call_records'] == 1 and r['known_llm_calls'] == 0)
    h.state['model_operations']['reserved']['execution_status'] = 'cancelled'
    r = h.report('stopped')
    check('reserved_unknown_overrides_cancelled_initial_zero', r['unknown_call_records'] == 1 and r['known_llm_calls'] == 0)
    h.state['model_operations']['reserved']['execution_status'] = 'failed'
    h.state['model_operations']['reserved']['metrics'] = {'llm_calls': None, 'accounting_complete': False}
    ledger([{'job_id': 'reserved', 'operation': 'extract', 'status': 'finished', 'metrics': {'llm_calls': 1, 'accounting_complete': True}}])
    r = h.report('stopped')
    check('late_ledger_complete_overrides_unknown_checkpoint', r['known_llm_calls'] == 1 and r['unknown_call_records'] == 0)
    h.state = {'session_id': 'offline_session', 'checks': {}, 'model_operations': {}}
    class LateClient:
        def __init__(self):
            self.jobs = 0
        def data(self, method, path):
            if path.endswith('/progress'):
                return {'progress': {'schema_version': 1, 'state': 'failed', 'percent': None}}
            self.jobs += 1
            return {'job_id': 'late', 'execution_status': 'failed', 'metrics': {'llm_calls': None if self.jobs == 1 else 1, 'accounting_complete': self.jobs != 1}}
    h.probe(LateClient(), 'late')
    check('same_failed_state_allows_late_accounting', h.state['late_accounting_updates'] == ['late'])
    class CancelUnknownClient(LateClient):
        def data(self, method, path):
            value = super().data(method, path)
            if not path.endswith('/progress'):
                value['job_id'] = 'cancel_unknown'
                value['execution_status'] = 'cancelled'
                value['metrics'] = {'llm_calls': 0 if self.jobs == 1 else None, 'accounting_complete': self.jobs == 1}
            return value
    h.probe(CancelUnknownClient(), 'cancel_unknown')
    check('cancelled_initial_zero_can_become_unknown', 'cancel_unknown' in h.state['late_accounting_updates'])
    h.state = {'checks': {}}
    h.compact('safe_projection', {'progress': {'schema_version': 1, 'state': 'running', 'percent': None}})
    try:
        h.compact('leaky_projection', {'progress': {'schema_version': 1, 'percent': None}, 'input': {'text': 'synthetic'}})
        raise AssertionError('private payload accepted')
    except h.Halt:
        check('compact_progress_rejects_private_payload', True)
    preserved = '{"database":"preserved-checkpoint"}'
    h.CHECKPOINT.write_text(preserved)
    original_argv = sys.argv
    original_env = dict(os.environ)
    for name, argv, optin in [('no_optin', ['--resume'], '0'), ('duplicate_prepare', ['--prepare'], '1'), ('bad_checkpoint', ['--resume'], '1')]:
        sys.argv = ['offline'] + argv
        os.environ['MATCHER_S77_LIVE_GATEWAY'] = optin
        os.environ['MATCHER_S77_TEST_DB'] = h.DB
        h.state = {}
        try:
            h.main()
        except Exception:
            h.save()
        check(name + '_never_overwrites_checkpoint', h.CHECKPOINT.read_text() == preserved and h.checkpoint_writable is False)
    h.CHECKPOINT.write_text('{')
    try:
        h.main()
    except Exception:
        h.save()
    check('corrupt_checkpoint_never_overwritten', h.CHECKPOINT.read_text() == '{' and h.checkpoint_writable is False)
    h.state = {'fixture': {'users': {'owner': 777}}, 'pending_job': {'job_id': 'observed'}, 'jobs': [{'job_id': 'observed'}],
               'http_requests': 20, 'progress_observations': {'observed': {'states': ['queued'], 'samples': 1}}, 'checks': {}}
    h.readonly = True
    original_client = h.Client
    class ObserverClient:
        def __init__(self, user):
            h.state['http_requests'] += 1
        def data(self, method, path):
            assert method == 'GET'
            h.state['http_requests'] += 1
            return {'progress': {'schema_version': 1, 'state': 'ready', 'percent': None}}
    h.Client = ObserverClient
    watched = h.observe(1)
    h.Client = original_client
    check('observer_accounts_for_login_and_GET', watched['http_requests'] == 2)
    check('observer_never_writes_checkpoint', h.CHECKPOINT.read_text() == '{')
    h.state['http_requests'] = 20
    before = json.dumps(h.state, sort_keys=True)
    first = h.report('pending'); second = h.report('pending')
    check('report_is_pure_and_repeatable', first == second and json.dumps(h.state, sort_keys=True) == before)
    check('report_sums_workflow_and_observer_requests', first['http_requests'] == 22 and first['workflow_http_requests'] == 20 and first['observer_http_requests'] == 2)
    sys.argv = original_argv
    os.environ.clear(); os.environ.update(original_env)

worker = h.BACKEND / 'deploy/profile_s77_live_worker.php'
invalids = [
    ({'MATCHER_S77_LIVE_GATEWAY': '0'}, h.DB, '00000000-0000-0000-0000-000000000000'),
    ({'MATCHER_S77_LIVE_GATEWAY': '1'}, 'humhub_preview', '00000000-0000-0000-0000-000000000000'),
    ({'MATCHER_S77_LIVE_GATEWAY': '1'}, h.DB, 'invalid_job'),
    ({'MATCHER_S77_LIVE_GATEWAY': '1', 'MATCHER_S77_TEST_DB': 'humhub_preview'}, h.DB, '00000000-0000-0000-0000-000000000000'),
]
for index, (env, database, job) in enumerate(invalids):
    process = subprocess.run(h.PHP + [str(worker), database, job], capture_output=True, text=True, env={**os.environ, **env}, timeout=5)
    check('worker_preconnect_guard_' + str(index), process.returncode == 2 and 'rejected before connection' in process.stderr and not process.stdout)
fixture = subprocess.run(h.PHP + [str(HERE / 's77_root_fixture.php'), 'humhub_preview'], capture_output=True, text=True, timeout=5)
check('fixture_preconnect_exact_database_guard', fixture.returncode == 2 and 'rejected before connection' in fixture.stderr)
print(json.dumps({'suite': 's77-live-harness-offline', 'status': 'passed', 'passed': len(checks), 'checks': checks, 'http_requests': 0, 'database_connections': 0, 'real_gateway_calls': 0}, indent=2))
