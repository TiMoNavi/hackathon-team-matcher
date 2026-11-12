#!/usr/bin/env python3
"""Fixed-target N01 isolation harness. Never loads or clones preview application data."""
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
import shutil
import signal
import socket
import stat
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parents[1]
RUNTIME = BACKEND / '.runtime/overnight-integration'
DB = 'humhub_overnight_n01_20261112'
USER = 'overnight_n01'
HOST = '127.0.0.1'
PORT = 8113
SPEC = 'overnight-n01-v1'
GUARD = '_overnight_n01_guard'
LEGACY_MODULES = ['auth-github', 'mail', 'matcher-user-profile', 'matcher-profile-privacy',
                  'matcher-onboarding', 'matcher-resume-import', 'matcher-recommendation', 'matcher-ideas']
N03_MODULES = LEGACY_MODULES + ['matcher-webapp']
MODULES = N03_MODULES + ['matcher-github-import', 'matcher-auth']
N05_MODULES = MODULES + ['matcher-event-access']
SUBDIRS = ['runtime', 'sessions', 'assets', 'uploads', 'mail', 'cache', 'themes', 'modules', 'backups']
BLOCKED_FUNCTIONS = 'curl_exec,curl_multi_exec,fsockopen,pfsockopen,stream_socket_client,mail'

class Refusal(RuntimeError):
    pass

def require(value, message):
    if not value:
        raise Refusal(message)

def spec():
    return {'spec': SPEC, 'database': DB, 'username': USER, 'host': HOST, 'port': PORT,
            'socket': str(BACKEND / '.runtime/mysql.sock'), 'runtime': str(RUNTIME)}

def validate_config(config):
    require(isinstance(config, dict), 'Invalid isolated configuration.')
    require(all(config.get(k) == v for k, v in spec().items()), 'Isolation target mismatch; refusing before database access.')
    for key in ['password', 'cookie_key', 'nonce']:
        require(isinstance(config.get(key), str) and re.fullmatch('[a-f0-9]{64}', config[key]), 'Invalid private configuration shape.')
    require(config.get('modules') in [LEGACY_MODULES, N03_MODULES, MODULES, N05_MODULES], 'Module allowlist mismatch.')
    require(type(config.get('auth_mode', False)) is bool, 'Invalid authentication mode.')
    require(not config.get('auth_mode', False) or config.get('modules') in [MODULES, N05_MODULES], 'Authentication requires the fixed N04 or N05 modules.')
    return config


def mysql_client_config(config):
    validate_config(config)
    return chr(10).join(['[client]', 'user=' + USER, 'password=' + config['password'], 'socket=' + config['socket'], ''])

def dump_code_without_literals(snapshot):
    # Limited lexical defense for our own mysqldump output, not an arbitrary SQL parser.
    code = []
    index = 0
    while index < len(snapshot):
        char = snapshot[index]
        if char in ["'", '"', chr(96)]:
            quote = char
            index += 1
            closed = False
            while index < len(snapshot):
                if snapshot[index] == chr(92) and quote != chr(96):
                    index += 2
                    continue
                if snapshot[index] == quote:
                    if index + 1 < len(snapshot) and snapshot[index + 1] == quote:
                        index += 2
                        continue
                    index += 1
                    closed = True
                    break
                index += 1
            require(closed, 'Backup has an unterminated quoted token.')
            code.append(' quoted_identifier ' if quote == chr(96) else ' literal ')
        elif snapshot.startswith('/*', index):
            end = snapshot.find('*/', index + 2)
            require(end >= 0, 'Backup has an unterminated comment.')
            if snapshot.startswith('/*!', index):
                content = re.sub(r'^\d{5,6}[ \t]*', '', snapshot[index + 3:end])
                code.append(' ' + dump_code_without_literals(content) + ' ')
            else:
                code.append(' ')
            index = end + 2
        elif char == '#' or (snapshot.startswith('--', index) and (index + 2 == len(snapshot) or snapshot[index + 2].isspace())):
            end = snapshot.find(chr(10), index)
            index = len(snapshot) if end < 0 else end + 1
            code.append(' ')
        else:
            code.append(char)
            index += 1
    return ''.join(code)

