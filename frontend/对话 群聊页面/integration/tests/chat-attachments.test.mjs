import assert from "node:assert/strict";
import test from "node:test";
import { conversationPage, context, deferred, envelope, errorEnvelope, message, messagePage, response, summary } from "./chat-test-helpers.mjs";
const { createChatApi, ChatApiError } = await import("../src/chat/http.ts");
const { parseMessagePage, parseSendReceipt, parseUploadReceipt, parseCancelReceipt } = await import("../src/chat/contracts.ts");
const { createReadController } = await import("../src/chat/read-controller.ts");
const { parseReadBootstrap } = await import("../src/chat/read-bootstrap.ts");
const { createSendDraft } = await import("../src/chat/send-draft.ts");
const { validateUploadFile, validateAttachmentIds, validateSendBody } = await import("../src/chat/attachment-input.ts");
const { createAttachmentUrls } = await import("../src/chat/attachment-urls.ts");
const shared = await import("../src/chat/client.ts");
const key = "01234567-89ab-4cde-8fab-0123456789ab";
const id = "11234567-89ab-4cde-8fab-0123456789ab";
const id2 = "21234567-89ab-4cde-8fab-0123456789ab";
const id3 = "31234567-89ab-4cde-8fab-0123456789ab";
const permissions = { read: true, send: true, invite: false, leave: false };
const capability = { upload_enabled: true, download_enabled: true, max_file_bytes: 5242880, max_files_per_message: 3,
  allowed_mime_types: ["image/jpeg", "image/png", "application/pdf", "text/plain"], staging_ttl_seconds: 86400 };
const authority = (changes = {}) => context(1, { permissions, attachments: capability, ...changes });
const file = (name = "synthetic.txt", text = "hello") => new File([text], name, { type: "text/plain" });
const attachment = (changes = {}) => ({ id, name: "synthetic.txt", mime: "text/plain", size: 5,
  download_path: "/api/v1/conversations/1/attachments/" + id + "/download", ...changes });
const attachedMessage = (changes = {}) => message(1, 1, { kind: "attachment", body: null, attachments: [attachment()], ...changes });
const history = (items = [], changes = {}) => messagePage(1, items, { context: authority(), ...changes });
const list = () => conversationPage([summary(1, { permissions })]);
const upload = (uploadKey = key, changes = {}) => envelope({ attachment: attachment(), client_upload_id: uploadKey, replayed: false, expires_at: "2026-11-14T12:00:00Z", ...changes });
const cancelled = (changes = {}) => envelope({ attachment_id: id, state: "cancelled", ...changes });
const sent = (request, changes = {}) => envelope({ client_message_id: request.client_message_id, replayed: false,
  message: attachedMessage({ kind: request.body === "" ? "attachment" : "text", body: request.body === "" ? null : request.body }), read_seq: 0, unread_count: 0, context: authority(), ...changes });
const config = parseReadBootstrap({ schema_version: 2, integration_stage: "read", base_path: "/matcher/chat", api_base: "/api/v1", native_home_url: "/dashboard", native_login_url: "/user/auth/login", native_chat_url: "/mail/mail/index", csrf_header: "X-CSRF-Token", csrf_token: "synthetic-attachment-csrf", actor_id: 7 }, "https://same-origin.invalid");
const api = (fetcher) => createChatApi({ apiBase: "/api/v1", csrfToken: "synthetic-attachment-csrf", expectedActorId: 7, fetcher });
const headers = { "content-type": "text/plain; charset=UTF-8", "content-disposition": "attachment; filename=synthetic.txt",
  "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-length": "5" };
const binary = (body = "hello", changed = {}) => new Response(body, { status: 200, headers: { ...headers, ...changed } });
const fakeUrls = () => { const created = []; const revoked = []; return { created, revoked, port: { create(blob) { created.push(blob); return "blob:synthetic-" + created.length; }, revoke(url) { revoked.push(url); } } }; };
const load = async (fetcher, urls) => { const controller = createReadController(config, fetcher, urls?.port); await controller.start("/matcher/chat/conversations/1"); return controller; };
const selectAndUpload = async (controller) => { controller.selectAttachments([file()]); const key = controller.snapshot().attachments[0].clientUploadId; assert.equal(await controller.uploadAttachment(key), "applied"); return key; };

