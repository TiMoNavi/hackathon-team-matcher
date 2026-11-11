# HumHub 免费模块本机预览

> 已部署并核验：2026-11-11。HumHub 1.19.4 + Clean Theme 2.5.3。
> 这是可运行的原生模块预览；新 React 前端、邀请码、当前活动发现、逐字段授权与 AI 业务尚未实现。

## 1. 打开预览

- 地址：<http://127.0.0.1:8090>，仅本机回环地址。
- 管理员用户名：`admin`。密码在本地 `backend/.runtime/preview-credentials.json` 的 `admin_password` 中查看；不要提交或分享该文件。
- 演示账号：`preview_a`、`preview_b`，密码见同一文件的 `demo_password`。
- 默认中文。Clean Theme 已激活；部分插件保留上游英文标签。
- 演示活动 A、B 都是私有 Space。管理员加入两者，演示 A、B 账号分别只加入自己的活动。
- 活动 A 已有帖子、评论、问答、赛程、资源链接和一份私有演示 PDF；Gallery、Messenger 可从原生界面体验。

这是用户已同意的 Space = 活动、Calendar = 活动内赛程方向的预览。原生 Messenger 仍支持多人，本项目一对一限制尚未编码；Q&A 是问答内容和异步交流，不是完整想法群聊。

截图：[主面板](../docs/preview/clean-theme-dashboard.png) · [活动及模块](../docs/preview/clean-theme-space.png)。正式前端仍采用 AffectUI + Shadcn UI Kit；Clean Theme 只服务原生预览。

## 2. 启停

在项目根目录执行：

```sh
python3 backend/deploy/preview.py status
python3 backend/deploy/preview.py start
python3 backend/deploy/preview.py stop
```

`start` 同时启动 MySQL、Web、队列与定时任务；已运行时不会重复创建。`stop` 正常关闭进程，不删除数据库。已经完成初始化，不需要日常重复安装。

部署细节：

- 已验证主机：macOS 15.8.3 / Intel x86_64。PHP 8.5.12、MySQL 9.7.4 位于项目 `.runtime/php-mysql`，不替换系统 PHP/MySQL。
- MySQL 仅 Unix socket，关闭 TCP；Web 为 PHP 本地开发服务器，仅监听 127.0.0.1:8090。它不用于上线，也未进行 300–400 人并发压测。
- 后台队列运行 `yii queue/listen`；项目自己的 scheduler 每分钟执行一次 `yii cron/run`，不修改系统 crontab。队列子进程通过 PHPRC 继承本地扩展配置。
- 邮件使用 file transport，仅保存到本机，不真实发邮件。OAuth、JWT 身份提供方、Firebase、SMTP 未配置。
- `.runtime`、`.env`、账号密码、数据库、日志和上传文件都属于本地状态；不打入分发包。项目 `.local/` 未读取。

## 3. 免费模块状态

19 个扩展包已下载并校验，9 个启用，10 个暂存待配置或适配。核心用户、Space、帖子、评论、通知、Friendship 等不计入这 19 个外部包。当前模块采购 ¥0，700 元预算全部保留。

| 模块 ID | 固定版本 | 状态 / 用途 |
|---|---|---|
| clean-theme | 2.5.3 | 已启用，当前 Clean 主题 |
| rest | 0.12.7 | 已启用，原生 API |
| calendar | 1.9.9 | 已启用，演示活动内赛程 |
| mail | 3.4.6 | 已启用，原生 Messenger |
| gallery | 1.9.1 | 已启用，图集 |
| questions | 1.1.6 | 已启用，内容流中的问答 |
| linklist | 0.9.2 | 已启用，链接清单 |
| text-editor | 1.2.0 | 已启用，原生文件编辑能力 |
| pdf-viewer | 1.1.8 | 已启用，PDF 预览；见权限观察 |
| twofa | 1.4.3 | 已安装未启用，先由管理员完成二次验证配置 |
| auth-github | 1.1.1 | 已安装，待 OAuth 应用和回调配置 |
| auth-google | 1.1.1 | 已安装，待 OAuth 应用和回调配置 |
| jwt-sso | 1.2.1 | 已安装，待确认身份提供方与签名配置 |
| fcm-push | 2.3.2 | 已安装，待 Firebase 项目、服务端凭据和客户端配置 |
| move-content | 2.4.1 | 已安装未启用，保留管理员迁移用途 |
| sharebetween | 1.2.1 | 已安装未启用，先确认分享范围与附件权限 |
| online-users | 1.1.2 | 已安装未启用，项目需要当前活动范围适配 |
| suggestedFollowing | 1.0.0 | 已安装未启用，关注推荐不能直接当活动内找人 |
| auto-follow | 1.1.0 | 已安装未启用，自动关注是实际关系写入 |

Social Stats 市场声明兼容上限为 1.17，本次不安装到 1.19.4。Survey、Advanced Survey、Onboarding Tour、Job Listings 及其他收费包未购买、未安装。

