# HumHub 三种前端升级路线与本地模板适配

核验日期：2026-11-11（Asia/Shanghai）。本文为技术选型与实施建议，未改动 HumHub 核心、数据库、已部署插件或线上路由，未实施 React/HumHub 集成。此前 hero2 的验证只证明独立 Vite 工程的安装、构建和 HTTP 预览通过，不证明已经与 HumHub 集成。

本轮使用项目 architecture-patterns 和 Shadcn UI Kit Skill；前者用于保持业务规则和呈现层分离，后者用于先选已有源码再改造。当前正式技术契约与冻结原稿不因本报告而改变。

## 一、结论

1. 两套资源可以用于 HumHub 产品，但不是 HumHub 原生主题，不能把 TSX 文件直接放进 PHP 视图运行。
2. AffectUI 与 Shadcn UI Kit 同属 React 生态，可放入同一个前端工程。组件版本、目录命名、主题变量、浮层和路由需要统一。
3. 做成 HumHub 插件可行。插件是安装、入口和资源发布的容器；浏览器里的界面仍由 React 渲染。
4. Clean Theme 证明了模块可以承载主题，却没有证明 React 能直接替换原生模板。它仍继承 HumHub 主题、注册原生资源并渲染 PHP Widget。
5. 如果要求用户端完全换视觉，推荐候选是“完整 React 用户前端 + HumHub 后端”。它既可包装成插件，也可独立部署。两者页面与接口开发量接近，主要差异在入口、构建发布和服务器运行方式。
6. 仅为升级视觉，没有必要重写 HumHub 的用户、Space、权限、内容和消息后端。

## 二、技术栈是否匹配

| 对象 | 本轮实际核对 | 对接含义 |
|---|---|---|
| 本地 HumHub 1.19.4 | PHP >=8.2、Yii2、Bootstrap 5、jQuery 3.7、PHP 视图/Widget、PJAX | 没有现成 React 页面运行层；需要增加 React 构建及渲染入口，或把视觉转写为 PHP/SCSS |
| Clean Theme 2.5.3 | 模块声明适配 HumHub 1.19；SCSS 继承 HumHub；PHP 主布局注册 AppAsset 并渲染原生导航 Widget | 是原生主题扩展，不是 React 前端框架 |
| AffectUI 本地快照 | 195 个 TSX 文件；193 个包含内嵌 style，主要依赖 React；部分组合页面另引用 Hugeicons 或其他组件 | 不应一概当成 Tailwind 组件；基础组件可作为 React 组件使用，组合页面要补齐引用与回调 |
| Shadcn UI Kit 本地快照 | React/TSX；Dashboard 用 Next.js 16、React 19、Tailwind v4；含 Base UI/Radix 生态依赖 | 与新的 React 前端匹配；完整 Next.js 工程不能原样当作 PHP 插件静态资源 |
| 5 套网站模板 | Next.js 15/16、React 19、Tailwind v4，具体小版本不同 | 选一个目标工程和锁文件；不把五套 package.json 合并成一个应用 |

HumHub 1.19.4 的 composer.json，以及 Clean Theme 2.5.3 的 module.json、Events.php、variables.scss 已与 GitHub 固定标签源码逐字节比对一致。来源和 SHA-256 见 [核验记录](sources/humhub-ui-compatibility-2026-11-11.json)。这是本地与固定版本的比较，不把 develop 分支文档当成本地已实现能力。

两套 React 资源共用时，建议采用一套 React/ReactDOM 版本和主题规范；常规表单、按钮等选定一套基础实现，AffectUI 用于合适的处理状态、确认卡片和 AI 交互。保留 components/ui 给统一的基础组件，AffectUI 放到独立命名空间并调整其导入，避免同名 button、dialog、app-shell 互相覆盖。主题变量需逐组件映射；内嵌 CSS 也不是自动完全隔离。

## 三、三种形式的对照

下表针对同等业务覆盖范围，是相对工程判断，不是报价、工期或兼容性测试结论。

