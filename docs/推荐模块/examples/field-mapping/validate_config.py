"""Offline metadata experiment, not a HumHub plugin or authorization engine.

Never loads profiles, databases, credentials, models or application settings.
New fields stay unused until explicitly mapped. A valid draft cannot go live.
"""
import argparse
import json
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[3]
DEFAULT_CATALOG = PROJECT / "backend/deploy/profile-fields.json"
NORMALIZERS = {
    "plain_text": {"Text", "TextArea"},
    "casefold_text": {"Text"},
    "enum_token": {"Select", "CountrySelect"},
    "tag_tokens": {"Text", "TextArea"},
}
DIMENSIONS = {"topic", "contribution", "availability", "collaboration_style"}
FORBIDDEN = {"firstname", "lastname", "gender", "birthday", "street", "zip",
             "phone_private", "phone_work", "mobile", "fax", "email_virtual"}


def validate(config, catalog):
    """Validate this proposal's metadata only; never produce eligible users."""
    errors, mapped = [], []
    if not isinstance(config, dict) or not isinstance(catalog, list):
        return report(["config must be an object; catalog must be an array"], [], [])
    allowed_keys = {"schema_version", "purpose", "bindings", "proposed_inputs", "ranking"}
    if set(config) != allowed_keys:
        errors.append("unexpected or missing top-level keys")
    if type(config.get("schema_version")) is not int or config["schema_version"] != 1:
        errors.append("unsupported schema_version")
    if config.get("purpose") != "offline_design_only":
        errors.append("this experiment cannot activate a runtime plugin")
    fields = {}
    for field in catalog:
        if not isinstance(field, dict) or not isinstance(field.get("internal_name"), str):
            errors.append("invalid catalog entry")
            continue
        name = field["internal_name"]
        if name in fields:
            errors.append("duplicate catalog internal_name: " + name)
        fields[name] = field
    bindings = config.get("bindings")
    if not isinstance(bindings, list) or not bindings:
        errors.append("bindings must be a nonempty array")
        bindings = []
    logical_keys, bound_names = set(), set()
    binding_keys = {"logical_key", "native_internal_name", "expected_type", "normalizer", "usage"}
    for binding in bindings:
        if not isinstance(binding, dict) or set(binding) != binding_keys or not all(isinstance(v, str) for v in binding.values()):
            errors.append("invalid binding shape")
            continue
        name, key = binding["native_internal_name"], binding["logical_key"]
        if not re.fullmatch(r"[a-z][a-z0-9_]*", key) or key in logical_keys:
            errors.append("invalid or duplicate logical_key: " + key)
        logical_keys.add(key)
        bound_names.add(name)
        field = fields.get(name)
        if field is None:
            errors.append("mapped field missing: " + name)
            continue
        if name in FORBIDDEN or name == "url" or name.startswith(("url_", "im_")):
            errors.append("excluded native field: " + name)
        if field.get("visible") != 1:
            errors.append("native field is not visible: " + name)
        kind = str(field.get("field_type_class", "")).rsplit(chr(92), 1)[-1]
        if kind != binding["expected_type"]:
            errors.append("field type changed: " + name)
        if kind not in NORMALIZERS.get(binding["normalizer"], set()):
            errors.append("unsupported normalizer/type: " + name)
        if binding["usage"] not in {"confirmed_projection_only", "explicit_location_preference_only"}:
            errors.append("unsupported usage: " + name)
        mapped.append({"logical_key": key, "native_internal_name": name, "field_type": kind})
    proposed = config.get("proposed_inputs")
    if not isinstance(proposed, list) or not all(isinstance(x, str) for x in proposed):
        errors.append("proposed_inputs must be an array of logical names")
    ranking = config.get("ranking", {})
    if not isinstance(ranking, dict):
        ranking = {}
        errors.append("ranking must be an object")
    if set(ranking) != {"weights", "candidate_limit", "llm_candidate_limit", "final_limit"}:
        errors.append("unexpected or missing ranking keys")
    weights = ranking.get("weights", {})
    valid_weights = isinstance(weights, dict) and set(weights) == DIMENSIONS
    valid_weights = valid_weights and all(type(v) in (int, float) and math.isfinite(v) and 0 <= v <= 1 for v in weights.values())
    if not valid_weights or not math.isclose(sum(weights.values()), 1.0):
        errors.append("weights must name four policy dimensions and sum to 1")
    limits = {"candidate_limit": 200, "llm_candidate_limit": 24, "final_limit": 5}
    for key, maximum in limits.items():
        value = ranking.get(key)
        if type(value) is not int or not 1 <= value <= maximum:
            errors.append("invalid or excessive limit: " + key)
    if all(type(ranking.get(k)) is int for k in limits):
        if not ranking["final_limit"] <= ranking["llm_candidate_limit"] <= ranking["candidate_limit"]:
            errors.append("candidate limits must be ordered")
    return report(errors, mapped, sorted(set(fields) - bound_names))


def report(errors, mapped, unmapped):
    return {
        "metadata_valid": not errors,
        "runtime_ready": False,
        "errors": errors,
        "mapped_fields": mapped,
        "unmapped_native_fields": unmapped,
        "runtime_prerequisites_not_validated": [
            "server-verified current event and active memberships",
            "confirmed authenticated projection and per-value authorization",
            "relationship exclusions, blocks and contact-source checks",
            "read-time and asynchronous version/permission revalidation"
        ]
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=HERE / "config.draft.json")
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    args = parser.parse_args()
    result = validate(json.loads(args.config.read_text()), json.loads(args.catalog.read_text()))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["metadata_valid"] else 1)
