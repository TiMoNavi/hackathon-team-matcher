# CollectUI 使用与 AffectUI / Shadcn UI Kit 资源

> 核验日期：2026-11-11（Asia/Shanghai）。当前为资源调研与使用说明，不代表目标应用已经安装组件、接通 MCP 或通过运行测试。
> 用户明确选择 **AffectUI + Shadcn UI Kit**，并要求移除 apple-design Skill。该 Skill 已从本机安装目录移至废纸篓；后续不使用其设计规范，也不默认加入 Arc UI 等其他来源。

## 一、实际读取与接入进展

- 初次无浏览器请求跳转登录页；随后已按用户要求使用本机 Edge 会话直接进入 Dashboard，不需要用户再次登录。不能把初次 HTTP 请求的结果当成用户账号的实际状态。
- 已看到 TailAdmin、AffectUI 与 Shadcn UI Kit 三个已授权站点，并打开前两套选定 UI 库的 AI Tools 配置。当前使用 AffectUI + Shadcn UI Kit，TailAdmin 不因此加入当前组合。
- 已从指定代理成功连接两套 MCP，取得工具目录，并实际查询 Kit 应用页目录及 Chat App 安装说明。
- 已按用户确认配置 VS Code 自带 Chat 的全局 CollectUI Frontend 智能体，指定现有 GPT 6 Astra 模型；MCP 连接限定在 frontend 工作区，没有加入全局 Codex 配置。
- 已在 /tmp/affectui-setup.xan9jgpd 安装 thinking-loader 并通过构建。完整模板未安装，浏览器视觉与 Chat 模型端到端验证尚未完成。
- 具体文件、使用步骤及“工作区共享 MCP 不能按智能体名称严格独占”的限制见 [frontend 使用说明](../frontend/README.md)。凭据仅保存在忽略的私有配置中。

## 二、CollectUI 怎么操作

| 要做什么 | 界面入口与操作 | 应确认的内容 |
|---|---|---|
| 进入镜像看组件 | 登录后找到对应站点卡片，点击卡片空白区域 | 卡片的官网链接打开官方站；空白区域才是镜像入口 |
| 查看配置 | 卡片的 **AI Tools** 打开 CLI / MCP / Skill 配置面板 | 这是具体配置；按该站点实际提供的栏目使用 |
| 查看详细说明 | **AI Tools Docs / CLI Install / MCP proxy** 等入口 | 代理地址、认证格式及适用的资源范围 |
| 交给编程助手接入 | 点击 **Codex / Claude Code / Cursor / VS Code** 图标 | 打开可编辑配置提示，复制当前内容；不必套用其他库的命令 |
| 补齐 Key | 对应卡片的 Key 管理入口 | 面板显示 `<YOUR_KEY>` 表示尚未自动带入该站点所需 Key |
| 获取仓库资源 | 左侧 **GitHub 图标 → Repo catalog** | 查看已获授权仓库的描述、目录、更新记录及下载入口 |
| 获取设计文件 | Shadcn UI Kit 卡片的 **Figma Kit**（如当前权益提供） | 界面文案说明可复制 Kit 文件到 Figma drafts；本次未打开验证 |

站点配置提示可以包含自动注入的凭据。记录用法时只保留脱敏模板；真实 Key 不放入研究文档、聊天输出或版本提交。镜像登录、CLI 与 MCP 权限要分别核对，不能由“网页能打开”推断全部工具可用。

浏览器镜像与安装代理是不同入口。需要接入时，采用当前卡片实际给出的 registry / MCP 地址与认证格式；不要把镜像 Key 填进官方服务，也不要自行猜测镜像子域名。

## 三、Skill、MCP 和 CLI 分别负责什么

| 能力 | 用途 | 当前双库情况 |
|---|---|---|
| Skill | 教助手如何选组件、组合页面、调整主题与检查交互 | AffectUI 官方明确提供免费 Skill 和 Pro skills；具体可取得版本需按授权入口核对 |
| MCP | 让助手查询目录、读取文档、获取组件资源 | 两库均有官方 MCP 文档；镜像代理配置需另看 CollectUI 卡片 |
| CLI / 源码 | 将选定组件或页面文件加入工程 | 按实际 registry 命令或授权仓库资源使用，不等于给助手安装 Skill |

