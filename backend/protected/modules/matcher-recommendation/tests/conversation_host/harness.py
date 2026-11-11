"""Native localhost HTTP + isolated MySQL audit. Never sends any request outside the exact host."""
from pathlib import Path
import datetime, http.cookiejar, json, re, subprocess, urllib.error, urllib.parse, urllib.request, uuid
ROOT = Path(__file__).resolve().parents[5]
RT = ROOT/'.runtime/recommendation-integration-audit'
CFG = json.loads((RT/'private.json').read_text())
assert CFG['database']=='humhub_recommendation_it_audit_20261112_7f2c9a' and CFG['host']=='127.0.0.1' and CFG['port']==8112
BASE='http://127.0.0.1:8112'
PHP=[str(ROOT/'.runtime/php-mysql/bin/php'),'-d','extension=mysqlnd.so','-d','extension=pdo_mysql.so']
RUN=uuid.uuid4().hex[:8]
checks=[]; responses=[]
def check(ok,label,**details):
    checks.append({'label':label,'passed':bool(ok),**details})
    if not ok: raise AssertionError(label)
def control(action,*args):
    p=subprocess.run(PHP+[str(Path(__file__).parent/'control.php'),action,*map(str,args)],capture_output=True,text=True,timeout=30)
    if p.returncode or 'Error:' in p.stdout+p.stderr: raise RuntimeError('Audit control failed: '+action+' '+p.stdout[:180])
    try:return json.loads(p.stdout)
    except json.JSONDecodeError:return p.stdout.strip()
def mode(**changes):
    data=json.loads((RT/'mode.json').read_text());data.update(changes)
    (RT/'mode.json').write_text(json.dumps(data))
def calls():
    rows=[json.loads(x) for x in (RT/'calls.jsonl').read_text().splitlines()] if (RT/'calls.jsonl').exists() else []
    return [x for x in rows if x['kind']=='model']
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):return None
class Client:
    def __init__(self):
        self.jar=http.cookiejar.CookieJar();self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar),NoRedirect());self.csrf=None
    def req(self,path,method='GET',body=None,key=None,csrf=True,form=False):
        assert path.startswith('/') and not path.startswith('//')
        headers={}; data=None
        if body is not None:
            data=(urllib.parse.urlencode(body) if form else json.dumps(body,ensure_ascii=False)).encode()
            headers['Content-Type']='application/x-www-form-urlencoded' if form else 'application/json'
        if csrf and self.csrf:headers['X-CSRF-Token']=self.csrf
        if key:headers['Idempotency-Key']=RUN+'-'+key
        req=urllib.request.Request(BASE+path,data=data,method=method,headers=headers)
        try:r=self.opener.open(req,timeout=20)
        except urllib.error.HTTPError as e:r=e
        raw=r.read().decode(); status=r.status
        try:out=json.loads(raw)
        except json.JSONDecodeError:out=raw
        responses.append({'path':path.split('?')[0],'method':method,'status':status,'error':out.get('error') if isinstance(out,dict) else None})
        return status,out,dict(r.headers)
    def login(self,n):
        st,html,_=self.req('/user/auth/login');check(st==200,'native login page '+str(n))
        self.csrf=re.search(r'name="csrf-token" content="([^"]+)"',html).group(1)
        st,_,headers=self.req('/user/auth/login','POST',{'Login[username]':f'synthetic_audit_{n:02d}','_csrf':self.csrf},form=True)
        check(st==302 and '/user/auth/password' in headers.get('Location',''),'native username step '+str(n),status=st)
        st,html,_=self.req('/user/auth/password');check(st==200,'native password page '+str(n))
        self.csrf=re.search(r'name="csrf-token" content="([^"]+)"',html).group(1)
        st,_,_=self.req('/user/auth/password','POST',{'Login[password]':CFG['login_password'],'_csrf':self.csrf},form=True)
        check(st==302,'native password authentication '+str(n),status=st)
        # Refresh CSRF after native session ID regeneration through a normal page.
        st,html,_=self.req('/dashboard/dashboard')
        if st==200 and isinstance(html,str):
            token=re.search(r'name="csrf-token" content="([^"]+)"',html)
            if token:self.csrf=token.group(1)
        st,_,_=self.req('/admin');check(st==403,'ordinary native user has no admin access '+str(n),status=st)
    def select(self,space,revision=None):
        st,data,_=self.req('/api/v1/me/current-event','PUT',{'space_id':space,'expected_revision':revision});check(st==200,'real session selects current event',status=st)
        return data['data']['selection_revision']
    def create(self,key):
        st,out,_=self.req(f'/api/v1/events/{A}/recommendation-conversations','POST',{},key)
        check(st==201,'create authorized conversation '+key,status=st,error=out.get('error'))
        return out['data']
    def turn(self,conv,key,message='Find synthetic common-topic teammates.',command='recommend'):
        return self.req('/api/v1/recommendation-conversations/'+conv['conversation_id']+'/turns','POST',{'expected_version':conv['version'],'message':message,'command':command},key)
fixture=json.loads((RT/'fixture.json').read_text());A=fixture['spaces']['A'];B=fixture['spaces']['B']
