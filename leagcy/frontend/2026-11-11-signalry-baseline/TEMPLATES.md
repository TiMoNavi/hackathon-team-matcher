> 历史记录：本文件归档于 2026-11-11，不作为当前实施规范。当前入口见 [前端说明](../../../frontend/README.md)。

# 本地 UI 模板与源码索引

安装日期：2026-11-11。来源：用户下载目录中的两份 CollectUI 仓库快照。原压缩包保留不动。

## 已安装资源

| 目录 | 内容 | 文件数 | 解压后大小（十进制 MB） |
|---|---|---:|---:|
| [Shadcn UI Kit 组件库](../../../frontend/vendor/shadcnuikit/library) | 区块、组件、示例、插画和 hooks | 1,469 | 8.30 |
| [Shadcn UI Kit 后台工程](../../../frontend/vendor/shadcnuikit/dashboard) | Next.js 后台、聊天、信息流等页面 | 676 | 7.32 |
| [Shadcn UI Kit 网站模板](../../../frontend/vendor/shadcnuikit/templates) | 5 个独立网站工程 | 413 | 7.89 |
| [AffectUI 源码](../../../frontend/vendor/affectui) | 组件、插画、整屏、区块与动效 | 201 | 6.61 |

Shadcn UI Kit 外层压缩包为 13,792,395 字节（13.79 MB）；三份快照完全解压后的源码合计 23,518,870 字节（23.52 MB）。AffectUI 外层压缩包为 1,994,180 字节（1.99 MB），解压后为 6,613,944 字节（6.61 MB）。这里不包含 node_modules。

## 可以直接找到的网站模板

- [Cosmic](../../../frontend/vendor/shadcnuikit/templates/cosmic)
- [Neofolio](../../../frontend/vendor/shadcnuikit/templates/neofolio)
- [Shopcn](../../../frontend/vendor/shadcnuikit/templates/shopcn-nextjs)
- [Signalry](../../../frontend/vendor/shadcnuikit/templates/signalry-nextjs)
- [Soho](../../../frontend/vendor/shadcnuikit/templates/soho-nextjs)

2026-11-11 用户已选择 **Signalry** 作为后续视觉基准，详见 [风格规范](design-system/team-matcher/MASTER.md)。该选择只确定视觉方向，不表示已将模板作为正式业务应用部署。

## 与本项目相关的页面

- [Chat App 聊天源码](../../../frontend/vendor/shadcnuikit/dashboard/app/dashboard/(auth)/apps/chat)：23 个文件已在本地。
- [Social Media 信息流源码](../../../frontend/vendor/shadcnuikit/dashboard/app/dashboard/(auth)/apps/social-media)
- [AI Chat 区块](../../../frontend/vendor/shadcnuikit/library/blocks/application-ui/ai-chat)
- [AffectUI 整屏页面](../../../frontend/vendor/affectui/affectui-screens)
- [AffectUI 组件](../../../frontend/vendor/affectui/affectui-components)

## 使用范围

这些目录是可读取、可复制和可改造的源码快照，目前没有把某个模板选作业务应用，也没有在这些快照目录运行依赖安装或启动服务。组件库和 AffectUI 不是各自可直接启动的完整应用；Dashboard 和 5 个网站模板有自己的 package.json。

AffectUI 包内 README 标注打包日期为 2026-10-29；实际包含 195 个 TSX 源文件和 6 个 Markdown 文件。不要把下载日期或 README 中的概括数量当成实际源码更新日期和文件统计。

各层 ZIP 已通过 CRC 校验，解压后文件数和字节数已复核。快照版本和哈希记录在 [vendor/snapshots.json](../../../frontend/vendor/snapshots.json)。商业源码目录 vendor/ 已加入 .gitignore。

## 后续在线安装

继续使用现有 [CollectUI registry 配置](../../../frontend/registries.example.json)，把 registries 合并到实际应用的 components.json；授权凭据放在被忽略的 .env.local。安装命令为 npx shadcn@latest add @shadcnuikit/条目名。不要将镜像凭据发送到官方站点，也不要把镜像 registry 自动替换为官方地址。

官方 Skill 已安装到本项目 [.claude/skills/shadcnuikit/SKILL.md](../../../frontend/.claude/skills/shadcnuikit/SKILL.md) 和 Codex 用户 Skill 目录。其官方 registry 示例仅供参考，本项目以用户指定的 CollectUI 配置为准。