test("attachment input validates exact names, bytes and distinct ordered ids; only exact empty body can be attachment-only", () => {
  assert.equal(validateUploadFile(file()).name, "synthetic.txt"); assert.equal(validateUploadFile(new File(["x"], "empty-mime.txt")).type, "");
  assert.equal(validateUploadFile(new File(["x"], "client-mime.txt", { type: "untrusted/browser" })).name, "client-mime.txt");
  for (const value of [new Blob(["x"]), file("../x.txt"), file("x\\y.txt"), file("bad\n.txt"), file("zero\u200B.txt"), file("bidi\u202E.txt"), file("x.svg"), file("x.txt", ""), new File([new Uint8Array(5242881)], "big.txt"), file("界".repeat(61) + ".txt")]) assert.throws(() => validateUploadFile(value));
  assert.deepEqual(validateAttachmentIds([id2, id]), [id2, id]);
  for (const value of [[id, id], [id, id2, id3, key], [id.toUpperCase()], [1], null]) assert.throws(() => validateAttachmentIds(value));
  assert.equal(validateSendBody("", [id]), ""); assert.equal(validateSendBody(" exact \n", [id]), " exact \n");
  for (const [body, ids] of [["", []], ["  ", [id]], [null, [id]], ["\u0000", [id]]]) assert.throws(() => validateSendBody(body, ids));
});

test("response capability is optional and strict; attachments require negotiation and fixed authorized paths", () => {
  assert.equal(parseMessagePage(messagePage()).data.context.attachments, undefined);
  assert.deepEqual(parseMessagePage(history([attachedMessage()])).data.items[0].attachments[0], attachment());
  assert.ok(Object.isFrozen(parseMessagePage(history()).data.context.attachments.allowed_mime_types));
  const bads = [history([attachedMessage()], { context: context(1, { permissions }) }), history([attachedMessage({ body: "invented" })]),
    history([attachedMessage({ attachments: [] })]), history([attachedMessage({ kind: "deleted", sender: { status: "unavailable" } })]),
    history([attachedMessage({ attachments: [attachment(), attachment()] })])];
  for (const patch of [{ download_path: "https://evil.invalid/file" }, { download_path: "/file/file/download?id=7" }, { download_path: attachment().download_path + "?token=x" }, { id: 7 }, { size: 0 }, { size: 5242881 }, { mime: "text/html" }, { name: "../x.txt" }, { extra: true }]) bads.push(history([attachedMessage({ attachments: [attachment(patch)] })]));
  for (const patch of [{ max_file_bytes: 10000000 }, { upload_enabled: "true" }, { max_files_per_message: 4 }, { staging_ttl_seconds: 1 }, { allowed_mime_types: ["image/svg+xml"] }, { extra: true }]) bads.push(history([], { context: authority({ attachments: { ...capability, ...patch } }) }));
  for (const value of bads) assert.throws(() => parseMessagePage(value));
  assert.equal(parseMessagePage(history([attachedMessage()], { context: authority({ attachments: { ...capability, download_enabled: false } }) })).data.context.attachments.download_enabled, false);
});

test("upload/cancel/send receipts bind exact keys and pure attachment kind without changing bootstrap", () => {
  assert.equal(Object.keys(config).length, 10); assert.equal(parseUploadReceipt(upload(), 1).data.attachment.id, id);
  assert.equal(parseCancelReceipt(cancelled({ state: "expired" })).data.state, "expired");
  const request = { client_message_id: key, body: "", attachment_ids: [id] };
  assert.equal(parseSendReceipt(sent(request)).data.message.kind, "attachment");
  for (const value of [upload(key, { expires_at: "not-time" }), upload("BAD"), upload(key, { extra: true })]) assert.throws(() => parseUploadReceipt(value, 1));
  assert.throws(() => parseUploadReceipt(upload(), 2));
  for (const value of [cancelled({ state: "bound" }), cancelled({ attachment_id: 1 }), cancelled({ extra: true })]) assert.throws(() => parseCancelReceipt(value));
});

test("shared pure client exposes attachment methods without React or construction I/O", () => {
  let calls = 0; const client = shared.createChatApi({ apiBase: "/api/v1", csrfToken: "synthetic", fetcher: async () => { calls++; return response(upload()); } });
  for (const name of ["uploadAttachment", "cancelAttachment", "downloadAttachment", "sendText"]) assert.equal(typeof client[name], "function");
  assert.equal(calls, 0); client.dispose(); assert.equal(calls, 0);
});

