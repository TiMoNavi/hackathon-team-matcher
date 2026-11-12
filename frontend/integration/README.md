# HumHub 同源入口构建桥

N03 的账号／当前活动只读薄片。业务页面适配位于 `../首页/integration/`，复用首页原有 Brand、Button、Providers、Signalry 主题与本地字体；不修改六个原型或基础组件。

合同入口为 `../../docs/睡前全自动运行/04_HumHub实施合同.md` 第7节。HTML及安全bootstrap由 matcher-webapp 提供，本包不生成演示bootstrap，不保存身份、活动或CSRF到浏览器持久存储。只有显式刷新和导航触发两个既有GET，不上传、不发消息、不调用模型。日夜选择仅保留当前页面内存。

## 构建

在本目录使用 Node 24：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test
npm run build
```

构建会清空并重建唯一输出目录 `../../backend/protected/modules/matcher-webapp/resources/app/`，不修改后端模块逻辑。显式产出 `manifest.json`、`index.html` 入口与哈希JS/CSS/字体。依赖单独锁定；Vite将原目录组件的React解析到本包并检查只有一个运行时。独立index.html不能取代HumHub宿主页面，单独打开会显示bootstrap缺失。

## 验证边界

客户端单测使用合成响应，检查DTO、同源URL、错误、无活动、撤权和晚到响应，不是登录或活动业务正例。构建检查递归manifest、文件存在性、本地字体逐字一致与绝对路径。浏览器只在主执行者提供的隔离8113页面启用后运行，使用独立browser/context，不占用共享MCP页面。真实GitHub及邮箱验证码仍由N04验收。

不得把 `/me` 的合法空昵称补成示例人物；无当前活动是409 CURRENT_EVENT_REQUIRED，不能当未登录。401清投影；403或上下文变化移除旧活动。原生回退仅dashboard/login。
