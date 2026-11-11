# S7.3 ordinary discovery performance probe

If the server supports EXPLAIN ANALYZE, the index comparison also records actual iterator timing, rows per loop, and loop counts. Only numeric fields are extracted; the execution tree is discarded because it may include bound profile values. Iterator rows remain distinct from exact rows examined. Unsupported servers report this measurement as unavailable.

This test-only probe runs `BrowsePeople` with the real native current-event checks, ordinary candidate source, P1/P8 batch adapters, and the allocated isolated MySQL clone. It never modifies production classes or database indexes. The server-selected activity comes from a fixed trusted fixture, so HTTP/session-selection queries and response serialization are explicitly outside its measured scope. Root HTTP samples cover that separate surface.

```sh
backend/.runtime/php-mysql/bin/php -c backend/.runtime/php.ini backend/protected/modules/matcher-recommendation/tests/s73_performance/run.php humhub_profile_s73_test_root_4a70f3d1 VIEWER_ID SPACE_ID baseline 3
```

An optional final argument accepts a synthetic scenario JSON list with `name`, `filters`, `sort`, and `limit`. The probe uses the ordinary query validator. Run baseline before any production change and final against the same fixture afterward.

The native Yii MySQL command subclass counts executed reads and time including PDO fetch, while preserving disabled SQL logging. It fails if a write occurs during a measured read. Only query classes, counts, elapsed milliseconds, aggregate returned rows, and ordered ID hashes are exported. SQL, bound parameters and returned profile values exist only inside the measurement process and are not written to evidence or logs. Exceptions are reported by class/code only.

`Handler_read_*` deltas are real session engine read operations, **not exact rows examined**. Returned-row totals include repeated authorization reads and are also not scan counts. `EXPLAIN.estimated_rows` reports optimizer estimates. No actual rows-examined metric is claimed. Index comparison replays the same observed ordinary profile SELECT with default/USE/IGNORE INDEX hints, verifies equal results, and records client time plus handler deltas; no index is dropped or changed. Recommendation indexes do not serve this ordinary browse path.
