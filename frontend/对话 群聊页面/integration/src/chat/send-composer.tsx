import { useRef, useState } from "react";
import { Paperclip, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReadController, ReadPageSnapshot } from "./read-controller.js";
import { isSendKey, MessageInputError, validateMessageBody } from "./send-input.js";

export function SendComposer({ controller, snapshot, notice }: { controller: ReadController; snapshot: ReadPageSnapshot; notice: string }) {
  const { draft, chat, status } = snapshot; const selected = chat.active;
  const composing = useRef(false); const [localError, setLocalError] = useState("");
  const permitted = status === "ready" && selected?.phase === "ready" && selected.context?.type === "direct" && selected.context.permissions.send;
  const busy = selected?.operation !== null && selected?.operation !== undefined;
  const canEdit = permitted && !busy && ["idle", "sent"].includes(draft.phase);
  const failed = draft.phase === "failed" || draft.phase === "outcome_unknown";
  const canRetry = permitted && !busy && failed && !["IDEMPOTENCY_CONFLICT", "INVALID_MESSAGE_BODY", "INVALID_CLIENT_MESSAGE_ID", "CSRF_INVALID"].includes(draft.error?.code ?? "") && draft.error?.status !== 400;
  const send = (retry = false) => {
    if (composing.current || !permitted || busy) return;
    setLocalError("");
    if (!retry) { try { validateMessageBody(draft.body); } catch (error) { setLocalError(error instanceof MessageInputError ? error.message : "请检查消息内容。"); return; } }
    void (retry ? controller.retryDraft() : controller.submitDraft()).catch(() => setLocalError("当前无法发送，请等待读取完成或重新打开会话。"));
  };
  const failureText = draft.phase === "outcome_unknown" ? "发送结果待确认，消息可能已保存。请使用原消息重试；不会自动重发。"
    : draft.error?.code === "IDEMPOTENCY_CONFLICT" ? "消息标识冲突。请重新编辑后作为新消息发送。"
    : draft.error?.status === 429 ? "发送较频繁，请稍后手动重试。原消息与标识已保留。"
    : draft.error?.status === 400 ? "页面校验已失效，请刷新后继续；当前消息没有标记为已发送。"
    : draft.error?.code === "CHAT_SEND_UNAVAILABLE" ? "发送暂不可用。原消息已保留，可稍后手动重试。"
    : "消息未发送，请检查内容或稍后手动重试。";
  return <div className="composer-area chat-shell-composer">
    <div className="message-composer" aria-describedby="chat-read-write-notice">
      <label className="sr-only" htmlFor="chat-read-draft">{permitted ? "消息内容" : "消息输入，当前不可发送"}</label>
      <textarea id="chat-read-draft" rows={2} disabled={!canEdit} value={draft.body}
        aria-invalid={Boolean(localError)} aria-describedby={localError ? "chat-send-error chat-read-write-notice" : "chat-read-write-notice"}
        placeholder={permitted ? "写下想说的话…" : "当前会话暂不支持发送文字"}
        onChange={(event) => { setLocalError(""); try { controller.editDraft(event.target.value); } catch { setLocalError("当前无法编辑，请等待读取完成。"); } }}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={(event) => { if (isSendKey({ key: event.key, shiftKey: event.shiftKey, altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey,
          isComposing: event.nativeEvent.isComposing, keyCode: event.nativeEvent.keyCode }, composing.current)) { event.preventDefault(); send(); } }} />
      <div className="composer-toolbar"><button type="button" className="icon-button" disabled aria-label="添加附件，尚未开放"><Paperclip aria-hidden="true" /></button>
        <span className="keyboard-hint">{permitted ? "Enter 发送 · Shift+Enter 换行" : "发送暂不可用 · 附件尚未开放"}</span>
        <Button className="send-button" disabled={!canEdit || !draft.body || draft.phase === "sending"} onClick={() => send()}>{draft.phase === "sending" ? "发送中…" : "发送"}<Send aria-hidden="true" /></Button>
      </div>
    </div>
    <p className="demo-footnote" id="chat-read-write-notice">{permitted ? "仅点击发送或确认输入后按 Enter 才发送；附件与群聊尚未开放。" : "当前仅可读取获准私聊；发送资格由服务端确认，附件与群聊尚未开放。"}</p>
    {draft.body && <p className="chat-send-count" aria-label="消息字符数">{Array.from(draft.body).length} / 4000</p>}
    {draft.phase === "sending" && <p className="chat-read-inline-status" role="status">正在发送，请勿重复提交。</p>}
    {draft.phase === "sent" && <p className="chat-read-inline-status" role="status">已发送。此状态不代表对方已收到或已读。</p>}
    {failed && <div className="chat-send-status" role="alert"><p>{failureText}</p><div className="chat-send-actions">
      <Button variant="outline" disabled={!canRetry} onClick={() => send(true)}>重试原消息</Button>
      <Button variant="outline" disabled={!permitted || busy} onClick={() => { setLocalError(""); controller.editFailedDraft(); }}>放弃重试并编辑</Button>
    </div>{draft.phase === "outcome_unknown" && <p>放弃重试后再发送会使用新标识，可能形成另一条消息。</p>}</div>}
    {localError && <p id="chat-send-error" className="chat-read-inline-status" role="alert">{localError}</p>}
    {notice && <p className="chat-read-inline-status" role="status">{notice}</p>}
  </div>;
}
