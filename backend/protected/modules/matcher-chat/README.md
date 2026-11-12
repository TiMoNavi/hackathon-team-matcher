# matcher-chat C04-P 读取内核准备

本目录仅交付可独立测试的 PHP 领域、应用用例、端口与内存适配器。**不是可安装的 HumHub 模块，不是已上线聊天 API**。当前无 Module.php、config.php、module.json、controllers、migration 或 HTTP 路由，不访问原生配置、数据库、真实聊天、邮箱、OAuth、网络或模型。C04 的真实 N04/N05 前置仍未完成，本内核不会解除该闸门。

本批遵循[聊天实施合同](../../../../docs/群聊模块升级/03_C01_聊天实施合同.md)、[共享契约](../../../../docs/共享数据与接口契约.md)与项目 architecture-patterns Skill。原生 mail、好友、Space、想法绑定继续拥有各自事实。本目录没有当前活动选择器、好友状态表、消息正文镜像或发送/邀请用例，也没有安装后自动生效的机制。

## 分层与真实接入边界

- domain 定义显式 direct/group/discussion、当前授权投影、成员 generation 与 join_seq、消息安全文本、分页参数和五个端口。
- application/ChatReader 编排获准列表、历史/增量读取与本人 read-state；只依赖 domain。没有 Yii、ActiveRecord、HTTP、文件或时钟全局依赖。
- adapters/security/HmacCursorCodec 是独立 HMAC-SHA256 游标实现，密钥和 Clock 由外部注入；未选择或读取生产密钥。
- adapters/memory 仅保存本进程合成对象，模拟顺序读取、授权变化与 read-state 回滚。seed 方法是测试装配，不是创建/发送/邀请产品能力。
- tests 的 autoload 不加载 HumHub/vendor/config，所有人物和消息为明确虚构数据。export-contract.php 从实际用例生成合成 DTO，只有 stdout JSON，不保存聊天记录。

后续真实适配器必须同时实现 AccessReader、ReadRepository 与 ConsistencyBoundary 的约束。所有访问判断、原生 UserMessage 成员、N08/N09 业务资格、授权版本、消息读取与 read-state 写入必须处在同一可靠的锁/事务边界；应用末端再次读取完整 grant、会话和 actor revision，不能只依赖版本数字。普通数据库 repeatable-read 快照不等于能够阻止撤权竞态，生产锁范围、提交顺序及并发重试尚未实现/验证。内存顺序测试和模拟 interleaving **不证明 SQL 并发正确**。

AccessReader.visibleIds 只返回当前可读会话，按原生 id 降序稳定排序，至多 limit+1；不能以全站扫描结果冒充本人列表。actor revision 必须覆盖可读范围、当前 native membership、业务资格及可见 sender 投影的变化，并作为 authorization_revision 下发于列表和消息/已读 context。即使 after_seq 返回空页，前端也必须发现 revision 变化并清除旧投影，不能因对象 authorization_version 未变保留已隐藏姓名。sender 读取必须返回合法来源下的最小投影；不可用时没有旧姓名/头像/user_id。Discussion 的原生会话、Space 与 idea_activity_id 必须一致；普通私聊无需当前活动才能读取，合法历史可读和未来 send 分开决定。未知旧会话不推断类型，不伪造加入历史。

AccessReader.revision 是 viewer 维度持久、单调递增的正 JavaScript 安全整数，覆盖授权和投影变化。真实适配器不得因进程重启、缓存淘汰或存储恢复而回退；前端在同一受信会话中保留最高已见 revision，下限以下的并发旧响应必须拒绝。若必须恢复到较低版本，需要先清除会话，再按重新建立受信身份与版本域的策略另行验收，不能静默降低当前会话的版本下限。当前内存适配器仅验证单次测试装配内的单调推进，不代表持久化策略已经交付。

## 读取与已读不变量

所有 JSON id、seq、generation、version 均限制为 JavaScript 安全整数；id/version/generation 为正，序号起点与计数可为 0。SafeInteger.native 在转换原生 BIGINT/DECIMAL 字符串前先校验，超限返回 NATIVE_INTEGER_UNSUPPORTED/503，绝不截断、四舍五入或转 float。

群与讨论仅返回 seq > join_seq，active + 真实原生成员 + 业务读取资格必须同时有效。受邀未接受和离开均不可读，重入使用新的 generation 与起点，旧 generation 的 read-state 不复用。详情无权和不存在统一 CONVERSATION_UNAVAILABLE/404；未取得资格前不取正文。每个获准序号独立于全局 message_entry.id，空洞不代表消息，删除必须保留 seq 墓碑。

初始历史取最新 limit 条，再按 seq 升序返回；cursor 只向旧页。after_seq 升序补拉，与 cursor 互斥。默认 limit=24，最大 48，底层最多取 49 判定 has_more。列表和历史 GET 不标 seen。正文是原生适配器应提供的合法 UTF-8 安全文本，读取不截断旧正文、不把未来发送的 4000 码点上限用于删截历史；当前没有原生 HTML 转换适配器。attachments 固定为空数组，不伪造可下载文件、上传完成或附件资格。

有效 read_seq 为 max(本 generation 已存位置, join_seq)。0 与 join_seq 是无副作用基准；其他提交位置以及仓储返回的已存/合并位置都必须对应当前获准的真实消息/墓碑，空洞和超前位置拒绝。read-state 只能单调前进；本进程模拟边界在末端撤权或坏适配器异常时回滚写入。未读逐条计数获准范围内 kind=text、非本人且 seq>有效 read_seq 的消息；不计 system/deleted，也不用 last_seq-read_seq 相减。

## DTO v1（离线合同）

成功 envelope 为 data + meta={request_id}。错误为 error={code,message,retryable,details} + meta，其中 details 保持空数组兼容。当前没有 HTTP 适配器；401/CSRF/同源 session/限流/依赖就绪等宿主边界不能由本内核的单元测试替代。

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

run.php 覆盖真实用例输出、合法/拒绝成员、重复代次、join 前后、私聊历史/send 分离、摘要/头像撤权、空列表/空会话、seq 空洞、自己的/system/deleted 未读排除、分页/增量、HMAC 篡改/过期/跨对象/未来时间/超 TTL、末端撤权、已读单调和坏仓储位置回滚。输出是计数汇总，不打印密钥、配置或用户资料。

export-contract.php 输出 schema_version=1、kind=matcher-chat-c04p-synthetic-contract、cases 数组；每项有 name、kind、status、完整 payload。场景为 conversations/history/increment/read-state/error，供主 agent 的 PHP→TypeScript 解析交叉验证。fixture 由用例实时计算，不能当生产数据或真实 HTTP 验收回执。

真实接入仍需 N04/N05 闸门、原生持久化/授权适配、旧入口/REST/文件/通知保护、真实事务并发验收和 session+CSRF HTTP 控制器。C05 发送、附件及通知偏好和 C07 群邀请/接受/退出仍未实现；不要通过禁用或卸载原生 mail 替换界面。
