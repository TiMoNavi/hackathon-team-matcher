# matcher-chat C04 隔离读取适配

本目录在已完成的 C04-P 读取内核上增加 HumHub 0.1.0 模块、原生 MySQL 读取适配、引用/规则元数据迁移和三个 session API，**仅进入独立隔离验证，默认关闭，不表示 C04 完整完成或允许生产启用**。N04/N05 旧阻塞已由[新交接](../../../../docs/睡前全自动运行/10_聊天C04前置交接_20261112.md)解除；自己的真实数据库、HTTP、并发及旧入口验收由主集成人另记。发送、附件、群、讨论、真实姓名/头像投影均未开放。

本批遵循[聊天实施合同](../../../../docs/群聊模块升级/03_C01_聊天实施合同.md)、[真实接线计划](../../../../docs/群聊模块升级/07_真实接线推进计划.md)、[共享契约](../../../../docs/共享数据与接口契约.md)与项目 architecture-patterns Skill。原生 mail、好友、Space、想法绑定继续拥有各自事实。本目录没有当前活动选择器、好友状态表、消息正文镜像或发送/邀请用例。UI 关闭不解除受管对象保护，不得以禁用原生 mail 回退。

## 当前装配合同

依赖 HumHub >=1.19.4、mail >=3.4.6，不依赖 matcher-webapp、认证插件或活动插件。主集成人独占固定聊天隔离实例、迁移、夹具与服务，不读取或复制其他实例账号/会话。模块设置：

- public bool integrationReady=false；public string cursorSecret=''；public string nativeTimeZone='UTC'（必须与原生 created_at 储存时区一致）。
- settings.readEnabled 默认关闭，仅明确 true/1/'1'/'true' 允许；isReadingEnabled() 同时要求 integrationReady、设置、至少32字节独立域游标密钥和完整 schema。HTTP 不提供开关修改接口。
- Module::reader(viewerId) 返回 ChatReader；Module::admission() 返回 DirectAdmission。主控在原生合成夹具事务提交后调用 acceptExistingDirect(messageId,exactPair,evidenceRef)，两个不同用户必须恰好对应当前全部原生成员，账号启用且会话没有附件。类型来源是显式准入决定，不能仅凭人数推断。该方法不拥有用户对唯一绑定，不注册管理 HTTP。
- revokeDirect(messageId,evidenceRef) 仅撤销聊天准入，不删除原生消息/成员；同 ID 不自动重新准入。evidenceRef 只存不含凭据的短引用。返回 conversation_id/type/status/version/last_seq/member_ids。
- 宿主在 ModuleAutoLoader 后、LanguageSelector 前安装 ChatRequestBootstrap，仅为本模块 PUT JSON 设置空 form body；rawBody 和 Yii CSRF 校验保留。模块 beforeRequest 有同样范围的兜底，但不能代替更早宿主解析阶段验证。
- 新增迁移 m261112_230000_chat_reading：matcher_chat_lock、conversation、entry_sequence、member、read_state、viewer_revision（均带 matcher_chat_ 前缀）。只存引用、序号、权限、哈希与时间元数据，不存正文/姓名/头像。迁移回退拒绝自动删除。

API 仅 GET /api/v1/conversations、GET /api/v1/conversations/{id}/messages、PUT /api/v1/conversations/{id}/read-state。使用原生 session 和 Yii CSRF；GET 不标原生 seen。actor 只取启用原生身份，拒绝 sessionless REST 身份和受限 impersonation。可选 X-Matcher-Chat-Actor 仅为前端缓存预期，须是与 session 一致的规范正安全整数，否则401 SESSION_CHANGED；它永不授予身份。跨源 Origin/Sec-Fetch-Site 拒绝，响应 private,no-store。严格限制 query 与 JSON read_seq，错误使用既有 envelope；本批未提供发送、上传、通知偏好或管理端点。

SQL 适配仅准入 direct：sender 始终 unavailable，attachments=[]，permissions 的 send/invite/leave 均 false。这表示缺少获准画像/写入合同，不是假姓名，也不是已完成完整私聊读写。

## 原生持久化边界

SqlState 在 MySQL/InnoDB 中持有独立 chat 锁行，以 REPEATABLE READ + 当前 FOR UPDATE 锁定原生 message、UserMessage 范围、账户和 entries，再读写聊天元数据。范围 next-key 锁用于阻止并发成员/消息插入幻读，不能把普通快照当锁。每个 viewer 最多装配512个已准入会话，每会话同步最多10000条；超过明确503等待专门迁移，不静默截断历史。

