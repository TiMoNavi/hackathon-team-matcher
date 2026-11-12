# HumHub 实施合同

> 日期：2026-11-12。关联 N02；本文锁定当前 HumHub 插件接入映射，不表示全部应用已实现。
> N01 已完成并推送至 feat/overnight-integration-20261112，提交 adb960ad7514424b41a7b0acd742018b5b8a0889；证据见 [N01 隔离验收](sources/N01_隔离验收_20261112.json)。它验证空库隔离、迁移、恢复及未登录负例，不证明真实业务闭环。
> 产品规则以[共享契约](../共享数据与接口契约.md)及本轮已批准[接入设计](02_插件使用与接入设计.md)为准；执行按[任务依赖](task.md)。旧 Next.js/FastAPI 设计的路由、物理表和异步协议不能冒充当前 HumHub 实现。

## 1. 状态、版本与所有权

“已有”表示实际源码可定位；“待补／拟新增”表示后续批次必须实施；“已验收”仅指明确回执覆盖的场景。N01 使用全新空库，未复制真实用户、画像或消息，模型请求为0。

| 模块 | 当前版本 | 证据范围 |
|---|---|---|
| HumHub / auth-github / mail | 1.19.4 / 1.1.1 / 3.4.6 | N01 安装、重复迁移与恢复；不是认证和聊天验收 |
| matcher-user-profile / matcher-profile-privacy / matcher-onboarding | 0.10.0 / 0.2.0 / 0.4.0 | N01 已启用 |
| matcher-resume-import / matcher-recommendation / matcher-ideas | 0.1.1 / 0.3.0 / 0.1.0 | N01 已启用；推荐不是旧记录的0.2.0 |
| matcher-github-import / matcher-web-import | 各0.1.1 | 源码存在，N01未启用 |
| matcher-onboarding-ai / matcher-recommendation-ai | 0.1.0 / 0.2.0 | 源码存在，N01未启用 |

版本依据各模块 [module.json](../../backend/protected/modules/)及 N01 回执。保持 HumHub 模块化单体：领域规则独立，应用用例编排 ports，数据库／HTTP／模型适配在外层；内存测试不能替代真实登录和消息验收。

| 所有者 | 已有或拟新增职责 | 不得越界 |
|---|---|---|
| 原生 user、AuthClient、session | 身份与登录事实 | 不另建用户体系；actor取自会话 |
| 原生 Space、space_membership | 活动及有效成员事实 | 邀请或当前选择不等于成员资格 |
| matcher-recommendation | 唯一current-event、普通发现、同步推荐对话 | 新模块不得保存第二份当前活动 |
| P1 / P8 / P2及来源、AI插件 | 资料事实／授权投影／引导编排 | 不代用户执行社交写入 |
| 原生 friendship / mail | user_friendship、message、user_message、message_entry事实 | 社交适配不复制另一套好友／消息真相 |
| matcher-ideas | 正式想法、Space发布、永久Messenger绑定 | 想法、Space、聊天会话保持独立 |
| matcher-webapp 0.1.0 | N03拟新增页面、资产、导航宿主 | 不保存身份／画像／当前活动副本 |
| 认证适配 N04 | 复用原生GitHub并补真实邮箱验证码 | 配置已具备，应用接入待验收；实际模块名随代码批次锁定 |
| 邀请适配 N05 | 拟新增凭据、有效期、次数、兑换收据 | 调用原生成员与既有选择ports，不重建membership |
| 社交适配 N08/N09 | 拟新增来源证明、版本、幂等、发出历史、邀请状态 | 经原生授权写好友／成员／消息；模块id随代码批次锁定 |

认证资源已由用户另派agent保存，其报告仅为 Gmail SMTP AUTH235、未发送邮件；主执行者只核对字段存在性、0600与Git忽略，0外呼。外部agent已完成配置交接，后续N04由本队在N03后实施。真实GitHub回调、验证码投递及兑换均未验收；G3为“配置已准备，应用验证待执行”，子agent不读取私有配置。

