# C06-P 私聊读取界面

2026-11-12。本批是独立连接态准备；是否允许真实读取由聊天后端 C04 验收及 PHP 宿主开关决定。`src/main.tsx` 仍为 C03 shell，未导入本批的连接态入口。本文不代表 C06-R、浏览器、完整原生回退或主预览部署已经通过。

## 装配边界

- `src/read-main.tsx` 是独立 opt-in 入口，`read-styles.css` 复用原 Signalry/Soho 样式与本地字体；新增组件使用原 Kit Button、Input、ScrollArea、Bubble，不改 `components/ui` 或原演示。
- `src/chat/read-bootstrap.ts` 接受严格十字段合同：`schema_version=2`、`integration_stage=read`、`base_path=/matcher/chat`、`api_base=/api/v1`、`native_home_url`、`native_login_url`、`native_chat_url`、`csrf_header=X-CSRF-Token`、`csrf_token`、`actor_id`。
- `actor_id` 由 PHP 当前 HumHub session 输出，仅用于内存分区及已有获准 sender 的本人标识，不是会话授权证明。guest 继续 shell 或原生登录入口，不伪造 actor。
- 连接态所有 GET/PUT 携带固定 `X-Matcher-Chat-Actor` 一致性头。服务端先以原生 session 确定本人，再比对该值；不一致返回401 `SESSION_CHANGED`并清前端状态，不能按请求头选择用户。它覆盖页面持续聚焦时其他窗口改变账号的情况，不是认证凭据或完整 session nonce 回执。同账号重新登录的旧 CSRF 仍由服务端检验，失败要求刷新，不自动重试。
- 原版入口只接受 `/mail/mail/index` 或仅有合法 `r=mail/mail/index` 的 `/index.php` 链接。它是导航入口，不承诺受管会话的原生读写已全部验收。
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

该回执仅证明本次隔离读取实验，不能扩展为完整 C06-R、主预览部署或生产完成。真实身份提供商登录、真实焦点切换、群授权、发送、附件和完整原生回退仍未获本次浏览器认证。受管用户的原生 mail/live 入口目前保守拒绝；关闭 UI 保留数据、API 和业务保护，不等于恢复完整原生聊天。未通过相应后端与群保护验收的能力继续关闭。
