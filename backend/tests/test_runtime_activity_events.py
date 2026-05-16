from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.activity_events import record_activity_event
from app.core.storage.operation_journal_store import list_operation_journal_entries


class RuntimeActivityEventsTests(unittest.TestCase):
    def test_record_activity_event_appends_to_root_state_and_publishes(self) -> None:
        parent_state = {"run_id": "run-activity"}
        state = {
            "run_id": "run-activity",
            "_parent_run_state": parent_state,
            "_subgraph_context": {
                "node_id": "run_capability_cycle",
                "path": ["run_capability_cycle"],
            },
        }
        published: list[tuple[str, str, dict]] = []

        event = record_activity_event(
            state,
            kind="action_invocation",
            summary="Action 'web_search' succeeded.",
            node_id="execute_capability",
            status="succeeded",
            duration_ms=23,
            detail={"action_key": "web_search"},
            publish_run_event_func=lambda run_id, event_type, payload=None: published.append(
                (str(run_id), event_type, dict(payload or {}))
            ),
        )

        self.assertEqual(parent_state["activity_events"], [event])
        self.assertEqual(event["sequence"], 1)
        self.assertEqual(event["kind"], "action_invocation")
        self.assertEqual(event["summary"], "Action 'web_search' succeeded.")
        self.assertEqual(event["node_id"], "execute_capability")
        self.assertEqual(event["subgraph_node_id"], "run_capability_cycle")
        self.assertEqual(event["subgraph_path"], ["run_capability_cycle"])
        self.assertEqual(event["status"], "succeeded")
        self.assertEqual(event["duration_ms"], 23)
        self.assertEqual(event["detail"], {"action_key": "web_search"})
        self.assertIsInstance(event["created_at"], str)
        self.assertEqual(published, [("run-activity", "activity.event", event)])

    def test_record_activity_event_persists_virtual_operation_journal(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            journal_path = Path(temp_dir) / "operation_journal.jsonl"
            with patch("app.core.storage.operation_journal_store.OPERATION_JOURNAL_PATH", journal_path):
                parent_state = {"run_id": "run-activity", "activity_events": []}

                record_activity_event(
                    parent_state,
                    kind="virtual_ui_operation",
                    summary="Requested virtual template run.",
                    node_id="run_visible_template_operation",
                    status="requested",
                    detail={
                        "operation_request_id": "vop_template",
                        "operation": {
                            "kind": "run_template",
                            "target_id": "library.template.advanced_web_research_loop.open",
                            "input_text": "鸣潮最新资讯",
                        },
                    },
                    publish_run_event_func=lambda *_args: None,
                )

                result = list_operation_journal_entries(operation_request_id="vop_template")

        self.assertEqual(result["total"], 1)
        entry = result["entries"][0]
        self.assertEqual(entry["run_id"], "run-activity")
        self.assertEqual(entry["stage"], "request")
        self.assertEqual(entry["operation"]["kind"], "run_template")
        self.assertEqual(entry["input_text"], "鸣潮最新资讯")

    def test_record_activity_event_does_not_block_on_operation_journal_failure(self) -> None:
        state = {"run_id": "run-activity"}
        published: list[tuple[str | None, str, dict | None]] = []

        with patch(
            "app.core.runtime.activity_events.record_operation_journal_event",
            side_effect=OSError("journal unavailable"),
        ):
            event = record_activity_event(
                state,
                kind="virtual_ui_operation",
                summary="Requested virtual click.",
                status="requested",
                detail={"operation_request_id": "vop_click", "operation": {"kind": "click", "target_id": "app.nav.runs"}},
                publish_run_event_func=lambda *args: published.append(args),
            )

        self.assertEqual(state["activity_events"], [event])
        self.assertEqual(published, [("run-activity", "activity.event", event)])

    def test_record_action_activity_events_normalizes_action_payloads(self) -> None:
        state = {"run_id": "run-activity"}
        published: list[tuple[str, str, dict]] = []

        from app.core.runtime.activity_events import record_action_activity_events

        events = record_action_activity_events(
            state,
            node_id="execute_capability",
            action_key="local_workspace_executor",
            binding_source="capability_state",
            raw_events=[
                {
                    "kind": "file_write",
                    "summary": "Editing action/user/demo/ACTION.md +3 -0",
                    "status": "succeeded",
                    "detail": {"path": "action/user/demo/ACTION.md", "added": 3, "removed": 0},
                },
                {"summary": "missing kind"},
                "not an event",
            ],
            publish_run_event_func=lambda run_id, event_type, payload=None: published.append(
                (str(run_id), event_type, dict(payload or {}))
            ),
        )

        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event["kind"], "file_write")
        self.assertEqual(event["node_id"], "execute_capability")
        self.assertEqual(event["summary"], "Editing action/user/demo/ACTION.md +3 -0")
        self.assertEqual(event["detail"]["action_key"], "local_workspace_executor")
        self.assertEqual(event["detail"]["binding_source"], "capability_state")
        self.assertEqual(event["detail"]["path"], "action/user/demo/ACTION.md")
        self.assertEqual(event["detail"]["added"], 3)
        self.assertEqual(event["detail"]["removed"], 0)
        self.assertEqual(published[0][1], "activity.event")

    def test_record_action_activity_events_enriches_virtual_operation_continuation_context(self) -> None:
        state = {
            "run_id": "run-activity",
            "_subgraph_context": {"node_id": "operation_loop", "path": ["operation_loop"]},
        }
        published: list[tuple[str, str, dict]] = []

        from app.core.runtime.activity_events import record_action_activity_events

        events = record_action_activity_events(
            state,
            node_id="execute_page_operation",
            action_key="toograph_page_operator",
            binding_source="node_config",
            raw_events=[
                {
                    "kind": "virtual_ui_operation",
                    "summary": "Requested virtual click on 运行历史.",
                    "status": "requested",
                    "detail": {
                        "operation_request_id": "vop_1234567890abcdef",
                        "operation_request": {
                            "version": 1,
                            "commands": ["click app.nav.runs"],
                            "operations": [{"kind": "click", "target_id": "app.nav.runs"}],
                        },
                    },
                }
            ],
            publish_run_event_func=lambda run_id, event_type, payload=None: published.append(
                (str(run_id), event_type, dict(payload or {}))
            ),
        )

        event = events[0]
        detail = event["detail"]
        self.assertEqual(detail["run_id"], "run-activity")
        self.assertEqual(detail["node_id"], "execute_page_operation")
        self.assertEqual(detail["subgraph_node_id"], "operation_loop")
        self.assertEqual(detail["subgraph_path"], ["operation_loop"])
        self.assertEqual(detail["operation_request"]["operation_request_id"], "vop_1234567890abcdef")
        self.assertEqual(
            state["metadata"]["pending_page_operation_continuation"],
            {
                "mode": "auto_resume_after_ui_operation",
                "operation_request_id": "vop_1234567890abcdef",
                "resume_state_keys": ["page_operation_context", "page_context", "operation_result", "operation_report"],
                "run_id": "run-activity",
                "node_id": "execute_page_operation",
                "subgraph_node_id": "operation_loop",
                "subgraph_path": ["operation_loop"],
            },
        )
        self.assertEqual(
            detail["expected_continuation"],
            {
                "mode": "auto_resume_after_ui_operation",
                "operation_request_id": "vop_1234567890abcdef",
                "resume_state_keys": ["page_operation_context", "page_context", "operation_result", "operation_report"],
            },
        )
        self.assertEqual(published[0][2]["detail"]["expected_continuation"]["mode"], "auto_resume_after_ui_operation")

    def test_record_action_activity_events_stores_virtual_operation_continuation_on_root_state(self) -> None:
        parent_state = {"run_id": "run-activity"}
        state = {
            "run_id": "run-activity",
            "_parent_run_state": parent_state,
            "_subgraph_context": {"node_id": "buddy_capability_loop", "path": ["buddy_capability_loop"]},
        }

        from app.core.runtime.activity_events import record_action_activity_events

        record_action_activity_events(
            state,
            node_id="run_visible_template_operation",
            action_key="toograph_page_operator",
            binding_source="node_config",
            raw_events=[
                {
                    "kind": "virtual_ui_operation",
                    "summary": "Requested virtual template run.",
                    "status": "requested",
                    "detail": {
                        "operation_request_id": "vop_template",
                        "operation_request": {
                            "version": 1,
                            "commands": ["run_template advanced_web_research_loop"],
                            "operations": [{"kind": "run_template", "target_id": "library.template.advanced_web_research_loop.open"}],
                        },
                    },
                }
            ],
            publish_run_event_func=lambda *_args, **_kwargs: None,
        )

        expected = {
            "mode": "auto_resume_after_ui_operation",
            "operation_request_id": "vop_template",
            "resume_state_keys": ["page_operation_context", "page_context", "operation_result", "operation_report"],
            "run_id": "run-activity",
            "node_id": "run_visible_template_operation",
            "subgraph_node_id": "buddy_capability_loop",
            "subgraph_path": ["buddy_capability_loop"],
        }
        self.assertEqual(state["metadata"]["pending_page_operation_continuation"], expected)
        self.assertEqual(parent_state["metadata"]["pending_page_operation_continuation"], expected)


if __name__ == "__main__":
    unittest.main()
