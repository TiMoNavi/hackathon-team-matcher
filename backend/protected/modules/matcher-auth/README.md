# matcher-auth 0.1.0

N04 认证适配插件。身份与会话事实仍由 HumHub user、user_auth、session 管理。本模块只增加验证码、限速、一次性注册／OAuth 续接收据、并发所有权防护和首次 GitHub 来源处理收据。源码和合成测试不表示真实 GitHub 授权、邮箱投递、本人注册或登录已经验收。

## 装配

依赖 HumHub 1.19.4、auth-github 1.1.1、matcher-user-profile 0.10.0、matcher-github-import 0.1.1。运行自身迁移后启用，不改核心或其他插件。

- Module::challengeSecret 为独立至少 32 字节服务端随机密钥，不复用 OAuth／SMTP 凭据，不暴露给页面或日志。
- Module::emailEnabled 默认 false；emailAllowlist 默认空且拒发。测试环境只由集成人填入获准测试邮箱。
- Module::mailAdapter 接受 domain/ports/OtpMailer，available(): bool；send(string $email, string $code, int $expiresIn): bool。false 或异常均报 MAIL_DELIVERY_FAILED，不伪造投递成功。未注入时使用原生 Yii mailer，file transport 明确不可用。专用 SMTP 适配可让其他原生通知继续 file transport。
- Module::githubEnabled 默认 true；GitHub enabled/clientId/clientSecret 沿用 auth-github 的私有 settings。客户端固定 GitHub HTTPS 端点及 CurlTransport，不跟随重定向；HTTP 请求日志使用固定脱敏文本。
- 用户模块 allowUserRegistrationFromAuthClientIds 可显式配置 github、email-code；anonymousRegistration 仍可为 false、showRegistrationForm 仍可为 false。原生审批、停用、来源允许列表及维护状态保留；不会用可信 UserSource claim 绕过资格。
- 宿主 bootstrap 数组必须在 ModuleAutoLoader 之后、LanguageSelector 之前加入 humhub\modules\matcherAuth\adapters\http\AuthRequestBootstrap。HumHub 的语言 bootstrap 会在 controller 前读取 POST；该正式每请求 bootstrap 仅让本插件三个精确 JSON POST 端点将 rawBody 留给自己的严格解析，CSRF 仍取 X-CSRF-Token。它不替换全局 parser，原生表单和其他 API 不变，不依赖模块发现／URL 缓存是否命中。没有这个装配点时，畸形 JSON 可能过早由宿主错误处理器返回，不能声称统一包络已通过。
- beforeRequest 使用 user.controllerMap 正式扩展点替换原生 auth／registration，并注册受控 GitHub 与 email-code 客户端。如另一个非原生安全 controller 占有映射，则本插件不可用并移除两个客户端，避免旧路径继续进行自动邮箱合并或身份移动。

## HTTP 合同

成功为 data、meta.request_id，失败为 error={code,message,retryable:false,details}、meta.request_id；request_id 为 24 位小写十六进制。认证请求不自动重试，用户需明确操作。

| 方法与路径 | 合同 |
|---|---|
| GET /api/v1/auth/capabilities | email_available、github_available 布尔值，不返回配置 |
| POST /api/v1/auth/email-codes | email、purpose=login/bind、return_to=/matcher/app；202 challenge_id=challenge-加48位hex、expires_in=600、resend_after=60 |
| POST /api/v1/auth/email/verify | challenge_id、六位数字字符串 code；只有实际原生会话建立后200 authenticated=true、bound、next_url=/matcher/app |
| POST /api/v1/auth/logout | 空JSON对象；真实注销后200 authenticated=false |
| GET /api/v1/auth/github/start | intent=login/bind、return_to=/matcher/app；真实重定向至原生 GitHub OAuth 路径 |
| GitHub callback | 保留 /user/auth/external?authclient=github；原生 OAuth state 校验，不伪造 callback |

原生首次注册需要本人补齐必填字段，邮箱兑换因此可返回409 REGISTRATION_REQUIRED，details.next_url唯一为/user/registration；此时尚未登录。表单只认15分钟有效、浏览器／provider／subject／用途绑定的一次性服务端收据，不填OAuth姓名头像，不伪造姓名，不关闭required。提交重新固定已验证邮箱与原生来源，事务内register(null)、安全插入user_auth、消费收据，然后调用完整原生登录路径；待审批不登录。P1确认nickname/avatar仍由原有确认流程决定。

主要错误为400 INVALID_REQUEST／INVALID_EMAIL／INVALID_CODE／CHALLENGE_INVALID，401 AUTHENTICATION_REQUIRED，403 ACCOUNT_UNAVAILABLE／AUTH_LOGIN_FAILED，409 IDENTITY_CONFLICT／CHALLENGE_USED／REGISTRATION_REQUIRED，410 CHALLENGE_EXPIRED，429 RATE_LIMITED，503 AUTH_UNAVAILABLE／MAIL_DELIVERY_FAILED。429同时给Retry-After头及details.retry_after。格式／体积错误还可为415或413 INVALID_REQUEST。GitHub失败回跳只使用固定auth_error枚举 cancelled、failed、identity_conflict、account_unavailable、registration_required、unavailable；UI关闭时保留原生登录回退。

## 安全与首次导入

验证码仅持久化HMAC，10分钟有效，60秒重发，邮箱3次/10分钟、验证5次/15分钟及单码5次错误集中管理。邮件失败仍消耗发送频率预算；重发使旧码失效，晚到SMTP结果不能复活旧码。用途、浏览器与发起actor绑定，guest POST也启用CSRF。数据库锁统一先email，MySQL使用当前读避免REPEATABLE READ旧快照，SQLite用首条写锁；消费单次且并发不会双成功。

不调用原生自动邮箱匹配或会移动绑定的add()。同source+subject冲突即拒绝；当前所有者、原生邮箱拥有者及本模块唯一防护claim交叉核对。claim只是不可静默转移的并发防线，登录和授权始终重新读取原生user_auth。不按相同邮箱合并账号；已有账户应先用原登录方式进入，再显式绑定。

GitHub只取经OAuth验证的本人ID及primary+verified邮箱，不复制OAuth公开名片。确实新建身份或本人显式绑定时写持久导入意图；绑定稳定且会话成功后，沿P1现有owner锁检查包括已删除来源在内的历史，再执行现有同步公开来源读取。只使用本人公开来源，不启动模型；失败保留failed收据和现有失败source/job，不回滚登录、不在普通登录时自动重试。已删除来源不复活，重复登录不会新增导入。进程在running时中断也不会被普通登录隐式重跑。

## 离线验证

以下均只使用合成值、临时SQLite或纯容器，不读取实际数据库、凭据，不发送邮件、不调用GitHub：

    backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-auth/tests/run.php
    backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-auth/tests/binding.php
    backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-auth/tests/events.php
    backend/.runtime/php-mysql/bin/php -n backend/protected/modules/matcher-auth/tests/imports.php

包括验证码时序／限速／重放／发送失败、跨进程消费和身份抢绑、所有权冲突、原生controller映射冲突封闭、首次导入成功／失败／删除历史。最终仍需真实邮件收取兑换、GitHub本人授权、原生必填注册、session刷新与未登录/CSRF/权限负例；不能把这些离线结果当作N04真实认证完成。
