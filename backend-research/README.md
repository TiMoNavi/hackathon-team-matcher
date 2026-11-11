# 通用社交平台：代码完善性与改造难度评估

> **推荐模块设计已集中（2026-11-11）**：[当前专项入口](../docs/推荐模块/00_README.md)。按用户最新要求优先参考 HumHub example-basic，增加项目、角色互补、性格/协作偏好、相似与差异规则及 AI 接入；LightFM 不再作为首选新依赖。原字段映射实验保留，未安装推荐插件或修改运行时。

> **画像插件拆分调研（2026-11-11）**：[插件接入、依赖与画像主插件 / AI 扩展](HumHub插件机制与画像主插件及AI扩展方案.md)。已只读验证依赖机制；主插件保管资料与确认规则，AI 包作为可选提供者。业务插件尚未实现。

> **OpenIM 与高星组件组合（2026-11-11）**：[专项评估](OpenIM与高星后端组合评估.md) 按冻结简介比较即时通信、画像处理、推荐、活动与 AI 后端，附 [18 个仓库元数据快照](OpenIM与高星后端调研_2026-11-11_来源快照.json)。包含 SDK 许可证差异、活动权限与跨服务一致性边界；本轮没有安装或迁移后端。

> **解耦与 MCP 复核（2026-11-11）**：[消息机制、普通用户 API 与改造难度](HumHub前后端解耦与MCP可行性评估.md) 区分原生能力、接口缺口、项目新增规则和已发现的权限问题；给出 React 与 FastMCP 接入边界。本轮为评估，没有实施新前端或 MCP。

> **双库前端与插件方式（2026-11-11）**：[Clean Theme 源码机制与双库插件方案](CleanTheme机制与双库插件方案.md)。第 7 节比较三种路线；第 8 节记录用户硬条件：插件用户端不加载原生样式、不保留原生美术效果。当前评估插件承载完整 React 前端，未开发新插件或验证完整隔离。

> **免费原生预览已运行（2026-11-11）**：[部署、账号位置与检查结果](../backend/deploy/README.md) · [冻结简介逐项对照与插件建议](HumHub免费部署与冻结简介对照.md)。HumHub 1.19.4 + Clean Theme，19 个免费扩展包，9 个启用；尚未实现项目的活动发现、资料授权与 AI。

> **前端接入专项（2026-11-11）**：[HumHub 前端复用与双库接入分析](HumHub前端复用与双库接入分析.md) 比较原生主题改造、独立 React 用户前端、局部 React 三条路线，明确 API 与组件源码的复用边界。这是方案分析，未安装组件、改造应用或变更已确认技术方案。

> **当前 HumHub 插件调研（2026-11-11）**：[插件官方资料汇编](HumHub插件官方资料汇编.md) 收录本轮 23 个候选（含 Clean Theme）及 Survey 依赖；[插件适配与预算分析](HumHub插件适配与预算分析.md) 记录 Space/赛程、一对一私聊、问答社区、AI 资料录入边界及 700 元预算。收费模块未购买，原生免费模块后续已部署；下文保留此前通用底座对比。

> **Duolicious 深入复审（2026-11-10）**：[后端代码质量与核心交互分析](Duolicious后端代码质量与核心交互分析.md)。包含固定提交源码证据、缓存可见性与消息可靠性问题、局部测试结果，以及对当前找队友方案的适配判断。

> **当前专项入口（2026-11-10）**：用户明确需要按需 AI 辅助填写和修改资料、确认后写入业务数据库，见 [AI 辅助资料录入后端选型](AI辅助资料录入后端选型.md)。此前记忆类画像服务的优先建议已撤回。

> **后续选型入口（2026-11-10）**：用户已明确自建前端、以人物画像与找人为核心。请先看 [后端模块复用与 AI 接入选型](后端模块复用与AI接入选型.md)。本文保留此前社区平台调研，不再作为当前产品形态的优先采用建议。

> 调研日期：2026-11-10。性质：外部开源项目源码调研，不是目标应用实现，不构成技术栈变更决定。
> 评估对象：HumHub、Elgg、OSSN 的公开稳定发行版，以及 HumHub REST 模块。
> 方法：检查官方 GitHub 发行元数据、文件树、依赖、测试与 CI 定义，抽查好友、资料、消息及 API 实现。未部署运行、未执行其测试套件、未测覆盖率或性能；不是完整安全审计。

## 1. 结论与适用前提

三者都有可复用的社交功能，但应分别评价产品完整度、工程可维护性、业务规则适配、独立前端 API 覆盖。不能把功能名称相同当成行为相同，也不能把公开测试数量当成测试覆盖率。

