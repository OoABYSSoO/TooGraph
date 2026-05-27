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
        elif kind in {"memory_retrieval", "memory_context"}:
            results.append(_evaluate_memory_retrieval_check(check_record, expected, output, artifact_map))
        elif kind in {"hybrid_recall", "session_memory_recall", "hybrid_memory_recall"}:
            results.append(_evaluate_hybrid_recall_check(check_record, expected, output, artifact_map))
        elif kind in {"capability_selection", "capability_selector"}:
            results.append(_evaluate_capability_selection_check(check_record, expected, output, artifact_map))
        elif kind in {"scheduler_run", "scheduled_graph_job_run"}:
            results.append(_evaluate_scheduler_run_check(check_record, expected, output, artifact_map))
        elif kind in {"delegation_worker", "worker_result", "worker_result_package"}:
            results.append(_evaluate_delegation_worker_check(check_record, expected, output, artifact_map))
        elif kind in {"provider_fallback", "model_provider_fallback", "provider_fallback_trace"}:
            results.append(_evaluate_provider_fallback_check(check_record, expected, output, artifact_map))
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


def _evaluate_memory_retrieval_check(
    check: dict[str, Any],
    expected: dict[str, Any],
    final_output: dict[str, Any],
    artifacts: dict[str, Any],
) -> dict[str, Any]:
    target_name = _text(check.get("target")) or _text(expected.get("target")) or "memory_search_report"
    target = _resolve_target(target_name, final_output, artifacts)
    package = _as_dict(target)
    results = _memory_results(target)
    source_refs = _memory_source_refs(package, results)
    searchable_text = _flatten_text(target)

    min_results = _int_value(check.get("min_results"))
    if min_results <= 0:
        min_results = _int_value(expected.get("min_results"))
    max_context_chars = _int_value(check.get("max_context_chars"))
    if max_context_chars <= 0:
        max_context_chars = _int_value(expected.get("max_context_chars"))

    memory_ids = _dedupe(
        [
            *_string_list(package.get("memory_ids")),
            *[_text(item.get("memory_id")) for item in results if _text(item.get("memory_id"))],
            *[
                _text(item.get("source_id"))
                for item in source_refs
                if _text(item.get("source_kind")) == "memory_entry" and _text(item.get("source_id"))
            ],
        ]
    )
    required_memory_ids = _string_list(check.get("required_memory_ids")) or _string_list(
        expected.get("required_memory_ids")
    )
    required_terms = _string_list(check.get("required_terms")) or _string_list(expected.get("required_terms"))
    forbidden_terms = (
        _string_list(check.get("forbidden_terms"))
        or _string_list(check.get("forbidden"))
        or _string_list(expected.get("forbidden_terms"))
        or _string_list(expected.get("forbidden"))
    )
    required_source_refs = _source_ref_requirements(check.get("required_source_refs")) or _source_ref_requirements(
        expected.get("required_source_refs")
    )
    required_reranker_model_ref = _text(check.get("required_reranker_model_ref")) or _text(
        expected.get("required_reranker_model_ref")
    )
    required_rerank_status = _text(check.get("required_rerank_status")) or _text(expected.get("required_rerank_status"))
    required_top_memory_id = _text(check.get("required_top_memory_id")) or _text(expected.get("required_top_memory_id"))
    required_ranked_memory_ids = _string_list(check.get("required_ranked_memory_ids")) or _string_list(
        expected.get("required_ranked_memory_ids")
    )

    ranking_reports = _memory_ranking_reports(package)
    reranker_model_refs = _dedupe(
        [_text(report.get("reranker_model_ref")) for report in ranking_reports if _text(report.get("reranker_model_ref"))]
    )
    rerank_statuses = _dedupe(
        [
            _text(_as_dict(_as_dict(report.get("ranking_metadata")).get("rerank")).get("status"))
            for report in ranking_reports
            if _text(_as_dict(_as_dict(report.get("ranking_metadata")).get("rerank")).get("status"))
        ]
    )
    ranked_memory_ids = _memory_ranked_ids_from_reports(ranking_reports)
    top_memory_id = ranked_memory_ids[0] if ranked_memory_ids else ""

    context_chars = _int_value(package.get("context_chars"))
    if context_chars <= 0:
        context_chars = _int_value(_as_dict(package.get("budget")).get("used_chars"))
    if context_chars <= 0:
        context_chars = len(searchable_text)

    missing_memory_ids = [item for item in required_memory_ids if item not in memory_ids]
    missing_source_refs = [item for item in required_source_refs if not _has_source_ref(source_refs, item)]
    missing_terms = _missing_terms(required_terms, searchable_text)
    forbidden_terms_found = _found_terms(forbidden_terms, searchable_text)
    ranked_memory_prefix_mismatch = (
        bool(required_ranked_memory_ids)
        and ranked_memory_ids[: len(required_ranked_memory_ids)] != required_ranked_memory_ids
    )

    memory_count = len(results)
    if memory_count <= 0:
        memory_count = _int_value(package.get("memory_count")) or len(memory_ids)

    issues: list[str] = []
    if min_results > 0 and memory_count < min_results:
        issues.append(f"Expected at least {min_results} memory result(s), found {memory_count}.")
    if missing_memory_ids:
        issues.append(f"Missing required memory id(s): {', '.join(missing_memory_ids)}.")
    if missing_source_refs:
        issues.append(f"Missing required source ref(s): {_format_source_refs(missing_source_refs)}.")
    if missing_terms:
        issues.append(f"Missing required memory term(s): {', '.join(missing_terms)}.")
    if forbidden_terms_found:
        issues.append(f"Forbidden memory term(s) found: {', '.join(forbidden_terms_found)}.")
    if max_context_chars > 0 and context_chars > max_context_chars:
        issues.append(f"Expected memory context at most {max_context_chars} char(s), found {context_chars}.")
    if required_reranker_model_ref and required_reranker_model_ref not in reranker_model_refs:
        issues.append(f"Missing required reranker model ref: {required_reranker_model_ref}.")
    if required_rerank_status and required_rerank_status not in rerank_statuses:
        issues.append(f"Missing required rerank status: {required_rerank_status}.")
    if required_top_memory_id and top_memory_id != required_top_memory_id:
        issues.append(f"Expected top reranked memory id {required_top_memory_id}, found {top_memory_id or 'none'}.")
    if ranked_memory_prefix_mismatch:
        issues.append(
            "Expected ranked memory id prefix "
            f"{', '.join(required_ranked_memory_ids)}, found {', '.join(ranked_memory_ids) or 'none'}."
        )

    passed = not issues
    return _result(
        check,
        status="passed" if passed else "failed",
        score=1.0 if passed else 0.0,
        message="Memory retrieval check passed." if passed else " ".join(issues),
        expected={
            "target": target_name,
            "min_results": min_results,
            "required_memory_ids": required_memory_ids,
            "required_source_refs": required_source_refs,
            "required_terms": required_terms,
            "forbidden_terms": forbidden_terms,
            "max_context_chars": max_context_chars,
            "required_reranker_model_ref": required_reranker_model_ref,
            "required_rerank_status": required_rerank_status,
            "required_top_memory_id": required_top_memory_id,
            "required_ranked_memory_ids": required_ranked_memory_ids,
        },
        actual={
            "memory_count": memory_count,
            "context_chars": context_chars,
            "memory_ids": memory_ids,
            "source_refs": source_refs,
            "missing_memory_ids": missing_memory_ids,
            "missing_source_refs": missing_source_refs,
            "missing_terms": missing_terms,
            "forbidden_terms_found": forbidden_terms_found,
            "reranker_model_refs": reranker_model_refs,
            "rerank_statuses": rerank_statuses,
            "top_memory_id": top_memory_id,
            "ranked_memory_ids": ranked_memory_ids,
        },
    )


