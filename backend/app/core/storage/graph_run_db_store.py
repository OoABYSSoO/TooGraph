from __future__ import annotations

import copy
from enum import Enum
import json
from typing import Any

from app.core.context_security import redact_context_secrets
from app.core.runtime.run_tree import summarize_run_for_tree
from app.core.storage.database import get_connection


DETAIL_KEYS = (
    "max_revision_round",
    "stop_reason",
    "selected_actions",
    "action_outputs",
    "selected_tools",
    "tool_outputs",
    "selected_capabilities",
    "capability_outputs",
    "memory_summary",
    "warnings",
    "errors",
    "saved_outputs",
    "state_values",
    "state_last_writers",
    "state_events",
    "state_stream_events",
    "permission_approvals",
    "cycle_summary",
    "cycle_iterations",
)

NON_PERSISTED_EVENT_KINDS = {
    "node.output.delta",
}


def save_run_state(run_state: dict[str, Any]) -> None:
    run_id = _required_text(run_state, "run_id")
    now = str((run_state.get("lifecycle") or {}).get("updated_at") or run_state.get("started_at") or "")
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO graph_runs (
                run_id,
                root_run_id,
                parent_run_id,
                parent_node_id,
                invocation_kind,
                invocation_key,
                run_depth,
                run_path_json,
                graph_id,
                graph_name,
                template_id,
                template_version,
                status,
                runtime_backend,
                current_node_id,
                started_at,
                completed_at,
                duration_ms,
                final_result,
                metadata_json,
                lifecycle_json,
                checkpoint_metadata_json,
                detail_json,
                batch_group_id,
                batch_item_index,
                batch_item_label,
                revision_round,
                final_score,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                root_run_id = excluded.root_run_id,
                parent_run_id = excluded.parent_run_id,
                parent_node_id = excluded.parent_node_id,
                invocation_kind = excluded.invocation_kind,
                invocation_key = excluded.invocation_key,
                run_depth = excluded.run_depth,
                run_path_json = excluded.run_path_json,
                graph_id = excluded.graph_id,
                graph_name = excluded.graph_name,
                template_id = excluded.template_id,
                template_version = excluded.template_version,
                status = excluded.status,
                runtime_backend = excluded.runtime_backend,
                current_node_id = excluded.current_node_id,
                started_at = excluded.started_at,
                completed_at = excluded.completed_at,
                duration_ms = excluded.duration_ms,
                final_result = excluded.final_result,
                metadata_json = excluded.metadata_json,
                lifecycle_json = excluded.lifecycle_json,
                checkpoint_metadata_json = excluded.checkpoint_metadata_json,
                detail_json = excluded.detail_json,
                batch_group_id = excluded.batch_group_id,
                batch_item_index = excluded.batch_item_index,
                batch_item_label = excluded.batch_item_label,
                revision_round = excluded.revision_round,
                final_score = excluded.final_score,
                updated_at = excluded.updated_at
            """,
            (
                run_id,
                str(run_state.get("root_run_id") or run_id),
                str(run_state.get("parent_run_id") or ""),
                str(run_state.get("parent_node_id") or ""),
                str(run_state.get("invocation_kind") or "root"),
                str(run_state.get("invocation_key") or ""),
                _int(run_state.get("run_depth"), default=0),
                _json(run_state.get("run_path") or [run_id]),
                run_state.get("graph_id"),
                str(run_state.get("graph_name") or ""),
                str(run_state.get("template_id") or ""),
                str(run_state.get("template_version") or ""),
                str(run_state.get("status") or ""),
                str(run_state.get("runtime_backend") or ""),
                run_state.get("current_node_id"),
                str(run_state.get("started_at") or ""),
                run_state.get("completed_at"),
                run_state.get("duration_ms"),
                _redact_run_record_text(run_state.get("final_result")),
                _json(run_state.get("metadata") or {}),
                _json(run_state.get("lifecycle") or {}),
                _json(run_state.get("checkpoint_metadata") or {}),
                _json(_detail_payload(run_state)),
                str(run_state.get("batch_group_id") or ""),
                run_state.get("batch_item_index") if isinstance(run_state.get("batch_item_index"), int) else None,
                str(run_state.get("batch_item_label") or ""),
                _int(run_state.get("revision_round"), default=0),
                run_state.get("final_score") if isinstance(run_state.get("final_score"), int | float) else None,
                str(run_state.get("created_at") or run_state.get("started_at") or now),
                now,
            ),
        )
        _replace_run_details(connection, run_id, run_state)


def load_run_state(run_id: str) -> dict[str, Any]:
    normalized_run_id = str(run_id or "").strip()
    with get_connection() as connection:
        run_row = connection.execute(
            "SELECT * FROM graph_runs WHERE run_id = ?",
            (normalized_run_id,),
        ).fetchone()
        if run_row is None:
            raise FileNotFoundError(f"Run '{normalized_run_id}' does not exist.")
        current_snapshot = connection.execute(
            """
            SELECT * FROM graph_run_snapshots
            WHERE run_id = ? AND kind = 'current'
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (normalized_run_id,),
        ).fetchone()
        snapshots = connection.execute(
            """
            SELECT * FROM graph_run_snapshots
            WHERE run_id = ? AND kind != 'current'
            ORDER BY created_at
            """,
            (normalized_run_id,),
        ).fetchall()
        executions = connection.execute(
            """
            SELECT * FROM graph_node_executions
            WHERE run_id = ?
            ORDER BY order_index, started_at, execution_id
            """,
            (normalized_run_id,),
        ).fetchall()
        events = connection.execute(
            """
            SELECT * FROM graph_run_events
            WHERE run_id = ?
            ORDER BY sequence
            """,
            (normalized_run_id,),
        ).fetchall()
        state_events = connection.execute(
            """
            SELECT * FROM graph_state_events
            WHERE run_id = ?
            ORDER BY sequence
            """,
            (normalized_run_id,),
        ).fetchall()
        outputs = connection.execute(
            """
            SELECT * FROM graph_outputs
            WHERE run_id = ?
            ORDER BY occurrence_index, created_at
            """,
            (normalized_run_id,),
        ).fetchall()
        artifacts = connection.execute(
            """
            SELECT * FROM graph_artifacts
            WHERE run_id = ?
            ORDER BY created_at, artifact_id
            """,
            (normalized_run_id,),
        ).fetchall()
        agent_loop_events = connection.execute(
            """
            SELECT * FROM agent_loop_events
            WHERE run_id = ?
            ORDER BY iteration_index, created_at, event_id
            """,
            (normalized_run_id,),
        ).fetchall()

    return _build_run_state(
        run_row,
        current_snapshot,
        snapshots,
        executions,
        events,
        state_events,
        outputs,
        artifacts,
        agent_loop_events,
    )


