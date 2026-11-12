#!/usr/bin/env python3
"""Cross-language owner-read contract probe; synthetic in-memory input only."""
import json
from pathlib import Path
import subprocess
import sys

if len(sys.argv) != 2:
    raise SystemExit("Usage: python3 run.py /absolute/path/to/php")
php = Path(sys.argv[1])
if not php.is_absolute() or not php.is_file():
    raise SystemExit("An explicit existing absolute PHP binary is required")
folder = Path(__file__).resolve().parent
root = folder.parents[3]
source = subprocess.run([str(php), "-n", str(folder / "probe.php")], cwd=root,
                        capture_output=True, text=True, timeout=30)
if source.returncode != 0:
    raise SystemExit("Synthetic PHP contract probe failed; no runtime state changed")
json.loads(source.stdout)
result = subprocess.run(["node", "--experimental-strip-types", str(folder / "probe.mjs")],
                        cwd=root, input=source.stdout, capture_output=True,
                        text=True, timeout=30)
if result.returncode != 0:
    raise SystemExit("Synthetic TypeScript contract probe failed; no runtime state changed")
report = json.loads(result.stdout)
if report.get("status") != "passed" or report.get("checks") != 28:
    raise SystemExit("Unexpected contract probe result")
print(json.dumps(report, ensure_ascii=False, indent=2))
