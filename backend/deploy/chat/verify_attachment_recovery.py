#!/usr/bin/env python3
"""Continue after recorded C05B SQL failure without replaying completed fresh-key cases."""
import json,sys
import verify_attachment_concurrency as c
h,s,v=c.h,c.s,c.v
REPORT=h.BACKEND.parent/'docs/群聊模块升级/sources/c05b-attachments-recovery_2026-11-13.json'
def main():
    h.require(len(sys.argv)==1,'No recovery overrides.');before=s.fixture();previous=json.loads(c.REPORT.read_text())
    h.require(previous['status']=='failed' and previous['stage']=='storage-failure-retry','Recorded pre-fix failure required.')
    prior=[]
    for child in previous['child_transcripts']:
        for line in child['lines']:
            if line.startswith('{'):
                value=json.loads(line)
                if value.get('status')=='passed':prior.append(value)
    h.require({x['mode'] for x in prior}=={'prepare','hold-upload','dedupe-upload','hold-bind','try-cancel','hold-cancel','try-bind','rollback-bind'},'Completed SQL evidence incomplete.')
    results=[]
    try:
        for mode in ['recover-storage-reservation','storage-failure-retry-v2','sql-finalize-failure-retry']:results.append(c.single(mode))
        after=s.fixture();v.check('recovery changes no messages or read state',after['messages_hash']==before['messages_hash'] and after['read_state']==before['read_state'] and after['native_seen']==before['native_seen'])
        v.check('prior data and queue preserved',after['legacy_hash']==before['legacy_hash'] and after['queue_count']==before['queue_count'])
        probe=s.probe();rows={r['upload_key']:r for r in probe['attachments']}
        v.check('three original/new recovery keys safely staged',all(rows['d05b0000-0000-4000-8000-'+str(i).zfill(12)]['state']=='staged' and rows['d05b0000-0000-4000-8000-'+str(i).zfill(12)]['bytes_exist'] for i in [5,6,7]))
        return {'status':'passed','checks':v.checks,'cases':results,'completed_prior_cases':prior,'legacy_preserved':True,'new_messages':0,'credentials_returned':False,'limitations':['Pre-write and pre-finalization SQL failures injected, not an actual lost MySQL commit reply.','Original failed key5 resumed, never deleted or recreated.']}
    finally:
        for child in c.children:
            if child.p.poll() is None:child.p.kill();child.p.wait(timeout=10)
if __name__=='__main__':
    try:
        with h.locked():result=main()
    except Exception as e:result={'status':'failed','reason':str(e) if isinstance(e,h.Refusal) else type(e).__name__,'children':[{'mode':x.mode,'lines':x.lines} for x in c.children],'credentials_returned':False}
    h.require(not REPORT.is_symlink(),'Unsafe recovery report.');REPORT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:value for k,value in result.items() if k not in ['checks','cases','completed_prior_cases','children']},ensure_ascii=False));sys.exit(0 if result['status']=='passed' else 1)