test("multipart upload uses only original key and file with native session/CSRF; response loss never auto-retries", async () => {
  const calls = []; const source = file();
  const client = api(async (url, init) => { calls.push([url, init]); if (calls.length === 1) throw new Error("synthetic loss"); return response(upload(key, { replayed: true }), 200); });
  await assert.rejects(client.uploadAttachment(1, { clientUploadId: key, file: source }), (error) => error.code === "NETWORK_ERROR"); assert.equal(calls.length, 1);
  await client.uploadAttachment(1, { clientUploadId: key, file: source });
  for (const [url, init] of calls) {
    assert.equal(url, "/api/v1/conversations/1/attachments"); assert.equal(init.method, "POST"); assert.equal(init.credentials, "same-origin"); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
    assert.equal(init.headers["X-CSRF-Token"], "synthetic-attachment-csrf"); assert.equal(init.headers["X-Matcher-Chat-Actor"], "7"); assert.equal(init.headers["Content-Type"], undefined);
    assert.deepEqual([...init.body.keys()], ["client_upload_id", "file"]); assert.equal(init.body.get("client_upload_id"), key); assert.equal(await init.body.get("file").text(), "hello"); assert.equal(init.body.get("file").name, source.name);
  }
});

test("upload validates key/filename/size/status/replay and rejects arbitrary extra input before requesting", async () => {
  let calls = 0; const client = api(async () => { calls++; return response(upload(), 201); });
  for (const value of [{ clientUploadId: "bad", file: file() }, { clientUploadId: key, file: file("x.exe") }, { clientUploadId: key, file: file(), url: "evil" }]) assert.throws(() => client.uploadAttachment(1, value));
  assert.equal(calls, 0);
  for (const [payload, status] of [[upload(id), 201], [upload(key, { replayed: true }), 201], [upload(), 200], [upload(key, { attachment: attachment({ name: "different.txt" }) }), 201], [upload(key, { attachment: attachment({ size: 4 }) }), 201]]) {
    await assert.rejects(api(async () => response(payload, status)).uploadAttachment(1, { clientUploadId: key, file: file() }), (error) => error.code === "INVALID_RESPONSE");
  }
});

test("DELETE cancellation carries CSRF without body and may explicitly replay original id", async () => {
  const calls = []; const client = api(async (url, init) => { calls.push([url, init]); return response(cancelled()); });
  await client.cancelAttachment(1, { attachmentId: id }); await client.cancelAttachment(1, { attachmentId: id });
  for (const [url, init] of calls) { assert.equal(url, "/api/v1/conversations/1/attachments/" + id); assert.equal(init.method, "DELETE"); assert.equal(init.body, undefined); assert.equal(init.headers["X-CSRF-Token"], "synthetic-attachment-csrf"); }
  await assert.rejects(api(async () => response(cancelled({ attachment_id: id2 }))).cancelAttachment(1, { attachmentId: id }), (error) => error.code === "INVALID_RESPONSE");
});

test("send helper preserves ordered attachment binding and accepts attachment-only receipt only after persistence", async () => {
  let observed; const client = api(async (url, init) => { observed = JSON.parse(init.body); return response(sent(observed), 201); });
  const value = await client.sendText(1, { clientMessageId: key, body: "", attachmentIds: [id] });
  assert.deepEqual(observed, { client_message_id: key, body: "", attachment_ids: [id] }); assert.equal(value.data.message.kind, "attachment");
  await assert.rejects(api(async () => response(sent(observed, { message: attachedMessage({ attachments: [attachment({ id: id2, download_path: "/api/v1/conversations/1/attachments/" + id2 + "/download" })] }) }), 201))
    .sendText(1, { clientMessageId: key, body: "", attachmentIds: [id] }), (error) => error.code === "INVALID_RESPONSE");
  const draft = createSendDraft(() => key); draft.edit(""); const attempt = draft.begin(false, [id2, id]); draft.fail(new ChatApiError(0, "NETWORK_ERROR", "synthetic"));
  assert.deepEqual(draft.begin(true, [id3]), attempt);
});

