import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { conversationPage, context, deferred, envelope, message, messagePage, response, summary, errorEnvelope } from "./chat-test-helpers.mjs";

// Render the real read component offline. TSX is transformed only in memory;
// this creates no bundle, output files, browser, server or network connection.
const project = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    let candidate;
    if (specifier.startsWith("@/")) candidate = new URL(specifier.slice(2), project);
    else if (context.parentURL?.startsWith(project.href) && !context.parentURL.includes("/node_modules/") && /^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier)) candidate = new URL(specifier, context.parentURL);
    if (candidate) for (const suffix of [".tsx", ".ts"]) { const resolved = new URL(candidate.href + suffix); if (existsSync(resolved)) return nextResolve(resolved.href, context); }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(project.href) && url.endsWith(".tsx") && !url.includes("/node_modules/")) {
      const source = ts.transpileModule(readFileSync(new URL(url), "utf8"), { fileName: fileURLToPath(url), compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
      return { format: "module", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
const { ReadEntry } = await import("../src/chat/read-entry.tsx");
const { createReadController } = await import("../src/chat/read-controller.ts");
const { parseReadBootstrap } = await import("../src/chat/read-bootstrap.ts");
const links = { home: "/dashboard", login: "/user/auth/login" };
const config = parseReadBootstrap({ schema_version: 2, integration_stage: "read", base_path: "/matcher/chat", api_base: "/api/v1", native_home_url: links.home, native_login_url: links.login, native_chat_url: "/mail/mail/index", csrf_header: "X-CSRF-Token", csrf_token: "synthetic-render-csrf", actor_id: 7 }, "https://same-origin.invalid");
const render = (controller, pathname = "/matcher/chat") => renderToStaticMarkup(createElement(ReadEntry, { controller, links, pathname }));
const attachmentId = "11234567-89ab-4cde-8fab-0123456789ab";
const attachmentPermissions = { read: true, send: true, invite: false, leave: false };
const attachmentCapability = { upload_enabled: true, download_enabled: true, max_file_bytes: 5242880, max_files_per_message: 3,
  allowed_mime_types: ["image/jpeg", "image/png", "application/pdf", "text/plain"], staging_ttl_seconds: 86400 };
const attachmentDto = { id: attachmentId, name: "synthetic <file>.txt", mime: "text/plain", size: 5,
  download_path: "/api/v1/conversations/1/attachments/" + attachmentId + "/download" };
const attachmentContext = context(1, { permissions: attachmentPermissions, attachments: attachmentCapability });
const attachmentHistory = (entries = []) => messagePage(1, entries, { context: attachmentContext });

test("attachment picker appears only for response capability and selection remains local with accessible upload action", async () => {
  let writes = 0; const controller = createReadController(config, async (url, init) => { if (init.method !== "GET") writes++; return response(url.includes("messages") ? attachmentHistory() : conversationPage([summary(1, { permissions: attachmentPermissions })])); });
  await controller.start("/matcher/chat/conversations/1"); let html = render(controller);
  assert.match(html, /id="chat-attachment-input"[^>]*multiple=""/); assert.match(html, /aria-label="添加附件"/);
  assert.ok(html.includes("附件与文字已开放")); assert.ok(html.includes("最多暂存 20 件")); assert.ok(html.includes("24 小时后失效"));
  controller.selectAttachments([new File(["hello"], attachmentDto.name, { type: "text/plain" })]); html = render(controller);
  assert.ok(html.includes('data-upload-state="selected"')); assert.ok(html.includes("synthetic &lt;file&gt;.txt")); assert.ok(html.includes("尚未上传"));
  assert.ok(html.includes("上传附件 synthetic &lt;file&gt;.txt")); assert.equal(writes, 0); assert.ok(!html.includes("blob:"));
});

test("attachment upload error is announced with explicit same-upload recovery and no fake sent message", async () => {
  const controller = createReadController(config, async (url, init) => {
    if (init.method === "POST") throw new Error("synthetic lost upload");
    return response(url.includes("messages") ? attachmentHistory() : conversationPage([summary(1, { permissions: attachmentPermissions })]));
  });
  await controller.start("/matcher/chat/conversations/1"); controller.selectAttachments([new File(["hello"], attachmentDto.name)]);
  await controller.uploadAttachment(controller.snapshot().attachments[0].clientUploadId); const html = render(controller);
  assert.ok(html.includes('data-upload-state="upload_unknown"')); assert.ok(html.includes('role="alert"')); assert.ok(html.includes("上传结果待确认"));
  assert.ok(html.includes("重试上传 synthetic &lt;file&gt;.txt")); assert.ok(html.includes("放弃上传重试 synthetic &lt;file&gt;.txt"));
  assert.ok(!html.includes("data-message-id")); assert.ok(!html.includes("已发送。此状态不代表对方已收到或已读。"));
  assert.ok(!html.includes("读取失败，请检查连接"));
});

test("authorized message attachments render escaped names and buttons without naked server download URLs", async () => {
  let downloads = 0; const controller = createReadController(config, async (url) => { if (url.endsWith("/download")) downloads++;
    return response(url.includes("messages") ? attachmentHistory([message(1, 1, { kind: "attachment", body: null, attachments: [attachmentDto] })]) : conversationPage([summary(1, { permissions: attachmentPermissions })])); });
  await controller.start("/matcher/chat/conversations/1"); const html = render(controller);
  assert.ok(html.includes('data-attachment-id="' + attachmentId + '"')); assert.ok(html.includes("下载附件 synthetic &lt;file&gt;.txt"));
  assert.ok(!html.includes('href="' + attachmentDto.download_path)); assert.ok(!html.includes("<img")); assert.equal(downloads, 0);
});

test("download presentation exposes only owned blob after valid bytes and clears it on navigation", async () => {
  const historical = messagePage(1, [message(1, 1, { kind: "attachment", body: null, attachments: [attachmentDto] })],
    { context: context(1, { permissions: { ...attachmentPermissions, send: false }, attachments: { ...attachmentCapability, upload_enabled: false } }) });
  const revoked = []; const controller = createReadController(config, async (url) => {
    if (url.endsWith("/download")) return new Response("hello", { status: 200, headers: { "content-type": "text/plain", "content-disposition": "attachment", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
    return response(url.includes("messages") ? historical : conversationPage([summary(1, { permissions: { ...attachmentPermissions, send: false } })]));
  }, { create: () => "blob:synthetic-authorized", revoke: (url) => revoked.push(url) });
  await controller.start("/matcher/chat/conversations/1"); await controller.downloadAttachment(attachmentId); const html = render(controller);
  assert.ok(html.includes('href="blob:synthetic-authorized"')); assert.ok(html.includes("保存附件 synthetic &lt;file&gt;.txt")); assert.ok(html.includes("关闭下载"));
  assert.ok(html.includes("新附件上传暂不可用；已有附件可按权限下载")); assert.ok(!html.includes("附件与群聊尚未开放"));
  await controller.navigate("/matcher/chat"); assert.ok(!render(controller).includes("blob:synthetic-authorized")); assert.deepEqual(revoked, ["blob:synthetic-authorized"]);
});

test("actual read component is inert when idle and keeps send, attachments and group controls disabled", () => {
  let calls = 0; const controller = createReadController(config, async () => { calls++; return response(conversationPage()); });
  const html = render(controller);
  assert.equal(calls, 0); assert.ok(html.includes('data-state="idle"'));
  assert.match(html, /<textarea[^>]*disabled=""/); assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="添加附件/);
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="群聊/); assert.ok(!html.includes("synthetic-render-csrf"));
  assert.ok(!html.includes("原版回退已通过"));
});

test("actual read component distinguishes true empty list and empty history without fixture content", async () => {
  const controller = createReadController(config, async (url) => response(url.includes("messages") ? messagePage(1) : conversationPage()));
  await controller.start("/matcher/chat/conversations/1"); const html = render(controller, "/matcher/chat/conversations/1");
  assert.ok(html.includes("目前没有获准的私聊会话")); assert.ok(html.includes("这段会话还没有消息"));
  assert.ok(!html.includes("data-message-id")); assert.ok(!html.includes("在线")); assert.ok(!html.includes("对方已读"));
});

test("actual messages render escaped text and honest unavailable senders without enabling writes", async () => {
  let writes = 0; const body = '<script>alert("synthetic")</script>';
  const controller = createReadController(config, async (url, init) => { if (init.method !== "GET") writes++; return response(url.includes("messages") ? messagePage(1, [message(1, 1, { body, sender: { status: "unavailable" } })]) : conversationPage([summary(1)])); });
  await controller.start("/matcher/chat/conversations/1"); const html = render(controller, "/matcher/chat/conversations/1");
  assert.ok(html.includes("&lt;script&gt;")); assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("发送者信息未提供")); assert.ok(html.includes('data-read-seq="1"')); assert.equal(writes, 0);
  assert.match(html, /<button[^>]*disabled=""[^>]*>[^]*?已看到这里/);
});

test("actual read errors remain errors and signing out renders no old list or private message", async () => {
  let historyCalls = 0; const privateText = "SYNTHETIC_RENDER_PRIVATE_MESSAGE";
  const controller = createReadController(config, async (url) => {
    if (!url.includes("messages")) return response(conversationPage([summary(1, { title: "SYNTHETIC_PRIVATE_TITLE" })]));
    return historyCalls++ === 0 ? response(messagePage(1, [message(1, 1, { body: privateText })])) : response(errorEnvelope("AUTH_REQUIRED"), 401);
  });
  await controller.start("/matcher/chat/conversations/1"); assert.ok(render(controller).includes(privateText));
  await controller.newer(); const signedOut = render(controller);
  assert.ok(signedOut.includes("登录已失效")); assert.ok(!signedOut.includes(privateText)); assert.ok(!signedOut.includes("SYNTHETIC_PRIVATE_TITLE"));
  const failing = createReadController(config, async () => response(errorEnvelope("UNAVAILABLE"), 503));
  await failing.start("/matcher/chat"); const html = render(failing); assert.ok(html.includes('role="alert"')); assert.ok(!html.includes("目前没有获准的私聊会话"));
});

test("read exits never link to a taken-over native chat route in any page state", async () => {
  const states = [];
  const controller = createReadController(config, async () => response(conversationPage()));
  states.push(render(controller));
  await controller.start("/matcher/chat"); states.push(render(controller));
  controller.suspend(); states.push(render(controller));
  const signedOut = createReadController(config, async () => response(errorEnvelope("AUTH_REQUIRED"), 401));
  await signedOut.start("/matcher/chat"); states.push(render(signedOut));
  const unavailable = createReadController(config, async () => response(errorEnvelope("DEPENDENCY_UNAVAILABLE"), 503));
  await unavailable.start("/matcher/chat/conversations/1"); states.push(render(unavailable, "/matcher/chat/conversations/1"));
  for (const html of states) {
    const destinations = [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((match) => match[1]);
    assert.ok(destinations.includes(links.home));
    assert.ok(destinations.every((value) => [links.home, links.login, "#conversation-main"].includes(value)));
    assert.doesNotMatch(html, /原版入口|原版聊天入口|\/mail\/mail\/index/);
    assert.match(html, /<textarea[^>]*disabled=""/);
    assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="添加附件/);
    assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="群聊/);
  }
  const signedOutHtml = render(signedOut);
  assert.ok(signedOutHtml.includes('data-chat-open="true"'));
  assert.ok(signedOutHtml.includes('href="/user/auth/login"'));
});

test("failed deep-link list loading exposes honest recovery within the mobile conversation pane", async () => {
  const controller = createReadController(config, async () => response(errorEnvelope("DEPENDENCY_UNAVAILABLE"), 503));
  await controller.start("/matcher/chat/conversations/99");
  const html = render(controller, "/matcher/chat/conversations/99");
  const thread = html.slice(html.indexOf("<section"));
  assert.ok(html.includes('data-chat-open="true"'));
  assert.ok(thread.includes("暂时无法读取会话"));
  assert.ok(thread.includes('role="alert"')); assert.ok(thread.includes("重试读取"));
  assert.equal([...html.matchAll(/role="alert"/g)].length, 1);
  assert.ok(thread.includes("聊天读取暂不可用")); assert.ok(thread.includes('href="/dashboard"'));
  assert.doesNotMatch(thread, /选择一段私聊|目前没有获准的私聊会话|这段会话还没有消息|已暂停/);
});

test("denied deep-link history clears prior titles and bodies without native fallback", async () => {
  for (const status of [403, 404]) {
    let historyCalls = 0;
    const controller = createReadController(config, async (url) => {
      if (!url.includes("messages")) return response(conversationPage([summary(1, { title: "SYNTHETIC_REVOKED_TITLE" })]));
      return historyCalls++ === 0 ? response(messagePage(1, [message(1, 1, { body: "SYNTHETIC_REVOKED_BODY" })])) : response(errorEnvelope("NOT_AVAILABLE"), status);
    });
    await controller.start("/matcher/chat/conversations/1");
    assert.ok(render(controller).includes("SYNTHETIC_REVOKED_BODY"));
    await controller.newer(); const html = render(controller, "/matcher/chat/conversations/1");
    assert.ok(html.includes("此会话暂不可访问"));
    assert.doesNotMatch(html, /SYNTHETIC_REVOKED_TITLE|SYNTHETIC_REVOKED_BODY|原版聊天入口/);
    assert.ok(html.includes("返回会话列表"));
  }
});

test("list denial uses list recovery copy and never claims that a particular conversation exists", async () => {
  const controller = createReadController(config, async () => response(errorEnvelope("NOT_AVAILABLE"), 403));
  await controller.start("/matcher/chat/conversations/99");
  const html = render(controller, "/matcher/chat/conversations/99");
  assert.ok(html.includes("会话列表暂不可访问"));
  assert.doesNotMatch(html, /此会话暂不可访问|会话 99|原版聊天入口/);
});

test("server send permission enables only text composer and keeps unimplemented controls disabled", async () => {
  const permissions = { read: true, send: true, invite: false, leave: false };
  const controller = createReadController(config, async (url) => response(url.includes("messages") ? messagePage(1, [], { context: context(1, { permissions }) }) : conversationPage([summary(1, { permissions })])));
  await controller.start("/matcher/chat/conversations/1"); controller.editDraft("synthetic draft <script>");
  const html = render(controller, "/matcher/chat/conversations/1");
  const textarea = html.match(/<textarea[^>]*>/)[0]; assert.ok(!textarea.includes("disabled"));
  assert.ok(html.includes("文字发送已开放")); assert.ok(html.includes("synthetic draft &lt;script&gt;"));
  assert.ok(html.includes("Shift+Enter 换行")); assert.ok(!html.includes("发送、附件和群聊尚未开放"));
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="添加附件/);
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="群聊/);
  assert.doesNotMatch(html, /原版聊天入口|对方已读|synthetic-render-csrf/);
});

test("actual composer shows sending, uncertainty and explicit retry instead of a fake delivered message", async () => {
  const wait = deferred(); const permissions = { read: true, send: true, invite: false, leave: false };
  const controller = createReadController(config, async (url, init) => init.method === "POST" ? wait.promise
    : response(url.includes("messages") ? messagePage(1, [], { context: context(1, { permissions }) }) : conversationPage([summary(1, { permissions })])));
  await controller.start("/matcher/chat/conversations/1"); controller.editDraft("SYNTHETIC_UNCERTAIN_DRAFT"); const sending = controller.submitDraft();
  const pending = render(controller); assert.ok(pending.includes("正在发送，请勿重复提交")); assert.match(pending, /<textarea[^>]*disabled=""/);
  wait.reject(new Error("synthetic dropped response")); await sending;
  const unknown = render(controller); assert.ok(unknown.includes("发送结果待确认")); assert.ok(unknown.includes("重试原消息")); assert.ok(unknown.includes("放弃重试并编辑"));
  assert.ok(unknown.includes("SYNTHETIC_UNCERTAIN_DRAFT")); assert.equal(controller.snapshot().chat.active.messages.length, 0);
  assert.ok(!unknown.includes(controller.snapshot().draft.clientMessageId));
  controller.suspend(); const cleared = render(controller); assert.ok(!cleared.includes("SYNTHETIC_UNCERTAIN_DRAFT"));
});

test("actual sent feedback follows a persistent receipt and revoked send renders no draft", async () => {
  const permissions = { read: true, send: true, invite: false, leave: false }; let posted;
  const controller = createReadController(config, async (url, init) => {
    if (init.method === "POST") { posted = JSON.parse(init.body); return response(envelope({ client_message_id: posted.client_message_id, replayed: false,
      message: message(1, 1, { body: posted.body }), read_seq: 0, unread_count: 0, context: context(1, { permissions }) }), 201); }
    return response(url.includes("messages") ? messagePage(1, posted ? [message(1, 1, { body: posted.body })] : [], { context: context(1, { permissions }) }) : conversationPage([summary(1, { permissions })]));
  });
  await controller.start("/matcher/chat/conversations/1"); controller.editDraft("SYNTHETIC_CONFIRMED"); await controller.submitDraft();
  const html = render(controller); assert.ok(html.includes("已发送。此状态不代表对方已收到或已读。")); assert.ok(html.includes('data-message-id="101"'));
  assert.equal(controller.snapshot().draft.body, ""); assert.equal(controller.snapshot().chat.active.readSeq, 0);
});
