# C07 普通群合同、动作状态与独立 HTTP 客户端

2026-11-13。C07-P 已提供未挂载的纯 TypeScript 合同和动作状态；C07-A1 新增独立 HTTP 客户端及后端七条普通群生命周期路由。后端 groupsEnabled 配置与持久开关均默认关闭，正式页面尚未挂载群操作。现有 ChatApi、client.ts 出口、direct-only 读取／发送／附件保护和前端生产资源保持原状。本文记录调用合同与离线验证，不代替集成人的真实 HTTP／数据库验收。

业务依据：[普通群合同](../../../docs/群聊模块升级/18_C07普通群与邀请合同.md)。当前首页、画像可调用的真实聊天能力和好友流程责任见[公共接口目录](../../../docs/群聊模块升级/12_首页画像通用社交与聊天接口.md)。运行环境是否已经开启群服务，以专项集成验收和服务端当前配置为准。

## 模块入口

| 入口 | 职责 | 副作用 |
|---|---|---|
| `src/chat/group-contracts.ts` | parseGroup / parseGroupInvitation / parseGroupMembership / parseGroupReceipt；严格解析 DTO | 无 |
| 同上 | parseGroupActionInput / parseGroupCommand / buildGroupCommand；校验表单输入、生成严格请求正文 | 无 |
| 同上 | groupActionCodec；核对命令与成功回执，只给刷新目标 | 无 |
| `src/chat/group-action-state.ts` | createGroupActionState；显式操作、同键重试、账号与作用域隔离 | 无网络、存储、导航或成员写入 |
| `src/chat/group-http.ts` | createGroupApi；七个固定同源请求、会话匹配与回执校验 | 仅明确调用方法时发送请求；构造无 I/O |

合同和状态模块不依赖 React、DOM、宿主或 HTTP。HTTP 适配器只依赖这些合同和既有 ChatApiError／错误 envelope 解析，不引入页面、存储、好友申请或消息能力。生产构建保留 `.js` 引用；Node 离线测试安装限定 TypeScript resolver，没有扩大既有测试 helper 或运行入口。

## 命令映射

每个请求正文都必须包含小写 UUIDv4 `client_command_id` 和下表精确的 `confirmation_intent`，并且只能包含表内业务字段。请求正文不接收 actor、Space、成员数组、前端 epoch 或 targetId。

| action | 本地 targetId | confirmation_intent | 额外正文 |
|---|---|---|---|
| create | null | create_group | title |
| invite | 已授权群 conversation_id | invite_to_group | target_user_id |
| accept | 本人收到的 invitation_id | accept_group_invitation | expected_version |
| decline | 本人收到的 invitation_id | decline_group_invitation | expected_version |
| withdraw | 本人发出的 invitation_id | withdraw_group_invitation | expected_version |
| leave | 本人已加入的 conversation_id | leave_group | expected_version |

本地输入形状为 `{ targetId, body }`，body 是不含 client_command_id 的严格正文。targetId 交给同源适配器组装目标，不写进正文。actor 从真实服务端会话取得，前端 actorId 只用来隔离状态和验证投影。字符串 intent 不是服务端授权证据，宿主仍必须由用户真实操作触发提交。

群名保持原字符串，不 trim 或归一化；1–100 Unicode 码点且不超过 400 UTF-8 字节，不能全是 Unicode White_Space／分隔符，不接受 C0／C1 控制字符或不配对代理字符。数值必须为 JS-safe 整数，ID／version／generation 为正，join_seq 可为零。时间严格为有效 UTC 整秒 `YYYY-MM-DDTHH:mm:ssZ`，不接收小数秒或其他时区。

后端用例签名为 `ChatGroups(repository, authority, clock, policy)`；`create(actor, command, requestId)`，其余动作 `(actor, targetId, command, requestId)`，邀请详情 `invitation(actor, invitationId, requestId)`。`GroupCommand(operation, body)` 负责同一命令正文约束。

## 独立 HTTP 入口

调用方显式从 `src/chat/group-http.ts` 导入 `createGroupApi`。配置为 `{ apiBase: '/api/v1', csrfToken, expectedActorId, fetcher? }`，expectedActorId 必填且必须为正安全整数；实例按真实登录会话持有，退出或同账号重登录时 dispose 后重建。X-Matcher-Chat-Actor 仅用于检测会话与客户端账号不一致，不会选择或认证服务端 actor。

| 客户端方法 | HTTP 路由 |
|---|---|
| create(command, options?) | POST /api/v1/conversations/groups |
| invite(conversationId, command, options?) | POST /api/v1/conversations/{id}/invitations |
| accept(invitationId, command, options?) | POST /api/v1/group-invitations/{id}/accept |
| decline(invitationId, command, options?) | POST /api/v1/group-invitations/{id}/decline |
| withdraw(invitationId, command, options?) | POST /api/v1/group-invitations/{id}/withdraw |
| leave(conversationId, command, options?) | POST /api/v1/conversations/{id}/leave |
| invitation(invitationId, options?) | GET /api/v1/group-invitations/{id} |

