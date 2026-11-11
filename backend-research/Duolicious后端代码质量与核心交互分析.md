# Duolicious 后端代码质量与核心交互分析

> 调研日期：2026-11-10。对象：官方 monorepo 的 `main` 快照，固定提交 `28aefae3d3e13a7d0157623f704989eebcad93ff`。本次直接拉取源码，阅读后端主链路、SQL、前端关键交互及测试；执行了批处理模块 9 个原有单元测试和一次隔离故障注入。未启动完整服务、未执行全部集成测试、未做性能测试或完整安全审计。下文的问题均限定于此版本，不能直接等同于线上事故。
> 本文是外部代码调研，不表示本项目已经采用或实现这些功能。保留当前 Next.js / FastAPI 模块化单体方案及共享契约。

## 1. 结论

**Duolicious 值得作为人物发现与社交交互的深入参考，但不宜未经修补就直接作为本项目后端底座。** 它的优势是完整的产品闭环、具体的反滥用机制、较广的回归测试，以及问答、检索和聊天之间的联动；不足集中在缓存权限一致性、消息可靠性、接口输出契约，以及业务与 SQL 的耦合。

这不是一个只搭好 CRUD 的样例仓库。注册、资料、匹配、聊天、审核、通知、订阅和账户生命周期都有实际实现。但功能多、CI 多，不能替代对关键失败路径的检查。本次找到了值得在复用前处理的具体代码问题，见第 4 节。

| 维度 | 本次判断 | 依据与限制 |
|---|---|---|
| 产品功能完整度 | 较强 | 有从发现到交谈、审核、通知的闭环；未验证线上运行效果 |
| 后端基本工程习惯 | 较好 | 类型化输入、集中认证与限流、参数化 SQL、事务封装、测试和 CI |
| 长期可维护性 | 中等 | 路由已变薄，但 person、大段 SQL、应用层触发器的理解和修改成本较高 |
| 隐私与消息可靠性 | 需要重点修补 | 缓存结果重验不完整；内存任务失败直接丢弃；消息重试幂等未闭合 |
| 独立前端接入 | 可以接，但并非开箱即用 | HTTP 加自定义 JSON WebSocket 协议；输出及错误保留历史约定 |
| 对本项目规则的适配 | 改动较大 | 活动边界、画像确认、字段权限、好友状态机、讨论授权都不是它的原生语义 |

不提供诸如“代码质量 8.5 分”或“可复用 80%”的数字，因为本次没有相应量化方法和验证依据。技术栈接近带来的收益，必须与业务规则重写成本分开计算。

## 2. 后端结构与工程质量

### 2.1 实际技术结构

当前代码使用 Python、FastAPI / Uvicorn、异步 psycopg、PostgreSQL、pgvector、地理查询、Redis，以及 S3 兼容对象存储。HTTP 与 `/chat` WebSocket 由同一个 API 服务承载，后台任务由 cron 入口运行。前端是 Expo / React Native，包含 Web 构建。依据：[仓库说明][repo]、[API 启动][startup]、[数据库层][database]。

```text
Expo / React Native / Web
        │ HTTP + JSON WebSocket
        ▼
FastAPI 路由、认证、限流、请求校验
        ▼
person / qanda / search / chat 等业务模块
        ▼
api_tx + SQL + 应用层匹配触发器
        ▼
PostgreSQL；Redis 缓存与实时分发；对象存储

cron：审核、通知、清理、俱乐部向量等后台处理
```

按本项目 architecture-patterns 的边界要求来看，它有业务模块划分，但**不属于业务规则充分独立于持久化层的架构**。这不意味着采用原生 SQL 就是坏代码；真正的成本在于用例直接依赖数据库、缓存和全局模块，难以用内存适配器替换后独立验证。

### 2.2 做得比较好的地方