首次按稳定 native entry id 分配会话内 seq；后续新 entry 追加，不复用删掉的seq。删除保留墓碑，旧正文不复制。单纯追加只更新 last_seq，不推进权限版本；修改既有正文、删除和标题变化会推进版本与 viewer revision，空增量同样通知客户端清缓存。当前原生成员不再恰好匹配、成员创建指纹变化、账号失效或出现未支持附件时，准入永久撤销。对原生 User 的状态/删除事件也保守撤销，避免正常事件路径的停用后恢复复活旧准入。

同一外层锁事务先同步授权与持久 revision，再设 savepoint 执行业务读取/已读。业务404/409/422只回滚本次已读子段，提交已经发现的撤销；不会因旧 cursor 失败撤回权限失效记录。未处理错误回滚整个事务并拒绝输出。末端再次读完整 grant/原生成员和版本。读取 observed revoked 之后重新加回原生成员不能恢复旧准入。真实重叠事务和死锁行为必须由隔离验收证明，离线测试不等于 SQL 并发验收。

## 保守拒绝与未完成保护

| 入口 | 当前隔离行为 |
|---|---|
| 受管对象原生 mail HTML/写动作 | 拒绝；受管用户的所有 mail web 动作均拒绝，因为非受管 show/edit-title 也会混全局 count/widget。无害 id、数组和 MySQL 宽松数字形式不能豁免 |
| mail REST | 只要存在任何受管记录，就拒绝整个 mail REST；不能依赖其认证前的旧 session actor |
| 原生搜索/通知下拉/live | 受管用户的 mail 元搜索、下拉及 live 请求拒绝/抑制；live 聚合限制也影响其非聊天即时通知，是生产阻塞项 |
| 文件入口 | beforeRequest 先 resolve 路由，在 DownloadAction::init 和 token 解析前检查 managed 文件；文件 guid 数组/非规范值拒绝，controller 事件再复核。无附件准入，附件能力未开放 |
| 原生模型写 | Message/AbstractMessageEntry/UserMessage/File 的 before 事件阻止受管对象未覆盖修改；API/readEnabled/UI 开关关闭后仍保护 |
| 业务模块撤回 | 只要有受管记录或 schema 不完整，Module.disable 拒绝；不允许卸载保护留下原生旁路 |

这些拒绝**不代表原生兼容完成**。受管用户原生合法聊天回退尚未恢复，不能宣称“撤UI后全部原生读写正常”。不受管用户访问不受管 web 会话保持原生；其指向受管对象也拒绝。

仍未覆盖或未证明的路径必须保留：直接 updateAll/deleteAll/手写 SQL 绕过 AR 事件，尤其两次读取之间的 A→B→A 原生状态变更；主动构造 MessageNotification 或已在途邮件/推送；第三方自定义控制器/模型读取；先取得的外部临时文件URL；File::beforeDelete 在父事件前删除物理文件，单个 AR hook 无法提前保护程序调用的存储副作用；native 写入在显式准入前已开始的竞态。隔离夹具可受控造漂移测试，但不能把漂移检测等同事件路径全面保护。无核心修改情况下需要后续窄适配/公共补丁及真实回执，生产开关必须保持关闭。

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

初始历史取最新 limit 条，再按 seq 升序返回；cursor 只向旧页。after_seq 升序补拉，与 cursor 互斥。默认 limit=24，最大 48，返回页底层最多取49条判定 has_more（原生同步上限另列）。列表和历史 GET 不标 seen。NativeProjection 将原生HTML保守投影为UTF-8纯文本，移除执行型标签内容并保留换行，不截断旧正文、不把未来发送4000码点限额用于删截历史；空/纯附件内容拒绝。attachments 固定为空数组，不伪造下载资格。

有效 read_seq 为 max(本 generation 已存位置, join_seq)。0 与 join_seq 是无副作用基准；其他提交位置以及仓储返回的已存/合并位置都必须对应当前获准的真实消息/墓碑，空洞和超前位置拒绝。read-state 只能单调前进；本进程模拟边界在末端撤权或坏适配器异常时回滚写入。未读逐条计数获准范围内 kind=text、非本人且 seq>有效 read_seq 的消息；不计 system/deleted，也不用 last_seq-read_seq 相减。

## DTO v1

成功 envelope 为 data + meta={request_id}。错误为 error={code,message,retryable,details} + meta，其中 details 保持空数组兼容。API控制器的session/CSRF/同源和依赖边界须独立HTTP验收；没有请求限流已交付的宣称。

