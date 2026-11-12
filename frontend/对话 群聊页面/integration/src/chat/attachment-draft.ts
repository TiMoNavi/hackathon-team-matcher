import type { Attachment, UploadReceipt } from "./contracts.js";
import { ChatApiError } from "./http.js";
import { createClientMessageId } from "./send-input.js";
import { ATTACHMENT_MAX_FILES, validateAttachmentId, validateUploadFile } from "./attachment-input.js";

export type AttachmentSelection = Readonly<{
  clientUploadId: string; name: string; size: number;
  phase: "selected" | "uploading" | "ready" | "upload_failed" | "upload_unknown" | "cancelling" | "cancel_failed" | "cancel_unknown";
  attachment: Attachment | null; expiresAt: string | null; error: ChatApiError | null;
}>;
const unavailable = (): never => { throw new ChatApiError(0, "ATTACHMENT_NOT_READY", "请先处理当前附件操作。"); };
const unknown = (error: ChatApiError) => error.status === 0 || error.code === "INVALID_RESPONSE" || error.status >= 500;

/** Files and upload keys are volatile, scoped to one authorized conversation.
 * Selection, reset and disposal never upload or cancel a server resource. */
export function createAttachmentDraft(makeKey: () => string = createClientMessageId) {
  let items: readonly AttachmentSelection[] = Object.freeze([]); const files = new Map<string, File>();
  const find = (key: string) => items.find((entry) => entry.clientUploadId === key) ?? unavailable();
  const replace = (key: string, changes: Partial<AttachmentSelection>) => { items = Object.freeze(items.map((entry) => entry.clientUploadId === key ? Object.freeze({ ...entry, ...changes }) : entry)); };
  return Object.freeze({
    snapshot: () => items,
    select(values: readonly File[]) {
      if (!Array.isArray(values) || !values.length || items.length + values.length > ATTACHMENT_MAX_FILES) return unavailable();
      const validated = values.map(validateUploadFile); const entries = validated.map((file) => {
        const clientUploadId = validateAttachmentId(makeKey());
        return Object.freeze({ clientUploadId, name: file.name, size: file.size, phase: "selected" as const, attachment: null, expiresAt: null, error: null });
      });
      if (new Set([...items, ...entries].map((entry) => entry.clientUploadId)).size !== items.length + entries.length) return unavailable();
      for (let index = 0; index < entries.length; index++) files.set(entries[index].clientUploadId, validated[index]);
      items = Object.freeze([...items, ...entries]);
    },
    beginUpload(key: string) {
      const entry = find(key); const file = files.get(key);
      if (!["selected", "upload_failed", "upload_unknown"].includes(entry.phase) || !file) return unavailable();
      replace(key, { phase: "uploading", error: null }); return Object.freeze({ clientUploadId: key, file });
    },
    uploaded(key: string, value: UploadReceipt) {
      if (find(key).phase !== "uploading" || value.client_upload_id !== key) return unavailable();
      replace(key, { phase: "ready", attachment: value.attachment, expiresAt: value.expires_at, error: null }); files.delete(key);
    },
    beginCancel(key: string) {
      const entry = find(key);
      if (!["ready", "cancel_failed", "cancel_unknown"].includes(entry.phase) || !entry.attachment) return unavailable();
      replace(key, { phase: "cancelling", error: null }); return Object.freeze({ attachmentId: entry.attachment.id });
    },
    failed(key: string, error: ChatApiError) {
      const entry = find(key);
      if (entry.phase !== "uploading" && entry.phase !== "cancelling") return;
      replace(key, { phase: entry.phase === "uploading" ? unknown(error) ? "upload_unknown" : "upload_failed" : unknown(error) ? "cancel_unknown" : "cancel_failed", error });
    },
    remove(key: string) { find(key); files.delete(key); items = Object.freeze(items.filter((entry) => entry.clientUploadId !== key)); },
    readyIds() {
      if (items.some((entry) => entry.phase !== "ready" || !entry.attachment)) return unavailable();
      return Object.freeze(items.map((entry) => entry.attachment!.id));
    },
    reset() { files.clear(); items = Object.freeze([]); },
  });
}
