# HumHub 前端复用与 AffectUI / Shadcn UI Kit 接入分析

> **最新硬条件：插件方式必须完整视觉隔离**。用户仅在不加载 HumHub / Clean 原生样式、完全不保留原生美术效果的条件下考虑插件。因此当前评估“插件承载完整自写 React 用户前端”，不采用 Clean 子主题 + 局部 React 作为替代。详见 [源码机制与双库插件方案第 7、8 节](CleanTheme机制与双库插件方案.md)。尚未实施、验证隔离或改变正式技术契约。

> 核验日期：2026-11-11（Asia/Shanghai）。这是选型分析与实施建议，不是用户已确认的新技术决定，也不表示组件或插件已经接通。
> 本轮读取官方组织、发行元数据、REST 固定版本源码、主题文档、双库公开文档，以及本地 HumHub 源码；未部署应用、安装依赖、修改应用代码或执行集成测试。
> 当前官方 latest release 与本地底座均为 HumHub v1.19.4；REST latest release 为 v0.12.7。官方在线主题文档会跳转至 develop，涉及本地版本的结论以 v1.19.4 固定文件为准。

## 1. 直接结论

**两条路线都能做，但“复用 React 组件源码”和“保留 HumHub 原生页面”是不同的工程选择。**

- **HumHub 做后端，独立 React 前端用 AffectUI + Shadcn UI Kit：可行。** 能直接使用这两套库的组件，但必须适配 API、认证和本项目业务规则。不是安装一个主题就完成。
- **保留 HumHub 原生前端，按两套库的视觉风格美化：也可行。** 可以改变颜色、字号、间距、卡片、导航、页面布局；复杂变化通过主题视图覆盖实现。此时主要复用视觉设计，要把需要的界面转写为 HumHub 的 PHP 模板、SCSS 和原生交互。
- **保留原生社区，只在少数功能中嵌入 React：技术上可行。** 能直接使用局部组件，但会多出两个前端运行体系的衔接工作，适合作为有明确范围的过渡。

**若目标是完整统一的用户体验，当前建议自写 React 用户前端，继续复用 HumHub 后端与管理后台。** 插件也可以承载完整前端，但须有独立页面入口与资产隔离，开发量不能按局部换肤估算。只有在接受原生页面结构、优先复用现成社区界面时，才优先采用主题或局部 React。本文区分可行性与推荐适用条件，不把“可封装为插件”当作“已经完全替换前端”。

此前[插件适配与预算分析](HumHub插件适配与预算分析.md)以“用户前端重做”为评估前提。本轮重新比较实现方式；若最终保留原生页面，插件自带 UI 的价值需要重新评估，但这不自动改变预算或采购结论。

## 2. 已核实的技术边界

| 对象 | 官方资料与源码事实 | 对接含义 |
|---|---|---|
| HumHub v1.19.4 | PHP / Yii2；PHP 视图与 Widget；Bootstrap 5、jQuery、PJAX；主题支持 SCSS、父主题与视图覆盖 | 原生界面不是 React 组件树 |
| AffectUI | React 19；每个组件为自包含 TSX 文件；自带样式，不要求 Tailwind；可与 shadcn/ui 共存 | 需要 React 渲染；“无额外依赖”不等于可直接放进 PHP 模板运行 |
| Shadcn UI Kit | React / TypeScript 组件与区块，使用 Tailwind CSS；官方当前验证组合为 Next.js 16、React 19、Tailwind CSS v4 | 是组件/模板源码资源，不是 HumHub 主题，也不是完整社交后端 |
| HumHub REST | 独立扩展，提供 /api/v1；核心与部分插件有接口；v0.12.7 README 仍标记 Beta | 可以作为独立前端的接口基础，需要固定版本、逐端点验证与补齐 |

依据：[HumHub 依赖][S1]、[主题说明][S2]、[主题视图机制][S3]、[PJAX 实现][S4]、[AffectUI 索引][S5]、[AffectUI 与 shadcn 对比][S6]、[Kit 安装说明][S7]、[REST 手册][S8]与[REST README][S9]。

