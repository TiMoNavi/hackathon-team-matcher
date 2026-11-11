"""Destroy only resources newly created for this exact audit, verifying their identity first."""
from pathlib import Path
import json, os, signal, socket, subprocess, time
BASE=Path(__file__).resolve().parents[5];RT=BASE/'.runtime/recommendation-integration-audit'
DB='humhub_recommendation_it_audit_20261112_7f2c9a';USER='reco_audit_7f2c9a'
cfg=json.loads((RT/'private.json').read_text())
assert cfg['database']==DB and cfg['username']==USER and cfg['socket']==str(BASE/'.runtime/mysql.sock') and cfg['host']=='127.0.0.1' and cfg['port']==8112
php=[str(BASE/'.runtime/php-mysql/bin/php'),'-d','extension=mysqlnd.so','-d','extension=pdo_mysql.so']
def control(action):
 r=subprocess.run(php+[str(Path(__file__).parent/'control.php'),action],capture_output=True,text=True,timeout=20)
 assert r.returncode==0
 return json.loads(r.stdout)
report={'database':DB,'server':'127.0.0.1:8112','environment':control('environment'),'before_cleanup':control('status'),'before_counts':control('counts')}
pids=subprocess.check_output(['lsof','-t','-iTCP:8112','-sTCP:LISTEN'],text=True).split();assert len(pids)==1
pid=int(pids[0]);command=subprocess.check_output(['ps','-p',str(pid),'-o','command='],text=True)
assert 'conversation_host/router.php' in command and '127.0.0.1:8112' in command
os.kill(pid,signal.SIGTERM)
for _ in range(30):
 try:
  s=socket.socket();s.bind(('127.0.0.1',8112));s.close();break
 except OSError:time.sleep(.1)
else:raise RuntimeError('Audit listener did not stop')
report['own_listener_stopped']=True
# The bootstrap must refuse an altered DB name before any Yii/DB initialization.
changed=dict(cfg);changed['database']='forbidden_audit_guard_target'
try:
 (RT/'private.json').write_text(json.dumps(changed))
 result=subprocess.run(php+[str(Path(__file__).parent/'control.php'),'status'],capture_output=True,text=True,timeout=15)
 report['wrong_database_refused_before_bootstrap']=result.returncode!=0 and 'Audit isolation target mismatch' in result.stdout+result.stderr
 assert report['wrong_database_refused_before_bootstrap']
finally:(RT/'private.json').write_text(json.dumps(cfg))
mysql=[str(BASE/'.runtime/php-mysql/bin/mysql'),'--defaults-extra-file='+str(BASE/'.runtime/mysql-root.cnf'),'--protocol=SOCKET','--socket='+str(BASE/'.runtime/mysql.sock'),'--batch','--skip-column-names']
def sql(statement):
 r=subprocess.run(mysql,input=statement,text=True,capture_output=True,timeout=20)
 if r.returncode:raise RuntimeError('Isolated cleanup failed; database details suppressed')
 return r.stdout.strip()
assert sql("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='"+DB+"';")==DB
assert sql("SELECT User FROM mysql.user WHERE User='"+USER+"' AND Host='localhost';")==USER
sql('DROP DATABASE '+DB+"; DROP USER '"+USER+"'@'localhost';")
report['database_removed']=sql("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='"+DB+"';")=='0'
report['temporary_user_removed']=sql("SELECT COUNT(*) FROM mysql.user WHERE User='"+USER+"';")=='0'
assert report['database_removed'] and report['temporary_user_removed']
(RT/'private.json').unlink()
for p in (RT/'sessions').glob('sess_*'):p.unlink()
report['private_config_removed']=not (RT/'private.json').exists()
report['session_files_removed']=not list((RT/'sessions').glob('sess_*'))
report['status']='passed'
target=BASE.parent/'docs/推荐模块/sources/backend-host-cleanup_2026-11-12.json';target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('before_cleanup','before_counts')},ensure_ascii=False))
