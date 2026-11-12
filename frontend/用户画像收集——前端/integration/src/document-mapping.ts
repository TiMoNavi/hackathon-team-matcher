import { cloneJson, type FieldDefinition, type JsonValue, type OwnerProfileRead, type ProfileAttribute, type ProfileDraftRead, type ProfilePreviewRead, type ProfileRead, type Visibility } from "./contracts.ts";

export type DisplayCategory = "about" | "experience" | "preferences" | "activity" | "unmapped";
export type DocumentEntry = Readonly<{ id: string; fieldKey: string; title: string; value: JsonValue; text: string; category: DisplayCategory; storageScope: string; visibility: Visibility; confirmation: "confirmed" | "pending" | "draft"; order: number }>;
export type OwnerDocument = Readonly<{ context: "owner_profile" | "owner_draft"; revision: number; draftVersion: number | null; profile: readonly DocumentEntry[]; contacts: readonly DocumentEntry[] }>;
export type SimulatedDocument = Readonly<{ context: "server_preview"; perspective: ProfilePreviewRead["perspective"]; simulated: true; revision: number; profile: readonly DocumentEntry[]; contacts: readonly DocumentEntry[] }>;
const categories: Readonly<Record<string, DisplayCategory>> = Object.freeze({ real_name: "about", age_range: "about", headline: "about", bio: "about", city: "about", timezone: "about", education: "experience", project: "experience", work_experience: "experience", award: "experience", portfolio_link: "experience", mbti: "preferences", personality: "preferences", direction: "preferences", skill: "preferences", role: "preferences", interest: "preferences", seeking: "preferences", language: "preferences", collaboration_preference: "preferences", communication_preference: "preferences" });
const categoryOf = (definition: FieldDefinition): DisplayCategory => definition.scope === "event" ? "activity" : Object.hasOwn(categories, definition.key) ? categories[definition.key] : "unmapped";
export const valueText = (value: JsonValue): string => typeof value === "string" ? value : JSON.stringify(value, null, 2);
export const unicodeCharacterCount = (value: string): number => [...value].length;
export const utf8ByteCount = (value: string): number => new TextEncoder().encode(value).byteLength;
function mapEntries(attributes: readonly ProfileAttribute[], definitions: readonly FieldDefinition[], scope: string): readonly DocumentEntry[] {
  const catalog = new Map(definitions.map((field) => [field.key, field]));
  return attributes.map((item): DocumentEntry => {
    const field = catalog.get(item.key); if (!field) throw new Error("MISSING_FIELD_DEFINITION");
    return { id: item.attribute_id, fieldKey: item.key, title: item.display_label ?? field.label, value: cloneJson(item.value), text: valueText(item.value), category: categoryOf(field), storageScope: scope, visibility: item.visibility, confirmation: item.confirmation, order: item.sort_order };
  }).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}
function splitOwned(attributes: readonly ProfileAttribute[], definitions: readonly FieldDefinition[], scope: string) {
  const entries = mapEntries(attributes, definitions, scope);
  return { profile: entries.filter((entry) => !entry.fieldKey.startsWith("contact_")), contacts: entries.filter((entry) => entry.fieldKey.startsWith("contact_")) };
}
export function ownerProfileDocument(profile: OwnerProfileRead): OwnerDocument {
  return { context: "owner_profile", revision: profile.revision, draftVersion: null, ...splitOwned(profile.attributes, profile.field_definitions, profile.scope) };
}
export function ownerDraftDocument(draft: ProfileDraftRead): OwnerDocument {
  return { context: "owner_draft", revision: draft.current_revision, draftVersion: draft.draft_version, ...splitOwned(draft.preview_attributes, draft.field_definitions, draft.scope) };
}
export function simulatedDocument(preview: ProfilePreviewRead): SimulatedDocument {
  // Consume the server's two projections directly. Never reproduce audience
  // authorization from visibility values or turn preview into a visitor token.
  const mapped = (profile: ProfileRead) => mapEntries(profile.attributes, profile.field_definitions, profile.scope);
  return { context: "server_preview", perspective: preview.perspective, simulated: true, revision: preview.profile.revision, profile: mapped(preview.profile), contacts: mapped(preview.contacts) };
}
