import { createChatApi, ChatApiError } from "./http.js";
import type { ChatApi, ChatFetcher } from "./http.js";
import { createChatState } from "./state.js";
import type { ChatStateSnapshot, OperationResult } from "./state.js";
import type { ReadBootstrap } from "./read-bootstrap.js";
import { parseReadPath } from "./navigation.js";
import { createSendDraft } from "./send-draft.js";
import type { SendDraftSnapshot } from "./send-draft.js";
import { createAttachmentDraft } from "./attachment-draft.js";
import type { AttachmentSelection } from "./attachment-draft.js";
import { createAttachmentUrls } from "./attachment-urls.js";
import type { AttachmentUrlPort } from "./attachment-urls.js";

export type AttachmentDownloadSnapshot = Readonly<{ phase: "idle" | "loading" | "ready" | "failed"; attachmentId: string | null; name: string | null; url: string | null; error: ChatApiError | null }>;
const emptyDownload = (): AttachmentDownloadSnapshot => Object.freeze({ phase: "idle", attachmentId: null, name: null, url: null, error: null });

export type ReadPageSnapshot = Readonly<{
  status: "idle" | "ready" | "suspended" | "signed-out" | "disposed";
  chat: ChatStateSnapshot;
  draft: SendDraftSnapshot;
  attachments: readonly AttachmentSelection[];
  download: AttachmentDownloadSnapshot;
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
  selectAttachments(files: readonly File[]): void; uploadAttachment(clientUploadId: string): Promise<OperationResult>;
  cancelAttachment(clientUploadId: string): Promise<OperationResult>; discardAttachment(clientUploadId: string): void;
  downloadAttachment(attachmentId: string): Promise<OperationResult>; clearDownload(): void;
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
    uploadAttachment: (id, options) => port.uploadAttachment(id, options),
    cancelAttachment: (id, options) => port.cancelAttachment(id, options),
    downloadAttachment: (id, options) => port.downloadAttachment(id, options),
    dispose: () => port.dispose(),
  });
}

/** No I/O on creation. The host must explicitly mount the read entry after the
 * server-side C04 gate, with a freshly parsed native-session bootstrap. */
