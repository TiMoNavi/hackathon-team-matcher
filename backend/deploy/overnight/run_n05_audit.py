#!/usr/bin/env python3
"""Root-only credential bridge for the fixed isolated synthetic N05 HTTP audit."""
import argparse
from http.cookies import SimpleCookie
import http.client
import json
from pathlib import Path
import re
import subprocess
import sys

import harness as h
sys.path.insert(0, str(h.HERE.parent))
from overnight_n03_verify import Page

ROLES = {'owner', 'member', 'target', 'outsider', 'racer_a', 'racer_b'}
STATE = h.RUNTIME / 'n05-http-state.json'


def fixture(action):
    config = h.runtime_guard()
    h.database_guard(config)
    h.require(config['modules'] == h.N05_MODULES, 'N05 is required.')
    process = subprocess.run(h.php_command(config.get('auth_mode', False)) + [str(h.HERE / 'n05_fixture.php'), action], env=h.clean_environment(), capture_output=True, text=True, timeout=180)
    if process.returncode:
        try:
            error = json.loads(process.stderr)
            stage = error.get('stage', '')
            location = error.get('location', '')
            if re.fullmatch(r'[a-z-]{1,80}', stage) and re.fullmatch(r'[A-Za-z0-9_.-]+:[0-9]+', location):
                raise h.Refusal('Synthetic fixture failed at ' + stage + ' (' + location + '); private diagnostics suppressed.')
        except ValueError:
            pass
        raise h.Refusal('Synthetic fixture failed; private diagnostics suppressed.')
    value = json.loads(process.stdout)
    h.require(value.get('status') == 'passed' and value.get('action') == action
              and value.get('real_user_modified') is False, 'Synthetic fixture verification failed.')
    return value


def private_json(path):
    h.private_file(path)
    return json.loads(path.read_text())


def actors_and_spaces():
    config = h.runtime_guard()
    h.database_guard(config)
    h.require(h.owned_server() is not None, 'The owned isolated server is required.')
    fixture('inspect')
    state = private_json(h.RUNTIME / 'n05-synthetic-fixtures.json')
    h.require(state.get('kind') == 'n05-synthetic-v1' and state.get('nonce') == config['nonce'], 'Synthetic provenance failed.')
    h.require(re.fullmatch(r'n05_[a-f0-9]{12}', state.get('prefix', '')) is not None, 'Synthetic prefix failed.')
    h.require(set(state['actors']) == ROLES and set(state['spaces']) == {'a', 'b'}, 'Synthetic role set failed.')
    actors = {}
    for role, record in state['actors'].items():
        h.require(record['username'] == state['prefix'] + '_' + role
                  and re.fullmatch(r'[a-f0-9]{48}', record['session_id']) is not None, 'Synthetic identity shape failed.')
        cookies = SimpleCookie()
        cookies['overnight_n01_session'] = record['session_id']

        def request(path):
            connection = http.client.HTTPConnection(h.HOST, h.PORT, timeout=25)
            try:
                connection.request('GET', path, headers={'Cookie': '; '.join(m.OutputString() for m in cookies.values())})
                response = connection.getresponse()
                for name, value in response.getheaders():
                    if name.lower() == 'set-cookie':
                        update = SimpleCookie(); update.load(value)
                        for key, morsel in update.items():
                            cookies[key] = morsel.value
                return response.status, response.read()
            finally:
                connection.close()

        status, body = request('/matcher/app')
        h.require(status == 200, 'Synthetic shell request failed.')
        page = Page(); page.feed(body.decode())
        h.require(len(page.bootstraps) == 1, 'Synthetic shell bootstrap failed.')
        bootstrap = json.loads(page.bootstraps[0]['text'])
        h.require(bootstrap.get('api_base') == '/api/v1' and bootstrap.get('csrf_header') == 'X-CSRF-Token', 'Synthetic bootstrap contract failed.')
        status, body = request('/api/v1/me')
        identity = json.loads(body).get('data', {})
        h.require(status == 200 and str(identity.get('user_id')) == str(record['user_id']), 'Synthetic session identity failed.')
        actors[role] = {'cookie': '; '.join(m.OutputString() for m in cookies.values()), 'csrf': bootstrap['csrf_token']}
    return actors, state['spaces']


def run_audit(phase):
    h.require(phase in ['initial', 'revoked'], 'Invalid audit phase.')
    if phase == 'initial':
        h.require(not STATE.exists() and not STATE.is_symlink(), 'An initial audit state already exists; inspect before any new run.')
    actors, spaces = actors_and_spaces()
    data = {'base_url': 'http://127.0.0.1:8113', 'fixture_kind': 'n05-synthetic-v1',
            'actors': actors, 'spaces': spaces, 'phase': phase}
    if phase == 'initial':
        data['state_output'] = str(STATE)
    else:
        data['state'] = private_json(STATE)
    process = subprocess.run([sys.executable, str(h.HERE.parent / 'overnight_n05_audit.py')],
                             input=json.dumps(data), capture_output=True, text=True, timeout=300, env=h.clean_environment())
    report = json.loads(process.stdout)
    h.require(report.get('kind') == 'n05-independent-http-audit-v1' and report.get('phase') == phase, 'Audit result contract failed.')
    h.require(not any(actor[field] in process.stdout for actor in actors.values() for field in ['cookie', 'csrf']), 'Audit output redaction failed.')
    output = h.RUNTIME / ('n05-http-' + phase + '-report.json')
    if output.exists():
        h.replace_private(output, json.dumps(report, indent=2) + '\n')
    else:
        h.write_private(output, json.dumps(report, indent=2) + '\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'inspect', 'revoke-target', 'revoke-member', 'restore-member', 'initial', 'revoked'])
    args = parser.parse_args()
    try:
        with h.locked():
            result = run_audit(args.action) if args.action in ['initial', 'revoked'] else fixture(args.action)
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result.get('status') == 'passed' else 1
    except Exception as error:
        print(json.dumps({'status': 'failed', 'type': type(error).__name__, 'reason': str(error) if isinstance(error, h.Refusal) else 'N05 synthetic audit failed; private details suppressed.'}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
