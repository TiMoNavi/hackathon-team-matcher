# matcher-chat 0.3.0 隔离私聊读取、消息与附件

本目录包含 C04 读取、T1/T2 入口适配、C05-A 既有受管好友私聊文字发送及 C05-B 私有附件实现，**发送与附件默认关闭，不表示 C04/C05 完整完成或允许生产启用**。N04/N05 旧阻塞已由[新交接](../../../../docs/睡前全自动运行/10_聊天C04前置交接_20261112.md)解除；真实数据库、HTTP、并发及旧入口验收由主集成人另记。群、讨论、真实姓名/头像投影未开放。C05-B 依赖原生 File/StorageManager 的中性存储读写前置事件补丁；补丁由主集成人独占制作，不能省略后仍宣称完整保护。

本批遵循[聊天实施合同](../../../../docs/群聊模块升级/03_C01_聊天实施合同.md)、[真实接线计划](../../../../docs/群聊模块升级/07_真实接线推进计划.md)、[共享契约](../../../../docs/共享数据与接口契约.md)与项目 architecture-patterns Skill。原生 mail、好友、Space、想法绑定继续拥有各自事实。本目录没有当前活动选择器、好友状态表、消息正文镜像或邀请用例。UI 关闭不解除受管对象保护，不得以禁用原生 mail 回退。

## C05-B 私有附件

attachmentsEnabled=false 属性与同名持久设置双闸控制新上传和绑定；还要求发送、读取、附件 InnoDB schema 及原生存储保护就绪。Module::attachments(viewerId) 返回纯应用边界 ChatAttachments，经 AttachmentRepository 端口调用 SQL/原生存储适配。AttachmentLifecycle 管理无 SQL 的永久键、暂存状态、期限和配额规则。迁移 m261113_010000_chat_attachments 只保存原生 file 引用、所有者、会话、指纹及状态，不保存文件或消息正文副本。

本批实施选择为单文件 5 MiB、单消息最多 3 件、固定 24 小时暂存；JPEG/PNG/PDF/UTF-8 TXT。文件名 1–180 UTF-8 字节，拒绝路径、Cc/Cf、空白名及点目录，扩展名与实际字节检测匹配；客户端 MIME 不作为依据。图片检查类型/签名/尾标记和 4000 万像素上限，PDF 检查签名与 EOF，TXT 检查 UTF-8 和控制字符。此边界不是恶意软件扫描或完整 PDF 内容审计，下载始终强制 attachment。

| 操作 | 合同 |
|---|---|
| 上传 | POST /api/v1/conversations/{id}/attachments，multipart 仅 client_upload_id 小写 UUIDv4 与一个 file；201 新建、200 同键重放 |
| 上传成功 | data={attachment,client_upload_id,replayed,expires_at}，meta={request_id}；expires_at 为 UTC |
| 取消 | DELETE /api/v1/conversations/{id}/attachments/{uuid}，无正文；200 data={attachment_id,state:cancelled/expired}；已绑定 409 |
| 下载 | GET /api/v1/conversations/{id}/attachments/{uuid}/download；当前 session、读授权、历史范围及当前关联均验证；仅原文件，拒绝 token/variant/inline/Range |
| Attachment DTO | {id,name,mime,size,download_path}，不含 native file id/GUID/token；路径仅固定同源插件下载地址 |
| 发送扩展 | 原 JSON 增加可选 attachment_ids，有序、去重、最多 3 个 UUID；body 仍为 string，只有存在附件才允许空字符串 |
| 纯附件 | 明确 Message.kind=attachment,body=null,attachments=[...]；有文字附件仍 kind=text，deleted 不返回附件 |
| 能力 | context 可选 attachments={upload_enabled,download_enabled,max_file_bytes,max_files_per_message,allowed_mime_types,staging_ttl_seconds}；旧缺失视为关闭 |
| 配额 | 每用户跨会话最多 20 个有效 uploading/staged（自然最多 100 MiB）；滚动 60 秒最多 20 次成功新上传，重放与失败不计、取消不退历史速率 |
| 错误 | 领域输入422；超大413；类型415；错 owner/会话404；绑定/异载荷409；过期或取消键重放410；限流429+正 Retry-After；依赖503 |

上传键永久唯一范围为 conversation+owner+client_upload_id；同键的文件名、检测 MIME、字节数和 SHA-256 必须一致。绑定只允许当前发送者在该会话的有效 staged 文件；有序附件 ID 参与发送 payload hash，原有纯文字 hash 保持不变。已绑定上传重放不受暂存 TTL 影响；发送重放仍返回当前获准消息投影，删除墓碑不会重生附件。

