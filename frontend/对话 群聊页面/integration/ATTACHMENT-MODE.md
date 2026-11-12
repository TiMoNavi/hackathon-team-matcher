# C06-A 私聊附件与公共客户端

2026-11-13。integration 版本为 0.3.0。本文件记录聊天源码与离线检查；服务、迁移、构建产物、真实 HTTP/浏览器与发布由主集成人独占验收。历史读取/发送回执不重写。read v2 十字段 bootstrap 不变，附件能力只来自当前会话响应体。

## 能力与数据

当前 direct 的 context 可带可选 attachments，字段精确为 upload_enabled、download_enabled、max_file_bytes=5242880、max_files_per_message=3、allowed_mime_types=[image/jpeg,image/png,application/pdf,text/plain]、staging_ttl_seconds=86400。旧响应缺失该字段时附件控件关闭。上传还要求 permissions.send=true；已有消息附件的下载独立使用 download_enabled，即发送资格失效后仍可读取服务器准许的历史。群、新建会话与好友申请继续关闭。

附件 DTO 精确为 id/name/mime/size/download_path。id 是小写 UUIDv4，size 为正且不超过 5 MiB；文件名 UTF-8 1–180 bytes，拒绝空白名、路径分隔符、Cc/Cf/孤立 surrogate。选择仅接受 jpg/jpeg/png/pdf/txt 扩展名；File.type 不作为授权或真实类型依据，服务端重新检测内容并匹配扩展名。download_path 必须与 conversation_id、附件 UUID 组成的固定同源路径完全一致，不接受绝对 URL、query、token、variant 或原生 file 路由。

Message.attachments 最多三件、ID 不重复。纯附件消息为 kind=attachment/body=null；文字带附件为 kind=text；deleted/system 不能携带附件。服务端未提供附件能力却出现附件 DTO 时拒绝响应。消息摘要中的纯附件显示“附件消息”，不造正文。

## 请求合同

| 操作 | 请求 | 成功与不确定结果 |
| --- | --- | --- |
| 上传 | POST /api/v1/conversations/{id}/attachments；multipart 仅 client_upload_id 和 file | 201 新上传、200 同原 key/bytes/name 重放；data 精确为 attachment/client_upload_id/replayed/expires_at |
| 取消暂存 | DELETE /api/v1/conversations/{id}/attachments/{uuid}；无 body | 200 data={attachment_id,state:cancelled或expired}；未知结果仅显式重试同 UUID |
| 绑定并发送 | POST messages；保留 client_message_id/body，新增可选 attachment_ids | 最多三 UUID，顺序参与请求；body 必填，只有附件非空时允许精确空字符串；201/200 持久回执规则沿用文字发送 |
| 授权下载 | GET /api/v1/conversations/{id}/attachments/{uuid}/download | 当前 session 重新授权；200 真实 MIME、attachment、private/no-store、nosniff、精确 size 字节 |

所有请求使用 credentials=same-origin、cache=no-store、redirect=error，可选 X-Matcher-Chat-Actor 只做身份一致性校验。POST/DELETE 带当前 CSRF；multipart Content-Type 由浏览器生成边界，DELETE 不伪造 JSON body。客户端构造、文件选择、组件渲染和订阅均不请求附件。

下载错误须是规范 JSON 错误 Envelope；成功不接受 HTML、inline、Range 或部分响应。客户端逐块读取并在超过 DTO size 时停止，不创建无限体积 Blob。下载按钮先显式 GET 验权，成功后才出现“保存文件”本地 Blob 链接；不打开响应中的任意路径。只在确认获得字节后生成对象 URL，保存、关闭下载、换会话、身份失效、撤权、历史消息被移除、暂停和销毁时回收。文件选择不生成预览 URL；无自动图片预览、自动下载或外部资源请求。

## 草稿与生命周期

