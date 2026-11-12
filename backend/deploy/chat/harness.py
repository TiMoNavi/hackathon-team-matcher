#!/usr/bin/env python3
"""Fixed-target chat C02/C03 isolation. No arbitrary database, SQL, auth or cleanup entrypoint."""
from __future__ import annotations
import argparse
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import signal
import socket
import stat
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parents[1]
RUNTIME = BACKEND / '.runtime/chat-upgrade'
PRIVATE_FILES = BACKEND / '.runtime/chat-upgrade-files'
DB = 'humhub_chat_c02_20261112'
USER = 'chat_c02'
HOST = '127.0.0.1'
PORT = 8124
SPEC = 'chat-c02-v1'
GUARD = '_chat_c02_guard'
BASE_MODULES = ['mail']
UI_MODULES = ['mail', 'matcher-chat-ui']
CHAT_MODULES = ['mail', 'matcher-chat-ui', 'matcher-chat']
SUBDIRS = ['runtime', 'sessions', 'assets', 'uploads', 'mail', 'cache', 'themes', 'modules', 'backups']
BLOCKED_FUNCTIONS = 'curl_exec,curl_multi_exec,fsockopen,pfsockopen,stream_socket_client,mail'
CONTROL_MARKER = chr(10) + '__CHAT_CONTROL_RESULT__' + chr(10)

class Refusal(RuntimeError):
    pass

def require(condition, message):
    if not condition:
        raise Refusal(message)

def spec():
    return {'spec': SPEC, 'database': DB, 'username': USER, 'host': HOST, 'port': PORT,
            'socket': str(BACKEND / '.runtime/mysql.sock'), 'runtime': str(RUNTIME)}

def validate_config(config):
    require(isinstance(config, dict), 'Invalid isolated configuration.')
    require(set(config) == set(spec()) | {'password', 'cookie_key', 'nonce', 'modules'}, 'Unexpected configuration fields.')
    require(all(type(config.get(k)) is type(v) and config[k] == v for k, v in spec().items()), 'Isolation target mismatch before connection.')
    for key in ['password', 'cookie_key', 'nonce']:
        require(isinstance(config.get(key), str) and re.fullmatch('[a-f0-9]{64}', config[key]), 'Invalid private value shape.')
    require(config.get('modules') in [BASE_MODULES, UI_MODULES, CHAT_MODULES], 'Fixed module allowlist mismatch.')
    return config

def checked_path(path, *, directory=False, mode=None):
    require(path.exists() and not path.is_symlink(), 'Required path is absent or a symlink.')
    info = path.stat()
    require(info.st_uid == os.geteuid(), 'Path owner mismatch.')
    require(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode), 'Unexpected path type.')
    if mode is not None:
        require(stat.S_IMODE(info.st_mode) == mode, 'Private path permissions mismatch.')

def runtime_parent():
    checked_path(BACKEND / '.runtime', directory=True)

def validate_modules(modules, *, allow_add=False):
    folder = RUNTIME / 'modules'
    if folder.exists():
        names = {p.name for p in folder.iterdir()}
        expected = set(CHAT_MODULES if allow_add else modules)
        require(names.issubset(expected), 'Unexpected isolated module tree.')
        require(set(modules).issubset(names), 'Isolated module link is missing.')
    for name in sorted(names) if folder.exists() else modules:
        source = BACKEND / 'protected/modules' / name
        require(source.is_dir() and not source.is_symlink(), 'Fixed module source unavailable.')
        link = folder / name
        if link.is_symlink():
            require(link.resolve(strict=True) == source.resolve(strict=True), 'Isolated module source mismatch.')
        elif link.exists():
            raise Refusal('Isolated module must be a fixed source link.')
        elif not allow_add:
            raise Refusal('Isolated module link is missing.')

def runtime_guard(*, allow_add=False):
    runtime_parent()
    checked_path(RUNTIME, directory=True, mode=0o700)
    for name in SUBDIRS:
        checked_path(RUNTIME / name, directory=True, mode=0o700)
    for name in ['private.json', 'marker.json', 'mysql.cnf']:
        checked_path(RUNTIME / name, mode=0o600)
    config = validate_config(json.loads((RUNTIME / 'private.json').read_text()))
    require(json.loads((RUNTIME / 'marker.json').read_text()) == {**spec(), 'nonce': config['nonce']}, 'Runtime provenance mismatch.')
    require((RUNTIME / 'mysql.cnf').read_text() == mysql_client_config(config), 'Limited client configuration mismatch.')
    validate_modules(config['modules'], allow_add=allow_add)
    return config