def _evaluate_hybrid_recall_check(
    check: dict[str, Any],
    expected: dict[str, Any],
    final_output: dict[str, Any],
    artifacts: dict[str, Any],
) -> dict[str, Any]:
    target_name = _text(check.get("target")) or _text(expected.get("target")) or "hybrid_recall_report"
    target = _resolve_target(target_name, final_output, artifacts)
    package = _as_dict(target)
    source_refs = _hybrid_recall_source_refs(package)
    searchable_text = f"{_flatten_text(target)}\n{_flatten_mapping_keys(target)}"

    min_memory_results = _int_value(check.get("min_memory_results"))
    if min_memory_results <= 0:
        min_memory_results = _int_value(expected.get("min_memory_results"))
    min_session_results = _int_value(check.get("min_session_results"))
    if min_session_results <= 0:
        min_session_results = _int_value(expected.get("min_session_results"))
    max_context_chars = _int_value(check.get("max_context_chars"))
    if max_context_chars <= 0:
        max_context_chars = _int_value(expected.get("max_context_chars"))

    memory_ids = _hybrid_memory_ids(package, source_refs)
    message_ids = _hybrid_message_ids(package, source_refs)
    required_memory_ids = _string_list(check.get("required_memory_ids")) or _string_list(
        expected.get("required_memory_ids")
    )
    required_message_ids = _string_list(check.get("required_message_ids")) or _string_list(
        expected.get("required_message_ids")
    )
    required_source_refs = _source_ref_requirements(check.get("required_source_refs")) or _source_ref_requirements(
        expected.get("required_source_refs")
    )
    required_terms = _string_list(check.get("required_terms")) or _string_list(expected.get("required_terms"))
    forbidden_terms = (
        _string_list(check.get("forbidden_terms"))
        or _string_list(check.get("forbidden"))
        or _string_list(expected.get("forbidden_terms"))
        or _string_list(expected.get("forbidden"))
    )

    memory_count = _int_value(package.get("memory_count")) or len(memory_ids)
    session_count = _int_value(package.get("session_count")) or _int_value(package.get("session_result_count"))
    if session_count <= 0:
        session_count = len(_string_list(package.get("session_ids"))) or len(message_ids)
    context_chars = _int_value(package.get("context_chars"))
    if context_chars <= 0:
        context_chars = _int_value(package.get("used_chars")) or _int_value(_as_dict(package.get("budget")).get("used_chars"))
    if context_chars <= 0:
        context_chars = len(searchable_text)

    missing_memory_ids = [item for item in required_memory_ids if item not in memory_ids]
    missing_message_ids = [item for item in required_message_ids if item not in message_ids]
    missing_source_refs = [item for item in required_source_refs if not _has_source_ref(source_refs, item)]
    missing_terms = _missing_terms(required_terms, searchable_text)
    forbidden_terms_found = _found_terms(forbidden_terms, searchable_text)

    issues: list[str] = []
    if not package:
        issues.append(f"Missing hybrid recall report at target '{target_name}'.")
    if min_memory_results > 0 and memory_count < min_memory_results:
        issues.append(f"Expected at least {min_memory_results} memory result(s), found {memory_count}.")
    if min_session_results > 0 and session_count < min_session_results:
        issues.append(f"Expected at least {min_session_results} session result(s), found {session_count}.")
    if missing_memory_ids:
        issues.append(f"Missing required memory id(s): {', '.join(missing_memory_ids)}.")
    if missing_message_ids:
        issues.append(f"Missing required message id(s): {', '.join(missing_message_ids)}.")
    if missing_source_refs:
        issues.append(f"Missing required source ref(s): {_format_source_refs(missing_source_refs)}.")
    if missing_terms:
        issues.append(f"Missing hybrid recall term(s): {', '.join(missing_terms)}.")
    if forbidden_terms_found:
        issues.append(f"Forbidden hybrid recall term(s) found: {', '.join(forbidden_terms_found)}.")
    if max_context_chars > 0 and context_chars > max_context_chars:
        issues.append(f"Expected hybrid recall context at most {max_context_chars} char(s), found {context_chars}.")

    passed = not issues
    return _result(
        check,
        status="passed" if passed else "failed",
        score=1.0 if passed else 0.0,
        message="Hybrid recall check passed." if passed else " ".join(issues),
        expected={
            "target": target_name,
            "min_memory_results": min_memory_results,
            "min_session_results": min_session_results,
            "required_memory_ids": required_memory_ids,
            "required_message_ids": required_message_ids,
            "required_source_refs": required_source_refs,
            "required_terms": required_terms,
            "forbidden_terms": forbidden_terms,
            "max_context_chars": max_context_chars,
        },
        actual={
            "memory_count": memory_count,
            "session_count": session_count,
            "context_chars": context_chars,
            "memory_ids": memory_ids,
            "message_ids": message_ids,
            "source_refs": source_refs,
            "missing_memory_ids": missing_memory_ids,
            "missing_message_ids": missing_message_ids,
            "missing_source_refs": missing_source_refs,
            "missing_terms": missing_terms,
            "forbidden_terms_found": forbidden_terms_found,
        },
    )


