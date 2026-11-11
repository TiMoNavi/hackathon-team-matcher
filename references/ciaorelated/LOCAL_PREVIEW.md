# 本地运行记录

2026-11-11，基于上游提交 `4c1c08445d9c2b7d37e40e63d09e94ee059501e1`。这是第三方参考项目的本地试运行，不代表 hackathon-team-matcher 目标应用已经实现。

## 打开预览

- 主应用 Web 预览：<http://localhost:8081/>
- 官网：<http://127.0.0.1:4173/>
- GraphQL：<http://127.0.0.1:4010/graphql>

主应用切换到 Email 登录，使用专门创建的本地测试账号：

- 邮箱：`preview@example.test`
- 密码：`CiaoPreview2026!`

账号只存在于本地预览数据库。已通过真实 GraphQL 接口执行注册、登录、开发验证码验证、条款接受和引导完成。城市 Vienna 和兴趣 Technology 是测试数据。没有配置邮件服务，验证码仅在本地生成；没有向真实收件人发信。首页为空数据状态，没有导入真实用户或帖子。

## 启停

在本目录执行：

```sh
python3 .preview/manage.py status
python3 .preview/manage.py start
python3 .preview/manage.py stop
```

预览工具、Node 22、数据库、日志和截图位于 `.preview/`，通过本仓库 `.git/info/exclude` 排除。环境文件同样被忽略，服务端使用随机生成的本地 JWT 密钥。所有服务只监听本机地址。不要将预览账号或浏览器存储适配用于正式部署。

## 本次验证

- 服务端 Prisma Client 生成和 TypeScript 编译通过。
- GraphQL 服务、注册、登录、当前用户、验证码和引导接口可用。
- 官网通过浏览器实际渲染检查，未捕获页面异常。
- 主应用经本地 Web 适配后显示登录页，并通过浏览器登录进入首页。
- 仓库社区回归测试实际运行结果：112 项，108 通过，4 跳过，0 失败。
- 跳过项包括真实 PostgreSQL 并发、迁移校验和、隐私触发器及启用排名的发布预检；不能据此声称这些检查通过。
- 登录切换时捕获两次 Apollo 异常：`Store reset while query was in flight`。首页仍显示，异常保留为上游待调查问题。

## 为启动做的调整

1. 上游锁文件与 package.json 不一致，严格锁文件安装失败。使用 pnpm 10.8.0 重新解析，保留更新后的 `pnpm-lock.yaml`。
2. `apps/ciaorelated/app.config.js` 对未设置的可选域名调用 `.trim()`，已增加空值处理。
3. Metro 增加 `CIAO_BROWSER_PREVIEW=1` 开关，仅在 Web 预览时使用 `.preview/` 中的适配：原生颜色矩阵改为 SVG 滤镜，SecureStore 改为浏览器 sessionStorage。关闭标签页会结束预览会话；这不是原生安全存储。
4. 本机没有 PostgreSQL、Docker 或 Xcode 模拟器，使用持久化 PGlite 和本地 socket。数据库沿用仓库测试的历史 schema 基线，再应用后续七份实际迁移；不是完整 PostgreSQL 安装或全历史迁移验证。预览连接使用单连接，不用于并发压测。

照片上传、推送、相机和原生媒体能力未验证，未配置 S3、Twilio 或 SendGrid。安装过程中还出现原生动画等依赖的 peer 版本警告；Web 可显示不能证明 iOS/Android 构建兼容。

## 文件

- `.preview/landing.png`：官网截图。
- `.preview/mobile.png`：登录页截图。
- `.preview/feed.png`：登录后首页截图。
- `.preview/regression.log`：本次完整回归测试输出。
- `.preview/server-build.log`：服务端构建输出。
- `.preview/browser-check.log`、`.preview/login-check.log`：浏览器检查记录。

这些本地辅助文件未提交或推送。
