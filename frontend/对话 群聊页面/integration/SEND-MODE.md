# C06-T 文字发送与公共客户端

2026-11-12。本文记录聊天 integration 源码与离线验证；真实 SQL/HTTP/浏览器和资源发布由主集成人另行验收。原 C04/T1/T2 浏览器产物未改写。入口仍为 v2/read 十字段 bootstrap，不新增用户身份、好友或会话事实。

## 资格与交互

- 只有当前已加载、获准的 direct context 且服务端返回 `permissions.send=true` 才能编辑文字。后端每次 POST 重新校验原生 session、准入会话、双向好友、拉黑和发送开关；前端权限只控制交互，不构成授权。切活动不创建或删除私聊。
- 发送只由明确点击或非 IME 组合输入的 Enter 触发；Shift+Enter 换行，组合态与 keyCode 229 不发送。发送期间禁用输入与重复提交，同一控制器最多一个发送请求。
- 草稿与 key 仅存内存。状态为 idle、sending、sent、failed、outcome_unknown；只有持久消息回执才能显示已发送，不显示虚构送达、已读、姓名或头像。发送不会自动执行已读 PUT。
- 网络断开或坏回执保留原正文和原 key，显示结果待确认；只有“重试原消息”再次 POST。429、依赖不可用同样不自动重试。明确选择“放弃重试并编辑”才丢弃旧 key；未知结果状态提示重新发送可能形成另一条消息。重新编辑的正文不能沿用旧 key。
- 手动重新读取同一会话不会丢失待确认 attempt；撤权、换会话、401、后台/失焦暂停及销毁清空草稿/key，晚到成功不能复活。失焦恢复仍沿既有整页重取 bootstrap，未新增持久草稿恢复。
- 原生入口回退仍移除，返回首页可用。群、附件、新会话、好友申请均未交付，保持禁用。Signalry 字体/主题与 Soho 布局保留，基础 UI 文件未修改。

## POST 合同

`POST /api/v1/conversations/{conversation_id}/messages` 接收严格 JSON：

```json
{"client_message_id":"01234567-89ab-4cde-8fab-0123456789ab","body":"原样保存的文字"}
```

key 为小写 UUIDv4，唯一范围是同一 conversation + sender + key；不同会话同键各自独立。正文保留原文，不 trim、不 Unicode 归一化；1–4000 Unicode 码点，判空使用 Unicode White_Space/Z，拒绝孤立 surrogate、NUL 与 Cc 控制字符，仅 TAB/LF/CR 例外。FEFF 不属于该判空集合；前后端均保留其原字元。

返回 Envelope 的 data 精确为 `{message, client_message_id, replayed, read_seq, unread_count, context}`，meta 仍为 `{request_id}`。message/context 沿既有严格 DTO。

- 201 新发：`replayed=false`，正文必须等于本次原文，key 与 conversation 必须匹配。
- 200 重放：`replayed=true`，返回同一持久消息的当前获准投影，可为编辑后 text 或 deleted 墓碑；不能要求等于旧正文，也不能恢复旧已删除内容。原 key 的服务器 hash 仍核对最初请求。
- 新发成功后只进行一次 GET increment 补齐中间并发 seq，不直接把单个回执拼入历史造成缺口。重放成功先清除旧消息/摘要，再进行一次 GET history 取得当前投影，避免旧 seq 的编辑/删除被增量漏过。读取失败不把已确认发送改成失败，更不重发 POST。
- read_seq 与 unread_count 只消费服务器值。没有自动轮询、发送重试、好友请求、get-or-create 或“对方已读”推算。
- 401、403/404、授权版本变化走现有身份/撤权清理；发送专用的坏回执不当作撤权证明，只拒绝载荷并保留同身份/同会话原 attempt。读流程原 fail-closed 逻辑不放宽。

