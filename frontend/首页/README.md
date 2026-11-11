# 同频 Team Matcher · 中文动态首页

独立设计实验。按用户指定的五段故事展开，视觉基于 Signalry，内容依据[冻结简介](../../docs/简介冻结禁止修改.md)及现行活动、画像与消息规则。

「同频」是本次首页使用的展示名称，可在后续品牌确认时替换。

当前为 **V6.2 导航质感版（2026-11-12）**。顶栏使用浅紫磨砂底、缓慢掠光、鼠标反射和跟随章节滑动的选中层；手机菜单同步高亮并保留键盘焦点。详见 [导航说明](docs/V6导航质感.md)。

上下滚动整屏切换，底部翻页栏已移除。顶栏按实际高度占位，内容使用剩余视口高度；桌面短屏调整标题排布、卡片留白和插画尺寸，避免再滚一点才能看到底部或翻页。手机长内容保留原生阅读滚动。保留侧边章节定位、浅色主题、呼吸浮动、鼠标流光和互动页尾。高度与翻页详见 [V6 说明](docs/V6上下滚屏.md)。

## 本机预览

默认地址：<http://127.0.0.1:4200/>。

~~~sh
cd /Users/550m/code/hackathon-team-matcher/frontend/首页
npx --yes pnpm@11.21.0 install --frozen-lockfile
npm run dev
~~~

端口 4200，与 Signalry 原版的 4196、Soho 原版的 4197 分开。服务仅绑定本机。

## 一条从相遇到开工的故事

| 区块 | 中文内容 | 可见动效与交互 |
| --- | --- | --- |
| 首屏 | 你的下一个队友，也在找你。 | 五层双向弹幕、成对头像故事、悬停减速、轻视差、流动光场、漂移网格、落地光束、逐字显现与流动渐变标题 |
| 认识队友 | 有人写代码，有人和你想到一起。 | 双行逐字显现、立体方向文字滚轮、轻量双列人物滚流、边缘渐隐、悬停暂停、人物详情与兴趣标记 |
| AI 画像 | 你认真做过的事，值得被看见。 | AffectUI 小云与环绕资料轨道、来源切换滑层、局部光边和鼠标反射、柔焦过渡、画像预览与确认 |
| 推荐 | 有些合拍，值得展开聊聊。 | 立体人物卡、白色项目区、浅紫 AI 理由区；柔焦联动切换、拖动、方向键和自动轮播 |
| 协作 | 从「你好」，到「我们来做」。 | 双行渐显、柔光聊天舞台、动态头像与发言提示、消息入场、本地发言、预写 AI 建议、活动流光与加入反馈 |

导航右侧可暂停页面自动动画。系统的「减少动态效果」优先生效。人物滚流可悬停阅读，推荐区和聊天区也有自己的暂停入口。

默认使用上下滚屏：滚轮、手机上下滑动和上下方向键控制浏览；长内容先在当前屏内滚动，抵达边界后的新手势才进入相邻屏。聊天、输入框与人物卡继续使用各自的交互。第六幕是可互动的人物邀请页尾。

## 设计与来源

- **Signalry**：从本地原版复制主题、字体职责、UI 基础组件、Providers、utils 和构建配置。复用 Hero 的网格与渐变、1248px 主容器、导航、Features 的字号与 64%/36% 分栏、24px 卡片、主次按钮及 lime 强调；背景按用户本轮要求采用浅色。
- **Shadcn UI Kit testimonial4**：通过 MCP 查阅源码，适配双列渐隐滚流为人物列表。使用本项目已有的 radix-vega 基础组件与显式间距。
- **AffectUI frost-cloud**：通过 MCP 获取源码，置于 components/illustrations；增加 paused prop，外层通过原组件 CSS 变量映射到 Signalry。未改 UI 基础组件。
- **V2 新增 AffectUI 动效**：gradient-floor、grid-background、gradient-text、text-reveal、tilt-card、blur-crossfade，均从本地 vendor 快照复制到 components/effects，再做局部主题及 React 兼容适配。
- **V2 新增 Shadcn UI Kit**：hero14 的 MarqueeEffect 实测循环长度与双向滚流，用原生 ResizeObserver 测量，原生 Web Animations API 在合成线程播放并保留暂停位置；hero7 与 Signalry IntegrationOrbit 的轨道／反向自转组合用于资料场景。
- **V3 本机参考库**：读取「用户画像收集——前端」中的 ModelWheel、Cosmic collision beams 与 AnimatedBackground，在本实验内做中文、主题和暂停适配。源指纹见 docs/v3-effect-sources.json。4199 参考库保持原样。
- **Soho**：群聊演示参考其导航／列表／消息／输入结构，使用 Signalry 视觉。首页展示比例缩小，不表示完整聊天应用已实现。
- **头像**：本地 Shadcn UI Kit Cosmic 的七份演示插画，复制并转为 JPG，所有区块统一人物与头像对应关系。
- **字体**：原版 Bricolage Grotesque 与 Inter 的同款 WOFF2 从原版已下载缓存复制，使用 next/font/local 自托管，避免远程下载失败。来源文件名记录在 app/fonts/SOURCE.json。中文单独使用 PingFang SC / Microsoft YaHei 等系统中文字体栈；不能把英文字体加载等同于中文确认。

