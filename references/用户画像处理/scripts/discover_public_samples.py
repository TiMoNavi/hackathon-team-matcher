"""Collect public source metadata without credentials or printing resume text."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import json
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.private' / 'real-world-v1' / 'discovery'
CANDIDATES = {
    'hijiangtao': ('resume', 'master'),
    'geekplux': ('cv_resume', 'master'),
    'liweitianux': ('resume', 'master'),
    'cies': ('resume', 'master'),
    'dpseidel': ('resume', 'master'),
    'vaibhavsagar': ('resume', 'master'),
    'FlorentRevest': ('CV', 'master'),
    'trallard': ('MyAwesomeCV', 'master'),
    'rainsworth': ('awesomeCV', 'master'),
    'wu-kan': ('CV', 'latest'),
    'mschrimpf': ('cv', 'master'),
    'sc932': ('resume', 'master'),
}

def fetch(item):
    user, kind, url = item
    target = CACHE / f'{user}.{kind}.json'
    try:
        if target.exists():
            data = json.loads(target.read_text())['data']
        else:
            req = urllib.request.Request(url, headers={'User-Agent': 'ProfileLabResearch/0.1', 'Accept': 'application/vnd.github+json'})
            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.load(response)
            record = {'source_url': url, 'retrieved_at': datetime.now(timezone.utc).isoformat(), 'data': data}
            target.write_text(json.dumps(record, ensure_ascii=False, indent=2))
            target.chmod(0o600)
        if kind == 'tree':
            result = {'sha': data.get('sha'), 'files': [x['path'] for x in data.get('tree', []) if x['type'] == 'blob' and x['path'].lower().endswith(('.pdf', '.tex', '.md', '.json', '.yaml', '.yml', '.typ')) and not any(s in x['path'] for s in ['node_modules/', '.github/'])][:65]}
        else:
            repos = [x for x in data if not x['fork'] and not x['private'] and x.get('language') and x.get('size', 0) < 60000 and not any(s in x['name'].lower() for s in ['resume', 'cv', 'dotfile', 'config', 'awesome', '.github.io'])]
            repos.sort(key=lambda x: x['stargazers_count'], reverse=True)
            result = [{'repo': x['full_name'], 'language': x['language'], 'description': x['description'], 'size_kb': x['size'], 'branch': x['default_branch']} for x in repos[:8]]
        return {'user': user, 'kind': kind, 'result': result}
    except Exception as exc:
        return {'user': user, 'kind': kind, 'error': str(exc)}

if __name__ == '__main__':
    CACHE.mkdir(parents=True, exist_ok=True, mode=0o700)
    jobs = []
    for user, (repo, branch) in CANDIDATES.items():
        jobs.append((user, 'tree', f'https://api.github.com/repos/{user}/{repo}/git/trees/{branch}?recursive=1'))
        jobs.append((user, 'repos', f'https://api.github.com/users/{user}/repos?type=owner&sort=updated&per_page=100'))
    with ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(fetch, jobs):
            print(json.dumps(result, ensure_ascii=False), flush=True)
