import { object, parseApiError, parseCurrentEvent, requestId, type Bootstrap, type CurrentEvent } from "./contracts.ts";
import { ApiFailure, getJson, type Fetcher } from "./http.ts";

export type MemberEvent = Readonly<{ space_id: number; name: string; membership_id: number; membership_role: "owner" | "admin" | "moderator" | "member" }>;
export type MemberEventPage = Readonly<{ items: readonly MemberEvent[]; next_cursor: string | null; has_more: boolean; limit: number }>;
export type InvitationReceipt = Readonly<{ receipt_id: string; invitation_id: string; space_id: number; membership_id: number; outcome: "joined" | "already_member"; consumed_use: boolean; created_at: string; membership_current: boolean }>;
export type EventSelection = { status: "unselected" } | { status: "selected"; value: CurrentEvent } | { status: "revoked"; selection_revision: string };
const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 2147483647;
const cursorIsValid = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 4096 && !/[\u0000-\u0020\u007f]/.test(value);
const roles = new Set(["owner", "admin", "moderator", "member"]);
export const invitationTokenIsValid = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);
export const createJoinKey = () => `join-${globalThis.crypto.randomUUID()}`;
// A historical receipt can reject only its own membership incarnation. The
// newest authorized list may contain a different, legitimately joined one.
export const receiptBlocksMembership = (receipt: InvitationReceipt | null, member: MemberEvent): boolean => Boolean(receipt && !receipt.membership_current && receipt.space_id === member.space_id && receipt.membership_id === member.membership_id);

export function parseMemberEvents(value: unknown): MemberEventPage {
  if (!object(value) || !Array.isArray(value.items) || !Number.isInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 48 || value.items.length > Number(value.limit) || typeof value.has_more !== "boolean" || !(value.next_cursor === null || cursorIsValid(value.next_cursor)) || value.has_more !== (value.next_cursor !== null) || value.has_more && value.items.length !== value.limit) throw new Error("Invalid event page.");
  const ids = new Set<number>();
  const items = value.items.map((row): MemberEvent => {
    if (!object(row) || !positiveId(row.space_id) || !positiveId(row.membership_id) || typeof row.name !== "string" || !row.name.trim() || typeof row.membership_role !== "string" || !roles.has(row.membership_role) || ids.has(row.space_id)) throw new Error("Invalid member event.");
    ids.add(row.space_id);
    return { space_id: row.space_id, name: row.name, membership_id: row.membership_id, membership_role: row.membership_role as MemberEvent["membership_role"] };
  });
  return { items, next_cursor: value.next_cursor, has_more: value.has_more, limit: Number(value.limit) };
}
export function parseInvitationReceipt(value: unknown): InvitationReceipt {
  if (!object(value) || typeof value.receipt_id !== "string" || !/^receipt-[a-f0-9]{32}$/.test(value.receipt_id) || typeof value.invitation_id !== "string" || !/^inv-[a-f0-9]{32}$/.test(value.invitation_id) || !positiveId(value.space_id) || !positiveId(value.membership_id) || value.outcome !== "joined" && value.outcome !== "already_member" || typeof value.consumed_use !== "boolean" || (value.outcome === "joined") !== value.consumed_use || typeof value.membership_current !== "boolean" || typeof value.created_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value.created_at) || !Number.isFinite(Date.parse(value.created_at)) || new Date(value.created_at).toISOString() !== value.created_at.replace("Z", ".000Z")) throw new Error("Invalid invitation receipt.");
  return { receipt_id: value.receipt_id, invitation_id: value.invitation_id, space_id: value.space_id, membership_id: value.membership_id, outcome: value.outcome as InvitationReceipt["outcome"], consumed_use: value.consumed_use, created_at: value.created_at, membership_current: value.membership_current };
}

