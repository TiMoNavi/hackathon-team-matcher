> 历史记录：本文件归档于 2026-11-11，不作为当前实施规范。当前入口见 [前端说明](../../../frontend/README.md)。

# CollectUI 前端资源接入

> 配置与验证日期：2026-11-11。使用 AffectUI Pro + Shadcn UI Kit Pro。此目录包含工具配置、使用资料、vendor/ 本地源码快照及 experiments/ 隔离验证工程，尚未接通正式前端业务应用。

## 当前视觉基准

2026-11-11 用户指定以 **Signalry AI SaaS Landing Page Template** 为风格基准。本地完整源码位于 [signalry-nextjs](../../../frontend/vendor/shadcnuikit/templates/signalry-nextjs)。用户随后否定了助手制作的适配样张，尤其是字体；当前请直接查看 [完整原版预览](../../../frontend/experiments/signalry-original-preview/PREVIEW.md)，本机入口为 `http://127.0.0.1:4196/`。此前 [风格提案](design-system/team-matcher/MASTER.md) 和样张仅保留过程记录，不作为已确认的中文适配或应用设计。vendor 原始快照保持不变，尚未实施正式应用迁移。

## 前端结论与实施要求

后续前端工作先看 [前端实验结论与实施要求](前端实验结论与实施要求.md)。文档保存三条 HumHub 路线的实测结论、双库使用要求、React 插件隔离方式、视觉与交互验收基线，以及真实业务接入边界。

本次三个首页原型的统一浏览器检查为 **51/51 通过**。建议优先继续验证独立 React 前端插件，但尚未批准或执行全站迁移。具体效果和接入成本见 [完整实验比较](../../../frontend/experiments/humhub-ui-comparison-2026-11-11/COMPARISON.md)，预览与复测方法见 [实验运行说明](../../../frontend/experiments/humhub-ui-comparison-2026-11-11/README.md)。

## 本地模板入口

已安装用户下载的 AffectUI 与 Shadcn UI Kit 源码快照。组件、后台工程和 5 个网站模板的位置、大小及版本说明见 [本地模板索引](TEMPLATES.md)。

HumHub 接入与三种升级路线的前期分析见 [源码兼容与实施对照](../../../frontend-research/10-HumHub三种前端升级路线与本地模板适配.md)。随后已完成隔离首页实验，其中 React 插件直接复用了两套组件；真实登录、权限与业务数据尚未接入，以本页链接的实验结论为当前验证状态。

## 在 VS Code 自带 Chat 中使用

1. 打开本目录的 [collectui-frontend.code-workspace](../../../frontend/collectui-frontend.code-workspace)。工作区根目录必须是 frontend；只打开父目录不会自动加载这个子目录里的 MCP 配置。
2. 在 VS Code 的 Chat 中选择 Copilot 会话类型，再从智能体列表选择 **CollectUI Frontend**。这是 VS Code 自带 Chat 的智能体，不是 Codex 扩展或 Continue 的配置。
3. 该智能体指定现有 TIMO GPT 提供方中的 **GPT 6 Astra**。实际模型标识已从本机注册目录核对为 customendpoint/TIMO GPT/gpt-6-astra；设置 required，不自动换成其他模型。
4. 首次使用时按 VS Code 显示的工作区/服务器信任提示操作。在 MCP 服务器列表中应能看到 affectui 与 shadcnuikit。
5. 可以先说：“用 AffectUI 查询 thinking-loader 的用法，再列出 Shadcn UI Kit 中适合真人聊天和信息流的现成页面；先不要改应用代码。”展开工具调用，确认它实际访问了相应 MCP。

全局智能体文件位于 ~/.copilot/agents/collectui-frontend.agent.md，因此其他工作区也能看到这个名字；两套 MCP 只配置在本 frontend 工作区。已关闭其他智能体自动调用此智能体的入口。

**隔离范围**：VS Code 的 MCP 连接属于工作区，不支持靠智能体名称严格独占。该智能体显式列出这两套工具，但同一工作区的其他智能体仍可能使用它们。全局智能体可见、项目连接生效和严格访问隔离是三件不同的事。按用户后续要求，Shadcn UI Kit MCP 已另外写入全局 Codex 配置；AffectUI 仍保留工作区配置。

## 已配置的文件

| 文件 | 用途 |
|---|---|
| collectui-frontend.code-workspace | 以 frontend 为根目录打开 VS Code |
| .mcp.json → .local/mcp.json | Copilot 工作区 MCP 连接，使用 mcpServers / headers 字段 |
| .env.local → .local/registry.env | shadcn CLI 下载凭据；不会因配置 MCP 而自动被其他客户端加载 |
| [mcp.example.json](../../../frontend/mcp.example.json) | 不含真实凭据的 MCP 结构示例 |
| [registries.example.json](../../../frontend/registries.example.json) | 两套 registry 的配置，待实际应用初始化后合并进 components.json |
| [.gitignore](../../../frontend/.gitignore) | 忽略私有目录、认证入口及生成文件 |

真实 Key 只写在 .local/ 的私有文件中，文件权限为 600；认证入口和 .env.local 均被忽略。不要将 .mcp.json 的实际内容贴进文档或提交。Codex 的 http_headers、Copilot 的 headers 和 shadcn registry 的 headers 属于不同配置格式，不能原样互换。