test("authorized download is explicit same-origin fixed path with actor consistency and bounded blob", async () => {
  let calls = 0; const client = api(async (url, init) => {
    calls++; assert.equal(url, attachment().download_path); assert.equal(init.method, "GET"); assert.equal(init.headers.Accept, "text/plain");
    assert.equal(init.headers["X-Matcher-Chat-Actor"], "7"); assert.equal(init.credentials, "same-origin"); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store"); return binary();
  });
  assert.equal(calls, 0); const value = await client.downloadAttachment(1, { attachment: attachment() }); assert.equal(calls, 1); assert.equal(await value.blob.text(), "hello");
  assert.throws(() => client.downloadAttachment(1, { attachment: attachment({ download_path: "https://evil.invalid" }) })); assert.equal(calls, 1);
});

test("download rejects redirect-like HTML, inline/range, unsafe metadata, mismatched and excessive bytes", async () => {
  for (const changed of [{ "content-type": "text/html" }, { "content-disposition": "inline" }, { "cache-control": "public,max-age=60" }, { "x-content-type-options": "" }, { "content-range": "bytes 0-4/5" }, { "content-length": "6" }]) {
    await assert.rejects(api(async () => binary("hello", changed)).downloadAttachment(1, { attachment: attachment() }), (error) => error.code === "INVALID_RESPONSE");
  }
  for (const body of ["hell", "hello!"]) await assert.rejects(api(async () => binary(body)).downloadAttachment(1, { attachment: attachment() }), (error) => error.code === "INVALID_RESPONSE");
  await assert.rejects(api(async () => response(errorEnvelope("AUTH_REQUIRED"), 401)).downloadAttachment(1, { attachment: attachment() }), (error) => error.status === 401);
});

test("without negotiated upload capability selection and upload remain unavailable with zero POST", async () => {
  let writes = 0; const controller = await load(async (url, init) => { if (init.method !== "GET") writes++; return response(url.includes("messages") ? messagePage(1, [], { context: context(1, { permissions }) }) : list()); });
  assert.throws(() => controller.selectAttachments([file()])); await assert.rejects(controller.uploadAttachment(key)); assert.equal(writes, 0);
});

test("selection is inert, uploading is explicit, and sending waits for a successful upload before binding", async () => {
  const calls = []; let last;
  const controller = await load(async (url, init) => {
    calls.push([url, init]);
    if (url.endsWith("/attachments")) return response(upload(init.body.get("client_upload_id")), 201);
    if (init.method === "POST") { last = JSON.parse(init.body); return response(sent(last), 201); }
    return response(url.includes("messages") ? history(last ? [attachedMessage()] : []) : list());
  });
  controller.selectAttachments([file()]); assert.equal(calls.length, 2); assert.equal(controller.snapshot().draft.phase, "idle");
  await assert.rejects(controller.submitDraft()); assert.equal(calls.length, 2);
  const uploadKey = controller.snapshot().attachments[0].clientUploadId; await controller.uploadAttachment(uploadKey);
  assert.equal(controller.snapshot().attachments[0].phase, "ready"); assert.equal(controller.snapshot().chat.active.messages.length, 0); assert.equal(controller.snapshot().draft.phase, "idle");
  await controller.submitDraft(); assert.deepEqual(last.attachment_ids, [id]); assert.equal(last.body, ""); assert.equal(controller.snapshot().draft.phase, "sent");
  assert.equal(controller.snapshot().attachments.length, 0); assert.equal(controller.snapshot().chat.active.messages[0].kind, "attachment");
  assert.equal(calls.filter(([, init]) => init.method === "PUT").length, 0);
});

test("unknown upload retains original key/File across GET; explicit retry confirms staging without automatic send", async () => {
  const posts = []; const controller = await load(async (url, init) => {
    if (init.method === "POST") { posts.push(init.body); if (posts.length === 1) throw new Error("synthetic lost upload"); return response(upload(init.body.get("client_upload_id"), { replayed: true }), 200); }
    return response(url.includes("messages") ? history() : list());
  });
  controller.selectAttachments([file()]); const uploadKey = controller.snapshot().attachments[0].clientUploadId;
  await controller.uploadAttachment(uploadKey); assert.equal(controller.snapshot().attachments[0].phase, "upload_unknown");
  await controller.refreshHistory(); assert.equal(posts.length, 1); await controller.uploadAttachment(uploadKey);
  assert.equal(posts.length, 2); assert.equal(posts[0].get("client_upload_id"), posts[1].get("client_upload_id"));
  assert.equal(posts[0].get("file").name, posts[1].get("file").name); assert.deepEqual(await posts[0].get("file").arrayBuffer(), await posts[1].get("file").arrayBuffer());
  assert.equal(controller.snapshot().attachments[0].phase, "ready"); assert.equal(controller.snapshot().draft.phase, "idle");
});