/** Explicit commands only. Tokens stay in request bodies; no polling, storage or automatic retry. */
export class EventAccessClient {
  private pending = false;
  private readonly bootstrap: Bootstrap;
  private readonly fetcher: Fetcher;
  constructor(bootstrap: Bootstrap, fetcher: Fetcher = fetch) { this.bootstrap = bootstrap; this.fetcher = fetcher; }
  async events(signal: AbortSignal, cursor: string | null = null, limit = 24): Promise<MemberEventPage> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 48 || cursor !== null && !cursorIsValid(cursor)) throw new ApiFailure(0, "INVALID_PAGE");
    const page = await getJson(`${this.bootstrap.api_base}/me/events?limit=${limit}${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`, parseMemberEvents, signal, this.fetcher);
    if (page.data.limit !== limit) throw new ApiFailure(200, "INVALID_RESPONSE", false, page.meta.request_id);
    return page.data;
  }
  async current(signal: AbortSignal): Promise<EventSelection> {
    try { return { status: "selected", value: (await getJson(`${this.bootstrap.api_base}/me/current-event`, parseCurrentEvent, signal, this.fetcher)).data }; }
    catch (error) {
      if (error instanceof ApiFailure && error.status === 409 && error.code === "CURRENT_EVENT_REQUIRED") return { status: "unselected" };
      if (error instanceof ApiFailure && error.status === 403 && error.code === "CURRENT_EVENT_ACCESS_REVOKED" && object(error.details) && Object.keys(error.details).length === 1 && typeof error.details.selection_revision === "string" && /^selection-[a-f0-9]{32}$/.test(error.details.selection_revision)) return { status: "revoked", selection_revision: error.details.selection_revision };
      throw error;
    }
  }
  async receipt(id: string, signal: AbortSignal): Promise<InvitationReceipt> {
    if (!/^receipt-[a-f0-9]{32}$/.test(id)) throw new ApiFailure(0, "INVALID_ID");
    const value = (await getJson(`${this.bootstrap.api_base}/event-invitation-receipts/${id}`, parseInvitationReceipt, signal, this.fetcher)).data;
    if (value.receipt_id !== id) throw new ApiFailure(200, "INVALID_RESPONSE");
    return value;
  }
  async redeem(token: string, key: string, signal: AbortSignal): Promise<InvitationReceipt> {
    if (!invitationTokenIsValid(token)) throw new ApiFailure(0, "INVALID_INVITATION_TOKEN");
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new ApiFailure(0, "INVALID_IDEMPOTENCY_KEY");
    return this.mutate("POST", "/event-invitations/redeem", { token, confirmation_intent: "join" }, parseInvitationReceipt, signal, key);
  }
  async select(space: number, expectedRevision: string | null, signal: AbortSignal): Promise<CurrentEvent> {
    if (!positiveId(space) || !(expectedRevision === null || typeof expectedRevision === "string" && /^selection-[a-f0-9]{32}$/.test(expectedRevision))) throw new ApiFailure(0, "INVALID_SELECTION");
    return this.mutate("PUT", "/me/current-event", { space_id: space, expected_revision: expectedRevision }, (data) => { const selected = parseCurrentEvent(data); if (selected.space_id !== space) throw new Error("Mismatched selected event."); return selected; }, signal);
  }
  private async mutate<T>(method: "POST" | "PUT", path: "/event-invitations/redeem" | "/me/current-event", body: unknown, parse: (data: unknown) => T, signal: AbortSignal, key?: string): Promise<T> {
    if (this.pending) throw new ApiFailure(0, "CLIENT_REQUEST_PENDING");
    this.pending = true;
    try {
      let response: Response; const fetcher = this.fetcher;
      // Native browser fetch must not receive this client as its receiver.
      try { response = await fetcher(`${this.bootstrap.api_base}${path}`, { method, headers: { Accept: "application/json", "Content-Type": "application/json", [this.bootstrap.csrf_header]: this.bootstrap.csrf_token, ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body), credentials: "same-origin", cache: "no-store", redirect: "error", signal }); }
      catch (error) { if (signal.aborted) throw error; throw new ApiFailure(0, "NETWORK_ERROR", true); }
      if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(response.headers.get("content-type") || "")) throw new ApiFailure(response.status, "INVALID_RESPONSE");
      let payload: unknown; let id: string;
      try { payload = await response.json(); id = requestId(payload); } catch { throw new ApiFailure(response.status, "INVALID_RESPONSE"); }
      if (!object(payload)) throw new ApiFailure(response.status, "INVALID_RESPONSE", false, id);
      if (!response.ok) {
        let failure; try { failure = parseApiError(payload.error); } catch { throw new ApiFailure(response.status, "INVALID_RESPONSE", false, id); }
        throw new ApiFailure(response.status, failure.code, failure.retryable, id, failure.details);
      }
      if (response.status !== 200 || "error" in payload || !("data" in payload)) throw new ApiFailure(response.status, "INVALID_RESPONSE", false, id);
      try { return parse(payload.data); } catch { throw new ApiFailure(response.status, "INVALID_RESPONSE", false, id); }
    } finally { this.pending = false; }
  }
}