上传先在独立事务持久登记 uploading 与私有原生 File，再写原生 storage，验证字节和 hash 后在第二事务改 staged；崩溃/SQL 完成失败最多留下可恢复的登记记录和受保护字节。同 key 显式重试复用原 File；只有最终成功才写 uploaded_at/计速率。取消/到期先持久墓碑，再删字节和原生 file；删除失败不恢复授权，cleaned_at 保持空供重试。绑定与 native message_entry、序号和永久 receipt 同事务提交，失败回滚后仍为原 staged 文件。

新上传前显式回收本人到期暂存；没有自动后台定时器。运维可运行 yii chat-attachment/cleanup --limit=100，每批最多100条，系统路径也回收已禁用/已删除上传者的终态未绑定记录。取消即使已失去会话发送资格也仅允许启用的本人清理同会话暂存；已经绑定内容不由暂存清理删除。绑定附件下载沿用当前历史读取资格，解除好友或屏蔽仅关闭本批新发送/新上传，不冒造新的历史撤权规则；成员/账号/准入实际撤权后下载拒绝。

原生 file 始终 public=0,standalone=1。暂存绑定 ProtectedAttachment（native canView/Edit/Delete 全拒绝），发出后绑定原生 MessageEntry；只有完整登记关联可通过 SqlState 同步，未知旧附件仍永久撤销准入。NativeGuard 按原生 id/GUID 与永久登记保护暂存、绑定、已回收墓碑，涵盖 native GUID/token、REST numeric-id、share-intend fileList 与旧新关联；存储前置事件阻断 File::beforeDelete 先删物理字节及 updateAttributes 绕过 AR 事件的问题。插件仅在已校验当前事务和具体 file id/GUID 的窄 scope 放行自己的原生存储操作。

本批只接受明确原生 StorageManager 与非 Webroot 的本地 private data mount，不接受公开 baseUrl、对象临时 URL 或未经审查的第三方 storage 类。下载在锁内读取最多5 MiB并核对 SHA-256 后才返回字节，设置真实 MIME、attachment、nosniff、private/no-store，不生成预览或公开资源。受信任 PHP 直接操作原始 fs/SQL、部署将私有目录另行映射为静态目录、已发出的历史外部 URL 不在这些事件的拦截能力内。

离线 attachments.php 验纯规则与内存端口，attachments-native.php 验实际 adapter seam，export-attachments.php 输出8份生产 Receipt/ChatSender/ChatReader 的合成合同供 TypeScript 对齐；不等于真实 HTTP/SQL 验收。isolated-attachments.php 只供主集成人固定 harness 的十个枚举模式，固定 d05b/e05b key，验证 nonce、旧完整 hash、新合成归属与数量上限，使用真实锁后 READY/continue 握手，禁止普通 php 执行或任意 ID/SQL/正文输入。

下列 C05-A 描述保留文字基线；其中“无附件/两字段”限定该批原始范围，当前附件扩展以本节为准。

## 当前装配合同

依赖 HumHub >=1.19.4、mail >=3.4.6，不依赖 matcher-webapp、认证插件或活动插件。主集成人独占固定聊天隔离实例、迁移、夹具与服务，不读取或复制其他实例账号/会话。模块设置：

- public bool integrationReady=false；public string cursorSecret=''；public string nativeTimeZone='UTC'（必须与原生 created_at 储存时区一致）。
- settings.readEnabled 默认关闭，仅明确 true/1/'1'/'true' 允许；isReadingEnabled() 同时要求 integrationReady、设置、至少32字节独立域游标密钥和完整 schema。HTTP 不提供开关修改接口。
- Module::reader(viewerId) 返回 ChatReader；Module::admission() 返回 DirectAdmission。主控在原生合成夹具事务提交后调用 acceptExistingDirect(messageId,exactPair,evidenceRef)，两个不同用户必须恰好对应当前全部原生成员，账号启用且会话没有附件。类型来源是显式准入决定，不能仅凭人数推断。该方法不拥有用户对唯一绑定，不注册管理 HTTP。
- revokeDirect(messageId,evidenceRef) 仅撤销聊天准入，不删除原生消息/成员；同 ID 不自动重新准入。evidenceRef 只存不含凭据的短引用。返回 conversation_id/type/status/version/last_seq/member_ids。
- 宿主在 ModuleAutoLoader 后、LanguageSelector 前安装 ChatRequestBootstrap，仅为本模块 PUT JSON 设置空 form body；rawBody 和 Yii CSRF 校验保留。模块 beforeRequest 有同样范围的兜底，但不能代替更早宿主解析阶段验证。
- 新增迁移 m261112_230000_chat_reading：matcher_chat_lock、conversation、entry_sequence、member、read_state、viewer_revision（均带 matcher_chat_ 前缀）。只存引用、序号、权限、哈希与时间元数据，不存正文/姓名/头像。迁移回退拒绝自动删除。

