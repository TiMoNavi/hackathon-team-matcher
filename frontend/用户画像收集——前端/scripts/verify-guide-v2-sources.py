"""Record and verify the original components actually imported by guide V2."""
from pathlib import Path
import hashlib
import json
import re

root = Path(__file__).resolve().parents[1]
components = {}
for file in (root / "components/onboarding").glob("*.tsx"):
    text = file.read_text()
    pattern = r'import \{([^}]+)\} from "(\.\./(?:affectui|reference-originals)/[^";]+)"'
    for imported, location in re.findall(pattern, text):
        names = [v.strip().split(" as ")[0] for v in imported.split(",") if not v.strip().startswith("type ")]
        used = [v for v in names if len(re.findall(r"\b" + v + r"\b", text)) > 1]
        if not used:
            continue
        target = str((file.parent / (location + ".tsx")).resolve().relative_to(root))
        row = components.setdefault(target, {"file": target, "exports": used, "provider": "AffectUI", "used_by": []})
        row["used_by"].append(str(file.relative_to(root)))

originals = list((root.parent / "vendor/affectui").rglob("*.tsx"))
records = []
for name in ["component-sources.json", "reference-sources.json", "surface-sources.json"]:
    records.extend(json.loads((root / "docs" / name).read_text()))

for row in components.values():
    digest = hashlib.sha256((root / row["file"]).read_bytes()).hexdigest()
    row["sha256"] = digest
    matches = [p for p in originals if p.name == Path(row["file"]).name and hashlib.sha256(p.read_bytes()).hexdigest() == digest]
    if matches:
        row["source"] = "../" + str(matches[0].relative_to(root.parent))
        row["verification"] = "Byte-identical to the saved vendor snapshot"
    else:
        saved = [r for r in records if r.get("sha256") == digest]
        if not saved:
            raise SystemExit("Original source checksum mismatch: " + row["file"])
        row["source"] = saved[0]["source"]
        row["verification"] = "Matches the previously recorded MCP source checksum; no duplicate vendor snapshot"
    row["original_file_modified"] = False

manifest = {
    "updated": "2026-11-12",
    "version": "guide-v2",
    "components": list(components.values()),
    "layout_sources": [
        "../vendor/shadcnuikit/templates/signalry-nextjs/components/site-header.tsx",
        "../vendor/shadcnuikit/templates/signalry-nextjs/components/sections/hero.tsx",
        "../design-system/team-matcher/MASTER.md",
    ],
    "adaptation": "Props, scoped experience.css and guide.css, and React scene composition. No original source edits.",
    "chat_composition": ["AIAnswer", "TextArea", "ThinkingLoader", "TextReveal"],
    "registry_status": "Both registry queries returned 401 during V2 work. Existing saved sources were used; no complete chatbot template was downloaded.",
}
(root / "docs/guide-v2-component-sources.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
report = {"checkedAt": "2026-11-12", "passed": True, "count": len(components), "components": list(components.values())}
(root / "artifacts/guide-v2-source-verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"passed": True, "count": len(components), "files": list(components)}, ensure_ascii=False))
