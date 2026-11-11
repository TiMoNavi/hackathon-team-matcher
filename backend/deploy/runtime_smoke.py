#!/usr/bin/env python3
"""Verify a real queue job, cron and restart for the synthetic local preview."""
from pathlib import Path
import json, os, subprocess, sys, time
root=Path(__file__).resolve().parents[1]
os.environ['PHPRC']=str(root/'.runtime/php.ini')
php=[str(root/'.runtime/php-mysql/bin/php'),'-c',str(root/'.runtime/php.ini')]
report={'checked_on':'2026-11-11','scope':'local preview runtime; no load test'}
def run(args):
 return subprocess.run(args,cwd=root,capture_output=True,text=True,timeout=45)
def status():
 result=run([sys.executable,'deploy/preview.py','status'])
 if result.returncode:raise RuntimeError('Could not read preview status')
 return json.loads(result.stdout)
app_log=root/'protected/runtime/logs/app.log'
offset=app_log.stat().st_size if app_log.exists() else 0
code="$app=require 'deploy/app.php'; echo json_encode(['id'=>$app->queue->push(new humhub\\modules\\content\\jobs\\SearchRebuildIndex())]);"
result=run(php+['-r',code])
if result.returncode:raise RuntimeError('Could not enqueue native search rebuild; details remain in local logs')
job=json.loads(result.stdout)
report['queue_job_enqueued']=bool(job['id'])
tail=''
for _ in range(80):
 if app_log.exists():
  with app_log.open('rb') as f:f.seek(offset);tail=f.read().decode(errors='replace')
 if 'items indexed.' in tail:break
 time.sleep(.25)
report['queue_rebuild_completed']='items indexed.' in tail
report['new_queue_driver_errors']='could not find driver' in tail.lower() or 'Could not execute queued job!' in tail
cron=run([sys.executable,'deploy/preview.py','cron'])
report['cron_exit_code']=cron.returncode
report['before_restart']=status()
stopped=run([sys.executable,'deploy/preview.py','stop'])
report['stop_exit_code']=stopped.returncode
started=run([sys.executable,'deploy/preview.py','start'])
report['start_exit_code']=started.returncode
report['after_restart']=status()
report['passed']=report['queue_job_enqueued'] and report['queue_rebuild_completed'] and not report['new_queue_driver_errors'] and all(report[k]==0 for k in ['cron_exit_code','stop_exit_code','start_exit_code']) and all(report['after_restart'][k] for k in ['web_running','mysql_running','queue_running','scheduler_running'])
(root/'deploy/runtime-smoke.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
sys.exit(0 if report['passed'] else 1)
