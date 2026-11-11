# 用户画像收集前端

2026-11-12 用户已明确否定 app/page.tsx 关键元素样张的视觉与动效选型。该样张仅保留作记录，不得当作已确认基准。app/references 为 AffectUI 原版模板和强动效的独立对照页，保留原始组件供选型，不是已确认的新版业务设计。后续应先参考四步 Onboarding 的场景联动及角色、键盘光波等原版运动，避免再次仅用普通表单控件和轻微动画代替用户要求的动态引导。

用户于 2026-11-12 明确指定本目录为该前端专项的后续唯一产出目录。源码、页面说明、组件选型、验证记录和截图均放在这里。画像后端契约仍引用 ../../docs/用户画像收集/，不复制一套业务规则。

主要复用 AffectUI 原组件；整体字体、主题与控件尺度遵循 ../design-system/team-matcher/MASTER.md。components/affectui 为可追溯副本，不直接修改，通过 props、外层样式和主题适配。vendor 与原版预览不改动。

此前仅交付关键元素交互预览；2026-11-12 用户进一步授权实现完整引导前端，当前新入口为 app/guide。示例、处理进度和生成内容必须标明演示，不等于真实上传、模型或登录已经接通。不得读取、打印或复制 .local 配置。

2026-11-12 用户认可已展示的组件可以使用，并要求继续增加背景、装饰、边框、卡片等候选。该确认针对组件候选库，不等于确认最终业务页面的布局与组合。当前独立参考库共 48 组；本轮 19 个原版部件与 3 个组合的来源、适用性和验证见 docs/06_背景装饰边框与卡片.md。

当前完整引导以 docs/10_长文资料与信息条推荐.md 为最新补充，docs/09_稳定定位与照片卡堆.md 的资料卡和拖动优先方案已被第四版取代；docs/08_场景重构与长文对话.md 说明第二版场景编排；docs/07_十阶段交互原型.md 为第一版历史记录。源码在 components/onboarding 和 lib/onboarding。保留 app/page.tsx 旧样张与 app/references 组件库，不把前端演示写成真实后台接入。任务阶段、可见性、活动隔离和草稿恢复需做实际验证。

2026-11-12 用户进一步要求：拖动／缩放窗口时角色不得错位；资料填写卡片需重新选型；聊天区域接近左右边缘，输入靠下，给消息留出更大空间；最后一页左侧照片卡堆可刷走，右侧详情从卡片延伸。新版角色停留时依靠真实 DOM 布局，只有场景转换使用浮层；照片来源要记录，不能把素材照片冒充虚构人物的真实身份；刷卡不触发好友申请，必须保留按钮及键盘替代操作。

2026-11-12 用户逐页要求已实现为第二版，并优先于此前全程居中的草案：入口左右对称、GitHub 登录按钮和全跳过明显；处理页大范围无边框；画像及确认页角色左置，使用可滚动长段落；偏好与想法采用底部输入的 Plan 模式对话，角色融入助手头像；完整计划作为助手回复；最终文档与推荐时角色右下角，推荐为左卡片右详情并明确确认好友申请。夜间必须使用原版橙色 Glow Cloud。维持一个持续移动的角色，避免重复、错色或滚动后遮挡导航。真实 OAuth 未配置时必须明确说明，不伪装授权成功。

2026-11-12 第四版补充：用户明确要求适应大量段落与长文本。第3、5、8步使用目录＋宽正文的文档工作区，正常页面滚动；长输入复用 AffectUI TextArea，支持专注编辑。第8步不得重复整份预览与编辑，其他用户／好友视角不展示本人活动设置。推荐在桌面以按钮与缩略图切换为主，触摸滑动仅为辅助；右侧用细线和分组信息条，提供暂停、展开全部，悬停／键盘阅读时暂停，减少动态时完整静态呈现。角色不得遮挡保存和好友申请，需四种宽度实测。目录内同名段落应有内容摘要。独立审查见 artifacts/v4-independent-review.md。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
