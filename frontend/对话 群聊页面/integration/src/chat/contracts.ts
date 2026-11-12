import { validateClientMessageId, validateMessageBody } from "./send-input.js";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_FILES, ATTACHMENT_MIME_TYPES, validAttachmentName, validateAttachmentId } from "./attachment-input.js";
import type { AttachmentMime } from "./attachment-input.js";

/** Chat wire contracts. Importing this module has no I/O or activation effect. */
export type Permissions = Readonly<{ read: boolean; send: boolean; invite: boolean; leave: boolean }>;
export type ConversationType = "direct" | "group" | "discussion";
export type Sender = Readonly<{ status: "available"; user_id: number; display_name: string; avatar_ref: string | null }>
  | Readonly<{ status: "unavailable" }>;
type MessageContent = Readonly<{ kind: "text" | "system"; body: string }> | Readonly<{ kind: "deleted"; body: null }> | Readonly<{ kind: "attachment"; body: null }>;
export type MessageSummary = Readonly<{ id: number; seq: number; sender: Sender; created_at: string }> & MessageContent;
export type Attachment = Readonly<{ id: string; name: string; mime: AttachmentMime; size: number; download_path: string }>;
export type AttachmentCapability = Readonly<{ upload_enabled: boolean; download_enabled: boolean; max_file_bytes: number; max_files_per_message: number; allowed_mime_types: readonly AttachmentMime[]; staging_ttl_seconds: number }>;
export type Message = MessageSummary & Readonly<{ conversation_id: number; attachments: readonly Attachment[] }>;
type ConversationKind = Readonly<{ type: "direct" | "group" }>
  | Readonly<{ type: "discussion"; space_id: number; idea_activity_id: number }>;
export type ConversationSummary = Readonly<{
  id: number; title: string | null; version: number; last_message: MessageSummary | null;
  unread_count: number; permissions: Permissions;
}> & ConversationKind;
export type ConversationContext = Readonly<{
  conversation_id: number; version: number; authorization_version: number; authorization_revision: number;
  membership_generation: number; history_after_seq: number; permissions: Permissions;
  attachments?: AttachmentCapability;
}> & ConversationKind;
export type Page<T> = Readonly<{ items: readonly T[]; next_cursor: string | null; has_more: boolean }>;
export type ConversationPage = Page<ConversationSummary> & Readonly<{ authorization_revision: number }>;
export type MessagePage = Page<Message> & Readonly<{ read_seq: number; unread_count: number; context: ConversationContext }>;
export type ReadState = Readonly<{ conversation_id: number; read_seq: number; unread_count: number; context: ConversationContext }>;
export type SendReceipt = Readonly<{ message: Message; client_message_id: string; replayed: boolean; read_seq: number; unread_count: number; context: ConversationContext }>;
export type UploadReceipt = Readonly<{ attachment: Attachment; client_upload_id: string; replayed: boolean; expires_at: string }>;
export type CancelReceipt = Readonly<{ attachment_id: string; state: "cancelled" | "expired" }>;
export type Envelope<T> = Readonly<{ data: T; meta: Readonly<{ request_id: string }> }>;
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type ErrorDetails = readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type ErrorEnvelope = Readonly<{
  error: Readonly<{ code: string; message: string; retryable: boolean; details: ErrorDetails }>;
  meta: Readonly<{ request_id: string }>;
}>;
export type HistoryMode = "history" | "increment";