def list_run_states() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT run_id FROM graph_runs ORDER BY started_at DESC, run_id DESC"
        ).fetchall()
    return [load_run_state(str(row["run_id"])) for row in rows]


def list_run_summary_states() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                run_id,
                root_run_id,
                parent_run_id,
                parent_node_id,
                invocation_kind,
                invocation_key,
                run_depth,
                run_path_json,
                graph_id,
                graph_name,
                template_id,
                template_version,
                status,
                runtime_backend,
                current_node_id,
                started_at,
                completed_at,
                duration_ms,
                metadata_json,
                lifecycle_json,
                checkpoint_metadata_json,
                batch_group_id,
                batch_item_index,
                batch_item_label,
                revision_round,
                final_score,
                json_extract(detail_json, '$.stop_reason') AS stop_reason
            FROM graph_runs
            ORDER BY started_at DESC, run_id DESC
            """
        ).fetchall()
        run_ids = [str(row["run_id"]) for row in rows]
        snapshot_options_by_run_id = _run_snapshot_options_by_run_id(connection, run_ids)

    return [
        _run_summary_payload(
            row,
            snapshot_options_by_run_id.get(str(row["run_id"]), []),
        )
        for row in rows
    ]


def load_current_graph_snapshot_states(run_ids: list[str]) -> dict[str, dict[str, Any]]:
    normalized_run_ids = list(
        dict.fromkeys(str(run_id or "").strip() for run_id in run_ids if str(run_id or "").strip())
    )
    if not normalized_run_ids:
        return {}
    with get_connection() as connection:
        return _current_graph_snapshots_by_run_id(connection, normalized_run_ids)


def list_child_run_states(parent_run_id: str) -> list[dict[str, Any]]:
    normalized_parent_run_id = str(parent_run_id or "").strip()
    if not normalized_parent_run_id:
        return []
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT run_id FROM graph_runs
            WHERE parent_run_id = ?
            ORDER BY run_depth, started_at, run_id
            """,
            (normalized_parent_run_id,),
        ).fetchall()
    children = [load_run_state(str(row["run_id"])) for row in rows]
    children.sort(key=lambda item: (_run_path_sort_key(item), str(item.get("run_id", ""))))
    return children


def build_run_tree_state(run_id: str) -> dict[str, Any]:
    root = load_run_state(run_id)
    runs = list_run_states()
    children_by_parent: dict[str, list[dict[str, Any]]] = {}
    for run in runs:
        parent_run_id = str(run.get("parent_run_id") or "").strip()
        if not parent_run_id:
            continue
        children_by_parent.setdefault(parent_run_id, []).append(run)
    for children in children_by_parent.values():
        children.sort(key=lambda item: (_run_path_sort_key(item), str(item.get("run_id", ""))))

    def build_node(run: dict[str, Any], seen: set[str]) -> dict[str, Any]:
        node = summarize_run_for_tree(run)
        current_run_id = str(run.get("run_id") or "")
        if current_run_id in seen:
            return node
        next_seen = {*seen, current_run_id}
        node["children"] = [
            build_node(child, next_seen)
            for child in children_by_parent.get(current_run_id, [])
        ]
        return node

    return build_node(root, set())


