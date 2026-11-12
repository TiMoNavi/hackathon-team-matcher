#!/usr/bin/env python3
"""Fixed 8124 HTTP exercise using normal native login and owned synthetic records."""
from __future__ import annotations
import http.cookiejar
from html.parser import HTMLParser
import json
from pathlib import Path
import sys
from urllib import request, error, parse
import harness as h

BASE = 'http://127.0.0.1:8124'
REPORT = h.BACKEND.parent / 'docs/群聊模块升级/sources/c04-real-reading_2026-11-12.json'
checks: list[str] = []
requests = 0
stage = 'guard'

def check(name, condition):
    if not condition:
        raise h.Refusal(name)
    checks.append(name)

class Meta(HTMLParser):
    def __init__(self):
        super().__init__(); self.meta = {}; self.bootstrap = ''; self.reading = False
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta' and 'name' in attrs:
            self.meta[attrs['name']] = attrs.get('content', '')
        if tag == 'script' and attrs.get('id') == 'matcher-chat-bootstrap':
            self.reading = True
    def handle_endtag(self, tag):
        if tag == 'script': self.reading = False
    def handle_data(self, value):
        if self.reading: self.bootstrap += value

class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None

class Client:
    def __init__(self):
        self.opener = request.build_opener(request.ProxyHandler({}), request.HTTPCookieProcessor(http.cookiejar.CookieJar()), NoRedirect())
        self.csrf = None
    def call(self, path, *, method='GET', body=None, headers=None):
        global requests
        url = parse.urljoin(BASE, path)
        check('request same origin ' + str(requests + 1), parse.urlsplit(url).netloc == '127.0.0.1:8124' and parse.urlsplit(url).scheme == 'http')
        supplied = {'Accept': 'application/json', **(headers or {})}
        req = request.Request(url, data=body, headers=supplied, method=method)
        requests += 1
        try: response = self.opener.open(req, timeout=20)
        except error.HTTPError as e: response = e
        with response:
            raw = response.read(2_000_001)
            check('bounded HTTP body ' + str(requests), len(raw) <= 2_000_000)
            return response.status, response.headers, raw.decode('utf-8')
    def json(self, path, *, method='GET', data=None, csrf=False, actor=None, headers=None):
        hdr = dict(headers or {})
        if actor is not None: hdr['X-Matcher-Chat-Actor'] = str(actor)
        if csrf: hdr['X-CSRF-Token'] = self.csrf
        if data is not None: hdr['Content-Type'] = 'application/json'
        result = self.call(path, method=method, body=json.dumps(data).encode() if data is not None else None, headers=hdr)
        try: value = json.loads(result[2])
        except ValueError: raise h.Refusal('Expected JSON response')
        return result[0], result[1], value
    def login(self, record):
        status, headers, body = self.call('/user/auth/login', headers={'Accept': 'text/html'})
        check('native login form', status == 200)
        form = Meta(); form.feed(body)
        token = form.meta.get('csrf-token'); param = form.meta.get('csrf-param')
        check('native login CSRF', bool(token) and param == '_chat_c02_csrf')
        data = parse.urlencode({param: token, 'Login[username]': record['username']}).encode()
        status, headers, body = self.call('/user/auth/login', method='POST', body=data, headers={'Content-Type':'application/x-www-form-urlencoded'})
        check('native identity redirect', status == 302 and parse.urlsplit(headers.get('Location', '')).path == '/user/auth/password')
        status, headers, body = self.call('/user/auth/password', headers={'Accept':'text/html'})
        check('native password form', status == 200)
        form = Meta(); form.feed(body); token = form.meta.get('csrf-token')
        data = parse.urlencode({param: token, 'Login[password]': record['password'], 'Login[rememberMe]': '0'}).encode()
        status, headers, body = self.call('/user/auth/password', method='POST', body=data, headers={'Content-Type':'application/x-www-form-urlencoded'})
        check('native password accepted', status == 302)
        status, _, body = self.call('/matcher/chat', headers={'Accept':'text/html'})
        check('authenticated chat host', status == 200)
        form = Meta(); form.feed(body)
        bootstrap = json.loads(form.bootstrap)
        self.csrf = bootstrap['csrf_token']
        check('native CSRF bootstrap', isinstance(self.csrf, str) and len(self.csrf) > 20)

def snapshot():
    output = h.run(h.php_command() + [str(h.HERE / 'read-probe.php'), 'snapshot'])
    return h.parse_control_output(output, 'snapshot')

