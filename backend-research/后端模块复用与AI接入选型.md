# 后端模块复用与 AI 接入选型

> 调研日期：2026-11-10。范围：公开仓库元数据、默认分支固定提交、README、选定源码与 CI 定义。未部署本次候选、未运行其测试、未进行性能或完整安全审计。本文是外部调研，不表示目标应用已经实现，也不改变当前技术方案。

## 1. 建议

用户需要以人物画像、找人和建立联系为核心的产品，前端自行实现。按这个前提，优先验证 Duolicious 后端；以 Nakama 作为通用社交能力的对照。OpenIM / Tinode 是聊天子系统候选，Gorse 是后续推荐组件候选，FastMCP 是协议适配工具。它们不是六套可以相互替换的完整产品。

本次没有核实到一套同时满足现有画像确认、十步引导、活动隔离、推荐预算、好友权限和聊天规则的即用后端。建议保留 FastAPI 模块化单体作为业务权威，选择性参考或复用经过许可和边界验证的模块。不能把接入多个开源服务等同于完成业务。

## 2. 能力覆盖

下表的“已有”指候选自身的能力，不表示符合本项目契约；“定制”是代码抽查后的工程判断，不是工期承诺。

| 需求 | Duolicious | Nakama | OpenIM / Tinode | 本项目仍需实现或验证 |
|---|---|---|---|---|
| 用户与个人中心 | 已有账户、资料与偏好接口 | 已有账户、用户及存储能力 | 有聊天身份与基础资料 | GitHub/邮箱身份、资料来源、确认版本、字段可见性 |
| 画像与问答 | 已有题库、答案、性格维度与比较 | 需定制业务模型 | 不承担此功能 | 简历/GitHub 预填、十步可续填流程、AI 草稿确认 |
| 找人与匹配 | 已有搜索、过滤、跳过及性格匹配 | Matchmaker 面向游戏会话 | 不承担此功能 | 活动内候选、协作互补、预算及推荐解释 |
| 卡片浏览与刷新 | 已有搜索缓存与分页，可参考 | 需定制 | 不承担此功能 | 稳定批次、去重、曝光记录、签名 cursor、撤权 |
| 好友与聊天 | 有消息、会话及聊天 WebSocket | 已有好友、私聊、群聊 | 核心能力；各自关系模型仍需核对 | 好友状态机、历史可见范围、幂等与退出撤权 |
| 群组与活动 | 有 club，未见满足本项目活动讨论定义的实现 | 有 groups；活动规则需定制 | 有聊天群组；活动规则需定制 | 邀请、活动成员资格、按活动隔离的讨论成员与消息 |
| MCP / 产品 Skill | 可在 Python 用例层外接适配器 | 需桥接运行时或服务 API | 经受控业务接口接入 | 工具白名单、服务端上下文、权限与预算校验 |

## 3. 候选分析

### Duolicious：最值得先验证的业务参考

> 后续深入复审见 [Duolicious 后端代码质量与核心交互分析](Duolicious后端代码质量与核心交互分析.md)。同一固定提交的详细检查发现缓存结果权限重验、消息失败恢复及幂等方面的缺口；本节“优先验证”不应理解为已通过可靠性验证或可直接采用。后续仅执行了批处理模块的局部测试，没有部署完整后端。

后端使用 Python / FastAPI、PostgreSQL、Redis，仓库同时包含前端，GitHub 主语言标签不能代表后端技术栈。已抽查独立后端的资料、问答、搜索、性格匹配及聊天入口。

可参考的实际接口包括 `/profile-info`、`/next-questions`、`/answer`、`/search`、`/search-filters`、`/prospect-profile/{prospect_handle}`、skip/unskip、compare-answers、club 和 `/chat`。接口名称仅用于描述候选，不是目标应用的 /api/v1 契约。

关键差异：

- 问答接受布尔或空答案，并带公开标记；性格匹配按题目贡献更新 46 个特质维度及一个常量维度。这提供可研究的题库与匹配机制，但不能直接代表技能互补、项目合作适合度或 AI 引导。
- 搜索已有缓存、过滤和跳过机制，分页以偏移切片为基础；仍需改造成当前活动、当前访问者和权限版本绑定的批次与签名游标。
- 普通资料更新不等于资料来源追踪、AI 提取草稿、用户确认版本和逐字段可见性。
- club 不能直接映射为活动、好友或具有独立成员生命周期的活动讨论。

