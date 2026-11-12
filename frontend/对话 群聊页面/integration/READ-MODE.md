# C06-P 私聊读取界面

后续 C06-T 在同一连接态页面增加了受服务端权限控制的手动文字发送，见 [SEND-MODE.md](SEND-MODE.md)；C06-A 0.3.0 的附件源码与离线实现见 [ATTACHMENT-MODE.md](ATTACHMENT-MODE.md)，能力由当前会话响应协商。本文的 C06-P/C06-R、T1/T2 只读描述及原浏览器回执均保留对应历史阶段；群、好友申请与自动发送仍未开放。下列历史 66/74 项计数不替代后续发送/附件离线检查。

2026-11-12。本批是独立连接态准备；是否允许真实读取由聊天后端 C04 验收及 PHP 宿主开关决定。`src/main.tsx` 仍为 C03 shell，未导入本批的连接态入口。本文不代表完整 C06-R、真实焦点生命周期、完整原生回退或主预览部署已经通过。

## 装配边界

- `src/read-main.tsx` 是独立 opt-in 入口，`read-styles.css` 复用原 Signalry/Soho 样式与本地字体；新增组件使用原 Kit Button、Input、ScrollArea、Bubble，不改 `components/ui` 或原演示。
- `src/chat/read-bootstrap.ts` 接受严格十字段合同：`schema_version=2`、`integration_stage=read`、`base_path=/matcher/chat`、`api_base=/api/v1`、`native_home_url`、`native_login_url`、`native_chat_url`、`csrf_header=X-CSRF-Token`、`csrf_token`、`actor_id`。
- `actor_id` 由 PHP 当前 HumHub session 输出，仅用于内存分区及已有获准 sender 的本人标识，不是会话授权证明。guest 继续 shell 或原生登录入口，不伪造 actor。
- 连接态所有 GET/PUT 携带固定 `X-Matcher-Chat-Actor` 一致性头。服务端先以原生 session 确定本人，再比对该值；不一致返回401 `SESSION_CHANGED`并清前端状态，不能按请求头选择用户。它覆盖页面持续聚焦时其他窗口改变账号的情况，不是认证凭据或完整 session nonce 回执。同账号重新登录的旧 CSRF 仍由服务端检验，失败要求刷新，不自动重试。
- `native_chat_url` 保留在原十字段合同中，并继续只接受 `/mail/mail/index` 或仅有合法 `r=mail/mail/index` 的 `/index.php` 链接。T1/T2 读取页不再把该字段传给展示组件或渲染成回退入口，避免返回已接管的旧路由形成循环；正常与失效状态的退出均使用已校验的 `native_home_url`，登录恢复使用 `native_login_url`。
- 不请求 `/me`、current-event、画像、推荐或 AI；不建立第二套身份、活动或好友事实。聊天后端对每次 API 请求重新验证用户和对象。
- 构建、manifest、服务端 stage/开关与资源选择由主集成人处理。正式默认壳不得根据 query、localStorage 或浏览器修改切换能力。连接态 JS 本身不授予 API 权限。

## 行为

启动仅在显式连接态入口中发生：校验 bootstrap 和深链后读取会话列表，成功后按合法深链读取指定会话；不自动选择第一项，不制造空会话或消息。构造 controller、订阅和纯组件渲染不发请求。

列表/历史成功空态、加载、失败和撤权分别显示。分页只用签名 opaque cursor；增量由用户点击“检查新消息/继续读取”触发，不轮询或自动循环。原型 fixture、在线状态、对方已读和虚构未读总数不进入正式模式。标题缺省显示“私聊会话”；sender 不可用显示“发送者信息未提供”，不从其他资料或原生昵称回填。

仅 direct 可以进入当前界面；有效 DTO 若返回 group/discussion，连接态 adapter 拒绝并交由 state 清理。新建、群、邀请、好友申请、发送、附件均禁用。纯文本由 React 转义输出，未使用 HTML 注入；avatar_ref 保持 opaque，本批不拼接头像或下载 URL。

