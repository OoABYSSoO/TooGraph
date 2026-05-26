from __future__ import annotations

import sqlite3
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.buddy import store as buddy_store
from app.core.runtime.run_tree import create_child_run_state
from app.core.runtime.state import create_initial_run_state
from app.core.schemas.run import RunDetail
from app.core.storage import database, run_store


def test_save_run_loads_run_detail_from_database_without_json_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    legacy_dir = _prepare_temp_run_store(tmp_path, monkeypatch)
    run = _run_state("run_saved", "2026-05-26T00:00:00Z")
    run["metadata"] = {"origin": "test"}
    run["status"] = "completed"
    run["graph_snapshot"] = {"graph_id": "graph_saved", "nodes": {}}
    run["state_snapshot"] = {"values": {"answer": "done"}, "last_writers": {}}
    run["node_executions"] = [
        {
            "execution_id": "exec_saved",
            "node_id": "agent",
            "node_type": "agent",
            "status": "success",
            "duration_ms": 12,
            "artifacts": {"outputs": {"answer": "done"}},
        }
    ]
    run["output_previews"] = [
        {
            "node_id": "output",
            "source_kind": "state",
            "source_key": "answer",
            "display_mode": "markdown",
            "value": "done",
        }
    ]

    run_store.save_run(run)

    assert not (legacy_dir / "run_saved.json").exists()
    with sqlite3.connect(database.DB_PATH) as connection:
        row_count = connection.execute("SELECT COUNT(*) FROM graph_runs WHERE run_id = ?", ("run_saved",)).fetchone()[0]
    loaded = run_store.load_run("run_saved")
    detail = RunDetail.model_validate(loaded)

    assert row_count == 1
    assert detail.run_id == "run_saved"
    assert detail.metadata == {"origin": "test"}
    assert detail.graph_snapshot == {"graph_id": "graph_saved", "nodes": {}}
    assert detail.state_snapshot.values == {"answer": "done"}
    assert detail.node_executions[0].node_id == "agent"
    assert detail.output_previews[0].value == "done"


