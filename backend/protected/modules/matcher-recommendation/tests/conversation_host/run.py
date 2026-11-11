from harness import *
try:
    initial=control('status');check(initial['users']==28,'isolated dataset contains exactly 28 fictional users')
    if initial['runtime']['enabled']:control('pause')
    mode(history=False,provider=True,platform_reject=False,mutation=None)
    anonymous=Client();st,_,_=anonymous.req(f'/api/v1/events/{A}/recommendation-conversations','POST',{},'anonymous');check(st==401,'anonymous rejected before model',status=st)
    one=Client();one.login(1);rev=one.select(A)
    start=len(calls())
    st,out,h=one.req(f'/api/v1/events/{A}/recommendation-conversations','POST',{},'disabled')
    check(st==503 and out['error']['details']['reason']=='disabled','persistent switch disabled returns 503',status=st)
    check('no-store' in h.get('Cache-Control',''),'response is private no-store')
    control('enable')
    st,out,_=one.req(f'/api/v1/events/{A}/recommendation-conversations','POST',{},'native-history')
    check(st==503 and out['error']['details']['reason']=='history_unavailable','native missing authoritative history returns 503',status=st)
    check(len(calls())==start,'disabled and native history failure use zero model calls')
    mode(history=True);control('allowance',500)
    st,_,_=one.req(f'/api/v1/events/{A}/recommendation-conversations','POST',{},'csrf',csrf=False);check(st==400,'write without CSRF rejected',status=st)
    st,_,_=one.req(f'/api/v1/events/{A}/recommendation-conversations?viewer_id=2','POST',{},'query');check(st==400,'extra query viewer rejected',status=st)
    st,_,_=one.req(f'/api/v1/events/{A}/recommendation-conversations','POST',{'viewer_id':2},'body');check(st==400,'extra body viewer rejected',status=st)
    st,_,_=one.req(f'/api/v1/events/{B}/recommendation-conversations','POST',{},'cross');check(st==409,'member of two events cannot use noncurrent event',status=st)
    two=Client();two.login(2);two.select(A)
    st,_,_=two.req(f'/api/v1/events/{B}/recommendation-conversations','POST',{},'nonmember');check(st in (403,409),'nonmember cannot use other event',status=st)
    conv=one.create('main');cid=conv['conversation_id'];path='/api/v1/recommendation-conversations/'+cid
    st,out,_=one.req(f'/api/v1/events/{A}/recommendation-conversations','POST',{},'main');check(st==201 and out['data']['conversation_id']==cid,'create idempotency persists across requests')
    st,_,_=two.req(path);check(st==404,'another authenticated owner cannot read conversation',status=st)
    st,out,_=one.req(path);check(st==200 and out['data']['version']==conv['version'],'conversation restores on independent HTTP request')
    callStart=len(calls());st,out,_=one.turn(conv,'turn-main');check(st==200,'turn HTTP returns view',status=st,error=out.get('error'))
    current=out['data'];check(current['execution_status']=='succeeded' and len(current['items'])==1,'real adapters produce synthetic provider result',view=current)
    currentCalls=len(calls());check(currentCalls-callStart==2,'successful recommendation uses exactly plan and response')
    pool=calls()[-1]['ids'];check(len(pool)>=10,'actual model candidate pool populated',candidate_ids=pool)
    check(not({str(fixture['users'][str(i)]) for i in [1,22,23,24,25,26,27,28]} & set(pool)),'pool excludes self friend history private friends draft blocked and other-event',candidate_ids=pool)
    st,out,_=one.turn(conv,'turn-main');check(st==200 and out['data']['version']==current['version'] and len(calls())==currentCalls,'turn replay same key has no model call')
    st,out,_=one.turn(conv,'turn-main',message='Changed request');check(st==409 and out['error']['code']=='IDEMPOTENCY_CONFLICT','same turn key altered body conflicts',status=st)
    st,_,_=one.turn(conv,'stale-turn');check(st==409,'stale conversation version rejects before model',status=st)
    confirmPath=path+'/requirements/confirm'
    confirm={'expected_version':current['version'],'requirements_version':current['requirements_version'],'confirmation_intent':'replace_complete_requirements','message':'Confirm a synthetic topic.','command':'refresh','conditions':[{'feature':'topics','operator':'similarity','value':['social'],'strength':'soft'}]}
    bad=dict(confirm);bad['requirements_version']+=1
    st,_,_=one.req(confirmPath,'POST',bad,'confirm-stale');check(st==409,'stale requirement version rejected',status=st)
    bad=json.loads(json.dumps(confirm));bad['conditions'][0]['origin']='user_confirmed'
    st,_,_=one.req(confirmPath,'POST',bad,'confirm-origin');check(st==400,'client cannot forge origin',status=st)
    st,out,_=one.req(confirmPath,'POST',confirm,'confirm-good');check(st==200 and out['data']['execution_status']=='succeeded','trusted HTTP confirmation succeeds',status=st,error=out.get('error'))
    confirmed=out['data'];n=len(calls());st,out,_=one.req(confirmPath,'POST',confirm,'confirm-good');check(st==200 and len(calls())==n,'confirm idempotency has no repeat model')
    check(confirmed['confirmed_conditions']==confirm['conditions'],'confirmed complete snapshot is exposed without internal origin')
    # Revoke an actual sent but unselected person via P1 public workflow, then GET must clear text.
    latestPool=calls()[-1]['ids'];chosen={x['id'] for x in confirmed['items']};unselected=next(x for x in latestPool if x not in chosen)
    control('revoke',unselected);n=len(calls());st,out,_=one.req(path)
    check(st==200 and out['data']['applicability']!='current' and not out['data']['items'] and 'Unselected synthetic participant' not in json.dumps(out['data']),'unselected sent candidate revocation invalidates response',status=st,view=out.get('data'))
    check(len(calls())==n,'revocation read never reruns model')
    # A removal during provider response must be caught by post-model authorization.
    concurrent=one.create('during-revoke');mode(mutation='revoke_respond');st,out,_=one.turn(concurrent,'during-revoke');mode(mutation=None)
    check(st==200 and out['data']['execution_status']=='failed' and not out['data']['items'],'post-model candidate revoke blocks publication',status=st,view=out.get('data'))
    # Host platform denial burns local reservation but never invokes provider.
    host=one.create('platform-deny');mode(platform_reject=True);n=len(calls());before=control('status')['budget']['reserved'];st,out,_=one.turn(host,'platform-deny');mode(platform_reject=False)
    check(st==200 and out['data']['execution_status']=='failed' and out['data']['error']['code']=='AI_BUDGET_EXCEEDED','platform denial reported as failed turn',status=st)
    check(len(calls())==n and control('status')['budget']['reserved']==before+1,'platform denial has zero model and conservative durable reservation')
    # Persistent lifecycle revisions invalidate old sessions after pause/resume.
    old=one.create('old-runtime');control('pause');st,out,_=one.req('/api/v1/recommendation-conversations/'+old['conversation_id']);check(st==503,'pause blocks old conversation read',status=st)
    control('enable');st,out,_=one.req('/api/v1/recommendation-conversations/'+old['conversation_id']);check(st==200 and out['data']['applicability']!='current','resume never revives old conversation')
    missing=one.create('missing-provider');mode(provider=False);st,out,_=one.req('/api/v1/recommendation-conversations/'+missing['conversation_id']);check(st==503 and out['error']['details']['reason']=='provider_unconfigured','unconfigured provider fails closed')
    mode(provider=True);control('disable-ai');n=len(calls());st,out,_=one.req(f'/api/v1/events/{A}/discovery');check(st==200,'ordinary discovery remains usable with AI disabled',status=st,error=out.get('error'))
    check(len(calls())==n,'AI-disabled ordinary discovery uses zero model')
    control('enable-ai');control('enable');st,out,_=one.req('/api/v1/recommendation-conversations/'+missing['conversation_id']);check(st==200 and out['data']['applicability']!='current','native AI disable/re-enable never revives old conversation')
    report={'status':'passed','run':RUN,'checks':checks,'http_responses':responses,'synthetic_model_calls':len(calls())-start,'external_model_calls':0,'initial':initial,'final':control('status')}
except Exception as e:
    report={'status':'failed','run':RUN,'checks':checks,'http_responses':responses,'failure_type':type(e).__name__,'failure':str(e)[:250],'external_model_calls':0}
finally:
    target=ROOT.parent/'docs/推荐模块/sources'/('backend-host-http_'+RUN+'.json')
    target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':report['status'],'passed':sum(x['passed'] for x in checks),'failed':sum(not x['passed'] for x in checks),'evidence':str(target.relative_to(ROOT.parent)),'failure':report.get('failure')},ensure_ascii=False))
