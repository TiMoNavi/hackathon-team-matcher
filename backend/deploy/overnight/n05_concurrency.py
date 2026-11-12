#!/usr/bin/env python3
"""Root-run N05 overlapping last-slot race; self-test is offline and never opens runtime."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import time
from unittest.mock import patch
import harness as h

ACTIONS = ('prepare', 'winner', 'contender', 'verify')
MANIFEST = 'n05-concurrency-processes.json'
ARTIFACTS = (MANIFEST, 'n05-concurrency-state.json', 'n05-concurrency-winner-hold.json',
             'n05-concurrency-contender-ready.json', 'n05-concurrency-winner-result.json',
             'n05-concurrency-contender-result.json', 'n05-concurrency-verified.json',
             'n05-concurrency-report.json')


def private_json(path):
    h.private_file(path)
    value = json.loads(path.read_text())
    h.require(isinstance(value, dict), 'Private race artifact must be an object.')
    return value


def validate_manifest(value, config, run_nonce, parent_pid):
    h.require(value.get('kind') == 'n05-concurrency-processes-v1'
              and value.get('nonce') == config['nonce'] and value.get('run_nonce') == run_nonce
              and value.get('parent_pid') == parent_pid, 'Race process provenance mismatch.')
    h.require(re.fullmatch(r'[a-f0-9]{32}', run_nonce) is not None, 'Race nonce shape mismatch.')
    h.require(set(value.get('pids', {})) == set(ACTIONS), 'Race PID roles mismatch.')
    h.require(all(pid is None or type(pid) is int and pid > 0 for pid in value['pids'].values()), 'Race PID shape mismatch.')
    return value


def parse_result(stdout, action, returncode):
    # Never include raw child output/diagnostics in a parent exception.
    try:
        result = json.loads(stdout)
    except (ValueError, TypeError):
        raise h.Refusal('Race child returned invalid structured output; details suppressed.')
    h.require(isinstance(result, dict) and result.get('kind') == 'n05-concurrency-action-v1'
              and result.get('action') == action, 'Race child result identity mismatch.')
    h.require(set(result).issubset({'kind', 'action', 'status', 'checks', 'cases', 'synthetic_registry_only',
                                   'http_calls', 'external_calls', 'native_cross_entry_race_tested',
                                   'error_type', 'reason'}), 'Race child output includes unapproved fields.')
    cases = result.get('cases')
    h.require(isinstance(cases, list) and all(isinstance(case, dict) and set(case) == {'case_id', 'pass'}
                  and re.fullmatch(r'[a-z0-9_]{1,100}', case['case_id']) is not None
                  and type(case['pass']) is bool for case in cases), 'Race child case shape mismatch.')
    h.require(returncode == 0 and result.get('status') == 'passed' and all(case['pass'] for case in cases),
              'Synthetic race child failed; private details suppressed.')
    h.require(result.get('synthetic_registry_only') is True and result.get('external_calls') == 0
              and result.get('http_calls') == 0 and result.get('native_cross_entry_race_tested') is False,
              'Race child execution boundary mismatch.')
    h.require(result.get('checks') == len(cases), 'Race child check count mismatch.')
    return result


def validate_barrier(value, config, run_nonce, winner_pid, fixture_prefix):
    h.require(value.get('kind') == 'n05-concurrency-hold-v1' and value.get('nonce') == config['nonce']
              and value.get('run_nonce') == run_nonce and value.get('pid') == winner_pid
              and value.get('fixture_prefix') == fixture_prefix, 'Winner barrier provenance mismatch.')
    h.require(type(value.get('held_at')) in (int, float), 'Winner barrier timing missing.')
    return value


def wait_for_hold(process, config, run_nonce, fixture_prefix, timeout=20.0):
    deadline = time.monotonic() + timeout
    path = h.RUNTIME / 'n05-concurrency-winner-hold.json'
    while time.monotonic() < deadline:
        if path.exists() or path.is_symlink():
            return validate_barrier(private_json(path), config, run_nonce, process.pid, fixture_prefix)
        h.require(process.poll() is None, 'Winner exited before acquiring the transaction barrier.')
        time.sleep(0.01)
    raise h.Refusal('Winner transaction barrier timed out.')


def run_race():
    config = h.runtime_guard()
    h.database_guard(config)
    h.require(config['modules'] == h.N05_MODULES, 'The fixed N05 module set is required.')
    fixture = private_json(h.RUNTIME / 'n05-synthetic-fixtures.json')
    h.require(fixture.get('kind') == 'n05-synthetic-v1' and fixture.get('nonce') == config['nonce']
              and re.fullmatch(r'n05_[a-f0-9]{12}', fixture.get('prefix', '')) is not None,
              'Fixed synthetic fixture provenance mismatch.')
    h.require(set(fixture.get('actors', {})) == {'owner', 'member', 'target', 'outsider', 'racer_a', 'racer_b'}
              and set(fixture.get('spaces', {})) == {'a', 'b'}, 'Fixed synthetic registry shape mismatch.')
    for name in ARTIFACTS:
        h.require(not (h.RUNTIME / name).exists() and not (h.RUNTIME / name).is_symlink(),
                  'Existing concurrency artifacts require review; this runner never resets fixtures.')
    run_nonce = secrets.token_hex(16)
    manifest = {'kind': 'n05-concurrency-processes-v1', 'nonce': config['nonce'], 'run_nonce': run_nonce,
                'parent_pid': os.getpid(), 'pids': {action: None for action in ACTIONS}, 'created_at': time.time()}
    validate_manifest(manifest, config, run_nonce, os.getpid())
    h.write_private(h.RUNTIME / MANIFEST, json.dumps(manifest))
    processes = []
    results = []

    def launch(action):
        validate_manifest(private_json(h.RUNTIME / MANIFEST), config, run_nonce, os.getpid())
        process = subprocess.Popen(h.php_command(config.get('auth_mode', False))
                                   + [str(h.HERE / 'n05_concurrency.php'), action],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=h.clean_environment())
        processes.append(process)
        manifest['pids'][action] = process.pid
        h.replace_private(h.RUNTIME / MANIFEST, json.dumps(manifest))
        return process

    def complete(process, action, timeout=60):
        try:
            stdout, _stderr = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            raise h.Refusal('Synthetic race process timed out; private diagnostics suppressed.')
        result = parse_result(stdout, action, process.returncode)
        results.append(result)
        return result

    try:
        complete(launch('prepare'), 'prepare')
        winner = launch('winner')
        wait_for_hold(winner, config, run_nonce, fixture['prefix'])
        contender = launch('contender')
        complete(contender, 'contender')
        complete(winner, 'winner')
        complete(launch('verify'), 'verify')
        verified = private_json(h.RUNTIME / 'n05-concurrency-verified.json')
        h.require(verified.get('kind') == 'n05-concurrency-verified-v1' and verified.get('nonce') == config['nonce']
                  and verified.get('run_nonce') == run_nonce and verified.get('fixture_prefix') == fixture['prefix']
                  and verified.get('status') == 'passed', 'Final race verification provenance mismatch.')
        result = {'kind': 'n05-overlapping-concurrency-report-v1', 'status': 'passed',
                  'checks': sum(part['checks'] for part in results), 'phases': results,
                  'winner_hold_after_contender_ms': verified['hold_after_contender_ms'],
                  'contender_elapsed_ms': verified['contender_elapsed_ms'],
                  'synthetic_registry_only': True, 'http_calls': 0, 'external_calls': 0,
                  'native_cross_entry_race_tested': False,
                  'limit': 'Real separate MySQL requests overlap while the winner holds its native join transaction. '
                           'The contender waits at the shared N05 rate-attempt/unit-of-work serialization gate. '
                           'This does not test legacy native cross-entry same-user uniqueness.'}
        h.write_private(h.RUNTIME / 'n05-concurrency-report.json', json.dumps(result, indent=2) + '\n')
        return result
    finally:
        # Only handles spawned by this run may be signalled; never trust an arbitrary PID from disk.
        for process in processes:
            if process.poll() is None:
                process.terminate()
                try:
                    process.communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.communicate(timeout=5)


def self_test():
    checks = []
    def check(label, value):
        h.require(value, 'Offline runner guard failed: ' + label)
        checks.append(label)
    def rejects(label, operation):
        try:
            operation()
        except (h.Refusal, ValueError):
            checks.append(label)
            return
        raise h.Refusal('Offline runner guard did not reject: ' + label)

    config = {'nonce': 'a' * 64}
    nonce = 'b' * 32
    manifest = {'kind': 'n05-concurrency-processes-v1', 'nonce': config['nonce'], 'run_nonce': nonce,
                'parent_pid': 17, 'pids': {action: None for action in ACTIONS}}
    check('valid_manifest', validate_manifest(manifest, config, nonce, 17) is manifest)
    for field, value in [('nonce', 'wrong'), ('run_nonce', 'wrong'), ('parent_pid', 18), ('kind', 'other')]:
        rejects('wrong_manifest_' + field, lambda field=field, value=value: validate_manifest({**manifest, field: value}, config, nonce, 17))
    rejects('unapproved_process_role', lambda: validate_manifest({**manifest, 'pids': {'other': 19}}, config, nonce, 17))
    rejects('invalid_pid_type', lambda: validate_manifest({**manifest, 'pids': {**manifest['pids'], 'winner': True}}, config, nonce, 17))
    result = {'kind': 'n05-concurrency-action-v1', 'action': 'prepare', 'status': 'passed', 'checks': 1,
              'cases': [{'case_id': 'synthetic_case', 'pass': True}], 'synthetic_registry_only': True,
              'http_calls': 0, 'external_calls': 0, 'native_cross_entry_race_tested': False}
    check('sanitized_child_result', parse_result(json.dumps(result), 'prepare', 0) == result)
    rejects('wrong_action', lambda: parse_result(json.dumps(result), 'verify', 0))
    rejects('failed_exit', lambda: parse_result(json.dumps(result), 'prepare', 1))
    rejects('unexpected_output_field', lambda: parse_result(json.dumps({**result, 'token': 'synthetic'}), 'prepare', 0))
    rejects('unstructured_diagnostics', lambda: parse_result('not-json', 'prepare', 1))
    barrier = {'kind': 'n05-concurrency-hold-v1', 'nonce': config['nonce'], 'run_nonce': nonce,
               'pid': 20, 'fixture_prefix': 'n05_' + 'c' * 12, 'held_at': 1.0}
    check('valid_barrier', validate_barrier(barrier, config, nonce, 20, barrier['fixture_prefix']) is barrier)
    rejects('wrong_barrier_pid', lambda: validate_barrier(barrier, config, nonce, 21, barrier['fixture_prefix']))
    rejects('wrong_barrier_run', lambda: validate_barrier(barrier, config, 'd' * 32, 20, barrier['fixture_prefix']))
    with tempfile.TemporaryDirectory(prefix='n05-concurrency-offline-') as directory:
        root = Path(directory)
        path = root / 'state.json'
        h.write_private(path, '{}')
        check('private_state_reader', private_json(path) == {})
        path.chmod(0o644)
        rejects('public_state_denied', lambda: private_json(path))
        link = root / 'link.json'
        link.symlink_to(path)
        rejects('symlink_state_denied', lambda: private_json(link))
        with patch.object(h, 'RUNTIME', root), patch.object(h, 'runtime_guard', side_effect=AssertionError('runtime read')):
            class DeadProcess:
                pid = 20
                def poll(self): return 1
            rejects('exited_winner_before_barrier', lambda: wait_for_hold(DeadProcess(), config, nonce, barrier['fixture_prefix'], 0.01))
    return {'kind': 'n05-concurrency-offline-guards-v1', 'status': 'passed', 'checks': len(checks),
            'cases': checks, 'runtime_access': False, 'database_calls': 0, 'external_calls': 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('run', 'self-test'))
    args = parser.parse_args()
    try:
        if args.action == 'self-test':
            result = self_test()
        else:
            with h.locked():
                result = run_race()
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as error:
        print(json.dumps({'kind': 'n05-overlapping-concurrency-report-v1', 'status': 'failed',
                          'error_type': type(error).__name__,
                          'reason': str(error) if isinstance(error, h.Refusal) else 'Concurrency runner failed; private diagnostics suppressed.'}))
        return 1


if __name__ == '__main__':
    sys.exit(main())

