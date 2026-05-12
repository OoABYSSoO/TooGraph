from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.compiler.validator import validate_graph
from app.core.langgraph import get_langgraph_runtime_unsupported_reasons
from app.core.langgraph.cycle_tracker import build_langgraph_cycle_tracker
from app.core.runtime.execution_graph import build_execution_edges
from app.core.schemas.node_system import NodeSystemGraphPayload
from app.templates.loader import list_template_records, load_template_record


def _official_template_records() -> list[dict]:
    return [record for record in list_template_records() if record.get("source") == "official"]


class TemplateLayoutTests(unittest.TestCase):
    def test_builtin_template_registry_contains_official_templates(self) -> None:
        records = _official_template_records()

        self.assertEqual(
            [record["template_id"] for record in records],
            ["advanced_web_research_loop", "buddy_autonomous_loop", "toograph_skill_creation_workflow"],
        )
        templates = {record["template_id"]: record for record in records}
        research_template = templates["advanced_web_research_loop"]
        self.assertEqual(research_template["source"], "official")
        self.assertEqual(research_template["label"], "高级联网搜索")
        self.assertEqual(research_template["default_graph_name"], "高级联网搜索")
        self.assertIn("多轮搜索", research_template["description"])
        skill_template = templates["toograph_skill_creation_workflow"]
        self.assertEqual(skill_template["source"], "official")
        self.assertEqual(skill_template["label"], "创建自定义 Skill")
        self.assertEqual(skill_template["default_graph_name"], "创建自定义 Skill")
        self.assertIn("需求澄清", skill_template["description"])

        buddy_template = templates["buddy_autonomous_loop"]
        self.assertEqual(buddy_template["source"], "official")
        self.assertEqual(buddy_template["label"], "伙伴自主循环")
        self.assertEqual(buddy_template["default_graph_name"], "伙伴自主循环")
        self.assertIn("Buddy Home", buddy_template["description"])

    def test_advanced_web_research_loop_contract(self) -> None:
        template = next(record for record in _official_template_records() if record["template_id"] == "advanced_web_research_loop")
        states = template["state_schema"]
        nodes = template["nodes"]

        self.assertEqual(states["artifact_paths"]["type"], "file")
        self.assertEqual(states["source_urls"]["type"], "json")
        self.assertEqual(states["final_reply"]["type"], "markdown")
        self.assertFalse(any("promptVisible" in definition for definition in states.values()))

        search_node = nodes["run_web_search"]
        self.assertEqual(search_node["kind"], "agent")
        self.assertEqual(search_node["config"]["skillKey"], "web_search")
        self.assertEqual(
            search_node["config"]["skillBindings"],
            [
                {
                    "skillKey": "web_search",
                    "outputMapping": {
                        "query": "executed_queries",
                        "source_urls": "source_urls",
                        "artifact_paths": "artifact_paths",
                        "errors": "search_errors",
                    },
                }
            ],
        )
        self.assertNotIn("inputMapping", search_node["config"]["skillBindings"][0])
        self.assertEqual(
            {binding["state"]: binding["mode"] for binding in search_node["writes"]},
            {
                "executed_queries": "append",
                "source_urls": "append",
                "artifact_paths": "append",
                "search_errors": "append",
            },
        )

        condition_node = nodes["should_continue_search"]
        self.assertEqual(condition_node["kind"], "condition")
        self.assertEqual(condition_node["ui"]["size"], {"width": 560, "height": 280})
        self.assertEqual(condition_node["config"]["branches"], ["true", "false", "exhausted"])
        self.assertEqual(condition_node["config"]["loopLimit"], 5)
        self.assertEqual(condition_node["config"]["rule"]["source"], "$state.evidence_review.needs_more_search")
        self.assertEqual(condition_node["config"]["rule"]["operator"], "==")
        self.assertIs(condition_node["config"]["rule"]["value"], True)
        self.assertEqual(condition_node["config"]["branchMapping"], {"true": "true", "false": "false"})
        self.assertEqual(
            template["conditional_edges"],
            [
                {
                    "source": "should_continue_search",
                    "branches": {
                        "true": "run_web_search",
                        "false": "select_evidence",
                        "exhausted": "select_evidence",
                    },
                }
            ],
        )
        self.assertEqual(
            {binding["state"]: binding["mode"] for binding in nodes["review_evidence"]["writes"]},
            {"evidence_review": "replace", "current_query": "replace"},
        )
        self.assertIn("原文地址", nodes["select_evidence"]["config"]["taskInstruction"])
        self.assertIn("网页 URL", nodes["select_evidence"]["config"]["taskInstruction"])
        self.assertNotIn("文件名标识", nodes["select_evidence"]["config"]["taskInstruction"])
        self.assertIn("网页 URL", nodes["final_answer"]["config"]["taskInstruction"])
        self.assertIn("不要引用 doc_001.md", nodes["final_answer"]["config"]["taskInstruction"])
        self.assertNotIn("依据只标文件名", nodes["final_answer"]["config"]["taskInstruction"])
        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            ["output_final"],
        )
        self.assertEqual(nodes["output_final"]["reads"], [{"state": "final_reply", "required": True}])
        self.assertNotIn("output_evidence", nodes)
        self.assertNotIn("output_documents", nodes)
        self.assertNotIn({"source": "final_answer", "target": "output_evidence"}, template["edges"])
        self.assertNotIn({"source": "final_answer", "target": "output_documents"}, template["edges"])

    def test_advanced_web_research_loop_is_runtime_compatible(self) -> None:
        template = next(record for record in _official_template_records() if record["template_id"] == "advanced_web_research_loop")
        payload = {
            key: value
            for key, value in template.items()
            if key not in {"template_id", "label", "description", "default_graph_name", "source"}
        }
        graph = NodeSystemGraphPayload.model_validate(
            {
                **payload,
                "graph_id": "test_advanced_web_research_loop",
                "name": template["default_graph_name"],
            }
        )

        validation = validate_graph(graph)
        self.assertEqual([issue.model_dump() for issue in validation.issues], [])
        self.assertEqual(get_langgraph_runtime_unsupported_reasons(graph), [])

        cycle_tracker = build_langgraph_cycle_tracker(graph, build_execution_edges(graph))
        self.assertTrue(cycle_tracker["has_cycle"])
        self.assertEqual(cycle_tracker["loop_limits_by_source"], {"should_continue_search": 5})

    def test_toograph_skill_creation_workflow_contract(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "toograph_skill_creation_workflow"
        )
        states = template["state_schema"]
        nodes = template["nodes"]

        self.assertEqual(template["metadata"]["graphProtocol"], "node_system")
        self.assertEqual(
            template["metadata"]["interrupt_after"],
            ["ask_clarification", "draft_example_io", "review_generated_skill"],
        )
        self.assertNotIn("agent_breakpoint_timing", template["metadata"])
        self.assertEqual(states["existing_capability"]["type"], "json")
        self.assertEqual(states["existing_capability_found"]["type"], "boolean")
        self.assertEqual(states["capability_gap"]["type"], "json")
        self.assertEqual(states["generated_skill_key"]["type"], "text")
        self.assertEqual(states["generated_skill_json"]["type"], "json")
        self.assertEqual(states["generated_skill_md"]["type"], "markdown")
        self.assertEqual(states["generated_before_llm_py"]["type"], "text")
        self.assertEqual(states["generated_after_llm_py"]["type"], "text")
        self.assertEqual(states["generated_requirements_txt"]["type"], "text")
        self.assertEqual(states["script_test_success"]["type"], "boolean")
        self.assertEqual(states["script_test_result"]["type"], "markdown")
        self.assertFalse(
            {
                "script_test_status",
                "script_test_summary",
                "script_test_source",
                "script_test_stdout",
                "script_test_stderr",
                "script_test_exit_code",
                "script_test_errors",
            }.intersection(states)
        )
        self.assertEqual(states["final_summary"]["type"], "markdown")
        self.assertNotIn("write_approval", states)
        self.assertNotIn("write_decision", states)

        selector_node = nodes["select_existing_capability"]
        self.assertEqual(selector_node["kind"], "agent")
        self.assertEqual(selector_node["config"]["skillKey"], "toograph_capability_selector")
        self.assertEqual(
            selector_node["config"]["skillBindings"],
            [
                {
                    "skillKey": "toograph_capability_selector",
                    "outputMapping": {
                        "capability": "existing_capability",
                        "found": "existing_capability_found",
                    },
                }
            ],
        )
        for node_id in ["review_requirement", "ask_clarification", "merge_clarification", "finalize_no_create"]:
            with self.subTest(capability_context_reader=node_id):
                self.assertNotIn("existing_capability", [read["state"] for read in nodes[node_id]["reads"]])
        self.assertIn(
            {"state": "existing_capability_found", "required": False},
            nodes["review_requirement"]["reads"],
        )

        builder_node = nodes["build_skill_files"]
        self.assertEqual(builder_node["kind"], "agent")
        self.assertEqual(builder_node["config"]["skillKey"], "toograph_skill_builder")
        self.assertEqual(
            builder_node["config"]["skillBindings"],
            [
                {
                    "skillKey": "toograph_skill_builder",
                    "outputMapping": {
                        "skill_key": "generated_skill_key",
                        "skill_json": "generated_skill_json",
                        "skill_md": "generated_skill_md",
                        "before_llm_py": "generated_before_llm_py",
                        "after_llm_py": "generated_after_llm_py",
                        "requirements_txt": "generated_requirements_txt",
                    },
                }
            ],
        )

        tester_node = nodes["run_script_test"]
        self.assertEqual(tester_node["kind"], "agent")
        self.assertEqual(tester_node["config"]["skillKey"], "toograph_script_tester")
        self.assertEqual(
            tester_node["config"]["skillBindings"][0]["outputMapping"],
            {
                "success": "script_test_success",
                "result": "script_test_result",
            },
        )

        executor_nodes = {
            node_id
            for node_id, node in nodes.items()
            if node["kind"] == "agent" and node["config"].get("skillKey") == "local_workspace_executor"
        }
        self.assertEqual(
            executor_nodes,
            {
                "write_skill_json",
                "write_skill_md",
                "write_before_llm_py",
                "write_after_llm_py",
                "write_requirements_txt",
            },
        )
        for node_id in executor_nodes:
            with self.subTest(node_id=node_id):
                self.assertEqual(
                    nodes[node_id]["config"]["skillBindings"][0]["outputMapping"],
                    {
                        "success": f"{node_id}_success",
                        "result": f"{node_id}_result",
                    },
                )
                self.assertEqual(
                    [write["state"] for write in nodes[node_id]["writes"]],
                    [f"{node_id}_success", f"{node_id}_result"],
                )
                self.assertIn("operation 必须是 write", nodes[node_id]["config"]["taskInstruction"])
                self.assertIn("需确认", nodes[node_id]["config"]["taskInstruction"])

        review_node = nodes["review_generated_skill"]
        self.assertNotIn("批准写入", review_node["config"]["taskInstruction"])
        self.assertIn("运行时权限", review_node["config"]["taskInstruction"])
        self.assertIn({"source": "review_generated_skill", "target": "write_skill_json"}, template["edges"])
        self.assertNotIn("review_write_approval", nodes)
        self.assertNotIn("write_approved", nodes)
        self.assertNotIn("finalize_no_write", nodes)

        self.assertEqual(
            nodes["need_clarification"]["config"]["rule"],
            {"source": "$state.requirement_review.needs_clarification", "operator": "==", "value": True},
        )
        self.assertTrue(nodes)
        for node_id, node in nodes.items():
            with self.subTest(node_id=node_id):
                self.assertIsNone(node["ui"].get("size"))

        condition_node_ids = [node_id for node_id, node in nodes.items() if node["kind"] == "condition"]
        self.assertEqual(
            condition_node_ids,
            [
                "need_clarification",
                "should_create_skill",
                "examples_approved",
                "needs_script_test",
                "script_test_passed",
                "has_before_llm",
                "has_after_llm",
                "has_requirements",
            ],
        )
        for node_id in condition_node_ids:
            with self.subTest(condition_node=node_id):
                self.assertEqual(nodes[node_id]["config"]["branches"], ["true", "false", "exhausted"])
                self.assertEqual(nodes[node_id]["config"]["branchMapping"], {"true": "true", "false": "false"})
        self.assertEqual(
            nodes["examples_approved"]["config"]["rule"],
            {"source": "$state.example_decision.approved", "operator": "==", "value": True},
        )
        self.assertEqual(nodes["examples_approved"]["config"]["loopLimit"], 5)
        self.assertEqual(
            nodes["script_test_passed"]["config"]["rule"],
            {"source": "$state.script_test_success", "operator": "==", "value": True},
        )
        self.assertEqual(nodes["script_test_passed"]["config"]["loopLimit"], 3)

        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            ["output_final"],
        )
        self.assertEqual(nodes["output_final"]["reads"], [{"state": "final_summary", "required": True}])

    def test_toograph_skill_creation_workflow_is_runtime_compatible(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "toograph_skill_creation_workflow"
        )
        payload = {
            key: value
            for key, value in template.items()
            if key not in {"template_id", "label", "description", "default_graph_name", "source"}
        }
        graph = NodeSystemGraphPayload.model_validate(
            {
                **payload,
                "graph_id": "test_toograph_skill_creation_workflow",
                "name": template["default_graph_name"],
            }
        )

        validation = validate_graph(graph)
        self.assertEqual([issue.model_dump() for issue in validation.issues], [])
        self.assertEqual(get_langgraph_runtime_unsupported_reasons(graph), [])

        cycle_tracker = build_langgraph_cycle_tracker(graph, build_execution_edges(graph))
        self.assertTrue(cycle_tracker["has_cycle"])
        self.assertEqual(
            cycle_tracker["loop_limits_by_source"],
            {"examples_approved": 5, "script_test_passed": 3},
        )

    def test_buddy_autonomous_loop_contract(self) -> None:
        template = next(record for record in _official_template_records() if record["template_id"] == "buddy_autonomous_loop")
        states = template["state_schema"]
        nodes = template["nodes"]

        self.assertEqual(template["metadata"]["graphProtocol"], "node_system")
        self.assertEqual(template["metadata"]["origin"], "buddy")
        self.assertEqual(states["buddy_context"]["type"], "file")
        self.assertEqual(states["selected_capability"]["type"], "capability")
        self.assertEqual(states["capability_found"]["type"], "boolean")
        self.assertEqual(states["capability_result"]["type"], "result_package")
        self.assertEqual(states["capability_selection_audit"]["type"], "json")
        self.assertEqual(states["capability_gap"]["type"], "json")
        self.assertEqual(states["capability_trace"]["type"], "json")
        self.assertEqual(states["visible_reply"]["type"], "markdown")
        self.assertEqual(states["final_reply"]["type"], "markdown")
        self.assertNotIn("approval_prompt", states)
        self.assertNotIn("capability_requires_approval", states)

        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "subgraph"],
            [
                "intake_request",
                "run_capability_cycle",
                "draft_final_response",
            ],
        )
        self.assertEqual([node_id for node_id, node in nodes.items() if node["kind"] == "output"], ["output_final"])
        self.assertEqual(nodes["output_final"]["reads"], [{"state": "final_reply", "required": True}])
        self.assertIn("needs_capability", nodes)
        self.assertEqual(nodes["needs_capability"]["kind"], "condition")
        self.assertEqual(
            nodes["needs_capability"]["config"]["rule"],
            {"source": "$state.request_understanding.requires_capability", "operator": "==", "value": True},
        )
        self.assertIn({"source": "draft_final_response", "target": "output_final"}, template["edges"])
        self.assertNotIn({"source": "draft_final_response", "target": "review_buddy_memory"}, template["edges"])
        self.assertNotIn("review_buddy_memory", nodes)
        self.assertEqual(
            template["conditional_edges"],
            [
                {
                    "source": "needs_capability",
                    "branches": {
                        "true": "run_capability_cycle",
                        "false": "draft_final_response",
                        "exhausted": "draft_final_response",
                    },
                }
            ],
        )
        for node_id, node in nodes.items():
            with self.subTest(top_level_node=node_id):
                self.assertIsNone(node["ui"].get("size"))

        self.assertNotIn("pack_context", nodes)
        buddy_context_node = nodes["input_buddy_context"]
        self.assertEqual(buddy_context_node["kind"], "input")
        self.assertEqual(buddy_context_node["config"]["boundaryType"], "file")
        self.assertEqual(buddy_context_node["config"]["value"]["kind"], "local_folder")
        self.assertEqual(buddy_context_node["config"]["value"]["root"], "buddy_home")
        self.assertEqual(
            buddy_context_node["config"]["value"]["selected"],
            ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md", "policy.json"],
        )

        intake_graph = nodes["intake_request"]["config"]["graph"]
        self.assertEqual(intake_graph["metadata"]["interrupt_after"], ["ask_clarification"])
        self.assertEqual(intake_graph["metadata"]["role"], "buddy_request_intake")
        self.assertEqual(intake_graph["state_schema"]["visible_reply"]["type"], "markdown")
        self.assertEqual(intake_graph["state_schema"]["clarification_answer"]["type"], "markdown")
        self.assertNotIn({"state": "buddy_context", "required": True}, nodes["intake_request"]["reads"])
        self.assertNotIn({"source": "input_buddy_context", "target": "intake_request"}, template["edges"])
        self.assertEqual(nodes["intake_request"]["writes"][0], {"state": "visible_reply", "mode": "replace"})
        intake_output_boundaries = [
            node["reads"][0]["state"]
            for node in intake_graph["nodes"].values()
            if node["kind"] == "output"
        ]
        self.assertEqual(
            intake_output_boundaries,
            [write["state"] for write in nodes["intake_request"]["writes"]],
        )
        understand_node = intake_graph["nodes"]["understand_request"]
        self.assertNotIn({"state": "buddy_context", "required": True}, understand_node["reads"])
        self.assertNotIn({"source": "input_buddy_context", "target": "understand_request"}, intake_graph["edges"])
        self.assertEqual(understand_node["writes"][0], {"state": "visible_reply", "mode": "replace"})
        self.assertEqual(understand_node["config"]["thinkingMode"], "low")
        self.assertIn("visible_reply", understand_node["config"]["taskInstruction"])
        self.assertIn("output_visible_reply", intake_graph["nodes"])
        self.assertEqual(intake_graph["nodes"]["output_visible_reply"]["reads"], [{"state": "visible_reply", "required": False}])
        self.assertEqual(
            intake_graph["nodes"]["need_clarification"]["config"]["rule"],
            {"source": "$state.request_understanding.needs_clarification", "operator": "==", "value": True},
        )
        ask_clarification_node = intake_graph["nodes"]["ask_clarification"]
        self.assertEqual(ask_clarification_node["writes"], [{"state": "clarification_prompt", "mode": "replace"}])
        self.assertNotIn({"state": "clarification_answer", "required": True}, ask_clarification_node["reads"])
        merge_clarification_node = intake_graph["nodes"]["merge_clarification"]
        self.assertIn({"state": "clarification_answer", "required": True}, merge_clarification_node["reads"])

        cycle_graph = nodes["run_capability_cycle"]["config"]["graph"]
        self.assertEqual(cycle_graph["metadata"].get("interrupt_after", []), [])
        selector_node = cycle_graph["nodes"]["select_capability"]
        self.assertEqual(selector_node["config"]["skillKey"], "toograph_capability_selector")
        self.assertEqual(
            selector_node["config"]["skillBindings"],
            [
                {
                    "skillKey": "toograph_capability_selector",
                    "outputMapping": {
                        "capability": "selected_capability",
                        "found": "capability_found",
                        "audit": "capability_selection_audit",
                    },
                }
            ],
        )
        self.assertIn({"state": "capability_selection_audit", "mode": "replace"}, selector_node["writes"])
        for removed_node_id in [
            "review_capability_permission",
            "needs_capability_approval",
            "request_capability_approval",
            "review_approval_decision",
            "approval_granted",
            "review_denied_capability",
        ]:
            self.assertNotIn(removed_node_id, cycle_graph["nodes"])
        execute_node = cycle_graph["nodes"]["execute_capability"]
        self.assertEqual(execute_node["config"]["skillKey"], "")
        self.assertIn({"state": "selected_capability", "required": True}, execute_node["reads"])
        self.assertEqual(execute_node["writes"], [{"state": "capability_result", "mode": "replace"}])
        self.assertEqual(cycle_graph["state_schema"]["capability_result"]["type"], "result_package")
        self.assertEqual(cycle_graph["state_schema"]["capability_selection_audit"]["type"], "json")
        self.assertEqual(cycle_graph["state_schema"]["capability_gap"]["type"], "json")
        self.assertEqual(cycle_graph["state_schema"]["capability_trace"]["type"], "json")
        self.assertEqual(
            cycle_graph["nodes"]["output_capability_selection_audit"]["reads"],
            [{"state": "capability_selection_audit", "required": False}],
        )
        missing_node = cycle_graph["nodes"]["review_missing_capability"]
        self.assertIn({"state": "capability_gap", "mode": "replace"}, missing_node["writes"])
        self.assertIn("should_offer_build", missing_node["config"]["taskInstruction"])
        review_node = cycle_graph["nodes"]["review_capability_result"]
        self.assertIn({"state": "capability_trace", "mode": "append"}, review_node["writes"])
        self.assertEqual(cycle_graph["nodes"]["continue_capability_loop"]["config"]["loopLimit"], 3)
        self.assertEqual(
            cycle_graph["conditional_edges"][0],
            {
                "source": "capability_found_condition",
                "branches": {
                    "true": "execute_capability",
                    "false": "review_missing_capability",
                    "exhausted": "review_missing_capability",
                },
            },
        )
        self.assertNotIn("output_approval_prompt", cycle_graph["nodes"])

        draft_graph = nodes["draft_final_response"]["config"]["graph"]
        self.assertEqual([node_id for node_id, node in draft_graph["nodes"].items() if node["kind"] == "output"], ["output_final_reply"])
        self.assertEqual(draft_graph["nodes"]["draft_final_reply"]["config"]["thinkingMode"], "low")
        self.assertEqual(draft_graph["nodes"]["output_final_reply"]["reads"], [{"state": "final_reply", "required": True}])

    def test_buddy_autonomous_review_template_contract(self) -> None:
        template = load_template_record("buddy_autonomous_review")
        states = template["state_schema"]
        nodes = template["nodes"]

        self.assertEqual(template["metadata"]["graphProtocol"], "node_system")
        self.assertEqual(template["metadata"]["origin"], "buddy")
        self.assertEqual(template["metadata"]["role"], "buddy_autonomous_review")
        self.assertIs(template["metadata"]["internal"], True)
        self.assertEqual(template["label"], "自主复盘")
        self.assertEqual(states["final_reply"]["type"], "markdown")
        self.assertEqual(states["autonomous_review"]["type"], "json")
        self.assertEqual(states["writeback_commands"]["type"], "json")
        self.assertEqual(states["writeback_result"]["type"], "markdown")
        self.assertEqual(states["writeback_revisions"]["type"], "json")
        self.assertEqual([node_id for node_id, node in nodes.items() if node["kind"] == "subgraph"], [])
        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            ["output_autonomous_review", "output_writeback_result", "output_writeback_revisions"],
        )
        self.assertEqual(nodes["decide_autonomous_review"]["kind"], "agent")
        self.assertEqual(nodes["decide_autonomous_review"]["config"]["thinkingMode"], "low")
        self.assertEqual(nodes["should_write_buddy_home"]["kind"], "condition")
        self.assertEqual(
            nodes["should_write_buddy_home"]["config"]["rule"],
            {"source": "$state.autonomous_review.should_write", "operator": "==", "value": True},
        )
        writer_node = nodes["apply_buddy_home_writeback"]
        self.assertEqual(writer_node["kind"], "agent")
        self.assertEqual(writer_node["config"]["skillKey"], "buddy_home_writer")
        self.assertEqual(
            writer_node["config"]["skillBindings"],
            [
                {
                    "skillKey": "buddy_home_writer",
                    "outputMapping": {
                        "success": "writeback_success",
                        "result": "writeback_result",
                        "applied_commands": "applied_writeback_commands",
                        "skipped_commands": "skipped_writeback_commands",
                        "revisions": "writeback_revisions",
                    },
                }
            ],
        )
        self.assertIn({"source": "decide_autonomous_review", "target": "should_write_buddy_home"}, template["edges"])
        self.assertEqual(
            template["conditional_edges"],
            [
                {
                    "source": "should_write_buddy_home",
                    "branches": {
                        "true": "apply_buddy_home_writeback",
                        "false": "output_autonomous_review",
                        "exhausted": "output_autonomous_review",
                    },
                }
            ],
        )

        graph = NodeSystemGraphPayload.model_validate(
            {
                **{
                    key: value
                    for key, value in template.items()
                    if key not in {"template_id", "label", "description", "default_graph_name", "source"}
                },
                "graph_id": "test_buddy_autonomous_review",
                "name": template["default_graph_name"],
            }
        )
        validation = validate_graph(graph)
        self.assertEqual([issue.model_dump() for issue in validation.issues], [])
        self.assertEqual(get_langgraph_runtime_unsupported_reasons(graph), [])

    def test_buddy_autonomous_loop_is_runtime_compatible(self) -> None:
        template = next(record for record in _official_template_records() if record["template_id"] == "buddy_autonomous_loop")
        payload = {
            key: value
            for key, value in template.items()
            if key not in {"template_id", "label", "description", "default_graph_name", "source"}
        }
        graph = NodeSystemGraphPayload.model_validate(
            {
                **payload,
                "graph_id": "test_buddy_autonomous_loop",
                "name": template["default_graph_name"],
            }
        )

        validation = validate_graph(graph)
        self.assertEqual([issue.model_dump() for issue in validation.issues], [])
        self.assertEqual(get_langgraph_runtime_unsupported_reasons(graph), [])


if __name__ == "__main__":
    unittest.main()
