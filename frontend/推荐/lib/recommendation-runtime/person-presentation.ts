import type { CurrentEvent, DiscoveryAttribute, DiscoveryPerson, DiscoveryScope, JsonValue } from './contracts';
import { decodeCurrentEvent, decodePerson } from './decode';

/**
 * Unmounted, display-only adapter for the reviewed P1/P8 discovery projection.
 * FieldCatalog::VERSION = 2; DiscoveryBatchService::POLICY_VERSION combines
 * VisibilityPolicy::VERSION and DiscoveryFieldPolicy::VERSION. A schema change
 * requires an explicit mapping review; this is not a generic profile renderer,
 * authorization check, compatibility score or model-input conversion.
 */
export const PERSON_PRESENTATION_ADAPTER_VERSION = 'discovery-person-facts-v1';
export const PERSON_PRESENTATION_SCHEMA_VERSION = 2;
export const PERSON_PRESENTATION_POLICY_VERSION = 's3-2026-11-11:discovery-fields-v2';

export type FactKind = 'self_description' | 'skill' | 'contribution_role' | 'project_experience' | 'direction' | 'interest'
  | 'long_term_need' | 'self_reported_style' | 'collaboration_preference' | 'communication_preference'
  | 'activity_goal' | 'activity_role' | 'activity_offer' | 'activity_need' | 'activity_availability'
  | 'activity_collaboration_mode' | 'activity_communication_preference';
export type ProfileSliceScope = { readonly kind: 'global' } | { readonly kind: 'space'; readonly space_id: number };

/** References describe the read snapshot; they are not grants or an API write contract. */
export interface FactReference {
  readonly owner_id: number;
  readonly current_event: CurrentEvent;
  readonly scope: ProfileSliceScope;
  readonly attribute_id: string;
  readonly field_key: string;
  readonly schema_version: number;
  readonly profile_revision: number;
  readonly permission_version: number;
  readonly identity_version: number;
  readonly discovery_version: number;
  readonly privacy_policy_version: string;
}
export interface PlainFact { readonly label: string; readonly text: string; readonly format: 'plain_text' }
export interface TextOnlyLink { readonly text: string; readonly format: 'plain_text'; readonly interaction: 'none' }
export interface FactSlice {
  readonly id: string;
  readonly kind: FactKind;
  readonly label: string;
  readonly title: string;
  readonly format: 'plain_text';
  readonly source: 'self_confirmed_profile';
  readonly reference: FactReference;
  readonly facts: readonly PlainFact[];
  /** Validated text only. No href, target, fetch, preview image or open action. */
  readonly links: readonly TextOnlyLink[];
}
export type UnsupportedReason = 'unknown_field' | 'unsupported_schema' | 'unsupported_policy' | 'unsupported_shape' | 'scope_mismatch' | 'unsafe_link';
export interface UnsupportedReference { readonly reason: UnsupportedReason; readonly reference: FactReference }
export interface PersonPresentation {
  readonly source: 'ordinary_discovery';
  readonly adapter_version: typeof PERSON_PRESENTATION_ADAPTER_VERSION;
  readonly status: 'ready' | 'partial' | 'empty' | 'unsupported';
  readonly owner_id: number;
  readonly current_event: CurrentEvent;
  readonly identity: {
    readonly display_name: string;
    readonly format: 'plain_text';
    readonly source: 'self_confirmed_identity';
    readonly identity_version: number;
    readonly avatar: { readonly kind: 'neutral_placeholder'; readonly reason: 'no_public_reference' }
      | { readonly kind: 'unresolved_reference'; readonly reference: string; readonly fallback: 'neutral_placeholder' };
  };
  readonly profile_updated_at: { readonly value: string; readonly meaning: 'profile_update_time' };
  readonly slices: readonly FactSlice[];
  /** Generic UI state only; do not reveal a missing, hidden or unsupported field's name. */
  readonly unsupported: { readonly count: number; readonly message: string } | null;
}
export type PresentationResult = {
  readonly ok: true;
  readonly data: PersonPresentation;
  /** Internal adapter diagnostics only. Never render or send to a model; no source values. */
  readonly diagnostics: readonly UnsupportedReference[];
} | { readonly ok: false; readonly error: 'invalid_projection' | 'context_mismatch' };

