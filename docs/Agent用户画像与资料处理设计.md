# Agent 用户画像与资料处理设计

> 日期：2026-11-11。状态：已批准方向下的可实施设计，尚非已上线能力。本文是可编辑衍生文档，不修改用户冻结原稿。
> 状态枚举、权限定义、公共错误格式及 API 路径冲突时，以[共享数据与接口契约](共享数据与接口契约.md)为权威。推荐流程见[发现推荐与 Agent 工具设计](发现推荐与Agent工具设计.md)。

## 1. 目标与责任

普通资料模块把本人提供的材料与回答整理为可编辑、可选择展示范围的个人资料。引导采用“先了解资料、主动补问、形成画像”的节奏。规则实现提供完整基础流程，AI 在同一用例中增强提取、提问和表达。

默认路径是“资料导入 → 核对已有信息 → 回答几个问题 → 编辑画像草稿 → 选择展示范围并确认”。首屏提供简历与 GitHub 导入，也支持直接填写。基础后端先完成 rules 路径，AI 在基础链路验收后接入。

本次设计采用项目安装的 architecture-patterns 方法：领域对象保存规则，应用用例编排步骤，数据库、文件解析器、模型网关和任务队列通过端口接入。保持模块化单体，不因命名为 Agent 就增加独立服务或让模型直接操作数据库。

| 边界 | 本模块负责 | 其他模块负责 |
|---|---|---|
| 资料 | 本人来源、解析文本、证据、草稿和确认版本 | 身份模块验证本人及 GitHub 登录 |
| 偏好 | 一次生成问题、答案、用户确认的协作偏好 | 前端负责逐题呈现、保存提示和导航 |
| 活动 | 活动画像上下文及范围内的字段投影 | 活动模块判断成员资格与当前活动 |
| 想法 | 在本人确认的画像旁组合展示 | 想法模块独立存储想法与版本 |
| 发现 | 产出已确认的 authenticated 字段投影 | 推荐模块检索、排序、解释与曝光控制 |
| 社交 | 按可见性和关系提供资料视图 | 社交模块维护好友关系及逐好友联系方式授权 |

## 2. 画像结构与权限语义

### 2.1 全局基础画像与活动上下文

GlobalProfile 保存能力、作品、经历以及本人明确确认的长期协作偏好；昵称/头像引用身份模块 User 的本人确认投影，不复制第二份可编辑真相。EventProfileContext 保存本次活动希望承担的角色、可投入时间、参与目标、当前需求和活动内的自我介绍；每个用户在每个活动至多有一个当前确认上下文。

活动画像以基础画像加当前 EventProfileContext 合成。活动层只覆盖活动语义字段，不隐式覆盖全局能力或提高全局字段可见性。修改活动 A 的投入时间不影响活动 B。用户可明确把某条活动自述另存为全局字段，这是一项独立确认操作。

想法始终是独立实体。个人页面可以组合展示多个想法，但不复制想法正文进画像，也不因保存画像自动发布想法或加入讨论群。

### 2.2 三档字段可见性

| 值 | 读取者 | 推荐索引与模型使用 |
|---|---|---|
| authenticated | 有合法资料访问入口的所有已登录用户 | 可进入当前活动的候选投影；仍需满足活动、发现开关、屏蔽等限制 |
| friends | 所有已接受的好友，统一可见 | 不进入候选索引，不因查看者恰好是好友就补入推荐上下文 |
| private | 仅本人 | 不进入对外检索；本人可为自己的本次整理或需求查询明确选择使用 |

authenticated 描述字段读取范围，不提供全站找人能力。发现、搜索和 AI 推荐始终验证当前活动；广场只展示用户主动发布的内容。已有好友入口与普通资料访问是否允许，由共享契约和社交权限检查共同决定。

