# HumHub 插件官方资料汇编

> 核查日期：2026-11-11（Asia/Shanghai）。本地参考底座：HumHub v1.19.4。
> 本文收录本轮 **23 个用户候选插件（含后续确认的 Clean Theme）+ 1 个必需依赖 Survey，共 24 项**；附录另列此前讨论过的 Advanced Profile。
> 官方资料采用中文归纳，保留产品能力、依赖、价格、版本及来源，不整页转载营销文案。选型结论见 [插件适配与预算分析](HumHub插件适配与预算分析.md)。
> **阶段更新**：最初为公开资料调研；后续已按用户授权部署免费预览，19 个扩展包已安装、9 个启用，包含 Clean Theme。实际状态与检查见 [部署说明](../backend/deploy/README.md) 和 [冻结简介对照](HumHub免费部署与冻结简介对照.md)。没有购买收费模块或实施产品业务插件。

## 1. 阅读口径

- “免费”指市场模块标价；不代表托管、邮件、存储、模型调用和二次开发零成本。
- “官方发布”与“社区/第三方发布”按页面 Publisher 区分；市场收录不等于 HumHub 核心团队承诺维护。
- 版本表记录核查时页面显示的最新版本；兼容区间为市场声明，不是本项目实测结论。覆盖 1.19 不等于所有组合已在 1.19.4 验证。
- 每节附介绍、下载目录和更新日志等入口。提供下载链接不表示已经下载或有权取得收费包。
- 接口仅记录本轮明确找到的公开说明；“未确认”不等于断言插件完全没有 API。
- 本轮主清单有 **20 项免费、4 项单独收费**，没有页面将它们标为只能购买 Professional 才能使用；第三方付费包是否被某商业套餐包含仍须看具体合同，不能默认全包。

## 2. 价格、版本与维护方