interface SliceContent { readonly title?: string; readonly facts: readonly PlainFact[]; readonly links: readonly TextOnlyLink[] }
interface FieldSpec { readonly scope: 'global' | 'space'; readonly kind: FactKind; readonly label: string; readonly map: (value: JsonValue) => SliceContent }
class ShapeError extends Error {}
class UnsafeLinkError extends Error {}
const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);
const fact = (label: string, text: string): PlainFact => ({ label, text, format: 'plain_text' });
const content = (facts: readonly PlainFact[], title?: string, links: readonly TextOnlyLink[] = []): SliceContent => ({ facts, ...(title === undefined ? {} : { title }), links });
function text(value: JsonValue | undefined): string {
  if (typeof value !== 'string' || value.trim() === '') throw new ShapeError();
  return value; // Preserve all line breaks and Unicode; never truncate confirmed text.
}
function record(value: JsonValue, allowed: readonly string[], required: readonly string[] = []): Record<string, JsonValue> {
  // PHP's empty associative array is serialized as []. All-optional objects can
  // legitimately arrive in this form; no fact is invented for an empty object.
  const input = Array.isArray(value) && value.length === 0 ? {} : value;
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new ShapeError();
  const row = input as Record<string, JsonValue>;
  if (Object.keys(row).some(key => !allowed.includes(key)) || required.some(key => !hasOwn(row, key))) throw new ShapeError();
  return row;
}
function strings(value: JsonValue | undefined, maximum = 30): readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) throw new ShapeError();
  const list = value.map(text); if (new Set(list).size !== list.length) throw new ShapeError();
  return list;
}
function optionalText(row: Record<string, JsonValue>, key: string, label: string): PlainFact[] {
  return row[key] === undefined ? [] : [fact(label, text(row[key]))];
}
function optionalCodes(row: Record<string, JsonValue>, key: string, label: string): PlainFact[] {
  return row[key] === undefined ? [] : strings(row[key]).map(code => fact(label, code));
}
function enumText(value: JsonValue | undefined, labels: Readonly<Record<string, string>>): string {
  const code = text(value); if (!hasOwn(labels, code)) throw new ShapeError();
  return labels[code];
}
const selfLevels: Readonly<Record<string, string>> = { learning: '学习中', working: '工作中使用', proficient: '熟练', expert: '精通' };
const modes: Readonly<Record<string, string>> = { onsite: '线下', online: '线上', hybrid: '线上与线下结合' };
const mbtiTypes = new Set(['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP']);

