"""Package reviewed sources, rich scenarios, and a local context-budget audit."""
from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import ast
import copy
import hashlib
import json
import re
import stat

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'evaluation' / 'real-world-v1'
PRIVATE = ROOT / '.private' / 'real-world-v1'

def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def audit_context(samples):
    path = ROOT / 'repos/ai-recruiter-assistance/github/analyzer.py'
    source = path.read_text()
    tree = ast.parse(source)
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'GitHubCodeAnalyzer')
    method = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == '_build_context')
    fn = copy.deepcopy(method)
    fn.returns = None
    for arg in fn.args.args:
        arg.annotation = None
    # Execute only the reviewed string-building method, without module imports,
    # model initialization, filesystem/network globals, or arbitrary builtins.
    for node in ast.walk(fn):
        if isinstance(node, (ast.Import, ast.ImportFrom, ast.Global, ast.Nonlocal)):
            raise ValueError('Context function is no longer an isolated pure method')
        if isinstance(node, ast.Call) and not (isinstance(node.func, ast.Attribute) and node.func.attr in {'get', 'append', 'join'}):
            raise ValueError('Unexpected operation in context method')
    module = ast.fix_missing_locations(ast.Module(body=[fn], type_ignores=[]))
    scope = {'__builtins__': {}}
    exec(compile(module, str(path), 'exec'), scope)
    token_limits = [n.value.value for n in ast.walk(cls) if isinstance(n, ast.keyword) and n.arg == 'max_tokens' and isinstance(n.value, ast.Constant)]
    measurements = []
    for s in samples:
        readmes = [x for x in s['project_sources'] if x['role'] == 'project_readme']
        readme = next((x for x in readmes if x['upstream_path'].lower() == 'readme.md'), readmes[0])
        text = (ROOT / readme['text_path']).read_text()
        context = scope['_build_context'](None, {'repositories': [{'name': s['project_repository'], 'readme': text, 'files': []}]})
        actual = context.split('README:\n', 1)[1].rstrip('\n')
        assert actual == text[:1000].rstrip('\n')
        d = PRIVATE / f"{s['id']}-{s['github_user']}"
        (d / 'candidate-readme-context.txt').write_text(context)
        (d / 'candidate-readme-context.txt').chmod(0o600)
        measurements.append({'sample_id': s['id'], 'project': s['project_repository'], 'readme_source': readme['local_path'], 'complete_readme_characters': len(text), 'readme_characters_in_context': min(1000, len(text)), 'dropped_characters': max(0, len(text) - 1000), 'retained_fraction': round(min(1000, len(text)) / len(text), 4), 'local_context_path': str((d / 'candidate-readme-context.txt').relative_to(ROOT))})
    report = {'type': 'executed local pure context builder; no model or network calls', 'upstream_commit': '8b6000573f1e2ffd7e8ad698d1eeaec5c17a981d', 'method_sha256': hashlib.sha256(ast.get_source_segment(source, method).encode()).hexdigest(), 'configured_output_max_tokens': token_limits, 'samples': measurements, 'truncated_count': sum(x['dropped_characters'] > 0 for x in measurements), 'model_evaluation': 'not_run'}
    dump(OUT / 'context-budget-audit.json', report)
    lines = ['# 真实材料在候选分析器中的输入损失', '', '这是本地实际执行纯文本上下文拼装函数的结果，不是模型效果评测，也没有运行第三方完整 pipeline。', '', '对象为 ai-recruiter-assistance 固定提交 `8b6000573f1e2ffd7e8ad698d1eeaec5c17a981d` 的 `GitHubCodeAnalyzer._build_context`。仅向该方法传入十个项目的完整 README，没有导入其应用、读取凭据或调用模型。', '', '| 项目 | README 完整字符数 | 进入上下文 | 保留比例 |', '| --- | ---: | ---: | ---: |']
    lines += [f"| {x['project']} | {x['complete_readme_characters']:,} | {x['readme_characters_in_context']:,} | {x['retained_fraction']:.1%} |" for x in measurements]
    lines += ['', f"十份 README 中有 {report['truncated_count']} 份被截断。除此之外，源码还把单个代码片段截到 800 字符、每个仓库只取三个代码片段，并将分析模型输出设为 max_tokens={token_limits}。这些是输入和输出容量限制，不能单靠换更复杂的测试对话解决。", '', '本次评估集保存完整公开原文，仍允许后续模型采用分段处理与可追溯的分层摘要；不能悄悄取前 1,000 字符后声称读完全部材料。调用预算不足应明确暴露，而不是把缺失内容写成用户没有对应经验。', '', '该结果不证明全部画像质量问题都由截断导致，也不代表另两个候选已通过评估。尚未执行模型画像抽取、入库或多轮修改。', '', '[机器可读结果](context-budget-audit.json) · [被测源码](../../repos/ai-recruiter-assistance/github/analyzer.py)']
    (OUT / '基线输入损失.md').write_text('\n'.join(lines) + '\n')
    return report

