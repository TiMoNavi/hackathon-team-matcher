# 本地前端资源索引

## 当前选定的模板

**Signalry AI SaaS Landing Page Template** 是用户确认的核心页面风格与布局基准。

- [原始源码](vendor/shadcnuikit/templates/signalry-nextjs/)
- [完整原版预览与启动说明](experiments/signalry-original-preview/PREVIEW.md)
- [当前视觉与布局规范](design-system/team-matcher/MASTER.md)

原始源码保留在 vendor，独立预览副本位于 experiments。两者作为对照，实际业务改造使用独立目标目录。

## 对话布局专用参考

用户于 2026-11-11 指定 **Soho Chat App Template** 作为对话布局参考。整体视觉继续使用 Signalry；Soho 用于导航、会话列表、消息区与窄屏切换结构。

- [Soho 原始源码](vendor/shadcnuikit/templates/soho-nextjs/)
- [原版预览与启动](experiments/soho-original-preview/PREVIEW.md)
- [布局说明](design-system/team-matcher/pages/chat.md) / [页面快照](design-system/team-matcher/references/soho/)

## 双库资源索引

| 资源 | 位置 | 使用方式 |
| --- | --- | --- |
| Kit 区块与基础组件 | [library](vendor/shadcnuikit/library/) | 优先复用，统一使用 Signalry 主题 |
| Kit 后台与应用页面 | [dashboard](vendor/shadcnuikit/dashboard/) | 复用聊天、列表、信息流等功能组件，不将这些页面的默认样式作为新基准 |
| Kit Chat App | [聊天源码](<vendor/shadcnuikit/dashboard/app/dashboard/(auth)/apps/chat/>) | 真实聊天功能接入前保留示例边界 |
| Kit Social Media | [信息流源码](<vendor/shadcnuikit/dashboard/app/dashboard/(auth)/apps/social-media/>) | 适配帖子和作者业务 |
| Kit AI Chat | [AI 聊天区块](vendor/shadcnuikit/library/blocks/application-ui/ai-chat/) | 结合真实 AI 状态使用 |
| AffectUI | [组件](vendor/affectui/affectui-components/) / [整屏](vendor/affectui/affectui-screens/) | 作为交互补充，服从 Signalry 风格 |

## 其他库存模板

[Cosmic](vendor/shadcnuikit/templates/cosmic/)、[Neofolio](vendor/shadcnuikit/templates/neofolio/)、[Shopcn](vendor/shadcnuikit/templates/shopcn-nextjs/) 保留为资源库存，当前不作为核心页面设计基准。Soho 的采用范围见对话布局专用参考。

## 来源与新增资源

现有源码来自用户提供的 CollectUI 仓库快照；来源、版本与哈希见 [snapshots.json](vendor/snapshots.json)。vendor 商业源码沿用现有忽略设置，原压缩包和来源记录保留。

新资源先查询已有源码和文档，再使用 [registry 示例](registries.example.json) 对应的现有配置获取。凭据只留在私有配置；不写入页面、文档、代码或日志，不把镜像 key 发送到其他站点。

旧文件数、安装过程和体积记录见 [历史归档](../leagcy/frontend/2026-11-11-signalry-baseline/ARCHIVE.md)，不再与当前实施规则混排。