1. **路由层已比较清楚。** 输入通过 Pydantic 模型接收，会话通过 `Depends(session(...))` 校验。`DuoRoute` 默认给路由加限流，例外需要显式声明，降低新增接口忘记限流的概率。[路由][routes]、[认证][auth]、[默认限流适配][routing]
2. **重要写入考虑了事务。** 答案、公开动态和性格派生值在同一事务内更新；对序列化失败和死锁最多重试 3 次，公开答案变化在提交后广播。聊天归档、收件箱和联系计数也合并落库。[答案用例][qanda]、[消息存储][message-storage]
3. **部分隐私规则有复用意识。** `ANSWER_VISIBLE_TO_OTHERS` 被消息题卡、历史消息查询和动态引用；历史消息重新读取当前答案可见性，避免把后来设为私密的答案一直当作公开快照返回。[答案用例][qanda]、[消息归档][mam]
4. **会话缓存对正确性有明确说明。** 登出、封禁、停用、引导完成等路径主动失效缓存，同时写明读后回填竞态最多留下 60 秒陈旧窗口。比只加缓存不说明撤销语义更好；但这仍是需要产品接受的取舍，并不等于即时撤权。[会话缓存][session-cache]
5. **推荐包含实际计算与训练链路。** 有性格向量、俱乐部向量、行为匹配模型；行为训练与服务推理分开，提供导出与训练/推理一致性检查入口。存在这些代码不代表本次验证了模型准确率。[匹配模型入口][matching]、[行为模型说明][kv]
6. **回归测试明显不只是占位。** CI 定义了 mypy、单元测试及 9 组功能测试。测试文件涉及停用后的会话、隐私、答案比较、支付、举报、消息历史、多端在线、隐藏开场消息等真实边界。[后端 CI][ci]、[测试目录][tests]

统计口径为此快照 `backend/` 下所有 `.py` 文件，包括测试、训练和数据性源码，共 267 个、39,999 行；其中 `test_*.py` 46 个，文本统计 `def test_` 282 处，功能脚本 85 个。**这些是规模统计，不是覆盖率，也不是实际执行通过数。**

### 2.3 维护成本较明显的地方

- **业务集中度仍高。** `person/__init__.py` 1,527 行，相关 SQL 文件 3,098 行，聊天入口 867 行，feed SQL 871 行。大文件本身不构成错误，但账户、资料、搜索设置、club 和治理等变化容易牵涉同一组模块。
- **存在自定义持久化机制。** `TxCursor` 在 SQL 执行前后记录变化，解析 SQL 并在提交前刷新匹配模型。它能集中保证派生值与写入原子性，但新维护者必须理解主体归属、旧值捕获和触发时序。源码也明确列出直接 psql 写入和外键级联的盲点。不能让另一个业务服务直接写这些表后假定向量自动保持正确。[数据库层][database]、[应用层触发器][triggers]
- **类型检查优于输出契约。** mypy 开启禁止无类型函数等约束，但不少接口返回 `object` 或直接数据库字典；自定义响应封装保留文本、元组状态码和空响应等约定，绕过 FastAPI 的常规 JSON 编码路径。不能据此假定 OpenAPI 已描述完整响应、自动生成的前端 SDK 就足够可靠。[mypy 配置][mypy]、[响应适配][routing]、[路由][routes]
- **依赖和数据库升级的可复现性较弱。** `requirements.txt` 中 FastAPI、Pydantic、psycopg 等多项未固定版本，numpy 还同时出现普通项和固定版本项。迁移文件要求每次启动可重复执行，并允许生产执行后删去旧迁移；这种方式简洁，但长期 fork 的历史升级、回滚和多分支合并，需要自己补足验证和记录。[依赖][requirements]、[迁移说明][migrations]、[启动迁移][bootstrap]

这些问题不要求把系统拆成微服务。更合理的方向是继续保留单体，抽出明确用例、共享访问策略和可替换端口。

## 3. 核心用户交互逻辑

### 3.1 总体闭环

```text
游客先浏览 / 试答问题
        ↓
邮箱验证码或社交登录 → 五步基础资料 → 完成注册
        ↓
补充个人资料、照片、问答、兴趣 club
        ↓
筛选 / 匹配列表 / 动态 / club 找到人
        ↓
查看资料、比较答案与性格 → 直接发开场消息
        ↓
收件人查看 Intros → 回复 → 转入 Chats
        ↓
持续交流，或跳过、举报、隐藏、归档
```

