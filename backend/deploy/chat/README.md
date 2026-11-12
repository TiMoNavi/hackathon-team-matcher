# 聊天 C02–C04 专用隔离工具

任务入口为 [群聊模块升级 task](../../../docs/群聊模块升级/task.md)。本工具用于独立空业务库、聊天 UI 与有限虚构私聊的读取验证，不提供生产部署、真实用户导入、通用消息种子或任意 SQL 执行入口。C04 的正常原生密码登录仅验证合成账号，不替代 GitHub/邮箱验证码提供者验收。

## 固定目标

| 项目 | 唯一允许值 |
|---|---|
| 数据库 | humhub_chat_c02_20261112 |
| 专用账号 | chat_c02@localhost，仅该库权限，无 GRANT OPTION |
| MySQL socket | backend/.runtime/mysql.sock，复用已有服务，工具不启停 MySQL |
| Web | 127.0.0.1:8124，只接受同一 Host、端口和回环来源 |
| 私有运行目录 | backend/.runtime/chat-upgrade，0700 |
| 固定客户端配置 | 新生成的 chat-upgrade/mysql.cnf，0600 |
| 初始化管理员配置 | 既有 backend/.runtime/mysql-root.cnf，仅由客户端在必要创建时读取，不复制或打印 |
| 模块 | C02 仅 mail；C03 增加 matcher-chat-ui；C04 固定增加 matcher-chat |

父目录、配置、运行子目录检查 owner、权限、非符号链接；模块链接只允许指向固定源码。Python 和 PHP 分别校验固定配置、文件标记及数据库 guard 表的 nonce。发现已有同名库或账号但没有本工具归属证据，立即拒绝，不接管、不覆盖、不自动清理。

Session、identity 与 CSRF cookie 分别命名为 chat_c02_session、chat_c02_identity、_chat_c02_csrf，并使用独立 cookie 验证密钥。不同端口不能代替 cookie 隔离。cache、assets、uploads、mail、日志、备份目录均独立；不读取主预览配置、.env、.local 或已有用户数据。

实现参考现有 overnight 工具的固定目标与原生迁移方式，但没有运行时 import 或修改其文件；没有 auth-configure、任意模块参数、外部 SQL 文件参数或 cleanup 命令。

## 离线检查

从项目根执行：

    python3 backend/deploy/chat/test_guards.py

检查只使用合成临时文件、模拟 SQL/进程结果及 PHP 纯函数；PHP 使用 -n，不加载本机应用配置。它覆盖目标/模块白名单、配置 owner/mode/symlink、数据库身份、跨库 dump、安装/恢复停服条件、非空业务恢复拒绝、固定 UI 升级中断恢复、PID 复用、Cookie 隔离及 PHP 语法。临时 Unix socket 只在临时目录创建，不连接现有数据库。

主agent审查后可先执行元数据探测：

    python3 backend/deploy/chat/harness.py probe

probe 不读任何凭据内容、不打开数据库 socket；只报告必要文件/二进制/配置权限/socket 类型与短暂绑定并释放 8124 的结果。某项不可用则返回 unavailable 和非零退出码。端口冲突时不会自动挑选其他端口。

## C02 空库安装与恢复

前置：本机 PHP/mysql/mysqldump、HumHub vendor、固定 MySQL socket 与 0600 root 客户端配置已存在；8124 空闲，固定基线源码存在。工具不会安装依赖、创建管理员、启动共享数据库或打开外呼权限。

以下操作只由主agent在独立审查后执行：

    python3 backend/deploy/chat/harness.py provision
    python3 backend/deploy/chat/harness.py provision
    python3 backend/deploy/chat/harness.py install
    python3 backend/deploy/chat/harness.py install
    python3 backend/deploy/chat/harness.py inspect
    python3 backend/deploy/chat/harness.py backup-restore