读取 API 为 GET /api/v1/conversations、GET /api/v1/conversations/{id}/messages、PUT /api/v1/conversations/{id}/read-state；新增 POST 同一 messages 路径提供单独受控文字发送。使用原生 session 和 Yii CSRF；GET 不标原生 seen。actor 只取启用原生身份，拒绝 sessionless REST 身份和受限 impersonation。可选 X-Matcher-Chat-Actor 仅为前端缓存预期，须是与 session 一致的规范正安全整数，否则401 SESSION_CHANGED；它永不授予身份。跨源 Origin/Sec-Fetch-Site 拒绝，响应 private,no-store。严格限制 query 与 JSON 字段，错误使用既有 envelope；上传/取消/下载按 C05-B 节开放；不提供通知偏好或管理端点。

SQL 适配仅准入 direct：sender 始终 unavailable，附件仅返回本模块已绑定获准摘要，permissions.invite/leave 均 false。permissions.send 仅在下述文字发送双闸及当前原生资格同时满足时为 true，读取和历史资格独立保留。没有获准姓名/头像投影时不返回假姓名；仍不代表完整私聊能力已经交付。

## C05-A 既有私聊文字发送

public bool sendEnabled=false 与 settings.sendEnabled 双闸默认关闭；isSendingEnabled() 还要求读取已开启、发送元数据与原生依赖具备 InnoDB/主键前置条件。Module::sender(viewerId) 返回 ChatSender。原生 friendship 的 enable 设置也必须显式启用；没有通过开关、依赖或当前关系检查时 GET 的 permissions.send=false。entryStatus 的聚合 capabilities 仍只声明当前入口读取覆盖，不能用于开启某个会话发送；客户端以该会话的服务端 context.permissions.send 为准。

发送范围只包括显式准入且 active、无附件、当前恰好两名原生成员的 direct。原生双方账号必须 enabled，user_friendship 必须存在且仅存在双向各一行，contentcontainer_blocked_users 的双方容器→对方 user_id 均无屏蔽。只读原生事实，不写好友/申请/屏蔽，不新建私聊、不拥有用户对唯一绑定，不推断 N08 的来源、关系代次或历史。已经可读的私聊不会因当前不是好友而失去历史读取；未来发送与历史读取分别授权。任何双向屏蔽记录均阻止本批发送，即使其他界面关闭了屏蔽操作入口。

资格在发送事务内使用当前 FOR UPDATE：设置、双方账号、两个屏蔽主键（含不存在键的范围锁）、双向好友行；屏蔽检查在好友检查之前，贴合原生 block 后取消好友的顺序。关系行 ID/时间、设置、账号、屏蔽事实指纹进入 viewer revision，能力变化不能静默保留旧 send=true。指纹不是伪造的 N08 代次；两次观察之间已完成且不可辨的原生变化不声称全部捕获。与原生写入的真实锁等待、死锁及撤销并发仍须独立 MySQL 验证；失败全事务回滚，不自动重试发送。

| 合同项 | 精确行为 |
|---|---|
| 请求 | POST /api/v1/conversations/{id}/messages，Content-Type application/json，仅 client_message_id 与 body 两个字段；最大原始 JSON 65536 字节 |
| client_message_id | 小写规范 UUIDv4；永久键为 conversation + sender + UUID，不同会话或发送者可使用同一 UUID |
| body | UTF-8 原文 1–4000 Unicode 码点，不 trim、不换行转换、不 Unicode 归一化；仅判空白，拒绝全 Unicode 空白、无效 UTF-8 和 Cc 控制字符（TAB/LF/CR 例外，C1 也拒绝） |
| 新发/重放 | 新发 201；同会话同发送者同键同原文 200/replayed=true；同键异原文 409 IDEMPOTENCY_CONFLICT；重放仍须当前读取和发送资格 |
| 成功 data | message（既有 Message DTO）、client_message_id、replayed、read_seq、unread_count、context（既有 context）；meta 保持 request_id |
| 限流 | 每发送者所有会话合计滚动 60 秒最多 60 条成功新消息；合法重放不计额，事务失败不耗额；429 RATE_LIMITED、Retry-After 正整秒，details 仍为空数组 |
| 已读 | 返回事务内本人现有 read_seq/unread_count；发送不自动推进插件 read-state，不写原生 last_viewed，不推断对方已读 |
| 错误 | 格式 422 INVALID_CLIENT_MESSAGE_ID/INVALID_MESSAGE_BODY；当前发送资格不足 403 SEND_FORBIDDEN；不可读 404 CONVERSATION_UNAVAILABLE；发送关闭/依赖不可用 503 CHAT_SEND_UNAVAILABLE；其他身份/CSRF/同源错误沿既有边界 |