- **采用整套平台并接受其页面、PHP 和数据库体系：优先验证 HumHub。** 现有社区功能组织完整，采用插件扩展的路线值得先做验证。
- **接受 PHP，希望较深地定制社交数据和权限：Elgg 值得与 HumHub 对照验证。** 核心及插件测试、升级测试、资料字段访问控制具有明确源码依据；需学习它自己的实体、关系和插件体系。
- **保留 Next.js + FastAPI + PostgreSQL 以及当前业务规则：三者都不是低成本可直接替换的后端。** 接 API 仍要处理业务权限、数据所有权和事务；把 PHP 核心移植为 Python 会变成大量重写。
- **OSSN 暂不作为本项目的首选长期底座。** 本次在稳定版公开仓库没有找到与另外两者相当的自动化回归体系。这个判断不等于它不能使用或其维护者没有私有测试。

以上为本次代码抽查后的工程判断，不是性能排名或量化质量评分。

## 2. 版本范围

| 项目 | 检查版本 | 发行时间（UTC） | 固定提交 |
|---|---|---|---|
| HumHub | v1.19.4 | 2026-11-09 | b8881d5ea7ee27384a33adeaa23100c73472c4ce |
| Elgg | 7.1.3 | 2026-11-05 | e3c1aebac2ee46263205b21d7f9d887d77ed60f6 |
| OSSN | 10.1 | 2026-10-01 | 48b53f5b95488187715b2d5b5ae46a993267f83d |
| HumHub REST | v0.12.7 | 2026-11-08 | 72e1608e58b3a42ee43356fcb3ce9efe7349848c |

