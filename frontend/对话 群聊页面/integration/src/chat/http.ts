import { parseConversationPage, parseErrorEnvelope, parseMessagePage, parseReadState, safeInteger } from "./contracts.js";
import type { ConversationPage, Envelope, ErrorDetails, MessagePage, ReadState } from "./contracts.js";

export type ChatFetcher = (input: string, init: RequestInit) => Promise<Response>;
export type PageOptions = Readonly<{ limit?: number; cursor?: string; signal?: AbortSignal }>;
export type IncrementOptions = Readonly<{ afterSeq: number; limit?: number; signal?: AbortSignal }>;
export type ReadOptions = Readonly<{ readSeq: number; signal?: AbortSignal }>;
export interface ChatApi {
  list(options?: PageOptions): Promise<Envelope<ConversationPage>>;
  history(conversationId: number, options?: PageOptions): Promise<Envelope<MessagePage>>;
  increment(conversationId: number, options: IncrementOptions): Promise<Envelope<MessagePage>>;
  readState(conversationId: number, options: ReadOptions): Promise<Envelope<ReadState>>;
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
  async function request<T>(path: string, parse: (value: unknown) => Envelope<T>, callerSignal?: AbortSignal, body?: { read_seq: number }): Promise<Envelope<T>> {
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
      if (body !== undefined) { headers["Content-Type"] = "application/json"; headers["X-CSRF-Token"] = csrfToken; }
      let response: Response;
      try {
        response = await fetcher(`/api/v1/conversations${path}`, { method: body === undefined ? "GET" : "PUT", headers,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }), credentials: "same-origin", redirect: "error", cache: "no-store", signal: controller.signal });
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
      if (response.status !== 200) throw new ChatApiError(response.status, "INVALID_RESPONSE", "The server returned an unexpected chat status.");
      try { return parse(payload); } catch { throw new ChatApiError(response.status, "INVALID_RESPONSE", "The server returned an invalid chat response."); }
    } finally {
      callerSignal?.removeEventListener("abort", cancel); pending.delete(controller);
    }
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
    dispose,
  });
}
