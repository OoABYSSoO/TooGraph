from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.node_system import NodeSystemInputNode, NodeSystemTemplate
from app.templates.loader import list_template_records


NODE_WIDTH_BY_KIND = {
    "condition": 560,
}
DEFAULT_NODE_WIDTH = 460
NODE_HEIGHT_BY_KIND = {
    "input": 320,
    "agent": 460,
    "output": 400,
    "condition": 380,
}
NODE_GUTTER = 32


def _resolve_node_width(node_kind: str) -> int:
    return NODE_WIDTH_BY_KIND.get(node_kind, DEFAULT_NODE_WIDTH)


def _resolve_node_height(node_kind: str) -> int:
    return NODE_HEIGHT_BY_KIND.get(node_kind, 360)


def _rectangles_overlap_with_gutter(left: dict, right: dict) -> bool:
    left_x = left["x"]
    left_y = left["y"]
    left_right = left_x + left["width"]
    left_bottom = left_y + left["height"]

    right_x = right["x"]
    right_y = right["y"]
    right_right = right_x + right["width"]
    right_bottom = right_y + right["height"]

    horizontal_overlap = left_x < right_right + NODE_GUTTER and right_x < left_right + NODE_GUTTER
    vertical_overlap = left_y < right_bottom + NODE_GUTTER and right_y < left_bottom + NODE_GUTTER
    return horizontal_overlap and vertical_overlap


