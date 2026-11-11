#!/usr/bin/env python3
"""Independent SQL races beyond the primary HTTP happy path; synthetic materials only."""
import json
import subprocess
import time
import s6_audit_http as h

def job(client,operation,session,batch=None):
    body={'generation_mode':'ai','session_id':session['id'],'expected_version':session['version']}
    if batch is not None:body['expected_batch_version']=batch['version']
    return client.data('POST',operation,body,expected=(202,))

def setup_questions(client,space):
    session=client.data('POST',h.sessions,{'space_id':space});draft=session['input_drafts']['global']
    client.data('PUT','/api/v1/me/profile/drafts/'+draft['id'],{'expected_version':draft['draft_version'],'fields':[{'key':'skill','value':{'code':'python','label':'Python'},'visibility':'authenticated'},{'key':'contact_email','value':'audit-private@example.invalid','visibility':'authenticated'}]})
    session=h.current(client,session);session=h.transition(client,session,'move',stage='review');session=h.transition(client,session,'review_confirm',confirmation_intent='confirm',draft_versions=h.versions(session,'input_drafts'))
    qjob=job(client,h.questions,session);h.check('race_questions_worker_succeeds',h.worker(qjob)['execution_status']=='succeeded');session=h.current(client,session);batch=session['question_batch']
    for question in batch['questions']:
        body={'expected_version':0,'answer_type':'skipped'}
        if question['target_key'] in ('role','event_goal'):body={'expected_version':0,'answer_type':'options','selected_options':[question['options'][0]['code']]}
        batch=client.data('PUT',h.questions+'/'+batch['id']+'/answers/'+question['id'],body)
    return session,batch,qjob