仓库存在类型检查、功能和单元测试 CI 定义；本次没有执行。业务贴近、技术栈接近是优势，但 person 模块、SQL 与匹配逻辑存在联动，抽模块并非复制一个独立包。更适合先做隔离的 API 原型，再判断保留其后端还是选择性参考。许可证为 AGPL-3.0；采用代码前需核对具体使用方式与许可证义务，本文不作完整合规结论。

### Nakama：通用社交基础能力更集中

Go 服务端，提供用户、存储、好友、群组、持久化私聊/群聊、通知，以及 HTTP JSON、gRPC、WebSocket。自定义逻辑支持 Go、TypeScript/JavaScript、Lua；存在 PostgreSQL 部署配置。Apache-2.0。

如果优先目标是少写社交基础设施，它值得进入对照验证。其 Matchmaker 面向游戏会话匹配，不能直接当作本项目的人物画像推荐。画像确认、问答、活动权限和发现批次仍是自定义业务。保留 FastAPI 再接 Nakama，会增加身份、关系和数据所有权边界；若改用其运行时承载主业务，则属于需要明确评估的技术方案变化。

### OpenIM / Tinode：解决聊天，不承接整个产品

OpenIM 是 Go 即时通信服务，提供消息、会话、好友/群组等接口，带 SDK、REST 和 webhook，采用网关与 RPC 服务等微服务部署方式，Apache-2.0。部署和维护成本应与第一期聊天需求一起评估。

已检查的 OpenIM `config/webhooks.yml` 中，`beforeSendGroupMsg` 默认 `enable: false`，且 `failedContinue: true`。存在 webhook 不等于已经执行项目权限；发送前拒绝策略、历史读取和订阅撤权都要分别验证。

Tinode 同样是 Go 聊天后端，支持私聊/群聊、多设备、访问控制及认证扩展，提供 JSON/WebSocket 和 Protobuf/gRPC。其 README 自述 beta-quality，服务端为 GPL-3.0；不能只按星数判断生产成熟度。

二者选其一验证即可。好友与 DiscussionMembership 的权威状态若仍在 FastAPI，外部 IM 必须通过明确适配器衔接。当前设计中关系、会话与授权的本地事务，不会因为加了 webhook 自动跨服务成立；必须评估 outbox/补偿与撤权窗口。若第一期仅基础文字聊天，先保留单体内实现作为对照基线，不能预设接入大型 IM 必然更省工。

### Gorse：有数据后再评估

Go 推荐引擎，围绕 users/items/feedback 提供推荐 API；当前说明包含用户/物品相似、协同过滤、embedding 和 AI 排序等能力，Apache-2.0。它不负责本项目的身份、画像确认和活动授权。

人物作为推荐 item 是一种可评估的建模方法，不代表它天然满足双向意愿、当前活动和可见性。类别过滤也不能代替安全校验。基于当前冷启动与最多 200 候选、24 个最小摘要、5 个结果的边界，建议先验证受限 SQL/向量召回及业务排序；待互动数据和离线评估建立后再比较 Gorse 收益。此项是工程建议，尚无本项目实测对比。

### FastMCP / 官方 Python SDK：AI 接入适配层

FastMCP 提供从 FastAPI/OpenAPI 生成 MCP 或将 MCP 挂载到 FastAPI 的路径。其官方说明同时建议精心设计工具，不要把整个 REST API 原样映射给模型。官方 MCP Python SDK 是另一种协议实现选择，不必把两者都作为独立服务部署。

方便接 AI 的核心是业务用例清楚、权限集中、输入输出稳定；原生打着 AI 标签并不是必要条件。按项目架构约束：

```text
自有前端 ── HTTP ───────────────┐
产品 Skill ── 受控工具执行器 ────┼─ 应用用例与领域规则 ─ Pg / Redis / 适配器
外部 AI 客户端 ── MCP 适配器 ───┘
```

产品内部工具可以直接调用应用用例，无须为每次 AI 调用多绕一层网络 MCP。外部客户端需要标准协议时再暴露 MCP。Skill 承载版本化流程、输入输出、允许工具、数据政策和预算；它本身不授予数据库或社交写权限。

