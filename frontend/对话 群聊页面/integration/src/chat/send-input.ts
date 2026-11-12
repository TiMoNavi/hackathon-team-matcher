/** Pure C05-A text rules. Validation never trims or normalizes payload bytes. */
export class MessageInputError extends Error {
  readonly code: "INVALID_MESSAGE_BODY" | "INVALID_CLIENT_MESSAGE_ID";
  constructor(code: MessageInputError["code"]) { super(code === "INVALID_MESSAGE_BODY" ? "消息需为 1–4000 个字符，且不能只有空白或包含控制字符。" : "无法建立消息标识，请刷新后重试。"); this.name = "MessageInputError"; this.code = code; }
}
export function validateMessageBody(value: unknown): string {
  if (typeof value !== "string") throw new MessageInputError("INVALID_MESSAGE_BODY");
  const codepoints = Array.from(value);
  if (codepoints.length < 1 || codepoints.length > 4000 || /^[\p{White_Space}\p{Z}]*$/u.test(value)
    || codepoints.some((point) => { const code = point.codePointAt(0)!; return code >= 0xd800 && code <= 0xdfff
      || (code <= 0x1f || code >= 0x7f && code <= 0x9f) && ![9, 10, 13].includes(code); })) throw new MessageInputError("INVALID_MESSAGE_BODY");
  return value;
}
export function validateClientMessageId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new MessageInputError("INVALID_CLIENT_MESSAGE_ID");
  return value;
}
export function createClientMessageId(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") throw new MessageInputError("INVALID_CLIENT_MESSAGE_ID");
  return validateClientMessageId(globalThis.crypto.randomUUID());
}

/** Enter submits only a completed IME composition; Shift+Enter keeps a newline. */
export function isSendKey(event: Readonly<{ key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean; isComposing?: boolean; keyCode?: number }>, composing: boolean): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
    && !composing && event.isComposing !== true && event.keyCode !== 229;
}