def write_private(path, value, *, replace=False):
    require(not path.is_symlink(), 'Symlink output refused.')
    if replace:
        checked_path(path, mode=0o600)
    else:
        require(not path.exists(), 'Existing output refused.')
    temporary = path.with_name(path.name + '.pending-' + secrets.token_hex(12))
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
        if replace:
            checked_path(path, mode=0o600)
        else:
            require(not path.exists() and not path.is_symlink(), 'Output appeared during write.')
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)

def mysql_client_config(config):
    validate_config(config)
    return chr(10).join(['[client]', 'user=' + USER, 'password=' + config['password'], 'socket=' + config['socket'], ''])

def clean_environment():
    env = dict(os.environ)
    for key in list(env):
        if key.startswith(('HUMHUB_', 'MATCHER_', 'MYSQL_', 'OPENAI_')) or key in ['PHPRC', 'PHP_INI_SCAN_DIR', 'MYSQL_PWD']:
            del env[key]
    env['PHP_INI_SCAN_DIR'] = ''
    return env

def run(command, *, input_text=None, timeout=180):
    result = subprocess.run(command, input=input_text, capture_output=True, text=True, timeout=timeout, env=clean_environment())
    require(result.returncode == 0, 'Isolated subprocess failed; private diagnostics suppressed.')
    return result.stdout

def mysql_command(*, root=False, dump=False):
    runtime_parent()
    config_file = BACKEND / '.runtime/mysql-root.cnf' if root else RUNTIME / 'mysql.cnf'
    checked_path(config_file, mode=0o600)
    binary = BACKEND / '.runtime/php-mysql/bin' / ('mysqldump' if dump else 'mysql')
    require(binary.is_file() and not binary.is_symlink() and os.access(binary, os.X_OK), 'Fixed MySQL binary unavailable.')
    sock = BACKEND / '.runtime/mysql.sock'
    require(sock.exists() and not sock.is_symlink() and stat.S_ISSOCK(sock.stat().st_mode), 'Fixed MySQL socket unavailable.')
    return [str(binary), '--defaults-file=' + str(config_file), '--no-login-paths',
            '--protocol=SOCKET', '--socket=' + str(sock), '--user=' + ('root' if root else USER)]

def mysql(statement, *, root=False):
    # No caller-supplied SQL enters the CLI; all callers below use fixed statements or our own dump.
    if not root:
        runtime_guard(allow_add=True if statement.startswith('SELECT ') else False)
    command = mysql_command(root=root) + ['--batch', '--skip-column-names', '--raw', '--database=' + ('information_schema' if root else DB)]
    if root:
        require(run(command, input_text='SELECT CURRENT_USER();').strip() == 'root@localhost', 'Administrative database identity mismatch.')
    return run(command, input_text=statement).strip()

def database_guard(config):
    validate_config(config)
    require(mysql('SELECT DATABASE();') == DB, 'Connected database mismatch.')
    require(mysql('SELECT spec,nonce FROM ' + GUARD + ' WHERE id=1;') == SPEC + chr(9) + config['nonce'], 'Database provenance mismatch.')
    require(mysql('SELECT CURRENT_USER();') == USER + '@localhost', 'Limited database identity mismatch.')

def port_free():
    try:
        with socket.socket() as listener:
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind((HOST, PORT))
        return True
    except OSError:
        return False

def php_command():
    return [str(BACKEND / '.runtime/php-mysql/bin/php'), '-n', '-d', 'extension=mysqlnd.so', '-d', 'extension=pdo_mysql.so',
            '-d', 'extension=gd.so', '-d', 'allow_url_fopen=0', '-d', 'disable_functions=' + BLOCKED_FUNCTIONS,
            '-d', 'display_errors=0', '-d', 'log_errors=0', '-d', 'upload_max_filesize=6M', '-d', 'post_max_size=8M']

def parse_control_output(output, action):
    require(output.count(CONTROL_MARKER) == 1, 'Missing or ambiguous control result; diagnostics suppressed.')
    try:
        value = json.loads(output.partition(CONTROL_MARKER)[2])
    except (TypeError, ValueError):
        raise Refusal('Invalid control result; diagnostics suppressed.')
    require(isinstance(value, dict) and value.get('status') == 'passed' and value.get('action') == action and value.get('database') == DB, 'Control result identity mismatch.')
    return value

