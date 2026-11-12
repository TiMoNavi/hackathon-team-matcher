import { validateMessageBody } from "./send-input.js";

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MAX_FILES = 3;
export const ATTACHMENT_MIME_TYPES = Object.freeze(["image/jpeg", "image/png", "application/pdf", "text/plain"] as const);
export type AttachmentMime = typeof ATTACHMENT_MIME_TYPES[number];
export class AttachmentInputError extends Error {
  readonly code: "INVALID_ATTACHMENT_ID" | "INVALID_ATTACHMENT_IDS" | "INVALID_ATTACHMENT_FILE";
  constructor(code: AttachmentInputError["code"], message = "附件需为 JPEG、PNG、PDF 或 TXT，单件不超过 5 MiB，每条最多三件。") {
    super(message); this.name = "AttachmentInputError"; this.code = code;
  }
}
export function validateAttachmentId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new AttachmentInputError("INVALID_ATTACHMENT_ID", "附件标识无效，请重新打开会话。");
  return value;
}
export function validateAttachmentIds(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > ATTACHMENT_MAX_FILES) throw new AttachmentInputError("INVALID_ATTACHMENT_IDS");
  const ids = value.map(validateAttachmentId);
  if (new Set(ids).size !== ids.length) throw new AttachmentInputError("INVALID_ATTACHMENT_IDS");
  return Object.freeze(ids);
}
/** Only an exactly empty body is accepted for an attachment-only message. */
export function validateSendBody(value: unknown, attachmentIds: readonly string[] = []): string {
  if (value === "" && validateAttachmentIds(attachmentIds).length > 0) return "";
  return validateMessageBody(value);
}
export function validAttachmentName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value !== "." && value !== ".."
    && value.trim().length > 0 && new TextEncoder().encode(value).length <= 180 && !/[\p{Cc}\p{Cf}\p{Cs}\\/]/u.test(value);
}
/** Browser MIME is advisory; the server independently inspects the bytes. */
export function validateUploadFile(value: unknown): File {
  if (!(value instanceof File) || value.size < 1 || value.size > ATTACHMENT_MAX_BYTES || !validAttachmentName(value.name)
    || !/[.](?:jpe?g|png|pdf|txt)$/i.test(value.name)) throw new AttachmentInputError("INVALID_ATTACHMENT_FILE");
  return value;
}
