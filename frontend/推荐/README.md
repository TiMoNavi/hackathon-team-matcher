# 推荐 · TA 的世界 V3

2026-11-12 的推荐详情交互原型，视觉沿用相邻[首页](../首页/README.md)与 [Signalry](../design-system/team-matcher/MASTER.md)。本轮重点扩大推荐舞台与可读字号，精简冗余提示，并接入现成的 AI 输入框、资料列表、多维分析表和动态关联图。

## 本机预览

当前入口为 http://127.0.0.1:4203/，仅绑定本机，使用生产构建预览。

运行目录为本目录。开发使用 npm run dev；生产预览使用 npm run build 后运行 npm run start。依赖与锁文件沿用首页。

## 本轮变化

1. 推荐主容器最大宽度提高至 1400px，主要正文 14–15px，作品标题按主次使用更大字号并支持两行。导航继续沿用首页 1248px 尺度。
2. 左侧人物卡、右侧双排作品与悬挂标签沿用原有生长和轮换节奏。换人操作移到人物卡下面。删除输入框上方的装饰句与独立的「暂停轮换」按钮。
3. 底部改用 AffectUI Chat Composer：多行自适应、Enter 发送、Shift+Enter 换行、中文输入法确认不误发送；保留当前人物上下文。
4. 右下角助手和观察气泡放大，桌面横向排在独立底部区域。右侧箭头打开 352px 对话侧栏，主舞台与输入框一起让位。手机使用模态面板。
5. 下翻默认出现六行资料列表，可以切换作品浏览和经历与贡献。
6. 「先聊这几件事，再决定一起做」包含五维分析：贡献能力、项目方向、角色互补、投入时间、协作安排。每行区分资料依据、合作建议与待确认事项。
7. AffectUI 动态关联图在可见时轮换线索；点节点展开详情并高亮表格行，点表格维度也能切换解读。选中线索时停留，方便阅读。

首次进入和点击「AI 重新搜索」都有四阶段加载演示，可以跳过。卡片在轮换之间停驻 5.6 秒，悬停、键盘阅读、输入、详情或对话打开时暂停。右上角全局动效开关与系统减少动态效果仍可使用。

## 源码与证据

- [主页面与对话联动](components/recommendation-experience.tsx)、[V3 布局](app/discovery-v3.css)
- [双排作品与挂牌](components/showcase-board.tsx)、[完整资料列表与分析表](components/profile-dossier.tsx)
- [动态关联图](components/profile-insight-graph.tsx)、[五维资料映射](lib/profile-analysis.ts)
- [V3 组件来源](docs/组件清单-V3.md)、[V3 验证记录](docs/验证-V3.md)
- [浏览器验证脚本](scripts/verify-v3.mjs)、[机器可读结果](docs/verification-v3.json)
- [桌面](docs/screenshots/v3/viewport-1440.png)、[短屏](docs/screenshots/v3/viewport-1280.png)、[手机](docs/screenshots/v3/viewport-390.png)
- [资料列表](docs/screenshots/v3/dossier-list.png)、[分析图](docs/screenshots/v3/analysis-graph.png)、[分析表](docs/screenshots/v3/analysis-table.png)
- [交互录屏](docs/videos/v3/recommendation-v3.webm)
- [V2 留档](docs/v2/README.md)、[V2 验证](docs/验证-V2.md)、[V1 留档](docs/v1/README.md)

当前实际使用 17 个 AffectUI 导出和 9 个 Kit 组件族。列表、表格、时间线的区块结构来自 Kit；不把实例数量和图标计入组件数量。本轮没有修改首页、vendor、原版预览或 components/ui 基础文件。

## 演示边界

只展示活动「周末造物场」中的三个虚构人物。人物、头像、项目内容、搜索、AI 回复与分析均为本地演示；不会发送消息或调用真实推荐服务。卡片尺寸代表阅读重点，不代表能力或匹配分数。

搜索进度是四个前端阶段，不表示服务端完成百分比。动态图是已有资料之间的关系示意，不表示真实 Agent 正在运行。收藏、对话、清单与状态只存在页面内存，刷新后重置。

真实接入继续遵守父级[主应用交互设计](../../docs/前端主应用交互设计.md)与[共享契约](../../docs/共享数据与接口契约.md)，由服务端验证当前活动与字段授权。

## 验证与运行限制

静态检查使用 npm run typecheck、npm run lint、npm run build。浏览器验证方式：

    PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_EXECUTABLE=/path/to/chromium node scripts/verify-v3.mjs

本轮 TypeScript、ESLint、生产构建通过；166 项浏览器检查通过，0 失败、0 运行或 hydration 错误。V3 结果独立记录在 docs/verification-v3.json，V2 的 135 项历史结果不用于证明本轮修改。实际字体检查分别核验英文展示、英文正文与中文渲染字形。

构建器仍提示既有 Next.js 版本需要安全升级；重试同一构建命令后可继续。本轮保持与首页一致的依赖版本，仅提供本机设计预览。正式部署前需要处理依赖升级并重新验证。
