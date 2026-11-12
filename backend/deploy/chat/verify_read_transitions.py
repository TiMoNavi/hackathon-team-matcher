#!/usr/bin/env python3
"""Finite append/revoke probes plus real HTTP on the owned synthetic fixture."""
import json
import sys
import verify_reading as v
h=v.h
stage='guard'
try:
    h.require(len(sys.argv)==1,'No transition overrides.')
    with h.locked():
        config=h.runtime_guard();h.database_guard(config)
        v.check('owned server',h.owned_server() is not None)
        file=h.RUNTIME/'c04-fixture.json';h.checked_path(file,mode=0o600);private=json.loads(file.read_text())
        v.check('owned fixture',private['kind']=='chat-c04-synthetic-v1' and private['nonce']==config['nonce'])
        before=v.snapshot();ids=before['synthetic_ids'];actor=ids['actors']['a'];history=ids['conversations']['history'];empty=ids['conversations']['empty']
        client=v.Client();client.login(private['actors']['a'])
        api='/api/v1/conversations';messages=api+'/'+str(history)+'/messages'
        status,_,page=client.json(messages+'?limit=3',actor=actor);v.check('pre-transition history',status==200)
        previous=page['data'];history_cursor=previous['next_cursor']
        status,_,listing=client.json(api+'?limit=1',actor=actor);v.check('pre-transition list cursor',status==200)
        list_cursor=listing['data']['next_cursor'];old_revision=listing['data']['authorization_revision']
        script=h.BACKEND/'protected/modules/matcher-chat/tests/isolated-sql.php'
        def probe(mode):
            result=json.loads(h.run(h.php_command()+[str(script),mode]));v.check('SQL '+mode,result.get('status')=='passed');return result
        stage='append'
        append=probe('append-once');append_replay=probe('append-once')
        v.check('append replay makes no duplicate',append_replay['inserted_entries']==0 and append_replay['native_entries']==8)
        status,_,data=client.json(messages+'?after_seq=7&limit=3',actor=actor)
        v.check('real HTTP sees appended seq8',status==200 and [x['seq'] for x in data['data']['items']]==[8])
        v.check('append retains prior context',data['data']['context']==previous['context'])
        status,_,data=client.json(messages+'?limit=3&cursor='+v.parse.quote(history_cursor),actor=actor)
        v.check('old history cursor survives append',status==200 and [x['seq'] for x in data['data']['items']]==[2,3,4])
        stage='revoke'
        revoked=probe('revoke-empty');replayed=probe('revoke-empty')
        v.check('revoke repeats idempotently',replayed['idempotent_replay'])
        status,_,data=client.json(api+'?limit=1&cursor='+v.parse.quote(list_cursor),actor=actor)
        v.check('real old list cursor invalidated',status==409 and data['error']['code']=='CURSOR_CONTEXT_CHANGED')
        for role in ['a','b']:
            viewer=client
            if role=='b': viewer=v.Client();viewer.login(private['actors']['b'])
            status,_,data=viewer.json(api+'/'+str(empty)+'/messages',actor=ids['actors'][role])
            v.check(role+' revoked empty HTTP denied',status==404)
            status,_,body=viewer.call('/mail/mail/show?id='+str(empty))
            v.check(role+' native preserved member cannot reopen revoked chat',status==404 and 'Synthetic C04' not in body)
        status,_,data=client.json(api,actor=actor)
        v.check('list drops revoked empty and advances revision',status==200 and [x['id'] for x in data['data']['items']]==[history] and data['data']['authorization_revision']>old_revision)
        after=v.snapshot()
        v.check('native membership and seen retained',after['native_seen']==before['native_seen'])
        v.check('transition does not alter read states',after['read_state']==before['read_state'])
        v.check('revoked metadata remains after HTTP',any(int(x['message_id'])==empty and x['status']=='revoked' for x in after['metadata']))
        snapshot=probe('snapshot')
        report={'status':'passed','target':v.BASE,'http_requests':v.requests,'checks':v.checks,'check_count':len(v.checks),
            'append':append,'append_replay':append_replay,'revoke':revoked,'revoke_replay':replayed,'snapshot':snapshot,
            'send_api_tested':False,'automatic_native_revocation_tested':False,'concurrent_revocation_tested':False,
            'fixture_preserved':True,'note':'Only explicit metadata revoke and fixed synthetic native append; no real social send or member transition.'}
        (h.BACKEND.parent/'docs/群聊模块升级/sources/c04-read-transitions_2026-11-12.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({k:value for k,value in report.items() if k not in ['checks','append','append_replay','revoke','revoke_replay','snapshot']}))
except Exception as exc:
    print(json.dumps({'status':'failed','stage':stage,'reason':str(exc) if isinstance(exc,h.Refusal) else type(exc).__name__,'checks':len(v.checks)}));sys.exit(1)