产品的关系起点是主动交流。它没有用双向点赞配对作为开聊前提，也不能把“已互发消息”当成本项目已经接受的好友关系。[官方定位][repo]、[聊天用例][chat]、[收件箱交互][inbox-ui]

### 3.2 注册是五步基础资料，问答可以渐进完成

当前前端注册测试明确经过显示名、本人性别、期望对象性别、生日、位置五步；后端要求年龄至少 18 岁，分字段保存到 onboardee，完成时创建正式 person，并衔接搜索偏好、待加入 club 和预注册答案。登录入口包括邮箱 OTP、Google、Apple、Discord。[引导交互测试][onboarding]、[输入模型][types]、[完成引导][finish]

游客最多可携带 10 道答案进入公共搜索；完成注册时可将暂存答案接入正式账户。不是先强迫用户完成整套长问卷，再允许体验全部价值。[输入模型][types]、[答案用例][qanda]

**值得借鉴的是逐步完成和立即反馈。** 本项目仍须保留十步引导、简历/GitHub 前置导入及逐条确认；不能直接换成它的五步恋爱资料表。

### 3.3 问答既生成画像，也提供聊天话题

答案为是、否或跳过，并带 `public` 标记。答题变更会更新性格向量；公开答案可用于动态、他人比较和聊天题卡。下一题选择优先处理最初的题目，再按用户与题目组成的确定性次序安排未答题。[题库逻辑][questions]、[答案用例][qanda]

性格表示包含 46 个特质维度和一个辅助维度，按答题贡献增量维护；向量强度随答题数量增加，并在算法使用的 250 题刻度达到权重上限。匹配百分比来自向量内积的映射和截断，**不是经过本次验证的“恋爱成功概率”或心理测量有效性结论**。[性格计算][personality]、[卡片分数][search-sql]

产品价值在于把“画像”变成可解释、可讨论的共同话题。对找队友产品，可以借鉴作品、协作方式和偏好驱动的开场提示，但需要重新设计题目、特征与互补规则。

### 3.4 发现不是只有一种推荐算法

代码提供四种排序，前端枚举为 `Match percentage`、`Similar clubs`、`Longer conversations`、`Distance`。分别对应性格、club 向量、行为模型和地理距离；行为模型按发消息/跳过等数据学习双方倾向，结合两个方向评分。[排序实现][sort]、[行为模型说明][kv]

普通搜索还处理年龄、性别、距离、关系目标、生活方式、题目答案、回复率、是否已经联系/跳过等条件，部分条件支持双向偏好。查询先取最多 750 名候选，重排后保留最多 500 个 ID；Redis 按搜索者缓存，HTTP 用 `n/o` 切片，`n` 上限 50。这是候选缓存与偏移分页，不是本项目签名 cursor 的实现。[筛选][filters]、[召回与重排][search-sql]、[缓存与分页][search]

在本次检查的普通搜索调用链中，没有逐次调用 LLM 来挑人；行为模型的存在也不等于在线聊天式 AI 推荐。普通浏览成本与 AI 处理分开这一点值得保留。

### 3.5 Intros 到 Chats 是最值得研究的交互

用户可以直接发送开场消息，收件人先在 Intros 中查看；双方交换消息后进入 Chats。代码对 intro 的判断是“收件人是否曾经给发送者发过消息”，因此**对方尚未回应时，后续消息仍可能走 intro 的管控流程**，不能只理解成一个会话的第一条消息。[intro 判定][intro]、[收件箱交互][inbox-ui]

开场阶段还包含发送配额、认证要求、链接与垃圾信息检查、重复开场白检测，以及把疑似冒犯内容放入隐藏 Intros 的处理。跳过/屏蔽也参与发送限制；部分反滥用状态有短时缓存。[聊天用例][chat]、[发送配额][chat-limits]、[垃圾信息检查][spam]