普通画像字段采用上述统一可见性，不为每个好友复制一份字段授权。手机号、邮箱、微信等联系方式进入独立的逐好友授权模块；friends 并不自动公开联系方式。原始文件、解析文本、问卷原答案和内部证据片段始终私有，不作为可见性下拉框的候选字段。

新生成字段默认 private；初次确认页以清晰选择让本人决定哪些字段设为 authenticated 或 friends，不能把“确认内容正确”和“公开展示”混成同一个含糊按钮。模型只能建议文本，不能建议值后直接修改权限。

### 2.3 证据与主张

每个 ProfileClaim 保存字段值、来源类型、引用 ID、用户确认状态、可见性和版本。来源可以是本人手填、简历陈述、公开作品或问题答案；“用户已确认”表示本人认可表述，不代表平台完成真实性认证。

证据正文与公开出处分开。对外可显示“本人自述”“用户提供的作品链接”等经允许的来源标签；不能顺着 evidence_id 下载私密材料。私密来源可以支持本人确认的一条公开技能，但公开技能不继承对原文的访问权限。

协作偏好依据本人回答与确认资料组织，例如“更喜欢先讨论再分工”。每条表达都可以查看来源、编辑并选择展示范围。

## 3. 来源保存与读取规则

### 3.1 保存在哪里、何时读取

用户上传的原始文件二进制、来源网页的获准快照、提取文本及片段保存于私有数据库存储；首版为受限 PostgreSQL 表，不把材料暴露到公共对象路径。大文件的存储适配器将来可替换，但不得改变访问、保留和删除合同。

默认无自动过期、自动重抓、定时重新解析或定时模型整理。保留不代表被持续使用：

1. 初次导入包括简历与已验证 GitHub 公开来源。先完成解析/读取，本人点击“继续整理”后，按 generation_mode 进行结构映射或 AI 抽取，并保存资料草稿。
2. 本人在个人中心选择“重新编辑/重新整理”，勾选来源与处理方式，基于所选快照启动新的资料整理。
3. 普通查看已确认画像、编辑文字、切换活动、浏览朋友、推荐和卡片刷新，都不重新读取原文，也不因页面打开触发模型。
4. 仅打开手工编辑页读取当前草稿/确认字段；只有点击“用资料重新整理”才读取所选原文。本人在资料重新编辑流程中主动查看原文也是显式读取，不等于调用模型；其他页面不预加载原文。
5. 重新读取远程 GitHub/网页需要明确“刷新此来源”，生成新快照；复用已保存快照不能冒充最新远程状态。

本人删除来源或删除账户时，遵循共享契约的删除流程；“无自动过期”不取消本人主动删除权。原始材料不写入通用日志、搜索索引、分析埋点或推荐缓存。数据库备份执行既定删除传播规则，不以缓存或备份重新激活已删除来源。

### 3.2 输入与解析

| 输入 | 接入行为 | 不可解析时 |
|---|---|---|
| MD、TXT | 解码、去掉执行性内容、保留段落与来源位置 | 提示编码或大小问题，允许粘贴文本 |
| PDF、DOCX | 首期必备简历入口，隔离解析可提取文本并保留页/段落引用；不能只做上传占位 | 扫描件没有可用 OCR 时说明限制，允许改传或手填 |
| DOC、RTF、ODT | 可选扩展格式，接入后使用独立受限转换进程，不执行宏 | 未支持或转换失败时明确提示，不伪造提取结果；其他来源可继续 |
| GitHub 公开资料/项目 | 首次 GitHub 注册自动绑定已验证账号并读取公开资料，无需再填主页；邮箱用户可主动连接导入 | 单独显示连接/读取失败，保留简历成功结果；不读取私有仓库 |
| 可访问展示网页 | 受控抓取正文及来源快照 | 不绕过登录、付费或反爬访问限制 |

初始接入限制为单文件 20 MiB、每次最多 5 个来源、总计 50 MiB；可配置且在上传前提示。超过处理容量时明确要求缩减或拆分材料，不静默截断后宣称完整。超长文本先确定性分段，分段和合并调用都计入任务预算，界面注明处理范围。

