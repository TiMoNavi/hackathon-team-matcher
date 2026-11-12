# N01 独立空库验证环境

本目录提供隔离运行与恢复工具，默认禁外呼。N04新增显式认证装配模式，配置成功仍不等于真实登录成功；始终不装配真实模型，也不代表前后端最低业务闭环完成。实际执行回执由主执行者记入 [睡前任务实施记录](../../../docs/睡前全自动运行/03_实施记录.md)。

## 固定目标与副作用

- 唯一数据库为 humhub_overnight_n01_20261112，专用数据库用户为 overnight_n01@localhost；仅授予该库所需权限，没有全局授权或 GRANT OPTION。
- Web 仅绑定 127.0.0.1:8113。任何不同的库、用户名、socket、runtime、Host、端口、来源地址或 provenance nonce 均拒绝。不会自动选择其他端口或回退到主预览。
- 私有运行目录为 backend/.runtime/overnight-integration/，目录 0700，凭据、标记和备份文件 0600。session、cache、uploads、assets、themes、mail 与日志均独立。
- provision 通过本机现有 MySQL socket 和 root 客户端配置创建全新空库；不读取或复制主库数据。root 凭据不输出、不复制到子进程参数或报告；专用账号使用新生成的密码。
- bootstrap 仅合并 HumHub 自带 common 与 web/console 配置，绝不加载主预览 .env、protected/config 的 dynamic 配置或 deploy/app.php。PHP 使用 -n，清除继承的配置扫描路径和相关服务环境变量。
- N01原名单为auth-github、mail、matcher-user-profile、matcher-profile-privacy、matcher-onboarding、matcher-resume-import、matcher-recommendation、matcher-ideas；N03固定追加matcher-webapp，N04再固定追加matcher-github-import与matcher-auth。双端仅接受三组完整名单，拒绝乱序、缺项、额外插件。不初始化测试用户，默认不读取外部来源，不启用网页读取或AI插件，不注册模型provider。
- 原生邮件保持file transport；默认PHP阻止常见HTTP/socket/mail外发函数及URL stream。N04显式认证模式的有限例外见下节；没有queue worker、cron或模型运行入口。这不是操作系统级网络沙箱。
- start/stop 只管理本工具记录并再次核对命令行身份的 PHP PID；不会停止 8090 或任何其他已有服务。端口探测设置 SO_REUSEADDR 处理已关闭连接的 TIME_WAIT，不设置 SO_REUSEPORT；仍拒绝同地址上的真实监听。
- cleanup 删除本工具拥有的固定库、固定用户及私有运行目录，包括其中的备份。先由主执行者保存脱敏验证结果，再清理。

## 离线检查

从项目根运行下面命令。它们不连接数据库、不读取实际凭据、不启动服务。probe 只短暂绑定并释放 8113 以确认空闲。

    python3 backend/deploy/overnight/test_guards.py
    python3 backend/deploy/overnight/harness.py probe

test_guards 包含 Python 语法、PHP lint、双端目标/HTTP护栏、主库/root/8090拒绝、MySQL客户端真实换行与结果列分隔、dump跨库语句拒绝、环境清理和模块装配限制。它们不能代替真实 migration 和恢复验收。

## 经主执行者审查后执行

前置条件是项目私有 PHP/MySQL 运行时已经存在，现有 MySQL socket 正常，root 客户端配置可用，8113 空闲；本工具不启动或停止共享 MySQL 服务。

    python3 backend/deploy/overnight/harness.py provision
    python3 backend/deploy/overnight/harness.py provision
    python3 backend/deploy/overnight/harness.py install
    python3 backend/deploy/overnight/harness.py install
    python3 backend/deploy/overnight/harness.py inspect
    python3 backend/deploy/overnight/harness.py backup-restore

provision 第二次只复用 nonce 验证成功的本工具目标；发现没有归属证据的已有库或用户则停止，不接管或覆盖。install 使用原生核心及模块迁移，第二次执行用于实际检查幂等。运行迁移、恢复前先停止本工具 Web 服务；install 与 backup-restore 都在服务 PID 或端口仍被占用时硬拒绝，不仅依赖操作约定。

N01 旧环境追加 N03 时，不手改私有配置。先停止本工具 Web，再执行固定升级两次：

    python3 backend/deploy/overnight/harness.py stop
    python3 backend/deploy/overnight/harness.py sync-modules
    python3 backend/deploy/overnight/harness.py sync-modules