test("stop upload aborts transport but keeps uncertain attempt; late old result cannot overwrite explicit retry", async () => {
  const first = deferred(); const second = deferred(); let posts = 0; let signal;
  const controller = await load(async (url, init) => {
    if (init.method === "POST") { posts++; if (posts === 1) { signal = init.signal; return first.promise; } return second.promise; }
    return response(url.includes("messages") ? history() : list());
  });
  controller.selectAttachments([file()]); const uploadKey = controller.snapshot().attachments[0].clientUploadId; const old = controller.uploadAttachment(uploadKey);
  assert.equal(await controller.cancelAttachment(uploadKey), "aborted"); assert.equal(signal.aborted, true); assert.equal(controller.snapshot().attachments[0].phase, "upload_unknown");
  const retry = controller.uploadAttachment(uploadKey); first.resolve(response(upload(uploadKey), 201)); await old;
  assert.equal(controller.snapshot().attachments[0].phase, "uploading"); second.resolve(response(upload(uploadKey, { replayed: true }), 200)); await retry;
  assert.equal(controller.snapshot().attachments[0].phase, "ready"); assert.equal(posts, 2);
});

test("unknown cancellation retries the same id and prevents sending until server confirms cancelled/expired", async () => {
  const deletes = []; const controller = await load(async (url, init) => {
    if (init.method === "DELETE") { deletes.push(url); if (deletes.length === 1) throw new Error("synthetic lost cancel"); return response(cancelled()); }
    if (init.method === "POST") return response(upload(init.body.get("client_upload_id")), 201);
    return response(url.includes("messages") ? history() : list());
  });
  const uploadKey = await selectAndUpload(controller); await controller.cancelAttachment(uploadKey);
  assert.equal(controller.snapshot().attachments[0].phase, "cancel_unknown"); await assert.rejects(controller.submitDraft());
  await controller.cancelAttachment(uploadKey); assert.equal(deletes.length, 2); assert.equal(deletes[0], deletes[1]); assert.equal(controller.snapshot().attachments.length, 0);
});

test("malformed upload/cancel receipts remain uncertain; only explicit original-key/id retries can recover", async () => {
  for (const operation of ["upload", "cancel"]) {
    let writes = 0; const keys = []; const controller = await load(async (url, init) => {
      if (url.endsWith("/attachments")) {
        const uploadKey = init.body.get("client_upload_id"); keys.push(uploadKey);
        if (operation === "upload" && writes++ === 0) return response({ malformed: true }, 201);
        return response(upload(uploadKey, { replayed: operation === "upload" }), operation === "upload" ? 200 : 201);
      }
      if (init.method === "DELETE") { keys.push(url); return writes++ === 0 ? response({ malformed: true }) : response(cancelled({ state: "expired" })); }
      return response(url.includes("messages") ? history() : list());
    });
    controller.selectAttachments([file()]); const uploadKey = controller.snapshot().attachments[0].clientUploadId;
    await controller.uploadAttachment(uploadKey);
    if (operation === "cancel") await controller.cancelAttachment(uploadKey);
    assert.equal(controller.snapshot().attachments[0].phase, operation + "_unknown");
    if (operation === "upload") { await controller.uploadAttachment(uploadKey); assert.equal(controller.snapshot().attachments[0].phase, "ready"); assert.equal(keys[0], keys[1]); }
    else { await controller.cancelAttachment(uploadKey); assert.equal(controller.snapshot().attachments.length, 0); assert.equal(keys[1], keys[2]); }
  }
});

