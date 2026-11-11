# 独立个人主页 · V2

2026-11-12。React / Next.js 独立视觉原型。所有新增和修改位于本目录，未合并主应用，未接后端或 AI。

## 本机预览

地址：`http://127.0.0.1:4213/`

运行：

~~~sh
cd /Users/550m/code/hackathon-team-matcher/frontend/个人资料页面美化
npm run build
npm run start
~~~

开发用 npm run dev。开发与生产共用 4213 端口，启动前先停止本目录自己的实例。预览只绑定 127.0.0.1。依赖是本目录内的独立副本。

## 这一版的布局

- **人物与资料流**：左侧肖像，右侧身份与八条错峰消息。27 个字段片段轮换，从左向右长出、停留、收回，再换内容；长短不同，文字不缩放。点击查看原条目。
- **观看者的 AI 合作参考**：选择模拟的全栈开发者、产品设计师或未提供背景，查看不同建议、资料依据、待确认事项与开场白。每段建议可追溯到演示资料。
- **七个内容板块**：AI 参考、能力与方向、项目与经历、性格与协作、本次投入、参与想法、活动关系。完整内容可静态浏览。
- **读得清楚**：暂停、悬停、键盘聚焦和弹窗时资料流停止，短条完整展开；减少动态效果时默认静态。手动「换一组」始终可用。
- **互动**：资料详情、AI 依据预览、模拟观看者切换、本地开场白、想法收藏、当前/历史布局切换、手机章节导航。
- **内容状态**：页脚预览设置可切换少量资料、长姓名与条目、缺失照片，刷新重置。

## 字段与能力边界

已核对后端 27 类全局字段、10 类活动字段，身份与关系另列。当前演示使用 31 条资料，其中 10 条覆盖全部活动资料类型。展示数据带有原字段名与 global/event 范围，不把每项字段扩写成自我介绍。

所有人物、资料、活动、关系和 AI 解读均为虚构示例。AI 内容是**预写文案**，没有调用模型，也没有已实现个人主页总结端点的承诺。不显示匹配百分比。

联系方式保留独立授权语义，不展示假号码或邮箱。当前后端关系能力只覆盖服务器确认的当前活动；「过去参加」明确标注**布局预览**。不展示私有原文、资料草稿或来源快照。

照片不对应演示人物的真实经历；图片来源见 [SOURCES.json](public/images/SOURCES.json)。字体、图片运行时均来自本地。

## 文档与验证

- [V2 布局与字段映射](docs/V2布局与字段.md)
- [V2 实现与验证](docs/V2实现与验证.md)
- [浏览器验证记录](docs/v2-verification.json)
- [字段目录检查](docs/v2-fixture-check.json)
- [桌面全页](docs/screenshots/v2/1440-full.png) / [手机全页](docs/screenshots/v2/390-full.png)
- [资料流运动帧](docs/screenshots/v2/1440-motion.png)

~~~sh
npm run typecheck
npm run lint
npm run build
~~~

浏览器验证：scripts/verify.mjs。支持 PLAYWRIGHT_MODULE、CHROMIUM_EXECUTABLE、PREVIEW_URL 环境变量。浏览器临时目录设为本目录 .cache/tmp。

当前 Next.js 16.4.0 构建工具仍报告已知安全风险；没有处理依赖升级。本原型仅作本机预览，公开部署前需升级依赖并重新验证。

## 复用与历史

沿用 [首页](../首页/README.md) 与 [Signalry 规范](../design-system/team-matcher/MASTER.md)，使用 shadcnuikit、ui-ux-pro-max 两个 Skill。组件来自 Shadcn UI Kit / AffectUI，本目录复制适配，未修改共享 components/ui 或原始 vendor。

V1 源码备份为 docs/revisions/v1-source.tar.gz；[V1 说明](docs/V1实现与验证.md)、[初始规划](docs/设计与实施规划.md)只作历史对照，现行原型以本页和 V2 文档为准。