未修改 vendor、原版预览、冻结简介，也未读取或复制 .local。

## 交付边界

这是可交互首页原型，全部人物、活动、推荐理由、材料和群聊均为演示。

- 发现和推荐统一绑定示例活动「周末造物场」，不跨活动补人选。
- 点击资料来源仅切换示例，不读取 GitHub、简历或外部网站。
- 画像确认、可见性、兴趣标记、聊天发送与加入活动只修改当前页面内存；刷新会重置。
- AI 画像、推荐理由与群聊建议为预写内容，没有调用模型。
- 不收集邀请码、不执行真实 OAuth、不发送好友申请、不创建真实活动成员关系。

## 验证

~~~sh
npm run typecheck
npm run lint
npm run build
~~~

当前浏览器检查脚本为 scripts/verify-vertical.mjs；高度专项为 scripts/verify-height.mjs，检查六屏实际高度、短屏内容切换、一次滚轮翻页及手机导航展开。两者需要可用的 Playwright 和 Chromium。可通过 PLAYWRIGHT_MODULE、CHROMIUM_EXECUTABLE、PREVIEW_URL 指定当前机器环境，默认连接 4200。

滚屏验证结果保存在 docs/v6-verification.json，高度专项结果为 docs/v6-height-verification.json。高度适配后的桌面和手机截图位于 docs/screenshots/v6-height。旧版检查与截图仅记录对应版本。

2026-11-12 V2：TypeScript、ESLint 与生产构建通过；35 项浏览器检查通过，覆盖 1440／768／390／320px、英文字体及 PingFang SC 实际渲染、新增光场／文字／轨道暂停、柔焦切换、立体卡片与原有组队演示交互。15 个基础 UI 组件与 Signalry 原版逐文件一致。

2026-11-12 V3：TypeScript、ESLint 与生产构建通过；41 项浏览器检查通过，包括浅色背景、文字滚轮推进与暂停、光束启停和减少动态效果。四种屏宽无横向溢出，原有演示交互保留。

2026-11-12 V4：TypeScript、ESLint 与生产构建通过；41 项原有交互检查和 22 项文字／材质专项检查通过。1440／1024／768／390／320px 标题排版与页面宽度通过；已查看桌面和手机截图。基础 UI 组件 15 个与 Signalry 一致。专项脚本为 scripts/verify-refinement.mjs。

2026-11-12 V5：TypeScript、ESLint 与生产构建通过；61 项逐页演示检查、41 项连续浏览回归、22 项文字与材质检查通过。覆盖五种屏宽、真实触摸滑动、浏览器返回、弹窗／群聊隔离、暂停和减少动态效果。15 个基础 UI 文件与 Signalry 原版一致。

2026-11-12 V6：上下滚屏专项 30 项检查通过，包括纵向转场方向、真实鼠标滚轮、真实手机上下滑动、长内容边界、聊天与弹窗隔离、五种屏宽和减少动态效果。项目已迁移至 frontend/首页。

2026-11-12 V6.1：生产构建、TypeScript 与 ESLint 通过；43 项高度专项和 30 项滚屏回归通过。1920×1080、1440×900、1366×768、1280×800、1280×720、1024×768 下六幕均无需额外页内补滚；1280/1024 宽度下所有资料来源与推荐人选检查通过。手机首屏、页尾、导航展开、长内容末尾及视口高度变化均已检查，并实际查看桌面和手机截图。

2026-11-12 V6.2：38 项导航交互与材质检查通过，43 项高度检查重新通过；TypeScript、ESLint 和生产构建通过。验证当前章节随点击、滚轮及浏览器返回同步，手机菜单开合及焦点恢复，暂停与减少动态效果。Bricolage Grotesque、Inter 与 PingFang SC 已通过浏览器实际渲染字体核对。导航报告为 docs/v6-navigation-verification.json，截图位于 docs/screenshots/v6-navigation。

依赖沿用原版锁文件。当前 Next.js 启动器对原锁定版本报告安全升级提示；本实验仅供本机设计预览，正式部署前需另行完成依赖升级与验证。
