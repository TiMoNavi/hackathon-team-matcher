#!/usr/bin/env python3
"""Preserve the owned nonempty fixture, close gates, stop only our server, repeat upgrade."""
import json
import sys
import verify_reading as v
h=v.h
stage='guard'
try:
    h.require(len(sys.argv)==1,'No shutdown overrides.')
    with h.locked():
        config=h.runtime_guard();h.database_guard(config)
        before=v.snapshot();info=h.control('inspect')
        v.check('nonempty owned fixture',info['counts']['user']==3 and info['counts']['message_entry']==8 and not info['empty_business_data'])
        stage='close-isolated-gates'
        h.control('chat-ui-read-off');h.control('chat-read-off')
        stage='stop-owned-server'
        stopped=h.stop()
        v.check('only owned server stopped',h.owned_server() is None and h.port_free())
        stage='repeat-upgrade-with-data'
        upgraded=h.upgrade_chat()
        v.check('repeat upgrade retains migration and records',upgraded['counts']==info['counts'] and upgraded['counts']==h.control('inspect')['counts'])
        v.check('repeat upgrade preserves owned chat snapshot',v.snapshot()==before)
        stage='nonempty-restore-refusal'
        refused=False
        try: h.backup_restore()
        except h.Refusal as exc: refused=str(exc)=='Restore is restricted to the empty C02/C03 business baseline.'
        v.check('nonempty restore refused before dump mutation',refused)
        v.check('refusal preserves chat snapshot',v.snapshot()==before)
        final=h.control('inspect')
        v.check('isolated read gates off',not final['chat_read_enabled'] and not final['chat_ui_read_enabled'])
        v.check('mail and protection retained',final['modules']['mail']['enabled'] and final['modules']['matcher-chat']['enabled'])
        report={'status':'passed','database':h.DB,'port':h.PORT,'server_stopped':True,'read_gates_disabled':True,
            'nonempty_restore_refused':True,'repeat_upgrade_with_data':True,'data_preserved':True,
            'no_cleanup_or_module_disable':True,'checks':v.checks,'final_inspection':final}
        (h.BACKEND.parent/'docs/群聊模块升级/sources/c04-final-runtime_2026-11-12.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({k:value for k,value in report.items() if k not in ['checks','final_inspection']}))
except Exception as exc:
    print(json.dumps({'status':'failed','stage':stage,'reason':str(exc) if isinstance(exc,h.Refusal) else type(exc).__name__}));sys.exit(1)