永久幂等承诺消息身份唯一，不保存旧正文快照。200 重放先校验请求原文 hash，再返回该消息当前获准投影；后续编辑返回当前文本，删除返回 body=null 的墓碑，不能借旧 key 恢复已删除内容或姓名。首次 201 必须精确往返本次原文；客户端不可把合法的当前重放投影误判为未知发送结果。

迁移 m261112_235000_chat_sending 新增 matcher_chat_send_receipt：主键 message_id/user_id/client_message_id，entry_id 唯一索引及 user_id/created_at 配额索引。只保存正文 SHA-256、原生 entry 引用、seq、提交时间；没有正文副本、TTL 清理或删除回执的回退。正文仍唯一存放于原生 message_entry.content，写前使用 HTML 实体转义；现有纯文本投影能精确还原字面 HTML、实体、Markdown、CRLF、引号、emoji 与前后空白。

SqlSendStore 在现有 SqlReadStore 锁事务及业务 savepoint 内写原生 message_entry 的作者/审计时间，更新 message.updated_at/updated_by，同步 seq，写永久 receipt；末端重新检查真实授权。全局 chat mutex 与唯一键共同串行化本插件的同键请求。它是已授权窄 SQL 适配，不绕过请求授权，也不关闭 NativeGuard；所有原生旧写仍被守卫拒绝。未调用 ReplyForm、MessageEntry::save/notify、RichText::postProcess、file attach 或邮件/live/push，从而不触发原生事务前通知与富文本副作用。提交后只失效原生参与者未读计数缓存，缓存失败依赖原生过期，不把已提交消息伪装成失败或重复发送。

本批没有通知交付承诺，也没有发送者姓名/头像、输入提示、对方在线/已读、附件、编辑/删除、群或新建空私聊能力。已有原生非受管聊天规则保持原职责；N08 正式来源/唯一绑定/关系代次交接仍待完成。暂停入口/UI 与关闭业务发送仍分别控制，服务器不相信客户端“已确认”字段或模型声称同意。

## T1/T2 入口适配

入口接管由 public bool entryTakeoverEnabled=false 与 settings.entryTakeoverEnabled 两道闸控制；后者只接受 true/1/'1'/'true'。安装文件、打开读取或打开 UI 均不自动开启接管。这个开关只选择已有受管用户的导航，不准入会话，不开放发送，不删除或禁用 mail。开关关闭后的 native 状态不表示受管数据已经恢复原生读写；既有保护继续存在。

Module::EVENT_ENTRY_READINESS 固定为 entryReadiness；EntryTakeoverEvent 位于 adapters/http，构造参数 viewerId 是 readonly 正整数，uiReady 默认 false。UI 宿主只报告当前身份、开关与实际资源就绪，不能提供跳转 URL 或授权。业务插件不依赖 UI 类。后端在自身 beforeRequest/beforeAction 的 guard 前统一决定导航，不依赖 UI 与 guard 事件注册的先后顺序。

Module::entryStatus(int viewerId,bool uiReady) 固定返回 enabled、state、list_url、coverage、capabilities。state 为 native/takeover/paused/unsupported_coverage；list_url 仅 takeover 时返回固定同源 /matcher/chat（允许受信任站点 baseUrl），其余为 null。capabilities 为 read/send/group/attachments 四个布尔，只有 takeover 的 read 为 true，其余能力关闭。调用只接受当前启用原生 session 的本人，并检查 impersonation.canAccessPrivateContent；依赖或身份失败返回 paused，不抛错使菜单所在页面失效。

coverage={native_total,managed_total,unmanaged_total,revoked_total}：前三项按当前原生成员关系计数，native_total=managed_total+unmanaged_total；revoked_total 是该用户当前或历史受管关联中的已撤销数，可能包含原生成员关系已移除的记录。撤销属于受管保护事实，不按“未管理”恢复权限。统计在真实锁事务内重新同步准入；就绪状态另外调用真实 ChatReader 列表授权。任何未管原生会话都会使该受影响用户的接管变为 unsupported_coverage，不自动准入，不把子集列表宣称完整收件箱。新加入未管关系会在下次状态/导航检查时暂停。未知群、附件或其他依赖失败同样不扩大权限。

本批暂停明确限于原生导航与新页面装配，API 业务授权保持独立。entryTakeoverEnabled/UI 关闭或变为 mixed 不自动撤销 readEnabled；已打开页面仍可在 readEnabled 开启且真实授权有效时读取获准 managed 会话及更新本人已读，实际撤权仍由 reader 拒绝。当前不声称“所有请求即时暂停”，也未新增暂停错误 DTO 或以 UI 故障伪造业务撤权。需要停用业务读取时使用现有 readEnabled；这是与入口接管不同的开关。

