"""Additional native HTTP lifecycle windows; does not rerun the prior complete suite."""
from harness import *
try:
    mode(history=True,provider=True,platform_reject=False,mutation=None)
    one=Client();one.login(1);rev=one.select(A)
    conv=one.create('event-switch');n=len(calls());revB=one.select(B,rev)
    st,out,_=one.req('/api/v1/recommendation-conversations/'+conv['conversation_id'])
    check(st==409 and len(calls())==n,'cross-request current-event switch rejects old conversation before model',status=st)
    one.select(A,revB)
    st,out,_=one.req('/api/v1/recommendation-conversations/'+conv['conversation_id'])
    check(st==200 and out['data']['applicability']!='current','switching back does not restore old selection context')
    direct=one.create('direct-revoke');st,out,_=one.turn(direct,'direct-revoke-result');check(st==200 and out['data']['execution_status']=='succeeded','prepare real source-backed response')
    direct=out['data'];pool=calls()[-1]['ids'];target=pool[1]
    check('Unselected synthetic participant '+target in direct['message'],'fixture body actually cites unselected sent participant')
    control('revoke',target);n=len(calls());st,out,_=one.turn(direct,'direct-revoke-submit',command='chat',message='Explain the current synthetic result.')
    check(st==200 and out['data']['execution_status']=='failed' and out['data']['applicability']!='current','direct submit rechecks revoked unselected source without prior GET',status=st)
    check(len(calls())==n and 'Unselected synthetic participant' not in json.dumps(out['data']),'revoked source never enters provider or visible history on direct submit')
    before=one.create('before-provider');mode(mutation='revoke_before_respond',target_id=fixture['users']['6']);n=len(calls());st,out,_=one.turn(before,'before-provider');mode(mutation=None)
    check(st==200 and out['data']['execution_status']=='failed' and not out['data']['items'],'permission removal after budget reservation blocks provider response',status=st)
    check(len(calls())-n==1 and calls()[-1]['stage']=='plan','only planning provider ran before candidate authorization failed',provider_calls=len(calls())-n,model_calls_used=out['data']['model_calls_used'])
    beforePause=one.create('pause-before-model');mode(mutation='pause_before_model');n=len(calls());st,out,_=one.turn(beforePause,'pause-before-model');mode(mutation=None)
    check(st==200 and out['data']['execution_status']=='failed' and len(calls())==n,'runtime pause at platform boundary blocks all provider calls',status=st)
    control('enable')
    during=one.create('pause-during-response');mode(mutation='pause_respond');n=len(calls());st,out,_=one.turn(during,'pause-during-response');mode(mutation=None)
    check(st==200 and out['data']['execution_status']=='failed' and not out['data']['items'],'runtime pause inside provider prevents publishing late result',status=st)
    check(len(calls())-n==2,'in-flight pause does not trigger hidden provider retry')
    control('enable');st,out,_=one.req('/api/v1/recommendation-conversations/'+during['conversation_id'])
    check(st==200 and out['data']['applicability']!='current','resume preserves in-flight invalidation')
    report={'status':'passed','checks':checks,'http_responses':responses,'external_model_calls':0}
except Exception as e:report={'status':'failed','checks':checks,'http_responses':responses,'failure_type':type(e).__name__,'failure':str(e)[:200],'external_model_calls':0}
finally:
    mode(mutation=None)
    target=ROOT.parent/'docs/推荐模块/sources'/('backend-host-lifecycle_'+RUN+'.json');target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':report['status'],'passed':sum(x['passed'] for x in checks),'failed':sum(not x['passed'] for x in checks),'evidence':str(target.relative_to(ROOT.parent)),'failure':report.get('failure')},ensure_ascii=False))
