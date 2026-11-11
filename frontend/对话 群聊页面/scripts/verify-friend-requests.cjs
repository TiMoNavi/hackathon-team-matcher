const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "../../../backend/.runtime/browser/node_modules/playwright",
);
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");
const root = path.resolve(__dirname, "..");
const origin = process.env.PREVIEW_URL || "http://127.0.0.1:4202";
const report = { checks: [], geometry: [], errors: [] };
const filename = path.join(root, "lib/friend-requests.ts");
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
});
const fixtureModule = new Module(filename);
fixtureModule._compile(compiled.outputText, filename);
const { initialFriendRequests, transitionFriendRequest } =
  fixtureModule.exports;
const incoming = initialFriendRequests[0];
const accepted = transitionFriendRequest(incoming, "accept", 1);
assert.equal(accepted.status, "accepted");
assert.equal(accepted.version, 2);
assert.equal(transitionFriendRequest(incoming, "accept", 99), null);
assert.equal(transitionFriendRequest(accepted, "accept", 1), null);
assert.equal(transitionFriendRequest(incoming, "withdraw", 1), null);
assert.equal(
  transitionFriendRequest(initialFriendRequests[3], "accept", 1),
  null,
);
assert.equal(
  transitionFriendRequest(initialFriendRequests[4], "accept", 2),
  null,
);
report.checks.push("申请版本、过期状态、重复操作和收发方向校验");
// Verify the real in-memory store without adding a test hook to the app.
const storeFile = path.join(root, "lib/conversations.ts");
const storeModule = new Module(storeFile);
storeModule.paths = module.paths;
const originalRequire = storeModule.require.bind(storeModule);
storeModule.require = (id) =>
  id === "@/lib/friend-requests" ? fixtureModule.exports : originalRequire(id);
