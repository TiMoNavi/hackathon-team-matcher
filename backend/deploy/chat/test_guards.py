#!/usr/bin/env python3
"""Offline only: synthetic files, mocked SQL/processes and PHP pure guards."""
import ast
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
ast.parse((HERE / 'harness.py').read_text())
module_spec = importlib.util.spec_from_file_location('chat_harness_offline', HERE / 'harness.py')
h = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(h)
checks = []

def check(name, condition):
    if not condition: raise AssertionError(name)
    checks.append(name)

def rejects(name, operation):
    try: operation()
    except h.Refusal: checks.append(name); return
    raise AssertionError(name)

config = {**h.spec(), 'password': 'a' * 64, 'cookie_key': 'b' * 64, 'nonce': 'c' * 64, 'modules': list(h.BASE_MODULES)}
check('baseline config', h.validate_config(config) == config)
check('UI config', h.validate_config({**config, 'modules': list(h.UI_MODULES)})['modules'] == h.UI_MODULES)
check('chat config', h.validate_config({**config, 'modules': list(h.CHAT_MODULES)})['modules'] == h.CHAT_MODULES)
for key, value in [('database', 'humhub_preview'), ('username', 'root'), ('host', '0.0.0.0'), ('port', 8113),
                   ('port', '8124'), ('socket', '/tmp/mysql.sock'), ('runtime', '/tmp/arbitrary'), ('spec', 'other'), ('nonce', 'bad')]:
    with patch.object(h, 'mysql', side_effect=AssertionError('Database touched')):
        rejects('target before DB ' + key + str(value), lambda key=key, value=value: h.database_guard({**config, key: value}))
for modules in [[], ['matcher-chat-ui'], list(reversed(h.UI_MODULES)), ['mail', 'matcher-auth'], ['mail', 'matcher-onboarding-ai']]:
    rejects('module list ' + repr(modules), lambda modules=modules: h.validate_config({**config, 'modules': modules}))
rejects('unknown auth option', lambda: h.validate_config({**config, 'auth_mode': True}))
check('real ini newlines', h.mysql_client_config(config).splitlines() == ['[client]', 'user=chat_c02', 'password=' + 'a' * 64, 'socket=' + config['socket']])
with patch.object(h, 'mysql', side_effect=[h.DB, h.SPEC + chr(9) + config['nonce'], h.USER + '@localhost']):
    h.database_guard(config); check('database provenance', True)
with patch.object(h, 'mysql', side_effect=[h.DB, h.SPEC + chr(92) + 't' + config['nonce']]):
    rejects('escaped tab refused', lambda: h.database_guard(config))
with patch.object(h, 'mysql', side_effect=[h.DB, h.SPEC + chr(9) + config['nonce'], 'root@localhost']):
    rejects('limited account cannot be root', lambda: h.database_guard(config))

for sql in ['USE other;', 'CREATE DATABASE other;', 'DROP SCHEMA other;', 'ALTER USER x;', 'GRANT ALL ON *.* TO x;',
            'REVOKE ALL ON *.* FROM x;', 'SOURCE /tmp/other;', 'LOAD DATA INFILE x;', 'SELECT 1; USE other;',
            '/*!50000 DROP DATABASE other */;', 'DROP TABLE other.demo;',
            'DROP TABLE ' + chr(96) + 'other' + chr(96) + '.' + chr(96) + 'demo' + chr(96) + ';',
            "SELECT 1 INTO OUTFILE '/tmp/unowned';", "INSERT INTO x VALUES ('unclosed"]:
    rejects('unsafe dump ' + sql[:40], lambda sql=sql: h.validate_dump(sql))
for sql in ['CREATE TABLE demo (id INT);', "INSERT INTO demo VALUES ('USE other; other.demo');",
            '/* DROP DATABASE other; */ CREATE TABLE demo (id INT);', '/*!40101 SET @x=@@SESSION.SQL_LOG_BIN */;']:
    h.validate_dump(sql); check('literal/native dump allowed', True)
