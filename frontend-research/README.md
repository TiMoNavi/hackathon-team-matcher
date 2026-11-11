# 前端 UI 方案调研

> **视觉隔离与插件方式（2026-11-11）**：[完整自写前端的比较与插件验收条件](../backend-research/CleanTheme机制与双库插件方案.md)。用户只在不加载原生样式、完全不保留原生美术效果时考虑插件；第 8 节据此约束独立 HTML、资源与全流程，Clean 子主题和局部嵌入不满足该条件。尚未实施或验证隔离。

> **HumHub 接入方式（2026-11-11）**：[原生主题与独立 React 前端比较](../backend-research/HumHub前端复用与双库接入分析.md)。AffectUI / Shadcn UI Kit 是 React 组件资源；保留 HumHub 原生模板时主要转写视觉设计，独立 React 前端则需要 API 与业务规则适配。本轮仅分析，未实施。

> 状态：外部资料调研，非现行产品设计规范；初始调研：2026-11-10；五类产品场景复核：2026-11-11。
> 本目录只记录第三方 UI 站点、组件库与模板的公开事实和组合建议，不代表目标应用已经引入或实现。
> **最新用户选择（2026-11-11）**：AffectUI + Shadcn UI Kit。apple-design Skill 已按要求从本机安装目录移除；Arc UI 等保留为调研对象，不纳入当前组合。镜像入口与 Skill / MCP 用法先读 [第 9 份说明](09-CollectUI使用与双库资源.md)。
> 产品规则、页面树与可访问性要求仍以 [前端主应用交互设计](../docs/前端主应用交互设计.md) 为准；技术选型约束见 [完整方案 v3](../docs/完整方案设计_v3.md)。
> **当前场景选型先读第 8 份复核**：旧稿“没有真人聊天/评论/社交组件”的结论已撤回。Arc UI、Shadcn UI Kit、AffectUI、BeUI Pro、ShadcnSpace 与 React Bits Pro 均有此前遗漏的相关内容。早期价格、数量及绝对化兼容性判断不能直接作为采购或安装结论。

> **接入进展（2026-11-11）**：已通过 Edge 进入账号，并完成双 MCP 连通与 /tmp 组件构建验证。VS Code 自带 Chat 的专用智能体和工作区步骤见 [frontend 使用说明](../frontend/README.md)。

## 为什么做这次调研

目标前端是 **Next.js / React / TypeScript + Tailwind CSS** 的响应式 Web（移动端与 PC 共用业务接口）。在正式确定组件来源前，需要先分清这 21 个站点各自**是什么**：有的是一次性买断的 shadcn 区块市场，有的是 npm 依赖形式的动画引擎，有的是完整后台模板，还有的只是图标库。混用会带来依赖冲突、许可证和主题不一致。

本目录回答五个问题：

1. 每个站点的真实技术栈与安装方式；
2. 它们各自解决什么问题、特色是什么；
3. 哪些可以通用或相互组合、哪些会冲突；
4. 对本项目（活动想法发现与协作平台）应当选什么、不选什么；
5. AI 引导、真人聊天、商城式作品集、论坛评论与提问、滑卡推荐分别能复用哪些具体组件。第 8 份按本轮用户清单的 20 个品牌复核，不把 Figma 另算一个库。

## 文档导航

| 阅读顺序 | 文档 | 内容 |
|---|---|---|
| 1 | [总览对比表](01-总览对比表.md) | 21 个站点一页速查：类型、技术栈、依赖、许可、价格、安装 |
| 2 | [shadcn 生态站点](02-shadcn生态站点.md) | 21st、ReUI、Shadcnblocks、Shadcn Studio、ShadcnSpace、Shadcn UI Kit、Efferd、React Bits |
| 3 | [动画与动效库](03-动画与动效库.md) | Motion、BeUI、Arc UI、BoardUI、AffectUI、MagicUI、ThreeUI |
| 4 | [独立组件库与资源](04-独立组件库与资源.md) | HeroUI v3 / Pro、FlyonUI、Hugeicons、TailAdmin、Aura Build、Figma |
| 5 | [组合方案与选型建议](05-组合方案与选型建议.md) | 技术栈兼容矩阵、组合冲突、推荐组合、许可证与预算 |
| 6 | [Agent Skill 筛选](06-Agent-Skill筛选.md) | 按“是否有面向 AI 编程 Agent 的 skill / MCP”做减法，21 → 15 |
| 7 | [AffectUI 共存矩阵](07-AffectUI共存矩阵.md) | AffectUI 必选前提下，逐个判定谁能共存、谁与谁重叠 |
| 8（场景事实复核） | [五类场景选型与社交缺口复核](08-社交场景组件缺口.md) | 20 站逐项复核；保留原候选对比，当前选择以第 9 份为准 |
| 9（当前使用入口） | [CollectUI 使用与双库资源](09-CollectUI使用与双库资源.md) | 用户选定 AffectUI + Shadcn UI Kit；镜像、AI Tools、Skill / MCP、源码与核验范围 |
| 10（三种升级路线） | [HumHub 三种前端升级路线与本地模板适配](10-HumHub三种前端升级路线与本地模板适配.md) | 原生升级、独立前端插件、重做前端的源码兼容、部署边界及实施步骤 |


## 站点分类速览

按“站点实际提供什么”分类，而不是按宣传语分类：

| 分类 | 站点 | 本质 |
|---|---|---|
| shadcn 区块 / 注册表市场 | 21st、ReUI、Shadcnblocks、Shadcn Studio、ShadcnSpace、Shadcn UI Kit、Efferd、React Bits Pro、Arc UI、BeUI、BoardUI、AffectUI | 买断制，代码通过 shadcn CLI 复制进你的仓库，不是 npm 依赖 |
| npm 形式的开源依赖 | Motion、HeroUI v3、FlyonUI、Hugeicons 图标包 | 作为依赖安装，跟随版本升级 |
| 完整后台 / 站点模板 | TailAdmin、Shadcnblocks 模板层、Shadcn Studio 模板层、BeUI Pro 模板 | 整站或整后台起步代码 |
| 动效 / 图形特效片段 | React Bits、MagicUI、AffectUI、ThreeUI | 动画组件与背景效果，偏装饰 |
| AI 生成 / 设计工具 | Aura Build、Figma 相关套件、各站 MCP / AI 工具 | 不是运行时依赖，用于出稿或生成页面 |

## 与本项目的直接关系

- 本项目的核心界面是**列表、卡片、表单、消息、状态反馈**，不是营销落地页。因此 shadcn 生态的 **App UI / 后台区块**比 **Landing Page 区块**更有价值。
- 页面明确要求**减少动态效果时取消弹幕和卡片大位移**，所以动效库只能用于增强，不能承载信息。
- 需要在 320px 窄屏到宽屏之间保持同一套业务流程，**复制进仓库的源码型组件**比 npm 依赖型更容易做局部改造。
- 产品内存在大量 AI 任务状态展示（queued / running / succeeded / superseded），AffectUI、BoardUI、ReUI 的 Agent 类组件在这一块参考价值最高。
