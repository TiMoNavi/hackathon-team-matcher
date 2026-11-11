"""Review a recorded synthetic run; no credentials, network or model calls."""
from pathlib import Path
import hashlib
import json
import sys

path = Path(sys.argv[1]).resolve()
workspace = Path(__file__).resolve().parents[6]
source_dir = workspace / 'docs/推荐模块/sources'
if path.parent != source_dir or not path.name.startswith('conversation-live_'):
    raise SystemExit('Expected recorded synthetic conversation in documentation sources')
data = json.loads(path.read_text())
corpus = json.loads((workspace / 'docs/推荐模块/examples/conversation-project-corpus_2026-11-12.json').read_text())
people = {u['id']: u for u in corpus['users']}
checks = []
def check(ok, label):
    checks.append({'label': label, 'passed': bool(ok)})

turns = {t['id']: t for t in data['turns']}
requests = data['requests']
check(len(turns) == 9 and all(t['result']['error'] is None for t in turns.values()), 'all nine user turns complete successfully')
check(len(requests) <= 16, 'at most sixteen actual gateway requests')
check(all(r['request_bytes'] <= 24576 for r in requests), 'complete wire requests at most 24KiB')
check(all(t['model_delta'] <= (5 if t['id'] in ['A1', 'A2', 'A6'] else 2) for t in turns.values()), 'all turns remain within their model attempt limits')
for key in ['A3', 'A4', 'A5', 'A7', 'A8', 'A9']:
    check(key in turns and turns[key]['search_delta'] == 0, key + ' discusses or clarifies without retrieval')
check('A1' in turns and turns['A1']['search_delta'] == 0, 'A1 asks a real clarification before retrieval')
check('A2' in turns and turns['A2']['new_run'] is False and turns['A2']['search_delta'] == 1, 'A2 continues original run with exactly one retrieval')
if 'A2' in turns and 'A6' in turns:
    old = {i['id'] for i in turns['A2']['result']['items']}
    new = {i['id'] for i in turns['A6']['result']['items']}
    check(turns['A6']['new_run'] and turns['A6']['search_delta'] == 1 and not old.intersection(new), 'A6 explicitly retrieves a distinct batch')
else:
    check(False, 'A6 explicitly retrieves a distinct batch')
for key in ['A2', 'A6']:
    if key not in turns:
        continue
    for item in turns[key]['result']['items']:
        p = people.get(item['id'])
        check(p is not None and p['event_id'] == 7 and not any(p['relationship'].values()) and not p['ever_sent'], key + ' candidate ' + item['id'] + ' passes event/contact boundaries')
        check(p is not None and '后端开发' in p['features'].get('offers', []) and any(a['starts_at'] <= '2026-11-14T14:00:00+08:00' and a['ends_at'] >= '2026-11-14T18:00:00+08:00' for a in p['features'].get('availability', [])), key + ' candidate ' + item['id'] + ' satisfies both confirmed hard conditions')
for r in requests:
    inp = json.loads(r['request']['messages'][1]['content'])
    if 'candidates' not in inp:
        continue
    check(len(inp['candidates']) <= (5 if inp['mode'] == 'discuss' else 24), 'request ' + str(r['number']) + ' respects candidate count')
    for candidate in inp['candidates']:
        encoded = json.dumps(candidate, ensure_ascii=False, separators=(',', ':')).encode()
        check(len(encoded) <= 768, 'request ' + str(r['number']) + ' candidate ' + candidate['id'] + ' respects byte bound')
    if r.get('finish_reason') != 'stop':
        continue
    try:
        out = json.loads(r['assistant_content'])
    except (ValueError, TypeError):
        check(False, 'request ' + str(r['number']) + ' has valid visible JSON')
        continue
    ids = {c['id']: {f['id'] for f in c['facts']} for c in inp['candidates']}
    check(all(i['id'] in ids and set(i['fact_ids']).issubset(ids[i['id']]) for i in out.get('items', [])), 'request ' + str(r['number']) + ' cites facts actually sent for the same person')
if turns:
    last = list(turns.values())[-1]['result']
    permits = [e['permit_id'] for t in last['turns'] for e in t['events'] if e['type'] == 'model_attempt_reserved']
    check(len(permits) == len(set(permits)) == len(requests) == last['model_calls_used'], 'durable call ledger matches actual unique gateway attempts')
    check(sum(t['search_delta'] for t in turns.values()) == len(data.get('backend_searches', [])), 'recorded tool searches match actual backend retrievals')
usage = {k: sum(r.get('usage', {}).get(k, 0) for r in requests) for k in ['prompt_tokens', 'completion_tokens', 'total_tokens']}
report = {'source': path.name, 'source_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
          'structural_status': 'passed' if all(c['passed'] for c in checks) else 'not_passed',
          'semantic_status': 'requires_separate_human_review', 'checks': checks, 'turns_recorded': len(turns),
          'generation_requests': len(requests), 'finish_reason_counts': {s: sum(str(r.get('finish_reason', 'no_response')) == s for r in requests) for s in sorted({str(r.get('finish_reason', 'no_response')) for r in requests})},
          'maximum_wire_bytes': max([r['request_bytes'] for r in requests], default=0), 'gateway_reported_usage': usage,
          'usage_note': 'Upstream reported counters only; max_tokens is not treated as a verified billing limit.'}
review_path = path.with_name(path.stem + '-review.json')
review_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
lines = ['# 连续找队友对话实录', '', '> 全部人物和用户消息为预先编写的合成测试；AI 文案来自指定网关真实响应。未创建真实账户。以下保留原文，没有润色，合法结构不等于语义验收通过。', '',
         '原始请求、输出、失败与计量见 [' + path.name + '](' + path.name + ')。结构检查见 [' + review_path.name + '](' + review_path.name + ')。', '',
         f"记录 {len(turns)} 轮，实际生成 {len(requests)} 次；结构结果 {report['structural_status']}。", '']
for t in data['turns']:
    v = t['result']; lines += ['## ' + t['id'], '', '**模拟用户**', '', t['text'], '', '**实际 AI 答复**', '', v['message'], '']
    for e in v['events']:
        if e['type'].startswith('tool_'):
            lines += ['- 后端事件 ' + e['type'] + ' / ' + e['tool'] + '：' + e['message'] + (f" 符合条件 {e['candidate_count']} 人，实际发送 {e['model_candidate_count']} 人。" if 'candidate_count' in e else '')]
    current = v['turns'][-1] if v['turns'] else {}
    for item in current.get('items', []):
        name = people.get(item['id'], {}).get('display_name', item['id'])
        lines += ['', '**' + name + '（' + item['id'] + '，仅测试姓名映射）**', '', item['reason'], '']
        lines += ['- 待核实：' + gap for gap in item['gaps']]
        lines += ['', '事实引用：' + ', '.join(item['fact_ids']) + '。']
    lines += ['', f"本轮实际模型调用 {t['model_delta']} 次；后端检索 {t['search_delta']} 次；新 run：{t['new_run']}；状态：{v['interaction_status']}；错误：{v['error']}。", '']
lines += ['## 截断和失败', '', '| 请求 | 轮次 | finish_reason | 完整请求字节 |', '|---|---|---|---|']
for r in requests:
    lines.append(f"| {r['number']} | {r['turn']} | {r.get('finish_reason', 'no_response')} | {r['request_bytes']} |")
path.with_name(path.stem + '-transcript.md').write_text('\n'.join(lines) + '\n')
print(json.dumps({k: report[k] for k in ['structural_status', 'turns_recorded', 'generation_requests', 'finish_reason_counts', 'maximum_wire_bytes']}, ensure_ascii=False))
