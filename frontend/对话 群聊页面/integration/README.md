# 聊天插件局部构建桥

当前连接态入口与验收范围见 [READ-MODE.md](READ-MODE.md)；C06-T 文字发送与供首页/画像调用的公共客户端见 [SEND-MODE.md](SEND-MODE.md)；0.3.0 附件源码、交互、复用合同与离线边界见 [ATTACHMENT-MODE.md](ATTACHMENT-MODE.md)。下列 C03/C04-P 段落保留其原阶段说明与历史回执，不代表当前连接态只能显示壳。发送和附件由后端逐请求确认资格；群与好友申请接口仍未由本批交付。附件源码完成不代表资源已发布或真实浏览器验收已通过。

C03 的无业务数据页面壳，合同见 ../../../docs/群聊模块升级/03_C01_聊天实施合同.md 第3节。源码与输出只属于聊天专项。原 Next 预览、原 components/ui、共享 frontend/integration 和两个既有 lock 均不修改。

## 本阶段行为

- PHP 提供 matcher-chat-root、matcher-chat-bootstrap 和验证后的资源。bootstrap 严格接受约定的8字段；额外身份或未知字段也会拒绝。
- 页面明确显示聊天接入中，尚未读取会话。合法深链仅保留页面位置，不查询消息或声称会话资格。
- 页面仍零业务 API 调用，包括零 /me/current-event/conversations 调用。新增的 C04-P HTTP 客户端仅独立导出且不进入页面依赖图；没有启用轮询、通知、发送、上传或好友写入。
- 尚未读取不能显示为暂无会话；也不根据 cookie、CSRF 或 bootstrap 壳的 HTTP 200 宣称已登录。失败显示初始化不可用，不回填演示数据。
- 复用原 Brand、Button、Input、ScrollArea、Empty 和五份既有 CSS；原演示 store 和 ConversationApp 不进入构建依赖图。
- 保留本地 Inter、Bricolage Grotesque、Signalry 主题与 Soho 三栏/窄屏切换。日夜通过外部 bundle 修改 html class，不注入内联主题脚本/样式；只记忆原有主题键 team-matcher-chat-theme。身份、消息、CSRF 不写浏览器存储。
- 说明/返回按钮只切换窄屏区域，所有聊天业务按钮明确禁用。没有消息计数、人物头像或虚构已读状态。

## 当前离线构建

需要 Node 24。toolchain.json 记录并强制核对实际直接工具版本。只读借 frontend/integration/node_modules 的 Vite 8.3.8 和 React 插件6.1.2；运行时使用本聊天目录已安装的 React/ReactDOM 19.2.4。CSS 使用本聊天目录 Tailwind/PostCSS 4.3.3，避免混入共享 Tailwind版本。单React及禁止原型依赖由构建插件检查。

在本目录执行：

~~~sh
npm run typecheck
npm test
npm run build
~~~

build.mjs 使用程序化 Vite，configFile:false、envDir:false，局部 .cache/vite，publicDir:false。不会加载 .env，不调用共享 vite.config，不向共享缓存写入。关闭 modulepreload 的 fetch polyfill，单入口由原生 ES module 装载；页面只请求自身静态资源。清空/重建的唯一目录是 backend/protected/modules/matcher-chat-ui/resources/app；仅在该目录归本构建单写时运行。构建HTML不是宿主页面，不内嵌合成bootstrap。

verify-build 检查 manifest 图、文件与符号链接、两份原字体哈希、单入口、无开发路径、无原型数据及无业务网络调用。PHP模块仍需独立核验发布白名单、CSP、路由和关闭行为，离线检查不能代替服务器验收。

## 可重复安装与发布限制

当前没有安装新依赖或生成独立 dependency lock。toolchain.json 是直接版本断言，不是传递依赖锁文件。构建需先存在两个已锁定的安装：本聊天目录 pnpm-lock.yaml，以及共享 frontend/integration/package-lock.json。集成人可在批准的独立准备步骤按各自锁文件安装，示例为聊天目录使用锁文件要求的 pnpm 执行 install --frozen-lockfile，共享构建工具目录使用 npm ci --ignore-scripts；不得由本脚本隐式安装、联网或更新 lock。

本批检查现有安装，不证明干净环境已重装成功。若任一工具版本变化，构建明确失败，先由单写者评估并锁定。独立可移植安装方案尚未交付，不能据此称生产发布完成；运行时产物无需 Next 服务、共享前端源码或 Node。

## C04-P 独立接线准备

`src/chat/` 放置严格 DTO 解析器、session/CSRF 客户端和内存页面状态。创建客户端不发请求；正式 shell 不导入这层，build.mjs 也拒绝该目录进入构建依赖图。它不是可用的聊天服务，尚未注册对应后端路由，不接受示例回填来模拟成功。

局部 styles.css 额外排除 src/chat 和新增 chat-*.mjs 测试的 Tailwind 扫描，保持既有 bootstrap 扫描行为。这样测试文字不会改变正式 CSS；本批最终重建的全部 6 个发布文件与 C03 逐字节一致。

只支持显式列表、历史、增量与已读调用；不提供发送、附件或邀请。状态按身份/会话代次隔离，取消请求外还检查晚到结果；401、退出、切身份和销毁清理敏感内容。消息与凭据不写 localStorage/sessionStorage。具体接口及限制见 [C04-P 准备合同](../../../docs/群聊模块升级/05_C04P离线接线准备.md)。

列表与正文上下文携带 viewer 范围的 authorization_revision；投影升级清除旧摘要/正文，同一 session 保存最高已见版本，清空缓存后仍拒绝低版本响应。刷新或显式请求才能观察到服务端变化；尚无推送失效或后台轮询。最终离线测试为 44 项，PHP 合同为 29 正向/15 负例及 8 次合成客户端调用，不代表真实聊天接通。

在项目根目录执行跨语言合同检查，输入仅由 PHP 内存用例生成：

~~~sh
set -o pipefail
backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-chat/tests/export-contract.php | node --experimental-strip-types 'frontend/对话 群聊页面/integration/scripts/verify-contract.mjs'
~~~

该检查不启动应用、不连接数据库、不发 HTTP。测试通过只能说明 PHP 用例与前端解析器在合成场景一致，不能证明真实身份、活动授权、SQL 并发或原生入口保护通过。

## 检查责任

单测及跨语言检查只用合成输入。真实宿主的GET/深链/关闭/manifest负例、日夜/字体/320–1440px/键盘/减少动效和无业务请求已有C03独立回执；C04-P不重跑或冒称新业务浏览器验收。主集成人独占 scripts/verify-browser.mjs 与 artifacts/；本批不启动HTTP或运行浏览器。

单测入口使用 .mjs，由 Node 24 读取带类型的纯解析模块，避免让原Next项目的宽范围TypeScript扫描误收专用于Node的 .ts 扩展名导入。原预览类型回归可执行 node node_modules/typescript/bin/tsc --noEmit --incremental false，不写原tsbuildinfo。

之后 C04/C06 必须显式扩展合同并接真实服务。不能通过给当前壳追加 /me 请求或替换演示人物，绕过 N04/N05 放行。
