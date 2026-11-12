import type { CurrentEvent, DiscoveryPerson, ReadFailure, ReadResult } from './contracts';
import { contextMatches, failure } from './decode';
import { createOrdinaryDiscoveryReads } from './client';
import { createSameOriginDiscoveryTransport, type BrowserFetch, type RecommendationBootstrap } from './browser-transport';

export interface AnalysisBootstrap extends RecommendationBootstrap { readonly csrf_header: 'X-CSRF-Token'; readonly csrf_token: string }
export const dimensionLabels = { contribution_capability: '贡献与能力', project_direction: '项目方向', role_complementarity: '角色互补', availability: '可参与时段', collaboration_arrangements: '协作安排' } as const;
export type AnalysisDimension = keyof typeof dimensionLabels;
export type AnalysisStatus = 'supported' | 'partial' | 'unknown' | 'conflict';
export const statusLabels: Record<AnalysisStatus, string> = { supported: '已有对应依据', partial: '部分对应，仍需确认', unknown: '资料不足，暂不能判断', conflict: '当前记录存在差异' };
export const semanticLabels = { topics: '项目方向', capability_skills: '自述技能或项目技术', offered_skills: '本次愿意提供的技能', needed_skills: '本次希望伙伴提供的技能', offered_roles: '本次承担角色', needed_roles: '本次需要的角色', availability: '可参与时段', collaboration_modes: '协作方式', communication_preferences: '沟通偏好' } as const;
export type AnalysisSemantic = keyof typeof semanticLabels;
const sourceLabels: Record<string, string> = { direction: '关注方向', skill: '自述技能', project: '项目技术', event_contribution: '本次贡献', event_seeking: '本次需要', event_role: '本次角色', event_availability: '本次可参与时段', event_collaboration_mode: '本次协作方式', communication_preference: '沟通偏好' };
const sourceMeanings: Record<string, readonly AnalysisSemantic[]> = { direction: ['topics'], skill: ['capability_skills'], project: ['capability_skills'], event_contribution: ['offered_skills'], event_seeking: ['needed_skills', 'needed_roles'], event_role: ['offered_roles'], event_availability: ['availability'], event_collaboration_mode: ['collaboration_modes'], communication_preference: ['communication_preferences'] };
export const conclusionLabels: Record<string, string> = {
  insufficient_task_capability_evidence: '现有资料不足以判断 TA 的技能与本次贡献能否对应你的需要。',
  recorded_skills_and_offers_cover_recorded_needs: 'TA 记录的技能和本次愿意贡献的技能，都覆盖了你选中的技能需要。',
  capability_or_current_contribution_needs_confirmation: '部分技能或本次贡献与你的需要对应，还需要确认实际任务和经验。',
  recorded_skills_and_offers_do_not_cover_recorded_needs: '当前记录的技能和本次贡献，没有覆盖你选中的技能需要。',
  declared_directions_unavailable: '一方缺少已选用的项目方向，暂时无法比较。',
  no_shared_declared_direction_codes: '已记录的项目方向代码没有交集，可以进一步聊聊具体问题。',
  shared_declared_direction_codes: '双方已记录的项目方向有交集。',
  reciprocal_declared_role_needs_covered: '双方本次提供的角色，分别对应了对方记录的角色需要。',
  one_way_or_partial_role_coverage: '目前有单向或部分角色对应，还需要确认另一方的期待。',
  no_coverage_of_declared_role_needs: '双方记录的角色需要尚未被对方提供的角色覆盖。',
  reciprocal_role_evidence_incomplete: '双方角色供需资料还不完整，暂时不能判断互补关系。',
  availability_unavailable: '一方缺少可参与时段，暂时无法比较时间。',
  no_overlap_in_recorded_windows: '当前记录的可参与时段没有重叠。',
  shared_available_windows_only: '记录中存在共同可参与时段，仍需确认实际投入。',
  some_recorded_arrangements_have_no_shared_code: '部分协作或沟通安排没有相同选项，需要进一步协商。',
  collaboration_preferences_unavailable: '协作或沟通偏好资料不足，暂时无法比较。',
  shared_explicit_arrangement_codes: '双方明确填写的协作或沟通安排中有相同选项。',
};
export const questionLabels: Record<string, string> = {
  confirm_task_scope: '你们准备先完成哪个具体任务？', confirm_needed_skills: '这个任务最需要哪些技能？', confirm_relevant_experience: 'TA 是否有与当前任务相关的实际经验？', confirm_current_contribution: 'TA 这次愿意负责哪些具体工作？',
  confirm_project_problem_and_scope: '你们想解决的具体问题与项目范围一致吗？', confirm_roles_and_responsibilities: '双方希望各自负责什么，谁来推进决策？', confirm_required_windows_and_commitment: '共同时间是否覆盖关键协作时段，各自能投入多少？', agree_on_working_arrangements: '你们希望怎样沟通、交付和处理分歧？',
};
export interface AnalysisWindow { readonly starts_at: string; readonly ends_at: string; readonly timezone?: string }
export interface SelfSelectionOption { readonly attribute_id: string; readonly source_key: string; readonly scope: string; readonly facts: readonly { readonly semantic: AnalysisSemantic; readonly values: readonly string[] | readonly AnalysisWindow[] }[] }
export interface SelfSelection { readonly space_id: number; readonly selection_version: number; readonly selection_current: boolean; readonly selected_attribute_ids: readonly string[]; readonly options: readonly SelfSelectionOption[] }
export interface AnalysisEvidence { readonly subject: 'self' | 'candidate'; readonly owner_id: number; readonly attribute_id: string; readonly scope: string; readonly profile_revision: number; readonly permission_version: number }
export interface AnalysisFactLine { readonly label: string; readonly values: readonly string[] }
export interface AnalysisRow { readonly dimension: AnalysisDimension; readonly status: AnalysisStatus; readonly conclusion_code: string; readonly question_codes: readonly string[]; readonly evidence: readonly AnalysisEvidence[]; readonly fact_lines: readonly AnalysisFactLine[] }
export interface CooperationAnalysis { readonly space_id: number; readonly candidate_id: number; readonly selection_version: number; readonly explanation_source: 'rules'; readonly hard_conditions_checked: false; readonly dimensions: readonly AnalysisRow[] }
export interface AnalysisApi { readSelection(): Promise<ReadResult<SelfSelection>>; saveSelection(ids: readonly string[], expectedVersion: number): Promise<ReadResult<SelfSelection>>; analyze(person: DiscoveryPerson, expectedVersion: number): Promise<ReadResult<CooperationAnalysis>> }
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
function record(value: unknown, keys: readonly string[]): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); const row = value as Record<string, unknown>; if (Object.keys(row).some(key => !keys.includes(key)) || keys.some(key => !own(row, key))) throw new Error(); return row; }
function text(value: unknown, max = 512): string { if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(); return value; }
function integer(value: unknown, minimum = 0): number { if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error(); return Number(value); }
function strings(value: unknown, max = 6400, textMax = 128): string[] { if (!Array.isArray(value) || value.length > max) throw new Error(); const result = value.map(item => text(item, textMax)); if (new Set(result).size !== result.length) throw new Error(); return result; }
function status(value: unknown): AnalysisStatus { if (typeof value !== 'string' || !own(statusLabels, value)) throw new Error(); return value as AnalysisStatus; }
function scope(value: unknown, spaceId: number): string { if (value !== 'global' && value !== 'space:' + spaceId) throw new Error(); return value as string; }
function windows(value: unknown, requireZone = false): AnalysisWindow[] {
  if (!Array.isArray(value) || value.length > 64) throw new Error();
  return value.map(item => {
    const keys = item && typeof item === 'object' && 'timezone' in item ? ['starts_at', 'ends_at', 'timezone'] : ['starts_at', 'ends_at'];
    const row = record(item, keys); const start = text(row.starts_at); const end = text(row.ends_at);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(start) || !/^\d{4}-\d{2}-\d{2}T/.test(end) || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) throw new Error();
    const timezone = row.timezone === undefined ? undefined : text(row.timezone, 100); if (requireZone && !timezone) throw new Error();
    return { starts_at: start, ends_at: end, ...(timezone ? { timezone } : {}) };
  });
}
export function optionLabel(option: SelfSelectionOption): string { return sourceLabels[option.source_key]; }
export function optionFactText(fact: SelfSelectionOption['facts'][number]): string { return fact.semantic === 'availability' ? (fact.values as readonly AnalysisWindow[]).map(window => window.starts_at + ' → ' + window.ends_at + (window.timezone ? ' · ' + window.timezone : '')).join('；') : (fact.values as readonly string[]).join('、'); }
export function decodeSelfSelection(value: unknown, spaceId: number): SelfSelection {
  const row = record(value, ['space_id', 'selection_version', 'selection_current', 'selected_attribute_ids', 'options']);
  if (integer(row.space_id, 1) !== spaceId || typeof row.selection_current !== 'boolean' || !Array.isArray(row.options) || row.options.length > 6400) throw new Error();
  const options = row.options.map(raw => {
    const item = record(raw, ['attribute_id', 'source_key', 'scope', 'facts']); const source = text(item.source_key, 64);
    if (!own(sourceMeanings, source) || !Array.isArray(item.facts) || !item.facts.length || item.facts.length > 9) throw new Error();
    const itemScope = scope(item.scope, spaceId); if ((source.startsWith('event_')) !== (itemScope !== 'global')) throw new Error();
    const facts = item.facts.map(rawFact => { const fact = record(rawFact, ['semantic', 'values']); const semantic = text(fact.semantic) as AnalysisSemantic; if (!sourceMeanings[source].includes(semantic)) throw new Error(); return { semantic, values: semantic === 'availability' ? windows(fact.values) : strings(fact.values, 64, 64) }; });
    if (new Set(facts.map(fact => fact.semantic)).size !== facts.length) throw new Error();
    return { attribute_id: text(item.attribute_id, 128), source_key: source, scope: itemScope, facts };
  });
  if (new Set(options.map(option => option.attribute_id)).size !== options.length) throw new Error();
  const ids = strings(row.selected_attribute_ids); if (ids.some(id => !options.some(option => option.attribute_id === id)) || (!row.selection_current && ids.length)) throw new Error();
  return { space_id: spaceId, selection_version: integer(row.selection_version), selection_current: row.selection_current, selected_attribute_ids: ids, options };
}
function factLines(dimension: AnalysisDimension, input: unknown): AnalysisFactLine[] {
  const coverage = (value: unknown, label: string): AnalysisFactLine[] => { const row = record(value, ['status', 'matched', 'uncovered_recorded_needs']); status(row.status); return [{ label: label + ' · 对应代码', values: strings(row.matched, 64, 64) }, { label: label + ' · 未覆盖的记录需要', values: strings(row.uncovered_recorded_needs, 64, 64) }]; };
  if (dimension === 'contribution_capability') { const row = record(input, ['capability', 'current_contribution']); return [...coverage(row.capability, 'TA 的技能与你的需要'), ...coverage(row.current_contribution, 'TA 本次贡献与你的需要')]; }
  if (dimension === 'role_complementarity') { const row = record(input, ['candidate_to_self', 'self_to_candidate']); return [...coverage(row.candidate_to_self, 'TA 提供给你'), ...coverage(row.self_to_candidate, '你提供给 TA')]; }
  if (dimension === 'project_direction') { const row = record(input, ['shared_codes']); return [{ label: '共同方向代码', values: strings(row.shared_codes, 64, 64) }]; }
  if (dimension === 'availability') { const row = record(input, ['shared_windows', 'hard_condition_check']); if (row.hard_condition_check !== 'not_performed') throw new Error(); return [{ label: '共同可参与时段（未检查硬条件）', values: windows(row.shared_windows, true).map(window => window.starts_at + ' → ' + window.ends_at + ' · ' + window.timezone) }]; }
  const row = record(input, ['collaboration_modes', 'communication_preferences']);
  return (['collaboration_modes', 'communication_preferences'] as const).map(key => { const value = record(row[key], ['status', 'shared_codes']); status(value.status); return { label: key === 'collaboration_modes' ? '共同协作方式代码' : '共同沟通偏好代码', values: strings(value.shared_codes, 64, 64) }; });
}
export function decodeCooperationAnalysis(value: unknown, spaceId: number, candidateId: number, selfId: number, selectionVersion: number): CooperationAnalysis {
  const row = record(value, ['space_id', 'candidate_id', 'selection_version', 'explanation_source', 'hard_conditions_checked', 'dimensions']);
  if (row.space_id !== spaceId || row.candidate_id !== candidateId || row.selection_version !== selectionVersion || row.explanation_source !== 'rules' || row.hard_conditions_checked !== false || !Array.isArray(row.dimensions) || row.dimensions.length !== 5) throw new Error();
  const dimensions = row.dimensions.map((raw, index): AnalysisRow => {
    const item = record(raw, ['dimension', 'status', 'conclusion_code', 'question_codes', 'evidence', 'facts']); const dimension = text(item.dimension) as AnalysisDimension;
    if (dimension !== Object.keys(dimensionLabels)[index] || !own(conclusionLabels, String(item.conclusion_code)) || !Array.isArray(item.evidence) || item.evidence.length > 1280) throw new Error();
    const questions = strings(item.question_codes, 16); if (questions.some(code => !own(questionLabels, code))) throw new Error();
    const evidence = item.evidence.map(rawEvidence => { const e = record(rawEvidence, ['subject', 'owner_id', 'attribute_id', 'scope', 'profile_revision', 'permission_version']); if (e.subject !== 'self' && e.subject !== 'candidate' || e.owner_id !== (e.subject === 'self' ? selfId : candidateId)) throw new Error(); return { subject: e.subject, owner_id: integer(e.owner_id, 1), attribute_id: text(e.attribute_id, 128), scope: scope(e.scope, spaceId), profile_revision: integer(e.profile_revision), permission_version: integer(e.permission_version) } as AnalysisEvidence; });
    return { dimension, status: status(item.status), conclusion_code: text(item.conclusion_code), question_codes: questions, evidence, fact_lines: factLines(dimension, item.facts) };
  });
  return { space_id: spaceId, candidate_id: candidateId, selection_version: selectionVersion, explanation_source: 'rules', hard_conditions_checked: false, dimensions };
}

