# shadcn 生态站点

> 调研日期：2026-11-10，依据各站官网与文档公开内容。
> 本文所有 8 个站点的共同特征：**代码通过 shadcn CLI 或复制粘贴进入你的仓库，不产生 npm 运行时依赖**。它们不是“组件库”，而是“区块注册表市场”。理解这一点，是理解其余全部差异的前提。

## 一、共同机制：shadcn registry 与 CLI

shadcn/ui 本身不是依赖包，而是“把源码复制进项目”的约定。生态站点沿用这套约定：

```bash
# 官方组件
npx shadcn@latest add button

# 第三方注册表（带命名空间前缀）
npx shadcn@latest add @reui/auth-1
npx shadcn@latest add @shadcnspace/hero-01
npx shadcn@latest add @efferd/auth-1
npx shadcn@latest add @uiarc/button
bunx --bun shadcn add @beui/timeline
```

因此每个站点都必须先满足三个前提：项目已初始化 shadcn/ui、已配置 `components.json`、primitive 选择（Radix UI 或 Base UI）与站点产出一致。安装后文件落在 `components/`，**归你所有**，可自由修改，没有版本升级路径，也没有锁定。

> 补充事实：Shadcnblocks 明确说明同一条目会针对 **Radix UI / Base UI / React Aria** 三种 primitive 分别发布构建，由 `components.json` 决定装哪一套（“One block id, three builds”）。Efferd 与 ShadcnSpace 采用相同的双 primitive 策略。

---

## 二、21st（21st.dev）

| 项目 | 内容 |
|---|---|
| 类型 | 社区注册表：组件、模板、shadcn 主题、着色器、渐变 |
| 技术栈 | React + TypeScript + Tailwind CSS，使用项目自身 design token |
| 兼容框架 | Next.js、Vite、Remix、Astro（任何可跑 React 的地方） |
| 安装 | `npx @21st-dev/cli@latest init --client <cursor\|claude\|codex\|vscode\|devin>`；或复制 AI prompt 交给 Agent |
| 定价 | 免费浏览；每日 2 次免费复制；会员解锁无限复制与作者付费模板；21st AI 为按月信用点的加购项 |

**特色**

- **多作者、多审美**。同一类需求（hero、pricing、testimonial）有大量风格迥异的版本，这是与“单一设计语言的组件库”最大的区别。
- **面向 AI Agent 设计**。提供 `.md` 镜像页、MCP 与 CLI，官方文档明确写了 agent 接入方式（`/ai.md`、`/mcp.md`）。
- 除组件外还有 **shaders（着色器）与 gradients（渐变）**，属于视觉素材层。
- 作者可以上架并直接售卖模板，属于市场机制而非自研商店。

**适用与组合**：适合在已定好设计 token 之后，挑选单个高审美区块；**不适合**作为全站设计系统来源，因为多作者混用会导致风格割裂。与本项目的关系：可用于营销页或少量重点模块，主应用界面不建议依赖它。

---

## 三、ReUI（reui.io）

| 项目 | 内容 |
|---|---|
| 类型 | 建立在 shadcn/ui 之上的 premium 组件库与注册表 |
| 技术栈 | React + Tailwind；自定义 primitive 基于 TanStack Table、dnd-kit |
| 依赖 | shadcn/ui（前缀 `@reui/`） |
| 免费层 | 1264 个 shadcn 组件 + **27 个 ReUI 自定义 primitive**，MIT 许可，永久免费，无需账号 |
| 付费层 | 678 个 Pro 区块（7 组 / 79 类）、667 图标（4 风格 / 2668 变体）、整页模板 |
| 官方背书 | 首页展示了 shadcn/ui 作者的评语，称其属于受信任注册表 |

**27 个自定义 primitive 是核心差异**，补齐了 shadcn/ui 上游没有的：

| primitive | 说明 |
|---|---|
| Data Grid | 基于 TanStack Table 的可排序、可筛选、可分页表格 |
| Filters | 带 chips 与 facet 的可组合搜索栏 |
| Kanban | 基于 dnd-kit 的拖拽看板 |
| Event Calendar | 事件日历 |
| Gantt | 甘特图 |
| Stepper / Tree / Autocomplete / Phone Input / Number Field / Date Selector / Rating / Timeline / Scrollspy / Sortable / Icon Stack / Frame | 表单与展示类补齐 |
| Alert（带 severity 与可关闭）/ Badge（更多变体） | 反馈类补齐 |

