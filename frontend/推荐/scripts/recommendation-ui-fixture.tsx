// Synthetic transport only. Bundled by verify-recommendation-page.mjs into an
// owned temporary local server; never imported by a product route or host.
import { useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ConnectedRecommendationExperience } from '../components/recommendation-connected';
import { RecommendationController } from '../lib/recommendation-runtime/controller';
import { createOrdinaryDiscoveryReads } from '../lib/recommendation-runtime/client';
import { createSameOriginDiscoveryTransport } from '../lib/recommendation-runtime/browser-transport';
import { createAnalysisApi } from '../lib/recommendation-runtime/analysis';
import type { DiscoveryPerson } from '../lib/recommendation-runtime/contracts';

const context = { space_id: 17, selection_revision: 'selection-' + 'a'.repeat(32), access_version: 'synthetic-access-1' };
const bootstrap = { base_path: '/matcher/app', api_base: '/api/v1', csrf_header: 'X-CSRF-Token' as const, csrf_token: 'synthetic-ui-csrf-not-a-credential' };
const identity = { user_id: 10, nickname: '虚构测试本人', identity_version: 2, avatar_ref: null };
const attribute = (id: string, key: string, value: unknown) => ({ attribute_id: id, key, value, visibility: 'authenticated', confirmation: 'confirmed', last_confirmed_at: '2026-11-12 10:00:00', schema_version: 2 });
function person(owner: number): DiscoveryPerson {
  return { owner_id: owner, space_id: 17, display_name: '虚构伙伴 ' + owner, identity_version: 1, avatar_ref: null,
    global: { revision: 1, permission_version: 1, attributes: [attribute(owner + '-bio', 'bio', '虚构测试资料：一起把活动工具做清楚。\n这段文字由本人确认，仅供离线测试。'), attribute(owner + '-skill', 'skill', { code: 'typescript', label: 'TypeScript', self_level: 'working' }), attribute(owner + '-project', 'project', { title: '虚构活动协作原型', contribution: '设计服务接口并与同伴验证流程', tech_codes: ['typescript'], links: ['https://example.invalid/synthetic-project'] })] },
    space: { revision: 1, permission_version: 1, attributes: [attribute(owner + '-role', 'event_role', { code: 'backend', label: '后端协作' }), attribute(owner + '-needs', 'event_seeking', { role_codes: ['design'], free_text: '希望一起厘清交互流程' })] },
    updated_at: '2026-11-12T00:00:00Z', relationship: { state: 'none', friend: false, pending_out: false, pending_in: false, version: 'r1' }, discovery_version: 1, privacy_policy_version: 's3-2026-11-11:discovery-fields-v2' } as DiscoveryPerson;
}
let mode = 'two'; let version = 0; let selected: string[] = []; let current = { ...context }; let held: (() => void) | null = null;
const calls: { method: string; path: string; body: unknown }[] = [];
const options = [{ attribute_id: 'self-direction', source_key: 'direction', scope: 'global', facts: [{ semantic: 'topics', values: ['community_tools'] }] }, { attribute_id: 'self-need', source_key: 'event_seeking', scope: 'space:17', facts: [{ semantic: 'needed_skills', values: ['typescript'] }, { semantic: 'needed_roles', values: ['backend'] }] }];
const selection = () => ({ space_id: 17, selection_version: version, selection_current: mode !== 'stale-selection', selected_attribute_ids: mode === 'stale-selection' ? [] : selected, options });
const coverage = { status: 'unknown', matched: [], uncovered_recorded_needs: [] };
function analysis(owner: number) {
  return { space_id: 17, candidate_id: owner, selection_version: version, explanation_source: 'rules', hard_conditions_checked: false,
    dimensions: [
      { dimension: 'contribution_capability', status: 'unknown', conclusion_code: 'insufficient_task_capability_evidence', question_codes: ['confirm_needed_skills'], evidence: [], facts: { capability: coverage, current_contribution: coverage } },
      { dimension: 'project_direction', status: 'unknown', conclusion_code: 'declared_directions_unavailable', question_codes: ['confirm_project_problem_and_scope'], evidence: [], facts: { shared_codes: [] } },
      { dimension: 'role_complementarity', status: 'unknown', conclusion_code: 'reciprocal_role_evidence_incomplete', question_codes: ['confirm_roles_and_responsibilities'], evidence: [], facts: { candidate_to_self: coverage, self_to_candidate: coverage } },
      { dimension: 'availability', status: 'unknown', conclusion_code: 'availability_unavailable', question_codes: ['confirm_required_windows_and_commitment'], evidence: [], facts: { shared_windows: [], hard_condition_check: 'not_performed' } },
      { dimension: 'collaboration_arrangements', status: 'unknown', conclusion_code: 'collaboration_preferences_unavailable', question_codes: ['agree_on_working_arrangements'], evidence: [], facts: { collaboration_modes: { status: 'unknown', shared_codes: [] }, communication_preferences: { status: 'unknown', shared_codes: [] } } },
    ] };
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(status === 200 ? { data, meta: { request_id: 'f'.repeat(24) } } : { error: data, meta: { request_id: 'f'.repeat(24) } }), { status, headers: { 'Content-Type': 'application/json' } });
const denial = (status: number, code: string) => json({ code, message: 'Synthetic test response', retryable: false, details: [] }, status);
async function fetcher(path: string, init: RequestInit): Promise<Response> {
  const method = init.method ?? 'GET'; const url = new URL(path, location.origin); calls.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : null });
  if (mode === 'network') throw new Error('Synthetic offline');
  if (mode === 'unauthorized') return denial(401, 'AUTHENTICATION_REQUIRED');
  if (url.pathname === '/api/v1/me/current-event') return json(current);
  if (url.pathname.endsWith('/self-selection')) {
    if (method === 'PUT') { const body = JSON.parse(String(init.body)); if (body.expected_selection_version !== version) return denial(409, 'ANALYSIS_SELECTION_CHANGED'); selected = body.attribute_ids; version++; }
    return json(selection());
  }
  if (url.pathname.includes('/recommendation-analysis/people/')) {
    const owner = Number(url.pathname.split('/').pop());
    if (mode === 'analysis-unavailable') return denial(503, 'ANALYSIS_UNAVAILABLE');
    if (mode.startsWith('analysis-held-')) {
      const deniedStatus = mode === 'analysis-held-401' ? 401 : mode === 'analysis-held-403' ? 403 : mode === 'analysis-held-denial' ? 404 : 0; const snapshot = analysis(owner);
      return new Promise(resolve => { held = () => resolve(deniedStatus ? denial(deniedStatus, deniedStatus === 404 ? 'ANALYSIS_CANDIDATE_UNAVAILABLE' : 'ACCESS_DENIED') : json(snapshot)); });
    }
    const result = analysis(owner); if (mode === 'unknown-code') result.dimensions[0].conclusion_code = 'unreviewed_code'; return json(result);
  }
  if (url.pathname.includes('/discovery/people/')) return json(person(Number(url.pathname.split('/').pop())));
  if (url.pathname.endsWith('/discovery')) {
    const filtered = (url.searchParams.get('filters') ?? '').includes('none');
    const count = mode === 'empty' || filtered ? 0 : mode === 'one' ? 1 : mode === 'pagination' ? 25 : 2;
    const offset = url.searchParams.has('cursor') ? 24 : 0; const total = Array.from({ length: count }, (_, i) => person(11 + i)); const items = total.slice(offset, offset + 24); const more = offset + items.length < count;
    return json({ space_id: 17, target_type: 'person', sort: url.searchParams.get('sort') ?? 'recent', items, next_cursor: more ? 'synthetic-signed-cursor' : null, has_more: more, exhausted: !more, limit: 24 });
  }
  return denial(404, 'NOT_FOUND');
}
declare global { interface Window { recommendationTest: { calls: typeof calls; setMode(mode: string): void; release(): void; changeContext(): void; refresh(): Promise<void> } } }
function Fixture() {
  const controller = useMemo(() => new RecommendationController(createOrdinaryDiscoveryReads(createSameOriginDiscoveryTransport(bootstrap, location.origin, fetcher)), context), []);
  const api = useMemo(() => createAnalysisApi(bootstrap, location.origin, fetcher, context, identity.user_id), []);
  useEffect(() => { window.recommendationTest = { calls, setMode(value) { mode = value; }, release() { held?.(); held = null; }, changeContext() { current = { ...context, access_version: 'synthetic-revoked' }; }, refresh: () => controller.refresh() }; void controller.refresh(); return () => controller.dispose(); }, [controller]);
  return <ConnectedRecommendationExperience controller={controller} analysisApi={api} identity={identity} currentEvent={context} homeHref="#synthetic-only" synthetic />;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
