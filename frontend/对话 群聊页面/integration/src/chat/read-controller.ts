import { createChatApi, ChatApiError } from "./http.js";
import type { ChatApi, ChatFetcher } from "./http.js";
import { createChatState } from "./state.js";
import type { ChatStateSnapshot, OperationResult } from "./state.js";
import type { ReadBootstrap } from "./read-bootstrap.js";
import { parseReadPath } from "./navigation.js";

export type ReadPageSnapshot = Readonly<{
  status: "idle" | "ready" | "suspended" | "signed-out" | "disposed";
  chat: ChatStateSnapshot;
}>;
export type ViewIntent = Readonly<{ conversationId: number; seq: number; visible: boolean; focused: boolean }>;
export interface ReadController {
  snapshot(): ReadPageSnapshot; subscribe(listener: () => void): () => void;
  start(pathname: string): Promise<OperationResult>;
  navigate(pathname: string): Promise<OperationResult>;
  refreshList(): Promise<OperationResult>; moreConversations(): Promise<OperationResult>;
  refreshHistory(): Promise<OperationResult>; older(): Promise<OperationResult>; newer(): Promise<OperationResult>;
  acknowledgeVisible(intent: ViewIntent): Promise<OperationResult>;
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
    dispose: () => port.dispose(),
  });
}

/** No I/O on creation. The host must explicitly mount the read entry after the
 * server-side C04 gate, with a freshly parsed native-session bootstrap. */
export function createReadController(bootstrap: ReadBootstrap, fetcher?: ChatFetcher): ReadController {
  const store = createChatState();
  let status: ReadPageSnapshot["status"] = "idle";
  let revision = 0;
  let requestedConversationId: number | null = null;
  let api: ChatApi | null = directOnly(createChatApi({ apiBase: bootstrap.api_base, csrfToken: bootstrap.csrf_token, expectedActorId: bootstrap.actor_id, fetcher }));
  const actorId = bootstrap.actor_id;
  const listeners = new Set<() => void>();
  let snapshot: ReadPageSnapshot = Object.freeze({ status, chat: store.snapshot() });
  function publish(): void {
    snapshot = Object.freeze({ status, chat: store.snapshot() });
    for (const listener of listeners) { try { listener(); } catch { /* View errors cannot retain an old session. */ } }
  }
  const unsubscribe = store.subscribe((chat) => {
    if (chat.status === "signed-out") { status = "signed-out"; revision++; requestedConversationId = null; api = null; }
    publish();
  });
  function active(): void { if (status !== "ready") return unavailable(); }
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
      store.selectConversation(id); return store.loadHistory();
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
