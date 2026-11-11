# 推荐 · 慢慢展开

2026-11-12 的 PC 推荐详情交互原型。视觉沿用相邻[首页](../首页/README.md)与 [Signalry 规范](../design-system/team-matcher/MASTER.md)。

核心是一个稳定的人物起点，以及从卡片右侧长出的分层信息。底部输入框始终有自己的空间；AI 侧栏展开时，主舞台为它让位。

## 本机预览

地址为 `http://127.0.0.1:4203/`。仅绑定本机。

开发运行：

```sh
cd '/Users/550m/code/hackathon-team-matcher/frontend/推荐'
npx --yes pnpm@11.21.0 install --frozen-lockfile
npm run dev
```

生产预览使用 `npm run build`，然后运行 `npm run start`，端口同为 4203。

## 先体验这几处

- 等待右侧详情长出，文字按阅读重点分为四个尺度。停稳后才轮换下一组，左边的人不会被自动换走。
- 点击「能力与互补 / 兴趣与想法 / 时间与节奏」，或「重新生长」，观察同一个人的不同侧面。
- 悬停、键盘聚焦、输入或展开助手时暂停轮换。手动操作后保持手动浏览，可主动重新开启自动展开。
- 点击任一枝条，展开完整说明及其演示来源。可查看完整人物资料与本次浏览的收藏状态。
- 底部输入一段期待，或点击小云，展开右侧助手。点击助手里的「看看知夏」「展开协作节奏」可联动主舞台。
- 手机使用纵向阅读和独立助手弹层，弹层内仍有输入框，Esc 可关闭并恢复触发按钮焦点。

## 设计及实现

- [交互构思与动效说明](docs/交互构思.md)
- [页面组件](components/discovery.tsx)
- [版式与响应式样式](app/discovery.css)
- [演示人物与分层资料](lib/people.ts)
- [验证脚本](scripts/verify.mjs)
- [验证结果](docs/verification.json)
- [最终截图与生长帧](docs/screenshots/final/)
- [生长与助手联动录屏](docs/生长与助手联动.webm)

普通发现的分页网格不在本次范围中。此页只探索推荐人物的详情展示及助手空间，不改写父级业务规则。

## 来源

直接复用首页中的 Signalry 主题、英文字体文件、Brand 和六个基础 UI 文件。英文展示文字使用 Bricolage Grotesque，英文正文使用 Inter，中文使用系统中文字体栈。

通过 Shadcn UI Kit MCP 查阅 `card9` Social profile，其封面、头像、简介与动作层级用于人物卡的组合参考。基础组件继续使用本项目的 radix-vega 版本，通过外层 className 适配，不修改 `components/ui`。

AffectUI `TiltCard` 与 `FrostCloud` 直接复用首页版本，分别承担轻微鼠标倾斜和助手形象。小云映射至 Signalry 主题；持续漂浮关闭。生长详情没有合适的现成区块，使用已有 React、Motion 和 CSS 实现该业务局部。

未修改首页、vendor、原版预览或冻结文档，未读取私有配置。

## 演示边界

人物与头像均为演示，资料沿用首页的三个虚构人物；推荐只展示示例活动「周末造物场」。字号和枝条长度表示阅读重点，不是能力分数或匹配百分比。

助手使用本地预写回复，没有调用模型或搜索服务。收藏、输入和对话只保留在当前页面内存；刷新重置。不发送好友申请，不建立真实关系，不发送真实消息。

依赖版本沿用首页锁文件。构建器报告既有 Next.js 版本的安全升级提示；此交付是本机设计预览，正式部署前应另行完成依赖更新和验证。

## 验证方式

```sh
npm run typecheck
npm run lint
npm run build
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_EXECUTABLE=/path/to/chromium node scripts/verify.mjs
```

浏览器脚本需可用的 Playwright 与 Chromium，可用 `PREVIEW_URL` 指定预览地址。验证包含实际字体、九种桌面/手机尺寸、输入框与侧栏占位、资料切换、依据弹层、收藏、助手联动、焦点返回、减少动态效果以及生长和停驻的实际动画帧。具体通过项以 JSON 记录为准。

2026-11-12 验证结果：TypeScript、ESLint 与生产构建通过；84 项浏览器检查通过，运行和 hydration 错误为 0。覆盖 1920×1080、1440×900、1366×768、1280×720、1100×900、1024×768、768×1024、390×844、320×740。实际渲染字体确认为 Bricolage Grotesque、Inter 与 PingFang SC。已查看桌面、侧栏、短屏与手机截图，并保留生长帧和助手联动录屏。