## 要不要下载其他资源

不用先下载整套 Pro 资源。MCP 负责查询、读取文档和获取源码/安装指令；页面实际运行仍需要把选定源码放进 React 工程。两套 MCP 初始化时已经提供使用流程，Shadcn UI Kit 官方 SKILL.md 已安装到 Codex 用户目录和本项目 .claude/skills/shadcnuikit/。

| 需要什么 | 已核实的使用路径 |
|---|---|
| AffectUI 组件、整屏与区块 | search_components → get_component → 返回的 CLI 命令；CLI 不可用时才用 get_source |
| Kit 单个区块/组件 | search_catalog → get_item_code，提供工程实际的 shadcn style |
| Kit 现成应用页/后台页 | list_dashboards → get_dashboard；新工程按其说明先取得 shell |
| Kit 自由组合的整页 | plan_page → 选择区块 → get_item_code |
| 独立网站模板/完整仓库 | 在镜像的 Templates 页面选定具体模板，再使用它明确提供的源码或 Dashboard 左侧仓库目录中的对应快照；不把页面区块接口当成所有整站模板的统一安装器 |

本轮已查到 Kit 的 Chat App 与 Social Media App。Chat App 的 get_dashboard 返回 23 个文件的安装说明、依赖及页面适配要求，并给出 **30 分钟有效的签名安装链接**。实际安装时重新获取链接，不把带 token 的链接写入文档或日志。此前未执行这条整页 CLI 安装。用户随后下载的仓库快照已解压至 vendor/，其中包含 Chat App 的 23 个源文件，详见模板索引。

Kit 的应用页依赖 Next.js App Router 和其页面外壳。模板说明还提示：部分演示图片不随源码安装，需要换成自己的资源或按说明引用；辅助函数应合并到现有文件。模板不能直接替代本项目的登录、活动边界和业务接口。

AffectUI 组件自带样式与动效，并不意味着所有颜色、间距和主题变量会自动与现有工程一致；正式接入后仍要核对主题与可访问性。

## Shadcn UI Kit 新增验证记录（2026-11-11）

- 临时目录：/tmp/shadcnuikit-setup._74wggv9；组件位于 src/components/hero2.tsx。
- 使用原 CollectUI registry 安装 @shadcnuikit/hero2 成功，.env.local 自动展开，无 401，也未使用前置变量重试。
- 补齐 Vite 的 Tailwind v4 和 @ 别名；将 hero2 的 next/link 换成适用于 Vite 的原生链接，样式保持。
- TypeScript 检查、Vite 生产构建及预览 HTTP 检查通过；未执行浏览器视觉测试。
- Shadcn UI Kit MCP 已加入 Codex 用户配置，重启 Codex 后加载；官方 Skill 已安装。
- 用户下载的两份快照已解压到 vendor/，完整模板清单见 [TEMPLATES.md](TEMPLATES.md)。

## 已完成的验证

- 两套 MCP 均成功 initialize、tools/list；AffectUI 返回 4 个工具，Kit 返回 6 个工具。
- Kit 的应用页目录与 Chat App 安装说明已通过真实工具调用取得。
- 临时工程：/tmp/affectui-setup.xan9jgpd。
- 已安装：src/components/ui/thinking-loader.tsx，并在临时 App.tsx 中引用进行中与完成状态。
- npm run build 成功，包括 TypeScript 检查和 Vite 构建。真实前端应用没有被安装这些示例文件。
- .env.local 自动展开成功，没有发生 401，也未触发前置环境变量重试；构建产物未包含下载 Key。
- 站点示例命令在 Vite 工程中缺少 Tailwind 和 @ 路径别名。本轮补齐这两项后初始化成功，未变更 registry 地址。
- 额外的 Edge 无头渲染尝试超时，因此不声称已通过浏览器视觉或交互验证。尚未发送一次 VS Code Chat 模型请求来做端到端验证。

临时工程可整目录删除。验证结束后已移除其中的 .env.local；安装的组件、演示代码及构建产物保留，继续运行现有演示无需下载 Key。

## 正式应用创建后

先按批准的技术方案初始化正式应用和 shadcn/ui，再将 registries.example.json 中的 registries 合并进实际 components.json，保留原有条目。本目录根部尚未创建正式业务应用；experiments/ 下的 React 工程仅用于隔离验证，不作为根目录 components.json 的默认目标。

之后可在工程根目录按需安装，例如：

    npx shadcn@latest add @affectui/thinking-loader

Kit 条目的名称、style 和依赖以 MCP 当次返回为准。不要把任意模板名直接当成 registry slug。

## 依据

- [CollectUI 入口调研](../../../frontend-research/09-CollectUI使用与双库资源.md)
- [VS Code 自定义智能体字段与作用域](https://code.visualstudio.com/docs/agents/reference/custom-agent-file-reference)
- [VS Code MCP 配置与认证](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)
- [Codex MCP 配置](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [Codex 自定义智能体的继承限制](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- CollectUI 两个已授权服务的 initialize / tools/list，以及 Kit 的 list_dashboards / get_dashboard 实际响应。这里不保存凭据和限时签名链接。
