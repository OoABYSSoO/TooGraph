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
from app.templates.loader import list_template_records


def _official_template_records() -> list[dict]:
    return [record for record in list_template_records() if record.get("source") == "official"]


class TemplateLayoutTests(unittest.TestCase):
    def test_builtin_template_registry_contains_official_templates(self) -> None:
        records = _official_template_records()

        self.assertEqual(
            [record["template_id"] for record in records],
            ["advanced_web_research_loop", "create_user_skill"],
        )
        templates = {record["template_id"]: record for record in records}
        research_template = templates["advanced_web_research_loop"]
        self.assertEqual(research_template["source"], "official")
        self.assertEqual(research_template["label"], "高级联网搜索")
        self.assertEqual(research_template["default_graph_name"], "高级联网搜索")
        self.assertIn("多轮搜索", research_template["description"])
        skill_template = templates["create_user_skill"]
        self.assertEqual(skill_template["source"], "official")
        self.assertEqual(skill_template["label"], "创建自定义技能")
        self.assertEqual(skill_template["default_graph_name"], "创建自定义技能")
        self.assertIn("GraphiteUI Skill", skill_template["description"])

    def test_advanced_web_research_loop_contract(self) -> None:
        template = next(record for record in _official_template_records() if record["template_id"] == "advanced_web_research_loop")
        states = template["state_schema"]
        nodes = template["nodes"]

        self.assertEqual(states["artifact_paths"]["type"], "file")
        self.assertTrue(states["artifact_paths"]["promptVisible"])
        self.assertEqual(states["source_urls"]["type"], "json")
        self.assertFalse(states["source_urls"]["promptVisible"])
        self.assertEqual(states["final_reply"]["type"], "markdown")

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

    def test_create_user_skill_template_contract(self) -> None:
        template = next(record for record in _official_template_records() if record["template_id"] == "create_user_skill")
        states = template["state_schema"]
        nodes = template["nodes"]

        self.assertEqual(states["skill_idea"]["type"], "markdown")
        self.assertEqual(states["generated_skill_files"]["type"], "json")
        self.assertEqual(states["test_status"]["type"], "text")
        self.assertEqual(states["final_skill_path"]["type"], "file")
        self.assertFalse(states["existing_skill_catalog"]["promptVisible"])
        self.assertFalse(states["builder_result"]["promptVisible"])
        self.assertFalse(states["repair_attempt_count"]["promptVisible"])

        metadata = template["metadata"]
        self.assertEqual(
            metadata["interrupt_after"],
            ["clarify_requirements", "draft_examples", "design_skill", "review_failed_repairs"],
        )
        self.assertEqual(metadata["agent_breakpoint_timing"]["clarify_requirements"], "after")
        self.assertEqual(metadata["maxRepairAttempts"], 3)
        self.assertEqual(metadata["interrupt_after"][:3], ["clarify_requirements", "draft_examples", "design_skill"])

        inspect_node = nodes["inspect_existing_skills"]
        self.assertEqual(inspect_node["config"]["skillKey"], "graphiteUI_skill_builder")
        self.assertEqual(inspect_node["config"]["skillBindings"][0]["outputMapping"]["skill_catalog"], "existing_skill_catalog")

        build_node = nodes["write_skill_package"]
        self.assertEqual(build_node["config"]["skillKey"], "graphiteUI_skill_builder")
        self.assertEqual(build_node["config"]["skillBindings"][0]["outputMapping"]["test_status"], "test_status")
        self.assertIn("backend/data/skills/user", build_node["config"]["taskInstruction"])

        repair_condition = nodes["should_repair"]
        self.assertEqual(repair_condition["kind"], "condition")
        self.assertEqual(repair_condition["config"]["loopLimit"], 3)
        self.assertEqual(repair_condition["config"]["rule"]["source"], "$state.test_status")
        self.assertEqual(repair_condition["config"]["rule"]["operator"], "!=")
        self.assertEqual(repair_condition["config"]["rule"]["value"], "succeeded")
        self.assertEqual(
            template["conditional_edges"],
            [
                {
                    "source": "should_accept_examples",
                    "branches": {
                        "true": "design_skill",
                        "false": "draft_examples",
                        "exhausted": "design_skill",
                    },
                },
                {
                    "source": "should_accept_design",
                    "branches": {
                        "true": "generate_skill_files",
                        "false": "design_skill",
                        "exhausted": "generate_skill_files",
                    },
                },
                {
                    "source": "should_repair",
                    "branches": {
                        "true": "repair_skill_files",
                        "false": "summarize_success",
                        "exhausted": "review_failed_repairs",
                    },
                },
                {
                    "source": "should_continue_after_review",
                    "branches": {
                        "true": "repair_skill_files",
                        "false": "summarize_failure",
                        "exhausted": "summarize_failure",
                    },
                },
            ],
        )

    def test_create_user_skill_template_is_runtime_compatible(self) -> None:
        template = next(record for record in _official_template_records() if record["template_id"] == "create_user_skill")
        payload = {
            key: value
            for key, value in template.items()
            if key not in {"template_id", "label", "description", "default_graph_name", "source"}
        }
        graph = NodeSystemGraphPayload.model_validate(
            {
                **payload,
                "graph_id": "test_create_user_skill",
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
            {
                "should_accept_examples": 3,
                "should_accept_design": 3,
                "should_repair": 3,
                "should_continue_after_review": 3,
            },
        )


if __name__ == "__main__":
    unittest.main()