command 使用上表严格 snake_case 正文；options 只接受 `{ signal?: AbortSignal }`。所有方法返回 Promise<GroupEnvelope>，dispose() 取消未完成请求并销毁该客户端。除邀请详情外都使用 JSON 与 X-CSRF-Token；所有请求固定同源、credentials=same-origin、redirect=error、cache=no-store，无自动重试。请求校验失败在发起网络前抛出 ChatApiError(INVALID_REQUEST)。

写入首次成功为 201/replayed=false，重复命令成功为 200/replayed=true；详情仅接受 200/replayed=false，且邀请 ID 必须等于请求目标。成功回执同时核验当前 actor、目标、业务状态与版本。失败复用 ChatApiError 的 status/code/retryable/requestId/details。取消或 dispose 后的迟到成功被拒绝；已观察到的 401 仍交给账号状态处理，让 accountEpoch 决定应清理当前账号还是忽略旧登录响应。

服务端默认关闭。开启同时要求模块 groupsEnabled=true、持久 setting 为字符串 1 或 true、原生会话、mail 模块、poll 保护及持久适配器就绪。群生命周期不以 direct readEnabled/sendEnabled 作为开关；开关或依赖不满足返回 503 CHAT_GROUPS_UNAVAILABLE。关闭不删除群、邀请或消息，也不自动恢复原生入口。成功建群／接受邀请不构成群消息、附件或历史权限开放；这些能力仍在后续工作范围内。

## 首页与画像接线

本入口是仓库内可引用源码，尚未发布为独立 npm 包，也没有从既有 `src/chat/client.ts` 重新导出。首页／画像若需要普通群生命周期，应单独导入 `createGroupApi`，在当前真实会话与用户明确操作下调用。现阶段没有群列表、邀请收件箱、合法好友候选列表或群页面入口，不能仅增加一个按钮就声称已完成页面闭环。

既有私聊仍使用 `client.ts` 的 `chatConversationPath(conversationId)` 和 `createChatApi`；conversationId 必须来自服务端已授权的真实会话结果。群命令返回的 ID 不能传入当前 direct-only 消息接口或深链以取得群内容；人物 ID、画像参与关系和想法 ID 也不能代替会话 ID。

普通群只允许群主发邀请，目标必须是当前启用、双向好友且双方均未屏蔽的用户；接受时会重新校验这些原生事实。群邀请不创建好友，接受群邀请也不接受好友申请。画像／发现卡片展示的 relationship 状态不能替代服务端事务内复核；当前客户端不提供人物搜索或从 user_id 查找／创建唯一私聊的能力。

N08 仍负责 event_card／public_post 来源、独立好友申请和接受意图、expected_version、持久终态历史及唯一私聊关联的公共合同。应取得其所有者的冻结接口和验收交接后接入；本模块只复用原生 user_friendship 与屏蔽事实，不注册 N08 设计中的 `/api/v1/connection-requests` 或 `/connections`，也不把原生 add/delete 的 HTML／重定向当作这些产品 API。完整目录和责任分配见前文的公共接口目录。

## 状态调用顺序

1. 为局部表单建立 `createGroupActionState(groupActionCodec)`。宿主取得真实会话后调用 activateAccount；即使再次登录的是同一账号，也要调用它以推进 accountEpoch。
2. 宿主取得当前授权上下文后调用 activateScope。scopeKey 只是本地隔离标识，不能用它替代服务端权限或把人物 ID 当作私聊会话 ID。
3. 明确用户事件调用 `submit(action, input, 'submit')`。返回冻结的 attempt，包含 commandId、输入快照、accountEpoch、scopeEpoch、attempt 序号。重复提交在 submitting 阶段被拒绝。
4. 用 `buildGroupCommand(attempt.action, attempt.input, attempt.commandId)` 取正文，再明确调用 groupApi 对应方法。buildGroupCommand 本身不发送请求；适配器只传合法目标与正文，不传前端账号期。受邀人、群目标和用户操作必须来自宿主已确认的真实上下文。
5. 将回执交给 `resolve(attempt, payload)`，失败交给 `reject(attempt, { status, code })`。返回 applied / ignored；坏成功回执返回 invalid，并保留原命令为 outcome_unknown。
6. 成功后取一次 `takeRefreshIntent()`。宿主按已有能力重新读取当前获准对象，再更新页面；本阶段只有 invitation(id) 群邀请详情，不提供群列表、邀请收件箱、成员候选或群消息读取，不能把群 ID 直接交给 direct-only 接口。该意图不导航、不发送、不授予 read/send 权限，也不保存回执中的群标题或成员资料。
7. 换账号、同账号重新登录、切作用域、撤权、销毁均使旧 attempt 失效。作用域撤销后只有宿主重新确认授权才能再次 activateScope；dispose 后不能复用。

