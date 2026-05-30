from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.compiler.validator import validate_graph
from app.core.langgraph import compile_graph_to_langgraph_plan, get_langgraph_runtime_unsupported_reasons
from app.core.langgraph.cycle_tracker import build_langgraph_cycle_tracker
from app.core.runtime.execution_graph import build_execution_edges
from app.core.schemas.node_system import NodeSystemGraphPayload
from app.templates.loader import OFFICIAL_TEMPLATES_ROOT, TEMPLATE_FILE_NAME, list_template_records, load_template_record


def _official_template_records() -> list[dict]:
    return [
        load_template_record(path.parent.name)
        for path in sorted(
            (template_dir / TEMPLATE_FILE_NAME for template_dir in OFFICIAL_TEMPLATES_ROOT.iterdir() if (template_dir / TEMPLATE_FILE_NAME).is_file()),
            key=lambda item: item.parent.name.lower(),
        )
    ]


def _visible_official_template_records() -> list[dict]:
    return [record for record in list_template_records() if record.get("source") == "official"]


def _read_contracts(reads: list[dict]) -> list[dict]:
    return [{key: value for key, value in read.items() if not (key == "binding" and value is None)} for read in reads]


BUDDY_SUPPORT_TEMPLATE_IDS = {
    "buddy_autonomous_review",
    "buddy_capability_curator",
    "buddy_context_compaction",
    "buddy_improvement_review_workflow",
}

FORBIDDEN_TEMPLATE_BREAKPOINT_KEYS = {
    "interrupt_after",
    "interrupt_before",
    "agent_breakpoint_timing",
    "auto_resume_after_ui_operation_nodes",
}


def _iter_graphs(record: dict, path: str | None = None):
    graph_path = path or str(record.get("template_id") or "<template>")
    yield graph_path, record
    nodes = record.get("nodes") if isinstance(record.get("nodes"), dict) else {}
    for node_id, node in nodes.items():
        if not isinstance(node, dict):
            continue
        config = node.get("config") if isinstance(node.get("config"), dict) else {}
        embedded_graph = config.get("graph") if isinstance(config.get("graph"), dict) else None
        if embedded_graph is not None:
            yield from _iter_graphs(embedded_graph, f"{graph_path}.{node_id}")


def _node_position(node: dict) -> tuple[float, float]:
    ui = node.get("ui") if isinstance(node.get("ui"), dict) else {}
    position = ui.get("position") if isinstance(ui.get("position"), dict) else {}
    return float(position.get("x") or 0), float(position.get("y") or 0)


def _node_size(node: dict) -> tuple[float, float]:
    ui = node.get("ui") if isinstance(node.get("ui"), dict) else {}
    size = ui.get("size") if isinstance(ui.get("size"), dict) else {}
    kind = str(node.get("kind") or "")
    if kind == "condition":
        default_width, default_height = 560, 280
    elif kind == "output":
        default_width, default_height = 460, 340
    elif kind == "input":
        default_width, default_height = 460, 320
    else:
        default_width, default_height = 460, 360
    return float(size.get("width") or default_width), float(size.get("height") or default_height)


def _allows_runtime_context_root(graph: dict, node_id: str, node: dict) -> bool:
    metadata = graph.get("metadata") if isinstance(graph.get("metadata"), dict) else {}
    runtime_requirements = metadata.get("runtime_context_requirements")
    config = node.get("config") if isinstance(node.get("config"), dict) else {}
    return (
        isinstance(runtime_requirements, list)
        and node_id == "load_history_context"
        and node.get("kind") == "tool"
        and config.get("toolKey") == "buddy_history_context_loader"
    )


def _rects_overlap(a: tuple[float, float, float, float], b: tuple[float, float, float, float], *, gap: float = 32) -> bool:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return ax < bx + bw + gap and ax + aw + gap > bx and ay < by + bh + gap and ay + ah + gap > by