rejects('empty dump', lambda: h.validate_dump(''))
tick = chr(96)
start = 'CREATE TABLE ' + tick + 'demo' + tick + ' (' + chr(10)
column = '  ' + tick + 'value' + tick + ' varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL'
end = chr(10) + ') ENGINE=InnoDB;' + chr(10)
insert = "INSERT INTO demo VALUES ('CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');" + chr(10)
original = start + column + end + insert
expanded = start + column.replace('COLLATE', 'CHARACTER SET utf8mb4 COLLATE') + end + insert
check('redundant charset canonical match', h.dump_fingerprint(original)['canonical_sha256'] == h.dump_fingerprint(expanded)['canonical_sha256'])
check('raw difference reported', h.dump_fingerprint(original)['raw_sha256'] != h.dump_fingerprint(expanded)['raw_sha256'])
check('changed values detected', h.dump_fingerprint(expanded.replace('VALUES (', "VALUES ('changed', "))['canonical_sha256'] != h.dump_fingerprint(original)['canonical_sha256'])
check('changed collation detected', h.dump_fingerprint(expanded.replace('unicode_ci NOT', 'general_ci NOT'))['canonical_sha256'] != h.dump_fingerprint(original)['canonical_sha256'])
check('mismatched charset preserved', h.dump_fingerprint(expanded.replace('SET utf8mb4 COLLATE', 'SET latin1 COLLATE'))['redundant_charset_clauses'] == 0)
payload = {'status': 'passed', 'action': 'install', 'database': h.DB}
framed = 'native output' + h.CONTROL_MARKER + json.dumps(payload)
check('native output framing', h.parse_control_output(framed, 'install') == payload)
for output in ['', json.dumps(payload), framed + h.CONTROL_MARKER + json.dumps(payload), framed + 'noise']:
    rejects('ambiguous control output', lambda output=output: h.parse_control_output(output, 'install'))
for key, value in [('action', 'inspect'), ('database', 'humhub_preview'), ('status', 'failed')]:
    rejects('control result identity ' + key, lambda key=key, value=value: h.parse_control_output(h.CONTROL_MARKER + json.dumps({**payload, key: value}), 'install'))
for pid, free in [(1234, True), (None, False)]:
    with patch.object(h, 'runtime_guard', return_value=config), patch.object(h, 'database_guard'), patch.object(h, 'owned_server', return_value=pid), patch.object(h, 'port_free', return_value=free), patch.object(h, 'run', side_effect=AssertionError('PHP launched')):
        rejects('install requires stopped target', lambda: h.control('install'))
        rejects('UI migration requires stopped target', lambda: h.control('upgrade-ui'))
        rejects('chat migration requires stopped target', lambda: h.control('upgrade-chat'))
for before in [{'baseline_installed': False, 'empty_business_data': True}, {'baseline_installed': True, 'empty_business_data': False}]:
    with patch.object(h, 'runtime_guard', return_value=config), patch.object(h, 'database_guard'), patch.object(h, 'require_stopped'), patch.object(h, 'control', return_value=before), patch.object(h, 'dump_database', side_effect=AssertionError('Unsafe dump')):
        rejects('restore refuses incomplete or nonempty baseline', h.backup_restore)
for action in ['fixture-prepare', 'fixture-inspect']:
    with patch.object(h, 'runtime_guard', return_value={**config, 'modules': list(h.CHAT_MODULES)}), patch.object(h, 'database_guard'), patch.object(h, 'owned_server', return_value=1234), patch.object(h, 'run', side_effect=AssertionError('Fixture launched')):
        rejects('fixed fixture needs stopped server ' + action, lambda action=action: h.fixture(action))
with patch.object(h, 'runtime_guard', return_value=config), patch.object(h, 'database_guard', side_effect=AssertionError('DB touched')):
    rejects('fixture needs chat configuration', lambda: h.fixture('fixture-prepare'))
rejects('no arbitrary fixture action', lambda: h.fixture('login-as-user'))
with patch.dict(os.environ, {'HUMHUB_DB_PASSWORD': 'synthetic', 'MATCHER_KEY': 'synthetic', 'MYSQL_PWD': 'synthetic', 'OPENAI_API_KEY': 'synthetic', 'PHPRC': '/synthetic', 'PHP_INI_SCAN_DIR': '/synthetic'}):
    env = h.clean_environment()
    check('inherited service environment scrubbed', not any(k.startswith(('HUMHUB_', 'MATCHER_', 'MYSQL_', 'OPENAI_')) or k == 'PHPRC' for k in env))
    check('ini scan disabled', env['PHP_INI_SCAN_DIR'] == '')