| # | 模块 / ID | 标价 | 页面最新版本 / 发布日 | 发布方 | 页面兼容范围 |
|---|---|---:|---|---|---|
| 01 | [Calendar](https://marketplace.humhub.com/module/calendar/description) / calendar | 免费 | 1.9.9 / 2026-11-09 | HumHub GmbH & Co. KG | HumHub 0.8 - 1.19 |
| 02 | [Messenger](https://marketplace.humhub.com/module/mail/description) / mail | 免费 | 3.4.6 / 2026-10-04 | HumHub GmbH & Co. KG | HumHub 0.5 - 1.19 |
| 03 | [Gallery](https://marketplace.humhub.com/module/gallery/description) / gallery | 免费 | 1.9.1 / 2026-10-13 | HumHub Community | HumHub 1.2 - 1.19 |
| 04 | [Q&A](https://marketplace.humhub.com/module/questions/description) / questions | 免费 | 1.1.6 / 2026-11-04 | HumHub GmbH & Co. KG | HumHub 1.14 - 1.19 |
| 05 | [JWT SSO](https://marketplace.humhub.com/module/jwt-sso/description) / jwt-sso | 免费 | 1.2.1 / 2026-11-04 | HumHub GmbH & Co. KG | HumHub 1.4 - 1.19 |
| 06 | [Push Notifications (Firebase)](https://marketplace.humhub.com/module/fcm-push/description) / fcm-push | 免费 | 2.3.2 / 2026-10-28 | HumHub GmbH & Co. KG | HumHub 1.4 - 1.19 |
| 07 | [Link List](https://marketplace.humhub.com/module/linklist/description) / linklist | 免费 | 0.9.2 / 2026-10-13 | HumHub Community | HumHub 0.8 - 1.19 |
| 08 | [RESTful API](https://marketplace.humhub.com/module/rest/description) / rest | 免费 | 0.12.7 / 2026-11-08 | HumHub GmbH & Co. KG | HumHub 1.3 - 1.19 |
| 09 | [Two-Factor Authentication (2FA)](https://marketplace.humhub.com/module/twofa/description) / twofa | 免费 | 1.4.3 / 2026-10-26 | HumHub GmbH & Co. KG | HumHub 1.8 - 1.19 |
| 10 | [Google Sign-In](https://marketplace.humhub.com/module/auth-google/description) / auth-google | 免费 | 1.1.1 / 2026-08-01 | HumHub Community | HumHub 1.6 - 1.19 |
| 11 | [GitHub Sign-In](https://marketplace.humhub.com/module/auth-github/description) / auth-github | 免费 | 1.1.1 / 2026-07-08 | HumHub Community | HumHub 1.6 - 1.19 |
| 12 | [Survey](https://marketplace.humhub.com/module/survey/description) / survey | 90 € | 2.13.2 / 2026-10-29 | CUZY.app | HumHub 1.7 - 1.19 |
| 13 | [Advanced Survey](https://marketplace.humhub.com/module/survey-advanced/description) / survey-advanced | 45 € | 1.13.1 / 2026-10-29 | CUZY.app | HumHub 1.8 - 1.19 |
| 14 | [Move content and users](https://marketplace.humhub.com/module/move-content/description) / move-content | 免费 | 2.4.1 / 2026-10-27 | CUZY.app | HumHub 1.13 - 1.19 |
| 15 | [Social Stats](https://marketplace.humhub.com/module/social_stats/description) / social_stats | 免费 | 1.1.3 / 2025-05-17 | zConsulting.net | HumHub 1.12 - 1.17 |
| 16 | [Share content](https://marketplace.humhub.com/module/sharebetween/description) / sharebetween | 免费 | 1.2.1 / 2026-10-13 | HumHub GmbH & Co. KG | HumHub 1.14 - 1.19 |
| 17 | [Online Users](https://marketplace.humhub.com/module/online-users/description) / online-users | 免费 | 1.1.2 / 2026-10-27 | HumHub GmbH & Co. KG | HumHub 1.16 - 1.19 |
| 18 | [Job Listings](https://marketplace.humhub.com/module/joblistings/description) / joblistings | 90 € | 2.0.0 / 2026-09-03 | Green Meteor | HumHub 1.16 - 1.19 |
| 19 | [Text editor](https://marketplace.humhub.com/module/text-editor/description) / text-editor | 免费 | 1.2.0 / 2026-06-05 | HumHub GmbH & Co. KG | HumHub 1.10 - 1.19 |
| 20 | [PDF Viewer](https://marketplace.humhub.com/module/pdf-viewer/description) / pdf-viewer | 免费 | 1.1.8 / 2026-10-17 | HumHub GmbH & Co. KG | HumHub 1.18 - 1.19 |
| 21 | [Suggested Following](https://marketplace.humhub.com/module/suggestedfollowing/description) / suggestedfollowing | 免费 | 1.0.0 / 2026-06-10 | Green Meteor | HumHub 1.18 - 1.19 |
| 22 | [Onboarding Tour](https://marketplace.humhub.com/module/onboarding/description) / onboarding | 90 € | 1.0.3 / 2026-09-14 | Felix Webdesign | HumHub 1.18 - 1.19 |
| 23 | [Auto Follow](https://marketplace.humhub.com/module/auto-follow/description) / auto-follow | 免费 | 1.1.0 / 2025-08-23 | HumHub Community | HumHub 1.2 - 1.19 |

| 24 | [Clean Theme](https://marketplace.humhub.com/module/clean-theme/description) / clean-theme | 免费 | 2.5.3 / 2026-11-01 | CUZY.app | 市场 1.12–1.19；此发布包要求 1.19.0+ |

**优先检查：Social Stats 的声明上限为 1.17；当前底座为 1.19.4，暂不直接启用。**

## 3. 逐项介绍

### 01. Calendar（calendar）

**原生能力**：在 Space 或个人资料中维护日程，支持一次性和重复日程、参与者管理、提醒、描述与附件、全站日程概览；可设置全局及空间默认值，导出 ICS。官方列出的集成对象有 Tasks、Meetings 和 External Calendar。

**依赖与接口**：REST 手册明确列出 Calendar API；具体读写权限仍须按普通成员身份验证。日历条目与 Space 成员关系是不同对象，日程报名不能直接视为加入本项目活动。

**来源**：[官方介绍](https://marketplace.humhub.com/module/calendar/description) · [开发文档](https://marketplace.humhub.com/module/calendar/developer) · [下载目录](https://marketplace.humhub.com/module/calendar/downloads) · [许可](https://marketplace.humhub.com/module/calendar/licence) · [更新日志](https://marketplace.humhub.com/module/calendar/changelog) · [公开仓库](https://github.com/humhub/calendar)。

### 02. Messenger（mail）

**原生能力**：私密会话、消息、文件附件、富文本格式、会话标签与置顶。原生系统可以维护多个会话参与者，不能把“本项目仅用于一对一”写成插件天然只支持两人。

**依赖与接口**：REST 手册列出 Mail API；官方公开代码包含添加参与者的入口。本项目限制两人时，需要同时约束创建、加人和旧入口。参考 [参与者控制器](https://github.com/humhub/mail/blob/master/controllers/rest/UserController.php)；此链接为动态分支；后续已安装固定包 3.4.6 并检查原生页面，但没有实施或验收本项目一对一限制。

**来源**：[官方介绍](https://marketplace.humhub.com/module/mail/description) · [开发文档](https://marketplace.humhub.com/module/mail/developer) · [下载目录](https://marketplace.humhub.com/module/mail/downloads) · [许可](https://marketplace.humhub.com/module/mail/licence) · [更新日志](https://marketplace.humhub.com/module/mail/changelog) · [公开仓库](https://github.com/humhub/mail)。

### 03. Gallery（gallery）

**原生能力**：为空间和个人资料提供相册；支持多层子相册、拖拽上传、图片描述、从信息流打开相册、从图片返回原帖、轮播展示，以及管理权限、评论和点赞。

**依赖与接口**：本轮简介未明确给出独立 REST 接口。它是图片整理和展示工具；不能从这些能力推断已具备想法、协作角色、申请状态等业务模型。

**来源**：[官方介绍](https://marketplace.humhub.com/module/gallery/description) · [开发文档](https://marketplace.humhub.com/module/gallery/developer) · [下载目录](https://marketplace.humhub.com/module/gallery/downloads) · [许可](https://marketplace.humhub.com/module/gallery/licence) · [更新日志](https://marketplace.humhub.com/module/gallery/changelog) · [公开仓库](https://github.com/humhub-contrib/gallery)。

### 04. Q&A（questions）

**原生能力**：发布问题、提交回答、对回答赞成或反对；提问者或管理员可将最佳答案置顶，适用于社区求助与经验交流。

**依赖与接口**：免费、HumHub 官方发布。当前 REST 手册的模块目录未列 Q&A；这只是文档覆盖结论，不能断言不存在任何接口。接入自建前端前，需验证提问、回答、投票、最佳答案和空间权限。

**来源**：[官方介绍](https://marketplace.humhub.com/module/questions/description) · [下载目录](https://marketplace.humhub.com/module/questions/downloads) · [更新日志](https://marketplace.humhub.com/module/questions/changelog) · [公开仓库](https://github.com/humhub/questions)。

### 05. JWT SSO（jwt-sso）

**原生能力**：接收其他应用签发的 JWT，在 HumHub 中完成用户注册或登录。它只提供 SSO 的 HumHub 一侧，需要外部可信身份签发方，不能独立完成邮箱验证码登录。

**手册补充**：登录载荷可映射资料字段，并在每次登录时写入；1.19 的可选 User Source 还可锁定由身份提供方管理的字段。因此接入本项目时应限制为身份所需字段，不能覆盖用户已确认的画像。

**接口边界**：浏览器登录 SSO 与 REST API 认证是两条能力；不能因为都使用 token 就认定可以互换。

**来源**：[官方介绍](https://marketplace.humhub.com/module/jwt-sso/description) · [手册](https://marketplace.humhub.com/module/jwt-sso/manual) · [下载目录](https://marketplace.humhub.com/module/jwt-sso/downloads) · [更新日志](https://marketplace.humhub.com/module/jwt-sso/changelog) · [公开仓库](https://github.com/humhub/jwt-sso)。

### 06. Push Notifications (Firebase)（fcm-push）

**原生能力**：通过 Google Firebase 发送桌面和移动通知，用户和管理员可配置通知触发条件；官方推荐与 PWA、移动应用结合。Brave 默认配置可能需要启用 Google 推送服务。

**外部依赖**：需要 Firebase 项目、Web App、Web Push 密钥配置和服务端账户配置。安装手册列明接入步骤；服务端账户私钥应留在后端。

**费用事实**：模块免费；[Firebase 官方价目](https://firebase.google.com/pricing) 将 FCM 标为 No-cost。其他云资源、服务器和投递运维不因此全部免费。

**来源**：[官方介绍](https://marketplace.humhub.com/module/fcm-push/description) · [安装说明](https://marketplace.humhub.com/module/fcm-push/installation) · [开发文档](https://marketplace.humhub.com/module/fcm-push/developer) · [下载目录](https://marketplace.humhub.com/module/fcm-push/downloads) · [许可](https://marketplace.humhub.com/module/fcm-push/licence) · [更新日志](https://marketplace.humhub.com/module/fcm-push/changelog) · [公开仓库](https://github.com/humhub/fcm-push)。

### 07. Link List（linklist）

**原生能力**：在 Space 或个人资料添加链接列表，按类别组织链接，并围绕链接交流。

**依赖与接口**：本轮简介没有声明专门 REST 接口。链接分享适合项目仓库、演示站点和资源合集；链接列表不是网页内容抓取或 AI 阅读服务。

**来源**：[官方介绍](https://marketplace.humhub.com/module/linklist/description) · [下载目录](https://marketplace.humhub.com/module/linklist/downloads) · [更新日志](https://marketplace.humhub.com/module/linklist/changelog) · [公开仓库](https://github.com/humhub-contrib/linklist)。

### 08. RESTful API（rest）

**原生能力**：向 HumHub 多个子系统提供 HTTP 接口。手册列出的核心对象包括用户、内容、帖子、评论、点赞、动态、认证、文件、通知、空间和内容主题；模块目录还列 Calendar、CFiles、Tasks、Wiki、Mail、Meeting、Polls 和 Survey。

**安装与接口**：需要启用 URL Rewriting，并在模块管理中配置 API key。文档使用 /api/v1/，提供 OpenAPI 3、HTML 文档及 Postman 集合。

**已知状态**：仍标注 Beta，后续版本可能变更接口。存在 User API 不代表普通用户可以直接调用管理员资料编辑接口；API 目录中的 Activity 指平台动态，也不能等同本项目活动。

**来源**：[官方介绍](https://marketplace.humhub.com/module/rest/description) · [手册](https://marketplace.humhub.com/module/rest/manual) · [开发文档](https://marketplace.humhub.com/module/rest/developer) · [下载目录](https://marketplace.humhub.com/module/rest/downloads) · [更新日志](https://marketplace.humhub.com/module/rest/changelog) · [公开仓库](https://github.com/humhub/rest)。

### 09. Two-Factor Authentication (2FA)（twofa）

**原生能力**：在既有登录之上增加第二道验证；支持邮件二次验证和 TOTP 验证器，可按用户组要求启用，官方描述称管理员默认启用。

**边界**：它不是无密码邮箱验证码注册/登录的替代模块。OAuth、JWT SSO 与 API 认证是否经过同样的二次验证，需要分别测试，不能从登录页面效果推断全部入口。

**来源**：[官方介绍](https://marketplace.humhub.com/module/twofa/description) · [开发文档](https://marketplace.humhub.com/module/twofa/developer) · [下载目录](https://marketplace.humhub.com/module/twofa/downloads) · [更新日志](https://marketplace.humhub.com/module/twofa/changelog) · [公开仓库](https://github.com/humhub/humhub-modules-twofa)。

### 10. Google Sign-In（auth-google）

**原生能力**：通过 Google OAuth 2.0 注册和登录，在 HumHub 原生登录页增加 Google 按钮。

**配置**：创建 Google OAuth 客户端，填写 Client ID、Client Secret 及回调地址；简介列出 PHP 7.4+ 和 allow_url_fopen 要求。这只是插件的最低条件，仍须满足 HumHub 1.19.4 自身的运行要求。

**边界**：不自动提供本项目资料引导、活动邀请或 AI 画像；与 GitHub、邮箱账号合并的规则还需设计与验证。

**来源**：[官方介绍](https://marketplace.humhub.com/module/auth-google/description) · [下载目录](https://marketplace.humhub.com/module/auth-google/downloads) · [许可](https://marketplace.humhub.com/module/auth-google/licence) · [更新日志](https://marketplace.humhub.com/module/auth-google/changelog) · [公开仓库](https://github.com/humhub-contrib/auth-google)。

### 11. GitHub Sign-In（auth-github）

**原生能力**：通过 GitHub OAuth 2.0 注册和登录，在 HumHub 原生登录页增加 GitHub 按钮。

**配置**：需要 GitHub OAuth App、Client ID、Client Secret 和对应回调地址。

**边界**：登录身份接入不能证明已实现用户公开仓库抽取、简历理解和画像确认。首次注册公开来源导入需要另一个按用户规则执行的用例，普通再次登录不自动重抓。

**来源**：[官方介绍](https://marketplace.humhub.com/module/auth-github/description) · [下载目录](https://marketplace.humhub.com/module/auth-github/downloads) · [许可](https://marketplace.humhub.com/module/auth-github/licence) · [更新日志](https://marketplace.humhub.com/module/auth-github/changelog) · [公开仓库](https://docs.github.com/en/developers/apps/creating-an-oauth-app)。

### 12. Survey（survey）

**原生能力**：在 Space 或全站建立问卷，字段包括短文、长文、日期、数值、单选、多选、下拉、星级、地图定位、文件、标题和说明；支持字段数量配置、翻译、增删改查权限与未答用户提醒。

可配置开关状态、答案及作者可见性、回答次数、修改权限、用户组范围；支持草稿/自动保存、复制答案、列表/网格/地图/图表查看、过滤、CSV/XLSX 导出，以及有恢复链接的访客回答。

**关键接口限制**：简介明确写 REST API 为 GET only；已核查其 [Survey API 文档](https://marketplace.humhub.com/module/survey/docs/swagger/survey.html)。不能据此承诺自建前端已有提交和更新答案的 JSON API。

**价格**：€90，含一年更新与支持；后续更新与支持 €45/年。Advanced Survey 是另购增强模块。

**来源**：[官方介绍](https://marketplace.humhub.com/module/survey/description) · [下载目录](https://marketplace.humhub.com/module/survey/downloads) · [许可](https://marketplace.humhub.com/module/survey/licence) · [更新日志](https://marketplace.humhub.com/module/survey/changelog)。

### 13. Advanced Survey（survey-advanced）

**必需依赖**：必须先安装并启用 Survey。它不是可以单独使用的 €45 表单系统。

**增强能力**：以下功能可选启用。

- 短代码嵌入回答列表、网格、地图、摘要或表单；按日期、资料字段、URL 参数预填。
- 答案点赞；复用现有问卷或 JSON 模板，导出模板；根据每条回答生成子问卷。
- 答案状态审核：待处理、拒绝、可见、归档；配置本人删除和标记完成。
- 新答案、长期开放问卷的网页/邮件提醒；向全部答卷人通知或邀请加入另一空间。
- 从个人资料菜单查看本人答案；每份问卷可附加 CSS，系统管理员可附加 JavaScript。

**价格**：€45，含一年更新与支持；后续 €25/年。**连同基础 Survey 首年 €135，后续更新与支持合计 €70/年。**这些能力没有声明 AI 回复、画像确认版本或逐字段好友可见性。

**来源**：[官方介绍](https://marketplace.humhub.com/module/survey-advanced/description) · [下载目录](https://marketplace.humhub.com/module/survey-advanced/downloads) · [许可](https://marketplace.humhub.com/module/survey-advanced/licence) · [更新日志](https://marketplace.humhub.com/module/survey-advanced/changelog)。

### 14. Move content and users（move-content）

**原生能力**：管理员在用户之间、空间之间迁移内容；可以带上评论、点赞、文件、主题，也可迁移空间或用户组成员。典型用途是重复账号合并、内容交接和空间合并。

**真实迁移语义**：空间迁移可选择内容和/或成员；成员搬迁通常从源空间移除并按原角色加入目标，空间所有者除外。需要的内容模块会在目标空间启用；同名主题会合并，同名 Wiki 页面会重命名。

**官方提示**：只迁内容不迁成员，可能删除日历参与或任务指派；只迁成员不迁内容，原空间访问权及任务指派也可能变化。它不是无损归档或自动公开发布工具。简介明确列出免费及 GNU AGPL。

**来源**：[官方介绍](https://marketplace.humhub.com/module/move-content/description) · [下载目录](https://marketplace.humhub.com/module/move-content/downloads) · [许可](https://marketplace.humhub.com/module/move-content/licence) · [更新日志](https://marketplace.humhub.com/module/move-content/changelog) · [公开仓库](https://github.com/cuzy-app/move-content)。

### 15. Social Stats（social_stats）

**原生能力**：管理员查看整体社区活动统计及小时、每日图表。历史数据从启用后逐步积累，初期可能为空。

**数据口径**：登录统计是特定时间内至少登录或续期一次会话的独立用户数，不能当作历史登录事件总次数。页面明确提醒，卸载会销毁该模块历史图表数据。

**兼容性**：当前市场标签为 HumHub 1.12–1.17，没有覆盖本地 1.19.4；这表示待验证，不等于已证实不可用。它也没有声明本项目注册—入活动—好友—私聊转化漏斗。

**来源**：[官方介绍](https://marketplace.humhub.com/module/social_stats/description) · [下载目录](https://marketplace.humhub.com/module/social_stats/downloads) · [更新日志](https://marketplace.humhub.com/module/social_stats/changelog) · [公开仓库](https://github.com/petersphilo/humhub-social_stats)。

### 16. Share content（sharebetween）

**原生能力**：在多个 Space 之间分享内容，选择目标空间，可承载文字、图片、音视频等内容；官方描述强调减少重复发布。

**待验证**：简介未充分说明跨空间分享后的访问判定、源内容变私有或删除后的行为、附件和评论的权限，以及它采用引用还是复制的全部细节。本项目不能只凭“Share”字样开启跨活动传播。

**来源**：[官方介绍](https://marketplace.humhub.com/module/sharebetween/description) · [下载目录](https://marketplace.humhub.com/module/sharebetween/downloads) · [更新日志](https://marketplace.humhub.com/module/sharebetween/changelog)。

### 17. Online Users（online-users）

**原生能力**：在仪表盘的小组件显示当前在线用户，帮助用户判断谁近期活跃、可能方便交流。

**边界**：简介没有声明按当前 Space 限定候选、业务画像筛选或队友排序。在线状态只能是本项目推荐的一项可选信号；单独启用全站在线列表不满足活动边界。

**来源**：[官方介绍](https://marketplace.humhub.com/module/online-users/description) · [下载目录](https://marketplace.humhub.com/module/online-users/downloads) · [更新日志](https://marketplace.humhub.com/module/online-users/changelog) · [公开仓库](https://github.com/humhub/online-users)。

### 18. Job Listings（joblistings）

**原生能力**：职位列表及分类、职位发布和申请、管理员审核与管理、收到申请后的通知。市场摘要还列出薪酬、远程/雇佣筛选、申请流程状态及内部备注、收藏和到期处理；各项以实际版本验证为准。

**依赖**：简介列出 HumHub 1.16+、PHP 8.1+、MySQL 5.7+ 和 Pretty URL；它们不覆盖整个部署环境的全部要求。

**价格与维护**：€90，Green Meteor 发布；当前页面标为未由 HumHub 核心团队测试或维护的社区模块。描述/许可页未给出足够明确的后续更新费用，不能写成终身免费更新。

**来源**：[官方介绍](https://marketplace.humhub.com/module/joblistings/description) · [下载目录](https://marketplace.humhub.com/module/joblistings/downloads) · [许可](https://marketplace.humhub.com/module/joblistings/licence) · [更新日志](https://marketplace.humhub.com/module/joblistings/changelog)。

### 19. Text editor（text-editor）

**原生能力**：浏览、编辑上传的纯文本文件，显示行号与语法高亮；可在配置中开启新建纯文本文件。

**边界**：它是附件工具，不是帖子富文本编辑器的总开关，也不是 AI 文档编辑或在线 IDE。独立 React 前端是否复用原生编辑界面，需要另行评估。

**来源**：[官方介绍](https://marketplace.humhub.com/module/text-editor/description) · [下载目录](https://marketplace.humhub.com/module/text-editor/downloads) · [更新日志](https://marketplace.humhub.com/module/text-editor/changelog)。

### 20. PDF Viewer（pdf-viewer）

**原生能力**：浏览器内打开 PDF，提供全屏演示、页面侧栏、旋转及奇数跨页显示等阅读能力。

**边界**：提供预览不能证明具备简历字段抽取、OCR 或 AI 分析。用于简历时仍须复用私有文件鉴权；不能为了让预览成功而把原始简历改成公共 URL。

**来源**：[官方介绍](https://marketplace.humhub.com/module/pdf-viewer/description) · [安装说明](https://marketplace.humhub.com/module/pdf-viewer/installation) · [下载目录](https://marketplace.humhub.com/module/pdf-viewer/downloads) · [更新日志](https://marketplace.humhub.com/module/pdf-viewer/changelog) · [公开仓库](https://github.com/humhub/pdf-viewer)。

### 21. Suggested Following（suggestedfollowing）

**原生能力**：依据用户已经关注的人及社交连接推荐新的关注对象。

**维护状态**：免费，Green Meteor 发布；市场标记为未由 HumHub 核心团队测试或维护的社区模块。

**边界**：关注关系不是双向好友；简介也未声明技能匹配、冷启动队友匹配或当前活动过滤。没有关注关系的新用户不能保证得到有意义的建议。

**来源**：[官方介绍](https://marketplace.humhub.com/module/suggestedfollowing/description) · [下载目录](https://marketplace.humhub.com/module/suggestedfollowing/downloads) · [更新日志](https://marketplace.humhub.com/module/suggestedfollowing/changelog)。

### 22. Onboarding Tour（onboarding）

**原生能力**：管理员配置多步引导，结合全局 Custom Pages 或插件自带的 Profile Field Pages；可设置标题、说明、多个分区和列布局，沿用可编辑资料字段的验证规则。支持草拟后启用、导航、进度提示、跳过及保存进度。

**开发文档补充**：完成情况按页面类型和页面 ID 记录；新会话转到首个未完成页面，新增页面会触发补做，修改既有页面内容不会自动重置已完成状态。Custom Pages 是选用自定义内容页面时的集成对象；页面没有证明所有模式都强制依赖它。

**价格与接口**：€90；本轮描述、开发及许可页未核实固定续费金额。开发页有数据结构说明，但没有承诺供 React 使用的完整引导 REST API。

**来源**：[官方介绍](https://marketplace.humhub.com/module/onboarding/description) · [开发文档](https://marketplace.humhub.com/module/onboarding/developer) · [下载目录](https://marketplace.humhub.com/module/onboarding/downloads) · [许可](https://marketplace.humhub.com/module/onboarding/licence) · [更新日志](https://marketplace.humhub.com/module/onboarding/changelog)。

### 23. Auto Follow（auto-follow）

**原生能力**：为新用户或已经注册的用户设置自动关注关系。

**边界**：自动关注是一项实际关系写入，与“展示推荐卡片、让用户自行关注”不同；也不建立好友关系。简介极简，没有给出活动范围、触发时机和筛选的完整规则，接入前应查源码并验证。

**来源**：[官方介绍](https://marketplace.humhub.com/module/auto-follow/description) · [下载目录](https://marketplace.humhub.com/module/auto-follow/downloads) · [更新日志](https://marketplace.humhub.com/module/auto-follow/changelog) · [公开仓库](https://github.com/humhub-contrib/auto-follow)。

### 24. Clean Theme（clean-theme）

**原生能力**：为 HumHub 原生页面提供更简洁的视觉主题，用于本次直接预览核心与插件功能；不是 React 组件库，也不提供新的后端业务模型。

**安装与兼容**：免费发布包 2.5.3，2026-11-01 发布。本地已下载、校验并激活 Clean 主题，使用本地字体资源。市场的总体兼容历史与某一版本的包内最低版本可能不同：本包声明最低 HumHub 1.19.0，当前预览为 1.19.4。

**本项目边界**：原生主题用于试用和管理员页面。用户产品前端依然按 AffectUI + Shadcn UI Kit 设计；不把主题启用视为完成自建前端。

**来源**：[官方介绍](https://marketplace.humhub.com/module/clean-theme/description) · [下载及版本](https://marketplace.humhub.com/module/clean-theme/downloads) · [许可](https://marketplace.humhub.com/module/clean-theme/licence) · [更新日志](https://marketplace.humhub.com/module/clean-theme/changelog) · [本地固定包清单](../backend/deploy/modules.lock.json)。

## 4. 收费、更新与许可的补充核查

| 项目 | 首次模块标价 | 后续更新与支持 | 本轮明确的说明 |
|---|---:|---:|---|
| Survey | €90 | €45/年 | 含首年更新与支持 |
| Advanced Survey | €45 | €25/年 | 必须另有 Survey |
| Survey + Advanced Survey | **€135** | **€70/年** | 完整依赖成本，不能只比较增强包 |
| Onboarding Tour | €90 | 未核实金额 | 不假设终身更新或无续费 |
| Job Listings | €90 | 未核实金额 | 未核实供应商完整购买条款 |
| Advanced Profile（附录） | €90 | €45/年 | 含首年更新与支持 |

Survey、Advanced Survey 和 Advanced Profile 的当前许可页列出 **AGPL-3.0-only 或 CUZY Commercial 2.0 双许可**。作者说明，依法获得源码的人可以按 AGPL 条件使用和修改；市场购买授权则关联安装密钥、更新及支持。商业密钥到期后可继续使用已有版本，但不能继续通过市场下载或更新。这里不能推出“所有源码现在都有免费官方下载入口”，本轮没有取得这些付费包，也没有验证免费完整源码的可得性。

因此预算表采用市场购买渠道的已显示价格；开源许可证与付费分发/支持是不同事项。本轮不把任何付费包列成绕过购买即可免费获取。许可条件以对应 [Survey](https://marketplace.humhub.com/module/survey/licence)、[Advanced Survey](https://marketplace.humhub.com/module/survey-advanced/licence)、[Advanced Profile](https://marketplace.humhub.com/module/profile-advanced/licence) 页面原文为准。

Onboarding 的许可页指向 HumHub 通用许可，Job Listings 指向供应商双许可；本轮未据此推断其全部授权范围或费用。供应商价格页面可变，税费、付款手续费、安装数和更新条款需以真实结算为准。

## 5. 附录：Advanced Profile（此前候选，非本轮新增）

页面标价 €90，版本 1.5.4（2026-10-08），CUZY.app 发布，兼容标签 HumHub 1.15–1.19。

可按用户组决定哪些资料字段适用或禁用、强制补齐必填项、给予某些组查看隐藏资料的权限，并以短代码展示当前用户资料值。新增必填字段可阻止未填用户继续使用平台。

这不是每位用户对每条画像选择 authenticated/friends/private 的现成功能，也不是 AI 抽取与确认流程。它的强制补全行为与本项目“可保存退出、普通协作不依赖引导完成”存在适配差异。

来源：[介绍](https://marketplace.humhub.com/module/profile-advanced/description) · [许可](https://marketplace.humhub.com/module/profile-advanced/licence) · [更新日志](https://marketplace.humhub.com/module/profile-advanced/changelog)。

## 6. 核查范围与未完成项

包括后续 Clean Theme 补充在内，已读取 24 项主清单及 Advanced Profile 的市场介绍；补读 REST/JWT 手册、Firebase 安装说明、Survey API、Onboarding 开发说明和上述收费模块的许可页，并抽查 Messenger 参与者源码。汇率与人民币预算见另一份分析文档。

最初资料调研没有执行安装；后续授权部署已经完成核心与选定模块迁移、浏览器页面、部分普通用户 API、私有活动访问和运行时检查。PDF Viewer 已启用，同时记录了预览弹窗可能展示私有文件名的待修问题。未完成全量模块写操作、生产安全审计、并发测试或新前端集成；未购买收费模块、创建 Firebase/OAuth 应用或读取项目 .local 凭据。

实际安装版本与状态以 [锁定清单](../backend/deploy/modules.lock.json) 和 [运行说明](../backend/deploy/README.md) 为准；市场“最新”表格不代替部署锁。