export class ChatContractError extends Error {
  constructor() { super("Invalid chat response."); this.name = "ChatContractError"; }
}
function invalid(): never { throw new ChatContractError(); }
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const object = record(value);
  if (Reflect.ownKeys(object).length !== keys.length || keys.some((key) => !Object.hasOwn(object, key))) return invalid();
  return object;
}
function text(value: unknown): string { return typeof value === "string" ? value : invalid(); }
function nonempty(value: unknown): string { const result = text(value); return result.trim() ? result : invalid(); }
function bool(value: unknown): boolean { return typeof value === "boolean" ? value : invalid(); }
export function safeInteger(value: unknown, minimum = 0): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum ? value : invalid();
}
function nullableText(value: unknown): string | null { return value === null ? null : text(value); }
function utc(value: unknown): string {
  const result = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(result)) return invalid();
  const parsed = new Date(result);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().replace(".000Z", "Z") !== result) return invalid();
  return result;
}
function permissions(value: unknown): Permissions {
  const object = exact(value, ["read", "send", "invite", "leave"]);
  if (object.read !== true) return invalid();
  return Object.freeze({ read: bool(object.read), send: bool(object.send), invite: bool(object.invite), leave: bool(object.leave) });
}
function sender(value: unknown): Sender {
  const object = record(value);
  if (object.status === "unavailable") { exact(object, ["status"]); return Object.freeze({ status: "unavailable" }); }
  exact(object, ["status", "user_id", "display_name", "avatar_ref"]);
  if (object.status !== "available") return invalid();
  return Object.freeze({ status: "available", user_id: safeInteger(object.user_id, 1), display_name: nonempty(object.display_name), avatar_ref: nullableText(object.avatar_ref) });
}
function kind(value: Record<string, unknown>): ConversationKind {
  if (value.type === "discussion") return { type: "discussion", space_id: safeInteger(value.space_id, 1), idea_activity_id: safeInteger(value.idea_activity_id, 1) };
  if (value.type !== "direct" && value.type !== "group") return invalid();
  return { type: value.type };
}
function kindKeys(value: Record<string, unknown>): string[] { return value.type === "discussion" ? ["space_id", "idea_activity_id"] : []; }
function messageFields(object: Record<string, unknown>): MessageSummary {
  const common = { id: safeInteger(object.id, 1), seq: safeInteger(object.seq, 1), sender: sender(object.sender), created_at: utc(object.created_at) };
  if (object.kind === "deleted") {
    if (object.body !== null || common.sender.status !== "unavailable") return invalid();
    return Object.freeze({ ...common, kind: "deleted", body: null });
  }
  if (object.kind === "attachment") {
    if (object.body !== null) return invalid();
    return Object.freeze({ ...common, kind: "attachment", body: null });
  }
  if (object.kind !== "text" && object.kind !== "system") return invalid();
  const body = text(object.body);
  if (/^[\p{White_Space}\p{Z}]*$/u.test(body)) return invalid();
  return Object.freeze({ ...common, kind: object.kind, body });
}
function messageSummary(value: unknown): MessageSummary {
  return messageFields(exact(value, ["id", "seq", "kind", "sender", "body", "created_at"]));
}
function message(value: unknown): Message {
  const object = exact(value, ["id", "conversation_id", "seq", "kind", "sender", "body", "created_at", "attachments"]);
  const conversation_id = safeInteger(object.conversation_id, 1);
  if (!Array.isArray(object.attachments) || object.attachments.length > ATTACHMENT_MAX_FILES) return invalid();
  const attachments = Object.freeze(object.attachments.map((entry) => parseAttachment(entry, conversation_id)));
  if (new Set(attachments.map((entry) => entry.id)).size !== attachments.length
    || object.kind === "attachment" && attachments.length === 0 || ["deleted", "system"].includes(String(object.kind)) && attachments.length > 0) return invalid();
  return Object.freeze({ ...messageFields(object), conversation_id, attachments });
}
export function parseAttachment(value: unknown, conversationId: number): Attachment {
  const object = exact(value, ["id", "name", "mime", "size", "download_path"]);
  let id: string; try { id = validateAttachmentId(object.id); } catch { return invalid(); }
  if (!validAttachmentName(object.name) || !ATTACHMENT_MIME_TYPES.includes(object.mime as AttachmentMime)
    || safeInteger(object.size, 1) > ATTACHMENT_MAX_BYTES
    || object.download_path !== "/api/v1/conversations/" + safeInteger(conversationId, 1) + "/attachments/" + id + "/download") return invalid();
  return Object.freeze({ id, name: object.name, mime: object.mime as AttachmentMime, size: object.size as number, download_path: object.download_path as string });
}
function attachmentCapability(value: unknown): AttachmentCapability {
  const object = exact(value, ["upload_enabled", "download_enabled", "max_file_bytes", "max_files_per_message", "allowed_mime_types", "staging_ttl_seconds"]);
  if (object.max_file_bytes !== ATTACHMENT_MAX_BYTES || object.max_files_per_message !== ATTACHMENT_MAX_FILES || object.staging_ttl_seconds !== 86400
    || !Array.isArray(object.allowed_mime_types) || object.allowed_mime_types.length !== ATTACHMENT_MIME_TYPES.length
    || !object.allowed_mime_types.every((entry, index) => entry === ATTACHMENT_MIME_TYPES[index])) return invalid();
  return Object.freeze({ upload_enabled: bool(object.upload_enabled), download_enabled: bool(object.download_enabled), max_file_bytes: ATTACHMENT_MAX_BYTES,
    max_files_per_message: ATTACHMENT_MAX_FILES, allowed_mime_types: Object.freeze([...ATTACHMENT_MIME_TYPES]), staging_ttl_seconds: 86400 });
}
function conversation(value: unknown): ConversationSummary {
  const object = record(value);
  exact(object, ["id", "type", "title", "version", "last_message", "unread_count", "permissions", ...kindKeys(object)]);
  return Object.freeze({ ...kind(object), id: safeInteger(object.id, 1), title: nullableText(object.title), version: safeInteger(object.version, 1),
    last_message: object.last_message === null ? null : messageSummary(object.last_message), unread_count: safeInteger(object.unread_count), permissions: permissions(object.permissions) });
}
function context(value: unknown): ConversationContext {
  const object = record(value);
  exact(object, ["conversation_id", "type", "version", "authorization_version", "authorization_revision", "membership_generation", "history_after_seq", "permissions", ...kindKeys(object), ...(Object.hasOwn(object, "attachments") ? ["attachments"] : [])]);
  if (object.type === "direct" && object.history_after_seq !== 0) return invalid();
  return Object.freeze({ ...kind(object), conversation_id: safeInteger(object.conversation_id, 1), version: safeInteger(object.version, 1),
    authorization_version: safeInteger(object.authorization_version, 1), authorization_revision: safeInteger(object.authorization_revision, 1), membership_generation: safeInteger(object.membership_generation, 1),
    history_after_seq: safeInteger(object.history_after_seq), permissions: permissions(object.permissions),
    ...(Object.hasOwn(object, "attachments") ? { attachments: attachmentCapability(object.attachments) } : {}) });
}
function meta(value: unknown): Readonly<{ request_id: string }> {
  const object = exact(value, ["request_id"]);
  return Object.freeze({ request_id: nonempty(object.request_id) });
}
function pagination(object: Record<string, unknown>, count: number, mode: HistoryMode = "history"): Pick<Page<never>, "next_cursor" | "has_more"> {
  const next_cursor = object.next_cursor === null ? null : nonempty(object.next_cursor);
  const has_more = bool(object.has_more);
  if (mode === "increment" ? next_cursor !== null : has_more !== (next_cursor !== null)) return invalid();
  if (has_more && count === 0) return invalid();
  return { next_cursor, has_more };
}
function items<T>(value: unknown, parse: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value) || value.length > 48) return invalid();
  return Object.freeze(value.map(parse));
}
function uniqueIds(values: readonly { id: number }[]): void {
  if (new Set(values.map((value) => value.id)).size !== values.length) invalid();
}

