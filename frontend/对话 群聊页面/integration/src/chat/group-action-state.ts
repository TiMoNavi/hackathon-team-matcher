import { createClientMessageId, validateClientMessageId } from "./send-input.js";

/** Offline C07 preparation. Nothing here transports a command or grants access. */
export type GroupAction = "create" | "invite" | "accept" | "decline" | "withdraw" | "leave";
export type GroupRefreshIntent = Readonly<{
  conversations: true; invitations: true; conversationId: number | null; invitationId: number | null;
}>;
export type GroupActionProblem = Readonly<{ status: number; code: string }>;
export interface GroupActionCodec<Input> {
  parseInput(action: GroupAction, value: unknown): Input;
  confirm(action: GroupAction, input: Input, commandId: string, value: unknown, actorId: number): GroupRefreshIntent;
}
export type GroupAttempt<Input> = Readonly<{
  actorId: number; accountEpoch: number; scopeKey: string; scopeEpoch: number; attempt: number;
  action: GroupAction; commandId: string; input: Input;
}>;
export type GroupActionSnapshot<Input> = Readonly<{
  status: "inactive" | "active" | "revoked" | "signed-out" | "disposed";
  actorId: number | null; accountEpoch: number; scopeKey: string | null; scopeEpoch: number;
  phase: "idle" | "submitting" | "failed" | "conflict" | "outcome_unknown" | "succeeded";
  action: GroupAction | null; commandId: string | null; input: Input | null;
  error: GroupActionProblem | null; refresh: GroupRefreshIntent | null; canRetry: boolean;
}>;
export class GroupActionStateError extends Error {
  readonly code = "GROUP_ACTION_NOT_READY";
  constructor() { super("This group action is not available."); this.name = "GroupActionStateError"; }
}
function invalid(): never { throw new GroupActionStateError(); }
const actions: readonly GroupAction[] = ["create", "invite", "accept", "decline", "withdraw", "leave"];
function id(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function explicit(value: unknown, kind: "submit" | "retry" | "discard"): void { if (value !== kind) return invalid(); }
function problem(value: GroupActionProblem): GroupActionProblem {
  if (!value || !Number.isSafeInteger(value.status) || value.status < 0 || value.status > 599
    || typeof value.code !== "string" || !/^[A-Z][A-Z0-9_]{0,95}$/.test(value.code)) return invalid();
  return Object.freeze({ status: value.status, code: value.code });
}
function copy<T>(value: T, ancestors = new Set<object>(), depth = 0): T {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object" || ancestors.has(value) || depth > 16
    || !Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return invalid();
  ancestors.add(value);
  const next = Array.isArray(value) ? value.map((entry) => copy(entry, ancestors, depth + 1))
    : Object.fromEntries(Reflect.ownKeys(value).map((key) => {
      if (typeof key !== "string") return invalid();
      return [key, copy((value as Record<string, unknown>)[key], ancestors, depth + 1)];
    }));
  ancestors.delete(value);
  return Object.freeze(next) as T;
}
function refresh(value: GroupRefreshIntent): GroupRefreshIntent {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== 4
    || value.conversations !== true || value.invitations !== true
    || value.conversationId !== null && !id(value.conversationId) || value.invitationId !== null && !id(value.invitationId)) return invalid();
  return Object.freeze({ conversations: true, invitations: true, conversationId: value.conversationId, invitationId: value.invitationId });
}

/** Pure state with a pure codec port. Only explicit submit/retry returns an
 * attempt for a future host adapter. A string intent is not server authority.
 * The host must originate it from a real user event and send no epoch/actor data. */