test("expired upload key is retained for visible recovery and no automatic replacement is generated", async () => {
  const keys = []; const controller = await load(async (url, init) => {
    if (init.method === "POST") { keys.push(init.body.get("client_upload_id")); return response(errorEnvelope("ATTACHMENT_EXPIRED"), 410); }
    return response(url.includes("messages") ? history() : list());
  });
  controller.selectAttachments([file()]); const uploadKey = controller.snapshot().attachments[0].clientUploadId; await controller.uploadAttachment(uploadKey);
  assert.equal(controller.snapshot().attachments[0].phase, "upload_failed"); assert.equal(controller.snapshot().attachments[0].clientUploadId, uploadKey); assert.equal(keys.length, 1);
  controller.discardAttachment(uploadKey); assert.equal(keys.length, 1); controller.selectAttachments([file()]); assert.notEqual(controller.snapshot().attachments[0].clientUploadId, uploadKey);
});

test("double upload calls never start parallel mutation", async () => {
  const wait = deferred(); let uploads = 0; const controller = await load(async (url, init) => {
    if (init.method === "POST") { uploads++; return wait.promise; }
    return response(url.includes("messages") ? history() : list());
  });
  controller.selectAttachments([file()]); const uploadKey = controller.snapshot().attachments[0].clientUploadId; const pending = controller.uploadAttachment(uploadKey);
  await assert.rejects(controller.uploadAttachment(uploadKey)); assert.equal(uploads, 1); wait.resolve(response(upload(uploadKey), 201)); await pending;
  assert.equal(controller.snapshot().attachments[0].phase, "ready");
});

test("unknown send retains original key and ordered attachment binding; retry does not upload/cancel again", async () => {
  const sends = []; let uploads = 0; let deletes = 0;
  const controller = await load(async (url, init) => {
    if (url.endsWith("/attachments")) { uploads++; return response(upload(init.body.get("client_upload_id")), 201); }
    if (init.method === "DELETE") { deletes++; return response(cancelled()); }
    if (init.method === "POST") { const request = JSON.parse(init.body); sends.push(request); if (sends.length === 1) throw new Error("synthetic lost send"); return response(sent(request, { replayed: true }), 200); }
    return response(url.includes("messages") ? history(sends.length > 1 ? [attachedMessage()] : []) : list());
  });
  await selectAndUpload(controller); await controller.submitDraft(); assert.equal(controller.snapshot().draft.phase, "outcome_unknown");
  assert.throws(() => controller.selectAttachments([file()])); await assert.rejects(controller.cancelAttachment(controller.snapshot().attachments[0].clientUploadId));
  await controller.refreshHistory(); await controller.retryDraft(); assert.deepEqual(sends[0], sends[1]); assert.deepEqual(sends[1].attachment_ids, [id]);
  assert.equal(uploads, 1); assert.equal(deletes, 0); assert.equal(controller.snapshot().draft.phase, "sent");
  assert.equal(controller.snapshot().chat.conversations.phase, "ready"); assert.equal(controller.snapshot().chat.conversations.items[0].id, 1);
});

test("discarding uncertain send clears local bindings without automatically cancelling a possibly bound file", async () => {
  let uploads = 0; let deletes = 0;
  const controller = await load(async (url, init) => {
    if (url.endsWith("/attachments")) { uploads++; return response(upload(init.body.get("client_upload_id")), 201); }
    if (init.method === "DELETE") deletes++;
    if (init.method === "POST") throw new Error("synthetic lost send");
    return response(url.includes("messages") ? history() : list());
  });
  await selectAndUpload(controller); controller.editDraft("caption"); await controller.submitDraft(); controller.editFailedDraft();
  assert.equal(controller.snapshot().draft.body, "caption"); assert.equal(controller.snapshot().draft.clientMessageId, null); assert.equal(controller.snapshot().attachments.length, 0); assert.equal(uploads, 1); assert.equal(deletes, 0);
});

test("navigation, suspension and identity errors clear file/key state and ignore late upload success", async () => {
  for (const change of ["navigate", "suspend", "401", "403", "404"]) {
    const wait = deferred(); let signal; const controller = await load(async (url, init) => {
      if (init.method === "POST") { signal = init.signal; return wait.promise; } return response(url.includes("messages") ? history() : list());
    });
    controller.selectAttachments([file()]); const uploadKey = controller.snapshot().attachments[0].clientUploadId; const pending = controller.uploadAttachment(uploadKey);
    if (change === "navigate") await controller.navigate("/matcher/chat"); else if (change === "suspend") controller.suspend();
    if (["navigate", "suspend"].includes(change)) { assert.equal(signal.aborted, true); wait.resolve(response(upload(uploadKey), 201)); }
    else wait.resolve(response(errorEnvelope("NOT_AVAILABLE"), Number(change)));
    await pending; assert.equal(controller.snapshot().attachments.length, 0); assert.equal(controller.snapshot().draft.body, "");
    if (change === "401") assert.equal(controller.snapshot().status, "signed-out");
  }
});