provision 首次创建全新空库及随机专用凭据；重复调用只复用 nonce 验证成功的目标。MySQL 使用固定 --defaults-file、--no-login-paths、--protocol=SOCKET、socket 与 user，不加载其他默认客户端配置。root 身份在执行固定创建语句前验证；普通运行只使用专用限权账号。创建部分失败保留现场，不进行自动删除或跨库重试。

install 复用 HumHub installer/install-db、InitialData 与原生模块 migration，不复制表结构。开启 file mailer、关闭访客与匿名注册，不设置测试用户。inspect 只返回计数、版本、模块状态和空业务标记，不返回用户/消息内容。原生迁移可能留下队列记录；不为制造空库结果清队列，也不消费队列。

安装与升级要求本工具 Web 已停且 8124 未占用。backup-restore 进一步要求基线已安装且 user/profile/Space/成员/身份关联/会话/消息/附件计数全部为空；有任何业务数据即拒绝。它只恢复本次从固定库生成的快照，不接受路径或外部 SQL：验证备份指纹、改变专属 guard probe、恢复、比较 probe、计数及 schema/data。快照和回执保持0600，留在私有 backups 目录，不提交或发给代理。

MySQL 首次恢复可能补全冗余列 CHARACTER SET。工具分别保留 raw SHA-256 与严格限定于匹配字符集/排序规则的字符串列 DDL 的 canonical SHA-256；数据值、默认值和真实排序规则差异不归一化，不把逻辑一致说成原始字节相同。SQL 检查只是自生成 dump 的有限防御，不是任意 SQL 安全解析器；主要边界仍为固定目标、限权账号和 provenance。

## C03 固定 UI 升级与撤回

仅在 matcher-chat-ui 源码完成并经审查后执行：

    python3 backend/deploy/chat/harness.py stop
    python3 backend/deploy/chat/harness.py upgrade-ui
    python3 backend/deploy/chat/harness.py upgrade-ui

upgrade-ui 只增加固定模块链接、更新本工具配置并运行该模块迁移，保留 mail。链接已写而配置尚未更新的中断可以重试；无来源归属的链接、额外模块或非链接路径拒绝。不能手改 private.json 添加 auth、AI、推荐或其他模块。

    python3 backend/deploy/chat/harness.py start
    python3 backend/deploy/chat/harness.py ui-off
    python3 backend/deploy/chat/harness.py ui-on
    python3 backend/deploy/chat/harness.py stop

ui-off/ui-on 仅改 matcher-chat-ui 的 uiEnabled 设置，允许 HTTP 运行时切换；不调用任何模块 disable/remove，不改 mail 数据。模块须实现 isUiEnabled() 合同。HTTP start 先验证原生基线与模块版本就绪。start/stop 只操作本工具创建并持久记录的 PID，二次核对 uid、启动时间、完整命令和 nonce；PID 被复用或端口属于其他进程时拒绝，不终止其他服务。

PHP 使用 -n，清除继承的服务环境变量，禁止 URL streams 与常用 curl/socket/mail 外呼函数；mailer 为 file transport，worker/cron/模型不存在启动路径。HTTP 日志及 PHP 诊断关闭，避免请求或异常携带凭据。此限制不是操作系统网络沙箱。

## C04 固定读取接线

读取仍默认关闭。首次升级与重复升级均须停服；只装配固定模块及元数据迁移，不迁移或复制正文。

    python3 -B backend/deploy/chat/harness.py stop
    python3 -B backend/deploy/chat/harness.py upgrade-chat
    python3 -B backend/deploy/chat/harness.py fixture-prepare
    python3 -B backend/deploy/chat/harness.py fixture-inspect
    python3 -B backend/deploy/chat/harness.py chat-read-on
    python3 -B backend/deploy/chat/harness.py chat-ui-read-on
    python3 -B backend/deploy/chat/harness.py start

