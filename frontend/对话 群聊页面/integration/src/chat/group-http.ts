import { parseErrorEnvelope, safeInteger } from "./contracts.js";
import { ChatApiError } from "./http.js";
import type { ChatApiConfig, ChatFetcher } from "./http.js";
import { groupActionCodec, parseGroupCommand, parseGroupReceipt } from "./group-contracts.js";
import type { GroupCommandBody, GroupEnvelope } from "./group-contracts.js";
import type { GroupAction } from "./group-action-state.js";

/** Actor expectation partitions client state; only the native session authenticates. */
export type GroupApiConfig = ChatApiConfig & Readonly<{ expectedActorId: number }>;
export type GroupRequestOptions = Readonly<{ signal?: AbortSignal }>;
export interface GroupApi {
  create(command: GroupCommandBody, options?: GroupRequestOptions): Promise<GroupEnvelope>;
  invite(conversationId: number, command: GroupCommandBody, options?: GroupRequestOptions): Promise<GroupEnvelope>;
  accept(invitationId: number, command: GroupCommandBody, options?: GroupRequestOptions): Promise<GroupEnvelope>;
  decline(invitationId: number, command: GroupCommandBody, options?: GroupRequestOptions): Promise<GroupEnvelope>;
  withdraw(invitationId: number, command: GroupCommandBody, options?: GroupRequestOptions): Promise<GroupEnvelope>;
  leave(conversationId: number, command: GroupCommandBody, options?: GroupRequestOptions): Promise<GroupEnvelope>;
  invitation(invitationId: number, options?: GroupRequestOptions): Promise<GroupEnvelope>;
  dispose(): void;
}
function invalid(): never { throw new ChatApiError(0, "INVALID_REQUEST", "Invalid group request."); }
function object(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return invalid();
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string" || !allowed.includes(key))) return invalid();
  return value as Record<string, unknown>;
}
function id(value: unknown): number { try { return safeInteger(value, 1); } catch { return invalid(); } }
function signal(value: GroupRequestOptions): AbortSignal | undefined {
  const input = object(value, ["signal"]);
  if (input.signal !== undefined && !(input.signal instanceof AbortSignal)) return invalid();
  return input.signal as AbortSignal | undefined;
}

/** Explicit session client. No construction I/O, implicit invitation or retry.
 * This lifecycle adapter does not extend direct message/history/file APIs. */
