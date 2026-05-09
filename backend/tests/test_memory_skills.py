from __future__ import annotations

from contextlib import contextmanager
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.skills import SkillLlmNodeEligibility, SkillSourceScope
from app.core.storage import database
from app.memory import store
from app.skills.definitions import _parse_native_skill_manifest


REPO_ROOT = Path(__file__).resolve().parents[2]
MEMORY_RECALL_SKILL_DIR = REPO_ROOT / "skill" / "official" / "memory_recall"
MEMORY_CANDIDATE_WRITER_SKILL_DIR = REPO_ROOT / "skill" / "official" / "memory_candidate_writer"


@contextmanager
def isolated_memory_database():
    old_data_dir = database.DATA_DIR
    old_db_path = database.DB_PATH
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = Path(temp_dir)
        database.DATA_DIR = data_dir
        database.DB_PATH = data_dir / "toograph.db"
        try:
            yield
        finally:
            database.DATA_DIR = old_data_dir
            database.DB_PATH = old_db_path


def _load_skill_module(skill_dir: Path):
    spec = importlib.util.spec_from_file_location(f"test_{skill_dir.name}_after_llm", skill_dir / "after_llm.py")
    if spec is None or spec.loader is None:
        raise AssertionError(f"Could not load {skill_dir.name} skill script.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MemorySkillTests(unittest.TestCase):
    def test_memory_recall_manifest_exposes_read_only_context_contract(self) -> None:
        definition = _parse_native_skill_manifest(
            MEMORY_RECALL_SKILL_DIR / "skill.json",
            SkillSourceScope.OFFICIAL,
        ).definition

        self.assertEqual(definition.skill_key, "memory_recall")
        self.assertEqual(definition.llm_node_eligibility, SkillLlmNodeEligibility.READY)
        self.assertEqual(definition.permissions, ["memory_read"])
        self.assertEqual([field.key for field in definition.state_input_schema], ["memory_request"])
        self.assertEqual(
            [field.key for field in definition.llm_output_schema],
            ["query", "scope", "layer", "memory_type", "status", "top_k", "max_chars"],
        )
        self.assertEqual(
            [field.key for field in definition.state_output_schema],
            ["success", "memory_context", "recalled_memories", "omitted_memories", "result"],
        )

    def test_memory_candidate_writer_manifest_exposes_candidate_only_contract(self) -> None:
        definition = _parse_native_skill_manifest(
            MEMORY_CANDIDATE_WRITER_SKILL_DIR / "skill.json",
            SkillSourceScope.OFFICIAL,
        ).definition

        self.assertEqual(definition.skill_key, "memory_candidate_writer")
        self.assertEqual(definition.llm_node_eligibility, SkillLlmNodeEligibility.READY)
        self.assertEqual(definition.permissions, ["memory_candidate_write"])
        self.assertEqual([field.key for field in definition.state_input_schema], ["candidate_plan"])
        self.assertEqual(
            [field.key for field in definition.llm_output_schema],
            ["candidates", "run_id", "node_id", "template_id"],
        )
        self.assertEqual(
            [field.key for field in definition.state_output_schema],
            ["success", "candidate_memories", "skipped_candidates", "result"],
        )

    def test_memory_recall_returns_budgeted_context_without_creating_events(self) -> None:
        memory_recall = _load_skill_module(MEMORY_RECALL_SKILL_DIR)
        with isolated_memory_database():
            first = store.create_memory(
                {
                    "scope": "project",
                    "layer": "procedural",
                    "type": "preference",
                    "summary": "Prefers concise status updates",
                    "content": "Use short factual updates with verification evidence.",
                    "confidence": 0.8,
                    "importance": 0.9,
                    "evidence": [{"run_id": "run_1", "node_id": "answer"}],
                    "source": {"run_id": "run_1", "node_id": "answer"},
                    "status": "active",
                },
                changed_by="test",
                change_reason="seed preference",
            )
            second = store.create_memory(
                {
                    "scope": "project",
                    "layer": "semantic",
                    "type": "fact",
                    "summary": "Concise long archive",
                    "content": "concise " + ("X" * 200),
                    "importance": 0.1,
                    "status": "active",
                },
                changed_by="test",
            )

            result = memory_recall.memory_recall(
                query="concise verification",
                scope="project",
                top_k=5,
                max_chars=120,
            )

            self.assertEqual(result["success"], True)
            self.assertEqual(result["memory_context"]["kind"], "memory_context")
            self.assertEqual(result["memory_context"]["included_count"], 1)
            self.assertEqual(result["recalled_memories"][0]["id"], first["id"])
            self.assertEqual(result["omitted_memories"][0]["id"], second["id"])
            self.assertEqual(store.list_memory_events(first["id"])[0]["action"], "create")
            self.assertEqual(len(store.list_memory_events(first["id"])), 1)
            self.assertEqual(result["activity_events"][0]["kind"], "memory_recall")

    def test_memory_candidate_writer_persists_only_candidate_records_with_source_evidence(self) -> None:
        candidate_writer = _load_skill_module(MEMORY_CANDIDATE_WRITER_SKILL_DIR)
        with isolated_memory_database():
            result = candidate_writer.memory_candidate_writer(
                candidates=[
                    {
                        "scope": "project",
                        "layer": "procedural",
                        "type": "preference",
                        "summary": "Prefers verification evidence",
                        "content": "Include test or health-check evidence when reporting changes.",
                        "confidence": 0.82,
                        "importance": 0.74,
                        "evidence": [{"run_id": "run_review_1", "node_id": "final_reply"}],
                        "artifact_refs": [{"path": "runs/run_review_1/report.md", "content_type": "text/markdown"}],
                        "status": "active",
                    }
                ],
                run_id="run_review_1",
                node_id="self_review",
                template_id="buddy_self_review",
            )

            self.assertEqual(result["success"], True)
            self.assertEqual(result["skipped_candidates"], [])
            self.assertEqual(len(result["candidate_memories"]), 1)
            candidate = result["candidate_memories"][0]
            self.assertEqual(candidate["status"], "candidate")
            self.assertEqual(candidate["source"]["run_id"], "run_review_1")
            self.assertEqual(candidate["source"]["node_id"], "self_review")
            self.assertEqual(candidate["source"]["template_id"], "buddy_self_review")
            persisted = store.get_memory(candidate["id"])
            self.assertEqual(persisted["status"], "candidate")
            self.assertEqual(persisted["evidence"][0]["run_id"], "run_review_1")
            self.assertEqual(store.list_memory_revisions(candidate["id"])[0]["action"], "create")
            self.assertEqual(result["activity_events"][0]["kind"], "memory_candidate_write")

    def test_memory_candidate_writer_rejects_candidates_without_evidence(self) -> None:
        candidate_writer = _load_skill_module(MEMORY_CANDIDATE_WRITER_SKILL_DIR)
        with isolated_memory_database():
            result = candidate_writer.memory_candidate_writer(
                candidates=[
                    {
                        "scope": "project",
                        "layer": "semantic",
                        "type": "fact",
                        "summary": "Unsupported candidate",
                        "content": "This candidate has no evidence and must not be persisted.",
                    }
                ],
                run_id="run_review_2",
                node_id="self_review",
            )

            self.assertEqual(result["success"], False)
            self.assertEqual(result["candidate_memories"], [])
            self.assertEqual(result["skipped_candidates"][0]["error_type"], "missing_evidence")
            self.assertEqual(store.list_memories(status=None), [])


if __name__ == "__main__":
    unittest.main()
