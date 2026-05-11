from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any


JudgeRunner = Callable[..., dict[str, Any]]


def evaluate_case_checks(
    case: dict[str, Any],
    *,
    final_output: dict[str, Any] | None = None,
    artifacts: dict[str, Any] | None = None,
    judge_runner: JudgeRunner | None = None,
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
        elif kind in {"knowledge_retrieval", "knowledge_context"}:
            results.append(_evaluate_knowledge_retrieval_check(check_record, expected, output, artifact_map))
        elif kind in {"llm_judge", "judge"}:
            results.append(
                _evaluate_llm_judge_check(
                    case,
                    check_record,
                    expected,
                    output,
                    artifact_map,
                    judge_runner=judge_runner,
                )
            )
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


def _evaluate_knowledge_retrieval_check(
    check: dict[str, Any],
    expected: dict[str, Any],
    final_output: dict[str, Any],
    artifacts: dict[str, Any],
) -> dict[str, Any]:
    target_name = _text(check.get("target")) or _text(expected.get("target")) or "knowledge_context"
    target = _resolve_target(target_name, final_output, artifacts)
    package = _as_dict(target)
    results = _knowledge_results(target)
    citations = _knowledge_citations(package, results)
    context = _text(package.get("context")) if package else _flatten_text(target)
    searchable_text = _flatten_text(target)

    min_results = _int_value(check.get("min_results"))
    if min_results <= 0:
        min_results = _int_value(expected.get("min_results"))
    max_citations = _int_value(check.get("max_citations"))
    if max_citations <= 0:
        max_citations = _int_value(expected.get("max_citations"))
    max_context_chars = _int_value(check.get("max_context_chars"))
    if max_context_chars <= 0:
        max_context_chars = _int_value(expected.get("max_context_chars"))

    chunk_ids = _dedupe([_text(item.get("chunk_id")) for item in results if _text(item.get("chunk_id"))])
    citation_ids = _dedupe([_text(item.get("citation_id")) for item in citations if _text(item.get("citation_id"))])
    source_paths = _knowledge_source_paths(results, citations)
    required_chunk_ids = _string_list(check.get("required_chunk_ids")) or _string_list(expected.get("required_chunk_ids"))
    required_citation_ids = _string_list(check.get("required_citation_ids")) or _string_list(
        expected.get("required_citation_ids")
    )
    required_source_paths = _string_list(check.get("required_source_paths")) or _string_list(
        expected.get("required_source_paths")
    )
    required_terms = _string_list(check.get("required_terms")) or _string_list(expected.get("required_terms"))
    forbidden_terms = (
        _string_list(check.get("forbidden_terms"))
        or _string_list(check.get("forbidden"))
        or _string_list(expected.get("forbidden_terms"))
        or _string_list(expected.get("forbidden"))
    )

    missing_chunk_ids = [item for item in required_chunk_ids if item not in chunk_ids]
    missing_citation_ids = [item for item in required_citation_ids if item not in citation_ids]
    missing_source_paths = [item for item in required_source_paths if item not in source_paths]
    missing_terms = _missing_terms(required_terms, searchable_text)
    forbidden_terms_found = _found_terms(forbidden_terms, searchable_text)
    context_chars = len(context)

    issues: list[str] = []
    if min_results > 0 and len(results) < min_results:
        issues.append(f"Expected at least {min_results} retrieval result(s), found {len(results)}.")
    if missing_chunk_ids:
        issues.append(f"Missing required chunk id(s): {', '.join(missing_chunk_ids)}.")
    if missing_citation_ids:
        issues.append(f"Missing required citation id(s): {', '.join(missing_citation_ids)}.")
    if missing_source_paths:
        issues.append(f"Missing required source path(s): {', '.join(missing_source_paths)}.")
    if missing_terms:
        issues.append(f"Missing required retrieval term(s): {', '.join(missing_terms)}.")
    if forbidden_terms_found:
        issues.append(f"Forbidden retrieval term(s) found: {', '.join(forbidden_terms_found)}.")
    if max_citations > 0 and len(citations) > max_citations:
        issues.append(f"Expected at most {max_citations} citation(s), found {len(citations)}.")
    if max_context_chars > 0 and context_chars > max_context_chars:
        issues.append(f"Expected context at most {max_context_chars} char(s), found {context_chars}.")

    passed = not issues
    return _result(
        check,
        status="passed" if passed else "failed",
        score=1.0 if passed else 0.0,
        message="Knowledge retrieval check passed." if passed else " ".join(issues),
        expected={
            "target": target_name,
            "min_results": min_results,
            "required_chunk_ids": required_chunk_ids,
            "required_citation_ids": required_citation_ids,
            "required_source_paths": required_source_paths,
            "required_terms": required_terms,
            "forbidden_terms": forbidden_terms,
            "max_citations": max_citations,
            "max_context_chars": max_context_chars,
        },
        actual={
            "result_count": len(results),
            "citation_count": len(citations),
            "context_chars": context_chars,
            "chunk_ids": chunk_ids,
            "citation_ids": citation_ids,
            "source_paths": source_paths,
            "missing_chunk_ids": missing_chunk_ids,
            "missing_citation_ids": missing_citation_ids,
            "missing_source_paths": missing_source_paths,
            "missing_terms": missing_terms,
            "forbidden_terms_found": forbidden_terms_found,
        },
    )


def _evaluate_llm_judge_check(
    case: dict[str, Any],
    check: dict[str, Any],
    expected: dict[str, Any],
    final_output: dict[str, Any],
    artifacts: dict[str, Any],
    *,
    judge_runner: JudgeRunner | None,
) -> dict[str, Any]:
    expected_payload = _llm_judge_expected_payload(check, expected)
    if judge_runner is None:
        return _mark_llm_judge(
            _result(
                check,
                status="skipped",
                score=None,
                message="LLM judge check is not enabled for this evaluation request.",
                expected=expected_payload,
                actual={},
            )
        )

    try:
        judgment = judge_runner(case=case, check=check, final_output=final_output, artifacts=artifacts)
    except Exception as exc:
        return _mark_llm_judge(
            _result(
                check,
                status="error",
                score=None,
                message=f"LLM judge execution failed: {exc}",
                expected=expected_payload,
                actual={"error": str(exc)},
            )
        )
    return _normalize_llm_judge_result(check, expected_payload, judgment)


def _llm_judge_expected_payload(check: dict[str, Any], expected: dict[str, Any]) -> dict[str, Any]:
    rubric = _text(check.get("rubric")) or _text(expected.get("rubric"))
    min_score = _optional_float(check.get("min_score"))
    if min_score is None:
        min_score = _optional_float(check.get("threshold"))
    if min_score is None:
        min_score = _optional_float(expected.get("min_score"))
    if min_score is None:
        min_score = _optional_float(expected.get("threshold"))
    return {
        "target": _text(check.get("target")) or "final_output",
        "rubric": rubric,
        "criteria": _string_list(check.get("criteria")) or _string_list(expected.get("criteria")),
        "min_score": min_score,
    }


def _normalize_llm_judge_result(
    check: dict[str, Any],
    expected_payload: dict[str, Any],
    judgment: dict[str, Any],
) -> dict[str, Any]:
    record = _as_dict(judgment)
    score = _optional_float(record.get("score"))
    status = _normalize_status(record.get("status"))
    if not status:
        status = _normalize_status(record.get("verdict"))
    if not status and score is not None:
        min_score = _optional_float(expected_payload.get("min_score"))
        status = "passed" if min_score is None or score >= min_score else "failed"
    if not status:
        status = "error"
    actual = _as_dict(record.get("actual"))
    if not actual:
        actual = {
            key: record.get(key)
            for key in ("verdict", "reason", "strengths", "issues")
            if record.get(key) not in (None, "", [], {})
        }
    message = _text(record.get("message")) or _text(record.get("reason")) or "LLM judge completed."
    result = _result(
        check,
        status=status,
        score=score,
        message=message,
        expected=expected_payload,
        actual=actual,
    )
    result["details"] = {**_as_dict(check.get("details")), **_as_dict(record.get("details"))}
    return _mark_llm_judge(result)


def _mark_llm_judge(result: dict[str, Any]) -> dict[str, Any]:
    result["reviewer"] = "llm_judge"
    return result


def _normalize_status(value: Any) -> str:
    normalized = _text(value).lower()
    if normalized in {"passed", "pass", "success", "succeeded", "ok"}:
        return "passed"
    if normalized in {"failed", "fail", "failure", "no"}:
        return "failed"
    if normalized in {"error", "errored"}:
        return "error"
    if normalized in {"skipped", "skip"}:
        return "skipped"
    return ""


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


def _knowledge_results(target: Any) -> list[dict[str, Any]]:
    if isinstance(target, list):
        return [_as_dict(item) for item in target if isinstance(item, dict)]
    package = _as_dict(target)
    return [_as_dict(item) for item in _as_list(package.get("results")) if isinstance(item, dict)]


def _knowledge_citations(package: dict[str, Any], results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    citations = [_normalize_knowledge_citation(item) for item in _as_list(package.get("citations"))]
    citations = [item for item in citations if item]
    if citations:
        return citations
    return [
        {
            "citation_id": _text(result.get("citation_id")),
            "chunk_id": _text(result.get("chunk_id")),
            "source": _text(result.get("source")),
            "url": _text(result.get("url")),
        }
        for result in results
        if _text(result.get("citation_id")) or _text(result.get("chunk_id"))
    ]


def _normalize_knowledge_citation(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return _as_dict(value)
    text = _text(value)
    return {"citation_id": text} if text else {}


def _knowledge_source_paths(results: list[dict[str, Any]], citations: list[dict[str, Any]]) -> list[str]:
    values: list[str] = []
    for item in [*results, *citations]:
        metadata = _as_dict(item.get("metadata"))
        values.extend(
            _text(candidate)
            for candidate in [
                metadata.get("source_path"),
                metadata.get("path"),
                item.get("source_path"),
                item.get("source"),
                item.get("url"),
            ]
            if _text(candidate)
        )
    return _dedupe(values)


def _missing_terms(terms: list[str], text: str) -> list[str]:
    normalized = text.lower()
    return [term for term in terms if term.lower() not in normalized]


def _found_terms(terms: list[str], text: str) -> list[str]:
    normalized = text.lower()
    return [term for term in terms if term.lower() in normalized]


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


def _optional_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


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