注意区分 **shadcn/ui** 和商业资源产品 **Shadcn UI Kit**。前者是组件基础，后者提供基于该体系的页面、区块和模板；两者都不能直接替换 HumHub 的 PHP 视图运行机制。具体资源取得仍按[双库使用说明](../frontend-research/09-CollectUI使用与双库资源.md)核对。

## 3. 路线比较

以下成本是相对工程判断，针对同一业务范围，不是开发报价或工期承诺。

| 维度 | A：原生主题改造 | B：独立 React 用户前端 | C：原生页面加局部 React |
|---|---|---|---|
| 原生页面与交互复用 | 最多 | 用户前端少，管理后台可保留 | 原生部分保留 |
| 后端业务能力复用 | 可以 | 可以，经接口适配 | 可以 |
| AffectUI / Kit 源码复用 | 通常需转写为原生模板；可参考设计 | 直接在 React 中使用并接业务数据 | 在独立挂载区域使用 |
| 现有插件页面 | 通常可沿用，但需核对样式与规则 | 通常需重做页面；API 覆盖逐模块确认 | 保留部分、重做部分 |
| 初始主要工作 | 主题、模板与必要业务定制 | 页面、API、认证与业务定制 | 局部 API、挂载生命周期及样式隔离 |
| 后续主要成本 | 上游模板变化与自定义覆盖的兼容 | 自有前端与 API 契约维护 | 两套运行体系与视觉的一致性 |
| 适合条件 | 接受 HumHub 的主要交互，优先社区快速可用 | 重视双库复用、移动体验与自定义产品流程 | 少数独立功能先迁移，范围清楚 |

### A. 保留 HumHub，做现代化主题

可以分三层改造：

1. **外观设置 / SCSS**：品牌颜色、背景、字重、间距、圆角、边框和阴影。HumHub 原生支持外观设置与自定义 SCSS。
2. **主题与视图覆盖**：调整导航、侧栏、资料卡、帖子卡、消息列表和移动端布局。v1.19.4 支持父主题与指定视图覆盖，无需直接改核心视图。
3. **业务页面与交互定制**：十步引导、逐条可见性、AI 澄清、推荐卡片等。涉及流程和数据时，要开发应用用例和界面，不能只靠 CSS。

可以把页面做成接近 Kit 的卡片、留白与导航风格，也可以借鉴 AffectUI 的状态呈现。若要保留这些组件的 React 状态与动效逻辑，则须转写或进入路线 C；把 TSX 文件放到 themes 目录不会自动起效。

采用此路线时建议使用父主题、必要的视图覆盖和自有模块扩展；尽量保留现有 Widget 的数据与事件约定。视图替换越多，越需要核对版本升级后的表单、弹窗、附件和帖子操作。主题机制依据见 [S2]、[S3]，这不代表已验证所有插件对自定义主题兼容。

### B. 保留 HumHub 后端，重做用户前端

建议结构如下；这是待实施设计：

```text
用户浏览器
  └─ React / Next.js 用户前端
      ├─ Shadcn UI Kit：页面布局、列表、表单、消息和社交界面
      └─ AffectUI：AI 澄清、资料处理状态、确认与结果呈现
          ↓ 普通用户身份下的业务 API
      项目 API / 应用用例（可在 HumHub 自有模块内实现）
          ├─ 当前活动、合法入口、逐条可见性、版本与确认规则
          └─ 适配 HumHub 用户、Space、帖子、评论、文件和消息模块
              ↓
          HumHub PHP / Yii2 与其数据库

管理员 → HumHub 原生管理界面（可继续保留）
```

**“只用后端”是让普通用户通过新界面访问后端能力，不是把 HumHub 拆成一个现成的无界面 SDK。** 保留其应用运行环境、模块、数据库、定时与后台任务机制；用户浏览器不必进入原生社区页面。管理后台也不必为了前台美观而同步重写。

无需为此先把 PHP 改写成 Python，也无需仅为了转发接口就增加一个 FastAPI 社交后端。可以在同一个模块化单体中增加项目模块，逐步通过用例和适配器复用 HumHub。已有 Next.js / FastAPI / PostgreSQL 设计尚未因此完成迁移，不能将旧目标数据库视为 HumHub 已验证的直接替换项。