| 原生路由 | 本批行为 |
|---|---|
| GET mail、mail/mail、mail/mail/index、mail/inbox、mail/inbox/index | 仅受管、完整覆盖、有效身份且 UI/读取/Poll 适配就绪时 302 到固定列表；可选规范 id 先走详情授权后到固定深链 |
| GET mail/mail/show?id=… | 在原生 actionShow 调用 seen() 前截获；真实 reader 验权后 302 到 /matcher/chat/conversations/{id}；撤权/外人/不存在不跳转 |
| mixed 用户的上述 GET | 返回 503 和 unsupported_coverage，不静默隐藏未管会话，不声称已有安全原生 mixed 路径 |
| UI/读取/适配不可用 | 返回 503/paused，保护保留，不放开原生入口 |
| POST/PUT/PATCH/DELETE/HEAD 等，及 reply/seen/create/编辑/邀请/离开 | 不重定向、不重放；已有受管旧写保护继续拒绝 |
| load-more/update、列表碎片、计数、通知、搜索/API/文件 | 不将数据请求重定向为 HTML；沿独立保护，不因导航成功而放行 |
| 未涉及任何受管会话的用户 | 保留其原生入口；指向受管对象仍拒绝 |

已登记入口允许忽略 returnUrl 等无关参数，但跳转仅拼接经过验证的会话 ID；不使用输入 URL，也不使用 307/308。受管且 UI 就绪不构成正文授权，每个导航仍由原生 session、真实 reader 与目标页面再次验权。导航本身不更新原生 seen 或插件 read-state。边界检查允许实际身份和权限变化后返回不可用，不承诺跨两个 HTTP 请求保留同一授权快照。

Poll 适配由本模块 GuardedPollController 继承原生 PollController，通过 checkVisibility 在 getData 前逐项处理。只在 controllerMap.poll 为空或精确原生类时装配，不覆盖第三方/自定义配置；重复装配幂等。受影响用户的全部原生 mail live 事件均过滤，因为 NewUserMessage/UserMessageDeleted 即使关联未管会话也包含全收件箱 count。已删除目标保留元数据关联检查；未知 mail 子类按继承链识别并拒绝未知投影。非 mail 事件直接保留，聊天 schema 故障也不影响同次 poll 的非聊天事件。实际路由为 /live/poll；无关 live 路由不再整面封锁。

接管就绪仅支持当前已审的 Poll driver；第三方 controllerMap 冲突或 Push/Mercure 均 paused，不替换 driver、不宣称这些路径受保护。发生 poll map 冲突时，受管用户的未适配原生 poll 仍拒绝，属于未支持安装条件，不是已验证的无损兼容。第三方事件、主动 notify、邮件、Push/FCM 等残余风险见下节，Poll 过滤不等于所有通知都已获授权。

## 原生持久化边界

SqlState 在 MySQL/InnoDB 中持有独立 chat 锁行，以 REPEATABLE READ + 当前 FOR UPDATE 锁定原生 message、UserMessage 范围、账户和 entries，再读写聊天元数据。范围 next-key 锁用于阻止并发成员/消息插入幻读，不能把普通快照当锁。每个 viewer 最多装配512个已准入会话，每会话同步最多10000条；超过明确503等待专门迁移，不静默截断历史。

首次按稳定 native entry id 分配会话内 seq；后续新 entry 追加，不复用删掉的seq。删除保留墓碑，旧正文不复制。单纯追加只更新 last_seq，不推进权限版本；修改既有正文、删除和标题变化会推进版本与 viewer revision，空增量同样通知客户端清缓存。当前原生成员不再恰好匹配、成员创建指纹变化、账号失效或出现未支持附件时，准入永久撤销。对原生 User 的状态/删除事件也保守撤销，避免正常事件路径的停用后恢复复活旧准入。

同一外层锁事务先同步授权与持久 revision，再设 savepoint 执行业务读取/已读。业务404/409/422只回滚本次已读子段，提交已经发现的撤销；不会因旧 cursor 失败撤回权限失效记录。未处理错误回滚整个事务并拒绝输出。末端再次读完整 grant/原生成员和版本。读取 observed revoked 之后重新加回原生成员不能恢复旧准入。真实重叠事务和死锁行为必须由隔离验收证明，离线测试不等于 SQL 并发验收。

## 保守拒绝与未完成保护

