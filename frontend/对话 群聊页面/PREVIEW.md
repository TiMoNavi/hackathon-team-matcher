# 本地预览

日期：2026-11-12。项目目录为 `/Users/550m/code/hackathon-team-matcher/frontend/对话 群聊页面`。

```sh
cd '/Users/550m/code/hackathon-team-matcher/frontend/对话 群聊页面'
npx --yes pnpm@11.21.0 install --frozen-lockfile
npm run dev
```

默认监听 `127.0.0.1:4202`，浏览器打开 `http://127.0.0.1:4202/`。使用 `Ctrl+C` 停止。端口若被旧预览占用，先确认并停止旧进程。

群聊入口 `/groups`，私聊入口 `/direct`。三者使用同一套页面组件和虚构数据。刷新或重新载入路由恢复初始会话。移动端通过会话行进入聊天，左上返回箭头回到列表。

首页入口是 `http://127.0.0.1:4200/`，原版 Soho 对照是 `http://127.0.0.1:4197/`。这两个项目分别启动，方式见 [首页预览](../首页/PREVIEW.md) 与 [Soho 原版预览](../experiments/soho-original-preview/PREVIEW.md)。

生产构建检查：

```sh
npm run build
npm run start
```

`start` 同样使用端口 4202，不能与本项目的 dev 服务同时占用。

浏览器截图和验收脚本使用项目既有的 Playwright 工具安装，不将浏览器依赖加入页面运行包：

```sh
CHROMIUM_PATH='/Users/550m/Library/Caches/ms-playwright/chromium-1248/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node scripts/verify.cjs
CHROMIUM_PATH='/Users/550m/Library/Caches/ms-playwright/chromium-1248/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node scripts/capture.cjs
```

迁移到其他机器时，通过 `PLAYWRIGHT_MODULE` 指定 Playwright 模块路径；`CHROMIUM_PATH` 可指定本地 Chromium，未设置则使用 Playwright 默认浏览器；`PREVIEW_URL` 可覆盖测试地址。字体检验针对本次 macOS 环境，其他系统的中文后备字体可能不同。