CollectUI 的通用面板还支持“Skill 已内置在 MCP 中”的提示；只在对应站点明确显示此提示时，按它给出的工具名调用，不能假定所有库都一样。

**AffectUI**

- 官方 Agent skills 文档说明：免费 Skill 覆盖选型、接线、主题、示例和 review checklist；Pro skills 另覆盖整屏、迁移、品牌、审计、键盘焦点及响应式等。本文没有猜测独立 Skill 的安装命令。
- 官方 MCP 为 `https://www.affectui.com/api/mcp`，传输为 Streamable HTTP。
- 官方免费组件示例为 `npx shadcn@latest add https://www.affectui.com/r/<slug>.json`。这里是占位格式，须先确定真实组件 slug。
- 官方 Pro registry 使用 `AFFECTUI_TOKEN` 对应的 Bearer 认证。此规则属于官方服务，不代表 CollectUI 代理也使用同一环境变量或同一 Key。

**Shadcn UI Kit**

- 官方 MCP 为 `https://shadcnuikit.com/api/mcp`，使用账号 API Key 的 Bearer 认证。官方文档说明 MCP 与 shadcn CLI 共用该官方账号 Key。
- 本轮确认的是官方 MCP；没有将其称为已经安装的独立 Skill，也没有因没有独立 Skill 而排除该库。
- 组件、区块可通过 registry 或复制源码使用；完整 Dashboard 另有安装流程。是否获得某个模板源码，应以实际授权入口为准。

## 四、当前项目如何只用这两套资源

以下为双库内的优先取材顺序，具体页面仍按 [前端主应用交互设计](../docs/前端主应用交互设计.md) 和用户确认的产品流程组织。

| 页面需要 | 优先查找 |
|---|---|
| AI 对话、澄清、处理状态 | AffectUI 的 Chat Composer、AI Answer、Decision Card、Progress Tracker |
| 十步引导中的输入与步骤呈现 | AffectUI 的 Stepper Form；通用资料表单可组合 Kit 组件 |
| 普通页面、表单、列表与卡片 | Shadcn UI Kit 对应基础组件与页面区块 |
| 真人聊天与群聊外观 | Shadcn UI Kit 的 Chat UI / Chat App |
| 广场信息流与帖子 | Shadcn UI Kit 的 Social Media App / Social Media Post |
| 作品展示列表与详情 | Shadcn UI Kit 的 Product List / Product Details，按作品语义调整 |
| 评论呈现 | 优先核对 AffectUI 的 Comment Thread / Comments Panel 是否适合具体页面 |
| 两库未覆盖的交互 | 先明确缺口，再用现有基础组件补齐；不自动引入第三套库 |

推荐工作顺序：先在镜像选具体页面或组件，再读取所选库的 Skill / MCP 文档，取得需要的文件，最后统一主题并检验窄屏、键盘、暗色和减少动效设置。当前尚未进入应用实现阶段，不执行整套模板安装。

## 五、现在如何开始使用

打开 [frontend 专用工作区](../frontend/collectui-frontend.code-workspace)，在 VS Code 自带 Chat 中选择 Copilot 会话类型与 CollectUI Frontend 智能体。该智能体全局可见，两个 MCP 连接只在 frontend 工作区提供；具体模型和工具步骤见 [使用说明](../frontend/README.md)。

AffectUI 与 Kit 的 MCP 均已验证连通。Kit 页面模板可由 list_dashboards / get_dashboard 查询并按需安装；完整仓库资源仍从对应授权入口取得。不需要预先下载所有 Pro 资源，也不把配置完成描述为业务前端已经实现。

## 来源

- [CollectUI 登录页及随页面下发的界面说明](https://dash.collectui.pro/login)：Dashboard 的 Tour、Onboarding、SiteCard、AiTools、DocLinks、RepoCatalog 文案；未登录的界面说明不证明账号权益。
- [AffectUI Agent skills](https://www.affectui.com/docs/agent-skill)
- [AffectUI Using with AI](https://www.affectui.com/docs/ai)
- [AffectUI 官方机器可读索引](https://www.affectui.com/llms.txt)
- [Shadcn UI Kit 首页](https://shadcnuikit.com)
- [Shadcn UI Kit MCP 文档](https://shadcnuikit.com/mcp)
- [此前五类场景事实复核](08-社交场景组件缺口.md)：组件与页面的具体官方来源；其中三库组合建议已被当前用户双库决定取代。