采用项目 architecture-patterns：新的领域规则不依赖页面或 AI 输出；应用用例编排操作，外层适配器接 HumHub 模型与服务。这里是新增代码的边界建议，不宣称上游 ActiveRecord / MVC 已完成架构重构。

### C. 原生社区加少数 React 页面或区域

例如保留社区、赛程和管理界面，仅把资料引导与 AI 找队友作为独立 React 页面。也可以在 PHP 页面中提供一个专属容器供 React 挂载。

需要明确承担以下适配工作：

- HumHub 的 PJAX 会替换页面区域；React 组件必须随进入、离开和历史导航正确挂载与卸载。
- 避免 React 与 HumHub 的 jQuery / Widget 同时操作同一片 DOM。
- 控制 Tailwind 的全局样式重置，核对 Bootstrap、弹窗 Portal、层级和全局 CSS 变量，不能只给部分类名加前缀就认定完全隔离。
- 统一身份、写请求校验、跳转与移动导航；不要让用户在两套看起来无关的产品间反复切换。

这些是从两套运行机制推导的集成要求，不是已经完成的兼容测试。只为一个独立 AI 页面使用此方式可以合理；若多数主页面都嵌入 React，建议重新评估直接采用路线 B。

## 4. 为什么有 REST 仍要做接口适配

官方手册列出 User、Content、Post、Comment、Like、Activity、Authentication、File、Notification、Space 和 Topic；另列 Calendar、Mail 等模块接口。因此“HumHub 完全没有 API”不成立。[S8]

但至少有以下明确边界：

| 场景 | 已核实事实 | 本项目需要的工作 |
|---|---|---|
| 普通用户编辑资料 | REST v0.12.7 的 UserController 访问规则要求 ManageUsers | 不能把管理接口当普通用户资料接口；建立本人可用的受控用例与字段授权 |
| 好友申请与接受 | 原生 RequestController 的 AJAX 分支返回 FriendshipButton Widget HTML | 新前端需 JSON 业务响应，并补合法来源、expected_version 等规则 |
| 帖子与附件 | 核心 REST 手册列有对应 API | 按普通用户身份验证读写、上传、私有附件访问及错误语义 |
| 私聊 | 手册列出独立 Mail 模块 API | 核验实际版本与端点，落实一对一、参与者及消息资格 |
| 登录 | REST 基类支持可配置的 JWT / Bearer / Basic 等认证方式 | 选择统一身份与安全会话方案；GitHub、邮箱验证码、刷新与退出需贯通验证 |
| Q&A、Gallery、Link List 等 | 不能从“有插件界面”推导“接口已覆盖所有操作” | 逐模块核对所需读写端点，缺口由适配层或扩展补齐 |

依据：[UserController][S10]、[原生好友控制器][S11]、[REST 认证基类][S12]与[REST 手册][S8]。没有完整执行 API 测试，因此不承诺所有普通用户操作都已可用。

不通过向浏览器分发管理员 API Key 解决权限缺口。若采用服务端中转，仍须带入真实用户身份并执行对象授权；中转本身不会自动建立业务权限。原生路由与新增 API 也应受相同业务规则约束，避免只约束新界面。

两边都使用 /api/v1 不等于契约一致。实现时需规划路由所有权，适配[共享契约](../docs/共享数据与接口契约.md)的默认 24 / 最大 48、签名 cursor、expected_version、幂等和统一错误结构。

## 5. “保留 HumHub 的结构”具体保留什么

| 结构含义 | 能否保留 | 说明 |
|---|---|---|
| 用户、Space、帖子、评论、通知等业务对象与后端能力 | 可以尽量复用 | 仍需满足本项目业务与授权规则 |
| 信息架构、卡片/详情/讨论等页面组织方式 | 可以参考或复用 | React 可以呈现同样的组织方式，不要求保留 PHP 页面实现 |
| PHP 模板、Widget 和 jQuery / PJAX 交互 | 原生路线可保留 | 直接使用 React 组件意味着至少部分界面实现发生替换 |
| HumHub 的原生管理后台 | 可保留 | 独立用户前端不要求管理员界面一并重做 |

