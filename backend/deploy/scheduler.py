#!/usr/bin/env python3
"""Local preview cron driver; managed by preview.py, no system cron is changed."""
from pathlib import Path
import signal,subprocess,time
root=Path(__file__).resolve().parents[1];active=True

def stop(*_):
 global active
 active=False
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
while active:
 with (root/'.runtime/logs/cron.log').open('ab') as log:
  subprocess.run([str(root/'.runtime/php-mysql/bin/php'),'-c',str(root/'.runtime/php.ini'),str(root/'protected/yii'),'cron/run'],cwd=root,stdout=log,stderr=log,timeout=120)
 for _ in range(60):
  if not active:break
  time.sleep(1)