def dialogue_cases():
    text = (OUT / '长篇输入与连续修改.md').read_text()
    cases = []
    for block in text.split('\n## ')[1:]:
        title = block.splitlines()[0]
        if not title.startswith(('A：', 'B：', 'C：')):
            continue
        turns = []
        for part in block.split('\n### ')[1:]:
            label, body = part.split('\n', 1)
            turns.append({'role': 'expected_assistant' if label.startswith('期望') else 'user', 'label': label, 'content': body.strip()})
        cases.append({'id': 'dialogue-' + title[0], 'title': title, 'source_type': 'synthetic_evaluation_dialogue', 'actor': 'unnamed fictional tester; not a real CV subject', 'created_by': 'assistant for this evaluation', 'real_person_attribution': False, 'run_status': 'not_run', 'initial_input_characters': len(turns[0]['content']), 'turns': turns})
    return cases

def main():
    manifest = json.loads((OUT / 'manifest.json').read_text())
    samples = manifest['samples']
    assert len(samples) == 10 and len({s['github_user'] for s in samples}) == 10
    assert not manifest['errors'] and manifest['status'] == 'source_reviewed'
    hashes, source_count = set(), 0
    for s in samples:
        assert s['identity_review']['self_identification_found']
        assert not s['project_is_fork']
        assert s['primary_resume_characters'] >= 2000
        primary_hash = s['resume_sources'][0]['sha256']
        assert primary_hash not in hashes
        hashes.add(primary_hash)
        for source in s['resume_sources'] + s['project_sources']:
            p, tp = ROOT / source['local_path'], ROOT / source['text_path']
            assert hashlib.sha256(p.read_bytes()).hexdigest() == source['sha256']
            assert len(tp.read_text()) == source['characters']
            assert source['truncated'] is False and len(source['commit']) == 40
            assert source['commit'] in source['source_url']
            source_count += 1
    audit = audit_context(samples)
    dialogues = dialogue_cases()
    assert len(dialogues) == 3 and all(x['initial_input_characters'] >= 1200 for x in dialogues)
    real_cases = []
    for s in samples:
        primary = s['resume_sources'][0]
        real_cases.append({'id': 'real-' + s['id'], 'sample_id': s['id'], 'source_type': 'real_self_published_resume_and_project', 'input_resume_path': primary['text_path'], 'input_resume_format': 'pdf_extracted_text' if primary['pages'] else Path(primary['upstream_path']).suffix.lstrip('.'), 'input_project_paths': [x['text_path'] for x in s['project_sources'] if x['role'] != 'project_license'], 'alternative_resume_sources': [x['text_path'] for x in s['resume_sources'][1:]], 'instruction': '根据完整资料整理待本人确认的画像草稿，保留具体教育、履历、奖项、论文、项目职责和证据。不要把同一个经历的中英文版本或简历长短版本重复累计。不得推断此人的活动参加意愿、当前合作目标、联系方式展示同意或熟练程度。资料已有内容先抽取，缺失可以留空。', 'expected_checks': ['具体记录及来源，不只写标签和笼统总结', '历史来源不自动代表现状；自述不等于独立核验', '仓库归属、可归因提交、团队职责、学习实现分别处理', 'TeX 注释和模板定义不作为当前经历', 'PDF 多栏与中英文重复信息需要核对', '项目目标和业绩不能互换；未知与未提及不能当作不存在', '不得创建真实产品用户或公开这些人的联系资料'], 'run_status': 'not_run'})
    dump(OUT / 'cases.json', {'dataset': 'real-world-v1', 'real_source_cases': real_cases, 'synthetic_dialogue_cases': dialogues, 'note': 'Expected assistant turns are a human-review rubric, not generated model results. No LLM provider was called.'})
    rows = []
    for s in samples:
        p = s['resume_sources'][0]
        length = f"{p['pages']} 页 PDF" if p['pages'] else f"{p['characters']:,} 字符 {Path(p['upstream_path']).suffix.lstrip('.').upper()} 原文"
        n = len(s['authored_commit_evidence']['commits'])
        rows.append(f"| {s['id']} | [{s['github_user']}]({s['profile_url']}) | [{length}]({p['browser_url']}) | [{s['project_repository'].split('/')[1]}](https://github.com/{s['project_repository']}/tree/{s['project_commit']}) | {s['coverage']} | {n} |")
    total = sum(s['primary_resume_characters'] for s in samples)
    dates = sorted({datetime.fromisoformat(x['retrieved_at']).astimezone(ZoneInfo('Asia/Shanghai')).date().isoformat() for s in samples for x in s['resume_sources'] + s['project_sources']})
    intro = ['# 真实资料画像评估集 v1', '', '已收集并核对 10 组本人公开简历与同账号项目，另有三组长篇模拟对话。真实简历没有改写成模拟人物；对话也不冒充真实人物的发言。', '', '这里的真实性指本人账号发布、简历中的自我标识和项目账号可以对应，不等于已经对学历、任职或成果做独立背景调查。资料包含历史版本，不把旧简历中的 present 自动解释为今天仍然任职。', '', f"本机采集记录日期：{', '.join(dates)}。十份主简历合计 {total:,} 字符，最长 PDF 为 {max(x['pages'] or 0 for s in samples for x in s['resume_sources'])} 页。TeX 字符数包含排版与注释，不能当作纯正文长度。多版本和中英文内容不重复计入主简历合计。", '', '## 十组来源', '', '| 编号 | 账号 | 完整简历 | 对应项目 | 材料覆盖 | 作者提交样本数 |', '| --- | --- | --- | --- | --- | ---: |']
    intro += rows
    intro += ['', '作者提交查询最多取 3 条，只证明相应提交的可归因关系，不表示总贡献量，更不表示独立完成。`wu-kan/HPL-AI` 的账号过滤查询没有返回提交，已保留为归因缺口；不能据此断定没有贡献，也不能把整个 HPL 上游实现算作本人原创。', '', '## 本地完整资料', '', '原文位于 `../../.private/real-world-v1/编号-账号/`。每组包含 `resume/`、`project/`、`sample.json`、项目树及作者提交记录。原始资料只在本机被 Git 忽略的目录保存；公开索引不复制联系方式。', '', '保存的是完整简历文件和选定项目文件的不可变快照，不是十个完整 Git 克隆。每个文件记录源 URL、固定提交、SHA-256、获取时间、字节数、字符数和解析方法。README 完整保存，代码与深层文档是明确选取的样本，不能声称审查了整个仓库。', '', '公开原文保留原有权利与来源说明；本地研究采集不表示获得将他人履历作为产品注册资料或公开再分发的授权。未联系样本人物，未把他们放入任何活动候选池，未上传真实简历给外部模型。', '', '## 可直接查看的结果', '', '- [长篇输入与连续修改](长篇输入与连续修改.md)：三种不同进度的想法；每组首次输入超过 1,200 字符，后续包含局部修改、贡献纠正、定位转向和隐私调整。', '- [基线输入损失](基线输入损失.md)：对十份真实 README 实际运行候选的纯上下文拼装方法，测量被截断多少；不是 LLM 效果评测。', '- [机器可读用例](cases.json)：10 个真实资料抽取用例 + 3 个模拟多轮用例，所有模型运行状态均为 not_run。', '- [来源清单](manifest.json)：固定提交、文件位置、身份对应依据、贡献证据与未解决限制。', '- [本地完整性检查](validation.json)：数量、文件哈希、文本长度、权限和文档链接检查。', '', '## 这批材料要求什么样的流程', '', '输入已经详细时，先展示可核对的画像和想法草稿，只问影响当前决定的缺口。不能让所有人从固定问卷第一题重来；短卡片摘要、完整原文、可重复经历记录、来源与版本应分别保留。', '', '长简历里的研究、工程、教学、组织与创业经历不能只压成技能标签；目标、实际成果、学习实践、团队贡献和未来意愿需要区分。一次只改合作偏好或展示范围，不应重置全局履历或隐式触发重抓。', '', '本轮已完成数据与用例准备，并执行上下文容量检查。尚未运行真实模型的画像抽取、多轮修改、数据库写入或产品端到端测试，因此不宣称画像效果已经达标。', '', '## 复核与补充', '', '采集脚本位于 [collect_real_world_samples.py](../../scripts/collect_real_world_samples.py)，证据补充位于 [enrich_real_world_samples.py](../../scripts/enrich_real_world_samples.py)。运行 [build_real_world_evaluation.py](../../scripts/build_real_world_evaluation.py) 可离线重新核对本次快照、重建用例并复现上下文测量。', '', '剔除记录：`hijiangtao/resume` 下载版本仍含姓名及 XXX 占位符，未计入十组；`geekplux/cv_resume` 为模板导向候选，未选入。模板工具可以用，但其中的示例人物不能冒充真实简历。']
    (OUT / 'README.md').write_text('\n'.join(intro) + '\n')
    for p in PRIVATE.rglob('*'):
        p.chmod(0o700 if p.is_dir() else 0o600)
    PRIVATE.chmod(0o700)
    missing = []
    for p in OUT.glob('*.md'):
        for link in re.findall(r'\[[^\]]+\]\(([^)]+)\)', p.read_text()):
            if '://' not in link and not link.startswith('#') and not (p.parent / link.split('#')[0]).exists():
                missing.append({'file': p.name, 'link': link})
    # validation.json is created below; treat its forward link as expected.
    missing = [x for x in missing if x['link'] != 'validation.json']
    assert not missing, missing
    assert '.private/' in (ROOT / '.gitignore').read_text()
    validation = {'checked_at': datetime.now(timezone.utc).isoformat(), 'status': 'passed', 'real_people_samples': len(samples), 'source_files_hash_verified': source_count, 'unique_primary_resume_hashes': len(hashes), 'primary_resume_characters_total': total, 'full_source_truncation': False, 'dialogue_cases': len(dialogues), 'initial_dialogue_characters': {x['id']: x['initial_input_characters'] for x in dialogues}, 'candidate_readmes_truncated': audit['truncated_count'], 'attributed_commit_samples': sum(len(s['authored_commit_evidence']['commits']) for s in samples), 'samples_without_attributed_commits': [s['id'] for s in samples if not s['authored_commit_evidence']['commits']], 'private_files_mode': '600', 'private_directories_mode': '700', 'local_markdown_links': 'passed', 'llm_quality_evaluation': 'not_run', 'application_tests': 'not_run', 'external_model_upload': False}
    dump(OUT / 'validation.json', validation)
    print(json.dumps(validation, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
