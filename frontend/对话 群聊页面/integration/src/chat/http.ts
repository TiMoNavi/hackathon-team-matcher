import { parseAttachment, parseCancelReceipt, parseConversationPage, parseErrorEnvelope, parseMessagePage, parseReadState, parseSendReceipt, parseUploadReceipt, safeInteger } from "./contracts.js";
import type { Attachment, CancelReceipt, ConversationPage, Envelope, ErrorDetails, MessagePage, ReadState, SendReceipt, UploadReceipt } from "./contracts.js";
import { validateClientMessageId, MessageInputError } from "./send-input.js";
import { AttachmentInputError, validateAttachmentId, validateAttachmentIds, validateSendBody, validateUploadFile } from "./attachment-input.js";

export type ChatFetcher = (input: string, init: RequestInit) => Promise<Response>;
export type PageOptions = Readonly<{ limit?: number; cursor?: string; signal?: AbortSignal }>;
export type IncrementOptions = Readonly<{ afterSeq: number; limit?: number; signal?: AbortSignal }>;
export type ReadOptions = Readonly<{ readSeq: number; signal?: AbortSignal }>;
export type SendOptions = Readonly<{ clientMessageId: string; body: string; attachmentIds?: readonly string[]; signal?: AbortSignal }>;
export type UploadOptions = Readonly<{ clientUploadId: string; file: File; signal?: AbortSignal }>;
export type CancelOptions = Readonly<{ attachmentId: string; signal?: AbortSignal }>;
export type DownloadOptions = Readonly<{ attachment: Attachment; signal?: AbortSignal }>;
export type DownloadedAttachment = Readonly<{ attachment: Attachment; blob: Blob }>;
export interface ChatApi {
  list(options?: PageOptions): Promise<Envelope<ConversationPage>>;
  history(conversationId: number, options?: PageOptions): Promise<Envelope<MessagePage>>;
  increment(conversationId: number, options: IncrementOptions): Promise<Envelope<MessagePage>>;
  readState(conversationId: number, options: ReadOptions): Promise<Envelope<ReadState>>;
  sendText(conversationId: number, options: SendOptions): Promise<Envelope<SendReceipt>>;
  uploadAttachment(conversationId: number, options: UploadOptions): Promise<Envelope<UploadReceipt>>;
  cancelAttachment(conversationId: number, options: CancelOptions): Promise<Envelope<CancelReceipt>>;
  downloadAttachment(conversationId: number, options: DownloadOptions): Promise<DownloadedAttachment>;
  dispose(): void;
}
export type ChatApiConfig = Readonly<{ apiBase: "/api/v1"; csrfToken: string; fetcher?: ChatFetcher; expectedActorId?: number }>;

export class ChatApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly requestId: string | null;
  readonly details: ErrorDetails;
  constructor(status: number, code: string, message: string, retryable = false, requestId: string | null = null, details: ErrorDetails = Object.freeze([])) {
    super(message); this.name = "ChatApiError"; this.status = status; this.code = code; this.retryable = retryable; this.requestId = requestId; this.details = details;
  }
}
function invalidInput(): never { throw new ChatApiError(0, "INVALID_REQUEST", "Invalid chat request."); }
function aborted(): ChatApiError { return new ChatApiError(0, "REQUEST_ABORTED", "Chat request was cancelled."); }
function checkId(value: unknown, minimum = 1): number { try { return safeInteger(value, minimum); } catch { return invalidInput(); } }
function options(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return invalidInput();
  const object = value as Record<string, unknown>;
  if (Reflect.ownKeys(object).some((key) => typeof key !== "string" || !allowed.includes(key))) return invalidInput();
  if (object.signal !== undefined && !(object.signal instanceof AbortSignal)) return invalidInput();
  return object;
}
function pageQuery(value: Record<string, unknown>): URLSearchParams {
  const limit = value.limit === undefined ? 24 : checkId(value.limit);
  if (limit > 48) return invalidInput();
  const result = new URLSearchParams({ limit: String(limit) });
  if (value.cursor !== undefined) {
    if (typeof value.cursor !== "string" || !value.cursor.trim()) return invalidInput();
    result.set("cursor", value.cursor);
  }
  return result;
}