def validate_dump(snapshot):
    require(isinstance(snapshot, str) and snapshot.strip(), 'Empty backup refused.')
    code = dump_code_without_literals(snapshot)
    forbidden = r'(?im)(?:^|;)\s*(?:USE\s|(?:CREATE|DROP|ALTER)\s+(?:DATABASE|SCHEMA|USER)\b|GRANT\s|REVOKE\s|SOURCE\s|LOAD\s+DATA\b)'
    require(not re.search(forbidden, code), 'Dump contains a forbidden cross-database operation.')
    # Qualified identifiers are absent from this harness-generated one-database dump.
    # User strings and comments have already been masked; @@SESSION variables are exempt.
    qualified = r'(?<![\w@])\b[A-Za-z_][A-Za-z0-9_$]*\s*\.\s*[A-Za-z_][A-Za-z0-9_$]*\b'
    require(not re.search(qualified, code), 'Dump contains a schema-qualified identifier.')
    require(not re.search(r'(?i)\bINTO\s+(?:OUTFILE|DUMPFILE)\b', code), 'Dump contains a filesystem output operation.')


DUMP_CANONICALIZATION = 'redundant-column-charset-v1'

def canonical_dump(snapshot):
    # Only a separate CHARACTER SET immediately after a supported string column
    # type, in a CREATE TABLE block, is removed when its explicit COLLATE already
    # names the same charset. Data, table options, defaults, and collations stay verbatim.
    tick = re.escape(chr(96))
    identifier = tick + r'[A-Za-z0-9_]+' + tick
    start = re.compile(r'^CREATE TABLE ' + identifier + r' \(', re.IGNORECASE)
    column = re.compile(r'^[ \t]+' + identifier + r'[ \t]+(?:varchar\([0-9]+\)|char\([0-9]+\)|(?:tiny|medium|long)?text)[ \t]+'
        r'(?P<remove>CHARACTER[ \t]+SET[ \t]+(?P<charset>[A-Za-z0-9_]+)[ \t]+)'
        r'COLLATE[ \t]+(?P<collation>[A-Za-z0-9_]+)\b', re.IGNORECASE)
    inside_table = False
    replacements = 0
    output = []
    for line in snapshot.splitlines(keepends=True):
        if start.match(line):
            inside_table = True
        elif inside_table and line.startswith(')'):
            inside_table = False
        elif inside_table:
            match = column.match(line)
            if match and match['collation'].lower().startswith(match['charset'].lower() + '_'):
                line = line[:match.start('remove')] + line[match.end('remove'):]
                replacements += 1
        output.append(line)
    return ''.join(output), replacements

def dump_fingerprint(snapshot):
    canonical, replacements = canonical_dump(snapshot)
    return {'raw_sha256': hashlib.sha256(snapshot.encode()).hexdigest(),
            'canonical_sha256': hashlib.sha256(canonical.encode()).hexdigest(),
            'canonicalization': DUMP_CANONICALIZATION, 'redundant_charset_clauses': replacements}

def private_file(path):
    require(path.is_file() and not path.is_symlink(), 'Private file is absent or a symlink.')
    require(stat.S_IMODE(path.stat().st_mode) == 0o600, 'Private file must have mode 0600.')

def runtime_guard():
    require(not (BACKEND / '.runtime').is_symlink(), 'Runtime parent must not be a symlink.')
    require(RUNTIME.is_dir() and not RUNTIME.is_symlink(), 'Isolated runtime is absent or a symlink.')
    require(stat.S_IMODE(RUNTIME.stat().st_mode) == 0o700, 'Isolated runtime must have mode 0700.')
    for name in SUBDIRS:
        path = RUNTIME / name
        require(path.is_dir() and not path.is_symlink(), 'Isolated subdirectory is absent or a symlink.')
    private_file(RUNTIME / 'private.json')
    private_file(RUNTIME / 'marker.json')
    config = validate_config(json.loads((RUNTIME / 'private.json').read_text()))
    marker = json.loads((RUNTIME / 'marker.json').read_text())
    require(marker == {**spec(), 'nonce': config['nonce']}, 'Runtime provenance mismatch.')
    return config

