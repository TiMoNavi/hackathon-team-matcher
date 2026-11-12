#!/usr/bin/env python3
"""Two fixed phases prove SQL-backed successful upload rate and staged count limits."""
import json,sys,time
import verify_attachments as s
h,v=s.h,s.v
REPORT=h.BACKEND.parent/'docs/群聊模块升级/sources/c05b-attachments-quota_2026-11-13.json'
def key(i):return 'a15b0000-0000-4000-8000-'+str(i).zfill(12)
def run(mode):
    config=h.runtime_guard();h.database_guard(config);before=s.fixture();h.require(not before['terminal_revocation'],'Quota must precede terminal revoke.')
    private=s.accounts(config);ids=before['synthetic_ids'];conv=ids['conversation_id'];b=s.Client();b.login(private['b']);path='/api/v1/conversations/'+str(conv)+'/attachments';payload=b'Synthetic C05B quota'
    if mode=='fill':
        h.require(not REPORT.exists(),'Quota report already exists; no reset.')
        h.require(not any(r['upload_key'].startswith('a15b') for r in s.probe()['attachments']),'Quota keys already exist.')
        rows=[]
        for i in range(1,21):
            status,_,data=b.upload(path,key(i),'quota.txt',payload);v.check('successful new upload '+str(i),status==201);rows.append(data['data']['attachment']['id'])
        status,head,data=b.upload(path,key(21),'quota.txt',payload);v.check('twenty-first upload limited',status==429 and data['error']['code']=='RATE_LIMITED' and int(head.get('Retry-After','0'))>0)
        status,_,data=b.upload(path,key(1),'quota.txt',payload);v.check('same key replay exempt at rate limit',status==200 and data['data']['attachment']['id']==rows[0])
        return {'status':'pending-staged-check','phase':'fill','rate_limit_proven':True,'earliest_complete':time.time()+61,'attachment_ids':rows,'requests':v.requests,'assertions':len(v.checks),'checks':v.checks,'baseline':before,'credentials_returned':False}
    state=json.loads(REPORT.read_text());h.require(state['status']=='pending-staged-check' and time.time()>=state['earliest_complete'],'Wait for natural 60-second rate window; no timestamp rewriting.')
    expected=set(state['attachment_ids']);observed=[r for r in s.probe()['attachments'] if r['upload_key'].startswith('a15b')]
    v.check('twenty original staging records retained',len(observed)==20 and {r['id'] for r in observed}==expected and all(r['state']=='staged' for r in observed))
    status,head,data=b.upload(path,key(21),'quota.txt',payload);v.check('staged cap persists after rate window',status==429 and data['error']['code']=='RATE_LIMITED' and int(head.get('Retry-After','0'))>60)
    for id in state['attachment_ids']:
        status,_,data=b.json(path+'/'+id,method='DELETE',csrf=True);v.check('owner cancellation allowed despite saturation',status==200 and data['data']['state']=='cancelled')
    status,_,data=b.upload(path,key(21),'quota.txt',payload);v.check('capacity released only after cancellation',status==201);last=data['data']['attachment']['id'];status,_,_=b.json(path+'/'+last,method='DELETE',csrf=True);v.check('new final staging cancelled',status==200)
    rows=[r for r in s.probe()['attachments'] if r['upload_key'].startswith('a15b')];v.check('all quota bytes reclaimed but keys retained',len(rows)==21 and all(r['state']=='cancelled' and r['cleaned'] and not r['bytes_exist'] for r in rows))
    after=s.fixture();base=state['baseline'];v.check('quota does not change messages or old data',after['legacy_hash']==base['legacy_hash'] and after['messages_hash']==base['messages_hash'] and after['queue_count']==base['queue_count'] and after['read_state']==base['read_state'])
    return {'status':'passed','phase':'complete','rate_limit_proven':True,'staged_cap_proven':True,'natural_window_elapsed':True,'successful_uploads':21,'cancelled_and_reclaimed':21,'requests':v.requests+state['requests'],'assertions':len(v.checks)+state['assertions'],'checks':state['checks']+v.checks,'legacy_preserved':True,'credentials_returned':False,'limitations':['Staged count cap tested with small text files, not 100MiB disk exhaustion.']}
if __name__=='__main__':
    h.require(len(sys.argv)==2 and sys.argv[1] in ['fill','complete'],'Fixed phase required.')
    try:
        with h.locked():result=run(sys.argv[1])
    except Exception as e:
        print(json.dumps({'status':'failed','phase':sys.argv[1],'reason':str(e) if isinstance(e,h.Refusal) else type(e).__name__,'requests':v.requests,'assertions':len(v.checks),'credentials_returned':False}));sys.exit(1)
    h.require(not REPORT.is_symlink(),'Report symlink refused.');REPORT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:value for k,value in result.items() if k not in ['checks','baseline','attachment_ids']},ensure_ascii=False))
