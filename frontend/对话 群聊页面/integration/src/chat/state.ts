import { ChatApiError } from "./http.js";
import type { ChatApi } from "./http.js";
import { ChatContractError, parseConversationPage, parseMessagePage, parseReadState, safeInteger } from "./contracts.js";
import type { ConversationContext, ConversationSummary, Message, MessagePage, ReadState } from "./contracts.js";

export type OperationResult = "applied" | "ignored" | "aborted" | "failed";
export type OperationOptions = Readonly<{ signal?: AbortSignal; limit?: number }>;
type Phase = "idle" | "loading" | "ready" | "error";
type ActiveOperation = "history" | "older" | "increment" | "read-state";
export type ConversationListState = Readonly<{
  phase: Phase; items: readonly ConversationSummary[]; nextCursor: string | null; hasMore: boolean | null; authorizationRevision: number | null; error: ChatApiError | null;
}>;
export type ActiveConversationState = Readonly<{
  id: number; phase: Phase | "revoked"; operation: ActiveOperation | null; messages: readonly Message[]; context: ConversationContext | null;
  nextCursor: string | null; hasOlder: boolean | null; hasMoreNewer: boolean | null; readSeq: number | null; unreadCount: number | null; error: ChatApiError | null;
}>;
export type ChatStateSnapshot = Readonly<{
  status: "inactive" | "active" | "signed-out" | "disposed"; actorId: number | null; epoch: number;
  conversations: ConversationListState; active: ActiveConversationState | null;
}>;
export interface ChatState {
  snapshot(): ChatStateSnapshot;
  subscribe(listener: (snapshot: ChatStateSnapshot) => void): () => void;
  /** The owner must call this for every login/session change, even for the same actor. */
  activateSession(actorId: number, api: ChatApi): void;
  loadConversations(options?: OperationOptions): Promise<OperationResult>;
  loadMoreConversations(options?: OperationOptions): Promise<OperationResult>;
  selectConversation(id: number | null): void;
  loadHistory(options?: OperationOptions): Promise<OperationResult>;
  loadOlder(options?: OperationOptions): Promise<OperationResult>;
  loadNewer(options?: OperationOptions): Promise<OperationResult>;
  markRead(readSeq: number, options?: Pick<OperationOptions, "signal">): Promise<OperationResult>;
  /** Use after a known server permission change; never infer this from switching Space. */
  invalidateConversation(id: number): void;
  abort(): void;
  reset(): void;
  dispose(): void;
}
type Task = {
  controller: AbortController; epoch: number; actorId: number; authorizationEpoch: number; selectionEpoch: number;
  conversationId: number | null; contextKey: string | null; removeAbortListener: () => void;
};
const emptyList = (): ConversationListState => Object.freeze({ phase: "idle", items: Object.freeze([]), nextCursor: null, hasMore: null, authorizationRevision: null, error: null });
const emptyActive = (id: number): ActiveConversationState => Object.freeze({ id, phase: "idle", operation: null, messages: Object.freeze([]), context: null,
  nextCursor: null, hasOlder: null, hasMoreNewer: null, readSeq: null, unreadCount: null, error: null });
function inputError(): never { throw new ChatApiError(0, "INVALID_STATE_OPERATION", "This chat operation is not available."); }
function contextKey(value: ConversationContext | null): string | null {
  if (value === null) return null;
  return JSON.stringify([value.conversation_id, value.type, value.version, value.authorization_version, value.authorization_revision, value.membership_generation, value.history_after_seq,
    value.permissions.read, value.permissions.send, value.permissions.invite, value.permissions.leave,
    value.type === "discussion" ? value.space_id : null, value.type === "discussion" ? value.idea_activity_id : null]);
}
function failure(error: unknown): ChatApiError {
  if (error instanceof ChatApiError) return error;
  return new ChatApiError(0, error instanceof ChatContractError ? "INVALID_RESPONSE" : "CLIENT_ERROR", "The chat operation could not be completed.");
}
function invalidatesAuthorization(problem: ChatApiError): boolean {
  return [403, 404].includes(problem.status) || ["INVALID_RESPONSE", "CONTEXT_CHANGED", "AUTHORIZATION_CHANGED", "CURSOR_CONTEXT_CHANGED"].includes(problem.code);
}
function invalidatesAllAuthorization(problem: ChatApiError): boolean {
  return ["AUTHORIZATION_CHANGED", "CURSOR_CONTEXT_CHANGED"].includes(problem.code);
}
function checkedOptions(value: OperationOptions): void {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).some((key) => !["signal", "limit"].includes(String(key)))) return inputError();
  if (value.signal !== undefined && !(value.signal instanceof AbortSignal)) return inputError();
  if (value.limit !== undefined && (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 48)) return inputError();
}

