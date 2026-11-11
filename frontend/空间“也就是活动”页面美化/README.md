# 周末造物场 · 活动页面

独立的黑客松活动页设计预览，2026-11-12。视觉继承 [首页](../首页/README.md) 与 [Signalry 规范](../design-system/team-matcher/MASTER.md)。页面、素材、说明和验证记录均在当前目录。

## 打开预览

本机地址：<http://127.0.0.1:4201/>。

~~~sh
# 开发预览
npm run dev

# 生产预览
npm run build
npm run start
~~~

默认绑定本机 127.0.0.1:4201，不向局域网开放。首次启动前如需恢复依赖，使用 package.json 指定的包管理器安装；当前 node_modules 从首页依赖独立复制，未修改首页。

## 页面与交互

- **概览**：活动风采首屏、精选照片、近期讨论、日程摘要与同场伙伴。
- **论坛**：话题筛选、关键词搜索、图文帖子、点赞、评论和发帖；卡片显示最新回复摘要，详情支持引用回复与多行输入，关闭后保留草稿与引用对象。
- **日程**：两天议程、详情与单项参与标记，和活动成员关系分开处理。
- **风采**：相册、大图与前后切换，支持左右方向键、Escape 和焦点恢复。
- **人物**：首屏、帖子、回复和伙伴列表的头像或姓名可点击，展开简介、技能与本场合作意向；个人主页入口在新标签页打开对应人物，保留原窗口的草稿。
- **手机**：单列内容、完整四标签、日程速览和折叠主导航；资料卡支持触控与屏幕边界避让。
- **预览设置**：页尾切换已加入、受邀、无资格、归档只读，及空内容、加载失败场景。

页面中的发现入口打开同场人物演示；消息入口呈现明确的空会话状态；个人入口显示当前演示身份。本目录的 /people/0 至 /people/6 是匹配人物的独立演示主页，展示现有基础字段与初始活动帖子。它没有连接旁边个人资料专项的固定人物页面，也不代表完整个人资料编辑已接通。

## 组件来源

本轮使用 shadcnuikit 与 frontend-design 进行组件挑选与页面设计，使用 ui-ux-pro-max 的焦点与触控建议辅助检查。所有通用建议服从 Signalry。

| 页面部分 | 来源与处理 |
| --- | --- |
| 导航、首屏和宽窄比例 | Signalry SiteHeader、Hero、Features；1248px 容器、24px 面板与同款主题 |
| 字体 | 首页的同款 Bricolage Grotesque / Inter WOFF2，本地托管；中文独立检查 |
| 基础 UI | 原样复制 Signalry 的 Button、Card、Dialog、Input、Badge、Tabs、Label、Separator |
| 帖子 | Kit social-media-post1，保留作者/正文/图片/互动层级，适配活动内容和 Signalry 主题 |
| 人物资料卡 | Kit avatar15 点击式 Popover，采用 card9 封面和头像层次；以当前活动人物 ID 对应资料 |
| 回帖 | Kit chat-bubble2 的头像、消息气泡和时间布局，适配为论坛回复与引用 |
| 演示个人主页 | Kit card9 个人信息卡，复用当前人物和本场初始帖子 |
| 日程 | Kit event-calendar1 的 AgendaView，保留分日期、议程项和点击详情的组织方式 |
| 标签 | AffectUI segmented-control，局部修正 React ref 同步方式，外层映射主题和手机尺寸 |
| 展示动效 | 首页已适配 AffectUI gradient-floor、tilt-card；全页暂停与减少动态效果 |

完整选型见 [组件选型](docs/组件选型.md)，视觉方案见 [设计方向](docs/设计方向.md)，来源指纹见 [sources.json](docs/sources.json)，Kit 查阅源码保存在 [sources](docs/sources/)。新增 Popover 基础组件原样来自 Kit 返回源码；原有 8 个 Signalry 基础组件保持不变。所有视觉适配放在业务组件与 app/event-polish.css。

## 演示边界

人物、活动、地点、帖子和日程均为虚构示例。照片是公开氛围素材，来源记录于 [photo-sources.json](docs/photo-sources.json)，不代表本场真实现场或参与者。

- 所有互动仅修改当前页面内存，刷新恢复初始数据。
- 没有连接后端、调用模型、发送消息、创建真实成员关系或发布真实帖子。
- 日程摘要的示例时钟固定在 2026-11-14 14:30，界面注明演示时间。
- 资格状态与归档状态用于检查前端表现，不能代替服务端鉴权。
- 页面接入仍需活动元数据、受控媒体列表、认证及权限适配，见 [活动页面分析](活动页面分析.md)。

业务规则继续以 [主应用交互设计](../../docs/前端主应用交互设计.md) 和 [共享契约](../../docs/共享数据与接口契约.md) 为准。本目录不复制另一套后端契约。

## 验证

~~~sh
npm run typecheck
npm run lint
npm run build

# 测试需 Playwright 与 Chromium；可通过环境变量指定本机安装
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_EXECUTABLE=/path/to/chromium node scripts/verify.mjs
~~~

浏览器结果见 [verification.json](docs/verification.json)，涵盖五种屏宽、真实字体、论坛与日程交互、状态变化及错误恢复。最终截图位于 [docs/screenshots/final](docs/screenshots/final/)，本次资料卡、回复与主页细节见 [docs/screenshots/polish](docs/screenshots/polish/)。

继承的 Next.js 16.4.0 在构建时报告已知安全漏洞提示。本次完成本机设计预览，未扩大到依赖升级；正式部署前需在此独立目录升级依赖并重新验证，不能将当前预览直接作为生产部署。

## 本轮结果

TypeScript、ESLint 与生产构建通过；主页面 61 项、触控与动效 14 项、本轮资料卡与回复专项 40 项检查通过，详情以各 JSON 记录为准。覆盖 1440、1024、768、390、320px，四个活动标签均无页面横向溢出。CDP 确认 Bricolage Grotesque、Inter、PingFang SC 实际用于渲染。浏览器没有运行异常、控制台错误或 HTTP 失败。8 个基础 UI 文件与 Signalry 原版逐文件一致。

触控记录见 [touch-verification.json](docs/touch-verification.json)。这不代表后端联调、完整跨浏览器或生产安全验收已经完成。

## 背景、回帖与头像细化

详见 [本轮设计与交互记录](docs/背景回帖与头像细化.md)。新增检查脚本 scripts/verify-polish.mjs；结果写入 [polish-verification.json](docs/polish-verification.json)。