网页读取拒绝私网、本机、云元数据地址，每次重定向重新检查目标；限制响应大小、跳数、超时和并发。GitHub 登录权限与资料导入权限分别记录。所有材料内容都是待处理数据，不能改变系统指令、工具权限或模型接收人。

权限分别记录不意味着要求用户重复操作：首次 GitHub 登录这个已说明用途的真实动作即可登记身份与初始公开来源，读取范围和来源去重以共享契约为准。普通再次登录不触发重新读取；已取消/删除来源不自动恢复。昵称/头像只作为本人待确认的建议，不自动公开实名；代码语言只作为项目证据，不直接推出技能等级。

## 4. 数据模型和一致性边界

| 对象 | 必要内容 | 一致性要求 |
|---|---|---|
| SourceDocument / SourceSnapshot | owner_id、来源类型、已验证身份引用/导入来源、私有原件、文本、内容哈希、解析状态、快照版本、last_updated_at | 只能由本人访问；GitHub 初次来源唯一；last_updated_at 表示来源读取时间，不自动刷新画像条目确认时间 |
| SourceFragment | snapshot_id、页/段落定位、私有文本 | 引用必须属于选定快照和本人 |
| ProfileClaim / ProfileEvidence | 字段、来源类型、引用、确认、可见性、last_confirmed_at | 可见字段与私密证据分开读取；last_confirmed_at 记录最后确认时间 |
| ProfileDraft | owner_id、base_profile_version、draft_version、候选字段 | 不覆盖当前确认版本 |
| ProfileVersion | 单调版本、确认字段集合、confirmed_at | 确认后不可原地改写，修改产生新版本 |
| EventProfileContext | owner_id、event_id、活动字段、版本 | 与全局画像版本独立 |
| QuestionBatch / QuestionAnswer | 题目批次、稳定题/选项 ID、答案与版本 | 开始回答后题目不原地变换 |
| AIJob | 任务、输入快照、两维状态、模型/提示/Schema 版本、预算、用量 | 完成不等于可应用；没有隐式确认 |

应用用例包括 RegisterVerifiedGitHubSource、ImportSources、ExtractProfile、GenerateQuestions、SaveAnswer、SynthesizeProfile、EditDraft、ConfirmProfile、UpdateEventContext、DeleteSource。身份用例只传递已验证的账号引用与本次导入意图；画像模块拥有来源和草稿。Onboarding 只记录步骤及引用，个人中心复用同一组用例。

端口包括 SourceRepository、ProfileRepository、QuestionRepository、JobRepository、TextModelGateway、DocumentParser、GitHubPublicSourceReader、EventAccessPolicy、ProfileProjectionReader。领域层不导入 FastAPI、SQLAlchemy 或模型 SDK；适配层负责对象映射、事务和外部协议，GitHub/OAuth 凭据不进入草稿或模型。

## 5. 基础填写流程与 AI 增强

体验与页面要求见 [用户画像填写需求](用户画像收集/01_用户画像填写需求.md)。五个阶段为提供资料、核对信息、补充问答、编辑画像、确认展示范围。

```mermaid
flowchart LR
    A[导入资料或直接填写] --> B[核对首批信息]
    B --> C[准备一批补充问题]
    C --> D[逐题回答并保存]
    D --> E[组织画像草稿]
    E --> F[编辑内容与展示范围]
    F --> G[确认普通资料]
```

| 用例 | rules 基础实现 | ai 增强实现 |
|---|---|---|
| ExtractProfile | 对已就绪材料做结构映射，显示正文与待补项 | 提取资料条目并关联证据 |
| GenerateQuestions | 题库按待补维度、范围和优先级选择 3–8 题 | 根据已确认资料生成一批 3–8 题 |
| SynthesizeProfile | 确认字段、答案映射与固定卡片模板 | 归纳事实与偏好，生成可编辑表达 |