def run():
    started_calls=h.cli('journal')['entered']
    owner=h.Client(h.fixture['users']['owner']);other=h.Client(h.fixture['users']['viewer']);s,b,qjob=setup_questions(owner,h.fixture['spaces'][0]);role=next(q for q in b['questions'] if q['target_key']=='role');answer=next(a for a in b['answers'] if a['question_id']==role['id'])
    j=job(owner,h.syntheses,s,b);updated=[]
    def change_answer():updated.append(owner.data('PUT',h.questions+'/'+b['id']+'/answers/'+role['id'],{'expected_version':answer['version'],'answer_type':'free_text','free_text':'本人修改后的角色'}))
    late=h.delayed(j,change_answer)
    h.check('answer_change_blocks_late_compose',late['applicability']=='superseded' and late['result'] is None)
    s=h.current(owner,s);h.check('superseded_compose_creates_no_drafts',s['output_drafts']['global'] is None and s['output_drafts']['space'] is None)
    b=updated[0];j=job(owner,h.syntheses,s,b);done=h.worker(j);h.check('new_answer_snapshot_can_compose',done['execution_status']=='succeeded');s=h.current(owner,s)
    h.check('new_answer_value_reaches_draft',any(x['key']=='role' and x['value']['label']=='本人修改后的角色' for x in s['output_drafts']['global']['preview_attributes']))
    # Preserve an unconfirmed manual draft across explicit recomposition.
    draft=s['output_drafts']['global'];headline=next(x for x in draft['preview_attributes'] if x['key']=='headline')
    owner.data('PUT','/api/v1/me/profile/drafts/'+draft['id'],{'expected_version':draft['draft_version'],'fields':[{'attribute_id':headline['attribute_id'],'key':'headline','value':'尚未确认的本人修改','visibility':'private'}]});s=h.current(owner,s)
    j=job(owner,h.syntheses,s,b);done=h.worker(j);h.check('recompose_with_manual_draft_succeeds',done['execution_status']=='succeeded');s=h.current(owner,s);kept=next(x for x in s['output_drafts']['global']['preview_attributes'] if x['key']=='headline')
    h.check('recompose_preserves_unconfirmed_manual_text_and_scope',kept['value']=='尚未确认的本人修改' and kept['visibility']=='private')
    h.check('draft_conflict_returned_for_manual_resolution',any(x['kind']=='conflict' and 'headline' in x['field_keys'] for x in done['result']['review_items']))
    # Completed job becomes inapplicable after a confirmed scope revision, without model work.
    profile=owner.data('GET','/api/v1/me/profile');contact=next(x for x in profile['attributes'] if x['key']=='contact_email');before=h.cli('journal')['entered']
    owner.data('PATCH','/api/v1/me/profile/visibility',{'expected_version':profile['revision'],'confirmation_intent':'confirm','changes':[{'attribute_id':contact['attribute_id'],'visibility':'private'}]})
    stale=owner.data('GET',h.jobs+'/'+j['job_id']);h.check('privacy_change_invalidates_completed_job',stale['execution_status']=='succeeded' and stale['applicability']=='superseded' and stale['result'] is None)
    h.check('privacy_change_and_reads_do_not_call_model',h.cli('journal')['entered']==before)
    h.check('old_question_batch_blocked_after_privacy_change',owner.call('GET',h.questions+'/'+b['id'])[0]==409)
    s=h.current(owner,s);h.check('stale_session_still_readable_for_reconcile',s['id'] is not None)
    # Source refresh invalidates both running and already successful extraction tasks.
    s=other.data('POST',h.sessions,{'space_id':h.fixture['spaces'][0]});source=other.data('POST',h.sources,{'kind':'text','text':'城市：杭州。技能：Python。','label':'独立刷新竞态','ownership':'self'})
    completed=h.submit_extract(other,s,source);h.worker(completed);running=h.submit_extract(other,s,source);refreshed=[]
    h.check('text_refresh_cannot_change_source_identity',other.call('POST',h.sources+'/'+source['id']+'/refresh',{'expected_version':source['version'],'text':'不同的合成资料','label':'独立刷新竞态','ownership':'self'})[0]==409)
    def refresh():refreshed.append(other.data('POST',h.sources+'/'+source['id']+'/refresh',{'expected_version':source['version'],'text':'城市：杭州。技能：Python。','label':'独立刷新竞态','ownership':'self'}))
    late=h.delayed(running,refresh)
    h.check('source_refresh_supersedes_running_job',late['applicability']=='superseded' and late['result'] is None)
    stale=other.data('GET',h.jobs+'/'+completed['job_id']);h.check('source_refresh_supersedes_completed_job',stale['applicability']=='superseded' and stale['result'] is None)
    source=refreshed[0];j=h.submit_extract(other,s,source)
    def expire_read():h.cli('age-running',j['job_id']);expired=other.data('GET',h.jobs+'/'+j['job_id']);h.check('sql_get_recovers_expired_running_job',expired['execution_status']=='failed' and expired['error_code']=='AI_WORKER_INTERRUPTED' and expired['metrics']['llm_calls'] is None and expired['metrics']['accounting_complete'] is False)
    late=h.delayed(j,expire_read)
    h.check('sql_late_worker_only_backfills_usage',late['execution_status']=='failed' and late['result'] is None and late['metrics']['llm_calls']==1 and late['metrics']['accounting_complete'])
    retry=other.data('POST',h.jobs+'/'+j['job_id']+'/retry',{},expected=(202,));h.check('sql_expired_job_explicit_retry_succeeds',h.worker(retry)['execution_status']=='succeeded')
    # Simulate a dead worker then exercise the actual idle watch loop.
    idle=h.submit_extract(other,s,source);h.cli('age-running',idle['job_id']);before=h.cli('journal')['entered'];process=subprocess.Popen(h.php+[str(h.driver),h.db,'watch',''],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    try:
        deadline=time.time()+5;found=None
        while time.time()<deadline:
            found=next(x for x in h.cli('inspect',h.fixture['users']['viewer'])['jobs'] if x['id']==idle['job_id'])
            if found['execution_status']=='failed':break
            time.sleep(.05)
        h.check('actual_idle_watch_recovers_expired_sql_job',found['execution_status']=='failed' and process.poll() is None)
    finally:process.terminate();stdout,stderr=process.communicate(timeout=5)
    h.check('idle_watch_recovery_zero_model_calls',h.cli('journal')['entered']==before)
    unknown=h.submit_extract(other,s,source);process=subprocess.run(h.php+[str(h.driver),h.db,'run','','unknown'],capture_output=True,text=True,timeout=10);rows=[json.loads(line) for line in process.stdout.splitlines() if line.startswith('{')];row=next(x for x in rows if x.get('job_id')==unknown['job_id'])
    h.check('actual_worker_log_keeps_unknown_accounting',process.returncode==0 and row['llm_calls'] is None and row.get('accounting_complete') is False)
    h.check('unknown_worker_error_is_sanitized','AUDIT_PRIVATE_ENGINE_FAILURE' not in process.stdout+process.stderr)
    stored=other.data('GET',h.jobs+'/'+unknown['job_id']);h.check('unknown_worker_state_is_explicit',stored['execution_status']=='failed' and stored['error_code']=='AI_EXECUTION_FAILED' and stored['metrics']['llm_calls'] is None)
    h.check('all_race_model_boundaries_outside_sql_transaction',h.cli('journal')['active_transactions']==0)
    journal=h.cli('journal')
    return {'status':'passed','passed':len(h.checks),'checks':h.checks,'http_requests':h.requests,'real_llm_calls':0,'synthetic_engine_calls':journal['entered']-started_calls,'model_boundary_cumulative':journal,'worker_unknown_log':row,'scope':'Actual HTTP/SQL answer/privacy/source races, real idle watch recovery and CLI unknown accounting with synthetic engines'}

try:print(json.dumps(run(),ensure_ascii=False,indent=2))
except Exception as error:print(json.dumps({'status':'failed','passed':sum(x['passed'] for x in h.checks),'checks':h.checks,'http_requests':h.requests,'error':str(error)},ensure_ascii=False,indent=2));raise SystemExit(1)
