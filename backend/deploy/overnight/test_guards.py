#!/usr/bin/env python3
"""Offline target/transport checks. No database, service, secret, or preview access."""
import ast
import copy
import importlib.util
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import tempfile
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
ast.parse((HERE / 'harness.py').read_text())
spec = importlib.util.spec_from_file_location('overnight_harness', HERE / 'harness.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
checks = []

def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append(name)

def rejects(name, operation):
    try:
        operation()
    except h.Refusal:
        checks.append(name)
        return
    raise AssertionError(name)

config = {**h.spec(), 'password': 'a' * 64, 'cookie_key': 'b' * 64, 'nonce': 'c' * 64, 'modules': list(h.MODULES)}
check('valid fixed target accepted', h.validate_config(config) == config)
legacy = {**config, 'modules': list(h.LEGACY_MODULES)}
check('exact legacy module target remains valid for guarded upgrade', h.validate_config(legacy) == legacy)
for modules in [list(reversed(h.MODULES)), ['matcher-webapp'], h.LEGACY_MODULES[:-1] + ['matcher-webapp'], h.MODULES + ['arbitrary-plugin']]:
    rejects('reject incomplete reordered or extended module list', lambda modules=modules: h.validate_config({**config, 'modules': modules}))
for key, wrong in [('database', 'humhub'), ('username', 'root'), ('host', '0.0.0.0'), ('port', 8090),
                   ('socket', '/tmp/mysql.sock'), ('runtime', '/tmp/elsewhere'), ('spec', 'unknown'),
                   ('nonce', 'invalid'), ('password', "unsafe'password"), ('modules', h.MODULES + ['matcher-onboarding-ai'])]:
    bad = copy.deepcopy(config)
    bad[key] = wrong
    with patch.object(h, 'mysql', side_effect=AssertionError('database was touched')):
        rejects('reject ' + key + ' before DB', lambda: h.database_guard(bad))
with patch.object(h, 'mysql', side_effect=[h.DB, h.SPEC + chr(92) + 't' + config['nonce']]):
    rejects('literal escaped tab is not a valid result delimiter', lambda: h.database_guard(config))
with patch.object(h, 'mysql', side_effect=[h.DB, h.SPEC + chr(9) + config['nonce']]) as fake_mysql:
    h.database_guard(config)
    check('database identity uses distinct mysql columns', fake_mysql.call_args.args[0] == 'SELECT spec,nonce FROM ' + h.GUARD + ' WHERE id=1;')
ini = h.mysql_client_config(config)
check('mysql config has real lines', ini.splitlines() == ['[client]', 'user=' + h.USER, 'password=' + 'a' * 64, 'socket=' + config['socket']])
check('mysql config contains no literal escape delimiter', r'\n' not in ini)
for statement in ['USE humhub;', '  CREATE DATABASE humhub;', '\nDROP DATABASE humhub;', '\tGRANT ALL ON *.* TO x;', 'CREATE USER x;', 'SOURCE /tmp/a.sql;']:
    rejects('reject dump ' + statement.strip().split()[0], lambda: h.validate_dump(statement))
for statement in ['/*!50000 DROP DATABASE synthetic_other */;', 'CREATE SCHEMA synthetic_other;',
                  'DROP TABLE synthetic_other.demo;', 'DROP TABLE ' + chr(96) + 'synthetic_other' + chr(96) + '.' + chr(96) + 'demo' + chr(96) + ';',
                  'SELECT 1; USE humhub;', 'ALTER SCHEMA humhub DEFAULT CHARACTER SET utf8;',
                  "SELECT 1 INTO OUTFILE '/tmp/unowned';"]:
    rejects('dump rejects extended cross-target syntax', lambda statement=statement: h.validate_dump(statement))
for statement in ["INSERT INTO safe VALUES ('DROP TABLE synthetic_other.demo; CREATE SCHEMA x;');",
                  '/* DROP DATABASE other; */ CREATE TABLE safe (id INT);',
                  '/*!40101 SET @saved = @@SESSION.SQL_LOG_BIN */; CREATE TABLE safe (id INT);',
                  "INSERT INTO safe VALUES ('a.example.org', 'USE humhub;');"]:
    h.validate_dump(statement)
    check('dump allows quoted data and ordinary native directives', True)
for pid, available, label in [(123, True, 'owned server'), (None, False, 'occupied port')]:
    with patch.object(h, 'runtime_guard', return_value=config), patch.object(h, 'database_guard'), patch.object(h, 'owned_server', return_value=pid), patch.object(h, 'port_free', return_value=available), patch.object(h.subprocess, 'run', side_effect=AssertionError('PHP control was launched')):
        rejects('install refuses ' + label + ' before PHP', lambda: h.control('install'))
        rejects('sync control refuses ' + label + ' before PHP', lambda: h.control('sync-modules'))
        rejects('sync config refuses ' + label + ' before mutation', h.sync_modules)
for action in ['ui-on', 'ui-off']:
    output = h.CONTROL_MARKER + json.dumps({'status': 'passed', 'action': action, 'database': h.DB})
    with patch.object(h, 'runtime_guard', return_value=config), patch.object(h, 'database_guard'), patch.object(h, 'owned_server', side_effect=AssertionError('UI toggle checked service shutdown')), patch.object(h.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, output, '')):
        check('fixed ' + action + ' allowed while HTTP is running', h.control(action)['action'] == action)
