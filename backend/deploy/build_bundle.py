#!/usr/bin/env python3
# Build a source/dependency bundle from this checkout; omit all local state.
from pathlib import Path
import hashlib, json, subprocess, tarfile
ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/'dist'
NAME='humhub-free-preview-1.19.4'
DIST.mkdir(exist_ok=True)
tracked=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split(chr(0))
paths={p for p in tracked if p}
for directory in ['protected/vendor','protected/modules','protected/humhub/resources','deploy','docs/architecture','docs/preview']:
 paths.update(p.relative_to(ROOT).as_posix() for p in (ROOT/directory).rglob('*') if p.is_file() or p.is_symlink())
paths.add('protected/humhub/config/assets-prod.php')
secrets_file=ROOT/'.runtime/preview-credentials.json'
secret_values=[]
if secrets_file.exists():
 data=json.loads(secrets_file.read_text())
 secret_values=[str(v).encode() for k,v in data.items() if ('password' in k or 'key' in k) and len(str(v))>=16]
def allowed(name):
 parts=Path(name).parts
 if any(x in {'.git','.runtime','.local','dist','__pycache__','node_modules','.DS_Store'} for x in parts):return False
 if Path(name).name in {'.env','preview-credentials.json','mysql-root.cnf'}:return False
 if name.endswith(('.pyc','.log','.pid','.sock')):return False
 if name.startswith(('protected/runtime/','assets/','uploads/','protected/config/')) and name not in tracked:return False
 return True
selected=sorted(p for p in paths if allowed(p) and (ROOT/p).is_file())
manifest=[]
for name in selected:
 file=ROOT/name
 if file.is_symlink():
  file.resolve().relative_to(ROOT)
 body=file.read_bytes()
 if any(secret in body for secret in secret_values):raise RuntimeError('Secret value detected; archive was not created')
 manifest.append({'path':name,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()})
archive=DIST/(NAME+'.tar.gz')
with tarfile.open(archive,'w:gz',compresslevel=6,dereference=True) as tar:
 for name in selected:
  tar.add(ROOT/name,arcname=NAME+'/'+name,recursive=False)
with tarfile.open(archive) as tar:
 members=tar.getmembers()
 expected={entry['path']:entry['sha256'] for entry in manifest}
 assert len(members)==len(selected)
 assert all(m.isfile() and m.name.startswith(NAME+'/') and allowed(m.name[len(NAME)+1:]) for m in members)
 for member in members:
  body=tar.extractfile(member).read()
  if hashlib.sha256(body).hexdigest()!=expected[member.name[len(NAME)+1:]]:raise RuntimeError('Source changed during packaging; rebuild from a stable checkout')
  if any(secret in body for secret in secret_values):raise RuntimeError('Secret detected in archive')
 modules=json.loads((ROOT/'deploy/modules.lock.json').read_text())['modules']
 assert all(NAME+'/protected/modules/'+m['id']+'/module.json' in tar.getnames() for m in modules)
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
report={'created_on':'2026-11-11','archive':archive.name,'sha256':digest,'bytes':archive.stat().st_size,'files':len(selected),'external_modules':len(modules),'runtime_included':False,'database_included':False,'local_secrets_included':False,'manifest':manifest}
(DIST/(NAME+'.manifest.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+chr(10))
(DIST/(NAME+'.tar.gz.sha256')).write_text(digest+'  '+archive.name+chr(10))
print(json.dumps({k:v for k,v in report.items() if k!='manifest'},indent=2))
