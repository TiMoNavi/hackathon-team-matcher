#!/usr/bin/env python3
"""C02/C03 shell HTTP checks against the fixed, owned 8124 instance; no chat writes."""
import http.client
import json
import os
from pathlib import Path
import subprocess
import sys
from html.parser import HTMLParser
from http.cookies import SimpleCookie

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
REPORT = ROOT / 'docs/群聊模块升级/sources/C03_HTTP_20261112.json'
RELEASE = ROOT / 'backend/protected/modules/matcher-chat-ui/resources/app'
report = {'stage': 'C03-shell-only', 'passed': False, 'checks': [], 'real_chat_tested': False}

def control(action, expected=0):
    result = subprocess.run([sys.executable, str(HERE / 'harness.py'), action], capture_output=True, text=True, timeout=90)
    assert result.returncode == expected, 'Unexpected isolated control result; private diagnostics suppressed'
    return json.loads(result.stdout if result.returncode == 0 else result.stderr)

def request(path, expected, method='GET', host='127.0.0.1:8124'):
    connection = http.client.HTTPConnection('127.0.0.1', 8124, timeout=30)
    connection.request(method, path, headers={'Host': host})
    response = connection.getresponse()
    status = response.status; headers = dict(response.getheaders()); body = response.read().decode('utf-8', errors='replace')
    connection.close()
    report['checks'].append({'path': path, 'method': method, 'status': status, 'expected': expected})
    assert status == expected, 'Unexpected HTTP status for ' + path + ': ' + str(status)
    return headers, body

class Assets(HTMLParser):
    def __init__(self):
        super().__init__(); self.urls = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script' and attrs.get('src'): self.urls.append(attrs['src'])
        if tag == 'link' and attrs.get('href'): self.urls.append(attrs['href'])

try:
    baseline = control('inspect')
    assert baseline['empty_business_data'] and baseline['baseline_installed']
    assert baseline['modules']['mail']['enabled'] and baseline['ui_enabled']
    headers, body = request('/matcher/chat', 200)
    lower = {k.lower(): v for k, v in headers.items()}
    assert lower.get('cache-control') == 'private, no-store' and lower.get('x-content-type-options') == 'nosniff'
    assert lower.get('content-security-policy')
    cookies = SimpleCookie(); cookies.load(lower.get('set-cookie', ''))
    report['response_headers'] = {'private_no_store': True, 'nosniff': True, 'csp_present': True, 'cookie_names': list(cookies)}
    assert '_csrf' not in cookies
    assert 'matcher-chat-bootstrap' in body and 'matcher-chat-root' in body
    for target in ['/matcher/chat/conversations/1', '/matcher/chat/conversations/9223372036854775807']:
        request(target, 200)
    for target, location in [('/matcher-chat-ui/app/index', '/matcher/chat'), ('/matcher-chat-ui/app/index?path=conversations%2F1', '/matcher/chat/conversations/1'), ('/matcher-chat-ui/app/index?returnUrl=https%3A%2F%2Fexample.invalid', '/matcher/chat')]:
        redirect_headers, _ = request(target, 302)
        assert redirect_headers.get('Location') in [location, 'http://127.0.0.1:8124' + location]
    for target in ['/matcher/chat/unknown', '/matcher/chat/conversations/0', '/matcher/chat/conversations/-1', '/matcher/chat/conversations/01', '/matcher/chat/conversations/9223372036854775808', '/matcher/chat/conversations/1/extra', '/matcher/chat/../private.json', '/matcher/chat/%2e%2e/private.json', '/matcher-chat-ui/app/index?path=conversations%2F0', '/matcher-chat-ui/app/index?path%5B%5D=x']:
        request(target, 404)
    for verb in ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']:
        h, _ = request('/matcher/chat', 405, method=verb)
        assert h.get('Allow') == 'GET'
    request('/matcher-chat-ui/app/index', 405, method='POST')
    for target in ['/private.json', '/marker.json', '/mysql.cnf', '/server.json', '/backups/file.sql', '/sessions/a', '/uploads/a', '/runtime/a', '/modules/mail/module.json', '/.env', '/protected/config/common.php', '/deploy/chat/control.php']:
        request(target, 404)
    request('/matcher/chat', 503, host='localhost:8124')
    parser = Assets(); parser.feed(body); assert len(parser.urls) >= 2
    for url in parser.urls:
        assert url.startswith('/assets/') and not url.startswith('//')
        request(url, 200)
    asset_root = parser.urls[0].split('/assets/')[0] + '/assets/' + parser.urls[0].split('/assets/')[1].split('/')[0]
    for leaf in ['/manifest.json', '/index.html', '/private.json', '/assets/source.js.map', '/assets/hidden.php']:
        request(asset_root + leaf, 404)
    for action in ['install', 'backup-restore']:
        refused = control(action, expected=1)
        assert refused['status'] == 'failed' and 'Stop the owned' in refused['reason']
        report['checks'].append({'operation': action, 'while_running': 'refused before mutation'})
    # Missing-manifest HTTP behavior is tested with this task's own build artifact only.
    manifest = RELEASE / 'manifest.json'; held = RELEASE / 'manifest.c03-http-check'
    assert manifest.is_file() and not manifest.is_symlink() and not held.exists()
    os.replace(manifest, held)
    try:
        _, unavailable = request('/matcher/chat', 503)
        assert '原生首页' in unavailable and '原生登录' in unavailable
        assert 'type="module"' not in unavailable and 'matcher-chat-bootstrap' not in unavailable
    finally:
        os.replace(held, manifest)
    request('/matcher/chat', 200)
    try:
        off = control('ui-off'); assert not off['ui_enabled'] and off['modules']['mail']['enabled']
        for target in ['/matcher/chat', '/matcher/chat/conversations/1', '/matcher-chat-ui/app/index']:
            request(target, 404)
        assert control('inspect')['counts'] == baseline['counts']
    finally:
        control('ui-on')
    request('/matcher/chat', 200)
    final = control('inspect')
    assert final['counts'] == baseline['counts'] and final['modules'] == baseline['modules']
    assert final['ui_enabled'] and final['empty_business_data']
    report['data_counts_unchanged'] = True
    report['mail_stays_enabled'] = True
    report['passed'] = True
except Exception as error:
    report['failure'] = str(error)
    raise
finally:
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + chr(10))
    print(json.dumps({'passed': report['passed'], 'checks': len(report['checks']), 'report': str(REPORT.relative_to(ROOT))}, ensure_ascii=False))
