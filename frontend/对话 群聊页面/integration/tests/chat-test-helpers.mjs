import { registerHooks } from "node:module";

// Node's strip-types loader intentionally does not rewrite .js imports. Keep
// runtime TypeScript compatible with both the existing Next preview and Vite;
// this test-only resolver maps exactly these local pure modules, without a build.
const chatRoot = new URL("../src/chat/", import.meta.url);
const localImports = new Set(["./contracts.js", "./http.js", "./state.js", "./read-bootstrap.js", "./read-controller.js", "./read-lifecycle.js", "./navigation.js", "./read-presentation.js", "./send-input.js", "./send-draft.js", "./client.js", "./attachment-input.js", "./attachment-draft.js", "./attachment-urls.js"]);
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.startsWith(chatRoot.href) && localImports.has(specifier)) {
    return nextResolve(new URL(specifier.replace(/\.js$/, ".ts"), context.parentURL).href, context);
  }
  return nextResolve(specifier, context);
} });

export const contracts = await import("../src/chat/contracts.ts");
export const http = await import("../src/chat/http.ts");
export const state = await import("../src/chat/state.ts");
export const permissions = () => ({ read: true, send: false, invite: false, leave: false });
export const context = (id = 1, changes = {}) => ({ conversation_id: id, type: "direct", version: 1, authorization_version: 1, authorization_revision: 1, membership_generation: 1, history_after_seq: 0, permissions: permissions(), ...changes });
export const message = (seq = 1, conversationId = 1, changes = {}) => ({ id: seq + conversationId * 100, conversation_id: conversationId, seq, kind: "text", sender: { status: "available", user_id: 7, display_name: "Synthetic member", avatar_ref: null }, body: `Synthetic text ${seq}`, created_at: "2026-11-12T00:00:00Z", attachments: [], ...changes });
export const summary = (id = 1, changes = {}) => ({ id, type: "direct", title: null, version: 1, last_message: null, unread_count: 0, permissions: permissions(), ...changes });
export const envelope = (data) => ({ data, meta: { request_id: "synthetic-contract-request" } });
export const conversationPage = (entries = [], next = null, revision = 1) => envelope({ items: entries, next_cursor: next, has_more: next !== null, authorization_revision: revision });
export const messagePage = (id = 1, entries = [], changes = {}) => envelope({ items: entries, next_cursor: null, has_more: false, read_seq: 0, unread_count: 0, context: context(id), ...changes });
export const readState = (id = 1, seq = 0, changes = {}) => envelope({ conversation_id: id, read_seq: seq, unread_count: 0, context: context(id), ...changes });
export const errorEnvelope = (code = "TEST_ERROR", changes = {}) => ({ error: { code, message: "Synthetic server message", retryable: false, details: { fields: ["synthetic"] }, ...changes }, meta: { request_id: "synthetic-error-request" } });
export const response = (payload, status = 200, headers = { "Content-Type": "application/json; charset=utf-8" }) => new Response(JSON.stringify(payload), { status, headers });
export function deferred() {
  let resolve; let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
export function fakeApi(overrides = {}) {
  const calls = [];
  let disposed = false;
  const behavior = { list: () => conversationPage(), history: (id) => messagePage(id), increment: (id) => messagePage(id), readState: (id, value) => readState(id, value.readSeq), ...overrides };
  const api = { dispose() { disposed = true; calls.push(["dispose"]); } };
  for (const method of ["list", "history", "increment", "readState"]) api[method] = async (...args) => { calls.push([method, ...args]); return behavior[method](...args); };
  return { api, calls, isDisposed: () => disposed };
}
export function activeState(overrides = {}) {
  const fake = fakeApi(overrides); const store = state.createChatState(); store.activateSession(7, fake.api);
  return { store, ...fake };
}
