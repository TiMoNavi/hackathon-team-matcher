# GitHub 参考后端调研

> 核验日期：2026-11-11（Asia/Shanghai）。方法：公开 GitHub 元数据、固定提交 README、目录与局部源码检查；没有安装候选依赖、启动服务或验证匹配效果。
> 搜索目标是项目匹配、角色互补、性格/协作偏好与 AI 扩展，不仅是相似度推荐。HumHub example-basic 是用户明确的第一参考；LightFM 降为历史算法背景，不作为首选新依赖。

## 1. 结论与选择顺序

最值得组合参考的是 **HumHub example-basic 的模块装配、harvard-hbs/team-formation 的相似/差异约束、Gorse 的可插拔重排，以及 Duolicious 的用户问答与性格信息表达**。它们分别解决不同层次的问题，不能直接拼装成已符合本项目规则的产品。

其中 team-formation 比单纯相似推荐更贴近本次要求：它有 FastAPI 后端，可以按字段配置聚合与分散目标。但它是对一份名单做整体分组，本项目主要是用户主动发现和联系，不能照搬“所有人各分到一个组”的行为。

| 优先级 | 仓库 | 实际类型 | 建议借鉴 | 首版是否直接依赖 |
|---|---|---|---|---|
| 第一 | [humhub/example-basic](https://github.com/humhub/example-basic) | HumHub 官方基础模块示例 | 模块入口、事件、设置表单、测试目录 | 参考其骨架组织自研模块 |
| 重点 | [harvard-hbs/team-formation](https://github.com/harvard-hbs/team-formation) | Python 约束求解库 + FastAPI/SSE + UI | 动态字段、相似与差异目标、组内组合质量 | 先借鉴规则建模；后续组合求解再评估适配 |
| 重点 | [gorse-io/gorse](https://github.com/gorse-io/gorse) | Go 推荐引擎与 REST 服务 | 多路推荐、反馈管线、外部重排接口 | 先参考接口边界，不要求立刻部署完整引擎 |
| 定向参考 | [duolicious/duolicious](https://github.com/duolicious/duolicious) | Python/PostgreSQL 社交产品后端 | 用户问答、性格信息与匹配展示 | 参考交互和数据流程，不替换 HumHub 社交底座 |
| 后续可选 | [google/or-tools](https://github.com/google/or-tools) | 优化求解库，有 Python 接口 | 角色数量、任务容量与时间等显式约束 | 仅在需要组合求解时引入，自己提供业务接口 |
| 对照参考 | [TimefoldAI/timefold-solver](https://github.com/TimefoldAI/timefold-solver) | Java/Kotlin 约束求解器 | 硬约束/软偏好与复杂任务分配思想 | 当前没有必要额外引入 JVM 运行时 |

这是按适配价值排序，不是按 star 或声称的准确率排序。本轮没有找到经过本项目验证、同时直接满足 HumHub 接入、活动范围、角色互补、人格偏好、用户确认与 AI 预算的现成成品；不据此宣称整个 GitHub 都不存在。

## 2. HumHub example-basic：第一参考已经核到代码

固定提交 `89605b11d09427e5ff1cc224392b926de4beb4ce`。

2026-11-11 R0再次核验了config.php、Module.php、module.json、Configuration及文档；README实际位于docs/README.md，许可入口为docs/LICENCE.md，指向HumHub许可说明。根目录README.md/ LICENSE.md并不存在，不能按习惯猜路径。本轮只借鉴装配机制，未复制上游实现；见 [R0来源记录](sources/r0-example-basic-source-check_2026-11-11.json)。

| 文件 | 核验到的机制 | 推荐插件如何对应 |
|---|---|---|
| [config.php](https://github.com/humhub/example-basic/blob/89605b11d09427e5ff1cc224392b926de4beb4ce/config.php) | 注册模块及 TopMenu、AdminMenu 的初始化事件 | 采用同样的原生挂载机制，用户端视觉仍交给自有 React |
| [Module.php](https://github.com/humhub/example-basic/blob/89605b11d09427e5ff1cc224392b926de4beb4ce/Module.php) | 继承 Module、配置 URL、获取 Configuration、调用父类 disable | 把策略管理挂在模块设置入口，业务暂停另用功能开关 |
| [models/Configuration.php](https://github.com/humhub/example-basic/blob/89605b11d09427e5ff1cc224392b926de4beb4ce/models/Configuration.php) | Yii Model 校验后读写 SettingsManager | 用于字段绑定与策略版本选择；实际规则参数须严格校验，不能直接沿用示例的 safe 字符串规则 |
| tests/codeception | 目录含单元、功能与验收示例 | 保留原生接入测试，匹配内核另用内存适配器验证 |

该模板不包含人物推荐、项目缺口、字段授权或 AI 重排。我们复用其插件装配方式，在模块内部加入应用用例、纯规则内核与外层适配器。不要为了照搬示例把全部匹配逻辑塞进 Controller，也不要让第三方模块随意读取 P1 的全部资料。

本轮只读了选定文件，没有克隆安装到 protected/modules，也没有运行其 Codeception 测试。

## 3. team-formation：最贴近相似与差异规则的参考后端

固定提交 `ee2506cdc343de7d789d4c04cf86005c065827a4`；默认分支提交日期 2026-10-27。仓库命名空间为 harvard-hbs，不把机构名称当作质量或适用性保证。

### 已有能力

[README](https://github.com/harvard-hbs/team-formation/blob/ee2506cdc343de7d789d4c04cf86005c065827a4/README.md) 说明使用 OR-Tools CP-SAT，并提供 FastAPI 与 SSE 进度响应；本轮进一步核对了 [请求模型](https://github.com/harvard-hbs/team-formation/blob/ee2506cdc343de7d789d4c04cf86005c065827a4/team_formation/api/models.py)、[API 实现](https://github.com/harvard-hbs/team-formation/blob/ee2506cdc343de7d789d4c04cf86005c065827a4/team_formation/api/main.py) 和 [约束内核](https://github.com/harvard-hbs/team-formation/blob/ee2506cdc343de7d789d4c04cf86005c065827a4/team_formation/team_assignment.py)。

- participants 支持动态属性字典，constraints 指定 attribute、type、weight。
- 接口接受 cluster、cluster_numeric、diversify、different 四种类型。
- `POST /api/assign_teams` 通过 SSE 返回求解进展和结果，这是上游路径，不是本项目新 API。
- 求解在线程中运行，使用配置的最大求解时间；源码目录含 API、字段验证、聚类与分散相关测试。存在测试不等于本轮已执行通过。

### 四个类型的真实语义

| 类型 | 局部源码中如何实现 | 对我们有什么启发 |
|---|---|---|
| cluster | 对每组使用“人数减去最多相同属性值的人数”形成代价 | 可以鼓励同主题、同项目方向的人在一组 |
| cluster_numeric | 数值聚类，代码提供数值范围等计算 | 可以参考明确数值偏好的距离；不能把 MBTI 编成任意整数后算距离 |
| diversify | 根据整个输入名单的属性分布，计算每组目标数量与偏差 | 适合研究组内分布目标，但不等于按项目需要分配技术/商业角色 |
| different | 对组内同一属性值超过一个的数量形成代价 | 可鼓励角色分散；这是软代价，不保证必有一个协调者、一个技术、一个商业 |

这些代价按权重累加后最小化。用户所需的“角色互补”还应加入明确缺口、最低覆盖、候选愿意承担的角色、可投入容量和双方偏好；不能简单把 role 设为 different 就声称已经完成。示例里的性别等教学属性不应照搬为本项目推荐特征。

### 不适合直接照搬的地方

1. 内核将每位输入参与者约束为恰好属于一个组，并规定组人数。本项目允许认识多人、参与多个想法，不能自动采用全活动独占分组。
2. 当前 API 的 target_team_size 要求大于 2，因此它不是一对一好友排名接口。
3. 内核会验证每个受约束属性的缺失/数值异常。我们的自愿性格字段允许缺省，不能为了满足求解器而编造答案，或把没有填写的人都踢出推荐；需另建明确的未知信息策略。
4. 本轮查看的 assign_teams 路由没有项目所需的登录身份、当前活动、逐字段授权或关系状态依赖。请求中的完整 participants 不能直接由浏览器提供为可信事实；需应用服务先生成合法输入。
5. 人数列表和 max_time 在所读请求模型中未设置本项目需要的最大界限。部署前需另加输入、时间、并发、取消和任务访问限制。这里是具体适配缺口，不是完整安全审计。
6. 所读 API/求解内核未见 LLM 接口、需求对话或证据解释层。AI 仍需通过我们的受控适配器接入。

建议先借鉴“字段目录 + 类型化规则 + 代价解释”，用于我们的单人/项目推荐内核。以后若做组合预览，再考虑在统一 Python worker 中调用适配后的求解函数；不先把整个上游名单分组站当作新社交后端。

## 4. Gorse：重点看 AI 重排边界

固定提交 `2145bd0567f03b59f83f43ea2575a17a9bdaa016`。其 [README](https://github.com/gorse-io/gorse/blob/2145bd0567f03b59f83f43ea2575a17a9bdaa016/README.md) 描述多来源推荐、用户/物品/反馈输入及 REST；[reranker.go](https://github.com/gorse-io/gorse/blob/2145bd0567f03b59f83f43ea2575a17a9bdaa016/logics/reranker.go) 中可以看到 query/document 模板、外部 Reranker 请求和 Decision 接口调用。

值得借鉴的是排序提供者接口：主流程先准备候选与查询，后面的实现可以更换。对我们而言，规则内核与模型网关不必绑定某一个供应商；角色互补和解释规则仍由自己的领域用例约束。

两个重要接入差异：

- 将人作为 item 输入不自动获得双向意愿、项目缺口与活动权限。若以后真的接 Gorse，输入、索引、召回和结果读取都需保证活动范围；不能全站召回后只在浏览器过滤。
- 上游 ranker 的 retry 在可重试错误下最多尝试三次。我们的实际模型请求必须计入同一 run 的预算；不可在外层算一次调用、底层却自动重试三次。接入时需统一预算扣减、重试与取消。

Decision 客户端源码注明对应 Jev decisions API，不应把这个名字理解成任意聊天模型协议都可直接兼容。外部提供者的协议、成本、数据处理和可用性需单独验证，本轮没有配置或调用。

因此推荐先参考其可替换排序器设计；是否部署整个 Gorse，应由实际反馈量、维护成本与活动隔离验证决定。它不替代我们自己的 RuleEvaluator。

## 5. Duolicious：性格与问答的定向参考

固定提交 `72bcf85501ff87d565757023cffebecea65548a3`。其 [README](https://github.com/duolicious/duolicious/blob/72bcf85501ff87d565757023cffebecea65548a3/README.md) 介绍基于问答和性格信息的社交产品；[personality.py](https://github.com/duolicious/duolicious/blob/72bcf85501ff87d565757023cffebecea65548a3/backend/serviceshared/matching/personality.py) 将回答累积成特征向量，并依据回答数量调整向量权重。

适合借鉴“用户回答 → 有来源的特征 → 匹配解释”的数据流及信息不足处理思路。其约会语境、问卷内容、人格维度和匹配百分比不能直接证明适合黑客松协作；我们也不应简单把多回答问题的人排得更高。

本项目性格匹配优先使用用户确认的具体习惯与对伙伴的偏好，允许不填写；不会因引入 AI 就从简历推测人格。原有 [Duolicious 复审](../../backend-research/Duolicious后端代码质量与核心交互分析.md) 基于旧提交，不能被当作本轮最新提交的完整审计结论。

## 6. 约束求解库与不优先的方向

[OR-Tools](https://github.com/google/or-tools) 提供 CP-SAT 等优化工具以及 Python 包装；team-formation 已在使用它。我们若需要为一个具体项目生成组合建议，它是可以评估的内核，但身份、存储、API、权限、解释和用户确认仍须自己实现。

[Timefold Solver](https://github.com/TimefoldAI/timefold-solver) 面向 Java/Kotlin 的约束优化与任务分配。本轮仅核对 README 和元数据，没有抽查其内部算法，不以“AI Solver”的名称将其等同于 LLM。当前 PHP + 可选 Python 的路线不必为了参考硬/软约束而增加 JVM 服务。

[Open Match](https://github.com/googleforgames/open-match) 的定位是可扩展的游戏匹配服务，本轮默认分支提交日期仍为 2024-07-10，虽然 pushed_at 更新到 2026 年；两个时间含义不同。它不作为当前低规模、可异步交流的好友/项目发现首选。本轮未做其源码审计。

[LightFM](https://github.com/lyst/lightfm) 本轮默认分支提交为 2023-04-30，仓库 pushed_at 为 2024-07-24。按用户要求不作为新依赖首选，也不以这些时间单独断言项目已停更或不可用。当前主要问题是它不直接表达项目缺口、角色容量和明确的协作偏好。

搜索还出现 rodrigoguirao/ai-hackathon-team-maker 的索引结果，但本轮 GitHub API 返回 404，无法核验当前源码，未列入建议。检索结果标题不能作为现成后端存在或可复用的证明。

## 7. 维护与来源快照

以下日期是本轮核验的默认分支提交时间，不宣称是最新发行版时间。哈希、仓库 pushed_at、stars 和 API 许可识别值保存在 [元数据](sources/github-repositories_2026-11-11.json)；完整哈希对应固定源码，后续升级需重新检查。

| 仓库 | 默认分支提交日期（UTC） | 本轮观察范围 |
|---|---|---|
| humhub/example-basic | 2026-11-04 | README、树、模块入口、设置、许可指引 |
| harvard-hbs/team-formation | 2026-10-27 | README、树、API 模型/路由、求解内核、依赖定义 |
| gorse-io/gorse | 2026-10-30 | README、树、外部重排与 Decision 客户端 |
| duolicious/duolicious | 2026-11-11 | README、相关树、personality 计算文件 |
| google/or-tools | 2026-09-17 | README、元数据 |
| TimefoldAI/timefold-solver | 2026-11-11 | README、元数据 |
| googleforgames/open-match | 2024-07-10 | README、元数据 |
| lyst/lightfm | 2023-04-30 | README、元数据 |

API 将 team-formation 识别为 MIT，Gorse、OR-Tools、Timefold Solver、Open Match、LightFM 为 Apache-2.0，Duolicious 为 AGPL-3.0。example-basic 未识别 SPDX，其 docs/LICENCE.md 指向 HumHub 许可说明；不能把未识别理解成没有许可条件。这里只记录来源，不替代对实际复制版本及文件的许可核对。Timefold README 另有版本/商业能力区分，不能将仓库许可自动套到外部托管产品。

证据文件：[检索范围](sources/search-scope_2026-11-11.json)、[选定文件树](sources/source-tree-selection_2026-11-11.json)、[源码路径与 SHA256](sources/source-inspection_2026-11-11.json)。不包含本地凭据或用户原文；本轮没有执行第三方应用或进行性能/生产验证。

## 8. 对当前实现路线的具体建议

先用 example-basic 的机制承载自己的推荐模块，以 P1 获准字段为输入，实现相似、互补、兼容与资格约束。保留明确证据、未知项和版本，使无 AI 的普通发现也能独立工作。

随后接一个统一的 AI 查询/重排提供者，参考 Gorse 的接口分离，但使用自己的预算和证据校验。若用户进一步需要“为这个项目建议一个三人组合”，再借鉴 team-formation / OR-Tools，增加显式角色覆盖与容量约束；不要把全活动的人自动分组。

这样复用的是经核验的接口和算法思路，正式业务仍有清楚的数据归属、活动边界与用户决定权。