def write_private(path, value):
    require(not path.is_symlink(), 'Refusing a symlink output.')
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(descriptor, 'w') as stream:
        stream.write(value)
    os.chmod(path, 0o600)

def replace_private(path, value):
    """Atomically replace an already validated owned file; preserve 0600 mode."""
    private_file(path)
    temporary = path.with_name(path.name + '.pending-' + secrets.token_hex(16))
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    try:
        with os.fdopen(descriptor, 'w') as stream:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
        private_file(path)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()

def clean_environment():
    env = dict(os.environ)
    for key in list(env):
        if key.startswith(('HUMHUB_', 'MATCHER_', 'MYSQL_', 'OPENAI_')) or key in ['PHPRC', 'PHP_INI_SCAN_DIR', 'MYSQL_PWD']:
            del env[key]
    env['PHP_INI_SCAN_DIR'] = ''
    return env

def run(command, *, input_text=None, timeout=180):
    result = subprocess.run(command, input=input_text, capture_output=True, text=True, timeout=timeout, env=clean_environment())
    # Never echo raw subprocess diagnostics: connection strings and SQL may contain credentials.
    require(result.returncode == 0, 'Isolated command failed; raw diagnostics suppressed.')
    return result.stdout

def mysql(statement, *, root=False):
    if not root:
        runtime_guard()
        private_file(RUNTIME / 'mysql.cnf')
    config_file = BACKEND / '.runtime/mysql-root.cnf' if root else RUNTIME / 'mysql.cnf'
    require(config_file.is_file() and not config_file.is_symlink(), 'Required database client configuration is unavailable.')
    return run([str(BACKEND / '.runtime/php-mysql/bin/mysql'), '--defaults-extra-file=' + str(config_file),
                '--protocol=SOCKET', '--socket=' + str(BACKEND / '.runtime/mysql.sock'),
                '--batch', '--skip-column-names', *([] if root else [DB])], input_text=statement).strip()

def database_guard(config):
    validate_config(config)
    require(mysql('SELECT DATABASE();') == DB, 'Connected database mismatch.')
    identity = mysql('SELECT spec,nonce FROM ' + GUARD + ' WHERE id=1;')
    require(identity == SPEC + '	' + config['nonce'], 'Database provenance mismatch.')

def port_free():
    try:
        with socket.socket() as listener:
            # A closed PHP listener can leave accepted connections in TIME_WAIT.
            # REUSEADDR permits that normal restart; without REUSEPORT an active
            # listening socket at this exact address still makes bind fail.
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind((HOST, PORT))
        return True
    except OSError:
        return False

def php_command(auth_mode=False):
    require(type(auth_mode) is bool, 'Invalid PHP authentication mode.')
    return [str(BACKEND / '.runtime/php-mysql/bin/php'), '-n', '-d', 'extension=mysqlnd.so',
            '-d', 'extension=pdo_mysql.so', '-d', 'extension=gd.so', '-d', 'allow_url_fopen=0',
            '-d', 'disable_functions=' + ('mail' if auth_mode else BLOCKED_FUNCTIONS), '-d', 'display_errors=0',
            '-d', 'log_errors=' + ('0' if auth_mode else '1'), '-d', 'error_log=' + str(RUNTIME / 'runtime/php-errors.log')]

CONTROL_MARKER = chr(10) + '__OVERNIGHT_CONTROL_RESULT__' + chr(10)

