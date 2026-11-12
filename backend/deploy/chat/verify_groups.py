#!/usr/bin/env python3
"""C07A fixed native-login HTTP validation; never takes target/user overrides."""
import json
import sys
import verify_reading as v
h = v.h
REPORT = h.BACKEND.parent / 'docs/群聊模块升级/sources/c07a-lifecycle-http_2026-11-13.json'
stage = 'guard'

def fixture(action='snapshot'):
    h.require(action in ['snapshot', 'unfriend', 'refriend', 'block', 'unblock'], 'Fixed C07A fixture action required.')
    return h.parse_control_output(h.run(h.php_command() + [str(h.HERE / 'c07a-fixture.php'), action]), action)

def key(n):
    return 'c07a0000-0000-4000-8000-' + str(n).zfill(12)

def command(action, n, value):
    intents = {'create':'create_group','invite':'invite_to_group','accept':'accept_group_invitation','decline':'decline_group_invitation','withdraw':'withdraw_group_invitation','leave':'leave_group'}
    field = 'title' if action == 'create' else 'target_user_id' if action == 'invite' else 'expected_version'
    return {'client_command_id': key(n), 'confirmation_intent': intents[action], field: value}

def run():
    global stage
    h.require(len(sys.argv) == 1, 'No target overrides.')
    h.require(not REPORT.exists() and not REPORT.is_symlink(), 'First-run HTTP evidence exists; preserve it and use a separately scoped replay report.')
    config = h.runtime_guard(); h.database_guard(config)
    v.check('owned server', h.owned_server() is not None)
    state = h.control('inspect')
    v.check('group opt-in and direct read active', state['chat_groups_opt_in'] and state['chat_read_enabled'] and state['chat_ui_read_enabled'])
    before = fixture(); actors = before['synthetic_ids']['actors']; direct = before['synthetic_ids']['conversation_id']
    file = h.RUNTIME / 'c07a-fixture.json'; h.checked_path(file, mode=0o600); private = json.loads(file.read_text())
    v.check('owned credentials', private['kind'] == 'chat-c07a-group-v1' and private['nonce'] == config['nonce'])
    clients = {}
    for role in ['a','b','outsider']:
        clients[role] = v.Client(); clients[role].login(private['actors'][role])
    a,b,o = clients['a'],clients['b'],clients['outsider']; base='/api/v1/conversations'; groups=base+'/groups'; invitations='/api/v1/group-invitations'
    new_writes = 0
    def post(client,path,body):
        nonlocal new_writes
        status,headers,data=client.json(path,method='POST',data=body,csrf=True)
        v.check('command accepted '+path,status in [200,201])
        v.check('write status and replay agree',data['data']['replayed'] == (status==200))
        v.check('private no-store', 'no-store' in headers.get('Cache-Control',''))
        new_writes += status == 201
        return data['data']
    try:
        stage='request-boundaries'
        create=command('create',1,'Synthetic C07A main group')
        for name,client,opts,expected in [('guest',v.Client(),{},401),('csrf',a,{},400),('actor',a,{'csrf':True,'actor':actors['b']},401),('origin',a,{'csrf':True,'headers':{'Origin':'https://example.invalid'}},403)]:
            status,_,_=client.json(groups,method='POST',data=create,**opts);v.check(name+' denied',status==expected)
        for method in ['GET','PUT','DELETE','HEAD']:
            status,head,_=a.call(groups,method=method);v.check('wrong method '+method,status==405 and head.get('Allow')=='POST')
        for body in [{**create,'actor_id':actors['a']},{**create,'space_id':1},{**create,'title':' '},{**create,'client_command_id':'bad'},[]]:
            status,_,_=a.json(groups,method='POST',data=body,csrf=True);v.check('invalid create denied',status==422)
        raw=json.dumps(create)[:-1]+',"title":"duplicate"}'
        status,_,_=a.call(groups,method='POST',body=raw.encode(),headers={'Content-Type':'application/json','X-CSRF-Token':a.csrf});v.check('duplicate body field denied',status==422)
        status,_,_=a.json(groups+'?actor_id=1',method='POST',data=create,csrf=True);v.check('unknown query denied',status==422)
        status,_,_=a.call(groups,method='POST',body=b'{}',headers={'Content-Type':'text/plain','X-CSRF-Token':a.csrf});v.check('non JSON denied',status==415)
        status,_,_=a.call(groups,method='POST',body=b' '*4097,headers={'Content-Type':'application/json','X-CSRF-Token':a.csrf});v.check('oversize JSON denied',status==413)
        stage='create-and-pending'
        created=post(a,groups,create);group=created['group']['conversation_id'];path=base+'/'+str(group)
        if not created['replayed']:
            v.check('only owner initial member',created['group']['active_member_count']==1 and created['membership']['generation']==1)
        repeat=post(a,groups,create);v.check('same create same ID',repeat['group']['conversation_id']==group)
        status,_,_=a.json(groups,method='POST',data={**create,'title':'different'},csrf=True);v.check('create key conflict',status==409)
        for client,target in [(b,actors['outsider']),(a,actors['outsider'])]:
            status,_,_=client.json(path+'/invitations',method='POST',data=command('invite',90,target),csrf=True);v.check('owner/friend eligibility',status in [403,404])
        invite=command('invite',2,actors['b']);invited=post(a,path+'/invitations',invite);iid=invited['invitation']['id'];ip=invitations+'/'+str(iid)
        status,_,_=o.json(ip);v.check('outsider invitation hidden',status==404)
        status,_,_=a.json(path+'/invitations',method='POST',data={**invite,'target_user_id':actors['outsider']},csrf=True);v.check('invite key recipient conflict',status==409)
        if invited['invitation']['status']=='pending':
            status,_,detail=b.json(ip);v.check('pending no membership or group',status==200 and detail['data']['group'] is None and detail['data']['membership'] is None)
            snap=fixture();v.check('pending no native member',not any(int(m['message_id'])==group and int(m['user_id'])==actors['b'] for m in snap['native_members']))
            status,_,_=a.json(ip+'/accept',method='POST',data=command('accept',3,1),csrf=True);v.check('owner cannot accept for invitee',status==404)
            status,_,_=b.json(ip+'/accept',method='POST',data=command('accept',3,2),csrf=True);v.check('stale invite version',status==409)
            fixture('unfriend')
            try:
                status,_,_=b.json(ip+'/accept',method='POST',data=command('accept',3,1),csrf=True);v.check('unfriend prevents accept',status==403)
            finally: fixture('refriend')
            fixture('block')
            try:
                status,_,_=b.json(ip+'/accept',method='POST',data=command('accept',3,1),csrf=True);v.check('block prevents accept',status==403)
            finally: fixture('unblock')
        stage='accept-leave-rejoin'
        accepted=post(b,ip+'/accept',command('accept',3,1))
        if not accepted['replayed']:
            v.check('accepted native member',accepted['membership']['status']=='active' and accepted['membership']['version']==1 and accepted['invitation']['version']==2)
        status,_,_=a.json(path+'/leave',method='POST',data=command('leave',4,1),csrf=True);v.check('owner cannot leave',status==409)
        left=post(b,path+'/leave',command('leave',4,1))
        if not left['replayed']:
            v.check('leave closes current membership',left['group'] is None and left['membership']['status']=='left' and left['membership']['version']==2)
            replay=post(b,ip+'/accept',command('accept',3,1));v.check('old accepted receipt cannot rejoin',replay['group'] is None and replay['membership']['status']=='left')
        second=post(a,path+'/invitations',command('invite',5,actors['b']));ip2=invitations+'/'+str(second['invitation']['id'])
        if second['invitation']['status']=='pending':
            status,_,detail=b.json(ip2);v.check('reinvite pending preserves left only',status==200 and detail['data']['group'] is None and detail['data']['membership']['status']=='left')
        joined=post(b,ip2+'/accept',command('accept',6,1));v.check('second member generation',joined['membership']['generation']==2 and joined['membership']['version']==3 and joined['membership']['join_seq']==0)
        replay=post(b,path+'/leave',command('leave',4,1));v.check('old leave cannot remove new member',replay['membership']['status']=='active' and replay['membership']['generation']==2)
        stage='direct-coexistence-and-old-entry'
        for client in [a,b]:
            status,_,data=client.json(base);v.check('direct list survives multiple group generations',status==200 and [x['id'] for x in data['data']['items']]==[direct])
            status,_,data=client.json(base+'/'+str(direct)+'/messages');v.check('existing empty direct still reads',status==200 and data['data']['items']==[])
            for suffix in ['/messages','/messages?after_seq=0','/attachments/00000000-0000-4000-8000-000000000001/download']:
                status,_,_=client.json(path+suffix);v.check('group content unavailable',status in [403,404,503])
            status,_,_=client.json(path+'/messages',method='POST',data={'client_message_id':key(91),'body':'Must not write'},csrf=True);v.check('group send refused',status in [403,404,503])
            status,_,_=client.json(path+'/read-state',method='PUT',data={'read_seq':0},csrf=True);v.check('group read state refused',status in [403,404,503])
            status,_,_=client.call('/mail/mail/show?id='+str(group));v.check('native group show refused',status==404)
        status,_,_=o.call('/mail/mail/show?id='+str(group));v.check('outsider native group refused',status==404)
        stage='decline-withdraw'
        secondary=post(a,groups,command('create',7,'Synthetic C07A decisions'))['group']['conversation_id'];sp=base+'/'+str(secondary)+'/invitations'
        d=post(a,sp,command('invite',8,actors['b']))['invitation']['id'];dp=invitations+'/'+str(d)
        declined=post(b,dp+'/decline',command('decline',9,1));v.check('decline no member',declined['invitation']['status']=='declined' and declined['membership'] is None)
        status,_,_=b.json(dp+'/accept',method='POST',data=command('accept',10,2),csrf=True);v.check('declined terminal cannot accept',status==409)
        w=post(a,sp,command('invite',10,actors['b']))['invitation']['id'];wp=invitations+'/'+str(w)
        withdrawn=post(a,wp+'/withdraw',command('withdraw',11,1));v.check('withdraw terminal',withdrawn['invitation']['status']=='withdrawn')
        status,_,_=b.json(wp+'/accept',method='POST',data=command('accept',12,2),csrf=True);v.check('withdrawn terminal cannot accept',status==409)
        stage='paused-gate'
        h.control('chat-groups-off')
        try:
            status,_,_=a.json(groups,method='POST',data=create,csrf=True);v.check('pause rejects even write replay',status==503)
            status,_,_=b.json(ip);v.check('pause rejects detail',status==503)
            status,_,_=a.json(base);v.check('pause preserves direct',status==200)
        finally: h.control('chat-groups-on')
        stage='final-snapshot'
        after=fixture();v.check('legacy and queue preserved',after['legacy_hash']==before['legacy_hash'] and after['old_terminal_revoked'] and after['queue_count']==1)
        v.check('no group messages or files created',after['total_message_count']==28 and after['file_count']==16)
        v.check('native formal group members agree',sum(int(m['message_id'])==group for m in after['native_members'])==2)
        result={'status':'passed','stage':stage,'http_requests':v.requests,'checks':len(v.checks),'assertions':v.checks,'new_writes':new_writes,
            'group_count':after['group_count'],'invitation_count':after['invitation_count'],'receipt_count':after['receipt_count'],'legacy_preserved':True,'old_terminal_revoked':True,
            'group_messages_enabled':False,'group_ui_mounted':False,'real_ai_calls':0,'worker_started':False,'scope':'Fixed C07A native sessions and empty-group lifecycle; not complete C07 or deployment.'}
        h.require(not REPORT.is_symlink(),'Report symlink refused.');REPORT.parent.mkdir(parents=True,exist_ok=True);REPORT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({k:value for k,value in result.items() if k!='assertions'},ensure_ascii=False))
    except Exception:
        raise

if __name__=='__main__':
    try:
        with h.locked(): run()
    except Exception as exc:
        result={'status':'failed','stage':stage,'http_requests':v.requests,'checks':len(v.checks),'reason':str(exc) if isinstance(exc,h.Refusal) else 'Private diagnostics suppressed.'}
        failure=REPORT.with_name('c07a-lifecycle-http-failure_2026-11-13.json')
        if not failure.is_symlink(): failure.parent.mkdir(parents=True,exist_ok=True);failure.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps(result,ensure_ascii=False),file=sys.stderr);sys.exit(1)
