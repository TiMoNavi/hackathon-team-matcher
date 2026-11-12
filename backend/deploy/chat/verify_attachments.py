#!/usr/bin/env python3
"""Fixed C05B native login, multipart upload and authorized attachment exercise."""
import hashlib
import base64
import json
import sys
from urllib import request,error,parse
import verify_reading as v
h=v.h
REPORT=h.BACKEND.parent/'docs/群聊模块升级/sources/c05b-attachments-http_2026-11-13.json'
stage='guard'

def fixture(action='snapshot'):
    h.require(action in ['snapshot','unfriend','refriend','block','unblock'], 'Fixed C05B action required.')
    return h.parse_control_output(h.run(h.php_command()+[str(h.HERE/'c05b-fixture.php'),action]),action)

def probe(action='snapshot'):
    h.require(action in ['snapshot','expire-fixed','cleanup','native-veto'], 'Fixed attachment probe action.')
    return h.parse_control_output(h.run(h.php_command()+[str(h.HERE/'c05b-attachment-probe.php'),action]),action)

def accounts(config):
    p=h.RUNTIME/'c05b-fixture.json';h.checked_path(p,mode=0o600);data=json.loads(p.read_text())
    h.require(data['kind']=='chat-c05b-attachment-v1' and data['nonce']==config['nonce'] and set(data['actors'])=={'a','b','outsider'},'C05B private provenance mismatch.')
    return data['actors']

class Client(v.Client):
    def binary(self,path,*,method='GET',body=None,headers=None):
        url=parse.urljoin(v.BASE,path)
        v.check('attachment same origin',parse.urlsplit(url).netloc=='127.0.0.1:8124' and parse.urlsplit(url).scheme=='http')
        req=request.Request(url,data=body,method=method,headers={'Accept':'application/json',**(headers or {})});v.requests+=1
        try: response=self.opener.open(req,timeout=30)
        except error.HTTPError as e: response=e
        with response:
            raw=response.read(6_000_001);v.check('bounded attachment response',len(raw)<=6_000_000)
            return response.status,response.headers,raw
    def upload(self,path,key,name,content,mime='text/plain',*,actor=None,csrf=True,extra=None,headers=None):
        boundary='chat-c05b-fixed-multipart-boundary'
        fields={'client_upload_id':key,**(extra or {})};parts=[]
        for k,value in fields.items(): parts.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="'+k+'"\r\n\r\n'+value+'\r\n').encode())
        parts.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="'+name+'"\r\nContent-Type: '+mime+'\r\n\r\n').encode()+content+b'\r\n')
        parts.append(('--'+boundary+'--\r\n').encode())
        hdr={'Content-Type':'multipart/form-data; boundary='+boundary,**(headers or {})}
        if actor is not None:hdr['X-Matcher-Chat-Actor']=str(actor)
        if csrf:hdr['X-CSRF-Token']=self.csrf
        status,head,body=self.binary(path,method='POST',body=b''.join(parts),headers=hdr)
        try: data=json.loads(body)
        except ValueError:raise h.Refusal('Upload must return JSON.')
        return status,head,data

def upload_id(data):
    return data['data']['attachment']['id']

