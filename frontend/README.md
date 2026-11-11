# 前端说明

> 当前要求：核心页面的风格与布局规则按照 **Signalry 完整原模板** 执行。用户于 2026-11-11 查看原版后确认。

## 先看这三个入口

| 入口 | 用途 |
| --- | --- |
| [完整原版预览](experiments/signalry-original-preview/PREVIEW.md) | 查看真实的原版首页与登录页，包含字体、布局和动画 |
| [核心页面风格与布局规范](design-system/team-matcher/MASTER.md) | 后续页面的统一设计依据 |
| [前端实施要求](前端实验结论与实施要求.md) | 组件复用、业务适配与验收方式 |

原版预览首页为 `http://127.0.0.1:4196/`，登录展示页为 `http://127.0.0.1:4196/login`。地址仅在本机预览服务运行时有效，启动命令见预览说明。

## 对话布局参考

2026-11-11 用户进一步指定 **Soho Chat App Template** 作为对话界面的布局参考。整体风格继续遵循 Signalry；聊天导航、会话列表、消息区及移动端切换参考 Soho。

- [Soho 完整原版预览与启动说明](experiments/soho-original-preview/PREVIEW.md)，本机入口 `http://127.0.0.1:4197/`。
- [对话布局参考与采用范围](design-system/team-matcher/pages/chat.md)。
- [桌面 / 手机快照与来源记录](design-system/team-matcher/references/soho/)。
- [Soho 原始源码](vendor/shadcnuikit/templates/soho-nextjs/)。

原版预览保留 Soho 自身字体和示例内容用于对照；正式适配使用 Signalry 视觉主题和本项目业务规则。

2026-11-12 用户指定 [对话 群聊页面](对话%20群聊页面/README.md) 为页面产出目录，并要求视觉向相邻「首页」靠拢。该目录已有独立中文私聊 / 群聊演示，入口 `http://127.0.0.1:4202/`；源码、原版参考截图、适配截图和验证记录均在目录内。当前仅为内存演示，未连接消息后端。

## 用户画像引导流程

用户画像采集的前端说明独立整理于 [前端引导流程](用户画像收集——前端/README.md)。包括白色 / 夜间主题、动态渐变、上方 AI 形象、中间引导文字、下方交互内容，以及十阶段页面、组件与动效验证要求。

2026-11-12 用户指定该目录为后续前端产出的固定位置。现有一页以 AffectUI 为主的关键元素交互预览，本地入口为 `http://127.0.0.1:4199/`，启动方式见目录 README。可体验形象、输入、模拟整理、画像编辑、预设对话和日夜模式；尚未连接业务后端，也不代表完整十步已实现。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | AI 编程工具进入此目录时应遵守的约定 |
| [design-system/team-matcher/MASTER.md](design-system/team-matcher/MASTER.md) | 唯一现行视觉和布局规范 |
| [vendor/shadcnuikit/templates/signalry-nextjs](vendor/shadcnuikit/templates/signalry-nextjs/) | 未改动的 Signalry 原始源码快照 |
| [experiments/signalry-original-preview](experiments/signalry-original-preview/) | 原版独立运行副本，作为视觉对照 |
| [TEMPLATES.md](TEMPLATES.md) | 已有双库资源及用途索引 |
| [HumHub 技术实验](experiments/humhub-ui-comparison-2026-11-11/README.md) | 三条前端交付路线的历史验证，不作为当前视觉参考 |

## 执行原则

- 直接复用原版的字体、页面比例、容器、留白、卡片和控件，不能只取配色后另画一套。
- 原版英文标题使用 Bricolage Grotesque，正文使用 Inter；中文实际字形、字重和换行需另外核对。
- 发现、广场、消息、个人及引导页面统一使用同一视觉基准；具体导航、权限和业务行为遵循 [现行交互设计](../docs/前端主应用交互设计.md)。
- 页面/基础组件优先用 Shadcn UI Kit，AffectUI 用于合适的交互补充，二者统一到 Signalry 主题。
- 前端正式业务应用尚未完成。本目录的源码、模板和技术实验不等于真实登录、权限、消息与推荐已经接通。

## 工具配置

保留现有 [工作区文件](collectui-frontend.code-workspace)、[MCP 结构示例](mcp.example.json) 和 [registry 结构示例](registries.example.json)。实际凭据位于被忽略的私有配置，本文不重复记录。不同客户端是否加载 MCP，以该客户端当次实际工具连接为准。

## 历史记录

旧方案、重复安装记录和用户否定的适配样张已收至 [历史归档](../leagcy/frontend/2026-11-11-signalry-baseline/ARCHIVE.md)。它们只供追溯，不得继续作为页面设计依据。冻结原稿及 Signalry 原始源码保持不变。
