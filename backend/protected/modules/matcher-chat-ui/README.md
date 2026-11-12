# matcher-chat-ui 0.1.0

C03 的独立同源聊天页面壳，要求 HumHub 1.19.4 或以上。此模块不依赖 matcher-webapp、matcher-chat 或原生 mail 的运行时类；不查询或保存用户、会话、成员、消息、附件或邀请。

当前阶段是 `shell`。页面必须显示“聊天接入中，尚未读取会话”，不得把尚未接通业务当成真实空会话。没有 conversations、联系人、邀请或 capabilities API，也没有模型、邮件或社交写入。生产连接态由后续任务另行启用。

## 页面与开关

- GET `/matcher/chat` 与 `/matcher/chat/conversations/{id}` 返回同一无业务数据页面。深链仅接受不超过 PHP_INT_MAX 的正整数，不读取该会话。
- 未登录可以查看静态壳，这不代表身份/聊天读取验收通过。登录和首页是服务端生成的明确原生链接，不接任意 returnUrl。
- 非 GET 返回405并带 `Allow: GET`；非法深链或关闭UI返回404，直接 `/matcher-chat-ui/app/index` 入口同样受限。runAction先捕获Yii尚未绑定的路径，beforeAction在parent之前校验；没有关闭默认CSRF。
- 开启时直接Yii action的合法GET返回302，Location为服务端baseUrl加固定 `/matcher/chat` 及已验证深链；不转发returnUrl或其他查询参数，也不读取会话/发布资产。浏览器只在规范入口初始化。
- `Module::$uiEnabled` 默认true。模块设置项 `uiEnabled` 缺省允许；仅true、1、`1`、`true`为开启，其他已配置值关闭。最终结果与模块属性取逻辑与。
- 关闭UI撤回新页面及本模块账户菜单。菜单只对已登录且UI开启者显示“聊天（接入中）”，不替换全站导航或原生mail入口。
- 不调用 mail 的 disable/remove，不删除消息或任何业务模块。此模块没有业务迁移、保护策略或消息数据所有权。

## Bootstrap与资源

根为 `matcher-chat-root`，JSON节点为 `matcher-chat-bootstrap`。bootstrap仅包含 schema_version=1、integration_stage=shell、base_path=/matcher/chat、api_base=/api/v1、native_home_url、native_login_url、csrf_header=X-CSRF-Token、csrf_token 八个字段。

CSRF使用当前请求的掩码值，只在页面内存使用。JSON按HTML安全方式编码；脚本沿用HumHub nonce和宿主CSP；页面使用private,no-store和nosniff。未知字段/类型不应被前端当作有效bootstrap。

前端在原固定目录的 `integration/` 构建，独占写入本模块 `resources/app/`。后端不生成示例产物，不触碰前端构建文件。发布合同如下。

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

当前离线回执：PHP 8.5.12 CLI、174项检查通过，原10个PHP文件语法检查通过，本次重定向变更的controller和tests再次通过语法检查。上述离线检查不包含安装、迁移、真实HTTP或浏览器；真实回执由集成人另行记录，不据离线检查将C03或聊天业务标为通过。

## 文件边界

- 后端所有者维护本目录的PHP/metadata/测试/本README。
- 前端所有者维护原聊天目录构建桥及本模块resources/app产物。
- 实施合同和进展位于仓库 `docs/群聊模块升级/`；本模块不能自行修改N04/N05/N08/N09状态。
- C04以后真实API仍须普通用户同源session+CSRF、逐对象权限、消息序号/幂等/历史及旧入口保护，本阶段不提供这些业务能力。
