import assert from "node:assert/strict";
import test from "node:test";
import { contracts, conversationPage, context, errorEnvelope, message, messagePage, permissions, readState, summary } from "./chat-test-helpers.mjs";
const { ChatContractError, parseConversationPage, parseMessagePage, parseReadState, parseErrorEnvelope } = contracts;
const rejects = (parse, value) => assert.throws(() => parse(value), ChatContractError);

test("complete envelopes preserve genuine empty pages, null counts are rejected, projections are deeply frozen", () => {
  const list = parseConversationPage(conversationPage());
  assert.deepEqual(list.data, { items: [], next_cursor: null, has_more: false, authorization_revision: 1 });
  const page = parseMessagePage(messagePage(1, [message()]));
  assert.ok(Object.isFrozen(page) && Object.isFrozen(page.data.items) && Object.isFrozen(page.data.items[0].sender));
  assert.equal(page.data.unread_count, 0);
  assert.equal(parseReadState(readState()).data.read_seq, 0);
  rejects(parseMessagePage, messagePage(1, [], { unread_count: null }));
});

test("conversation lists distinguish discussion context and reject extra or missing fields", () => {
  assert.equal(parseConversationPage(conversationPage([summary(4, { type: "discussion", space_id: 2, idea_activity_id: 3 })])).data.items[0].space_id, 2);
  for (const entry of [summary(1, { space_id: 2 }), summary(1, { type: "discussion" }), summary(1, { actor: 7 }), summary(1, { permissions: { ...permissions(), read: false } })]) rejects(parseConversationPage, conversationPage([entry]));
  const base = conversationPage();
  for (const change of [{ ...base, error: {} }, { data: base.data }, { ...base, meta: { request_id: "" } }, { ...base, meta: { request_id: "x", actor_id: 7 } }, Object.create(base), []]) rejects(parseConversationPage, change);
});

test("numeric contracts refuse string, fractional, unsafe and nonfinite identifiers without truncation", () => {
  for (const value of [0, -1, 0.5, "1", Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, null]) {
    rejects(parseConversationPage, conversationPage([summary(value)]));
    rejects(parseMessagePage, messagePage(1, [message(value)]));
  }
  assert.equal(parseConversationPage(conversationPage([summary(Number.MAX_SAFE_INTEGER)])).data.items[0].id, Number.MAX_SAFE_INTEGER);
  for (const value of [-1, 1.2, "0", Number.MAX_SAFE_INTEGER + 1]) rejects(parseReadState, readState(1, value));
});

test("history enforces conversation, ordered unique seq and IDs, membership lower bound and current read permission", () => {
  for (const entries of [[message(2), message(1)], [message(1), message(1)], [message(1), message(2, 1, { id: 101 })], [message(1, 2)]]) rejects(parseMessagePage, messagePage(1, entries));
  for (const authority of [context(1, { history_after_seq: 1 }), context(1, { permissions: { ...permissions(), read: false } }), context(1, { authorization_version: 0 })]) rejects(parseMessagePage, messagePage(1, [], { context: authority }));
  const group = context(1, { type: "group", history_after_seq: 10 });
  rejects(parseMessagePage, messagePage(1, [message(10)], { context: group, read_seq: 10 }));
  rejects(parseMessagePage, messagePage(1, [message(11)], { context: group, read_seq: 9 }));
  assert.equal(parseMessagePage(messagePage(1, [message(11)], { context: group, read_seq: 10 })).data.items[0].seq, 11);
  rejects(parseReadState, readState(1, 9, { context: group }));
  rejects(parseReadState, readState(1, 0, { context: context(2) }));
});

test("deleted tombstones cannot restore sender identity or text and attachments remain unavailable", () => {
  const deleted = message(1, 1, { kind: "deleted", body: null, sender: { status: "unavailable" } });
  assert.equal(parseMessagePage(messagePage(1, [deleted])).data.items[0].body, null);
  for (const change of [{ kind: "deleted", body: null }, { kind: "deleted", body: "hidden", sender: { status: "unavailable" } }, { attachments: [{ id: 1 }] }, { kind: "html" }, { body: " " }, { kind: "system", body: "" }, { sender: { status: "available", user_id: 7, display_name: "", avatar_ref: null } }, { sender: { status: "unavailable", user_id: 7 } }]) rejects(parseMessagePage, messagePage(1, [message(1, 1, change)]));
  const long = "旧".repeat(5000);
  assert.equal(parseMessagePage(messagePage(1, [message(1, 1, { body: long })])).data.items[0].body, long);
  const last = { ...deleted }; delete last.conversation_id; delete last.attachments;
  assert.equal(parseConversationPage(conversationPage([summary(1, { last_message: last })])).data.items[0].last_message.kind, "deleted");
});

test("UTC dates are strict calendar values and avatar references stay opaque", () => {
  for (const created_at of ["2026-02-30T00:00:00Z", "2026-11-12 00:00:00", "2026-11-12T00:00:00+00:00", "2026-11-12T00:00:00.000Z", "2026-11-12T24:00:00Z"]) rejects(parseMessagePage, messagePage(1, [message(1, 1, { created_at })]));
  const sender = { status: "available", user_id: 7, display_name: "Synthetic", avatar_ref: "opaque-avatar-reference" };
  assert.equal(parseMessagePage(messagePage(1, [message(1, 1, { sender })])).data.items[0].sender.avatar_ref, sender.avatar_ref);
});

test("history/list cursor consistency differs from explicit incremental continuation", () => {
  const entry = message();
  for (const change of [{ has_more: true }, { next_cursor: "opaque" }, { next_cursor: " " }]) rejects(parseMessagePage, messagePage(1, [entry], change));
  rejects(parseConversationPage, conversationPage([], "opaque"));
  rejects(parseMessagePage, messagePage(1, [], { has_more: true, next_cursor: "opaque" }));
  assert.equal(parseMessagePage(messagePage(1, [entry], { has_more: true }), "increment").data.has_more, true);
  rejects((payload) => parseMessagePage(payload, "increment"), messagePage(1, [entry], { has_more: true, next_cursor: "opaque" }));
  assert.throws(() => parseMessagePage(messagePage(), "forward"), ChatContractError);
  rejects(parseConversationPage, conversationPage([summary(1), summary(1)]));
  rejects(parseConversationPage, conversationPage(Array.from({ length: 49 }, (_, i) => summary(i + 1))));
});

test("error contracts preserve server text and JSON details without accepting malformed envelopes", () => {
  const payload = errorEnvelope("RATE_LIMIT", { message: "稍后再试", retryable: true, details: { remaining: 0, reasons: ["quota", null, false] } });
  assert.deepEqual(parseErrorEnvelope(payload), payload);
  assert.ok(Object.isFrozen(parseErrorEnvelope(payload).error.details.reasons));
  for (const changes of [{ code: "" }, { retryable: "true" }, { details: null }, { details: 1 }, { details: { bad: Infinity } }, { actor: 7 }]) rejects(parseErrorEnvelope, errorEnvelope("ERR", changes));
  const cyclic = {}; cyclic.self = cyclic;
  rejects(parseErrorEnvelope, errorEnvelope("ERR", { details: cyclic }));
});
