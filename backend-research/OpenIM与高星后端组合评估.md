# OpenIM 与高星后端组合评估

> 调研日期：2026-11-11，Asia/Shanghai。依据冻结简介、当前领域设计与共享契约，核对官方仓库、GitHub API、README、许可证和部分配置。本轮是选型调研，没有安装 OpenIM、调用模型、迁移现有后端或运行候选应用测试。
> 星数、许可证识别及推送时间的公开元数据见 [来源快照](OpenIM与高星后端调研_2026-11-11_来源快照.json)。星数用于说明关注度，不能单独证明生产质量、社区共识或本项目适配程度。

## 1. 对这次问题的回答

可以用 OpenIM 配合其他后端做出冻结简介中的产品。OpenIM 适合承担即时通信；画像确认、活动资格、发现推荐和隐私规则应由一个明确的业务后端统一管理。

本次找到多个高关注度项目，能复用消息、资料解析、数据库认证、推荐计算和模型调用的部分能力；没有找到一套经过本次验证、可直接覆盖全部目标规则的现成产品。以下建议是候选组合，不构成既有技术方案变更。

针对自建 React 前端、每场约 300–400 人的目标，优先验证以下组合：

- FastAPI 模块化单体与 PostgreSQL 管理账号映射、活动、画像、想法、广场和业务权限。
- OpenIM 提供聊天基础设施，经适配器接入。
- Docling 处理简历文件，模型适配器提取结构化草稿，用户确认后入正式画像。
- 普通发现先用数据库筛选；语义检索按需加 pgvector。
- LiteLLM 统一模型调用；复杂多步编排再评估 LangGraph，或选择 Dify 作为可视化替代。

这些是逻辑职责，不要求每个名字都独立部署一个服务。Docling、LiteLLM 和 LangGraph 均可在 Python 进程或 worker 中按需使用。没有必要首期把 Supabase、Gorse、Qdrant、Dify 和票务平台全部装上。

## 2. 项目清单与实际可复用部分

星数为本轮 GitHub REST API 快照。链接指向官方项目；大仓库星数不代表其所有子项目都有同样规模。

