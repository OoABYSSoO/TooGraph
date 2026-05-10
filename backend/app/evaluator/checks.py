from __future__ import annotations

import re
from typing import Any


def evaluate_case_checks(
    case: dict[str, Any],
    *,
    final_output: dict[str, Any] | None = None,
    artifacts: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    output = final_output or {}
    artifact_map = artifacts or {}
    expected = _as_dict(case.get("expected"))
    results: list[dict[str, Any]] = []
    for check in _as_list(case.get("checks")):
        check_record = _as_dict(check)
        kind = _text(check_record.get("kind"))
        if kind == "schema":
            results.append(_evaluate_schema_check(check_record, expected, output, artifact_map))
        elif kind == "artifact":
            results.append(_evaluate_artifact_check(check_record, expected, output, artifact_map))
        elif kind == "rule":
            results.append(_evaluate_rule_check(check_record, expected, output, artifact_map))
        elif kind == "citation":
            results.append(_evaluate_citation_check(check_record, expected, output, artifact_map))
        else:
            results.append(
                _result(
                    check_record,
                    status="skipped",
                    score=None,
                    message=f"Unsupported eval check kind: {kind or 'unknown'}.",
                    expected={"kind": kind},
                    actual={},
                )
            )
    return results


def summarize_check_status(check_results: list[dict[str, Any]]) -> str:
    statuses = [_text(check.get("status")) for check in check_results]
    if not statuses:
        return "passed"
    if any(status == "error" for status in statuses):
        return "error"
    if any(status == "failed" for status in statuses):
        return "failed"
    if all(status == "skipped" for status in statuses):
        return "skipped"
    return "passed"


def _evaluate_schema_check(
    check: dict[str, Any],
    expected: dict[str, Any],
    final_output: dict[str, Any],
    artifacts: dict[str, Any],
) -> dict[str, Any]:
    required = _string_list(check.get("required")) or _string_list(expected.get("required"))
    target_name = _text(check.get("target")) or "final_output"
    target = _resolve_target(target_name, final_output, artifacts)
    present: list[str] = []
    missing: list[str] = []
    for path in required:
        value = _resolve_path(path, target)
        if _has_value(value):
            present.append(path)
        else:
            missing.append(path)
    status = "passed" if not missing else "failed"
    return _result(
        check,
        status=status,
        score=1.0 if status == "passed" else 0.0,
        message="Schema check passed." if status == "passed" else f"Missing required field(s): {', '.join(missing)}.",
        expected={"required": required, "target": target_name},
        actual={"present": present, "missing": missing},
    )


def _evaluate_artifact_check(
    check: dict[str, Any],
    expected: dict[str, Any],
    final_output: dict[str, Any],
    artifacts: dict[str, Any],
) -> dict[str, Any]:
    target = _text(check.get("target")) or _text(expected.get("target"))
    value = _resolve_target(target, final_output, artifacts) if target else artifacts
    found = _has_value(value)
    return _result(
        check,
        status="passed" if found else "failed",
        score=1.0 if found else 0.0,
        message="Artifact check passed." if found else f"Missing artifact: {target or 'artifacts'}.",
        expected={"target": target},
        actual={"target": target, "found": found},
    )


def _evaluate_rule_check(
    check: dict[str, Any],
    expected: dict[str, Any],
    final_output: dict[str, Any],
    artifacts: dict[str, Any],
) -> dict[str, Any]:
    target_name = _text(check.get("target")) or _text(expected.get("target")) or "final_output"
    target = _resolve_target(target_name, final_output, artifacts)
    text = _flatten_text(target)
    must_include = _string_list(check.get("must_include")) or _string_list(expected.get("must_include"))
    forbidden = (
        _string_list(check.get("forbidden"))
        or _string_list(check.get("not_contains"))
        or _string_list(expected.get("forbidden"))
        or _string_list(expected.get("not_contains"))
    )
    missing = [item for item in must_include if item not in text]
    forbidden_found = [item for item in forbidden if item in text]
    passed = not missing and not forbidden_found
    message = "Rule check passed."
    if not passed:
        parts = []
        if missing:
            parts.append(f"missing required text: {', '.join(missing)}")
        if forbidden_found:
            parts.append(f"forbidden text found: {', '.join(forbidden_found)}")
        message = "; ".join(parts)
    return _result(
        check,
        status="passed" if passed else "failed",
        score=1.0 if passed else 0.0,
        message=message,
        expected={"target": target_name, "must_include": must_include, "forbidden": forbidden},
        actual={"missing": missing, "forbidden_found": forbidden_found},
    )


def _evaluate_citation_check(
    check: dict[str, Any],
    expected: dict[str, Any],
    final_output: dict[str, Any],
    artifacts: dict[str, Any],
) -> dict[str, Any]:
    min_citations = _int_value(check.get("min_citations"))
    if min_citations <= 0:
        min_citations = _int_value(expected.get("min_citations"))
    if min_citations <= 0:
        min_citations = _int_value(expected.get("citations"))
    if min_citations <= 0:
        min_citations = 1
    citations = _collect_citations(final_output, artifacts)
    passed = len(citations) >= min_citations
    return _result(
        check,
        status="passed" if passed else "failed",
        score=1.0 if passed else 0.0,
        message=(
            "Citation check passed."
            if passed
            else f"Expected at least {min_citations} citation(s), found {len(citations)}."
        ),
        expected={"min_citations": min_citations},
        actual={"citation_count": len(citations), "citations": citations},
    )


def _collect_citations(final_output: dict[str, Any], artifacts: dict[str, Any]) -> list[str]:
    explicit: list[str] = []
    for source in (final_output, artifacts):
        value = source.get("citations") if isinstance(source, dict) else None
        if isinstance(value, list):
            explicit.extend(_text(item) for item in value if _text(item))
    if explicit:
        return _dedupe(explicit)
    text = f"{_flatten_text(final_output)}\n{_flatten_text(artifacts)}"
    return _dedupe(re.findall(r"\[\d+\]", text))


def _resolve_target(target: str, final_output: dict[str, Any], artifacts: dict[str, Any]) -> Any:
    if not target or target == "final_output":
        return final_output
    if target == "artifacts":
        return artifacts
    if target in artifacts:
        return artifacts[target]
    if target in final_output:
        return final_output[target]
    output_value = _resolve_path(target, final_output)
    if output_value is not None:
        return output_value
    return _resolve_path(target, artifacts)


def _resolve_path(path: str, value: Any) -> Any:
    if not path:
        return value
    current = value
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
            continue
        return None
    return current


def _has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict, tuple, set)):
        return bool(value)
    return True


def _result(
    check: dict[str, Any],
    *,
    status: str,
    score: float | None,
    message: str,
    expected: dict[str, Any],
    actual: dict[str, Any],
) -> dict[str, Any]:
    return {
        "kind": _text(check.get("kind")),
        "name": _text(check.get("name")) or _text(check.get("kind")),
        "status": status,
        "score": score,
        "message": message,
        "expected": expected,
        "actual": actual,
        "details": _as_dict(check.get("details")),
        "reviewer": "auto",
    }


def _flatten_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return "\n".join(_flatten_text(item) for item in value.values())
    if isinstance(value, list):
        return "\n".join(_flatten_text(item) for item in value)
    return str(value)


def _string_list(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [_text(item) for item in value if _text(item)]
    return []


def _as_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def _int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _text(value: Any) -> str:
    return str(value or "").strip()


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result