/** Parse a complete conversation-list envelope; signed cursors remain opaque. */
export function parseConversationPage(value: unknown): Envelope<ConversationPage> {
  const envelope = exact(value, ["data", "meta"]);
  const data = exact(envelope.data, ["items", "next_cursor", "has_more", "authorization_revision"]);
  const entries = items(data.items, conversation); uniqueIds(entries);
  return Object.freeze({ data: Object.freeze({ items: entries, ...pagination(data, entries.length), authorization_revision: safeInteger(data.authorization_revision, 1) }), meta: meta(envelope.meta) });
}

/** Incremental responses use after_seq; their next_cursor must always be null. */
export function parseMessagePage(value: unknown, mode: HistoryMode = "history"): Envelope<MessagePage> {
  if (mode !== "history" && mode !== "increment") return invalid();
  const envelope = exact(value, ["data", "meta"]);
  const data = exact(envelope.data, ["items", "next_cursor", "has_more", "read_seq", "unread_count", "context"]);
  const authority = context(data.context);
  if (safeInteger(data.read_seq) < authority.history_after_seq) return invalid();
  const entries = items(data.items, message); uniqueIds(entries);
  let previous = authority.history_after_seq;
  for (const entry of entries) {
    if (entry.conversation_id !== authority.conversation_id || entry.seq <= previous || entry.attachments.length > 0 && authority.attachments === undefined) return invalid();
    previous = entry.seq;
  }
  return Object.freeze({ data: Object.freeze({ items: entries, ...pagination(data, entries.length, mode), read_seq: safeInteger(data.read_seq),
    unread_count: safeInteger(data.unread_count), context: authority }), meta: meta(envelope.meta) });
}

