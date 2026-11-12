#!/usr/bin/env python3
"""N04 fixed-origin HTTP preflight. Never follows OAuth or requests a valid email."""
import http.client
from http.cookies import SimpleCookie
import json
from pathlib import Path
from overnight_n03_verify import Page

ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / 'backend/.runtime/overnight-integration/auth-send-count.json'


class Session:
    def __init__(self):
        self.cookies = SimpleCookie()
        self.csrf = None
        self.requests = 0

    def request(self, path, method='GET', data=None, csrf=True, raw=None):
        if not path.startswith('/') or path.startswith('//'):
            raise ValueError('Only fixed-origin paths are permitted.')
        headers = {'Accept': 'application/json', 'Cookie': '; '.join(m.OutputString() for m in self.cookies.values())}
        body = raw if raw is not None else (json.dumps(data) if data is not None else None)
        if body is not None:
            headers['Content-Type'] = 'application/json'
        if csrf and self.csrf is not None:
            headers['X-CSRF-Token'] = self.csrf
        connection = http.client.HTTPConnection('127.0.0.1', 8113, timeout=30)
        try:
            self.requests += 1
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            for name, value in response.getheaders():
                if name.lower() == 'set-cookie':
                    received = SimpleCookie(); received.load(value)
                    for key, morsel in received.items():
                        self.cookies[key] = morsel.value
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()


def ledger():
    return LEDGER.read_bytes() if LEDGER.exists() else None


def main():
    before = ledger()
    checks = []
    client = Session()

    def check(name, ok, **evidence):
        checks.append({'name': name, 'passed': bool(ok), **evidence})

    def api(name, path, expected, method='GET', data=None, csrf=True, raw=None):
        status, headers, body = client.request(path, method, data, csrf, raw)
        check(name + ' status', status == expected, actual=status, expected=expected)
        try:
            result = json.loads(body)
        except (ValueError, UnicodeError):
            result = {}
        request_id = result.get('meta', {}).get('request_id', '')
        check(name + ' envelope', isinstance(request_id, str) and len(request_id) == 24
              and all(c in '0123456789abcdef' for c in request_id))
        check(name + ' uncached', 'no-store' in headers.get('Cache-Control', '').lower())
        return result

    status, _, body = client.request('/matcher/app/login')
    check('login shell available', status == 200, status=status)
    page = Page(); page.feed(body.decode('utf-8'))
    if len(page.bootstraps) != 1:
        raise RuntimeError('Authentication shell bootstrap is missing.')
    client.csrf = json.loads(page.bootstraps[0]['text'])['csrf_token']
    capabilities = api('capabilities', '/api/v1/auth/capabilities', 200)
    check('both configured transports available', capabilities.get('data') == {'email_available': True, 'github_available': True})
    for path in ['/api/v1/auth/email-codes', '/api/v1/auth/email/verify', '/api/v1/auth/logout']:
        api('guest missing CSRF ' + path, path, 400, 'POST', {}, False)
        api('wrong method ' + path, path, 405)
    api('invalid JSON body', '/api/v1/auth/email-codes', 400, 'POST', raw='{')
    api('unexpected JSON property', '/api/v1/auth/email-codes', 400, 'POST', {'unsupported': True})
    api('non-allowlisted mailbox', '/api/v1/auth/email-codes', 503, 'POST',
        {'email': 'not-allowlisted@example.invalid', 'purpose': 'login', 'return_to': '/matcher/app'})
    api('unknown challenge', '/api/v1/auth/email/verify', 400, 'POST',
        {'challenge_id': 'challenge-' + '0' * 48, 'code': '000000'})
    api('missing explicit OAuth intent', '/api/v1/auth/github/start', 400)
    api('external OAuth return rejected', '/api/v1/auth/github/start?intent=login&return_to=https%3A%2F%2Fexample.invalid', 400)
    api('guest bind rejected', '/api/v1/auth/github/start?intent=bind&return_to=%2Fmatcher%2Fapp', 401)
    api('unauthenticated identity', '/api/v1/me', 401)
    api('unauthenticated current activity', '/api/v1/me/current-event', 401)
    status, headers, _ = client.request('/user/registration')
    check('registration requires verified receipt', status in [302, 403], status=status)
    if status == 302:
        check('registration failure returns local login', headers.get('Location') in ['/user/auth/login', 'http://127.0.0.1:8113/user/auth/login'])
    check('finite send ledger unchanged', ledger() == before)
    report = {'task': 'N04', 'status': 'passed' if all(c['passed'] for c in checks) else 'failed',
              'mode': 'real-local-http-no-external-auth', 'checks': checks, 'http_requests': client.requests,
              'real_mail_send_requests': 0, 'oauth_authorizations': 0, 'real_login_verified': False}
    target = ROOT / 'backend/.runtime/overnight-n04-preflight.json'
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n'); target.chmod(0o600)
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({'status': 'failed', 'type': type(error).__name__, 'raw_response_suppressed': True}))
        raise SystemExit(1)