sync-modules 在任何写入前验证固定库／nonce、完整旧或新名单、模块目录与每个固定来源链接；只补固定增量 matcher-webapp、matcher-github-import、matcher-auth 链接，以 0600 原子替换所属 private.json，然后仅注册／启用／迁移这些模块。不重跑核心安装、不卸载其他模块、不接受任意模块参数。中途失败可安全重试；第二次不会再次变更已升级配置。首次 provision 则直接使用新名单。

N03 UI 撤回仅更改 matcher-webapp 自身 uiEnabled 设置，并刷新模块缓存。允许本工具 HTTP 服务运行时调用：

    python3 backend/deploy/overnight/harness.py ui-off
    python3 backend/deploy/overnight/harness.py ui-on

两个动作都要求模块已纳入固定名单且已启用，只切换页面与新导航；不调用 disable/remove，不关闭隐私层、不修改业务记录。每次返回安全状态、模块状态和计数供 HTTP 404／200 与不变性核验。N03 构建发布要求 linkAssets=false；当前隔离 bootstrap 已使用复制发布，不为页面修改宿主 CSP。

backup-restore 在没有 Web 监听时导出固定库，校验文件 SHA-256，修改专用 guard 表的 probe，再恢复该快照；恢复后必须找回旧 probe，并使应用计数/模块状态一致。原始备份 SHA-256 仍逐字节校验；另外分别记录恢复前后 raw_sha256 和 canonical_sha256。MySQL 9.7 首次恢复可能把已带 COLLATE 的字符串列补成显式 CHARACTER SET，canonical 仅在 CREATE TABLE 的 char/varchar/text 系列列定义中、字符集与显式排序规则前缀匹配时删除这个冗余声明。INSERT、字符串值、默认值、实际排序规则、表选项和其他结构差异均保留；必须得到相同 canonical SHA-256 才通过，raw_dumps_equal 会如实报告原始字节是否一致。规范化版本和移除条数同时留证，不把逻辑一致伪称为原始文件完全相同。快照和验证结果只写入私有 backups 子目录。没有接受任意 SQL 路径或数据库名的入口。dump 防御会处理可执行注释、SCHEMA 别名及限定表名，并避开引号中的普通数据；它不是完整 SQL 解析器或安全沙箱。主要隔离仍是固定自生成快照、专用账号的库级权限与双端 provenance 验证，不接受任意来源的 SQL。

如需临时 HTTP 检查：

    python3 backend/deploy/overnight/harness.py start
    python3 backend/deploy/overnight/harness.py inspect
    python3 backend/deploy/overnight/harness.py stop

访问地址为 http://127.0.0.1:8113。此时没有人为创建的账号，普通 API 的未登录负例可以验收，真实用户登录仍由 N04 单独实施。不要把原生登录页可打开算作 GitHub／邮箱验证码登录通过。

结束本次专用环境：

    python3 backend/deploy/overnight/harness.py cleanup
    python3 backend/deploy/overnight/harness.py cleanup

第二次 cleanup 仅在固定库、用户、运行目录及监听都已不存在时返回已清理；不能凭运行目录缺失就删除未知数据库。专用命令锁文件会保留，防止并发清理期间另一个进程创建第二把锁。

## 故障与保护

### N05 已有真实账号时的固定升级

当前8113已经包含用户本人认证账号和独立虚构夹具；上文N01“空库/清理”仅是历史流程，不得再执行旧cleanup或backup_restore。N05使用 `upgrade_n05.py`：仅在本工具拥有的HTTP进程停止后，核验准确模块/版本/来源，备份到私有0600文件并校验，再追加matcher-event-access和固定迁移。首次、重复均核对原有身份/来源聚合及业务计数；绝不恢复旧空库。

当前精确名单增加N05十二模块；推荐0.4.1、P1 0.10.1、auth0.1.1、event-access0.1.0。`sync-modules`仍只负责旧N04过渡，N05后不可用它降级模块名单。活动早期请求边界同样位于ModuleAutoLoader之后、LanguageSelector之前。