def _evaluate_capability_selection_check(
    check: dict[str, Any],
    expected: dict[str, Any],
    final_output: dict[str, Any],
    artifacts: dict[str, Any],
) -> dict[str, Any]:
    target_name = _text(check.get("target")) or _text(expected.get("target")) or "capability_selection_trace"
    target = _resolve_target(target_name, final_output, artifacts)
    trace = _as_dict(target)
    requested = _normalize_capability_ref(trace.get("requested"))
    selected = _normalize_capability_ref(trace.get("selected"))
    rejected_candidates = [
        _normalize_capability_candidate(item)
        for item in _as_list(trace.get("rejected_candidates"))
        if isinstance(item, dict)
    ]
    fallback_candidates = [
        _normalize_capability_candidate(item)
        for item in _as_list(trace.get("fallback_candidates"))
        if isinstance(item, dict)
    ]
    searchable_text = _flatten_text(target)

    required_requested = _capability_requirements(check.get("required_requested")) or _capability_requirements(
        expected.get("required_requested")
    )
    required_selected = _capability_requirements(check.get("required_selected")) or _capability_requirements(
        expected.get("required_selected")
    )
    required_rejected = _capability_requirements(check.get("required_rejected")) or _capability_requirements(
        expected.get("required_rejected")
    )
    required_fallbacks = _capability_requirements(check.get("required_fallbacks")) or _capability_requirements(
        expected.get("required_fallbacks")
    )
    required_terms = _string_list(check.get("required_terms")) or _string_list(expected.get("required_terms"))
    forbidden_terms = (
        _string_list(check.get("forbidden_terms"))
        or _string_list(check.get("forbidden"))
        or _string_list(expected.get("forbidden_terms"))
        or _string_list(expected.get("forbidden"))
    )
    min_rejected = _int_value(check.get("min_rejected"))
    if min_rejected <= 0:
        min_rejected = _int_value(expected.get("min_rejected"))
    min_fallbacks = _int_value(check.get("min_fallbacks"))
    if min_fallbacks <= 0:
        min_fallbacks = _int_value(expected.get("min_fallbacks"))

    missing_requested = [item for item in required_requested if not _capability_matches(requested, item)]
    missing_selected = [item for item in required_selected if not _capability_matches(selected, item)]
    missing_rejected = [
        item
        for item in required_rejected
        if not any(_capability_matches(candidate, item) for candidate in rejected_candidates)
    ]
    missing_fallbacks = [
        item
        for item in required_fallbacks
        if not any(_capability_matches(candidate, item) for candidate in fallback_candidates)
    ]
    missing_terms = _missing_terms(required_terms, searchable_text)
    forbidden_terms_found = _found_terms(forbidden_terms, searchable_text)

    issues: list[str] = []
    if not trace:
        issues.append(f"Missing capability selection trace at target '{target_name}'.")
    if min_rejected > 0 and len(rejected_candidates) < min_rejected:
        issues.append(f"Expected at least {min_rejected} rejected candidate(s), found {len(rejected_candidates)}.")
    if min_fallbacks > 0 and len(fallback_candidates) < min_fallbacks:
        issues.append(f"Expected at least {min_fallbacks} fallback candidate(s), found {len(fallback_candidates)}.")
    if missing_requested:
        issues.append(f"Missing requested capability: {_format_capability_requirements(missing_requested)}.")
    if missing_selected:
        issues.append(f"Missing selected capability: {_format_capability_requirements(missing_selected)}.")
    if missing_rejected:
        issues.append(f"Missing rejected candidate(s): {_format_capability_requirements(missing_rejected)}.")
    if missing_fallbacks:
        issues.append(f"Missing fallback candidate(s): {_format_capability_requirements(missing_fallbacks)}.")
    if missing_terms:
        issues.append(f"Missing capability selection term(s): {', '.join(missing_terms)}.")
    if forbidden_terms_found:
        issues.append(f"Forbidden capability selection term(s) found: {', '.join(forbidden_terms_found)}.")

    passed = not issues
    return _result(
        check,
        status="passed" if passed else "failed",
        score=1.0 if passed else 0.0,
        message="Capability selection check passed." if passed else " ".join(issues),
        expected={
            "target": target_name,
            "required_requested": required_requested,
            "required_selected": required_selected,
            "required_rejected": required_rejected,
            "required_fallbacks": required_fallbacks,
            "required_terms": required_terms,
            "forbidden_terms": forbidden_terms,
            "min_rejected": min_rejected,
            "min_fallbacks": min_fallbacks,
        },
        actual={
            "requested": requested,
            "selected": selected,
            "rejected_candidates": rejected_candidates,
            "fallback_candidates": fallback_candidates,
            "missing_requested": missing_requested,
            "missing_selected": missing_selected,
            "missing_rejected": missing_rejected,
            "missing_fallbacks": missing_fallbacks,
            "missing_terms": missing_terms,
            "forbidden_terms_found": forbidden_terms_found,
        },
    )


