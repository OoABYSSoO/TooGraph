from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.activity_events import record_activity_event


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
            kind="skill_invocation",
            summary="Skill 'web_search' succeeded.",
            node_id="execute_capability",
            status="succeeded",
            duration_ms=23,
            detail={"skill_key": "web_search"},
            publish_run_event_func=lambda run_id, event_type, payload=None: published.append(
                (str(run_id), event_type, dict(payload or {}))
            ),
        )

        self.assertEqual(parent_state["activity_events"], [event])
        self.assertEqual(event["sequence"], 1)
        self.assertEqual(event["kind"], "skill_invocation")
        self.assertEqual(event["summary"], "Skill 'web_search' succeeded.")
        self.assertEqual(event["node_id"], "execute_capability")
        self.assertEqual(event["subgraph_node_id"], "run_capability_cycle")
        self.assertEqual(event["subgraph_path"], ["run_capability_cycle"])
        self.assertEqual(event["status"], "succeeded")
        self.assertEqual(event["duration_ms"], 23)
        self.assertEqual(event["detail"], {"skill_key": "web_search"})
        self.assertIsInstance(event["created_at"], str)
        self.assertEqual(published, [("run-activity", "activity.event", event)])

    def test_record_skill_activity_events_normalizes_skill_payloads(self) -> None:
        state = {"run_id": "run-activity"}
        published: list[tuple[str, str, dict]] = []

        from app.core.runtime.activity_events import record_skill_activity_events

        events = record_skill_activity_events(
            state,
            node_id="execute_capability",
            skill_key="local_workspace_executor",
            binding_source="capability_state",
            raw_events=[
                {
                    "kind": "file_write",
                    "summary": "Editing skill/user/demo/SKILL.md +3 -0",
                    "status": "succeeded",
                    "detail": {"path": "skill/user/demo/SKILL.md", "added": 3, "removed": 0},
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
        self.assertEqual(event["summary"], "Editing skill/user/demo/SKILL.md +3 -0")
        self.assertEqual(event["detail"]["skill_key"], "local_workspace_executor")
        self.assertEqual(event["detail"]["binding_source"], "capability_state")
        self.assertEqual(event["detail"]["path"], "skill/user/demo/SKILL.md")
        self.assertEqual(event["detail"]["added"], 3)
        self.assertEqual(event["detail"]["removed"], 0)
        self.assertEqual(published[0][1], "activity.event")


if __name__ == "__main__":
    unittest.main()