当前设计的候选工具是 `search_candidates(target_type, intent, filters, current_idea_id?)`。身份、当前活动、成员与权限版本、run 绑定及预算由服务端注入并验证。模型不能自行声明用户已同意，也不能获得直接发消息、接受好友、授权联系人、加入群组、修改可见性或原始 SQL 权限。

普通发现、筛选、翻页和换一批保持 0 次 LLM 调用；AI 推荐走独立 run，维持当前轮次与调用预算。

## 4. 排除的近似候选

- **damianstone/toogether-backend**：Django REST / Channels / PostGIS / Redis，具有人物/群组资料、喜欢与匹配、群聊等近似功能。但 LICENSE 含附加条款，限制部署、商用、修改及再分发，不能仅凭标题中的 BSD 就当作可自由复用的底座；抽查 `api/tests.py` 仅见占位测试文件。本次排除直接采用。
- **GetTogetherComm/GetTogether**：活动组织方向相关，但元数据显示最后推送为 2023-12-19，README 仍写 Django 2，并把认证第三方 API 与自动化测试列为待办；不优先作为新项目后端。
- **hieumn04/social-platform-backend**：偏 Instagram 社交方向，体量与许可证证据不足，本次不进入优先候选。

## 5. 下一步最小验证范围

建议优先对 Duolicious 做后端隔离验证，以 Nakama 为社交基础设施对照；本次尚未授权或执行这一步部署。原型应验证以下链路，而非只看首页是否启动：

1. API 创建账户、保存并确认资料；未确认字段不得公开，朋友字段和联系人授权分别处理。
2. 问答可保存退出再继续；旧 AI 任务结果不能覆盖新确认版本。
3. 活动 A/B 交叉测试列表、卡片详情、分页、换一批、缓存和异步结果；不能跨活动补数。公开帖子作者入口按独立例外验证。
4. 普通换一批不调用模型；AI 推荐遵守召回/摘要/结果及总调用预算。
5. 好友接受的版本与事务成立；聊天验证入群历史范围、退出后读取/订阅撤权和发送幂等。
6. MCP 只开放受控用例，服务端身份与当前活动不可由模型参数覆盖。

记录可保留原代码、必须改核心、适配层工作量及测试结果，再决定 fork 整个后端还是局部复用。当前没有依据承诺复用百分比或确定工期。

## 6. 与当前设计的关系

依据 [项目规则](../AGENTS.md)、[架构与领域](../docs/系统架构与领域设计.md)、[共享契约](../docs/共享数据与接口契约.md)、[发现推荐与 Agent 工具](../docs/发现推荐与Agent工具设计.md) 和项目 architecture-patterns Skill。保持模块化单体，用明确接口连接持久化、HTTP 和模型适配器；业务规则应可由内存适配器验证。

本次仅新增调研并补充导航；不修改冻结原稿、九份当前设计、GameBuddy 或既有试用部署。

## 7. 固定提交与源码证据

星数为本次查询快照，仅供识别项目规模，不是质量排名；下列提交是默认分支快照，不是已验证的稳定发行版。

