from pathlib import Path
import subprocess,socket,time,urllib.request,urllib.error,http.cookiejar,json,sqlite3,hashlib,os
root=Path(os.environ.get('MATCHER_REVIEW_ROOT','/Users/550m/code/hackathon-team-matcher'));work=Path(__file__).resolve().parent;php=root/'backend/.runtime/php-mysql/bin/php'
# Only this harness-owned SQLite database is reset. No application runtime config is loaded.
dbfile=work/'review.sqlite'
if dbfile.exists():dbfile.unlink()
setup=subprocess.run([str(php),'-n',str(work/'init.php')],text=True,capture_output=True,check=True)
fixture=json.loads(setup.stdout)
sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
log=(work/'http-review.log').open('w');server=subprocess.Popen([str(php),'-n','-S',f'127.0.0.1:{port}',str(work/'router.php')],cwd=work,stdout=log,stderr=log)
jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar));checks=[];requests=[];csrf=None
selection='/api/v1/events/7/recommendation-analysis/self-selection';analysis='/api/v1/events/7/recommendation-analysis/people/2';status='/api/v1/auth/github/import-status'
def request(path,actor=1,method='GET',body=None,token=True,headers=None,raw=None):
 h={'X-Review-Actor':str(actor),'Accept':'application/json'}
 if token and csrf:h['X-CSRF-Token']=csrf
 if body is not None:h['Content-Type']='application/json';raw=json.dumps(body).encode()
 if headers:h.update(headers)
 req=urllib.request.Request(f'http://127.0.0.1:{port}'+path,data=raw,headers=h,method=method)
 try:resp=opener.open(req,timeout=10)
 except urllib.error.HTTPError as e:resp=e
 text=resp.read().decode();data=None
 try:data=json.loads(text)
 except ValueError:pass
 result={'status':resp.status,'data':data,'headers':dict(resp.headers),'text':text}
 requests.append({'method':method,'path':path,'synthetic_actor':actor,'http_status':resp.status,'error_code':(data or {}).get('error',{}).get('code')})
 return result

def check(name,ok,actual=None):checks.append({'name':name,'passed':bool(ok),**({} if ok or actual is None else {'actual':actual})})
def code(resp):return (resp['data'] or {}).get('error',{}).get('code')
def sql(text,args=()):
 with sqlite3.connect(dbfile) as c:
  cur=c.execute(text,args);rows=cur.fetchall();c.commit();return rows

def snapshot():
 with sqlite3.connect(dbfile) as c:return hashlib.sha256('\n'.join(c.iterdump()).encode()).hexdigest()
def bootstrap(actor=1):
 global csrf
 result=request('/__review/bootstrap',actor);assert result['status']==200,result['text'];csrf=result['data']['csrf'];return result['data']