| 入口 | 当前隔离行为 |
|---|---|
| 受管对象原生 mail HTML/写动作 | 除上述 opt-in 完整覆盖的已验权 GET 导航外仍拒绝；非受管 show/edit-title 也会混全局 count/widget，mixed 不直接放行。无害 id、数组和 MySQL 宽松数字形式不能豁免 |
| mail REST | 只要存在任何受管记录，就拒绝整个 mail REST；不能依赖其认证前的旧 session actor |
| 原生搜索/通知下拉/live | 受管用户的 mail 元搜索、下拉继续拒绝/抑制；已适配 Poll 仅过滤 mail 事件，保留非聊天事件；其他 driver/映射未完成 |
| 文件入口 | beforeRequest 先 resolve 路由，在 DownloadAction::init 和 token 解析前检查 managed 文件；文件 guid 数组/非规范值拒绝，controller 事件再复核。首次准入仍拒绝未知旧附件；新登记附件按 C05-B 合同开放 |
| 原生模型写 | Message/AbstractMessageEntry/UserMessage/File 的 before 事件阻止受管对象未覆盖修改；API/readEnabled/UI 开关关闭后仍保护 |
| 业务模块撤回 | 只要有受管记录或 schema 不完整，Module.disable 拒绝；不允许卸载保护留下原生旁路 |

这些拒绝**不代表原生兼容完成**。受管用户原生合法聊天回退尚未恢复，不能宣称“撤UI后全部原生读写正常”。不受管用户访问不受管 web 会话保持原生；其指向受管对象也拒绝。beforeRequest/beforeAction 先按相关路由筛选，再读取聊天 schema；非聊天页面、非 mail 搜索、普通文件和非聊天 live 不因聊天元数据故障而整体返回 503。不能把任意页面的 guid 查询参数当作聊天文件入口。原生 NotificationInbox 在保护依赖失败时只停止该聊天 widget。

仍未覆盖或未证明的路径必须保留：直接 updateAll/deleteAll/手写 SQL 绕过 AR 事件，尤其两次读取之间的 A→B→A 原生状态变更；主动构造 MessageNotification 或已在途邮件/推送；第三方自定义控制器/模型读取；先取得的外部临时文件URL；绕过原生 File/StorageManager 前置事件的直接 filesystem 操作；native 写入在显式准入前已开始的竞态。隔离夹具可受控造漂移测试，但不能把漂移检测等同事件路径全面保护。C05-B 中性原生存储读写补丁与真实回执必须同时保留，生产开关仍默认关闭。

## 分层与真实接入边界

- domain 定义显式 direct/group/discussion、当前授权投影、成员 generation 与 join_seq、消息安全文本、分页参数和五个端口。
- application/ChatReader 编排获准列表、历史/增量读取与本人 read-state；只依赖 domain。没有 Yii、ActiveRecord、HTTP、文件或时钟全局依赖。
- adapters/security/HmacCursorCodec 是独立 HMAC-SHA256 游标实现，密钥和 Clock 由外部注入；未选择或读取生产密钥。
- adapters/memory 仅保存本进程合成对象，模拟顺序读取、授权变化与 read-state 回滚。seed 方法是测试装配，不是创建/发送/邀请产品能力。
- tests/run.php 与 export-contract.php 的内核 autoload 不加载 HumHub/vendor/config；export-contract.php 从实际用例生成合成 DTO，只有 stdout JSON，不保存聊天记录。native.php 加载 vendor/Yii 类但不启动应用、不连接数据库；isolated-sql.php 则仅经固定隔离 harness 启动应用并使用真实数据库。所有测试人物和消息均为明确虚构数据。

SqlReadStore 同时实现 AccessReader、ReadRepository 与 ConsistencyBoundary；C04-P 内存适配继续保留。N08/N09 资格与唯一绑定尚未接入，不为其写入和群讨论授予能力。应用末端再次读取完整 grant、会话和 actor revision，不能只依赖版本数字。内存顺序测试和模拟 interleaving **不证明 SQL 并发正确**。

AccessReader.visibleIds 只返回当前可读会话，按原生 id 降序稳定排序，至多 limit+1；不能以全站扫描结果冒充本人列表。actor revision 必须覆盖可读范围、当前 native membership、业务资格及可见 sender 投影的变化，并作为 authorization_revision 下发于列表和消息/已读 context。即使 after_seq 返回空页，前端也必须发现 revision 变化并清除旧投影，不能因对象 authorization_version 未变保留已隐藏姓名。sender 读取必须返回合法来源下的最小投影；不可用时没有旧姓名/头像/user_id。Discussion 的原生会话、Space 与 idea_activity_id 必须一致；普通私聊无需当前活动才能读取，合法历史可读和未来 send 分开决定。未知旧会话不推断类型，不伪造加入历史。

AccessReader.revision 是 viewer 维度持久、单调递增的正 JavaScript 安全整数，覆盖授权和投影变化。SqlState 已将当前 direct 准入范围的 revision 与 scope_hash 存入 matcher_chat_viewer_revision，并在同一锁事务中同步；内存适配器仍只验证单次测试装配内的单调推进。持久化实现已存在，完整 C04 验收尚未通过，真实验证范围以主集成人回执为准。真实适配器不得因进程重启、缓存淘汰或存储恢复而回退；前端在同一受信会话中保留最高已见 revision，下限以下的并发旧响应必须拒绝。若必须恢复到较低版本，需要先清除会话，再按重新建立受信身份与版本域的策略另行验收，不能静默降低当前会话的版本下限。