def _replace_run_details(connection: Any, run_id: str, run_state: dict[str, Any]) -> None:
    usage_event_created_at = str(
        run_state.get("completed_at")
        or run_state.get("started_at")
        or (run_state.get("lifecycle") or {}).get("updated_at")
        or ""
    )
    for table in (
        "graph_run_snapshots",
        "graph_node_executions",
        "graph_run_events",
        "graph_state_events",
        "graph_outputs",
        "graph_artifacts",
        "graph_capability_invocations",
        "agent_loop_events",
        "capability_usage_events",
    ):
        connection.execute(f"DELETE FROM {table} WHERE run_id = ?", (run_id,))

    _insert_snapshot(connection, run_id, _current_snapshot(run_id, run_state))
    for snapshot in run_state.get("run_snapshots") or []:
        if isinstance(snapshot, dict):
            _insert_snapshot(connection, run_id, snapshot)
    for index, execution in enumerate(run_state.get("node_executions") or []):
        if isinstance(execution, dict):
            _insert_node_execution(connection, run_id, index, execution)
    for index, event in enumerate(_activity_events(run_state)):
        _insert_run_event(connection, run_id, index, event)
    for index, event in enumerate(run_state.get("state_events") or []):
        if isinstance(event, dict):
            _insert_state_event(connection, run_id, index, event)
    _insert_agent_loop_events(connection, run_id, run_state)
    for index, preview in enumerate(run_state.get("output_previews") or []):
        if isinstance(preview, dict):
            _insert_output(connection, run_id, index, preview)
    for index, artifact in enumerate(_artifact_items(run_state)):
        _insert_artifact(connection, run_id, index, artifact)
    for index, output in enumerate(run_state.get("capability_outputs") or []):
        if isinstance(output, dict):
            _insert_capability_invocation(connection, run_id, index, "capability", output)
            _insert_capability_usage_event(connection, run_id, index, "capability", output, created_at=usage_event_created_at)
    for index, output in enumerate(run_state.get("action_outputs") or []):
        if isinstance(output, dict):
            _insert_capability_invocation(connection, run_id, index, "action", output)
            _insert_capability_usage_event(connection, run_id, index, "action", output, created_at=usage_event_created_at)
    for index, output in enumerate(run_state.get("tool_outputs") or []):
        if isinstance(output, dict):
            _insert_capability_invocation(connection, run_id, index, "tool", output)
            _insert_capability_usage_event(connection, run_id, index, "tool", output, created_at=usage_event_created_at)


def _insert_snapshot(connection: Any, run_id: str, snapshot: dict[str, Any]) -> None:
    snapshot_id = str(snapshot.get("snapshot_id") or f"{run_id}:current")
    connection.execute(
        """
        INSERT OR REPLACE INTO graph_run_snapshots (
            snapshot_id,
            run_id,
            kind,
            label,
            status,
            current_node_id,
            created_at,
            graph_snapshot_json,
            state_snapshot_json,
            node_status_map_json,
            subgraph_status_map_json,
            output_previews_json,
            artifacts_json,
            checkpoint_metadata_json,
            final_result
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            snapshot_id,
            run_id,
            str(snapshot.get("kind") or "current"),
            str(snapshot.get("label") or ""),
            str(snapshot.get("status") or ""),
            snapshot.get("current_node_id"),
            str(snapshot.get("created_at") or ""),
            _json(snapshot.get("graph_snapshot") or {}),
            _json(snapshot.get("state_snapshot") or {}),
            _json(snapshot.get("node_status_map") or {}),
            _json(snapshot.get("subgraph_status_map") or {}),
            _json(snapshot.get("output_previews") or []),
            _json(snapshot.get("artifacts") or {}),
            _json(snapshot.get("checkpoint_metadata") or {}),
            _redact_run_record_text(snapshot.get("final_result")),
        ),
    )


def _insert_node_execution(connection: Any, run_id: str, index: int, execution: dict[str, Any]) -> None:
    execution_id = str(execution.get("execution_id") or f"{run_id}:execution:{index}")
    artifacts = copy.deepcopy(execution.get("artifacts") or {})
    state_reads = execution.get("state_reads")
    if state_reads is None and isinstance(artifacts, dict):
        state_reads = artifacts.get("state_reads")
    state_writes = execution.get("state_writes")
    if state_writes is None and isinstance(artifacts, dict):
        state_writes = artifacts.get("state_writes")
    connection.execute(
        """
        INSERT OR REPLACE INTO graph_node_executions (
            execution_id,
            run_id,
            parent_execution_id,
            order_index,
            attempt,
            node_id,
            node_type,
            node_name,
            subgraph_node_id,
            subgraph_path_json,
            status,
            started_at,
            finished_at,
            duration_ms,
            input_summary,
            output_summary,
            artifacts_json,
            state_reads_json,
            state_writes_json,
            warnings_json,
            errors_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            execution_id,
            run_id,
            execution.get("parent_execution_id"),
            _int(execution.get("order_index"), default=index),
            execution.get("attempt") if isinstance(execution.get("attempt"), int) else None,
            str(execution.get("node_id") or ""),
            str(execution.get("node_type") or ""),
            str(execution.get("node_name") or execution.get("name") or ""),
            execution.get("subgraph_node_id"),
            _json(execution.get("subgraph_path") or []),
            str(execution.get("status") or ""),
            execution.get("started_at"),
            execution.get("finished_at"),
            _int(execution.get("duration_ms"), default=0),
            _redact_run_record_text(execution.get("input_summary")),
            _redact_run_record_text(execution.get("output_summary")),
            _json(artifacts),
            _json(state_reads or []),
            _json(state_writes or []),
            _json(execution.get("warnings") or []),
            _json(execution.get("errors") or []),
        ),
    )