N05测试顺序由root独占：`run_n05_audit.py prepare` → `initial` → 原生 `revoke-target`/`revoke-member` → `revoked` → native rollback/cache → role-only修复复验 → concurrency `run` → `overnight_n05_browser.mjs`。测试数据、session、token仅保存在私有registry/状态；同次结果与并发状态不自动重置，重跑失败阶段须先核对已发生的写入。`prepare`仅创建/恢复登记的虚构初始资格，不能在撤权阶段随意重跑。native rollback脚本成功加入outsider后不再满足首次前置，角色回归使用独立 `n05_role_audit.php`，不删数据重做。

真实HTTP客户端、原生MySQL脚本、合成浏览器、真实8113浏览器、本人provider登录分别留证，不能混合计数。新模块的N05入口已测试重叠请求；HumHub旧原生入口同用户并发唯一性尚不在本次保证内。未更改核心唯一索引或启动queue worker。

### N04 明确启用认证验证

N01八模块、N03增加webapp、N04再增加matcher-github-import与matcher-auth，三组精确名单可用sync-modules幂等升级；不接受任意插件。默认PHP传输仍关闭，启用GitHub来源模块不等于自动读取资料。

在N04代码和离线验收完成、主执行者确认后，停止专用HTTP，运行sync-modules，再运行auth-configure。该动作只读取固定的、0600且被Git忽略的backend/.runtime/overnight-auth-input.json，验证127.0.0.1:8113回调、固定Gmail TLS配置，生成独立私有HMAC key，并写入专用库的GitHub设置。配置动作不连接外部服务，不输出配置值。之后start才启动明确认证模式。

认证模式允许OAuth／公开GitHub读取所需curl和SMTP socket，仍关闭URL streams及native mail()。这不是操作系统网络沙箱，调用边界由固定模块、固定端点和受限适配器共同执行；AI模块、worker、cron仍不启用。原生mailer继续file transport，只有注入的OTP适配器可外发：唯一指定测试邮箱、Gmail TLS强制验证、总计最多3次真实发送尝试（失败也计入）。真实SMTP接受数与用户实际收到／兑换须分别验收，不能把配置或SMTP235当登录成功。

认证模式关闭PHP诊断及内建服务器请求日志，避免OAuth一次性code进入请求日志；结构化计数只记录attempted/accepted，不记录邮箱、验证码、凭据或邮件正文。计数由独立持久锁串行保护，预留在SMTP前经fsync与原子替换落盘；既有空白、损坏或后续缺失的账本拒绝发送，不重置额度。原私有配置文件不在cleanup子目录内。auth_mode开启或库中存在账号时，旧N01 cleanup明确拒绝；真实认证后的数据清理须另行审查，不自动删除用户测试账户。stop仍只停止本工具PID，保留数据。

Web装配将matcher-auth的AuthRequestBootstrap放在ModuleAutoLoader之后、LanguageSelector之前，每次请求执行，不能用config.php副作用或清缓存代替。它只让三个auth JSON POST保留rawBody供自己的控制器解析，其他页面／接口与CSRF不变。

本人可以使用日常浏览器完成OAuth和收码；无需在自动化Chromium登录邮件账户。验证码与发起发送的会话绑定，换浏览器需重新发码且仍受总额度限制。本机验收观察器只记录原生成功登录和GET /me 200按provider的计数；同一账户比较使用私有HMAC，不记录邮箱、姓名、token、回调query或响应正文。inspect仅输出聚合计数与是否为同一账户，不输出HMAC或账号ID。观察器失败不影响认证，也不能凭没有异常宣称验收成功。

- 原生迁移可能通过 fwrite(STDOUT) 输出进度，工具只接受唯一最终标记后的完整结果并核对 action/database/status，原生输出不展示。命令失败时输出安全错误类别；不输出 SQL、连接串、密码、原始响应或私有日志。保留专用目录供主执行者定向诊断，禁止把整个目录提交或发送给代理。
- 某次操作部分成功不触发自动清库。只在明确验证固定目标和 provenance 后重试；缺失归属证据时需要定向检查，不关闭护栏。
- 目前只接受N01八模块、N03九模块、N04十一模块或N05十二模块四组精确名单；旧阶段升级通过sync-modules，N05通过upgrade_n05.py，认证通过auth-configure显式启用，不能编辑private.json绕过护栏。
- 本工具未对生产数据运行 down migration 或模块 disable/remove。数据回退用专用库快照；UI 撤回属于后续插件验收。