test("late observed 401 from upload still clears same session after navigation", async () => {
  const wait = deferred(); const controller = await load(async (url, init) => init.method === "POST" ? wait.promise : response(url.includes("messages") ? history() : list()));
  controller.selectAttachments([file()]); const pending = controller.uploadAttachment(controller.snapshot().attachments[0].clientUploadId);
  await controller.navigate("/matcher/chat"); wait.resolve(response(errorEnvelope("SESSION_CHANGED"), 401)); await pending;
  assert.equal(controller.snapshot().status, "signed-out"); assert.equal(controller.snapshot().chat.actorId, null); assert.equal(controller.snapshot().attachments.length, 0);
});

test("bound message downloads work with send disabled; navigation/close/disposal revoke all object URLs", async () => {
  for (const change of ["navigate", "close", "dispose"]) {
    const urls = fakeUrls(); let gets = 0; const controller = await load(async (url) => {
      if (url.endsWith("/download")) { gets++; return binary(); }
      return response(url.includes("messages") ? history([attachedMessage()], { context: authority({ permissions: { ...permissions, send: false }, attachments: { ...capability, upload_enabled: false } }) }) : list());
    }, urls);
    assert.equal(gets, 0); assert.equal(await controller.downloadAttachment(id), "applied"); assert.equal(gets, 1); assert.equal(controller.snapshot().download.url, "blob:synthetic-1");
    if (change === "navigate") await controller.navigate("/matcher/chat"); else if (change === "close") controller.clearDownload(); else controller.dispose();
    assert.deepEqual(urls.revoked, ["blob:synthetic-1"]); assert.equal(controller.snapshot().download.url, null);
  }
});

test("a fresh history removing an attachment revokes its download blob even without a context revision change", async () => {
  const urls = fakeUrls(); let histories = 0; const controller = await load(async (url) => {
    if (url.endsWith("/download")) return binary();
    return response(url.includes("messages") ? history(histories++ === 0 ? [attachedMessage()] : [message(1, 1, { kind: "deleted", body: null, sender: { status: "unavailable" } })]) : list());
  }, urls);
  await controller.downloadAttachment(id); await controller.refreshHistory(); assert.deepEqual(urls.revoked, ["blob:synthetic-1"]); assert.equal(controller.snapshot().download.phase, "idle");
});

test("late downloads cannot create URLs after scope loss; authorization errors clear existing private content", async () => {
  for (const reason of ["navigate", "clear", "401", "403"]) {
    const wait = deferred(); const urls = fakeUrls(); const controller = await load(async (url) => url.endsWith("/download") ? wait.promise : response(url.includes("messages") ? history([attachedMessage()]) : list()), urls);
    const pending = controller.downloadAttachment(id);
    if (reason === "navigate") await controller.navigate("/matcher/chat"); if (reason === "clear") controller.clearDownload();
    wait.resolve(reason === "401" || reason === "403" ? response(errorEnvelope("NOT_AVAILABLE"), Number(reason)) : binary()); await pending;
    assert.equal(urls.created.length, 0); assert.equal(controller.snapshot().download.url, null);
    if (reason === "401") assert.equal(controller.snapshot().status, "signed-out");
    if (reason === "403") assert.equal(controller.snapshot().chat.active.messages.length, 0);
  }
});

test("download capability and visible message membership both gate access; URL resources have no construction side effects", async () => {
  let downloads = 0; const urls = fakeUrls(); const resources = createAttachmentUrls(urls.port); assert.equal(urls.created.length, 0);
  const controller = await load(async (url) => { if (url.endsWith("/download")) downloads++; return response(url.includes("messages") ? history([attachedMessage()], { context: authority({ attachments: { ...capability, download_enabled: false } }) }) : list()); }, urls);
  await assert.rejects(controller.downloadAttachment(id)); await assert.rejects(controller.downloadAttachment(id2)); assert.equal(downloads, 0);
  resources.create(new Blob(["x"])); resources.clear(); resources.dispose(); assert.equal(urls.revoked.length, 1); assert.throws(() => resources.create(new Blob(["x"])));
});