with tempfile.TemporaryDirectory(prefix='overnight-n03-offline-') as temporary:
    base = Path(temporary)
    runtime = base / '.runtime/overnight-integration'
    modules = runtime / 'modules'
    modules.mkdir(parents=True)
    for name in h.MODULES:
        (base / 'protected/modules' / name).mkdir(parents=True)
    for name in h.LEGACY_MODULES:
        (modules / name).symlink_to(base / 'protected/modules' / name, target_is_directory=True)
    with patch.object(h, 'BACKEND', base), patch.object(h, 'RUNTIME', runtime):
        fixture = {**h.spec(), 'password': 'a' * 64, 'cookie_key': 'b' * 64, 'nonce': 'c' * 64, 'modules': list(h.LEGACY_MODULES)}
        private = runtime / 'private.json'
        h.write_private(private, json.dumps(fixture))
        with patch.object(h, 'runtime_guard', side_effect=lambda: h.validate_config(json.loads(private.read_text()))), patch.object(h, 'database_guard'), patch.object(h, 'owned_server', return_value=None), patch.object(h, 'port_free', return_value=True), patch.object(h, 'control', side_effect=lambda action: {'status': 'passed', 'action': action, 'database': h.DB}):
            first = h.sync_modules()
            check('sync performs fixed additive transition', first['configuration_upgraded'] and json.loads(private.read_text())['modules'] == h.MODULES)
            check('sync creates only fixed source link', (modules / 'matcher-webapp').resolve() == (base / 'protected/modules/matcher-webapp').resolve())
            check('sync preserves private file mode', (private.stat().st_mode & 0o777) == 0o600)
            check('repeat sync is idempotent', h.sync_modules()['configuration_upgraded'] is False)
            (modules / 'arbitrary-plugin').mkdir()
            rejects('sync rejects unexpected module tree', h.sync_modules)
            (modules / 'arbitrary-plugin').rmdir()
            (modules / 'matcher-webapp').unlink()
            (modules / 'matcher-webapp').symlink_to(base / 'protected/modules/mail')
            rejects('sync rejects mismatched existing source link', h.sync_modules)
            with patch.object(h, 'database_guard', side_effect=h.Refusal('Synthetic nonce mismatch.')), patch.object(h, 'replace_private', side_effect=AssertionError('Configuration mutated')):
                rejects('sync verifies database provenance before mutation', h.sync_modules)
h.validate_dump('CREATE TABLE safe (id INT);\nINSERT INTO safe VALUES (1);')
check('safe single database dump allowed', True)
rejects('empty dump rejected', lambda: h.validate_dump(''))
with patch.dict(os.environ, {'HUMHUB_DB_PASSWORD': 'synthetic', 'MATCHER_AI_SECRET': 'synthetic', 'MYSQL_PWD': 'synthetic', 'OPENAI_API_KEY': 'synthetic', 'PHPRC': '/fake'}):
    env = h.clean_environment()
    check('external environment removed', not any(k.startswith(('HUMHUB_', 'MATCHER_', 'MYSQL_', 'OPENAI_')) or k == 'PHPRC' for k in env))
    check('PHP config scan disabled', env['PHP_INI_SCAN_DIR'] == '')
payload = {'status': 'passed', 'action': 'install', 'database': h.DB}
framed = 'native migration chatter' + h.CONTROL_MARKER + json.dumps(payload)
check('framed result survives native stdout', h.parse_control_output(framed, 'install') == payload)
for name, value in [('empty', ''), ('no marker', json.dumps(payload)),
                    ('multiple markers', framed + h.CONTROL_MARKER + json.dumps(payload)),
                    ('trailing noise', framed + 'untrusted trailing bytes'),
                    ('invalid json', h.CONTROL_MARKER + '{')]:
    rejects('result rejects ' + name, lambda value=value: h.parse_control_output(value, 'install'))
for key, wrong in [('action', 'inspect'), ('database', 'humhub'), ('status', 'failed')]:
    bad = dict(payload); bad[key] = wrong
    rejects('result rejects wrong ' + key, lambda bad=bad: h.parse_control_output(h.CONTROL_MARKER + json.dumps(bad), 'install'))