export function createGroupApi(config: GroupApiConfig): GroupApi {
  const input = object(config, ["apiBase", "csrfToken", "expectedActorId", "fetcher"]);
  if (input.apiBase !== "/api/v1" || typeof input.csrfToken !== "string" || !input.csrfToken || input.csrfToken.length > 4096
    || /[\r\n\0]/.test(input.csrfToken) || input.fetcher !== undefined && typeof input.fetcher !== "function") return invalid();
  const actorId = id(input.expectedActorId);
  let csrfToken = input.csrfToken;
  let disposed = false;
  const pending = new Set<AbortController>();
  const fetcher: ChatFetcher = config.fetcher ?? ((url, init) => globalThis.fetch(url, init));
  async function request(path: string, parse: (payload: unknown, status: number) => GroupEnvelope,
    callerSignal: AbortSignal | undefined, body?: GroupCommandBody): Promise<GroupEnvelope> {
    if (disposed) throw new ChatApiError(0, "CLIENT_DISPOSED", "Group client is no longer active.");
    const controller = new AbortController(); const cancel = () => controller.abort();
    callerSignal?.addEventListener("abort", cancel, { once: true });
    if (callerSignal?.aborted) controller.abort();
    pending.add(controller);
    const checkActive = () => { if (controller.signal.aborted || disposed) throw new ChatApiError(0, "REQUEST_ABORTED", "Group request was cancelled."); };
    try {
      checkActive();
      const headers: Record<string, string> = { Accept: "application/json", "X-Matcher-Chat-Actor": String(actorId) };
      if (body !== undefined) { headers["X-CSRF-Token"] = csrfToken; headers["Content-Type"] = "application/json"; }
      let response: Response;
      try {
        response = await fetcher("/api/v1/" + path, { method: body === undefined ? "GET" : "POST", headers,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }), credentials: "same-origin", redirect: "error", cache: "no-store", signal: controller.signal });
      } catch { checkActive(); throw new ChatApiError(0, "NETWORK_ERROR", "The group request could not be completed.", true); }
      // Observed same-session 401 reaches the state owner even if a transport
      // ignored abort. Account epochs there prevent harming a later login.
      if (response.status !== 401) checkActive();
      if (response.redirected || !/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) {
        throw new ChatApiError(response.status, "INVALID_RESPONSE", "The server returned an invalid group response.");
      }
      let payload: unknown;
      try { payload = await response.json(); }
      catch { if (response.status !== 401) checkActive(); throw new ChatApiError(response.status, "INVALID_RESPONSE", "The server returned an invalid group response."); }
      if (response.status !== 401) checkActive();
      if (!response.ok) {
        let failure;
        try { failure = parseErrorEnvelope(payload); }
        catch { throw new ChatApiError(response.status, "INVALID_RESPONSE", "The server returned an invalid group error."); }
        throw new ChatApiError(response.status, failure.error.code, failure.error.message, failure.error.retryable, failure.meta.request_id, failure.error.details);
      }
      if (!(body === undefined ? [200] : [200, 201]).includes(response.status)) throw new ChatApiError(response.status, "INVALID_RESPONSE", "The server returned an unexpected group status.");
      try { return parse(payload, response.status); }
      catch { throw new ChatApiError(response.status, "INVALID_RESPONSE", "The server returned an invalid group response."); }
    } finally { callerSignal?.removeEventListener("abort", cancel); pending.delete(controller); }
  }
  function mutate(action: GroupAction, targetId: number | null, value: GroupCommandBody, options: GroupRequestOptions): Promise<GroupEnvelope> {
    const callerSignal = signal(options);
    let command: GroupCommandBody;
    try { command = parseGroupCommand(action, value); } catch { return invalid(); }
    const { client_command_id, ...body } = command;
    const path = action === "create" ? "conversations/groups"
      : action === "invite" ? "conversations/" + targetId + "/invitations"
      : action === "leave" ? "conversations/" + targetId + "/leave"
      : "group-invitations/" + targetId + "/" + action;
    return request(path, (payload, status) => {
      const result = parseGroupReceipt(payload, actorId);
      if (result.data.replayed !== (status === 200)) return invalid();
      groupActionCodec.confirm(action, { targetId, body }, client_command_id, payload, actorId);
      return result;
    }, callerSignal, command);
  }
  return Object.freeze({
    create: (command: GroupCommandBody, options: GroupRequestOptions = {}) => mutate("create", null, command, options),
    invite: (target: number, command: GroupCommandBody, options: GroupRequestOptions = {}) => mutate("invite", id(target), command, options),
    accept: (target: number, command: GroupCommandBody, options: GroupRequestOptions = {}) => mutate("accept", id(target), command, options),
    decline: (target: number, command: GroupCommandBody, options: GroupRequestOptions = {}) => mutate("decline", id(target), command, options),
    withdraw: (target: number, command: GroupCommandBody, options: GroupRequestOptions = {}) => mutate("withdraw", id(target), command, options),
    leave: (target: number, command: GroupCommandBody, options: GroupRequestOptions = {}) => mutate("leave", id(target), command, options),
    invitation(target: number, options: GroupRequestOptions = {}) {
      const invitationId = id(target); const callerSignal = signal(options);
      return request("group-invitations/" + invitationId, (payload) => {
        const result = parseGroupReceipt(payload, actorId);
        if (result.data.invitation?.id !== invitationId || result.data.replayed) return invalid();
        return result;
      }, callerSignal);
    },
    dispose(): void { disposed = true; csrfToken = ""; for (const controller of pending) controller.abort(); pending.clear(); },
  });
}
