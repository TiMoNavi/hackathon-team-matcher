#!/usr/bin/env python3
"""Terminal owned C05B member revocation after a real locked download."""
import json,sys
import verify_attachment_concurrency as c
s=c.s;h=s.h;v=s.v
REPORT=h.BACKEND.parent/'docs/群聊模块升级/sources/c05b-attachments-revocation_2026-11-13.json'
PROBE=h.HERE/'c05b-revocation.php'
stage='guard'
class Child(c.Child):
    def finish(self):
        line=self.line()
        if line=='':line=self.line()
        h.require(line=='__CHAT_CONTROL_RESULT__','Revocation result marker missing.')
        value=json.loads(self.line());self.p.wait(timeout=25)
        h.require(self.p.returncode==0 and value.get('status')=='passed' and value.get('action')==self.mode,'Fixed revocation probe failed.')
        h.require(not self.buffer.strip() and not self.p.stdout.read(4096).strip() and not self.p.stderr.read(4096).strip(),'Unexpected revocation diagnostics.')
        return value

def run():
    global stage
    h.require(len(sys.argv)==1,'No target overrides.');config=h.runtime_guard();h.database_guard(config);h.checked_path(PROBE);c.PROBE=PROBE
    before=s.fixture();v.check('fresh terminal variant',not before['terminal_revocation'] and before['managed_status']=='active')
    private=s.accounts(config);ids=before['synthetic_ids'];conv=ids['conversation_id'];actors=ids['actors'];a,b=s.Client(),s.Client();a.login(private['a']);b.login(private['b'])
    row=next(r for r in sorted(s.probe()['attachments'],key=lambda r:r['file_id']) if r['state']=='bound' and r['user_id']==actors['a']);base='/api/v1/conversations/'+str(conv);url=base+'/attachments/'+row['id']+'/download'
    status,_,bytes_before=b.binary(url);v.check('old authorized URL works before revoke',status==200)
    cases=[]
    try:
        stage='download-before-revocation';left=Child('hold-download');left.signal('__CHAT_C05_ATTEMPTING__');left.signal('__CHAT_C05_READY__');right=Child('revoke-member');right.signal('__CHAT_C05_ATTEMPTING__');right.waiting();left.release();first=left.finish();second=right.finish();cases.append({'holder':first,'peer':second,'independent_processes':True,'member_delete_waited_for_download':True})
        v.check('authorized locked download completed before member removal',first['locked_download_completed'] and second.get('removed_native_memberships')==1)
        stage='post-revocation';child=Child('denied-download');third=child.finish();cases.append(third);v.check('new read denied after committed removal',third['http_status']==404 and not third['bytes_returned'])
        for who in [a,b]:
            for suffix in ['', '?variant=preview', '?token=synthetic-invalid']:
                status,_,raw=who.binary(url+suffix);v.check('old attachment URL does not return bytes',status in [404,422] and raw!=bytes_before)
            status,_,raw=who.binary(url,method='HEAD');v.check('HEAD cannot obtain old attachment',status==405 and raw==b'')
            status,_,raw=who.binary(url,headers={'Range':'bytes=0-3'});v.check('Range cannot obtain old attachment',status==422 and raw!=bytes_before[:4])
            status,_,_=who.json(base+'/messages');v.check('revoked history denied',status==404)
            status,_,data=who.json('/api/v1/conversations');v.check('revoked conversation removed from list',status==200 and all(item['id']!=conv for item in data['data']['items']))
        status,_,_=a.upload(base+'/attachments','f05b0000-0000-4000-8000-000000000001','revoked.txt',b'Synthetic post revoke');v.check('revoked direct cannot upload',status==404)
        after=s.fixture();v.check('terminal marker and grant durable',after['terminal_revocation'] and after['managed_status']=='revoked')
        v.check('old data messages read states queue retained',after['legacy_hash']==before['legacy_hash'] and after['messages_hash']==before['messages_hash'] and after['read_state']==before['read_state'] and after['queue_count']==before['queue_count'])
        v.check('all native attachment bytes preserved',s.probe()['attachments']==rows_before)
        return {'status':'passed','stage':'complete','database':h.DB,'checks':v.checks,'cases':cases,'requests':v.requests,'assertions':len(v.checks),'legacy_preserved':True,'terminal_revocation':True,'credentials_returned':False,'limitations':['Tests fixed native-table member removal, not native AR side effects or all reverse lock orders.','A download authorized before revocation commits may finish; all requests after committed removal are denied.']}
    finally:
        for child in c.children:
            if child.p.poll() is None:child.p.kill();child.p.wait(timeout=10)

if __name__=='__main__':
    result={}
    try:
        with h.locked():
            rows_before=s.probe()['attachments'];result=run()
    except Exception as e:result={'status':'failed','stage':stage,'reason':str(e) if isinstance(e,h.Refusal) else type(e).__name__,'requests':v.requests,'assertions':len(v.checks),'checks':v.checks,'children':[{'mode':child.mode,'lines':child.lines} for child in c.children],'credentials_returned':False}
    h.require(not REPORT.is_symlink(),'Report symlink refused.');REPORT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:value for k,value in result.items() if k not in ['checks','cases','children']},ensure_ascii=False));sys.exit(0 if result['status']=='passed' else 1)
