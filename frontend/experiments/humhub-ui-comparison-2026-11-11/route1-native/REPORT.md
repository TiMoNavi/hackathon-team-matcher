# 路线 1：HumHub 原生视图升级验证

## 结果

已完成并在隔离 HumHub 1.19.4 中运行。打开 http://localhost:8193/comparison-native/home/index。

页面由 PHP / Yii 直接输出 HTML，保留 HumHub、Bootstrap 5、jQuery、PJAX 的真实资源，没有引入 React。浏览器初始 HTTP 响应已经包含四张成员卡，实际检测到 jQuery 与 bootstrap 对象。隔离站点当前启用了 Clean Theme，因此该路线同时加载其原生 CSS / JS；这也是原生样式叠加需要面对的条件。

这是原生技术路线的首页验证。为了不覆盖原项目，它暂以独立模块和 PHP layout 挂载；它不是已经完成的全站主题安装包，也不是 Bootstrap 主版本升级。

## 看到了什么

桌面是侧导航、活动横幅、两列成员卡、右侧活动进度；手机是单列卡片和底部导航。统一使用“同频 CoLab / AI 创造者周末”虚拟数据。四种角色筛选、姓名/技能搜索、空结果提示、成员详情、Escape 关闭、关注开关均可操作；关注只保存在当前页面内存，刷新即复位，不会通知真实成员。

同目录 desktop.png、mobile.png 保存真实浏览器截图。当前桌面截屏完整高度 1544 px，移动完整高度 2266 px，分别在 1440×1000 和 390×844 视窗中检查，无横向溢出。

## 两个组件包怎样使用

查阅了本地 Shadcn UI Kit 的 profile-card.tsx，以及 AffectUI 的 progress-tracker.tsx。资料来自已下载的 vendor 快照，没有追加付费下载或安装新的 UI 库。

这条路线不能直接把 React TSX 当作 PHP 组件加载。因此借鉴头像、徽章、卡片、进度清单等结构后，写成 PHP 视图、普通 CSS 和普通 DOM JavaScript。模态框使用浏览器原生 dialog；列表栅格、按钮、进度条保留 Bootstrap 类，图标来自 HumHub 自带 FontAwesome。

可复核来源：

- frontend/vendor/shadcnuikit/dashboard/app/dashboard/(auth)/pages/profile/components/profile-card.tsx
- frontend/vendor/affectui/affectui-components/progress-tracker.tsx
- HumHub protected/humhub/assets/AppAsset.php
- HumHub protected/humhub/components/Controller.php

## 实际改动量

| 项目 | 实测 |
| --- | ---: |
| 模块文件，含复制的演示数据 | 10 |
| 手写文件，不含演示 JSON | 9 |
| 手写源码行数 | 1902 |
| 手写源码字节 | 53,496 B |
| 自有 CSS | 30,296 B |
| 自有 JS | 7,057 B |
| 新增 npm / Composer 依赖 | 0 / 0 |
| 自有资源构建步骤 | 无 |

行数受格式化影响，不能直接视为难度排名。原生版本的主要新增代码是样式与事件；已有 HumHub 和 Clean Theme 依赖不计入上面的手写代码。

首屏实际下载 13 项资源，decodedBodySize 合计 3,857,443 B，不含 HTML。该数字包含 HumHub 主 bundle、主题、图标字体与翻译。测量来自本地 PHP 服务，未启用 HTTP gzip，不能拿它直接和另一路线的生产 gzip 体积比较。

首次文件写入至首次浏览器全部通过用时 354.82 秒。该墙钟时间不含最初阅读框架和参考源码，但包含等待共享运行时就绪；它不能外推成全站改造工期。最新完整浏览器验收时间为 2026-11-11T13:42:59.735Z。

## 真正花精力的地方

1. **现有样式叠加。** HumHub 与 Clean Theme 的样式必须继续存在。新增样式通过页面 body 与 cn- 类约束范围，对按钮、间距、字号等做明确覆写，未通过移除原生框架来伪造兼容结果。
2. **组件需要转写。** TSX、React state、Tailwind class、React 动画不能在 PHP 页面里原样复用。筛选、关注、弹窗与清单都写了对应 DOM 状态处理；这部分是该路线的真实迁移成本。
3. **资源注册有框架细节。** 仅声明依赖 AppAsset 不足以明确覆盖其静态 register 方法附带行为，layout 显式执行 AppAsset::register，再注册自有资源，使动态与核心 bundle 按框架惯例加载。
4. **页面生命周期。** 初始化以 WeakSet 防止重复绑定，并为 pjax:end 加重启入口。完整 PJAX 导航未单独验收，报告不把该兼容入口等同于全站通过。
5. **运行环境前置问题。** 第一次请求 500 来自共享环境尚未准备好的 npm-asset/jquery/dist，并非页面模板错误。主 agent 补齐官方分发资源后，无需更换原生框架即可运行。

## 测试结果

- PHP lint：6 个文件通过。
- 普通 JS 语法检查通过。
- 浏览器：23/23 检查通过，详情见 browser-results.json。
- 桌面滚动宽度 1440 px / 视窗 1440 px；手机滚动宽度 390 px / 视窗 390 px。
- 无浏览器 JavaScript 异常、无失败请求。
- 浏览器脚本 verify-native.cjs 可在隔离站点运行期间复测；它只操作虚拟成员的本地界面状态。

## 对后续改造的判断

如果要保留 HumHub 的 PHP 渲染、原有业务和扩展方式，原生视图可以做出这次展示的视觉效果，现有服务端对象和权限机制也有自然的接入位置。扩展到全站时，应将该 layout / 样式整理为正式主题或明确的视图覆盖，并逐页处理菜单、表单、Stream、移动端与第三方模块。此次没有替换原始核心文件。

代价是这两个 React 组件包主要作为设计参考使用，复杂互动和动画越多，转写量越大。本次首页证明的是“原生技术能实现这样的界面”，没有证明“所有付费 React 模板能直接装入 HumHub”。

当前还未验证真实登录、权限、Space 上下文、通知、真实成员关注、数据保存及全站回归。公开 guest 访问只用于纯合成数据页面，接真实资料时必须重新接入原有访问权限。
