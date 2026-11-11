"""Add focused project evidence and public author-attributed commit references."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import urllib.parse

from collect_real_world_samples import ROOT, PRIVATE, OUT, source_file, get_json, write_private

EXTRA = {
    'mschrimpf': ['src/assignment1_externalsort/external_sort.cpp'],
    'liweitianux': ['docs/guide.rst', 'fg21sim/foregrounds.py'],
    'cies': ['src/Text/Toml/Parser.hs', 'test/Text/Toml/Parser/Spec.hs'],
    'dpseidel': ['R/stmove.R', 'R/build_report.r'],
    'vaibhavsagar': ['duffer/src/Duffer/Loose/Parser.hs', 'duffer/src/Duffer/Pack/Parser.hs'],
    'FlorentRevest': [],
    'trallard': ['source/airflow-intro.md', 'source/pipelines.md', 'dags/twitter_airflow.py'],
    'rainsworth': ['MERLIN_IRIS_test/MERLIN_Tutorial_clean.ipynb', 'eMERLIN_CP_IRIS_test/eMERLIN_CASA_Pipeline_clean.ipynb'],
    'wu-kan': ['src/blas/HPL_dgemm.c'],
    'sc932': [],
}
AUTHOR_TOKENS = {
    'mschrimpf': 'Schrimpf', 'liweitianux': '李维天', 'cies': 'Cies',
    'dpseidel': 'Seidel', 'vaibhavsagar': 'Vaibhav', 'FlorentRevest': 'Florent',
    'trallard': 'Allard', 'rainsworth': 'Ainsworth', 'wu-kan': 'wu-kan', 'sc932': 'Scott',
}

def enrich(s):
    d = PRIVATE / f"{s['id']}-{s['github_user']}"
    tree = json.loads((d / 'project-tree.json').read_text())
    paths = [x['path'] for x in tree['tree'] if x['type'] == 'blob']
    licenses = [p for p in paths if '/' not in p and p.lower().startswith(('license', 'licence', 'copying'))]
    existing = {x['upstream_path'] for x in s['project_sources']}
    for path in EXTRA[s['github_user']] + licenses:
        if path not in paths:
            raise ValueError(f"Missing selected project path: {s['github_user']}/{path}")
        if path not in existing:
            s['project_sources'].append(source_file(s['project_repository'], s['project_commit'], path, d / 'project', 'project_license' if path in licenses else 'project_evidence'))
    query = urllib.parse.urlencode({'author': s['github_user'], 'sha': s['project_commit'], 'per_page': 3})
    url = f"https://api.github.com/repos/{s['project_repository']}/commits?{query}"
    cache = d / 'author-commits.json'
    try:
        if cache.exists():
            data = json.loads(cache.read_text())
        else:
            data = get_json(url)
            write_private(cache, json.dumps(data, ensure_ascii=False, indent=2).encode())
        commits = [{'sha': x['sha'], 'url': x['html_url'], 'github_author': (x.get('author') or {}).get('login'), 'authored_at': x['commit']['author']['date']} for x in data]
        s['authored_commit_evidence'] = {'request_url': url, 'status': 'retrieved', 'max_requested': 3, 'commits': commits, 'caveat': 'An author-filtered sample supports only these commits; it is not a total contribution count or proof of sole authorship.'}
    except Exception as exc:
        s['authored_commit_evidence'] = {'request_url': url, 'status': 'unavailable', 'error': str(exc), 'commits': []}
    combined = ' '.join((ROOT / x['text_path']).read_text() for x in s['resume_sources'])
    expected = AUTHOR_TOKENS[s['github_user']]
    if expected.lower() not in combined.lower():
        raise ValueError(f"Expected self-identification missing for {s['github_user']}")
    s['identity_review'] = {
        'method': 'Self-published CV under the same GitHub account, self-identification in complete CV, and reviewed source structure.',
        'self_identification_found': True, 'template_example_selected': False,
        'employment_or_education_independently_verified': False,
    }
    if s['github_user'] == 'wu-kan':
        s['coverage'] = '中英双语；高性能计算与科研项目'
    s['primary_resume_source'] = s['resume_sources'][0]['local_path']
    s['primary_resume_characters'] = s['resume_sources'][0]['characters']
    s['input_coverage'] = {'resume': 'full published document; auxiliary sources kept separately to avoid duplicate counting', 'repository': 'README plus explicitly sampled project files; not a full clone or full code audit', 'pdf_extraction': 'all pages extracted; column ordering and spacing may need human review', 'tex_extraction': 'original source retained including comments; comments must not become active confirmed claims'}
    write_private(d / 'sample.json', json.dumps(s, ensure_ascii=False, indent=2).encode())
    return s

if __name__ == '__main__':
    manifest = json.loads((OUT / 'manifest.json').read_text())
    with ThreadPoolExecutor(max_workers=3) as pool:
        samples = list(pool.map(enrich, manifest['samples']))
    manifest.update({'samples': samples, 'status': 'source_reviewed', 'excluded_candidates': [{'repository': 'hijiangtao/resume', 'reason': 'Downloaded source still contains name placeholder and XXX; excluded from the ten complete real-person CV samples.'}, {'repository': 'geekplux/cv_resume', 'reason': 'Template-oriented candidate; not selected.'}]})
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    for s in samples:
        print(json.dumps({'id': s['id'], 'user': s['github_user'], 'project_files': len(s['project_sources']), 'author_commits': len(s['authored_commit_evidence']['commits']), 'commit_status': s['authored_commit_evidence']['status'], 'self_identification_found': s['identity_review']['self_identification_found']}, ensure_ascii=False))
