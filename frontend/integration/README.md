# HumHub 同源入口构建桥

最初交付 N03 的账号／当前活动读取与 N04 登录、登录方式关联、退出薄片。宿主适配位于 `../首页/integration/`，复用首页原有 Brand、Button、Input、Providers、Signalry 主题与本地字体；基础组件保持不变。

2026-11-12 推荐接线增量：宿主新增既有白名单 `/matcher/app/discover` 的路由，挂载 `../推荐/integration/recommendation-entry.tsx`。普通发现、本人选择与五维规则分析已连接正式 API；使用同一宿主身份和当前活动，不建立第二份活动状态。GitHub 本人导入状态以只读提示接入，登录呈现沿用首页风格。原推荐独立首页改为未连接提示，原演示在显式 `/demo`；基础组件不改。

合同入口为 `../../docs/睡前全自动运行/04_HumHub实施合同.md` 第7节。HTML及安全 bootstrap 由 matcher-webapp 提供，本包不生成演示 bootstrap，不保存身份、活动、CSRF、邮箱或验证码到浏览器持久存储。登录页读取可用登录方式；发送／重发验证码、验证、GitHub 跳转和退出仅由对应用户操作触发，不自动重试、不上传、不发消息、不调用模型。日夜选择仅保留当前页面内存。

## 构建

在本目录使用 Node 24：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test
npm run build
```

构建会清空并重建唯一输出目录 `../../backend/protected/modules/matcher-webapp/resources/app/`，不修改后端模块逻辑。显式产出 `manifest.json`、`index.html` 入口与哈希JS/CSS/字体。依赖单独锁定；Vite将原目录组件的React解析到本包并检查只有一个运行时。独立index.html不能取代HumHub宿主页面，单独打开会显示bootstrap缺失。

## 验证边界

客户端单测使用合成响应，检查 DTO、同源 URL、CSRF、明确成功回执、重复操作锁、错误、无活动、撤权和晚到响应，不是登录或活动业务正例。构建检查递归 manifest、文件存在性、本地字体逐字一致与绝对路径。浏览器只在主执行者提供的隔离 8113 页面启用后运行，使用独立 browser/context，不占用共享 MCP 页面。

`MATCHER_WEBAPP_RUN=n04 npm run verify:browser` 回归 N03 真实未登录只读入口，输出到 `artifacts/n04/n03-regression/`，不会覆盖已提交的 N03 历史证据；`npm run verify:auth-browser` 读取真实空白登录页和 capabilities，其交互分支使用浏览器拦截的合成响应，禁止任何真实邮箱请求或 OAuth 跳转，输出到 `artifacts/n04/auth/`。只有空白表单或未登录入口截图落盘。必须通过环境变量 `MATCHER_WEBAPP_TEST_URL=http://127.0.0.1:8113/matcher/app` 指定已获准隔离页面。真实邮箱、真实会话写入和 GitHub 回调由主执行者另行验收，不能由客户端模拟测试替代。

邮箱发码要求 HTTP 202，验证／退出要求 HTTP 200 且有明确回执；登录和关联的 `bound` 必须与请求意图一致，成功后完整导航到严格验证的应用根路径以刷新 session/CSRF。HTTP 409 `REGISTRATION_REQUIRED` 仅在 `details.next_url` 精确等于 `/user/registration` 时显示用户主动点击的“补充注册资料”；没有登录成功状态，也不自动跳转。

不得把 `/me` 的合法空昵称补成示例人物；无当前活动是409 CURRENT_EVENT_REQUIRED，不能当未登录。401清投影；403或上下文变化移除旧活动。原生回退仅dashboard/login。

## 推荐接线本批验证

最终构建已更新 `matcher-webapp/resources/app/`，manifest/四个资源/本地字体与单React审计通过。推荐专项自建临时随机端口做隔离验证，不访问或清理已有8113实例。`node ../../docs/推荐模块/sources/verify-recommendation-host_2026-11-12.mjs` 从本目录执行，验证实际生产资源配合合成API的11项宿主行为；不是正式登录或数据库验收。

公共选择PUT使用CSRF，规则分析POST不写资料/关系且0模型；失败不自动重试。主预览尚未由本批执行升级或推荐选择表迁移，真实OAuth、AI与社交仍按各专项验收。[完整范围和测试证据](../../docs/推荐模块/24_候选分析用途适配与登录协同.md)。