export function createGroupActionState<Input>(codec: GroupActionCodec<Input>, makeKey: () => string = createClientMessageId) {
  let sequence = 0;
  let pending: GroupAttempt<Input> | null = null;
  const issued = new WeakSet<object>();
  const blank = () => ({ phase: "idle" as const, action: null, commandId: null, input: null, error: null, refresh: null, canRetry: false });
  let current: GroupActionSnapshot<Input> = Object.freeze({ status: "inactive", actorId: null, accountEpoch: 0, scopeKey: null, scopeEpoch: 0, ...blank() });
  const publish = (value: Partial<GroupActionSnapshot<Input>>) => { current = Object.freeze({ ...current, ...value }); };
  function live(): void { if (current.status === "disposed") return invalid(); }
  function ready(): void { if (current.status !== "active" || current.actorId === null || current.scopeKey === null) return invalid(); }
  function clear(status: GroupActionSnapshot<Input>["status"], actorId: number | null): void {
    pending = null; publish({ ...blank(), status, actorId, scopeKey: null, accountEpoch: current.accountEpoch + 1, scopeEpoch: current.scopeEpoch + 1 });
  }
  function matches(attempt: GroupAttempt<Input>): boolean {
    return pending === attempt && current.status === "active" && current.phase === "submitting"
      && attempt.accountEpoch === current.accountEpoch && attempt.scopeEpoch === current.scopeEpoch
      && attempt.actorId === current.actorId && attempt.scopeKey === current.scopeKey;
  }
  function issue(): GroupAttempt<Input> {
    ready();
    const attempt = Object.freeze({ actorId: current.actorId!, accountEpoch: current.accountEpoch, scopeKey: current.scopeKey!, scopeEpoch: current.scopeEpoch,
      attempt: ++sequence, action: current.action!, commandId: current.commandId!, input: current.input! });
    pending = attempt; issued.add(attempt); publish({ phase: "submitting", error: null, refresh: null, canRetry: false }); return attempt;
  }
  function fail(attempt: GroupAttempt<Input>, value: GroupActionProblem): "applied" | "ignored" {
    if (current.status === "disposed" || !attempt || !issued.has(attempt) || attempt.accountEpoch !== current.accountEpoch || attempt.actorId !== current.actorId) return "ignored";
    const error = problem(value);
    // A late 401 from this account/session invalidates all its current scopes.
    // A response from an earlier login, even the same actor, cannot clear a new one.
    if (error.status === 401) { clear("signed-out", null); return "applied"; }
    if (!matches(attempt)) return "ignored";
    pending = null;
    if ([403, 404].includes(error.status) || ["AUTHORIZATION_CHANGED", "CONTEXT_CHANGED", "CURSOR_CONTEXT_CHANGED"].includes(error.code)) {
      publish({ ...blank(), status: "revoked", scopeKey: null, scopeEpoch: current.scopeEpoch + 1, error }); return "applied";
    }
    const unknown = error.status === 0 || error.status >= 500 || error.code === "INVALID_RESPONSE";
    // C07-P business failures have retryable=false. A version/input conflict
    // needs a fresh read and explicit new command, never an unchanged retry.
    publish({ phase: unknown ? "outcome_unknown" : error.status === 409 ? "conflict" : "failed", error, canRetry: unknown }); return "applied";
  }
  return Object.freeze({
    snapshot: () => current,
    activateAccount(actorId: number): void { live(); if (!id(actorId)) return invalid(); clear("active", actorId); },
    /** Invoke only after the host establishes the fresh authorized scope. */
    activateScope(scopeKey: string): void {
      live(); if (current.actorId === null || !["active", "revoked"].includes(current.status) || typeof scopeKey !== "string"
        || !scopeKey.trim() || scopeKey.length > 512 || /[\u0000-\u001f\u007f]/u.test(scopeKey)) return invalid();
      pending = null; publish({ ...blank(), status: "active", scopeKey, scopeEpoch: current.scopeEpoch + 1 });
    },
    submit(action: GroupAction, value: unknown, intent: "submit"): GroupAttempt<Input> {
      ready(); explicit(intent, "submit");
      if (!actions.includes(action) || !["idle", "succeeded"].includes(current.phase)) return invalid();
      const input = copy(codec.parseInput(action, value)); const commandId = validateClientMessageId(makeKey());
      publish({ ...blank(), action, input, commandId }); return issue();
    },
    retry(intent: "retry"): GroupAttempt<Input> {
      ready(); explicit(intent, "retry");
      if (current.phase !== "outcome_unknown" || !current.canRetry || current.commandId === null || current.input === null) return invalid();
      return issue();
    },
    resolve(attempt: GroupAttempt<Input>, value: unknown): "applied" | "ignored" | "invalid" {
      if (!matches(attempt)) return "ignored";
      let next: GroupRefreshIntent;
      try { next = refresh(codec.confirm(attempt.action, attempt.input, attempt.commandId, value, attempt.actorId)); }
      catch { fail(attempt, { status: 0, code: "INVALID_RESPONSE" }); return "invalid"; }
      pending = null; publish({ ...blank(), phase: "succeeded", refresh: next }); return "applied";
    },
    reject: fail,
    /** Taking an intent does not itself read, navigate, accept, invite or send. */
    takeRefreshIntent(): GroupRefreshIntent | null { const value = current.refresh; if (value !== null) publish({ refresh: null }); return value; },
    discard(intent: "discard", acknowledgeUnknown = false): void {
      ready(); explicit(intent, "discard");
      if (!["failed", "conflict", "outcome_unknown", "succeeded"].includes(current.phase) || current.phase === "outcome_unknown" && acknowledgeUnknown !== true) return invalid();
      pending = null; publish(blank());
    },
    revokeScope(): void {
      live(); if (current.actorId === null) return; pending = null;
      publish({ ...blank(), status: "revoked", scopeKey: null, scopeEpoch: current.scopeEpoch + 1 });
    },
    reset(): void { if (current.status !== "disposed") clear("inactive", null); },
    dispose(): void { if (current.status !== "disposed") clear("disposed", null); },
  });
}