def _evaluate_scheduler_run_check(
    check: dict[str, Any],
    expected: dict[str, Any],
    final_output: dict[str, Any],
    artifacts: dict[str, Any],
) -> dict[str, Any]:
    target_name = _text(check.get("target")) or _text(expected.get("target")) or "scheduler_run_report"
    target = _resolve_target(target_name, final_output, artifacts)
    report = _as_dict(target)
    searchable_text = f"{_flatten_text(target)}\n{_flatten_mapping_keys(target)}"

    required_job_id = _text(check.get("required_job_id")) or _text(expected.get("required_job_id"))
    required_job_run_id = _text(check.get("required_job_run_id")) or _text(expected.get("required_job_run_id"))
    required_run_id = _text(check.get("required_run_id")) or _text(expected.get("required_run_id"))
    required_trigger_reason = _text(check.get("required_trigger_reason")) or _text(
        expected.get("required_trigger_reason")
    )
    required_status = _text(check.get("required_status")) or _text(expected.get("required_status"))
    required_retry_decision = _as_dict(check.get("required_retry_decision")) or _as_dict(
        expected.get("required_retry_decision")
    )
    required_pending_retry = _as_dict(check.get("required_pending_retry")) or _as_dict(
        expected.get("required_pending_retry")
    )
    required_delivery_result = _as_dict(check.get("required_delivery_result")) or _as_dict(
        expected.get("required_delivery_result")
    )
    required_graph_permission_mode = _text(check.get("required_graph_permission_mode")) or _text(
        expected.get("required_graph_permission_mode")
    )
    required_permission_policy = _as_dict(check.get("required_permission_policy")) or _as_dict(
        expected.get("required_permission_policy")
    )
    required_permission_policy_source = _text(check.get("required_permission_policy_source")) or _text(
        expected.get("required_permission_policy_source")
    )
    required_pending_permission_approval = _as_dict(check.get("required_pending_permission_approval")) or _as_dict(
        expected.get("required_pending_permission_approval")
    )
    required_terms = _string_list(check.get("required_terms")) or _string_list(expected.get("required_terms"))
    forbidden_terms = (
        _string_list(check.get("forbidden_terms"))
        or _string_list(check.get("forbidden"))
        or _string_list(expected.get("forbidden_terms"))
        or _string_list(expected.get("forbidden"))
    )

    actual_job_id = _text(report.get("job_id"))
    actual_job_run_id = _text(report.get("job_run_id"))
    actual_run_id = _text(report.get("run_id"))
    actual_trigger_reason = _text(report.get("trigger_reason"))
    actual_status = _text(report.get("status"))
    retry_decision = _as_dict(report.get("retry_decision"))
    pending_retry = _as_dict(report.get("scheduler_retry_pending"))
    delivery_result = _as_dict(report.get("delivery_result"))
    graph_permission_mode = _text(report.get("graph_permission_mode"))
    permission_policy = _as_dict(report.get("permission_policy"))
    permission_policy_source = _text(report.get("scheduled_graph_permission_policy_source"))
    pending_permission_approval = _as_dict(report.get("pending_permission_approval"))

    missing_fields: list[str] = []
    if required_job_id and actual_job_id != required_job_id:
        missing_fields.append("job_id")
    if required_job_run_id and actual_job_run_id != required_job_run_id:
        missing_fields.append("job_run_id")
    if required_run_id and actual_run_id != required_run_id:
        missing_fields.append("run_id")
    if required_trigger_reason and actual_trigger_reason != required_trigger_reason:
        missing_fields.append("trigger_reason")
    if required_status and actual_status != required_status:
        missing_fields.append("status")
    if required_graph_permission_mode and graph_permission_mode != required_graph_permission_mode:
        missing_fields.append("graph_permission_mode")
    if required_permission_policy_source and permission_policy_source != required_permission_policy_source:
        missing_fields.append("permission_policy_source")

    missing_retry_decision = _dict_subset_missing(required_retry_decision, retry_decision)
    missing_pending_retry = _dict_subset_missing(required_pending_retry, pending_retry)
    missing_delivery_result = _dict_subset_missing(required_delivery_result, delivery_result)
    missing_permission_policy = _dict_subset_missing(required_permission_policy, permission_policy)
    missing_pending_permission_approval = _dict_subset_missing(
        required_pending_permission_approval,
        pending_permission_approval,
    )
    missing_terms = _missing_terms(required_terms, searchable_text)
    forbidden_terms_found = _found_terms(forbidden_terms, searchable_text)

    issues: list[str] = []
    if not report:
        issues.append(f"Missing scheduler run report at target '{target_name}'.")
    if missing_fields:
        issues.append(f"Scheduler run field mismatch: {', '.join(missing_fields)}.")
    if missing_retry_decision:
        issues.append("Scheduler retry decision did not include required fields.")
    if missing_pending_retry:
        issues.append("Scheduler pending retry did not include required fields.")
    if missing_delivery_result:
        issues.append("Scheduler delivery result did not include required fields.")
    if missing_permission_policy:
        issues.append("Scheduler permission policy did not include required fields.")
    if missing_pending_permission_approval:
        issues.append("Scheduler pending permission approval did not include required fields.")
    if missing_terms:
        issues.append(f"Missing scheduler run term(s): {', '.join(missing_terms)}.")
    if forbidden_terms_found:
        issues.append(f"Forbidden scheduler run term(s) found: {', '.join(forbidden_terms_found)}.")

    passed = not issues
    return _result(
        check,
        status="passed" if passed else "failed",
        score=1.0 if passed else 0.0,
        message="Scheduler run check passed." if passed else " ".join(issues),
        expected={
            "target": target_name,
            "required_job_id": required_job_id,
            "required_job_run_id": required_job_run_id,
            "required_run_id": required_run_id,
            "required_trigger_reason": required_trigger_reason,
            "required_status": required_status,
            "required_retry_decision": required_retry_decision,
            "required_pending_retry": required_pending_retry,
            "required_delivery_result": required_delivery_result,
            "required_graph_permission_mode": required_graph_permission_mode,
            "required_permission_policy": required_permission_policy,
            "required_permission_policy_source": required_permission_policy_source,
            "required_pending_permission_approval": required_pending_permission_approval,
            "required_terms": required_terms,
            "forbidden_terms": forbidden_terms,
        },
        actual={
            "job_id": actual_job_id,
            "job_run_id": actual_job_run_id,
            "run_id": actual_run_id,
            "trigger_reason": actual_trigger_reason,
            "status": actual_status,
            "retry_decision": retry_decision,
            "scheduler_retry_pending": pending_retry,
            "delivery_result": delivery_result,
            "graph_permission_mode": graph_permission_mode,
            "permission_policy": permission_policy,
            "scheduled_graph_permission_policy_source": permission_policy_source,
            "pending_permission_approval": pending_permission_approval,
            "missing_fields": missing_fields,
            "missing_retry_decision": missing_retry_decision,
            "missing_pending_retry": missing_pending_retry,
            "missing_delivery_result": missing_delivery_result,
            "missing_permission_policy": missing_permission_policy,
            "missing_pending_permission_approval": missing_pending_permission_approval,
            "missing_terms": missing_terms,
            "forbidden_terms_found": forbidden_terms_found,
        },
    )


