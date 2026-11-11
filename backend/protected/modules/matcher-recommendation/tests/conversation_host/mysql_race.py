"""Twenty real PHP/MySQL processes compete for seven new reservations in the isolated audit DB."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json,subprocess,uuid
ROOT=Path(__file__).resolve().parents[5];RT=ROOT/'.runtime/recommendation-integration-audit'
cfg=json.loads((RT/'private.json').read_text());assert cfg['database']=='humhub_recommendation_it_audit_20261112_7f2c9a'
PHP=[str(ROOT/'.runtime/php-mysql/bin/php'),'-d','extension=mysqlnd.so','-d','extension=pdo_mysql.so']
CMD=PHP+[str(Path(__file__).parent/'control.php')]
checks=[]
def call(action,*args):
 p=subprocess.run(CMD+[action,*map(str,args)],capture_output=True,text=True,timeout=30)
 if p.returncode or p.stderr:raise RuntimeError('Audit control failed '+action)
 return json.loads(p.stdout)
def check(ok,label,**detail):
 checks.append({'label':label,'passed':bool(ok),**detail})
 if not ok:raise AssertionError(label)
try:
 before=call('status');countBefore=call('counts');prefix='mysql-race-'+uuid.uuid4().hex
 check(before['runtime']['enabled'],'runtime enabled for real MySQL race')
 cap=before['budget']['reserved']+7;call('allowance',cap)
 with ThreadPoolExecutor(max_workers=10) as pool:results=list(pool.map(lambda n:call('reserve',prefix+'-'+str(n)),range(20)))
 after=call('status');countAfter=call('counts')
 check(sum(x['outcome']=='reserved' for x in results)==7,'exactly seven of twenty concurrent processes reserve',results=results)
 check(sum(x.get('reason')=='budget_exhausted' for x in results)==13,'thirteen excess attempts fail without retries')
 check(after['budget']['reserved']==cap==after['budget']['allowance'],'MySQL conditional update never overshoots quota',before=before['budget'],after=after['budget'])
 check(countAfter['ledger']-countBefore['ledger']==7,'atomic reservation and permit ledger stay consistent')
 call('allowance',cap+10)
 first=call('reserve',prefix+'-duplicate');b=call('status')['budget']['reserved'];second=call('reserve',prefix+'-duplicate');a=call('status')['budget']['reserved']
 check(first['outcome']=='reserved' and second['outcome']=='rejected' and a==b,'duplicate permit rolls back quota increment')
 baseline=call('status');baselineCounts=call('counts')
 p=subprocess.run(PHP+[str(Path(__file__).parent/'console.php'),'migrate/up','--interactive=0'],capture_output=True,text=True,timeout=40)
 (RT/'repeat-migration.log').write_text(p.stdout+p.stderr)
 check(p.returncode==0 and 'No new migrations' in p.stdout,'native repeated migration completes without new changes')
 check(call('status')==baseline and call('counts')==baselineCounts,'repeat migration preserves conversations runtime budget and ledger')
 check(countAfter['native_admin_users']==0,'all 28 accounts lack native global administrator group membership')
 call('allowance',500)
 report={'status':'passed','checks':checks,'before':before,'after':after,'network_calls':0}
except Exception as e:report={'status':'failed','checks':checks,'failure_type':type(e).__name__,'failure':str(e)[:180]}
target=ROOT.parent/'docs/推荐模块/sources/backend-host-mysql_2026-11-12.json';target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':report['status'],'passed':sum(x['passed'] for x in checks),'failed':sum(not x['passed'] for x in checks),'failure':report.get('failure')}))