| DTO | 完整字段 |
|---|---|
| ConversationSummary | id,type,title:string/null,version,last_message:MessageSummary/null,unread_count,permissions |
| MessageSummary | id,seq,kind:text/system/deleted,sender,body:string/null,created_at |
| Message | MessageSummary + conversation_id,attachments:[] |
| sender | {status:available,user_id,display_name,avatar_ref:string/null} 或 {status:unavailable} |
| permissions | read,send,invite,leave 四个明确 bool；成功读取的 read=true |
| context | conversation_id,type,version,authorization_version,authorization_revision,membership_generation,history_after_seq,permissions |
| 会话列表 data | items,next_cursor:string/null,has_more:bool,authorization_revision |
| 消息页 data | items,next_cursor,has_more,read_seq,unread_count,context |
| 已读 data | conversation_id,read_seq,unread_count,context |

仅 discussion 的 summary/context 额外带获准 space_id 和 idea_activity_id，其他类型不带该字段。deleted 的 body=null 且 sender=unavailable；其余 body 为文本。created_at 使用 UTC 的 YYYY-MM-DDTHH:mm:ssZ 并校验真实日期；avatar_ref 是不透明引用，不能直接当任意 URL。

列表/初始或旧历史页 has_more=true 当且仅当 next_cursor 非空。**增量页 next_cursor 恒 null，has_more 可为 true**，客户端使用最后返回 seq 显式继续 after_seq，不能拿旧页 cursor 当前向翻页。没有自动重试/循环请求契约。

游标固定有效 900 秒，绑定 viewer、资源、actor revision、limit、排序与位置；消息游标另绑定 conversation、authorization_version、generation、历史起点、类型和讨论的 Space/idea_activity_id。签名、时间、15 分钟最大 TTL 和精确作用域全部校验。过期410、作用域变更409、格式/签名无效422；旧游标不续签，不作为可绕过当前成员校验的授权票据。

## 独立验证

在项目根目录运行（系统 PHP 不必配置）：

    backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-chat/tests/run.php
    backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-chat/tests/export-contract.php
    backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-chat/tests/native.php

run.php 覆盖真实用例输出、合法/拒绝成员、重复代次、join 前后、私聊历史/send 分离、摘要/头像撤权、空列表/空会话、seq 空洞、自己的/system/deleted 未读排除、分页/增量、HMAC 篡改/过期/跨对象/未来时间/超 TTL、末端撤权、已读单调和坏仓储位置回滚。输出是计数汇总，不打印密钥、配置或用户资料。

export-contract.php 输出 schema_version=1、kind=matcher-chat-c04p-synthetic-contract、cases 数组；每项有 name、kind、status、完整 payload。场景为 conversations/history/increment/read-state/error，供主 agent 的 PHP→TypeScript 解析交叉验证。fixture 由用例实时计算，不能当生产数据或真实 HTTP 验收回执。

native.php 仅使用无连接的 SQL seam 验 guard、纯文本/时间投影、actor预期头和JSON请求边界；0数据库连接/HTTP请求，不代替真实SQL/HTTP回执。既有run.php保留228条内核检查，原“目录不可安装”五条断言已替换为读取用例不含send/invite/upload和不依赖外层的检查；不改写旧C04-P报告。

isolated-sql.php 只能由主集成人用 deploy/chat 的固定 harness PHP 命令执行；普通 php -n 缺少网络禁用等前置条件会被 bootstrap 拒绝。它只接受一个枚举参数 snapshot、read-low-b、read-high-b、read-high-b-hold、append-once 或 revoke-empty，不接受 ID、SQL、正文、路径、凭据或等待时长。先验证固定数据库与 fixture nonce，再核对三名虚构用户、三个会话、成员及七条原生合成消息的精确归属。snapshot 只同步读取；low/high 固定推进 B 至 1/3，既存位置大于 3 时拒绝，无重置。high-hold 在真实读取事务内固定持锁 750ms，并只向 stderr 输出固定就绪标记。

append-once 只为已验证的 history 插入固定第八条原生合成消息，以 sql_probe={spec:chat-c04-isolated-sql-v1,append_entry_id:实际原生ID} 记录幂等归属，保留原 entries 七项列表；真实增量读取必须验证 seq8 与权限版本、revision、read-state 不变。revoke-empty 只撤销已验证的 empty 准入，验证错误 cursor 后 revision 观察仍持久、旧 cursor 失效、双方读取被拒绝且原生消息/成员不变。两模式修改隔离夹具，不是产品发送/管理接口；不会重新准入或删除原生数据。stdout 仅输出安全计数、布尔和固定检查名，不能据脚本存在声称真实验收已经通过。

C05 发送、附件及通知偏好和 C07 群邀请/接受/退出仍未实现。C04完整验收及原生安全回退仍受本页明确缺口限制，不能据源码或隔离安装把其标记为全部done。