“已看到这里”必须由用户点击。界面计算当前消息滚动视口内实际可见的末端 marker，并在点击时重新检查文档可见、窗口聚焦、选中会话及当前已加载消息。只有新位置发 PUT；列表读取、导航、分页和消息显示都不会自动写已读。回执仍来自服务端单调合并，不推算 unread。

## 生命周期与恢复

- blur、隐藏、pagehide 先同步遮蔽根节点，再取消请求并清空全部会话内存；恢复可见且聚焦时整页刷新，取得新的原生 session 与 CSRF bootstrap。同账号重登也不能复用旧 controller。
- 401 清身份分区与所有聊天状态。既有 state 继续校验 actor/session epoch、会话上下文、viewer revision 最高水位、晚到结果及撤权；不建立持久明文缓存。
- DOM 的 bootstrap JSON 解析后清空，不把 token/actor 传给展示组件。除原有主题选择外，不写 localStorage/sessionStorage。
- 普通返回、刷新和前进后退仅恢复导航位置，授权由 API 重新判定；失效页面不能带着旧 bootstrap 自行恢复。

## 离线与隔离浏览器验收

本目录单元测试覆盖严格 bootstrap、路径、无请求构造、direct-only、空态/失败、显式可见位置已读、401、失焦/页面恢复和晚到结果。已读几何同时与浏览器屏幕、visualViewport 和祖先裁剪区域求交，屏外消息不作为确认位置。真实组件另用内存 TSX 转换与 React server rendering 验证安全文本、禁用写操作和清理状态；这些是合成 transport/离线渲染，不是真实浏览器或 HTTP 授权证明。

前端作者完成的离线回执：`npm test` 66/66 通过；`npm run typecheck` 通过；原预览 `node node_modules/typescript/bin/tsc --noEmit --incremental false` 通过。原 C03 默认入口与预览保持不变；独立读取入口由主集成人在隔离环境装配。前端作者未运行构建、浏览器、服务、数据库、迁移或 Git，也未读取凭据、真实账号或私聊。

2026-11-12，主集成人 root 在固定的 `http://127.0.0.1:8124` 隔离环境执行真实浏览器验证，使用两个虚构账号正常完成原生登录表单。脱敏回执见 [read-browser-report.json](artifacts/read-browser/read-browser-report.json)：5 组检查通过；列表 GET 3 次、历史 GET 5 次、显式增量 GET 2 次，B 账号显式确认可见新位置产生 1 次真实 read-state PUT；A 账号位置已读，未产生写入。页面错误、控制台错误、被阻止的外部请求和非预期写入均为 0。未使用真实用户资料，未返回凭据、导出 cookie 或记录消息原文。

本次浏览器证据覆盖匿名壳不请求聊天、两个虚构账号的读取、显式增量、真实空会话、刷新深链、手机列表/返回，以及 1440px 日夜历史、320px 日夜历史和 320px 日间列表共 5 个视口场景。自动几何检查未发现横向溢出、裁剪或过小交互目标；root 另人工查看了 [320px 日间历史截图](artifacts/read-browser/read-320-day-history.png)。品牌本地字体实际为 Bricolage Grotesque，中文脚注实际命中 PingFang SC；名为 `chinese-title` 的取证选择器包含英文虚构标题，不能据此声称标题中文已验证。聊天新增持久化仅为主题选择。

失焦恢复状态为 `not-exercised-headless-no-transition`：本次 headless Chromium 切换标签页后仍报告可见且聚焦，未产生真实 blur、hidden、focus、visible 或 pagehide 事件，因此没有验证真实失焦后的同步遮蔽、内存清理和恢复刷新，不能将其计为通过。离线生命周期测试不能替代这项浏览器证据。

浏览器验收必须从仓库根目录通过 [harness 包装器](../../../backend/deploy/chat/verify_read_browser.py) 执行：

```sh
python3 -B backend/deploy/chat/verify_read_browser.py
```

禁止独立直接运行 Node 浏览器入口。包装器先持锁核验 runtime、数据库、受管服务、虚构 fixture 的权限与 nonce，以及后端读取和 UI 读取开关，再启动固定脚本；不支持任意目标地址。执行边界见 [后端聊天隔离 harness 说明](../../../backend/deploy/chat/README.md)。

