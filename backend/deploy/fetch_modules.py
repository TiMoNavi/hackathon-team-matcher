#!/usr/bin/env python3
"""Fetch the selected free Marketplace releases; verify publisher SHA256 before extraction."""
from pathlib import Path, PurePosixPath
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib, json, re, stat, zipfile
ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.runtime' / 'downloads' / 'modules'
LOCK = Path(__file__).with_name('modules.lock.json')
SELECTED = [
 ('rest','0.12.7',True),('calendar','1.9.9',True),('mail','3.4.6',True),
 ('gallery','1.9.1',True),('questions','1.1.6',True),('linklist','0.9.2',True),
 ('text-editor','1.2.0',True),('pdf-viewer','1.1.8',True),('twofa','1.4.3',False),
 ('clean-theme','2.5.3',True),('auth-github','1.1.1',False),('auth-google','1.1.1',False),
 ('jwt-sso','1.2.1',False),('fcm-push','2.3.2',False),('move-content','2.4.1',False),
 ('sharebetween','1.2.1',False),('online-users','1.1.2',False),
 ('suggestedfollowing','1.0.0',False),('auto-follow','1.1.0',False),
]
def request(url):
 return urlopen(Request(url, headers={'User-Agent':'HackathonMatcher-local-preview'}), timeout=90)
def fetch(item):
 mid,version,enabled=item;name=f'{mid}-v{version}.zip'
 url=f'https://marketplace.humhub.com/downloads/free/{name}'
 checksum_url=f'https://marketplace.humhub.com/downloads/{name}.sha256'
 with request(checksum_url) as r:checksum_text=r.read().decode()
 match=re.search(r'\b[0-9a-fA-F]{64}\b',checksum_text)
 if not match:raise ValueError(f'{mid}: official SHA256 unavailable')
 expected=match[0].lower();path=CACHE/name
 if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest()!=expected:
  part=path.with_suffix('.part')
  with request(url) as r,part.open('wb') as out:
   while chunk:=r.read(1024*1024):out.write(chunk)
  if hashlib.sha256(part.read_bytes()).hexdigest()!=expected:raise ValueError(f'{mid}: checksum mismatch')
  part.replace(path)
 return {'id':mid,'version':version,'desired_enabled':enabled,'url':url,'checksum_url':checksum_url,'sha256':expected,'bytes':path.stat().st_size,'archive':str(path)}
def install(item):
 mid=item['id'];path=Path(item.pop('archive'))
 actual_id={'suggestedfollowing':'suggestedFollowing'}.get(mid,mid)
 target=ROOT/'protected'/'modules'/actual_id
 with zipfile.ZipFile(path) as z:
  roots=[x for x in z.namelist() if PurePosixPath(x).name=='module.json' and len(PurePosixPath(x).parts)<=2]
  if len(roots)!=1:raise ValueError(f'{mid}: ambiguous module root')
  prefix=roots[0][:-len('module.json')];meta=json.loads(z.read(roots[0]))
  if meta.get('id')!=actual_id or str(meta.get('version'))!=item['version']:raise ValueError(f'{mid}: metadata mismatch')
  item['marketplace_id']=mid;item['id']=actual_id
  if target.exists():
   current=target/'module.json'
   if not current.exists() or json.loads(current.read_text()).get('version')!=meta.get('version'):raise ValueError(f'{mid}: refusing to overwrite different installed module')
   item['package_metadata']=meta;return item
  for info in z.infolist():
   if not info.filename.startswith(prefix):continue
   rel=PurePosixPath(info.filename[len(prefix):])
   if rel.is_absolute() or '..' in rel.parts or stat.S_ISLNK(info.external_attr>>16):raise ValueError(f'{mid}: unsafe archive entry')
   dest=target.joinpath(*rel.parts)
   if info.is_dir():dest.mkdir(parents=True,exist_ok=True)
   else:
    dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(z.read(info));dest.chmod(0o644)
  item['package_metadata']=meta;return item
if __name__=='__main__':
 CACHE.mkdir(parents=True,exist_ok=True);downloaded={}
 with ThreadPoolExecutor(max_workers=4) as pool:
  for f in as_completed([pool.submit(fetch,item) for item in SELECTED]):
   item=f.result();downloaded[item['id']]=item;print('Verified',item['id'],item['version'],flush=True)
 installed=[install(downloaded[mid]) for mid,_,_ in SELECTED]
 LOCK.write_text(json.dumps({'checked_on':'2026-11-11','humhub':'1.19.4','price_eur':0,'modules':installed,'excluded':[{'id':'social_stats','reason':'Marketplace compatibility ends at 1.17; not verified on 1.19.4'}]},ensure_ascii=False,indent=2)+'\n')
 print('Installed package files:',len(installed),'(enable/migrations are a separate step)',flush=True)