def owned_server():
    path = RUNTIME / 'server.json'
    if not path.exists():
        require(not path.is_symlink(), 'Server marker symlink refused.')
        return None
    checked_path(path, mode=0o600)
    record = json.loads(path.read_text())
    require(record.get('nonce') == runtime_guard()['nonce'] and record.get('port') == PORT, 'Server marker provenance mismatch.')
    pid = record.get('pid')
    require(type(pid) is int and pid > 1, 'Invalid owned server PID.')
    try:
        details = run(['ps', '-p', str(pid), '-o', 'uid=', '-o', 'lstart=', '-o', 'command='], timeout=10).strip()
    except Refusal:
        require(port_free(), 'Owned PID absent but port is occupied.')
        return None
    require(details == record.get('process_identity'), 'Server PID identity changed.')
    require(details.split()[0] == str(os.geteuid()) and str(HERE / 'router.php') in details
            and HOST + ':' + str(PORT) in details and str(BACKEND / '.runtime/php-mysql/bin/php') in details, 'Server process is not owned by this harness.')
    return pid

def require_stopped():
    require(owned_server() is None and port_free(), 'Stop the owned chat HTTP server before mutation.')

def control(action):
    require(action in ['install', 'inspect', 'upgrade-ui', 'upgrade-chat', 'ui-on', 'ui-off', 'chat-read-on', 'chat-read-off', 'chat-ui-read-on', 'chat-ui-read-off', 'chat-takeover-on', 'chat-takeover-off', 'chat-send-on', 'chat-send-off', 'chat-attachments-on', 'chat-attachments-off', 'chat-groups-on', 'chat-groups-off'], 'Unsupported control action.')
    config = runtime_guard()
    database_guard(config)
    if action in ['install', 'upgrade-ui', 'upgrade-chat']:
        require_stopped()
    output = run(php_command() + [str(HERE / 'control.php'), action], timeout=300)
    return parse_control_output(output, action)

