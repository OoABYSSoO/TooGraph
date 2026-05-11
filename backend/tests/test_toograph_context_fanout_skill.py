from __future__ import annotations

from contextlib import contextmanager
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.skills import SkillLlmNodeEligibility, SkillSourceScope
from app.core.storage import database
from app.knowledge import loader
from app.knowledge.loader import KnowledgeBaseRecord, KnowledgeDocument
from app.memory import store as memory_store
from app.skills.definitions import _parse_native_skill_manifest


REPO_ROOT = Path(__file__).resolve().parents[2]
CONTEXT_FANOUT_SKILL_DIR = REPO_ROOT / "skill" / "official" / "toograph_context_fanout"


@contextmanager
def isolated_fanout_runtime():
    old_data_dir = database.DATA_DIR
    old_db_path = database.DB_PATH
    old_knowledge_root = loader.KNOWLEDGE_ROOT
    old_download_root = loader.DOWNLOAD_ROOT
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        data_dir = root / "data"
        database.DATA_DIR = data_dir
        database.DB_PATH = data_dir / "toograph.db"
        loader.KNOWLEDGE_ROOT = data_dir / "kb"
        loader.DOWNLOAD_ROOT = loader.KNOWLEDGE_ROOT / "_downloads"
        try:
            database.initialize_storage()
            yield root
        finally:
            database.DATA_DIR = old_data_dir
            database.DB_PATH = old_db_path
            loader.KNOWLEDGE_ROOT = old_knowledge_root
            loader.DOWNLOAD_ROOT = old_download_root


def _load_skill_module():
    spec = importlib.util.spec_from_file_location(
        "test_toograph_context_fanout_after_llm",
        CONTEXT_FANOUT_SKILL_DIR / "after_llm.py",
    )
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load toograph_context_fanout skill script.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_template(repo_root: Path) -> None:
    _write_json(
        repo_root / "graph_template" / "official" / "policy_navigator_agent" / "template.json",
        {
            "template_id": "policy_navigator_agent",
            "label": "Policy Navigator",
            "description": "Policy QA with citations and action checklist.",
            "default_graph_name": "Policy Navigator",
            "state_schema": {
                "user_question": {"name": "Question", "type": "text", "value": ""},
                "final_reply": {"name": "Final Reply", "type": "markdown", "value": ""},
            },
            "nodes": {
                "output_final": {
                    "kind": "output",
                    "name": "Final Reply",
                    "description": "",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "reads": [{"state": "final_reply", "required": True}],
                    "writes": [],
                    "config": {
                        "displayMode": "markdown",
                        "persistEnabled": False,
                        "persistFormat": "auto",
                        "fileNameTemplate": "",
                    },
                }
            },
            "edges": [],
            "conditional_edges": [],
            "metadata": {
                "graphProtocol": "node_system",
                "capabilityDiscoverableDefault": True,
                "outputContract": [
                    {
                        "key": "final_reply",
                        "name": "Final Reply",
                        "type": "markdown",
                        "role": "final_response",
                        "passThrough": True,
                        "required": True,
                    }
                ],
            },
        },
    )


def _write_skill(repo_root: Path) -> None:
    skill_dir = repo_root / "skill" / "official" / "web_search"
    _write_json(
        skill_dir / "skill.json",
        {
            "schemaVersion": "toograph.skill/v1",
            "skillKey": "web_search",
            "name": "Web Search",
            "description": "Search public web pages and save evidence.",
            "llmInstruction": "Plan a web search query.",
            "version": "1.0.0",
            "permissions": ["network"],
            "llmOutputSchema": [{"key": "query", "name": "Query", "valueType": "text"}],
            "stateOutputSchema": [{"key": "result", "name": "Result", "valueType": "json"}],
        },
    )
    (skill_dir / "after_llm.py").write_text("import json\nprint(json.dumps({'result': {}}))\n", encoding="utf-8")


def _seed_knowledge_base() -> None:
    loader._replace_knowledge_base(
        KnowledgeBaseRecord(
            kb_id="fanout-kb",
            label="Fanout KB",
            description="Knowledge base for context fanout tests.",
            source_kind="unit_test",
            source_url="",
            version="v1",
            payload={"fixture": True},
        ),
        [
            KnowledgeDocument(
                doc_id="refund-policy",
                title="Refund Policy",
                url="https://example.test/refund",
                section="Audit",
                content="Refund policy requires support tickets, purchase timestamp, and approval notes.",
                source_path="docs/refund.md",
                metadata={"source_path": "docs/refund.md"},
            )
        ],
    )