本项目主导航仍以“发现 / 广场 / 消息 / 个人”为正式交互设计，不因为采用 HumHub 就自动改成全站成员目录或全站搜索。活动可映射 Space，但“Space 存在”不代表当前活动边界已经实现。

无论采用哪个前端，发现、分页、搜索与 AI 推荐都只允许服务端验证的当前活动；公开帖子作者入口保留合法跨活动例外。画像逐条可见性、联系人独立授权、资料先导入再确认、任务结果失效等规则仍由服务端维护。一对一私聊不因切活动自动消失。

## 6. 推荐的验证顺序

若选择路线 B，先打通一条小而完整的真实业务链，再铺设全部模板：

1. **身份与活动**：普通用户登录，取得服务端确认的当前 Space / 活动与可用能力。
2. **发现与资料**：在一个 React 页面呈现真实的当前活动用户卡片；本人画像编辑和他人资料读取分别授权。候选不足如实返回。
3. **联系与消息**：从合法入口发好友申请、按版本接受、进入一对一私聊；新界面和原生入口的资格一致。
4. **资料与 AI**：本人导入、预填、保存退出、逐条确认及可见性；任务被取代或撤销后不覆盖新资料。
5. **再扩展插件页面**：帖子、评论、赛程、PDF 预览和通知逐项验收；双库只负责呈现与交互，不代替后端能力。

若选择路线 A，先改一组高频页面——发现卡片、个人资料与帖子流——检查移动端、表单、弹窗、上传和插件兼容，再决定是否需要进一步改造消息页与 AI 独立页面。不要先复制全部原生视图。

本轮只完成源码与文档分析，以及本报告的链接、结构检查；上面的业务链、运行效果和兼容性均为后续验证事项。

## 7. 官方来源与本地证据

- [HumHub 官方组织](https://github.com/humhub)；具体核心仓库为 [humhub/humhub](https://github.com/humhub/humhub)，接口扩展为 [humhub/rest](https://github.com/humhub/rest)。
- [核心发行 v1.19.4](https://github.com/humhub/humhub/releases/tag/v1.19.4)与 [REST 发行 v0.12.7](https://github.com/humhub/rest/releases/tag/v0.12.7)；本轮另读取双方 GitHub latest release 元数据核对。
- [本地主题说明](../backend/docs/develop/theme-overview.md)、[主题类](../backend/protected/humhub/components/Theme.php)、[视图映射类](../backend/protected/humhub/components/ThemeViews.php)。
- [本地依赖](../backend/composer.json)、[本地原生好友控制器](../backend/protected/humhub/modules/friendship/controllers/RequestController.php)。

[S1]: https://github.com/humhub/humhub/blob/b8881d5ea7ee27384a33adeaa23100c73472c4ce/composer.json
[S2]: https://github.com/humhub/humhub/blob/b8881d5ea7ee27384a33adeaa23100c73472c4ce/docs/develop/theme-overview.md
[S3]: https://github.com/humhub/humhub/blob/b8881d5ea7ee27384a33adeaa23100c73472c4ce/protected/humhub/components/ThemeViews.php
[S4]: https://github.com/humhub/humhub/blob/b8881d5ea7ee27384a33adeaa23100c73472c4ce/protected/humhub/resources/js/humhub/humhub.client.pjax.js
[S5]: https://www.affectui.com/llms.txt
[S6]: https://www.affectui.com/compare/shadcn-ui
[S7]: https://shadcnuikit.com/docs/installation
[S8]: https://github.com/humhub/rest/blob/72e1608e58b3a42ee43356fcb3ce9efe7349848c/docs/MANUAL.md
[S9]: https://github.com/humhub/rest/blob/72e1608e58b3a42ee43356fcb3ce9efe7349848c/docs/README.md
[S10]: https://github.com/humhub/rest/blob/72e1608e58b3a42ee43356fcb3ce9efe7349848c/controllers/user/UserController.php
[S11]: https://github.com/humhub/humhub/blob/b8881d5ea7ee27384a33adeaa23100c73472c4ce/protected/humhub/modules/friendship/controllers/RequestController.php
[S12]: https://github.com/humhub/rest/blob/72e1608e58b3a42ee43356fcb3ce9efe7349848c/components/BaseController.php
