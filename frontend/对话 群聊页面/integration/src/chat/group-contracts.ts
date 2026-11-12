import { validateClientMessageId } from "./send-input.js";
import type { GroupAction, GroupActionCodec, GroupRefreshIntent } from "./group-action-state.js";

/** C07-P v1 pure contracts coordinated with the backend on 2026-11-13.
 * No route, HTTP success status, capability or public client is registered here. */
export type Group = Readonly<{ conversation_id: number; type: "group"; title: string; owner_id: number; version: number; active_member_count: number }>;
export type GroupInvitationStatus = "pending" | "accepted" | "declined" | "withdrawn" | "expired";
export type GroupInvitation = Readonly<{
  id: number; conversation_id: number; inviter_id: number; invitee_id: number; status: GroupInvitationStatus; version: number;
  created_at: string; expires_at: string; resolved_at: string | null;
}>;
export type GroupMembership = Readonly<{ conversation_id: number; user_id: number; generation: number; join_seq: number; status: "active" | "left"; version: number }>;
export type GroupReceipt = Readonly<{ group: Group | null; invitation: GroupInvitation | null; membership: GroupMembership | null; replayed: boolean }>;
export type GroupEnvelope = Readonly<{ data: GroupReceipt; meta: Readonly<{ request_id: string }> }>;
export type GroupCommandBody = Readonly<{ client_command_id: string; confirmation_intent: string; title?: string; target_user_id?: number; expected_version?: number }>;
/** A local form descriptor. targetId belongs to a future adapter's route,
 * and is never copied into the strict backend command body. */
export type GroupActionInput = Readonly<{ targetId: number | null; body: Readonly<{ confirmation_intent: string; title?: string; target_user_id?: number; expected_version?: number }> }>;
export class GroupContractError extends Error {
  readonly code = "INVALID_GROUP_CONTRACT";
  constructor() { super("Invalid group command or response."); this.name = "GroupContractError"; }
}
const intents: Readonly<Record<GroupAction, string>> = Object.freeze({ create: "create_group", invite: "invite_to_group", accept: "accept_group_invitation",
  decline: "decline_group_invitation", withdraw: "withdraw_group_invitation", leave: "leave_group" });
function invalid(): never { throw new GroupContractError(); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return invalid();
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const object = record(value);
  if (Reflect.ownKeys(object).length !== keys.length || keys.some((key) => !Object.hasOwn(object, key))) return invalid();
  return object;
}
function integer(value: unknown, minimum = 1): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) return invalid(); return value; }
function boolean(value: unknown): boolean { if (typeof value !== "boolean") return invalid(); return value; }
function actionValue(action: GroupAction): void { if (!Object.hasOwn(intents, action)) return invalid(); }
function commandKey(value: unknown): string { try { return validateClientMessageId(value); } catch { return invalid(); } }
export function validateGroupTitle(value: unknown): string {
  if (typeof value !== "string") return invalid();
  const points = Array.from(value);
  if (points.length < 1 || points.length > 100 || new TextEncoder().encode(value).length > 400
    || /^[\p{White_Space}\p{Z}]*$/u.test(value) || points.some((point) => { const code = point.codePointAt(0)!;
      return code <= 0x1f || code >= 0x7f && code <= 0x9f || code >= 0xd800 && code <= 0xdfff; })) return invalid();
  return value;
}
function utc(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return invalid();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== value.slice(0, 19)) return invalid();
  return value;
}
export function parseGroup(value: unknown): Group {
  const object = exact(value, ["conversation_id", "type", "title", "owner_id", "version", "active_member_count"]);
  if (object.type !== "group") return invalid();
  return Object.freeze({ conversation_id: integer(object.conversation_id), type: "group", title: validateGroupTitle(object.title), owner_id: integer(object.owner_id),
    version: integer(object.version), active_member_count: integer(object.active_member_count) });
}
export function parseGroupInvitation(value: unknown): GroupInvitation {
  const object = exact(value, ["id", "conversation_id", "inviter_id", "invitee_id", "status", "version", "created_at", "expires_at", "resolved_at"]);
  const inviter = integer(object.inviter_id); const invitee = integer(object.invitee_id);
  if (inviter === invitee || !["pending", "accepted", "declined", "withdrawn", "expired"].includes(object.status as string)) return invalid();
  const created = utc(object.created_at); const expires = utc(object.expires_at); const resolved = object.resolved_at === null ? null : utc(object.resolved_at);
  if (Date.parse(expires) <= Date.parse(created) || (object.status === "pending") !== (resolved === null)
    || resolved !== null && (Date.parse(resolved) < Date.parse(created)
      || (object.status === "expired" ? Date.parse(resolved) < Date.parse(expires) : Date.parse(resolved) >= Date.parse(expires)))) return invalid();
  return Object.freeze({ id: integer(object.id), conversation_id: integer(object.conversation_id), inviter_id: inviter, invitee_id: invitee,
    status: object.status as GroupInvitationStatus, version: integer(object.version), created_at: created, expires_at: expires, resolved_at: resolved });
}
export function parseGroupMembership(value: unknown): GroupMembership {
  const object = exact(value, ["conversation_id", "user_id", "generation", "join_seq", "status", "version"]);
  if (object.status !== "active" && object.status !== "left") return invalid();
  return Object.freeze({ conversation_id: integer(object.conversation_id), user_id: integer(object.user_id), generation: integer(object.generation),
    join_seq: integer(object.join_seq, 0), status: object.status, version: integer(object.version) });
}
/** Membership is the actor's current projection. An invitation's terminal
 * status is history, never a message read/send capability. */