def _insert_run_event(connection: Any, run_id: str, index: int, event: dict[str, Any]) -> None:
    event_id = str(event.get("event_id") or f"{run_id}:event:{index}")
    redacted_event = _redact_run_record_value(event)
    connection.execute(
        """
        INSERT INTO graph_run_events (
            event_id,
            run_id,
            sequence,
            event_type,
            node_id,
            execution_id,
            activity_id,
            parent_activity_id,
            invocation_id,
            status,
            created_at,
            duration_ms,
            payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event_id,
            run_id,
            _int(event.get("sequence"), default=index),
            str(event.get("event_type") or event.get("kind") or "activity"),
            event.get("node_id"),
            event.get("execution_id"),
            event.get("activity_id"),
            event.get("parent_activity_id"),
            event.get("invocation_id"),
            event.get("status"),
            str(event.get("created_at") or ""),
            event.get("duration_ms") if isinstance(event.get("duration_ms"), int) else None,
            _json(redacted_event),
        ),
    )


def _insert_state_event(connection: Any, run_id: str, index: int, event: dict[str, Any]) -> None:
    state_event_id = str(event.get("state_event_id") or f"{run_id}:state:{index}")
    connection.execute(
        """
        INSERT INTO graph_state_events (
            state_event_id,
            event_id,
            run_id,
            sequence,
            node_id,
            execution_id,
            state_key,
            output_key,
            mode,
            previous_value_hash,
            previous_value_json,
            value_hash,
            value_json,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            state_event_id,
            event.get("event_id"),
            run_id,
            _int(event.get("sequence"), default=index),
            str(event.get("node_id") or ""),
            event.get("execution_id"),
            str(event.get("state_key") or ""),
            str(event.get("output_key") or ""),
            event.get("mode"),
            event.get("previous_value_hash"),
            _json(event.get("previous_value")) if "previous_value" in event else None,
            event.get("value_hash"),
            _json(event.get("value")) if "value" in event else None,
            str(event.get("created_at") or ""),
        ),
    )


def _insert_agent_loop_events(connection: Any, run_id: str, run_state: dict[str, Any]) -> None:
    controls_by_node: dict[str, dict[str, Any]] = {}
    fallback_created_at = str(run_state.get("completed_at") or run_state.get("started_at") or "")
    loop_event_index = 0
    for event in sorted(
        (event for event in run_state.get("state_events") or [] if isinstance(event, dict)),
        key=lambda item: _int(item.get("sequence"), default=0),
    ):
        node_id = str(event.get("node_id") or "")
        state_key = str(event.get("state_key") or "")
        value = event.get("value")
        if state_key == "agent_loop_control" and isinstance(value, dict):
            controls_by_node[node_id] = copy.deepcopy(value)
            continue
        if state_key != "agent_loop_report" or not isinstance(value, dict):
            continue
        loop_event_index += 1
        control = controls_by_node.get(node_id) if isinstance(controls_by_node.get(node_id), dict) else {}
        report = copy.deepcopy(value)
        capability_kind, capability_key = _agent_loop_capability_ref(report)
        event_id = str(event.get("state_event_id") or f"{run_id}:agent_loop:{loop_event_index}")
        connection.execute(
            """
            INSERT OR REPLACE INTO agent_loop_events (
                event_id,
                run_id,
                node_id,
                iteration_index,
                event_kind,
                capability_kind,
                capability_key,
                stop_reason,
                budget_snapshot_json,
                detail_json,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                run_id,
                node_id,
                _optional_int(report.get("iteration_index")),
                str(report.get("decision") or "loop"),
                capability_kind,
                capability_key,
                str(report.get("stop_reason") or ""),
                _json(_agent_loop_budget_snapshot(control, report)),
                _json(report),
                str(event.get("created_at") or fallback_created_at),
            ),
        )


def _agent_loop_capability_ref(report: dict[str, Any]) -> tuple[str, str]:
    capability_kind = str(report.get("selected_capability_kind") or "").strip()
    capability_key = str(report.get("selected_capability_key") or "").strip()
    selected_ref = str(report.get("selected_capability_ref") or "").strip()
    if selected_ref and (not capability_kind or not capability_key) and ":" in selected_ref:
        ref_kind, ref_key = selected_ref.split(":", 1)
        capability_kind = capability_kind or ref_kind
        capability_key = capability_key or ref_key
    return capability_kind, capability_key


def _agent_loop_budget_snapshot(control: dict[str, Any], report: dict[str, Any]) -> dict[str, Any]:
    snapshot: dict[str, Any] = {}
    for key in (
        "iteration_index",
        "max_iterations",
        "capability_call_count",
        "max_capability_calls",
        "retry_budget",
    ):
        value = control.get(key) if key in control else report.get(key)
        parsed = _optional_int(value)
        if parsed is not None:
            snapshot[key] = parsed
    for key in ("failure_count_by_key", "warnings", "last_stop_reason"):
        if key in control:
            snapshot[key] = copy.deepcopy(control.get(key))
    return snapshot


def _insert_output(connection: Any, run_id: str, index: int, preview: dict[str, Any]) -> None:
    output_id = str(preview.get("output_id") or f"{run_id}:output:{index}")
    connection.execute(
        """
        INSERT INTO graph_outputs (
            output_id,
            run_id,
            event_id,
            output_node_id,
            source_kind,
            source_key,
            label,
            display_mode,
            status,
            occurrence_index,
            value_hash,
            value_json,
            persist_enabled,
            persist_format,
            saved_artifact_id,
            created_at,
            completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            output_id,
            run_id,
            preview.get("event_id"),
            str(preview.get("node_id") or ""),
            str(preview.get("source_kind") or "node_output"),
            str(preview.get("source_key") or ""),
            str(preview.get("label") or ""),
            str(preview.get("display_mode") or "auto"),
            str(preview.get("status") or "completed"),
            index,
            preview.get("value_hash"),
            _json(preview.get("value")) if "value" in preview else None,
            1 if preview.get("persist_enabled") else 0,
            str(preview.get("persist_format") or ""),
            preview.get("saved_artifact_id"),
            str(preview.get("created_at") or ""),
            preview.get("completed_at"),
        ),
    )


