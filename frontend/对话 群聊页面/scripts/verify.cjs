const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "../../../backend/.runtime/browser/node_modules/playwright",
);
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const origin = process.env.PREVIEW_URL || "http://127.0.0.1:4202";
const report = {
  checks: [],
  fonts: {},
  errors: [],
  failedResponses: [],
  layout: [],
};
function passed(check) {
  report.checks.push(check);
}
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    page.on("pageerror", (error) => report.errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400)
        report.failedResponses.push({
          url: response.url(),
          status: response.status(),
        });
    });
    await page.goto(`${origin}/groups`, { waitUntil: "networkidle" });
    assert.equal(await page.locator(".chat-list-item").count(), 2);
    await page.goto(`${origin}/direct`, { waitUntil: "networkidle" });
    assert.equal(await page.locator(".chat-list-item").count(), 4);
    assert.equal(
      await page.locator(".thread-heading h2").innerText(),
      "林小满",
    );
    passed("群聊和私聊独立路由及初始筛选");
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const documentNode = await cdp.send("DOM.getDocument");
    for (const [name, selector] of [
      ["body", ".keyboard-hint"],
      ["brand", ".brand-link .font-heading"],
    ]) {
      const { nodeId } = await cdp.send("DOM.querySelector", {
        nodeId: documentNode.root.nodeId,
        selector,
      });
      report.fonts[name] = (
        await cdp.send("CSS.getPlatformFontsForNode", { nodeId })
      ).fonts;
    }
    assert(
      report.fonts.body.some(
        (font) => /Inter/i.test(font.familyName) && font.isCustomFont,
      ),
    );
    assert(
      report.fonts.brand.some(
        (font) => /Bricolage/i.test(font.familyName) && font.isCustomFont,
      ),
    );
    assert(
      report.fonts.brand.some((font) => /PingFang/i.test(font.familyName)),
    );
    passed("实际渲染 Inter、Bricolage Grotesque 及中文 PingFang 字形");
    await page.getByLabel("搜索会话").fill("找不到的会话");
    assert.equal(await page.locator(".chat-list-item").count(), 0);
    assert(await page.getByText("没有找到这个会话").isVisible());
    await page.getByRole("button", { name: "清除搜索" }).click();
    assert.equal(await page.locator(".chat-list-item").count(), 6);
    await page.getByRole("button", { name: "私聊", exact: true }).click();
    assert.equal(await page.locator(".chat-list-item").count(), 4);
    await page.getByRole("button", { name: "全部", exact: true }).click();
    passed("搜索、无结果、清空搜索和分类筛选");
    const input = page.getByLabel("输入消息", { exact: true });
    const send = page.getByRole("button", { name: "发送", exact: true });
    assert(await send.isDisabled());
    await input.fill("群聊草稿独立保留");
    await page.getByTestId("chat-lin").click();
    assert.equal(await input.inputValue(), "");
    await input.fill("私聊草稿独立保留");
    await page.getByTestId("chat-weekend").click();
    assert.equal(await input.inputValue(), "群聊草稿独立保留");
    const previousCount = await page.getByTestId("message").count();
    await input.press("Enter");
    assert.equal(await page.getByTestId("message").count(), previousCount + 1);
    assert.equal(await input.inputValue(), "");
    assert(await send.isDisabled());
    await page.getByTestId("chat-lin").click();
    assert.equal(await input.inputValue(), "私聊草稿独立保留");
    assert.equal(
      await page
        .locator(".message-history")
        .getByText("群聊草稿独立保留")
        .count(),
      0,
    );
    await input.fill("第一行");
    await input.press("Shift+Enter");
    await input.press("a");
    assert.equal(
      await input.inputValue(),
      "第一行" + String.fromCharCode(10) + "a",
    );
    const countBeforeIME = await page.getByTestId("message").count();
    await input.evaluate((el) =>
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          isComposing: true,
          bubbles: true,
        }),
      ),
    );
    assert.equal(await page.getByTestId("message").count(), countBeforeIME);
    await input.fill("   ");
    assert(await send.isDisabled());
    await input.fill("");
    passed("分会话草稿、回车发送、换行、中文输入法保护、空消息阻止及消息隔离");
    await page.getByRole("button", { name: "插入表情" }).click();
    await page.getByRole("button", { name: "挥手", exact: true }).click();
    assert.equal(await input.inputValue(), "👋");
    await page.keyboard.press("Escape");
    await input.fill("");
    const fileInput = page.getByLabel("选择附件");
    const file = {
      name: "验收附件.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("本地演示附件"),
    };
    await fileInput.setInputFiles(file);
    assert(await page.locator(".pending-file").isVisible());
    await page.getByTestId("chat-weekend").click();
    assert.equal(await page.locator(".pending-file").count(), 0);
    await page.getByTestId("chat-lin").click();
    assert(await page.locator(".pending-file").isVisible());
    await page.getByRole("button", { name: "移除附件" }).click();
    assert.equal(await page.locator(".pending-file").count(), 0);
    await fileInput.setInputFiles(file);
    await send.click();
    const downloadPromise = page.waitForEvent("download");
    await page
      .locator(".message-history a")
      .filter({ hasText: "验收附件.txt" })
      .click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), file.name);
    assert.equal(await download.failure(), null);
    passed("表情插入、分会话附件、移除、附件发送及本地下载");
    await page.getByTestId("chat-weekend").click();
    await page.getByRole("button", { name: "查看群聊详情" }).click();
    const drawer = page.locator(".details-drawer");
    assert.equal(await drawer.locator(".member-row").count(), 4);
    await drawer.getByRole("button", { name: "置顶会话", exact: true }).click();
    assert.equal(
      await drawer
        .getByRole("button", { name: "置顶会话", exact: true })
        .getAttribute("aria-pressed"),
      "false",
    );
    await drawer.getByRole("button", { name: "消息免打扰（演示）" }).click();
    assert.equal(
      await drawer
        .getByRole("button", { name: "消息免打扰（演示）" })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    passed("群详情成员、置顶、免打扰演示与 Escape 关闭");
    await page.getByRole("button", { name: "新建会话", exact: true }).click();
    const create = page.getByRole("button", { name: "创建演示群聊" });
    assert(await create.isDisabled());
    await page.getByLabel("群聊名称", { exact: true }).fill("一起造点东西");
    await page.getByLabel("选择林小满").check();
    assert(await create.isDisabled());
    await page.getByLabel("选择陈序").check();
    assert(await create.isEnabled());
    await create.click();
    assert.equal(
      await page.locator(".thread-heading h2").innerText(),
      "一起造点东西",
    );
    assert.equal(await page.getByTestId("message").count(), 0);
    await page.getByRole("button", { name: "写一句开场白" }).click();
    assert.equal(await input.inputValue(), "大家好，很高兴和你们一起开工！");
    assert.equal(await page.getByTestId("message").count(), 0);
    await send.click();
    assert.equal(await page.getByTestId("message").count(), 1);
    passed("建群名称和人数验证、创建空群、主动开场后发送");
    await page.getByRole("button", { name: "新建会话", exact: true }).click();
    await page.getByRole("button", { name: "发起私聊", exact: true }).click();
    await page.getByRole("button", { name: "唐可 创意开发" }).click();
    assert.equal(await page.locator(".thread-heading h2").innerText(), "唐可");
    assert.equal(await page.getByTestId("message").count(), 0);
    passed("选择演示联系人开启新私聊");
    for (const [width, height] of [
      [1440, 900],
      [1024, 768],
      [768, 900],
      [390, 844],
      [320, 568],
      [390, 420],
      [768, 500],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(origin, { waitUntil: "networkidle" });
      if (width < 1024) {
        assert(await page.locator(".conversation-list").isVisible());
        assert(!(await page.locator(".active-conversation").isVisible()));
      }
      await page.getByTestId("chat-weekend").click();
      const layout = await page.evaluate(() => {
        const rect = document
          .querySelector(".message-composer")
          .getBoundingClientRect();
        const area = document.querySelector(
          ".messages-scroll [data-slot=scroll-area-viewport]",
        );
        return {
          width: innerWidth,
          height: innerHeight,
          documentWidth: document.documentElement.scrollWidth,
          composerBottom: rect.bottom,
          composerTop: rect.top,
          messageViewportHeight: area.clientHeight,
          messageContentHeight: area.scrollHeight,
        };
      });
      report.layout.push(layout);
      assert(layout.documentWidth <= width);
      assert(layout.composerBottom <= height);
      assert(layout.messageViewportHeight > 10);
      if (width < 1024) {
        await page.getByRole("button", { name: "返回会话列表" }).click();
        assert(await page.locator(".conversation-list").isVisible());
        await page.getByTestId("chat-weekend").focus();
        await page.keyboard.press("Enter");
        assert(await page.locator(".active-conversation").isVisible());
        await page.getByRole("button", { name: "查看群聊详情" }).click();
        const box = await page.locator(".details-drawer").boundingBox();
        assert(box.x >= 0 && box.x + box.width <= width);
        await page.keyboard.press("Escape");
      }
    }
    passed(
      "7 组屏幕尺寸：横向不溢出、输入区可见、消息滚动区可用、窄屏返回与键盘打开会话",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page
        .locator(".atmosphere-wash")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByRole("button", { name: "暂停背景动效" }).click();
    assert.equal(
      await page
        .locator(".atmosphere-wash")
        .evaluate((el) => getComputedStyle(el).animationPlayState),
      "paused",
    );
    passed("系统减少动效与手动暂停");
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator(".chat-list-item").count(), 6);
    passed("刷新恢复虚构初始会话，不冒充持久化");
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.failedResponses, []);
    passed("全程无浏览器运行时异常或失败 HTTP 响应");
    fs.writeFileSync(
      path.resolve(__dirname, "../docs/verification-report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
