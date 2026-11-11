# Soho 完整原版预览

2026-11-11，按用户指定保留 Soho 原版英文、字体、布局和主题，作为对话界面参考。

- 源码：`../../vendor/shadcnuikit/templates/soho-nextjs/`，87 份原始文件。
- 本机入口：`http://127.0.0.1:4197/`。
- [布局记录](../../design-system/team-matcher/pages/chat.md) / [快照与来源](../../design-system/team-matcher/references/soho/README.md)。

## 启动

在本目录执行：

```sh
npx --yes pnpm@11.21.0 install --frozen-lockfile
node preview.cjs
```

依赖按原锁文件安装，只在独立副本运行。模板为前端演示，未接入本项目后端；头像与部分媒体仍需网络。

## 原版字体缓存

本机直接请求 Google Fonts 发生连接失败，默认启动会退回系统字体。为保持原版显示，已从 Soho 官方演示下载同一套 DM Sans / Geist Mono 字体文件，来源与 SHA-256 见 [font-sources.json](reference-assets/font-sources.json)。

`preview.cjs` 使用 Webpack 和当前锁定 Next.js 的 `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` 字体加载测试入口，给原 `next/font/google` 调用提供真实缓存 CSS 与字体字节。这个入口仅用于本机参考预览，未改模板字体声明、主题、87 份原始文件或锁文件，也没有用伪造字体内容替代。升级 Next.js 后需要重新核对兼容性。

缓存只覆盖字体，不是整站离线镜像；静态截图可以离线查看，渲染 HTML 留作 DOM 记录。

镜像详情页本次匿名请求返回 `login_required`。源码来自用户之前下载并已校验的快照，本次没有把登录响应当成页面快照，也没有覆盖 vendor 工程。

## 验证结果

原始 87 份文件逐份 SHA-256 一致；TypeScript 检查通过。1440、768、390、320px 均完成列表 / 会话快照与溢出检查，验证搜索、本地演示发送和窄屏返回；真实绘制字体为 DM Sans。详情见快照目录的 [检查报告](../../design-system/team-matcher/references/soho/browser-verification.json)。
