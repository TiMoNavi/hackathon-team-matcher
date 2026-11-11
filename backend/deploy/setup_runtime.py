#!/usr/bin/env python3
"""Recreate the verified macOS Intel preview runtime; does not alter global packages."""
from pathlib import Path, PurePosixPath
from urllib.request import urlopen
import hashlib,json,platform,shutil,subprocess,tarfile
root=Path(__file__).resolve().parents[1];run=root/'.runtime';logs=run/'logs';logs.mkdir(parents=True,exist_ok=True)
if platform.system()!='Darwin' or platform.machine()!='x86_64':raise SystemExit('This runtime lock is validated for macOS Intel only; application sources are separate from this local launcher.')
mamba=shutil.which('micromamba')
if not mamba:raise SystemExit('Install micromamba first; this setup uses an isolated project-local prefix.')
with (logs/'runtime-setup.log').open('ab') as log:
 subprocess.run([mamba,'--no-rc','--root-prefix',str(run/'mamba'),'create','--yes','--prefix',str(run/'php-mysql'),'--file',str(root/'deploy/runtime-osx-64.lock')],stdout=log,stderr=log,check=True)
lock=json.loads((root/'deploy/php-extensions.lock.json').read_text());archive=run/'downloads'/Path(lock['source']).name;archive.parent.mkdir(exist_ok=True)
if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest()!=lock['sha256']:
 with urlopen(lock['source'],timeout=90) as r,archive.open('wb') as out:
  while chunk:=r.read(1024*1024):out.write(chunk)
if hashlib.sha256(archive.read_bytes()).hexdigest()!=lock['sha256']:raise RuntimeError('PHP source checksum mismatch')
source=run/'build';source.mkdir(exist_ok=True)
with tarfile.open(archive) as bundle:
 for member in bundle:
  rel=PurePosixPath(member.name)
  if rel.is_absolute() or '..' in rel.parts:raise ValueError('Unsafe source archive')
  dest=source.joinpath(*rel.parts)
  if member.isdir():dest.mkdir(parents=True,exist_ok=True)
  elif member.isfile():
   dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(bundle.extractfile(member).read());dest.chmod(member.mode & 0o777)
subprocess.run([str(root/'deploy/build_php_extensions.sh')],check=True)
print('Runtime prepared; next: python3 deploy/preview.py init')