三种用例使用 generation_mode，默认 rules。基础模式的完整资料工作流模型调用数为 0；AI 模式下，正常短资料包含抽取、问题生成、综合三个生成步骤，任务记录实际调用和用量。

初稿按已有信息和待补维度呈现。用户确认首批资料后，问题提供者依据该版本准备完整批次。问题以单选/多选为主，提供自由回答与跳过；资料较完整时选择较短批次。

QuestionBatch 保存 generation_mode、schema_version、policy_version、稳定 question_id 和 option_id。前端逐题展示，回答保存为 option、free_text 或 skipped。返回和刷新恢复同一批次与已保存答案。

题目按全局或活动语义保存。当前活动的时间、目标和角色写入对应 EventProfileContext；通用偏好写入全局资料。重新整理可以建立新批次，以题目和答案的明确引用参与综合。

综合结果写入 ProfileDraft。用户可编辑、返回修改回答、预览展示范围，再通过确认接口保存正式资料。普通资料页复用这组用例，引导保存步骤与对象引用。

## 6. 输入快照、并发与人工确认

每个任务绑定确切输入，不能只记录一个含糊的 input_version。至少记录来源快照 ID/哈希、全局画像版本、活动上下文版本（适用时）、草稿版本、问题批次/答案版本、本人本次选择字段、处理目的、提示/Schema/模型版本。

~~~json
{
  "job_id": "job_demo_01",
  "task_type": "synthesize_profile",
  "execution_status": "running",
  "applicability": "current",
  "input_snapshot": {
    "profile_version": 3,
    "draft_version": 7,
    "event_context": {"event_id": "evt_demo_01", "version": 2},
    "source_snapshots": [],
    "question_batch_id": "qb_demo_01",
    "answer_version": 5,
    "selected_self_fields": ["attr_demo_skills", "attr_demo_preferences"]
  },
  "model_id": "gemini-3.8-flash",
  "prompt_version": "profile-synthesis.v1",
  "schema_version": "profile-draft.v1"
}
~~~

综合任务可以只使用已确认字段和答案，source_snapshots 为空；不得为了“补充上下文”自动重读全部原材料。用户主动选择重新整理来源才把所选快照加入输入。

AIJob 两维状态采用共享契约：execution_status 为 queued/running/succeeded/failed/cancelled；applicability 为 current/superseded/revoked。执行成功但输入已经更新时是 succeeded + superseded；本人撤回相关读取授权或删除材料时为 revoked，不包装成普通失败。

执行前与写草稿前都核验 owner、输入版本和任务有效性。人工编辑从 draft_version=7 更新为 8 后，基于 7 的晚到结果只能成为不可自动应用的旧结果，不覆盖 8。普通任务读取的 result_ref 为空；本人通过 GET /api/v1/ai-jobs/{job_id}/review 单独请求差异，服务端重验全部输入仍获准后才返回 reviewable=true、applicable=false。采纳须基于最新草稿重新保存并确认，不能把旧任务改回 current；revoked、来源已删除或活动失权均不返回旧正文。

确认操作携带 expected_version，在同一事务内验证草稿、写入新 ProfileVersion、推进当前版本指针并写出投影更新事件。确认失败返回版本冲突，不采用最后写入获胜。任务重试复用幂等键和结果引用，不创建重复画像或重复问题批次。

全局画像任务不因用户切换页面或活动自动失效；它仍以全局输入版本判断。活动画像任务在结果应用时重新验证目标活动资格。前端切换活动后不渲染旧活动任务结果，但不能只依赖前端取消请求保证权限。

## 7. API 与独立重入

资料提取、问题批次和综合使用 `generation_mode=rules|ai`，默认 rules；返回规则结果或 AI 任务的语义以共享契约为准。

