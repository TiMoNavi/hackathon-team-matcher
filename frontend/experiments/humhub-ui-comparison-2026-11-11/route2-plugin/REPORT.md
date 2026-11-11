# 路线 2：HumHub 独立 React 首页插件

验证结果：成功。页面由真正的 HumHub 模块路由返回，浏览器只加载该模块自己的 React JS 与 CSS。实际复用了本地 Shadcn UI Kit 的 Card、Button、Sheet，以及 AffectUI 的 ProgressTracker；这四份第三方组件源码与快照逐字一致。

- 页面地址：`http://localhost:8193/comparison-react/home/index`
- 模块位置：`route2-plugin/module`
- 前端源码：`route2-plugin/frontend/src`
- 可重复浏览器检查：在 `route2-plugin` 下运行 `node evidence/check-browser.cjs`
- 完整网络、交互与视口证据：`evidence/browser-test.json`
- 原有项目、8090 预览、业务数据库均没有由本路线改动。

## 实现效果

首页包含侧导航、活动概览、四张成员卡、角色筛选、姓名和技能搜索、详情侧栏、本地关注、两个想法卡片、组队准备清单、演示日程，以及移动底部导航。整体使用浅灰绿、松绿色与杏色，详情使用 Kit Sheet 的焦点与 Escape 关闭机制。桌面还提供深浅色切换。

所有成员、匹配比例、关注、通知、想法与日程都为演示。交互只修改 React 当前页面状态，刷新后恢复；没有真实消息发送、关系创建或业务 API 写入。页面和成员详情都有说明。

截图：

- `evidence/desktop-viewport-1440.png`：1440×1000 首屏。
- `evidence/desktop-1440.png`：桌面整页。
- `evidence/mobile-viewport-390.png`：390×844 首屏。
- `evidence/mobile-390.png`：移动整页。
- `evidence/desktop-dialog.png`、`evidence/mobile-dialog.png`：成员详情。
- `evidence/desktop-dark.png`：深色演示。

## 接入方式与实际难度

这是完整独立页面式的 HumHub 模块，而非向原有 Bootstrap 页面塞入 React 小组件，也不是覆盖整个 HumHub 的主题。HumHub 负责识别模块、执行控制器过滤器、发布资产和返回页面；React 负责页面内容和交互。这样在同源地址下就能使用两套 React 组件资源，且当前页面没有原生主题的 CSS 或 PJAX。

本次需要完成的桥接工作主要有四部分：

1. 编写模块 metadata、namespace、配置与 `HomeController`。
2. 建立独立 Vite 构建，将产物放入模块 `resources/app`，由 PHP 读取 manifest。
3. 控制器返回完整 HTML，不调用原生 View 页面生命周期，也不注册 HumHub AppAsset。
4. 把同一套视觉变量映射到 Kit/Tailwind 和 AffectUI 的主题变量。

视觉组件本身的接入较直接，原组件不需要转写为 PHP 或 jQuery。真正的接入难点是独立文档与模块路由的边界、资源发布路径，以及以后如何复用登录、权限与业务能力。首页视觉验证已完成，但不能据此认为整个社区业务接通的成本很低。

本路线相对适合先新增一个漂亮入口页，再逐步做团队广场、个人资料等页面。由于本次没有加载原生导航或业务脚本，从这里进入仍由 HumHub 原生页面承载的业务时，会出现界面风格和页面加载方式的切换；要统一全站还要继续迁移对应页面。

## 框架与源码

- HumHub 1.19.4 模块，PHP/Yii 控制器。
- React / React DOM 19.3.1，TypeScript 7.0.2。
- Vite 8.3.8，Tailwind CSS 4.3.5。
- 7 个直接运行依赖、7 个开发依赖；首次 npm 安装新增 123 个包。准确版本见 `frontend/package.json` 和 lockfile。
- 没有加入其他 UI 组件库。`radix-ui`、lucide 和 class utilities 是所复制 Kit 组件需要的依赖。

组件来源：

| 用途 | 原始快照路径 | 改造情况 |
| --- | --- | --- |
| 成员、想法卡片 | `vendor/shadcnuikit/dashboard/components/ui/card.tsx` | 原文件不变，用 className 调整视觉 |
| 详情、关注按钮 | `vendor/shadcnuikit/dashboard/components/ui/button.tsx` | 原文件不变 |
| 成员详情侧栏 | `vendor/shadcnuikit/dashboard/components/ui/sheet.tsx` | 原文件不变 |
| 组队准备清单 | `vendor/affectui/affectui-components/progress-tracker.tsx` | 原文件不变，使用公开 props 和 CSS 变量适配 |

