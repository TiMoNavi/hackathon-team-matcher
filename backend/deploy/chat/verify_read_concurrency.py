#!/usr/bin/env python3
"""Two real PHP/SQL processes, a fixed lock marker and bounded synthetic read writes."""
import json
import selectors
import subprocess
import sys
import time
import harness as h

high = None
stage = 'guard'
try:
    h.require(len(sys.argv) == 1,'No probe overrides.')
    with h.locked():
        config=h.runtime_guard();h.database_guard(config)
        file=h.BACKEND/'protected/modules/matcher-chat/tests/isolated-sql.php'
        command=h.php_command()+[str(file)]
        before=json.loads(h.run(command+['snapshot']))
        h.require(before['status']=='passed' and before['read_seq_b']<=3,'Expected bounded unread fixture.')
        stage='high-lock'
        high=subprocess.Popen(command+['read-high-b-hold'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=h.clean_environment())
        with selectors.DefaultSelector() as selector:
            selector.register(high.stderr,selectors.EVENT_READ)
            h.require(bool(selector.select(10)),'Fixed lock marker timeout.')
            marker=high.stderr.readline()
        h.require(marker=='__CHAT_SQL_HIGH_LOCK_HELD__\n' and high.poll() is None,'Expected live SQL lock holder.')
        stage='overlapping-low'
        started=time.monotonic()
        low=subprocess.run(command+['read-low-b'],capture_output=True,text=True,timeout=20,env=h.clean_environment())
        elapsed=time.monotonic()-started
        stdout,stderr=high.communicate(timeout=20)
        h.require(high.returncode==0 and low.returncode==0 and not stderr and not low.stderr,'SQL workers failed; diagnostics suppressed.')
        results=[json.loads(stdout),json.loads(low.stdout)]
        h.require(all(x['status']=='passed' and x['merged_read_seq']==3 and x['persisted_read_seq']==3 for x in results),'Monotonic SQL merge failed.')
        h.require(elapsed>=0.35,'Expected process overlap duration was not observed.')
        after=json.loads(h.run(command+['snapshot']))
        h.require(after['read_seq_b']==3 and after['native_entries']==7,'Unexpected persisted snapshot.')
        report={'status':'passed','target_database':h.DB,'real_php_processes':2,'high_lock_marker_observed':True,
            'low_started_while_high_live':True,'low_elapsed_seconds':round(elapsed,3),'requested_positions':[3,1],
            'both_returned_position':3,'final_persisted_position':3,'read_state_reset':False,
            'native_seen_unchanged':True,'workers':results,'before':before,'after':after,
            'database_lock_wait_observed':False,
            'scope':'two overlapping processes with monotonic SQL read-state merge; elapsed time includes bootstrap and does not prove a database lock wait; no concurrent revocation or native member race certification'}
        (h.BACKEND.parent/'docs/群聊模块升级/sources/c04-read-concurrency_2026-11-12.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({k:v for k,v in report.items() if k not in ['workers','before','after']}))
except Exception as exc:
    print(json.dumps({'status':'failed','stage':stage,'reason':str(exc) if isinstance(exc,h.Refusal) else type(exc).__name__}));sys.exit(1)
finally:
    if high is not None and high.poll() is None:
        high.terminate(); high.communicate(timeout=5)