- 选择只保留当前会话内存 File 和上传 key；每个附件需点击“上传”。尚未上传/上传失败/取消结果未知时不可发送；只有全部附件处于 ready 才会绑定发送。
- 上传失败保留原 File、文件名和 client_upload_id。网络错误或坏成功回执显示 upload_unknown；“重试上传”仍用原对象，不换 key、不自动 POST。停止传输只 abort 浏览器请求，不能声称服务端未保存；需原 key 重试确认或明确放弃本地重试。
- 未知取消保留原附件 UUID，显示 cancel_unknown；“重试取消”只 DELETE 原 ID。已绑定返回 ATTACHMENT_ALREADY_BOUND 时不能取消消息附件，可移除本地记录并重新读取会话。过期上传 key 是服务端墓碑，不会自动换 key 重新上传。
- 发送结果未知保留原 client_message_id/body/有序 attachment_ids，不允许修改或取消绑定。显式重试只重发原消息，不再次上传。放弃未知发送后清除本地附件绑定，并提醒附件可能已附着到已保存的消息；不自动取消服务器附件。
- 成功重放先清除旧消息与列表摘要，取消重放前尚未完成的列表读取；再按原会话执行一次 GET history，并在身份/导航仍有效时执行一次 GET list 补回获准会话。列表补读失败显示错误，不重发 POST/PUT、不循环；失效或离开后的旧请求不补回列表。
- 同会话手动 GET 可保留待确认 attempt。导航/身份/授权上下文变化会 abort 在途结果并清空 File、key、附件和 Blob。已停止上传的迟到回执不能改写后续同 key 重试状态；晚到同 session 401 仍清身份。
- 当前账号跨所有会话最多 20 件有效暂存、60 秒最多成功新上传 20 次；取消不返还已用次数。24 小时从第一次服务端创建计算，重试不续期。界面在可展开说明里呈现这些限制，不由前端计数冒充服务端配额。

## 首页与画像复用

只导入 src/chat/client.ts；模块无 React、DOM初始化、环境读取或构造 I/O。现有 createChatApi 新增 uploadAttachment、cancelAttachment、downloadAttachment，sendText 的 SendOptions 新增可选 attachmentIds。

新增类型出口为 Attachment、AttachmentCapability、UploadReceipt、CancelReceipt、UploadOptions、CancelOptions、DownloadOptions、DownloadedAttachment。新增纯校验为 validateAttachmentId、validateAttachmentIds、validateUploadFile、validateSendBody、AttachmentInputError。会话路径生成器、纯文字接口与十字段 bootstrap 保持兼容。

调用方必须从已授权上下文取得 conversationId 与能力，显式用户动作才创建上传/发送 attempt，并自行保存原 key/File/绑定以支持重试。downloadAttachment 只返回获准 Blob 与 DTO，不创建对象 URL或触发保存。调用方丢弃 session 时须 dispose 客户端、清除私有展示/草稿、撤销自己创建的 URL；不能把数据写入持久浏览器存储或日志。没有创建会话、加好友、自动发送或自动清理的 helper。

## 源码与验收入口

纯输入/状态在 attachment-input.ts、attachment-draft.ts、attachment-urls.ts；transport/parser 在 http.ts、contracts.ts；会话串行与身份隔离沿用 state.ts、read-controller.ts；附件 UI 在 attachment-controls.tsx，使用已有 Kit Button、Lucide 和现有主题变量，不改 components/ui。

运行 npm test、npm run typecheck。chat-attachments.test.mjs 使用合成 File、Response、纯内存 URL port 和 deferred transport；chat-read-render.test.mjs 对真实 TSX 做内存静态渲染。检查包括能力缺失、恶意路径、文件名/字节/类型边界、multipart/CSRF、显式上传/取消/发送、未知结果、停止与迟到、同键/绑定重试、身份撤权、下载限额与 Blob 清理。无真实 HTTP/DB、凭据读取或浏览器认证。真实文件下载、布局、字体及焦点生命周期由 root 另验。

附件初版离线回执为 127/127 测试与 typecheck 通过，其中附件纯逻辑/状态/transport 新增 26 项、真实 TSX 静态渲染新增 4 项。随后修复重放后的列表补读，新增旧请求迟到、补读失败/401、导航/暂停三项检查，当前回执为 130/130 与 typecheck 通过。独立审查另以实际 PHP DTO 输入 TypeScript parser 验证 16 正例与 24 反例；这些均为内存合同检查，不替代服务端真实授权或浏览器验收。INVALID_ATTACHMENT_IDS/NAME/UPLOAD/ID 沿后端领域规则为 422；413/415/409/410 分别保留超限、格式、冲突、过期语义。

## 浏览器验收选择器

- 选择文件：input#chat-attachment-input（multiple；“选择附件”）。选择后不会自动上传。
- 草稿：li[data-upload-key][data-upload-state]，按钮名称为“上传附件 {name}”“重试上传 {name}”“取消附件 {name}”“重试取消 {name}”“停止上传 {name}”“移除附件 {name}”“放弃上传重试 {name}”。
- 发送仍为精确“发送”。消息 article[data-message-id] 中附件 li[data-attachment-id]，按钮为“下载附件 {name}”。
- 授权读取成功后链接为“保存附件 {name}”（正文“保存文件”）；点击后回收对象 URL。关闭按钮为“关闭下载”。
