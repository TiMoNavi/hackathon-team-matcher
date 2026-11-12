import { ChatApiError } from "./http.js";
import { createClientMessageId, validateClientMessageId, validateMessageBody } from "./send-input.js";

export type SendDraftSnapshot = Readonly<{
  body: string; phase: "idle" | "sending" | "sent" | "failed" | "outcome_unknown";
  clientMessageId: string | null; error: ChatApiError | null; messageId: number | null;
}>;
const empty = (): SendDraftSnapshot => Object.freeze({ body: "", phase: "idle", clientMessageId: null, error: null, messageId: null });
function invalid(): never { throw new ChatApiError(0, "SEND_NOT_READY", "当前无法发送，请等待读取完成。"); }

/** One volatile attempt. There is no timer, request, storage or automatic retry. */
export function createSendDraft(makeKey: () => string = createClientMessageId) {
  let current = empty();
  return Object.freeze({
    snapshot: () => current,
    edit(body: string) {
      if (current.phase !== "idle" && current.phase !== "sent" || typeof body !== "string") return invalid();
      current = Object.freeze({ ...empty(), body });
    },
    begin(retry: boolean) {
      if (retry ? !["failed", "outcome_unknown"].includes(current.phase) || current.clientMessageId === null
        : current.phase !== "idle") return invalid();
      const body = validateMessageBody(current.body);
      const clientMessageId = retry ? current.clientMessageId! : validateClientMessageId(makeKey());
      current = Object.freeze({ body, clientMessageId, phase: "sending", error: null, messageId: null });
      return Object.freeze({ body, clientMessageId });
    },
    fail(error: ChatApiError) {
      if (current.phase !== "sending") return;
      const unknown = error.status === 0 || error.code === "INVALID_RESPONSE" || error.status >= 500 && error.code !== "CHAT_SEND_UNAVAILABLE";
      current = Object.freeze({ ...current, phase: unknown ? "outcome_unknown" : "failed", error });
    },
    succeed(messageId: number) {
      if (current.phase !== "sending" || !Number.isSafeInteger(messageId) || messageId < 1) return invalid();
      current = Object.freeze({ ...empty(), phase: "sent", messageId });
    },
    editAgain() {
      if (!["failed", "outcome_unknown"].includes(current.phase)) return invalid();
      current = Object.freeze({ ...empty(), body: current.body });
    },
    reset() { current = empty(); },
  });
}
