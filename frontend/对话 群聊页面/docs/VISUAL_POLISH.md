# 视觉精修与动效

在用户确认现有功能基本可用后，本轮集中调整边框、卡片、文本、背景与动效。沿用首页的紫色 / 青柠、Bricolage Grotesque / Inter 和 Soho 的对话布局，默认日间及主题记忆继续保留。

## 视觉调整

- 外框采用细微渐变边缘、内侧高光与分层阴影，桌面导航、会话列表和阅读区有不同表面层级。
- 会话选中态增加左侧紫色标记，好友申请入口与卡片使用清晰边界、柔和阴影和统一按钮层级。
- 调整标题字重、正文行高、时间数字与辅助文字的对比度；好友招呼改为左侧细线的引用块，减少重复嵌套边框。
- 消息背景加入低对比点阵；页面外围使用紫色与青柠光晕、浅网格及呼应品牌的弧线。
- 日夜表面通过 `app/polish.css` 中的局部 token 调整；夜间保持文字与操作层次，不反转头像和图片。

## 动效

仅背景光晕持续缓慢移动，周期 28 秒，使用 transform，不逐帧修改布局。其余动效由操作触发：卡片悬停和输入框聚焦反馈、发送图标微移、最新本地消息轻量入场、好友简介展开与接受后的确认反馈。

顶部暂停按钮会停住背景，关闭新增的消息 / 申请反馈动画；页面隐藏时背景也暂停。系统开启减少动态效果时展示静态最终状态。装饰层为 `aria-hidden` 且不拦截鼠标操作，消息文字不持续闪动。

## 来源与实现

使用已加载的 frontend-design 与 ui-ux-pro-max Skill；针对 reduced motion / micro interaction 的本地检索确认了减少动效和克制使用持续动画的指导。视觉方向仍服从用户指定的首页。参考首页 MaterialSurface 的细边、高光和扩散阴影，未引入新组件库、网络素材或依赖。`components/ui` 原始文件不变。

本轮主要修改 `app/polish.css`、页面背景装饰，以及 `conversation-app.tsx` 的动效偏好同步。没有变更好友申请状态规则或消息发送规则。

## 检查与截图

[review-polish.cjs](../scripts/review-polish.cjs) 检查真实背景位置变化、暂停后的静止、减少动效、发送后动画、两种主题及响应式尺寸。结果见 [polish-verification.json](polish-verification.json)。

1024×768、768×900、390×844、320×568 和 390×420 下，两种主题均无横向溢出，输入区可见，好友申请可滚动到底。构建、TypeScript 和改动文件 ESLint 检查通过。浏览器使用本地 Chromium；未进行实体手机或完整 WCAG 审计。

- [桌面日间](screenshots/polish-v2/desktop-day.png)
- [桌面夜间](screenshots/polish-v2/desktop-night.png)
- [日间好友侧栏](screenshots/polish-v2/requests-day.png)
- [夜间好友侧栏](screenshots/polish-v2/requests-night.png)
- [手机日间](screenshots/polish-v2/group-light-390.png)
- [手机夜间](screenshots/polish-v2/group-dark-390.png)

截图采用系统减少动态效果设置，保留静态视觉，实际动效请在本地预览中体验。