export function parseGroupReceipt(value: unknown, actorId: number): GroupEnvelope {
  integer(actorId);
  const envelope = exact(value, ["data", "meta"]); const object = exact(envelope.data, ["group", "invitation", "membership", "replayed"]);
  const meta = exact(envelope.meta, ["request_id"]);
  if (typeof meta.request_id !== "string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(meta.request_id)) return invalid();
  const group = object.group === null ? null : parseGroup(object.group);
  const invitation = object.invitation === null ? null : parseGroupInvitation(object.invitation);
  const membership = object.membership === null ? null : parseGroupMembership(object.membership);
  if (group === null && invitation === null && membership === null) return invalid();
  const ids = [group?.conversation_id, invitation?.conversation_id, membership?.conversation_id].filter((id) => id !== undefined);
  if (new Set(ids).size !== 1 || membership !== null && membership.user_id !== actorId
    || (group !== null) !== (membership?.status === "active")
    || group !== null && group.owner_id !== actorId && group.active_member_count < 2
    || group !== null && invitation !== null && group.owner_id !== invitation.inviter_id
    || invitation !== null && invitation.inviter_id !== actorId && invitation.invitee_id !== actorId
    || invitation?.status === "pending" && invitation.invitee_id === actorId && membership?.status === "active") return invalid();
  return Object.freeze({ data: Object.freeze({ group, invitation, membership, replayed: boolean(object.replayed) }), meta: Object.freeze({ request_id: meta.request_id }) });
}
/** Strict backend body only. Target path IDs and actor IDs are not body fields. */
export function parseGroupCommand(action: GroupAction, value: unknown): GroupCommandBody {
  actionValue(action);
  const field = action === "create" ? "title" : action === "invite" ? "target_user_id" : "expected_version";
  const object = exact(value, ["client_command_id", "confirmation_intent", field]);
  if (object.confirmation_intent !== intents[action]) return invalid();
  return Object.freeze({ client_command_id: commandKey(object.client_command_id), confirmation_intent: intents[action],
    ...(action === "create" ? { title: validateGroupTitle(object.title) } : action === "invite" ? { target_user_id: integer(object.target_user_id) } : { expected_version: integer(object.expected_version) }) });
}
export function parseGroupActionInput(action: GroupAction, value: unknown): GroupActionInput {
  actionValue(action);
  const object = exact(value, ["targetId", "body"]);
  const targetId = action === "create" ? object.targetId === null ? null : invalid() : integer(object.targetId);
  const field = action === "create" ? "title" : action === "invite" ? "target_user_id" : "expected_version";
  const body = exact(object.body, ["confirmation_intent", field]);
  if (body.confirmation_intent !== intents[action]) return invalid();
  return Object.freeze({ targetId, body: Object.freeze({ confirmation_intent: intents[action],
    ...(action === "create" ? { title: validateGroupTitle(body.title) } : action === "invite" ? { target_user_id: integer(body.target_user_id) } : { expected_version: integer(body.expected_version) }) }) });
}
export function buildGroupCommand(action: GroupAction, value: GroupActionInput, commandId: string): GroupCommandBody {
  const input = parseGroupActionInput(action, value);
  return parseGroupCommand(action, { ...input.body, client_command_id: commandId });
}
function confirm(action: GroupAction, input: GroupActionInput, commandId: string, value: unknown, actorId: number): GroupRefreshIntent {
  const command = buildGroupCommand(action, input, commandId); const result = parseGroupReceipt(value, actorId).data;
  const { group, invitation, membership, replayed } = result;
  if (action === "create") {
    if (invitation !== null || group !== null && group.owner_id !== actorId
      || !replayed && (group === null || membership?.status !== "active" || group.active_member_count !== 1 || group.title !== command.title
        || group.version !== 1 || membership.generation !== 1 || membership.version !== 1 || membership.join_seq !== 0)) return invalid();
  } else if (action === "invite") {
    if (invitation === null || invitation.conversation_id !== input.targetId || invitation.inviter_id !== actorId || invitation.invitee_id !== command.target_user_id
      || !replayed && (invitation.status !== "pending" || invitation.version !== 1 || group === null || group.owner_id !== actorId)) return invalid();
  } else if (action === "leave") {
    if (invitation !== null || membership === null || membership.conversation_id !== input.targetId
      || !replayed && (group !== null || membership.status !== "left" || membership.version !== command.expected_version! + 1)) return invalid();
  } else {
    const expectedStatus = action === "accept" ? "accepted" : action === "decline" ? "declined" : "withdrawn";
    if (invitation === null || invitation.id !== input.targetId || invitation.status !== expectedStatus
      || (action === "withdraw" ? invitation.inviter_id : invitation.invitee_id) !== actorId
      || invitation.version !== command.expected_version! + 1
      || !replayed && (action === "accept" && membership?.status !== "active"
        || action === "decline" && membership?.status === "active"
        || action === "withdraw" && (group === null || group.owner_id !== actorId))) return invalid();
  }
  // IDs identify GET refresh targets only. No permissions, member list, message
  // content, navigation command or historical receipt is stored in action state.
  return Object.freeze({ conversations: true, invitations: true, conversationId: group?.conversation_id ?? invitation?.conversation_id ?? membership?.conversation_id ?? null,
    invitationId: invitation?.id ?? null });
}
export const groupActionCodec: GroupActionCodec<GroupActionInput> = Object.freeze({ parseInput: parseGroupActionInput, confirm });