R03继续覆盖发现、筛选、分页、搜索、随机浏览、推荐、详情、缓存和晚到结果，真实不足不跨活动补人。authenticated是登录用户经合法入口可见，friends对所有当前有效好友动态生效，private仅本人；Space字段再与实际资格取交集。公开帖作者可跨活动合法联系，但不是全站人物搜索。切活动不删除合法好友／私聊，同想法跨Space讨论不能串成员或消息。

## 2. 身份与唯一当前活动

本人依据 [P1 actionMe](../../backend/protected/modules/matcher-user-profile/controllers/ApiController.php#L48)和 [IdentityService](../../backend/protected/modules/matcher-user-profile/application/IdentityService.php)。GET /api/v1/me实际只返回 `data={user_id:int,nickname:string或null,identity_version:int,avatar_ref:string或null}`，没有GitHub或来源引用。空昵称／头像是合法现态，不用示例人物补齐。

当前活动依据 [推荐ApiController](../../backend/protected/modules/matcher-recommendation/controllers/ApiController.php#L41)、[SqlCurrentEventSelectionStore](../../backend/protected/modules/matcher-recommendation/adapters/native/SqlCurrentEventSelectionStore.php)与 [NativeCurrentEventAccess](../../backend/protected/modules/matcher-recommendation/adapters/native/NativeCurrentEventAccess.php)。选择绑定原生actor／会话；原子比较revision，读写前后重验资格。

- GET /api/v1/me/current-event成功为space_id整数、selection_revision字符串、access_version字符串；selection_revision为selection-加32位十六进制。
- 无选择返回409 CURRENT_EVENT_REQUIRED，不是401，也不是200/null。
- 首次PUT为`{space_id:整数,expected_revision:null}`；后续提交读到的selection_revision。不能改成expected_version，不能自动覆盖并发选择。
- CURRENT_EVENT_MISMATCH／CONTEXT_CHANGED为409；权限失效按真实403处理。前端清除旧活动投影和在途结果，不能以旧卡片填新活动。
- 邀请兑换只建立合法membership，切活动仍调用同一选择用例。URL、bootstrap、localStorage均不是当前活动权威。

原生User、Space、想法、Messenger ID为正整数；画像草稿／来源等为UUID；推荐对话为conversation-前缀。按端点校验类型，不将旧设计“不透明字符串”强套到已有整数输入，也不因ID可枚举省略授权。

## 3. 已有接口矩阵

下表省略/api/v1。路由来源为 [P1 config](../../backend/protected/modules/matcher-user-profile/config.php)、[P2 config](../../backend/protected/modules/matcher-onboarding/config.php)、[P8 config](../../backend/protected/modules/matcher-profile-privacy/config.php)、[推荐config](../../backend/protected/modules/matcher-recommendation/config.php)、[想法config](../../backend/protected/modules/matcher-ideas/config.php)；方法与字段以controller为准。

| 已有端点 | 真实合同／限制 |
|---|---|
| GET/PATCH /me | GET见第2节；PATCH为expected_version、nickname?、avatar_ref? |
| GET /me/profile；POST /me/profile/drafts | 本人正式画像／私有草稿；创建接受scope、space_id/event_id、base_profile_version及Idempotency-Key |
| GET/PUT /me/profile/drafts/{id}；POST 同路径/confirm | PUT为expected_version、fields；confirm为expected_version、base_revision、attribute_ids?、confirmation_intent=confirm，不是内联fields |
| GET/PUT /me/events/{spaceId}/profile-context | 本人活动资料；PUT为expected_version、attributes、confirmation_intent=confirm |
| GET /me/profile/preview；PATCH /me/profile/visibility | P8预览与显式范围变更；PATCH为expected_version、changes、confirmation_intent=confirm |
| GET /me/contacts | 当前仅独立读取；不是完整联系人POST/PUT/DELETE已实现 |
| GET /me/profile/source-capabilities | readers提供enabled、available、reason、imported_before等；generation_mode=rules、llm_calls=0 |
| GET/POST /me/profile/sources | GET返回sources；POST使用kind=github/web/text及各自白名单，201；非旧type输入 |
| POST /me/profile/sources/resume | 一个multipart file，1字节至5 MiB，201；不承诺原型10 MiB或旧设计20 MiB |
| GET/DELETE /me/profile/sources/{id}；POST 同路径/refresh | 本人读取／版本化删除／刷新；DELETE提交expected_version，返回200数据，非202删除任务 |
| POST /me/profile/extractions | rules使用source_id、expected_version、draft_id、expected_draft_version、candidate_ids，200；ai沿现有AI提交合同，202 |
| POST /onboarding/sessions；GET/PUT /onboarding/sessions/{id} | 五阶段会话；PUT为expected_version和action白名单，非任意十步resource_refs写入口 |
| POST /me/profile/question-batches、/syntheses | 基于session_id和实际版本；rules同步，ai为202；答案PUT为answer_type、selected_options、free_text |
| GET /me/profile/ai-capabilities | generation_modes、ai.available/reason、limits、llm_calls=0；列出ai不等于provider就绪 |
| GET /me/profile/ai-jobs/{id}；POST 同路径/cancel、/retry、/apply | 本人任务；apply采纳到草稿，不代替正式确认；未提供通用/ai-jobs别名承诺 |
| 会话／来源／AI任务各自GET /progress | 分别在/onboarding/sessions/{id}、/me/profile/sources/{id}、/me/profile/ai-jobs/{id}后加/progress；已存状态投影、percent=null |
| GET/PUT /me/events/{spaceId}/discovery-settings | expected_version、discoverable；关闭不等于退出活动 |
| GET /events/{spaceId}/discovery；GET 同路径/people/{ownerId} | 当前仅person；recent/relevance，limit默认24、最大48，filters为JSON字符串，签名cursor；详情重新授权，0 LLM |
| GET /me/ideas；草稿创建／读取／更新／confirm | 本人草稿与正式想法；不等于完整长计划／自动发布 |
| POST /ideas/{id}/activities；PUT /idea-activities/{id} | 已有Space发布、members_visible/status；当前拒绝非空context及open_to_discussion=true |
| PUT /idea-activities/{id}/messenger | expected_version、message_id、confirmation_intent=bind_existing_conversation；永久绑定已有会话，不自动建群／邀请 |

P1他人详情当前基于entry_type、space_id、post_id和动态原生关系校验；通用access_ref签发协议不得标作已实现。P1的/me未知路径回退会返回NOT_FOUND，新增端点需显式注册并验证加载顺序。源码存在不表示生产装配或业务正例已经验收。

## 4. 错误、CSRF、版本与幂等

现有matcher JSON成功为`{data,meta:{request_id}}`，失败为`{error:{code,message,retryable,details},meta:{request_id}}`。空details实际可为[]，其他details可为对象；客户端不能只接受对象。原生HTML与隔离router错误不一定使用该envelope，还须处理非JSON／网络失败。

| 场景 | 实际HTTP／code | 接线规则 |
|---|---|---|
| P1／来源／P2／P8／发现／想法未登录 | 401 AUTHENTICATION_REQUIRED | 清本人／活动投影，显示合法登录入口 |
| 同步推荐对话未登录 | 401 AUTH_REQUIRED | 同样处理，保留原code，不假装后端已统一改名 |
| P1／P2／P8账号不可用 | 403 ACCOUNT_UNAVAILABLE | 不显示旧本人数据，不继续写入 |
| 发现／想法资格拒绝 | 403 ACCESS_DENIED或CANDIDATE_ACCESS_REVOKED | 清无权活动数据；重新授权 |
| 推荐上下文失败 | 403 FORBIDDEN或409 VERSION_CONFLICT | 不绕过readiness，不沿用旧结果 |
| 已登录写请求CSRF无效 | 400 INVALID_REQUEST | 不显示已保存，更新页面防护值 |
| 并发版本不匹配 | 409 VERSION_CONFLICT | 保留输入，基于最新版本显式处理 |
| 推荐依赖未就绪 | 503 AI_UNAVAILABLE，details.reason | 明确不可用，不伪造空结果或静默降级 |
| 推荐预算耗尽 | 429 AI_BUDGET_EXCEEDED | 停止调用，不新建run重置预算 |

依据 [P1错误处理](../../backend/protected/modules/matcher-user-profile/controllers/ApiController.php#L244)、[来源JSON边界](../../backend/protected/modules/matcher-user-profile/adapters/http/SourceJsonController.php)、[P2 JSON边界](../../backend/protected/modules/matcher-onboarding/adapters/http/JsonController.php)、[推荐会话controller](../../backend/protected/modules/matcher-recommendation/controllers/ConversationController.php)。普通controller的retryable通常为HTTP≥500，推荐会话固定false；不能据此自动重复业务写入。

写请求复用同源原生会话和Yii CSRF，不关闭CSRF或使用管理员REST密钥。身份检查先于CSRF，未登录写请求可先401。仅在端点明确支持幂等时，以原键、原payload重试并重新授权；不同payload不得复用键。方法、content-type、字段白名单、版本和幂等要求分别遵守实际端点，不宣称所有旧端点都已具备统一幂等。

## 5. 画像与引导待补边界

新增确认普通画像和可选联系方式默认authenticated，已有明确范围保留，第5／8步逐条预览。联系方式独立读取并沿用本人逐条范围，不能夹带于普通画像；原文／未确认候选私有，参与关系逐对象默认private，想法members_visible默认false。

[现有P2 review_confirm](../../backend/protected/modules/matcher-onboarding/application/OnboardingService.php#L82)确实调用confirmDrafts；不能直接绑定新前端第3步“核对完成”。N06必须补私有核对快照和问题引用，第5步才正式确认，第8步逐对象确认；重编辑期间旧正式版本继续有效。共享契约旧正文“第3步保存首批确认资料”不再授权本轮提前公开，此差异尚未修复。

每段20,000字及换行要求按Unicode字符处理，另设明确总请求／存储／AI输入限额，不能静默截断。5 MiB真实导入上限先按已有能力接线，扩容另行实施。现有五阶段不是十步跨领域旅程；N06/N07/N11补保存恢复及真实对象引用，不存平行业务事实。progress只投影已存状态；普通浏览、切活动、改可见性不得抓取或触发AI。任务superseded/revoked不得覆盖新确认资料。

## 6. 推荐与社交差异

推荐专用同步对话不是Messenger，也不是旧设计的202 RecommendationRun/AIJob/SSE：

| 已有方法 | 精确输入 |
|---|---|
| POST /events/{spaceId}/recommendation-conversations | 空JSON对象{}、Idempotency-Key，成功201 |
| GET /recommendation-conversations/{id} | 本人持久对话；重新验证归属、当前活动及就绪状态 |
| POST 同路径/turns | 恰好expected_version、message、command；command=chat/recommend/refresh，Idempotency-Key |
| POST 同路径/requirements/confirm | 恰好expected_version、requirements_version、confirmation_intent、message、command、conditions；intent=replace_complete_requirements，command=recommend/refresh，最多16个完整条件，Idempotency-Key |

依据 [输入解析](../../backend/protected/modules/matcher-recommendation/adapters/conversation/ConversationHttpInput.php)、[输出投影](../../backend/protected/modules/matcher-recommendation/adapters/conversation/ConversationHttpView.php)与 [装配工厂](../../backend/protected/modules/matcher-recommendation/adapters/composition/NativeConversationFactory.php#L36)。正文上限16 KiB，版本正整数，不接受任意actor/event/SQL；同键异payload返回IDEMPOTENCY_CONFLICT。HTTP200仍须检查execution_status、applicability和error；非current不显示旧候选和条件。

工厂检查真实发出历史、持久平台预算、provider/revision、P1/P8、策略与存储；N10仍待实际装配和有限真实调用，不能注入永远允许的历史或无限预算。当前无汇总capabilities端点，N03不新增／伪造它。来源与画像AI的enabled、available分别读取，模块存在不能证明就绪。

200→24→5、24 KiB及每run／澄清／修复硬预算继续约束N10；对话总额度不允许放宽每run限制。普通发现／筛选／翻页／随机批次保持0 LLM。同步等待不制造异步job或时间进度；离页继续／取消／SSE需要先补持久合同。首次真实AI验证仍仅合成资料，合计最多8次、重试计入、更严平台预算优先。

邀请码N05、好友适配N08、群聊／讨论N09仍pending。event_card验证同活动，public_post验证可访问帖子作者，不能误套同活动。接受申请绑定expected_version，真实发出历史供推荐使用。群邀请不等于成员，真实接受前不可读消息；想法／Space／会话隔离并保留永久绑定与tombstone。当前 [unsupportedDiscussion](../../backend/protected/modules/matcher-ideas/controllers/ApiController.php#L99)拒绝开启讨论；原生Message::addRecepient直接新增UserMessage，不能把“邀请”直接接成“入群”。

## 7. N03 同源外壳合同

拟新增matcher-webapp@0.1.0，路由`/matcher/app`及`/matcher/app/<path>`只承载本插件深链，不接任意returnUrl或转发后端路径。根为div#matcher-webapp-root，bootstrap为script[type=application/json]#matcher-webapp-bootstrap：

| 字段 | 固定类型／来源 |
|---|---|
| schema_version | 整数1 |
| base_path / api_base | /matcher/app / /api/v1 |
| native_home_url | 服务端Url::to(['/dashboard/dashboard']) |
| native_login_url | 服务端Url::to(['/user/auth/login']) |
| csrf_header | X-CSRF-Token |
| csrf_token | 每请求Yii getCsrfToken()的当前掩码值，仅本页内存 |

安全HTML JSON编码，兼容`humhub\helpers\Html::nonce()`已有nonce，保持宿主CSP，不放宽unsafe-inline。除CSRF防护值外不下发认证／模型凭据，不内嵌用户、画像、原文或当前活动副本，不写localStorage。原生回退仅dashboard/login，不提供全站人物目录或mail compose旁路。

构建输出backend/protected/modules/matcher-webapp/resources/app，入口index.html，显式manifest.json。宿主固定读取该manifest，递归校验静态imports、dynamicImports及JS/CSS路径在资源目录内，拒绝穿越和外部URL；字体／图片同源。构建桥frontend/integration/、首页适配frontend/首页/integration/；保留原组件，每个文档仅一份相容React，不拼多个Next运行时。

最小薄片真实GET /me成功后独立读current-event：401为登录态，409 CURRENT_EVENT_REQUIRED为尚未选择活动，403／上下文冲突清旧投影；same-origin credentials和窄DTO校验，不造假用户或示例卡片，不自动导入、选活动、调用模型或写社交。uiEnabled=false使新UI路由明确404，撤回新导航后保留原生入口；不调用destructive disable/remove，不停隐私保护层或删数据。

## 8. 验证与交付边界

N03验构建、资源／字体、深链、未登录401和CSRF负例；已登录正向读取及真实双登录随N04验收。N05之后才推进画像和社交依赖；不能用N01空库、原生登录页或SMTP235替代正向业务证据。新旧UI均必须守住原生目录／Mail搜索不得成为全站人物发现旁路的规则。

每批单写者维护限定模块，集成人维护共享API、迁移顺序和lock；不纳入并发认证／推荐／前端外部改动。隔离验证首次／重复迁移、权限、并发、恢复与UI撤回，优先开关回退，不盲目卸载数据所有者。本文只做文档链接、源码锚点、结构和合同核对；真实业务测试由对应批次补回执。状态／提交由[实施记录](03_实施记录.md)登记；必需认证、群聊、讨论或真实推荐任一未验收，仍须声明“最低闭环未完成”。
