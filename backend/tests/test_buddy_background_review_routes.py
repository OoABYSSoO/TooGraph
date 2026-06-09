from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.buddy import store
from app.core.runtime.state import create_initial_run_state, set_run_status, utc_now_iso
from app.core.storage import database
from app.core.storage.run_store import save_run
from app.main import app


class BuddyBackgroundReviewRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self._data_dir = Path(self._temp_dir.name) / "data"
        self._buddy_home_dir = Path(self._temp_dir.name) / "buddy_home"
        self._patchers = [
            patch("app.core.storage.database.DATA_DIR", self._data_dir),
            patch("app.core.storage.database.DB_PATH", self._data_dir / "toograph.db"),
            patch.object(store, "BUDDY_HOME_DIR", self._buddy_home_dir),
        ]
        for patcher in self._patchers:
            patcher.start()
        database.initialize_storage()
        store.initialize_buddy_home()

    def tearDown(self) -> None:
        for patcher in reversed(self._patchers):
            patcher.stop()
        self._temp_dir.cleanup()

    def test_background_review_post_route_is_removed(self) -> None:
        with TestClient(app) as client:
            response = client.post(
                "/api/buddy/background-reviews",
                json={"source_run_id": "run_visible_1"},
            )

        self.assertIn(response.status_code, {404, 405})

    def test_background_review_list_includes_writeback_revision_skipped_and_evidence_summary(self) -> None:
        review = self._save_completed_review_run(
            source_run_id="run_visible_with_review_outputs",
            review_run_id="run_review_with_outputs",
            state_values={
                "autonomous_review": {
                    "reason": "本轮回复暴露了一个稳定偏好。",
                    "evidence": "用户明确要求后续回答先给结论。",
                    "candidate_counts": {"memory": 1},
                },
                "applied_memory_commands": [
                    {
                        "command": {
                            "command_id": "cmd_memory_doc",
                            "action": "memory_document.update",
                            "status": "completed",
                            "target_type": "home_file",
                            "target_id": "MEMORY.md",
                            "revision_id": "rev_memory_doc",
                            "run_id": "run_review_with_outputs",
                            "change_reason": "记录稳定回答偏好。",
                        },
                        "revision": {
                            "revision_id": "rev_memory_doc",
                            "target_type": "home_file",
                            "target_id": "MEMORY.md",
                            "operation": "update",
                        },
                    }
                ],
                "applied_structured_memory_commands": [
                    {
                        "command": {
                            "command_id": "cmd_structured_memory",
                            "action": "memory_entry.create",
                            "status": "completed",
                            "target_type": "memory_entry",
                            "target_id": "mem_answer_pref",
                            "revision_id": "memrev_answer_pref",
                            "run_id": "run_review_with_outputs",
                            "change_reason": "写入可召回偏好。",
                        },
                        "result": {"memory_id": "mem_answer_pref", "title": "回答偏好"},
                        "revision": {
                            "revision_id": "memrev_answer_pref",
                            "target_type": "memory_entry",
                            "target_id": "mem_answer_pref",
                            "operation": "create",
                        },
                    }
                ],
                "skipped_user_context_commands": [
                    {
                        "index": 0,
                        "action": "policy.update",
                        "error_type": "unsupported_action",
                        "error": "旧 policy 写回不再支持。",
                    }
                ],
            },
        )

        with TestClient(app) as client:
            list_response = client.get(
                "/api/buddy/background-reviews",
                params={"source_run_id": "run_visible_with_review_outputs"},
            )

        self.assertEqual(list_response.status_code, 200)
        records = list_response.json()
        self.assertEqual([item["review_id"] for item in records], [review["review_id"]])
        summary = records[0]["writeback_summary"]
        self.assertEqual(summary["revision_ids"], ["rev_memory_doc", "memrev_answer_pref"])
        self.assertEqual(summary["memory_ids"], ["mem_answer_pref"])
        self.assertEqual(summary["applied_count"], 2)
        self.assertEqual(summary["skipped_count"], 1)
        self.assertEqual(summary["skipped_commands"][0]["channel"], "user_context")
        self.assertEqual(summary["skipped_commands"][0]["action"], "policy.update")
        self.assertEqual(summary["evidence_items"][0]["text"], "用户明确要求后续回答先给结论。")
        self.assertEqual(summary["evidence_items"][0]["source_state"], "autonomous_review.evidence")

    def test_background_review_list_includes_improvement_candidate_summary(self) -> None:
        review = self._save_completed_review_run(
            source_run_id="run_visible_with_improvements",
            review_run_id="run_review_with_improvements",
            state_values={
                "improvement_candidates": [
                    {
                        "candidate_id": "cand_template_retry_budget",
                        "kind": "template_revision",
                        "source_run_id": "run_visible_with_improvements",
                        "risk_level": "medium",
                        "expected_benefit": "减少能力循环超过预算时的无效重试。",
                        "proposed_change_summary": "为 Buddy 主循环增加预算耗尽后的收束分支。",
                        "approval_required": True,
                        "evidence_refs": [{"kind": "graph_run", "id": "run_visible_with_improvements"}],
                    }
                ]
            },
        )
        store.upsert_improvement_candidates_for_review(
            review,
            [
                {
                    "candidate_id": "cand_template_retry_budget",
                    "kind": "template_revision",
                    "source_run_id": "run_visible_with_improvements",
                    "risk_level": "medium",
                    "expected_benefit": "减少能力循环超过预算时的无效重试。",
                    "proposed_change_summary": "为 Buddy 主循环增加预算耗尽后的收束分支。",
                    "approval_required": True,
                    "evidence_refs": [{"kind": "graph_run", "id": "run_visible_with_improvements"}],
                }
            ],
        )
        store.update_improvement_candidate_status(
            "cand_template_retry_budget",
            "approved",
            validation_result={
                "approval_request": {
                    "apply_command": {
                        "action": "memory_document.update",
                        "payload": {"content": "# MEMORY.md\n\n- 候选应用测试。\n"},
                    }
                }
            },
        )

        with TestClient(app) as client:
            list_response = client.get(
                "/api/buddy/background-reviews",
                params={"source_run_id": "run_visible_with_improvements"},
            )

        self.assertEqual(review["status"], "completed")
        self.assertEqual(list_response.status_code, 200)
        improvement = list_response.json()[0]["improvement_summary"]
        self.assertEqual(improvement["candidate_count"], 1)
        self.assertEqual(improvement["risk_counts"], {"medium": 1})
        self.assertEqual(improvement["candidates"][0]["candidate_id"], "cand_template_retry_budget")
        self.assertEqual(improvement["candidates"][0]["kind"], "template_revision")
        self.assertEqual(improvement["candidates"][0]["source_run_id"], "run_visible_with_improvements")
        self.assertEqual(improvement["candidates"][0]["approval_required"], True)
        self.assertEqual(improvement["candidates"][0]["status"], "approved")
        self.assertEqual(improvement["candidates"][0]["has_apply_command"], True)

    def _save_completed_review_run(
        self,
        *,
        source_run_id: str,
        review_run_id: str,
        state_values: dict,
    ) -> dict:
        self._save_source_run(source_run_id, status="completed")
        run_state = create_initial_run_state(graph_id="runtime_graph_review", graph_name="Buddy Review")
        run_state["run_id"] = review_run_id
        run_state["root_run_id"] = review_run_id
        run_state["run_path"] = [review_run_id]
        run_state["template_id"] = "buddy_autonomous_review"
        run_state["metadata"] = {
            "origin": "scheduler",
            "buddy_template_id": "buddy_autonomous_review",
            "buddy_parent_run_id": source_run_id,
        }
        run_state["state_values"] = state_values
        run_state["state_snapshot"] = {"values": dict(state_values)}
        set_run_status(run_state, "completed")
        save_run(run_state)
        record = store.create_background_review_run(
            source_run_id=source_run_id,
            review_run_id=review_run_id,
            template_id="buddy_autonomous_review",
            trigger_reason="scheduler",
        )
        return store.mark_background_review_run_finished(record["review_id"], status="completed")

    def _save_source_run(self, run_id: str, *, status: str) -> None:
        run_state = create_initial_run_state(graph_id="runtime_graph_visible", graph_name="Visible Buddy Run")
        run_state["run_id"] = run_id
        run_state["root_run_id"] = run_id
        run_state["run_path"] = [run_id]
        run_state["status"] = status
        run_state["metadata"] = {
            "origin": "buddy",
            "buddy_template_id": "buddy_autonomous_loop",
            "runtime_context": {
                "buddy_session_id": "session_1",
                "buddy_current_message_id": "msg_1",
            },
            "buddy_model_ref": "openai/gpt-4.1",
        }
        run_state["graph_snapshot"] = {
            "graph_id": "runtime_graph_visible",
            "name": "Visible Buddy Run",
            "state_schema": {
                "public_response": {"name": "public_response", "type": "markdown", "value": ""},
            },
            "nodes": {},
            "edges": [],
            "conditional_edges": [],
            "metadata": run_state["metadata"],
        }
        run_state["state_snapshot"] = {"values": {"public_response": "可见回复"}}
        if status == "completed":
            run_state["completed_at"] = utc_now_iso()
        save_run(run_state)


if __name__ == "__main__":
    unittest.main()
