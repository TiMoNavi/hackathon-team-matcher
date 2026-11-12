# matcher-webapp 0.1.0

N03 同源页面与资产宿主，不保存身份、画像、当前活动或业务状态。业务读取继续使用已授权的 /api/v1，登录正向验收属于 N04。

- 页面为 /matcher/app。深链首段仅允许 home、discover、profile、onboarding、messages、ideas、settings、login、events、invitations，最多四段附属安全标识；未知或穿越路径返回 404，绝不转发后端路由或接受任意回跳地址。
- 空页壳使用原生 ControllerAccess，允许未登录用户看到页面资源；现有 API 的身份、账户资格、成员及 CSRF 验证保持不变。页面不依据 bootstrap 授予资格。
- bootstrap 只有合同规定的七个字段，CSRF 为当前请求掩码值。JSON 使用 HTML 安全编码，脚本采用 HumHub nonce；不增加 CSP 放宽设置。
- 构建由前端写入 resources/app/，必须提供固定 index.html 和 manifest.json；Vite build.manifest 设为 manifest.json，入口键为 index.html，相对资源基址为 ./。宿主不渲染构建 HTML。
- 静态与动态 imports、CSS、字体及图片必须存在于该发布目录。拒绝外部 URL、编码或普通穿越、符号链接、循环与丢失依赖；只复制验证后的资源。静态依赖 CSS 按依赖顺序加载，动态资源由构建运行时按需加载。
- 发布先决条件为原生 AssetManager 的 linkAssets=false，且发布 URL 为同源站内路径。环境使用符号链接发布或 CDN 地址时明确 503，不修改全局 AssetManager 配置。资源缺失／校验失败也显示 503 和原生 dashboard/login 回退。
- Module::$uiEnabled 默认 true；模块自身 setting uiEnabled=0 撤回页面和账户菜单，路由为 404。设置为 1 恢复。此过程不调用模块 disable/remove，不改动隐私层，不删除数据。隔离环境由 harness 的固定 ui-on／ui-off 执行。

离线验证（无需数据库、服务或凭据）：

    backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-webapp/tests/run.php

测试使用临时合成资产，覆盖依赖图、路径与同源限制、缺失资源、bootstrap 注入与字段白名单、开关和受限深链。它不能代替真实 HTTP、浏览器和登录验收。
