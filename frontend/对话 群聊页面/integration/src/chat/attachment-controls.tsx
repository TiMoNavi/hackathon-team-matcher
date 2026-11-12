import { Download, FileText, LoaderCircle, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Attachment, Message } from "./contracts.js";
import type { AttachmentSelection } from "./attachment-draft.js";
import type { ReadController, ReadPageSnapshot } from "./read-controller.js";
import { shortTimestamp } from "./read-presentation.js";

export function attachmentSize(bytes: number): string { return bytes < 1024 ? bytes + " B" : (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + " KiB"; }
function phaseLabel(entry: AttachmentSelection): string {
  if (entry.phase === "selected") return "已选择，尚未上传";
  if (entry.phase === "uploading") return "正在上传，请稍候。";
  if (entry.phase === "ready") return "已上传，尚未发送" + (entry.expiresAt ? " · 暂存至 " + shortTimestamp(entry.expiresAt) : "");
  if (entry.phase === "cancelling") return "正在取消附件…";
  if (entry.phase === "upload_unknown") return "上传结果待确认；原文件与标识已保留。重试会确认同一次上传。";
  if (entry.phase === "cancel_unknown") return "取消结果待确认；请重试取消原附件，当前不会发送该附件。";
  if (entry.error?.code === "ATTACHMENT_ALREADY_BOUND") return "此附件已绑定消息，不能取消。请重新读取会话确认。";
  if (entry.error?.status === 410) return "暂存已过期，原上传标识不能复用。可移除后重新选择文件。";
  if (entry.error?.status === 413) return "文件超过服务端允许大小，请移除后选择较小文件。";
  if ([415, 422].includes(entry.error?.status ?? 0) || entry.error?.code === "INVALID_ATTACHMENT_FILE") return "文件内容、名称或格式未通过检查，请移除后重新选择。";
  if (entry.error?.status === 429) return "请求过多或暂存数量达到上限，请稍后重试或先取消已有暂存。";
  return entry.phase === "cancel_failed" ? "取消未完成，请检查连接后重试取消原附件。" : "上传未完成，请检查文件后手动重试。";
}
export function AttachmentDraftList({ controller, snapshot, onError }: { controller: ReadController; snapshot: ReadPageSnapshot; onError: (message: string) => void }) {
  const { attachments, chat, draft } = snapshot; const busy = chat.active?.operation !== null;
  const editable = snapshot.status === "ready" && chat.active?.context?.attachments?.upload_enabled === true
    && chat.active.context.permissions.send && ["idle", "sent"].includes(draft.phase);
  const run = (operation: () => Promise<unknown> | void) => { onError(""); try { void Promise.resolve(operation()).catch(() => onError("当前附件操作暂不可用，请稍后手动重试。")); } catch { onError("当前附件操作暂不可用，请稍后手动重试。"); } };
  if (!attachments.length) return null;
  return <ul className="chat-attachment-drafts" aria-label="待发送附件">{attachments.map((entry) => {
    const uploading = entry.phase === "uploading"; const cancelling = entry.phase === "cancelling";
    const uploadRetry = ["upload_failed", "upload_unknown"].includes(entry.phase);
    const cancelRetry = ["cancel_failed", "cancel_unknown"].includes(entry.phase);
    return <li key={entry.clientUploadId} data-upload-key={entry.clientUploadId} data-upload-state={entry.phase} className="chat-attachment-card">
      <FileText aria-hidden="true" /><div className="chat-attachment-copy"><strong>{entry.name}</strong><span>{attachmentSize(entry.size)}</span>
        <p role={entry.error ? "alert" : "status"}>{phaseLabel(entry)}</p>
        {entry.phase === "upload_unknown" && <p>放弃本地重试不会取消可能已存在的服务端暂存；未发送附件将在 24 小时后失效。</p>}
      </div><div className="chat-attachment-actions">
        {(entry.phase === "selected" || uploadRetry) && <Button variant="outline" disabled={!editable || busy || [400, 409, 410, 413, 415, 422].includes(entry.error?.status ?? 0)}
          aria-label={(uploadRetry ? "重试上传 " : "上传附件 ") + entry.name} onClick={() => run(() => controller.uploadAttachment(entry.clientUploadId))}><Upload aria-hidden="true" />{uploadRetry ? "重试上传" : "上传"}</Button>}
        {uploading && <Button variant="outline" disabled={!editable} aria-label={"停止上传 " + entry.name} onClick={() => run(() => controller.cancelAttachment(entry.clientUploadId))}><X aria-hidden="true" />停止传输</Button>}
        {(entry.phase === "ready" || cancelRetry) && <Button variant="outline" disabled={!editable || busy || entry.error?.code === "ATTACHMENT_ALREADY_BOUND"}
          aria-label={(cancelRetry ? "重试取消 " : "取消附件 ") + entry.name} onClick={() => run(() => controller.cancelAttachment(entry.clientUploadId))}><X aria-hidden="true" />{cancelRetry ? "重试取消" : "取消附件"}</Button>}
        {(entry.phase === "selected" || uploadRetry || entry.error?.code === "ATTACHMENT_ALREADY_BOUND") && <Button variant="ghost" disabled={!editable || busy}
          aria-label={(entry.phase === "upload_unknown" ? "放弃上传重试 " : "移除附件 ") + entry.name} onClick={() => run(() => controller.discardAttachment(entry.clientUploadId))}>{entry.phase === "upload_unknown" ? "放弃本地重试" : "移除"}</Button>}
        {cancelling && <span className="chat-attachment-pending"><LoaderCircle aria-hidden="true" />取消中</span>}
      </div>
    </li>;
  })}</ul>;
}

export function MessageAttachments({ message, controller, snapshot }: { message: Message; controller: ReadController; snapshot: ReadPageSnapshot }) {
  if (!message.attachments.length) return null;
  const permitted = snapshot.status === "ready" && snapshot.chat.active?.context?.attachments?.download_enabled === true;
  const busy = snapshot.chat.active?.operation !== null;
  return <ul className="chat-message-attachments" aria-label="消息附件">{message.attachments.map((attachment: Attachment) => <li key={attachment.id} data-attachment-id={attachment.id} className="chat-attachment-card">
    <FileText aria-hidden="true" /><div className="chat-attachment-copy"><strong>{attachment.name}</strong><span>{attachmentSize(attachment.size)}</span></div>
    <Button variant="outline" disabled={!permitted || busy} aria-label={"下载附件 " + attachment.name} onClick={() => { void controller.downloadAttachment(attachment.id).catch(() => { /* Controller retains the visible failure state. */ }); }}><Download aria-hidden="true" />下载附件</Button>
  </li>)}</ul>;
}

export function AttachmentDownload({ controller, snapshot }: { controller: ReadController; snapshot: ReadPageSnapshot }) {
  const { download } = snapshot; if (download.phase === "idle") return null;
  return <div className="chat-attachment-download" role={download.phase === "failed" ? "alert" : "status"}>
    <div><strong>{download.name}</strong><p>{download.phase === "loading" ? "正在验证权限并读取附件…" : download.phase === "ready" ? "附件已获准读取，可保存到本机。" : "下载未完成。请使用消息中的下载按钮手动重试。"}</p></div>
    {download.phase === "ready" && download.url && download.name && <a className="chat-shell-primary-link" href={download.url} download={download.name} aria-label={"保存附件 " + download.name}
      onClick={() => { setTimeout(() => controller.clearDownload(), 0); }}>保存文件<Download aria-hidden="true" /></a>}
    {download.phase !== "loading" && <Button variant="ghost" onClick={() => controller.clearDownload()}>关闭下载</Button>}
  </div>;
}
