from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database
from app.evaluator import store
from app.evaluator.official_seed import seed_official_eval_suites


@contextmanager
def isolated_eval_database():
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


class OfficialEvalSeedTests(unittest.TestCase):
    def test_seed_official_eval_suites_covers_core_buddy_web_skill_and_business_templates(self) -> None:
        with isolated_eval_database():
            first_summary = seed_official_eval_suites()
            second_summary = seed_official_eval_suites()
            suite_ids = {suite["suite_id"] for suite in store.list_eval_suites()}

            expected_suite_ids = {
                "buddy_autonomous_loop_core",
                "buddy_capability_loop_core",
                "toograph_page_operation_workflow_core",
                "toograph_skill_creation_workflow_core",
                "advanced_web_research_loop_core",
                "policy_navigator_agent_lightweight",
            }
            self.assertTrue(expected_suite_ids.issubset(suite_ids))

            buddy_case = store.load_eval_case("buddy_autonomous_loop_core", "buddy-main-loop-clarifies-ambiguous-request")
            skill_case = store.load_eval_case("toograph_skill_creation_workflow_core", "skill-creation-clarifies-unsafe-write")
            policy_case = store.load_eval_case(
                "policy_navigator_agent_lightweight",
                "policy-navigator-mock-housing-subsidy",
            )

        self.assertGreaterEqual(first_summary["suite_count"], 6)
        self.assertEqual(second_summary["created_or_updated_case_count"], first_summary["created_or_updated_case_count"])
        self.assertEqual(buddy_case["input_values"]["user_message"], "帮我优化当前图，让它以后能自动改自己。")
        self.assertEqual(buddy_case["checks"][0]["kind"], "schema")
        self.assertEqual(buddy_case["checks"][1]["kind"], "llm_judge")
        self.assertEqual(buddy_case["checks"][1]["details"]["original_kind"], "rule")
        self.assertEqual(skill_case["metadata"]["template_id"], "toograph_skill_creation_workflow")
        self.assertIn("policy_sources", policy_case["input_values"])
        self.assertEqual(policy_case["checks"][0]["kind"], "llm_judge")
        self.assertEqual(policy_case["checks"][0]["details"]["original_kind"], "schema")

    def test_seed_official_eval_suites_keeps_executable_knowledge_retrieval_checks(self) -> None:
        with isolated_eval_database(), tempfile.TemporaryDirectory() as temp_dir:
            template_root = Path(temp_dir) / "official"
            template_dir = template_root / "rag_quality_template"
            template_dir.mkdir(parents=True)
            (template_dir / "template.json").write_text(
                """
                {
                  "template_id": "rag_quality_template",
                  "label": "RAG Quality Template",
                  "description": "Fixture template for RAG eval checks.",
                  "metadata": {"category": "test"}
                }
                """,
                encoding="utf-8",
            )
            (template_dir / "eval_cases.json").write_text(
                """
                {
                  "suite_id": "rag_quality_template_official",
                  "cases": [
                    {
                      "case_id": "refund-retrieval-quality",
                      "checks": [
                        {
                          "kind": "knowledge_retrieval",
                          "target": "knowledge_context",
                          "min_results": 1,
                          "required_chunk_ids": ["refund-policy#rules"],
                          "required_terms": ["refund"]
                        }
                      ]
                    }
                  ]
                }
                """,
                encoding="utf-8",
            )

            seed_official_eval_suites(template_root)
            case = store.load_eval_case("rag_quality_template_official", "refund-retrieval-quality")

        self.assertEqual(case["checks"][0]["kind"], "knowledge_retrieval")
        self.assertEqual(case["checks"][0]["required_chunk_ids"], ["refund-policy#rules"])


if __name__ == "__main__":
    unittest.main()