| 需求 | 项目及 Stars | 可以复用 | 本项目仍需完成 | 建议位置 |
|---|---|---|---|---|
| 即时通信 | [OpenIM Server](https://github.com/openimsdk/open-im-server)，16,765 | 消息、会话、好友、群组、SDK、REST API、回调 | 活动想法群映射、业务授权、历史可见范围与跨服务一致性 | 首选通信候选 |
| 登录与资料数据基础 | [Supabase](https://github.com/supabase/supabase)，114,782 | PostgreSQL、Auth、存储、Realtime、数据 API | 画像字段及确认版本、活动模型、逐条可见性、发现规则 | 可选基础设施，不是画像成品 |
| 简历解析 | [Docling](https://github.com/docling-project/docling)，70,414 | PDF/DOCX 等文档结构解析、OCR、本地处理；可用官方 docling-serve 暴露 API | 技能/经历等业务提取、来源证据、缺项补问、人工确认 | 优先复用的解析组件 |
| 简历编辑流程 | [Resume Matcher](https://github.com/srbhr/Resume-Matcher)，29,237 | 上传简历、AI 修改、预览与编辑；FastAPI 后端 | 多用户隔离、GitHub 合并、活动资料 schema、十步引导和字段权限 | 代码参考或局部改造 |
| 用户主动提供的网页 | [Crawl4AI](https://github.com/unclecode/crawl4ai)，87,200 | 网页抓取、清洗和提取 | 用户授权范围、来源归属、按需触发、安全 URL 策略 | 可选采集适配器 |
| 推荐引擎 | [Gorse](https://github.com/gorse-io/gorse)，9,919 | users/items/feedback 推荐 API、相似推荐、协同过滤、embedding 与排序能力 | 当前活动限定、双方意愿、关系排除、解释依据与权限复核 | 有反馈数据后比较收益 |
| 推荐召回 | [pgvector](https://github.com/pgvector/pgvector)，23,648 | PostgreSQL 内向量相似搜索，可与 SQL 条件组合 | 画像投影、业务排序、结果权限、卡片批次 | 更贴合首期数据库方案 |
| 独立向量检索 | [Qdrant](https://github.com/qdrant/qdrant)，35,508 | 向量检索与过滤 | 同样不提供活动与画像业务规则 | pgvector 的备选，不默认同时部署 |
| 模型接入调用 | [LiteLLM](https://github.com/BerriAI/litellm)，63,081 | 多供应商调用、SDK/代理、使用量与费用记录、路由 | 每个业务 run 的预算、错误规则和数据最小化 | 优先验证模型适配器 |
| 多步 AI 流程 | [LangGraph](https://github.com/langchain-ai/langgraph)，44,776 | 状态式编排、持久化执行、等待人工输入 | 实际画像 schema、权限、确认与保存用例 | 代码型编排候选 |
| 可视化 AI 后端 | [Dify](https://github.com/langgenius/dify)，160,927 | 可视化工作流、模型/工具接入、应用 API | 业务数据库、活动限制、保存授权、运行预算 | LangGraph 自编排路线的替代候选 |
| 活动报名与票务 | [Hi.Events](https://github.com/HiEventsDev/Hi.Events)，4,167 | 活动、票务、报名、签到、REST API、webhooks | 邀请入活动后的发现隔离、全局好友、活动想法群 | 需要报名签到时再接 |
| Python 票务平台 | [pretix](https://github.com/pretix/pretix)，2,565 | 活动售票、订单、报名与检票能力 | 同样不提供找队友与画像权限 | 票务备选；星数不算高 |
| 集中式社交基础能力 | [Nakama](https://github.com/heroiclabs/nakama)，13,703 | 用户、存储、好友、群组、持久化聊天 | Matchmaker 面向游戏，不能直接等同找队友；活动画像仍需自定义 | OpenIM 路线的对照候选 |

当前活动平台候选的星数明显低于 AI 与通用后端项目，不能为了满足“高星”就把日程工具或数据库平台称为已完成活动社交业务。

## 3. OpenIM 能替你完成什么

### 已有能力与产品差额

[官方 README](https://github.com/openimsdk/open-im-server/blob/main/README.md) 将 OpenIM 定位为供开发者集成的 IM SDK 与服务端，列出好友、群组、会话、REST 和 webhooks。它不是包含目标产品全部页面和业务的即装社交网站。

| 冻结简介对应能力 | OpenIM 的作用 | 接入后的业务工作 |
|---|---|---|
| 好友申请与文字私聊 | 可复用关系和消息接口 | 来源校验、明确接受、expected_version、屏蔽与联系人授权 |
| 想法群聊 | 可复用群与群消息 | Idea、IdeaActivity 与 Discussion 的关系，成员生命周期 |
| 群里的 AI | 提供接收触发和发送回复的通信通道 | AI 上下文、调用预算、授权、@AI 触发与回复去重 |
| 注册与登录 | IM 登录不是产品身份认证的全部 | GitHub/邮箱登录、账号唯一映射、IM token 颁发 |
| 画像、推荐卡片、活动管理 | 不应由 IM 基础资料和群组直接代替 | 在业务后端实现和约束 |
| 广场与评论 | 消息系统不能直接当作广场 | 帖子、评论、可见范围、作者入口与审核 |

官方另有 [openimsdk/chat](https://github.com/openimsdk/chat)，提供注册登录、资料更新和管理后台相关业务；本轮为 161 stars。它能作为接入参考，但 OpenIM Server 的 16,765 stars 不能移用到这个业务仓库，也不能据此假定 GitHub 登录和目标画像规则现成可用。

### 部署负担需要单独看

本轮 [latest release API](https://api.github.com/repos/openimsdk/open-im-server/releases/latest) 返回 v3.8.3-patch.18，发布时间为 2026-10-13，prerelease=false。它是查询到的最新发行记录，不是本项目已验证的推荐安装版本。

默认分支的 [Docker Compose](https://github.com/openimsdk/open-im-server/blob/main/docker-compose.yml) 涉及 MongoDB、Redis、etcd、Kafka、MinIO，以及可选前端/监控组件。正式部署应核对选定发行版的配置和必要组件，不能把默认分支配置直接视为发行版保证。

由此判断，它不是只接到现有 PostgreSQL 的一个轻量插件。对于几百人一场的项目，主要投入会包含配置、升级、备份和排错，而不仅是消息 API 接入。没有本项目压测结果，本文不承诺服务器规格、并发量或月费。

### 许可证必须逐仓库核对

- Server 的 [LICENSE](https://github.com/openimsdk/open-im-server/blob/main/LICENSE) 为 Apache-2.0。
- [openim-sdk-core/LICENSE](https://github.com/openimsdk/openim-sdk-core/blob/main/LICENSE) 为 AGPL-3.0。
- 本次检查的 [open-im-sdk-web/LICENSE](https://github.com/openimsdk/open-im-sdk-web/blob/main/LICENSE) 也是 AGPL-3.0；其 README 却链接服务端 Apache 文案，存在信息不一致。该旧仓库也不能直接代表最终选择的当前 Web SDK。

所以不能把整个 OpenIM 生态统一标为 Apache。接 React 前需要固定实际 npm 包、对应源码和版本，再核对许可证与分发方式。本文记录文件事实，不把 AGPL 简化为“不能商用”，也不对具体闭源方案给出法律结论。

## 4. 用户画像要分成资料处理和业务保存

本次没有核实到一个高星项目能直接完成“本人 GitHub + 简历 + 外链 + 十步对话 + 逐条可见性 + 本人确认 + 活动偏好”这一整套流程。比较实际的复用路径有两条。

### 路线 A：从解析组件组装，优先建议

~~~text
本人上传简历 → Docling 文档解析 ────────┐
首次 GitHub 授权 → 本人公开来源采集 ────┼→ 来源证据 → 结构化草稿
本人主动提供外链 → 可选 Crawl4AI ───────┘                 ↓
                                        用户核对、补缺和选择可见范围
                                                        ↓
                                        正式画像与版本保存到业务数据库
~~~

Docling 已有 [官方 API 服务 docling-serve](https://github.com/docling-project/docling-serve)。表中的 70,414 stars 属于 Docling 主库，不是 serve 仓库。解析出文档结构与文本后，仍需定义目标 schema、校验来源并进行必要的语义提取。解析成功不等于画像正确。

GitHub 首次注册按当前规则关联本人公开来源，不要求重复粘贴账号；普通再次登录不重抓。GitHub 资料优先通过其官方 API 或公开原始文件读取；不要把网页爬虫当作私有仓库访问权限。项目使用某技术也不能直接推成用户熟练掌握该技术。

原始资料按当前要求存入私有数据库，不自动过期；只在本人导入或主动重新编辑时按需处理。模型输出先保存为草稿，不能直接公开或覆盖用户已确认的新版本。未确认、private、friends 字段不进入推荐候选索引；推荐仅使用获准的 authenticated 投影。

### 路线 B：参考 Resume Matcher，减少编辑流程摸索

[官方 README](https://github.com/srbhr/Resume-Matcher/blob/main/README.md) 描述的是面向求职的本地简历产品，使用 FastAPI、Next.js 和 SQLite，默认不要求创建账号。已有简历上传、AI 修改、预览与编辑，和本项目所需的“先导入再确认”有局部交集。

但它不是拿来就能公开给多用户使用的活动画像服务。GitHub 导入、账号隔离、权限、活动资料和十步引导均须补齐；求职适配评分也不应变成队友适合度。已有本地调研记录了增量修改和覆盖风险，详见 [AI 辅助资料录入选型](AI辅助资料录入后端选型.md)，正式复用前需以选定版本重查。

Supabase 可帮助处理认证与数据基础，但不会自动生成画像业务。若采用它，应明确其 Auth 与 PostgreSQL 如何接入现有后端，不能再维持第二套互不一致的产品用户表。

## 5. 推荐引擎与推荐卡片分别处理

Gorse 是这一组中直接提供推荐服务的候选。其 [当前 README](https://github.com/gorse-io/gorse/blob/master/README.md) 已列出 embedding、经典推荐与 AI 排序能力，不能沿用“只会传统协同过滤”的旧描述。

它围绕 users/items/feedback 工作。把人或想法作为推荐 item 是我们可采用的建模方案，不是它已经实现本项目社交语义的证明。它还不知道你的活动资格、哪些字段可进入模型、谁已有申请，以及用户要找技能互补者还是相似者。

对于每场 300–400 人、起步缺少互动数据的情况，建议先做下列链路，再用真实反馈评估引擎收益：

~~~text
服务端验证当前活动
  → 在本活动获准投影中进行结构化、全文、可选向量召回
  → 合并最多 200 条，确定性粗排
  → 最多 24 条最小摘要进入模型
  → 权限与版本再次校验
  → 最多 5 张带依据的卡片
~~~

普通发现、筛选、翻页和随机浏览为 0 次 LLM 调用。没有合格候选就返回真实不足，不跨活动补数。使用 Gorse 或 Qdrant 也必须在检索范围上落实活动限制；不能先全站推荐，再只靠前端隐藏不合格的人。

pgvector 是向量搜索扩展，不负责生成 embedding，也不是完整推荐后端。首期已有 PostgreSQL 的情况下，可以减少独立系统数量；是否采用 ANN、怎样过滤以及实际延迟须用活动数据验证。

滑动卡片属于前端交互。后端仍要提供卡片数据、来源引用、稳定批次、签名 cursor、曝光/跳过反馈及普通好友申请接口。选择 Gorse 不会自动得到 Tinder 页面，滑动动作也不能绕过明确申请/接受流程。

## 6. 活动管理为什么不一定要接一整套平台

[Hi.Events](https://github.com/HiEventsDev/Hi.Events/blob/develop/README.md) 覆盖活动、报名、售票、签到、API 与 webhooks；[pretix](https://github.com/pretix/pretix) 也是票务领域候选。它们的价值在于组织者侧工作流。

冻结简介中的核心活动需求是唯一邀请码、加入活动、切换当前活动、活动成员资格，以及发现/推荐/讨论的隔离。这类业务仍需由主后端实现，票务系统不能替代成员资格检查。

工程建议：只有确实要售票、支付、订单、复杂报名或现场核验时，再把 Hi.Events/pretix 作为外部活动适配器。报名完成不自动等于有权发现任何活动的人；身份绑定和加入资格仍需由主后端核验。若只是邀请码和成员管理，先在现有业务模块中完成更容易保持一致。

Hi.Events 的当前技术栈为 Laravel/PHP、React、PostgreSQL 和 Redis，引入它意味着维护额外应用。它使用 AGPL-3.0 附加条款，部分企业目录另有许可；pretix 也有附加条款。两者均不能笼统标成“任意去标识白标免费”。

## 7. AI 接入、编排和群内 Agent 的分工

| 组件 | 负责 | 不应承担 |
|---|---|---|
| LiteLLM | 调不同模型、调用记录和路由等模型适配工作 | 判断活动资格、代替画像确认、无限重试 |
| LangGraph | 代码式多步流程、保存执行状态、等待用户输入 | 作为好友、活动或画像的权限事实源 |
| Dify | 可视化工作流与应用 API；适合频繁调提示与流程 | 直接把模型草稿写成公开资料，向工具开放全库权限 |
| FastAPI 业务用例 | 身份、权限、预算、schema 校验、版本检查、确认保存 | 将这些规则只写在提示词中 |

首期可用普通 Python 用例加 worker 编排，无须为了接 AI 同时引入 LangGraph 和 Dify。采用哪一个应由流程维护方式决定。

LiteLLM 的可配置重试/路由与模型工作流仍须受项目 run 预算约束，真实供应商尝试计入预算，不能通过隐藏重试获得第 6 次额度。平台预算不足明确返回错误，不自动切换为未经用户请求的降级推荐。

群内 Agent 的建议链路是：用户明确 @AI 或点击操作 → 服务端核对当前群与成员权限 → 读取获准的有限上下文 → 建立有界 AI 任务 → 发送前复核 → 通过普通业务发送流程发布带 AI 身份的回复。权限范围、回复对象和幂等键由服务器确定。

这条受控回复链路不等于给模型通用发消息、加好友、拉人入群或改可见性的工具。不得读取入群前或其他活动想法群的历史来凑上下文。多人群共用项目上下文也不等于共享所有成员的私有画像。

许可证方面，LiteLLM 非 enterprise 部分为 MIT，企业目录另行许可；LangGraph 库为 MIT；Dify 为附加条件的 Apache 派生许可，包含 workspace 多租户与前端标识条款。普通应用有多名用户不应机械等同其 workspace 多租户，正式使用须按实际部署形态核对。

## 8. 如何接起来，避免两边都管理同一事实

以下是候选架构，不是已实现现状。

~~~mermaid
flowchart TD
  UI[Next.js / React 前端] --> API[FastAPI 业务 API]
  UI --> SDK[选定版本的 OpenIM 客户端 SDK]
  SDK --> IM[OpenIM 消息服务]
  API --> PG[PostgreSQL 业务事实与私有资料]
  API --> IA[IM 适配器与 outbox]
  IA --> IM
  API --> WORKER[异步 worker]
  WORKER --> PARSER[Docling 与按需资料采集]
  WORKER --> LLM[模型适配器 / 可选 LiteLLM]
  WORKER --> PG
  API --> REC[活动内发现与推荐用例]
  REC --> PG
  REC --> LLM
~~~

建议保留账号、活动成员、已确认画像、好友申请和讨论成员的单一业务权威。OpenIM 持有必要的通信身份和群关系映射；这些镜像不得反过来扩大产品权限。客户端不能只凭 IM token 绕过产品好友或入群规则。

当前设计规定 PostgreSQL 为唯一事实源，消息采用业务事务与 SSE；若把消息持久化与传输交给 OpenIM，必须明确修订消息数据所有权、客户端 SDK 通道和一致性设计。不能同时宣称完全保持原消息架构又已经迁移到外部 IM。

特别需要验证：

1. 一个人只有一个产品身份，映射到一个 IM 身份；不要求用户注册第二个账号。
2. 接受好友申请仍验证 expected_version。业务事务提交后以 outbox 幂等同步 IM，处理失败恢复；不能声称跨 PostgreSQL 与 OpenIM 数据库天然原子。
3. 想法在不同活动的讨论绑定不同成员集与 IM 群；好友和既有私聊不因切活动消失。
4. 入群历史下界、退出后读取/订阅撤权必须实际验证。只校验发消息的 webhook 不够。
5. OpenIM 默认分支 [webhooks.yml](https://github.com/openimsdk/open-im-server/blob/main/config/webhooks.yml) 的发送前回调默认关闭，部分失败继续配置为 true。用于权限时要明确启用与拒绝策略，并检查其他读写入口。
6. 公开帖子作者可按合法来源跨活动联系；不要把发现的同活动限制误套到这个例外。

若这些约束需要大改 OpenIM 核心、许可方式不合适，或部署成本不值得，就对比原单体消息方案或 Nakama，而不是强行拼接。

## 9. 与已经运行的 HumHub 预览如何比较

项目已有 [HumHub 免费预览记录](HumHub免费部署与冻结简介对照.md)。它与本轮 OpenIM 组合是两条候选路线。已有预览不证明目标业务完成，本次调研也不意味着它已被替换。

| 更看重的事情 | 可以优先验证 | 代价 |
|---|---|---|
| 尽快复用现成社区、帖子、空间和后台 | HumHub 加项目插件、画像 AI 适配 | PHP 体系、普通用户 API 与前端适配 |
| 自建卡片前端，明确控制活动与画像规则 | FastAPI 业务模块加 OpenIM、资料与 AI 组件 | 业务功能仍需开发，IM 运维与一致性增加 |
| 集中复用账号、好友、群组和聊天 | Nakama 作为对照 | 自定义运行时及业务适配；游戏匹配不能直接复用为队友推荐 |

不建议没有明确数据边界就把 HumHub、Nakama 和 OpenIM 三套社交系统同时部署。不同项目的用户、好友和群组不能各自成为权威。

## 10. 下一步验证建议与本轮边界

建议先做一个最小纵向原型：两名合成用户加入同一活动 → 导入合成资料并确认 → 得到同活动卡片 → 发起与接受好友申请 → 私聊 → 在对应活动想法群明确呼叫 AI。另建第二个活动验证越界拒绝与公开帖子联系例外。

验证应优先覆盖画像字段权限、旧 AI 结果不覆盖新版本、0 次 LLM 普通发现、有界推荐、IM 同步失败恢复和群历史撤权；性能与服务器成本在原型跑通后测量。以上验证尚未执行。

本轮只新增本调研、来源快照和导航。冻结简介、冻结引导原稿、九份正式设计、现有 HumHub 部署、参考工程和本地凭据均未改动。没有读取或上传私有原文。

## 11. 集成难度、冲突与前端框架的补充判断

> 2026-11-11 补充。以下为基于接口与领域差异的工程判断，未进行集成原型或工期实测。

### 难度判断

精简组合做到可演示的主流程，难度中等；做到满足项目活动隔离、画像确认、群历史权限、重试恢复和多设备一致性的可运营产品，难度中高。若把上一节候选同时引入，难度会升至高，不建议这样做。高星组件能减少局部开发，不能消除产品业务与系统之间的衔接工作。

| 接入部分 | 相对难度 | 主要工作 |
|---|---|---|
| 模型调用适配器 / LiteLLM SDK | 低至中 | 参数、结构化输出、错误、费用与真实尝试预算 |
| Docling 文件解析 | 中 | 不同简历布局、异步任务、提取质量与草稿确认；解析与语义提取分开 |
| SQL / 可选 pgvector 召回 | 中 | 活动过滤、投影、排序、稳定批次、失效与推荐质量 |
| OpenIM 接入到业务规则 | 中高 | 账号映射、好友/群成员同步、历史权限、消息幂等、断线及失败恢复 |
| 同时接入 Gorse、Dify、活动平台、第二套社交底座 | 高 | 数据同步、重复状态、跨服务故障与更多部署组件 |

### 最容易互相冲突的五个位置

1. **账号**：产品登录与 IM 登录需要稳定映射。用户只登录一次；服务端据产品身份发放对应 IM 凭据。不要让每个组件各建一套独立用户身份。
2. **好友和群资格**：产品显示已接受好友，但 IM 同步失败，会出现能看到好友却无法聊天；产品踢出成员而 IM 仍允许拉历史，则成为权限问题。主业务后端拥有权威状态，同步必须可重试、幂等并有明确失败表现；撤权期间未能保证拒绝访问就不能视为接入完成。
3. **消息状态**：发送响应、SDK 回调和业务通知可能对应同一条消息。以稳定消息标识去重，定义各事件只更新哪些状态；不能让两个消息通道分别生成聊天正文。
4. **AI 草稿与正式画像**：用户修改资料后旧任务才完成，不能回写旧答案。异步结果绑定版本和用途，确认写入由主业务用例控制。
5. **活动切换和缓存**：发现请求、缓存、推荐 run 与结果要绑定活动上下文。切换活动不能让旧请求结果覆盖新页面；服务端仍逐次校验当前资格。好友和既有私聊保持全局关系，不随切活动删除。

OpenIM 的默认分支回调配置并未替本项目设置好这些权限。发送、加好友和入群等多个 before 回调默认关闭，部分失败继续配置为 true，见 [配置原文](https://raw.githubusercontent.com/openimsdk/open-im-server/main/config/webhooks.yml)。回调可用只说明存在扩展点，是否覆盖所有权限入口仍需原型验证。

首期收缩到一个主业务后端、一套 PostgreSQL 业务事实、一个通信子系统、一个异步 worker 和少量库。Supabase 不与另一套产品 Auth 平行引入；Gorse、Qdrant、Dify、独立 LangGraph 服务和 Hi.Events 暂不进入默认部署。简历解析与模型调用可放 worker，不必拆成多套用户可访问的后端。

### 前端继续用 Next.js / React / TypeScript

前端只建立一个主应用、一套路由和统一主题。普通业务调用 /api/v1；聊天通过经过封装的 OpenIM SDK 适配层。Next.js 可以承接页面与必要的代理，但活动、好友、画像授权规则集中在主业务后端，不在 Next.js 与 FastAPI 中分别实现两份。

沿用用户已选的 AffectUI 与 Shadcn UI Kit，不默认引入第三套 UI 来源：

| 层次 | 选择 | 作用 |
|---|---|---|
| 应用框架 | Next.js + React + TypeScript | 页面、路由、组件与类型 |
| 通用页面与基础组件 | Shadcn UI Kit | 表单、卡片、导航、聊天和广场页面素材 |
| AI 交互组件 | AffectUI | 对话输入、处理进度、补问和确认界面素材 |
| 数据适配 | 项目自有 API/IM 适配层 | 把业务状态与 SDK 事件转换为统一页面状态 |

[Shadcn UI Kit 官方说明](https://shadcnuikit.com/docs) 表明其基于 shadcn/ui、Tailwind CSS、React 与 Next.js；它是独立资源产品，不等于开源 shadcn/ui 本身，也不代表本项目已取得全部付费源码。

[AffectUI 官方说明](https://www.affectui.com/docs) 则描述为带自身样式的 React TSX 组件，不依赖 Tailwind。两者可共存，但主题不会因此自动统一。建议以 Kit 的基础表单/按钮为通用实现，AffectUI 主要补充 AI 场景；逐组件统一颜色、字体、圆角、暗色、弹层层级和焦点行为，不整套覆盖路由、全局样式或用户系统。

对于浏览器 IM SDK，按 [Next.js 服务端/客户端边界](https://nextjs.org/docs/app/getting-started/server-and-client-components) 放入客户端适配层。仅写 use client 不代表所有代码都不在服务端预渲染；依赖 window 等环境的初始化应在挂载后或合适的动态加载边界执行。登录建立连接，退出清理连接、缓存和监听，导航时避免重复注册。实际 SDK 包、版本、许可证及构建兼容性仍待固定和验证。

前端界面与样式组合的难度判断为中等，聊天重连、多标签页、未读状态与撤权联调为中高。后端使用不同语言本身不妨碍前端走 HTTP 与 SDK；真实风险在接口和状态规则是否一致。

### 做决定前先验证哪一条链路

先做两名合成用户的登录 → 同活动卡片 → 好友申请与接受 → 私聊 → 刷新/断线重连，并人为制造一次 IM 同步失败和一次群撤权。确认有明确失败表现、恢复不重复、无权限时不能读写，再扩展 AI 与更多页面。该建议是下一步验证范围，本次没有执行。

## 官方证据入口

- OpenIM：[Server](https://github.com/openimsdk/open-im-server)、[chat](https://github.com/openimsdk/chat)、[发布记录](https://github.com/openimsdk/open-im-server/releases)、[Compose](https://github.com/openimsdk/open-im-server/blob/main/docker-compose.yml)、[webhooks 配置](https://github.com/openimsdk/open-im-server/blob/main/config/webhooks.yml)、[SDK Core 许可证](https://github.com/openimsdk/openim-sdk-core/blob/main/LICENSE)。
- 画像资料：[Docling](https://github.com/docling-project/docling)、[docling-serve](https://github.com/docling-project/docling-serve)、[Resume Matcher](https://github.com/srbhr/Resume-Matcher)、[Crawl4AI](https://github.com/unclecode/crawl4ai)、[Supabase](https://github.com/supabase/supabase)。
- 推荐：[Gorse](https://github.com/gorse-io/gorse)、[pgvector](https://github.com/pgvector/pgvector)、[pgvector 许可证](https://github.com/pgvector/pgvector/blob/master/LICENSE)、[Qdrant](https://github.com/qdrant/qdrant)。
- AI：[LiteLLM](https://github.com/BerriAI/litellm)、[LiteLLM 许可证](https://github.com/BerriAI/litellm/blob/main/LICENSE)、[LangGraph](https://github.com/langchain-ai/langgraph)、[Dify](https://github.com/langgenius/dify)、[Dify 许可证](https://github.com/langgenius/dify/blob/main/LICENSE)。
- 活动与社交：[Hi.Events](https://github.com/HiEventsDev/Hi.Events)、[Hi.Events 许可证](https://github.com/HiEventsDev/Hi.Events/blob/develop/LICENCE)、[pretix](https://github.com/pretix/pretix)、[pretix 许可证](https://github.com/pretix/pretix/blob/master/LICENSE)、[Nakama](https://github.com/heroiclabs/nakama)。

业务约束依据 [冻结简介](../docs/简介冻结禁止修改.md)、[架构与领域](../docs/系统架构与领域设计.md)、[共享契约](../docs/共享数据与接口契约.md)、[推荐设计](../docs/发现推荐与Agent工具设计.md) 与全文读取的 [architecture-patterns Skill](../.agents/skills/architecture-patterns/SKILL.md)。
