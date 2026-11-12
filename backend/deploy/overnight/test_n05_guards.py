#!/usr/bin/env python3
"""Offline N05 fixed-target upgrade checks; no private config, DB or HTTP."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch
sys.dont_write_bytecode = True
import harness as h
import upgrade_n05 as n
checks = []
def check(name, predicate):
    assert predicate, name
    checks.append(name)
def reject(name, callback):
    try:
        callback()
    except h.Refusal:
        checks.append(name)
        return
    raise AssertionError(name)
c = {**h.spec(), 'password':'a'*64, 'cookie_key':'b'*64, 'nonce':'c'*64, 'modules':list(h.N05_MODULES), 'auth_mode':True}
check('N05 exact allowlist accepted', h.validate_config(c) == c)
check('old N04 remains accepted', h.validate_config({**c,'modules':h.MODULES})['modules']==h.MODULES)
for modules in [list(reversed(h.N05_MODULES)),h.N05_MODULES+['matcher-chat'],h.N05_MODULES+['matcher-onboarding-ai'],h.N05_MODULES[:-2]]:
    reject('unreviewed or malformed allowlist rejected',lambda modules=modules:h.validate_config({**c,'modules':modules}))
for pid,free in [(123,True),(None,False)]:
    with patch.object(h,'runtime_guard',return_value=c),patch.object(h,'database_guard'),patch.object(h,'owned_server',return_value=pid),patch.object(h,'port_free',return_value=free),patch.object(h,'dump_database',side_effect=AssertionError('dump touched')):
        reject('running or occupied service blocks upgrade before snapshot',n.upgrade)
with tempfile.TemporaryDirectory(prefix='n05-offline-') as directory:
    base=Path(directory); runtime=base/'.runtime/overnight-integration';folder=runtime/'modules';folder.mkdir(parents=True)
    for name in h.N05_MODULES:
        source=base/'protected/modules'/name;source.mkdir(parents=True)
        (source/'module.json').write_text(json.dumps({'version':n.VERSIONS.get(name,'0.0.0')}))
        (folder/name).symlink_to(source,target_is_directory=True)
    wrong=base/'protected/modules/matcher-auth/module.json';wrong.write_text(json.dumps({'version':'99.0.0'}))
    with patch.object(h,'BACKEND',base),patch.object(h,'RUNTIME',runtime),patch.object(h,'runtime_guard',return_value=c),patch.object(h,'database_guard'),patch.object(h,'owned_server',return_value=None),patch.object(h,'port_free',return_value=True),patch.object(h,'control',side_effect=AssertionError('control touched')),patch.object(h,'dump_database',side_effect=AssertionError('dump touched')):
        reject('unreviewed source version blocks mutation and backup',n.upgrade)
        wrong.write_text(json.dumps({'version':n.VERSIONS['matcher-auth']}))
        (folder/'foreign').mkdir()
        reject('unexpected module tree rejected',n.upgrade)
check('upgrade never restores snapshot', 'h.mysql(snapshot)' not in Path(n.__file__).read_text())
check('upgrade adds only declared event module', h.N05_MODULES==h.MODULES+['matcher-event-access'])
print(json.dumps({'status':'passed','checks':len(checks),'cases':checks,'database':False,'http':False,'secrets_read':False}))