def test_save_run_persists_agent_stop_reason(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _prepare_temp_run_store(tmp_path, monkeypatch)
    run = _run_state("run_stop_reason", "2026-05-26T00:00:00Z")
    run["status"] = "completed"
    run["stop_reason"] = "capability_budget_exhausted"
    run["artifacts"] = {"stop_reason": "capability_budget_exhausted"}

    run_store.save_run(run)

    loaded = run_store.load_run("run_stop_reason")
    detail = RunDetail.model_validate(loaded)

    assert loaded["stop_reason"] == "capability_budget_exhausted"
    assert detail.stop_reason == "capability_budget_exhausted"
    assert detail.artifacts.stop_reason == "capability_budget_exhausted"


def test_save_run_projects_capability_usage_events_for_runtime_invocations(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _prepare_temp_run_store(tmp_path, monkeypatch)
    run = _run_state("run_capability_usage", "2026-05-26T00:00:00Z")
    run["status"] = "completed"
    run["action_outputs"] = [
        {
            "node_id": "execute_capability",
            "action_key": "web_search",
            "binding_source": "capability_state",
            "status": "failed",
            "duration_ms": 120,
            "error_type": "tool_runtime_error",
            "error": "Search provider timed out.",
            "outputs": {"status": "failed"},
        }
    ]
    run["capability_outputs"] = [
        {
            "node_id": "execute_worker",
            "capability_kind": "subgraph",
            "capability_key": "research_worker",
            "binding_source": "capability_state",
            "status": "succeeded",
            "duration_ms": 2500,
            "outputs": {"answer": "done"},
        }
    ]

    run_store.save_run(run)

    with sqlite3.connect(database.DB_PATH) as connection:
        rows = connection.execute(
            """
            SELECT run_id, node_id, capability_kind, capability_key, status, latency_ms, error_type, error_message, created_at
            FROM capability_usage_events
            WHERE run_id = ?
            ORDER BY capability_kind, capability_key
            """,
            ("run_capability_usage",),
        ).fetchall()

    assert [tuple(row) for row in rows] == [
        (
            "run_capability_usage",
            "execute_capability",
            "action",
            "web_search",
            "failed",
            120,
            "tool_runtime_error",
            "Search provider timed out.",
            "2026-05-26T00:00:00Z",
        ),
        (
            "run_capability_usage",
            "execute_worker",
            "subgraph",
            "research_worker",
            "succeeded",
            2500,
            "",
            "",
            "2026-05-26T00:00:00Z",
        ),
    ]

    with patch.object(buddy_store, "BUDDY_HOME_DIR", tmp_path / "buddy_home"):
        stats = buddy_store.load_capability_usage_stats()

    web_search = stats["capabilities"]["action:web_search"]
    research_worker = stats["capabilities"]["subgraph:research_worker"]
    assert web_search["use_count"] == 1
    assert web_search["failure_count"] == 1
    assert web_search["last_used_at"] == "2026-05-26T00:00:00Z"
    assert web_search["recent_runs"][0]["error_type"] == "tool_runtime_error"
    assert research_worker["use_count"] == 1
    assert research_worker["success_count"] == 1
    assert research_worker["last_duration_ms"] == 2500


def test_save_run_projects_agent_loop_events_from_guard_state_events(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _prepare_temp_run_store(tmp_path, monkeypatch)
    run = _run_state("run_agent_loop_events", "2026-05-26T00:00:00Z")
    run["status"] = "completed"
    run["state_events"] = [
        {
            "node_id": "guard_agent_loop",
            "state_key": "agent_loop_control",
            "output_key": "agent_loop_control",
            "mode": "replace",
            "value": {
                "iteration_index": 4,
                "max_iterations": 6,
                "capability_call_count": 4,
                "max_capability_calls": 4,
                "retry_budget": 1,
            },
            "sequence": 10,
            "created_at": "2026-05-26T00:01:00Z",
        },
        {
            "node_id": "guard_agent_loop",
            "state_key": "agent_loop_report",
            "output_key": "agent_loop_report",
            "mode": "replace",
            "value": {
                "decision": "stop",
                "stop_reason": "capability_budget_exhausted",
                "iteration_index": 4,
                "max_iterations": 6,
                "capability_call_count": 4,
                "max_capability_calls": 4,
                "selected_capability_kind": "action",
                "selected_capability_key": "web_search",
                "selected_capability_ref": "action:web_search",
                "last_result_status": "succeeded",
            },
            "sequence": 11,
            "created_at": "2026-05-26T00:01:01Z",
        },
    ]

    run_store.save_run(run)

    with sqlite3.connect(database.DB_PATH) as connection:
        row = connection.execute(
            """
            SELECT
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
            FROM agent_loop_events
            WHERE run_id = ?
            """,
            ("run_agent_loop_events",),
        ).fetchone()

    assert row is not None
    assert tuple(row[:7]) == (
        "run_agent_loop_events",
        "guard_agent_loop",
        4,
        "stop",
        "action",
        "web_search",
        "capability_budget_exhausted",
    )
    assert row[9] == "2026-05-26T00:01:01Z"
    assert '"capability_call_count": 4' in row[7]
    assert '"max_capability_calls": 4' in row[7]
    assert '"last_result_status": "succeeded"' in row[8]
    loaded = run_store.load_run("run_agent_loop_events")
    detail = RunDetail.model_validate(loaded)

    assert loaded["agent_loop_events"][0]["stop_reason"] == "capability_budget_exhausted"
    assert loaded["agent_loop_events"][0]["budget_snapshot"]["capability_call_count"] == 4
    assert detail.agent_loop_events[0].stop_reason == "capability_budget_exhausted"
    assert detail.agent_loop_events[0].budget_snapshot["capability_call_count"] == 4


def test_list_runs_sorts_by_started_at_then_run_id_desc(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _prepare_temp_run_store(tmp_path, monkeypatch)
    run_store.save_run(_run_state("run_a", "2026-05-26T00:00:02Z"))
    run_store.save_run(_run_state("run_z", "2026-05-26T00:00:02Z"))
    run_store.save_run(_run_state("run_old", "2026-05-26T00:00:01Z"))

    runs = run_store.list_runs()

    assert [item["run_id"] for item in runs] == ["run_z", "run_a", "run_old"]


def test_list_child_runs_returns_direct_children_only(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _prepare_temp_run_store(tmp_path, monkeypatch)
    root = _run_state("run_root", "2026-05-26T00:00:00Z")
    child_late = create_child_run_state(
        root,
        graph_id="graph_child_late",
        graph_name="Child Late",
        parent_node_id="subgraph",
        invocation_kind="subgraph_node",
        invocation_key="late",
    )
    child_late["run_id"] = "run_child_late"
    child_late["root_run_id"] = "run_root"
    child_late["run_path"] = ["run_root", "run_child_late"]
    child_late["started_at"] = "2026-05-26T00:00:03Z"
    child_early = create_child_run_state(
        root,
        graph_id="graph_child_early",
        graph_name="Child Early",
        parent_node_id="subgraph",
        invocation_kind="subgraph_node",
        invocation_key="early",
    )
    child_early["run_id"] = "run_child_early"
    child_early["root_run_id"] = "run_root"
    child_early["run_path"] = ["run_root", "run_child_early"]
    child_early["started_at"] = "2026-05-26T00:00:02Z"
    grandchild = create_child_run_state(
        child_early,
        graph_id="graph_grandchild",
        graph_name="Grandchild",
        parent_node_id="worker",
        invocation_kind="subgraph_node",
        invocation_key="grandchild",
    )
    grandchild["run_id"] = "run_grandchild"
    grandchild["run_path"] = ["run_root", "run_child_early", "run_grandchild"]

    for run in [root, child_late, child_early, grandchild]:
        run_store.save_run(run)

    children = run_store.list_child_runs("run_root")

    assert [item["run_id"] for item in children] == ["run_child_early", "run_child_late"]


def test_load_run_raises_for_missing_run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _prepare_temp_run_store(tmp_path, monkeypatch)

    with pytest.raises(FileNotFoundError):
        run_store.load_run("run_missing")


def _prepare_temp_run_store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    data_dir = tmp_path / "data"
    db_path = data_dir / "toograph.db"
    monkeypatch.setattr(database, "DATA_DIR", data_dir)
    monkeypatch.setattr(database, "DB_PATH", db_path)
    monkeypatch.setattr(run_store, "RUN_DATA_DIR", tmp_path / "legacy_runs", raising=False)
    database.initialize_storage()
    return tmp_path / "legacy_runs"


def _run_state(run_id: str, started_at: str) -> dict:
    run = create_initial_run_state("graph_test", "Test Graph")
    run["run_id"] = run_id
    run["root_run_id"] = run_id
    run["run_path"] = [run_id]
    run["started_at"] = started_at
    return run