| 维度 | 1. 保留原生页面升级 | 2. HumHub 插件承载新前端 | 3. 独立重做前端 |
|---|---|---|---|
| 页面主要由谁渲染 | PHP 视图/Widget | 新页面由 React；若只做普通主题则仍是 PHP | React/Next.js |
| 原生后端与数据库 | 保留 | 保留 | 通常仍保留，没必要连后端一起重写 |
| 双库源码复用 | 主要参考视觉；保留 React 逻辑需额外嵌入 | React 组件可复用；Next.js 专属整页要移植或另供运行环境 | Next.js 模板复用最直接，仍须接真实业务 |
| 完整摆脱原生视觉 | 要大范围重写原生视图，代价会上升 | 独立 HTML 与资源隔离验收通过后可实现 | 用户页面完全走新应用时可实现 |
| 已有插件页面 | 复用最多，但要回归样式与交互 | 迁移覆盖的用户页面仍需重做；后端能力可适配复用 | 同样要重做所覆盖的插件页面 |
| 主要维护成本 | 上游视图变更、SCSS 和 Widget 约定 | 前端与 API，加模块入口、路由和资源隔离 | 前端与 API，加独立构建部署；SSR 还需 Node 运行环境 |
| 合适场景 | 接受原生信息结构，优先小范围视觉翻新 | 希望统一用户体验，并保留 HumHub 插件式部署 | 希望独立迭代，或最大程度使用完整 Next.js 模板 |

“插件”描述交付方式，“重做前端”描述改造范围；可以用第 2 种交付第 3 种的完整用户界面，不能因此把工作量按换皮主题计算。

## 四、形式 1：在 HumHub 原生前端上升级

### 具体操作

1. 固定当前 HumHub/Clean Theme 版本，列出要改的原生页面。
2. 小范围品牌变化使用外观设置和 SCSS；较大布局变化使用自有主题模块或受支持的视图覆盖，不直接编辑核心文件或供应商 Clean Theme 源码。
3. 从 Kit/AffectUI 选取视觉方案，转写为原生 PHP HTML、SCSS 和适合 HumHub 的交互；保留必要的 Widget、表单和事件约定。
4. 对资料、帖子、评论、通知、上传、弹窗、登录、移动导航及已装插件逐项回归。
5. 升级 HumHub 时对比被覆盖的上游视图，吸收新字段、权限提示及交互变化。

### 适用边界

只调整颜色、间距和卡片外观时，通常是三种方式里工作最少的。若要求完整复制 React 模板的状态、动效、拖拽和路由，转写量会明显增加。把 Bootstrap 全站替换为 Tailwind，或把 jQuery/PJAX 直接替换为 React，都不是升级一个依赖就能完成。

也可在少数原生页面挂载 React，但要处理 PJAX 进入/离开时的挂载和卸载、两个框架对 DOM 的所有权，以及 CSS/Portal 的影响。它适合作为有限范围的过渡，不能等同于全站视觉替换。既有文档中的“完全不加载原生视觉资源”条件下，这类混合页面不满足要求。

## 五、形式 2：做独立的 HumHub 前端插件

### 先区分两种插件

- **2A，类似 Clean 的主题插件**：保留原生渲染，升级外观；技术边界基本等同形式 1。
- **2B，插件承载完整 React 用户前端**：模块提供自己的页面、资源和接口适配；新用户页面不继承 Clean/HumHub 布局。若目标是完整视觉升级，评估 2B。

### 建议的实现结构

以下是拟议结构，不是已经创建或部署的插件。

    matcher-ui/
      module.json                 HumHub 模块元数据与版本约束
      config.php                  模块、路由与必要扩展点
      Module.php                  安装/启用/停用及配置
      controllers/                独立页面入口、必要的接口适配
      frontend/                   React + TypeScript + Vite 源码
        src/components/ui/        统一基础组件
        src/components/affectui/  选用的 AffectUI 组件
        src/features/             资料、发现、消息等页面
        src/api/                  API 客户端与传输数据转换
      resources/app/              构建后的 JS/CSS/字体与 manifest

后台继续运行 PHP/Yii2。若选择 Vite 客户端应用，Node 用于构建，生产浏览器执行 JS，不必仅因 React 就新增 Node 应用服务器。若保留 Next.js 的 SSR、Server Actions 或服务器路由，则须提供相应运行环境，不能把这些能力作为静态文件交给 PHP 执行。

### 落地步骤

