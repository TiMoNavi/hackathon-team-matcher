#!/usr/bin/env python3
"""Fixed-origin N03 HTTP checks. Cookies and bootstrap tokens are never printed."""
import argparse
import hashlib
import http.client
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
FIELDS = {'schema_version', 'base_path', 'api_base', 'native_home_url',
          'native_login_url', 'csrf_header', 'csrf_token'}


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.roots = 0
        self.bootstraps = []
        self.active = None
        self.assets = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get('id') == 'matcher-webapp-root':
            self.roots += 1
        if tag == 'script' and a.get('id') == 'matcher-webapp-bootstrap':
            self.active = {'type': a.get('type'), 'text': ''}
            self.bootstraps.append(self.active)
        if tag == 'script' and a.get('src'):
            self.assets.append(a['src'])
        if tag == 'link' and a.get('rel') == 'stylesheet' and a.get('href'):
            self.assets.append(a['href'])

    def handle_data(self, data):
        if self.active is not None:
            self.active['text'] += data

    def handle_endtag(self, tag):
        if tag == 'script':
            self.active = None


def request(path, method='GET', payload=None):
    connection = http.client.HTTPConnection('127.0.0.1', 8113, timeout=45)
    try:
        headers = {'Accept': 'application/json' if path.startswith('/api/') else 'text/html'}
        if payload is not None:
            headers['Content-Type'] = 'application/json'
        connection.request(method, path, body=payload, headers=headers)
        response = connection.getresponse()
        return response.status, dict(response.getheaders()), response.read()
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ui-disabled', action='store_true')
    args = parser.parse_args()
    checks = []

    def check(name, ok, **evidence):
        checks.append({'name': name, 'passed': bool(ok), **evidence})

    for path in ['/matcher/app', '/matcher/app/home']:
        status, headers, body = request(path)
        expected = 404 if args.ui_disabled else 200
        check('page status ' + path, status == expected, actual=status, expected=expected)
        if args.ui_disabled or status != 200:
            continue
        page = Page(); page.feed(body.decode('utf-8'))
        check('single root ' + path, page.roots == 1)
        check('single JSON bootstrap ' + path, len(page.bootstraps) == 1
              and page.bootstraps[0]['type'] == 'application/json')
        if len(page.bootstraps) != 1:
            continue
        data = json.loads(page.bootstraps[0]['text'])
        check('bootstrap field whitelist ' + path, isinstance(data, dict) and set(data) == FIELDS)
        check('bootstrap constants ' + path, data.get('schema_version') == 1
              and data.get('base_path') == '/matcher/app' and data.get('api_base') == '/api/v1'
              and data.get('csrf_header') == 'X-CSRF-Token')
        check('CSRF present ' + path, isinstance(data.get('csrf_token'), str) and bool(data['csrf_token']))
        check('native fallbacks ' + path, data.get('native_home_url') in ['/dashboard', '/dashboard/dashboard']
              and data.get('native_login_url') == '/user/auth/login')
        check('published assets present ' + path, bool(page.assets))
        for asset in page.assets:
            url = urlsplit(asset)
            local = not url.scheme and not url.netloc and url.path.startswith('/assets/')
            check('same-origin asset', local)
            if local:
                asset_status, _, asset_body = request(asset)
                check('asset readable', asset_status == 200 and len(asset_body) > 0,
                      status=asset_status, bytes=len(asset_body), sha256=hashlib.sha256(asset_body).hexdigest())

    for path in ['/api/v1/me', '/api/v1/me/current-event']:
        status, _, body = request(path)
        try:
            code = json.loads(body).get('error', {}).get('code')
        except (ValueError, AttributeError):
            code = None
        check('unauthenticated ' + path, status == 401 and code == 'AUTHENTICATION_REQUIRED',
              status=status, error_code=code)
    status, headers, _ = request('/user/auth/login', 'POST', '{}')
    check('native stale CSRF returns fresh login', status == 302
          and headers.get('Location') in ['/user/auth/login', 'http://127.0.0.1:8113/user/auth/login'], status=status)
    status, _, _ = request('/matcher/app', 'POST', '{}')
    check('shell CSRF rejects missing token', status == 400, status=status)
    status, _, _ = request('/api/v1/me', 'PATCH', '{}')
    check('API checks authentication before CSRF', status == 401, status=status)
    for path in ['/private.json', '/mysql.cnf', '/runtime/php-errors.log']:
        status, _, _ = request(path)
        check('private path denied ' + path, status == 404, status=status)
    report = {'status': 'passed' if all(c['passed'] for c in checks) else 'failed',
              'task': 'N03', 'mode': 'ui-disabled' if args.ui_disabled else 'ui-enabled',
              'origin': 'http://127.0.0.1:8113', 'checks': checks,
              'real_login_verified': False, 'business_writes': 0, 'external_calls': 0}
    target = ROOT / 'backend/.runtime' / ('overnight-n03-' + report['mode'] + '.json')
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + chr(10))
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({'status': 'failed', 'type': type(error).__name__, 'raw_response_suppressed': True}))
        raise SystemExit(1)