def _insert_artifact(connection: Any, run_id: str, index: int, artifact: dict[str, Any]) -> None:
    artifact_id = str(artifact.get("artifact_id") or f"{run_id}:artifact:{index}")
    connection.execute(
        """
        INSERT INTO graph_artifacts (
            artifact_id,
            run_id,
            execution_id,
            node_id,
            kind,
            label,
            path,
            mime_type,
            format,
            size_bytes,
            content_hash,
            metadata_json,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            artifact_id,
            run_id,
            artifact.get("execution_id"),
            artifact.get("node_id"),
            str(artifact.get("kind") or "file"),
            str(artifact.get("label") or artifact.get("file_name") or ""),
            str(artifact.get("path") or ""),
            artifact.get("mime_type"),
            artifact.get("format"),
            artifact.get("size_bytes") if isinstance(artifact.get("size_bytes"), int) else None,
            artifact.get("content_hash"),
            _json(artifact.get("metadata") or {}),
            str(artifact.get("created_at") or ""),
        ),
    )


def _insert_capability_invocation(
    connection: Any,
    run_id: str,
    index: int,
    capability_kind: str,
    output: dict[str, Any],
) -> None:
    invocation_id = str(output.get("invocation_id") or f"{run_id}:{capability_kind}:{index}")
    connection.execute(
        """
        INSERT INTO graph_capability_invocations (
            invocation_id,
            run_id,
            execution_id,
            node_id,
            capability_kind,
            capability_key,
            status,
            started_at,
            completed_at,
            duration_ms,
            input_hash,
            input_json,
            output_hash,
            output_json,
            error_json,
            metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            invocation_id,
            run_id,
            output.get("execution_id"),
            output.get("node_id"),
            capability_kind,
            str(output.get("capability_key") or output.get("action_key") or output.get("tool_key") or ""),
            str(output.get("status") or "completed"),
            output.get("started_at"),
            output.get("completed_at"),
            output.get("duration_ms") if isinstance(output.get("duration_ms"), int) else None,
            output.get("input_hash"),
            _json(output.get("input") or {}),
            output.get("output_hash"),
            _json(output),
            _json(output.get("error") or {}),
            _json(output.get("metadata") or {}),
        ),
    )