1. **建立独立入口**：例如 /matcher-ui/，明确深链与刷新回退规则。先以单独入口验证，之后再评估普通用户默认入口切换；管理后台保留独立访问。
2. **建立真正独立的 HTML 和资源链**：只加载自有 React 构建资源，不注册 HumHub AppAsset/CoreBundleAsset、不加载 Clean/Bootstrap 视觉资源或原生 PJAX。继续保留必要的安全头、身份与门禁检查。不能仅设置 layout=false 或隐藏导航就认定隔离成功。
3. **检查宿主自动注入**：Clean 的 beginBody 事件仍可能注册原生依赖。入口必须避免或正确限定这类页面生命周期注入，而不是全局禁用主题影响其他页面。用实际网络请求、资源 manifest 和 DOM 验证结果。
4. **接入同源身份与接口**：为前端提供最小的当前用户、当前活动、能力和 CSRF 初始化数据；写请求继续执行 CSRF、对象授权和版本检查。登录、退出、会话过期、必要验证和错误页面需设计自有用户流程，不能通过绕过门禁实现视觉隔离。
5. **适配组件与页面**：优先从本地 Dashboard/区块选取。组件可直接编译；Next.js 专属 Link/Image/navigation/font、布局和服务器逻辑逐项适配为目标环境能力。不要复制整个 App Router 目录到插件后假定可以运行。
6. **复用已有用例**：现有 matcher-user-profile、matcher-onboarding、matcher-profile-privacy 的业务和 JSON 接口作为基础。UI 插件组织呈现和传输适配，不另建一套资料、隐私和活动判断逻辑。
7. **替换演示行为**：把聊天本地 Zustand 更新、假联系人、定时完成的审批/连接状态等改成真实接口与服务器结果；UI 按钮或动效本身不授予权限，也不证明消息已经发送。
8. **可回滚发布**：模块启用/停用不删业务资料；入口切换、静态资源版本和缓存有明确回退策略。验证通过后逐步扩大页面覆盖，不直接替换所有原生路由。

### 为什么不建议直接继承 Clean 做这件事

Clean 的 variables.scss 明确声明父主题 HumHub；主布局调用 AppAsset 并渲染导航、Space Chooser、通知等 Widget；Events.php 还在 beginBody 时注册配置 CSS 和原生 CoreBundleAsset 依赖。若目标是不保留原生美术效果，应借鉴它的模块安装机制，而不是把 Clean 当 React 视觉隔离层。

## 六、形式 3：独立重做前端

建议首先理解为“重做用户界面，保留 HumHub 后端和管理后台”。同时重写后端是另一项更大的工程，不能为了使用两个 UI 包就默认启动。

### 具体操作

1. 从 Kit Dashboard 或一套合适的 Next.js 模板建立独立应用，统一 React/Next/Tailwind 和基础组件版本。
2. 将浏览器路由、布局、登录状态、加载/空/错误状态组织为项目自己的用户前端。
3. 建立 API 适配层，复用 HumHub 与现有项目模块；保留用户身份、逐条隐私、当前活动、好友资格、版本冲突和确认规则。
4. 选择同域反向代理或经明确设计的跨域方案。同域路径可减少跨域处理，但仍要核验 Cookie 范围、会话、CSRF 和 OAuth 回调。
5. 独立构建发布；若使用 Next 服务器能力，部署 Node 服务；只有满足静态导出条件时才使用纯静态托管。
6. 逐步覆盖通知目的地、私有附件、个人设置、找回登录及错误流程；否则用户仍会跳回尚未改造的原生页面。

它最适合最大化复用整套 Next.js 模板。代价主要是业务页面、API 适配和独立部署；有模板不会自动省掉这些工作。

## 七、现有后端已经能复用什么，哪些仍需验证

| 能力 | 当前证据 | 接新前端的工作 |
|---|---|---|
| 用户画像、逐条范围与五阶段规则引导 | 当前 S4 报告及模块源码已有用例和 JSON 路由 | 用新组件呈现并调用现有接口；不得把未实现 AI 当成已可用 |
| 用户、Space、内容、通知等 | HumHub 核心和 REST 模块存在 | 按普通用户权限逐端点核验；路由、分页和返回结构做适配 |
| 本人资料编辑 | REST UserController 的通用访问规则要求 ManageUsers | 优先使用项目本人资料用例，不能向浏览器发管理员 Key 来绕过 |
| Chat App 外观 | 本地 23 个源码文件齐全 | 样例 store 本地构造和追加消息，尚不是 HumHub Mail 后端适配 |
| Calendar、Mail、Gallery、Questions 等插件 | 本地模块存在 | 模块有原生页面不等于所有操作均有合适 API；逐项确认读写、附件与通知跳转 |

项目接口统一使用 /api/v1，但必须规划路由归属，不能与已有 REST/项目模块冲突。以真实登录用户执行用例；活动范围、公开帖子合法例外、逐条可见性、联系人读取、expected_version、幂等和结果失效规则仍放在服务端。

## 八、用本地哪部分资源最合适