该回执仅证明本次隔离读取实验，不能扩展为完整 C06-R、主预览部署或生产完成。真实身份提供商登录、真实焦点切换、群授权、发送、附件和完整原生回退仍未获本次浏览器认证。该回执执行时，受管用户的原生 mail/live 入口保守拒绝；关闭 UI 保留数据、API 和业务保护，不等于恢复完整原生聊天。后续入口接管以 [T1/T2 方案](../../../docs/群聊模块升级/10_聊天入口接管与恢复方案.md) 及其新回执为准，不反写本次历史证据。未通过相应后端与群保护验收的能力继续关闭。

## T1/T2 读取入口承接（离线）

2026-11-12，本次只修改 integration 源码、离线测试与本文；没有改动原型、原 C03 shell、共享 DTO、十字段 bootstrap、PHP 宿主、构建产物或既有浏览器脚本与产物。

- 读取页移除两处原生聊天回退链接，保留首页退出和原生登录恢复；所有页面状态继续关闭发送、附件、新会话、群与好友申请，未替代完整聊天能力。
- 初次深链的列表失败，在手机会话面板显示错误和显式重试，不伪装成空会话或“请选择”。手动重试成功后保留原深链，并重新调用会话接口验权；返回列表、改选会话、暂停或登录失效后，旧请求不能恢复原深链。不存在或撤权的会话不能保留旧标题与正文。
- 未登录/失效提示在手机列表路径同样可见。列表权限失败使用列表文案；运行中 HTTP 503 只显示“聊天读取暂不可用”，不将未知原因推断成管理员暂停或依赖故障，也不自动重试或跳转旧聊天。
- 装配前暂停、依赖不可用由主集成人的 PHP 宿主显示诚实不可用页面，不发读取 bootstrap。本次没有新建返回合同或错误码，未知字段/版本/阶段继续拒绝。

本次完整读取并应用 ui-ux-pro-max 的错误恢复与错误播报指引，定向查询 `error recovery navigation --domain ux` 命中 Error Recovery / Error Messages；React 查询仅核对异步错误反馈。Signalry 主题、字体和 Soho 布局保持原规范；复用已有 Shadcn UI Kit 组件，不修改 `components/ui`。接口边界另按项目 architecture-patterns 约定检查，未增加身份或授权事实。

本次离线回执为 `npm test` **74/74 通过**、`npm run typecheck` **通过**。新增覆盖无原生入口、未知 bootstrap 与非法退出地址拒绝、深链手动恢复/离开/暂停竞态、失败与空态区分、手机错误展示、未交付能力关闭和撤权标题/正文清理。渲染测试使用真实组件的服务端静态渲染，transport 为内存合成；不能作为真实 HTTP 或浏览器导航认证。

本次没有运行构建、浏览器、服务、数据库、HTTP 或 Git，也没有读取凭据。既有浏览器脚本与回执未变，真实 focus/visibility 缺口继续保留；模拟 EventTarget 单测不算真实焦点验收。接管跳转、暂停/缺依赖宿主、重复切换、手机实际显示及其他业务入口是否正常，仍由主集成人在固定 8124 harness 中取得新证据。

## T1/T2 主集成追加验收（2026-11-12）

主agent通过固定verify_entry_browser.py在8124执行两次普通合成账号登录，验证原生index/show一跳进入插件、深链刷新、1440/320日夜、手机返回及mixed新页面明确503，共5组通过。新证据仅在[entry-browser报告](artifacts/entry-browser/entry-browser-report.json)与[包装器报告](artifacts/entry-browser/entry-browser-wrapper-report.json)，历史read-browser保持不变。

本轮禁止所有PUT且未点击已读，A/B read_seq均保持7，native_seen和完整快照不变。Headless未产生真实focus/visibility切换，仍不能称焦点恢复/真实已读通过。读取包已由root构建，原C03包保持原样；完整范围及停服结果见[11回执](../../../docs/群聊模块升级/11_T1T2入口接管隔离验收.md)。