| 仓库 | Stars 快照 | 固定提交 |
|---|---:|---|
| [duolicious/duolicious](https://github.com/duolicious/duolicious) | 197 | [28aefae3d3e1](https://github.com/duolicious/duolicious/tree/28aefae3d3e13a7d0157623f704989eebcad93ff) |
| [heroiclabs/nakama](https://github.com/heroiclabs/nakama) | 13,702 | [483359426996](https://github.com/heroiclabs/nakama/tree/48335942699609b8742393f33495b2c8a4d79c47) |
| [openimsdk/open-im-server](https://github.com/openimsdk/open-im-server) | 16,762 | [a101d85ec16c](https://github.com/openimsdk/open-im-server/tree/a101d85ec16cc21bec60005169725adc1ae5649a) |
| [tinode/chat](https://github.com/tinode/chat) | 13,558 | [eb90ef83acae](https://github.com/tinode/chat/tree/eb90ef83acae6542f52719377ee5a76d267a5618) |
| [gorse-io/gorse](https://github.com/gorse-io/gorse) | 9,918 | [2145bd0567f0](https://github.com/gorse-io/gorse/tree/2145bd0567f03b59f83f43ea2575a17a9bdaa016) |
| [PrefectHQ/fastmcp](https://github.com/PrefectHQ/fastmcp) | 28,370 | [d8c4edfbcfee](https://github.com/PrefectHQ/fastmcp/tree/d8c4edfbcfeeb3b8bc9728f437acde60fa81fc97) |
| [modelcontextprotocol/python-sdk](https://github.com/modelcontextprotocol/python-sdk) | 24,821 | [77001c96f950](https://github.com/modelcontextprotocol/python-sdk/tree/77001c96f9507be0f4d009b83210a384a5e08bda) |
| [damianstone/toogether-backend](https://github.com/damianstone/toogether-backend) | 99 | [9fd1267975c3](https://github.com/damianstone/toogether-backend/tree/9fd1267975c3676175bdab88cf0872856df19abb) |
| [GetTogetherComm/GetTogether](https://github.com/GetTogetherComm/GetTogether) | 487 | [6708944bbcec](https://github.com/GetTogetherComm/GetTogether/tree/6708944bbcecb6d3d1467b096b2d72e991583d51) |

核心证据（均为维护者仓库）：

- duolicious/duolicious：[ README.md ](https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/README.md)
- duolicious/duolicious：[ backend/service/api/__init__.py ](https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/__init__.py)
- duolicious/duolicious：[ backend/service/api/person/profileinfo/__init__.py ](https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/person/profileinfo/__init__.py)
- duolicious/duolicious：[ backend/service/api/qanda/__init__.py ](https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/qanda/__init__.py)
- duolicious/duolicious：[ backend/serviceshared/matching/personality.py ](https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/serviceshared/matching/personality.py)
- duolicious/duolicious：[ backend/service/api/search/__init__.py ](https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/service/api/search/__init__.py)
- duolicious/duolicious：[ backend/init-api.sql ](https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/backend/init-api.sql)
- duolicious/duolicious：[ .github/workflows/backend-test.yml ](https://github.com/duolicious/duolicious/blob/28aefae3d3e13a7d0157623f704989eebcad93ff/.github/workflows/backend-test.yml)
- heroiclabs/nakama：[ README.md ](https://github.com/heroiclabs/nakama/blob/48335942699609b8742393f33495b2c8a4d79c47/README.md)
- openimsdk/open-im-server：[ README.md ](https://github.com/openimsdk/open-im-server/blob/a101d85ec16cc21bec60005169725adc1ae5649a/README.md)
- openimsdk/open-im-server：[ config/webhooks.yml ](https://github.com/openimsdk/open-im-server/blob/a101d85ec16cc21bec60005169725adc1ae5649a/config/webhooks.yml)
- tinode/chat：[ README.md ](https://github.com/tinode/chat/blob/eb90ef83acae6542f52719377ee5a76d267a5618/README.md)
- gorse-io/gorse：[ README.md ](https://github.com/gorse-io/gorse/blob/2145bd0567f03b59f83f43ea2575a17a9bdaa016/README.md)
- PrefectHQ/fastmcp：[ docs/integrations/fastapi.mdx ](https://github.com/PrefectHQ/fastmcp/blob/d8c4edfbcfeeb3b8bc9728f437acde60fa81fc97/docs/integrations/fastapi.mdx)
- PrefectHQ/fastmcp：[ docs/servers/authorization.mdx ](https://github.com/PrefectHQ/fastmcp/blob/d8c4edfbcfeeb3b8bc9728f437acde60fa81fc97/docs/servers/authorization.mdx)
- modelcontextprotocol/python-sdk：[ README.md ](https://github.com/modelcontextprotocol/python-sdk/blob/77001c96f9507be0f4d009b83210a384a5e08bda/README.md)
- damianstone/toogether-backend：[ LICENSE ](https://github.com/damianstone/toogether-backend/blob/9fd1267975c3676175bdab88cf0872856df19abb/LICENSE)
- damianstone/toogether-backend：[ api/models.py ](https://github.com/damianstone/toogether-backend/blob/9fd1267975c3676175bdab88cf0872856df19abb/api/models.py)
- damianstone/toogether-backend：[ api/tests.py ](https://github.com/damianstone/toogether-backend/blob/9fd1267975c3676175bdab88cf0872856df19abb/api/tests.py)
- GetTogetherComm/GetTogether：[ README.md ](https://github.com/GetTogetherComm/GetTogether/blob/6708944bbcecb6d3d1467b096b2d72e991583d51/README.md)
