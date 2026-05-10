from __future__ import annotations

import json
from contextlib import closing
from typing import Any
from uuid import uuid4

from app.core.storage.database import get_connection
from app.core.storage.json_file_utils import utc_now_iso


TERMINAL_RESULT_STATUSES = {"passed", "failed", "error", "skipped"}


def create_eval_suite(payload: dict[str, Any]) -> dict[str, Any]:
    suite = _normalize_eval_suite(payload)
    now = utc_now_iso()
    with closing(get_connection()) as connection:
        connection.execute(
            """
            INSERT INTO eval_suites (
                suite_id, name, description, target_graph_id, target_template_id,
                tags_json, metadata_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(suite_id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                target_graph_id = excluded.target_graph_id,
                target_template_id = excluded.target_template_id,
                tags_json = excluded.tags_json,
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at
            """,
            (
                suite["suite_id"],
                suite["name"],
                suite["description"],
                suite["target_graph_id"],
                suite["target_template_id"],
                _json_dumps(suite["tags"]),
                _json_dumps(suite["metadata"]),
                now,
                now,
            ),
        )
        connection.commit()
    return load_eval_suite(suite["suite_id"])


def create_eval_case(suite_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    suite = load_eval_suite(suite_id)
    case = _normalize_eval_case(payload)
    now = utc_now_iso()
    with closing(get_connection()) as connection:
        connection.execute(
            """
            INSERT INTO eval_cases (
                suite_id, case_id, name, description, input_values_json,
                expected_json, checks_json, metadata_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(suite_id, case_id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                input_values_json = excluded.input_values_json,
                expected_json = excluded.expected_json,
                checks_json = excluded.checks_json,
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at
            """,
            (
                suite["suite_id"],
                case["case_id"],
                case["name"],
                case["description"],
                _json_dumps(case["input_values"]),
                _json_dumps(case["expected"]),
                _json_dumps(case["checks"]),
                _json_dumps(case["metadata"]),
                now,
                now,
            ),
        )
        connection.commit()
    return load_eval_case(suite["suite_id"], case["case_id"])


def create_eval_run(suite_id: str, *, requested_by: str = "", metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    suite = load_eval_suite(suite_id)
    cases = list_eval_cases(suite["suite_id"])
    eval_run_id = f"evalrun_{uuid4().hex[:12]}"
    now = utc_now_iso()
    with closing(get_connection()) as connection:
        connection.execute(
            """
            INSERT INTO eval_runs (
                eval_run_id, suite_id, status, requested_by, metadata_json,
                started_at, completed_at, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                eval_run_id,
                suite["suite_id"],
                "pending",
                _compact_text(requested_by),
                _json_dumps(metadata or {}),
                now,
                "",
                now,
                now,
            ),
        )
        for case in cases:
            connection.execute(
                """
                INSERT INTO eval_case_results (
                    result_id, eval_run_id, suite_id, case_id, status,
                    final_output_json, artifacts_json, node_failures_json,
                    human_review_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    _eval_case_result_id(eval_run_id, case["case_id"]),
                    eval_run_id,
                    suite["suite_id"],
                    case["case_id"],
                    "pending",
                    "{}",
                    "{}",
                    "[]",
                    "{}",
                    now,
                    now,
                ),
            )
        connection.commit()
    return load_eval_run(eval_run_id)


def list_eval_runs(suite_id: str) -> list[dict[str, Any]]:
    normalized_suite_id = load_eval_suite(suite_id)["suite_id"]
    with closing(get_connection()) as connection:
        rows = connection.execute(
            """
            SELECT eval_run_id
            FROM eval_runs
            WHERE suite_id = ?
            ORDER BY created_at DESC, rowid DESC
            """,
            (normalized_suite_id,),
        ).fetchall()
    return [load_eval_run(str(row["eval_run_id"])) for row in rows]


def record_eval_case_result(eval_run_id: str, case_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    eval_run = load_eval_run(eval_run_id)
    normalized_case_id = _normalize_identifier(case_id)
    if not any(case_result["case_id"] == normalized_case_id for case_result in eval_run["case_results"]):
        raise KeyError(normalized_case_id)
    result_id = _eval_case_result_id(eval_run_id, normalized_case_id)
    status = _normalize_status(payload.get("status"))
    now = utc_now_iso()
    completed_at = now if status in TERMINAL_RESULT_STATUSES else ""
    with closing(get_connection()) as connection:
        connection.execute(
            """
            UPDATE eval_case_results
            SET graph_run_id = ?,
                status = ?,
                final_output_json = ?,
                error = ?,
                artifacts_json = ?,
                node_failures_json = ?,
                human_review_json = ?,
                started_at = COALESCE(NULLIF(started_at, ''), ?),
                completed_at = ?,
                updated_at = ?
            WHERE eval_run_id = ? AND case_id = ?
            """,
            (
                _compact_text(payload.get("graph_run_id")),
                status,
                _json_dumps(payload.get("final_output") or {}),
                _compact_text(payload.get("error")),
                _json_dumps(payload.get("artifacts") or {}),
                _json_dumps(_normalize_list(payload.get("node_failures"))),
                _json_dumps(payload.get("human_review") or {}),
                now,
                completed_at,
                now,
                eval_run_id,
                normalized_case_id,
            ),
        )
        connection.execute("DELETE FROM eval_check_results WHERE result_id = ?", (result_id,))
        for check in _normalize_list(payload.get("check_results")):
            normalized_check = _normalize_check_result(check)
            connection.execute(
                """
                INSERT INTO eval_check_results (
                    check_result_id, result_id, kind, name, status, score, message,
                    expected_json, actual_json, details_json, reviewer, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"evalcheck_{uuid4().hex[:12]}",
                    result_id,
                    normalized_check["kind"],
                    normalized_check["name"],
                    normalized_check["status"],
                    normalized_check["score"],
                    normalized_check["message"],
                    _json_dumps(normalized_check["expected"]),
                    _json_dumps(normalized_check["actual"]),
                    _json_dumps(normalized_check["details"]),
                    normalized_check["reviewer"],
                    now,
                ),
            )
        _refresh_eval_run_status(connection, eval_run_id, now=now)
        connection.commit()
    return _load_eval_case_result(eval_run_id, normalized_case_id)


def list_eval_suites() -> list[dict[str, Any]]:
    with closing(get_connection()) as connection:
        rows = connection.execute(
            """
            SELECT s.*, COUNT(c.case_id) AS case_count
            FROM eval_suites s
            LEFT JOIN eval_cases c ON c.suite_id = s.suite_id
            GROUP BY s.suite_id
            ORDER BY s.updated_at DESC, s.suite_id ASC
            """
        ).fetchall()
    return [_suite_from_row(row) for row in rows]


def load_eval_suite(suite_id: str) -> dict[str, Any]:
    normalized_suite_id = _normalize_identifier(suite_id)
    with closing(get_connection()) as connection:
        row = connection.execute(
            """
            SELECT s.*, COUNT(c.case_id) AS case_count
            FROM eval_suites s
            LEFT JOIN eval_cases c ON c.suite_id = s.suite_id
            WHERE s.suite_id = ?
            GROUP BY s.suite_id
            """,
            (normalized_suite_id,),
        ).fetchone()
    if row is None:
        raise KeyError(normalized_suite_id)
    return _suite_from_row(row)


def list_eval_cases(suite_id: str) -> list[dict[str, Any]]:
    normalized_suite_id = _normalize_identifier(suite_id)
    with closing(get_connection()) as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM eval_cases
            WHERE suite_id = ?
            ORDER BY created_at ASC, case_id ASC
            """,
            (normalized_suite_id,),
        ).fetchall()
    return [_case_from_row(row) for row in rows]


def load_eval_case(suite_id: str, case_id: str) -> dict[str, Any]:
    normalized_suite_id = _normalize_identifier(suite_id)
    normalized_case_id = _normalize_identifier(case_id)
    with closing(get_connection()) as connection:
        row = connection.execute(
            "SELECT * FROM eval_cases WHERE suite_id = ? AND case_id = ?",
            (normalized_suite_id, normalized_case_id),
        ).fetchone()
    if row is None:
        raise KeyError(normalized_case_id)
    return _case_from_row(row)


def load_eval_run(eval_run_id: str) -> dict[str, Any]:
    normalized_eval_run_id = _normalize_identifier(eval_run_id)
    with closing(get_connection()) as connection:
        row = connection.execute(
            "SELECT * FROM eval_runs WHERE eval_run_id = ?",
            (normalized_eval_run_id,),
        ).fetchone()
        if row is None:
            raise KeyError(normalized_eval_run_id)
        result_rows = connection.execute(
            """
            SELECT r.*, c.name AS case_name
            FROM eval_case_results r
            LEFT JOIN eval_cases c ON c.suite_id = r.suite_id AND c.case_id = r.case_id
            WHERE r.eval_run_id = ?
            ORDER BY r.created_at ASC, r.case_id ASC
            """,
            (normalized_eval_run_id,),
        ).fetchall()
        check_rows = connection.execute(
            """
            SELECT cr.*
            FROM eval_check_results cr
            JOIN eval_case_results r ON r.result_id = cr.result_id
            WHERE r.eval_run_id = ?
            ORDER BY cr.rowid ASC
            """,
            (normalized_eval_run_id,),
        ).fetchall()
    checks_by_result: dict[str, list[dict[str, Any]]] = {}
    for check_row in check_rows:
        checks_by_result.setdefault(str(check_row["result_id"]), []).append(_check_result_from_row(check_row))
    return _run_from_row(row) | {
        "case_results": [
            _case_result_from_row(result_row, checks_by_result.get(str(result_row["result_id"]), []))
            for result_row in result_rows
        ]
    }


def _load_eval_case_result(eval_run_id: str, case_id: str) -> dict[str, Any]:
    return next(
        result
        for result in load_eval_run(eval_run_id)["case_results"]
        if result["case_id"] == case_id
    )


def _refresh_eval_run_status(connection: Any, eval_run_id: str, *, now: str) -> None:
    rows = connection.execute(
        "SELECT status FROM eval_case_results WHERE eval_run_id = ?",
        (eval_run_id,),
    ).fetchall()
    statuses = [str(row["status"] or "pending") for row in rows]
    if not statuses:
        status = "pending"
    elif any(item in {"failed", "error"} for item in statuses):
        status = "failed"
    elif all(item == "passed" for item in statuses):
        status = "passed"
    elif all(item in TERMINAL_RESULT_STATUSES for item in statuses):
        status = "completed"
    else:
        status = "running"
    completed_at = now if status in {"passed", "failed", "completed"} else ""
    connection.execute(
        """
        UPDATE eval_runs
        SET status = ?, completed_at = ?, updated_at = ?
        WHERE eval_run_id = ?
        """,
        (status, completed_at, now, eval_run_id),
    )


def _suite_from_row(row: Any) -> dict[str, Any]:
    return {
        "suite_id": str(row["suite_id"]),
        "name": str(row["name"] or ""),
        "description": str(row["description"] or ""),
        "target_graph_id": str(row["target_graph_id"] or ""),
        "target_template_id": str(row["target_template_id"] or ""),
        "tags": _json_loads(row["tags_json"], []),
        "metadata": _json_loads(row["metadata_json"], {}),
        "case_count": int(row["case_count"] or 0) if "case_count" in row.keys() else 0,
        "created_at": str(row["created_at"] or ""),
        "updated_at": str(row["updated_at"] or ""),
    }


def _case_from_row(row: Any) -> dict[str, Any]:
    return {
        "suite_id": str(row["suite_id"]),
        "case_id": str(row["case_id"]),
        "name": str(row["name"] or ""),
        "description": str(row["description"] or ""),
        "input_values": _json_loads(row["input_values_json"], {}),
        "expected": _json_loads(row["expected_json"], {}),
        "checks": _json_loads(row["checks_json"], []),
        "metadata": _json_loads(row["metadata_json"], {}),
        "created_at": str(row["created_at"] or ""),
        "updated_at": str(row["updated_at"] or ""),
    }


def _run_from_row(row: Any) -> dict[str, Any]:
    return {
        "eval_run_id": str(row["eval_run_id"]),
        "suite_id": str(row["suite_id"]),
        "status": str(row["status"] or "pending"),
        "requested_by": str(row["requested_by"] or ""),
        "metadata": _json_loads(row["metadata_json"], {}),
        "started_at": str(row["started_at"] or ""),
        "completed_at": str(row["completed_at"] or ""),
        "created_at": str(row["created_at"] or ""),
        "updated_at": str(row["updated_at"] or ""),
    }


def _case_result_from_row(row: Any, check_results: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "result_id": str(row["result_id"]),
        "eval_run_id": str(row["eval_run_id"]),
        "suite_id": str(row["suite_id"]),
        "case_id": str(row["case_id"]),
        "case_name": str(row["case_name"] or ""),
        "graph_run_id": str(row["graph_run_id"] or ""),
        "status": str(row["status"] or "pending"),
        "final_output": _json_loads(row["final_output_json"], {}),
        "error": str(row["error"] or ""),
        "artifacts": _json_loads(row["artifacts_json"], {}),
        "node_failures": _json_loads(row["node_failures_json"], []),
        "human_review": _json_loads(row["human_review_json"], {}),
        "check_results": check_results,
        "started_at": str(row["started_at"] or ""),
        "completed_at": str(row["completed_at"] or ""),
        "created_at": str(row["created_at"] or ""),
        "updated_at": str(row["updated_at"] or ""),
    }


def _check_result_from_row(row: Any) -> dict[str, Any]:
    return {
        "check_result_id": str(row["check_result_id"]),
        "result_id": str(row["result_id"]),
        "kind": str(row["kind"] or ""),
        "name": str(row["name"] or ""),
        "status": str(row["status"] or "pending"),
        "score": row["score"],
        "message": str(row["message"] or ""),
        "expected": _json_loads(row["expected_json"], {}),
        "actual": _json_loads(row["actual_json"], {}),
        "details": _json_loads(row["details_json"], {}),
        "reviewer": str(row["reviewer"] or ""),
        "created_at": str(row["created_at"] or ""),
    }


def _normalize_eval_suite(payload: dict[str, Any]) -> dict[str, Any]:
    suite_id = _normalize_identifier(payload.get("suite_id") or payload.get("id"))
    if not suite_id:
        raise ValueError("suite_id is required.")
    return {
        "suite_id": suite_id,
        "name": _compact_text(payload.get("name")) or suite_id,
        "description": _compact_text(payload.get("description")),
        "target_graph_id": _compact_text(payload.get("target_graph_id")),
        "target_template_id": _compact_text(payload.get("target_template_id")),
        "tags": _normalize_list(payload.get("tags")),
        "metadata": _normalize_dict(payload.get("metadata")),
    }


def _normalize_eval_case(payload: dict[str, Any]) -> dict[str, Any]:
    case_id = _normalize_identifier(payload.get("case_id") or payload.get("id"))
    if not case_id:
        raise ValueError("case_id is required.")
    return {
        "case_id": case_id,
        "name": _compact_text(payload.get("name")) or case_id,
        "description": _compact_text(payload.get("description")),
        "input_values": _normalize_dict(payload.get("input_values")),
        "expected": _normalize_dict(payload.get("expected")),
        "checks": _normalize_list(payload.get("checks")),
        "metadata": _normalize_dict(payload.get("metadata")),
    }


def _normalize_check_result(value: Any) -> dict[str, Any]:
    record = _normalize_dict(value)
    return {
        "kind": _compact_text(record.get("kind")),
        "name": _compact_text(record.get("name")),
        "status": _normalize_status(record.get("status")),
        "score": _normalize_score(record.get("score")),
        "message": _compact_text(record.get("message")),
        "expected": _normalize_dict(record.get("expected")),
        "actual": _normalize_dict(record.get("actual")),
        "details": _normalize_dict(record.get("details")),
        "reviewer": _compact_text(record.get("reviewer")),
    }


def _normalize_status(value: Any) -> str:
    normalized = _compact_text(value).lower().replace(" ", "_")
    return normalized if normalized in {"pending", "running", "passed", "failed", "error", "skipped"} else "pending"


def _normalize_score(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_identifier(value: Any) -> str:
    normalized = _compact_text(value).replace(" ", "_")
    return "".join(char if char.isalnum() or char in {"_", "-"} else "_" for char in normalized)[:100]


def _compact_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _normalize_list(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _json_loads(value: Any, fallback: Any) -> Any:
    try:
        return json.loads(value or "")
    except (TypeError, json.JSONDecodeError):
        return fallback


def _eval_case_result_id(eval_run_id: str, case_id: str) -> str:
    return f"{eval_run_id}:{case_id}"
