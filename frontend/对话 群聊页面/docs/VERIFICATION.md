# 页面验收记录

日期：2026-11-12。范围为本机前端演示，不包含后端、真实账号或消息服务。浏览器为本机 Playwright Chromium，系统为 macOS。

## 构建与静态检查

- `npm run build`：通过，生成 `/`、`/direct`、`/groups` 静态入口。
- `npx tsc --noEmit`：通过。
- 对新增页面组件与状态文件运行 ESLint：通过，无错误或警告；没有改动原始 UI 组件来消除模板已有问题。

## 浏览器验证

运行 [verify.cjs](../scripts/verify.cjs)，结果见 [verification-report.json](verification-report.json)。已验证：

1. 群聊和私聊路由、搜索、无结果状态、清空搜索与分类筛选。
2. 按会话独立保留草稿；发送仅更新当前会话；空消息禁发。
3. Enter 发送、Shift + Enter 换行，模拟中文输入法组合状态的 Enter 不触发发送。
4. 表情插入、附件选择与移除、附件随会话隔离、发送后的本地下载。
5. 详情中的成员数量、置顶及免打扰状态、Escape 关闭。
6. 建群时验证群名和至少两位联系人；新群初始为空；开场提示只填入草稿，仍需用户发送。
7. 新联系人私聊创建与空状态。
8. 窄屏返回、会话按钮键盘打开、详情抽屉保持在屏幕内。
9. 系统减少动效与手动暂停；刷新恢复初始虚构数据。
10. 全程未发现浏览器运行时异常或失败 HTTP 响应。

以下尺寸均确认无横向页面溢出，输入区在视口内，消息区仍可独立滚动：

| 视口 | 布局 |
| --- | --- |
| 1440 × 900 | 桌面三栏 |
| 1024 × 768 | 紧凑三栏 |
| 768 × 900 | 列表与聊天切换 |
| 390 × 844 | 手机列表与聊天 |
| 320 × 568 | 小屏手机 |
| 390 × 420 | 缩小可视高度 |
| 768 × 500 | 横向窄高视口 |

缩小视口高度是布局检查，不等于在实体手机上验证软键盘、安全区域或浏览器工具栏变化。输入法检查使用组合按键事件，未替代真人输入法完整测试。

## 字体与参考复用

使用 Chromium CDP `CSS.getPlatformFontsForNode` 读取实际参与渲染的字体：英文正文为本地 Inter，品牌英文为本地 Bricolage Grotesque，中文为系统 PingFang SC。没有只凭 CSS 声明判断字体加载。

33 份 UI 基础组件、字体与头像逐文件 SHA-256 对比原始来源，全部一致，见 [source-integrity.json](source-integrity.json)。

## 快照

最终截图由 [capture.cjs](../scripts/capture.cjs) 生成，几何记录见 [screenshot-report.json](screenshot-report.json)。

- [桌面群聊](screenshots/desktop-group-1440.png)
- [桌面私聊](screenshots/desktop-direct-1440.png)
- [群详情抽屉](screenshots/desktop-group-details-1440.png)
- [手机会话列表](screenshots/list-390.png)
- [手机群聊](screenshots/group-390.png)
- [手机私聊](screenshots/direct-390.png)
- 另有 1024、768 和 320px 宽度快照，存于 [screenshots](screenshots/)。

对照 [首页 V6](references/homepage-v6-1440.png) 和 [Soho 原版](references/README.md) 复核主题、字体、页面比例及窄屏切换。消息区自动滚动到最新消息，截图顶部可能显示被滚动区域裁切的较早消息。

## 日夜模式补充

新增顶部日夜切换，首次访问即使操作系统为夜间也默认日间。手动选择使用独立的 `team-matcher-chat-theme` 浏览器存储键保存，不影响会话数据。使用已有 `next-themes`，HTML 主题同时控制聊天区、抽屉、建群弹窗和表情浮层。

[verify-theme.cjs](../scripts/verify-theme.cjs) 验证了默认主题、切换后草稿保留、跨路由与刷新记忆、键盘切换、门户组件颜色以及 320 / 390 / 768 / 1024 / 1440px 布局；无控制台或 hydration 错误。记录见 [theme-verification.json](theme-verification.json)，效果见 [夜间桌面](screenshots/night-group-1440.png)、[夜间手机](screenshots/night-group-390.png) 与 [夜间建群弹窗](screenshots/night-new-dialog-1440.png)。

## 尚未覆盖的实际业务

最新边框、卡片、文字及背景动效的调整与检查见 [VISUAL_POLISH.md](VISUAL_POLISH.md)，截图位于 `screenshots/polish-v2/`。

好友申请侧栏的后续实现、截图与针对性验证见 [FRIEND_REQUESTS.md](FRIEND_REQUESTS.md)。该功能仍使用内存演示数据，不覆盖下一段所列的真实服务。

真实消息收发、服务器持久化、鉴权、跨活动隔离验证、真实成员邀请、推送通知与多设备同步不在本次演示范围。没有进行完整 WCAG 审计或实体移动设备验收。
