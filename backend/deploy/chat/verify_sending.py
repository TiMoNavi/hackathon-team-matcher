#!/usr/bin/env python3
"""Real fixed-target C05 send exercise. Never resets C04 or consumes notifications."""
import json
import sys
import verify_reading as v

h = v.h
REPORT = h.BACKEND.parent / 'docs/群聊模块升级/sources/c05-send-http_2026-11-12.json'
stage = 'guard'

def fixture(action='snapshot'):
    h.require(action in ['snapshot', 'unfriend', 'refriend', 'block', 'unblock'], 'Fixed relation action required.')
    return h.parse_control_output(h.run(h.php_command() + [str(h.HERE / 'c05-fixture.php'), action]), action)

def accounts(config):
    file = h.RUNTIME / 'c05-fixture.json'; h.checked_path(file, mode=0o600)
    private = json.loads(file.read_text())
    h.require(private['kind'] == 'chat-c05-text-v1' and private['nonce'] == config['nonce']
              and set(private['actors']) == {'a', 'b'}, 'Owned C05 credentials required.')
    return private['actors']

def run():
    global stage
    h.require(len(sys.argv) == 1, 'No target overrides.')
    config = h.runtime_guard(); h.database_guard(config)
    v.check('owned 8124 running', h.owned_server() is not None)
    initial = h.control('inspect')
    v.check('read UI and send gates ready, takeover off', all(initial[k] for k in ['ui_enabled','chat_read_enabled','chat_ui_read_enabled','chat_send_enabled']) and not initial['chat_entry_takeover_enabled'])
    before = fixture(); ids = before['synthetic_ids']; conv = ids['conversation_id']; actors = ids['actors']
    v.check('owned native friends unblocked', before['friendship_rows'] == 2 and before['blocked_rows'] == 0)
    private = accounts(config); clients = {}
    for role in ['a', 'b']:
        clients[role] = v.Client(); clients[role].login(private[role])
    a, b = clients['a'], clients['b']; path = '/api/v1/conversations/' + str(conv) + '/messages'
    read = '/api/v1/conversations/' + str(conv) + '/read-state'
    key = 'a0500000-0000-4000-8000-000000000001'
    body = 'Synthetic C05 HTTP <script>alert("literal")</script> & 中文🙂\n  preserved  '
    command = {'client_message_id': key, 'body': body}
    created = 0
    try:
        stage = 'gates-and-rejections'
        status, _, data = a.json(path, actor=actors['a'])
        v.check('real native friends permit send', status == 200 and data['data']['context']['permissions']['send'] is True)
        status, _, _ = a.json(path, method='POST', data=command, actor=actors['a'])
        v.check('missing CSRF cannot send', status == 400)
        status, _, _ = a.json(path, method='POST', data=command, csrf=True, actor=actors['b'])
        v.check('wrong actor cannot send', status == 401)
        status, _, _ = v.Client().json(path, method='POST', data=command)
        v.check('guest cannot send', status == 401)
        for headers in [{'Origin': 'https://example.invalid'}, {'Sec-Fetch-Site': 'cross-site'}]:
            status, _, _ = a.json(path, method='POST', data=command, csrf=True, actor=actors['a'], headers=headers)
            v.check('cross origin send refused', status == 403)
        for payload in [{}, {'client_message_id': key, 'body': ''}, {'client_message_id': key, 'body': ' \u3000\n'},
                        {'client_message_id': key, 'body': 'x' * 4001}, {'client_message_id': 'invalid', 'body': 'x'},
                        {'client_message_id': key, 'body': '\x00x'}, {'client_message_id': key, 'body': 7},
                        {**command, 'attachments': []}, {**command, 'sender_id': actors['b']}]:
            status, _, _ = a.json(path, method='POST', data=payload, csrf=True, actor=actors['a'])
            v.check('invalid send contract rejected', status == 422)
        for old in ids['old_conversations'].values():
            status, _, _ = a.json('/api/v1/conversations/' + str(old) + '/messages', method='POST', data=command, csrf=True, actor=actors['a'])
            v.check('foreign legacy conversation send refused', status == 404)
        v.check('rejected writes persist nothing', fixture()['messages_hash'] == before['messages_hash'])
        stage = 'two-way-persistent-send'
        status, headers, data = a.json(path, method='POST', data=command, csrf=True, actor=actors['a'])
        created += int(status == 201)
        first = data.get('data', {}); entry = first.get('message', {})
        v.check('new or owned replay A accepted', status in [200, 201] and first['replayed'] == (status == 200)
                and first['client_message_id'] == key and entry['body'] == body)
        v.check('send private no-store', 'no-store' in headers.get('Cache-Control', ''))
        status, _, data = a.json(path, method='POST', data=command, csrf=True, actor=actors['a'])
        v.check('response retry returns same persisted message', status == 200 and data['data']['replayed']
                and data['data']['message']['id'] == entry['id'] and data['data']['message']['seq'] == entry['seq'])
        status, _, data = a.json(path, method='POST', data={**command, 'body': body + 'changed'}, csrf=True, actor=actors['a'])
        v.check('same key different body is conflict', status == 409 and data['error']['code'] == 'IDEMPOTENCY_CONFLICT')
        status, _, data = b.json(path, method='POST', data={'client_message_id': key, 'body': 'Synthetic C05 HTTP reply B'}, csrf=True, actor=actors['b'])
        created += int(status == 201)
        v.check('same key other sender is independent', status in [200, 201] and data['data']['message']['id'] != entry['id'])
        for suffix, text in [('2', '界' * 4000), ('3', 'Synthetic C05 HTTP uncertain delivery')]:
            payload = {'client_message_id': key[:-1] + suffix, 'body': text}
            status, _, data = a.json(path, method='POST', data=payload, csrf=True, actor=actors['a'])
            created += int(status == 201)
            v.check('bounded Unicode or uncertain delivery persisted', status in [200, 201] and data['data']['message']['body'] == text)
            status, _, data = a.json(path, method='POST', data=payload, csrf=True, actor=actors['a'])
            v.check('explicit original key replay creates nothing', status == 200 and data['data']['replayed'])
        sent = fixture()
        v.check('successful sends exactly match new SQL row count', sent['message_count'] == before['message_count'] + created)
        v.check('send never implicitly reads history', sent['read_state'] == before['read_state'] and sent['native_seen'] == before['native_seen'])
        for role, client in clients.items():
            status, _, data = client.json(path, actor=actors[role]); messages = data['data']['items']
            v.check(role + ' reads persisted literal text', status == 200 and any(m['id'] == entry['id'] and m['body'] == body for m in messages))
            v.check(role + ' history has ordered unique seq', [m['seq'] for m in messages] == sorted(set(m['seq'] for m in messages)))
            status, _, page = client.json(path + '?limit=1', actor=actors[role])
            v.check(role + ' newest page supports history cursor', status == 200 and len(page['data']['items']) == 1 and page['data']['has_more'])
        stage = 'live-authority-and-replay'
        fixture('unfriend')
        status, _, data = a.json(path, actor=actors['a'])
        v.check('unfriend keeps history but disables sends', status == 200 and not data['data']['context']['permissions']['send'])
        status, _, data = a.json(path, method='POST', data=command, csrf=True, actor=actors['a'])
        v.check('replay rechecks current friendship', status == 403 and data['error']['code'] == 'SEND_FORBIDDEN')
        fixture('refriend'); fixture('block')
        for role, client in clients.items():
            status, _, data = client.json(path, method='POST', data=command, csrf=True, actor=actors[role])
            v.check(role + ' blocked pair cannot send or replay', status == 403)
        fixture('unblock')
        status, _, data = a.json(path, method='POST', data=command, csrf=True, actor=actors['a'])
        v.check('current native facts allow original persisted replay', status == 200 and data['data']['replayed'])
        h.control('chat-send-off')
        status, _, data = a.json(path, actor=actors['a'])
        v.check('send disabled preserves read', status == 200 and not data['data']['context']['permissions']['send'])
        status, _, _ = a.json(path, method='POST', data=command, csrf=True, actor=actors['a'])
        v.check('send disabled refuses POST', status == 503)
        h.control('chat-send-on')
        stage = 'takeover-and-old-write'
        h.control('chat-takeover-on')
        for role, client in clients.items():
            status, headers, _ = client.call('/mail/mail/show?id=' + str(conv))
            v.check(role + ' native GET enters replacement', status == 302 and headers.get('Location') == '/matcher/chat/conversations/' + str(conv))
            status, headers, _ = client.call('/mail/mail/show?id=' + str(conv), method='POST', body=b'')
            v.check(role + ' old write neither replays nor redirects', status == 404 and not headers.get('Location'))
            status, _, _ = client.call('/dashboard/dashboard', headers={'Accept': 'text/html'})
            v.check(role + ' ordinary dashboard remains usable', status == 200)
        stage = 'explicit-read'
        status, _, data = b.json(read, method='PUT', data={'read_seq': sent['last_seq']}, csrf=True, actor=actors['b'])
        v.check('separate explicit read advances to real seq', status == 200 and data['data']['read_seq'] == sent['last_seq'] and data['data']['unread_count'] == 0)
    finally:
        failures = []
        for fn in [lambda: fixture('refriend'), lambda: fixture('unblock'), lambda: h.control('chat-send-on'), lambda: h.control('chat-takeover-off')]:
            try: fn()
            except Exception: failures.append('restore')
        h.require(not failures, 'C05 state restore failed.')
    after = fixture()
    v.check('old C04 data preserved', after['legacy_preserved'] and after['legacy_hash'] == before['legacy_hash'])
    v.check('original queue untouched', after['queue_count'] == before['queue_count'])
    v.check('native seen not changed by replacement', after['native_seen'] == before['native_seen'])
    v.check('rejected relation and old-route attempts add no messages', after['message_count'] == before['message_count'] + created)
    report = {'status': 'passed', 'target': v.BASE, 'fixture': 'chat-c05-text-v1', 'http_requests': v.requests,
              'check_count': len(v.checks), 'checks': v.checks, 'new_messages': created, 'fixture_messages': after['message_count'],
              'normal_native_logins': 2, 'legacy_preserved': True, 'queue_preserved': True,
              'synthetic_only': True, 'real_ai_calls': 0, 'credentials_returned': False, 'production_ready': False,
              'limitations': ['Fixed raw relation transitions verify facts, not product friend/block workflow.',
                              'HTTP server is single worker; sequential HTTP retry does not prove SQL race handling.',
                              'No attachments, notifications, friend request API, new direct API, groups or activity discussions.']}
    h.require(not REPORT.is_symlink(), 'Unsafe report path.')
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + chr(10))
    print(json.dumps({k: value for k, value in report.items() if k != 'checks'}, ensure_ascii=False))

if __name__ == '__main__':
    try:
        with h.locked(): run()
    except Exception as error:
        print(json.dumps({'status': 'failed', 'stage': stage, 'reason': str(error) if isinstance(error, h.Refusal) else type(error).__name__, 'requests': v.requests, 'checks': len(v.checks)}, ensure_ascii=False)); sys.exit(1)
