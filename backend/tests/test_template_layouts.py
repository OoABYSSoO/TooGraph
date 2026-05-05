from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.compiler.validator import validate_graph
from app.core.langgraph.compiler import get_langgraph_runtime_unsupported_reasons
from app.core.schemas.node_system import NodeSystemGraphDocument, NodeSystemInputNode, NodeSystemTemplate
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

    def test_templates_are_valid_runtime_graphs(self):
        failures: list[str] = []

        for record in list_template_records():
            template = NodeSystemTemplate.model_validate(record)
            graph = template.model_dump(mode="json", by_alias=True)
            graph["graph_id"] = f"template_{template.template_id}"
            graph["name"] = template.default_graph_name
            graph.pop("template_id", None)
            graph.pop("label", None)
            graph.pop("description", None)
            graph.pop("default_graph_name", None)
            validation = validate_graph(NodeSystemGraphDocument.model_validate(graph))
            if not validation.valid:
                issues = "; ".join(f"{issue.code}:{issue.path}" for issue in validation.issues)
                failures.append(f"{template.template_id}: {issues}")

        self.assertEqual(failures, [], "\n".join(failures))

    def test_game_ad_creative_factory_does_not_shortcut_downstream_agents(self):
        template = next(
            NodeSystemTemplate.model_validate(record)
            for record in list_template_records()
            if record["template_id"] == "game_ad_creative_factory"
        )

        edge_pairs = {(edge.source, edge.target) for edge in template.edges}
        self.assertNotIn(("input_creative_goal", "build_creative_brief"), edge_pairs)
        self.assertNotIn(("input_variants_count", "generate_creative_package"), edge_pairs)

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

    def test_poem_generator_template_writes_four_language_poems(self):
        template = next(
            NodeSystemTemplate.model_validate(record)
            for record in list_template_records()
            if record["template_id"] == "poem_generator"
        )

        state_names = [definition.name for definition in template.state_schema.values()]
        self.assertEqual(state_names, ["theme", "poem_zh", "poem_en", "poem_ja", "poem_fr"])
        self.assertEqual(
            [binding.state for binding in template.nodes["poem_agent"].writes],
            ["state_2", "state_3", "state_4", "state_5"],
        )
        self.assertEqual(
            {node_id for node_id, node in template.nodes.items() if node.kind == "output"},
            {"output_poem_zh", "output_poem_en", "output_poem_ja", "output_poem_fr"},
        )
        self.assertIn("100", template.nodes["poem_agent"].config.task_instruction)

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

    def test_companion_chat_loop_is_advisory_only(self):
        template = next(
            NodeSystemTemplate.model_validate(record)
            for record in list_template_records()
            if record["template_id"] == "companion_chat_loop"
        )
        state_by_name = {
            definition.name: state_key
            for state_key, definition in template.state_schema.items()
        }

        self.assertEqual(template.state_schema[state_by_name["companion_mode"]].value, "advisory")
        self.assertEqual(template.nodes["input_companion_mode"].config.value, "advisory")
        self.assertIn(
            state_by_name["companion_mode"],
            [binding.state for binding in template.nodes["companion_reply_agent"].reads],
        )
        self.assertEqual(template.nodes["companion_reply_agent"].config.skills, [])
        self.assertEqual(template.nodes["companion_reply_agent"].config.skill_bindings, [])
        self.assertIn("第一档", template.nodes["companion_reply_agent"].config.task_instruction)
        self.assertIn("不能修改图", template.nodes["companion_reply_agent"].config.task_instruction)

    def test_companion_agentic_tool_loop_template_models_dynamic_skill_decision_flow(self):
        template = next(
            NodeSystemTemplate.model_validate(record)
            for record in list_template_records()
            if record["template_id"] == "companion_agentic_tool_loop"
        )

        state_by_name = {
            definition.name: state_key
            for state_key, definition in template.state_schema.items()
        }

        self.assertEqual(template.default_graph_name, "桌宠自主工具循环")
        for state_name in [
            "user_message",
            "conversation_history",
            "page_context",
            "companion_profile",
            "companion_policy",
            "companion_memory_context",
            "intent_plan",
            "skill_catalog_snapshot",
            "required_capability",
            "needs_tool",
            "decision",
            "next_action",
            "allowed_skills",
            "requires_approval",
            "permission_request",
            "approval_prompt",
            "approval_granted",
            "missing_skill_proposal",
            "proposed_tool_input",
            "tool_input",
            "query",
            "tool_result",
            "tool_assessment",
            "needs_more_tools",
            "direct_reply",
            "denied_reply",
            "final_reply",
            "companion_session_summary",
            "companion_profile_json",
            "companion_policy_json",
            "companion_memories_json",
            "companion_session_summary_json",
            "companion_profile_next",
            "companion_policy_next",
            "companion_memories_next",
            "companion_session_summary_next",
            "companion_memory_update_result",
            "companion_profile_write_result",
            "companion_policy_write_result",
            "companion_memories_write_result",
            "companion_session_summary_write_result",
        ]:
            self.assertIn(state_name, state_by_name)

        self.assertEqual(template.state_schema[state_by_name["allowed_skills"]].type.value, "skill")
        self.assertEqual(template.state_schema[state_by_name["allowed_skills"]].value, [])
        skill_catalog = template.state_schema[state_by_name["skill_catalog_snapshot"]].value
        web_search = next(item for item in skill_catalog if item["skillKey"] == "web_search")
        self.assertTrue(web_search["runPolicies"]["origins"]["companion"]["autoSelectable"])
        self.assertFalse(web_search["runPolicies"]["origins"]["companion"]["requiresApproval"])

        self.assertIn("intent_planner", template.nodes)
        self.assertIn("decide_next_skill", template.nodes)
        self.assertIn("request_approval_agent", template.nodes)
        self.assertIn("approval_granted_check", template.nodes)
        self.assertIn("tool_execution_agent", template.nodes)
        self.assertIn("assess_tool_result", template.nodes)
        self.assertIn("continue_tool_loop_check", template.nodes)
        self.assertIn("read_companion_profile", template.nodes)
        self.assertIn("read_companion_policy", template.nodes)
        self.assertIn("read_companion_memories", template.nodes)
        self.assertIn("read_companion_session_summary", template.nodes)
        self.assertIn("curate_companion_memory", template.nodes)
        self.assertIn("write_companion_profile", template.nodes)
        self.assertIn("write_companion_policy", template.nodes)
        self.assertIn("write_companion_memories", template.nodes)
        self.assertIn("write_companion_session_summary", template.nodes)
        self.assertNotIn("input_companion_profile", template.nodes)
        self.assertNotIn("input_companion_policy", template.nodes)
        self.assertNotIn("input_companion_memory_context", template.nodes)
        self.assertEqual(template.metadata.get("interrupt_after"), ["request_approval_agent"])

        decision_node = template.nodes["decide_next_skill"]
        self.assertEqual(decision_node.config.skills, ["autonomous_decision"])
        self.assertEqual(len(decision_node.config.skill_bindings), 1)
        decision_binding = decision_node.config.skill_bindings[0]
        self.assertEqual(decision_binding.skill_key, "autonomous_decision")
        self.assertEqual(
            decision_binding.input_mapping,
            {
                "user_message": state_by_name["user_message"],
                "intent": state_by_name["intent_plan"],
                "required_capability": state_by_name["required_capability"],
                "needs_tool": state_by_name["needs_tool"],
                "skill_catalog": state_by_name["skill_catalog_snapshot"],
                "proposed_tool_input": state_by_name["proposed_tool_input"],
            },
        )
        self.assertEqual(decision_binding.config.get("run_origin"), "companion")
        self.assertEqual(
            decision_binding.output_mapping,
            {
                "decision": state_by_name["decision"],
                "next_action": state_by_name["next_action"],
                "selected_skill": state_by_name["allowed_skills"],
                "requires_approval": state_by_name["requires_approval"],
                "permission_request": state_by_name["permission_request"],
                "missing_skill_proposal": state_by_name["missing_skill_proposal"],
                "tool_input": state_by_name["tool_input"],
            },
        )

        tool_executor = template.nodes["tool_execution_agent"]
        self.assertEqual(tool_executor.config.skills, [])
        self.assertEqual(tool_executor.config.skill_bindings, [])
        self.assertIn(state_by_name["allowed_skills"], [binding.state for binding in tool_executor.reads])
        self.assertIn(state_by_name["query"], [binding.state for binding in tool_executor.reads])
        self.assertIn(state_by_name["tool_input"], [binding.state for binding in tool_executor.reads])
        self.assertIn(state_by_name["tool_result"], [binding.state for binding in tool_executor.writes])

        self.assertIn(state_by_name["final_reply"], [binding.state for binding in template.nodes["compose_direct_reply"].writes])
        self.assertIn(state_by_name["final_reply"], [binding.state for binding in template.nodes["compose_denied_reply"].writes])
        self.assertIn(state_by_name["final_reply"], [binding.state for binding in template.nodes["assess_tool_result"].writes])

        conditional_edges = {edge.source: edge.branches for edge in template.conditional_edges}
        self.assertEqual(
            conditional_edges["missing_skill_check"],
            {
                "true": "output_missing_skill",
                "false": "direct_reply_check",
                "exhausted": "output_missing_skill",
            },
        )
        self.assertEqual(
            conditional_edges["direct_reply_check"],
            {
                "true": "compose_direct_reply",
                "false": "approval_required_check",
                "exhausted": "compose_direct_reply",
            },
        )
        self.assertEqual(
            conditional_edges["approval_required_check"],
            {
                "true": "request_approval_agent",
                "false": "tool_execution_agent",
                "exhausted": "request_approval_agent",
            },
        )
        self.assertEqual(
            conditional_edges["approval_granted_check"],
            {
                "true": "tool_execution_agent",
                "false": "compose_denied_reply",
                "exhausted": "compose_denied_reply",
            },
        )
        self.assertEqual(
            conditional_edges["continue_tool_loop_check"],
            {
                "true": "decide_next_skill",
                "false": "curate_companion_memory",
                "exhausted": "curate_companion_memory",
            },
        )

        graph_payload = template.model_dump(mode="json", by_alias=True)
        graph_payload["graph_id"] = "template_companion_agentic_tool_loop"
        graph_payload["name"] = template.default_graph_name
        for template_only_key in ["template_id", "label", "description", "default_graph_name"]:
            graph_payload.pop(template_only_key, None)
        self.assertEqual(
            get_langgraph_runtime_unsupported_reasons(NodeSystemGraphDocument.model_validate(graph_payload)),
            [],
        )

        self.assertEqual(
            template.nodes["missing_skill_check"].config.rule.source,
            state_by_name["decision"],
        )
        self.assertEqual(template.nodes["missing_skill_check"].config.rule.value, "missing_skill")
        self.assertEqual(
            template.nodes["direct_reply_check"].config.rule.source,
            state_by_name["decision"],
        )
        self.assertEqual(template.nodes["direct_reply_check"].config.rule.value, "answer_directly")
        self.assertEqual(
            template.nodes["approval_required_check"].config.rule.source,
            state_by_name["next_action"],
        )
        self.assertEqual(template.nodes["approval_required_check"].config.rule.value, "request_approval")
        self.assertEqual(
            template.nodes["approval_granted_check"].config.rule.source,
            state_by_name["approval_granted"],
        )
        self.assertEqual(template.nodes["approval_granted_check"].config.rule.value, True)
        self.assertEqual(
            template.nodes["continue_tool_loop_check"].config.rule.source,
            state_by_name["needs_more_tools"],
        )
        self.assertEqual(template.nodes["continue_tool_loop_check"].config.rule.value, True)
        self.assertEqual(template.nodes["continue_tool_loop_check"].config.loop_limit, 3)

        memory_curator = template.nodes["curate_companion_memory"]
        self.assertIn(state_by_name["final_reply"], [binding.state for binding in memory_curator.reads])
        self.assertNotIn(state_by_name["final_reply"], [binding.state for binding in memory_curator.writes])
        self.assertIn(state_by_name["companion_memory_update_result"], [binding.state for binding in memory_curator.writes])
        profile_writer = template.nodes["write_companion_profile"]
        self.assertEqual(profile_writer.config.skills, ["local_file"])
        self.assertEqual(profile_writer.config.skill_bindings[0].skill_key, "local_file")
        self.assertEqual(profile_writer.config.skill_bindings[0].config.get("operation"), "write_json")
        self.assertEqual(
            profile_writer.config.skill_bindings[0].config.get("changed_by"),
            "companion_agentic_tool_loop_template",
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

    def test_download_video_preview_template_searches_before_downloading_media(self):
        template = next(
            NodeSystemTemplate.model_validate(record)
            for record in list_template_records()
            if record["template_id"] == "download_video_preview"
        )
        state_by_name = {
            definition.name: state_key
            for state_key, definition in template.state_schema.items()
        }

        self.assertEqual(template.default_graph_name, "下载并展示视频")
        self.assertEqual(
            template.state_schema[state_by_name["video_request"]].value,
            "找一个公开可访问的视频页面，下载视频并在 Output 中预览",
        )
        self.assertIn("web_search_agent", template.nodes)
        self.assertIn("download_video_agent", template.nodes)
        self.assertIn("output_downloaded_video", template.nodes)

        search_node = template.nodes["web_search_agent"]
        self.assertEqual(search_node.config.skills, ["web_search"])
        self.assertEqual(search_node.config.skill_bindings[0].skill_key, "web_search")
        self.assertEqual(
            search_node.config.skill_bindings[0].input_mapping,
            {"query": state_by_name["search_query"]},
        )
        self.assertEqual(
            search_node.config.skill_bindings[0].output_mapping,
            {"results": state_by_name["search_results"]},
        )

        download_node = template.nodes["download_video_agent"]
        self.assertEqual(download_node.config.skills, ["web_media_downloader"])
        self.assertIn(state_by_name["search_results"], [binding.state for binding in download_node.reads])
        self.assertEqual(download_node.config.skill_bindings[0].skill_key, "web_media_downloader")
        self.assertEqual(
            download_node.config.skill_bindings[0].input_mapping,
            {"urls": state_by_name["candidate_video_url"]},
        )
        self.assertEqual(
            download_node.config.skill_bindings[0].output_mapping,
            {"downloaded_files": state_by_name["downloaded_video_files"]},
        )
        self.assertEqual(download_node.config.skill_bindings[0].config.get("media_types"), "video")
        self.assertEqual(download_node.config.skill_bindings[0].config.get("use_ytdlp"), "true")

        output_node = template.nodes["output_downloaded_video"]
        self.assertEqual(output_node.reads[0].state, state_by_name["downloaded_video_files"])
        self.assertEqual(output_node.config.display_mode.value, "documents")

    def test_companion_chat_loop_template_models_single_turn_companion_reply(self):
        template = next(
            NodeSystemTemplate.model_validate(record)
            for record in list_template_records()
            if record["template_id"] == "companion_chat_loop"
        )
        state_by_name = {
            definition.name: state_key
            for state_key, definition in template.state_schema.items()
        }

        self.assertEqual(template.default_graph_name, "桌宠对话循环")
        self.assertEqual(
            list(state_by_name.keys()),
            [
                "user_message",
                "conversation_history",
                "page_context",
                "companion_reply",
                "companion_mode",
                "companion_profile",
                "companion_policy",
                "companion_memory_context",
                "companion_session_summary",
                "companion_memory_update_result",
                "companion_profile_json",
                "companion_policy_json",
                "companion_memories_json",
                "companion_session_summary_json",
                "companion_profile_next",
                "companion_policy_next",
                "companion_memories_next",
                "companion_session_summary_next",
                "companion_profile_write_result",
                "companion_policy_write_result",
                "companion_memories_write_result",
                "companion_session_summary_write_result",
            ],
        )
        serialized_template = json.dumps(template.model_dump(mode="json"), ensure_ascii=False)
        self.assertNotIn("companion_state", serialized_template)
        self.assertIn("local_file", serialized_template)

        loader = template.nodes["read_companion_profile"]
        self.assertEqual(loader.kind, "agent")
        self.assertEqual(loader.config.skills, ["local_file"])
        self.assertEqual(loader.config.skill_bindings[0].skill_key, "local_file")
        self.assertEqual(loader.config.skill_bindings[0].config.get("operation"), "read_json")
        self.assertEqual(loader.config.skill_bindings[0].config.get("path"), "backend/data/companion/profile.json")
        self.assertEqual(
            loader.config.skill_bindings[0].output_mapping,
            {
                "prompt_section": state_by_name["companion_profile"],
                "json_content": state_by_name["companion_profile_json"],
            },
        )
        memory_reader = template.nodes["read_companion_memories"]
        self.assertEqual(
            memory_reader.config.skill_bindings[0].config.get("prompt_array_filter"),
            {"enabled": True, "deleted": False},
        )
        self.assertEqual(memory_reader.config.skill_bindings[0].config.get("max_prompt_items"), 20)
        agent = template.nodes["companion_reply_agent"]
        self.assertEqual(agent.kind, "agent")
        self.assertEqual(agent.config.skills, [])
        self.assertIn(state_by_name["user_message"], [binding.state for binding in agent.reads])
        self.assertIn(state_by_name["conversation_history"], [binding.state for binding in agent.reads])
        self.assertIn(state_by_name["page_context"], [binding.state for binding in agent.reads])
        self.assertIn(state_by_name["companion_mode"], [binding.state for binding in agent.reads])
        self.assertIn(state_by_name["companion_profile"], [binding.state for binding in agent.reads])
        self.assertIn(state_by_name["companion_policy"], [binding.state for binding in agent.reads])
        self.assertIn(state_by_name["companion_memory_context"], [binding.state for binding in agent.reads])
        self.assertIn(state_by_name["companion_session_summary"], [binding.state for binding in agent.reads])
        self.assertEqual([binding.state for binding in agent.writes], [state_by_name["companion_reply"]])
        self.assertIn("全局主桌宠 Agent", agent.config.task_instruction)
        self.assertIn("不是图内普通 agent 节点", agent.config.task_instruction)
        self.assertIn("只允许陪伴聊天", agent.config.task_instruction)
        self.assertIn("提供建议", agent.config.task_instruction)
        self.assertIn("只读背景上下文", agent.config.task_instruction)
        self.assertIn("先内部判断用户意图", agent.config.task_instruction)
        self.assertIn("闲聊", agent.config.task_instruction)
        self.assertIn("图操作请求", agent.config.task_instruction)
        self.assertIn("不能新建图", agent.config.task_instruction)
        self.assertIn("不能运行图", agent.config.task_instruction)

        curator = template.nodes["curate_companion_memory"]
        self.assertEqual(curator.kind, "agent")
        self.assertEqual(curator.config.skills, [])
        self.assertEqual(curator.config.skill_bindings, [])
        self.assertIn(state_by_name["companion_profile_json"], [binding.state for binding in curator.reads])
        self.assertIn(state_by_name["companion_policy_json"], [binding.state for binding in curator.reads])
        self.assertIn(state_by_name["companion_memories_json"], [binding.state for binding in curator.reads])
        self.assertIn(state_by_name["companion_session_summary_json"], [binding.state for binding in curator.reads])
        self.assertEqual(
            [binding.state for binding in curator.writes],
            [
                state_by_name["companion_profile_next"],
                state_by_name["companion_policy_next"],
                state_by_name["companion_memories_next"],
                state_by_name["companion_session_summary_next"],
                state_by_name["companion_memory_update_result"],
            ],
        )
        self.assertIn("完整下一版文件内容", curator.config.task_instruction)
        self.assertIn("graph_permission_mode", curator.config.task_instruction)

        writer = template.nodes["write_companion_profile"]
        self.assertEqual(writer.kind, "agent")
        self.assertEqual(writer.config.skills, ["local_file"])
        self.assertEqual(writer.config.skill_bindings[0].skill_key, "local_file")
        self.assertEqual(writer.config.skill_bindings[0].input_mapping, {"content": state_by_name["companion_profile_next"]})
        self.assertEqual(writer.config.skill_bindings[0].config.get("operation"), "write_json")
        self.assertEqual(writer.config.skill_bindings[0].config.get("path"), "backend/data/companion/profile.json")
        for node_id in [
            "write_companion_profile",
            "write_companion_policy",
            "write_companion_memories",
            "write_companion_session_summary",
        ]:
            self.assertIs(template.nodes[node_id].config.skill_bindings[0].config.get("skip_if_unchanged"), True)
        self.assertEqual(
            writer.config.skill_bindings[0].output_mapping,
            {"write_result": state_by_name["companion_profile_write_result"]},
        )

        output_node = template.nodes["output_companion_reply"]
        self.assertEqual(output_node.reads[0].state, state_by_name["companion_reply"])
        self.assertEqual(output_node.config.display_mode.value, "markdown")

    def test_game_ad_creative_factory_template_models_generic_game_research_workflow(self):
        template = next(
            NodeSystemTemplate.model_validate(record)
            for record in list_template_records()
            if record["template_id"] == "game_ad_creative_factory"
        )
        state_by_name = {
            definition.name: state_key
            for state_key, definition in template.state_schema.items()
        }

        self.assertEqual(template.default_graph_name, "广告创意分析demo模板")
        self.assertEqual(template.state_schema[state_by_name["genre"]].value, "SLG")
        self.assertIn("collect_game_market_signals", template.nodes)
        self.assertIn("analyze_video_patterns", template.nodes)
        self.assertIn("build_creative_brief", template.nodes)
        self.assertIn("generate_creative_package", template.nodes)
        self.assertIn("review_creative_package", template.nodes)
        self.assertIn("creative_revision_check", template.nodes)
        self.assertIn("output_downloaded_videos", template.nodes)

        collector = template.nodes["collect_game_market_signals"]
        self.assertEqual(collector.config.skills, ["game_ad_research_collector"])
        self.assertEqual(collector.config.skill_bindings[0].skill_key, "game_ad_research_collector")
        self.assertEqual(
            collector.config.skill_bindings[0].input_mapping,
            {
                "genre": state_by_name["genre"],
                "search_terms": state_by_name["search_terms"],
                "country": state_by_name["country"],
                "days_back": state_by_name["days_back"],
            },
        )
        self.assertEqual(
            collector.config.skill_bindings[0].output_mapping,
            {
                "summary": state_by_name["research_summary"],
                "rss_items": state_by_name["rss_items"],
                "ad_items": state_by_name["ad_items"],
                "downloaded_files": state_by_name["downloaded_video_files"],
                "source_documents": state_by_name["source_documents"],
            },
        )
        self.assertEqual(collector.config.skill_bindings[0].config.get("top_fetch_per_term"), 1)
        self.assertEqual(collector.config.skill_bindings[0].config.get("enable_ads"), "true")

        analyzer = template.nodes["analyze_video_patterns"]
        self.assertIn(state_by_name["downloaded_video_files"], [binding.state for binding in analyzer.reads])
        self.assertIn(state_by_name["video_analysis_results"], [binding.state for binding in analyzer.writes])
        self.assertIn(state_by_name["pattern_summary"], [binding.state for binding in analyzer.writes])

        generator = template.nodes["generate_creative_package"]
        self.assertIn(state_by_name["creative_brief"], [binding.state for binding in generator.reads])
        self.assertIn(state_by_name["script_variants"], [binding.state for binding in generator.writes])
        self.assertIn(state_by_name["storyboard_package"], [binding.state for binding in generator.writes])
        self.assertIn(state_by_name["video_prompt_package"], [binding.state for binding in generator.writes])

        condition = template.nodes["creative_revision_check"]
        self.assertEqual(condition.config.loop_limit, 2)
        self.assertEqual(condition.config.rule.source, state_by_name["needs_revision"])
        self.assertEqual(condition.config.rule.operator.value, "==")
        self.assertEqual(condition.config.rule.value, True)
        conditional_edge = next(edge for edge in template.conditional_edges if edge.source == "creative_revision_check")
        self.assertEqual(
            conditional_edge.branches,
            {
                "true": "generate_creative_package",
                "false": "output_final_summary",
                "exhausted": "output_review_results",
            },
        )

        output_videos = template.nodes["output_downloaded_videos"]
        self.assertEqual(output_videos.reads[0].state, state_by_name["downloaded_video_files"])
        self.assertEqual(output_videos.config.display_mode.value, "documents")

        serialized_template = json.dumps(template.model_dump(mode="json"), ensure_ascii=False)
        self.assertNotIn("Whiteout Survival", serialized_template)
        self.assertNotIn("Last War", serialized_template)
