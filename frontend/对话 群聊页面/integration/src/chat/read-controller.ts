import { createChatApi, ChatApiError } from "./http.js";
import type { ChatApi, ChatFetcher } from "./http.js";
import { createChatState } from "./state.js";
import type { ChatStateSnapshot, OperationResult } from "./state.js";
import type { ReadBootstrap } from "./read-bootstrap.js";
import { parseReadPath } from "./navigation.js";
import { createSendDraft } from "./send-draft.js";
import type { SendDraftSnapshot } from "./send-draft.js";

export type ReadPageSnapshot = Readonly<{
  status: "idle" | "ready" | "suspended" | "signed-out" | "disposed";
  chat: ChatStateSnapshot;
  draft: SendDraftSnapshot;
}>;
export type ViewIntent = Readonly<{ conversationId: number; seq: number; visible: boolean; focused: boolean }>;
export interface ReadController {
  snapshot(): ReadPageSnapshot; subscribe(listener: () => void): () => void;
  start(pathname: string): Promise<OperationResult>;
  navigate(pathname: string): Promise<OperationResult>;
  refreshList(): Promise<OperationResult>; moreConversations(): Promise<OperationResult>;
  refreshHistory(): Promise<OperationResult>; older(): Promise<OperationResult>; newer(): Promise<OperationResult>;
  acknowledgeVisible(intent: ViewIntent): Promise<OperationResult>;
  editDraft(body: string): void; submitDraft(): Promise<OperationResult>; retryDraft(): Promise<OperationResult>; editFailedDraft(): void;
  suspend(): void; dispose(): void;
}
function unavailable(): never { throw new ChatApiError(0, "READ_PAGE_UNAVAILABLE", "Reload this page to continue reading."); }
function directOnly(port: ChatApi): ChatApi {
  const reject = () => { throw new ChatApiError(200, "INVALID_RESPONSE", "This page can only display authorized direct conversations."); };
  return Object.freeze<ChatApi>({
    async list(options) { const value = await port.list(options); if (value.data.items.some((entry) => entry.type !== "direct")) return reject(); return value; },
    async history(id, options) { const value = await port.history(id, options); if (value.data.context.type !== "direct") return reject(); return value; },
    async increment(id, options) { const value = await port.increment(id, options); if (value.data.context.type !== "direct") return reject(); return value; },
    async readState(id, options) { const value = await port.readState(id, options); if (value.data.context.type !== "direct") return reject(); return value; },
    async sendText(id, options) { const value = await port.sendText(id, options); if (value.data.context.type !== "direct") return reject(); return value; },
    dispose: () => port.dispose(),
  });
}

/** No I/O on creation. The host must explicitly mount the read entry after the
 * server-side C04 gate, with a freshly parsed native-session bootstrap. */
