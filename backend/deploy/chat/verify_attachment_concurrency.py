#!/usr/bin/env python3
"""Fixed C05B independent-process SQL attachment exercise; no target overrides."""
import json
import os
import selectors
import subprocess
import sys
import time
import verify_attachments as s
h,v=s.h,s.v
PROBE=h.BACKEND/'protected/modules/matcher-chat/tests/isolated-attachments.php'
REPORT=h.BACKEND.parent/'docs/群聊模块升级/sources/c05b-attachments-sql_2026-11-13.json'
children=[]
stage='guard'
class Child:
    def __init__(self, mode):
        self.mode = mode; self.buffer = b''; self.lines = []
        self.p = subprocess.Popen(h.php_command() + [str(PROBE), mode], stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=h.clean_environment())
        children.append(self)
    def line(self, timeout=25):
        deadline = time.monotonic() + timeout
        while b'\n' not in self.buffer:
            with selectors.DefaultSelector() as selector:
                selector.register(self.p.stdout, selectors.EVENT_READ)
                ready = selector.select(max(0, deadline - time.monotonic()))
            h.require(bool(ready), 'SQL probe handshake timed out.')
            chunk = os.read(self.p.stdout.fileno(), 4096)
            h.require(bool(chunk), 'SQL probe closed before handshake.')
            self.buffer += chunk; h.require(len(self.buffer) < 16000, 'SQL probe output bound exceeded.')
        line, self.buffer = self.buffer.split(b'\n', 1); value = line.decode('utf8'); self.lines.append(value); return value
    def signal(self, expected):
        h.require(self.line() == expected, 'SQL probe fixed handshake mismatch.')
    def release(self):
        self.p.stdin.write(b'continue\n'); self.p.stdin.flush()
    def finish(self):
        value = json.loads(self.line()); self.p.wait(timeout=25)
        h.require(self.p.returncode == 0 and value.get('status') == 'passed' and value.get('mode') == self.mode, 'Fixed SQL probe failed.')
        h.require(not self.buffer.strip() and not self.p.stdout.read(4096).strip() and not self.p.stderr.read(4096).strip(), 'Unexpected SQL diagnostics.')
        return value
    def waiting(self):
        with selectors.DefaultSelector() as selector:
            selector.register(self.p.stdout, selectors.EVENT_READ)
            ready = selector.select(0.25)
        h.require(not ready and self.p.poll() is None and not self.buffer, 'Peer finished before the lock holder released.')

def single(mode):
    child = Child(mode)
    if mode not in ['prepare', 'storage-failure-retry', 'sql-finalize-failure-retry', 'recover-storage-reservation', 'storage-failure-retry-v2']: child.signal('__CHAT_C05_ATTEMPTING__')
    return child.finish()

def pair(left_mode, right_mode):
    left = Child(left_mode); left.signal('__CHAT_C05_ATTEMPTING__'); left.signal('__CHAT_C05_READY__')
    right = Child(right_mode); right.signal('__CHAT_C05_ATTEMPTING__'); right.waiting()
    left.release(); first = left.finish()
    if right_mode.startswith('hold-'):
        right.signal('__CHAT_C05_READY__'); right.release()
    second = right.finish()
    return {'holder': first, 'peer': second, 'independent_processes': True, 'peer_pending_until_holder_release': True}

def run():
    global stage
    h.require(len(sys.argv)==1,'No SQL probe overrides.')
    config=h.runtime_guard();h.database_guard(config);h.checked_path(PROBE)
    before=s.fixture();info=h.control('inspect')
    v.check('attachment write gates ready',info['chat_attachments_enabled'] and info['chat_send_enabled'] and not before['terminal_revocation'])
    results=[]
    try:
        stage='prepare';results.append(single('prepare'))
        for stage,left,right in [('same-upload-key','hold-upload','dedupe-upload'),('bind-before-cancel','hold-bind','try-cancel'),('cancel-before-bind','hold-cancel','try-bind')]:
            results.append(pair(left,right))
        for stage in ['rollback-bind','storage-failure-retry','sql-finalize-failure-retry']:
            results.append(single(stage))
        after=s.fixture()
        v.check('legacy data preserved',after['legacy_hash']==before['legacy_hash'] and after['legacy_preserved'])
        v.check('no unintended read or queue effects',after['read_state']==before['read_state'] and after['native_seen']==before['native_seen'] and after['queue_count']==before['queue_count'])
        v.check('exactly one successful bound message',after['message_count']==before['message_count']+1)
        return {'status':'passed','stage':'complete','database':h.DB,'checks':v.checks,'cases':results,'new_messages':1,'legacy_preserved':True,'credentials_returned':False,'http_requests':0,'real_ai_calls':0,'limitations':['Independent PHP/SQL lock handshakes, not HTTP concurrency.','Injected pre-write and pre-finalize failures; actual unknown database commit outcome not reproduced.']}
    finally:
        for child in children:
            if child.p.poll() is None: child.p.kill();child.p.wait(timeout=10)

if __name__=='__main__':
    try:
        with h.locked():result=run()
    except Exception as e:
        result={'status':'failed','stage':stage,'reason':str(e) if isinstance(e,h.Refusal) else type(e).__name__,'checks':v.checks,'child_transcripts':[{'mode':c.mode,'lines':c.lines} for c in children],'credentials_returned':False}
    h.require(not REPORT.is_symlink(),'Report symlink refused.');REPORT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:value for k,value in result.items() if k not in ['checks','cases','child_transcripts']},ensure_ascii=False));sys.exit(0 if result['status']=='passed' else 1)