def _evaluate_delegation_worker_check(
    check: dict[str, Any],
    expected: dict[str, Any],
    final_output: dict[str, Any],
    artifacts: dict[str, Any],
) -> dict[str, Any]:
    target_name = _text(check.get("target")) or _text(expected.get("target")) or "worker_result_package"
    target = _resolve_target(target_name, final_output, artifacts)
    package = _as_dict(target)
    searchable_text = f"{_flatten_text(target)}\n{_flatten_mapping_keys(target)}"

    required_task_id = _text(check.get("required_task_id")) or _text(expected.get("required_task_id"))
    required_status = _text(check.get("required_status")) or _text(expected.get("required_status"))
    required_output_keys = _string_list(check.get("required_output_keys")) or _string_list(
        expected.get("required_output_keys")
    )
    required_source_refs = _source_ref_requirements(check.get("required_source_refs")) or _source_ref_requirements(
        expected.get("required_source_refs")
    )
    required_terms = _string_list(check.get("required_terms")) or _string_list(expected.get("required_terms"))
    forbidden_terms = (
        _string_list(check.get("forbidden_terms"))
        or _string_list(check.get("forbidden"))
        or _string_list(expected.get("forbidden_terms"))
        or _string_list(expected.get("forbidden"))
    )

    task_id = _text(package.get("task_id"))
    status = _text(package.get("status"))
    output_keys = _worker_output_keys(package)
    source_refs = _worker_source_refs(package)

    missing_fields: list[str] = []
    if required_task_id and task_id != required_task_id:
        missing_fields.append("task_id")
    if required_status and status != required_status:
        missing_fields.append("status")
    missing_output_keys = [key for key in required_output_keys if key not in output_keys]
    missing_source_refs = [item for item in required_source_refs if not _has_source_ref(source_refs, item)]
    missing_terms = _missing_terms(required_terms, searchable_text)
    forbidden_terms_found = _found_terms(forbidden_terms, searchable_text)

    issues: list[str] = []
    if not package:
        issues.append(f"Missing worker result package at target '{target_name}'.")
    if missing_fields:
        issues.append(f"Worker result field mismatch: {', '.join(missing_fields)}.")
    if missing_output_keys:
        issues.append(f"Missing worker output key(s): {', '.join(missing_output_keys)}.")
    if missing_source_refs:
        issues.append(f"Missing worker source ref(s): {_format_source_refs(missing_source_refs)}.")
    if missing_terms:
        issues.append(f"Missing worker result term(s): {', '.join(missing_terms)}.")
    if forbidden_terms_found:
        issues.append(f"Forbidden worker result term(s) found: {', '.join(forbidden_terms_found)}.")

    passed = not issues
    return _result(
        check,
        status="passed" if passed else "failed",
        score=1.0 if passed else 0.0,
        message="Delegation worker check passed." if passed else " ".join(issues),
        expected={
            "target": target_name,
            "required_task_id": required_task_id,
            "required_status": required_status,
            "required_output_keys": required_output_keys,
            "required_source_refs": required_source_refs,
            "required_terms": required_terms,
            "forbidden_terms": forbidden_terms,
        },
        actual={
            "task_id": task_id,
            "status": status,
            "output_keys": output_keys,
            "source_refs": source_refs,
            "missing_fields": missing_fields,
            "missing_output_keys": missing_output_keys,
            "missing_source_refs": missing_source_refs,
            "missing_terms": missing_terms,
            "forbidden_terms_found": forbidden_terms_found,
        },
    )