/** Explicitly create a session-scoped client. Construction performs no request.
 * This does not authenticate an actor or enable a capability: the server does so
 * on every request. Dispose the client when its owning session is discarded. */
export function createChatApi(config: ChatApiConfig): ChatApi {
  const input = options(config, ["apiBase", "csrfToken", "fetcher", "expectedActorId"]);
  if (input.apiBase !== "/api/v1" || typeof input.csrfToken !== "string" || !input.csrfToken || input.csrfToken.length > 4096
    || /[\r\n\0]/.test(input.csrfToken) || (input.fetcher !== undefined && typeof input.fetcher !== "function")) return invalidInput();
  let csrfToken = input.csrfToken;
  const expectedActorId = input.expectedActorId === undefined ? null : checkId(input.expectedActorId);
  let disposed = false;
  const pending = new Set<AbortController>();
  const fetcher: ChatFetcher = config.fetcher ?? ((url, init) => globalThis.fetch(url, init));
  function dispose(): void {
    disposed = true; csrfToken = "";
    for (const controller of pending) controller.abort();
    pending.clear();
  }
  async function request<T>(path: string, parse: (value: unknown, status: number) => Envelope<T>, callerSignal?: AbortSignal,
    body?: { read_seq: number } | { client_message_id: string; body: string; attachment_ids?: readonly string[] } | FormData,
    method: "GET" | "PUT" | "POST" | "DELETE" = body === undefined ? "GET" : "PUT", statuses: readonly number[] = [200]): Promise<Envelope<T>> {
    if (disposed) throw new ChatApiError(0, "CLIENT_DISPOSED", "Chat client is no longer active.");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    callerSignal?.addEventListener("abort", cancel, { once: true });
    if (callerSignal?.aborted) controller.abort();
    pending.add(controller);
    const checkActive = () => { if (controller.signal.aborted || disposed) throw aborted(); };
    try {
      checkActive();
      const headers: Record<string, string> = { Accept: "application/json" };
      // Cache-partition consistency only. The server authenticates its native
      // session and rejects a mismatch; this header never selects the actor.
      if (expectedActorId !== null) headers["X-Matcher-Chat-Actor"] = String(expectedActorId);
      if (method !== "GET") headers["X-CSRF-Token"] = csrfToken;
      if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
      let response: Response;
      try {
        response = await fetcher(`/api/v1/conversations${path}`, { method, headers,
          ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }), credentials: "same-origin", redirect: "error", cache: "no-store", signal: controller.signal });
      } catch {
        checkActive();
        throw new ChatApiError(0, "NETWORK_ERROR", "The chat request could not be completed.", true);
      }
      // A same-session 401 must reach the state owner even if conversation
      // navigation aborted this request while a transport ignored the signal.
      if (response.status !== 401) checkActive();
      if (response.redirected || !/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) {
        throw new ChatApiError(response.status, "INVALID_RESPONSE", "The server returned an invalid chat response.");
      }
      let payload: unknown;
      try { payload = await response.json(); } catch {
        if (response.status !== 401) checkActive();
        throw new ChatApiError(response.status, "INVALID_RESPONSE", "The server returned an invalid chat response.");
      }
      if (response.status !== 401) checkActive();
      if (!response.ok) {
        let error;
        try { error = parseErrorEnvelope(payload); } catch { throw new ChatApiError(response.status, "INVALID_RESPONSE", "The server returned an invalid chat error."); }
        throw new ChatApiError(response.status, error.error.code, error.error.message, error.error.retryable, error.meta.request_id, error.error.details);
      }
      if (!statuses.includes(response.status)) throw new ChatApiError(response.status, "INVALID_RESPONSE", "The server returned an unexpected chat status.");
      try { return parse(payload, response.status); } catch { throw new ChatApiError(response.status, "INVALID_RESPONSE", "The server returned an invalid chat response."); }
    } finally {
      callerSignal?.removeEventListener("abort", cancel); pending.delete(controller);
    }
  }
  async function download(id: number, attachment: Attachment, callerSignal?: AbortSignal): Promise<DownloadedAttachment> {
    if (disposed) throw new ChatApiError(0, "CLIENT_DISPOSED", "Chat client is no longer active.");
    const controller = new AbortController(); const cancel = () => controller.abort();
    callerSignal?.addEventListener("abort", cancel, { once: true }); if (callerSignal?.aborted) controller.abort(); pending.add(controller);
    const checkActive = () => { if (controller.signal.aborted || disposed) throw aborted(); };
    const bad = () => new ChatApiError(200, "INVALID_RESPONSE", "The server returned an invalid attachment download.");
    try {
      checkActive(); const headers: Record<string, string> = { Accept: attachment.mime };
      if (expectedActorId !== null) headers["X-Matcher-Chat-Actor"] = String(expectedActorId);
      let response: Response;
      try { response = await fetcher("/api/v1/conversations/" + id + "/attachments/" + attachment.id + "/download",
        { method: "GET", headers, credentials: "same-origin", redirect: "error", cache: "no-store", signal: controller.signal }); }
      catch { checkActive(); throw new ChatApiError(0, "NETWORK_ERROR", "The attachment could not be downloaded.", true); }
      if (response.status !== 401) checkActive();
      if (response.redirected) throw bad();
      if (!response.ok) {
        let problem;
        try { if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) throw bad(); problem = parseErrorEnvelope(await response.json()); }
        catch { throw new ChatApiError(response.status, "INVALID_RESPONSE", "The server returned an invalid attachment error."); }
        throw new ChatApiError(response.status, problem.error.code, problem.error.message, problem.error.retryable, problem.meta.request_id, problem.error.details);
      }
      if (response.status !== 200 || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== attachment.mime
        || !/^attachment(?:\s*;|$)/i.test(response.headers.get("content-disposition") || "")
        || !/(?:^|,)\s*no-store(?:\s*,|$)/i.test(response.headers.get("cache-control") || "")
        || !/(?:^|,)\s*private(?:\s*,|$)/i.test(response.headers.get("cache-control") || "")
        || response.headers.get("x-content-type-options")?.toLowerCase() !== "nosniff"
        || response.headers.has("content-range")) throw bad();
      const size = response.headers.get("content-length");
      if (size !== null && (!/^[0-9]+$/.test(size) || Number(size) !== attachment.size)) throw bad();
      const reader = response.body?.getReader(); if (!reader) throw bad();
      const chunks: Uint8Array<ArrayBuffer>[] = []; let received = 0;
      try {
        for (;;) { checkActive(); const next = await reader.read(); checkActive(); if (next.done) break;
          received += next.value.byteLength; if (received > attachment.size) throw bad(); chunks.push(new Uint8Array(next.value)); }
      } catch (error) { try { await reader.cancel(); } catch { /* No bytes or diagnostics escape. */ } throw error; }
      finally { reader.releaseLock(); }
      if (received !== attachment.size) throw bad(); checkActive();
      return Object.freeze({ attachment, blob: new Blob(chunks, { type: attachment.mime }) });
    } finally { callerSignal?.removeEventListener("abort", cancel); pending.delete(controller); }
  }
  return Object.freeze({
    list(value: PageOptions = {}) {
      const input = options(value, ["limit", "cursor", "signal"]);
      return request(`?${pageQuery(input)}`, parseConversationPage, value.signal);
    },
    history(conversationId: number, value: PageOptions = {}) {
      const id = checkId(conversationId);
      const input = options(value, ["limit", "cursor", "signal"]);
      return request(`/${id}/messages?${pageQuery(input)}`, (payload) => {
        const result = parseMessagePage(payload, "history");
        if (result.data.context.conversation_id !== id) return invalidInput();
        return result;
      }, value.signal);
    },
    increment(conversationId: number, value: IncrementOptions) {
      const id = checkId(conversationId);
      const input = options(value, ["afterSeq", "limit", "signal"]);
      const afterSeq = checkId(input.afterSeq, 0);
      const query = pageQuery(input); query.set("after_seq", String(afterSeq));
      return request(`/${id}/messages?${query}`, (payload) => {
        const result = parseMessagePage(payload, "increment");
        if (result.data.context.conversation_id !== id || result.data.items.some((entry) => entry.seq <= afterSeq)) return invalidInput();
        return result;
      }, value.signal);
    },
    readState(conversationId: number, value: ReadOptions) {
      const id = checkId(conversationId);
      const input = options(value, ["readSeq", "signal"]);
      const readSeq = checkId(input.readSeq, 0);
      return request(`/${id}/read-state`, (payload) => {
        const result = parseReadState(payload);
        if (result.data.conversation_id !== id || result.data.read_seq < readSeq) return invalidInput();
        return result;
      }, value.signal, { read_seq: readSeq });
    },
    sendText(conversationId: number, value: SendOptions) {
      const id = checkId(conversationId); const input = options(value, ["clientMessageId", "body", "attachmentIds", "signal"]);
      let key: string; let text: string; let ids: readonly string[];
      try { key = validateClientMessageId(input.clientMessageId); ids = validateAttachmentIds(input.attachmentIds ?? []); text = validateSendBody(input.body, ids); }
      catch (error) { if (error instanceof MessageInputError || error instanceof AttachmentInputError) throw new ChatApiError(0, error.code, error.message); return invalidInput(); }
      return request(`/${id}/messages`, (payload, status) => {
        const result = parseSendReceipt(payload);
        if (result.data.context.conversation_id !== id || result.data.client_message_id !== key
          || !result.data.replayed && (result.data.message.body !== (text === "" ? null : text) || JSON.stringify(result.data.message.attachments.map((entry) => entry.id)) !== JSON.stringify(ids))
          || result.data.replayed !== (status === 200)) return invalidInput();
        return result;
      }, value.signal, { client_message_id: key, body: text, ...(input.attachmentIds === undefined ? {} : { attachment_ids: ids }) }, "POST", [200, 201]);
    },
    uploadAttachment(conversationId: number, value: UploadOptions) {
      const id = checkId(conversationId); const input = options(value, ["clientUploadId", "file", "signal"]);
      let key: string; let file: File;
      try { key = validateAttachmentId(input.clientUploadId); file = validateUploadFile(input.file); }
      catch (error) { if (error instanceof AttachmentInputError) throw new ChatApiError(0, error.code, error.message); return invalidInput(); }
      const form = new FormData(); form.append("client_upload_id", key); form.append("file", file, file.name);
      return request("/" + id + "/attachments", (payload, status) => {
        const result = parseUploadReceipt(payload, id);
        if (result.data.client_upload_id !== key || result.data.replayed !== (status === 200)
          || result.data.attachment.name !== file.name || result.data.attachment.size !== file.size) return invalidInput();
        return result;
      }, value.signal, form, "POST", [200, 201]);
    },
    cancelAttachment(conversationId: number, value: CancelOptions) {
      const id = checkId(conversationId); const input = options(value, ["attachmentId", "signal"]);
      let attachmentId: string; try { attachmentId = validateAttachmentId(input.attachmentId); } catch { return invalidInput(); }
      return request("/" + id + "/attachments/" + attachmentId, (payload) => {
        const result = parseCancelReceipt(payload); if (result.data.attachment_id !== attachmentId) return invalidInput(); return result;
      }, value.signal, undefined, "DELETE");
    },
    downloadAttachment(conversationId: number, value: DownloadOptions) {
      const id = checkId(conversationId); const input = options(value, ["attachment", "signal"]);
      let attachment: Attachment; try { attachment = parseAttachment(input.attachment, id); } catch { return invalidInput(); }
      return download(id, attachment, value.signal);
    },
    dispose,
  });
}