def parse_control_output(output, action):
    require(isinstance(output, str) and output.count(CONTROL_MARKER) == 1, 'PHP control result marker is missing or ambiguous; raw output suppressed.')
    try:
        result = json.loads(output.partition(CONTROL_MARKER)[2])
    except (ValueError, TypeError):
        raise Refusal('PHP control returned invalid structured output; raw output suppressed.')
    require(isinstance(result, dict) and result.get('status') == 'passed'
            and result.get('action') == action and result.get('database') == DB,
            'PHP control result identity/status mismatch; raw output suppressed.')
    return result

def control(action):
    require(action in ['install', 'inspect', 'sync-modules', 'upgrade-n05', 'ui-on', 'ui-off', 'auth-configure'], 'Unsupported PHP control action.')
    config = runtime_guard()
    database_guard(config)
    if action in ['install', 'sync-modules', 'upgrade-n05', 'auth-configure']:
        require(owned_server() is None and port_free(), 'Stop the isolated web server before installation or migration.')
    result = subprocess.run(php_command(config.get('auth_mode', False)) + [str(HERE / 'control.php'), action],
                            capture_output=True, text=True, timeout=300, env=clean_environment())
    if result.returncode != 0:
        category = 'unknown'
        try:
            candidate = json.loads(result.stderr).get('type')
            if isinstance(candidate, str) and candidate and len(candidate) < 160 and all(c.isalnum() or c in ['_', chr(92)] for c in candidate):
                category = candidate
        except (ValueError, TypeError, AttributeError):
            pass
        raise Refusal('Isolated PHP control failed (' + category + '); raw diagnostics suppressed.')
    return parse_control_output(result.stdout, action)

def sync_modules():
    """Fixed additive N01/N03-to-N04 transition, safely retryable after interruption."""
    config = runtime_guard()
    database_guard(config)
    require(owned_server() is None and port_free(), 'Stop the isolated web server before module synchronization.')
    folder = RUNTIME / 'modules'
    names = {path.name for path in folder.iterdir()}
    require(set(LEGACY_MODULES).issubset(names) and names.issubset(set(MODULES)), 'Unexpected isolated module tree.')
    for name in MODULES:
        source = BACKEND / 'protected/modules' / name
        require(source.is_dir() and not source.is_symlink(), 'Required fixed module source is unavailable.')
        target = folder / name
        if target.is_symlink():
            require(target.resolve(strict=True) == source.resolve(strict=True), 'Isolated module link mismatch.')
        elif target.exists():
            raise Refusal('Unexpected non-link isolated module path.')
        else:
            require(name in MODULES[len(LEGACY_MODULES):], 'Existing isolated module link is missing.')
    # All provenance, target and source checks precede the first mutation.
    for name in MODULES[len(LEGACY_MODULES):]:
        new_link = folder / name
        if not new_link.is_symlink():
            new_link.symlink_to(BACKEND / 'protected/modules' / name, target_is_directory=True)
    upgraded = config['modules'] != MODULES
    if upgraded:
        replacement = {**config, 'modules': list(MODULES)}
        validate_config(replacement)
        replace_private(RUNTIME / 'private.json', json.dumps(replacement))
    result = control('sync-modules')
    result['configuration_upgraded'] = upgraded
    result['fixed_added_modules'] = MODULES[len(LEGACY_MODULES):]
    return result

def auth_configure():
    config = runtime_guard()
    database_guard(config)
    require(config['modules'] == MODULES, 'Synchronize the fixed N04 modules first.')
    require(owned_server() is None and port_free(), 'Stop the isolated web server before configuring authentication.')
    input_path = BACKEND / '.runtime/overnight-auth-input.json'
    private_file(input_path)
    run(['git', '-C', str(BACKEND.parent), 'check-ignore', '-q', str(input_path)])
    # Validate without printing any configuration value or making an external request.
    validator = 'require ' + json.dumps(str(HERE / 'auth_runtime.php')) + '; try { overnightReadAuthInput(' + json.dumps(str(BACKEND)) + '); echo "valid"; } catch (Throwable $e) { exit(1); }'
    require(run(php_command() + ['-r', validator]) == 'valid', 'Authentication private input validation failed.')
    key_path = RUNTIME / 'auth-hmac.key'
    if key_path.exists():
        private_file(key_path)
        require(re.fullmatch('[a-f0-9]{64}', key_path.read_text()) is not None, 'Authentication key shape refused.')
    else:
        write_private(key_path, secrets.token_hex(32))
    replacement = {**config, 'auth_mode': True}
    validate_config(replacement)
    replace_private(RUNTIME / 'private.json', json.dumps(replacement))
    result = control('auth-configure')
    result['credentials_printed'] = False
    result['external_calls_during_configuration'] = 0
    return result