def run():
    global stage
    h.require(len(sys.argv)==1,'No target overrides.')
    config=h.runtime_guard();h.database_guard(config)
    v.check('owned 8124 server',h.owned_server() is not None)
    initial=h.control('inspect');v.check('attachment gates ready',all(initial.get(k) for k in ['ui_enabled','chat_read_enabled','chat_ui_read_enabled','chat_send_enabled','chat_attachments_enabled']) and not initial['chat_entry_takeover_enabled'])
    before=fixture();ids=before['synthetic_ids'];actors=ids['actors'];conv=ids['conversation_id']
    v.check('new fixture friends and no block',before['friendship_rows']==2 and before['blocked_rows']==0)
    private=accounts(config);clients={}
    for role in ['a','b','outsider']:clients[role]=Client();clients[role].login(private[role])
    a,b,o=clients['a'],clients['b'],clients['outsider'];path='/api/v1/conversations/'+str(conv);uploads=path+'/attachments';messages=path+'/messages'
    def key(n):return 'a05b0000-0000-4000-8000-'+str(n).zfill(12)
    def msgkey(n):return 'b05b0000-0000-4000-8000-'+str(n).zfill(12)
    payload='Synthetic C05B attachment 中文🙂\n'.encode();created=0
    try:
        stage='auth-and-input'
        status,_,data=a.json(messages,actor=actors['a']);cap=data['data']['context']['attachments']
        v.check('truthful attachment capability',status==200 and cap['upload_enabled'] and cap['download_enabled'] and cap['max_file_bytes']==5242880 and cap['max_files_per_message']==3 and cap['staging_ttl_seconds']==86400)
        for label,client,options,expected in [('guest',Client(),{'csrf':False},401),('csrf',a,{'csrf':False},400),('actor',a,{'actor':actors['b']},401),('origin',a,{'headers':{'Origin':'https://example.invalid'}},403),('outsider',o,{},404)]:
            status,_,_=client.upload(uploads,key(1),'synthetic.txt',payload,**options);v.check(label+' upload refused',status==expected)
        for label,name,content,mime,extra in [('fake image','fake.png',b'<html>not png</html>','image/png',None),('bad utf8','bad.txt',b'\xff\xfe\x00','text/plain',None),('empty','empty.txt',b'','text/plain',None),('extra field','valid.txt',payload,'text/plain',{'owner_id':str(actors['b'])}),('oversize','big.txt',b'x'*5242881,'text/plain',None)]:
            status,_,_=a.upload(uploads,key(2),name,content,mime,extra=extra);v.check(label+' refused',status in [400,413,415,422])
        status,_,data=a.json(messages,method='POST',csrf=True,data={'client_message_id':msgkey(6),'body':'Synthetic null attachment field','attachment_ids':None})
        v.check('explicit null attachment array rejected',status==422 and data['error']['code']=='INVALID_ATTACHMENT_IDS')
        stage='upload-and-replay'
        status,_,data=a.upload(uploads,key(3),'synthetic.txt',payload,actor=actors['a']);v.check('real upload accepted',status in [200,201]);attachment=upload_id(data)
        status,_,replayed=a.upload(uploads,key(3),'synthetic.txt',payload);v.check('same upload replays same ID',status==200 and upload_id(replayed)==attachment)
        for name,content in [('changed.txt',payload),('synthetic.txt',payload+b'x')]:
            status,_,_=a.upload(uploads,key(3),name,content);v.check('different upload payload conflict',status==409)
        download=uploads+'/'+attachment+'/download'
        current=next(item for item in probe()['attachments'] if item['id']==attachment)
        if current['state']=='staged':
            status,_,_=b.binary(download);v.check('peer cannot read staging',status in [403,404])
        else:v.check('prior committed attachment preserved for replay',current['state']=='bound')
        status,_,_=b.json(uploads+'/'+attachment,method='DELETE',csrf=True);v.check('peer cannot cancel staging',status in [403,404])
        status,_,_=b.json(messages,method='POST',csrf=True,data={'client_message_id':msgkey(1),'body':'forged binding','attachment_ids':[attachment]});v.check('peer cannot bind other owner',status in [403,404,409])
        stage='send-and-download'
        command={'client_message_id':msgkey(2),'body':'Synthetic C05B HTTP attachment','attachment_ids':[attachment]}
        status,_,data=a.json(messages,method='POST',csrf=True,data=command);v.check('attachment message committed',status in [200,201]);created+=status==201;message=data['data']['message']
        v.check('bound attachment projected',len(message['attachments'])==1 and message['attachments'][0]['id']==attachment and message['attachments'][0]['download_path']==download)
        status,_,replay=a.json(messages,method='POST',csrf=True,data=command);v.check('same message key permanent replay',status==200 and replay['data']['message']['id']==message['id'])
        status,_,_=a.json(messages,method='POST',csrf=True,data={**command,'attachment_ids':[]});v.check('same message key different attachment conflict',status==409)
        status,_,_=a.json(messages,method='POST',csrf=True,data={**command,'client_message_id':msgkey(3)});v.check('bound file cannot be rebound',status==409)
        status,head,body=b.binary(download);v.check('peer authorized bytes match',status==200 and body==payload)
        v.check('forced private safe download',head.get('Content-Disposition','').lower().startswith('attachment;') and 'no-store' in head.get('Cache-Control','') and head.get('X-Content-Type-Options')=='nosniff')
        for who in [Client(),o]:
            status,_,_=who.binary(download);v.check('unauthorized download refused',status in [401,403,404])
        status,_,_=b.binary(download,headers={'Range':'bytes=0-3'});v.check('range rejected',status in [400,416,422])
        status,_,_=a.json(uploads+'/'+attachment,method='DELETE',csrf=True);v.check('bound cancellation conflict',status==409)
        stage='cancel-and-pure-attachment'
        status,_,data=a.upload(uploads,key(4),'cancel.txt',payload)
        if status==410:
            old=next(item for item in probe()['attachments'] if item['upload_key']==key(4));v.check('prior cancelled receipt retained',old['state']=='cancelled');cancel=old['id']
        else:cancel=upload_id(data)
        for _ in range(2):
            status,_,data=a.json(uploads+'/'+cancel,method='DELETE',csrf=True);v.check('cancel is idempotent',status==200 and data['data']['state']=='cancelled')
        status,_,_=a.upload(uploads,key(4),'cancel.txt',payload);v.check('cancelled upload key cannot resurrect',status in [409,410])
        status,_,data=b.upload(uploads,key(5),'only.txt',payload);pure=upload_id(data)
        command2={'client_message_id':msgkey(4),'body':'','attachment_ids':[pure]}
        status,_,data=b.json(messages,method='POST',csrf=True,data=command2);v.check('pure attachment is explicit variant',status in [200,201] and data['data']['message']['kind']=='attachment' and data['data']['message']['body'] is None);created+=status==201
        stage='exact-limits-and-types'
        maximum=b'x'*5242880
        status,_,data=a.upload(uploads,key(8),'maximum.txt',maximum)
        if status==410:
            old=next(item for item in probe()['attachments'] if item['upload_key']==key(8));v.check('prior exact 5MiB receipt retained',old['state']=='cancelled' and old['size']==5242880);maximum_id=old['id']
        else:
            v.check('exact 5MiB accepted',status in [200,201] and data['data']['attachment']['size']==5242880);maximum_id=upload_id(data)
        status,_,_=a.json(uploads+'/'+maximum_id,method='DELETE',csrf=True);v.check('maximum staging can cancel',status==200)
        valid_files=[('tiny.png',base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII='),'image/png'),('sample.pdf',b'%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n','application/pdf'),('third.txt',payload,'text/plain')]
        batch=[]
        for offset,(name,content,mime) in enumerate(valid_files,9):
            status,_,data=a.upload(uploads,key(offset),name,content,mime);v.check('allowed detected type accepted',status in [200,201] and data['data']['attachment']['mime']==mime);batch.append(upload_id(data))
        status,_,_=a.json(messages,method='POST',csrf=True,data={'client_message_id':msgkey(5),'body':'','attachment_ids':batch+[attachment]});v.check('four attachments refused',status==422)
        status,_,_=a.json(messages,method='POST',csrf=True,data={'client_message_id':msgkey(5),'body':'','attachment_ids':[batch[0],batch[0]]});v.check('duplicate attachment IDs refused',status==422)
        status,_,data=a.json(messages,method='POST',csrf=True,data={'client_message_id':msgkey(5),'body':'Synthetic C05B three attachments','attachment_ids':batch})
        v.check('three attachments commit in order',status in [200,201] and [item['id'] for item in data['data']['message']['attachments']]==batch);created+=status==201
        stage='lifecycle-and-native-paths'
        status,_,data=a.upload(uploads,key(7),'expire.txt',payload)
        if status==410:
            old=next(item for item in probe()['attachments'] if item['upload_key']==key(7));v.check('prior expiry tombstone retained',old['state']=='expired');expire=old['id']
        else:
            v.check('fixed expiry upload ready',status in [200,201]);expire=upload_id(data)
        probe('expire-fixed');probe('cleanup');stored=probe()
        by_id={item['id']:item for item in stored['attachments']}
        v.check('expired staging physically reclaimed',by_id[expire]['state']=='expired' and by_id[expire]['cleaned'] and not by_id[expire]['bytes_exist'])
        v.check('cancelled staging physically reclaimed',by_id[cancel]['state']=='cancelled' and by_id[cancel]['cleaned'] and not by_id[cancel]['bytes_exist'])
        status,_,_=a.upload(uploads,key(7),'expire.txt',payload);v.check('expired key does not resurrect',status==410)
        row=by_id[attachment];guid=row['file_guid'];file_id=row['file_id']
        for target in ['/file/file/download?guid='+guid,'/file/file/download?guid='+guid+'&variant=preview','/file/file/download?guid='+guid+'&token=synthetic-invalid', '/file/view?guid='+guid,'/file/share-intend?guid='+guid,'/api/v1/file/download/'+str(file_id),'/uploads/file/'+guid,'/../chat-upgrade-files/data/file/'+guid]:
            status,_,_=b.binary(target);v.check('native/static attachment bypass refused',status in [403,404])
        status,_,_=a.binary('/file/file/delete?guid='+guid,method='POST',headers={'X-CSRF-Token':a.csrf});v.check('native delete refused before mutation',status==404)
        native=probe('native-veto');v.check('five real native mutation gates preserve data',len(native['checks'])==5)
        status,_,body=b.binary(download);v.check('bytes survive native bypass attempts',status==200 and body==payload)
        stage='authorization-and-switch'
        fixture('unfriend')
        status,_,_=a.upload(uploads,key(6),'revoked.txt',payload);v.check('unfriend stops new upload',status==403)
        status,_,body=b.binary(download);v.check('unfriend retains authorized old history download',status==200 and body==payload)
        fixture('refriend');fixture('block')
        status,_,_=a.upload(uploads,key(6),'blocked.txt',payload);v.check('block stops new upload',status==403)
        fixture('unblock')
        h.control('chat-attachments-off')
        status,_,_=a.upload(uploads,key(6),'disabled.txt',payload);v.check('upload gate enforced',status in [403,503])
        status,_,body=b.binary(download);v.check('upload off retains bound download',status==200 and body==payload)
        h.control('chat-attachments-on')
        after=fixture()
        v.check('legacy data hash preserved',after['legacy_hash']==before['legacy_hash'] and after['legacy_preserved'])
        v.check('queue and native seen unchanged',after['queue_count']==before['queue_count'] and after['native_seen']==before['native_seen'])
        v.check('uploads do not mark read',after['read_state']==before['read_state'])
        v.check('precise new messages',after['message_count']-before['message_count']==created)
        return {'passed':True,'stage':'complete','requests':v.requests,'assertions':len(v.checks),'checks':v.checks,'new_messages':created,'synthetic_only':True,'legacy_preserved':True,'file_count':after['file_count'],'real_ai_calls':0,'credentials_returned':False}
    finally:
        fixture('unblock');fixture('refriend');h.control('chat-attachments-on')

if __name__=='__main__':
    result={}
    try:
        with h.locked():result=run()
    except Exception as e:result={'passed':False,'stage':stage,'requests':v.requests,'assertions':len(v.checks),'checks':v.checks,'reason':str(e) if isinstance(e,h.Refusal) else type(e).__name__,'credentials_returned':False}
    h.require(not REPORT.is_symlink(),'Report symlink refused.')
    REPORT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:value for k,value in result.items() if k!='checks'},ensure_ascii=False));sys.exit(0 if result['passed'] else 1)