const labelled = (withLevel = false) => (value: JsonValue): SliceContent => {
  const row = record(value, ['code', 'label', 'note', ...(withLevel ? ['self_level'] : [])], ['code', 'label']);
  const facts = [fact('本人填写的代码', text(row.code)), ...optionalText(row, 'note', '本人补充')];
  if (row.self_level !== undefined) facts.push(fact('熟练程度（本人自评）', enumText(row.self_level, selfLevels)));
  return content(facts, text(row.label));
};
const plain = (label: string) => (value: JsonValue): SliceContent => content([fact(label, text(value))]);
const preferences = (value: JsonValue): SliceContent => {
  const row = record(value, ['codes', 'free_text']);
  return content([...optionalCodes(row, 'codes', '本人选择的代码'), ...optionalText(row, 'free_text', '本人说明')]);
};
function partialDate(value: JsonValue, label: string): PlainFact {
  const row = record(value, ['value', 'precision'], ['value', 'precision']);
  const precision = text(row.precision); const raw = text(row.value);
  const formats: Readonly<Record<string, RegExp>> = { year: /^\d{4}$/, month: /^\d{4}-\d{2}$/, day: /^\d{4}-\d{2}-\d{2}$/ };
  if (!hasOwn(formats, precision) || !formats[precision].test(raw)) throw new ShapeError();
  const [year, month = 1, day = 1] = raw.split('-').map(Number);
  const days = [31, (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) throw new ShapeError();
  const precisionLabels: Readonly<Record<string, string>> = { year: '年', month: '月', day: '日' };
  return fact(`${label}（精确到${precisionLabels[precision]}）`, raw);
}
function textLink(value: JsonValue): TextOnlyLink {
  const raw = text(value);
  if (!/^https?:\/\//i.test(raw) || /[\u0000-\u0020\u007f\\]/.test(raw) || /%(?:00|09|0a|0d|1b|7f)/i.test(raw)) throw new UnsafeLinkError();
  try {
    const parsed = new URL(raw); const authority = raw.match(/^https?:\/\/([^/?#]*)/i)?.[1] ?? '';
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || authority.includes('@')) throw new UnsafeLinkError();
  } catch { throw new UnsafeLinkError(); }
  return { text: raw, format: 'plain_text', interaction: 'none' };
}
const project = (value: JsonValue): SliceContent => {
  const row = record(value, ['title', 'role', 'contribution', 'tech_codes', 'links', 'outcome', 'start', 'end'], ['title']);
  const facts = [...optionalText(row, 'role', '项目中的角色'), ...optionalText(row, 'contribution', '本人填写的项目贡献'),
    ...optionalText(row, 'outcome', '本人填写的项目结果'), ...optionalCodes(row, 'tech_codes', '该项目记录的技术代码')];
  if (row.start !== undefined) facts.push(partialDate(row.start, '开始时间'));
  if (row.end !== undefined) facts.push(partialDate(row.end, '结束时间'));
  if (row.links !== undefined && (!Array.isArray(row.links) || row.links.length > 10)) throw new ShapeError();
  const links = row.links === undefined ? [] : (row.links as readonly JsonValue[]).map(textLink);
  return content(facts, text(row.title), links);
};
const personality = (value: JsonValue): SliceContent => {
  const row = record(value, ['traits', 'self_description']);
  const traits = row.traits === undefined ? [] : strings(row.traits, 10).map(item => fact('本人描述的特点', item));
  const facts = [...traits, ...optionalText(row, 'self_description', '本人自述')];
  if (facts.length === 0) throw new ShapeError();
  return content(facts);
};
const seeking = (value: JsonValue): SliceContent => {
  const row = record(value, ['role_codes', 'skill_codes', 'free_text']);
  return content([...optionalCodes(row, 'role_codes', '本次希望伙伴提供的角色代码'),
    ...optionalCodes(row, 'skill_codes', '本次希望伙伴提供的技能代码'), ...optionalText(row, 'free_text', '本次需要的帮助')]);
};
const contribution = (value: JsonValue): SliceContent => {
  const row = record(value, ['skill_codes', 'free_text']);
  return content([...optionalCodes(row, 'skill_codes', '本次愿意提供的技能代码'), ...optionalText(row, 'free_text', '本次愿意提供的帮助')]);
};
const availability = (value: JsonValue): SliceContent => {
  const row = record(value, ['starts_at', 'ends_at', 'timezone'], ['starts_at', 'ends_at', 'timezone']);
  const start = text(row.starts_at); const end = text(row.ends_at);
  const date = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!date.test(start) || !date.test(end) || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) throw new ShapeError();
  // Keep the submitted zone/precision. No availability overlap or duration claim.
  return content([fact('可参与时段开始', start), fact('可参与时段结束', end), fact('本人填写的时区', text(row.timezone))]);
};

const fields: Readonly<Record<string, FieldSpec>> = {
  headline: { scope: 'global', kind: 'self_description', label: '一句话自述', map: plain('本人自述') },
  bio: { scope: 'global', kind: 'self_description', label: '自我介绍', map: plain('本人介绍') },
  direction: { scope: 'global', kind: 'direction', label: '关注方向', map: labelled() },
  interest: { scope: 'global', kind: 'interest', label: '兴趣领域', map: labelled() },
  role: { scope: 'global', kind: 'contribution_role', label: '可贡献角色（长期自述）', map: labelled() },
  skill: { scope: 'global', kind: 'skill', label: '技能（本人自述）', map: labelled(true) },
  seeking: { scope: 'global', kind: 'long_term_need', label: '长期合作期待', map: plain('长期期待') },
  project: { scope: 'global', kind: 'project_experience', label: '项目经历（本人填写）', map: project },
  mbti: { scope: 'global', kind: 'self_reported_style', label: 'MBTI（本人自述）', map: value => { const raw = text(value); if (!mbtiTypes.has(raw)) throw new ShapeError(); return content([fact('本人自述的类型', raw)]); } },
  personality: { scope: 'global', kind: 'self_reported_style', label: '性格与做事风格（本人自述）', map: personality },
  collaboration_preference: { scope: 'global', kind: 'collaboration_preference', label: '协作方式偏好（长期）', map: preferences },
  communication_preference: { scope: 'global', kind: 'communication_preference', label: '沟通习惯（长期）', map: preferences },
  event_goal: { scope: 'space', kind: 'activity_goal', label: '本次活动目标', map: preferences },
  event_role: { scope: 'space', kind: 'activity_role', label: '本次承担角色', map: labelled() },
  event_contribution: { scope: 'space', kind: 'activity_offer', label: '本次愿意提供的帮助', map: contribution },
  event_seeking: { scope: 'space', kind: 'activity_need', label: '本次需要的帮助', map: seeking },
  event_contact_preference: { scope: 'space', kind: 'activity_communication_preference', label: '本次沟通偏好', map: preferences },
  event_collaboration_mode: { scope: 'space', kind: 'activity_collaboration_mode', label: '本次协作方式', map: value => { const row = record(value, ['mode', 'note'], ['mode']); return content([fact('本人选择的方式', enumText(row.mode, modes)), ...optionalText(row, 'note', '本人补充')]); } },
  event_availability: { scope: 'space', kind: 'activity_availability', label: '本次可参与时段', map: availability },
};

/** Explicit support inventory for review/tests. Does not grant access to fields. */
export const PERSON_PRESENTATION_SUPPORT = Object.freeze(Object.entries(fields).map(([key, spec]) => Object.freeze({
  key, scope: spec.scope, kind: spec.kind, label: spec.label, schema_version: PERSON_PRESENTATION_SCHEMA_VERSION, policy_version: PERSON_PRESENTATION_POLICY_VERSION,
})));

function reference(person: DiscoveryPerson, context: CurrentEvent, scope: 'global' | 'space', snapshot: DiscoveryScope, attribute: DiscoveryAttribute): FactReference {
  return { owner_id: person.owner_id, current_event: { ...context }, scope: scope === 'global' ? { kind: 'global' } : { kind: 'space', space_id: person.space_id },
    attribute_id: attribute.attribute_id, field_key: attribute.key, schema_version: attribute.schema_version, profile_revision: snapshot.revision,
    permission_version: snapshot.permission_version, identity_version: person.identity_version, discovery_version: person.discovery_version, privacy_policy_version: person.privacy_policy_version };
}
function forbiddenPurposeKey(key: string): boolean {
  return /^contact_/i.test(key) || /^(?:raw|source|draft|pending|unconfirmed|provenance|credential|token|secret|private)(?:_|$)/i.test(key);
}

export function presentDiscoveryPerson(input: DiscoveryPerson, currentEvent: CurrentEvent): PresentationResult {
  let person: DiscoveryPerson; let context: CurrentEvent;
  try { person = decodePerson(input); context = decodeCurrentEvent(currentEvent); }
  catch { return { ok: false, error: 'invalid_projection' }; }
  if (person.space_id !== context.space_id) return { ok: false, error: 'context_mismatch' };
  // A falsely authenticated contact/source field cannot be converted into a
  // visible unsupported-field label or diagnostic disclosing its existence.
  if ([...person.global.attributes, ...person.space.attributes].some(item => forbiddenPurposeKey(item.key))) return { ok: false, error: 'invalid_projection' };
  const slices: FactSlice[] = []; const diagnostics: UnsupportedReference[] = [];
  const policySupported = person.privacy_policy_version === PERSON_PRESENTATION_POLICY_VERSION;
  for (const scope of ['global', 'space'] as const) {
    const snapshot = person[scope];
    for (const attribute of snapshot.attributes) {
      const ref = reference(person, context, scope, snapshot, attribute);
      const spec = hasOwn(fields, attribute.key) ? fields[attribute.key] : undefined;
      const reason: UnsupportedReason | null = !policySupported ? 'unsupported_policy' : !spec ? 'unknown_field'
        : attribute.schema_version !== PERSON_PRESENTATION_SCHEMA_VERSION ? 'unsupported_schema' : spec.scope !== scope ? 'scope_mismatch' : null;
      if (reason !== null || !spec) { diagnostics.push({ reason: reason ?? 'unknown_field', reference: ref }); continue; }
      try {
        const mapped = spec.map(attribute.value);
        if (mapped.title === undefined && mapped.facts.length === 0 && mapped.links.length === 0) continue;
        slices.push({ id: JSON.stringify([person.owner_id, person.space_id, scope, attribute.attribute_id]), kind: spec.kind, label: spec.label,
          title: mapped.title ?? spec.label, format: 'plain_text', source: 'self_confirmed_profile', reference: ref, facts: mapped.facts, links: mapped.links });
      } catch (error) { diagnostics.push({ reason: error instanceof UnsafeLinkError ? 'unsafe_link' : 'unsupported_shape', reference: ref }); }
    }
  }
  const unsupported = !policySupported || diagnostics.length > 0;
  return { ok: true, data: { source: 'ordinary_discovery', adapter_version: PERSON_PRESENTATION_ADAPTER_VERSION,
    status: unsupported ? (slices.length > 0 ? 'partial' : 'unsupported') : (slices.length > 0 ? 'ready' : 'empty'),
    owner_id: person.owner_id, current_event: { ...context },
    identity: { display_name: person.display_name, format: 'plain_text', source: 'self_confirmed_identity', identity_version: person.identity_version,
      avatar: person.avatar_ref === null ? { kind: 'neutral_placeholder', reason: 'no_public_reference' }
        : { kind: 'unresolved_reference', reference: person.avatar_ref, fallback: 'neutral_placeholder' } },
    profile_updated_at: { value: person.updated_at, meaning: 'profile_update_time' }, slices,
    unsupported: unsupported ? { count: diagnostics.length, message: '部分资料暂不支持展示。' } : null }, diagnostics };
}