with tempfile.TemporaryDirectory(prefix='chat-offline-') as temporary:
    base = Path(temporary); runtime = base / '.runtime/chat-upgrade'
    (base / '.runtime').mkdir(mode=0o700); runtime.mkdir(mode=0o700)
    for name in h.SUBDIRS: (runtime / name).mkdir(mode=0o700)
    for name in h.CHAT_MODULES: (base / 'protected/modules' / name).mkdir(parents=True)
    for name in ['Module.php', 'config.php', 'module.json']: (base / 'protected/modules/matcher-chat' / name).write_text('synthetic')
    binaries = base / '.runtime/php-mysql/bin'; binaries.mkdir(parents=True)
    for name in ['php', 'mysql', 'mysqldump']:
        (binaries / name).write_text('synthetic never executed'); (binaries / name).chmod(0o700)
    for value in ['protected/vendor/autoload.php', 'protected/vendor/yiisoft/yii2/Yii.php']:
        path = base / value; path.parent.mkdir(parents=True, exist_ok=True); path.write_text('synthetic')
    sock = socket.socket(socket.AF_UNIX); sock.bind(str(base / '.runtime/mysql.sock'))
    try:
        with patch.object(h, 'BACKEND', base), patch.object(h, 'RUNTIME', runtime):
            fixture = {**h.spec(), 'password': 'a' * 64, 'cookie_key': 'b' * 64, 'nonce': 'c' * 64, 'modules': list(h.BASE_MODULES)}
            h.write_private(runtime / 'private.json', json.dumps(fixture))
            h.write_private(runtime / 'marker.json', json.dumps({**h.spec(), 'nonce': fixture['nonce']}))
            h.write_private(runtime / 'mysql.cnf', h.mysql_client_config(fixture))
            root_cnf = base / '.runtime/mysql-root.cnf'; h.write_private(root_cnf, '[client]' + chr(10) + 'user=root' + chr(10))
            (runtime / 'modules/mail').symlink_to(base / 'protected/modules/mail')
            check('synthetic baseline guards', h.runtime_guard()['modules'] == ['mail'])
            command = h.mysql_command(root=True)
            check('root client isolates defaults and login paths', command[1] == '--defaults-file=' + str(root_cnf) and command[2] == '--no-login-paths' and '--user=root' in command)
            command = h.mysql_command()
            check('limited client options', '--defaults-file=' + str(runtime / 'mysql.cnf') in command and '--user=chat_c02' in command)
            root_cnf.chmod(0o644); rejects('root config mode', lambda: h.mysql_command(root=True)); root_cnf.chmod(0o600)
            with patch.object(h.os, 'geteuid', return_value=os.geteuid() + 1): rejects('root config owner', lambda: h.mysql_command(root=True))
            root_cnf.rename(root_cnf.with_suffix('.real')); root_cnf.symlink_to(root_cnf.with_suffix('.real'))
            rejects('root config symlink', lambda: h.mysql_command(root=True))
            root_cnf.unlink(); root_cnf.with_suffix('.real').rename(root_cnf)
            with patch.object(Path, 'read_text', side_effect=AssertionError('Probe read a private file')), patch.object(h, 'port_free', return_value=True):
                check('probe metadata only', h.probe()['status'] == 'passed')
            ui_link = runtime / 'modules/matcher-chat-ui'; ui_link.symlink_to(base / 'protected/modules/matcher-chat-ui')
            rejects('normal guard rejects pending upgrade link', h.runtime_guard)
            with patch.object(h, 'database_guard'), patch.object(h, 'require_stopped'), patch.object(h, 'control', side_effect=lambda action: {'status': 'passed', 'action': action, 'database': h.DB}):
                check('UI upgrade resumes interrupted link stage', h.upgrade_ui()['configuration_upgraded'] is True)
                check('UI upgrade repeat idempotent', h.upgrade_ui()['configuration_upgraded'] is False)
            check('upgrade preserves file mode', (runtime / 'private.json').stat().st_mode & 0o777 == 0o600)
            check('upgrade preserves mail source', (runtime / 'modules/mail').resolve() == (base / 'protected/modules/mail').resolve())
            ui_link.unlink(); ui_link.symlink_to(base / 'protected/modules/mail')
            rejects('incorrect UI source link', lambda: h.runtime_guard(allow_add=True))
            ui_link.unlink(); ui_link.symlink_to(base / 'protected/modules/matcher-chat-ui')
            chat_link = runtime / 'modules/matcher-chat'; chat_link.symlink_to(base / 'protected/modules/matcher-chat')
            rejects('normal guard rejects pending chat link', h.runtime_guard)
            with patch.object(h, 'database_guard'), patch.object(h, 'require_stopped'), patch.object(h, 'control', side_effect=lambda action: {'status': 'passed', 'action': action, 'database': h.DB}):
                check('chat upgrade resumes interrupted link', h.upgrade_chat()['configuration_upgraded'] is True)
                check('chat upgrade repeat idempotent', h.upgrade_chat()['configuration_upgraded'] is False)
                check('UI upgrade never downgrades chat config', h.upgrade_ui()['configuration_upgraded'] is False and h.runtime_guard()['modules'] == h.CHAT_MODULES)
            identity = str(os.geteuid()) + ' synthetic-start ' + str(base / '.runtime/php-mysql/bin/php') + ' -S 127.0.0.1:8124 ' + str(HERE / 'router.php')
            h.write_private(runtime / 'server.json', json.dumps({'pid': 1234, 'nonce': fixture['nonce'], 'port': h.PORT, 'process_identity': identity}))
            with patch.object(h, 'run', return_value=identity): check('owned process identity', h.owned_server() == 1234)
            with patch.object(h, 'run', return_value=identity.replace('synthetic-start', 'changed-start')): rejects('PID reuse refused', h.owned_server)
            with patch.object(h, 'owned_server', side_effect=h.Refusal('Synthetic mismatch')), patch.object(h.os, 'kill', side_effect=AssertionError('Unowned PID signalled')): rejects('stop rejects other process', h.stop)
    finally:
        sock.close()

