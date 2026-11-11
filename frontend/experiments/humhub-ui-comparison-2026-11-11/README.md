# HumHub 前端三路线验证

> 历史技术实验：本文保留路线比较与当时的验证结果，旧页面风格不作为当前依据。核心页面按 [Signalry 原版风格与布局规范](../../design-system/team-matcher/MASTER.md) 执行。

先打开 [效果对比页](http://localhost:4193)，再看 [难度与结果报告](COMPARISON.md)。三个子任务各自完成一版，父任务使用同一套浏览器测试验收。

| 入口 | 本机地址 |
| --- | --- |
| 截图对比与结果 | http://localhost:4193 |
| 路线 1，原生视图 | http://localhost:8193/comparison-native/home/index |
| 路线 2，React 插件 | http://localhost:8193/comparison-react/home/index |
| 路线 3，独立前端 | http://localhost:3193 |

## 文件

- route1-native：PHP 模块与原生 CSS / JS，以及报告和实测指标。
- route2-plugin：React 源码、HumHub 模块、生产资源，以及报告和实测指标。
- route3-standalone：独立 Next.js 项目、报告和实测指标。
- shared：共同任务数据与隔离环境位置，不包含凭据。
- evidence：父任务的同口径测试 JSON、截图与隔离记录。
- gallery：仅用于展示的静态页面、截图及脱敏汇总，可直接通过本机 HTTP 服务查看。

隔离 HumHub 根目录为 /tmp/humhub-ui-compare.6qn_jdwx/humhub。此目录可能在系统清理临时文件时消失；三个实现的源码与报告保存在本目录，不依赖临时目录保存。

## 查看、启动与停止

运行以下命令前，先检查服务状态；已经打开时无需重复启动。

隔离 HumHub（8193）：

~~~sh
python3 /tmp/humhub-ui-compare.6qn_jdwx/humhub/deploy/preview.py status
python3 /tmp/humhub-ui-compare.6qn_jdwx/humhub/deploy/preview.py start
~~~

停止此隔离站点时，把最后一个参数换成 stop。它管理本次独立的 PHP、MySQL、队列与定时任务。不要对原 backend 预览执行停止命令。

路线 3：进入本目录的 route3-standalone，然后运行：

~~~sh
npm run start
~~~

若源码有更新，先运行 npm run build。当前后台实例的 PID 记在 route3-standalone/server.pid。手动前台启动时按 Ctrl+C 停止；不要把过期 PID 直接用于结束其他进程。

对比页：在本实验根目录运行：

~~~sh
python3 -m http.server 4193 --bind 127.0.0.1 --directory gallery
~~~

仅提供 gallery 目录，不要把整个工作区作为 HTTP 根目录。当前后台实例 PID 保存在 gallery.server.pid；手动前台运行时按 Ctrl+C 停止。

## 重新验收与刷新截图

确保 8193 和 3193 均运行，再在本实验根目录运行：

~~~sh
node compare-browser.cjs
python3 prepare-gallery.py
~~~

浏览器脚本使用现有 backend/.runtime/browser 中的 Playwright 和本机 Microsoft Edge。脚本只操作合成数据页面中的本地交互。prepare-gallery.py 要求三条路线检查均通过，才更新对比页截图与 data.json。

需要删除验证环境时，先停止本次服务，再清理精确的临时目录。原 8090 预览、原业务模块与数据库不属于清理范围。本次没有对整个原项目做升级或迁移。