def provision():
    runtime_parent()
    require(port_free(), 'Fixed chat port is occupied.')
    require(not RUNTIME.is_symlink(), 'Runtime symlink refused.')
    if RUNTIME.exists():
        config = runtime_guard()
        database_guard(config)
        return {'status': 'passed', 'action': 'provision', 'reused_owned_target': True, **spec()}
    for name in BASE_MODULES:
        source = BACKEND / 'protected/modules' / name
        require(source.is_dir() and not source.is_symlink(), 'Fixed baseline source unavailable.')
    require(mysql("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + DB + "';", root=True) == '0', 'Existing database refused.')
    require(mysql("SELECT COUNT(*) FROM mysql.user WHERE User='" + USER + "';", root=True) == '0', 'Existing database account refused.')
    os.umask(0o077)
    RUNTIME.mkdir(mode=0o700)
    for name in SUBDIRS:
        (RUNTIME / name).mkdir(mode=0o700)
    config = {**spec(), 'password': secrets.token_hex(32), 'cookie_key': secrets.token_hex(32), 'nonce': secrets.token_hex(32), 'modules': list(BASE_MODULES)}
    write_private(RUNTIME / 'private.json', json.dumps(config))
    write_private(RUNTIME / 'marker.json', json.dumps({**spec(), 'nonce': config['nonce']}))
    write_private(RUNTIME / 'mysql.cnf', mysql_client_config(config))
    for name in BASE_MODULES:
        (RUNTIME / 'modules' / name).symlink_to(BACKEND / 'protected/modules' / name, target_is_directory=True)
    mysql('CREATE DATABASE `' + DB + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; '
          + "CREATE USER '" + USER + "'@'localhost' IDENTIFIED BY '" + config['password'] + "'; "
          + 'GRANT ALL PRIVILEGES ON `' + DB + "`.* TO '" + USER + "'@'localhost';", root=True)
    mysql('CREATE TABLE ' + GUARD + ' (id INT PRIMARY KEY, spec VARCHAR(64) NOT NULL, nonce CHAR(64) NOT NULL, probe INT NOT NULL DEFAULT 0); '
          + 'INSERT INTO ' + GUARD + " VALUES (1,'" + SPEC + "','" + config['nonce'] + "',0);")
    database_guard(config)
    return {'status': 'passed', 'action': 'provision', 'created_empty_target': True, 'global_grants': False, **spec()}

def upgrade_ui():
    # Allow one known pending link so a crash between link/config writes is safely resumable.
    source = BACKEND / 'protected/modules/matcher-chat-ui'
    require(source.is_dir() and not source.is_symlink(), 'Fixed UI module source unavailable.')
    config = runtime_guard(allow_add=True)
    database_guard(config)
    require_stopped()
    target = RUNTIME / 'modules/matcher-chat-ui'
    if not target.is_symlink():
        target.symlink_to(BACKEND / 'protected/modules/matcher-chat-ui', target_is_directory=True)
    changed = config['modules'] == BASE_MODULES
    if changed:
        write_private(RUNTIME / 'private.json', json.dumps({**config, 'modules': list(UI_MODULES)}), replace=True)
    result = control('upgrade-ui')
    result['configuration_upgraded'] = changed
    return result

def upgrade_chat():
    # Exactly one additional owned data module; no arbitrary module parameter.
    source = BACKEND / 'protected/modules/matcher-chat'
    require(source.is_dir() and not source.is_symlink(), 'Fixed chat module source unavailable.')
    for name in ['Module.php', 'config.php', 'module.json']:
        checked_path(source / name)
    config = runtime_guard(allow_add=True)
    require(config['modules'] in [UI_MODULES, CHAT_MODULES], 'Install the UI baseline before chat.')
    database_guard(config)
    require_stopped()
    target = RUNTIME / 'modules/matcher-chat'
    if not target.is_symlink():
        target.symlink_to(source, target_is_directory=True)
    changed = config['modules'] != CHAT_MODULES
    if changed:
        write_private(RUNTIME / 'private.json', json.dumps({**config, 'modules': list(CHAT_MODULES)}), replace=True)
    result = control('upgrade-chat')
    result['configuration_upgraded'] = changed
    return result

def c05_fixture(action):
    require(action in ['prepare', 'snapshot'], 'Unsupported C05 fixture action.')
    config = runtime_guard(); database_guard(config)
    require(config['modules'] == CHAT_MODULES, 'Fixed chat module set required.')
    if action == 'prepare':
        require_stopped()
    return parse_control_output(run(php_command() + [str(HERE / 'c05-fixture.php'), action], timeout=60), action)

def c07a_fixture(action):
    require(action in ['prepare', 'snapshot'], 'Unsupported C07A fixture action.')
    config = runtime_guard(); database_guard(config)
    require(config['modules'] == CHAT_MODULES, 'Fixed chat module set required.')
    if action == 'prepare': require_stopped()
    return parse_control_output(run(php_command() + [str(HERE / 'c07a-fixture.php'), action], timeout=60), action)

def prepare_private_files(config):
    require_stopped()
    require(not PRIVATE_FILES.is_symlink(), 'Private attachment mount symlink refused.')
    marker = {'spec': 'chat-c05b-files-v1', 'database': DB, 'nonce': config['nonce']}
    if not PRIVATE_FILES.exists():
        PRIVATE_FILES.mkdir(mode=0o700)
        (PRIVATE_FILES / 'data').mkdir(mode=0o700)
        write_private(PRIVATE_FILES / 'marker.json', json.dumps(marker))
    checked_path(PRIVATE_FILES, directory=True, mode=0o700)
    checked_path(PRIVATE_FILES / 'data', directory=True, mode=0o700)
    checked_path(PRIVATE_FILES / 'marker.json', mode=0o600)
    require(json.loads((PRIVATE_FILES / 'marker.json').read_text()) == marker, 'Private attachment mount provenance mismatch.')

def c05b_fixture(action):
    require(action in ['prepare', 'snapshot'], 'Unsupported C05B fixture action.')
    config = runtime_guard(); database_guard(config)
    require(config['modules'] == CHAT_MODULES, 'Fixed chat module set required.')
    if action == 'prepare': prepare_private_files(config)
    return parse_control_output(run(php_command() + [str(HERE / 'c05b-fixture.php'), action], timeout=60), action)

def start():
    require(control('inspect').get('baseline_installed') is True, 'Install the fixed chat baseline before starting HTTP.')
    pid = owned_server()
    if pid:
        return {'status': 'passed', 'action': 'start', 'pid': pid, 'already_running': True}
    require(port_free(), 'Fixed chat port is occupied.')
    process = subprocess.Popen(php_command() + ['-S', HOST + ':' + str(PORT), '-t', str(RUNTIME), str(HERE / 'router.php')],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=clean_environment(), start_new_session=True)
    try:
        identity = run(['ps', '-p', str(process.pid), '-o', 'uid=', '-o', 'lstart=', '-o', 'command='], timeout=10).strip()
        marker = RUNTIME / 'server.json'
        write_private(marker, json.dumps({'pid': process.pid, 'nonce': runtime_guard()['nonce'], 'port': PORT, 'process_identity': identity}), replace=marker.exists())
        for _ in range(50):
            require(process.poll() is None, 'Owned chat HTTP process exited.')
            if not port_free():
                require(owned_server() == process.pid, 'Owned listener identity changed.')
                return {'status': 'passed', 'action': 'start', 'pid': process.pid, 'port': PORT, 'worker_started': False}
            time.sleep(0.1)
        raise Refusal('Owned chat HTTP readiness timed out.')
    except Exception:
        # This exact Popen child was created here; never signal an unrelated PID.
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
        raise

def fixture(action):
    require(action in ['fixture-prepare', 'fixture-inspect'], 'Unknown fixed fixture action.')
    config = runtime_guard()
    require(config['modules'] == CHAT_MODULES, 'The fixed chat upgrade is required.')
    database_guard(config)
    require_stopped()
    return parse_control_output(run(php_command() + [str(HERE / 'fixture.php'), action], timeout=300), action)

def stop():
    runtime_guard()
    pid = owned_server()
    if pid:
        os.kill(pid, signal.SIGTERM)
        for _ in range(50):
            if port_free():
                break
            time.sleep(0.1)
    require(port_free(), 'Chat port still occupied; no other process was signalled.')
    (RUNTIME / 'server.json').unlink(missing_ok=True)
    return {'status': 'passed', 'action': 'stop', 'owned_pid_stopped': pid, 'port': PORT}

def dump_code(snapshot):
    """Limited lexical defense for self-generated one-database dumps, not arbitrary SQL."""
    output = []; i = 0
    while i < len(snapshot):
        c = snapshot[i]
        if c in [chr(39), chr(34), chr(96)]:
            quote = c; i += 1; closed = False
            while i < len(snapshot):
                if snapshot[i] == chr(92) and quote != chr(96): i += 2; continue
                if snapshot[i] == quote:
                    if i + 1 < len(snapshot) and snapshot[i + 1] == quote: i += 2; continue
                    i += 1; closed = True; break
                i += 1
            require(closed, 'Unterminated backup token.')
            output.append(' quoted_identifier ' if quote == chr(96) else ' literal ')
        elif snapshot.startswith('/*', i):
            end = snapshot.find('*/', i + 2); require(end >= 0, 'Unterminated backup comment.')
            if snapshot.startswith('/*!', i):
                output.append(' ' + dump_code(re.sub(r'^[0-9]{5,6}[ ]*', '', snapshot[i + 3:end])) + ' ')
            else: output.append(' ')
            i = end + 2
        elif c == '#' or (snapshot.startswith('--', i) and (i + 2 == len(snapshot) or snapshot[i + 2].isspace())):
            end = snapshot.find(chr(10), i); i = len(snapshot) if end < 0 else end + 1; output.append(' ')
        else: output.append(c); i += 1
    return ''.join(output)

def validate_dump(snapshot):
    require(isinstance(snapshot, str) and snapshot.strip(), 'Empty backup refused.')
    code = dump_code(snapshot)
    slash = chr(92)
    forbidden = '(?im)(?:^|;)' + slash + 's*(?:USE' + slash + 's|(?:CREATE|DROP|ALTER)' + slash + 's+(?:DATABASE|SCHEMA|USER)' + slash + 'b|GRANT' + slash + 's|REVOKE' + slash + 's|SOURCE' + slash + 's|LOAD' + slash + 's+DATA' + slash + 'b)'
    require(not re.search(forbidden, code), 'Cross-target backup statement refused.')
    qualified = '(?<![' + slash + 'w@])' + slash + 'b[A-Za-z_][A-Za-z0-9_$]*' + slash + 's*[.]' + slash + 's*[A-Za-z_][A-Za-z0-9_$]*' + slash + 'b'
    require(not re.search(qualified, code), 'Qualified backup identifier refused.')
    require(not re.search('(?i)' + slash + 'bINTO' + slash + 's+(?:OUTFILE|DUMPFILE)' + slash + 'b', code), 'Filesystem output statement refused.')

def dump_fingerprint(snapshot):
    # Normalize only redundant charset text in unquoted string-column DDL.
    tick = re.escape(chr(96)); ident = tick + '[A-Za-z0-9_]+' + tick
    start = re.compile('^CREATE TABLE ' + ident + ' [(]', re.I)
    column = re.compile('^[ ' + chr(9) + ']+' + ident + '[ ' + chr(9) + ']+(?:varchar[(][0-9]+[)]|char[(][0-9]+[)]|(?:tiny|medium|long)?text)[ ' + chr(9) + ']+'
                        '(?P<remove>CHARACTER[ ' + chr(9) + ']+SET[ ' + chr(9) + ']+(?P<charset>[A-Za-z0-9_]+)[ ' + chr(9) + ']+)'
                        'COLLATE[ ' + chr(9) + ']+(?P<collation>[A-Za-z0-9_]+)' + chr(92) + 'b', re.I)
    inside = False; changes = 0; output = []
    for line in snapshot.splitlines(keepends=True):
        if start.match(line): inside = True
        elif inside and line.startswith(')'): inside = False
        elif inside:
            match = column.match(line)
            if match and match['collation'].lower().startswith(match['charset'].lower() + '_'):
                line = line[:match.start('remove')] + line[match.end('remove'):]; changes += 1
        output.append(line)
    return {'raw_sha256': hashlib.sha256(snapshot.encode()).hexdigest(), 'canonical_sha256': hashlib.sha256(''.join(output).encode()).hexdigest(),
            'canonicalization': 'redundant-column-charset-v1', 'redundant_charset_clauses': changes}

def dump_database():
    database_guard(runtime_guard())
    return run(mysql_command(dump=True) + ['--single-transaction', '--skip-lock-tables', '--skip-comments', '--skip-dump-date',
               '--skip-extended-insert', '--skip-triggers', '--skip-routines', '--skip-events', '--no-tablespaces', '--set-gtid-purged=OFF', DB], timeout=300)

def backup_restore():
    config = runtime_guard(); database_guard(config); require_stopped()
    before = control('inspect')
    require(before.get('baseline_installed') is True, 'Install the fixed chat baseline before backup/restore.')
    require(before.get('empty_business_data') is True, 'Restore is restricted to the empty C02/C03 business baseline.')
    snapshot = dump_database(); validate_dump(snapshot); fingerprint = dump_fingerprint(snapshot)
    stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + secrets.token_hex(5)
    folder = RUNTIME / 'backups' / stamp; folder.mkdir(mode=0o700)
    write_private(folder / 'database.sql', snapshot)
    write_private(folder / 'manifest.json', json.dumps({'database': DB, 'spec': SPEC, **fingerprint}))
    original = mysql('SELECT probe FROM ' + GUARD + ' WHERE id=1;')
    mysql('UPDATE ' + GUARD + ' SET probe=probe+1 WHERE id=1;')
    require(mysql('SELECT probe FROM ' + GUARD + ' WHERE id=1;') != original, 'Restore probe did not change.')
    require(hashlib.sha256((folder / 'database.sql').read_bytes()).hexdigest() == fingerprint['raw_sha256'], 'Owned backup changed.')
    require_stopped(); database_guard(config)
    require(control('inspect').get('empty_business_data') is True, 'Business data appeared before restore.')
    mysql(snapshot)
    database_guard(config)
    require(mysql('SELECT probe FROM ' + GUARD + ' WHERE id=1;') == original, 'Restore probe mismatch.')
    restored = dump_fingerprint(dump_database())
    require(fingerprint['canonical_sha256'] == restored['canonical_sha256'], 'Restored schema/data mismatch.')
    require(control('inspect') == before, 'Restored application state mismatch.')
    result = {'status': 'passed', 'action': 'backup-restore', 'database': DB, 'empty_baseline_only': True,
              'probe_restored': True, 'inspection_equal': True, 'backup_fingerprint': fingerprint, 'restored_fingerprint': restored,
              'raw_dumps_equal': fingerprint['raw_sha256'] == restored['raw_sha256'], 'canonical_schema_data_equal': True}
    write_private(folder / 'verification.json', json.dumps(result))
    return result

def probe():
    # Metadata only. Never read the root option file or open the database socket.
    checks = {}
    checks['runtime_parent'] = (BACKEND / '.runtime').is_dir() and not (BACKEND / '.runtime').is_symlink()
    for name in ['php', 'mysql', 'mysqldump']:
        path = BACKEND / '.runtime/php-mysql/bin' / name
        checks[name + '_executable'] = path.is_file() and not path.is_symlink() and os.access(path, os.X_OK)
    for name, value in [('autoload', 'protected/vendor/autoload.php'), ('yii', 'protected/vendor/yiisoft/yii2/Yii.php')]:
        path = BACKEND / value
        checks[name + '_available'] = path.is_file() and not path.is_symlink()
    root_config = BACKEND / '.runtime/mysql-root.cnf'
    try:
        checked_path(root_config, mode=0o600)
        checks['root_client_metadata_valid'] = True
    except Refusal:
        checks['root_client_metadata_valid'] = False
    sock = BACKEND / '.runtime/mysql.sock'
    checks['socket_available'] = sock.exists() and not sock.is_symlink() and stat.S_ISSOCK(sock.stat().st_mode)
    checks['port_free'] = port_free()
    return {'status': 'passed' if all(checks.values()) else 'unavailable', 'action': 'probe', **spec(),
            'checks': checks, 'database_connected': False, 'credential_contents_read': False}

@contextlib.contextmanager
def locked():
    runtime_parent(); path = BACKEND / '.runtime/chat-upgrade.lock'
    require(not path.is_symlink(), 'Lock symlink refused.')
    if path.exists(): checked_path(path, mode=0o600)
    fd = os.open(path, os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(fd, 'a') as stream:
        checked_path(path, mode=0o600)
        fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['probe', 'provision', 'install', 'inspect', 'upgrade-ui', 'upgrade-chat', 'ui-on', 'ui-off', 'chat-read-on', 'chat-read-off', 'chat-ui-read-on', 'chat-ui-read-off', 'chat-takeover-on', 'chat-takeover-off', 'chat-send-on', 'chat-send-off', 'chat-attachments-on', 'chat-attachments-off', 'chat-groups-on', 'chat-groups-off', 'fixture-prepare', 'fixture-inspect', 'c05-prepare', 'c05-inspect', 'c05b-prepare', 'c05b-inspect', 'c07a-prepare', 'c07a-inspect', 'backup-restore', 'start', 'stop'])
    action = parser.parse_args().action
    if action == 'probe':
        result = probe()
    else:
        with locked():
            operations = {'provision': provision, 'install': lambda: control('install'), 'inspect': lambda: control('inspect'),
                          'upgrade-ui': upgrade_ui, 'upgrade-chat': upgrade_chat, 'ui-on': lambda: control('ui-on'), 'ui-off': lambda: control('ui-off'),
                          'chat-read-on': lambda: control('chat-read-on'), 'chat-read-off': lambda: control('chat-read-off'),
                          'chat-ui-read-on': lambda: control('chat-ui-read-on'), 'chat-ui-read-off': lambda: control('chat-ui-read-off'),
                          'chat-takeover-on': lambda: control('chat-takeover-on'), 'chat-takeover-off': lambda: control('chat-takeover-off'),
                          'chat-send-on': lambda: control('chat-send-on'), 'chat-send-off': lambda: control('chat-send-off'),
                          'chat-attachments-on': lambda: control('chat-attachments-on'), 'chat-attachments-off': lambda: control('chat-attachments-off'),
                          'chat-groups-on': lambda: control('chat-groups-on'), 'chat-groups-off': lambda: control('chat-groups-off'),
                          'c07a-prepare': lambda: c07a_fixture('prepare'), 'c07a-inspect': lambda: c07a_fixture('snapshot'),
                          'fixture-prepare': lambda: fixture('fixture-prepare'), 'fixture-inspect': lambda: fixture('fixture-inspect'),
                          'c05-prepare': lambda: c05_fixture('prepare'), 'c05-inspect': lambda: c05_fixture('snapshot'),
                          'c05b-prepare': lambda: c05b_fixture('prepare'), 'c05b-inspect': lambda: c05b_fixture('snapshot'),
                          'backup-restore': backup_restore, 'start': start, 'stop': stop}
            result = operations[action]()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result.get('status') != 'passed':
        sys.exit(1)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'failed', 'type': type(error).__name__,
                          'reason': str(error) if isinstance(error, Refusal) else 'Chat harness failed; private diagnostics suppressed.'}), file=sys.stderr)
        sys.exit(1)
