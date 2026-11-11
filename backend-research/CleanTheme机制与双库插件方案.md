# Clean Theme 机制与双库插件接入方案

> 核验日期：2026-11-11（Asia/Shanghai）。本轮按用户提出的 Clean Theme 方向分析本地源码，提出 AffectUI + Shadcn UI Kit 插件封装方案；未创建、安装或启用新的前端插件。
> 本地核验对象为 HumHub 1.19.4、Clean Theme 2.5.3。已有原生预览的部署记录见 [部署说明](../backend/deploy/README.md)；该记录不证明双库已接入，本轮也没有重跑其中的运行测试。
> **同日决策澄清**：针对用户进一步提出的全站视觉统一与原生结构残留问题，须区分“插件安装方式”和“谁渲染用户界面”。本文件前半的 Clean 子主题 + 局部 React 是混合方案；第 7 节比较它与全量自写用户前端、插件承载完整 React 前端，不能把混合方案等同于完全替换前端。
> **最新用户硬条件（2026-11-11）**：只有用户前端不加载 HumHub / Clean 原生样式、完全不保留原生美术效果时，才考虑插件模式。因此当前插件候选为“插件承载完整自写 React 前端”，不继承 Clean，也不以原生页面内局部嵌入作为替代。第 8 节为验收边界；目前尚未实施或证明隔离已经成立。

## 1. 结论与建议调整

**可以把选定的 AffectUI 与 Shadcn UI Kit 组件封装为 HumHub 插件，像其他模块一样安装与启用。** 组件仍由 React 在浏览器中运行，HumHub 负责页面入口、登录、后端业务和静态资源发布。无需仅为使用 React 而独立部署整套 Next.js 网站。

“做成插件”需要一次性的开发封装，不是把两个资源包原样放进 modules 目录。合理的交付是一个项目 UI 插件，内部统一 React 版本、样式变量、组件目录和构建流程；没有必要按供应商各做一套互相独立的运行环境。

**按最新硬条件，当前只考虑插件承载完整自写 React 用户前端。** 混合方案与 Clean 子主题保留作技术对照，不再作为满足该条件的候选。插件内使用独立 HTML 入口与自有构建资源，不加载原生页面的视觉资产；这需要完整的前端与接口适配，不能按轻量换肤估算。当前为条件性评估，未批准实施或变更正式技术契约。

## 2. 本地 Clean Theme 到底怎样实现

源码目录为 [backend/protected/modules/clean-theme](../backend/protected/modules/clean-theme)。

| 机制 | 源码位置 | 实际作用 |
|---|---|---|
| 注册一个普通模块 | [module.json](../backend/protected/modules/clean-theme/module.json)、[config.php](../backend/protected/modules/clean-theme/config.php) | 声明版本、模块类、路由和页面生命周期事件 |
| 启用时激活主题 | [Module.php](../backend/protected/modules/clean-theme/Module.php) 的 enableTheme / disableTheme | 激活 Clean；禁用时，若当前主题基于 Clean，则切回 HumHub |
| 继承上游主题 | [variables.scss](../backend/protected/modules/clean-theme/themes/Clean/scss/variables.scss) | 设置 $baseTheme 为 HumHub，选择性关闭原 topbar、list-group 样式 |
| 覆盖少量模板 | [主布局](../backend/protected/modules/clean-theme/themes/Clean/views/humhub/layouts/main.php)、[账号布局](../backend/protected/modules/clean-theme/themes/Clean/views/user/account/_layout.php)、[左导航](../backend/protected/modules/clean-theme/themes/Clean/views/ui/menu/widgets/views/left-navigation.php) | 本地主题提供这三个 PHP 视图；其他页面主要沿用父主题和原生模块 |
| 注册自己的样式与脚本 | [Events.php](../backend/protected/modules/clean-theme/Events.php)、[CleanThemeAsset.php](../backend/protected/modules/clean-theme/assets/CleanThemeAsset.php) | 避免原顶栏脚本冲突，加载主题配置 CSS 和专属导航脚本 |
| 后台配置转 CSS | [Configuration.php](../backend/protected/modules/clean-theme/models/Configuration.php)、[CssController.php](../backend/protected/modules/clean-theme/controllers/CssController.php) | 将颜色、字体、圆角等设置输出成 CSS 变量，包含缓存版本和暗色模式选择器 |
| 全局外观调整 | [build.scss](../backend/protected/modules/clean-theme/themes/Clean/scss/build.scss) | 引入表单、卡片、导航、信息流、移动端与部分模块的 SCSS |