class TemplateLayoutTests(unittest.TestCase):
    def test_templates_use_neutral_state_keys(self):
        failures: list[str] = []

        for record in list_template_records():
            template = NodeSystemTemplate.model_validate(record)
            for index, state_key in enumerate(template.state_schema.keys(), start=1):
                expected_key = f"state_{index}"
                if state_key != expected_key:
                    failures.append(f"{template.template_id}: expected {expected_key}, got {state_key}")

        self.assertEqual(failures, [], "\n".join(failures))

    def test_templates_have_non_overlapping_initial_node_layouts(self):
        failures: list[str] = []

        for record in list_template_records():
            template = NodeSystemTemplate.model_validate(record)
            rectangles = []
            for node_id, node in template.nodes.items():
                rectangles.append(
                    {
                        "node_id": node_id,
                        "kind": node.kind,
                        "x": node.ui.position.x,
                        "y": node.ui.position.y,
                        "width": _resolve_node_width(node.kind),
                        "height": _resolve_node_height(node.kind),
                    }
                )

            for index, left in enumerate(rectangles):
                for right in rectangles[index + 1 :]:
                    if _rectangles_overlap_with_gutter(left, right):
                        failures.append(
                            f"{template.template_id}: {left['node_id']} overlaps {right['node_id']}"
                        )

        self.assertEqual(failures, [], "\n".join(failures))

    def test_hello_world_template_writes_multiple_language_greetings(self):
        template = next(
            NodeSystemTemplate.model_validate(record)
            for record in list_template_records()
            if record["template_id"] == "hello_world"
        )

        state_names = [definition.name for definition in template.state_schema.values()]
        self.assertEqual(state_names, ["name", "greeting_zh", "greeting_en", "greeting_ja"])
        self.assertEqual(
            [binding.state for binding in template.nodes["greeting_agent"].writes],
            ["state_2", "state_3", "state_4"],
        )
        self.assertEqual(
            {node_id for node_id, node in template.nodes.items() if node.kind == "output"},
            {"output_greeting_zh", "output_greeting_en", "output_greeting_ja"},
        )

    def test_condition_templates_use_current_proxy_branch_shape(self):
        failures: list[str] = []
        expected_branches = ["true", "false", "exhausted"]

        for record in list_template_records():
            template = NodeSystemTemplate.model_validate(record)
            conditional_edges_by_source = {edge.source: edge for edge in template.conditional_edges}

            for node_id, node in template.nodes.items():
                if node.kind != "condition":
                    continue

                if node.writes:
                    failures.append(f"{template.template_id}.{node_id}: condition nodes should not write state")
                if node.config.branches != expected_branches:
                    failures.append(
                        f"{template.template_id}.{node_id}: branches should be {expected_branches}, got {node.config.branches}"
                    )
                if node.config.branch_mapping.get("true") != "true":
                    failures.append(f"{template.template_id}.{node_id}: true mapping should target true")
                if node.config.branch_mapping.get("false") != "false":
                    failures.append(f"{template.template_id}.{node_id}: false mapping should target false")

                conditional_edge = conditional_edges_by_source.get(node_id)
                if conditional_edge is None:
                    failures.append(f"{template.template_id}.{node_id}: missing conditional_edges entry")
                    continue
                if list(conditional_edge.branches.keys()) != expected_branches:
                    failures.append(
                        f"{template.template_id}.{node_id}: conditional edge keys should be {expected_branches}, "
                        f"got {list(conditional_edge.branches.keys())}"
                    )

        self.assertEqual(failures, [], "\n".join(failures))

    def test_human_review_template_keeps_feedback_in_review_panel(self):
        template = next(
            NodeSystemTemplate.model_validate(record)
            for record in list_template_records()
            if record["template_id"] == "human_review_demo"
        )

        human_feedback_key = next(
            (
                state_key
                for state_key, definition in template.state_schema.items()
                if definition.name == "human_feedback"
            ),
            None,
        )
        self.assertIsNotNone(human_feedback_key)
        self.assertIn("revision_writer", template.nodes)
        self.assertIn(
            human_feedback_key,
            [binding.state for binding in template.nodes["revision_writer"].reads],
        )

        input_feedback_writers = [
            node_id
            for node_id, node in template.nodes.items()
            if isinstance(node, NodeSystemInputNode)
            for binding in node.writes
            if binding.state == human_feedback_key
        ]
        self.assertEqual(
            input_feedback_writers,
            [],
            "Human review feedback should be edited from the review panel after pause, not from an Input node.",
        )

    def test_web_research_loop_template_models_generic_search_retry_flow(self):
        template = next(
            NodeSystemTemplate.model_validate(record)
            for record in list_template_records()
            if record["template_id"] == "web_research_loop"
        )

        state_by_name = {
            definition.name: state_key
            for state_key, definition in template.state_schema.items()
        }

        self.assertEqual(template.default_graph_name, "联网研究循环")
        self.assertEqual(
            template.state_schema[state_by_name["request"]].value,
            "调研一个需要联网确认的问题，并给出带引用的中文答案",
        )
        self.assertEqual(
            template.nodes["input_request"].config.value,
            "调研一个需要联网确认的问题，并给出带引用的中文答案",
        )
        serialized_template = json.dumps(template.model_dump(mode="json"), ensure_ascii=False)
        self.assertNotIn("GPT-5.5", serialized_template)
        self.assertNotIn("模型亮点", serialized_template)
        self.assertNotIn("只返回 JSON", serialized_template)
        self.assertNotIn("严格返回 JSON", serialized_template)
        self.assertIn("plan_search_query", template.nodes)
        self.assertIn("web_search_agent", template.nodes)
        self.assertIn("assess_search_sufficiency", template.nodes)
        self.assertIn("need_more_search_check", template.nodes)
        self.assertIn("output_evidence_links", template.nodes)
        self.assertIn("output_source_documents", template.nodes)
        self.assertNotIn("final_answer_writer", template.nodes)
        self.assertNotIn("exhausted_answer_writer", template.nodes)
        self.assertIn("output_final_answer", template.nodes)
        self.assertIn("output_exhausted_answer", template.nodes)

        planner = template.nodes["plan_search_query"]
        self.assertNotIn("Runtime Context", planner.config.task_instruction)
        self.assertNotIn("current_date", planner.config.task_instruction)
        self.assertNotIn("current_year", planner.config.task_instruction)
        self.assertIn(state_by_name["research_notes"], [binding.state for binding in planner.reads])
        self.assertIn(state_by_name["next_search_focus"], [binding.state for binding in planner.reads])

        search_node = template.nodes["web_search_agent"]
        self.assertEqual(search_node.config.skills, ["web_search"])
        self.assertEqual(len(search_node.config.skill_bindings), 1)
        self.assertEqual(search_node.config.skill_bindings[0].skill_key, "web_search")
        self.assertEqual(
            search_node.config.skill_bindings[0].input_mapping,
            {"query": state_by_name["search_query"]},
        )
        self.assertEqual(
            search_node.config.skill_bindings[0].output_mapping,
            {
                "citations": state_by_name["evidence_links"],
                "source_documents": state_by_name["source_documents"],
            },
        )
        self.assertEqual(search_node.config.skill_bindings[0].config.get("fetch_pages"), "true")
        self.assertEqual(search_node.config.skill_bindings[0].config.get("max_pages"), 5)
        search_writes = {binding.state: binding.mode.value for binding in search_node.writes}
        self.assertEqual(search_writes[state_by_name["evidence_links"]], "append")
        self.assertEqual(search_writes[state_by_name["source_documents"]], "append")

        assessor = template.nodes["assess_search_sufficiency"]
        self.assertIn(state_by_name["evidence_links"], [binding.state for binding in assessor.reads])
        self.assertIn(state_by_name["research_notes"], [binding.state for binding in assessor.reads])
        self.assertIn(state_by_name["source_documents"], [binding.state for binding in assessor.reads])
        self.assertNotIn(state_by_name["evidence_links"], [binding.state for binding in assessor.writes])
        self.assertNotIn(state_by_name["source_documents"], [binding.state for binding in assessor.writes])
        self.assertIn(state_by_name["research_notes"], [binding.state for binding in assessor.writes])
        self.assertIn(state_by_name["needs_more_search"], [binding.state for binding in assessor.writes])
        self.assertIn(state_by_name["next_search_focus"], [binding.state for binding in assessor.writes])
        self.assertNotIn(state_by_name["search_query"], [binding.state for binding in assessor.writes])
        self.assertIn(state_by_name["final_answer"], [binding.state for binding in assessor.writes])
        self.assertIn(state_by_name["exhausted_answer"], [binding.state for binding in assessor.writes])

        evidence_output = template.nodes["output_evidence_links"]
        self.assertEqual(evidence_output.reads[0].state, state_by_name["evidence_links"])
        self.assertEqual(evidence_output.config.display_mode.value, "json")
        self.assertIn(
            ("assess_search_sufficiency", "output_evidence_links"),
            [(edge.source, edge.target) for edge in template.edges],
        )

        source_output = template.nodes["output_source_documents"]
        self.assertEqual(source_output.reads[0].state, state_by_name["source_documents"])
        self.assertEqual(source_output.config.display_mode.value, "documents")
        self.assertIn(
            ("assess_search_sufficiency", "output_source_documents"),
            [(edge.source, edge.target) for edge in template.edges],
        )

        condition = template.nodes["need_more_search_check"]
        self.assertEqual(condition.config.loop_limit, 3)
        self.assertEqual(condition.config.rule.source, state_by_name["needs_more_search"])
        self.assertEqual(condition.config.rule.operator.value, "==")
        self.assertEqual(condition.config.rule.value, True)

        conditional_edge = next(edge for edge in template.conditional_edges if edge.source == "need_more_search_check")
        self.assertEqual(
            conditional_edge.branches,
            {
                "true": "plan_search_query",
                "false": "output_final_answer",
                "exhausted": "output_exhausted_answer",
            },
        )