fixture-prepare 只准在本工具所有的空业务基线首次创建三个固定虚构用户、三个原生会话和七条虚构消息。两个会话显式准入读取，第三个不准入；重复操作验证精确归属，不覆盖已有数据。密码随机生成，仅保存在0700 runtime内的0600文件；HTTP脚本内部读取，正常提交原生两步表单，不伪造session。

read-probe.php 是固定夹具的只读观察器，拒绝任意ID/SQL参数。verify_reading.py 核对已拥有的8124后验证列表、分页、权限、已读及原生入口；verify_read_switches.py 验证三个功能开关并恢复初始设置。回执只含检查名、计数与限制，不包含凭据、Cookie或正文。

    python3 -B backend/deploy/chat/verify_reading.py
    python3 -B backend/deploy/chat/verify_read_switches.py
    python3 -B backend/deploy/chat/verify_native_search.py
    python3 -B backend/deploy/chat/verify_read_browser.py

浏览器只通过verify_read_browser.py包装器运行。它持有harness锁，核验进程、数据库、fixture nonce与开关后调用固定脚本；不单独运行Node入口。截图和报告只有已核对归属的虚构资料，输出目录/文件拒绝符号链接。

固定SQL探针由verify_read_concurrency.py先验证B的低位已读合并，再跑浏览器。verify_read_transitions.py最后追加唯一第八条虚构消息并永久撤销empty准入，原生消息和成员保留；它不调用发送API，也不代表好友关系或真实撤权竞态已经完成。SQL变体的归属记录只允许sql_probe.spec及append_entry_id两个字段。

上述变体执行后，原始七条/两个active会话的fixture-inspect、fixture-prepare与初始HTTP/浏览器脚本会拒绝或不再满足前置，这是有意的基线保护。不要删数据或重置已读来重跑。变体的持久状态可用固定isolated-sql.php snapshot及read-probe观察，重复append-once/revoke-empty不会重复写入；完整HTTP transition脚本的旧cursor基线只适用于首次撤销。

verify_read_shutdown.py关闭本隔离read API/UI设置，停止本工具8124进程，验证带数据重复升级及非空backup-restore拒绝；不卸载mail/chat、不清理库。未来新一轮夹具须另设明确版本，不偷偷复用或重置该现场。

读取页构建使用聊天integration的npm run build:read，独立输出resources/read-app；原shell仍由npm run build产生。宿主原生session给出v2 bootstrap，三个API继续逐次授权。PUT已读保留CSRF与JSON边界；新增bootstrap须放在ModuleAutoLoader之后、LanguageSelector之前。

**目前只准隔离试验。** 受管用户的原生mail和live入口采取保守拒绝；因此UI关闭虽保留数据、读取API与保护，也不能让这些用户恢复完整原版聊天。手动/在途通知、第三方与bulk/raw SQL入口等尚未完整覆盖。禁止以mail::disable/remove撤回，禁止据此启用生产或群聊/发送/附件。

## 状态与限制

主agent新增 verify_http.py 固定验证运行中的8124。它校验路由、方法、私有路径和资产，暂移本专项manifest验证503后在finally恢复，并切换UI开关后恢复开启；不写用户或消息。必须在子agent停止构建产物写入、实例由本专项所有时运行。命令为 python3 backend/deploy/chat/verify_http.py；结束仍须运行harness.py stop。

- C02/C03不创建用户；C04只允许上述显式、有限、有归属的虚构夹具。不执行GitHub/邮箱验证码，不证明N04/N05或双用户收发已完成。
- 没有 cleanup 或数据模块卸载入口；使用后可 stop 保留验证现场。未来需要清理时另行明确审核固定目标和数据归属。
- 不调用主预览脚本、overnight 工具或主服务 stop/start；新 UI 撤回绝不 disable mail。
- 所有真实命令和结果由主agent追加到 [聊天实施记录](../../../docs/群聊模块升级/02_实施记录.md)。离线测试回执与真实安装/HTTP/恢复回执必须分别记录。
