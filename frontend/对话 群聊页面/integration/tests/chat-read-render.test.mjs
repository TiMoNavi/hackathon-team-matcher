import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { conversationPage, message, messagePage, response, summary, errorEnvelope } from "./chat-test-helpers.mjs";

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
const links = { home: "/dashboard", login: "/user/auth/login", nativeChat: "/mail/mail/index" };
const config = parseReadBootstrap({ schema_version: 2, integration_stage: "read", base_path: "/matcher/chat", api_base: "/api/v1", native_home_url: links.home, native_login_url: links.login, native_chat_url: links.nativeChat, csrf_header: "X-CSRF-Token", csrf_token: "synthetic-render-csrf", actor_id: 7 }, "https://same-origin.invalid");
const render = (controller, pathname = "/matcher/chat") => renderToStaticMarkup(createElement(ReadEntry, { controller, links, pathname }));

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