class TooGraphContextFanoutSkillTests(unittest.TestCase):
    def test_manifest_exposes_read_only_fanout_contract(self) -> None:
        definition = _parse_native_skill_manifest(
            CONTEXT_FANOUT_SKILL_DIR / "skill.json",
            SkillSourceScope.OFFICIAL,
        ).definition

        self.assertEqual(definition.skill_key, "toograph_context_fanout")
        self.assertEqual(definition.llm_node_eligibility, SkillLlmNodeEligibility.READY)
        self.assertEqual(definition.permissions, ["memory_read", "knowledge_read", "file_read"])
        self.assertEqual([field.key for field in definition.state_input_schema], ["fanout_request"])
        self.assertEqual(
            [field.key for field in definition.llm_output_schema],
            [
                "user_message",
                "conversation_history",
                "page_context",
                "buddy_context",
                "memory_query",
                "memory_scope",
                "knowledge_query",
                "knowledge_base",
                "capability_query",
                "capability_origin",
                "total_budget_chars",
            ],
        )
        self.assertEqual(
            [field.key for field in definition.state_output_schema],
            [
                "success",
                "context_brief",
                "fanout_context",
                "memory_context",
                "knowledge_context",
                "page_context_summary",
                "capability_candidates",
                "assembly_report",
                "result",
            ],
        )

    def test_context_fanout_reads_memory_knowledge_page_and_capability_candidates_with_budget_report(self) -> None:
        fanout = _load_skill_module()
        with isolated_fanout_runtime() as temp_root:
            repo_root = temp_root / "repo"
            _write_template(repo_root)
            _write_skill(repo_root)
            _seed_knowledge_base()
            memory_store.create_memory(
                {
                    "scope": "project",
                    "layer": "procedural",
                    "type": "preference",
                    "summary": "Prefers concise verified replies",
                    "content": "When answering policy questions, keep replies concise and cite the source.",
                    "importance": 0.9,
                    "status": "active",
                },
                changed_by="test",
            )

            with patch.dict("os.environ", {"TOOGRAPH_REPO_ROOT": str(repo_root)}, clear=True):
                result = fanout.toograph_context_fanout(
                    user_message="请解释退款政策，并给出可执行清单。",
                    conversation_history="用户之前要求回答要简短。",
                    page_context="Route: /library\nActive panel: Templates\n" + ("Visible card. " * 120),
                    buddy_context={"kind": "local_folder", "root": "buddy_home", "selected": ["MEMORY.md"]},
                    memory_query="concise policy citation",
                    memory_scope="project",
                    knowledge_query="refund policy audit",
                    knowledge_base="fanout-kb",
                    capability_query="policy question with citations",
                    capability_origin="buddy",
                    total_budget_chars=1400,
                )

        self.assertEqual(result["success"], True)
        self.assertEqual(result["fanout_context"]["kind"], "context_fanout")
        self.assertTrue(result["fanout_context"]["parallelizable"])
        self.assertEqual(
            [branch["key"] for branch in result["fanout_context"]["branches"]],
            ["memory", "knowledge", "page", "capabilities"],
        )
        self.assertEqual(result["memory_context"]["kind"], "memory_context")
        self.assertEqual(result["memory_context"]["included_count"], 1)
        self.assertEqual(result["knowledge_context"]["result_count"], 1)
        self.assertIn("Refund Policy", result["context_brief"]["knowledge"])
        self.assertLessEqual(result["assembly_report"]["budget"]["used_chars"], 1400)
        self.assertGreaterEqual(result["assembly_report"]["budget"]["omitted_count"], 1)
        self.assertEqual(result["assembly_report"]["merge_policy"], "priority_budget_with_conflict_notes")
        self.assertEqual(result["context_brief"]["instruction_boundary"], "context_only")
        self.assertIn("policy_navigator_agent", [item["key"] for item in result["capability_candidates"]["templates"]])
        self.assertIn("web_search", [item["key"] for item in result["capability_candidates"]["skills"]])
        self.assertEqual(result["activity_events"][0]["kind"], "context_fanout")


if __name__ == "__main__":
    unittest.main()
