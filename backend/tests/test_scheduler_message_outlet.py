from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.buddy import store as buddy_store
from app.core.storage import database
from app.scheduler import message_outlet, store


def test_scheduled_message_outlet_persists_buddy_transcript_for_public_outputs() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = Path(temp_dir) / "data"
        db_path = data_dir / "toograph.db"
        with (
            patch("app.core.storage.database.DATA_DIR", data_dir),
            patch("app.core.storage.database.DB_PATH", db_path),
        ):
            database.initialize_storage()
            session = buddy_store.create_chat_session(
                {"title": "定时任务输出", "source": "scheduler"},
                changed_by="test",
                change_reason="test",
            )
            job = store.create_scheduled_graph_job(
                {
                    "name": "日报",
                    "template_id": "buddy_capability_curator",
                    "schedule_kind": "manual",
                    "delivery_target": {
                        "kind": "message_outlet",
                        "outlet": "buddy",
                        "session_mode": "existing_session",
                        "buddy_session_id": session["session_id"],
                    },
                },
                now="2026-05-27T00:00:00Z",
            )
            job_run = store.record_scheduled_graph_job_run(
                job["job_id"],
                run_id="run_scheduler_daily",
                trigger_reason="manual",
                status="completed",
                started_at="2026-05-27T01:00:00Z",
                completed_at="2026-05-27T01:01:00Z",
            )

            result = message_outlet.deliver_scheduled_graph_job_outputs(
                job_run["job_run_id"],
                _run_state_with_two_outputs(),
            )
            messages = buddy_store.list_chat_messages(session["session_id"])
            reloaded_run = store.load_scheduled_graph_job_run(job_run["job_run_id"])

    assert result["status"] == "delivered"
    assert result["outlet"] == "buddy"
    assert result["message_count"] == 2
    assert messages[-1]["role"] == "assistant"
    assert messages[-1]["content"] == "第一段输出\n\n第二段输出"
    assert messages[-1]["run_id"] == "run_scheduler_daily"
    assert messages[-1]["metadata"]["source_kind"] == "scheduled_graph_message_outlet"
    assert reloaded_run["metadata"]["delivery_result"]["kind"] == "message_outlet"


def test_create_session_message_outlet_binds_created_buddy_session_for_future_runs() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = Path(temp_dir) / "data"
        db_path = data_dir / "toograph.db"
        with (
            patch("app.core.storage.database.DATA_DIR", data_dir),
            patch("app.core.storage.database.DB_PATH", db_path),
        ):
            database.initialize_storage()
            job = store.create_scheduled_graph_job(
                {
                    "name": "日报",
                    "template_id": "buddy_capability_curator",
                    "schedule_kind": "manual",
                    "delivery_target": {
                        "kind": "message_outlet",
                        "outlet": "buddy",
                        "session_mode": "create_session",
                    },
                },
                now="2026-05-27T00:00:00Z",
            )
            first_run = store.record_scheduled_graph_job_run(
                job["job_id"],
                run_id="run_scheduler_daily_1",
                trigger_reason="manual",
                status="completed",
                started_at="2026-05-27T01:00:00Z",
                completed_at="2026-05-27T01:01:00Z",
            )
            message_outlet.deliver_scheduled_graph_job_outputs(first_run["job_run_id"], _run_state_with_two_outputs())

            rebound_job = store.load_scheduled_graph_job(job["job_id"])
            bound_session_id = rebound_job["delivery_target"]["buddy_session_id"]
            second_run = store.record_scheduled_graph_job_run(
                job["job_id"],
                run_id="run_scheduler_daily_2",
                trigger_reason="manual",
                status="completed",
                started_at="2026-05-27T02:00:00Z",
                completed_at="2026-05-27T02:01:00Z",
            )
            message_outlet.deliver_scheduled_graph_job_outputs(second_run["job_run_id"], _run_state_with_two_outputs())

            sessions = [session for session in buddy_store.list_chat_sessions() if session["source"] == "scheduler"]
            messages = buddy_store.list_chat_messages(bound_session_id)

    assert rebound_job["delivery_target"]["session_mode"] == "existing_session"
    assert bound_session_id
    assert [session["session_id"] for session in sessions] == [bound_session_id]
    assert [message["run_id"] for message in messages] == ["run_scheduler_daily_1", "run_scheduler_daily_2"]


def _run_state_with_two_outputs() -> dict:
    return {
        "run_id": "run_scheduler_daily",
        "status": "completed",
        "completed_at": "2026-05-27T01:01:00Z",
        "graph_snapshot": {
            "state_schema": {
                "answer": {"name": "回答", "description": "", "type": "markdown", "color": "#2563eb"},
                "summary": {"name": "摘要", "description": "", "type": "text", "color": "#16a34a"},
            },
            "nodes": {
                "writer": {
                    "kind": "agent",
                    "name": "Writer",
                    "description": "",
                    "reads": [],
                    "writes": [{"state": "answer"}, {"state": "summary"}],
                    "config": {},
                },
                "output_answer": {
                    "kind": "output",
                    "name": "回答",
                    "description": "",
                    "reads": [{"state": "answer", "required": True}],
                    "writes": [],
                    "config": {"displayMode": "markdown"},
                },
                "output_summary": {
                    "kind": "output",
                    "name": "摘要",
                    "description": "",
                    "reads": [{"state": "summary", "required": True}],
                    "writes": [],
                    "config": {"displayMode": "plain"},
                },
            },
            "edges": [
                {"source": "writer", "target": "output_answer"},
                {"source": "writer", "target": "output_summary"},
            ],
            "conditional_edges": [],
            "metadata": {},
        },
        "node_executions": [
            {
                "node_id": "writer",
                "node_type": "agent",
                "status": "success",
                "started_at": "2026-05-27T01:00:00Z",
                "finished_at": "2026-05-27T01:01:00Z",
                "artifacts": {"selected_branch": ""},
            }
        ],
        "artifacts": {
            "state_events": [
                {
                    "node_id": "writer",
                    "state_key": "answer",
                    "output_key": "answer",
                    "value": "第一段输出",
                    "sequence": 1,
                    "created_at": "2026-05-27T01:00:30Z",
                },
                {
                    "node_id": "writer",
                    "state_key": "summary",
                    "output_key": "summary",
                    "value": "第二段输出",
                    "sequence": 2,
                    "created_at": "2026-05-27T01:00:40Z",
                },
            ]
        },
    }