source = (HERE / 'harness.py').read_text(); bootstrap = (HERE / 'bootstrap.php').read_text()
check('no control characters', all(ord(c) >= 32 or c in [chr(9), chr(10), chr(13)] for c in source))
check('no cleanup or arbitrary SQL CLI', 'def cleanup(' not in source and "parser.add_argument('--" not in source)
check('no shared overnight imports', 'import overnight' not in source and 'from overnight' not in source)
check('no auth or AI allowlist', h.BASE_MODULES == ['mail'] and h.UI_MODULES == ['mail', 'matcher-chat-ui'])
check('bootstrap excludes main config', 'protected/config' not in bootstrap and 'deploy/app.php' not in bootstrap)
check('session identity and CSRF isolated', "'chat_c02_session'" in bootstrap and "'chat_c02_identity'" in bootstrap and "'csrfParam'] = '_chat_c02_csrf'" in bootstrap and "'name' => '_chat_c02_csrf'" in bootstrap)
check('outbound blocked', 'disable_functions=' + h.BLOCKED_FUNCTIONS in h.php_command() and 'allow_url_fopen=0' in h.php_command())
check('no worker or cron execution', all(x not in source for x in ['queue/listen', 'cron/run']))
php = h.BACKEND / '.runtime/php-mysql/bin/php'
for path in sorted(HERE.glob('*.php')):
    result = subprocess.run([str(php), '-n', '-l', str(path)], capture_output=True, text=True, env=h.clean_environment())
    check('PHP syntax ' + path.name, result.returncode == 0)
result = subprocess.run([str(php), '-n', str(HERE / 'guard_test.php')], capture_output=True, text=True, env=h.clean_environment())
check('PHP pure guards', result.returncode == 0)
php_result = json.loads(result.stdout)
# Exercise the installed Yii header API without constructing an application.
header_test = r'''
require $argv[1]; require $argv[2];
$headers = new \yii\web\HeaderCollection();
$error = new \yii\web\HttpException(405, 'synthetic private detail');
$expected = [[], ['Allow' => 'GET'], [], [], []];
$actual = [chatErrorResponse($error, $headers->get('Allow', [], false))['headers']];
$headers->set('allow', 'GET');
$actual[] = chatErrorResponse($error, $headers->get('Allow', [], false))['headers'];
$headers->add('ALLOW', 'POST');
$actual[] = chatErrorResponse($error, $headers->get('Allow', [], false))['headers'];
$headers->set('Allow', 'GET'); $headers->add('Allow', 'GET');
$actual[] = chatErrorResponse($error, $headers->get('Allow', [], false))['headers'];
$headers->set('Allow', 'POST');
$actual[] = chatErrorResponse($error, $headers->get('Allow', [], false))['headers'];
if ($actual !== $expected) { exit(1); }
echo json_encode(['checks' => count($actual), 'application_created' => Yii::$app !== null]);
'''
result = subprocess.run([str(php), '-n', '-r', header_test,
                         str(h.BACKEND / 'protected/vendor/yiisoft/yii2/Yii.php'), str(HERE / 'guard.php')],
                        capture_output=True, text=True, env=h.clean_environment())
check('installed Yii Allow header contract', result.returncode == 0)
header_result = json.loads(result.stdout)
check('header contract creates no application', header_result['application_created'] is False)
print(json.dumps({'status': 'passed', 'python_checks': len(checks), 'php_guard_checks': php_result['checks'],
                  'yii_header_checks': header_result['checks'],
                  'database_access': False, 'real_credentials_read': False, 'service_started': False, 'checks': checks}, ensure_ascii=False, indent=2))
