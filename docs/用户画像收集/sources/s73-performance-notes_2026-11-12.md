# S7.3 普通发现查询测量说明

日期为 2026-11-12。本文件是查询测量工作包的实施记录，主阶段报告和部署状态由主执行人统一记录。

## 结论

400 人主 Space 有 360 人开启发现，使用虚构 321 号访问者时排除本人，实际完整候选为 359。每次普通列表完整读取两轮，每轮按 200 + 159 分批。基线与最终六组、各三次采样均为 66 条 SELECT、47,644 条累计返回行；返回行包含重复权限与资料读取，不能当作扫描量。每组有序 owner ID 摘要、页大小、has_more 和分批人数完全一致。

只缓存固定字段定义并没有在本轮形成稳定的端到端提速证据。四组 CLI 中位耗时增加，主执行人的 HTTP 三组最终采样也更慢。全部样本保留，不选择性删除慢样本，不宣称生产吞吐或延迟达标。SQL 未改、计数和计划不变，但最终 SQL 客户端计时也明显增大；分时观测不足以隔离缓存改动的因果影响。

| CLI 场景 | 基线中位 ms | 最终中位 ms |
|---|---:|---:|
| 普通首页 | 5,436.793 | 5,346.508 |
| 第 400 人的后续技能项 | 5,448.759 | 5,270.933 |
| role 与 skill 同时匹配 | 5,592.414 | 7,144.712 |
| 需求数组第二、第三项 | 5,552.467 | 6,147.794 |
| 完整时间窗口 | 5,869.758 | 8,908.991 |
| 空结果 | 9,004.650 | 11,087.217 |

原始证据见 [基线](s73-performance-baseline_2026-11-12.json)、[最终](s73-performance-final_2026-11-12.json) 和 [对照](s73-performance-comparison_2026-11-12.json)。HTTP 表面由 [主执行人基线](s73-http-baseline_2026-11-12.json) 与 [最终采样](s73-http-final_2026-11-12.json) 独立覆盖。

## SQL 与索引

每次 66 条查询分为当前活动门禁 6、普通候选资格 4、P1 身份 8、P1 资料属性 8、P1 状态 16、P8 人物资格 12、P8 访问者资格 12。所有原有双重读取、版本/身份比较和最终权限复核保留。

MySQL 9.7.4 的显式 EXPLAIN FORMAT=TRADITIONAL 显示，被采样的 200 人 P1 属性 SELECT 对 matcher_profile_attribute 使用 ALL，key 为 null，估计 19,019 行。EXPLAIN ANALYZE 的 table_scan 实际节点为 20,559 行、1 次循环。该值仅是这一条被采样 SELECT 的实际迭代节点，不是单个 HTTP 请求的 rows_examined。物理表扫描范围与最终获准返回范围不同；原有 owner/scope/confirmed/authenticated 限制仍生效。

对相同 SQL、相同参数仅使用现有 state_id 前导索引的 USE INDEX / IGNORE INDEX 对照，所有返回行完全相同，三种计划都保持属性表 ALL。当前证据没有显示这些索引提示改变该批量读取的扫描量；没有新建或删除索引，没有向生产 SQL 加提示。推荐模块的候选词项/时段索引未被普通发现调用，不能将其部署状态写成普通筛选已受益。

Handler_read_* 来自真实会话状态差值，表示引擎读取操作，不能冒充精确 rows_examined。EXPLAIN 估计值、ANALYZE 实际迭代行、客户端 SELECT 耗时、PHP 用例耗时分别记录。ANALYZE 自身增加测量开销，其计时不与普通 SELECT 客户端耗时混用。

## 测量工具修正

MySQL 9.7 默认 EXPLAIN 返回 TREE，初版工具按表格解析，产生不可用的空预估结构。修正为显式 FORMAT=TRADITIONAL 后，在生产变更前补采同一 SQL。原始工具输出保存在 [修正前证据](s73-performance-baseline-before-plan-format-fix_2026-11-12.json)，其中空结构和 estimated_rows=0 不是有效测量结论。正确计划来自 [计划补采](s73-performance-baseline-plan-refresh_2026-11-12.json)。

基线六组耗时和原始索引 SELECT 客户端计时没有覆盖；基线文件附 measurement_tool_correction 明确计划来源。SQL、绑定参数、资料值和 TREE 原文从不输出。实际节点仅保留白名单算子、表名与数字。

## 精确生产变更

- P1 domain/FieldCatalog.php 缓存仅由代码常量构造的 37 类固定 schema；返回值采用 PHP 数组按值返回和 copy-on-write。没有用户值、权限、关系或跨请求授权缓存。
- P1 module.json 从 0.9.0 升到 0.9.1，没有迁移变更。

BrowsePeople、NativeOrdinaryDiscoverySource、P1/P8 批量查询和权限边界源码保持基线哈希。recent/relevance、24/48、900 秒 cursor、2,000 人超限失败及 0 LLM 策略没有修改。本包没有改动其他并行工作的 conversation 文件。

## 离线验证与工具

[九脚本回归](s73-performance-regression_2026-11-12.json) 共 630 项通过，含字段目录、普通资料、隐私、P1/P8 批量、普通发现、测量输出保护和禁止测量中写入。深层修改返回 schema、修改 get 的返回值、删除局部字段后，后续 definitions()/validate() 均保持正确；无效的数组后续项继续拒绝。

[完整字段定义等价验证](s73-performance-catalog-equality_2026-11-12.json) 另有 4 项通过。测试恢复优化前的源码并验证其 SHA256 精确匹配已采基线，再分别运行前后代码，37 类完整定义深度相等，序列化字节完全一致。字段 schema 哈希为 f3d619286dba6b1928d94767879bf434684a914cd2f034cc6c3f20b29a212216。

所有专用工具位于 backend/protected/modules/matcher-recommendation/tests/s73_performance/：QueryProbe.php、run.php、probe_test.php、catalog_contract.php、catalog_equality.py、compare.py、scenarios.json、plan_scenario.json、README.md。只连接分配的 root 隔离库，没有访问 .local、主库/8090、外部网关或模型。CLI 使用固定服务端选择 fixture，真实原生资格仍在每次读取时核验；HTTP/session 选择查询和响应序列化不在 CLI 计时范围。

本轮没有并发负载、多个客户端吞吐、生产容量或 P95/P99 测试。现有批量属性读取仍有全表扫描，后续真正的查询/吞吐优化需作为独立增量，在保持候选完整性和实时授权的前提下继续验证。
