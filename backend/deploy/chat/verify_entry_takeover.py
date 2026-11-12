#!/usr/bin/env python3
"""Fixed owned 8124 entry, read gates and real Poll verification; no message send."""
import json
import sys
import verify_reading as v

h = v.h
stage = 'guard'
REPORT = h.BACKEND.parent / 'docs/群聊模块升级/sources/entry-t1-http_2026-11-12.json'

def run():
    global stage
    h.require(len(sys.argv) == 1, 'No entry verification overrides.')
    config = h.runtime_guard(); h.database_guard(config)
    v.check('owned server running', h.owned_server() is not None)
    initial = h.control('inspect')
    v.check('reading enabled and entry gate off', initial['chat_read_enabled'] and initial['chat_ui_read_enabled'] and not initial['chat_entry_takeover_enabled'])
    before = v.snapshot(); ids = before['synthetic_ids']; conv = ids['conversations']; actors = ids['actors']
    v.check('preserved eight messages and revoked empty', initial['counts']['message_entry'] == 8 and any(int(r['message_id']) == conv['empty'] and r['status'] == 'revoked' for r in before['metadata']))
    file = h.RUNTIME / 'c04-fixture.json'; h.checked_path(file, mode=0o600); private = json.loads(file.read_text())
    v.check('synthetic fixture provenance', private['kind'] == 'chat-c04-synthetic-v1' and private['nonce'] == config['nonce'])
    clients = {}
    for role in ['a', 'b', 'outsider']:
        clients[role] = v.Client(); clients[role].login(private['actors'][role])
    a, b, outsider = clients['a'], clients['b'], clients['outsider']
    live = None
    try:
        stage = 'opt-in-navigation'
        status, _, _ = a.call('/mail/mail/index')
        v.check('off gate preserves existing managed protection', status == 404)
        h.control('chat-takeover-on')
        target = '/matcher/chat/conversations/' + str(conv['history'])
        for path, expected in [('/mail/mail/index', '/matcher/chat'), ('/mail/mail/index?id=' + str(conv['history']), target), ('/mail/mail/show?id=' + str(conv['history']), target)]:
            status, headers, _ = a.call(path)
            v.check('authorized native GET navigation ' + path.split('?')[0], status == 302 and headers.get('Location') == expected)
            v.check('navigation is private no-store', 'no-store' in headers.get('Cache-Control', ''))
        status, headers, _ = a.call('/mail/mail/show?id=' + str(conv['history']) + '&returnUrl=https%3A%2F%2Fexample.invalid')
        v.check('return URL never controls target', status in [302, 404] and (status != 302 or headers.get('Location') == target))
        for bad in ['0', '01', '-1', '9007199254740992', '1%2C2']:
            status, headers, _ = a.call('/mail/mail/show?id=' + bad)
            v.check('invalid deep id cannot navigate ' + bad, status == 404 and not headers.get('Location'))
        status, headers, _ = a.call('/mail/mail/show?id=' + str(conv['empty']))
        v.check('revoked native deep link remains denied', status == 404 and not headers.get('Location'))
        status, _, body = a.call(target, headers={'Accept': 'text/html'})
        v.check('covered actor receives read app', status == 200 and '"schema_version":2' in body and '"actor_id":' + str(actors['a']) in body)
        stage = 'mixed-and-outsider'
        for path in ['/mail/mail/index', '/mail/mail/show?id=' + str(conv['history'])]:
            status, headers, _ = b.call(path)
            v.check('mixed native navigation explicitly unavailable', status == 503 and not headers.get('Location'))
        for path in ['/matcher/chat', target]:
            status, _, body = b.call(path, headers={'Accept': 'text/html'})
            v.check('mixed new page has no partial bootstrap', status == 503 and '尚未被插件覆盖' in body and 'matcher-chat-bootstrap' not in body)
        status, headers, _ = outsider.call('/mail/mail/show?id=' + str(conv['history']))
        v.check('third party cannot follow managed deep link', status == 404 and not headers.get('Location'))
        stage = 'old-writes-and-independent-api'
        for method in ['POST', 'PUT', 'DELETE']:
            status, headers, _ = a.call('/mail/mail/show?id=' + str(conv['history']), method=method, body=b'')
            v.check('old write is not replayed ' + method, status == 404 and not headers.get('Location'))
        messages = '/api/v1/conversations/' + str(conv['history']) + '/messages'
        status, _, data = b.json(messages, actor=actors['b'])
        v.check('business API remains independently authorized for mixed viewer', status == 200 and len(data['data']['items']) == 8)
        status, _, _ = b.json('/api/v1/conversations/' + str(conv['empty']) + '/messages', actor=actors['b'])
        v.check('independent API still denies revoked conversation', status == 404)
        for who in [a, b, outsider]:
            status, _, _ = who.call('/dashboard/dashboard', headers={'Accept': 'text/html'})
            v.check('ordinary dashboard remains available', status == 200)
        stage = 'real-live-poll'
        live = h.parse_control_output(h.run(h.php_command() + [str(h.HERE / 'entry-live-probe.php'), 'prepare']), 'entry-live-prepare')
        v.check('fixed live probe preserves queue and messages', live['message_entries'] == 8 and live['queue_records'] == initial['counts']['queue'])
        status, _, payload = a.json('/live/poll?last=' + str(live['query_since']))
        v.check('real managed Poll succeeds', status == 200 and 'events' in payload)
        events = payload['events'] if isinstance(payload['events'], dict) else {}
        v.check('non-chat event is delivered unchanged', str(live['events']['a_nonchat']) in events and events[str(live['events']['a_nonchat'])]['data']['notificationGroup'] == 'chat-entry-t1-nonchat')
        v.check('managed mail event is filtered', str(live['events']['a_managed_mail']) not in events)
        status, _, payload = b.json('/live/poll?last=' + str(live['query_since']))
        events = payload['events'] if isinstance(payload['events'], dict) else {}
        v.check('unmanaged event cannot leak whole inbox count to mixed viewer', status == 200 and str(live['events']['b_unmanaged_mail']) not in events)
        stage = 'pause-and-resume'
        h.control('chat-ui-read-off')
        status, headers, _ = a.call('/mail/mail/index')
        v.check('paused UI does not open native entry', status == 503 and not headers.get('Location'))
        status, _, body = a.call('/matcher/chat', headers={'Accept': 'text/html'})
        v.check('paused UI shows unavailable without read bootstrap', status == 503 and '接管已暂停' in body and 'matcher-chat-bootstrap' not in body)
        status, _, _ = a.json(messages, actor=actors['a'])
        v.check('UI pause keeps authorized API independent', status == 200)
        status, _, _ = a.json('/live/poll?last=' + str(live['query_since']))
        v.check('UI pause does not stop ordinary live polling', status == 200)
        h.control('chat-ui-read-on'); h.control('chat-read-off')
        status, _, data = a.json(messages, actor=actors['a'])
        v.check('business gate actually disables API', status == 503 and data['error']['code'] == 'CHAT_DEPENDENCY_UNAVAILABLE')
        status, _, _ = a.call('/dashboard/dashboard', headers={'Accept': 'text/html'})
        v.check('business gate does not disable dashboard', status == 200)
        h.control('chat-read-on'); h.control('chat-takeover-off')
        status, headers, _ = a.call('/mail/mail/index')
        v.check('entry switch off retains business protection', status == 404 and not headers.get('Location'))
        h.control('chat-takeover-on')
        status, headers, _ = a.call('/mail/mail/index')
        v.check('repeat switch safely restores tested target', status == 302 and headers.get('Location') == '/matcher/chat')
    finally:
        cleanup_failures = []
        for action in ['chat-takeover-off', 'chat-read-on', 'chat-ui-read-on']:
            try:
                h.control(action)
            except Exception:
                cleanup_failures.append(action)
        h.require(not cleanup_failures, 'Entry verification restore failed: ' + ','.join(cleanup_failures))
    stage = 'preservation'
    after = v.snapshot()
    v.check('native seen and read positions unchanged', after['native_seen'] == before['native_seen'] and after['read_state'] == before['read_state'])
    v.check('messages and managed metadata unchanged', after == before)
    final = h.control('inspect')
    v.check('all three switches restored explicitly', final['chat_read_enabled'] and final['chat_ui_read_enabled'] and not final['chat_entry_takeover_enabled'])
    v.check('all existing counted data retained', final['counts'] == initial['counts'])
    report = {'status': 'passed', 'target': v.BASE, 'http_requests': v.requests, 'check_count': len(v.checks), 'checks': v.checks,
        'live_fixture': live, 'read_state_unchanged': True, 'native_seen_unchanged': True, 'entry_switch_restored_off': True,
        'existing_api_authority_independent': True, 'send_or_group_enabled': False, 'production_ready': False,
        'limitations': ['Navigation/page installation only; authorized existing API clients continue.', 'Mixed complete inbox, non-Poll transports, mail/push/FCM, REST scoping and concurrent switches remain unverified.']}
    h.require(not REPORT.is_symlink(), 'Report path must not be symlink.')
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + chr(10))
    print(json.dumps({k: val for k, val in report.items() if k not in ['checks', 'live_fixture']}, ensure_ascii=False))

if __name__ == '__main__':
    try:
        with h.locked(): run()
    except Exception as exc:
        print(json.dumps({'status': 'failed', 'stage': stage, 'reason': str(exc) if isinstance(exc, h.Refusal) else type(exc).__name__, 'checks': len(v.checks)}, ensure_ascii=False)); sys.exit(1)