这些是已下载快照中的真实组件。本次没有验证远程 registry，也没有下载或声明已取得完整付费 Chat App。

## 改动与体积

`metrics.json` 记录每个文件和组件源文件 SHA-256。应用/模块自写文件 9 个，共 50,560 字节；工具配置 4 个，共 1,887 字节；第三方组件原样复制 4 个，共 23,069 字节；共同演示数据 1 个，共 2,228 字节。另有依赖 lockfile、报告、测试脚本与构建产物。

物理行数分别为 257、68、744、90。JSX 和 CSS 有较长的紧凑行，因此不应拿物理行数直接比较三个方案的开发难度。

最终首页只需要两个构建文件：

| 产物 | 原始字节 | gzip 字节，Node level 6 实测 |
| --- | ---: | ---: |
| JS | 323,796 | 101,248 |
| CSS | 53,578 | 11,935 |
| 合计 | 377,374 | 113,183 |

上述 gzip 是文件压缩估计，不代表测试 PHP 服务已经发送压缩传输。没有把整个组件库快照打包进首页。

从本路线开始记时到证据收集完成，墙钟约 13.9 分钟；包括编码、npm 安装、构建、视觉修订和检查，不含父任务准备隔离 HumHub/MySQL 的时间，也不能外推为正式迁移工期。

## 实际测试

- TypeScript 检查与 Vite production build 通过。
- 3 个 PHP 文件语法检查通过。
- 对真实 HumHub 路由完成 17/17 项浏览器检查。
- 1440×1000、1024×800、768×1024、390×844 均无页面水平滚动。移动英雄插图有意在容器内裁切，不造成页面溢出。
- 四人初始状态、前端筛选、React 搜索、空结果与重置、关注切换、详情和 Escape、移动关闭详情、深色切换与 AffectUI 清单均通过。
- 浏览器实际只发出 document、一个 JS、一个 CSS 的 GET 请求；没有 POST 或其他业务修改请求。
- DOM 内没有原生主题 shell；`window.jQuery` 与 `window.humhub` 不存在；没有 Bootstrap/Clean/PJAX 资产。
- HTTP 200；自定义 `X-Frontend-Proof` 响应头存在；CSRF meta 存在。
- JavaScript 异常、控制台错误和失败网络请求均为 0。

## 遇到的问题

1. 新 TypeScript 版本把 CSS side-effect import 识别为缺少类型声明，初次构建出现 TS2882。添加 Vite 官方 `vite/client` 类型引用后通过。
2. 独立页面未声明 favicon 时浏览器尝试原生根路径，产生一个 404。补自包含 SVG favicon 后错误清零。
3. 初版桌面辅助字号过小，实看截图后增大内容字号和对比度，未改第三方源文件。
4. AffectUI 进入动画会让过早截图的清单暂时模糊。最终截图等动画结束后拍摄；正常浏览不影响交互。

父任务补齐隔离 HumHub 发行包的依赖 dist 目录属于共同环境准备，本路线未把它算成 React 插件的改造问题。

## 权限与剩余边界

控制器仍继承 HumHub 基类及其 GateFilter/ControllerAccess 行为，未关闭 CSRF，额外限定 GET。但这是一页公开、纯合成数据的展示；本次没有执行真实登录态、禁用用户、未审批用户、Space 访问权限的端到端验证。保留框架机制不等于业务权限已经验证。

接入真实业务时，应先为首页定义登录策略，再通过 HumHub 模块中的授权读取接口或安全序列化启动数据提供成员内容。任何关注、发帖、消息等写接口都要遵守原有 CSRF、权限和服务层约束。跨域不属于当前方案，因为页面与后台同源。

尚未覆盖真实成员/Space/帖子/聊天/通知/上传、持久化、分页、错误重试、浏览器返回、SSR/SEO、全站导航一致性，以及 HumHub 版本升级回归。浏览器验证仅使用 Microsoft Edge Chromium，未完成 Safari/Firefox 和屏幕阅读器审计。

## 在另一个隔离实例复现

1. 在 `frontend` 中运行 `npm ci`、`npm run build`。
2. 将本目录的 `module` 放入 HumHub 的 `protected/modules/comparison-react`，由正常模块管理启用。
3. 确保 HumHub 的资产发布目录可写。
4. 打开 `/comparison-react/home/index`；未启用 pretty URL 时使用 `index.php?r=comparison-react/home/index`。
5. 真正接业务之前，先完成上一节的认证和权限适配。

构建配置使用相对 base，浏览器资产通过 Yii asset manager 同源发布，无需另跑 Node 服务。`npm run preview` 仅为前端开发的可选辅助，与最终 HumHub 路由无关。