tick = chr(96)
column_name = tick + 'spec' + tick
base_column = '  ' + column_name + ' varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL'
explicit_column = base_column.replace('COLLATE', 'CHARACTER SET utf8mb4 COLLATE')
create_start = 'CREATE TABLE ' + tick + 'synthetic' + tick + ' (' + chr(10)
create_end = chr(10) + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;' + chr(10)
data_line = "INSERT INTO synthetic VALUES ('CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');" + chr(10)
original_dump = create_start + base_column + create_end + data_line
restored_dump = create_start + explicit_column + create_end + data_line
original_fp = h.dump_fingerprint(original_dump)
restored_fp = h.dump_fingerprint(restored_dump)
check('charset rendering changes raw digest', original_fp['raw_sha256'] != restored_fp['raw_sha256'])
check('redundant matching column charset has equal canonical digest', original_fp['canonical_sha256'] == restored_fp['canonical_sha256'])
check('normalization count is reported', original_fp['redundant_charset_clauses'] == 0 and restored_fp['redundant_charset_clauses'] == 1)
check('INSERT string content remains verbatim', h.canonical_dump(restored_dump)[0].endswith(data_line))
changed_data = restored_dump.replace("VALUES ('CHARACTER", "VALUES ('changed CHARACTER")
check('actual INSERT change changes canonical digest', h.dump_fingerprint(changed_data)['canonical_sha256'] != original_fp['canonical_sha256'])
changed_collation = restored_dump.replace('COLLATE utf8mb4_unicode_ci NOT NULL', 'COLLATE utf8mb4_general_ci NOT NULL')
check('actual collation change changes canonical digest', h.dump_fingerprint(changed_collation)['canonical_sha256'] != original_fp['canonical_sha256'])
mismatched_charset = restored_dump.replace('CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL', 'CHARACTER SET latin1 COLLATE utf8mb4_unicode_ci NOT NULL')
check('mismatched charset is never removed', h.dump_fingerprint(mismatched_charset)['redundant_charset_clauses'] == 0)
check('datatype change remains visible', h.dump_fingerprint(restored_dump.replace('varchar(64)', 'varchar(128)'))['canonical_sha256'] != original_fp['canonical_sha256'])
check('column-like text outside CREATE TABLE unchanged', h.canonical_dump(explicit_column + chr(10))[0] == explicit_column + chr(10))
default_clause = " DEFAULT 'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'"
check('quoted column default preserved', default_clause in h.canonical_dump(create_start + explicit_column + default_clause + create_end)[0])
for datatype in ['char(36)', 'text', 'tinytext', 'mediumtext', 'longtext']:
    a = original_dump.replace('varchar(64)', datatype)
    b = restored_dump.replace('varchar(64)', datatype)
    check('supported string column rendering ' + datatype, h.dump_fingerprint(a)['canonical_sha256'] == h.dump_fingerprint(b)['canonical_sha256'])
# Real loopback sockets use an ephemeral port, never the actual harness listener.
listener = socket.socket()
listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
listener.bind(('127.0.0.1', 0))
local_port = listener.getsockname()[1]
listener.listen(1)
try:
    with patch.object(h, 'PORT', local_port):
        check('port probe refuses active reusable listener', h.port_free() is False)
    client = socket.socket()
    client.settimeout(3)
    client.connect(('127.0.0.1', local_port))
    accepted, _ = listener.accept()
    accepted.settimeout(3)
    try:
        accepted.shutdown(socket.SHUT_WR)
        check('server actively closes loopback connection', client.recv(1) == b'')
        client.close()
        check('peer close completes handshake', accepted.recv(1) == b'')
    finally:
        accepted.close()
        client.close()
finally:
    listener.close()
try:
    with socket.socket() as bare:
        bare.bind(('127.0.0.1', local_port))
    bare_bound = True
except OSError:
    bare_bound = False
check('plain bind reproduces TIME_WAIT refusal', bare_bound is False)
with patch.object(h, 'PORT', local_port):
    check('port probe accepts stopped listener with TIME_WAIT', h.port_free() is True)
check('port probe never sets REUSEPORT', 'SO_REUSEPORT' not in (HERE / 'harness.py').read_text())
php = h.BACKEND / '.runtime/php-mysql/bin/php'
for file in sorted(HERE.glob('*.php')):
    result = subprocess.run([str(php), '-n', '-l', str(file)], capture_output=True, text=True)
    check('PHP syntax ' + file.name, result.returncode == 0)
result = subprocess.run([str(php), '-n', str(HERE / 'guard_test.php')], capture_output=True, text=True)
check('PHP target/request guard behavior', result.returncode == 0)
php_checks = json.loads(result.stdout)['checks']
check('PHP bootstrap excludes private application configs', "protected/config" not in (HERE / 'bootstrap.php').read_text() and "deploy/app.php" not in (HERE / 'bootstrap.php').read_text())
check('providers excluded from allowlist', not any(x in h.MODULES for x in ['matcher-onboarding-ai', 'matcher-recommendation-ai', 'matcher-github-import', 'matcher-web-import']))
check('no queue or cron start path', all(x not in (HERE / 'harness.py').read_text() for x in ['queue/listen', 'cron/run']))
print(json.dumps({'status': 'passed', 'python_checks': len(checks), 'php_guard_checks': php_checks, 'checks': checks, 'database_access': False, 'service_started': False, 'secrets_read': False}, ensure_ascii=False, indent=2))