class TemplateLayoutTests(unittest.TestCase):
    def test_builtin_template_registry_contains_official_templates(self) -> None:
        records = _official_template_records()
        visible_records = _visible_official_template_records()

        self.assertEqual(
            [record["template_id"] for record in records],
            [
                "advanced_web_research_loop",
                "ai_news_digest_to_wechat_article",
                "buddy_autonomous_loop",
                "buddy_autonomous_review",
                "buddy_capability_curator",
                "buddy_context_compaction",
                "buddy_improvement_review_workflow",
                "delegation_worker_batch_workflow",
                "ecommerce_review_mining_agent",
                "embedding_maintenance",
                "game_creative_factory",
                "job_application_interview_coach",
                "multi_platform_content_repurposer",
                "policy_navigator_agent",
                "product_competitor_research_agent",
                "toograph_action_creation_workflow",
                "toograph_graph_template_creation_workflow",
                "toograph_page_operation_workflow",
            ],
        )
        self.assertEqual(
            [record["template_id"] for record in visible_records],
            [
                "advanced_web_research_loop",
                "buddy_autonomous_loop",
                "buddy_autonomous_review",
                "buddy_capability_curator",
                "buddy_context_compaction",
                "buddy_improvement_review_workflow",
                "delegation_worker_batch_workflow",
                "embedding_maintenance",
                "toograph_page_operation_workflow",
            ],
        )
        templates = {record["template_id"]: record for record in records}
        research_template = templates["advanced_web_research_loop"]
        self.assertEqual(research_template["source"], "official")
        self.assertEqual(research_template["label"], "高级联网搜索")
        self.assertEqual(research_template["default_graph_name"], "高级联网搜索")
        self.assertIn("联网调研", research_template["description"])
        action_template = templates["toograph_action_creation_workflow"]
        self.assertEqual(action_template["source"], "official")
        self.assertEqual(action_template["label"], "创建自定义 Action")
        self.assertEqual(action_template["default_graph_name"], "创建自定义 Action")
        self.assertIn("创建新的 TooGraph Action", action_template["description"])

        buddy_template = templates["buddy_autonomous_loop"]
        buddy_template_json = json.dumps(buddy_template, ensure_ascii=False)
        self.assertEqual(buddy_template["source"], "official")
        self.assertEqual(buddy_template["label"], "伙伴自主循环")
        self.assertEqual(buddy_template["default_graph_name"], "伙伴自主循环")
        self.assertIn("官方 Buddy 可见回复主流程", buddy_template["description"])
        self.assertNotIn("组装当前会话历史", buddy_template_json)
        self.assertNotIn("历史组装", buddy_template_json)
        self.assertNotIn("history_max_messages", buddy_template_json)
        self.assertNotIn("history_max_chars", buddy_template_json)
        self.assertNotIn("max_messages", buddy_template_json)
        self.assertNotIn("max_chars", buddy_template_json)
        self.assertIs(buddy_template["capabilityDiscoverable"], False)
        self.assertNotIn("hideFromCapabilitySelector", buddy_template["metadata"])
        self.assertEqual(
            buddy_template["metadata"].get("buddyRuntimeInputBindings"),
            {"input_user_message": "current_message"},
        )
        self.assertEqual(
            sorted(node_id for node_id, node in buddy_template["nodes"].items() if node["kind"] == "input"),
            ["input_buddy_context", "input_user_message"],
        )
        for expected_node in [
            "load_history_context",
            "check_context_pressure",
            "context_pressure_condition",
            "run_context_compaction",
            "reply_and_select_capability",
            "execute_capability",
            "condition_93972e3f",
            "condition_3706cb6e",
        ]:
            self.assertIn(expected_node, buddy_template["nodes"])
        for removed_node in ["guard_agent_loop", "agent_loop_continue_condition", "finalize_guard_stop"]:
            self.assertNotIn(removed_node, buddy_template["nodes"])
        self.assertEqual(buddy_template["nodes"]["run_context_compaction"]["kind"], "subgraph")
        self.assertEqual(buddy_template["nodes"]["load_history_context"]["config"]["toolKey"], "buddy_history_context_loader")
        self.assertNotIn("load_buddy_home_context", buddy_template["nodes"])
        buddy_home_input = buddy_template["nodes"]["input_buddy_context"]
        self.assertEqual(buddy_home_input["kind"], "input")
        self.assertEqual(buddy_home_input["config"]["boundaryType"], "file")
        self.assertEqual(buddy_home_input["writes"], [{"state": "buddy_context", "mode": "replace"}])
        self.assertEqual(
            buddy_home_input["config"]["value"],
            {
                "kind": "local_folder",
                "root": "buddy_home",
                "selected": ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md"],
            },
        )
        self.assertEqual(
            buddy_template["state_schema"]["buddy_context"]["value"],
            {
                "kind": "local_folder",
                "root": "buddy_home",
                "selected": ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md"],
            },
        )
        self.assertIsNone(buddy_template["state_schema"]["buddy_context"]["binding"])
        self.assertNotIn("current_session_id", buddy_template["state_schema"])
        self.assertNotIn("existing_session_summary", buddy_template["state_schema"])
        self.assertIn(
            {"source": "load_history_context", "target": "check_context_pressure"},
            buddy_template["edges"],
        )
        self.assertIn(
            {"source": "input_user_message", "target": "check_context_pressure"},
            buddy_template["edges"],
        )
        self.assertNotIn(
            {"source": "input_user_message", "target": "load_history_context"},
            buddy_template["edges"],
        )
        self.assertIn(
            {"source": "input_buddy_context", "target": "check_context_pressure"},
            buddy_template["edges"],
        )
        self.assertIn(
            {"source": "execute_capability", "target": "check_context_pressure"},
            buddy_template["edges"],
        )
        test_condition_edges = {
            edge["source"]: edge["branches"]
            for edge in buddy_template["conditional_edges"]
        }
        self.assertEqual(
            test_condition_edges["context_pressure_condition"],
            {"true": "run_context_compaction", "false": "reply_and_select_capability", "exhausted": "reply_and_select_capability"},
        )
        self.assertEqual(
            test_condition_edges["condition_93972e3f"],
            {"true": "output_ab549b8d", "false": "condition_3706cb6e", "exhausted": "condition_3706cb6e"},
        )
        self.assertEqual(
            test_condition_edges["condition_3706cb6e"],
            {"true": "execute_capability", "false": "output_161c76f3", "exhausted": "output_161c76f3"},
        )

        review_template = templates["buddy_autonomous_review"]
        self.assertEqual(review_template["source"], "official")
        self.assertEqual(review_template["label"], "自主复盘")
        self.assertEqual(
            review_template["metadata"].get("buddyMemoryReviewRuntimeInputBindings"),
            {"input_source_run_id": "source_run_id"},
        )
        self.assertIn("buddy_review_context_loader", review_template["metadata"].get("requiredTools", []))
        self.assertEqual(
            sorted(node_id for node_id, node in review_template["nodes"].items() if node["kind"] == "input"),
            ["input_buddy_context", "input_source_run_id"],
        )
        self.assertEqual(review_template["nodes"]["load_review_context"]["kind"], "tool")
        self.assertEqual(review_template["nodes"]["load_review_context"]["config"]["toolKey"], "buddy_review_context_loader")
        self.assertEqual(review_template["state_schema"]["conversation_history"]["type"], "json")
        self.assertEqual(
            review_template["state_schema"]["current_session_id"]["binding"]["fieldKey"],
            "current_session_id",
        )
        self.assertIn({"source": "input_source_run_id", "target": "load_review_context"}, review_template["edges"])
        self.assertIn({"source": "load_review_context", "target": "recall_related_sessions"}, review_template["edges"])
        self.assertIn({"source": "load_review_context", "target": "draft_autonomous_review"}, review_template["edges"])

        embedding_template = templates["embedding_maintenance"]
        self.assertEqual(embedding_template["source"], "official")
        self.assertEqual(embedding_template["label"], "Embedding 维护")
        self.assertEqual(embedding_template["default_graph_name"], "Embedding 维护")
        self.assertEqual(embedding_template["metadata"]["role"], "embedding_maintenance")
        self.assertEqual(embedding_template["metadata"]["requiredTools"], ["embedding_job_processor"])
        self.assertIs(embedding_template["capabilityDiscoverable"], False)
        self.assertEqual(
            sorted(node_id for node_id, node in embedding_template["nodes"].items() if node["kind"] == "input"),
            ["input_limit", "input_model_ref"],
        )
        self.assertEqual(embedding_template["nodes"]["process_embedding_jobs"]["kind"], "tool")
        self.assertEqual(
            embedding_template["nodes"]["process_embedding_jobs"]["config"]["toolKey"],
            "embedding_job_processor",
        )
        self.assertEqual(
            _read_contracts(embedding_template["nodes"]["process_embedding_jobs"]["reads"]),
            [
                {
                    "state": "model_ref",
                    "required": False,
                    "binding": {
                        "kind": "tool_input",
                        "actionKey": "",
                        "toolKey": "embedding_job_processor",
                        "fieldKey": "model_ref",
                        "managed": True,
                    },
                },
                {
                    "state": "job_limit",
                    "required": False,
                    "binding": {
                        "kind": "tool_input",
                        "actionKey": "",
                        "toolKey": "embedding_job_processor",
                        "fieldKey": "limit",
                        "managed": True,
                    },
                },
            ],
        )
        self.assertEqual(
            embedding_template["nodes"]["process_embedding_jobs"]["writes"],
            [
                {"state": "processor_status", "mode": "replace"},
                {"state": "processed_count", "mode": "replace"},
                {"state": "completed_count", "mode": "replace"},
                {"state": "failed_count", "mode": "replace"},
                {"state": "processed_jobs", "mode": "replace"},
            ],
        )
        self.assertIn({"source": "input_model_ref", "target": "process_embedding_jobs"}, embedding_template["edges"])
        self.assertIn({"source": "input_limit", "target": "process_embedding_jobs"}, embedding_template["edges"])
        self.assertIn({"source": "process_embedding_jobs", "target": "output_embedding_report"}, embedding_template["edges"])

        curator_template = templates["buddy_capability_curator"]
        self.assertEqual(curator_template["source"], "official")
        self.assertEqual(curator_template["label"], "能力库整理")
        self.assertEqual(curator_template["default_graph_name"], "能力库整理")
        self.assertEqual(curator_template["metadata"]["role"], "buddy_capability_curator")
        self.assertIs(curator_template["capabilityDiscoverable"], False)

        page_operation_template = templates["toograph_page_operation_workflow"]
        self.assertEqual(page_operation_template["source"], "official")
        self.assertEqual(page_operation_template["label"], "操作 TooGraph 页面")
        self.assertEqual(page_operation_template["default_graph_name"], "操作 TooGraph 页面")
        self.assertIn("打开页面", page_operation_template["description"])
        self.assertIs(page_operation_template["capabilityDiscoverable"], False)

        graph_template = templates["toograph_graph_template_creation_workflow"]
        self.assertEqual(graph_template["source"], "official")
        self.assertEqual(graph_template["label"], "创建图模板")
        self.assertEqual(graph_template["default_graph_name"], "创建图模板")
        self.assertIn("图模板", graph_template["description"])

        policy_template = templates["policy_navigator_agent"]
        self.assertEqual(policy_template["source"], "official")
        self.assertEqual(policy_template["label"], "政策导航助手")
        self.assertEqual(policy_template["default_graph_name"], "政策导航助手")
        self.assertIn("政策原文", policy_template["description"])
        self.assertIs(policy_template["capabilityDiscoverable"], False)
        self.assertEqual(policy_template["capabilityDiscoverableBlockedReason"], "hidden_template")

        news_template = templates["ai_news_digest_to_wechat_article"]
        self.assertEqual(news_template["source"], "official")
        self.assertEqual(news_template["label"], "AI 新闻公众号助手")
        self.assertEqual(news_template["default_graph_name"], "AI 新闻公众号助手")
        self.assertIn("公众号文章", news_template["description"])
        self.assertIs(news_template["capabilityDiscoverable"], False)

        repurposer_template = templates["multi_platform_content_repurposer"]
        self.assertEqual(repurposer_template["source"], "official")
        self.assertEqual(repurposer_template["label"], "一文多发内容改写助手")
        self.assertEqual(repurposer_template["default_graph_name"], "一文多发内容改写助手")
        self.assertIn("多个平台适配版本", repurposer_template["description"])
        self.assertIs(repurposer_template["capabilityDiscoverable"], False)

        game_template = templates["game_creative_factory"]
        self.assertEqual(game_template["source"], "official")
        self.assertEqual(game_template["label"], "游戏广告创意工厂")
        self.assertEqual(game_template["default_graph_name"], "游戏广告创意工厂")
        self.assertIn("游戏广告", game_template["description"])
        self.assertIs(game_template["capabilityDiscoverable"], False)

        ecommerce_template = templates["ecommerce_review_mining_agent"]
        self.assertEqual(ecommerce_template["source"], "official")
        self.assertEqual(ecommerce_template["label"], "电商评论洞察挖掘助手")
        self.assertEqual(ecommerce_template["default_graph_name"], "电商评论洞察挖掘助手")
        self.assertIn("电商营销内容", ecommerce_template["description"])
        self.assertIs(ecommerce_template["capabilityDiscoverable"], False)

        job_template = templates["job_application_interview_coach"]
        self.assertEqual(job_template["source"], "official")
        self.assertEqual(job_template["label"], "求职简历与面试教练")
        self.assertEqual(job_template["default_graph_name"], "求职简历与面试教练")
        self.assertIn("求职匹配", job_template["description"])
        self.assertIs(job_template["capabilityDiscoverable"], False)

        product_template = templates["product_competitor_research_agent"]
        self.assertEqual(product_template["source"], "official")
        self.assertEqual(product_template["label"], "产品竞品研究助手")
        self.assertEqual(product_template["default_graph_name"], "产品竞品研究助手")
        self.assertIn("PRD 草稿", product_template["description"])
        self.assertIs(product_template["capabilityDiscoverable"], False)

    def test_delegation_worker_batch_workflow_exposes_reusable_board_workflow(self) -> None:
        template = load_template_record("delegation_worker_batch_workflow")
        nodes = template["nodes"]
        state_schema = template["state_schema"]

        self.assertEqual(template["metadata"]["role"], "delegation_worker_batch_workflow")
        self.assertEqual(
            template["metadata"]["requiredTools"],
            [
                "delegation_worker_result_packager",
                "delegation_worker_result_merger",
                "delegation_kanban_board_builder",
            ],
        )
        self.assertIs(template["metadata"]["visible"], True)
        self.assertIs(template["capabilityDiscoverable"], False)
        self.assertEqual(nodes["run_worker_batch"]["kind"], "batch")
        self.assertEqual(nodes["merge_worker_results"]["config"]["toolKey"], "delegation_worker_result_merger")
        self.assertEqual(nodes["build_delegation_board"]["kind"], "tool")
        self.assertEqual(nodes["build_delegation_board"]["config"]["toolKey"], "delegation_kanban_board_builder")
        self.assertEqual(
            _read_contracts(nodes["build_delegation_board"]["writes"]),
            [
                {"state": "kanban_builder_status", "mode": "replace"},
                {"state": "delegation_board_snapshot", "mode": "replace"},
                {"state": "kanban_board_report", "mode": "replace"},
            ],
        )
        self.assertEqual(
            state_schema["delegation_board_snapshot"]["binding"]["toolKey"],
            "delegation_kanban_board_builder",
        )
        self.assertEqual(
            [item["state"] for item in template["metadata"]["outputContract"]],
            ["worker_merge_review_package", "delegation_board_snapshot", "kanban_board_report"],
        )
        self.assertIn({"source": "merge_worker_results", "target": "build_delegation_board"}, template["edges"])
        self.assertIn({"source": "build_delegation_board", "target": "output_delegation_board"}, template["edges"])
        self.assertIn({"source": "build_delegation_board", "target": "output_kanban_board_report"}, template["edges"])

    def test_page_operation_template_instruction_hides_self_surface_details(self) -> None:
        template = load_template_record("toograph_page_operation_workflow")
        execute_node = template["nodes"]["execute_page_operation"]
        config_text = json.dumps(execute_node.get("config", {}), ensure_ascii=False)

        for forbidden_text in ["伙伴自表面", "伙伴页面", "伙伴浮窗", "伙伴形象", "app.nav.buddy", "Buddy page"]:
            self.assertNotIn(forbidden_text, config_text)
        self.assertIn("未列出的页面目标", config_text)

    def test_official_templates_do_not_embed_breakpoint_metadata(self) -> None:
        for template in _official_template_records():
            for graph_path, graph in _iter_graphs(template):
                with self.subTest(graph=graph_path):
                    metadata = graph.get("metadata") if isinstance(graph.get("metadata"), dict) else {}
                    self.assertEqual(sorted(FORBIDDEN_TEMPLATE_BREAKPOINT_KEYS.intersection(metadata)), [])

    def test_evidence_heavy_business_templates_declare_knowledge_requirements(self) -> None:
        expected_requirements = {
            "policy_navigator_agent": {
                "state": "policy_knowledge_base",
                "sourceStates": ["policy_sources", "raw_policy_text", "policy_knowledge_base"],
                "citationOutput": "citation_map",
            },
            "ai_news_digest_to_wechat_article": {
                "state": "raw_news_items",
                "sourceStates": ["raw_news_items", "source_urls"],
                "citationOutput": "citation_map",
            },
            "product_competitor_research_agent": {
                "state": "existing_knowledge_notes",
                "sourceStates": [
                    "competitor_sources",
                    "user_reviews",
                    "interview_notes",
                    "existing_knowledge_notes",
                ],
                "citationOutput": "source_evidence_map",
            },
            "ecommerce_review_mining_agent": {
                "state": "raw_reviews",
                "sourceStates": [
                    "product_context",
                    "raw_reviews",
                    "competitor_reviews",
                    "store_feedback",
                    "compliance_notes",
                ],
                "citationOutput": "review_source_map",
            },
        }
        required_retrieval_fields = {
            "citation_id",
            "chunk_id",
            "title",
            "section",
            "source",
            "url",
            "summary",
            "score",
        }
        templates = {record["template_id"]: record for record in _official_template_records()}

        for template_id, expected in expected_requirements.items():
            with self.subTest(template_id=template_id):
                template = templates[template_id]
                states = template["state_schema"]
                metadata = template["metadata"]
                requirements = metadata.get("knowledgeRequirements") or {}

                self.assertEqual(requirements.get("state"), expected["state"])
                self.assertEqual(requirements.get("sourceStates"), expected["sourceStates"])
                self.assertEqual(requirements.get("citationOutput"), expected["citationOutput"])
                self.assertIn(expected["state"], states)
                self.assertIn(expected["citationOutput"], states)
                for state_name in expected["sourceStates"]:
                    self.assertIn(state_name, states)
                self.assertTrue(required_retrieval_fields.issubset(set(requirements.get("retrievalFields") or [])))

    def test_official_template_graphs_have_connected_spaced_nodes(self) -> None:
        for template in _official_template_records():
            for graph_path, graph in _iter_graphs(template):
                nodes = graph.get("nodes") if isinstance(graph.get("nodes"), dict) else {}
                edges = graph.get("edges") if isinstance(graph.get("edges"), list) else []
                conditional_edges = graph.get("conditional_edges") if isinstance(graph.get("conditional_edges"), list) else []
                incoming: dict[str, int] = {node_id: 0 for node_id in nodes}
                outgoing: dict[str, int] = {node_id: 0 for node_id in nodes}
                for edge in edges:
                    if not isinstance(edge, dict):
                        continue
                    source = str(edge.get("source") or "")
                    target = str(edge.get("target") or "")
                    if source in outgoing:
                        outgoing[source] += 1
                    if target in incoming:
                        incoming[target] += 1
                for route in conditional_edges:
                    if not isinstance(route, dict):
                        continue
                    source = str(route.get("source") or "")
                    if source in outgoing:
                        outgoing[source] += 1
                    branches = route.get("branches") if isinstance(route.get("branches"), dict) else {}
                    for target in branches.values():
                        target_id = str(target or "")
                        if target_id in incoming:
                            incoming[target_id] += 1

                for node_id, node in nodes.items():
                    with self.subTest(graph=graph_path, node=node_id):
                        kind = node.get("kind")
                        self.assertFalse(
                            kind not in {"input", "output"}
                            and incoming[node_id] == 0
                            and not _allows_runtime_context_root(graph, node_id, node),
                            "non-boundary node has no incoming edge",
                        )
                        self.assertFalse(kind != "output" and outgoing[node_id] == 0, "non-output node has no outgoing edge")

                rects = {
                    node_id: (*_node_position(node), *_node_size(node))
                    for node_id, node in nodes.items()
                    if isinstance(node, dict)
                }
                node_ids = list(rects)
                for index, left_id in enumerate(node_ids):
                    for right_id in node_ids[index + 1:]:
                        with self.subTest(graph=graph_path, left=left_id, right=right_id):
                            self.assertFalse(_rects_overlap(rects[left_id], rects[right_id]))

    def test_advanced_web_research_loop_contract(self) -> None:
        template = next(record for record in _official_template_records() if record["template_id"] == "advanced_web_research_loop")
        states = template["state_schema"]
        nodes = template["nodes"]

        self.assertEqual(states["artifact_paths"]["type"], "file")
        self.assertEqual(states["source_urls"]["type"], "json")
        self.assertEqual(states["public_response"]["type"], "markdown")
        self.assertFalse(any("promptVisible" in definition for definition in states.values()))

        search_node = nodes["run_web_search"]
        self.assertEqual(search_node["kind"], "agent")
        self.assertEqual(search_node["config"]["actionKey"], "web_search")
        self.assertEqual(
            search_node["config"]["actionBindings"],
            [
                {
                    "actionKey": "web_search",
                    "outputMapping": {
                        "query": "executed_queries",
                        "source_urls": "source_urls",
                        "artifact_paths": "artifact_paths",
                        "errors": "search_errors",
                    },
                }
            ],
        )
        self.assertNotIn("inputMapping", search_node["config"]["actionBindings"][0])
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
        self.assertEqual(_read_contracts(nodes["output_final"]["reads"]), [{"state": "public_response", "required": True}])
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

    def test_policy_navigator_agent_contract(self) -> None:
        template = next(record for record in _official_template_records() if record["template_id"] == "policy_navigator_agent")
        states = template["state_schema"]
        nodes = template["nodes"]
        metadata = template["metadata"]

        self.assertEqual(metadata["graphProtocol"], "node_system")
        self.assertEqual(metadata["category"], "business")
        self.assertEqual(metadata["requiredActions"], ["buddy_session_recall"])
        self.assertEqual(metadata["requiredPermissions"], ["buddy_session_read"])
        self.assertEqual(metadata["knowledgeRequirements"]["state"], "policy_knowledge_base")
        self.assertEqual(metadata["knowledgeRequirements"]["citationOutput"], "citation_map")
        self.assertIn("citation_id", metadata["knowledgeRequirements"]["retrievalFields"])
        self.assertEqual(metadata["gallery"]["mockRun"], "mock_data/sample_policy_notice.md")
        self.assertEqual(
            [item["key"] for item in metadata["inputSchema"]],
            ["policy_sources", "raw_policy_text", "policy_knowledge_base", "user_profile"],
        )
        self.assertEqual(metadata["inputSchema"][2]["type"], "knowledge_base")
        self.assertEqual(
            [item["key"] for item in metadata["outputContract"]],
            ["final_policy_package", "citation_map", "policy_cards", "uncertainty_report"],
        )
        self.assertTrue(metadata["outputContract"][0]["passThrough"])
        self.assertEqual(metadata["outputContract"][0]["role"], "final_response")
        self.assertEqual(
            {item["path"]: item["state"] for item in metadata["artifactContract"]},
            {
                "policy_plain_summary.md": "plain_language_summary",
                "policy_cards.json": "policy_cards",
                "eligibility_report.md": "eligibility_report",
                "action_checklist.json": "action_checklist",
                "citation_map.json": "citation_map",
                "uncertainty_report.md": "uncertainty_report",
                "final_policy_package.md": "final_policy_package",
            },
        )

        self.assertEqual(states["policy_sources"]["type"], "text")
        self.assertEqual(states["raw_policy_text"]["type"], "markdown")
        self.assertEqual(states["policy_knowledge_base"]["type"], "knowledge_base")
        self.assertEqual(states["session_recall_context"]["type"], "json")
        self.assertEqual(states["policy_source_review"]["type"], "json")
        self.assertEqual(states["policy_metadata"]["type"], "json")
        self.assertEqual(states["policy_sections"]["type"], "json")
        self.assertEqual(states["policy_cards"]["type"], "json")
        self.assertEqual(states["eligibility_report"]["type"], "markdown")
        self.assertEqual(states["action_checklist"]["type"], "json")
        self.assertEqual(states["citation_map"]["type"], "json")
        self.assertEqual(states["uncertainty_report"]["type"], "markdown")
        self.assertEqual(states["final_policy_package"]["type"], "markdown")
        self.assertFalse(any("promptVisible" in definition for definition in states.values()))

        self.assertEqual(nodes["input_policy_knowledge_base"]["config"]["boundaryType"], "knowledge_base")
        recall_node = nodes["recall_policy_memory"]
        self.assertEqual(recall_node["kind"], "agent")
        self.assertEqual(recall_node["config"]["actionKey"], "buddy_session_recall")
        self.assertEqual(
            recall_node["config"]["actionBindings"],
            [
                {
                    "actionKey": "buddy_session_recall",
                    "outputMapping": {
                        "success": "buddy_session_recall_success",
                        "session_recall_context": "session_recall_context",
                        "sessions": "recalled_sessions",
                        "result": "buddy_session_recall_result",
                    },
                }
            ],
        )
        self.assertEqual(
            {binding["state"]: binding["mode"] for binding in recall_node["writes"]},
            {
                "buddy_session_recall_success": "replace",
                "session_recall_context": "replace",
                "recalled_sessions": "replace",
                "buddy_session_recall_result": "replace",
            },
        )
        self.assertIn("不得编造检索结果", nodes["policy_source_validator"]["config"]["taskInstruction"])
        self.assertIn("可能符合、可能不符合、信息不足", nodes["eligibility_matcher"]["config"]["taskInstruction"])
        self.assertIn("不得承诺", nodes["uncertainty_and_risk_checker"]["config"]["taskInstruction"])
        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            ["output_final_policy_package"],
        )
        self.assertEqual(
            _read_contracts(nodes["output_final_policy_package"]["reads"]),
            [{"state": "final_policy_package", "required": True}],
        )
        self.assertEqual(nodes["output_final_policy_package"]["config"]["persistEnabled"], True)
        self.assertEqual(nodes["output_final_policy_package"]["config"]["fileNameTemplate"], "final_policy_package.md")

        template_dir = Path(__file__).resolve().parents[2] / "graph_template" / "official" / "policy_navigator_agent"
        self.assertTrue((template_dir / "README.md").is_file())
        self.assertTrue((template_dir / "examples" / "mock_policy_input.json").is_file())
        self.assertTrue((template_dir / "mock_data" / "sample_policy_notice.md").is_file())
        self.assertTrue((template_dir / "artifacts" / "sample_final_policy_package.md").is_file())

    def test_policy_navigator_agent_is_runtime_compatible(self) -> None:
        template = next(record for record in _official_template_records() if record["template_id"] == "policy_navigator_agent")
        payload = {
            key: value
            for key, value in template.items()
            if key not in {"template_id", "label", "description", "default_graph_name", "source"}
        }
        graph = NodeSystemGraphPayload.model_validate(
            {
                **payload,
                "graph_id": "test_policy_navigator_agent",
                "name": template["default_graph_name"],
            }
        )

        validation = validate_graph(graph)
        self.assertEqual([issue.model_dump() for issue in validation.issues], [])
        self.assertEqual(get_langgraph_runtime_unsupported_reasons(graph), [])

    def test_ai_news_digest_to_wechat_article_contract(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "ai_news_digest_to_wechat_article"
        )
        states = template["state_schema"]
        nodes = template["nodes"]
        metadata = template["metadata"]

        self.assertEqual(metadata["graphProtocol"], "node_system")
        self.assertEqual(metadata["category"], "business")
        self.assertEqual(metadata["requiredActions"], ["buddy_session_recall", "web_search"])
        self.assertEqual(metadata["requiredPermissions"], ["buddy_session_read", "network", "secret_read", "browser_automation"])
        self.assertEqual(metadata["mockMode"]["input"], "examples/mock_news_input.json")
        self.assertIs(metadata["mockMode"]["supported"], True)
        self.assertEqual(
            [item["key"] for item in metadata["inputSchema"]],
            ["topic", "date_range", "raw_news_items", "use_web_search", "target_platforms", "style_brief"],
        )
        self.assertEqual(metadata["inputSchema"][3]["type"], "boolean")
        self.assertEqual(
            [item["key"] for item in metadata["outputContract"]],
            ["final_content_package", "top_news_cards", "fact_check_report", "citation_map"],
        )
        self.assertTrue(metadata["outputContract"][0]["passThrough"])
        self.assertEqual(metadata["outputContract"][0]["role"], "final_response")
        self.assertEqual(
            {item["path"]: item["state"] for item in metadata["artifactContract"]},
            {
                "top_news_cards.json": "top_news_cards",
                "ai_news_digest.md": "article_outline",
                "wechat_article.md": "wechat_article",
                "fact_check_report.json": "fact_check_report",
                "title_candidates.json": "title_candidates",
                "distribution_pack.json": "distribution_pack",
                "final_content_package.md": "final_content_package",
            },
        )

        self.assertEqual(states["use_web_search"]["type"], "boolean")
        self.assertEqual(states["artifact_paths"]["type"], "file")
        self.assertEqual(states["clean_news_items"]["type"], "json")
        self.assertEqual(states["clustered_topics"]["type"], "json")
        self.assertEqual(states["top_news_cards"]["type"], "json")
        self.assertEqual(states["wechat_article"]["type"], "markdown")
        self.assertEqual(states["fact_check_report"]["type"], "json")
        self.assertEqual(states["distribution_pack"]["type"], "json")
        self.assertEqual(states["final_content_package"]["type"], "markdown")
        self.assertFalse(any("promptVisible" in definition for definition in states.values()))

        self.assertEqual(nodes["input_use_web_search"]["config"]["boundaryType"], "boolean")
        recall_node = nodes["recall_content_memory"]
        self.assertEqual(recall_node["kind"], "agent")
        self.assertEqual(recall_node["config"]["actionKey"], "buddy_session_recall")
        self.assertEqual(
            recall_node["config"]["actionBindings"][0]["outputMapping"],
            {
                "success": "buddy_session_recall_success",
                "session_recall_context": "session_recall_context",
                "sessions": "recalled_sessions",
                "result": "buddy_session_recall_result",
            },
        )

        search_node = nodes["run_web_search"]
        self.assertEqual(search_node["kind"], "agent")
        self.assertEqual(search_node["config"]["actionKey"], "web_search")
        self.assertEqual(
            search_node["config"]["actionBindings"][0]["outputMapping"],
            {
                "query": "executed_queries",
                "source_urls": "source_urls",
                "artifact_paths": "artifact_paths",
                "errors": "search_errors",
            },
        )
        self.assertEqual(
            {binding["state"]: binding["mode"] for binding in search_node["writes"]},
            {
                "executed_queries": "append",
                "source_urls": "append",
                "artifact_paths": "append",
                "search_errors": "append",
            },
        )

        condition_node = nodes["should_fetch_news"]
        self.assertEqual(condition_node["kind"], "condition")
        self.assertEqual(condition_node["config"]["loopLimit"], 1)
        self.assertEqual(
            condition_node["config"]["rule"],
            {"source": "$state.use_web_search", "operator": "==", "value": True},
        )
        self.assertEqual(
            template["conditional_edges"],
            [
                {
                    "source": "should_fetch_news",
                    "branches": {
                        "true": "run_web_search",
                        "false": "normalize_news_items",
                        "exhausted": "normalize_news_items",
                    },
                }
            ],
        )
        self.assertIn("去重", nodes["normalize_news_items"]["config"]["taskInstruction"])
        self.assertIn("没有来源的事实", nodes["fact_check_article"]["config"]["taskInstruction"])
        self.assertIn("多平台", nodes["build_distribution_pack"]["config"]["taskInstruction"])
        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            ["output_final_content_package"],
        )
        self.assertEqual(
            _read_contracts(nodes["output_final_content_package"]["reads"]),
            [{"state": "final_content_package", "required": True}],
        )
        self.assertEqual(nodes["output_final_content_package"]["config"]["persistEnabled"], True)
        self.assertEqual(nodes["output_final_content_package"]["config"]["fileNameTemplate"], "final_content_package.md")

        template_dir = Path(__file__).resolve().parents[2] / "graph_template" / "official" / "ai_news_digest_to_wechat_article"
        self.assertTrue((template_dir / "README.md").is_file())
        self.assertTrue((template_dir / "examples" / "mock_news_input.json").is_file())
        self.assertTrue((template_dir / "mock_data" / "sample_ai_news_items.md").is_file())
        self.assertTrue((template_dir / "artifacts" / "sample_final_content_package.md").is_file())

    def test_ai_news_digest_to_wechat_article_is_runtime_compatible(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "ai_news_digest_to_wechat_article"
        )
        payload = {
            key: value
            for key, value in template.items()
            if key not in {"template_id", "label", "description", "default_graph_name", "source"}
        }
        graph = NodeSystemGraphPayload.model_validate(
            {
                **payload,
                "graph_id": "test_ai_news_digest_to_wechat_article",
                "name": template["default_graph_name"],
            }
        )

        validation = validate_graph(graph)
        self.assertEqual([issue.model_dump() for issue in validation.issues], [])
        self.assertEqual(get_langgraph_runtime_unsupported_reasons(graph), [])

    def test_multi_platform_content_repurposer_contract(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "multi_platform_content_repurposer"
        )
        states = template["state_schema"]
        nodes = template["nodes"]
        metadata = template["metadata"]

        self.assertEqual(metadata["graphProtocol"], "node_system")
        self.assertEqual(metadata["category"], "business")
        self.assertEqual(metadata["requiredActions"], ["buddy_session_recall"])
        self.assertEqual(metadata["requiredPermissions"], ["buddy_session_read"])
        self.assertEqual(metadata["mockMode"]["input"], "examples/mock_repurposer_input.json")
        self.assertEqual(
            [item["key"] for item in metadata["inputSchema"]],
            ["source_content", "target_platforms", "historical_samples", "content_goal", "human_feedback"],
        )
        self.assertEqual(
            [item["key"] for item in metadata["outputContract"]],
            ["final_distribution_pack", "style_rewrite_outputs", "ai_tone_report"],
        )
        self.assertTrue(metadata["outputContract"][0]["passThrough"])
        self.assertEqual(
            {item["path"]: item["state"] for item in metadata["artifactContract"]},
            {
                "core_message.json": "core_message",
                "style_profile.json": "style_profile",
                "ai_tone_report.json": "ai_tone_report",
                "platform_outputs.json": "style_rewrite_outputs",
                "publishing_plan.json": "publishing_plan",
                "final_distribution_pack.md": "final_distribution_pack",
            },
        )

        self.assertEqual(states["source_content"]["type"], "markdown")
        self.assertEqual(states["session_recall_context"]["type"], "json")
        self.assertEqual(states["core_message"]["type"], "json")
        self.assertEqual(states["style_profile"]["type"], "json")
        self.assertEqual(states["draft_outputs"]["type"], "json")
        self.assertEqual(states["ai_tone_report"]["type"], "json")
        self.assertEqual(states["style_rewrite_outputs"]["type"], "json")
        self.assertNotIn("candidate_plan", states)
        self.assertNotIn("candidate_memories", states)
        self.assertEqual(states["final_distribution_pack"]["type"], "markdown")
        self.assertFalse(any("promptVisible" in definition for definition in states.values()))

        recall_node = nodes["recall_style_memory"]
        self.assertEqual(recall_node["config"]["actionKey"], "buddy_session_recall")
        self.assertEqual(
            recall_node["config"]["actionBindings"][0]["outputMapping"],
            {
                "success": "buddy_session_recall_success",
                "session_recall_context": "session_recall_context",
                "sessions": "recalled_sessions",
                "result": "buddy_session_recall_result",
            },
        )
        self.assertNotIn("prepare_style_memory_candidate", nodes)
        self.assertNotIn("write_style_memory_candidates", nodes)
        self.assertIn("AI 味", nodes["detect_ai_tone"]["config"]["taskInstruction"])
        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            ["output_final_distribution_pack"],
        )
        self.assertEqual(
            _read_contracts(nodes["output_final_distribution_pack"]["reads"]),
            [{"state": "final_distribution_pack", "required": True}],
        )
        self.assertEqual(nodes["output_final_distribution_pack"]["config"]["fileNameTemplate"], "final_distribution_pack.md")

        template_dir = Path(__file__).resolve().parents[2] / "graph_template" / "official" / "multi_platform_content_repurposer"
        self.assertTrue((template_dir / "README.md").is_file())
        self.assertTrue((template_dir / "examples" / "mock_repurposer_input.json").is_file())
        self.assertTrue((template_dir / "mock_data" / "sample_source_content.md").is_file())
        self.assertTrue((template_dir / "artifacts" / "sample_final_distribution_pack.md").is_file())

    def test_multi_platform_content_repurposer_is_runtime_compatible(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "multi_platform_content_repurposer"
        )
        payload = {
            key: value
            for key, value in template.items()
            if key not in {"template_id", "label", "description", "default_graph_name", "source"}
        }
        graph = NodeSystemGraphPayload.model_validate(
            {
                **payload,
                "graph_id": "test_multi_platform_content_repurposer",
                "name": template["default_graph_name"],
            }
        )

        validation = validate_graph(graph)
        self.assertEqual([issue.model_dump() for issue in validation.issues], [])
        self.assertEqual(get_langgraph_runtime_unsupported_reasons(graph), [])

    def test_job_application_interview_coach_contract(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "job_application_interview_coach"
        )
        states = template["state_schema"]
        nodes = template["nodes"]
        metadata = template["metadata"]

        self.assertEqual(metadata["graphProtocol"], "node_system")
        self.assertEqual(metadata["category"], "business")
        self.assertEqual(metadata["requiredActions"], ["buddy_session_recall"])
        self.assertEqual(metadata["requiredPermissions"], ["buddy_session_read"])
        self.assertEqual(metadata["mockMode"]["input"], "examples/mock_job_application_input.json")
        self.assertEqual(
            [item["key"] for item in metadata["inputSchema"]],
            [
                "candidate_profile",
                "resume",
                "project_experiences",
                "job_description",
                "target_city",
                "salary_expectation",
                "interview_transcript",
            ],
        )
        self.assertEqual(
            [item["key"] for item in metadata["outputContract"]],
            [
                "final_application_package",
                "matching_report",
                "rewritten_resume",
                "project_story_library",
                "interview_questions",
                "learning_plan",
            ],
        )
        self.assertTrue(metadata["outputContract"][0]["passThrough"])
        self.assertEqual(
            {item["path"]: item["state"] for item in metadata["artifactContract"]},
            {
                "jd_requirement_matrix.json": "jd_requirements",
                "matching_report.md": "matching_report",
                "gap_analysis.md": "gap_analysis",
                "rewritten_resume.md": "rewritten_resume",
                "project_story_library.json": "project_story_library",
                "interview_questions.json": "interview_questions",
                "mock_interview_feedback.md": "mock_interview_feedback",
                "learning_plan.md": "learning_plan",
                "salary_strategy.md": "salary_strategy",
                "final_application_package.md": "final_application_package",
            },
        )

        for state_name in [
            "candidate_profile",
            "resume",
            "project_experiences",
            "job_description",
            "target_city",
            "salary_expectation",
            "memory_request",
            "final_application_package",
        ]:
            self.assertIn(state_name, states)
        self.assertEqual(states["jd_requirements"]["type"], "json")
        self.assertEqual(states["experience_match_map"]["type"], "json")
        self.assertEqual(states["project_story_library"]["type"], "json")
        self.assertEqual(states["interview_questions"]["type"], "json")
        self.assertEqual(states["final_application_package"]["type"], "markdown")
        self.assertFalse(any("promptVisible" in definition for definition in states.values()))

        recall_node = nodes["recall_candidate_memory"]
        self.assertEqual(recall_node["config"]["actionKey"], "buddy_session_recall")
        self.assertEqual(
            recall_node["config"]["actionBindings"][0]["outputMapping"],
            {
                "success": "buddy_session_recall_success",
                "session_recall_context": "session_recall_context",
                "sessions": "recalled_sessions",
                "result": "buddy_session_recall_result",
            },
        )
        self.assertNotIn("prepare_candidate_memory_plan", nodes)
        self.assertNotIn("write_candidate_memory_candidates", nodes)
        self.assertNotIn("candidate_memory_plan", states)
        self.assertNotIn("candidate_memories", states)
        self.assertIn("不承诺录用", nodes["build_gap_analysis"]["config"]["taskInstruction"])
        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            ["output_final_application_package"],
        )
        self.assertEqual(
            _read_contracts(nodes["output_final_application_package"]["reads"]),
            [{"state": "final_application_package", "required": True}],
        )
        self.assertEqual(nodes["output_final_application_package"]["config"]["fileNameTemplate"], "final_application_package.md")

        template_dir = Path(__file__).resolve().parents[2] / "graph_template" / "official" / "job_application_interview_coach"
        self.assertTrue((template_dir / "README.md").is_file())
        self.assertTrue((template_dir / "examples" / "mock_job_application_input.json").is_file())
        self.assertTrue((template_dir / "mock_data" / "sample_resume.md").is_file())
        self.assertTrue((template_dir / "mock_data" / "sample_job_description.md").is_file())
        self.assertTrue((template_dir / "artifacts" / "sample_final_application_package.md").is_file())

    def test_job_application_interview_coach_is_runtime_compatible(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "job_application_interview_coach"
        )
        payload = {
            key: value
            for key, value in template.items()
            if key not in {"template_id", "label", "description", "default_graph_name", "source"}
        }
        graph = NodeSystemGraphPayload.model_validate(
            {
                **payload,
                "graph_id": "test_job_application_interview_coach",
                "name": template["default_graph_name"],
            }
        )

        validation = validate_graph(graph)
        self.assertEqual([issue.model_dump() for issue in validation.issues], [])
        self.assertEqual(get_langgraph_runtime_unsupported_reasons(graph), [])

    def test_game_creative_factory_contract(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "game_creative_factory"
        )
        states = template["state_schema"]
        nodes = template["nodes"]
        metadata = template["metadata"]

        self.assertEqual(metadata["graphProtocol"], "node_system")
        self.assertEqual(metadata["category"], "business")
        self.assertEqual(metadata["requiredActions"], ["buddy_session_recall"])
        self.assertEqual(metadata["requiredPermissions"], ["buddy_session_read"])
        self.assertEqual(metadata["mockMode"]["input"], "examples/mock_game_creative_input.json")
        self.assertEqual(
            [item["key"] for item in metadata["inputSchema"]],
            [
                "game_genre",
                "game_brief",
                "target_audience",
                "creative_goal",
                "market_notes",
                "competitor_ad_notes",
                "material_analysis",
                "platform_constraints",
                "revision_feedback",
            ],
        )
        self.assertEqual(
            [item["key"] for item in metadata["outputContract"]],
            [
                "final_summary",
                "creative_brief",
                "pattern_summary",
                "script_variants",
                "storyboard_packages",
                "video_prompt_packages",
                "review_results",
                "best_variant",
                "image_generation_todo",
                "video_generation_todo",
            ],
        )
        self.assertTrue(metadata["outputContract"][0]["passThrough"])
        self.assertEqual(
            {item["path"]: item["state"] for item in metadata["artifactContract"]},
            {
                "creative_brief.md": "creative_brief",
                "pattern_summary.md": "pattern_summary",
                "news_context.md": "news_context",
                "script_variants.json": "script_variants",
                "storyboards_showcase.md": "storyboard_packages",
                "video_prompts_showcase.md": "video_prompt_packages",
                "review_results.json": "review_results",
                "best_variant.json": "best_variant",
                "todo_image_generation.md": "image_generation_todo",
                "todo_video_generation.md": "video_generation_todo",
                "final_summary.md": "final_summary",
            },
        )

        for state_name in [
            "game_genre",
            "game_brief",
            "market_notes",
            "competitor_ad_notes",
            "material_analysis",
            "creative_memory_request",
            "clean_news_items",
            "ad_items",
            "video_analysis_results",
            "creative_brief",
            "script_variants",
            "review_results",
            "best_variant",
            "final_summary",
        ]:
            self.assertIn(state_name, states)
        self.assertEqual(states["script_variants"]["type"], "json")
        self.assertEqual(states["review_results"]["type"], "json")
        self.assertEqual(states["best_variant"]["type"], "json")
        self.assertEqual(states["storyboard_packages"]["type"], "markdown")
        self.assertEqual(states["video_prompt_packages"]["type"], "markdown")
        self.assertEqual(states["final_summary"]["type"], "markdown")
        self.assertFalse(any("promptVisible" in definition for definition in states.values()))

        recall_node = nodes["recall_creative_memory"]
        self.assertEqual(recall_node["config"]["actionKey"], "buddy_session_recall")
        self.assertEqual(
            recall_node["config"]["actionBindings"][0]["outputMapping"],
            {
                "success": "buddy_session_recall_success",
                "session_recall_context": "session_recall_context",
                "sessions": "recalled_sessions",
                "result": "buddy_session_recall_result",
            },
        )
        self.assertIn("game_genre", nodes["build_creative_brief"]["config"]["taskInstruction"])
        self.assertIn("平台合规风险", nodes["review_creatives"]["config"]["taskInstruction"])
        self.assertNotIn("prepare_creative_memory_plan", nodes)
        self.assertNotIn("write_creative_memory_candidates", nodes)
        self.assertNotIn("candidate_memories", states)
        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            ["output_final_summary"],
        )
        self.assertEqual(
            _read_contracts(nodes["output_final_summary"]["reads"]),
            [{"state": "final_summary", "required": True}],
        )
        self.assertEqual(nodes["output_final_summary"]["config"]["fileNameTemplate"], "final_summary.md")

        template_dir = Path(__file__).resolve().parents[2] / "graph_template" / "official" / "game_creative_factory"
        self.assertTrue((template_dir / "README.md").is_file())
        self.assertTrue((template_dir / "examples" / "mock_game_creative_input.json").is_file())
        self.assertTrue((template_dir / "mock_data" / "sample_competitor_ads.md").is_file())
        self.assertTrue((template_dir / "mock_data" / "sample_material_analysis.md").is_file())
        self.assertTrue((template_dir / "artifacts" / "sample_final_summary.md").is_file())

    def test_game_creative_factory_is_runtime_compatible(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "game_creative_factory"
        )
        payload = {
            key: value
            for key, value in template.items()
            if key not in {"template_id", "label", "description", "default_graph_name", "source"}
        }
        graph = NodeSystemGraphPayload.model_validate(
            {
                **payload,
                "graph_id": "test_game_creative_factory",
                "name": template["default_graph_name"],
            }
        )

        validation = validate_graph(graph)
        self.assertEqual([issue.model_dump() for issue in validation.issues], [])
        self.assertEqual(get_langgraph_runtime_unsupported_reasons(graph), [])

    def test_product_competitor_research_agent_contract(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "product_competitor_research_agent"
        )
        states = template["state_schema"]
        nodes = template["nodes"]
        metadata = template["metadata"]

        self.assertEqual(metadata["graphProtocol"], "node_system")
        self.assertEqual(metadata["category"], "business")
        self.assertEqual(metadata["requiredActions"], ["buddy_session_recall"])
        self.assertEqual(metadata["requiredPermissions"], ["buddy_session_read"])
        self.assertEqual(metadata["mockMode"]["input"], "examples/mock_product_research_input.json")
        self.assertEqual(
            [item["key"] for item in metadata["inputSchema"]],
            [
                "product_idea",
                "competitor_sources",
                "user_reviews",
                "interview_notes",
                "target_market",
                "research_goal",
                "existing_knowledge_notes",
            ],
        )
        self.assertEqual(
            [item["key"] for item in metadata["outputContract"]],
            [
                "final_research_package",
                "competitor_profiles",
                "feature_matrix",
                "user_review_clusters",
                "pain_points",
                "opportunity_report",
                "mvp_plan",
                "prd_draft",
                "validation_plan",
            ],
        )
        self.assertTrue(metadata["outputContract"][0]["passThrough"])
        self.assertEqual(
            {item["path"]: item["state"] for item in metadata["artifactContract"]},
            {
                "competitor_profiles.json": "competitor_profiles",
                "feature_matrix.csv": "feature_matrix",
                "review_clusters.json": "user_review_clusters",
                "pain_points.md": "pain_points",
                "opportunity_report.md": "opportunity_report",
                "mvp_plan.md": "mvp_plan",
                "prd_draft.md": "prd_draft",
                "validation_plan.md": "validation_plan",
                "final_research_package.md": "final_research_package",
            },
        )

        for state_name in [
            "product_idea",
            "competitor_sources",
            "user_reviews",
            "interview_notes",
            "competitor_profiles",
            "feature_matrix",
            "user_review_clusters",
            "pain_points",
            "opportunity_report",
            "mvp_plan",
            "prd_draft",
            "validation_plan",
            "final_research_package",
        ]:
            self.assertIn(state_name, states)
        self.assertEqual(states["competitor_profiles"]["type"], "json")
        self.assertEqual(states["feature_matrix"]["type"], "markdown")
        self.assertEqual(states["user_review_clusters"]["type"], "json")
        self.assertEqual(states["opportunity_report"]["type"], "markdown")
        self.assertEqual(states["final_research_package"]["type"], "markdown")
        self.assertFalse(any("promptVisible" in definition for definition in states.values()))

        recall_node = nodes["recall_product_memory"]
        self.assertEqual(recall_node["config"]["actionKey"], "buddy_session_recall")
        self.assertEqual(
            recall_node["config"]["actionBindings"][0]["outputMapping"],
            {
                "success": "buddy_session_recall_success",
                "session_recall_context": "session_recall_context",
                "sessions": "recalled_sessions",
                "result": "buddy_session_recall_result",
            },
        )
        self.assertIn("evidence", nodes["build_feature_matrix"]["config"]["taskInstruction"])
        self.assertIn("假设", nodes["draft_prd"]["config"]["taskInstruction"])
        self.assertNotIn("prepare_product_memory_plan", nodes)
        self.assertNotIn("write_product_memory_candidates", nodes)
        self.assertNotIn("candidate_memories", states)
        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            ["output_final_research_package"],
        )
        self.assertEqual(
            _read_contracts(nodes["output_final_research_package"]["reads"]),
            [{"state": "final_research_package", "required": True}],
        )
        self.assertEqual(nodes["output_final_research_package"]["config"]["fileNameTemplate"], "final_research_package.md")

        template_dir = Path(__file__).resolve().parents[2] / "graph_template" / "official" / "product_competitor_research_agent"
        self.assertTrue((template_dir / "README.md").is_file())
        self.assertTrue((template_dir / "examples" / "mock_product_research_input.json").is_file())
        self.assertTrue((template_dir / "mock_data" / "sample_competitor_sources.md").is_file())
        self.assertTrue((template_dir / "mock_data" / "sample_user_reviews.md").is_file())
        self.assertTrue((template_dir / "artifacts" / "sample_final_research_package.md").is_file())

    def test_product_competitor_research_agent_is_runtime_compatible(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "product_competitor_research_agent"
        )
        payload = {
            key: value
            for key, value in template.items()
            if key not in {"template_id", "label", "description", "default_graph_name", "source"}
        }
        graph = NodeSystemGraphPayload.model_validate(
            {
                **payload,
                "graph_id": "test_product_competitor_research_agent",
                "name": template["default_graph_name"],
            }
        )

        validation = validate_graph(graph)
        self.assertEqual([issue.model_dump() for issue in validation.issues], [])
        self.assertEqual(get_langgraph_runtime_unsupported_reasons(graph), [])

    def test_ecommerce_review_mining_agent_contract(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "ecommerce_review_mining_agent"
        )
        states = template["state_schema"]
        nodes = template["nodes"]
        metadata = template["metadata"]

        self.assertEqual(metadata["graphProtocol"], "node_system")
        self.assertEqual(metadata["category"], "business")
        self.assertEqual(metadata["requiredActions"], ["buddy_session_recall"])
        self.assertEqual(metadata["requiredPermissions"], ["buddy_session_read"])
        self.assertEqual(metadata["mockMode"]["input"], "examples/mock_ecommerce_review_input.json")
        self.assertEqual(
            [item["key"] for item in metadata["inputSchema"]],
            [
                "product_context",
                "raw_reviews",
                "competitor_reviews",
                "store_feedback",
                "target_platforms",
                "marketing_goal",
                "compliance_notes",
            ],
        )
        self.assertEqual(
            [item["key"] for item in metadata["outputContract"]],
            [
                "final_review_mining_package",
                "positive_review_clusters",
                "negative_review_clusters",
                "user_persona",
                "purchase_motivation",
                "selling_points",
                "risk_points",
                "product_copy",
                "short_video_scripts",
                "xiaohongshu_notes",
            ],
        )
        self.assertTrue(metadata["outputContract"][0]["passThrough"])
        self.assertEqual(
            {item["path"]: item["state"] for item in metadata["artifactContract"]},
            {
                "positive_review_clusters.json": "positive_review_clusters",
                "negative_review_clusters.json": "negative_review_clusters",
                "user_persona.md": "user_persona",
                "purchase_motivation.md": "purchase_motivation",
                "selling_points.md": "selling_points",
                "risk_points.md": "risk_points",
                "product_copy.md": "product_copy",
                "short_video_scripts.md": "short_video_scripts",
                "xiaohongshu_notes.md": "xiaohongshu_notes",
                "final_review_mining_package.md": "final_review_mining_package",
            },
        )

        for state_name in [
            "product_context",
            "raw_reviews",
            "competitor_reviews",
            "clean_reviews",
            "positive_review_clusters",
            "negative_review_clusters",
            "user_persona",
            "purchase_motivation",
            "selling_points",
            "risk_points",
            "product_copy",
            "short_video_scripts",
            "xiaohongshu_notes",
            "final_review_mining_package",
        ]:
            self.assertIn(state_name, states)
        self.assertEqual(states["clean_reviews"]["type"], "json")
        self.assertEqual(states["positive_review_clusters"]["type"], "json")
        self.assertEqual(states["negative_review_clusters"]["type"], "json")
        self.assertEqual(states["selling_points"]["type"], "markdown")
        self.assertEqual(states["final_review_mining_package"]["type"], "markdown")
        self.assertFalse(any("promptVisible" in definition for definition in states.values()))

        recall_node = nodes["recall_review_memory"]
        self.assertEqual(recall_node["config"]["actionKey"], "buddy_session_recall")
        self.assertEqual(
            recall_node["config"]["actionBindings"][0]["outputMapping"],
            {
                "success": "buddy_session_recall_success",
                "session_recall_context": "session_recall_context",
                "sessions": "recalled_sessions",
                "result": "buddy_session_recall_result",
            },
        )
        self.assertIn("evidence", nodes["extract_selling_and_risk_points"]["config"]["taskInstruction"])
        self.assertIn("合规", nodes["draft_marketing_artifacts"]["config"]["taskInstruction"])
        self.assertNotIn("prepare_review_memory_plan", nodes)
        self.assertNotIn("write_review_memory_candidates", nodes)
        self.assertNotIn("candidate_memories", states)
        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            ["output_final_review_mining_package"],
        )
        self.assertEqual(
            _read_contracts(nodes["output_final_review_mining_package"]["reads"]),
            [{"state": "final_review_mining_package", "required": True}],
        )
        self.assertEqual(nodes["output_final_review_mining_package"]["config"]["fileNameTemplate"], "final_review_mining_package.md")

        template_dir = Path(__file__).resolve().parents[2] / "graph_template" / "official" / "ecommerce_review_mining_agent"
        self.assertTrue((template_dir / "README.md").is_file())
        self.assertTrue((template_dir / "examples" / "mock_ecommerce_review_input.json").is_file())
        self.assertTrue((template_dir / "mock_data" / "sample_reviews.csv").is_file())
        self.assertTrue((template_dir / "mock_data" / "sample_competitor_reviews.md").is_file())
        self.assertTrue((template_dir / "artifacts" / "sample_final_review_mining_package.md").is_file())

    def test_ecommerce_review_mining_agent_is_runtime_compatible(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "ecommerce_review_mining_agent"
        )
        payload = {
            key: value
            for key, value in template.items()
            if key not in {"template_id", "label", "description", "default_graph_name", "source"}
        }
        graph = NodeSystemGraphPayload.model_validate(
            {
                **payload,
                "graph_id": "test_ecommerce_review_mining_agent",
                "name": template["default_graph_name"],
            }
        )

        validation = validate_graph(graph)
        self.assertEqual([issue.model_dump() for issue in validation.issues], [])
        self.assertEqual(get_langgraph_runtime_unsupported_reasons(graph), [])

    def test_toograph_action_creation_workflow_contract(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "toograph_action_creation_workflow"
        )
        states = template["state_schema"]
        nodes = template["nodes"]

        self.assertEqual(template["metadata"]["graphProtocol"], "node_system")
        self.assertNotIn("interrupt_after", template["metadata"])
        self.assertNotIn("agent_breakpoint_timing", template["metadata"])
        self.assertEqual(states["target_action_key"]["type"], "text")
        self.assertEqual(states["existing_action_package_success"]["type"], "boolean")
        self.assertEqual(states["existing_action_package"]["type"], "json")
        self.assertEqual(states["existing_action_package_result"]["type"], "markdown")
        self.assertNotIn("existing_capability", states)
        self.assertNotIn("existing_capability_found", states)
        self.assertEqual(states["capability_gap"]["type"], "json")
        self.assertEqual(states["generated_action_key"]["type"], "text")
        self.assertEqual(states["generated_action_json"]["type"], "json")
        self.assertEqual(states["generated_action_md"]["type"], "markdown")
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

        self.assertNotIn("select_existing_capability", nodes)
        self.assertNotIn("merge_clarification", nodes)
        self.assertNotIn("review_example_feedback", nodes)
        self.assertNotIn("examples_approved", nodes)
        self.assertNotIn("clarification_answer", states)
        self.assertNotIn("example_feedback", states)
        self.assertNotIn("example_decision", states)
        for node_id in ["review_requirement", "ask_clarification", "finalize_no_create"]:
            with self.subTest(capability_context_reader=node_id):
                self.assertNotIn("existing_capability", [read["state"] for read in nodes[node_id]["reads"]])
        self.assertNotIn({"state": "existing_capability_found", "required": False}, _read_contracts(nodes["review_requirement"]["reads"]))
        package_reader_node = nodes["read_existing_action_package"]
        self.assertEqual(package_reader_node["kind"], "agent")
        self.assertEqual(package_reader_node["config"]["actionKey"], "toograph_action_package_reader")
        self.assertEqual(
            package_reader_node["config"]["actionBindings"],
            [
                {
                    "actionKey": "toograph_action_package_reader",
                    "outputMapping": {
                        "success": "existing_action_package_success",
                        "action_package": "existing_action_package",
                        "result": "existing_action_package_result",
                    },
                }
            ],
        )
        self.assertIn({"state": "existing_action_package", "required": False}, _read_contracts(nodes["review_requirement"]["reads"]))
        self.assertIn("改进已有 Action", nodes["review_requirement"]["config"]["taskInstruction"])
        self.assertIn({"state": "existing_action_package", "required": False}, _read_contracts(nodes["prepare_builder_context"]["reads"]))
        self.assertIn("existing_action_package", nodes["prepare_builder_context"]["config"]["taskInstruction"])

        builder_node = nodes["build_action_files"]
        self.assertEqual(builder_node["kind"], "agent")
        self.assertEqual(builder_node["config"]["actionKey"], "toograph_action_builder")
        self.assertEqual(
            builder_node["config"]["actionBindings"],
            [
                {
                    "actionKey": "toograph_action_builder",
                    "outputMapping": {
                        "action_key": "generated_action_key",
                        "action_json": "generated_action_json",
                        "action_md": "generated_action_md",
                        "before_llm_py": "generated_before_llm_py",
                        "after_llm_py": "generated_after_llm_py",
                        "requirements_txt": "generated_requirements_txt",
                    },
                }
            ],
        )

        tester_node = nodes["run_script_test"]
        self.assertEqual(tester_node["kind"], "agent")
        self.assertEqual(tester_node["config"]["actionKey"], "toograph_script_tester")
        self.assertEqual(
            tester_node["config"]["actionBindings"][0]["outputMapping"],
            {
                "success": "script_test_success",
                "result": "script_test_result",
            },
        )

        executor_nodes = {
            node_id
            for node_id, node in nodes.items()
            if node["kind"] == "agent" and node["config"].get("actionKey") == "local_workspace_executor"
        }
        self.assertEqual(
            executor_nodes,
            {
                "write_action_json",
                "write_action_md",
                "write_before_llm_py",
                "write_after_llm_py",
                "write_requirements_txt",
            },
        )
        for node_id in executor_nodes:
            with self.subTest(node_id=node_id):
                self.assertEqual(
                    nodes[node_id]["config"]["actionBindings"][0]["outputMapping"],
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

        review_node = nodes["review_generated_action"]
        self.assertNotIn("批准写入", review_node["config"]["taskInstruction"])
        self.assertIn("运行时权限", review_node["config"]["taskInstruction"])
        self.assertIn({"source": "review_generated_action", "target": "write_action_json"}, template["edges"])
        self.assertNotIn("review_write_approval", nodes)
        self.assertNotIn("write_approved", nodes)
        self.assertNotIn("finalize_no_write", nodes)

        self.assertEqual(
            nodes["need_clarification"]["config"]["rule"],
            {"source": "$state.requirement_review.needs_clarification", "operator": "==", "value": True},
        )
        self.assertEqual(
            nodes["ask_clarification"]["writes"],
            [
                {"state": "clarification_questions", "mode": "replace"},
                {"state": "final_summary", "mode": "replace"},
            ],
        )
        self.assertIn({"source": "ask_clarification", "target": "output_final"}, template["edges"])
        self.assertIn({"source": "input_target_action_key", "target": "read_existing_action_package"}, template["edges"])
        self.assertNotIn({"source": "input_action_request", "target": "select_existing_capability"}, template["edges"])
        self.assertNotIn({"source": "select_existing_capability", "target": "review_requirement"}, template["edges"])
        self.assertIn({"source": "read_existing_action_package", "target": "review_requirement"}, template["edges"])
        self.assertIn({"source": "draft_example_io", "target": "prepare_builder_context"}, template["edges"])
        self.assertNotIn({"source": "draft_example_io", "target": "review_example_feedback"}, template["edges"])
        self.assertTrue(nodes)
        for node_id, node in nodes.items():
            with self.subTest(node_id=node_id):
                self.assertIsNone(node["ui"].get("size"))

        condition_node_ids = [node_id for node_id, node in nodes.items() if node["kind"] == "condition"]
        self.assertEqual(
            condition_node_ids,
            [
                "need_clarification",
                "should_create_action",
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
            nodes["script_test_passed"]["config"]["rule"],
            {"source": "$state.script_test_success", "operator": "==", "value": True},
        )
        self.assertEqual(nodes["script_test_passed"]["config"]["loopLimit"], 3)

        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            ["output_final"],
        )
        self.assertEqual(_read_contracts(nodes["output_final"]["reads"]), [{"state": "final_summary", "required": True}])

    def test_toograph_action_creation_workflow_is_runtime_compatible(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "toograph_action_creation_workflow"
        )
        payload = {
            key: value
            for key, value in template.items()
            if key not in {"template_id", "label", "description", "default_graph_name", "source"}
        }
        graph = NodeSystemGraphPayload.model_validate(
            {
                **payload,
                "graph_id": "test_toograph_action_creation_workflow",
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
            {"script_test_passed": 3},
        )

    def test_toograph_graph_template_creation_workflow_contract(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "toograph_graph_template_creation_workflow"
        )
        states = template["state_schema"]
        nodes = template["nodes"]

        self.assertEqual(template["metadata"]["graphProtocol"], "node_system")
        self.assertEqual(template["metadata"]["category"], "graph_template")
        self.assertNotIn("interrupt_after", template["metadata"])
        self.assertEqual(states["template_request"]["type"], "text")
        self.assertEqual(states["target_template_id"]["type"], "text")
        self.assertEqual(states["capability_gap"]["type"], "json")
        self.assertEqual(states["existing_template_success"]["type"], "boolean")
        self.assertEqual(states["existing_template_package"]["type"], "json")
        self.assertEqual(states["existing_template_result"]["type"], "markdown")
        self.assertEqual(states["graph_diff_draft"]["type"], "json")
        self.assertEqual(states["template_preview"]["type"], "markdown")
        self.assertEqual(states["generated_template_id"]["type"], "text")
        self.assertEqual(states["generated_template_json"]["type"], "json")
        self.assertEqual(states["validation_success"]["type"], "boolean")
        self.assertEqual(states["validation_report"]["type"], "json")
        self.assertEqual(states["write_template_success"]["type"], "boolean")
        self.assertEqual(states["write_template_result"]["type"], "markdown")
        self.assertEqual(states["written_template_path"]["type"], "text")
        self.assertEqual(states["written_template_revision_id"]["type"], "text")
        self.assertEqual(states["test_run_decision"]["type"], "json")
        self.assertEqual(states["template_test_goal"]["type"], "text")
        self.assertEqual(states["test_run_public_response"]["type"], "markdown")
        self.assertEqual(states["test_run_report"]["type"], "json")
        self.assertEqual(states["final_summary"]["type"], "markdown")

        reader_node = nodes["read_existing_template"]
        self.assertEqual(reader_node["kind"], "agent")
        self.assertEqual(reader_node["config"]["actionKey"], "toograph_graph_template_reader")
        self.assertEqual(
            reader_node["config"]["actionBindings"][0]["outputMapping"],
            {
                "success": "existing_template_success",
                "template_package": "existing_template_package",
                "result": "existing_template_result",
            },
        )

        validator_node = nodes["validate_template_json"]
        self.assertEqual(validator_node["kind"], "agent")
        self.assertEqual(validator_node["config"]["actionKey"], "toograph_graph_template_validator")
        self.assertEqual(
            validator_node["config"]["actionBindings"][0]["outputMapping"],
            {
                "success": "validation_success",
                "validation_report": "validation_report",
            },
        )

        writer_node = nodes["write_template_json"]
        self.assertEqual(writer_node["kind"], "agent")
        self.assertEqual(writer_node["config"]["actionKey"], "toograph_graph_template_writer")
        self.assertEqual(
            writer_node["config"]["actionBindings"][0]["outputMapping"],
            {
                "success": "write_template_success",
                "result": "write_template_result",
                "template_id": "written_template_id",
                "template_path": "written_template_path",
                "revision_id": "written_template_revision_id",
            },
        )
        self.assertIn("需确认", writer_node["config"]["taskInstruction"])
        self.assertIn("graph_template/user", writer_node["config"]["taskInstruction"])

        review_node = nodes["review_generated_template"]
        self.assertIn("graph_diff_draft", review_node["config"]["taskInstruction"])
        self.assertIn("template_preview", review_node["config"]["taskInstruction"])
        self.assertIn("validation_report", review_node["config"]["taskInstruction"])

        test_run_node = nodes["run_template_test"]
        self.assertEqual(test_run_node["kind"], "subgraph")
        self.assertEqual(test_run_node["config"]["graph"]["metadata"]["role"], "page_operation_workflow")
        self.assertEqual(_read_contracts(test_run_node["reads"]), [{"state": "template_test_goal", "required": True}])
        self.assertEqual(
            test_run_node["writes"],
            [
                {"state": "test_run_public_response", "mode": "replace"},
                {"state": "test_run_report", "mode": "replace"},
            ],
        )

        self.assertIn({"source": "input_target_template_id", "target": "read_existing_template"}, template["edges"])
        self.assertIn({"source": "read_existing_template", "target": "review_template_requirement"}, template["edges"])
        self.assertIn({"source": "validate_template_json", "target": "validation_passed"}, template["edges"])
        self.assertIn({"source": "review_generated_template", "target": "write_template_json"}, template["edges"])
        self.assertIn({"source": "write_template_json", "target": "should_run_template_test"}, template["edges"])
        self.assertIn({"source": "run_template_test", "target": "finalize_written_template"}, template["edges"])
        self.assertEqual(
            nodes["validation_passed"]["config"]["rule"],
            {"source": "$state.validation_success", "operator": "==", "value": True},
        )
        self.assertEqual(nodes["validation_passed"]["config"]["loopLimit"], 3)
        self.assertEqual(
            nodes["should_run_template_test"]["config"]["rule"],
            {"source": "$state.test_run_decision.should_run", "operator": "==", "value": True},
        )
        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            ["output_final"],
        )
        self.assertEqual(_read_contracts(nodes["output_final"]["reads"]), [{"state": "final_summary", "required": True}])

    def test_toograph_graph_template_creation_workflow_is_runtime_compatible(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "toograph_graph_template_creation_workflow"
        )
        payload = {
            key: value
            for key, value in template.items()
            if key not in {"template_id", "label", "description", "default_graph_name", "source"}
        }
        graph = NodeSystemGraphPayload.model_validate(
            {
                **payload,
                "graph_id": "test_toograph_graph_template_creation_workflow",
                "name": template["default_graph_name"],
            }
        )

        validation = validate_graph(graph)
        self.assertEqual([issue.model_dump() for issue in validation.issues], [])
        self.assertEqual(get_langgraph_runtime_unsupported_reasons(graph), [])

        cycle_tracker = build_langgraph_cycle_tracker(graph, build_execution_edges(graph))
        self.assertTrue(cycle_tracker["has_cycle"])
        self.assertEqual(cycle_tracker["loop_limits_by_source"], {"validation_passed": 3})

    def test_buddy_autonomous_loop_contract(self) -> None:
        template = next(record for record in _official_template_records() if record["template_id"] == "buddy_autonomous_loop")
        states = template["state_schema"]
        nodes = template["nodes"]

        self.assertEqual(template["metadata"]["graphProtocol"], "node_system")
        self.assertEqual(template["metadata"]["origin"], "buddy")
        self.assertEqual(template["metadata"]["role"], "buddy_autonomous_loop")
        self.assertEqual(template["metadata"]["requiredActions"], ["toograph_capability_selector", "buddy_session_recall"])
        self.assertEqual(
            template["metadata"]["requiredTools"],
            ["buddy_history_context_loader", "buddy_context_pressure_check"],
        )
        self.assertEqual(template["metadata"]["buddyRuntimeInputBindings"], {"input_user_message": "current_message"})
        self.assertEqual(
            set(states),
            {
                "user_message",
                "conversation_history",
                "buddy_context",
                "needs_context_compaction",
                "needs_capability",
                "selected_capability",
                "capability_result",
                "show_result_package",
                "public_response",
            },
        )
        expected_state_types = {
            "user_message": "text",
            "conversation_history": "json",
            "buddy_context": "file",
            "needs_context_compaction": "boolean",
            "needs_capability": "boolean",
            "selected_capability": "capability",
            "capability_result": "result_package",
            "show_result_package": "boolean",
            "public_response": "markdown",
        }
        for state_key, expected_type in expected_state_types.items():
            with self.subTest(state_key=state_key):
                self.assertEqual(states[state_key]["type"], expected_type)
        self.assertEqual(
            [state_key for state_key in states if state_key in {"needs_capability", "selected_capability"}],
            ["needs_capability", "selected_capability"],
        )
        self.assertEqual(states["needs_capability"]["binding"]["fieldKey"], "needs_capability")
        self.assertEqual(states["selected_capability"]["binding"]["fieldKey"], "capability")
        self.assertEqual(states["conversation_history"]["binding"]["kind"], "tool_output")
        self.assertEqual(states["conversation_history"]["binding"]["toolKey"], "buddy_history_context_loader")
        self.assertEqual(states["conversation_history"]["binding"]["nodeId"], "load_history_context")
        self.assertIsNone(states["buddy_context"]["binding"])
        self.assertIsNone(states["show_result_package"]["binding"])
        self.assertIsNone(states["public_response"]["binding"])
        self.assertEqual(states["needs_context_compaction"]["binding"]["fieldKey"], "needs_context_compaction")
        self.assertEqual(states["capability_result"]["name"], "结果包")
        for removed_state_key in [
            "request_understanding",
            "task_plan",
            "should_call_capability",
            "capability_found",
            "capability_gap",
            "capability_builder_handoff",
            "capability_review",
            "visible_reply",
            "raw_conversation_history",
            "page_context",
            "agent_loop_control",
            "agent_loop_report",
            "agent_loop_stop_reason",
            "agent_loop_should_continue",
            "agent_loop_should_retry",
            "capability_trace",
            "capability_selection_reason",
            "current_session_id",
            "existing_session_summary",
            "source_run_id",
            "history_context_report",
            "context_budget_report",
            "context_compaction_trigger",
            "context_compaction_report",
            "context_compaction_summary",
            "context_compaction_write_result",
        ]:
            self.assertNotIn(removed_state_key, states)

        self.assertEqual(states["buddy_context"]["type"], "file")
        self.assertEqual(
            states["buddy_context"]["value"],
            {
                "kind": "local_folder",
                "root": "buddy_home",
                "selected": ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md"],
            },
        )
        self.assertEqual(
            set(nodes),
            {
                "input_user_message",
                "load_history_context",
                "input_buddy_context",
                "check_context_pressure",
                "context_pressure_condition",
                "run_context_compaction",
                "reply_and_select_capability",
                "condition_93972e3f",
                "condition_3706cb6e",
                "execute_capability",
                "output_ab549b8d",
                "output_161c76f3",
            },
        )
        self.assertEqual([node_id for node_id, node in nodes.items() if node["kind"] == "subgraph"], ["run_context_compaction"])
        self.assertEqual(nodes["load_history_context"]["kind"], "tool")
        self.assertEqual(nodes["load_history_context"]["name"], "获取历史会话")
        self.assertEqual(nodes["load_history_context"]["config"]["toolKey"], "buddy_history_context_loader")
        self.assertEqual(nodes["check_context_pressure"]["kind"], "tool")
        self.assertEqual(nodes["check_context_pressure"]["config"]["toolKey"], "buddy_context_pressure_check")
        self.assertNotIn("load_buddy_home_context", nodes)
        self.assertEqual(nodes["run_context_compaction"]["config"]["graph"]["metadata"]["role"], "buddy_context_compaction")
        self.assertEqual(nodes["reply_and_select_capability"]["kind"], "agent")
        self.assertEqual(nodes["execute_capability"]["kind"], "agent")
        self.assertEqual(nodes["context_pressure_condition"]["kind"], "condition")
        self.assertEqual(nodes["condition_93972e3f"]["kind"], "condition")
        self.assertEqual(nodes["condition_3706cb6e"]["kind"], "condition")
        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            ["output_ab549b8d", "output_161c76f3"],
        )
        self.assertEqual(_read_contracts(nodes["output_161c76f3"]["reads"]), [{"state": "public_response", "required": True}])
        self.assertEqual(
            _read_contracts(nodes["output_ab549b8d"]["reads"]),
            [{"state": "capability_result", "required": True}],
        )
        expected_positions = {
            "input_user_message": {"x": -1208, "y": 27},
            "load_history_context": {"x": -520, "y": 109},
            "input_buddy_context": {"x": -1211, "y": 751},
            "check_context_pressure": {"x": 216, "y": 109},
            "context_pressure_condition": {"x": 877, "y": 237},
            "run_context_compaction": {"x": 1601, "y": -841},
            "reply_and_select_capability": {"x": 2362, "y": 203},
            "condition_93972e3f": {"x": 3200, "y": 529},
            "condition_3706cb6e": {"x": 3962, "y": 854},
            "execute_capability": {"x": 4790, "y": 452},
            "output_ab549b8d": {"x": 5661, "y": -376},
            "output_161c76f3": {"x": 4783, "y": -414},
        }
        for node_id, expected_position in expected_positions.items():
            with self.subTest(layout_node=node_id):
                self.assertEqual(nodes[node_id]["ui"]["position"], expected_position)

        selector_node = nodes["reply_and_select_capability"]
        self.assertEqual(selector_node["config"]["actionKey"], "toograph_capability_selector")
        self.assertEqual(
            selector_node["config"]["actionBindings"],
            [
                {
                    "actionKey": "toograph_capability_selector",
                    "outputMapping": {
                        "needs_capability": "needs_capability",
                        "capability": "selected_capability",
                    },
                }
            ],
        )
        self.assertEqual(
            list(selector_node["config"]["actionBindings"][0]["outputMapping"]),
            ["needs_capability", "capability"],
        )
        selector_action_inputs = [
            read
            for read in selector_node["reads"]
            if isinstance(read.get("binding"), dict) and read["binding"].get("kind") == "action_input"
        ]
        self.assertEqual(
            selector_action_inputs,
            [],
        )
        self.assertIn({"state": "user_message", "required": True}, _read_contracts(selector_node["reads"]))
        self.assertIn({"state": "conversation_history", "required": False}, _read_contracts(selector_node["reads"]))
        self.assertNotIn({"state": "context_compaction_summary", "required": False}, _read_contracts(selector_node["reads"]))
        self.assertNotIn({"state": "context_compaction_report", "required": False}, _read_contracts(selector_node["reads"]))
        self.assertIn({"state": "buddy_context", "required": False}, _read_contracts(selector_node["reads"]))
        self.assertIn({"state": "capability_result", "required": False}, _read_contracts(selector_node["reads"]))
        for read in selector_node["reads"]:
            self.assertNotIn(
                read.get("state"),
                {
                    "raw_conversation_history",
                    "page_context",
                    "agent_loop_control",
                    "agent_loop_report",
                    "capability_trace",
                    "existing_session_summary",
                    "current_session_id",
                    "source_run_id",
                    "history_context_report",
                    "context_compaction_summary",
                    "context_compaction_report",
                },
            )
        self.assertEqual(
            selector_node["writes"],
            [
                {"state": "public_response", "mode": "replace"},
                {"state": "needs_capability", "mode": "replace"},
                {"state": "selected_capability", "mode": "replace"},
            ],
        )
        self.assertNotIn("show_result_package", selector_node["config"]["taskInstruction"])
        self.assertNotIn(
            "show_result_package",
            selector_node["config"]["actionInstructionBlocks"]["toograph_capability_selector"]["content"],
        )
        self.assertNotIn("capability_trace", selector_node["config"]["taskInstruction"])
        self.assertNotIn(
            "capability_trace",
            selector_node["config"]["actionInstructionBlocks"]["toograph_capability_selector"]["content"],
        )
        self.assertNotIn("context_compaction_summary", selector_node["config"]["taskInstruction"])
        self.assertNotIn(
            "context_compaction_summary",
            selector_node["config"]["actionInstructionBlocks"]["toograph_capability_selector"]["content"],
        )
        self.assertNotIn("context_compaction_report", selector_node["config"]["taskInstruction"])
        self.assertIn("capability.kind=none", selector_node["config"]["taskInstruction"])
        self.assertIn("public_response and needs_capability/capability", selector_node["config"]["taskInstruction"])
        self.assertIn("buddy_session_recall", selector_node["config"]["taskInstruction"])
        self.assertIn("conversation_history metadata", selector_node["config"]["taskInstruction"])
        self.assertIn(
            "buddy_session_recall",
            selector_node["config"]["actionInstructionBlocks"]["toograph_capability_selector"]["content"],
        )

        execute_node = nodes["execute_capability"]
        self.assertEqual(execute_node["config"]["actionKey"], "")
        self.assertIn({"state": "selected_capability", "required": True}, _read_contracts(execute_node["reads"]))
        self.assertIn({"state": "user_message", "required": True}, _read_contracts(execute_node["reads"]))
        for read in execute_node["reads"]:
            self.assertNotIn(read.get("state"), {"capability_trace", "current_session_id"})
        self.assertEqual(execute_node["writes"], [{"state": "capability_result", "mode": "replace"}])
        self.assertIn("selected_capability.kind=action/subgraph/tool", execute_node["config"]["taskInstruction"])
        self.assertIn("buddy_session_recall", execute_node["config"]["taskInstruction"])
        self.assertNotIn("capability_trace", execute_node["config"]["taskInstruction"])
        self.assertIn("result_package", execute_node["config"]["taskInstruction"])

        direct_condition_node = nodes["condition_93972e3f"]
        self.assertEqual(direct_condition_node["config"]["loopLimit"], 5)
        self.assertEqual(
            direct_condition_node["config"]["rule"],
            {"source": "$state.show_result_package", "operator": "==", "value": True},
        )
        self.assertIn({"state": "show_result_package", "required": True}, _read_contracts(direct_condition_node["reads"]))
        condition_node = nodes["condition_3706cb6e"]
        self.assertEqual(condition_node["config"]["loopLimit"], 100)
        self.assertEqual(
            condition_node["config"]["rule"],
            {"source": "$state.needs_capability", "operator": "==", "value": True},
        )
        self.assertIn({"state": "needs_capability", "required": True}, _read_contracts(condition_node["reads"]))
        pressure_node = nodes["context_pressure_condition"]
        self.assertEqual(pressure_node["config"]["loopLimit"], 10)
        self.assertEqual(
            pressure_node["config"]["rule"],
            {"source": "$state.needs_context_compaction", "operator": "==", "value": True},
        )
        self.assertIn({"state": "needs_context_compaction", "required": True}, _read_contracts(pressure_node["reads"]))
        for read in nodes["check_context_pressure"]["reads"]:
            self.assertNotIn(read.get("state"), {"raw_conversation_history", "page_context"})
            self.assertIsNone(read.get("binding"))
        self.assertEqual(
            _read_contracts(nodes["check_context_pressure"]["reads"]),
            [
                {"state": "user_message", "required": True},
                {"state": "conversation_history", "required": False},
                {"state": "buddy_context", "required": False},
                {"state": "capability_result", "required": False},
            ],
        )
        self.assertEqual(nodes["check_context_pressure"]["config"].get("dynamicStateInputs"), True)
        self.assertEqual(
            nodes["check_context_pressure"]["writes"],
            [{"state": "needs_context_compaction", "mode": "replace"}],
        )
        self.assertEqual(_read_contracts(nodes["load_history_context"]["reads"]), [])
        self.assertEqual(
            nodes["load_history_context"]["writes"],
            [
                {"state": "conversation_history", "mode": "replace"},
            ],
        )
        self.assertEqual(
            nodes["input_buddy_context"]["writes"],
            [{"state": "buddy_context", "mode": "replace"}],
        )
        self.assertEqual(
            nodes["run_context_compaction"]["writes"],
            [{"state": "conversation_history", "mode": "replace"}],
        )
        self.assertEqual(
            _read_contracts(nodes["run_context_compaction"]["reads"]),
            [{"state": "conversation_history", "required": True}],
        )
        compaction_graph = nodes["run_context_compaction"]["config"]["graph"]
        self.assertEqual(compaction_graph["metadata"]["requiredTools"], ["buddy_history_context_loader"])
        self.assertEqual(compaction_graph["state_schema"]["conversation_history"]["type"], "json")
        self.assertEqual(
            compaction_graph["state_schema"]["conversation_history"]["binding"],
            {
                "kind": "tool_output",
                "actionKey": "",
                "toolKey": "buddy_history_context_loader",
                "nodeId": "reload_conversation_history",
                "fieldKey": "conversation_history",
                "managed": True,
            },
        )
        self.assertEqual(compaction_graph["nodes"]["reload_conversation_history"]["kind"], "tool")
        self.assertEqual(
            compaction_graph["nodes"]["reload_conversation_history"]["config"]["toolKey"],
            "buddy_history_context_loader",
        )
        self.assertEqual(_read_contracts(compaction_graph["nodes"]["reload_conversation_history"]["reads"]), [])
        self.assertEqual(
            compaction_graph["nodes"]["reload_conversation_history"]["writes"],
            [{"state": "conversation_history", "mode": "replace"}],
        )
        self.assertEqual(
            [node_id for node_id, node in compaction_graph["nodes"].items() if node["kind"] == "output"],
            ["output_conversation_history"],
        )
        self.assertEqual(
            _read_contracts(compaction_graph["nodes"]["output_conversation_history"]["reads"]),
            [{"state": "conversation_history", "required": True}],
        )
        self.assertIn(
            {"source": "write_session_summary", "target": "reload_conversation_history"},
            compaction_graph["edges"],
        )
        self.assertIn(
            {"source": "reload_conversation_history", "target": "output_conversation_history"},
            compaction_graph["edges"],
        )
        for removed_node_id in [
            "input_trigger",
            "input_user_message",
            "input_buddy_context",
            "input_context_budget_report",
            "input_capability_result",
            "input_public_response",
            "output_compaction_report",
            "output_session_summary_candidate",
            "output_session_summary_write_result",
        ]:
            self.assertNotIn(removed_node_id, compaction_graph["nodes"])
        for node_id in ["plan_compaction", "summarize_context"]:
            for read in compaction_graph["nodes"][node_id]["reads"]:
                self.assertIn(read["state"], {"conversation_history", "compaction_plan"})
        self.assertEqual(
            compaction_graph["conditional_edges"],
            [
                {
                    "source": "has_summary_update",
                    "branches": {
                        "true": "write_session_summary",
                        "false": "reload_conversation_history",
                        "exhausted": "reload_conversation_history",
                    },
                }
            ],
        )
        self.assertEqual(
            template["edges"],
            [
                {"source": "input_user_message", "target": "check_context_pressure"},
                {"source": "load_history_context", "target": "check_context_pressure"},
                {"source": "input_buddy_context", "target": "check_context_pressure"},
                {"source": "check_context_pressure", "target": "context_pressure_condition"},
                {"source": "run_context_compaction", "target": "reply_and_select_capability"},
                {"source": "execute_capability", "target": "check_context_pressure"},
                {"source": "reply_and_select_capability", "target": "output_161c76f3"},
                {"source": "reply_and_select_capability", "target": "condition_93972e3f"},
            ],
        )
        self.assertEqual(
            template["conditional_edges"],
            [
                {
                    "source": "context_pressure_condition",
                    "branches": {
                        "true": "run_context_compaction",
                        "false": "reply_and_select_capability",
                        "exhausted": "reply_and_select_capability",
                    },
                },
                {
                    "source": "condition_93972e3f",
                    "branches": {
                        "true": "output_ab549b8d",
                        "false": "condition_3706cb6e",
                        "exhausted": "condition_3706cb6e",
                    },
                },
                {
                    "source": "condition_3706cb6e",
                    "branches": {
                        "true": "execute_capability",
                        "false": "output_161c76f3",
                        "exhausted": "output_161c76f3",
                    },
                },
            ],
        )
        expected_sizes = {
            "reply_and_select_capability": {"width": 612, "height": 760},
        }
        for node_id, node in nodes.items():
            with self.subTest(top_level_node=node_id):
                self.assertEqual(node["ui"].get("size"), expected_sizes.get(node_id))

        self.assertNotIn("pack_context", nodes)
        self.assertNotIn("input_conversation_history", nodes)
        self.assertNotIn("input_current_session_id", nodes)
        self.assertNotIn("input_existing_session_summary", nodes)
        buddy_context_node = nodes["input_buddy_context"]
        self.assertEqual(buddy_context_node["kind"], "input")
        self.assertEqual(buddy_context_node["config"]["boundaryType"], "file")
        self.assertEqual(buddy_context_node["config"]["value"]["kind"], "local_folder")
        self.assertEqual(buddy_context_node["config"]["value"]["root"], "buddy_home")
        self.assertEqual(
            buddy_context_node["config"]["value"]["selected"],
            ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md"],
        )
        self.assertNotIn("page_context", json.dumps(template, ensure_ascii=False))
        self.assertNotIn("raw_conversation_history", json.dumps(template, ensure_ascii=False))

    def test_buddy_support_templates_do_not_inject_policy_json(self) -> None:
        for template_id in sorted(BUDDY_SUPPORT_TEMPLATE_IDS | {"buddy_autonomous_loop"}):
            with self.subTest(template_id=template_id):
                template = load_template_record(template_id)
                self.assertNotIn("policy.json", json.dumps(template, ensure_ascii=False))

    def test_buddy_support_templates_are_visible_and_loadable(self) -> None:
        public_template_ids = {record["template_id"] for record in _visible_official_template_records()}

        self.assertTrue(BUDDY_SUPPORT_TEMPLATE_IDS.issubset(public_template_ids))
        for template_id in sorted(BUDDY_SUPPORT_TEMPLATE_IDS):
            with self.subTest(template_id=template_id):
                template = load_template_record(template_id)
                self.assertEqual(template["template_id"], template_id)
                self.assertNotIn("internal", template["metadata"])
                self.assertEqual(template["metadata"]["graphProtocol"], "node_system")
                self.assertIs(template["capabilityDiscoverable"], False)
                payload = {
                    key: value
                    for key, value in template.items()
                    if key not in {"template_id", "label", "description", "default_graph_name", "source"}
                }
                graph = NodeSystemGraphPayload.model_validate(
                    {
                        **payload,
                        "graph_id": f"test_{template_id}",
                        "name": template["default_graph_name"],
                    }
                )
                validation = validate_graph(graph)
                self.assertEqual([issue.model_dump() for issue in validation.issues], [])
                self.assertEqual(get_langgraph_runtime_unsupported_reasons(graph), [])

    def test_buddy_main_loop_is_a_flat_visible_capability_loop(self) -> None:
        template = load_template_record("buddy_autonomous_loop")

        self.assertEqual(
            [node_id for node_id, node in template["nodes"].items() if node["kind"] == "subgraph"],
            ["run_context_compaction"],
        )
        self.assertEqual(template["nodes"]["run_context_compaction"]["config"]["graph"]["metadata"]["role"], "buddy_context_compaction")
        self.assertNotIn("buddy_turn_intake", template["nodes"])
        self.assertNotIn("buddy_capability_loop", template["nodes"])

    def test_toograph_page_operation_workflow_contract(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "toograph_page_operation_workflow"
        )
        states = template["state_schema"]
        nodes = template["nodes"]

        self.assertEqual(template["metadata"]["graphProtocol"], "node_system")
        self.assertEqual(template["metadata"]["role"], "page_operation_workflow")
        self.assertEqual(template["metadata"]["pageOperationTemplate"], True)
        self.assertEqual(
            set(states),
            {
                "user_goal",
                "page_operation_context",
                "operation_error",
                "operation_result",
                "goal_review",
                "loop_trace",
                "public_response",
                "operation_report",
            },
        )
        self.assertEqual(states["user_goal"]["type"], "text")
        self.assertEqual(states["page_operation_context"]["type"], "json")
        self.assertEqual(states["operation_report"]["type"], "json")

        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "input"],
            ["input_user_goal"],
        )
        self.assertEqual([node_id for node_id, node in nodes.items() if node["kind"] == "subgraph"], [])
        self.assertTrue(all("graph" not in (node.get("config") or {}) for node in nodes.values()))
        self.assertEqual(
            list(nodes),
            [
                "input_user_goal",
                "execute_page_operation",
                "verify_goal_against_refreshed_context",
                "continue_operation_loop",
                "draft_public_response",
                "output_public_response",
                "output_operation_report",
            ],
        )
        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            ["output_public_response", "output_operation_report"],
        )
        for debug_output_id in [
            "output_operation_request",
            "output_operation_ok",
            "output_operation_request_id",
            "output_operation_journal",
            "output_operation_error",
            "output_operation_result",
            "output_page_snapshot",
            "output_goal_review",
            "output_loop_trace",
            "classify_goal",
            "plan_next_operation",
        ]:
            self.assertNotIn(debug_output_id, nodes)
        self.assertEqual(_read_contracts(nodes["output_public_response"]["reads"]), [{"state": "public_response", "required": True}])
        self.assertEqual(_read_contracts(nodes["output_operation_report"]["reads"]), [{"state": "operation_report", "required": False}])
        self.assertEqual(
            template["edges"],
            [
                {"source": "input_user_goal", "target": "execute_page_operation"},
                {"source": "execute_page_operation", "target": "verify_goal_against_refreshed_context"},
                {"source": "verify_goal_against_refreshed_context", "target": "continue_operation_loop"},
                {"source": "draft_public_response", "target": "output_public_response"},
                {"source": "draft_public_response", "target": "output_operation_report"},
            ],
        )
        self.assertEqual(
            template["conditional_edges"],
            [
                {
                    "source": "continue_operation_loop",
                    "branches": {
                        "true": "execute_page_operation",
                        "false": "draft_public_response",
                        "exhausted": "draft_public_response",
                    },
                }
            ],
        )
        self.assertEqual(nodes["continue_operation_loop"]["config"]["loopLimit"], 6)
        self.assertEqual(
            nodes["continue_operation_loop"]["config"]["rule"],
            {"source": "$state.goal_review.needs_more_operations", "operator": "==", "value": True},
        )

        operator_node = nodes["execute_page_operation"]
        self.assertEqual(operator_node["kind"], "agent")
        self.assertEqual(operator_node["config"]["actionKey"], "toograph_page_operator")
        operator_config_text = json.dumps(operator_node["config"], ensure_ascii=False)
        self.assertNotIn("operation_request JSON", operator_config_text)
        self.assertNotIn("operation_request.", operator_config_text)
        self.assertNotIn("goal_plan", json.dumps(operator_node["config"], ensure_ascii=False))
        self.assertEqual(
            operator_node["config"]["actionBindings"],
            [
                {
                    "actionKey": "toograph_page_operator",
                    "outputMapping": {
                        "error": "operation_error",
                    },
                }
            ],
        )
        self.assertNotIn("inputMapping", operator_node["config"]["actionBindings"][0])
        self.assertEqual(
            {binding["state"]: binding["mode"] for binding in operator_node["writes"]},
            {
                "operation_error": "replace",
            },
        )
        self.assertIn("只调用一次 toograph_page_operator", operator_node["config"]["taskInstruction"])
        self.assertIn("页面操作书", operator_node["config"]["taskInstruction"])
        verifier_node = nodes["verify_goal_against_refreshed_context"]
        self.assertIn("goal_completed", verifier_node["config"]["taskInstruction"])
        self.assertIn("triggered_run_status", verifier_node["config"]["taskInstruction"])
        self.assertNotIn("goal_plan", verifier_node["config"]["taskInstruction"])
        self.assertNotIn("operation_request JSON", verifier_node["config"]["taskInstruction"])
        self.assertNotIn("operation_request.", verifier_node["config"]["taskInstruction"])
        self.assertEqual(
            _read_contracts(verifier_node["reads"]),
            [
                {"state": "user_goal", "required": True},
                {"state": "page_operation_context", "required": True},
                {"state": "operation_error", "required": False},
                {"state": "operation_result", "required": True},
                {"state": "loop_trace", "required": False},
            ],
        )
        self.assertIn({"state": "operation_report", "mode": "replace"}, verifier_node["writes"])

    def test_toograph_page_operation_workflow_is_runtime_compatible(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "toograph_page_operation_workflow"
        )
        payload = {
            key: value
            for key, value in template.items()
            if key not in {"template_id", "label", "description", "default_graph_name", "source"}
        }
        graph = NodeSystemGraphPayload.model_validate(
            {
                **payload,
                "graph_id": "test_toograph_page_operation_workflow",
                "name": template["default_graph_name"],
            }
        )

        validation = validate_graph(graph)
        self.assertEqual([issue.model_dump() for issue in validation.issues], [])
        self.assertEqual(get_langgraph_runtime_unsupported_reasons(graph), [])

        cycle_tracker = build_langgraph_cycle_tracker(graph, build_execution_edges(graph))
        self.assertTrue(cycle_tracker["has_cycle"])
        self.assertEqual(cycle_tracker["loop_limits_by_source"], {"continue_operation_loop": 6})

    def test_toograph_page_operation_workflow_declares_end_to_end_target_flows(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "toograph_page_operation_workflow"
        )
        flows = template["metadata"].get("targetFlows")
        self.assertIsInstance(flows, list)
        flows_by_id = {flow["id"]: flow for flow in flows}

        self.assertEqual(
            list(flows_by_id),
            [
                "open_runs_page",
                "open_run_detail",
                "open_library_page",
                "create_blank_graph",
                "open_named_graph",
                "run_named_template",
                "run_current_graph",
                "create_basic_llm_graph",
                "rename_current_node",
            ],
        )
        self.assertIn("app.nav.runs", flows_by_id["open_runs_page"]["operationTargets"])
        self.assertIn("runs.run.<runId>.openDetail", flows_by_id["open_run_detail"]["operationTargets"])
        self.assertIn("app.nav.library", flows_by_id["open_library_page"]["operationTargets"])
        self.assertIn("library.action.newBlankGraph", flows_by_id["create_blank_graph"]["operationTargets"])
        self.assertIn("library.graph.<graphId>.open", flows_by_id["open_named_graph"]["operationTargets"])
        self.assertIn("template_target", flows_by_id["run_named_template"]["operationTargets"])
        self.assertIn("library.template.<templateId>.open", flows_by_id["run_named_template"]["operationTargets"])
        self.assertIn("editor.canvas.node.<inputNodeId>.input.value", flows_by_id["run_named_template"]["operationTargets"])
        self.assertIn("editor.action.runActiveGraph", flows_by_id["run_current_graph"]["operationTargets"])
        self.assertIn("editor.graph.playback", flows_by_id["create_basic_llm_graph"]["operationTargets"])
        self.assertIn("editor.graph.playback", flows_by_id["rename_current_node"]["operationTargets"])
        self.assertIn("operation_result.commands includes run_template", flows_by_id["run_named_template"]["completionEvidence"])
        self.assertIn("triggered_run_status terminal", flows_by_id["run_current_graph"]["completionEvidence"])
        for flow_id, flow in flows_by_id.items():
            with self.subTest(flow_id=flow_id):
                self.assertTrue(flow["sampleGoal"])
                self.assertTrue(flow["completionEvidence"])
                self.assertLessEqual(len(flow["operationTargets"]), 6)

    def test_toograph_page_operation_workflow_declares_failure_guidance(self) -> None:
        template = next(
            record
            for record in _official_template_records()
            if record["template_id"] == "toograph_page_operation_workflow"
        )
        failure_guidance = template["metadata"].get("failureGuidance")
        self.assertIsInstance(failure_guidance, dict)

        self.assertEqual(
            list(failure_guidance),
            [
                "target_graph_not_found",
                "run_record_not_found",
                "stale_page_snapshot",
                "destructive_operation_blocked",
                "triggered_run_failed",
                "operation_interrupted",
            ],
        )
        for reason, guidance in failure_guidance.items():
            with self.subTest(reason=reason):
                self.assertEqual(guidance["failureReason"], reason)
                self.assertGreater(len(guidance["replyGuidance"]), 12)
                self.assertLessEqual(len(guidance["replyGuidance"]), 120)
                self.assertGreater(len(guidance["evidence"]), 0)

    def test_buddy_autonomous_review_template_contract(self) -> None:
        template = load_template_record("buddy_autonomous_review")
        states = template["state_schema"]
        nodes = template["nodes"]

        self.assertEqual(template["metadata"]["graphProtocol"], "node_system")
        self.assertEqual(template["metadata"]["origin"], "buddy")
        self.assertEqual(template["metadata"]["role"], "buddy_autonomous_review")
        self.assertNotIn("internal", template["metadata"])
        self.assertIs(template["capabilityDiscoverable"], False)
        self.assertEqual(template["label"], "自主复盘")
        self.assertEqual(
            template["metadata"]["requiredActions"],
            ["buddy_session_recall", "buddy_home_writer", "buddy_memory_writer"],
        )
        self.assertEqual(template["metadata"]["permissions"], ["buddy_session_read", "buddy_home_write", "buddy_memory_write"])
        self.assertNotIn("buddy.db", json.dumps(template, ensure_ascii=False))
        template_text = json.dumps(template, ensure_ascii=False)
        for discouraged_prompt_fragment in ["你已绑定", "不要", "不得", "Do not", "must not"]:
            self.assertNotIn(discouraged_prompt_fragment, template_text)
        self.assertEqual(
            set(states),
            {
                "source_run_id",
                "current_session_id",
                "user_message",
                "conversation_history",
                "buddy_context",
                "request_understanding",
                "capability_result",
                "capability_review",
                "public_response",
                "review_context_report",
                "session_recall_context",
                "autonomous_review",
                "improvement_candidates",
                "memory_update_plan",
                "user_context_update_plan",
                "structured_memory_update_plan",
                "capability_usage_update_plan",
                "memory_review_result",
                "user_context_review_result",
                "memory_write_success",
                "applied_memory_commands",
                "skipped_memory_commands",
                "memory_write_result",
                "user_context_write_success",
                "applied_user_context_commands",
                "skipped_user_context_commands",
                "user_context_write_result",
                "structured_memory_write_success",
                "applied_structured_memory_commands",
                "skipped_structured_memory_commands",
                "written_structured_memories",
                "structured_memory_write_result",
                "buddy_identity_update_plan",
                "buddy_identity_review_result",
                "buddy_identity_write_success",
                "applied_buddy_identity_commands",
                "skipped_buddy_identity_commands",
                "buddy_identity_write_result",
                "capability_usage_write_success",
                "applied_capability_usage_commands",
                "skipped_capability_usage_commands",
                "capability_usage_write_result",
            },
        )
        self.assertEqual(states["current_session_id"]["type"], "text")
        self.assertEqual(states["conversation_history"]["type"], "json")
        self.assertEqual(states["public_response"]["type"], "markdown")
        self.assertEqual(states["review_context_report"]["type"], "json")
        self.assertEqual(states["session_recall_context"]["type"], "json")
        self.assertEqual(states["autonomous_review"]["type"], "json")
        self.assertEqual(states["improvement_candidates"]["type"], "json")
        self.assertEqual(states["memory_update_plan"]["type"], "json")
        self.assertEqual(states["user_context_update_plan"]["type"], "json")
        self.assertEqual(states["structured_memory_update_plan"]["type"], "json")
        self.assertEqual(states["capability_usage_update_plan"]["type"], "json")
        self.assertEqual(states["memory_review_result"]["type"], "markdown")
        self.assertEqual(states["user_context_review_result"]["type"], "markdown")
        self.assertEqual(states["memory_write_success"]["type"], "boolean")
        self.assertEqual(states["applied_memory_commands"]["type"], "json")
        self.assertEqual(states["skipped_memory_commands"]["type"], "json")
        self.assertEqual(states["memory_write_result"]["type"], "markdown")
        self.assertEqual(states["user_context_write_success"]["type"], "boolean")
        self.assertEqual(states["applied_user_context_commands"]["type"], "json")
        self.assertEqual(states["skipped_user_context_commands"]["type"], "json")
        self.assertEqual(states["user_context_write_result"]["type"], "markdown")
        self.assertEqual(states["structured_memory_write_success"]["type"], "boolean")
        self.assertEqual(states["applied_structured_memory_commands"]["type"], "json")
        self.assertEqual(states["skipped_structured_memory_commands"]["type"], "json")
        self.assertEqual(states["written_structured_memories"]["type"], "json")
        self.assertEqual(states["structured_memory_write_result"]["type"], "markdown")
        self.assertEqual(states["buddy_identity_update_plan"]["type"], "json")
        self.assertEqual(states["buddy_identity_review_result"]["type"], "markdown")
        self.assertEqual(states["buddy_identity_write_success"]["type"], "boolean")
        self.assertEqual(states["applied_buddy_identity_commands"]["type"], "json")
        self.assertEqual(states["skipped_buddy_identity_commands"]["type"], "json")
        self.assertEqual(states["buddy_identity_write_result"]["type"], "markdown")
        self.assertEqual(states["capability_usage_write_success"]["type"], "boolean")
        self.assertEqual(states["applied_capability_usage_commands"]["type"], "json")
        self.assertEqual(states["skipped_capability_usage_commands"]["type"], "json")
        self.assertEqual(states["capability_usage_write_result"]["type"], "markdown")
        for removed_state in [
            "recall_request",
            "buddy_session_recall_success",
            "recalled_sessions",
            "buddy_session_recall_result",
            "memory_candidates",
            "buddy_identity_candidates",
            "memory_filter_report",
            "state_1",
            "writeback_commands",
            "writeback_success",
            "writeback_result",
            "applied_writeback_commands",
            "skipped_writeback_commands",
            "writeback_revisions",
        ]:
            self.assertNotIn(removed_state, states)
        self.assertNotIn("buddy_mode", states)
        self.assertNotIn("page_context", states)
        self.assertNotIn("input_buddy_mode", nodes)
        self.assertNotIn("input_page_context", nodes)
        for node in nodes.values():
            for read in node.get("reads", []):
                self.assertNotEqual(read.get("state"), "buddy_mode")
                self.assertNotEqual(read.get("state"), "page_context")
        for edge in template["edges"]:
            self.assertNotEqual(edge.get("source"), "input_buddy_mode")
            self.assertNotEqual(edge.get("target"), "input_buddy_mode")
            self.assertNotEqual(edge.get("source"), "input_page_context")
            self.assertNotEqual(edge.get("target"), "input_page_context")
        self.assertEqual([node_id for node_id, node in nodes.items() if node["kind"] == "subgraph"], [])
        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            [
                "output_autonomous_review",
                "output_improvement_candidates",
                "output_memory_review_result",
                "output_user_context_review_result",
                "output_applied_memory_commands",
                "output_memory_write_result",
                "output_applied_user_context_commands",
                "output_user_context_write_result",
                "output_applied_structured_memory_commands",
                "output_structured_memory_write_result",
                "output_buddy_identity_review_result",
                "output_applied_buddy_identity_commands",
                "output_buddy_identity_write_result",
                "output_applied_capability_usage_commands",
                "output_capability_usage_write_result",
            ],
        )
        for removed_node_id in [
            "prepare_session_recall_request",
            "filter_memory_candidates",
            "merge_memory_document",
            "merge_buddy_identity_update",
            "input_current_session_id",
            "input_user_message",
            "input_conversation_history",
            "input_request_understanding",
            "input_capability_result",
            "input_capability_review",
            "input_public_response",
            "output_session_recall_result",
            "output_memory_filter_report",
        ]:
            self.assertNotIn(removed_node_id, nodes)
        loader_node = nodes["load_review_context"]
        self.assertEqual(loader_node["kind"], "tool")
        self.assertEqual(loader_node["config"]["toolKey"], "buddy_review_context_loader")
        self.assertEqual(loader_node["reads"][0]["state"], "source_run_id")
        self.assertIs(loader_node["reads"][0]["required"], True)
        self.assertEqual(loader_node["reads"][0]["binding"]["fieldKey"], "source_run_id")
        self.assertEqual(
            [write["state"] for write in loader_node["writes"]],
            [
                "current_session_id",
                "user_message",
                "conversation_history",
                "request_understanding",
                "capability_result",
                "capability_review",
                "public_response",
                "review_context_report",
            ],
        )
        recall_node = nodes["recall_related_sessions"]
        self.assertEqual(recall_node["kind"], "agent")
        self.assertEqual(recall_node["config"]["actionKey"], "buddy_session_recall")
        self.assertEqual(
            _read_contracts(recall_node["reads"]),
            [
                {"state": "source_run_id", "required": False},
                {"state": "current_session_id", "required": False},
                {"state": "user_message", "required": True},
                {"state": "conversation_history", "required": False},
                {"state": "request_understanding", "required": False},
                {"state": "public_response", "required": True},
            ],
        )
        self.assertEqual(
            recall_node["config"]["actionBindings"],
            [
                {
                    "actionKey": "buddy_session_recall",
                    "outputMapping": {
                        "session_recall_context": "session_recall_context",
                    },
                }
            ],
        )
        self.assertEqual(
            {binding["state"]: binding["mode"] for binding in recall_node["writes"]},
            {
                "session_recall_context": "replace",
            },
        )
        self.assertIn("current_session_id", recall_node["config"]["taskInstruction"])
        self.assertNotIn("recall_request", recall_node["config"]["taskInstruction"])
        review_node = nodes["draft_autonomous_review"]
        self.assertEqual(review_node["kind"], "agent")
        self.assertEqual(review_node["config"]["thinkingMode"], "medium")
        self.assertEqual(
            _read_contracts(review_node["reads"]),
            [
                {"state": "source_run_id", "required": False},
                {"state": "user_message", "required": True},
                {"state": "conversation_history", "required": False},
                {"state": "buddy_context", "required": True},
                {"state": "request_understanding", "required": False},
                {"state": "capability_result", "required": False},
                {"state": "capability_review", "required": False},
                {"state": "public_response", "required": True},
                {"state": "review_context_report", "required": False},
                {"state": "session_recall_context", "required": False},
            ],
        )
        self.assertEqual(
            review_node["writes"],
            [
                {"state": "autonomous_review", "mode": "replace"},
                {"state": "improvement_candidates", "mode": "replace"},
                {"state": "memory_update_plan", "mode": "replace"},
                {"state": "user_context_update_plan", "mode": "replace"},
                {"state": "structured_memory_update_plan", "mode": "replace"},
                {"state": "capability_usage_update_plan", "mode": "replace"},
                {"state": "memory_review_result", "mode": "replace"},
                {"state": "user_context_review_result", "mode": "replace"},
                {"state": "buddy_identity_update_plan", "mode": "replace"},
                {"state": "buddy_identity_review_result", "mode": "replace"},
            ],
        )
        self.assertIn("session_recall_context", review_node["config"]["taskInstruction"])
        self.assertIn("memory_update_plan", review_node["config"]["taskInstruction"])
        self.assertIn("user_context_update_plan", review_node["config"]["taskInstruction"])
        self.assertIn("structured_memory_update_plan", review_node["config"]["taskInstruction"])
        self.assertIn("capability_usage_update_plan", review_node["config"]["taskInstruction"])
        self.assertIn("buddy_identity_update_plan", review_node["config"]["taskInstruction"])
        self.assertIn("写入目标矩阵", review_node["config"]["taskInstruction"])
        self.assertIn("SOUL.md / buddy_identity_update_plan", review_node["config"]["taskInstruction"])
        self.assertIn("USER.md / user_context_update_plan", review_node["config"]["taskInstruction"])
        self.assertIn("MEMORY.md / memory_update_plan", review_node["config"]["taskInstruction"])
        self.assertIn("数据库结构化记忆 / structured_memory_update_plan", review_node["config"]["taskInstruction"])
        self.assertIn("能力使用统计 / capability_usage_update_plan", review_node["config"]["taskInstruction"])
        self.assertNotIn("Do not call buddy_home_writer", review_node["config"]["taskInstruction"])
        self.assertIn(
            'Map "call yourself X from now on" and "rename yourself to X" to payload.name',
            review_node["config"]["taskInstruction"],
        )
        self.assertEqual(nodes["has_memory_updates"]["kind"], "condition")
        self.assertEqual(
            nodes["has_memory_updates"]["config"]["rule"],
            {"source": "$state.memory_update_plan.has_updates", "operator": "==", "value": True},
        )
        self.assertEqual(nodes["has_user_context_updates"]["kind"], "condition")
        self.assertEqual(
            nodes["has_user_context_updates"]["config"]["rule"],
            {"source": "$state.user_context_update_plan.has_updates", "operator": "==", "value": True},
        )
        self.assertEqual(nodes["has_structured_memory_updates"]["kind"], "condition")
        self.assertEqual(
            nodes["has_structured_memory_updates"]["config"]["rule"],
            {"source": "$state.structured_memory_update_plan.has_updates", "operator": "==", "value": True},
        )
        self.assertEqual(nodes["has_buddy_identity_updates"]["kind"], "condition")
        self.assertEqual(
            nodes["has_buddy_identity_updates"]["config"]["rule"],
            {"source": "$state.buddy_identity_update_plan.has_updates", "operator": "==", "value": True},
        )
        self.assertEqual(nodes["has_capability_usage_updates"]["kind"], "condition")
        self.assertEqual(
            nodes["has_capability_usage_updates"]["config"]["rule"],
            {"source": "$state.capability_usage_update_plan.has_updates", "operator": "==", "value": True},
        )
        writer_node = nodes["write_memory_updates"]
        self.assertEqual(writer_node["kind"], "agent")
        self.assertEqual(writer_node["config"]["actionKey"], "buddy_home_writer")
        self.assertEqual(
            _read_contracts(writer_node["reads"]),
            [
                {"state": "source_run_id", "required": False},
                {"state": "memory_update_plan", "required": True},
            ],
        )
        self.assertEqual(
            writer_node["config"]["actionBindings"],
            [
                {
                    "actionKey": "buddy_home_writer",
                    "outputMapping": {
                        "success": "memory_write_success",
                        "applied_commands": "applied_memory_commands",
                        "skipped_commands": "skipped_memory_commands",
                        "result": "memory_write_result",
                    },
                }
            ],
        )
        self.assertIn("memory_update_plan.commands", writer_node["config"]["actionInstructionBlocks"]["buddy_home_writer"]["content"])
        self.assertIn("memory_document.update", writer_node["config"]["actionInstructionBlocks"]["buddy_home_writer"]["content"])
        user_context_writer_node = nodes["write_user_context_updates"]
        self.assertEqual(user_context_writer_node["kind"], "agent")
        self.assertEqual(user_context_writer_node["config"]["actionKey"], "buddy_home_writer")
        self.assertEqual(
            _read_contracts(user_context_writer_node["reads"]),
            [
                {"state": "source_run_id", "required": False},
                {"state": "user_context_update_plan", "required": True},
            ],
        )
        self.assertEqual(
            user_context_writer_node["config"]["actionBindings"],
            [
                {
                    "actionKey": "buddy_home_writer",
                    "outputMapping": {
                        "success": "user_context_write_success",
                        "applied_commands": "applied_user_context_commands",
                        "skipped_commands": "skipped_user_context_commands",
                        "result": "user_context_write_result",
                    },
                }
            ],
        )
        self.assertIn("user_context_update_plan.commands", user_context_writer_node["config"]["actionInstructionBlocks"]["buddy_home_writer"]["content"])
        self.assertIn("user_context.update", user_context_writer_node["config"]["actionInstructionBlocks"]["buddy_home_writer"]["content"])
        structured_writer_node = nodes["write_structured_memory_updates"]
        self.assertEqual(structured_writer_node["kind"], "agent")
        self.assertEqual(structured_writer_node["config"]["actionKey"], "buddy_memory_writer")
        self.assertEqual(
            _read_contracts(structured_writer_node["reads"]),
            [
                {"state": "source_run_id", "required": False},
                {"state": "structured_memory_update_plan", "required": True},
            ],
        )
        self.assertEqual(
            structured_writer_node["config"]["actionBindings"],
            [
                {
                    "actionKey": "buddy_memory_writer",
                    "outputMapping": {
                        "success": "structured_memory_write_success",
                        "applied_commands": "applied_structured_memory_commands",
                        "skipped_commands": "skipped_structured_memory_commands",
                        "memories": "written_structured_memories",
                        "result": "structured_memory_write_result",
                    },
                }
            ],
        )
        self.assertIn(
            "structured_memory_update_plan.commands",
            structured_writer_node["config"]["actionInstructionBlocks"]["buddy_memory_writer"]["content"],
        )
        self.assertIn(
            "memory_entry.create",
            structured_writer_node["config"]["actionInstructionBlocks"]["buddy_memory_writer"]["content"],
        )
        buddy_identity_writer_node = nodes["write_buddy_identity_updates"]
        self.assertEqual(buddy_identity_writer_node["kind"], "agent")
        self.assertEqual(buddy_identity_writer_node["config"]["actionKey"], "buddy_home_writer")
        self.assertEqual(
            _read_contracts(buddy_identity_writer_node["reads"]),
            [
                {"state": "source_run_id", "required": False},
                {"state": "buddy_identity_update_plan", "required": True},
            ],
        )
        self.assertEqual(
            buddy_identity_writer_node["config"]["actionBindings"],
            [
                {
                    "actionKey": "buddy_home_writer",
                    "outputMapping": {
                        "success": "buddy_identity_write_success",
                        "applied_commands": "applied_buddy_identity_commands",
                        "skipped_commands": "skipped_buddy_identity_commands",
                        "result": "buddy_identity_write_result",
                    },
                }
            ],
        )
        self.assertIn("buddy_identity.update", buddy_identity_writer_node["config"]["actionInstructionBlocks"]["buddy_home_writer"]["content"])
        self.assertIn("use payload.name", buddy_identity_writer_node["config"]["actionInstructionBlocks"]["buddy_home_writer"]["content"])
        capability_usage_writer_node = nodes["write_capability_usage_updates"]
        self.assertEqual(capability_usage_writer_node["kind"], "agent")
        self.assertEqual(capability_usage_writer_node["config"]["actionKey"], "buddy_home_writer")
        self.assertEqual(
            _read_contracts(capability_usage_writer_node["reads"]),
            [
                {"state": "source_run_id", "required": False},
                {"state": "capability_usage_update_plan", "required": True},
            ],
        )
        self.assertEqual(
            capability_usage_writer_node["config"]["actionBindings"],
            [
                {
                    "actionKey": "buddy_home_writer",
                    "outputMapping": {
                        "success": "capability_usage_write_success",
                        "applied_commands": "applied_capability_usage_commands",
                        "skipped_commands": "skipped_capability_usage_commands",
                        "result": "capability_usage_write_result",
                    },
                }
            ],
        )
        self.assertIn(
            "capability_usage_update_plan.commands",
            capability_usage_writer_node["config"]["actionInstructionBlocks"]["buddy_home_writer"]["content"],
        )
        self.assertIn(
            "capability_usage_stats.update",
            capability_usage_writer_node["config"]["actionInstructionBlocks"]["buddy_home_writer"]["content"],
        )
        self.assertEqual(
            template["conditional_edges"],
            [
                {
                    "source": "has_memory_updates",
                    "branches": {
                        "true": "write_memory_updates",
                        "false": "has_user_context_updates",
                        "exhausted": "has_user_context_updates",
                    },
                },
                {
                    "source": "has_user_context_updates",
                    "branches": {
                        "true": "write_user_context_updates",
                        "false": "has_structured_memory_updates",
                        "exhausted": "has_structured_memory_updates",
                    },
                },
                {
                    "source": "has_structured_memory_updates",
                    "branches": {
                        "true": "write_structured_memory_updates",
                        "false": "has_buddy_identity_updates",
                        "exhausted": "has_buddy_identity_updates",
                    },
                },
                {
                    "source": "has_buddy_identity_updates",
                    "branches": {
                        "true": "write_buddy_identity_updates",
                        "false": "has_capability_usage_updates",
                        "exhausted": "has_capability_usage_updates",
                    },
                },
                {
                    "source": "has_capability_usage_updates",
                    "branches": {
                        "true": "write_capability_usage_updates",
                        "false": "output_buddy_identity_review_result",
                        "exhausted": "output_buddy_identity_review_result",
                    },
                },
            ],
        )
        self.assertEqual(
            template["edges"],
            [
                {"source": "input_source_run_id", "target": "load_review_context"},
                {"source": "load_review_context", "target": "recall_related_sessions"},
                {"source": "load_review_context", "target": "draft_autonomous_review"},
                {"source": "input_buddy_context", "target": "draft_autonomous_review"},
                {"source": "recall_related_sessions", "target": "draft_autonomous_review"},
                {"source": "draft_autonomous_review", "target": "output_autonomous_review"},
                {"source": "draft_autonomous_review", "target": "output_improvement_candidates"},
                {"source": "draft_autonomous_review", "target": "output_memory_review_result"},
                {"source": "draft_autonomous_review", "target": "output_user_context_review_result"},
                {"source": "draft_autonomous_review", "target": "has_memory_updates"},
                {"source": "write_memory_updates", "target": "has_user_context_updates"},
                {"source": "write_memory_updates", "target": "output_applied_memory_commands"},
                {"source": "write_memory_updates", "target": "output_memory_write_result"},
                {"source": "write_user_context_updates", "target": "has_structured_memory_updates"},
                {"source": "write_user_context_updates", "target": "output_applied_user_context_commands"},
                {"source": "write_user_context_updates", "target": "output_user_context_write_result"},
                {"source": "write_structured_memory_updates", "target": "has_buddy_identity_updates"},
                {"source": "write_structured_memory_updates", "target": "output_applied_structured_memory_commands"},
                {"source": "write_structured_memory_updates", "target": "output_structured_memory_write_result"},
                {"source": "write_buddy_identity_updates", "target": "has_capability_usage_updates"},
                {"source": "write_buddy_identity_updates", "target": "output_applied_buddy_identity_commands"},
                {"source": "write_buddy_identity_updates", "target": "output_buddy_identity_write_result"},
                {"source": "write_capability_usage_updates", "target": "output_applied_capability_usage_commands"},
                {"source": "write_capability_usage_updates", "target": "output_capability_usage_write_result"},
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
        plan = compile_graph_to_langgraph_plan(graph)
        route_sources = [route.source for route in plan.runtime_condition_routes]
        self.assertEqual(
            len(route_sources),
            len(set(route_sources)),
            "Buddy review template must not compile multiple LangGraph conditional routes from one runtime source.",
        )

    def test_buddy_improvement_review_workflow_template_contract(self) -> None:
        template = load_template_record("buddy_improvement_review_workflow")
        states = template["state_schema"]
        nodes = template["nodes"]

        self.assertEqual(template["metadata"]["graphProtocol"], "node_system")
        self.assertEqual(template["metadata"]["origin"], "buddy")
        self.assertEqual(template["metadata"]["role"], "buddy_improvement_review_workflow")
        self.assertNotIn("internal", template["metadata"])
        self.assertIs(template["capabilityDiscoverable"], False)
        self.assertEqual(template["label"], "改进候选验证")
        self.assertEqual(
            template["metadata"]["requiredActions"],
            [
                "toograph_action_package_reader",
                "toograph_graph_template_reader",
                "toograph_graph_template_validator",
            ],
        )
        self.assertEqual(template["metadata"]["permissions"], ["action_read", "file_read"])
        template_text = json.dumps(template, ensure_ascii=False)
        for discouraged_prompt_fragment in ["你已绑定", "不要", "不得", "Do not", "must not"]:
            self.assertNotIn(discouraged_prompt_fragment, template_text)
        self.assertEqual(
            set(states),
            {
                "improvement_candidate",
                "source_run_id",
                "candidate_review_context",
                "target_action_key",
                "target_template_id",
                "action_read_success",
                "action_package",
                "action_read_result",
                "template_read_success",
                "template_package",
                "template_read_result",
                "candidate_validation_plan",
                "proposed_diff",
                "candidate_template_json",
                "should_validate_template",
                "validation_success",
                "validation_report",
                "test_plan",
                "approval_request",
                "candidate_status_recommendation",
                "final_summary",
            },
        )
        self.assertEqual(states["improvement_candidate"]["type"], "json")
        self.assertEqual(states["source_run_id"]["type"], "text")
        self.assertEqual(states["candidate_review_context"]["type"], "json")
        self.assertEqual(states["target_action_key"]["type"], "text")
        self.assertEqual(states["target_template_id"]["type"], "text")
        self.assertEqual(states["action_read_success"]["type"], "boolean")
        self.assertEqual(states["action_package"]["type"], "json")
        self.assertEqual(states["action_read_result"]["type"], "markdown")
        self.assertEqual(states["template_read_success"]["type"], "boolean")
        self.assertEqual(states["template_package"]["type"], "json")
        self.assertEqual(states["template_read_result"]["type"], "markdown")
        self.assertEqual(states["candidate_validation_plan"]["type"], "json")
        self.assertEqual(states["proposed_diff"]["type"], "json")
        self.assertEqual(states["candidate_template_json"]["type"], "json")
        self.assertEqual(states["should_validate_template"]["type"], "boolean")
        self.assertEqual(states["validation_success"]["type"], "boolean")
        self.assertEqual(states["validation_report"]["type"], "json")
        self.assertEqual(states["test_plan"]["type"], "markdown")
        self.assertEqual(states["approval_request"]["type"], "json")
        self.assertEqual(states["candidate_status_recommendation"]["type"], "json")
        self.assertEqual(states["final_summary"]["type"], "markdown")

        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "input"],
            ["input_improvement_candidate", "input_source_run_id"],
        )
        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            [
                "output_final_summary",
                "output_approval_request",
                "output_proposed_diff",
                "output_validation_report",
            ],
        )
        normalize_node = nodes["normalize_candidate"]
        self.assertEqual(normalize_node["kind"], "agent")
        self.assertEqual(
            _read_contracts(normalize_node["reads"]),
            [
                {"state": "improvement_candidate", "required": True},
                {"state": "source_run_id", "required": False},
            ],
        )
        self.assertEqual(
            normalize_node["writes"],
            [
                {"state": "candidate_review_context", "mode": "replace"},
                {"state": "target_action_key", "mode": "replace"},
                {"state": "target_template_id", "mode": "replace"},
            ],
        )
        self.assertIn("candidate_id", normalize_node["config"]["taskInstruction"])
        self.assertIn("target_action_key", normalize_node["config"]["taskInstruction"])
        self.assertIn("target_template_id", normalize_node["config"]["taskInstruction"])

        action_reader = nodes["read_target_action"]
        self.assertEqual(action_reader["kind"], "agent")
        self.assertEqual(action_reader["config"]["actionKey"], "toograph_action_package_reader")
        self.assertEqual(
            _read_contracts(action_reader["reads"]),
            [
                {
                    "state": "target_action_key",
                    "required": True,
                    "binding": {
                        "kind": "action_input",
                        "actionKey": "toograph_action_package_reader",
                        "toolKey": "",
                        "fieldKey": "target_action_key",
                        "managed": True,
                    },
                },
            ],
        )
        self.assertEqual(
            action_reader["config"]["actionBindings"][0]["outputMapping"],
            {
                "success": "action_read_success",
                "action_package": "action_package",
                "result": "action_read_result",
            },
        )

        template_reader = nodes["read_target_template"]
        self.assertEqual(template_reader["kind"], "agent")
        self.assertEqual(template_reader["config"]["actionKey"], "toograph_graph_template_reader")
        self.assertEqual(
            _read_contracts(template_reader["reads"]),
            [
                {
                    "state": "target_template_id",
                    "required": True,
                    "binding": {
                        "kind": "action_input",
                        "actionKey": "toograph_graph_template_reader",
                        "toolKey": "",
                        "fieldKey": "target_template_id",
                        "managed": True,
                    },
                },
            ],
        )
        self.assertEqual(
            template_reader["config"]["actionBindings"][0]["outputMapping"],
            {
                "success": "template_read_success",
                "template_package": "template_package",
                "result": "template_read_result",
            },
        )

        draft_node = nodes["draft_candidate_resolution"]
        self.assertEqual(draft_node["kind"], "agent")
        self.assertEqual(
            _read_contracts(draft_node["reads"]),
            [
                {"state": "improvement_candidate", "required": True},
                {"state": "source_run_id", "required": False},
                {"state": "candidate_review_context", "required": True},
                {"state": "action_package", "required": False},
                {"state": "action_read_result", "required": False},
                {"state": "template_package", "required": False},
                {"state": "template_read_result", "required": False},
            ],
        )
        self.assertEqual(
            draft_node["writes"],
            [
                {"state": "candidate_validation_plan", "mode": "replace"},
                {"state": "proposed_diff", "mode": "replace"},
                {"state": "candidate_template_json", "mode": "replace"},
                {"state": "should_validate_template", "mode": "replace"},
                {"state": "test_plan", "mode": "replace"},
                {"state": "approval_request", "mode": "replace"},
            ],
        )
        self.assertIn("proposed_diff", draft_node["config"]["taskInstruction"])
        self.assertIn("approval_request", draft_node["config"]["taskInstruction"])
        self.assertIn("approval_request.apply_command", draft_node["config"]["taskInstruction"])
        self.assertIn("candidate_template_json", draft_node["config"]["taskInstruction"])

        validator_node = nodes["validate_candidate_template"]
        self.assertEqual(validator_node["kind"], "agent")
        self.assertEqual(validator_node["config"]["actionKey"], "toograph_graph_template_validator")
        self.assertEqual(
            _read_contracts(validator_node["reads"]),
            [
                {
                    "state": "candidate_template_json",
                    "required": True,
                    "binding": {
                        "kind": "action_input",
                        "actionKey": "toograph_graph_template_validator",
                        "toolKey": "",
                        "fieldKey": "generated_template_json",
                        "managed": True,
                    },
                },
            ],
        )
        self.assertEqual(
            validator_node["config"]["actionBindings"][0]["outputMapping"],
            {
                "success": "validation_success",
                "validation_report": "validation_report",
            },
        )

        finalize_node = nodes["finalize_candidate_review"]
        self.assertEqual(finalize_node["kind"], "agent")
        self.assertEqual(
            _read_contracts(finalize_node["reads"]),
            [
                {"state": "improvement_candidate", "required": True},
                {"state": "candidate_validation_plan", "required": True},
                {"state": "proposed_diff", "required": True},
                {"state": "validation_report", "required": False},
                {"state": "test_plan", "required": True},
                {"state": "approval_request", "required": True},
            ],
        )
        self.assertEqual(
            finalize_node["writes"],
            [
                {"state": "candidate_status_recommendation", "mode": "replace"},
                {"state": "final_summary", "mode": "replace"},
            ],
        )
        self.assertIn("candidate_status_recommendation", finalize_node["config"]["taskInstruction"])

        self.assertEqual(
            nodes["has_target_action"]["config"]["rule"],
            {"source": "$state.target_action_key", "operator": "!=", "value": ""},
        )
        self.assertEqual(
            nodes["has_target_template"]["config"]["rule"],
            {"source": "$state.target_template_id", "operator": "!=", "value": ""},
        )
        self.assertEqual(
            nodes["should_run_template_validator"]["config"]["rule"],
            {"source": "$state.should_validate_template", "operator": "==", "value": True},
        )
        self.assertEqual(
            template["conditional_edges"],
            [
                {
                    "source": "has_target_action",
                    "branches": {
                        "true": "read_target_action",
                        "false": "has_target_template",
                        "exhausted": "has_target_template",
                    },
                },
                {
                    "source": "has_target_template",
                    "branches": {
                        "true": "read_target_template",
                        "false": "draft_candidate_resolution",
                        "exhausted": "draft_candidate_resolution",
                    },
                },
                {
                    "source": "should_run_template_validator",
                    "branches": {
                        "true": "validate_candidate_template",
                        "false": "finalize_candidate_review",
                        "exhausted": "finalize_candidate_review",
                    },
                },
            ],
        )
        self.assertIn({"source": "input_improvement_candidate", "target": "normalize_candidate"}, template["edges"])
        self.assertIn({"source": "normalize_candidate", "target": "has_target_action"}, template["edges"])
        self.assertIn({"source": "read_target_action", "target": "has_target_template"}, template["edges"])
        self.assertIn({"source": "read_target_template", "target": "draft_candidate_resolution"}, template["edges"])
        self.assertIn({"source": "draft_candidate_resolution", "target": "should_run_template_validator"}, template["edges"])
        self.assertIn({"source": "validate_candidate_template", "target": "finalize_candidate_review"}, template["edges"])
        self.assertIn({"source": "finalize_candidate_review", "target": "output_final_summary"}, template["edges"])

        graph = NodeSystemGraphPayload.model_validate(
            {
                **{
                    key: value
                    for key, value in template.items()
                    if key not in {"template_id", "label", "description", "default_graph_name", "source"}
                },
                "graph_id": "test_buddy_improvement_review_workflow",
                "name": template["default_graph_name"],
            }
        )
        validation = validate_graph(graph)
        self.assertEqual([issue.model_dump() for issue in validation.issues], [])
        self.assertEqual(get_langgraph_runtime_unsupported_reasons(graph), [])

    def test_buddy_capability_curator_template_contract(self) -> None:
        template = load_template_record("buddy_capability_curator")
        states = template["state_schema"]
        nodes = template["nodes"]

        self.assertEqual(template["metadata"]["graphProtocol"], "node_system")
        self.assertEqual(template["metadata"]["origin"], "buddy")
        self.assertEqual(template["metadata"]["role"], "buddy_capability_curator")
        self.assertEqual(template["metadata"]["category"], "buddy_improvement")
        self.assertNotIn("internal", template["metadata"])
        self.assertIs(template["capabilityDiscoverable"], False)
        self.assertEqual(template["label"], "能力库整理")
        self.assertEqual(template["metadata"]["requiredActions"], [])
        self.assertEqual(template["metadata"]["requiredTools"], ["capability_curator_context_loader"])
        self.assertEqual(template["metadata"]["permissions"], [])
        self.assertEqual(
            template["metadata"]["outputContract"],
            [
                {"state": "curator_report", "role": "report", "label": "Capability curator report"},
                {"state": "improvement_candidates", "role": "candidate_queue", "label": "Improvement candidates"},
                {"state": "scheduler_recommendation", "role": "scheduler_plan", "label": "Scheduler readiness"},
            ],
        )
        template_text = json.dumps(template, ensure_ascii=False)
        for discouraged_prompt_fragment in ["你已绑定", "不要", "不得", "Do not", "must not"]:
            self.assertNotIn(discouraged_prompt_fragment, template_text)
        self.assertEqual(
            set(states),
            {
                "curator_scope",
                "capability_catalog_snapshot",
                "capability_usage_snapshot",
                "existing_candidates_snapshot",
                "curator_context_report",
                "capability_health_report",
                "curator_report",
                "improvement_candidates",
                "scheduler_recommendation",
            },
        )
        self.assertEqual(states["curator_scope"]["type"], "json")
        self.assertEqual(states["capability_catalog_snapshot"]["type"], "json")
        self.assertEqual(states["capability_usage_snapshot"]["type"], "json")
        self.assertEqual(states["existing_candidates_snapshot"]["type"], "json")
        self.assertEqual(states["curator_context_report"]["type"], "json")
        self.assertEqual(states["capability_health_report"]["type"], "json")
        self.assertEqual(states["curator_report"]["type"], "markdown")
        self.assertEqual(states["improvement_candidates"]["type"], "json")
        self.assertEqual(states["scheduler_recommendation"]["type"], "json")
        self.assertEqual(states["capability_catalog_snapshot"]["binding"]["toolKey"], "capability_curator_context_loader")
        self.assertEqual(states["capability_usage_snapshot"]["binding"]["fieldKey"], "capability_usage_snapshot")
        self.assertEqual(states["existing_candidates_snapshot"]["binding"]["fieldKey"], "existing_candidates_snapshot")
        self.assertEqual(states["curator_context_report"]["binding"]["fieldKey"], "curator_context_report")

        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "input"],
            ["input_curator_scope"],
        )
        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            [
                "output_curator_report",
                "output_improvement_candidates",
                "output_scheduler_recommendation",
            ],
        )

        loader_node = nodes["load_curator_context"]
        self.assertEqual(loader_node["kind"], "tool")
        self.assertEqual(loader_node["config"]["toolKey"], "capability_curator_context_loader")
        self.assertEqual(
            _read_contracts(loader_node["reads"]),
            [
                {
                    "state": "curator_scope",
                    "required": False,
                    "binding": {
                        "kind": "tool_input",
                        "actionKey": "",
                        "toolKey": "capability_curator_context_loader",
                        "fieldKey": "curator_scope",
                        "managed": True,
                    },
                },
            ],
        )
        self.assertEqual(
            loader_node["writes"],
            [
                {"state": "capability_catalog_snapshot", "mode": "replace"},
                {"state": "capability_usage_snapshot", "mode": "replace"},
                {"state": "existing_candidates_snapshot", "mode": "replace"},
                {"state": "curator_context_report", "mode": "replace"},
            ],
        )

        analyze_node = nodes["analyze_capability_health"]
        self.assertEqual(analyze_node["kind"], "agent")
        self.assertEqual(
            _read_contracts(analyze_node["reads"]),
            [
                {"state": "curator_scope", "required": True},
                {"state": "capability_catalog_snapshot", "required": True},
                {"state": "capability_usage_snapshot", "required": True},
                {"state": "existing_candidates_snapshot", "required": True},
                {"state": "curator_context_report", "required": False},
            ],
        )
        self.assertEqual(
            analyze_node["writes"],
            [
                {"state": "capability_health_report", "mode": "replace"},
                {"state": "curator_report", "mode": "replace"},
            ],
        )
        self.assertIn("duplicate_groups", analyze_node["config"]["taskInstruction"])
        self.assertIn("missing_tests", analyze_node["config"]["taskInstruction"])
        self.assertIn("high_failure_capabilities", analyze_node["config"]["taskInstruction"])

        candidate_node = nodes["draft_curator_candidates"]
        self.assertEqual(candidate_node["kind"], "agent")
        self.assertEqual(
            _read_contracts(candidate_node["reads"]),
            [
                {"state": "curator_scope", "required": True},
                {"state": "capability_health_report", "required": True},
                {"state": "curator_report", "required": True},
                {"state": "existing_candidates_snapshot", "required": False},
            ],
        )
        self.assertEqual(
            candidate_node["writes"],
            [
                {"state": "improvement_candidates", "mode": "replace"},
                {"state": "scheduler_recommendation", "mode": "replace"},
            ],
        )
        self.assertIn("improvement_candidate", candidate_node["config"]["taskInstruction"])
        self.assertIn("buddy_improvement_review_workflow", candidate_node["config"]["taskInstruction"])
        self.assertIn("scheduler_recommendation", candidate_node["config"]["taskInstruction"])

        self.assertEqual(
            template["edges"],
            [
                {"source": "input_curator_scope", "target": "load_curator_context"},
                {"source": "load_curator_context", "target": "analyze_capability_health"},
                {"source": "analyze_capability_health", "target": "draft_curator_candidates"},
                {"source": "draft_curator_candidates", "target": "output_curator_report"},
                {"source": "draft_curator_candidates", "target": "output_improvement_candidates"},
                {"source": "draft_curator_candidates", "target": "output_scheduler_recommendation"},
            ],
        )
        self.assertEqual(template["conditional_edges"], [])

        graph = NodeSystemGraphPayload.model_validate(
            {
                **{
                    key: value
                    for key, value in template.items()
                    if key not in {"template_id", "label", "description", "default_graph_name", "source"}
                },
                "graph_id": "test_buddy_capability_curator",
                "name": template["default_graph_name"],
            }
        )
        validation = validate_graph(graph)
        self.assertEqual([issue.model_dump() for issue in validation.issues], [])
        self.assertEqual(get_langgraph_runtime_unsupported_reasons(graph), [])

    def test_buddy_context_compaction_template_contract(self) -> None:
        template = load_template_record("buddy_context_compaction")
        states = template["state_schema"]
        nodes = template["nodes"]

        self.assertEqual(template["metadata"]["graphProtocol"], "node_system")
        self.assertEqual(template["metadata"]["origin"], "buddy")
        self.assertEqual(template["metadata"]["role"], "buddy_context_compaction")
        self.assertNotIn("internal", template["metadata"])
        self.assertIs(template["capabilityDiscoverable"], False)
        self.assertEqual(template["metadata"]["requiredActions"], ["buddy_home_writer"])
        self.assertEqual(template["metadata"]["permissions"], ["buddy_home_write"])
        self.assertEqual(template["metadata"]["requiredTools"], ["buddy_history_context_loader"])
        self.assertEqual(
            set(states),
            {
                "conversation_history",
                "compaction_plan",
                "protected_recent_history",
                "session_summary_candidate",
                "compaction_report",
                "should_write_summary",
                "writer_input",
                "session_summary_write_success",
                "applied_session_summary_commands",
                "skipped_session_summary_commands",
                "session_summary_write_result",
            },
        )
        for removed_state in [
            "trigger",
            "source_run_id",
            "current_session_id",
            "user_message",
            "existing_session_summary",
            "buddy_context",
            "context_budget_report",
            "capability_result",
            "public_response",
            "page_context",
        ]:
            self.assertNotIn(removed_state, states)
            self.assertNotIn(f"input_{removed_state}", nodes)

        self.assertEqual(states["conversation_history"]["type"], "json")
        self.assertEqual(states["conversation_history"]["binding"]["toolKey"], "buddy_history_context_loader")
        self.assertEqual(states["conversation_history"]["binding"]["nodeId"], "reload_conversation_history")
        self.assertEqual(states["compaction_plan"]["type"], "json")
        self.assertEqual(states["protected_recent_history"]["type"], "markdown")
        self.assertEqual(states["session_summary_candidate"]["type"], "markdown")
        self.assertEqual(states["compaction_report"]["type"], "json")
        self.assertEqual(states["should_write_summary"]["type"], "boolean")
        self.assertEqual(states["writer_input"]["type"], "json")
        self.assertEqual(states["session_summary_write_success"]["type"], "boolean")
        self.assertEqual(states["session_summary_write_result"]["type"], "markdown")

        self.assertEqual(
            [node_id for node_id, node in nodes.items() if node["kind"] == "output"],
            ["output_conversation_history"],
        )
        self.assertEqual(
            _read_contracts(nodes["input_conversation_history"]["writes"]),
            [{"state": "conversation_history", "mode": "replace"}],
        )
        self.assertEqual(
            _read_contracts(nodes["plan_compaction"]["reads"]),
            [{"state": "conversation_history", "required": True}],
        )
        self.assertEqual(nodes["plan_compaction"]["writes"], [{"state": "compaction_plan", "mode": "replace"}])
        self.assertIn("protect_first", nodes["plan_compaction"]["config"]["taskInstruction"])
        for node in nodes.values():
            for read in node.get("reads", []):
                self.assertNotIn(
                    read.get("state"),
                    {
                        "page_context",
                        "trigger",
                        "source_run_id",
                        "current_session_id",
                        "user_message",
                        "existing_session_summary",
                        "buddy_context",
                        "context_budget_report",
                        "capability_result",
                        "public_response",
                    },
                )
        self.assertEqual(
            _read_contracts(nodes["summarize_context"]["reads"]),
            [
                {"state": "conversation_history", "required": True},
                {"state": "compaction_plan", "required": True},
            ],
        )
        self.assertEqual(
            nodes["summarize_context"]["writes"],
            [
                {"state": "session_summary_candidate", "mode": "replace"},
                {"state": "protected_recent_history", "mode": "replace"},
                {"state": "compaction_report", "mode": "replace"},
                {"state": "should_write_summary", "mode": "replace"},
                {"state": "writer_input", "mode": "replace"},
            ],
        )
        self.assertIn("session_summary.update", nodes["summarize_context"]["config"]["taskInstruction"])
        self.assertIn("summary_source_refs", nodes["summarize_context"]["config"]["taskInstruction"])
        self.assertIn("omitted_refs", nodes["summarize_context"]["config"]["taskInstruction"])
        self.assertIn("protected_recent_history_refs", nodes["summarize_context"]["config"]["taskInstruction"])
        self.assertIn("payload.source_refs", nodes["summarize_context"]["config"]["taskInstruction"])
        self.assertEqual(
            nodes["has_summary_update"]["config"]["rule"],
            {"source": "$state.should_write_summary", "operator": "==", "value": True},
        )
        self.assertEqual(nodes["reload_conversation_history"]["kind"], "tool")
        self.assertEqual(nodes["reload_conversation_history"]["config"]["toolKey"], "buddy_history_context_loader")
        self.assertEqual(nodes["reload_conversation_history"]["writes"], [{"state": "conversation_history", "mode": "replace"}])
        self.assertEqual(
            _read_contracts(nodes["output_conversation_history"]["reads"]),
            [{"state": "conversation_history", "required": True}],
        )
        writer_node = nodes["write_session_summary"]
        self.assertEqual(writer_node["kind"], "agent")
        self.assertEqual(writer_node["config"]["actionKey"], "buddy_home_writer")
        self.assertEqual(
            writer_node["config"]["actionBindings"],
            [
                {
                    "actionKey": "buddy_home_writer",
                    "outputMapping": {
                        "success": "session_summary_write_success",
                        "applied_commands": "applied_session_summary_commands",
                        "skipped_commands": "skipped_session_summary_commands",
                        "result": "session_summary_write_result",
                    },
                }
            ],
        )
        self.assertIn({"source": "plan_compaction", "target": "summarize_context"}, template["edges"])
        self.assertIn({"source": "summarize_context", "target": "has_summary_update"}, template["edges"])
        self.assertIn({"source": "write_session_summary", "target": "reload_conversation_history"}, template["edges"])
        self.assertIn({"source": "reload_conversation_history", "target": "output_conversation_history"}, template["edges"])
        self.assertEqual(
            template["conditional_edges"],
            [
                {
                    "source": "has_summary_update",
                    "branches": {
                        "true": "write_session_summary",
                        "false": "reload_conversation_history",
                        "exhausted": "reload_conversation_history",
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
                "graph_id": "test_buddy_context_compaction",
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
