# C07-P 普通群合同与动作状态

2026-11-13。当前交付是未挂载的纯 TypeScript 合同和动作状态，配合后端离线用例验证。没有注册群 HTTP API，没有加入现有 ChatApi 或客户端出口，没有开放正式页面的群操作。现有 direct-only 保护、资源构建和版本保持原状。

业务依据：[普通群合同](../../../docs/群聊模块升级/18_C07普通群与邀请合同.md)。当前首页、画像可调用的真实聊天能力和好友流程责任见[公共接口目录](../../../docs/群聊模块升级/12_首页画像通用社交与聊天接口.md)；不要把本文件的纯函数当作已运行的群服务。

## 模块入口

| 入口 | 职责 | 副作用 |
|---|---|---|
| `src/chat/group-contracts.ts` | parseGroup / parseGroupInvitation / parseGroupMembership / parseGroupReceipt；严格解析 DTO | 无 |
| 同上 | parseGroupActionInput / parseGroupCommand / buildGroupCommand；校验表单输入、生成严格请求正文 | 无 |
| 同上 | groupActionCodec；核对命令与成功回执，只给刷新目标 | 无 |
| `src/chat/group-action-state.ts` | createGroupActionState；显式操作、同键重试、账号与作用域隔离 | 无网络、存储、导航或成员写入 |

这些模块不依赖 React、DOM、宿主或 HTTP。生产构建保留 `.js` 引用；Node 离线测试只对相邻 `send-input` 安装限定 TypeScript resolver。没有扩大既有测试 helper 或运行入口。

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

本地输入形状为 `{ targetId, body }`，body 是不含 client_command_id 的严格正文。targetId 交给后续同源适配器组装目标，不写进正文。actor 未来从真实服务端会话取得，前端 actorId 只用来隔离状态和验证投影。字符串 intent 不是服务端授权证据，宿主仍必须由用户真实操作触发提交。

群名保持原字符串，不 trim 或归一化；1–100 Unicode 码点且不超过 400 UTF-8 字节，不能全是 Unicode White_Space／分隔符，不接受 C0／C1 控制字符或不配对代理字符。数值必须为 JS-safe 整数，ID／version／generation 为正，join_seq 可为零。时间严格为有效 UTC 整秒 `YYYY-MM-DDTHH:mm:ssZ`，不接收小数秒或其他时区。

后端离线用例签名为 `ChatGroups(repository, authority, clock, policy)`；`create(actor, command, requestId)`，其余动作 `(actor, targetId, command, requestId)`，邀请详情 `invitation(actor, invitationId, requestId)`。`GroupCommand(operation, body)` 负责同一命令正文约束。这些签名不代表已注册的 `/api/v1` 路由。

## 状态调用顺序

1. 为局部表单建立 `createGroupActionState(groupActionCodec)`。宿主取得真实会话后调用 activateAccount；即使再次登录的是同一账号，也要调用它以推进 accountEpoch。
2. 宿主取得当前授权上下文后调用 activateScope。scopeKey 只是本地隔离标识，不能用它替代服务端权限或把人物 ID 当作私聊会话 ID。
3. 明确用户事件调用 `submit(action, input, 'submit')`。返回冻结的 attempt，包含 commandId、输入快照、accountEpoch、scopeEpoch、attempt 序号。重复提交在 submitting 阶段被拒绝。
4. 后续适配器用 `buildGroupCommand(attempt.action, attempt.input, attempt.commandId)` 取正文。该函数不发送请求；本批没有这个 HTTP 适配器。适配器未来只传合法目标与正文，不传前端账号期。
5. 将回执交给 `resolve(attempt, payload)`，失败交给 `reject(attempt, { status, code })`。返回 applied / ignored；坏成功回执返回 invalid，并保留原命令为 outcome_unknown。
6. 成功后取一次 `takeRefreshIntent()`。宿主必须重新读取当前获准会话、邀请和消息上下文，再更新页面。该意图不导航、不发送、不授予 read/send 权限，也不保存回执中的群标题或成员资料。
7. 换账号、同账号重新登录、切作用域、撤权、销毁均使旧 attempt 失效。作用域撤销后只有宿主重新确认授权才能再次 activateScope；dispose 后不能复用。

