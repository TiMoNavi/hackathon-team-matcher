"""Fetch complete, immutable public source snapshots; no LLM calls."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import io
import json
import re
import subprocess
import urllib.parse
import urllib.request

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / '.private' / 'real-world-v1'
OUT = ROOT / 'evaluation' / 'real-world-v1'
SAMPLES = [
    ('01', 'mschrimpf', 'cv', ['main.pdf', 'content.tex', 'main.tex', 'variables.tex'], 'dbimpl', '英文；计算神经科学、研究履历与系统课程项目'),
    ('02', 'liweitianux', 'resume', ['resume-zh+en.pdf', 'resume-zh.tex', 'resume-en.tex'], 'fg21sim', '中英双语；天文研究与科学计算'),
    ('03', 'cies', 'resume', ['cies-breijs-resume.pdf', 'cies-breijs-resume.tex'], 'htoml', '英文；软件工程与函数式编程'),
    ('04', 'dpseidel', 'resume', ['main.tex'], 'stmove', '英文；生态学、数据分析与 R'),
    ('05', 'vaibhavsagar', 'resume', ['resume.md'], 'duffer', '英文；数据工程与 Haskell'),
    ('06', 'FlorentRevest', 'CV', ['cv.pdf', 'cv.tex'], 'Raspcopter', '英文；嵌入式与系统开发'),
    ('07', 'trallard', 'MyAwesomeCV', ['TaniaAllard-CV-long.pdf', 'TaniaAllard_resume.pdf', 'TaniaCV.tex'], 'airflow-tutorial', '英文；研究软件、数据流程与社区经历'),
    ('08', 'rainsworth', 'awesomeCV', ['resume.pdf', 'resume.tex'], 'eMERLIN-IRIS', '英文；天文研究、论文与科研协作'),
    ('09', 'wu-kan', 'CV', ['main.tex'], 'HPL-AI', '中英双语；高性能计算与科研项目'),
    ('10', 'sc932', 'resume', ['ScottClarkCV.pdf', 'ScottClarkCV.tex', 'ScottClark.md'], 'ALE', '英文；创业、优化算法与科研经历'),
]

def write_private(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_bytes(data)
    path.chmod(0o600)

def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'ProfileLabResearch/0.1'}), timeout=30) as response:
        return json.load(response)

def head(repo):
    p = subprocess.run(['git', 'ls-remote', f'https://github.com/{repo}.git', 'HEAD'], capture_output=True, text=True, timeout=45, check=True)
    sha = p.stdout.split()[0]
    if not re.fullmatch('[0-9a-f]{40}', sha):
        raise ValueError('Unexpected HEAD format')
    return sha

def source_file(repo, commit, path, local_dir, role):
    url = f'https://raw.githubusercontent.com/{repo}/{commit}/' + urllib.parse.quote(path, safe='/')
    destination = local_dir / path
    meta_path = destination.with_name(destination.name + '.source.json')
    if destination.exists() and meta_path.exists():
        meta = json.loads(meta_path.read_text())
        if meta['source_url'] == url and hashlib.sha256(destination.read_bytes()).hexdigest() == meta['sha256']:
            return meta
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'ProfileLabResearch/0.1'}), timeout=45) as response:
        data = response.read(15 * 1024 * 1024 + 1)
    if len(data) > 15 * 1024 * 1024:
        raise ValueError('Source exceeds 15 MiB; not silently truncated')
    write_private(destination, data)
    if path.lower().endswith('.pdf'):
        if not data.startswith(b'%PDF-'):
            raise ValueError('Downloaded source is not PDF')
        reader = PdfReader(io.BytesIO(data))
        text = '\n\n'.join((page.extract_text() or '') for page in reader.pages)
        page_count = len(reader.pages)
    else:
        text = data.decode('utf-8-sig')
        page_count = None
    text_path = destination.with_name(destination.name + '.extracted.txt')
    write_private(text_path, text.encode())
    record = {
        'role': role, 'repository': repo, 'commit': commit, 'upstream_path': path,
        'source_url': url, 'browser_url': f'https://github.com/{repo}/blob/{commit}/' + urllib.parse.quote(path, safe='/'),
        'retrieved_at': datetime.now(timezone.utc).isoformat(), 'sha256': hashlib.sha256(data).hexdigest(),
        'bytes': len(data), 'characters': len(text), 'pages': page_count,
        'local_path': str(destination.relative_to(ROOT)), 'text_path': str(text_path.relative_to(ROOT)),
        'extraction': 'pypdf, all pages' if page_count is not None else 'complete UTF-8 source; TeX markup retained',
        'truncated': False,
    }
    write_private(meta_path, json.dumps(record, ensure_ascii=False, indent=2).encode())
    return record

def collect(spec):
    sid, user, resume_repo, resume_files, project_name, coverage = spec
    directory = PRIVATE / f'{sid}-{user}'
    checkpoint = directory / 'sample.json'
    if checkpoint.exists():
        return json.loads(checkpoint.read_text())
    rr, pr = f'{user}/{resume_repo}', f'{user}/{project_name}'
    rc, pc = head(rr), head(pr)
    resume = [source_file(rr, rc, p, directory / 'resume', 'resume') for p in resume_files]
    cv_tree = json.loads((PRIVATE / 'discovery' / f'{user}.tree.json').read_text())['data']['tree']
    if user == 'trallard':
        sections = [x['path'] for x in cv_tree if x['type'] == 'blob' and x['path'].startswith('cv-sections/') and x['path'].endswith('.tex') and 'cover_letter' not in x['path'] and '__' not in x['path']]
    elif user == 'rainsworth':
        sections = [x['path'] for x in cv_tree if x['type'] == 'blob' and x['path'].startswith('resume/') and x['path'].endswith('.tex') and 'references' not in x['path']]
    else:
        sections = []
    resume.extend(source_file(rr, rc, p, directory / 'resume', 'resume_section') for p in sections)
    tree_cache = directory / 'project-tree.json'
    if tree_cache.exists():
        tree = json.loads(tree_cache.read_text())
    else:
        tree = get_json(f'https://api.github.com/repos/{pr}/git/trees/{pc}?recursive=1')
        write_private(tree_cache, json.dumps(tree, ensure_ascii=False, indent=2).encode())
    files = [x['path'] for x in tree.get('tree', []) if x['type'] == 'blob']
    readmes = [p for p in files if '/' not in p and p.lower() in ('readme.md', 'readme.rst', 'readme', 'readme.txt', 'readme.rmd', 'readme.markdown')]
    if not readmes:
        raise ValueError(f'{pr}: no root README found')
    config_names = {'package.json', 'pyproject.toml', 'setup.py', 'description', 'cargo.toml', 'go.mod', 'stack.yaml'}
    configs = [p for p in files if '/' not in p and (p.lower() in config_names or p.endswith('.cabal'))]
    docs = [p for p in files if p.lower().endswith(('.md', '.rst', '.rmd')) and (p.startswith(('docs/', 'doc/', 'vignettes/')) or p.lower() in ['tutorial.md', 'architecture.md', 'contributing.md'])]
    code_extensions = ('.py', '.r', '.hs', '.c', '.cpp', '.h', '.js', '.ts', '.ipynb')
    code = [p for p in files if p.lower().endswith(code_extensions) and not any(s in p.lower() for s in ['vendor/', 'node_modules/', 'dist/', '.min.', 'jquery', 'bootstrap', 'third_party/', 'external/'])]
    code.sort(key=lambda p: (not p.startswith(('src/', 'R/', 'fg21sim/', 'lib/')), len(p), p))
    selected = list(dict.fromkeys(readmes + configs[:2] + docs[:2] + code[:2]))
    project = [source_file(pr, pc, p, directory / 'project', 'project_readme' if p in readmes else 'project_evidence') for p in selected]
    repo_list = json.loads((PRIVATE / 'discovery' / f'{user}.repos.json').read_text())['data']
    meta = next(x for x in repo_list if x['full_name'].lower() == pr.lower())
    assert not meta['fork'] and not meta['private']
    combined = '\n'.join((ROOT / s['text_path']).read_text() for s in resume)
    references = sorted(set(re.findall(r'https?://(?:www\.)?github\.com/[^\s{}<>\\)]+', combined)))
    matching_refs = [r for r in references if f'github.com/{user}'.lower() in r.lower()]
    record = {
        'id': sid, 'github_user': user, 'profile_url': f'https://github.com/{user}',
        'coverage': coverage, 'resume_repository': rr, 'resume_commit': rc,
        'project_repository': pr, 'project_commit': pc, 'project_is_fork': meta['fork'],
        'project_description': meta.get('description'), 'repository_pushed_at': meta.get('pushed_at'),
        'identity_basis': 'resume published under same GitHub account as project; resume content manually reviewed',
        'resume_links_to_same_account': matching_refs,
        'resume_sources': resume, 'project_sources': project,
        'project_tree_truncated': tree.get('truncated', False),
        'limits': ['Public self-published claims are not independently verified employment or education.', 'Repository ownership and non-fork flag do not prove sole authorship.', 'Historical resume and current project can describe different periods.', 'No model evaluation or external model upload performed.'],
    }
    write_private(checkpoint, json.dumps(record, ensure_ascii=False, indent=2).encode())
    return record

if __name__ == '__main__':
    records, errors = [], []
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [(spec, pool.submit(collect, spec)) for spec in SAMPLES]
        for spec, future in futures:
            try:
                record = future.result()
                records.append(record)
                print(json.dumps({'id': record['id'], 'user': record['github_user'], 'resume_files': len(record['resume_sources']), 'resume_max_chars': max(s['characters'] for s in record['resume_sources']), 'pdf_pages': [s['pages'] for s in record['resume_sources'] if s['pages'] is not None], 'project_files': len(record['project_sources']), 'same_account_links': len(record['resume_links_to_same_account'])}, ensure_ascii=False), flush=True)
            except Exception as exc:
                errors.append({'id': spec[0], 'user': spec[1], 'error': str(exc)})
                print(json.dumps(errors[-1], ensure_ascii=False), flush=True)
    manifest = {'dataset': 'real-world-v1', 'retrieved_date': datetime.now(timezone.utc).date().isoformat(), 'status': 'collected_pending_review' if not errors else 'partial', 'real_people': True, 'dialogue_is_synthetic': True, 'external_model_upload': False, 'samples': records, 'errors': errors}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'collected': len(records), 'failed': len(errors)}), flush=True)
    if errors:
        raise SystemExit(1)