**许可说明**：免费组件与 primitive 为 MIT，可商用；只有 Pro 区块、图标与付费模板需要许可。模板例外，需从模板页面下载而非 CLI。

**适用与组合**：本项目的发现列表、筛选、消息列表、成员卡片都能直接受益；**Data Grid 与 Filters 是最直接可用的两项**。风格与原生 shadcn 完全一致，**与本项目最可能的组件来源（shadcn/ui）无冲突**。

---

## 四、Shadcnblocks

| 项目 | 内容 |
|---|---|
| 类型 | 区块 + 组件 + 模板 + 主题 + Figma/Admin Kit + 页面构建器 |
| 公开数量 | 2866 区块、2241 组件、22 模板、39 主题 |
| 技术栈 | React + Tailwind；**同一区块同时发布 Radix UI / Base UI / React Aria 三种构建** |
| 兼容框架 | Next.js、Vite、Astro、Remix |
| 定价 | 免费层需登录；买断 $149（区块+组件）/ $299（+模板 +Figma +Admin Kit）/ $399（+97 页面 + 页面构建器） |
| 附加物 | Shadcn Figma Kit、Admin Kit、浏览器内 Page Builder、IDE 扩展 |

**特色**

- **体量最大、区块最全**，尤其是全宽营销区块（landing / marketing page 场景）。
- 三套 primitive 构建是它区别于其他站点的地方，切换 primitive 不改变区块 API 与样式。
- 除组件外还提供 **Page Builder 与 IDE 扩展**，可在浏览器或编辑器内直接放置区块。

**适用与组合**：强项是营销页与落地页；App 内界面（列表、消息、表单）价值低于 ReUI。本项目若需要产品官网或公开广场的展示型页面，可部分采用。

---

## 五、Shadcn Studio

| 项目 | 内容 |
|---|---|
| 类型 | 一体化 shadcn 生态订阅：组件、区块、模板、主题、Figma、构建器、MCP |
| 公开数量 | 1100+ 区块、30+ 模板、100+ 页面、9 套仪表盘模板 |
| 技术栈 | React + Tailwind，支持 Base UI 与 Radix UI |
| 安装 | shadcn CLI / 复制粘贴 / Copy Prompt / MCP |
| 定价 | 有免费层；商业版权页面提及 $249 档（订阅制，非买断） |
| 附加物 | 主题生成器、拖拽 Builder、Figma 插件、MCP server、Figma-to-code |

**特色**

- **把设计工具和代码放在一个订阅里**：Figma 套件（1000+ 变体）与代码区块来自同一体系，设计到开发不需要再对齐两套规范。
- 提供 **Motion variants**（动效变体）与主题生成器，配色/圆角/字体可一键换。
- 提供 **MCP server**，让 AI 编辑器直接调用它的区块。

**与 Shadcnblocks 的差异**：Shadcnblocks 体量更大、偏买断；Shadcn Studio 更强调设计工具链与订阅内的一体化。两者功能高度重叠，**不建议同时购买**。

---

## 六、ShadcnSpace

| 项目 | 内容 |
|---|---|
| 类型 | 区块 + 组件 + 模板 + Figma UI kit |
| 公开数量 | 556+ 区块 |
| 技术栈 | React / Next.js / Vite / TypeScript / Tailwind / CVA / shadcn-ui；**Base UI 与 Radix UI 双版本，API 与样式一致** |
| 安装 | `npx shadcn add @shadcnspace/<block>`；或 Chrome 扩展一键注入 v0 / Bolt / Lovable |
| 可访问性 | 宣称符合 WCAG 2.2 |
| 集成 | Remote MCP（Lovable、Bolt、v0）与 Local MCP（Cursor、Claude Code、VS Code、GitHub Copilot、Windsurf） |

**特色**

- **对 AI 编辑器的覆盖最广**，同时支持 Remote 与 Local MCP，并给出 VS Code / GitHub Copilot 的接入路径。
- **Chrome 扩展**把区块连同完整组件上下文注入 v0 / Bolt / Lovable，官方说明可避免 AI 编辑器反复试错。
- 明确以 “AI agent 会使用的区块库” 作为定位。

**适用**：团队用 AI 编辑器搭建页面时，它是目前集成面最宽的一家。若主要用 IDE 内 Copilot/Cursor 手写代码，扩展的边际价值下降。

---

## 七、Shadcn UI Kit