以下为待实现的服务契约，不表示路由已经存在。所有接口受登录校验；me 表示服务端当前用户，不接受客户端指定 owner_id。错误包装、幂等键、版本字段和最终路由名以共享契约为准。

| 方法与路径 | 用途 |
|---|---|
| POST /api/v1/me/profile/sources | 导入本人所选来源，返回来源状态 |
| GET /api/v1/me/profile/sources | 查看来源元数据，不默认附原文 |
| GET /api/v1/me/profile/sources/{source_id}/content | 本人在资料编辑流程显式查看所选私有原文，不调用模型 |
| POST /api/v1/me/profile/sources/{source_id}/refresh | 本人明确重新抓取远程来源，生成新快照 |
| DELETE /api/v1/me/profile/sources/{source_id} | 主动删除及派生失效 |
| GET /api/v1/me/profile | 获取本人当前确认画像和编辑状态 |
| POST /api/v1/me/profile/drafts | 从确认版建立手工编辑草稿，零模型 |
| PUT /api/v1/me/profile/drafts/{draft_id} | 用 expected_version 保存手工修改 |
| POST /api/v1/me/profile/extractions | rules 更新资料草稿并返回 200；ai 返回 202/job_id |
| POST /api/v1/me/profile/question-batches | rules 返回完整批次/201；ai 返回 202/job_id |
| PUT /api/v1/me/profile/question-batches/{batch_id}/answers/{question_id} | 保存答案，零模型 |
| POST /api/v1/me/profile/syntheses | 用确认字段和问答生成综合草稿；rules 返回草稿/201，ai 返回 202/job_id |
| POST /api/v1/me/profile/drafts/{draft_id}/confirm | 确认内容与逐字段可见性 |
| GET /api/v1/me/events/{event_id}/profile-context | 获取本人活动上下文 |
| PUT /api/v1/me/events/{event_id}/profile-context | 显式修改活动画像，校验资格及 expected_version |
| GET /api/v1/ai-jobs/{job_id} | 本人读取任务状态 |
| GET /api/v1/ai-jobs/{job_id}/events | 本人订阅状态事件；不可用时轮询 |
| GET /api/v1/ai-jobs/{job_id}/review | 本人审阅仍获准的 superseded 画像/想法差异，不自动应用或公开 |
| POST /api/v1/me/profile/reconfirm | expected_version,attribute_ids；重新确认所选当前条目，创建新确认版本，零模型 |

~~~json
{
  "expected_version": 8,
  "fields": [
    {"attribute_id": "attr_demo_skill_01", "key": "skill", "value": {"code": "interaction_design", "label": "交互设计"}, "scope": "global", "event_id": null, "visibility": "authenticated"},
    {"attribute_id": "attr_demo_skill_02", "key": "skill", "value": {"code": "react", "label": "React"}, "scope": "global", "event_id": null, "visibility": "authenticated"},
    {"attribute_id": "attr_demo_preference", "key": "collaboration_preference", "value": {"codes": [], "free_text": "希望先讨论再分工"}, "scope": "global", "event_id": null, "visibility": "friends"}
  ],
  "confirmation_intent": "confirm_selected_fields"
}
~~~

确认意图只有在已登录用户实际提交这条业务请求时有效；模型 JSON 中同名字段不构成授权。联系方式不接受经该字段接口写入 authenticated/friends 视图，而应转到联系方式专用流程。

个人中心分别提供资料来源、能力画像、偏好问卷、活动目标、想法入口。仅更新需要更新的部分：手改昵称不重做问卷；重做问卷不自动重整来源；修改画像不重发连接请求；新建想法不重跑首次引导。

## 8. 输出验证、来源删除与失败处理

模型通过集中网关适配器调用 gemini-3.8-flash；这是现有网关别名，不据此声明官方底层版本。沿用既有探测结论，不依赖严格 JSON Schema 已被网关保证。普通 JSON 输出由服务端校验类型、数量、字段长度和业务引用；每个任务最多一次格式修复，仍失败回退手填或内置问卷。