没有自动 retry。网络未知结果、5xx 或无法确认的成功回执进入 outcome_unknown；只有 `retry('retry')` 返回使用同一 commandId、同一冻结输入的新 attempt。已知业务 422／429 进入 failed，409 进入 conflict，不能盲目重试旧版本；先重新读取，再由用户明确丢弃和发起新命令。未知结果只有 `discard('discard', true)` 才允许明确放弃；这可能导致用户另建新命令，因此应先核对服务端最新结果并向用户说明。

命令和重试键只存在当前内存状态中。本批不提供跨刷新、页面关闭或重新登录后的持久恢复；切账号、切作用域和刷新也会丢失本地 unknown 键。后续宿主应在正常离开前提示并核对结果；撤权或账号失效时仍须立即清理，不能为保留重试而继续展示旧内容。

同一账号期里的迟到 401 会清理当前所有作用域；旧账号期的 401 即使 actor 相同，也不能影响新登录。其他旧 attempt 的成功或错误被忽略。403／404 及 AUTHORIZATION_CHANGED、CONTEXT_CHANGED、CURSOR_CONTEXT_CHANGED 清理局部命令并标记 revoked。重放回执和新的刷新失败都不能触发隐式 create、accept 或 send。

## 回执与可见性

成功 envelope 只有 data 和 meta.request_id。data 只有 group、invitation、membership 和 replayed；各对象都拒绝额外字段。membership 只代表当前 actor，group 只伴随该 actor 的当前 active membership 返回。invitation 只允许邀请双方，且所有对象的 conversation_id 必须一致。

pending 不产生正式成员；尚未正式加入的受邀者看不到群标题，已有权限的 owner 邀请回执仍可含 group。重新邀请已退出的人时可以返回其既有 left membership。accepted 是历史邀请状态：该人后来退出时，旧接受命令重放可返回 group=null 和当前 left；后来重新加入则返回新 generation／join_seq。前端只发刷新意图，绝不把历史 accepted 变成成员或消息访问权。

首次 create 的 group version/count、membership generation/version 都为 1，join_seq=0，只有创建者本人。首次 invite 的 invitation 为 pending/v1。接受／拒绝／撤回回执的邀请版本必须精确为 expected_version+1，终态重放也一样；首次 leave 的成员版本也精确加一，leave 重放则允许后来新的成员期。邀请的 accepted／declined／withdrawn resolved_at 必须不早于创建且早于到期；expired 的解析要求 resolved_at 达到 expires_at，本批后端有效状态投影稳定使用 expires_at 本身。

普通群不携带活动或想法参数，不作为跨活动讨论入口。好友申请所需 event_card／public_post 来源校验、expected_version、历史与唯一私聊由 N08 所有者交付；这里声明责任边界，不表示其公共适配已完成。本模块不私自调用原生 add/delete 代替完整好友流程。想法发布与活动讨论按原责任模块接入。

## 验证边界

`tests/chat-groups.test.mjs` 验证严格命令／投影、时间／版本矛盾、退出重邀、未知结果同键恢复、账号切换、同账号重登录、迟到 401、作用域撤权、伪造 attempt 和刷新意图污染。新增 `tests/chat-group-http.test.mjs` 验证七条精确请求、原生会话／CSRF 传递、201／200 区分、失败 envelope、无自动重试、取消后的迟到成功与 401、状态同键恢复。前端测试只用合成 fetch 和对象，没有真实网络或数据库。

后端 `tests/groups-http.php` 使用真实 Yii action dispatch／UrlManager／Request::resolve，注入合成身份和 CSRF 验证结果；检查默认关闭、请求格式、重复 JSON 键、HTTP 方法、账号变化、跨站和查询限制。真实 Yii pretty route 的路径 ID 优先于同名 query，测试包含冲突标量与数组。该测试为 0 数据库／0 HTTP，不等于真实 CSRF cookie 或存储验收。跨语言脚本及真实 HTTP／数据库联调由集成人维护，最终运行数量以专项记录为准。

另已只读核对 root 的 [C07-A 真实生命周期记录](../../../docs/群聊模块升级/sources/c07a-lifecycle-http_2026-11-13.json) 与 `backend/deploy/chat/verify_groups.py`。2026-11-13 首轮记录为 80 次 HTTP、290 项检查（含传输约束检查）、11 次新增命令，覆盖三个隔离合成用户的原生登录、七条生命周期路由、取消好友／屏蔽后的接受拒绝、退出重入和旧命令重放、群内容拒绝及群暂停后 direct 仍可读。该记录明确 group_messages_enabled=false、group_ui_mounted=false，不是主预览部署或群页面完成证明。脚本内 unfriend/refriend/block/unblock 是固定隔离 fixture 的验收动作，不是首页／画像可调用的好友 API，也不能作为 N08 申请／接受／终态历史已交付的证据。

可在本 integration 目录运行 `node --experimental-strip-types --test tests/chat-group-http.test.mjs`、`npm test` 和 `npm run typecheck`。本批不生成前端生产 bundle，也不提供群候选分页、群列表／邀请收件箱、群消息／附件、活动讨论或浏览器群页面；这些仍需后续接入与验收。