export function parseReadState(value: unknown): Envelope<ReadState> {
  const envelope = exact(value, ["data", "meta"]);
  const data = exact(envelope.data, ["conversation_id", "read_seq", "unread_count", "context"]);
  const authority = context(data.context);
  const conversation_id = safeInteger(data.conversation_id, 1);
  if (conversation_id !== authority.conversation_id || safeInteger(data.read_seq) < authority.history_after_seq) return invalid();
  return Object.freeze({ data: Object.freeze({ conversation_id, read_seq: safeInteger(data.read_seq), unread_count: safeInteger(data.unread_count), context: authority }), meta: meta(envelope.meta) });
}

/** A persistent receipt is not a delivery/read receipt and grants no new scope. */
export function parseSendReceipt(value: unknown): Envelope<SendReceipt> {
  const envelope = exact(value, ["data", "meta"]);
  const data = exact(envelope.data, ["message", "client_message_id", "replayed", "read_seq", "unread_count", "context"]);
  const authority = context(data.context); const entry = message(data.message); const replayed = bool(data.replayed);
  if (authority.type !== "direct" || (!["text", "attachment"].includes(entry.kind) && !(replayed && entry.kind === "deleted")) || entry.conversation_id !== authority.conversation_id
    || entry.attachments.length > 0 && authority.attachments === undefined
    || entry.seq <= authority.history_after_seq || safeInteger(data.read_seq) < authority.history_after_seq) return invalid();
  let key: string;
  try { key = validateClientMessageId(data.client_message_id); if (!replayed && entry.kind !== "attachment") validateMessageBody(entry.body); } catch { return invalid(); }
  return Object.freeze({ data: Object.freeze({ message: entry, client_message_id: key, replayed,
    read_seq: safeInteger(data.read_seq), unread_count: safeInteger(data.unread_count), context: authority }), meta: meta(envelope.meta) });
}

export function parseUploadReceipt(value: unknown, conversationId: number): Envelope<UploadReceipt> {
  const envelope = exact(value, ["data", "meta"]);
  const data = exact(envelope.data, ["attachment", "client_upload_id", "replayed", "expires_at"]);
  let key: string; try { key = validateAttachmentId(data.client_upload_id); } catch { return invalid(); }
  return Object.freeze({ data: Object.freeze({ attachment: parseAttachment(data.attachment, conversationId), client_upload_id: key,
    replayed: bool(data.replayed), expires_at: utc(data.expires_at) }), meta: meta(envelope.meta) });
}
export function parseCancelReceipt(value: unknown): Envelope<CancelReceipt> {
  const envelope = exact(value, ["data", "meta"]); const data = exact(envelope.data, ["attachment_id", "state"]);
  let id: string; try { id = validateAttachmentId(data.attachment_id); } catch { return invalid(); }
  if (data.state !== "cancelled" && data.state !== "expired") return invalid();
  return Object.freeze({ data: Object.freeze({ attachment_id: id, state: data.state }), meta: meta(envelope.meta) });
}

function json(value: unknown, ancestors: Set<object>, depth = 0): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : invalid();
  if (typeof value !== "object" || depth > 64 || ancestors.has(value)) return invalid();
  ancestors.add(value);
  let result: JsonValue;
  if (Array.isArray(value)) result = Object.freeze(value.map((entry) => json(entry, ancestors, depth + 1)));
  else {
    const object = record(value);
    if (Reflect.ownKeys(object).length !== Object.keys(object).length) return invalid();
    result = Object.freeze(Object.fromEntries(Object.entries(object).map(([key, entry]) => [key, json(entry, ancestors, depth + 1)])));
  }
  ancestors.delete(value);
  return result;
}

/** Keep the server's code, human message, retryable flag and structured details. */
export function parseErrorEnvelope(value: unknown): ErrorEnvelope {
  const envelope = exact(value, ["error", "meta"]);
  const error = exact(envelope.error, ["code", "message", "retryable", "details"]);
  if (error.details === null || typeof error.details !== "object") return invalid();
  const details = json(error.details, new Set()) as ErrorDetails;
  return Object.freeze({ error: Object.freeze({ code: nonempty(error.code), message: text(error.message), retryable: bool(error.retryable), details }), meta: meta(envelope.meta) });
}