def _insert_capability_usage_event(
    connection: Any,
    run_id: str,
    index: int,
    capability_kind: str,
    output: dict[str, Any],
    created_at: str,
) -> None:
    resolved_kind = _usage_capability_kind(capability_kind, output)
    capability_key = _usage_capability_key(resolved_kind, output)
    if not capability_key:
        return
    invocation_id = str(output.get("invocation_id") or f"{run_id}:{resolved_kind}:{capability_key}:{index}")
    event_id = str(output.get("usage_event_id") or f"{invocation_id}:usage")
    status = str(output.get("status") or "completed")
    error_message = _redact_run_record_text(output.get("error"))
    connection.execute(
        """
        INSERT OR REPLACE INTO capability_usage_events (
            event_id,
            invocation_id,
            run_id,
            node_id,
            capability_kind,
            capability_key,
            selected_reason,
            status,
            latency_ms,
            error_type,
            error_message,
            permission_result,
            summary,
            detail_json,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event_id,
            invocation_id,
            run_id,
            str(output.get("node_id") or ""),
            resolved_kind,
            capability_key,
            str(output.get("selected_reason") or ""),
            status,
            output.get("duration_ms") if isinstance(output.get("duration_ms"), int) else None,
            str(output.get("error_type") or ""),
            error_message,
            _usage_permission_result(output),
            _redact_run_record_text(output.get("summary") or error_message or ""),
            _json(output),
            str(output.get("completed_at") or output.get("started_at") or created_at),
        ),
    )


def _usage_capability_kind(capability_kind: str, output: dict[str, Any]) -> str:
    if capability_kind == "capability":
        return str(output.get("capability_kind") or "capability")
    return capability_kind


def _usage_capability_key(capability_kind: str, output: dict[str, Any]) -> str:
    if capability_kind == "action":
        return str(output.get("capability_key") or output.get("action_key") or output.get("action_name") or "")
    if capability_kind == "tool":
        return str(output.get("capability_key") or output.get("tool_key") or output.get("tool_name") or "")
    return str(output.get("capability_key") or output.get("action_key") or output.get("tool_key") or "")


def _usage_permission_result(output: dict[str, Any]) -> str:
    status = str(output.get("status") or "")
    error_type = str(output.get("error_type") or "")
    if error_type == "permission_denied":
        return "denied"
    if status in {"awaiting_human", "permission_required"}:
        return "required"
    return ""


def _build_run_state(
    run_row: Any,
    current_snapshot: Any,
    snapshots: list[Any],
    executions: list[Any],
    events: list[Any],
    state_events: list[Any],
    outputs: list[Any],
    artifacts: list[Any],
    agent_loop_events: list[Any],
) -> dict[str, Any]:
    run = dict(run_row)
    detail = _loads(run.pop("detail_json", "{}"), {})
    state: dict[str, Any] = dict(detail)
    current_snapshot_payload = _snapshot_payload(current_snapshot) if current_snapshot is not None else {}
    artifact_payload = current_snapshot_payload.get("artifacts") or {}

    state.update(
        {
            "run_id": run["run_id"],
            "parent_run_id": run.get("parent_run_id") or "",
            "root_run_id": run.get("root_run_id") or run["run_id"],
            "parent_node_id": run.get("parent_node_id") or "",
            "invocation_kind": run.get("invocation_kind") or "",
            "invocation_key": run.get("invocation_key") or "",
            "run_depth": _int(run.get("run_depth"), default=0),
            "run_path": _loads(run.get("run_path_json"), [run["run_id"]]),
            "batch_group_id": run.get("batch_group_id") or "",
            "batch_item_index": run.get("batch_item_index"),
            "batch_item_label": run.get("batch_item_label") or "",
            "graph_id": run.get("graph_id"),
            "graph_name": run.get("graph_name") or "",
            "template_id": run.get("template_id") or "",
            "template_version": run.get("template_version") or "",
            "status": run.get("status") or "",
            "runtime_backend": run.get("runtime_backend") or "",
            "current_node_id": run.get("current_node_id"),
            "metadata": _loads(run.get("metadata_json"), {}),
            "lifecycle": _loads(run.get("lifecycle_json"), {}),
            "checkpoint_metadata": _loads(run.get("checkpoint_metadata_json"), {}),
            "revision_round": _int(run.get("revision_round"), default=0),
            "started_at": run.get("started_at") or "",
            "completed_at": run.get("completed_at"),
            "duration_ms": run.get("duration_ms"),
            "final_score": run.get("final_score"),
            "stop_reason": state.get("stop_reason") or artifact_payload.get("stop_reason") or "",
            "final_result": run.get("final_result") or "",
            "graph_snapshot": current_snapshot_payload.get("graph_snapshot") or {},
            "state_snapshot": current_snapshot_payload.get("state_snapshot") or {},
            "node_status_map": current_snapshot_payload.get("node_status_map") or {},
            "subgraph_status_map": current_snapshot_payload.get("subgraph_status_map") or {},
            "output_previews": [_output_payload(row) for row in outputs],
            "node_executions": [_node_execution_payload(row) for row in executions],
            "run_snapshots": [_snapshot_payload(row) for row in snapshots],
            "artifacts": artifact_payload,
        }
    )

    state.setdefault("selected_actions", artifact_payload.get("selected_actions", []))
    state.setdefault("action_outputs", artifact_payload.get("action_outputs", []))
    state.setdefault("selected_tools", artifact_payload.get("selected_tools", []))
    state.setdefault("tool_outputs", artifact_payload.get("tool_outputs", []))
    state.setdefault("selected_capabilities", artifact_payload.get("selected_capabilities", []))
    state.setdefault("capability_outputs", artifact_payload.get("capability_outputs", []))
    state.setdefault("memory_summary", "")
    state.setdefault("warnings", [])
    state.setdefault("errors", [])
    state["state_events"] = [_state_event_payload(row) for row in state_events]
    state["activity_events"] = [_run_event_payload(row) for row in events]
    state["agent_loop_events"] = [_agent_loop_event_payload(row) for row in agent_loop_events]
    state.setdefault("saved_outputs", [_artifact_payload(row) for row in artifacts])
    state.setdefault("cycle_summary", {})
    state.setdefault("cycle_iterations", [])
    return state


def _run_summary_payload(row: Any, snapshot_options: list[dict[str, Any]]) -> dict[str, Any]:
    run = dict(row)
    run_id = str(run.get("run_id") or "")
    return {
        "run_id": run_id,
        "parent_run_id": run.get("parent_run_id") or "",
        "root_run_id": run.get("root_run_id") or run_id,
        "parent_node_id": run.get("parent_node_id") or "",
        "invocation_kind": run.get("invocation_kind") or "",
        "invocation_key": run.get("invocation_key") or "",
        "run_depth": _int(run.get("run_depth"), default=0),
        "run_path": _loads(run.get("run_path_json"), [run_id]),
        "batch_group_id": run.get("batch_group_id") or "",
        "batch_item_index": run.get("batch_item_index"),
        "batch_item_label": run.get("batch_item_label") or "",
        "graph_id": run.get("graph_id"),
        "graph_name": run.get("graph_name") or "",
        "template_id": run.get("template_id") or "",
        "template_version": run.get("template_version") or "",
        "status": run.get("status") or "",
        "runtime_backend": run.get("runtime_backend") or "",
        "current_node_id": run.get("current_node_id"),
        "metadata": _loads(run.get("metadata_json"), {}),
        "lifecycle": _loads(run.get("lifecycle_json"), {}),
        "checkpoint_metadata": _loads(run.get("checkpoint_metadata_json"), {}),
        "revision_round": _int(run.get("revision_round"), default=0),
        "started_at": run.get("started_at") or "",
        "completed_at": run.get("completed_at"),
        "duration_ms": run.get("duration_ms"),
        "final_score": run.get("final_score"),
        "stop_reason": run.get("stop_reason") or "",
        "run_snapshot_options": snapshot_options,
    }


def _run_snapshot_options_by_run_id(connection: Any, run_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
    if not run_ids:
        return {}
    placeholders = ",".join("?" for _ in run_ids)
    rows = connection.execute(
        f"""
        SELECT run_id, snapshot_id, kind, label, status, current_node_id
        FROM graph_run_snapshots
        WHERE kind != 'current' AND run_id IN ({placeholders})
        ORDER BY created_at, snapshot_id
        """,
        tuple(run_ids),
    ).fetchall()
    options_by_run_id: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        snapshot = dict(row)
        snapshot_id = str(snapshot.get("snapshot_id") or "").strip()
        kind = str(snapshot.get("kind") or "").strip()
        if not snapshot_id or kind not in {"pause", "completed", "failed"}:
            continue
        run_id = str(snapshot.get("run_id") or "")
        options_by_run_id.setdefault(run_id, []).append(
            {
                "snapshot_id": snapshot_id,
                "kind": kind,
                "label": str(snapshot.get("label") or snapshot_id),
                "status": str(snapshot.get("status") or ""),
                "current_node_id": snapshot.get("current_node_id"),
            }
        )
    return options_by_run_id


def _current_graph_snapshots_by_run_id(connection: Any, run_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not run_ids:
        return {}
    placeholders = ",".join("?" for _ in run_ids)
    rows = connection.execute(
        f"""
        SELECT run_id, graph_snapshot_json
        FROM graph_run_snapshots
        WHERE kind = 'current' AND run_id IN ({placeholders})
        """,
        tuple(run_ids),
    ).fetchall()
    return {str(row["run_id"]): _loads(row["graph_snapshot_json"], {}) for row in rows}


def _current_snapshot(run_id: str, run_state: dict[str, Any]) -> dict[str, Any]:
    return {
        "snapshot_id": f"{run_id}:current",
        "kind": "current",
        "label": "Current",
        "created_at": str(run_state.get("completed_at") or run_state.get("started_at") or ""),
        "status": str(run_state.get("status") or ""),
        "current_node_id": run_state.get("current_node_id"),
        "checkpoint_metadata": copy.deepcopy(run_state.get("checkpoint_metadata") or {}),
        "state_snapshot": copy.deepcopy(run_state.get("state_snapshot") or {}),
        "graph_snapshot": copy.deepcopy(run_state.get("graph_snapshot") or {}),
        "artifacts": _run_artifacts_payload(run_state),
        "node_status_map": copy.deepcopy(run_state.get("node_status_map") or {}),
        "subgraph_status_map": copy.deepcopy(run_state.get("subgraph_status_map") or {}),
        "output_previews": copy.deepcopy(run_state.get("output_previews") or []),
        "final_result": str(run_state.get("final_result") or ""),
    }


def _run_artifacts_payload(run_state: dict[str, Any]) -> dict[str, Any]:
    payload = copy.deepcopy(run_state.get("artifacts") or {})
    for key in (
        "selected_actions",
        "action_outputs",
        "selected_tools",
        "tool_outputs",
        "selected_capabilities",
        "capability_outputs",
        "activity_events",
        "output_previews",
        "saved_outputs",
        "stop_reason",
        "state_events",
        "state_stream_events",
        "state_values",
        "state_last_writers",
        "cycle_iterations",
        "cycle_summary",
    ):
        if key in run_state:
            payload[key] = copy.deepcopy(run_state.get(key))
    return payload


def _detail_payload(run_state: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for key in DETAIL_KEYS:
        if key not in run_state:
            continue
        value = copy.deepcopy(run_state[key])
        if key == "permission_approvals":
            value = _redact_permission_approval_audit(value)
        payload[key] = value
    return payload


def _redact_permission_approval_audit(value: Any) -> Any:
    if isinstance(value, Enum):
        return _redact_permission_approval_audit(value.value)
    if isinstance(value, dict):
        return {_json_object_key(key): _redact_permission_approval_audit(raw_value) for key, raw_value in value.items()}
    if isinstance(value, list):
        return [_redact_permission_approval_audit(item) for item in value]
    if isinstance(value, str):
        redacted, _warnings = redact_context_secrets(
            value,
            source_kind="permission_approval_audit",
            source_refs=[],
        )
        return redacted
    return value


def _activity_events(run_state: dict[str, Any]) -> list[dict[str, Any]]:
    artifacts = run_state.get("artifacts") if isinstance(run_state.get("artifacts"), dict) else {}
    events = run_state.get("activity_events")
    if isinstance(events, list):
        return [event for event in events if isinstance(event, dict) and _is_persisted_result_event(event)]
    artifact_events = artifacts.get("activity_events") if isinstance(artifacts, dict) else None
    if isinstance(artifact_events, list):
        return [event for event in artifact_events if isinstance(event, dict) and _is_persisted_result_event(event)]
    return []


def _is_persisted_result_event(event: dict[str, Any]) -> bool:
    kind = str(event.get("event_type") or event.get("kind") or "").strip()
    if kind in NON_PERSISTED_EVENT_KINDS:
        return False
    return not kind.endswith(".delta")


def _artifact_items(run_state: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for item in run_state.get("saved_outputs") or []:
        if isinstance(item, dict):
            items.append({**item, "kind": item.get("kind") or "saved_output"})
    artifacts = run_state.get("artifacts")
    if isinstance(artifacts, dict):
        for item in artifacts.get("exported_outputs") or []:
            if isinstance(item, dict):
                saved_file = item.get("saved_file")
                if isinstance(saved_file, dict):
                    items.append({**saved_file, "node_id": item.get("node_id"), "kind": "exported_output"})
    return items


def _snapshot_payload(row: Any) -> dict[str, Any]:
    payload = dict(row)
    return {
        "snapshot_id": payload.get("snapshot_id") or "",
        "kind": payload.get("kind") or "",
        "label": payload.get("label") or "",
        "created_at": payload.get("created_at") or "",
        "status": payload.get("status") or "",
        "current_node_id": payload.get("current_node_id"),
        "checkpoint_metadata": _loads(payload.get("checkpoint_metadata_json"), {}),
        "state_snapshot": _loads(payload.get("state_snapshot_json"), {}),
        "graph_snapshot": _loads(payload.get("graph_snapshot_json"), {}),
        "artifacts": _loads(payload.get("artifacts_json"), {}),
        "node_status_map": _loads(payload.get("node_status_map_json"), {}),
        "subgraph_status_map": _loads(payload.get("subgraph_status_map_json"), {}),
        "output_previews": _loads(payload.get("output_previews_json"), []),
        "final_result": payload.get("final_result") or "",
    }


def _node_execution_payload(row: Any) -> dict[str, Any]:
    payload = dict(row)
    return {
        "execution_id": payload.get("execution_id"),
        "attempt": payload.get("attempt"),
        "node_id": payload.get("node_id") or "",
        "node_type": payload.get("node_type") or "",
        "status": payload.get("status") or "",
        "started_at": payload.get("started_at"),
        "finished_at": payload.get("finished_at"),
        "duration_ms": payload.get("duration_ms") or 0,
        "input_summary": payload.get("input_summary") or "",
        "output_summary": payload.get("output_summary") or "",
        "artifacts": _loads(payload.get("artifacts_json"), {}),
        "warnings": _loads(payload.get("warnings_json"), []),
        "errors": _loads(payload.get("errors_json"), []),
    }


def _run_event_payload(row: Any) -> dict[str, Any]:
    return _loads(dict(row).get("payload_json"), {})


def _agent_loop_event_payload(row: Any) -> dict[str, Any]:
    payload = dict(row)
    return {
        "event_id": payload.get("event_id") or "",
        "run_id": payload.get("run_id") or "",
        "node_id": payload.get("node_id") or "",
        "iteration_index": payload.get("iteration_index"),
        "event_kind": payload.get("event_kind") or "",
        "capability_kind": payload.get("capability_kind") or "",
        "capability_key": payload.get("capability_key") or "",
        "stop_reason": payload.get("stop_reason") or "",
        "budget_snapshot": _loads(payload.get("budget_snapshot_json"), {}),
        "detail": _loads(payload.get("detail_json"), {}),
        "created_at": payload.get("created_at") or "",
    }


def _state_event_payload(row: Any) -> dict[str, Any]:
    payload = dict(row)
    value_json = payload.get("value_json")
    return {
        "node_id": payload.get("node_id") or "",
        "state_key": payload.get("state_key") or "",
        "output_key": payload.get("output_key") or "",
        "mode": payload.get("mode") or "replace",
        "value": _loads(value_json, None) if value_json is not None else None,
        "created_at": payload.get("created_at") or "",
    }


def _output_payload(row: Any) -> dict[str, Any]:
    payload = dict(row)
    value_json = payload.get("value_json")
    return {
        "node_id": payload.get("output_node_id"),
        "label": payload.get("label") or None,
        "source_kind": payload.get("source_kind") or "node_output",
        "source_key": payload.get("source_key") or "",
        "display_mode": payload.get("display_mode") or "auto",
        "persist_enabled": bool(payload.get("persist_enabled")),
        "persist_format": payload.get("persist_format") or "auto",
        "value": _loads(value_json, None) if value_json is not None else None,
    }


def _artifact_payload(row: Any) -> dict[str, Any]:
    payload = dict(row)
    return {
        "node_id": payload.get("node_id"),
        "source_key": payload.get("label") or payload.get("artifact_id") or "",
        "path": payload.get("path") or "",
        "format": payload.get("format") or "",
        "file_name": payload.get("label") or "",
        "kind": payload.get("kind") or "",
    }


def _json(value: Any) -> str:
    return json.dumps(_redact_run_record_value(value), ensure_ascii=False, sort_keys=True)


def _redact_run_record_value(value: Any) -> Any:
    if isinstance(value, Enum):
        return _redact_run_record_value(value.value)
    if isinstance(value, dict):
        return {_json_object_key(key): _redact_run_record_value(raw_value) for key, raw_value in value.items()}
    if isinstance(value, list):
        return [_redact_run_record_value(item) for item in value]
    if isinstance(value, str):
        return _redact_run_record_text(value)
    return value


def _json_object_key(value: Any) -> str:
    if isinstance(value, Enum):
        return str(value.value)
    return str(value)


def _redact_run_record_text(value: Any) -> str:
    text = str(value or "")
    if not text:
        return ""
    redacted, _warnings = redact_context_secrets(
        text,
        source_kind="graph_run_record",
        source_refs=[],
    )
    return redacted


def _loads(value: Any, default: Any) -> Any:
    if not isinstance(value, str) or value == "":
        return copy.deepcopy(default)
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return copy.deepcopy(default)


def _required_text(payload: dict[str, Any], key: str) -> str:
    value = str(payload.get(key) or "").strip()
    if not value:
        raise ValueError(f"Run state is missing required field '{key}'.")
    return value


def _int(value: Any, *, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _optional_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _run_path_sort_key(run: dict[str, Any]) -> tuple[int, str, str]:
    path = run.get("run_path")
    path_length = len(path) if isinstance(path, list) else 0
    return (path_length, str(run.get("started_at", "")), str(run.get("run_id", "")))
