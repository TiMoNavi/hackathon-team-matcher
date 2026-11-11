"""Only provision this named synthetic audit database; never load application credentials."""
from pathlib import Path
import json, os, secrets, socket, subprocess
BASE = Path(__file__).resolve().parents[5]
RUNTIME = BASE / '.runtime/recommendation-integration-audit'
DB = 'humhub_recommendation_it_audit_20261112_7f2c9a'
USER = 'reco_audit_7f2c9a'
assert BASE.name == 'backend'
os.umask(0o077)
RUNTIME.mkdir(mode=0o700, exist_ok=True)
os.chmod(RUNTIME, 0o700)
assert not (RUNTIME / 'private.json').exists(), 'Refuse reuse of an existing audit identity'
with socket.socket() as listener:
    listener.bind(('127.0.0.1', 8112))
mysql = [str(BASE/'.runtime/php-mysql/bin/mysql'), '--defaults-extra-file='+str(BASE/'.runtime/mysql-root.cnf'), '--protocol=SOCKET', '--socket='+str(BASE/'.runtime/mysql.sock'), '--batch', '--skip-column-names']
def sql(statement):
    result = subprocess.run(mysql, input=statement, text=True, capture_output=True)
    if result.returncode: raise RuntimeError('Isolated MySQL provisioning failed; no credential output')
    return result.stdout.strip()
assert sql("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='"+DB+"';") == '', 'Refuse existing database'
assert sql("SELECT User FROM mysql.user WHERE User='"+USER+"';") == '', 'Refuse existing database user'
password = secrets.token_hex(32)
sql("CREATE DATABASE `"+DB+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER '"+USER+"'@'localhost' IDENTIFIED BY '"+password+"'; GRANT ALL PRIVILEGES ON `"+DB+"`.* TO '"+USER+"'@'localhost';")
config = {'database':DB,'username':USER,'password':password,'socket':str(BASE/'.runtime/mysql.sock'),'host':'127.0.0.1','port':8112,'cookie_key':secrets.token_hex(32),'login_password':secrets.token_urlsafe(24)}
(RUNTIME/'private.json').write_text(json.dumps(config))
os.chmod(RUNTIME/'private.json',0o600)
for name in ['runtime','sessions','assets','uploads','mail','cache','themes','modules']:
    (RUNTIME/name).mkdir(mode=0o700,exist_ok=True)
for name in ['matcher-user-profile','matcher-profile-privacy','matcher-recommendation','matcher-recommendation-ai']:
    link=RUNTIME/'modules'/name
    if not link.exists():link.symlink_to(BASE/'protected/modules'/name,target_is_directory=True)
(RUNTIME/'mode.json').write_text(json.dumps({'history':False,'provider':True,'platform_reject':False,'mutation':None}))
print(json.dumps({'database':DB,'isolated_user_created':True,'port':8112,'runtime_mode':'0700','config_mode':'0600'}))
