# 独立个人主页 · V3

2026-11-12。React / Next.js 独立视觉原型。全部源码、说明、截图和验证记录保存在本目录，未合并主应用，未接后端或真实 AI。

## 本机预览

地址：http://127.0.0.1:4213/

~~~sh
cd /Users/550m/code/hackathon-team-matcher/frontend/个人资料页面美化
npm run build
npm run start
~~~

开发使用 npm run dev。开发与生产共用 4213 端口，启动前核对 cwd，只停止本目录自己的实例。服务只绑定 127.0.0.1，依赖是本目录的独立副本。

## 按访客的阅读顺序

1. **概览**：左侧肖像，右侧八条错峰生长的消息。25 个可见资料片段轮换，保留暂停、悬停、键盘聚焦与手动换组。
2. **AI 合作推荐**：围绕观看者，解释可以如何合作、依据是什么、还需要问清什么。三种模拟观看者可切换，引用能打开原资料。
3. **资料详情**：基本信息与方向、能力与协作、教育与经历、本次活动投入。用可展开的标签/内容列表呈现，默认展开能力和背景；同类技能连续排列。
4. **想法与项目**：可切换全部、想法、项目，分别说明参与关系与项目贡献；之后是正在参加的活动及明确标注的历史布局示例。
5. **好友申请**：顶部、照片下方和页尾共用一份申请草稿。提供三种语气、手动编辑、放下/恢复、保存后继续编辑；页尾也能直接用自己的话写。

AI 推荐和代写均为**本地预写示例**。保存只存在本页内存，刷新重置，不发送、不建立好友关系。切换模拟观看者或改变可见资料集合后，旧草稿清空，避免沿用上一上下文的信息。

## 隐私与字段

当前演示有 **29 条可见资料**，19 条 global、10 条 event，覆盖后端全部 10 类活动资料。27 条放在详情列表，2 条项目记录放在作品区；25 条参与概览轮换。

两行好友可见样式只含通用标签和模糊形状，未把受限原文放入 DOM、运行时数据或 AI 文案。取消 CSS 模糊也看不到原文；private 条目不呈现。联系方式继续独立授权，保存申请不会解锁资料。

这是展示层演示，不是服务端权限实现。真实接入时，只消费服务端按合法入口和当前观看者权限返回的字段；AI 输入仍须限定为 authenticated 字段，不能把全部好友可见资料直接送入推荐。

人物、资料、关系与活动均为虚构示例。照片不对应示例人物经历，来源见 [图片记录](public/images/SOURCES.json)。历史活动目前是布局预览，不把当前活动关系接口描述为已支持跨活动历史。

## 组件复用

沿用 [首页](../首页/README.md) 与 [Signalry 规范](../design-system/team-matcher/MASTER.md)，使用 shadcnuikit、ui-ux-pro-max 两个 Skill。组件来源限定 Shadcn UI Kit / AffectUI：

| 页面部件 | 复用来源 |
| --- | --- |
| 分组资料详情 | Kit accordion7 + form-layout3 标签/内容行 |
| 想法与项目 | Kit blog-card1 + Signalry Tabs / Avatar |
| 页尾认识邀请 | Kit cta11 |
| 好友申请编辑器 | AffectUI email-draft-clean |
| AI 推荐依据 | AffectUI cited-answer-clean |
| 肖像与网格 | AffectUI TiltCard / GridBackground |

原始 vendor 和首页均未改动。新增基础组件直接复制 Signalry，样式适配放在外层和业务组件。

## 文档与验证

- [V3 访客路径](docs/V3访客路径.md)
- [V3 实现与验证](docs/V3实现与验证.md)
- [浏览器验证记录](docs/v3-verification.json)
- [字段映射检查](docs/v3-fixture-check.json)
- [320px 全量消息检查](docs/v3-compact-check.json)
- [桌面整页](docs/screenshots/v3/1440-full.png) / [手机整页](docs/screenshots/v3/390-full.png)
- [资料列表](docs/screenshots/v3/1440-details.png) / [手机申请编辑器](docs/screenshots/v3/320-request.png)

~~~sh
npm run typecheck
npm run lint
npm run build
~~~

浏览器检查：scripts/verify.mjs；补充紧凑宽度和截图：scripts/final-inspection.mjs。支持 PLAYWRIGHT_MODULE、CHROMIUM_EXECUTABLE、PREVIEW_URL，浏览器临时目录设为本目录 .cache/tmp。

当前 Next.js 16.4.0 构建工具报告依赖安全升级提示。本次未升级依赖，原型只用于本机预览；公开部署前须处理依赖并重新验证。

## 历史

V1、V2 源码分别保存在 docs/revisions/v1-source.tar.gz 与 docs/revisions/v2-source.tar.gz。[V2 说明](docs/V2实现与验证.md)及截图保留作历史对照，不作为 V3 验收。现行原型以本页及 V3 文档为准。