## 读取与已读不变量

所有 JSON id、seq、generation、version 均限制为 JavaScript 安全整数；id/version/generation 为正，序号起点与计数可为 0。SafeInteger.native 在转换原生 BIGINT/DECIMAL 字符串前先校验，超限返回 NATIVE_INTEGER_UNSUPPORTED/503，绝不截断、四舍五入或转 float。

群与讨论仅返回 seq > join_seq，active + 真实原生成员 + 业务读取资格必须同时有效。受邀未接受和离开均不可读，重入使用新的 generation 与起点，旧 generation 的 read-state 不复用。详情无权和不存在统一 CONVERSATION_UNAVAILABLE/404；未取得资格前不取正文。每个获准序号独立于全局 message_entry.id，空洞不代表消息，删除必须保留 seq 墓碑。

初始历史取最新 limit 条，再按 seq 升序返回；cursor 只向旧页。after_seq 升序补拉，与 cursor 互斥。默认 limit=24，最大 48，返回页底层最多取49条判定 has_more（原生同步上限另列）。列表和历史 GET 不标 seen。NativeProjection 将原生HTML保守投影为UTF-8纯文本，移除执行型标签内容并保留换行，不截断旧正文、不把未来发送4000码点限额用于删截历史；未登记的空/纯附件内容拒绝；本模块登记纯附件使用显式 attachment kind，仅返回当前获准摘要。

有效 read_seq 为 max(本 generation 已存位置, join_seq)。0 与 join_seq 是无副作用基准；其他提交位置以及仓储返回的已存/合并位置都必须对应当前获准的真实消息/墓碑，空洞和超前位置拒绝。read-state 只能单调前进；本进程模拟边界在末端撤权或坏适配器异常时回滚写入。未读逐条计数获准范围内原生 type=0 的文字或附件、非本人且 seq>有效 read_seq 的消息；不计 system/deleted，也不用 last_seq-read_seq 相减。

## DTO v1

成功 envelope 为 data + meta={request_id}。错误为 error={code,message,retryable,details} + meta，其中 details 保持空数组兼容。API控制器的session/CSRF/同源和依赖边界须独立HTTP验收；没有请求限流已交付的宣称。

| DTO | 完整字段 |
|---|---|
| ConversationSummary | id,type,title:string/null,version,last_message:MessageSummary/null,unread_count,permissions |
| MessageSummary | id,seq,kind:text/attachment/system/deleted,sender,body:string/null,created_at |
| Message | MessageSummary + conversation_id,attachments:获准摘要数组 |
| sender | {status:available,user_id,display_name,avatar_ref:string/null} 或 {status:unavailable} |
| permissions | read,send,invite,leave 四个明确 bool；成功读取的 read=true |
| context | conversation_id,type,version,authorization_version,authorization_revision,membership_generation,history_after_seq,permissions |
| 会话列表 data | items,next_cursor:string/null,has_more:bool,authorization_revision |
| 消息页 data | items,next_cursor,has_more,read_seq,unread_count,context |
| 已读 data | conversation_id,read_seq,unread_count,context |

仅 discussion 的 summary/context 额外带获准 space_id 和 idea_activity_id，其他类型不带该字段。deleted 的 body=null 且 sender=unavailable；attachment 的 body=null 且至少一个附件；text/system 的 body 为文本。created_at 使用 UTC 的 YYYY-MM-DDTHH:mm:ssZ 并校验真实日期；avatar_ref 是不透明引用，不能直接当任意 URL。

列表/初始或旧历史页 has_more=true 当且仅当 next_cursor 非空。**增量页 next_cursor 恒 null，has_more 可为 true**，客户端使用最后返回 seq 显式继续 after_seq，不能拿旧页 cursor 当前向翻页。没有自动重试/循环请求契约。

游标固定有效 900 秒，绑定 viewer、资源、actor revision、limit、排序与位置；消息游标另绑定 conversation、authorization_version、generation、历史起点、类型和讨论的 Space/idea_activity_id。签名、时间、15 分钟最大 TTL 和精确作用域全部校验。过期410、作用域变更409、格式/签名无效422；旧游标不续签，不作为可绕过当前成员校验的授权票据。

## 独立验证

在项目根目录运行（系统 PHP 不必配置）：

    backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-chat/tests/run.php
    backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-chat/tests/export-contract.php
    backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-chat/tests/native.php
    backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-chat/tests/takeover.php
    backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-chat/tests/send.php
    backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-chat/tests/send-native.php
    backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-chat/tests/attachments.php
    backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-chat/tests/attachments-native.php
    backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-chat/tests/export-attachments.php

