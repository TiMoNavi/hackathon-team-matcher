# matcher-chat-ui 0.1.0

C03独立同源页面壳及C04/C06可选读取宿主，要求HumHub1.19.4或以上。默认shell不依赖matcher-webapp或matcher-chat；可选read模式显式检查matcher-chat读取开关。UI模块只消费原生session和读取API，不拥有消息、成员、附件或邀请记录。

默认阶段仍为shell，显示“聊天接入中，尚未读取会话”。read模式已实现，仅在固定8124隔离验证：原生session、模块属性readUiEnabled、设置readUiEnabled、UI总开关和业务模块读取就绪共同允许时才装配。当前并未满足生产原生兼容条件，不能据此启用主预览。

## 页面与开关

- GET `/matcher/chat` 与 `/matcher/chat/conversations/{id}` 默认返回无业务数据shell；read模式才由客户端逐次授权读取。深链须为规范正整数，读取合同进一步要求JS安全整数。
- 未登录可以查看静态壳，这不代表身份/聊天读取验收通过。登录和首页是服务端生成的明确原生链接，不接任意 returnUrl。
- 非 GET 返回405并带 `Allow: GET`；非法深链或关闭UI返回404，直接 `/matcher-chat-ui/app/index` 入口同样受限。runAction先捕获Yii尚未绑定的路径，beforeAction在parent之前校验；没有关闭默认CSRF。
- 开启时直接Yii action的合法GET返回302，Location为服务端baseUrl加固定 `/matcher/chat` 及已验证深链；不转发returnUrl或其他查询参数，也不读取会话/发布资产。浏览器只在规范入口初始化。
- `Module::$uiEnabled` 默认true。模块设置项 `uiEnabled` 缺省允许；仅true、1、`1`、`true`为开启，其他已配置值关闭。最终结果与模块属性取逻辑与。
- 未启用入口接管时，关闭UI撤回新页面及本模块账户菜单，原生导航不由UI插件改动。T1/T2显式接管时，仅替换原生聊天菜单项；具体范围见下节。
- 不调用 mail 的 disable/remove，不删除消息或任何业务模块。此模块没有业务迁移、保护策略或消息数据所有权。

## T1/T2 可选入口接管

后端matcher-chat的entryTakeoverEnabled属性与同名持久设置必须同时开启，生产默认关闭。UI通过EntryBridge响应entryReadiness事件，只声明当前session/impersonation、读取开关和read-app manifest是否就绪，不提供目标URL、不授予会话权限。事件用类名字符串注册，未安装后端时C03静态壳仍可独立使用。

- TopMenu在EVENT_RUN精确匹配原生收件箱URL并改到本插件；保留其他项。NotificationArea仅移除原生NotificationInbox，普通通知不动，不虚构新的未读角标。未交付发送/建群入口不包装成可用功能。
- 完整覆盖的受管用户显示“聊天（只读）”。有未覆盖会话或依赖故障时显示“聊天（暂不可用）”；新页面返回503静态说明，不装配read bootstrap、不把部分会话列表当全部。
- 暂停接管/关闭UI与业务API授权分开。已经打开的读取客户端仍可访问readEnabled允许且真实授权有效的API；通用503不会被当作撤权。业务撤权仍由读取内核判定，关闭UI不自动恢复旧聊天入口。
- 读取前端不再把保留的native_chat_url字段用作返回链接，退出统一指向首页，避免新旧入口循环。v2/read十字段合同保持不变。
- 受管原生GET的实际导航由后端在seen副作用前处理。UI只消费状态，业务保护保留；本批没有完成混合收件箱、发送/附件/群、完整原生恢复或生产开放。

## Bootstrap与资源合同

根为matcher-chat-root，JSON节点为matcher-chat-bootstrap。shell bootstrap为schema_version=1、integration_stage=shell、base_path=/matcher/chat、api_base=/api/v1、native_home_url、native_login_url、csrf_header=X-CSRF-Token、csrf_token八字段。read bootstrap为v2/read，另加原生session的actor_id和固定native_chat_url，共十字段；actor只用于客户端分区和一致性断言，不授予读取权。

CSRF使用当前请求的掩码值，只在页面内存使用。JSON按HTML安全方式编码；脚本沿用HumHub nonce和宿主CSP；页面使用private,no-store和nosniff。未知字段/类型不应被前端当作有效bootstrap。

前端在原固定目录的integration构建，默认输出resources/app，build:read单独输出resources/read-app。宿主按服务端开关选择固定资源根，不接受用户query切换。两种产物均遵守如下发布合同。

- 固定 `resources/app/index.html` 与 `manifest.json`；manifest采用Vite结构，入口键为index.html且isEntry必须为布尔true，构建资源基址为 `./`。PHP不直接渲染构建HTML。
- 递归验证静态imports、dynamicImports、CSS、字体/图片等资源，按静态依赖顺序加载CSS；动态资源由构建入口按需加载。
- 允许JS/MJS、CSS，以及avif/gif/ico/jpeg/jpg/png/svg/webp、woff/woff2/ttf/otf/eot、mp4/webm静态资产。manifest最大1MiB、最多2048节点、递归深度不超过64，路径最长240字符。
- 所有引用必须是根目录内可读文件；拒绝外部URL、绝对路径、编码/普通穿越、隐藏段、反斜杠、符号链接、循环、缺失或非法类型。资源根也须为无symlink的规范绝对路径。
- 仅复制校验图可达资源；manifest、构建HTML、source map、PHP及无关文件不发布。宿主AssetManager必须linkAssets=false且发布基址为同源站内路径，不修改全局AssetManager。
- manifest/发布失败返回503安全静态页，保留原生首页/登录链接，不输出内部异常或文件路径，不回填原型。
- 前端构建检查还须核验CSS/JS中的外部URL、开发端口、原型fixture及无业务请求；仅manifest校验不证明资源内容已经过此项检查。

## 离线验证

在仓库根目录执行：

```sh
backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-chat-ui/tests/run.php
```

测试只加载本模块纯PHP类和隔离宿主替身，使用唯一临时目录内的合成资产并在结束后清理；不启动HumHub、不读应用配置/凭据、不访问数据库或网络、不读写真实resources/app。

覆盖内容包括manifest完整资源图/白名单/动态导入、大小与深度限制、symlink、bootstrap注入/字段类型、全部常见HTTP方法、路径与开关、菜单、503及原生链接。控制器替身验证dispatch与beforeAction顺序，不等于真实Yii HTTP验收。

T1/T2离线回执为215项宿主/manifest检查及12项read-bootstrap检查通过，增加就绪事件、impersonation、覆盖不足/暂停页面和精确菜单替换。上述替身检查不代替真实HTTP。历史读取接线与限制见[读取回执](../../../../docs/群聊模块升级/09_C04隔离读取接线回执.md)，新接管结果另见专项实施记录。

## 文件边界

- 后端所有者维护本目录的PHP/metadata/测试/本README。
- 前端所有者维护原聊天目录构建桥及本模块resources/app和resources/read-app产物。
- 实施合同和进展位于仓库 `docs/群聊模块升级/`；本模块不能自行修改N04/N05/N08/N09状态。
- C04读取API由独立matcher-chat提供，UI仍不提供发送、附件、群邀请等能力。受管用户原生mail入口当前保守拒绝，关闭UI不撤回业务保护；这不代表完整原版回退已通过。
