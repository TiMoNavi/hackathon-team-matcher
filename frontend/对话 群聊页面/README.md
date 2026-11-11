# 对话与群聊页面

用户于 2026-11-12 指定的页面目录。聊天布局参考 Soho，视觉对齐相邻的 [首页](../首页/README.md)。这是可运行的中文前端演示，所有人物与消息均为虚构数据，尚未接入登录、消息服务或活动权限。

## 本地预览

在本目录运行：

```sh
npx --yes pnpm@11.21.0 install --frozen-lockfile
npm run dev
```

- 全部会话：`http://127.0.0.1:4202/`
- 群聊：`http://127.0.0.1:4202/groups`
- 私聊：`http://127.0.0.1:4202/direct`

详情见 [PREVIEW.md](PREVIEW.md)。顶部品牌与「回到首页」链接指向 `http://127.0.0.1:4200/`，需要另行运行相邻首页项目。

## 页面与交互

- 「新的朋友」入口与导航徽标显示待确认申请数，右侧打开好友申请面板。可切换收到的、已发出和已处理，查看来源、招呼与简介，接受、婉拒或撤回申请。
- 接受申请后增加一个好友和唯一空私聊，点击「开始聊天」进入；不会自动发送消息。未接受、过期、已婉拒或已撤回的申请不会变成私聊。

- 桌面使用导航栏、会话列表、消息区三栏，列表与消息独立滚动。窄屏先展示列表，选择后进入对话，可返回列表。
- 搜索会话，筛选私聊、群聊、未读和置顶；打开成员详情，切换置顶与免打扰演示状态。
- 按会话保留草稿。Enter 发送、Shift + Enter 换行，中文输入法选词时不会误发。
- 插入表情、添加或移除本地附件、下载已发送附件。附件上限 10 MB，文件不上传。
- 选择演示联系人发起私聊；输入群名并选择至少两位联系人创建演示群聊。
- 手动暂停背景动效，并遵循系统减少动效设置。
- 顶部日间 / 夜间切换，首次访问默认日间，不跟随系统夜间设置；手动选择保存在本机浏览器，刷新及跨页面继续生效。聊天、抽屉、弹窗和表情浮层统一切换。

消息、附件、群聊、草稿及会话设置仅在页面内存中保存，刷新后重置；主题偏好单独保存在浏览器本地。没有自动回复、服务器发送或消息持久化。群聊只演示同一活动的数据，不代表后端已执行活动授权校验。

## 设计与来源

沿用首页的品牌、Inter / Bricolage Grotesque 本地字体、人物头像、紫色 `#5b3df5`、青柠 `#d9f85f`、浅紫网格与柔和白色卡片。阅读区降低装饰强度并加强文字对比度。

基础组件从 [Soho 原始快照](../vendor/shadcnuikit/templates/soho-nextjs/) 复制，未修改 `components/ui`。本次使用 `shadcnuikit`、`frontend-design` 和 `ui-ux-pro-max` Skill，具体选择服从用户指定的 Soho 布局与首页主题。

- [设计与来源说明](docs/DESIGN.md)
- [原版与首页参考快照](docs/references/README.md)
- [桌面与手机页面截图](docs/screenshots/)
- [验收说明](docs/VERIFICATION.md)
- [好友申请侧栏说明与验证](docs/FRIEND_REQUESTS.md)
- [视觉精修与动效说明](docs/VISUAL_POLISH.md)：新版边框、卡片、文字和背景，含日夜 / 手机截图。

## 代码入口

| 文件 | 用途 |
| --- | --- |
| `components/chat/conversation-app.tsx` | 会话页面、抽屉、建群弹窗与输入交互 |
| `lib/conversations.ts` | 虚构数据与内存状态 |
| `app/globals.css` | 首页主题 token 与基础样式 |
| `app/conversations.css` | Soho 式三栏结构、首页视觉适配与响应式布局 |
| `app/page.tsx` / `app/groups/page.tsx` / `app/direct/page.tsx` | 三个预览入口 |
| `scripts/verify.cjs` / `scripts/capture.cjs` | 浏览器交互检查与截图 |

```sh
npm run typecheck
npm run build
```