storeModule._compile(
  ts.transpileModule(fs.readFileSync(storeFile, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText,
  storeFile,
);
const store = storeModule.exports.useConversations;
assert.equal(store.getState().openDirect("lu"), "");
assert.equal(store.getState().chats.length, 6);
assert.equal(
  store.getState().resolveFriendRequest("request-lu", "accept", 1).ok,
  true,
);
assert.equal(
  store.getState().resolveFriendRequest("request-lu", "accept", 1).ok,
  false,
);
assert.equal(
  store.getState().chats.filter((chat) => chat.id === "lu").length,
  1,
);
assert.equal(
  store.getState().chats.find((chat) => chat.id === "lu").messages.length,
  0,
);
assert.equal(
  store.getState().contacts.filter((person) => person.id === "lu").length,
  1,
);
assert.equal(
  store.getState().resolveFriendRequest("request-gu", "decline", 1).ok,
  true,
);
assert.equal(store.getState().openDirect("gu"), "");
report.checks.push(
  "未接受不能开启私聊；接受原子更新好友及唯一空会话；婉拒不创建好友",
);
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
    page.on("console", (msg) => {
      if (msg.type() === "error") report.errors.push(msg.text());
    });
    const shot = async (name) => {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: path.join(root, "docs/screenshots", name + ".png"),
        fullPage: true,
      });
    };
    const open = () =>
      page.getByRole("button", { name: /^查看好友申请/ }).click();
    const drawer = page.locator(".friend-requests-drawer");
    await page.goto(origin, { waitUntil: "networkidle" });
    assert.equal(
      await page
        .locator("html")
        .evaluate((el) => el.classList.contains("dark")),
      false,
    );
    assert.equal(await page.locator(".chat-list-item").count(), 6);
    assert(
      await page
        .getByRole("button", { name: "查看好友申请，3 条待确认" })
        .isVisible(),
    );
    await shot("friends-entry-light-1440");
    await page.getByLabel("输入消息", { exact: true }).fill("保留当前会话草稿");
    await open();
    assert.equal(await drawer.locator(".friend-request-card").count(), 3);
    await shot("friend-requests-light-1440");
    await drawer.getByRole("button", { name: "查看陆遥的简介" }).click();
    assert(await drawer.locator("#bio-request-lu").isVisible());
    await drawer.getByRole("button", { name: "收起陆遥的简介" }).click();
    assert(!(await drawer.locator("#bio-request-lu").isVisible()));
    await drawer.getByRole("button", { name: "接受陆遥的好友申请" }).click();
    assert.equal(await drawer.locator(".friend-request-card").count(), 2);
    assert(await drawer.locator(".friend-accepted-banner").isVisible());
    await drawer
      .locator(".friend-accepted-banner")
      .getByRole("button", { name: "开始聊天" })
      .click();
    assert.equal(await page.locator(".thread-heading h2").innerText(), "陆遥");
    assert.equal(await page.getByTestId("message").count(), 0);
    await page.getByRole("button", { name: "写一句开场白" }).click();
    assert.equal(
      await page.getByLabel("输入消息", { exact: true }).inputValue(),
      "你好，陆遥，很高兴认识你！",
    );
    assert.equal(await page.getByTestId("message").count(), 0);
    await page.getByRole("button", { name: "发送", exact: true }).click();
    assert.equal(await page.getByTestId("message").count(), 1);
    await page.getByTestId("chat-weekend").click();
    assert.equal(
      await page.getByLabel("输入消息", { exact: true }).inputValue(),
      "保留当前会话草稿",
    );
    assert(
      await page
        .getByRole("button", { name: "查看好友申请，2 条待确认" })
        .isVisible(),
    );
    report.checks.push(
      "入口计数、展开简介、接受后进入新私聊、主动发送与原草稿保留",
    );
    await open();
    await drawer.getByRole("button", { name: "婉拒顾言的好友申请" }).click();
    assert.equal(await drawer.locator(".friend-request-card").count(), 1);
    await drawer.getByRole("button", { name: /^已发出/ }).click();
    assert.equal(await drawer.locator(".friend-request-card").count(), 1);
    assert.equal(await drawer.getByRole("button", { name: /接受/ }).count(), 0);
    await drawer
      .getByRole("button", { name: "撤回发给乔木的好友申请" })
      .click();
    assert(await drawer.getByText("没有正在等待的申请").isVisible());
    await drawer.getByRole("button", { name: /^已处理/ }).click();
    assert.equal(await drawer.locator(".friend-request-card").count(), 4);
    assert.equal(
      await page
        .getByTestId("request-ye")
        .getByRole("button", { name: /接受/ })
        .count(),
      0,
    );
    await drawer.getByRole("button", { name: "与陆遥开始聊天" }).click();
    assert.equal(await page.getByTestId("chat-lu").count(), 1);
    assert.equal(await page.getByTestId("message").count(), 1);
    report.checks.push("婉拒、发出申请撤回、过期记录和已接受会话复用");
    await open();
    await drawer.getByRole("button", { name: /^收到的/ }).click();
    await drawer.getByRole("button", { name: "接受孟晚的好友申请" }).click();
    assert(await drawer.getByText("暂时没有待确认的申请").isVisible());
    await drawer.getByRole("button", { name: "关闭好友申请" }).click();
    assert.equal(await page.locator(".friend-rail-badge").count(), 0);
    assert.equal(await page.getByTestId("chat-meng").count(), 1);
    report.checks.push("合法广场来源可接受；清空待办后计数和空状态更新");
    await page.reload({ waitUntil: "networkidle" });
    assert(
      await page
        .getByRole("button", { name: "查看好友申请，3 条待确认" })
        .isVisible(),
    );
    await page.getByRole("button", { name: "切换至夜间模式" }).click();
    await page.waitForFunction(() =>
      document.documentElement.classList.contains("dark"),
    );
    await open();
    await shot("friend-requests-dark-1440");
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden" });
    assert(
      await page
        .getByRole("button", { name: /^查看好友申请/ })
        .evaluate((el) => document.activeElement === el),
    );
    report.checks.push("刷新恢复演示数据；夜间主题、Escape 关闭和入口焦点恢复");
    for (const [width, height] of [
      [390, 844],
      [320, 568],
      [768, 900],
      [390, 420],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(origin, { waitUntil: "networkidle" });
      await page.getByTestId('chat-weekend').click();
      await page.getByRole('button', { name: '返回会话列表' }).click();
      for (const theme of ["dark", "light"]) {
        if (theme === "light") {
          await page.getByRole("button", { name: "切换至日间模式" }).click();
          await page.waitForFunction(() =>
            document.documentElement.classList.contains("light"),
          );
        }
        const rail = await page.locator(".navigation-rail").boundingBox();
        assert(rail && rail.y + rail.height <= height);
        await open();
        const box = await drawer.boundingBox();
        const geometry = await page.evaluate(() => {
          const viewport = document.querySelector(
            ".friend-requests-scroll [data-slot=scroll-area-viewport]",
          );
          return {
            width: innerWidth,
            height: innerHeight,
            documentWidth: document.documentElement.scrollWidth,
            scrollHeight: viewport.scrollHeight,
            clientHeight: viewport.clientHeight,
          };
        });
        report.geometry.push({ theme, ...geometry, drawer: box });
        assert(geometry.documentWidth <= width);
        assert(box.x >= 0 && box.x + box.width <= width);
        assert(geometry.clientHeight > 30);
        await drawer
          .getByRole("button", { name: "接受孟晚的好友申请" })
          .scrollIntoViewIfNeeded();
        assert(
          await drawer
            .getByRole("button", { name: "接受孟晚的好友申请" })
            .isVisible(),
        );
        if (width === 390 && height === 844) {
          await drawer
            .locator(".friend-requests-scroll [data-slot=scroll-area-viewport]")
            .evaluate((el) => (el.scrollTop = 0));
          await shot("friend-requests-" + theme + "-390");
        }
        await page.keyboard.press("Escape");
        await drawer.waitFor({ state: "hidden" });
      }
      await page.getByRole("button", { name: "切换至夜间模式" }).click();
      await page.waitForFunction(() =>
        document.documentElement.classList.contains("dark"),
      );
    }
    report.checks.push(
      "手机/平板两种主题无溢出，申请独立滚动，短屏可访问底部操作",
    );
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(
      path.join(root, "docs/friend-requests-verification.json"),
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