这是降低建立联系门槛与控制骚扰之间的产品取舍。对本项目，适合借鉴“申请附一段有上下文的介绍、待处理与正式会话分区”；不能直接继承“开聊即形成联系”，更不能代替 `expected_version` 校验和明确接受好友申请。

另一个明确差异是：代码用注册时长及认证等级决定账户何时可信，影响部分 intro 链接检查。它不等于全面禁止新用户聊天，但照搬会影响本项目首日协作和合法外链规则，应重新设计。[信任条件][intro]、[聊天检查][chat]

### 3.6 Club、动态和隐私各有自己的语义

- **Club** 是加入/退出、成员浏览、兴趣关联与匹配的入口。不能凭它有成员表就认为已实现本项目活动资格、组织者权限或活动内讨论成员生命周期。[club 用例][clubs]、[club 向量][matching]
- **Feed** 主要围绕加入、公开答题、加入 club、资料变化等事件组织发现内容；应把它理解为促进认识人的动态流，不能直接当成本项目帖子、评论和广场的完整后端。[feed SQL][feed]
- **隐私** 包含公开主页、向陌生人隐藏、认证等级门槛、年龄/在线状态开关、答案公开与跳过关系等。其 `public_profile` 甚至参与游客访问，不等于本项目仅对登录用户开放的 `authenticated`。也没有证据表明这些开关能够直接表达本项目完整的 `authenticated / friends / private` 字段权限与独立联系人授权。[资料策略][profile-policy]、[输入模型][types]

## 4. 复用前应处理的具体问题

以下优先级表示本次建议的修复顺序，不是 CVSS 定级，也不表示已在官方线上复现。

### 4.1 高优先级：缓存分页没有完整重验可见性

**静态代码证据明确。** 新搜索的 `_VISIBLE_TO_SEARCHER` 包含 activated、shadow ban、向陌生人隐藏、对方跳过、认证要求等条件；但 `_cached_search()` 消费已缓存 ID 时，仅重新检查双方 skip 相关条件，并在最终投影对认证等级做部分字段裁剪，没有完整复用前述可见性规则。[新搜索与缓存结果 SQL][search-sql]

ID 缓存 TTL 为一天。检查到的停用路径会更新 person 并删除会话/会话缓存，但没有清除其他搜索者的候选缓存；对整个后端的 `search_results` 引用搜索也未找到相应失效路径。[候选缓存][search]、[停用用例][deactivate]

因此，当候选已进入缓存后再停用或修改相关隐藏状态，后续分页仍可能返回其姓名、年龄、匹配分和照片等卡片信息，具体字段取决于其他门槛。资料详情有自己的访问判断，**不能以详情会拒绝来证明列表没有暴露**。本次未启动数据库执行完整端到端复现，也没有声称可以读取所有私密资料。

建议：共享可见性谓词，在缓存结果消费时重新校验；发现批次绑定权限版本。回归测试应覆盖“缓存建好后停用/隐藏/认证要求变更，再取下一页”。本项目还必须把服务端验证的当前活动纳入同一条链路。

### 4.2 高优先级：批处理失败不会自动重试，也没有逐消息失败回调

聊天通过内存 `Batcher` 收集消息，再统一落库。`_process_batch()` 捕获处理异常后只记日志并返回，外层仍减少 pending，项目从队列消失，成功回调也不会执行；未见该批处理器的重新入队或持久化重试机制。队列本身没有容量上限。[批处理器][batcher]、[消息存储][message-storage]

**本次局部复现结果：** 注入一次模拟存储异常，等待处理后得到 `attempts=1, callbacks=0, pending=0, queue_size=0`。这是对原批处理类的内存级故障验证，不是对真实 PostgreSQL 故障的集成测试。

值得肯定的是正常发送回执在数据库提交后的回调中发出，不能把问题描述为“总是先报成功再丢消息”。实际缺口是失败任务退出后没有可靠恢复，客户端可能等待不到回执；提交成功但回调中途失败时，通知、实时投递和发送者回执也可能不同步。

