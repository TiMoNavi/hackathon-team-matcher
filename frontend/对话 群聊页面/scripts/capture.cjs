const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "../../../backend/.runtime/browser/node_modules/playwright",
);
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
const screenshots = path.join(root, "docs/screenshots");
const origin = process.env.PREVIEW_URL || "http://127.0.0.1:4202";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  fs.mkdirSync(screenshots, { recursive: true });
  const shots = [];
  async function capture(name) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: path.join(screenshots, `${name}.png`),
      fullPage: true,
    });
    const geometry = await page.evaluate(() => {
      const shell = document
        .querySelector(".conversation-shell")
        .getBoundingClientRect();
      const composer = document
        .querySelector(".message-composer")
        .getBoundingClientRect();
      return {
        viewport: { width: innerWidth, height: innerHeight },
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        shell: {
          x: shell.x,
          y: shell.y,
          width: shell.width,
          height: shell.height,
        },
        composer: { top: composer.top, bottom: composer.bottom },
      };
    });
    shots.push({ name, ...geometry });
  }
  await page.goto(origin, { waitUntil: "networkidle" });
  await capture("desktop-group-1440");
  await page.getByRole("button", { name: "查看群聊详情" }).click();
  await page.getByRole("button", { name: "关闭详情" }).waitFor();
  await capture("desktop-group-details-1440");
  await page.keyboard.press("Escape");
  await page.getByTestId("chat-lin").click();
  await capture("desktop-direct-1440");
  for (const width of [1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 });
    await page.goto(origin, { waitUntil: "networkidle" });
    await capture(`list-${width}`);
    await page.getByTestId("chat-weekend").click();
    await capture(`group-${width}`);
    if (width < 1024) {
      await page.getByRole("button", { name: "返回会话列表" }).click();
    }
    await page.getByTestId("chat-lin").click();
    await capture(`direct-${width}`);
  }
  fs.writeFileSync(
    path.join(root, "docs/screenshot-report.json"),
    JSON.stringify({ shots, errors }, null, 2),
  );
  console.log(JSON.stringify({ shots, errors }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
