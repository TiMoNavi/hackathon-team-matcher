# Soho 对话布局快照

保存日期：2026-11-11（Asia/Shanghai）。用于用户指定的对话布局参考；采用范围见 [chat.md](../../pages/chat.md)。

## 来源

- 用户指定页：<https://uikit.collectui.pro/template/soho-chat-app-template>。本次匿名请求返回 `login_required`，原始响应保存在 `collectui-access-response.json`，不作为页面截图。
- 官方演示：<https://soho.shadcnuikit.com/>。已保存真实浏览器截图、渲染 DOM 和可访问性树。
- 本地原始源码：[soho-nextjs](../../../../vendor/shadcnuikit/templates/soho-nextjs/)，来自用户之前下载的 CollectUI 快照；原归档信息见 [snapshots.json](../../../../vendor/snapshots.json)。
- 独立运行副本：[soho-original-preview](../../../../experiments/soho-original-preview/PREVIEW.md)，入口 `http://127.0.0.1:4197/`。
- 本次复用并验证已有的完整源码，未重复覆盖 vendor。87 份原始文件的 SHA-256 与运行副本一致，详见 [source-manifest.json](source-manifest.json)。

## 截图索引

| 场景 | 官方演示 | 本地预览 |
|---|---|---|
| 1440px 桌面会话 | [官方截图](official-1440-conversation.png) | [本地截图](local-1440-conversation.png) |
| 390px 手机会话 | [官方截图](official-390-conversation.png) | [本地截图](local-390-conversation.png) |
| 桌面未选会话 | [官方截图](official-desktop.png) | [本地截图](local-1440-list.png) |
| 768px 列表 / 会话 | — | [列表](local-768-list.png) / [会话](local-768-conversation.png) |
| 390px 会话列表 | — | [列表](local-390-list.png) |
| 320px 列表 / 会话 | — | [列表](local-320-list.png) / [会话](local-320-conversation.png) |
| 桌面联系人详情 | — | [详情抽屉](local-desktop-profile.png) |

本地截图包含 Next.js 开发角标，它不属于模板的产品导航。所有截图保留原版英文和演示内容，未改为本项目业务数据。

## 已核对

- 按原 `pnpm-lock.yaml` 完成安装，`npm run typecheck` 通过。
- 1440、768、390、320px 四种宽度：列表和会话无横向页面溢出，输入区在视口内。
- 会话搜索、有结果与无结果、选择会话、本地内存消息发送均验证；三个窄屏验证返回会话列表。
- 桌面联系人详情抽屉可以打开并关闭。
- 浏览器实际绘制字体为 DM Sans（CDP 返回 `DM Sans 9pt` 自定义字体），不是只检查 CSS 字体名称。
- 四种宽度无页面脚本异常；可见图片加载完成。音频预加载记录到 `net::ERR_ABORTED`，不声称媒体或通话已完整验收。
- 检查结果保存在 [browser-verification.json](browser-verification.json)。

## 快照边界

PNG 可离线查看。`official-rendered.html` / `local-rendered.html` 是渲染后的 DOM 记录，仍引用原站或本地运行服务资源，不是单文件离线网页；对应 `.yaml` 保存可访问性树。

首次本机运行遇到 Google Fonts 连接失败。现已归档官方演示提供的 8 个真实字体文件，使用独立预览启动器读取，原模板源码不改。缓存来源与哈希见 [font-sources.json](../../../../experiments/soho-original-preview/reference-assets/font-sources.json)，启动和实现说明见 [PREVIEW.md](../../../../experiments/soho-original-preview/PREVIEW.md)。头像、视频和音频仍有外部依赖。

这个目录用于布局与原版效果对照，未接入登录、服务端消息、活动权限、持久化或真实音视频。原版的一些 click div 和无名称图标按钮仍需在正式适配时补齐可访问性，不能视为生产验收通过。