错误沿既有 Envelope：401 会话；400 CSRF；403 SEND_FORBIDDEN；404 CONVERSATION_UNAVAILABLE；409 IDEMPOTENCY_CONFLICT；422 INVALID_MESSAGE_BODY / INVALID_CLIENT_MESSAGE_ID；429 RATE_LIMITED；503 CHAT_SEND_UNAVAILABLE。错误 retryable 不触发自动发送。HTTP 客户端仍同源、no-store、redirect:error，所有 POST 带 session CSRF 与可选 actor 一致性头；请求头不能选择身份。

## 首页与画像公共入口

只导入 [src/chat/client.ts](src/chat/client.ts)，没有 React、组件、浏览器全局初始化或构造请求。公共出口为：

| 出口 | 用途 |
|---|---|
| `chatListPath(): string` | 固定聊天列表路径 |
| `chatConversationPath(conversationId: number): string` | 验证正安全整数并形成固定深链，不授权对象 |
| `createChatApi(config)` | 创建 session 范围的显式 list/history/increment/readState/sendText 客户端 |
| `createClientMessageId()` | 在明确发送动作时生成安全 UUIDv4；不在加载或建链时生成/发送 |
| `validateMessageBody / validateClientMessageId` | 纯本地输入校验，无变更正文 |
| `ChatApiError / MessageInputError` | 分辨服务器请求与本地校验失败 |

类型出口为 ChatApi、ChatApiConfig、ChatFetcher、PageOptions、IncrementOptions、ReadOptions、SendOptions、SendReceipt。

调用侧只接受服务器已授权上下文提供的 conversation_id，不把 user_id、推荐卡片索引或本人推测当会话 ID。点击深链时 API 再次验权；链接本身不是授权凭据。好友 JSON 适配和唯一空私聊尚无本批可消费端点，未提供“找不到就建”“加好友后自动发消息”的 helper。

```ts
import { chatConversationPath, createChatApi, createClientMessageId } from "./chat/client";

// serverConversationId 与 hostSession 来自所属宿主已验证的服务端上下文。
const href = chatConversationPath(serverConversationId);
const api = createChatApi({ apiBase: "/api/v1", csrfToken: hostSession.csrfToken,
  expectedActorId: hostSession.actorId });

// 仅在用户明确发送动作中创建一次 attempt；失败后原对象保留供显式重试。
const attempt = { clientMessageId: createClientMessageId(), body: userTypedBody };
const receipt = await api.sendText(serverConversationId, attempt);
// session/账号被丢弃时 api.dispose()，并清除调用侧的草稿、attempt和显示内容。
```

公共 api.sendText 不替调用页面去重重复按钮、管理草稿或判定权限；直接使用它的页面须保留同一 attempt、处理结果未知与生命周期清理。已有聊天页由 read-controller/send-draft 实现这些规则。所有宿主均不得将身份、正文、CSRF、key 写入本地持久存储或日志。

## 离线检查与缺口

完整读取并沿用 ui-ux-pro-max、shadcnuikit 与项目 architecture-patterns；本轮 ui-ux-pro-max 定向查询 message form error recovery，采用明确错误恢复、播报和提交状态，不改模板风格。

在本目录运行 `npm test` 与 `npm run typecheck`。发送专项测试在 [chat-send.test.mjs](tests/chat-send.test.mjs)；真实组件静态渲染在 [chat-read-render.test.mjs](tests/chat-read-render.test.mjs)。transport、DOM事件判定与渲染均为离线合成，不是实际输入法、浏览器或服务端回执。本轮最终离线回执为 **97/97 测试通过**，**typecheck 通过**；其中新增 20 项发送/公共客户端测试与 3 项真实组件静态渲染测试。

前端作者不运行服务/数据库/HTTP、构建产物、Git 或真实浏览器，也未读取凭据。真实收发、网络丢回执、浏览器 IME、日夜/320–1440px、身份切换、真实焦点和权限竞态由 root 独占验证；历史焦点缺口不因离线测试自动变为通过。
