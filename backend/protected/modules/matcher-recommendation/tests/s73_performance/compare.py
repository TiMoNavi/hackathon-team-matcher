"""Compare the recorded S73 stages without querying a database or exporting values."""
import json
from pathlib import Path
import statistics

root = Path(__file__).resolve().parents[6]
sources = root / "docs/用户画像收集/sources"
baseline = json.loads((sources / "s73-performance-baseline_2026-11-12.json").read_text())
final = json.loads((sources / "s73-performance-final_2026-11-12.json").read_text())
assert baseline["status"] == final["status"] == "passed"
assert baseline["scenarios"].keys() == final["scenarios"].keys()
assert baseline["database"] == final["database"] == "humhub_profile_s73_test_root_4a70f3d1"
changed = [key for key in baseline["source_sha256"] if baseline["source_sha256"][key] != final["source_sha256"][key]]
assert changed == ["p1_field_catalog"], changed
for stage in [baseline, final]:
    for variant in stage["index_comparison"]["variants"].values():
        attribute_scan = next(row for row in variant["explain_estimated"] if row["table"] == "a")
        assert attribute_scan["type"] == "ALL" and attribute_scan["key"] is None
regressions = json.loads((sources / "s73-performance-regression_2026-11-12.json").read_text())
prior = json.loads((sources / "s73-performance-instrumentation_2026-11-12.json").read_text())
catalog_after = next(item["result"]["catalog_sha256"] for item in regressions["results"] if item["script"].endswith("catalog_contract.php"))
assert catalog_after == prior["results"]["catalog_contract"]["catalog_sha256"]
scenarios = {}
for name, before in baseline["scenarios"].items():
    after = final["scenarios"][name]
    assert len(before["samples"]) == len(after["samples"]) == 3
    semantics = ["query_count", "returned_rows", "owner_id_order_sha256", "items", "has_more"]
    expected = {key: before["samples"][0][key] for key in semantics}
    for sample in before["samples"] + after["samples"]:
        assert {key: sample[key] for key in semantics} == expected, name
        assert [batch["requested_owners"] for batch in sample["batch_calls"]["p8_profiles"]] == [200, 159, 200, 159]
    scenarios[name] = {
        "baseline_use_case_ms": [x["use_case_elapsed_ms"] for x in before["samples"]],
        "final_use_case_ms": [x["use_case_elapsed_ms"] for x in after["samples"]],
        "baseline_median_ms": before["median_use_case_ms"],
        "final_median_ms": after["median_use_case_ms"],
        "observed_median_reduction_percent": round(100 * (1 - after["median_use_case_ms"] / before["median_use_case_ms"]), 2),
        "baseline_query_ms_median": statistics.median(x["query_elapsed_ms"] for x in before["samples"]),
        "final_query_ms_median": statistics.median(x["query_elapsed_ms"] for x in after["samples"]),
        "baseline_non_query_ms_median": statistics.median(x["non_query_elapsed_ms"] for x in before["samples"]),
        "final_non_query_ms_median": statistics.median(x["non_query_elapsed_ms"] for x in after["samples"]),
        "query_count_and_ordered_result_unchanged": True,
        "baseline_handler_samples": [x["session_handler_read_delta"] for x in before["samples"]],
        "final_handler_samples": [x["session_handler_read_delta"] for x in after["samples"]],
        **expected,
    }
report = {
    "status": "passed", "scope": "ordinary discovery use case; HTTP/session selection/serialization measured separately",
    "fixture": {"members": 400, "opted_in": 360, "viewer_id": 424, "space_id": 5, "eligible_other_people": 359, "batch_sizes_per_complete_read": [200, 159], "complete_reads_per_page": 2},
    "scenarios": scenarios,
    "changed_production_files": ["backend/protected/modules/matcher-user-profile/domain/FieldCatalog.php", "backend/protected/modules/matcher-user-profile/module.json"],
    "production_change": "Memoize only immutable code-defined field schemas; PHP array copy-on-write preserves caller isolation. P1 patch version 0.9.1. No SQL, index, authorization, full-scan bound or recommendation-policy change.",
    "source_sha256_baseline": baseline["source_sha256"], "source_sha256_final": final["source_sha256"],
    "catalog_schema_sha256_unchanged": catalog_after, "offline_regression_checks": regressions["checks"],
    "measurement_tool_correction": baseline["measurement_tool_correction"],
    "limits": ["Only three sequential local samples per case. Timing variability, including the slow empty baseline samples, is retained; no production capacity, throughput, SLA or isolated causal-effect claim.",
               "Handler counts are engine read operations; returned-row totals include repeated authorization reads. Neither is exact rows_examined.",
               "EXPLAIN FORMAT=TRADITIONAL estimates and numeric EXPLAIN ANALYZE iterator actuals are distinct. ANALYZE instrumentation timings are not the normal SELECT client timings.",
               "The tested existing state-leading index USE/IGNORE hints preserve results and do not change the optimizer's attribute-table scan. Do not attribute timing differences to indexes.",
               "Recommendation candidate-term/interval indexes are not consulted by ordinary discovery.",
               "Concurrent load, multi-client throughput, latency percentiles and production capacity were not measured. No consistent end-to-end acceleration was demonstrated."],
    "model_calls": 0,
}
(sources / "s73-performance-comparison_2026-11-12.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"status": "passed", "regression_checks": regressions["checks"], "scenarios": {name: {key: row[key] for key in ["baseline_median_ms", "final_median_ms", "observed_median_reduction_percent", "query_count"]} for name, row in scenarios.items()}}, ensure_ascii=False, indent=2))