def run():
    global stage
    config = h.runtime_guard(); h.database_guard(config)
    check('owned 8124 running', h.owned_server() is not None)
    file = h.RUNTIME / 'c04-fixture.json'; h.checked_path(file, mode=0o600)
    private = json.loads(file.read_text())
    check('owned synthetic credentials', private['kind'] == 'chat-c04-synthetic-v1' and private['nonce'] == config['nonce'])
    state = snapshot()['synthetic_ids']; actors = state['actors']; conv = state['conversations']
    api = '/api/v1/conversations'; messages = api + '/' + str(conv['history']) + '/messages'
    stage = 'guest'
    guest = Client(); status, headers, data = guest.json(api)
    check('guest denied JSON', status == 401 and data['error']['code'] == 'AUTHENTICATION_REQUIRED')
    check('private no-store', 'no-store' in headers.get('Cache-Control', ''))
    stage = 'normal-native-login'
    clients = {}
    for role in ['a','b','outsider']:
        clients[role] = Client(); clients[role].login(private['actors'][role])
    a, b, outsider = clients['a'], clients['b'], clients['outsider']
    before = snapshot()
    stage = 'authorized-reads'
    status, _, data = a.json(api, actor=actors['a'])
    check('own two admitted conversations', status == 200 and {x['id'] for x in data['data']['items']} == {conv['history'], conv['empty']})
    check('read permissions only', all(x['permissions'] == {'read':True,'send':False,'invite':False,'leave':False} for x in data['data']['items']))
    status, _, data = a.json(api+'?limit=1', actor=actors['a']); first = data['data']
    check('conversation first page', status == 200 and len(first['items']) == 1 and first['has_more'])
    status, _, data = a.json(api+'?limit=1&cursor='+parse.quote(first['next_cursor']), actor=actors['a'])
    check('conversation signed next page', status == 200 and len(data['data']['items']) == 1 and not data['data']['has_more'] and data['data']['items'][0]['id'] != first['items'][0]['id'])
    status, _, data = outsider.json(api, actor=actors['outsider'])
    check('outsider no admitted conversations', status == 200 and data['data']['items'] == [])
    for role, client in [('a',a), ('b',b)]:
        status, _, data = client.json(messages+'?limit=3', actor=actors[role]); page = data['data']
        check(role+' newest ascending history', status == 200 and [x['seq'] for x in page['items']] == [5,6,7] and page['has_more'])
        check(role+' honest unavailable senders', all(x['sender']['status'] == 'unavailable' and x['attachments'] == [] for x in page['items']))
        cursor = page['next_cursor']
        status, _, data = client.json(messages+'?limit=3&cursor='+parse.quote(cursor), actor=actors[role]); page = data['data']
        check(role+' middle ascending history', status == 200 and [x['seq'] for x in page['items']] == [2,3,4] and page['has_more'])
        status, _, data = client.json(messages+'?limit=3&cursor='+parse.quote(page['next_cursor']), actor=actors[role])
        check(role+' oldest terminal page', status == 200 and [x['seq'] for x in data['data']['items']] == [1] and not data['data']['has_more'])
    status, _, data = a.json(messages+'?after_seq=5&limit=1', actor=actors['a'])
    check('forward bounded increment', status == 200 and [x['seq'] for x in data['data']['items']] == [6] and data['data']['has_more'] and data['data']['next_cursor'] is None)
    status, _, data = a.json(api+'/'+str(conv['empty'])+'/messages', actor=actors['a'])
    check('empty direct supported', status == 200 and data['data']['items'] == [] and data['data']['read_seq'] == 0)
    after = snapshot()
    check('GET keeps native seen unchanged', after['native_seen'] == before['native_seen'])
    check('GET keeps persisted read state unchanged', after['read_state'] == before['read_state'])
    stage = 'authorization-and-input'
    for client, actor in [(outsider,actors['outsider']), (a,actors['a'])]:
        path = messages if client is outsider else api+'/'+str(conv['unmanaged'])+'/messages'
        status, _, data = client.json(path, actor=actor)
        check('unavailable conversation denied '+str(actor), status == 404)
    status, _, data = a.json(api, actor=actors['b'])
    check('changed actor denied', status == 401 and data['error']['code'] == 'SESSION_CHANGED')
    for actor in ['01','0','-1','1,2','9007199254740992']:
        status, _, data = a.json(api, actor=actor)
        check('invalid actor denied '+actor, status == 401)
    for query in ['limit=0','limit=49','limit[]=1','limit=01','unknown=1','cursor=invalid','after_seq=0']:
        status, _, data = a.json(api+'?'+query, actor=actors['a'])
        check('list invalid query '+query, status == 422)
    for query in ['after_seq=-1','after_seq=9007199254740992','after_seq=1&cursor=invalid']:
        status, _, data = a.json(messages+'?'+query, actor=actors['a'])
        check('history invalid query '+query, status == 422)
    for hdr in [{'Origin':'https://example.invalid'},{'Sec-Fetch-Site':'cross-site'}]:
        status, _, data = a.json(api, headers=hdr)
        check('cross origin denied '+next(iter(hdr)), status == 403)
    status, _, data = a.json(api, method='POST',data={})
    check('method rejected', status == 405)
    stage = 'explicit-read-write'
    read = api+'/'+str(conv['history'])+'/read-state'
    status, _, data = a.json(read, method='PUT', data={'read_seq':7}, actor=actors['a'])
    check('missing CSRF rejected', status == 400)
    for value in [-1,8,9007199254740992,'7']:
        status, _, data = a.json(read, method='PUT', data={'read_seq':value}, csrf=True, actor=actors['a'])
        check('invalid read position '+str(value), status == 422)
    status, _, data = outsider.json(read, method='PUT', data={'read_seq':7}, csrf=True, actor=actors['outsider'])
    check('outsider read write rejected', status == 404)
    status, _, data = a.json(read, method='PUT', data={'read_seq':7}, csrf=True, actor=actors['a'])
    check('explicit read advances', status == 200 and data['data']['read_seq'] == 7 and data['data']['unread_count'] == 0)
    status, _, data = a.json(read, method='PUT', data={'read_seq':2}, csrf=True, actor=actors['a'])
    check('read position monotonic', status == 200 and data['data']['read_seq'] == 7)
    stored = snapshot()
    check('read persisted in SQL', any(int(x['message_id']) == conv['history'] and int(x['user_id']) == actors['a'] and int(x['read_seq']) == 7 for x in stored['read_state']))
    check('explicit read avoids native mark-seen side effects', stored['native_seen'] == before['native_seen'])
    stage = 'native-entry-guards'
    for path in ['/mail/mail/index','/mail/mail/index?id=999999','/mail/mail/index?id%5B%5D=1','/mail/mail/index?id=0'+str(conv['history']),
        '/mail/mail/show?id='+str(conv['history']), '/mail/mail/show?id='+str(conv['unmanaged']),
        '/index.php/mail/mail/index?id=999999','/meta-search/index','/live/live/index', '/file/file/download?guid%5B%5D=x']:
        status, _, _ = a.call(path)
        check('restricted native route '+path, status == 404)
    status, _, _ = outsider.call('/mail/mail/show?id='+str(conv['history']))
    check('outsider native managed route rejected', status == 404)
    status, _, _ = outsider.call('/mail/mail/index',headers={'Accept':'text/html'})
    check('unmanaged viewer native inbox retained', status == 200)
    for path in ['/private.json','/c04-fixture.json','/mail/private.eml','/sessions/example','/modules/mail/Module.php']:
        status, _, _ = guest.call(path)
        check('private path refused '+path, status == 404)
    status, headers, _ = a.call('/index.php/matcher-chat-ui/app/index?path=conversations%2F'+str(conv['history'])+'&returnUrl=https%3A%2F%2Fexample.invalid')
    check('front controller canonical redirect', status == 302 and headers.get('Location') == '/matcher/chat/conversations/'+str(conv['history']))
    status, headers, body = a.call('/index.php?r=mail%2Fmail%2Findex&id=999999')
    check('pretty URL host ignores r rather than dispatching native mail', status == 302 and parse.urlsplit(headers.get('Location','')).path == '/dashboard' and 'Synthetic C04 message' not in body)
    report = {'status':'passed','target':BASE,'database':h.DB,'scope':'isolated read integration only',
        'native_password_logins':3,'real_provider_login':False,'synthetic_only':True,'http_requests':requests,
        'checks':checks,'check_count':len(checks),'credentials_returned':False,'real_ai_calls':0,
        'not_verified':['concurrent SQL transitions','append synchronization','revocation persistence','attachments','sending','groups','native full rollback','production deployment','query r dispatch with non-pretty URL host','REST module authorization']}
    REPORT.parent.mkdir(parents=True,exist_ok=True); REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k != 'checks'},ensure_ascii=False))

if __name__ == '__main__':
    try: run()
    except Exception as exc:
        reason = str(exc) if isinstance(exc,h.Refusal) else type(exc).__name__
        print(json.dumps({'status':'failed','stage':stage,'reason':reason,'http_requests':requests,'passed_checks':len(checks)})); sys.exit(1)
