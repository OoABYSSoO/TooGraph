from __future__ import annotations

import tempfile
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.buddy import store
from app.core.runtime.state import create_initial_run_state, set_run_status, utc_now_iso
from app.core.storage import database
from app.core.storage.run_store import load_run, save_run
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

    def test_enqueue_background_review_creates_review_run_and_auditable_record(self) -> None:
        self._save_source_run("run_visible_1", status="completed")
        executed: list[dict] = []

        def fake_execute(_graph, run_state: dict, *, persist_progress: bool) -> None:
            executed.append(run_state)
            set_run_status(run_state, "completed")
            save_run(run_state)

        with patch("app.buddy.background_review.execute_node_system_graph_langgraph", fake_execute):
            with TestClient(app) as client:
                response = client.post(
                    "/api/buddy/background-reviews",
                    json={
                        "source_run_id": "run_visible_1",
                        "buddy_model_ref": "openai/gpt-4.1",
                    },
                )
                list_response = client.get(
                    "/api/buddy/background-reviews",
                    params={"source_run_id": "run_visible_1"},
                )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["review_id"].startswith("bgrev_"))
        self.assertEqual(body["source_run_id"], "run_visible_1")
        self.assertTrue(body["review_run_id"].startswith("run_"))
        self.assertEqual(body["template_id"], "buddy_autonomous_review")
        self.assertEqual(body["trigger_reason"], "visible_buddy_run_completed")
        self.assertEqual(body["status"], "queued")

        self.assertEqual(list_response.status_code, 200)
        records = list_response.json()
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["review_id"], body["review_id"])
        self.assertEqual(records[0]["status"], "completed")
        self.assertEqual(records[0]["metadata"]["buddy_model_ref"], "openai/gpt-4.1")

        self.assertEqual(len(executed), 1)
        review_run = load_run(body["review_run_id"])
        self.assertEqual(review_run["status"], "completed")
        self.assertEqual(review_run["metadata"]["buddy_background_review_id"], body["review_id"])
        self.assertEqual(review_run["metadata"]["buddy_parent_run_id"], "run_visible_1")
        self.assertEqual(review_run["metadata"]["buddy_template_id"], "buddy_autonomous_review")
        self.assertEqual(review_run["metadata"]["buddy_review_trigger_reason"], "visible_buddy_run_completed")
        self.assertEqual(review_run["metadata"]["buddy_model_ref"], "openai/gpt-4.1")
        self.assertEqual(
            review_run["graph_snapshot"]["nodes"]["input_source_run_id"]["config"]["value"],
            "run_visible_1",
        )

    def test_background_review_requires_completed_source_run(self) -> None:
        self._save_source_run("run_visible_running", status="running")

        with TestClient(app) as client:
            response = client.post(
                "/api/buddy/background-reviews",
                json={"source_run_id": "run_visible_running"},
            )

        self.assertEqual(response.status_code, 409)
        self.assertIn("completed", response.json()["detail"])

    def test_background_review_list_includes_writeback_revision_skipped_and_evidence_summary(self) -> None:
        self._save_source_run("run_visible_with_review_outputs", status="completed")

        def fake_execute(_graph, run_state: dict, *, persist_progress: bool) -> None:
            review_run_id = str(run_state["run_id"])
            run_state["state_values"] = {
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
                            "run_id": review_run_id,
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
                            "run_id": review_run_id,
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
            }
            run_state["state_snapshot"] = {"values": dict(run_state["state_values"])}
            set_run_status(run_state, "completed")
            save_run(run_state)

        with patch("app.buddy.background_review.execute_node_system_graph_langgraph", fake_execute):
            with TestClient(app) as client:
                response = client.post(
                    "/api/buddy/background-reviews",
                    json={"source_run_id": "run_visible_with_review_outputs"},
                )
                list_response = client.get(
                    "/api/buddy/background-reviews",
                    params={"source_run_id": "run_visible_with_review_outputs"},
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(list_response.status_code, 200)
        summary = list_response.json()[0]["writeback_summary"]
        self.assertEqual(summary["revision_ids"], ["rev_memory_doc", "memrev_answer_pref"])
        self.assertEqual(summary["memory_ids"], ["mem_answer_pref"])
        self.assertEqual(summary["applied_count"], 2)
        self.assertEqual(summary["skipped_count"], 1)
        self.assertEqual(summary["skipped_commands"][0]["channel"], "user_context")
        self.assertEqual(summary["skipped_commands"][0]["action"], "policy.update")
        self.assertEqual(summary["evidence_items"][0]["text"], "用户明确要求后续回答先给结论。")
        self.assertEqual(summary["evidence_items"][0]["source_state"], "autonomous_review.evidence")

    def test_background_review_list_includes_improvement_candidate_summary(self) -> None:
        self._save_source_run("run_visible_with_improvements", status="completed")

        def fake_execute(_graph, run_state: dict, *, persist_progress: bool) -> None:
            run_state["state_values"] = {
                "improvement_candidates": [
                    {
                        "candidate_id": "cand_template_retry_budget",
                        "kind": "template_revision",
                        "source_run_id": "run_visible_with_improvements",
                        "risk_level": "medium",
                        "expected_benefit": "减少能力循环超预算时的无效重试。",
                        "proposed_change_summary": "为 Buddy 主循环增加针对 capability_budget_exhausted 的恢复分支。",
                        "approval_required": True,
                        "evidence_refs": [
                            {"kind": "graph_run", "id": "run_visible_with_improvements"},
                        ],
                    }
                ]
            }
            run_state["state_snapshot"] = {"values": dict(run_state["state_values"])}
            set_run_status(run_state, "completed")
            save_run(run_state)

        with patch("app.buddy.background_review.execute_node_system_graph_langgraph", fake_execute):
            with TestClient(app) as client:
                response = client.post(
                    "/api/buddy/background-reviews",
                    json={"source_run_id": "run_visible_with_improvements"},
                )
                list_response = client.get(
                    "/api/buddy/background-reviews",
                    params={"source_run_id": "run_visible_with_improvements"},
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(list_response.status_code, 200)
        improvement = list_response.json()[0]["improvement_summary"]
        self.assertEqual(improvement["candidate_count"], 1)
        self.assertEqual(improvement["risk_counts"], {"medium": 1})
        self.assertEqual(improvement["candidates"][0]["candidate_id"], "cand_template_retry_budget")
        self.assertEqual(improvement["candidates"][0]["kind"], "template_revision")
        self.assertEqual(improvement["candidates"][0]["source_run_id"], "run_visible_with_improvements")
        self.assertEqual(improvement["candidates"][0]["approval_required"], True)
        self.assertEqual(improvement["candidates"][0]["evidence_refs"], [{"kind": "graph_run", "id": "run_visible_with_improvements"}])

    def test_improvement_candidates_are_persisted_and_queryable(self) -> None:
        self._save_source_run("run_visible_with_persisted_candidates", status="completed")

        def fake_execute(_graph, run_state: dict, *, persist_progress: bool) -> None:
            run_state["state_values"] = {
                "improvement_candidates": [
                    {
                        "candidate_id": "cand_buddy_loop_budget",
                        "kind": "template_revision",
                        "source_run_id": "run_visible_with_persisted_candidates",
                        "target_ref": {
                            "template_id": "buddy_autonomous_loop",
                            "node_id": "capability_loop_review",
                        },
                        "risk_level": "medium",
                        "expected_benefit": "减少能力循环超预算时的无效重试。",
                        "proposed_change_summary": "为 Buddy 主循环增加预算耗尽后的收束分支。",
                        "approval_required": True,
                        "evidence_refs": [
                            {"kind": "graph_run", "id": "run_visible_with_persisted_candidates"},
                        ],
                    }
                ]
            }
            run_state["state_snapshot"] = {"values": dict(run_state["state_values"])}
            set_run_status(run_state, "completed")
            save_run(run_state)

        with patch("app.buddy.background_review.execute_node_system_graph_langgraph", fake_execute):
            with TestClient(app) as client:
                response = client.post(
                    "/api/buddy/background-reviews",
                    json={"source_run_id": "run_visible_with_persisted_candidates"},
                )
                candidates_response = client.get(
                    "/api/buddy/improvement-candidates",
                    params={"source_run_id": "run_visible_with_persisted_candidates"},
                )
                invalid_status_response = client.get(
                    "/api/buddy/improvement-candidates",
                    params={
                        "source_run_id": "run_visible_with_persisted_candidates",
                        "status": "unknown",
                    },
                )
                store.update_improvement_candidate_status(
                    "cand_buddy_loop_budget",
                    "approved",
                    validation_result={
                        "approval_request": {
                            "apply_command": {
                                "action": "memory_document.update",
                                "payload": {"content": "# MEMORY.md\n\n- 候选应用测试。\n"},
                                "change_reason": "应用已批准的改进候选。",
                            }
                        }
                    },
                )
                review_response = client.get(
                    "/api/buddy/background-reviews",
                    params={"source_run_id": "run_visible_with_persisted_candidates"},
                )

        self.assertEqual(response.status_code, 200)
        review = response.json()
        self.assertEqual(candidates_response.status_code, 200)
        candidates = candidates_response.json()
        self.assertEqual(len(candidates), 1)
        candidate = candidates[0]
        self.assertEqual(candidate["candidate_id"], "cand_buddy_loop_budget")
        self.assertEqual(candidate["kind"], "template_revision")
        self.assertEqual(candidate["status"], "proposed")
        self.assertEqual(candidate["source_run_id"], "run_visible_with_persisted_candidates")
        self.assertEqual(candidate["review_id"], review["review_id"])
        self.assertEqual(candidate["review_run_id"], review["review_run_id"])
        self.assertEqual(candidate["target_ref"]["template_id"], "buddy_autonomous_loop")
        self.assertEqual(candidate["evidence_refs"], [{"kind": "graph_run", "id": "run_visible_with_persisted_candidates"}])
        self.assertEqual(candidate["payload"]["candidate_id"], "cand_buddy_loop_budget")
        self.assertEqual(candidate["validation_run_id"], "")
        self.assertEqual(candidate["applied_revision_id"], "")
        self.assertEqual(invalid_status_response.status_code, 200)
        self.assertEqual(invalid_status_response.json(), [])

        self.assertEqual(review_response.status_code, 200)
        review_candidate = review_response.json()[0]["improvement_summary"]["candidates"][0]
        self.assertEqual(review_candidate["candidate_id"], "cand_buddy_loop_budget")
        self.assertEqual(review_candidate["status"], "approved")
        self.assertEqual(review_candidate["has_apply_command"], True)

    def test_improvement_candidate_validation_run_link_and_status_sync(self) -> None:
        store.upsert_improvement_candidates_for_review(
            {
                "review_id": "bgrev_candidate_status",
                "source_run_id": "run_source_for_candidate_status",
                "review_run_id": "run_review_for_candidate_status",
            },
            [
                {
                    "candidate_id": "cand_status_progression",
                    "kind": "template_revision",
                    "source_run_id": "run_source_for_candidate_status",
                    "risk_level": "medium",
                    "proposed_change_summary": "验证候选状态推进。",
                    "approval_required": True,
                }
            ],
        )
        validation_run = create_initial_run_state(graph_id="runtime_graph_validation", graph_name="Candidate Validation")
        validation_run["run_id"] = "run_candidate_validation"
        validation_run["root_run_id"] = "run_candidate_validation"
        validation_run["run_path"] = ["run_candidate_validation"]
        validation_run["status"] = "running"
        validation_run["metadata"] = {
            "origin": "buddy",
            "buddy_template_id": "buddy_improvement_review_workflow",
            "buddy_improvement_candidate_review": True,
            "buddy_improvement_candidate_id": "cand_status_progression",
        }
        with TestClient(app) as client:
            save_run(validation_run)
            link_response = client.post(
                "/api/buddy/improvement-candidates/cand_status_progression/validation-run",
                json={"validation_run_id": "run_candidate_validation"},
            )

        self.assertEqual(link_response.status_code, 200)
        linked_candidate = link_response.json()
        self.assertEqual(linked_candidate["candidate_id"], "cand_status_progression")
        self.assertEqual(linked_candidate["status"], "validating")
        self.assertEqual(linked_candidate["validation_run_id"], "run_candidate_validation")

        validation_run["state_values"] = {
            "candidate_validation_plan": {
                "checks": ["template_schema"],
                "success_criteria": ["模板校验通过"],
            },
            "proposed_diff": {
                "target_ref": {"template_id": "buddy_autonomous_loop"},
                "diff_summary": "增加预算耗尽收束分支。",
            },
            "validation_report": {
                "status": "passed",
                "issues": [],
            },
            "test_plan": "运行模板校验和一次候选回归。",
            "approval_request": {
                "candidate_id": "cand_status_progression",
                "approval_required": True,
                "allowed_next_actions": ["approve", "reject"],
            },
            "candidate_status_recommendation": {
                "candidate_id": "cand_status_progression",
                "recommended_status": "validated",
                "reason": "模板校验通过。",
            },
            "final_summary": "候选已通过模板验证，等待审批。",
        }
        validation_run["state_snapshot"] = {"values": dict(validation_run["state_values"])}
        set_run_status(validation_run, "completed")

        with TestClient(app) as client:
            save_run(validation_run)
            sync_response = client.post(
                "/api/buddy/improvement-candidates/cand_status_progression/sync-validation-status"
            )

        self.assertEqual(sync_response.status_code, 200)
        synced_candidate = sync_response.json()
        self.assertEqual(synced_candidate["status"], "validated")
        self.assertEqual(synced_candidate["validation_run_id"], "run_candidate_validation")
        self.assertEqual(synced_candidate["status_reason"], "模板校验通过。")
        self.assertEqual(
            synced_candidate["validation_result"]["candidate_status_recommendation"]["recommended_status"],
            "validated",
        )
        self.assertEqual(synced_candidate["validation_result"]["proposed_diff"]["diff_summary"], "增加预算耗尽收束分支。")
        self.assertEqual(synced_candidate["validation_result"]["approval_request"]["allowed_next_actions"], ["approve", "reject"])
        self.assertEqual(synced_candidate["validation_result"]["final_summary"], "候选已通过模板验证，等待审批。")

    def test_improvement_candidate_decision_records_approval_and_rejection(self) -> None:
        store.upsert_improvement_candidates_for_review(
            {
                "review_id": "bgrev_candidate_decision",
                "source_run_id": "run_source_for_candidate_decision",
                "review_run_id": "run_review_for_candidate_decision",
            },
            [
                {
                    "candidate_id": "cand_decision_approve",
                    "kind": "template_revision",
                    "source_run_id": "run_source_for_candidate_decision",
                    "risk_level": "medium",
                    "proposed_change_summary": "批准候选。",
                    "approval_required": True,
                    "status": "waiting_for_approval",
                },
                {
                    "candidate_id": "cand_decision_reject",
                    "kind": "template_revision",
                    "source_run_id": "run_source_for_candidate_decision",
                    "risk_level": "medium",
                    "proposed_change_summary": "拒绝候选。",
                    "approval_required": True,
                    "status": "needs_changes",
                },
            ],
        )

        with TestClient(app) as client:
            approve_response = client.post(
                "/api/buddy/improvement-candidates/cand_decision_approve/decision",
                json={"decision": "approve", "reason": "验证产物清晰，批准进入应用阶段。"},
            )
            reject_response = client.post(
                "/api/buddy/improvement-candidates/cand_decision_reject/decision",
                json={"decision": "reject", "reason": "风险说明不足，拒绝本候选。"},
            )

        self.assertEqual(approve_response.status_code, 200)
        approved = approve_response.json()
        self.assertEqual(approved["status"], "approved")
        self.assertEqual(approved["status_reason"], "验证产物清晰，批准进入应用阶段。")
        self.assertEqual(approved["decision"]["decision"], "approve")
        self.assertEqual(approved["decision"]["reason"], "验证产物清晰，批准进入应用阶段。")
        self.assertTrue(approved["decided_at"])

        self.assertEqual(reject_response.status_code, 200)
        rejected = reject_response.json()
        self.assertEqual(rejected["status"], "rejected")
        self.assertEqual(rejected["status_reason"], "风险说明不足，拒绝本候选。")
        self.assertEqual(rejected["decision"]["decision"], "reject")

    def test_improvement_candidate_apply_executes_approved_command_and_records_revision(self) -> None:
        store.upsert_improvement_candidates_for_review(
            {
                "review_id": "bgrev_candidate_apply",
                "source_run_id": "run_source_for_candidate_apply",
                "review_run_id": "run_review_for_candidate_apply",
            },
            [
                {
                    "candidate_id": "cand_apply_memory_doc",
                    "kind": "memory",
                    "source_run_id": "run_source_for_candidate_apply",
                    "risk_level": "low",
                    "proposed_change_summary": "更新长期记忆文件。",
                    "approval_required": True,
                    "status": "waiting_for_approval",
                }
            ],
        )
        store.update_improvement_candidate_status(
            "cand_apply_memory_doc",
            "waiting_for_approval",
            validation_result={
                "approval_request": {
                    "candidate_id": "cand_apply_memory_doc",
                    "apply_command": {
                        "action": "memory_document.update",
                        "payload": {
                            "content": "# MEMORY.md\n\n- 通过改进候选写入的长期记忆。\n",
                        },
                        "change_reason": "应用已批准的改进候选。",
                    },
                }
            },
        )
        store.decide_improvement_candidate(
            "cand_apply_memory_doc",
            decision="approve",
            reason="批准写入 MEMORY.md。",
        )

        with TestClient(app) as client:
            apply_response = client.post(
                "/api/buddy/improvement-candidates/cand_apply_memory_doc/apply",
                json={"change_reason": "应用已批准的改进候选。"},
            )

        self.assertEqual(apply_response.status_code, 200)
        applied = apply_response.json()
        self.assertEqual(applied["status"], "applied")
        self.assertEqual(applied["applied_command"]["action"], "memory_document.update")
        self.assertEqual(applied["applied_command"]["revision_id"], applied["applied_revision_id"])
        self.assertTrue(applied["applied_revision_id"].startswith("rev_"))
        self.assertTrue(applied["applied_at"])
        self.assertIn("通过改进候选写入的长期记忆", store.load_memory_document()["content"])

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
        run_state["state_snapshot"] = {
            "values": {
                "public_response": "可见回复",
            }
        }
        if status == "completed":
            run_state["completed_at"] = utc_now_iso()
        save_run(run_state)