精确下载地址、发布包 SHA256、元数据和启用意图见 [modules.lock.json](modules.lock.json)。Suggested Following 的市场 ID 为 `suggestedfollowing`，包内运行 ID 为 `suggestedFollowing`。

## 4. 核验结果与已知差距

- [浏览器报告](browser-smoke.json)：使用 Microsoft Edge + Playwright，登录、活动、问答、赛程、Gallery、Link List、Messenger、模块管理、PDF 页面和私有 PDF 下载。此测试验证页面，不代表每个模块的所有写操作已验收。
- [访问检查](access-smoke.json)：未认证 API 返回 401；普通成员读取自己的 Space 和帖子成功，另一私有 Space 的 API 返回 403、页面返回 404；普通成员调用管理型 User API 返回 403。
- 私有 PDF：活动成员可下载，非成员和访客返回 401，未获得 PDF 字节。**但 PDF Viewer 的弹窗入口只验证文件类型，已知 GUID 的非成员可在弹窗中看到演示文件名。**本次保留上游代码并明确记录，不将其视为已通过完整附件权限验收。正式接入前，应在插件层统一调用 File 的可读权限检查，覆盖弹窗和独立阅读入口，再做回归。
- [运行时报告](runtime-smoke.json)：真实搜索重建任务由队列完成；cron 成功；完整 stop/start 后四个服务恢复运行。
- 本地 router 阻止直接访问 `.env`、`.runtime`、`protected`、部署脚本及私有上传目录。
- REST 仅为管理员和演示 A 开启 Basic Auth；允许名单使用用户 GUID。没有把管理员凭据提供给前端或模型，也未面向所有用户开启 API。
- [源码核验](source-verification.json)：19 个模块文件与下载包一致；原版参考仓库干净，backend 的已跟踪核心文件未改动，只有 .gitignore 调整。
- [原生个人字段](profile-fields.json) 是实际安装后的字段定义，不含个人资料值。原生字段管理不等于本项目逐条 `authenticated/friends/private` 授权。

原生 People 搜索仍是全站机制；尚未实现服务端当前活动发现、邀请码兑换、十步引导、资料抽取确认、项目想法讨论、推荐或 AI Agent。

项目工作区中的详细对照见 [免费部署与冻结简介对照](../../backend-research/HumHub免费部署与冻结简介对照.md)。冻结原稿未修改。

## 5. 安装包与复建

应用包位于 `backend/dist/humhub-free-preview-1.19.4.tar.gz`；同目录有 `.sha256` 与清单 JSON。包含上游核心、官方构建资源、Composer 依赖、19 个模块、上游随包提供的许可文件和本部署目录。包内不含数据库、账号、`.env`、运行时、日志、上传资料或 Git 历史；解压后的顶层目录即 backend 应用根。

应用包未内置 1.6 GB 的本机运行环境。macOS Intel 机器在安装 micromamba、Xcode Command Line Tools 并具备网络后，可在解压后的应用根运行：

```sh
python3 deploy/setup_runtime.py
python3 deploy/preview.py init
.runtime/php-mysql/bin/php -c .runtime/php.ini deploy/seed_preview.php
```

`init` 生成本机新密码并建立数据库；`seed_preview.php` 只用于创建演示数据。当前主机已按相同依赖锁准备、编译并运行；尚未在另一台空白机器完整复建，不把此记录写成跨平台验证。Apple Silicon / Linux 需另配对应 PHP/MySQL 环境，不能直接使用 osx-64 锁。

来源固定：

- [核心发布包](core-package.lock.json)：HumHub 1.19.4 官方完整发布物，补齐 vendor 和构建资源；Git 跟踪的核心文件与原版一致。
- [运行时锁](runtime-osx-64.lock)：conda-forge 显式依赖。
- [PHP 扩展源码锁](php-extensions.lock.json) 与 [编译脚本](build_php_extensions.sh)：mysqlnd、pdo_mysql、GD。
- [模块下载脚本](fetch_modules.py)：固定版本、核对发布方 SHA256、校验模块 ID；模块文件已包含在应用包中，首次解压不必重复下载。

本机复核命令：

```sh
node backend/deploy/browser_smoke.cjs
node backend/deploy/access_smoke.cjs
python3 backend/deploy/runtime_smoke.py
```

浏览器脚本依赖本地 `.runtime/browser/node_modules/playwright` 1.65.0 和 Microsoft Edge；自动化工具不计入应用安装依赖。需要复建浏览器检查时，在应用根执行 `npm install --prefix .runtime/browser playwright@1.65.0`，并安装 Microsoft Edge。

源码打包在原 Git 工作副本中运行 `python3 deploy/build_bundle.py`；它只收录明确的源码、依赖与部署目录，并检查当前生成的秘密值未进入包内。不包含项目冻结文档或真实用户数据。