export function createReadController(bootstrap: ReadBootstrap, fetcher?: ChatFetcher): ReadController {
  const store = createChatState();
  const draft = createSendDraft();
  let status: ReadPageSnapshot["status"] = "idle";
  let revision = 0;
  let requestedConversationId: number | null = null;
  let api: ChatApi | null = directOnly(createChatApi({ apiBase: bootstrap.api_base, csrfToken: bootstrap.csrf_token, expectedActorId: bootstrap.actor_id, fetcher }));
  const actorId = bootstrap.actor_id;
  const listeners = new Set<() => void>();
  let draftScope: string | null = null;
  let snapshot: ReadPageSnapshot = Object.freeze({ status, chat: store.snapshot(), draft: draft.snapshot() });
  function publish(): void {
    snapshot = Object.freeze({ status, chat: store.snapshot(), draft: draft.snapshot() });
    for (const listener of listeners) { try { listener(); } catch { /* View errors cannot retain an old session. */ } }
  }
  const unsubscribe = store.subscribe((chat) => {
    const scope = chat.status === "active" && chat.active?.context
      ? JSON.stringify([chat.actorId, chat.epoch, chat.active.id, chat.active.context]) : null;
    if (scope !== draftScope) { draft.reset(); draftScope = scope; }
    if (chat.status === "signed-out") { status = "signed-out"; revision++; requestedConversationId = null; api = null; }
    publish();
  });
  function active(): void { if (status !== "ready") return unavailable(); }
  function writable(): void {
    active(); const selected = store.snapshot().active;
    if (!selected || selected.phase !== "ready" || selected.operation !== null || selected.context?.type !== "direct" || !selected.context.permissions.send) return unavailable();
  }
  async function transmit(retry: boolean): Promise<OperationResult> {
    writable(); const attempt = draft.begin(retry); const epoch = revision; publish();
    let result;
    try { result = await store.sendText(attempt); }
    catch (error) {
      if (revision !== epoch || status !== "ready" || draft.snapshot().clientMessageId !== attempt.clientMessageId) return "ignored";
      draft.fail(error instanceof ChatApiError ? error : new ChatApiError(0, "CLIENT_ERROR", "发送结果暂无法确认。")); publish(); return "failed";
    }
    if (revision !== epoch || status !== "ready" || draft.snapshot().clientMessageId !== attempt.clientMessageId) return "ignored";
    if (result.status === "applied") {
      draft.succeed(result.receipt.message.id); publish();
      // One bounded GET fills intervening messages; no optimistic body append,
      // automatic send retry, receipt PUT, list refresh loop or delivery claim.
      if (result.receipt.replayed) await store.loadHistory(); else await store.loadNewer();
      return "applied";
    }
    if (result.status === "failed") draft.fail(result.error);
    else draft.fail(new ChatApiError(0, "REQUEST_ABORTED", "发送结果暂无法确认。"));
    publish(); return result.status;
  }
  // Explicit list recovery may finish the original deep link. A failed list
  // never starts history, and later navigation/session changes cancel that intent.
  async function loadListAndOpenRequested(): Promise<OperationResult> {
    const epoch = revision;
    const result = await store.loadConversations();
    if (revision !== epoch || status !== "ready") return "ignored";
    if (result === "applied" && requestedConversationId !== null && store.snapshot().active === null) {
      store.selectConversation(requestedConversationId);
      return store.loadHistory();
    }
    return result;
  }
  return Object.freeze<ReadController>({
    snapshot: () => snapshot,
    subscribe(listener: () => void) { if (status === "disposed") return unavailable(); listeners.add(listener); return () => { listeners.delete(listener); }; },
    async start(pathname: string) {
      const route = parseReadPath(pathname);
      if (status !== "idle" || api === null) return unavailable();
      revision++; requestedConversationId = route.conversationId; status = "ready"; store.activateSession(actorId, api);
      return loadListAndOpenRequested();
    },
    async navigate(pathname: string) {
      const route = parseReadPath(pathname); active(); revision++; requestedConversationId = route.conversationId;
      store.selectConversation(route.conversationId);
      return route.conversationId === null ? "applied" : store.loadHistory();
    },
    refreshList() { active(); return loadListAndOpenRequested(); },
    moreConversations() { active(); return store.loadMoreConversations(); },
    refreshHistory() {
      active(); const id = store.snapshot().active?.id; if (id === undefined) return unavailable();
      if (store.snapshot().active?.phase === "revoked") store.selectConversation(id);
      return store.loadHistory();
    },
    older() { active(); return store.loadOlder(); },
    newer() { active(); return store.loadNewer(); },
    acknowledgeVisible(intent: ViewIntent): Promise<OperationResult> {
      active(); const selected = store.snapshot().active;
      if (intent.visible !== true || intent.focused !== true || !selected || selected.id !== intent.conversationId || selected.phase !== "ready" || selected.operation !== null
        || !selected.messages.some((entry) => entry.seq === intent.seq)) return unavailable();
      if (selected.readSeq !== null && selected.readSeq >= intent.seq) return Promise.resolve("ignored");
      return store.markRead(intent.seq);
    },
    editDraft(body: string) { writable(); draft.edit(body); publish(); },
    submitDraft: () => transmit(false),
    retryDraft: () => transmit(true),
    editFailedDraft() { writable(); draft.editAgain(); publish(); },
    suspend() {
      if (status === "disposed" || status === "suspended") return;
      status = "suspended"; revision++; requestedConversationId = null; api?.dispose(); api = null; store.reset(); publish();
    },
    dispose() {
      if (status === "disposed") return;
      status = "disposed"; revision++; requestedConversationId = null; api?.dispose(); api = null; store.dispose(); unsubscribe(); publish(); listeners.clear();
    },
  });
}