run.php 覆盖真实用例输出、合法/拒绝成员、重复代次、join 前后、私聊历史/send 分离、摘要/头像撤权、空列表/空会话、seq 空洞、自己的/system/deleted 未读排除、分页/增量、HMAC 篡改/过期/跨对象/未来时间/超 TTL、末端撤权、已读单调和坏仓储位置回滚。输出是计数汇总，不打印密钥、配置或用户资料。

export-contract.php 输出 schema_version=1、kind=matcher-chat-c04p-synthetic-contract、cases 数组；每项有 name、kind、status、完整 payload。场景为 conversations/history/increment/read-state/error，供主 agent 的 PHP→TypeScript 解析交叉验证。fixture 由用例实时计算，不能当生产数据或真实 HTTP 验收回执。

native.php 仅使用无连接的 SQL seam 验 guard、纯文本/时间投影、actor预期头和JSON请求边界；0数据库连接/HTTP请求，不代替真实SQL/HTTP回执。既有run.php保留228条内核检查，原“目录不可安装”五条断言已替换为读取用例不含send/invite/upload和不依赖外层的检查；不改写旧C04-P报告。

takeover.php 验双闸、冻结状态字段、完整/混合/撤销覆盖语义、规范 ID 与固定导航、所有旧非 GET 不重放、mail 事件及继承链/墓碑拒绝、非 mail 不触发聊天 SQL、真实 Poll 子类的依赖失败隔离、controllerMap 冲突与幂等、非聊天路由先行排除。使用未启动的应用测试替身与无连接 SQL seam，0数据库连接/HTTP，不冒充真实入口、恢复、并发切换或浏览器验收。

isolated-sql.php 只能由主集成人用 deploy/chat 的固定 harness PHP 命令执行；普通 php -n 缺少网络禁用等前置条件会被 bootstrap 拒绝。它只接受一个枚举参数 snapshot、read-low-b、read-high-b、read-high-b-hold、append-once 或 revoke-empty，不接受 ID、SQL、正文、路径、凭据或等待时长。先验证固定数据库与 fixture nonce，再核对三名虚构用户、三个会话、成员及七条原生合成消息的精确归属。snapshot 只同步读取；low/high 固定推进 B 至 1/3，既存位置大于 3 时拒绝，无重置。high-hold 在真实读取事务内固定持锁 750ms，并只向 stderr 输出固定就绪标记。

append-once 只为已验证的 history 插入固定第八条原生合成消息，以 sql_probe={spec:chat-c04-isolated-sql-v1,append_entry_id:实际原生ID} 记录幂等归属，保留原 entries 七项列表；真实增量读取必须验证 seq8 与权限版本、revision、read-state 不变。revoke-empty 只撤销已验证的 empty 准入，验证错误 cursor 后 revision 观察仍持久、旧 cursor 失效、双方读取被拒绝且原生消息/成员不变。两模式修改隔离夹具，不是产品发送/管理接口；不会重新准入或删除原生数据。stdout 仅输出安全计数、布尔和固定检查名，不能据脚本存在声称真实验收已经通过。

send.php 使用内存适配验证真实 ChatSender 用例的原文、消息回执、同会话/发送者永久幂等范围、重放先授权、配额、失败/末端撤权回滚；send-native.php 运行实际资格与回执/配额 SQL seam、锁键/方向、HTML 往返和无事务前通知的静态负例，均无 DB/HTTP。这些检查不证明真实 SQL 锁等待、并发幂等、持久恢复、网络响应丢失或双用户收发，必须由主集成人另行验收。

isolated-send.php 是主集成人独占执行的固定 C05 探针，只接收 hold-send/dedupe-send/changed-send/delete-friend/hold-unfriend/hold-block/try-send/rollback-send/quota-rollback 枚举。固定 bootstrap 和 _chat_c05_fixture nonce/两个合成账号/唯一准入会话都验证后才执行；不接受 ID、正文、SQL、凭据或时间参数。竞争进程在实际边界前输出固定 ATTEMPTING 标记；持锁进程取得真实锁后输出 READY 并等待精确 continue 换行，固定30秒超时，不靠 sleep 宣称重叠。关系变更仅限拥有的合成两人且由 root 恢复；rollback-send 验永久回执之后的整体回滚，quota-rollback 的最多60条真实临时原生 entry/receipt 与配额拒绝全部回滚，不遗留虚构引用。不执行该文件不能宣称真实并发/配额已经通过。

C05-A/C05-B 的窄文字与附件代码存在不等于完整 C05 交付；通知偏好和 C07 群邀请/接受/退出仍未实现。C04/C05 完整验收及旧入口收敛仍受本页明确缺口限制，不能据源码或隔离安装把其标记为全部 done。
