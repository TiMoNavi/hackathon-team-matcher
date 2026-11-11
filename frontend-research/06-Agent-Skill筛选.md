# 减法筛选：哪些没有面向 AI 编程 Agent 的 skill

> 调研日期：2026-11-10。筛选标准严格按用户要求：**是否公开声称自己有让 AI 调用该包的 skill（Agent Skill / MCP Server）**。
> 所有结论来自官方页面原文，未核实项单独标注。

## 一、筛选标准界定

“有 AI 调用该包的 skill”必须满足下列任一项，且有官方公开入口：

| 类型 | 判定依据 |
|---|---|
| **Agent Skill** | 官方提供可安装的 `SKILL.md` / skills 包（如 `npx skills add …`、`shadcn@latest add .../skill.json`） |
| **MCP Server** | 官方提供 MCP 端点或 `mcp` 命令，供 Claude Code / Cursor / VS Code / Codex 调用 |
| **机器可读 Agent 索引** | 官方提供 `llms.txt` 或 agent 专用文档入口，且明确面向 coding agent |

**不算**：仅提供 `llms.txt` 但未声明 agent 工作流；仅提供“Copy Prompt”；仅提供 AI 生成器（那是产品功能，不是给编程 Agent 用的包）。

---

## 二、结论总表

| # | 站点 | Agent Skill | MCP Server | Agent 索引 | 判定 |
|---|---|---|---|---|---|
| 1 | [ReUI](https://reui.io) | ✅ 有（`/docs/agent-skills`） | ✅ `mcp.reui.io`（19 个工具） | ✅ | **有** |
| 2 | [Arc UI](https://uiarc.dev) | ✅ 有（14 个 md 文件） | ✅ `uiarc.dev/api/mcp` | ✅ | **有** |
| 3 | [BeUI](https://beui.dev) | ✅ 有（`npx skills add starc007/ui-components --skill beui`） | ✅ `mcp.beui.dev/mcp` | ✅ | **有** |
| 4 | [BoardUI](https://www.boardui.com) | ✅ 有（`npx boardui@latest skill`） | ✅ `npx -y boardui@latest mcp` | ✅ | **有** |
| 5 | [21st](https://21st.dev) | ✅ 有（21st-cli-use SKILL.md） | ✅ `21st.dev/api/mcp` | ✅ | **有** |
| 6 | [MagicUI](https://magicui.design) | ⚠️ 未单列 skill | ✅ `@magicuidesign/cli` | ✅ | **有** |
| 7 | [Shadcn Studio](https://shadcnstudio.com) | ⚠️ 未单列 skill | ✅ `/mcp` | ⚠️ | **有** |
| 8 | [ShadcnSpace](https://shadcnspace.com) | ❌ | ✅ Remote + Local MCP | ⚠️ | **有** |
| 9 | [HeroUI Pro](https://www.heroui.pro) | ✅ 有（licensed skill downloads） | ✅ `mcp.heroui.pro/mcp` | ✅ `llms-full.txt` | **有** |
| 10 | [React Bits Pro](https://pro.reactbits.dev) | ✅ 有（20 项 Agent Kit） | ✅（免费站有 MCP Setup 文档） | ✅ | **有** |
| 11 | [Shadcn UI Kit](https://shadcnuikit.com) | ❌ | ✅ MCP Server（首页声明） | ❌ | **有** |
| 12 | [Efferd](https://efferd.com) | ⚠️ 仅称“agent 可放置” | ❌ 未找到 | ❌ | **存疑** |
| 13 | [Shadcnblocks](https://www.shadcnblocks.com) | ⚠️ 有 IDE 扩展 | ❌ 未找到 MCP | ❌ 404 | **存疑** |
| 14 | [AffectUI](https://www.affectui.com) | ✅ 有（`/docs/agent-skill`，免费 skill + Pro skills） | ✅ `https://www.affectui.com/api/mcp`（Streamable HTTP） | ✅ `llms.txt` + `llms-full.txt` | **有** |
| 15 | [Motion](https://motion.dev) | ✅ `npx motion-ai` | ⚠️ 未核实 | ⚠️ | **有（命令形式）** |
| 16 | [TailAdmin](https://tailadmin.com) | ❌ | ❌ | ⚠️ 仅有 `llms.txt` | **无** |
| 17 | [ThreeUI](https://threeui.com) | ❌ | ❌ | ❌ | **无** |
| 18 | [FlyonUI](https://flyonui.com) | ❌ | ❌（`/docs/.../mcp/` 页面无内容） | ❌ | **无** |
| 19 | [Hugeicons](https://hugeicons.com) | ❌ | ❌（404） | ❌ | **无** |
| 20 | [Aura Build](https://www.aura.build) | ❌（它是生成器本身） | ❌ | ✅ `llms.txt` | **不适用** |
| 21 | [Figma](https://www.figma.com)（各站套件） | ❌ | ❌ | ❌ | **不适用** |

---

## 三、明确没有 Agent skill 的（做减法直接去掉）

### 3.1 完全无 Agent 能力

| 站点 | 核实结果 |
|---|---|
| **TailAdmin** | `llms.txt` 存在，但内容只列产品、定价、安装文档；**无 SKILL.md、无 MCP、无 agent 工作流声明**。是传统模板下载站。 |
| **ThreeUI** | 无 `llms.txt`、无 MCP、无 skill，`/docs` 返回 404。纯区块展示站。 |
| **Hugeicons** | `/docs/mcp` 返回 404，无 agent 入口。纯图标资源包，本身是 npm 包 + CDN。 |
| **FlyonUI** | `/docs/getting-started/mcp/` 页面返回的正文**只有站点页脚**，无 MCP 内容。无 agent 入口。 |

### 3.2 不适用（非组件包）

| 站点 | 原因 |
|---|---|
| **Aura Build** | 它本身就是 AI 网站生成器，不是「被 AI 调用的包」。它有 `llms.txt` 但用途是让模型正确描述它，不是给编程 Agent 安装组件。 |
| **Figma 套件** | 设计源文件，不参与代码工具链。 |

---

## 四、存疑两家（需按严格标准排除）

这两家都有「面向 Agent」的宣传，但**没有公开可验证的 skill 安装入口**：

| 站点 | 声称 | 缺口 |
|---|---|---|
| **Efferd** | 首页大量强调“agents already trust”、“blocks your agent can place” | 未找到 MCP 端点或 SKILL.md 安装命令；只有 shadcn CLI 安装。属**营销表述**而非可验证 skill。 |
| **Shadcnblocks** | 有 IDE 扩展、Page Builder、MCP 提及 | `/docs/mcp`、`/docs/ai`、`/llms.txt`、`/mcp` 全部 404；仅确认有 IDE 扩展。 |

**建议**：按严格标准（须有可安装的 skill 或可访问的 MCP 端点），这两家暂不计入“有 skill”阵营。

### AffectUI 已核实为「有」（2026-11-11 更正）

先前因 `/docs/mcp`、`/docs/agents` 返回 404 而列为存疑，属**路径猜测错误**。实际文档路径为 `/docs/ai` 与 `/docs/agent-skill`，且 `llms.txt` 明确给出：

- **MCP server**：`https://www.affectui.com/api/mcp`（Streamable HTTP），支持 Claude Code、Cursor、VS Code、Codex；
- **Agent skill**：免费 skill（选型、接线、主题、示例、review checklist）+ Pro skills（整屏、迁移、品牌、审计、键盘焦点、响应式）；
- **Pro 安装**：需 `AFFECTUI_TOKEN` 访问密钥，无 key 返回 401。

详见 [AffectUI 共存矩阵](07-AffectUI共存矩阵.md)。

---

## 五、有 skill 的阵营细分

### 5.1 Skill 与 MCP 双全（最完整）

| 站点 | Skill 安装方式 | MCP 端点 |
|---|---|---|
| ReUI | 官方 Agent Skills 页，配套 MCP | `mcp.reui.io` |
| Arc UI | `npx shadcn@latest add https://uiarc.dev/r/arc-skill.json` | `https://uiarc.dev/api/mcp` |
| BeUI | `npx skills add starc007/ui-components --skill beui` | `https://mcp.beui.dev/mcp` |
| BoardUI | `npx boardui@latest skill` | `npx -y boardui@latest mcp`（stdio） |
| 21st | `21st-cli-use` SKILL.md | `https://21st.dev/api/mcp` |
| HeroUI Pro | licensed skill downloads | `https://mcp.heroui.pro/mcp`（需 OAuth/token） |
| React Bits Pro | Agent Kit（20 项 skills + prompts + recipes） | 免费站有 MCP Setup 文档 |
| AffectUI | 免费 skill + Pro skills（`/docs/agent-skill`） | `https://www.affectui.com/api/mcp` |

### 5.2 只有 MCP、无独立 skill

| 站点 | 说明 |
|---|---|
| MagicUI | 有 `@magicuidesign/cli`，也建议复用 shadcn 官方 MCP；未单列自家 SKILL.md |
| Shadcn Studio | `/mcp` 页面完整（支持 VS Code / Cursor / Windsurf / Cline），未单列 skill |
| ShadcnSpace | Remote MCP（Lovable/Bolt/v0）+ Local MCP（Cursor/Claude Code/VS Code/Copilot/Windsurf），无 SKILL.md |
| Shadcn UI Kit | 首页声明 MCP Server（Claude Code、Cursor），无 skill |

### 5.3 命令形式

| 站点 | 说明 |
|---|---|
| Motion | `npx motion-ai`（官方命令）；未核实是否有独立 SKILL.md |

---

## 六、减法结果

**21 个对象 → 去掉 6 个 → 存疑 2 个 → 剩 14 个**

> 更正记录（2026-11-11）：AffectUI 经核实**有** agent skill 与 MCP 端点，已从存疑阵营移入「有 skill」，故剩 14 个而非常初稿的 15 个口径。详见 [AffectUI 共存矩阵](07-AffectUI共存矩阵.md)。

去掉的 6 个：

| 去掉 | 理由 |
|---|---|
| TailAdmin | 无 skill、无 MCP，传统模板站 |
| ThreeUI | 无任何 agent 入口 |
| Hugeicons | 无 agent 入口（但作为图标层仍可独立选用，见下） |
| FlyonUI | MCP 页面为空，无 agent 入口 |
| Aura Build | 生成器本身，不是被调用的包 |
| Figma 套件 | 设计稿，不参与代码工具链 |

**存疑待确认 2 个**：Efferd、Shadcnblocks。

### 一处需要指出

**Hugeicons 属特殊情况**：它没有 agent skill，但**它也不需要**。图标库是纯资源层，不存在“让 agent 学会用它”的工作流问题——agent 直接 `import` 即可。所以它应该**在“组件库筛选”中被去掉，但在“图标层选型”中保留**。同理，Motion 有 `motion-ai` 命令，属于单独一类。

---

## 七、修正后的分层（按 skill 有无 × 作用）

| 作用层 | 有 skill 的候选 |
|---|---|
| 底座（primitive / 设计系统） | HeroUI Pro（平行路线）、ReUI |
| 区块与组件注册表 | ReUI、Arc UI、21st、Shadcn Studio、ShadcnSpace、Shadcn UI Kit、Efferd(存疑)、Shadcnblocks(存疑) |
| 动效组件 | BeUI、MagicUI、React Bits Pro、Arc UI、BoardUI |
| AI / Agent 界面 | AffectUI(存疑)、BoardUI、ReUI（有 AI & Agents 分区） |
| 仪表盘 / 工作台 | BoardUI、Shadcn UI Kit、ReUI（Data Grid 组） |
| 动画引擎 | Motion |
| 图标 | Hugeicons（无需 skill） |
| 模板 | TailAdmin（已排除）、Shadcn UI Kit、BeUI Pro |
