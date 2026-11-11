# 推荐 · TA 的世界 V2

2026-11-12 的推荐详情交互原型，视觉沿用相邻[首页](../首页/README.md)与 [Signalry](../design-system/team-matcher/MASTER.md)。本轮按用户追加要求，将右侧升级为双排作品卡、悬挂信息牌和可轮换的人物侧面；下翻后进入完整资料与 AI 分析。

## 本机预览

当前入口为 http://127.0.0.1:4203/，仅绑定本机。生产预览已运行。

运行目录为本目录，开发使用 npm run dev；生产预览使用 npm run build 后运行 npm run start。依赖与锁文件沿用首页。

## 先玩这几处

1. 初次进入会出现四阶段搜索演示，可直接跳过。点击「AI 重新搜索」可以再次体验。
2. 左侧人物保持稳定；右侧六个侧面每 5.6 秒轮换一次，前排同时展示两张不同尺度的卡。后排露出的三个标签可以直接点到前排。
3. 轻微摆动的挂牌展示城市、技能、兴趣与协作安排，点击可看说明。项目画面包含路线、微型界面、声音波形、想法纸片和轨道等细节。
4. 鼠标停留、键盘阅读、输入、打开详情或助手时暂停轮换。页面右上角还能暂停全部装饰动效；支持系统减少动态效果。
5. 页面底部常驻 AI 输入框；右下角小云带着观察气泡，右侧箭头可打开 352px 对话侧栏。桌面主内容与输入框一起让位，窄屏改为独立模态面板。
6. 下翻查看 3D 作品浏览、项目折叠说明、经历时间线、AI 资料依据、叠卡问题和两个可操作的本地清单。

## 源码与记录

- [主页面状态与 AI 联动](components/recommendation-experience.tsx)
- [双排作品卡与挂牌](components/showcase-board.tsx)
- [搜索过程](components/search-experience.tsx)、[右下角助手](components/assistant-companion.tsx)、[完整资料](components/profile-dossier.tsx)
- [V2 布局与动效](app/discovery-v2.css)、[共用导航与人物样式](app/discovery.css)
- [交互构思](docs/交互构思.md)、[组件来源与适配清单](docs/组件清单-V2.md)
- [V2 浏览器验证脚本](scripts/verify-v2.mjs)、[V2 验证结果](docs/verification-v2.json)
- [V2 截图](docs/screenshots/v2/)、[V2 录屏](docs/videos/v2/)
- [V1 留档](docs/v1/README.md)

V1 的 verification.json 与 verify.mjs 只说明旧版验证，不用于证明 V2。当前入口使用 RecommendationExperience。

## 组件与视觉

通过 shadcnuikit Skill 查询 Shadcn UI Kit，并取得 AffectUI 的 9 份新增组件源码。当前使用 25 个双库组件导出，包含 16 个 AffectUI 功能/动效组件与 9 个 Kit 基础组件。清单逐项记录用途、来源和本地文件，不把图标、数据项或同一组件的重复实例凑数。

英文展示字体使用 Bricolage Grotesque，英文正文使用 Inter，中文独立核验系统实际字形。沿用首页主题、1248px 导航容器、浅紫玻璃导航与 24px 人物卡。没有修改首页、vendor、原版预览或 components/ui 基础文件。

## 演示边界

人物、头像、项目内容、搜索过程和 AI 回复均为本地演示。只展示示例活动「周末造物场」里的三个虚构人物。卡片大小表示阅读重点，不是能力或匹配分数。

搜索进度显示四个前端阶段，约 3.4 秒完成，不表示服务端完成百分比。助手约 1 秒后返回预写内容，没有调用模型、搜索服务或真实消息系统。收藏、对话、清单与状态只存在当前页面内存，刷新后重置。

真实接入时继续遵守父级[主应用交互设计](../../docs/前端主应用交互设计.md)与[共享契约](../../docs/共享数据与接口契约.md)，推荐及详情由服务端验证当前活动与字段授权。普通发现网格不在本次范围内。

构建器提示现有 Next.js 版本需要安全升级。本次保留与首页一致的依赖版本，仅用于本机设计预览；上线前应处理依赖升级并重新验证。

## 验证

静态检查使用 npm run typecheck、npm run lint、npm run build。浏览器检查可运行：

    PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_EXECUTABLE=/path/to/chromium node scripts/verify-v2.mjs

结果以 docs/verification-v2.json 为准，包含实际字体、九种尺寸、前后排切换、搜索阶段、资料详情、侧栏、清单、自动轮换与暂停、焦点恢复、浏览器错误检查。

2026-11-12 的 V2 验证已完成：TypeScript、ESLint、生产构建通过；**135 项浏览器检查通过，0 失败，0 运行或 hydration 错误**。覆盖 1920×1080、1440×900、1366×768、1280×720、1100×900、1024×768、768×1024、390×844、320×740，并实测 Bricolage Grotesque、Inter、PingFang SC 的实际渲染。桌面、短屏、手机、搜索和对话截图已人工查看。

[验收说明](docs/验证-V2.md) · [交互录屏](docs/videos/v2/recommendation-v2.webm)