| 项目 | 内容 |
|---|---|
| 类型 | 后台模板 + 完整应用 + 区块 + 组件 + 插图 |
| 公开数量 | 16 套后台仪表盘、17 个完整 Web 应用、40+ 子页面、700+ 组件与区块、300+ 区块 |
| 技术栈 | **Next.js 16 + React 19 + shadcn/ui + Tailwind CSS v4 + TypeScript**，兼容 Vite / Remix / TanStack Start |
| 安装 | shadcn registry 或复制粘贴 |
| 定价 | 买断 $79（Pro，标称原价 $129）/ $199（Team，10 用户）/ $499（Enterprise） |

**特色**

- **模板密度与版本最新度最好**：明确标注到 Next.js 16 / React 19 / Tailwind v4，处于生态前沿。
- 附带 **Page Builder**（300+ 区块、画布内联编辑、多页面、导出 Next.js 代码）与 **MCP server**（Claude Code、Cursor 等）。
- 另有由 shadcn/ui + Motion + Tailwind 构建的**动效插图**（animated bento cards、motion effects）。

**适用**：本项目管理端或运营后台起步可参考，但用户端主应用是移动优先的社交界面，与“16 套后台模板”的适配度有限。

---

## 八、Efferd

| 项目 | 内容 |
|---|---|
| 类型 | shadcn/ui 区块注册表 |
| 技术栈 | React，兼容任意 React 框架（首页示例为 Next.js 与 TanStack）；**支持 Radix UI 与 Base UI** |
| 安装 | `npx shadcn@latest add @efferd/auth-1`（示例为 auth 区块） |
| 图标策略 | **可切换图标包**：Lucide、Tabler Icons、HugeIcons、Phosphor Icons、Remix Icon |
| 定价 | 首页未明示；从表述看有免费与付费层 |

**特色**

- 定位非常克制：**面向 AI Agent 可直接放置与换肤**的干净区块，不追求体量。
- **多图标库可切换**是少见设计，与本项目关注图标统一（Hugeicons）的需求直接相关。
- 强调 “代码在项目里，不在 node_modules”。

---

## 九、React Bits（免费站 + Pro 站）

| 项目 | 内容 |
|---|---|
| 类型 | 动画组件、背景、页面区块、App UI 区块、完整模板 |
| 技术栈 | React + TypeScript；**同一组件提供纯 CSS 与 Tailwind 两种变体，可选 JS 或 TS** |
| 分类 | Text Animations、Animations、Components、Backgrounds、Micro Interactions |
| Pro 数量 | 865 项资产：230 组件 + 300 页面区块 + 300 App UI 区块 + 15 套 Next.js 模板 |
| Pro 定价 | 买断 $129（Starter）/ $249（Pro，含区块、App UI、Agent Kit）/ $349（Ultimate，含模板） |
| 安装 | 复制源码或 CLI；Pro 走 shadcn registry，支持 Claude Code 与 Cursor 一键安装 |

**特色**

- **纯 CSS + Tailwind 双版本**对不使用 Tailwind 的项目也友好，但本项目用 Tailwind，直接选 Tailwind 版即可。
- **App UI 区块**（38 类、300 个）是 Pro 的差异化部分：仪表盘、数据表、AI chat、设置页等，比免费站的纯特效更接近真实产品界面。
- 附带 **20 项 Agent Kit**（设计 skills、prompt、recipes）与 **Landing Builder（Beta）**。
- 免费站的组件社区使用极广，是最常见的动效来源。

**适用**：本项目如需少量高质量背景/文字动效，免费站的组件足够；App UI 区块可作为消息页与设置页的参考。

---

## 十、站点之间的关系与取舍

| 关系 | 说明 |
|---|---|
| 功能高度重叠 | Shadcnblocks 与 Shadcn Studio（区块 + 模板 + Figma + 构建器）几乎覆盖同一需求，**二选一** |
| 定位互补 | ReUI 补 primitive（Data Grid / Kanban / Filters），Shadcnblocks 补营销区块，React Bits 补动效 |
| 风格互斥 | 21st 的多作者风格与其他站点的统一设计语言混用会产生割裂 |
| primitive 必须统一 | 多站同时安装时，`components.json` 中的 Radix UI / Base UI 选择必须一致，否则两套 primitive 并行 |
| 许可需逐个确认 | 仅 ReUI 免费层与 BeUI 免费层明确标注 MIT；其余站点免费层的商用条款需在使用前确认 |
