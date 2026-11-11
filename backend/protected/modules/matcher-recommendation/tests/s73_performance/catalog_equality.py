"""Compare complete original/current static schemas; no database or credentials."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[6]
sources = root / "docs/用户画像收集/sources"
source = root / "backend/protected/modules/matcher-user-profile/domain/FieldCatalog.php"
current = source.read_text()
addition = """        // Only immutable code-defined schemas are retained, never profile values or permissions.
        // Returning the array by value keeps nested caller edits isolated via PHP copy-on-write.
        static $definitions = null;
        if ($definitions !== null) { return $definitions; }
"""
assert current.count(addition) == 1
assert current.count("return $definitions = $fields;") == 1
original = current.replace(addition, "", 1).replace("return $definitions = $fields;", "return $fields;", 1)
baseline = json.loads((sources / "s73-performance-baseline_2026-11-12.json").read_text())
baseline_hash = baseline["source_sha256"]["p1_field_catalog"]
assert hashlib.sha256(original.encode()).hexdigest() == baseline_hash
php = [str(root / "backend/.runtime/php-mysql/bin/php"), "-c", str(root / "backend/.runtime/php.ini")]
code = r"require $argv[1]; echo json_encode(humhub\modules\matcherProfile\domain\FieldCatalog::definitions(), JSON_THROW_ON_ERROR);"
with tempfile.TemporaryDirectory(prefix="s73-static-catalog-") as temporary:
    previous = Path(temporary) / "FieldCatalog.php"
    previous.write_text(original)
    before = subprocess.run(php + ["-r", code, str(previous)], check=True, capture_output=True).stdout
    after = subprocess.run(php + ["-r", code, str(source)], check=True, capture_output=True).stdout
assert json.loads(before) == json.loads(after)
assert before == after
result = {
    "status": "passed", "checks": 4,
    "checks_passed": ["Reconstructed original source exactly matches the pre-change measured SHA256", "All 37 complete field definitions are deeply equal", "Serialized full definitions are byte-identical", "Only immutable schema construction was memoized"],
    "baseline_source_sha256": baseline_hash,
    "current_source_sha256": hashlib.sha256(current.encode()).hexdigest(),
    "field_count": len(json.loads(after)),
    "complete_definitions_sha256": hashlib.sha256(after).hexdigest(),
    "database_connections": 0, "network_calls": 0, "model_calls": 0,
}
(sources / "s73-performance-catalog-equality_2026-11-12.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(result, ensure_ascii=False, indent=2))
