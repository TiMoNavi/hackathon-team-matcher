'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { conclusionLabels, dimensionLabels, optionFactText, optionLabel, questionLabels, semanticLabels, statusLabels, type AnalysisApi, type CooperationAnalysis, type SelfSelection } from '../lib/recommendation-runtime/analysis';
import type { DiscoveryPerson, ReadFailure } from '../lib/recommendation-runtime/contracts';

function errorText(error: ReadFailure): string {
  if (error.kind === 'network') return '连接中断，操作结果暂不确定。请先重新读取资料选择，系统不会自动重复提交。';
  if (error.status === 503) return '合作分析服务暂时不可用。你仍可以继续普通发现。';
  if (error.status === 409) return '选择、资料或活动已变化，旧分析已清除。请重新读取并确认选择。';
  if (error.status === 404) return '这位伙伴目前不可用于分析，请重新读取人选。';
  if (error.status === 401 || error.status === 403) return '登录或活动权限已变化，请重新确认后继续。';
  return '这次分析未能完成，或服务返回了尚不支持的内容。请重新读取后再试。';
}
export interface RecommendationAnalysisProps { readonly api: AnalysisApi; readonly person: DiscoveryPerson; readonly onInvalidate: (error: ReadFailure) => void }
export function RecommendationAnalysis({ api, person, onInvalidate }: RecommendationAnalysisProps) {
  const [selection, setSelection] = useState<SelfSelection | null>(null);
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState<'read' | 'save' | 'analyze' | null>(null);
  const [error, setError] = useState<ReadFailure | null>(null);
  const [result, setResult] = useState<CooperationAnalysis | null>(null);
  const [receipt, setReceipt] = useState(false);
  const mounted = useRef(false); const operation = useRef(0); const locked = useRef(false);
  useEffect(() => { mounted.current = true; const ticketRef = operation; return () => { mounted.current = false; ticketRef.current++; }; }, []);
  const dirty = !selection || JSON.stringify([...chosen].sort()) !== JSON.stringify([...selection.selected_attribute_ids].sort());
  function fail(failure: ReadFailure) {
    setResult(null); setError(failure); setReceipt(false);
    if (failure.kind === 'network' || failure.status === 409) setSelection(null);
    if (failure.status === 401 || failure.status === 403 || failure.status === 404 || failure.code === 'ANALYSIS_CONTEXT_CHANGED' || failure.code === 'ANALYSIS_PROJECTION_CHANGED') onInvalidate(failure);
  }
  async function run(kind: 'read' | 'save' | 'analyze') {
    if (locked.current || kind !== 'read' && !selection) return;
    locked.current = true; const ticket = ++operation.current;
    setBusy(kind); setError(null); setResult(null); setReceipt(false);
    const response = kind === 'read' ? await api.readSelection() : kind === 'save' ? await api.saveSelection(chosen, selection!.selection_version) : await api.analyze(person, selection!.selection_version);
    // Same-controller denial remains authoritative after a person switch. The
    // disposed controller ignores failures from a prior activity/identity.
    if (!response.ok && (response.error.status === 401 || response.error.status === 403 || response.error.status === 404 || response.error.status === 409)) onInvalidate(response.error);
    if (!mounted.current || operation.current !== ticket) return;
    locked.current = false; setBusy(null);
    if (!response.ok) { fail(response.error); return; }
    if (kind === 'analyze') setResult(response.data as CooperationAnalysis);
    else { const next = response.data as SelfSelection; setSelection(next); setChosen(next.selected_attribute_ids); setReceipt(kind === 'save' && next.selection_current); }
  }
  return <section className="runtime-analysis" aria-labelledby="recommendation-analysis-heading"><div className="runtime-analysis-heading"><div><span className="section-kicker"><Sparkles size={15} />合作分析 · 规则解释</span><h2 id="recommendation-analysis-heading">一起做事，先把依据说清楚。</h2><p>先选择你愿意用于本次比较的资料，再分析你与 {person.display_name} 的合作可能。不会调用 AI，也不生成匹配分。</p></div><Button variant="outline" onClick={() => void run('read')} disabled={busy !== null}><RefreshCw size={15} />{busy === 'read' ? '正在读取选择' : '读取我的可选资料'}</Button></div>
    {error && <div className="runtime-error" role="alert"><ShieldCheck size={20} /><div><p>{errorText(error)}</p>{error.requestId && <small>问题编号：{error.requestId}</small>}</div></div>}
    {selection && <div className="runtime-selection"><p className="runtime-source">这些选项仅含已获准用于规则分析的代码与时间。不会使用未选资料、私密原文或草稿；选择绑定当前登录会话，退出后不承诺恢复。</p>{!selection.selection_current && <p className="runtime-selection-stale" role="alert">资料已经变化，请重新勾选并保存。读取不会替你自动更新选择。</p>}<fieldset disabled={busy !== null}><legend>由你决定使用哪些资料</legend>{selection.options.length === 0 ? <p className="runtime-source">当前没有可选的分析资料。你仍可明确保存「不使用本人资料」，分析会如实显示资料不足。</p> : selection.options.map(option => <label className="runtime-selection-option" key={option.attribute_id}><input type="checkbox" checked={chosen.includes(option.attribute_id)} onChange={event => { setChosen(ids => event.target.checked ? [...ids, option.attribute_id] : ids.filter(id => id !== option.attribute_id)); setResult(null); setReceipt(false); }} /><span><strong>{optionLabel(option)} <small>{option.scope === 'global' ? '全局' : '本次活动'}</small></strong>{option.facts.map(fact => <span key={fact.semantic}>{semanticLabels[fact.semantic]}：{optionFactText(fact) || '未提供代码'}</span>)}</span></label>)}</fieldset><div className="runtime-selection-actions"><Button variant="ghost" disabled={busy !== null} onClick={() => { setChosen([]); setResult(null); setReceipt(false); }}>清空勾选</Button><Button variant="secondary" disabled={busy !== null} onClick={() => void run('save')}>{busy === 'save' ? '正在保存选择' : chosen.length ? '保存选中的 ' + chosen.length + ' 条资料' : '保存：不使用本人资料'}</Button><Button disabled={busy !== null || dirty || !selection.selection_current || selection.selection_version < 1} onClick={() => void run('analyze')}>{busy === 'analyze' ? '正在生成规则分析' : '分析我与 ' + person.display_name}</Button></div>{receipt && <p className="runtime-receipt" role="status"><Check size={15} />已按服务端回执保存本次选择。</p>}{dirty && <p className="runtime-source">勾选已经改变，请先保存再分析。</p>}</div>}
    {busy === 'analyze' && <p role="status" className="runtime-source">正在核对当前活动、所选资料和候选版本…</p>}
    {result && <div className="runtime-analysis-results" aria-live="polite"><p className="runtime-analysis-disclaimer">这是记录事实之间的规则解释，未检查硬条件，不是能力认证，也不是是否适合合作的最终结论。</p>{result.dimensions.map(row => <article className="runtime-analysis-row" key={row.dimension} data-status={row.status}><div><h3>{dimensionLabels[row.dimension]}</h3><span className="runtime-analysis-status">{statusLabels[row.status]}</span></div><div><p>{conclusionLabels[row.conclusion_code]}</p><dl>{row.fact_lines.map((line, index) => <div key={index}><dt>{line.label}</dt><dd>{line.values.length ? line.values.join('；') : '本次没有对应记录'}</dd></div>)}</dl><p className="runtime-source">依据：本人所选资料 {row.evidence.filter(e => e.subject === 'self').length} 条；候选获准资料 {row.evidence.filter(e => e.subject === 'candidate').length} 条。</p><ul>{row.question_codes.map(code => <li key={code}>{questionLabels[code]}</li>)}</ul></div></article>)}</div>}
    <p className="runtime-ai-disabled"><Sparkles size={15} />AI 多轮对话尚未接入此页面；不会用预写回复模拟模型。</p>
  </section>;
}