最直观的证据是主布局：它继续调用 SiteLogo、Space Chooser、TopMenu、NotificationArea、AccountTopMenu 等原生 Widget，最后插入控制器渲染的 $content。它重排页面容器和导航，再通过样式改变整体观感，保留了底层页面和业务调用。账号页也直接 require 原生账号布局。

因此，Clean Theme 既有外观配置，也有模板和导航行为覆盖，能力超过“换颜色”。同时它没有把全部社区页面改写成另一个前端框架。

官方 [介绍页](https://marketplace.humhub.com/module/clean-theme/description) 列出宽屏顶栏合并、窄屏底部菜单、滚动隐藏、左导航等能力，与本地源码方向一致。官方 [安装说明](https://marketplace.humhub.com/module/clean-theme/installation) 明确支持子主题。

## 3. 双库插件怎样接进去

建议一个项目 UI 模块包含两部分能力：

1. **Matcher 子主题**：继承 Clean，统一原生页面与新增组件的颜色、字体、间距、圆角和导航。必要时覆盖少数视图。
2. **React 功能页面或区域**：通过 HumHub 的 PHP View 提供挂载容器，通过 AssetBundle 加载已编译 JS / CSS，在容器内渲染 AffectUI 和 Kit 组件。

示意结构如下，尚未创建这些文件：

```text
protected/modules/matcher-ui/
├── module.json / config.php / Module.php
├── themes/Matcher/
│   ├── scss/variables.scss   ← $baseTheme: "Clean";
│   ├── scss/build.scss       ← 原生页面与新组件的共同外观
│   └── views/               ← 仅放需要覆盖的视图
├── assets/MatcherUiAsset.php ← 将构建后的 JS / CSS 注册进页面
├── frontend/                ← React / TypeScript 源码及构建配置
│   └── src/                 ← AffectUI、Kit 与项目页面组件
├── resources/dist/          ← 随插件一起发布的构建产物
├── views/react.php          ← 专属 React 容器与获准初始数据
└── controllers/             ← 页面 / JSON 适配入口，调用应用用例
```

运行过程：

```text
HumHub 登录与当前页面请求
  → 项目 UI 模块的 Controller / View
  → Clean 子主题布局 + React 挂载容器
  → AssetBundle 发布并加载已构建 JS / CSS
  → React 渲染 AffectUI / Shadcn UI Kit 组件
  → 同源业务请求进入应用用例，复用 HumHub 能力
```

对客户端组件，可以采用 React 19 + TypeScript 的构建工程（例如 Vite），在开发或发布阶段生成静态资源。**这种方案的生产运行不需要另开 Next.js 服务；构建阶段仍需要 Node 工具链。** React 官方的 [向既有项目加入 React](https://react.dev/learn/add-react-to-an-existing-project) 文档明确支持在现有页面中逐步挂载组件。是否正确发布资源路径、拆分包和加载依赖，需要在本地 HumHub 预览中验证。

## 4. 哪些能直接复用，哪些还要改

| 资源 / 功能 | 插件内可采用的方式 | 必要适配 |
|---|---|---|
| AffectUI 客户端组件 | 编译后在 React 容器内使用，保留其组件实现 | 业务 props、任务状态、确认操作与样式变量 |
| Kit 的通用组件和区块 | 纳入同一个 React 工程 | Tailwind 配置、依赖、组件别名、表单和数据映射 |
| Kit 整套 Next.js 模板 | 先选取所需页面和客户端组件 | next/link、next/image、路由、Server Components、Server Actions 等依赖不能默认由 PHP 环境执行 |
| HumHub 原生帖子、评论、赛程、相册等 | 继续使用现有页面与插件，以子主题统一观感 | 具体样式兼容与本项目规则 |
| 用 Kit 替换某个原生页面 | 新页面调用受控业务接口或适配器 | 字段映射、分页、提交、错误和权限，不能只换 HTML 标签 |
| 所有原生按钮自动变成 Kit 按钮 | 没有通用自动转换机制 | 可以统一视觉；要替换交互实现则逐处覆盖或重建 |

**封装成插件可以保留部署结构，不能自动消除页面和数据对接工作。** 这也不意味着必须将两个库的组件全部重写成 PHP；原生部分用主题，React 部分直接运行组件，两者职责明确即可。

双库具体技术依据见 [前端接入分析](HumHub前端复用与双库接入分析.md) 的来源，以及 [AffectUI 索引](https://www.affectui.com/llms.txt)、[Kit 安装说明](https://shadcnuikit.com/docs/installation)。所选源码仍需通过有权使用的资源入口取得，本轮未访问凭据或下载付费源码。

## 5. 实施时需要打通的几个接点

- **同一套 React 运行时**：所选组件放进同一构建工程，避免重复 React 副本与互不一致的上下文。
- **页面生命周期**：PHP 页面首次加载和 PJAX 替换都要正确挂载、卸载；浏览器后退、重复进入不得重复绑定事件或保留旧用户数据。React 与 jQuery 不共同操作同一个挂载容器内部。
- **CSS 与主题模式**：控制 Tailwind Preflight 的影响，限制全局样式，映射 Bootstrap / Clean 与双库的颜色变量。Clean 使用 data-bs-theme，双库的暗色触发方式须按所选组件统一；弹窗 Portal 也要继承正确变量和作用域。
- **配置加载顺序**：Clean 动态配置 CSS 在主题 CSS 之后加载；子主题若要覆盖相同变量，需要按官方说明处理选择器优先级或通过配置映射，不能假设最后编辑的 SCSS 就一定生效。
- **身份与数据**：同源模块可复用 HumHub 登录会话，通过受控 JSON Controller 调用业务用例；写请求仍校验 CSRF 与对象权限。可按需调用原生 REST，但不以浏览器中的管理员令牌代替业务接口。
- **安全的启停**：自有主题激活/回退、菜单注册与资源加载应随模块状态一致；业务数据不应随 UI 模块禁用被删除。权限规则独立于 UI，不能靠停用旧按钮来约束旧路由。

按项目 architecture-patterns，新 UI Controller 处理请求和响应，应用用例维护当前活动、画像确认、可见性、好友和消息规则，适配器复用 HumHub。插件封装不改变 R03 的服务端活动范围、公开帖作者例外、逐条授权、资料私存和 AI 预算。

## 6. 混合方案的局部验证范围

如果选择混合方案，可先做一个完整的资料/AI 交互页面作为试点：Kit 展示表单与卡片，AffectUI 展示处理状态与确认，HumHub 提供页面、会话和受控数据接口。普通社区页面继续沿用 Clean。此试点能验证局部嵌入，不能据此宣称全站视觉隔离或全部原生页面已替换。

验收点是可以安装/启用/禁用，页面可首次加载及通过 PJAX 往返进入，窄屏和暗色正常，原生发帖/消息页面不受样式影响，真实业务读写受相同权限控制。试点应使用本地专用测试数据，不把私有原文或凭据带入前端示例。

本轮交付为源码解释和待实施方案。没有执行插件开发或宣称以上验收已通过；相对链接与 Markdown 结构另行检查。

## 7. 与完整自写前端相比，原生结构与样式会不会残留

### 7.1 两个独立决定

- **用户界面由谁负责**：继续沿用原生模板，在部分区域放 React；或由 React 负责整个用户端的页面结构、导航、状态与交互。
- **怎样部署与安装**：独立前端应用或静态站点；或由 HumHub 插件提供独立 HTML 入口与静态资源。

“插件”不限定只能替换局部；但只在 Clean 主布局的内容区域挂载 React，确实属于局部替换。要做到完整视觉隔离，必须主动退出原生页面的布局和资源加载链，不是多加几个 CSS 覆盖就自动达到。

### 7.2 混合方案的具体风险与证据

| 风险 | 本地已核实机制 | 可能表现；非本轮实测故障 |
|---|---|---|
| 原生布局仍然存在 | main.php 保留原生导航、Space Chooser、通知等 Widget，再插入 $content | 中间卡片变了，但顶栏、侧栏、页面宽度与移动导航仍沿用原生组织方式 |
| 全局样式影响新组件 | Clean 的 _base.scss 直接作用于 body、.container、h1–h6；_panel.scss 改面板及资料页 | 新组件的留白、字号、宽度与原预览不一致；相同类名受额外规则影响 |
| 配置覆盖顺序 | Clean 在主题 CSS 之后加载配置生成的变量 | 子主题变量被覆盖；需要明确配置映射与选择器优先级 |
| 基础样式重置影响旧页面 | Tailwind Preflight 会重置全局 margin、border、heading 等 | 为新组件引入的样式改变旧表单、列表和第三方插件的呈现 |
| 两套页面生命周期 | HumHub PJAX 拦截链接并替换 #layout-content；React 也维护容器内状态 | 重复挂载、焦点丢失、返回后状态异常等，需专门适配验证 |
| 未覆盖流程回到原生页面 | 覆盖模板与新路由只包含实际实施的范围 | 点击通知、附件、账户设置、登录或错误处理后出现另一套界面 |

以上是源码支持的集成风险判断，不是宣称已运行双库并复现冲突。来源包括 [Clean 基础 SCSS](../backend/protected/modules/clean-theme/themes/Clean/scss/humhub/_base.scss)、[面板 SCSS](../backend/protected/modules/clean-theme/themes/Clean/scss/humhub/_panel.scss)、[页面事件](../backend/protected/modules/clean-theme/Events.php)、[HumHub PJAX](../backend/protected/humhub/resources/js/humhub/humhub.client.pjax.js)，以及 [Tailwind Preflight 官方文档](https://tailwindcss.com/docs/preflight)。

可以通过 scoped CSS、调整 Preflight、统一变量与生命周期降低混合风险，但这些办法不会自动改变父级布局、所有原生插件页面或未覆盖路由。统一配色也不等于统一信息架构和交互。

### 7.3 三条路线的同范围比较

下表为工程判断，假设业务范围相同，没有给出未经验证的天数、金额或节省比例。

| 维度 | Clean + 局部 React 插件 | 完整 React 用户前端，独立部署 | 完整 React 用户前端，由插件承载 |
|---|---|---|---|
| 页面组织与视觉自由度 | 原生部分受既有模板约束；可改但须逐处处理 | 用户页面结构自行决定 | 做到独立文档及资源隔离后，可自行决定 |
| 原生外观残留 | 没有覆盖的页面及布局仍保留 | 不加载原生用户页面时可避免 | 取决于是否仍加载原生布局、资产及跳转 |
| 原生插件页面复用 | 最多 | 通常需为用户端重做页面 | 完整替换范围内同样需重做页面 |
| 后端业务复用 | 可以，但项目规则仍需适配 | 通过受控 API / 应用用例复用 | 通过同进程适配接口 / 应用用例复用 |
| 样式与路由的主要维护成本 | 原生模板、Bootstrap、React、主题与 PJAX 的组合 | 自有设计系统、前端路由与接口契约 | 自有前端加 HumHub 页面入口、资产与路由隔离 |
| 身份与部署 | 原生会话与模块部署为基础 | 可同域部署，仍要贯通会话、回调和退出 | 可复用同源会话，但不免除 CSRF 和业务授权 |
| 初期投入 | 小范围改造可较低；覆盖全站后不宜假定仍便宜 | 页面与接口投入较高，责任较清楚 | 与全量前端接近，另有宿主集成；不是廉价换肤 |
| 长期适合 | 接受原生产品形态，只增加少量功能 | 强调统一体验、持续独立演进 | 强调统一体验，并重视 HumHub 模块式安装分发 |

### 7.4 完整前端要真正隔离什么

若要求用户端不受原生页面结构影响，应设定如下实施标准：

1. 四主导航、资料引导、详情、通知跳转、登录与账户恢复等用户路径由自有前端负责；保留的管理员页面单独访问。必要的第三方 OAuth 跳转或明确保留的运维入口另列，不伪装成已经统一。
2. 用户页面有自己的 HTML / React 布局，默认不加载 Clean / HumHub 的页面 CSS、Bootstrap 视觉资产、顶栏脚本和 PJAX。确需复用某项前端能力时单独审计其依赖。
3. 若采用插件承载，需要处理全局事件的自动注入。Clean 的 Events.php 会在主题条件满足时注册配置 CSS，并依赖 CoreBundleAsset；仅删掉 main.php 里的一个注册调用不足以保证隔离。
4. 前端通过数据接口工作，不把原生完整 HTML 页面或 iframe 作为默认主体来掩饰接口缺口。内容富文本的安全渲染、附件、通知目的地和错误响应需单独适配。
5. 完整覆盖范围内的页面仍要写、业务数据仍要接。浏览器中没有原生样式，并不证明 API 权限、消息可靠性或资料确认已经满足产品规则。

独立部署不要求跨域或每次重新登录，可以通过同域路径与反向代理设计。插件承载也不天然意味着 Node 服务器：纯客户端构建产物可由 PHP/静态服务提供；若需要 Next.js 的服务器功能，要另行提供运行环境或调整实现，不能把服务器功能当静态资源处理。React 官方 [既有项目集成文档](https://react.dev/learn/add-react-to-an-existing-project) 区分完整子路径与页面局部嵌入；本项目的完整插件入口仍须实际验证。

### 7.5 完整自写前端的建议与证据范围

针对本轮明确提出的“统一视觉、原生结构残留、相互冲突”担忧，**建议把目标设为自有完整 React 用户前端，AffectUI + Shadcn UI Kit 提供组件，HumHub 继续提供可复用的后端能力与管理后台。** 不将局部拼接方案作为默认长期形态。

先保持前端源码与 HumHub 主题独立。根据用户随后明确的硬条件，优先评估插件能否提供完全独立 HTML 与资源的入口，具体标准见第 8 节；不能先假定继承 Clean 再逐渐清除就满足要求。两种部署可以共享同一套前端源码，不应为打包方式反复重写组件。

“自写”不等于每个按钮都从零编写：双库继续用于界面，HumHub 能力继续复用。真正要写的是产品页面组织、状态、业务调用、未覆盖交互及异常流程。原生 Calendar、Messenger 等界面若不再使用，需要为实际开放给用户的功能补对应新页面和接口。

建议先验证一条“登录 / 当前活动 → 发现 → 人物详情 → 好友申请 → 私聊”的端到端流程，覆盖通知返回、窄屏与暗色，并在网络资源中确认原生页面资产没有被隐式加载。此建议未执行，不据此承诺全部插件已可无界面复用；共享契约、原始资料与冻结稿规则保持有效。

## 8. 用户硬条件下的完整前端插件

### 8.1 允许复用与禁止混入的范围

允许复用 HumHub 的用户身份、登录会话、数据库、模块管理、后台任务和经过适配的业务能力。用户端由自己的 React 页面、导航和设计系统负责，AffectUI / Shadcn UI Kit 提供所选组件。

用户页面禁止加载或继承：

- HumHub / Clean 的主题 CSS、Bootstrap 视觉样式和原生页面字体、图标、Logo、背景等美术资源。
- 原生 main.php、侧栏、顶栏、底部导航、表单和弹窗布局。
- 将用户功能通过 iframe 或整页原生 HTML 嵌回新界面的替代做法。

原生 PJAX 与导航脚本也不进入新用户前端，以免参与自有路由和 DOM 管理。原生管理后台可以单独保留，其页面资源不出现在普通用户页面。用户原有头像、帖子和文件等业务数据按权限访问，不以复制整套原生页面方式呈现。

### 8.2 插件的具体职责

```text
HumHub 项目 UI 插件
  ├─ 注册自有前端入口、静态构建产物与业务接口适配
  ├─ 独立 HTML 文档，仅引用自有 React 构建资源
  ├─ AffectUI + Shadcn UI Kit + 项目页面代码
  └─ 调用受控应用用例，复用 HumHub 后端能力

原生 HumHub / Clean 界面 → 仅留在单独管理或原生预览入口
```

插件可负责发布静态文件，但不能因为沿用资源发布工具，就把 CoreBundleAsset / AppAsset 等原生界面依赖带入用户页面。入口应采用独立 HTML 输出或经验证的最小视图链，避免触发原生主题、页面事件和自动布局注入。具体实现必须通过资源清单核验，不能仅凭设置 layout=false 或隐藏某个导航就宣称完成。

认证、CSRF、活动资格、对象权限和用户门禁仍须执行；需要将登录、会话过期、权限不足、必需验证、404/500 等用户流程呈现在自有界面，而非靠绕过后端检查或跳回原生页面解决。第三方身份提供方自己的 OAuth 页面属于外部认证流程，须明确跳转与返回，不混称为 HumHub 前端已经重做。

### 8.3 验收门槛

1. **资源验收**：核对初次加载及路由切换后的 JS / CSS / 字体 / 图像请求与构建清单；没有 HumHub / Clean 的原生视觉资源。不能只按 URL 名称检查，因为发布后的资产路径可能带哈希。
2. **结构验收**：用户页面 DOM 不继承原生导航、布局和 Widget 包装；浏览器前进后退与深链由自有路由处理，不由原生 PJAX 接管。
3. **视觉验收**：桌面、窄屏、暗色、弹窗、菜单、表单与错误状态均使用统一的自有设计；双库也需统一变量与组件风格，不能认为没有 Bootstrap 就自动美观一致。
4. **流程验收**：登录、退出、会话过期、资料、发现、详情、消息、附件预览、通知跳转及业务错误均不意外进入原生页面。未覆盖项须明确列出，不能宣称全站替换完成。
5. **业务验收**：仍按现有契约检查活动隔离、广场合法例外、画像确认、联系人授权、好友版本与私聊资格；视觉隔离不能取代业务验收。

**任一条不满足，就不能认定插件方案满足用户条件，也不能自动回退为 Clean 子主题或局部 React。** 可修复入口与资源隔离，或在明确说明未满足条件后比较独立部署同一套前端；不把条件不满足的方案继续包装成已实现的完整前端。

此方案可以保留模块安装体验，但所有实际开放的用户页面仍需开发和接数据。与独立部署相比，主要差异是入口、会话、静态资源和路由如何接入 HumHub，视觉设计与功能页面的工作量并不会自动消失。当前只形成方案和验收要求，尚无新插件运行证据。