export function createReadController(bootstrap: ReadBootstrap, fetcher?: ChatFetcher, urlPort?: AttachmentUrlPort): ReadController {
  const store = createChatState();
  const draft = createSendDraft();
  const attachments = createAttachmentDraft(); const resources = createAttachmentUrls(urlPort);
  let download = emptyDownload();
  let attachmentOperation = 0; let downloadOperation = 0;
  let status: ReadPageSnapshot["status"] = "idle";
  let revision = 0;
  let requestedConversationId: number | null = null;
  let api: ChatApi | null = directOnly(createChatApi({ apiBase: bootstrap.api_base, csrfToken: bootstrap.csrf_token, expectedActorId: bootstrap.actor_id, fetcher }));
  const actorId = bootstrap.actor_id;
  const listeners = new Set<() => void>();
  let draftScope: string | null = null;
  let snapshot: ReadPageSnapshot = Object.freeze({ status, chat: store.snapshot(), draft: draft.snapshot(), attachments: attachments.snapshot(), download });
  function publish(): void {
    snapshot = Object.freeze({ status, chat: store.snapshot(), draft: draft.snapshot(), attachments: attachments.snapshot(), download });
    for (const listener of listeners) { try { listener(); } catch { /* View errors cannot retain an old session. */ } }
  }
  const unsubscribe = store.subscribe((chat) => {
    const scope = chat.status === "active" && chat.active?.context
      ? JSON.stringify([chat.actorId, chat.epoch, chat.active.id, chat.active.context]) : null;
    if (scope !== draftScope) { draft.reset(); attachments.reset(); attachmentOperation++; downloadOperation++; resources.clear(); download = emptyDownload(); draftScope = scope; }
    else if (download.attachmentId !== null && !chat.active?.messages.some((entry) => entry.attachments.some((attachment) => attachment.id === download.attachmentId))) {
      downloadOperation++; resources.clear(); download = emptyDownload();
    }
    if (chat.status === "signed-out") { status = "signed-out"; revision++; requestedConversationId = null; api = null; }
    publish();
  });
  function active(): void { if (status !== "ready") return unavailable(); }
  function writable(): void {
    active(); const selected = store.snapshot().active;
    if (!selected || selected.phase !== "ready" || selected.operation !== null || selected.context?.type !== "direct" || !selected.context.permissions.send) return unavailable();
  }
  async function transmit(retry: boolean): Promise<OperationResult> {
    writable(); const attempt = draft.begin(retry, retry ? [] : attachments.readyIds()); const epoch = revision;
    const conversationId = store.snapshot().active!.id; publish();
    let result;
    try { result = await store.sendText(attempt); }
    catch (error) {
      if (revision !== epoch || status !== "ready" || draft.snapshot().clientMessageId !== attempt.clientMessageId) return "ignored";
      draft.fail(error instanceof ChatApiError ? error : new ChatApiError(0, "CLIENT_ERROR", "发送结果暂无法确认。")); publish(); return "failed";
    }
    if (revision !== epoch || status !== "ready" || draft.snapshot().clientMessageId !== attempt.clientMessageId) return "ignored";
    if (result.status === "applied") {
      attachments.reset(); draft.succeed(result.receipt.message.id); publish();
      // Replay clears both message and summary projections. Reauthorize history
      // first, then refill the viewer's list once; neither GET repeats a write.
      if (result.receipt.replayed) {
        await store.loadHistory();
        const chat = store.snapshot();
        if (revision === epoch && status === "ready" && chat.active?.id === conversationId && chat.active.phase !== "revoked"
          && chat.conversations.phase !== "loading") await store.loadConversations();
      } else await store.loadNewer();
      return "applied";
    }
    if (result.status === "failed") draft.fail(result.error);
    else draft.fail(new ChatApiError(0, "REQUEST_ABORTED", "发送结果暂无法确认。"));
    publish(); return result.status;
  }
  function editableAttachments(): void {
    writable();
    if (store.snapshot().active?.context?.attachments?.upload_enabled !== true || !["idle", "sent"].includes(draft.snapshot().phase)) return unavailable();
  }
  async function changeAttachment(key: string, operation: "upload" | "cancel"): Promise<OperationResult> {
    editableAttachments(); const scope = draftScope; const epoch = revision; const operationId = ++attachmentOperation;
    const attempt = operation === "upload" ? attachments.beginUpload(key) : attachments.beginCancel(key); publish();
    try {
      const result = operation === "upload" ? await store.uploadAttachment(attempt as ReturnType<typeof attachments.beginUpload>)
        : await store.cancelAttachment(attempt as ReturnType<typeof attachments.beginCancel>);
      if (scope !== draftScope || epoch !== revision || operationId !== attachmentOperation || status !== "ready") return "ignored";
      const entry = attachments.snapshot().find((item) => item.clientUploadId === key);
      if (!entry || !["uploading", "cancelling"].includes(entry.phase)) return "ignored";
      if (result.status === "applied") {
        if (operation === "upload") attachments.uploaded(key, result.value as import("./contracts.js").UploadReceipt);
        else attachments.remove(key);
      } else attachments.failed(key, result.status === "failed" ? result.error : new ChatApiError(0, "REQUEST_ABORTED", "附件结果待确认，请使用原操作重试。"));
      publish(); return result.status;
    } catch (error) {
      if (scope !== draftScope || epoch !== revision || operationId !== attachmentOperation || status !== "ready") return "ignored";
      attachments.failed(key, error instanceof ChatApiError ? error : new ChatApiError(0, "CLIENT_ERROR", "附件结果待确认。")); publish(); return "failed";
    }
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
    editFailedDraft() { writable(); if (draft.snapshot().phase === "outcome_unknown") attachments.reset(); draft.editAgain(); publish(); },
    selectAttachments(files: readonly File[]) { editableAttachments(); attachments.select(files); if (draft.snapshot().phase === "sent") draft.edit(""); publish(); },
    uploadAttachment: (key: string) => changeAttachment(key, "upload"),
    cancelAttachment(key: string) {
      active(); const entry = attachments.snapshot().find((item) => item.clientUploadId === key);
      if (entry?.phase === "uploading" && store.snapshot().active?.operation === "attachment-upload") {
        attachmentOperation++; attachments.failed(key, new ChatApiError(0, "REQUEST_ABORTED", "传输已停止，服务端结果仍待确认。请使用原文件重试确认。")); store.abort(); publish(); return Promise.resolve("aborted");
      }
      return changeAttachment(key, "cancel");
    },
    discardAttachment(key: string) {
      editableAttachments(); const entry = attachments.snapshot().find((item) => item.clientUploadId === key);
      if (!entry || !["selected", "upload_failed", "upload_unknown"].includes(entry.phase) && entry.error?.code !== "ATTACHMENT_ALREADY_BOUND") return unavailable();
      attachments.remove(key); publish();
    },
    async downloadAttachment(attachmentId: string) {
      active(); const selected = store.snapshot().active;
      const attachment = selected?.messages.flatMap((entry) => entry.attachments).find((entry) => entry.id === attachmentId);
      if (!attachment || selected?.phase !== "ready" || selected.operation !== null || selected.context?.attachments?.download_enabled !== true) return unavailable();
      const scope = draftScope; const epoch = revision; const operationId = ++downloadOperation; resources.clear();
      download = Object.freeze({ phase: "loading", attachmentId, name: attachment.name, url: null, error: null }); publish();
      try {
        const result = await store.downloadAttachment({ attachment });
        if (scope !== draftScope || epoch !== revision || operationId !== downloadOperation || status !== "ready") return "ignored";
        if (result.status === "applied") download = Object.freeze({ phase: "ready", attachmentId, name: attachment.name, url: resources.create(result.value.blob), error: null });
        else download = Object.freeze({ phase: "failed", attachmentId, name: attachment.name, url: null,
          error: result.status === "failed" ? result.error : new ChatApiError(0, "REQUEST_ABORTED", "下载已取消，请手动重试。") });
        publish(); return result.status;
      } catch (error) {
        if (scope !== draftScope || epoch !== revision || operationId !== downloadOperation || status !== "ready") return "ignored";
        resources.clear(); download = Object.freeze({ phase: "failed", attachmentId, name: attachment.name, url: null,
          error: error instanceof ChatApiError ? error : new ChatApiError(0, "DOWNLOAD_FAILED", "下载未完成，请手动重试。") }); publish(); return "failed";
      }
    },
    clearDownload() { downloadOperation++; if (store.snapshot().active?.operation === "attachment-download") store.abort(); resources.clear(); download = emptyDownload(); publish(); },
    suspend() {
      if (status === "disposed" || status === "suspended") return;
      status = "suspended"; revision++; requestedConversationId = null; api?.dispose(); api = null; store.reset(); publish();
    },
    dispose() {
      if (status === "disposed") return;
      status = "disposed"; revision++; requestedConversationId = null; api?.dispose(); api = null; store.dispose(); resources.dispose(); unsubscribe(); publish(); listeners.clear();
    },
  });
}
