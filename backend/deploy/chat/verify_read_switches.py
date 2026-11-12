#!/usr/bin/env python3
"""Exercise fixed UI/API switches while preserving admitted synthetic data."""
import json
import sys
import verify_reading as v
h = v.h
stage = 'guard'
original = None
try:
    config = h.runtime_guard(); h.database_guard(config)
    v.check('owned service', h.owned_server() is not None)
    file = h.RUNTIME / 'c04-fixture.json'; h.checked_path(file, mode=0o600)
    private = json.loads(file.read_text())
    v.check('owned fixture', private['kind'] == 'chat-c04-synthetic-v1' and private['nonce'] == config['nonce'])
    original = h.control('inspect')
    v.check('read switches initially enabled', original['ui_enabled'] and original['chat_read_enabled'] and original['chat_ui_read_enabled'])
    client = v.Client(); client.login(private['actors']['a']); before = v.snapshot()
    actor = before['synthetic_ids']['actors']['a']
    stage = 'ui-off'
    h.control('ui-off')
    status, _, _ = client.call('/matcher/chat'); v.check('UI off hides plugin page', status == 404)
    status, _, data = client.json('/api/v1/conversations', actor=actor); v.check('UI off preserves read API', status == 200 and len(data['data']['items']) == 2)
    status, _, _ = client.call('/mail/mail/index?id=999999'); v.check('UI off preserves native guard', status == 404)
    stage = 'ui-restored'
    h.control('ui-on')
    status, _, body = client.call('/matcher/chat'); parser = v.Meta(); parser.feed(body)
    v.check('UI restored loads read stage', status == 200 and json.loads(parser.bootstrap)['integration_stage'] == 'read')
    stage = 'read-off'
    h.control('chat-read-off')
    status, _, data = client.json('/api/v1/conversations', actor=actor); v.check('API gate off returns unavailable', status == 503 and data['error']['code'] == 'CHAT_DEPENDENCY_UNAVAILABLE')
    status, _, body = client.call('/matcher/chat'); parser = v.Meta(); parser.feed(body)
    v.check('API gate off gives honest shell', status == 200 and json.loads(parser.bootstrap)['integration_stage'] == 'shell')
    status, _, _ = client.call('/mail/mail/index'); v.check('API off retains native guards', status == 404)
    stage = 'read-ui-off'
    h.control('chat-read-on'); h.control('chat-ui-read-off')
    status, _, body = client.call('/matcher/chat'); parser = v.Meta(); parser.feed(body)
    v.check('read UI gate off gives shell', status == 200 and json.loads(parser.bootstrap)['schema_version'] == 1)
    status, _, _ = client.json('/api/v1/conversations',actor=actor); v.check('read UI off preserves API',status == 200)
    h.control('chat-ui-read-on')
    v.check('toggles preserve native and metadata records', v.snapshot() == before)
    report = {'status':'passed','target':v.BASE,'checks':v.checks,'check_count':len(v.checks),'http_requests':v.requests,
        'ui_removed_tested':False,'settings_toggles_only':True,'native_full_rollback':False,
        'note':'Managed users native mail stays denied after UI off; this is not full removable-plugin compatibility.'}
    path = h.BACKEND.parent/'docs/群聊模块升级/sources/c04-read-switches_2026-11-12.json'
    path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:value for k,value in report.items() if k != 'checks'},ensure_ascii=False))
except Exception as exc:
    print(json.dumps({'status':'failed','stage':stage,'reason':str(exc) if isinstance(exc,h.Refusal) else type(exc).__name__,'checks':len(v.checks)})); sys.exitCode = 1
finally:
    if original is not None:
        try:
            h.control('chat-read-on' if original['chat_read_enabled'] else 'chat-read-off')
            h.control('ui-on' if original['ui_enabled'] else 'ui-off')
            h.control('chat-ui-read-on' if original['chat_ui_read_enabled'] else 'chat-ui-read-off')
        except Exception:
            print(json.dumps({'status':'failed','stage':'switch-restore','reason':'Manual fixed-target inspection required.'})); sys.exitCode = 1
if getattr(sys,'exitCode',0): sys.exit(1)
