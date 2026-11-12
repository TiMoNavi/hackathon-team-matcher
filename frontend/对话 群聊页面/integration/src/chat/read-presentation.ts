import type { ConversationSummary, MessageSummary } from "./contracts.js";
import type { ChatApiError } from "./http.js";

export function conversationTitle(value: ConversationSummary | undefined): string { return value?.title?.trim() || "私聊会话"; }
export function messagePreview(value: MessageSummary | null): string {
  if (!value) return "暂无消息";
  if (value.kind === "attachment") return "附件消息";
  return value.kind === "deleted" ? "此消息已删除" : value.kind === "system" ? `系统消息：${value.body}` : value.body;
}
export function messageAuthor(value: MessageSummary, actorId: number | null): string {
  if (value.kind === "deleted") return "已删除的消息";
  if (value.kind === "system") return "系统消息";
  if (value.sender.status === "unavailable") return "发送者信息未提供";
  return value.sender.user_id === actorId ? "你" : value.sender.display_name;
}
export function errorMessage(error: ChatApiError, scope: "list" | "conversation" = "conversation"): string {
  if (error.status === 401) return "登录已失效，请重新登录后打开聊天。";
  if ([403, 404].includes(error.status)) return scope === "list" ? "会话列表暂不可访问，请重新读取或返回首页。" : "此会话暂不可访问，可能已不存在或访问资格已改变。";
  if (["AUTHORIZATION_CHANGED", "CURSOR_CONTEXT_CHANGED", "CONTEXT_CHANGED"].includes(error.code)) return "访问范围已改变，旧内容已清除。请重新读取。";
  if (error.status === 410) return "这次分页已过期，请重新读取会话。";
  if (error.status === 429) return "请求较多，请稍后手动重试。";
  if (error.status === 400) return "页面校验已失效，请刷新后继续。";
  if (error.status === 503) return "聊天读取暂不可用，请稍后手动重试，或返回首页。";
  return "读取失败，请检查连接后重试。当前没有自动重试。";
}
export function shortTimestamp(utc: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(utc));
}
export type ViewRect = Readonly<{ top: number; bottom: number; left: number; right: number }>;
export function intersectViewRects(rectangles: readonly ViewRect[]): ViewRect | null {
  if (rectangles.length === 0 || rectangles.some((rect) => Object.values(rect).some((value) => !Number.isFinite(value)))) return null;
  const result = { top: Math.max(...rectangles.map((rect) => rect.top)), bottom: Math.min(...rectangles.map((rect) => rect.bottom)),
    left: Math.max(...rectangles.map((rect) => rect.left)), right: Math.min(...rectangles.map((rect) => rect.right)) };
  return result.bottom > result.top && result.right > result.left ? result : null;
}
export function visibleReadSeq(markers: readonly { seq: number; rect: ViewRect }[], viewport: ViewRect, visible: boolean, focused: boolean): number | null {
  if (!visible || !focused || viewport.bottom <= viewport.top || viewport.right <= viewport.left) return null;
  let latest: number | null = null;
  for (const marker of markers) {
    if (!Number.isSafeInteger(marker.seq) || marker.seq < 1) continue;
    if (marker.rect.bottom > marker.rect.top && marker.rect.top >= viewport.top && marker.rect.bottom <= viewport.bottom
      && marker.rect.left >= viewport.left && marker.rect.right <= viewport.right) latest = Math.max(latest ?? 0, marker.seq);
  }
  return latest;
}