export function createAnalysisApi(bootstrap: AnalysisBootstrap, origin: string, fetcher: BrowserFetch, context: CurrentEvent, selfId: number): AnalysisApi {
  const ordinary = createOrdinaryDiscoveryReads(createSameOriginDiscoveryTransport(bootstrap, origin, fetcher));
  if (bootstrap.csrf_header !== 'X-CSRF-Token' || typeof bootstrap.csrf_token !== 'string' || !bootstrap.csrf_token || bootstrap.csrf_token.length > 4096 || /[\r\n]/.test(bootstrap.csrf_token)) throw new Error('Analysis requires the host CSRF contract.');
  async function authority(): Promise<ReadFailure | null> { const result = await ordinary.readCurrentEvent(); if (!result.ok) return result.error; return contextMatches(context, result.data) ? null : failure('http', 409, 'ANALYSIS_CONTEXT_CHANGED', 'The current activity changed.'); }
  async function request<T>(method: 'GET' | 'PUT' | 'POST', suffix: string, body: object | undefined, decode: (value: unknown) => T): Promise<ReadResult<T>> {
    let requestId: string | null = null; let responseStatus: number | null = null;
    const serialized = body ? JSON.stringify(body) : undefined;
    if (serialized && new TextEncoder().encode(serialized).byteLength > 16384) return { ok: false, error: failure('invalid-request', null, 'REQUEST_TOO_LARGE', 'Use a smaller explicit selection.') };
    try {
      const before = await authority(); if (before) return { ok: false, error: before };
      const response = await fetcher(bootstrap.api_base + '/events/' + context.space_id + '/recommendation-analysis/' + suffix, { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json', ...(method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': bootstrap.csrf_token }) }, ...(serialized ? { body: serialized } : {}) });
      responseStatus = response.status;
      if (!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/i.test(response.headers.get('Content-Type') ?? '')) return { ok: false, error: failure('invalid-response', response.status, 'INVALID_RESPONSE', 'Unsupported analysis response.') };
      const envelope = await response.json();
      if (!envelope || typeof envelope !== 'object' || !envelope.meta || typeof envelope.meta.request_id !== 'string') throw new Error('shape');
      requestId = text(envelope.meta.request_id);
      if (!response.ok) {
        const error = record(envelope.error, ['code', 'message', 'retryable', 'details']);
        if (typeof error.retryable !== 'boolean' || typeof error.message !== 'string') throw new Error('shape');
        return { ok: false, error: failure('http', response.status, text(error.code), 'The analysis request was not completed.', requestId, error.retryable) };
      }
      if (response.status !== 200 || 'error' in envelope) throw new Error('shape');
      let data: T; try { data = decode(envelope.data); } catch { return { ok: false, error: failure('invalid-response', response.status, 'INVALID_RESPONSE', 'Unsupported analysis response.', requestId) }; }
      const after = await authority(); if (after) return { ok: false, error: after };
      return { ok: true, data, requestId };
    } catch { return { ok: false, error: responseStatus === null ? failure('network', null, 'NETWORK_ERROR', 'The outcome is unknown. Read the current selection before trying again.', requestId) : failure('invalid-response', responseStatus, 'INVALID_RESPONSE', 'Unsupported analysis response.', requestId) }; }
  }
  return {
    readSelection: () => request('GET', 'self-selection', undefined, value => decodeSelfSelection(value, context.space_id)),
    saveSelection: (ids, expectedVersion) => {
      try { strings(ids); integer(expectedVersion); } catch { return Promise.resolve({ ok: false, error: failure('invalid-request', null, 'INVALID_REQUEST', 'Invalid selection.') }); }
      return request('PUT', 'self-selection', { attribute_ids: ids, expected_selection_version: expectedVersion, expected_current_event: { selection_revision: context.selection_revision, access_version: context.access_version } }, value => {
        const receipt = decodeSelfSelection(value, context.space_id);
        if (!receipt.selection_current || receipt.selection_version !== expectedVersion + 1 || JSON.stringify([...receipt.selected_attribute_ids].sort()) !== JSON.stringify([...ids].sort())) throw new Error();
        return receipt;
      });
    },
    analyze: (person, expectedVersion) => {
      if (person.space_id !== context.space_id || person.owner_id === selfId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return Promise.resolve({ ok: false, error: failure('invalid-request', null, 'INVALID_REQUEST', 'Select an eligible person and explicitly save your choice.') });
      return request('POST', 'people/' + person.owner_id, { expected_selection_version: expectedVersion, expected_current_event: { selection_revision: context.selection_revision, access_version: context.access_version }, expected_candidate: { global: { revision: person.global.revision, permission_version: person.global.permission_version }, space: { revision: person.space.revision, permission_version: person.space.permission_version }, identity_version: person.identity_version, discovery_version: person.discovery_version, privacy_policy_version: person.privacy_policy_version } }, value => decodeCooperationAnalysis(value, context.space_id, person.owner_id, selfId, expectedVersion));
    },
  };
}
