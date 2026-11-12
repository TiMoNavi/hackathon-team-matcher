#!/usr/bin/env python3
"""Actual native meta-search POST boundary; synthetic fixed target only."""
import json
import sys
import verify_reading as v
h = v.h
stage = 'guard'
try:
    config = h.runtime_guard(); h.database_guard(config)
    v.check('owned service', h.owned_server() is not None)
    file = h.RUNTIME / 'c04-fixture.json'; h.checked_path(file, mode=0o600)
    private = json.loads(file.read_text())
    v.check('owned fixture', private['kind'] == 'chat-c04-synthetic-v1' and private['nonce'] == config['nonce'])
    client = v.Client(); client.login(private['actors']['a'])
    baseline = v.snapshot()
    native = 'humhub\\modules\\mail\\search\\SearchProvider'
    disguised = '/meta-search/index?provider='+v.parse.quote('humhub\\modules\\space\\search\\SearchProvider')
    stage = 'canonical-and-case-variants'
    for index, provider in enumerate([native, native.lower(), native.upper(), '\\'+native, '\\'+native.lower(), 'humhub\\modules\\mail\\search\\sEaRcHpRoViDeR']):
        body = v.parse.urlencode({'provider':provider,'keyword':'Synthetic','route':'/mail/mail/index'}).encode()
        status, _, raw = client.call('/meta-search/index',method='POST',body=body,headers={'Content-Type':'application/x-www-form-urlencoded','X-CSRF-Token':client.csrf})
        v.check('native provider case denied '+str(index),status == 404 and 'Synthetic C04 message' not in raw)
    stage = 'query-shadow-and-body-types'
    for payload in [{'provider[]':native},{'keyword':'Synthetic'},{'provider':'','keyword':'Synthetic'}]:
        status, _, raw = client.call(disguised,method='POST',body=v.parse.urlencode(payload).encode(),headers={'Content-Type':'application/x-www-form-urlencoded','X-CSRF-Token':client.csrf})
        v.check('query fallback refused '+str(len(v.checks)),status == 404 and 'Synthetic C04 message' not in raw)
    status, _, raw = client.call(disguised,method='POST',body=json.dumps({'provider':native.lower(),'keyword':'Synthetic'}).encode(),headers={'Content-Type':'application/json','X-CSRF-Token':client.csrf})
    v.check('JSON body cannot shadow query',status == 404 and 'Synthetic C04 message' not in raw)
    boundary='chat-c04-synthetic-multipart'
    body=('--'+boundary+'\r\nContent-Disposition: form-data; name="provider"\r\n\r\n'+native.lower()+'\r\n--'+boundary+'--\r\n').encode()
    status, _, raw = client.call(disguised,method='POST',body=body,headers={'Content-Type':'multipart/form-data; boundary='+boundary,'X-CSRF-Token':client.csrf})
    v.check('multipart body cannot shadow query',status == 404 and 'Synthetic C04 message' not in raw)
    stage='unmanaged-control'
    outsider=v.Client(); outsider.login(private['actors']['outsider'])
    status, _, raw=outsider.call('/meta-search/index',method='POST',body=v.parse.urlencode({'provider':native,'keyword':'ChatC04NoMatch','route':'/mail/mail/index'}).encode(),headers={'Content-Type':'application/x-www-form-urlencoded','X-CSRF-Token':outsider.csrf})
    v.check('unmanaged native provider actually dispatched',status == 200 and 'Synthetic C04 message' not in raw)
    v.check('search preserves persisted chat state',v.snapshot() == baseline)
    report={'status':'passed','target':v.BASE,'http_requests':v.requests,'check_count':len(v.checks),'checks':v.checks,
        'real_post_csrf':True,'query_only_get_not_counted_as_search':True,'synthetic_only':True,'secrets_returned':False,
        'limitation':'Unmanaged native search control uses a no-match term. Matching its synthetic empty conversation returned 503 in a separate diagnostic; native empty-conversation search compatibility remains unresolved.'}
    (h.BACKEND.parent/'docs/群聊模块升级/sources/c04-native-search_2026-11-12.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:value for k,value in report.items() if k != 'checks'}))
except Exception as exc:
    print(json.dumps({'status':'failed','stage':stage,'reason':str(exc) if isinstance(exc,h.Refusal) else type(exc).__name__,'http_requests':v.requests}));sys.exit(1)