export type EventAccessState = Readonly<{ status: "idle" | "loading" | "ready" | "error" | "signed_out" | "forbidden"; items: readonly MemberEvent[]; nextCursor: string | null; selection: EventSelection | null; receipt: InvitationReceipt | null; operation: "more" | "join" | "select" | null; error: ApiFailure | null; joinUncertain: boolean }>;
const empty = (): EventAccessState => ({ status: "idle", items: [], nextCursor: null, selection: null, receipt: null, operation: null, error: null, joinUncertain: false });
const failureOf = (error: unknown) => error instanceof ApiFailure ? error : new ApiFailure(0, "NETWORK_ERROR", true);

/** One instance per authenticated identity; dispose it whenever that identity changes. */
export class EventAccessController {
  private state = empty();
  private listeners = new Set<() => void>();
  private controllers = new Set<AbortController>();
  private epoch = 0;
  private disposed = false;
  private pendingJoin: { token: string; key: string } | null = null;
  private readonly client: EventAccessClient;
  private readonly onAuthorityLost?: () => void;
  constructor(client: EventAccessClient, onAuthorityLost?: () => void) { this.client = client; this.onAuthorityLost = onAuthorityLost; }
  snapshot = (): EventAccessState => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private publish(state: EventAccessState) { this.state = state; this.listeners.forEach((listener) => listener()); }
  private active(epoch: number) { return !this.disposed && epoch === this.epoch; }
  private available() { return !this.disposed && !["signed_out", "forbidden"].includes(this.state.status); }
  private cancelReads() { this.controllers.forEach((controller) => controller.abort()); }
  dispose() { this.disposed = true; ++this.epoch; this.cancelReads(); this.pendingJoin = null; this.state = empty(); this.listeners.clear(); }
  private loseAuthority(error: ApiFailure) {
    // A late denial still revokes this actor's live scope; a disposed actor cannot affect its successor.
    if (!this.available() || ![401, 403].includes(error.status)) return;
    ++this.epoch; this.cancelReads(); this.pendingJoin = null;
    this.publish({ ...empty(), status: error.status === 401 ? "signed_out" : "forbidden", error });
    this.onAuthorityLost?.();
  }
  private async request<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController(); this.controllers.add(controller); let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    try {
      const result = await operation(controller.signal);
      if (controller.signal.aborted) throw new ApiFailure(0, timedOut ? "REQUEST_TIMEOUT" : "REQUEST_CANCELLED", timedOut);
      return result;
    } catch (error) {
      const received = failureOf(error); this.loseAuthority(received);
      // An authorization denial wins even when it arrives after the local timeout.
      throw timedOut && ![401, 403].includes(received.status) ? new ApiFailure(0, "REQUEST_TIMEOUT", true) : received;
    }
    finally { clearTimeout(timeout); this.controllers.delete(controller); }
  }
  async refresh(): Promise<void> {
    if (!this.available() || this.state.operation === "join" || this.state.operation === "select") return;
    const epoch = ++this.epoch; this.cancelReads();
    this.publish({ ...this.state, status: "loading", items: [], nextCursor: null, selection: null, error: null, operation: null });
    const results = await Promise.allSettled([this.request((signal) => this.client.events(signal)), this.request((signal) => this.client.current(signal))]);
    if (!this.active(epoch)) return;
    const [page, selection] = results;
    if (page.status === "rejected" || selection.status === "rejected") { const error = failureOf(page.status === "rejected" ? page.reason : selection.status === "rejected" ? selection.reason : undefined); this.publish({ ...this.state, status: "error", error }); return; }
    this.publish({ ...this.state, status: "ready", items: page.value.items, nextCursor: page.value.next_cursor, selection: selection.value, receipt: selection.value.status === "revoked" ? null : this.state.receipt });
  }
  async more(): Promise<void> {
    if (!this.available() || this.state.status !== "ready" || this.state.operation || !this.state.nextCursor) return;
    const epoch = this.epoch; const cursor = this.state.nextCursor;
    this.publish({ ...this.state, operation: "more", error: null });
    try {
      const page = await this.request((signal) => this.client.events(signal, cursor));
      if (!this.active(epoch)) return;
      const ids = new Set(this.state.items.map((item) => item.space_id));
      if (page.next_cursor === cursor || page.items.some((item) => ids.has(item.space_id))) throw new ApiFailure(200, "INVALID_RESPONSE");
      this.publish({ ...this.state, items: [...this.state.items, ...page.items], nextCursor: page.next_cursor, operation: null });
    } catch (error) { if (this.active(epoch)) this.publish({ ...this.state, operation: null, error: failureOf(error) }); }
  }
  async join(token: string, key = createJoinKey()): Promise<void> {
    if (!this.available() || this.state.status !== "ready" || this.state.operation || this.pendingJoin) return;
    this.pendingJoin = { token, key }; await this.performJoin();
  }
  async retryJoin(): Promise<void> {
    if (!this.available() || this.state.operation || !this.state.joinUncertain || !this.pendingJoin) return;
    await this.performJoin();
  }
  private async performJoin(): Promise<void> {
    if (!this.pendingJoin) return;
    const epoch = this.epoch; const { token, key } = this.pendingJoin;
    this.publish({ ...this.state, operation: "join", receipt: null, error: null, joinUncertain: false });
    try {
      const receipt = await this.request((signal) => this.client.redeem(token, key, signal));
      if (!this.active(epoch)) return;
      this.pendingJoin = null;
      this.publish({ ...this.state, operation: null, receipt });
      // Refresh memberships only. Joining never selects an activity.
      await this.refresh();
    } catch (error) {
      if (!this.active(epoch)) return;
      const failure = failureOf(error);
      const uncertain = failure.status === 0 && ["NETWORK_ERROR", "REQUEST_TIMEOUT", "REQUEST_CANCELLED"].includes(failure.code) || failure.code === "INVALID_RESPONSE" || failure.status >= 500;
      if (!uncertain) this.pendingJoin = null;
      this.publish({ ...this.state, operation: null, error: failure, joinUncertain: uncertain });
    }
  }
  async select(space: number): Promise<boolean> {
    const member = this.state.items.find((item) => item.space_id === space);
    if (!this.available() || this.state.status !== "ready" || this.state.operation || this.state.joinUncertain || !this.state.selection || !member || receiptBlocksMembership(this.state.receipt, member)) return false;
    const revision = this.state.selection.status === "selected" ? this.state.selection.value.selection_revision : this.state.selection.status === "revoked" ? this.state.selection.selection_revision : null;
    const epoch = this.epoch;
    this.publish({ ...this.state, operation: "select", error: null });
    try {
      const selected = await this.request((signal) => this.client.select(space, revision, signal));
      if (!this.active(epoch)) return false;
      this.publish({ ...this.state, operation: null, selection: { status: "selected", value: selected } }); return true;
    } catch (error) {
      if (this.active(epoch)) this.publish({ ...this.state, status: "error", operation: null, selection: null, error: failureOf(error) });
      return false;
    }
  }
}

export function eventAccessFeedback(error: ApiFailure | null): string {
  if (!error) return "";
  if (error.status === 401) return "登录状态已失效，请重新登录。";
  if (error.status === 403) return "活动访问资格已变化，请重新确认账号与活动。";
  const messages: Record<string, string> = {
    INVALID_INVITATION_TOKEN: "请填写完整的 43 位邀请码。", INVITATION_UNAVAILABLE: "邀请码无效、已过期、已撤销或名额已用完，请联系活动组织者。",
    IDEMPOTENCY_CONFLICT: "这次请求记录与提交内容不一致，请重新读取状态。", RATE_LIMITED: "操作过于频繁，请稍后再试。",
    CURRENT_EVENT_REQUIRED: "请先选择当前活动。", CONTEXT_CHANGED: "活动状态已变化，请重新读取后再选择。",
    NETWORK_ERROR: "连接中断，请检查网络。", REQUEST_TIMEOUT: "请求超时，请重新确认状态。", INVALID_RESPONSE: "暂时无法确认服务响应，请重新读取。",
  };
  return Object.hasOwn(messages, error.code) ? messages[error.code] : error.status === 409 ? "活动状态发生冲突，请重新读取后再操作。" : "暂时无法完成操作，请稍后重新读取。";
}