def _evaluate_provider_fallback_check(
    check: dict[str, Any],
    expected: dict[str, Any],
    final_output: dict[str, Any],
    artifacts: dict[str, Any],
) -> dict[str, Any]:
    target_name = _text(check.get("target")) or _text(expected.get("target")) or "provider_fallback_trace"
    target = _resolve_target(target_name, final_output, artifacts)
    trace = _as_dict(target)
    searchable_text = f"{_flatten_text(target)}\n{_flatten_mapping_keys(target)}"

    requested = _normalize_provider_model_ref(trace.get("requested"))
    selected = _normalize_provider_model_ref(trace.get("selected"))
    failed_candidates = [
        _normalize_provider_model_ref(item)
        for item in _as_list(trace.get("failed_candidates"))
        if isinstance(item, dict)
    ]
    fallback_candidates = [
        _normalize_provider_model_ref(item)
        for item in _as_list(trace.get("fallback_candidates"))
        if isinstance(item, dict)
    ]
    required_requested = _provider_model_requirements(check.get("required_requested")) or _provider_model_requirements(
        expected.get("required_requested")
    )
    required_selected = _provider_model_requirements(check.get("required_selected")) or _provider_model_requirements(
        expected.get("required_selected")
    )
    required_failed = _provider_model_requirements(check.get("required_failed")) or _provider_model_requirements(
        expected.get("required_failed")
    )
    required_capabilities = _string_list(check.get("required_capabilities")) or _string_list(
        expected.get("required_capabilities")
    )
    required_permissions = _string_list(check.get("required_permissions")) or _string_list(
        expected.get("required_permissions")
    )
    required_terms = _string_list(check.get("required_terms")) or _string_list(expected.get("required_terms"))
    forbidden_terms = (
        _string_list(check.get("forbidden_terms"))
        or _string_list(check.get("forbidden"))
        or _string_list(expected.get("forbidden_terms"))
        or _string_list(expected.get("forbidden"))
    )
    min_fallbacks = _int_value(check.get("min_fallbacks"))
    if min_fallbacks <= 0:
        min_fallbacks = _int_value(expected.get("min_fallbacks"))

    trace_capabilities = _string_list(trace.get("required_capabilities"))
    trace_permissions = _string_list(trace.get("required_permissions"))
    missing_requested = [item for item in required_requested if not _provider_model_matches(requested, item)]
    missing_selected = [item for item in required_selected if not _provider_model_matches(selected, item)]
    missing_failed = [
        item
        for item in required_failed
        if not any(_provider_model_matches(candidate, item) for candidate in failed_candidates)
    ]
    missing_capabilities = [item for item in required_capabilities if item not in trace_capabilities]
    missing_permissions = [item for item in required_permissions if item not in trace_permissions]
    missing_terms = _missing_terms(required_terms, searchable_text)
    forbidden_terms_found = _found_terms(forbidden_terms, searchable_text)

    issues: list[str] = []
    if not trace:
        issues.append(f"Missing provider fallback trace at target '{target_name}'.")
    if min_fallbacks > 0 and len(fallback_candidates) < min_fallbacks:
        issues.append(f"Expected at least {min_fallbacks} fallback candidate(s), found {len(fallback_candidates)}.")
    if missing_requested:
        issues.append(f"Missing requested provider/model: {_format_provider_model_requirements(missing_requested)}.")
    if missing_selected:
        issues.append(f"Missing selected provider/model: {_format_provider_model_requirements(missing_selected)}.")
    if missing_failed:
        issues.append(f"Missing failed provider/model: {_format_provider_model_requirements(missing_failed)}.")
    if missing_capabilities:
        issues.append(f"Missing required capability marker(s): {', '.join(missing_capabilities)}.")
    if missing_permissions:
        issues.append(f"Missing required permission marker(s): {', '.join(missing_permissions)}.")
    if missing_terms:
        issues.append(f"Missing provider fallback term(s): {', '.join(missing_terms)}.")
    if forbidden_terms_found:
        issues.append(f"Forbidden provider fallback term(s) found: {', '.join(forbidden_terms_found)}.")

    passed = not issues
    return _result(
        check,
        status="passed" if passed else "failed",
        score=1.0 if passed else 0.0,
        message="Provider fallback check passed." if passed else " ".join(issues),
        expected={
            "target": target_name,
            "required_requested": required_requested,
            "required_selected": required_selected,
            "required_failed": required_failed,
            "required_capabilities": required_capabilities,
            "required_permissions": required_permissions,
            "required_terms": required_terms,
            "forbidden_terms": forbidden_terms,
            "min_fallbacks": min_fallbacks,
        },
        actual={
            "requested": requested,
            "selected": selected,
            "failed_candidates": failed_candidates,
            "fallback_candidates": fallback_candidates,
            "required_capabilities": trace_capabilities,
            "required_permissions": trace_permissions,
            "missing_requested": missing_requested,
            "missing_selected": missing_selected,
            "missing_failed": missing_failed,
            "missing_capabilities": missing_capabilities,
            "missing_permissions": missing_permissions,
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


def _memory_results(target: Any) -> list[dict[str, Any]]:
    if isinstance(target, list):
        return [_as_dict(item) for item in target if isinstance(item, dict)]
    package = _as_dict(target)
    results = [_as_dict(item) for item in _as_list(package.get("results")) if isinstance(item, dict)]
    if results:
        return results
    return [
        _as_dict(item)
        for item in _as_list(package.get("items"))
        if isinstance(item, dict) and _text(_as_dict(item.get("source_ref")).get("source_kind")) == "memory_entry"
    ]


def _memory_source_refs(package: dict[str, Any], results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    refs.extend(_source_ref_list(package.get("source_refs")))
    refs.extend(_source_ref_list(package.get("context_sources")))
    for item in _as_list(package.get("citations")):
        refs.extend(_source_ref_list(item.get("source_refs") if isinstance(item, dict) else None))
        if isinstance(item, dict) and _text(item.get("source_kind")) and _text(item.get("source_id")):
            refs.append({"source_kind": _text(item.get("source_kind")), "source_id": _text(item.get("source_id"))})
    for result in results:
        source_ref = _as_dict(result.get("source_ref"))
        if source_ref:
            refs.append(source_ref)
        refs.extend(_source_ref_list(result.get("source_refs")))
        refs.extend(_source_ref_list(result.get("sources")))
        memory_id = _text(result.get("memory_id"))
        if memory_id:
            refs.append({"source_kind": "memory_entry", "source_id": memory_id})
    return _dedupe_source_refs(refs)


def _memory_ranking_reports(package: dict[str, Any]) -> list[dict[str, Any]]:
    return [_as_dict(report) for report in _as_list(package.get("ranking_reports")) if isinstance(report, dict)]


def _memory_ranked_ids_from_reports(ranking_reports: list[dict[str, Any]]) -> list[str]:
    ranked_ids: list[str] = []
    for report in ranking_reports:
        ranked_results = [_as_dict(item) for item in _as_list(report.get("ranked_results")) if isinstance(item, dict)]
        ranked_results.sort(key=lambda item: _int_value(item.get("rank")) or 1_000_000)
        for result in ranked_results:
            source_ref = _as_dict(result.get("source_ref"))
            source_kind = _text(source_ref.get("source_kind") or result.get("source_kind"))
            source_id = _text(source_ref.get("source_id") or result.get("source_id") or result.get("memory_id"))
            if source_kind and source_kind != "memory_entry":
                continue
            if source_id:
                ranked_ids.append(source_id)
    return _dedupe(ranked_ids)


def _hybrid_recall_source_refs(package: dict[str, Any]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    refs.extend(_source_ref_list(package.get("source_refs")))
    refs.extend(_source_ref_list(package.get("context_sources")))
    context = _as_dict(package.get("context"))
    refs.extend(_source_ref_list(context.get("source_refs")))
    for result in _as_list(package.get("results")):
        if not isinstance(result, dict):
            continue
        source_ref = _as_dict(result.get("source_ref"))
        if source_ref:
            refs.append(source_ref)
        refs.extend(_source_ref_list(result.get("source_refs")))
        memory_id = _text(result.get("memory_id"))
        if memory_id:
            refs.append({"source_kind": "memory_entry", "source_id": memory_id})
        message_id = _text(result.get("message_id"))
        if message_id:
            refs.append({"source_kind": "buddy_message", "source_id": message_id})
    return _dedupe_source_refs(refs)


def _hybrid_memory_ids(package: dict[str, Any], source_refs: list[dict[str, Any]]) -> list[str]:
    return _dedupe(
        [
            *_string_list(package.get("memory_ids")),
            *[
                _text(item.get("memory_id"))
                for item in _as_list(package.get("results"))
                if isinstance(item, dict) and _text(item.get("memory_id"))
            ],
            *[
                _text(ref.get("source_id"))
                for ref in source_refs
                if _text(ref.get("source_kind")) == "memory_entry" and _text(ref.get("source_id"))
            ],
        ]
    )


def _hybrid_message_ids(package: dict[str, Any], source_refs: list[dict[str, Any]]) -> list[str]:
    return _dedupe(
        [
            *_string_list(package.get("message_ids")),
            *[
                _text(item.get("message_id"))
                for item in _as_list(package.get("results"))
                if isinstance(item, dict) and _text(item.get("message_id"))
            ],
            *[
                _text(ref.get("source_id"))
                for ref in source_refs
                if _text(ref.get("source_kind")) == "buddy_message" and _text(ref.get("source_id"))
            ],
        ]
    )


def _source_ref_requirements(value: Any) -> list[dict[str, str]]:
    refs: list[dict[str, str]] = []
    for item in _as_list(value):
        record = _as_dict(item)
        source_kind = _text(record.get("source_kind") or record.get("kind"))
        source_id = _text(record.get("source_id") or record.get("id"))
        if source_kind and source_id:
            refs.append({"source_kind": source_kind, "source_id": source_id})
    return refs


def _source_ref_list(value: Any) -> list[dict[str, Any]]:
    return [_as_dict(item) for item in _as_list(value) if isinstance(item, dict)]


def _dedupe_source_refs(refs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    result: list[dict[str, Any]] = []
    for ref in refs:
        source_kind = _text(ref.get("source_kind") or ref.get("kind"))
        source_id = _text(ref.get("source_id") or ref.get("id"))
        if not source_kind or not source_id:
            continue
        key = (source_kind, source_id)
        if key in seen:
            continue
        seen.add(key)
        result.append({"source_kind": source_kind, "source_id": source_id})
    return result


def _has_source_ref(source_refs: list[dict[str, Any]], required: dict[str, str]) -> bool:
    return any(
        _text(ref.get("source_kind")) == required["source_kind"]
        and _text(ref.get("source_id")) == required["source_id"]
        for ref in source_refs
    )


def _format_source_refs(source_refs: list[dict[str, str]]) -> str:
    return ", ".join(f"{item['source_kind']}:{item['source_id']}" for item in source_refs)


def _capability_requirements(value: Any) -> list[dict[str, str]]:
    if isinstance(value, dict):
        requirement = _normalize_capability_candidate(value)
        return [requirement] if requirement else []
    requirements: list[dict[str, str]] = []
    for item in _as_list(value):
        if not isinstance(item, dict):
            continue
        requirement = _normalize_capability_candidate(item)
        if requirement:
            requirements.append(requirement)
    return requirements


def _normalize_capability_candidate(value: Any) -> dict[str, str]:
    record = _as_dict(value)
    candidate = _normalize_capability_ref(record)
    reason = _text(record.get("reason"))
    if reason:
        candidate["reason"] = reason
    return candidate


def _normalize_capability_ref(value: Any) -> dict[str, str]:
    record = _as_dict(value)
    kind = _text(record.get("kind"))
    key = _text(
        record.get("key")
        or record.get("actionKey")
        or record.get("toolKey")
        or record.get("template_id")
        or record.get("templateId")
        or record.get("subgraphKey")
    )
    normalized: dict[str, str] = {}
    if kind:
        normalized["kind"] = kind
    if key:
        normalized["key"] = key
    return normalized


def _capability_matches(actual: dict[str, str], expected: dict[str, str]) -> bool:
    for key, expected_value in expected.items():
        if _text(actual.get(key)) != _text(expected_value):
            return False
    return bool(expected)


def _format_capability_requirements(requirements: list[dict[str, str]]) -> str:
    formatted: list[str] = []
    for item in requirements:
        ref = f"{item.get('kind', '')}:{item.get('key', '')}".strip(":")
        reason = _text(item.get("reason"))
        formatted.append(f"{ref} reason={reason}" if reason else ref)
    return ", ".join(formatted)


def _provider_model_requirements(value: Any) -> list[dict[str, str]]:
    if isinstance(value, dict):
        requirement = _normalize_provider_model_ref(value)
        return [requirement] if requirement else []
    requirements: list[dict[str, str]] = []
    for item in _as_list(value):
        if not isinstance(item, dict):
            continue
        requirement = _normalize_provider_model_ref(item)
        if requirement:
            requirements.append(requirement)
    return requirements


def _normalize_provider_model_ref(value: Any) -> dict[str, str]:
    record = _as_dict(value)
    model_ref = _text(record.get("model_ref") or record.get("modelRef"))
    provider_id = _text(record.get("provider_id") or record.get("providerId"))
    model = _text(record.get("model"))
    if model_ref and "/" in model_ref:
        split_provider, split_model = model_ref.split("/", 1)
        provider_id = provider_id or split_provider.strip()
        model = model or split_model.strip()
    elif provider_id and model:
        model_ref = f"{provider_id}/{model}"
    normalized: dict[str, str] = {}
    if provider_id:
        normalized["provider_id"] = provider_id
    if model:
        normalized["model"] = model
    if model_ref:
        normalized["model_ref"] = model_ref
    error_type = _text(record.get("error_type") or record.get("errorType"))
    if error_type:
        normalized["error_type"] = error_type
    reason = _text(record.get("reason"))
    if reason:
        normalized["reason"] = reason
    return normalized


def _provider_model_matches(actual: dict[str, str], expected: dict[str, str]) -> bool:
    for key, expected_value in expected.items():
        if _text(actual.get(key)) != _text(expected_value):
            return False
    return bool(expected)


def _format_provider_model_requirements(requirements: list[dict[str, str]]) -> str:
    formatted: list[str] = []
    for item in requirements:
        ref = item.get("model_ref") or f"{item.get('provider_id', '')}/{item.get('model', '')}".strip("/")
        error_type = _text(item.get("error_type"))
        formatted.append(f"{ref} error_type={error_type}" if error_type else ref)
    return ", ".join(formatted)


def _worker_output_keys(package: dict[str, Any]) -> list[str]:
    outputs = package.get("outputs")
    if isinstance(outputs, dict):
        return [str(key) for key in outputs.keys()]
    if isinstance(outputs, list):
        keys: list[str] = []
        for item in outputs:
            if not isinstance(item, dict):
                continue
            key = _text(item.get("key") or item.get("name"))
            if key:
                keys.append(key)
        return _dedupe(keys)
    return []


def _worker_source_refs(package: dict[str, Any]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    refs.extend(_source_ref_list(package.get("source_refs")))
    task_packet = _as_dict(package.get("worker_task_packet") or package.get("task_packet"))
    refs.extend(_source_ref_list(task_packet.get("context_package_refs")))
    outputs = package.get("outputs")
    if isinstance(outputs, dict):
        for output in outputs.values():
            record = _as_dict(output)
            refs.extend(_source_ref_list(record.get("source_refs")))
            value = record.get("value")
            if isinstance(value, list):
                refs.extend(_source_ref_list(value))
            elif isinstance(value, dict):
                refs.extend(_source_ref_list(value.get("source_refs")))
                if _text(value.get("source_kind")) and _text(value.get("source_id")):
                    refs.append(value)
    return _dedupe_source_refs(refs)


def _dict_subset_missing(required: dict[str, Any], actual: dict[str, Any]) -> dict[str, Any]:
    if not required:
        return {}
    missing: dict[str, Any] = {}
    for key, expected_value in required.items():
        if key not in actual:
            missing[key] = expected_value
            continue
        actual_value = actual.get(key)
        if isinstance(expected_value, dict):
            nested_actual = actual_value if isinstance(actual_value, dict) else {}
            nested_missing = _dict_subset_missing(expected_value, nested_actual)
            if nested_missing:
                missing[key] = nested_missing
            continue
        if actual_value != expected_value:
            missing[key] = expected_value
    return missing


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


def _flatten_mapping_keys(value: Any) -> str:
    if isinstance(value, dict):
        parts: list[str] = []
        for key, item in value.items():
            parts.append(str(key))
            nested = _flatten_mapping_keys(item)
            if nested:
                parts.append(nested)
        return "\n".join(parts)
    if isinstance(value, list):
        return "\n".join(_flatten_mapping_keys(item) for item in value)
    return ""


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