建议：消息写入和待发送事件进入可恢复的事务记录，提交后通过 outbox 重试；明确失败回执、重试退避及背压。保留落库成功后确认这一原则。

### 4.3 高优先级：未形成按客户端消息 ID 的幂等闭环

存储路径保存客户端 `stanza_id`，但归档表主键是 `(person_id, id)`，其中 id 由服务端时间生成。检查到的插入 SQL、消息处理入口和建表定义没有用发送者加 `stanza_id` 做重复请求识别或唯一约束。[消息处理][chat]、[归档插入][mam]、[归档表][mam-schema]

据此判断：同一发送请求在回执丢失后被重发，存在生成不同归档记录的风险；intro 重复开场白检测不能代替通用消息幂等。本次为静态路径判断，未通过 WebSocket 重放实验测量影响。

建议：使用发送者/会话加 `client_message_id` 的唯一键，重复请求返回原持久化结果；配合上一项处理“已提交但回执丢失”。

### 4.4 中高优先级：语音附件在消息落库之后才上传

`store_message()` 先写入包含 `audio_uuid` 的消息归档和收件箱，提交后执行 `store_audio_and_notify()`；该回调才转码、上传语音。上传或转码失败时返回 `ServerError`，这条失败分支没有撤销先前的消息记录或标记附件失败。[发送顺序][chat]、[消息事务][message-storage]、[语音处理][audio]

因此存在历史消息已落库但附件不可用的窗口和失败状态，不能把数据库事务的原子性扩大解释为对象存储也已原子完成。这是静态代码判断，未模拟对象存储故障。建议先完成受控暂存，再提交可见消息，或用明确的附件状态机和补偿清理。

### 4.5 部署边界：转发头信任需要受控入口

`client_ip()` 直接使用 `X-Forwarded-For` 的末项，启动参数也使用 `--forwarded-allow-ips '*'`。代码依赖可信代理边界，不能把 API 端口直接暴露后仍假定 IP 限流和封禁可靠。仓库开发说明已提醒这一部署前提；本次没有检查官方线上网络拓扑，不能据此断言线上可绕过。[IP 处理][ip]、[启动配置][startup]、[开发说明][developer]

此外，开发说明和部分注释还残留 Flask / ProxyFix 描述，而实际运行路径已是 FastAPI。这会影响接入者判断，应在长期 fork 时同步文档。

## 5. 对本项目的实际参考价值

| Duolicious 的设计 | 建议吸收的部分 | 本项目必须另做的部分 |
|---|---|---|
| 渐进问答与卡片反馈 | 用户投入后及时看到资料和发现结果 | 简历/GitHub 预填、十步进度、草稿与确认版本 |
| 性格/兴趣/行为多路排序 | 普通发现由可解释特征与数据库支撑 | 活动内候选、合作互补、推荐预算与 run 状态 |
| Intros 与 Chats 分区 | 待处理联系与正式对话分开，介绍有上下文 | 明确好友申请、接受版本、幂等和关系事务 |
| Club 与发现动态 | 用兴趣、共同回答和活动行为帮助认识人 | 活动邀请、讨论成员授权、帖子与广场流程 |
| 答案可见性与撤回 | 读取时用当前权限，不一直传播旧公开快照 | 全部字段策略、联系人独立授权、缓存及异步撤权 |
| 消息和治理回归 | 学习测试场景，补齐失败与竞争路径 | 不原样继承新账户时长门槛和恋爱场景限制 |

若只想另做一个交友产品并接受其规则，fork 整套后端有现实价值；若要实现当前找队友方案，较稳妥的选择是**保留自有业务权威，按模块参考和有限复用**。尤其不要把 `person_club` 改名为活动、把 `messaged` 改名为好友，就认为语义已经一致。

本次比先前候选初筛更深入，因此将“优先验证 Duolicious 后端”具体化为：先修补并验证权限与消息可靠性，再评价整库复用收益。不能只因它使用 FastAPI，就跳过这些检查。代码采用 AGPL-3.0；实际引入前须单独核对采用方式与许可证要求，本文不作合规结论。[许可证][license]