def selected(version,ids,ctx):return {'expected_selection_version':version,'attribute_ids':ids,'expected_current_event':ctx}
def analyzed(version,b,ctx=None):return {'expected_selection_version':version,'expected_candidate':b['expected_candidate'],'expected_current_event':ctx or b['expected_current_event']}
try:
 for _ in range(50):
  try:r=request(status,0);break
  except urllib.error.URLError:time.sleep(.1)
 check('auth status route resolves through source config and guest receives 401',r['status']==401 and code(r)=='AUTHENTICATION_REQUIRED',{'status':r['status'],'code':code(r)})
 check('auth status response is private no-store',r['headers'].get('Cache-Control')=='private, no-store')
 for p in [selection,analysis]:
  r=request(p,0,'POST' if p==analysis else 'GET');check('guest 401 '+p,r['status']==401,{'status':r['status'],'code':code(r)})
 for m in ['POST','PUT','DELETE','OPTIONS','HEAD']:
  r=request(status,0,m,token=False);check('status rejects '+m+' with actual HTTP 405',r['status']==405 and r['headers'].get('Allow')=='GET',r['status'])
 b=bootstrap();ctx=b['expected_current_event']
 before=snapshot();r=request(status);after=snapshot();check('owner status GET reads saved success without any SQL change',r['status']==200 and r['data']['data']['state']=='succeeded' and before==after,{'status':r['status'],'code':code(r)})
 check('owner receipt has only state and source_id',r['status']==200 and set(r['data']['data'])=={'state','source_id'})
 r=request(status+'?owner_id=2');check('caller-supplied import owner rejected',r['status']==400,r['status'])
 r=request(status,2);check('different actor cannot read first owner receipt',r['status']==200 and r['data']['data']=={'state':'not_requested','source_id':None},r['status'])
 before=snapshot();r=request(selection);after=snapshot();check('selection GET has zero database writes',r['status']==200 and before==after,r['status'])
 picker=r['data']['data'] if r['status']==200 else {}
 check('picker excludes private and draft values and retains legitimate actual IDs',set(x['attribute_id'] for x in picker.get('options',[]))=={'own-needed','own-direction'} and 'private-canary' not in r['text'] and 'draft-canary' not in r['text'])
 r=request(selection+'?owner_id=2');check('selection query owner rejected',r['status']==400,r['status'])
 r=request('/api/v1/events/8/recommendation-analysis/self-selection');check('different requested activity cannot read picker',r['status']>=400,r['status'])
 r=request(selection,method='PUT',body=selected(0,['own-needed'],ctx),token=False);check('actual Yii CSRF rejects missing token',r['status']==400 and code(r)=='INVALID_REQUEST',{'status':r['status'],'code':code(r)})
 r=request(selection,method='PUT',body=selected(0,['own-needed'],ctx),headers={'X-CSRF-Token':'synthetic-invalid-token'});check('actual Yii CSRF rejects wrong token',r['status']==400,r['status'])
 r=request(analysis);check('analysis GET rejected',r['status']==405,r['status'])
 r=request(selection,method='DELETE');check('selection DELETE rejected',r['status']==405,r['status'])
 r=request(selection,method='PUT',headers={'Content-Type':'text/plain'},raw=b'{}');check('selection requires JSON content type',r['status']==415,r['status'])
 r=request(selection,method='PUT',headers={'Content-Type':'application/json'},raw=json.dumps({'padding':'x'*16400}).encode());check('body over 16 KiB rejected',r['status']==413,r['status'])
 for label,body in [('client owner field',dict(selected(0,[],ctx),owner_id=2)),('duplicate source ids',selected(0,['own-needed','own-needed'],ctx)),('client-supplied values',dict(selected(0,[],ctx),value='canary')),('missing context',{'expected_selection_version':0,'attribute_ids':[]})]:
  r=request(selection,method='PUT',body=body);check(label+' is rejected by real input parser',r['status']==400,{'status':r['status'],'code':code(r)})
 for label,ids in [('private attribute',['own-private']),('unconfirmed attribute',['own-draft']),('foreign owner attribute',['candidate-skill']),('missing attribute',['not-present'])]:
  r=request(selection,method='PUT',body=selected(0,ids,ctx));check(label+' cannot become self analysis consent',r['status']>=400 and 'private-canary' not in r['text'] and 'draft-canary' not in r['text'],r['status'])
 r=request(selection,method='PUT',body=selected(0,['own-needed','own-direction'],ctx));check('authorized explicit selection persists through production factory',r['status']==200,{'status':r['status'],'code':code(r)})
 if r['status']!=200:raise RuntimeError('positive selection failed: '+r['text'])
 version=r['data']['data']['selection_version']
 rows=sql('SELECT selection_json FROM matcher_recommendation_self_selection');check('SQL selection persists references and versions but no profile values',len(rows)==1 and 'robotics' not in rows[0][0] and 'engineering' not in rows[0][0] and 'php' not in rows[0][0] and 'own-needed' in rows[0][0])
 r=request(selection,method='PUT',body=selected(0,[],ctx));check('stale zero version cannot replace a saved selection',r['status']==409,r['status'])
 before=snapshot();r=request(analysis,method='POST',body=analyzed(version,b));after=snapshot();check('rule analysis succeeds via real controller and production composition without SQL writes',r['status']==200 and before==after,{'status':r['status'],'code':code(r),'body':r['data']})
 if r['status']==200:
  data=r['data']['data'];check('public analysis is five dimensions with rules attribution and no hard-condition claim',len(data['dimensions'])==5 and data['explanation_source']=='rules' and data['hard_conditions_checked'] is False)
  check('public serializer omits internal context and authority tokens',all(k not in r['text'] for k in ['catalog_fingerprint','self_selection','internal_ports_rechecked','session_hash','profilePolicyVersion','selectionId']))
 sql("UPDATE matcher_profile_attribute SET visibility='private' WHERE attribute_id='own-needed'");sql("UPDATE matcher_profile_state SET permission_version=2 WHERE id=11")
 r=request(analysis,method='POST',body=analyzed(version,b));check('self visibility revocation invalidates analysis before public output',r['status']==409,r['status'])
 r=request(selection);check('picker clears stale selection after self permission change',r['status']==200 and r['data']['data']['selection_current'] is False and r['data']['data']['selected_attribute_ids']==[] and 'own-needed' not in r['text'],r['status'])
 sql("UPDATE matcher_profile_attribute SET visibility='authenticated' WHERE attribute_id='own-needed'");sql("UPDATE matcher_profile_state SET permission_version=1 WHERE id=11")
 sql("UPDATE matcher_profile_state SET revision=2 WHERE id=20");r=request(analysis,method='POST',body=analyzed(version,b));check('candidate profile revision change rejects stale card precondition',r['status']==409,r['status']);sql("UPDATE matcher_profile_state SET revision=1 WHERE id=20")
 wrongpolicy=json.loads(json.dumps(analyzed(version,b)));wrongpolicy['expected_candidate']['privacy_policy_version']='unreviewed-policy';r=request(analysis,method='POST',body=wrongpolicy);check('candidate policy drift rejects stale expected snapshot',r['status']==409,r['status'])
 sql('ALTER TABLE matcher_recommendation_self_selection RENAME TO review_missing_selection');before=snapshot();r=request(selection);after=snapshot();check('missing selection migration fails closed without runtime DDL',r['status']==503 and before==after and not sql("SELECT name FROM sqlite_master WHERE name='matcher_recommendation_self_selection'"),r['status']);sql('ALTER TABLE review_missing_selection RENAME TO matcher_recommendation_self_selection')
 r=request('/api/v1/events/7/recommendation-analysis/people/1',method='POST',body=analyzed(version,b));check('self-as-candidate rejected',r['status']==400,r['status'])
 r=request('/api/v1/events/7/recommendation-analysis/people/3',method='POST',body=analyzed(version,b));check('cross-activity candidate rejected instead of filling a card',r['status']==404,r['status'])
 wrong=json.loads(json.dumps(analyzed(version,b)));wrong['expected_candidate']['global']['revision']=999;r=request(analysis,method='POST',body=wrong);check('stale candidate version rejected',r['status']==409,r['status'])
 sql('INSERT INTO review_flags(name,value) VALUES (?,?)',('candidate-hidden-2','1'));r=request(analysis,method='POST',body=analyzed(version,b));check('ordinary discovery removal denies analysis despite visible profile values',r['status']==404,r['status']);sql('DELETE FROM review_flags WHERE name=?',('candidate-hidden-2',))
 sql('INSERT INTO contentcontainer_blocked_users(contentcontainer_id,user_id) VALUES(101,2)');r=request(analysis,method='POST',body=analyzed(version,b));check('native block denies candidate analysis',r['status']==404,r['status']);sql('DELETE FROM contentcontainer_blocked_users')
 bootstrap(2)
 r=request(selection,actor=2);check('account switch reads no previous actor consent',r['status']==200 and r['data']['data']['selection_version']==0 and r['data']['data']['selected_attribute_ids']==[],{'status':r['status'],'code':code(r)})
 # Returning to actor1 preserves the real native session but changes current activity revision in DB.
 oldctx=ctx;sql("UPDATE matcher_recommendation_current_selection SET space_id=8,selection_revision=? WHERE actor_id=1",('selection-'+'b'*32,));sql("UPDATE matcher_recommendation_current_selection SET space_id=7,selection_revision=? WHERE actor_id=1",('selection-'+'c'*32,))
 before=snapshot();r=request(selection);after=snapshot();check('context changed GET invalidates authority without deleting or writing',r['status']==200 and before==after and r['data']['data']['selection_current'] is False and r['data']['data']['selected_attribute_ids']==[],{'status':r['status'],'data':r['data']})
 retained=r['data']['data']['selection_version'] if r['status']==200 else -1
 check('selection version is retained across activity context changes',retained==version,retained)
 r=request(selection,method='PUT',body=selected(version,['own-needed'],oldctx));check('HTTP late write from prior activity revision rejected without intermediate consent write',r['status']==409,r['status'])
 r=request(analysis,method='POST',body=analyzed(version,b,oldctx));check('HTTP late analysis from prior activity revision rejected',r['status']==409,r['status'])
 b=bootstrap();ctx=b['expected_current_event'];r=request(selection,method='PUT',body=selected(retained,[],ctx));check('explicit empty replacement uses monotonically next version',r['status']==200 and r['data']['data']['selection_version']==retained+1,{'status':r['status'],'data':r['data']})
 clearversion=r['data']['data']['selection_version'] if r['status']==200 else -1
 r=request(selection,method='PUT',body=selected(version,['own-needed'],ctx));check('old consent version cannot resurrect references after explicit clear',r['status']==409,r['status'])
 before=snapshot();r=request(analysis,method='POST',body=analyzed(clearversion,b));after=snapshot();check('empty self selection remains valid unknown-only explanation without writes',r['status']==200 and before==after and all(x['status']=='unknown' for x in r['data']['data']['dimensions']),{'status':r['status'],'code':code(r)})
 r=request(selection,headers={'X-Review-Expired':'1'});check('inactive native session cannot read saved consent',r['status']>=400,r['status'])
 sql('UPDATE user SET status=? WHERE id=1',(fixture['user_disabled'],));r=request(status);check('disabled owner import status is 403',r['status']==403,r['status']);r=request(selection);check('disabled account selection is 403',r['status']==403,r['status']);sql('UPDATE user SET status=? WHERE id=1',(fixture['user_enabled'],))
 sql("UPDATE space_membership SET status=0,group_id='admin' WHERE user_id=1 AND space_id=7");r=request(selection);check('administrator group label does not bypass formal membership',r['status']>=400,r['status']);sql("UPDATE space_membership SET status=?,group_id='member' WHERE user_id=1 AND space_id=7",(fixture['member'],))
 sql("UPDATE matcher_profile_source SET status='deleted' WHERE owner_id=1");r=request(status);check('source deletion overrides old successful import receipt',r['status']==200 and r['data']['data']=={'state':'revoked','source_id':None},r['status']);sql("UPDATE matcher_profile_source SET status='ready' WHERE owner_id=1")
 sql('DELETE FROM user_auth WHERE user_id=1');r=request(status);check('unlinked GitHub identity hides previous source reference',r['status']==200 and r['data']['data']=={'state':'revoked','source_id':None},r['status'])
 sql('ALTER TABLE matcher_auth_import RENAME TO review_missing_receipts');r=request(status);check('unexpected storage error is fixed 500 without SQL or values',r['status']==500 and code(r)=='INTERNAL_ERROR' and 'SELECT' not in r['text'] and 'matcher_auth_import' not in r['text'],r['status']);sql('ALTER TABLE review_missing_receipts RENAME TO matcher_auth_import')
except Exception as exc:
 checks.append({'name':'harness_completed','passed':False,'actual':str(exc)})
finally:
 server.terminate();server.wait(timeout=5);log.close()
result={'status':'passed' if all(c['passed'] for c in checks) else 'failed','checks':len(checks),'passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks),'checks_detail':checks,'http_requests':len(requests),'requests':requests,'scope':'actual PHP HTTP/Yii routing/controllers/CSRF + temporary SQLite + production analysis composition/P1 SQL/P8/current-event/session stores; synthetic actor and ordinary card adapter','external_network_requests':0,'model_calls':0,'real_oauth':False,'main_preview_connections':0,'server_stopped':True}
(work/'http-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['status','checks','passed','failed','http_requests','server_stopped']},ensure_ascii=False));print(json.dumps([c for c in checks if not c['passed']],ensure_ascii=False,indent=2))