- [Kit Dashboard](../frontend/vendor/shadcnuikit/dashboard/)：优先借用应用布局、资料、表单、聊天、信息流和通知页面。
- [Chat App](../frontend/vendor/shadcnuikit/dashboard/app/dashboard/(auth)/apps/chat/)：复用视觉和交互骨架，再接业务消息接口。
- [Kit 区块库](../frontend/vendor/shadcnuikit/library/blocks/)：按页面挑选，不将 1,469 个库文件全打入前端包。
- [AffectUI](../frontend/vendor/affectui/)：选择适合的资料处理、任务进度、澄清和确认组件；不把演示回调当作服务器操作成功。
- [5 套网站模板](../frontend/vendor/shadcnuikit/templates/)：用于适合的展示/网站页面，实际采用前检查项目类型和依赖；不因下载了模板就用营销首页代替业务工作台。

快照不是所有文件都已运行验证的成品。AffectUI 包内说明为 2026-10-29 快照；模板文件完整性校验和此前单个 hero2 验证，不等于全站浏览器、API 或 HumHub 兼容验证。

## 九、建议先做的验证与决策门槛

如果偏好插件交付，先验证 2B；如果要保留 Next.js 整站能力，选择 3 的独立应用更直接。形式 1 仅在接受原生页面结构的情况下优先。

建议第一条完整链路选择已有后端基础的“普通用户登录 → 当前活动 → 本人画像/五阶段引导 → 保存退出 → 恢复 → 逐条范围预览”。然后扩展发现、好友和私聊；不要一开始铺开所有模板。

验收至少包括：

1. 用户页面初次加载、路由切换和弹窗打开都没有 HumHub/Clean/Bootstrap 原生视觉资源或 PJAX。
2. 页面刷新、深链、前进后退、窄屏、暗色、键盘焦点和浮层保持正确。
3. 会话过期、登录/退出、CSRF 失败、必要验证、403/404、版本冲突和网络失败均有清楚流程。
4. 非法 Space/对象 ID、跨用户资料、逐条范围和未确认资料读取被服务端拒绝；合法公开帖子入口仍按现有例外处理。
5. 启停前端模块不损坏 P1/P2/P8 资料和后台；没有用关闭 CSRF、权限或门禁换取可用性。
6. 样例消息和审批状态均被真实后端响应替换；缺失功能明确列出。

若插件方式达不到完整视觉隔离，则修复隔离入口或考虑独立部署同一套前端，不把保留原生视觉的混合方案当作同等完成。

## 十、源码与资料依据

### 本地直接证据

- [HumHub 版本](../backend/protected/humhub/config/common.php)、[依赖](../backend/composer.json)、[主题说明](../backend/docs/develop/theme-overview.md)、[PJAX](../backend/protected/humhub/resources/js/humhub/humhub.client.pjax.js)。
- [Clean 元数据](../backend/protected/modules/clean-theme/module.json)、[父主题](../backend/protected/modules/clean-theme/themes/Clean/scss/variables.scss)、[主布局](../backend/protected/modules/clean-theme/themes/Clean/views/humhub/layouts/main.php)、[自动注入事件](../backend/protected/modules/clean-theme/Events.php)。
- [Kit Dashboard 依赖](../frontend/vendor/shadcnuikit/dashboard/package.json)、[Chat store](../frontend/vendor/shadcnuikit/dashboard/app/dashboard/(auth)/apps/chat/useChatStore.ts)、[AffectUI Chat Composer](../frontend/vendor/affectui/affectui-components/chat-composer.tsx)。
- [现有引导路由](../backend/protected/modules/matcher-onboarding/config.php)、[引导 API](../backend/protected/modules/matcher-onboarding/controllers/ApiController.php)、[S4 实现与验证报告](../docs/用户画像收集/13_S4实现与验证报告.md)、[REST 用户访问规则](../backend/protected/modules/rest/controllers/user/UserController.php)。
- [已有 HumHub 复用分析](../backend-research/HumHub前端复用与双库接入分析.md)、[Clean 机制与完整隔离要求](../backend-research/CleanTheme机制与双库插件方案.md)。

### 本轮直接核验的官方源

- https://github.com/humhub/humhub/releases/tag/v1.19.4
- https://github.com/cuzy-app/clean-theme/releases/tag/v2.5.3
- https://raw.githubusercontent.com/humhub/humhub/v1.19.4/composer.json
- https://raw.githubusercontent.com/cuzy-app/clean-theme/v2.5.3/module.json
- https://raw.githubusercontent.com/cuzy-app/clean-theme/v2.5.3/Events.php
- https://raw.githubusercontent.com/cuzy-app/clean-theme/v2.5.3/themes/Clean/scss/variables.scss

上述官方固定文件与对应本地文件匹配，细节见核验 JSON。本轮未部署新插件、未运行 HumHub 双库集成、未改动现行产品规则。