没有自动 retry。网络未知结果、5xx 或无法确认的成功回执进入 outcome_unknown；只有 `retry('retry')` 返回使用同一 commandId、同一冻结输入的新 attempt。已知业务 422／429 进入 failed，409 进入 conflict，不能盲目重试旧版本；先重新读取，再由用户明确丢弃和发起新命令。未知结果只有 `discard('discard', true)` 才允许明确放弃；这可能导致用户另建新命令，因此应先核对服务端最新结果并向用户说明。

命令和重试键只存在当前内存状态中。本批不提供跨刷新、页面关闭或重新登录后的持久恢复；切账号、切作用域和刷新也会丢失本地 unknown 键。后续宿主应在正常离开前提示并核对结果；撤权或账号失效时仍须立即清理，不能为保留重试而继续展示旧内容。

同一账号期里的迟到 401 会清理当前所有作用域；旧账号期的 401 即使 actor 相同，也不能影响新登录。其他旧 attempt 的成功或错误被忽略。403／404 及 AUTHORIZATION_CHANGED、CONTEXT_CHANGED、CURSOR_CONTEXT_CHANGED 清理局部命令并标记 revoked。重放回执和新的刷新失败都不能触发隐式 create、accept 或 send。

## 回执与可见性

成功 envelope 只有 data 和 meta.request_id。data 只有 group、invitation、membership 和 replayed；各对象都拒绝额外字段。membership 只代表当前 actor，group 只伴随该 actor 的当前 active membership 返回。invitation 只允许邀请双方，且所有对象的 conversation_id 必须一致。

pending 不产生正式成员；尚未正式加入的受邀者看不到群标题，已有权限的 owner 邀请回执仍可含 group。重新邀请已退出的人时可以返回其既有 left membership。accepted 是历史邀请状态：该人后来退出时，旧接受命令重放可返回 group=null 和当前 left；后来重新加入则返回新 generation／join_seq。前端只发刷新意图，绝不把历史 accepted 变成成员或消息访问权。

首次 create 的 group version/count、membership generation/version 都为 1，join_seq=0，只有创建者本人。首次 invite 的 invitation 为 pending/v1。接受／拒绝／撤回回执的邀请版本必须精确为 expected_version+1，终态重放也一样；首次 leave 的成员版本也精确加一，leave 重放则允许后来新的成员期。邀请的 accepted／declined／withdrawn resolved_at 必须不早于创建且早于到期；expired 的解析要求 resolved_at 达到 expires_at，本批后端有效状态投影稳定使用 expires_at 本身。

普通群不携带活动或想法参数，不作为跨活动讨论入口。好友申请仍由 N08 统一校验 event_card／public_post 来源、expected_version、历史与唯一私聊，并复用原生好友事实；本模块不私自调用原生 add/delete 代替完整好友流程。想法发布与活动讨论按原责任模块接入。

## 验证边界

新增 `tests/chat-groups.test.mjs` 验证严格命令／投影、时间／版本矛盾、退出重邀、未知结果同键恢复、账号切换、同账号重登录、迟到 401、作用域撤权、伪造 attempt 和刷新意图污染。测试只用合成对象，没有真实网络或数据库。跨语言脚本由集成人维护，消费实际 PHP 用例输出；最终运行数量由专项记录给出。

可在本 integration 目录运行 `node --experimental-strip-types --test tests/chat-groups.test.mjs`、`npm test` 和 `npm run typecheck`。未挂载的新纯模块不生成生产 bundle；本批未做群 SQL、API、CSRF、限流、候选分页、原生通知／历史／附件保护或浏览器群页面验收，这些仍是 C07-A／C07-B 的后续工作。