## 6. 验证记录与后续验证范围

### 本次已经完成

- 固定提交源码检查；后端认证、引导、资料、答案、搜索、匹配、聊天、数据库、缓存、迁移和 CI 路径抽查。
- 前端注册测试及 Intros/Chats 文案和组件核对，用于还原交互；没有据此声称浏览器测试已经通过。
- 按 `.python-version` 使用 Python 3.11，执行 `python -m unittest serviceshared.batcher.test_init -q`，9 个测试通过。宿主默认 Python 3.9 的首次启动因语法/类型兼容性失败，换成项目规定版本后通过，未将环境不匹配计为项目缺陷。
- 对原 `Batcher` 注入模拟处理异常，确认失败任务出队且无重试和成功回调。没有连接真实用户数据库或读取本项目本地凭据。

### 决定复用前应补的验证

1. 建缓存后改变账号状态或权限，分页、相似人物、详情和已打开页面都应按当前权限处理。
2. 同一客户端消息重复发送、提交成功但回执丢失、数据库暂时失败，均验证唯一消息与可恢复结果。
3. 对象存储失败及进程重启，不留下不可恢复的可见附件记录或静默消失的任务。
4. 用本项目活动 A/B、普通字段权限、好友申请并发、讨论加入/退出等验收场景做适配验证。
5. 固定依赖、冷启动与旧库升级验证后，再测代表性数据规模下的搜索耗时和消息延迟。

项目规则依据：[AGENTS.md](../AGENTS.md)、[系统架构与领域设计](../docs/系统架构与领域设计.md)、[共享数据与接口契约](../docs/共享数据与接口契约.md)。本次不修改冻结原稿、九份当前设计或 GameBuddy。

## 7. 固定版本源码索引

所有远端证据链接均固定到本次检查的提交，避免默认分支变化后失去对应关系。

[repo]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/README.md
[startup]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/api.main.sh
[database]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/serviceshared/database/__init__.py
[routes]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/__init__.py
[auth]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/auth/bearer.py
[routing]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/routing.py
[qanda]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/qanda/__init__.py
[message-storage]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/chat/messagestorage/__init__.py
[mam]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/chat/messagestorage/mam/__init__.py
[session-cache]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/sessioncache/__init__.py
[matching]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/serviceshared/matching/__init__.py
[kv]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/kvmatching/README.md
[ci]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/.github/workflows/backend-test.yml
[tests]: https://github.com/duolicious/duolicious/tree/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/test
[triggers]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/serviceshared/database/triggers.py#L1-L32
[mypy]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/mypy.ini
[requirements]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/requirements.txt
[migrations]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/migrations.sql
[bootstrap]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/bootstrap.py
[chat]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/chat/__init__.py#L516-L728
[inbox-ui]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/frontend/components/inbox-tab.tsx#L189-L205
[onboarding]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/frontend/playwright-tests/onboarding.spec.ts#L25-L83
[types]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/duotypes/__init__.py
[finish]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/person/__init__.py#L670-L720
[questions]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/qanda/question.py
[personality]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/serviceshared/matching/personality.py#L122-L150
[search-sql]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/search/sql/search.py
[sort]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/search/sql/search.py#L303-L319
[filters]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/searchfilters/__init__.py
[search]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/search/__init__.py#L58-L174
[intro]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/chat/__init__.py#L131-L153
[chat-limits]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/chat/ratelimit/__init__.py
[spam]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/chat/spam/__init__.py
[clubs]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/person/__init__.py#L1139-L1162
[feed]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/search/sql/feed.py
[profile-policy]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/person/sql/__init__.py#L59-L112
[deactivate]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/person/__init__.py#L937-L945
[batcher]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/serviceshared/batcher/__init__.py#L117-L146
[mam-schema]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/init-api.sql#L1726-L1756
[audio]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/chat/audiomessage/__init__.py
[ip]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/ratelimit.py#L36-L62
[developer]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/DEVELOPER.md
[license]: https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/LICENSE