/** In-memory, fixture-free, opt-in state. No timer, storage, request, read receipt
 * or capability activation happens at construction, subscription or selection.
 * Snapshots retained by a consumer remain that consumer's responsibility. */
export function createChatState(): ChatState {
  let api: ChatApi | null = null;
  let current: ChatStateSnapshot = Object.freeze({ status: "inactive", actorId: null, epoch: 0, conversations: emptyList(), active: null });
  let authorizationEpoch = 0;
  // Highest successfully parsed viewer revision seen in this actor/session.
  // Revoking cached projections must not allow an older response to revive them.
  let authorizationRevision: number | null = null;
  let selectionEpoch = 0;
  let listTask: Task | null = null;
  let activeTask: Task | null = null;
  const listeners = new Set<(snapshot: ChatStateSnapshot) => void>();
  function publish(patch: Partial<ChatStateSnapshot>): void {
    current = Object.freeze({ ...current, ...patch });
    for (const listener of listeners) { try { listener(current); } catch { /* A view failure cannot change request authorization. */ } }
  }
  function endTask(task: Task | null): void { task?.controller.abort(); task?.removeAbortListener(); }
  function abortTasks(): void { endTask(listTask); endTask(activeTask); listTask = null; activeTask = null; }
  function requireSession(): ChatApi { if (current.status !== "active" || api === null || current.actorId === null) return inputError(); return api; }
  function requireActive(): ActiveConversationState { requireSession(); if (!current.active || current.active.phase === "revoked") return inputError(); return current.active; }
  function task(signal: AbortSignal | undefined, active: boolean): Task {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    return { controller, epoch: current.epoch, actorId: current.actorId!, authorizationEpoch, selectionEpoch,
      conversationId: active ? current.active!.id : null, contextKey: active ? contextKey(current.active!.context) : null,
      removeAbortListener: () => signal?.removeEventListener("abort", abort) };
  }
  function sessionMatches(value: Task): boolean {
    return current.status === "active" && current.epoch === value.epoch && current.actorId === value.actorId;
  }
  function matches(value: Task): boolean {
    if (!sessionMatches(value) || value.authorizationEpoch !== authorizationEpoch) return false;
    if (value.conversationId === null) return listTask === value;
    return activeTask === value && value.selectionEpoch === selectionEpoch && current.active?.id === value.conversationId
      && contextKey(current.active.context) === value.contextKey;
  }
  function clearSession(status: ChatStateSnapshot["status"]): void {
    abortTasks(); authorizationEpoch++; selectionEpoch++; authorizationRevision = null;
    const previous = api; api = null; previous?.dispose();
    publish({ status, actorId: null, epoch: current.epoch + 1, conversations: emptyList(), active: null });
  }
  function revokeAll(error: ChatApiError): void {
    abortTasks(); authorizationEpoch++; selectionEpoch++;
    publish({ conversations: Object.freeze({ ...emptyList(), phase: "error", error }),
      active: current.active ? Object.freeze({ ...emptyActive(current.active.id), phase: "revoked", error }) : null });
  }
  function revoke(id: number, error: ChatApiError | null): void {
    authorizationEpoch++;
    endTask(listTask); listTask = null;
    // Cancel all tasks that captured the old authorization epoch, even when a
    // list refresh discovered the revocation of a different conversation.
    endTask(activeTask); activeTask = null;
    const previous = current.active;
    const active = previous?.id === id ? Object.freeze({ ...emptyActive(id), phase: "revoked" as const, error })
      : previous && previous.operation !== null ? Object.freeze({ ...previous, phase: previous.context ? "ready" as const : "idle" as const, operation: null }) : previous;
    publish({ conversations: Object.freeze({ ...current.conversations, phase: current.conversations.hasMore === null ? "idle" : "ready",
      items: Object.freeze(current.conversations.items.filter((item) => item.id !== id)), nextCursor: null, hasMore: null, error: null }), active });
  }
  function finishAborted(value: Task): OperationResult {
    if (!matches(value)) return "ignored";
    if (value.conversationId === null) publish({ conversations: Object.freeze({ ...current.conversations, phase: current.conversations.hasMore === null ? "idle" : "ready" }) });
    else if (current.active) publish({ active: Object.freeze({ ...current.active, phase: current.active.context ? "ready" : "idle", operation: null }) });
    return "aborted";
  }
  function rejectTask(value: Task, error: unknown): OperationResult {
    const problem = failure(error);
    // Even an old conversation's 401 invalidates this same actor/session. A
    // response from a previously discarded session must never log out a new one.
    if (sessionMatches(value) && problem.status === 401) { clearSession("signed-out"); return "failed"; }
    if (!matches(value)) return "ignored";
    if (value.controller.signal.aborted) return finishAborted(value);
    if (invalidatesAllAuthorization(problem)) { revokeAll(problem); return "failed"; }
    if (value.conversationId !== null && invalidatesAuthorization(problem)) {
      revoke(value.conversationId, problem); return "failed";
    }
    if (value.conversationId === null) {
      // A failed refreshed list cannot serve stale summaries as an empty result.
      const denied = invalidatesAuthorization(problem);
      if (denied) {
        endTask(activeTask); activeTask = null; authorizationEpoch++; selectionEpoch++;
        publish({ conversations: Object.freeze({ ...emptyList(), phase: "error", error: problem }), active: null });
      } else publish({ conversations: Object.freeze({ ...current.conversations, phase: "error", error: problem }) });
    } else if (current.active) publish({ active: Object.freeze({ ...current.active, phase: current.active.context ? "ready" : "error", operation: null, error: problem }) });
    return "failed";
  }
  function release(value: Task): void { value.removeAbortListener(); if (listTask === value) listTask = null; if (activeTask === value) activeTask = null; }
  async function loadList(more: boolean, value: OperationOptions = {}): Promise<OperationResult> {
    checkedOptions(value); const port = requireSession();
    if (listTask) return inputError();
    const cursor = more ? current.conversations.nextCursor : null;
    if (more && (current.conversations.hasMore !== true || cursor === null)) return inputError();
    const work = task(value.signal, false); listTask = work;
    publish({ conversations: Object.freeze({ ...current.conversations, phase: "loading", error: null }) });
    try {
      if (work.controller.signal.aborted) return finishAborted(work);
      const response = parseConversationPage(await port.list({ limit: value.limit, ...(cursor === null ? {} : { cursor }), signal: work.controller.signal }));
      if (!matches(work)) return "ignored";
      if (work.controller.signal.aborted) return finishAborted(work);
      if (more && response.data.next_cursor !== null && response.data.next_cursor === cursor) throw new ChatContractError();
      if (authorizationRevision !== null && response.data.authorization_revision < authorizationRevision) {
        throw new ChatApiError(409, "AUTHORIZATION_CHANGED", "The chat response belongs to an older access revision.");
      }
      const revisionChanged = authorizationRevision !== null && authorizationRevision !== response.data.authorization_revision;
      authorizationRevision = response.data.authorization_revision;
      if (revisionChanged && more) {
        throw new ChatApiError(409, "AUTHORIZATION_CHANGED", "Chat access changed. Reload the conversation list.");
      }
      if (revisionChanged) { endTask(activeTask); activeTask = null; selectionEpoch++; authorizationEpoch++; }
      const entries = more ? [...current.conversations.items] : [];
      for (const entry of response.data.items) {
        const index = entries.findIndex((old) => old.id === entry.id);
        if (index >= 0) entries[index] = entry; else entries.push(entry);
      }
      const active = revisionChanged ? null : current.active;
      const matchingSummary = active ? response.data.items.find((entry) => entry.id === active.id) : null;
      // A newer server version invalidates messages from the old permission
      // context. A missing item in a page alone is not proof of revocation.
      if (active?.context && matchingSummary && (matchingSummary.version !== active.context.version
        || matchingSummary.type !== active.context.type || JSON.stringify(matchingSummary.permissions) !== JSON.stringify(active.context.permissions))) {
        revoke(active.id, new ChatApiError(409, "CONTEXT_CHANGED", "Conversation access changed. Load it again to continue."));
        return "failed";
      }
      publish({ conversations: Object.freeze({ phase: "ready", items: Object.freeze(entries), nextCursor: response.data.next_cursor, hasMore: response.data.has_more,
        authorizationRevision: response.data.authorization_revision, error: null }), ...(revisionChanged ? { active: null } : {}) });
      return "applied";
    } catch (error) { return rejectTask(work, error); } finally { release(work); }
  }
  function mergeMessages(existing: readonly Message[], incoming: readonly Message[], operation: ActiveOperation): readonly Message[] {
    const bySeq = new Map(existing.map((entry) => [entry.seq, entry]));
    const byId = new Map(existing.map((entry) => [entry.id, entry.seq]));
    const first = existing[0]?.seq;
    const last = existing.at(-1)?.seq;
    for (const entry of incoming) {
      const sameSeq = bySeq.get(entry.seq);
      if ((sameSeq && sameSeq.id !== entry.id) || (byId.has(entry.id) && byId.get(entry.id) !== entry.seq)) throw new ChatContractError();
      if (!sameSeq && ((operation === "older" && first !== undefined && entry.seq >= first)
        || (operation === "increment" && last !== undefined && entry.seq <= last))) throw new ChatContractError();
      bySeq.set(entry.seq, entry); byId.set(entry.id, entry.seq);
    }
    return Object.freeze([...bySeq.values()].sort((a, b) => a.seq - b.seq));
  }
  async function loadActive(operation: ActiveOperation, value: OperationOptions = {}, requestedReadSeq?: number): Promise<OperationResult> {
    checkedOptions(value); const port = requireSession(); const selected = requireActive();
    if (activeTask) return inputError();
    if (operation !== "history" && (!selected.context || !selected.context.permissions.read)) return inputError();
    if (operation === "older" && (!selected.hasOlder || selected.nextCursor === null)) return inputError();
    if (operation === "read-state") {
      try { safeInteger(requestedReadSeq); } catch { return inputError(); }
      // Explicit read intent may refer only to the currently displayed message
      // or the allowed no-op baseline; no speculative future receipt is sent.
      if (requestedReadSeq !== 0 && requestedReadSeq !== selected.context!.history_after_seq && !selected.messages.some((entry) => entry.seq === requestedReadSeq)) return inputError();
    }
    const work = task(value.signal, true); activeTask = work;
    publish({ active: Object.freeze({ ...selected, phase: selected.context ? "ready" : "loading", operation, error: null }) });
    try {
      if (work.controller.signal.aborted) return finishAborted(work);
      const query = { signal: work.controller.signal, limit: value.limit };
      let data: MessagePage | ReadState;
      if (operation === "read-state") data = parseReadState(await port.readState(selected.id, { signal: work.controller.signal, readSeq: requestedReadSeq! })).data;
      else if (operation === "increment") data = parseMessagePage(await port.increment(selected.id, { ...query, afterSeq: selected.messages.at(-1)?.seq ?? selected.context!.history_after_seq }), "increment").data;
      else data = parseMessagePage(await port.history(selected.id, { ...query, ...(operation === "older" ? { cursor: selected.nextCursor! } : {}) })).data;
      if (!matches(work)) return "ignored";
      if (work.controller.signal.aborted) return finishAborted(work);
      if (data.context.conversation_id !== selected.id) throw new ChatContractError();
      if (authorizationRevision !== null && data.context.authorization_revision < authorizationRevision) {
        throw new ChatApiError(409, "AUTHORIZATION_CHANGED", "The chat response belongs to an older access revision.");
      }
      const globalRevisionChanged = authorizationRevision !== null && authorizationRevision !== data.context.authorization_revision;
      authorizationRevision = data.context.authorization_revision;
      if (globalRevisionChanged && operation !== "history") {
        throw new ChatApiError(409, "AUTHORIZATION_CHANGED", "Chat access changed. Reload the conversation list.");
      }
      if (operation !== "history" && contextKey(data.context) !== work.contextKey) {
        throw new ChatApiError(409, "CONTEXT_CHANGED", "Conversation access changed. Load it again to continue.");
      }
      const changedContext = operation === "history" && selected.context && contextKey(data.context) !== work.contextKey;
      if (changedContext || globalRevisionChanged) {
        // A fresh history response can reauthorize the same conversation, but
        // old list summaries and all old messages must leave memory first.
        endTask(listTask); listTask = null; authorizationEpoch++;
      }
      if (operation === "read-state" && data.read_seq < requestedReadSeq!) throw new ChatContractError();
      if (selected.context && !changedContext && data.read_seq < selected.readSeq!) throw new ChatContractError();
      const page = "items" in data ? data : null;
      if (operation === "increment" && page?.items.some((entry) => entry.seq <= (selected.messages.at(-1)?.seq ?? selected.context!.history_after_seq))) throw new ChatContractError();
      if (operation === "older" && page?.next_cursor !== null && page?.next_cursor === selected.nextCursor) throw new ChatContractError();
      const base = operation === "history" ? emptyActive(selected.id) : selected;
      const messages = page ? operation === "history" ? page.items : mergeMessages(base.messages, page.items, operation) : base.messages;
      const updated = Object.freeze({ ...base, phase: "ready" as const, operation: null, messages, context: data.context, readSeq: data.read_seq, unreadCount: data.unread_count, error: null,
        ...(page && operation !== "increment" ? { nextCursor: page.next_cursor, hasOlder: page.has_more } : {}),
        ...(page && operation === "increment" ? { hasMoreNewer: page.has_more } : {}) });
      authorizationRevision = data.context.authorization_revision;
      const entries = (globalRevisionChanged ? [] : current.conversations.items).filter((entry) => !changedContext || entry.id !== selected.id)
        .map((entry) => entry.id === selected.id ? Object.freeze({ ...entry, unread_count: data.unread_count }) : entry);
      publish({ active: updated, conversations: Object.freeze({ ...(changedContext || globalRevisionChanged ? emptyList() : current.conversations), items: Object.freeze(entries) }) });
      return "applied";
    } catch (error) { return rejectTask(work, error); } finally { release(work); }
  }
  return Object.freeze({
    snapshot: () => current,
    subscribe(listener: (snapshot: ChatStateSnapshot) => void) {
      if (typeof listener !== "function" || current.status === "disposed") return inputError();
      listeners.add(listener); return () => { listeners.delete(listener); };
    },
    activateSession(actorId: number, port: ChatApi) {
      if (current.status === "disposed") return inputError();
      try { safeInteger(actorId, 1); } catch { return inputError(); }
      if (!port || !["list", "history", "increment", "readState", "dispose"].every((key) => typeof port[key as keyof ChatApi] === "function") || port === api) return inputError();
      clearSession("inactive"); api = port; publish({ status: "active", actorId });
    },
    loadConversations: (value: OperationOptions = {}) => loadList(false, value),
    loadMoreConversations: (value: OperationOptions = {}) => loadList(true, value),
    selectConversation(id: number | null) {
      requireSession(); if (id !== null) { try { safeInteger(id, 1); } catch { return inputError(); } }
      endTask(activeTask); activeTask = null; selectionEpoch++; publish({ active: id === null ? null : emptyActive(id) });
    },
    loadHistory: (value: OperationOptions = {}) => loadActive("history", value),
    loadOlder: (value: OperationOptions = {}) => loadActive("older", value),
    loadNewer: (value: OperationOptions = {}) => loadActive("increment", value),
    markRead: (readSeq: number, value: Pick<OperationOptions, "signal"> = {}) => loadActive("read-state", value, readSeq),
    invalidateConversation(id: number) { requireSession(); try { safeInteger(id, 1); } catch { return inputError(); } revoke(id, null); },
    abort() {
      if (current.status === "disposed") return;
      abortTasks();
      publish({ conversations: Object.freeze({ ...current.conversations, phase: current.conversations.phase === "loading" ? current.conversations.hasMore === null ? "idle" : "ready" : current.conversations.phase }),
        active: current.active?.operation ? Object.freeze({ ...current.active, phase: current.active.context ? "ready" : "idle", operation: null }) : current.active });
    },
    reset() { if (current.status !== "disposed") clearSession("inactive"); },
    dispose() { if (current.status !== "disposed") { clearSession("disposed"); listeners.clear(); } },
  });
}