发行依据：[HumHub](https://github.com/humhub/humhub/releases/tag/v1.19.4)、[Elgg](https://github.com/Elgg/Elgg/releases/tag/7.1.3)、[OSSN](https://github.com/opensource-socialnetwork/opensource-socialnetwork/releases/tag/10.1)、[HumHub REST](https://github.com/humhub/rest/releases/tag/v0.12.7)。后续升级须重新检查，本文结论不自动适用于未来版本或全部第三方插件。

## 3. 工程证据对比

| 维度 | HumHub | Elgg | OSSN |
|---|---|---|---|
| 基础结构 | Yii2、模块和 ActiveRecord；依赖由 Composer 管理 | 自有社交框架，实体、关系、访问控制和插件；Composer 管理 | 自有 PHP 类、全局函数、回调和组件体系 |
| 回归测试依据 | Codeception；单元、功能及浏览器验收测试目录；PHP 与数据库兼容 CI | PHPUnit 核心/插件单元及集成测试；独立跨版本升级 CI | 有人工式 TESTS.md 检查清单；该发行版文件树未见 .github/workflows，也未找到标准 PHPUnit/Codeception 测试套件 |
| 独立前端接口 | 有 REST 模块、OpenAPI、Postman 和 API 测试；需逐端点核对权限和缺口 | Web Services 提供暴露业务方法的框架，需要自行定义与注册接口 | README 提到 WebServices，但当前核心组件树未找到对应完整接口实现；需另外定位组件与版本 |
| 改页面/增加普通功能 | 沿现有模块体系扩展，初步判断成本相对可控 | 插件扩展较灵活，框架学习成本更明显 | 小范围修改入口直接，但复杂改动需自行补充回归保障 |
| 深改本项目规则 | 活动、逐字段可见性、好友事务和历史消息授权都需验证或定制 | 字段访问控制已有基础，但好友状态机、活动及消息规则仍需定制 | 同样需要定制，测试与接口补建增加不确定性 |

### HumHub 的工程依据

[composer.json](https://github.com/humhub/humhub/blob/b8881d5ea7ee27384a33adeaa23100c73472c4ce/composer.json) 使用 Yii2，并列出 Codeception 及其 Yii2、REST、WebDriver 等测试模块。

[PHP CI](https://github.com/humhub/humhub/blob/b8881d5ea7ee27384a33adeaa23100c73472c4ce/.github/workflows/php-test.yml) 定义多 PHP 版本矩阵；[基础测试工作流](https://github.com/humhub/humhub/blob/b8881d5ea7ee27384a33adeaa23100c73472c4ce/.github/workflows/php-test-base.yml) 包括迁移、安装、重建搜索索引和运行 Codeception；[数据库兼容工作流](https://github.com/humhub/humhub/blob/b8881d5ea7ee27384a33adeaa23100c73472c4ce/.github/workflows/php-test-db-compat.yml) 覆盖多个 MySQL/MariaDB 版本。这证明仓库定义了相应回归流程，不代表本次确认其全部运行通过。

### Elgg 的工程依据

[PHPUnit 工作流](https://github.com/Elgg/Elgg/blob/e3c1aebac2ee46263205b21d7f9d887d77ed60f6/.github/workflows/phpunit.yml) 分别运行核心单元、核心集成、插件单元和插件集成等测试；[升级工作流](https://github.com/Elgg/Elgg/blob/e3c1aebac2ee46263205b21d7f9d887d77ed60f6/.github/workflows/upgrade.yml) 定义从旧版本逐步升级并执行测试的路径。对需要持续升级的二次开发项目，这是有价值的工程基础。

### OSSN 的工程依据与限制

[TESTS.md](https://github.com/opensource-socialnetwork/opensource-socialnetwork/blob/48b53f5b95488187715b2d5b5ae46a993267f83d/TESTS.md) 是逐项标注 OK 的功能检查记录，标题仍为 V8.8；不能将它当成 10.1 的自动化测试运行结果。[发行版文件树](https://github.com/opensource-socialnetwork/opensource-socialnetwork/tree/48b53f5b95488187715b2d5b5ae46a993267f83d) 未见同等 CI 与测试套件。

[OssnDatabase](https://github.com/opensource-socialnetwork/opensource-socialnetwork/blob/48b53f5b95488187715b2d5b5ae46a993267f83d/classes/OssnDatabase.php) 使用 PDO MySQL 和自有查询封装。它可以承载功能，但不能因为文件数量较少就推断长期改造成本更低。

## 4. 真正影响本项目改造成本的发现

### 4.1 HumHub 有 REST API，但不能直接假定适合全部普通用户操作

REST v0.12.7 的 [README](https://github.com/humhub/rest/blob/72e1608e58b3a42ee43356fcb3ce9efe7349848c/docs/README.md) 仍提示 Beta。其 [接口目录](https://github.com/humhub/rest/blob/72e1608e58b3a42ee43356fcb3ce9efe7349848c/docs/MANUAL.md) 列有用户、帖子、评论、空间等核心 API，也链接 Mail 模块 API；不能简单说它没有消息接口。

但是 [UserController](https://github.com/humhub/rest/blob/72e1608e58b3a42ee43356fcb3ce9efe7349848c/controllers/user/UserController.php) 的访问规则要求 ManageUsers，更新资料使用管理员编辑场景。这类管理接口不能直接用来证明普通用户能按本项目字段权限编辑自己的资料。应以普通用户身份逐条验证，必要时新增受控业务接口，不能通过给普通用户管理权限解决。

本次检查的 REST 核心控制器及文档未列出完整好友申请状态机接口；消息接口另在 Mail 模块。好友、普通用户资料、检索筛选和消息授权应列入验证清单。

[BaseController](https://github.com/humhub/rest/blob/72e1608e58b3a42ee43356fcb3ce9efe7349848c/components/BaseController.php) 的分页采用 page/limit，默认和上限为 100，与本项目签名 cursor、默认 24/最大 48 的契约不同；不能只改 URL 前缀就认为接入完成。

### 4.2 Elgg 已有好友申请，但行为与本项目仍不同

[friends 插件配置](https://github.com/Elgg/Elgg/blob/e3c1aebac2ee46263205b21d7f9d887d77ed60f6/mod/friends/elgg-plugin.php) 存在 friend_request 设置，默认值为 0；[接受控制器](https://github.com/Elgg/Elgg/blob/e3c1aebac2ee46263205b21d7f9d887d77ed60f6/mod/friends/classes/Elgg/Friends/Actions/AcceptFriendRequestController.php) 明确实现了申请接受。因此此前“是否支持双向申请待核对”的问题，本次已确认存在可选申请流程。

但 [AddFriendController](https://github.com/Elgg/Elgg/blob/e3c1aebac2ee46263205b21d7f9d887d77ed60f6/mod/friends/classes/Elgg/Friends/Actions/AddFriendController.php) 在发现对方向自己发过申请时，可直接添加关系并发送接受通知。它与本项目“反向发送不自动接受，接收者需确认准确请求版本”不同。

这是一项产品语义差异，不是对 Elgg 宣称存在安全漏洞。接入时需调整接受入口、版本校验和并发规则，并验证关系、私聊、联系方式授权及 outbox 的原子事务。

### 4.3 个人资料模块不等于逐字段授权已满足

Elgg 的 [ProfileData](https://github.com/Elgg/Elgg/blob/e3c1aebac2ee46263205b21d7f9d887d77ed60f6/engine/classes/Elgg/Traits/Entity/ProfileData.php) 已支持为字段值指定 access_id，可作为权限定制的基础。

HumHub 的 [ProfileField](https://github.com/humhub/humhub/blob/b8881d5ea7ee27384a33adeaa23100c73472c4ce/protected/humhub/modules/user/models/ProfileField.php) 有管理员定义的字段类型、visible、searchable、directory_filter 等配置。这不直接证明已实现“每位用户对每个确认字段选择 authenticated/friends/private”。

两者仍需验证本项目的动态好友可见性、全局与活动字段区分、合法访问入口，以及联系人按版本与关系轮次独立授权。

### 4.4 群组、讨论、私信与即时群聊应分别检查

Elgg 的 [ElggMessage](https://github.com/Elgg/Elgg/blob/e3c1aebac2ee46263205b21d7f9d887d77ed60f6/mod/messages/classes/ElggMessage.php) 体现发送者、接收者与私有消息模型；OSSN 的 [OssnMessages](https://github.com/opensource-socialnetwork/opensource-socialnetwork/blob/48b53f5b95488187715b2d5b5ae46a993267f83d/components/OssnMessages/classes/OssnMessages.php) 核心发送方法以 from/to 为参数。这些源码不能单独证明已覆盖活动群聊和入群后历史区间授权。

本项目需要验证：加入之前的消息不可读、退出后详情/分页/订阅均失效、切活动不删除既有好友私聊、重试不重复发送。不能因为功能列表同时出现 Groups 和 Messages 就判为完全满足。

### 4.5 HTTP API 与原有业务实现之间仍有工作量

Elgg 的 [Web Services 文档](https://github.com/Elgg/Elgg/blob/e3c1aebac2ee46263205b21d7f9d887d77ed60f6/docs/guides/web-services.rst) 明确要求开发者启用插件、暴露业务方法、配置 API 与用户认证；其接口形态为 REST/RPC 混合。它提供开发接口的机制，不代表本项目需要的全部接口已就绪。

三者所检查的运行或测试代码均围绕 PHP 与 MySQL/MariaDB。把它们接到现有计划的 FastAPI/PostgreSQL 旁边，会新增数据所有权、身份映射和跨存储事务问题。不能把好友权威状态同时放在两边，也不能默认跨数据库接受好友仍是一个本地事务。

## 5. 改造难度判断

以下为相对工作范围判断，不是工期承诺；尚未通过实际插件原型测量。

| 目标 | HumHub | Elgg | OSSN |
|---|---|---|---|
| 部署原生社区，保留多数页面与交互 | 低到中 | 中，需要选择和配置插件 | 低到中 |
| 保留其后端，重做 Next.js 前端 | 中到高：核对权限并补接口 | 高：定义并暴露 API | 高且不确定：先确认接口组件与版本，再补回归测试 |
| 完整实现当前活动、画像、好友和消息规则 | 高 | 高；字段访问控制有可复用基础 | 高且验证负担更大 |
| 改成 FastAPI + PostgreSQL 核心 | 大量重写 | 大量重写 | 大量重写 |

## 6. 下一步应验证什么

建议先选 HumHub 做一个小范围验证，并把 Elgg 的字段权限作为对照；不同时全面改造三套系统。只有以下关键路径通过后，才据此决定是否调整当前技术方案：

1. 普通用户通过 API 编辑本人资料、读取获准字段，不需要管理员权限。
2. 活动 A 的成员无法通过列表、筛选、详情 ID 或后续分页读取活动 B 的受限候选；广场公开作者例外单独通过合法入口验证。
3. 好友申请支持明确接受、expected_version、反向申请不自动同意；关系、会话和联系人授权保持一致。
4. 普通画像 friends 字段动态生效；联系人变更版本或解除后重建好友，不恢复旧授权。
5. 帖子、评论、消息可由 Next.js 调用所需接口；群历史范围和退出撤权符合契约。
6. 实现尽量落在插件和适配层，并有自动化业务回归；若必须持续修改多个核心模块或拆分权威事务，应重新评估采用整套平台的收益。

验证通过后的选择：接受原生平台路线可优先 HumHub；愿意承担较深 PHP 定制且验证表明 Elgg 权限基础更合适，则选择 Elgg。若必须同时保留现有前端方案、FastAPI/PostgreSQL 和全部业务契约，仍应将自有模块化单体作为候选基线比较成本，而不是预先认定开源整套平台必然更省开发。

## 7. 与现有设计的关系

本次不修改冻结原稿、GameBuddy 或九份当前设计。规则依据为 [项目约束](../AGENTS.md)、[系统架构与领域设计](../docs/系统架构与领域设计.md)、[社交后端业务设计](../docs/社交后端业务设计.md) 和 [共享数据与接口契约](../docs/共享数据与接口契约.md)。

未对各项目及其第三方组件进行完整许可证组合审查，也未验证商业模块购买范围；本文不据此承诺全部功能可按同一许可直接商用。