| 情况 | 必须执行的行为 |
|---|---|
| 来源缺失、链接不可访问 | 保存失败原因与来源状态，允许手填；不补造经历 |
| 条目超过 6 个月未确认 | 本人逐条显示最后确认时间和“确认仍有效”；对外只根据当前可见条目提示“部分资料超过 6 个月未确认”，不暴露私有来源时间，也不将未更新等同失效 |
| 解析只覆盖部分文档 | 展示已处理范围；本人确认后继续，不声称全量完成 |
| 模型返回不存在的引用 | 拒绝该输出；一次修复失败则手填 |
| 用户在生成期间编辑 | 保留编辑，新 AI 结果 superseded，展示差异入口 |
| 同一答案重复提交 | 按幂等及版本规则保存一次，不生成新批次 |
| 删除来源 | 禁止未来读取、撤销相关任务、清除原件和片段、失效派生缓存/索引 |
| 已确认字段依赖被删来源 | 移除证据片段和不可访问引用；字段标为待重新确认并暂停对外投影，本人可明确转为自述后再确认 |
| 可见性由 authenticated 降为 friends/private | 先更新权威权限并阻止后续输出，再异步清理索引；旧索引不能作为授权依据 |
| 网关异常或预算不足 | 草稿、手工修改、确认和基本资料展示仍可使用 |

**资料新鲜度计算规则**：
- 来源的 SourceDocument.last_updated_at 与条目的 ProfileAttribute.last_confirmed_at 分别表达“材料刷新”和“本人确认”，不能取两者最大值把未经确认的旧画像显示为新资料
- 手工修改并确认某条字段时，更新该条 last_confirmed_at；同版本中未修改也未主动重确认的其他条目继承原时间
- “确认资料仍然有效”提交 attribute_ids 与 expected_version，沿用值和可见性生成新确认版本，只更新所选条目确认时间；不原地改写历史版本，不调用模型或读取原文
- 对外新鲜度只使用本次获准展示的条目；没有确认时间则显示未知，不推测。不因刷新一份来源或修改昵称而给所有技能重置时间
- 新鲜度提示不阻止查看或推荐，只作信息提示；由查看者自行判断时效性影响

后台投影/索引重建只能读取已确认的可见字段，不读取原文、不额外调用生成模型。若配置 embedding，也只能处理获准投影，并记录模型版本、内容哈希与索引状态。

## 9. 验收与观测

使用内存仓储与假模型适配器先测业务用例，数据库事务、解析隔离、网关兼容性再做集成测试。本文未声称这些测试已经运行。

1. 简历上传与 GitHub 自动关联均可用且首屏可见，抽取后默认预填；无材料或读取失败可手填兜底，不虚构经历。
2. 一次生成 3–8 题；回答全部问题只保存答案，没有逐题生成请求。
3. 同时编辑与生成时，旧结果不覆盖人工编辑或当前确认版。
4. 全局画像复用于多个活动；各活动时间和角色互不覆盖。
5. 三档字段读取符合共享契约，好友关系不能打开原始简历，逐好友联系方式独立授权。
6. 切换活动、打开画像、普通推荐、浏览朋友均不触发原文读取或画像模型调用。
7. 私有来源默认持续保留；无定时重抓/自动过期；本人主动删除后不能由旧缓存或任务重新出现。
8. 提示注入文本、不存在的引用、超长文件、不可达网页均不能改变权限或产生虚构确认版。
9. 重复任务和断网重试不重复确认、不复制想法、不发送消息。
10. 监控仅记录任务 ID、耗时、状态、用量、失败码和版本；原文、完整答案、联系方式及凭据不进通用日志。

画像质量观察用户修改率、引用有效率、确认完成率和回退率；不能把“修改少”解释为真实性高。性能目标需由实际文档样本测得，不用模型名称承诺固定完成时间。