def provision():
    require(port_free(), 'Port 8113 is occupied; refusing provision.')
    require(not (BACKEND / '.runtime').is_symlink(), 'Runtime parent must not be a symlink.')
    if RUNTIME.exists():
        config = runtime_guard()
        database_guard(config)
        return {'status': 'passed', 'action': 'provision', 'reused_owned_target': True, **spec()}
    # Read-only existence checks precede creating the new private runtime.
    require(mysql("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + DB + "';", root=True) == '0', 'Refusing an existing database.')
    require(mysql("SELECT COUNT(*) FROM mysql.user WHERE User='" + USER + "';", root=True) == '0', 'Refusing an existing database user.')
    os.umask(0o077)
    RUNTIME.mkdir(mode=0o700)
    for name in SUBDIRS:
        (RUNTIME / name).mkdir(mode=0o700)
    config = {**spec(), 'password': secrets.token_hex(32), 'cookie_key': secrets.token_hex(32),
              'nonce': secrets.token_hex(32), 'modules': MODULES}
    write_private(RUNTIME / 'private.json', json.dumps(config))
    write_private(RUNTIME / 'marker.json', json.dumps({**spec(), 'nonce': config['nonce']}))
    write_private(RUNTIME / 'mysql.cnf', mysql_client_config(config))
    for name in MODULES:
        source = BACKEND / 'protected/modules' / name
        require(source.is_dir(), 'Required module source is absent: ' + name)
        (RUNTIME / 'modules' / name).symlink_to(source, target_is_directory=True)
    mysql('CREATE DATABASE `' + DB + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; '
          + "CREATE USER '" + USER + "'@'localhost' IDENTIFIED BY '" + config['password'] + "'; "
          + 'GRANT ALL PRIVILEGES ON `' + DB + "`.* TO '" + USER + "'@'localhost';", root=True)
    mysql('CREATE TABLE ' + GUARD + ' (id INT PRIMARY KEY, spec VARCHAR(64) NOT NULL, nonce CHAR(64) NOT NULL, probe INT NOT NULL DEFAULT 0); '
          + 'INSERT INTO ' + GUARD + " VALUES (1,'" + SPEC + "','" + config['nonce'] + "',0);")
    database_guard(config)
    return {'status': 'passed', 'action': 'provision', 'empty_target_created': True, 'global_grants': False, **spec()}

def owned_server():
    path = RUNTIME / 'server.json'
    if not path.exists():
        return None
    private_file(path)
    entry = json.loads(path.read_text())
    require(entry.get('nonce') == runtime_guard()['nonce'] and entry.get('port') == PORT, 'Server marker mismatch.')
    pid = entry.get('pid')
    require(isinstance(pid, int) and pid > 1, 'Invalid owned server PID.')
    try:
        output = run(['ps', '-p', str(pid), '-o', 'command='], timeout=10)
    except Refusal:
        require(port_free(), 'Recorded server is absent but port 8113 is occupied.')
        return None
    require(str(HERE / 'router.php') in output and '127.0.0.1:8113' in output
            and str(BACKEND / '.runtime/php-mysql/bin/php') in output, 'PID no longer belongs to this harness.')
    return pid

def start():
    control('inspect')
    pid = owned_server()
    if pid:
        return {'status': 'passed', 'action': 'start', 'already_running': True, 'pid': pid, 'port': PORT}
    require(port_free(), 'Port 8113 is occupied by another process.')
    auth_mode = runtime_guard().get('auth_mode', False)
    # OAuth callbacks carry one-time credentials in their query string. Do not persist server request logs in this mode.
    with open(os.devnull if auth_mode else RUNTIME / 'runtime/server.log', 'ab') as log:
        process = subprocess.Popen(php_command(runtime_guard().get('auth_mode', False)) + ['-S', HOST + ':' + str(PORT), '-t', str(RUNTIME), str(HERE / 'router.php')],
                                   stdout=log, stderr=log, env=clean_environment(), start_new_session=True)
    write_private(RUNTIME / 'server.json', json.dumps({'pid': process.pid, 'nonce': runtime_guard()['nonce'], 'port': PORT}))
    for _ in range(50):
        require(process.poll() is None, 'Isolated web server exited before readiness.')
        if not port_free():
            require(owned_server() == process.pid, 'Owned listener identity changed.')
            return {'status': 'passed', 'action': 'start', 'pid': process.pid, 'port': PORT, 'queue_started': False, 'cron_started': False}
        time.sleep(0.1)
    os.kill(process.pid, signal.SIGTERM)
    raise Refusal('Isolated server did not bind the expected port.')

def stop():
    runtime_guard()
    pid = owned_server()
    if pid:
        os.kill(pid, signal.SIGTERM)
        for _ in range(50):
            if port_free():
                break
            time.sleep(0.1)
        require(port_free(), 'Owned listener did not stop; no other process was signalled.')
    require(port_free(), 'Unowned process is using 8113; refusing stop/cleanup.')
    (RUNTIME / 'server.json').unlink(missing_ok=True)
    return {'status': 'passed', 'action': 'stop', 'port': PORT, 'owned_pid_stopped': pid}

def dump_database():
    return run([str(BACKEND / '.runtime/php-mysql/bin/mysqldump'), '--defaults-extra-file=' + str(RUNTIME / 'mysql.cnf'),
                '--protocol=SOCKET', '--socket=' + str(BACKEND / '.runtime/mysql.sock'), '--single-transaction',
                '--skip-lock-tables', '--skip-comments', '--skip-dump-date', '--skip-extended-insert',
                '--skip-triggers', '--skip-routines', '--skip-events', '--no-tablespaces', '--set-gtid-purged=OFF', DB], timeout=300)

def backup_restore():
    config = runtime_guard()
    database_guard(config)
    require(owned_server() is None and port_free(), 'Stop the isolated web server before backup/restore.')
    before = control('inspect')
    snapshot = dump_database()
    validate_dump(snapshot)
    original_fingerprint = dump_fingerprint(snapshot)
    digest = original_fingerprint['raw_sha256']
    stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + secrets.token_hex(4)
    folder = RUNTIME / 'backups' / stamp
    folder.mkdir(mode=0o700)
    write_private(folder / 'database.sql', snapshot)
    write_private(folder / 'manifest.json', json.dumps({'database': DB, 'spec': SPEC, 'sha256': digest, 'created_at_utc': stamp, **original_fingerprint}))
    probe = mysql('SELECT probe FROM ' + GUARD + ' WHERE id=1;')
    mysql('UPDATE ' + GUARD + ' SET probe=probe+1 WHERE id=1;')
    require(mysql('SELECT probe FROM ' + GUARD + ' WHERE id=1;') != probe, 'Restore probe mutation did not persist.')
    require(hashlib.sha256((folder / 'database.sql').read_bytes()).hexdigest() == digest, 'Backup checksum changed.')
    mysql(snapshot)
    database_guard(config)
    require(mysql('SELECT probe FROM ' + GUARD + ' WHERE id=1;') == probe, 'Restore did not recover the original probe.')
    restored = dump_database()
    restored_fingerprint = dump_fingerprint(restored)
    require(restored_fingerprint['canonical_sha256'] == original_fingerprint['canonical_sha256'], 'Restored schema/data differs beyond redundant column charset declarations.')
    after = control('inspect')
    require(before == after, 'Application counts or module state changed after restore.')
    result = {'status': 'passed', 'action': 'backup-restore', 'database': DB, 'sha256': digest,
              'backup': str(folder.relative_to(BACKEND)), 'mutation_and_restore_verified': True, 'application_inspection_equal': True,
              'backup_fingerprint': original_fingerprint, 'restored_fingerprint': restored_fingerprint,
              'raw_dumps_equal': restored_fingerprint['raw_sha256'] == digest, 'canonical_schema_data_equal': True}
    write_private(folder / 'verification.json', json.dumps(result, indent=2) + chr(10))
    return result

def cleanup():
    if not RUNTIME.exists():
        require(not RUNTIME.is_symlink() and port_free(), 'Absent runtime has an unexpected path or listener.')
        require(mysql("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + DB + "';", root=True) == '0', 'Unowned database remains; refusing deletion.')
        require(mysql("SELECT COUNT(*) FROM mysql.user WHERE User='" + USER + "';", root=True) == '0', 'Unowned database user remains; refusing deletion.')
        return {'status': 'passed', 'action': 'cleanup', 'already_removed': True, 'port_free': True}
    config = runtime_guard()
    database_guard(config)
    require(not config.get('auth_mode', False), 'Authentication validation data cannot be removed by the N01 cleanup command.')
    has_user = mysql("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='" + DB + "' AND TABLE_NAME='user';") == '1'
    require(not has_user or mysql('SELECT COUNT(*) FROM user;') == '0', 'Nonempty account data requires a separate reviewed cleanup.')
    stop()
    require(mysql("SELECT COUNT(*) FROM mysql.user WHERE User='" + USER + "' AND Host='localhost';", root=True) == '1', 'Owned database user is missing.')
    mysql('DROP DATABASE `' + DB + "`; DROP USER '" + USER + "'@'localhost';", root=True)
    require(mysql("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + DB + "';", root=True) == '0', 'Database removal was not confirmed.')
    require(mysql("SELECT COUNT(*) FROM mysql.user WHERE User='" + USER + "';", root=True) == '0', 'User removal was not confirmed.')
    # All deletion is confined to the nonce-verified runtime. shutil does not follow module symlinks.
    runtime_guard()
    shutil.rmtree(RUNTIME)
    return {'status': 'passed', 'action': 'cleanup', 'database_removed': DB, 'user_removed': USER, 'runtime_removed': True, 'port_free': port_free()}

@contextlib.contextmanager
def locked():
    path = BACKEND / '.runtime/overnight-integration.lock'
    require(not (BACKEND / '.runtime').is_symlink(), 'Runtime parent must not be a symlink.')
    require(not path.is_symlink(), 'Harness lock must not be a symlink.')
    with open(path, 'a') as stream:
        os.chmod(path, 0o600)
        fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['probe', 'provision', 'install', 'inspect', 'sync-modules', 'ui-on', 'ui-off', 'auth-configure', 'backup-restore', 'start', 'stop', 'cleanup'])
    args = parser.parse_args()
    if args.action == 'probe':
        result = {'status': 'passed', 'action': 'probe', 'port_free': port_free(), 'php_available': (BACKEND / '.runtime/php-mysql/bin/php').is_file(), **spec()}
    else:
        with locked():
            operations = {'provision': provision, 'install': lambda: control('install'), 'inspect': lambda: control('inspect'),
                          'sync-modules': sync_modules, 'ui-on': lambda: control('ui-on'), 'ui-off': lambda: control('ui-off'), 'auth-configure': auth_configure,
                          'backup-restore': backup_restore, 'start': start, 'stop': stop, 'cleanup': cleanup}
            result = operations[args.action]()
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        reason = str(error) if isinstance(error, Refusal) else 'Harness failed; private diagnostics were not printed.'
        print(json.dumps({'status': 'failed', 'type': type(error).__name__, 'reason': reason}), file=sys.stderr)
        sys.exit(1)
