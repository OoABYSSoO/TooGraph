from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.skills import SkillAgentNodeEligibility, SkillSourceScope
from app.skills.definitions import _parse_native_skill_manifest


class SkillManifestContractTests(unittest.TestCase):
    def test_skill_definition_payload_omits_legacy_compatibility_reports(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "summarize_text"
            skill_dir.mkdir()
            manifest = skill_dir / "skill.json"
            manifest.write_text(
                json.dumps(
                    {
                        "schemaVersion": "graphite.skill/v1",
                        "skillKey": "summarize_text",
                        "label": "Summarize Text",
                        "targets": ["agent_node"],
                        "inputSchema": [
                            {"key": "text", "label": "Text", "valueType": "text", "required": True}
                        ],
                        "outputSchema": [
                            {"key": "summary", "label": "Summary", "valueType": "text"}
                        ],
                        "runtime": {"type": "builtin", "entrypoint": "summarize_text"},
                        "health": {"type": "builtin"},
                    }
                ),
                encoding="utf-8",
            )

            definition = _parse_native_skill_manifest(manifest, SkillSourceScope.GRAPHITE_MANAGED).definition

        self.assertNotIn("compatibility", definition.model_dump(by_alias=True))

    def test_native_manifest_exposes_runtime_health_and_ready_eligibility(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "normalize_storyboard_shots"
            skill_dir.mkdir()
            manifest = skill_dir / "skill.json"
            manifest.write_text(
                json.dumps(
                    {
                        "schemaVersion": "graphite.skill/v1",
                        "skillKey": "normalize_storyboard_shots",
                        "label": "Normalize Storyboard Shots",
                        "targets": ["agent_node"],
                        "inputSchema": [
                            {"key": "shots", "label": "Shots", "valueType": "json", "required": True}
                        ],
                        "outputSchema": [
                            {"key": "normalized_shots", "label": "Normalized Shots", "valueType": "json"}
                        ],
                        "runtime": {"type": "builtin", "entrypoint": "normalize_storyboard_shots"},
                        "health": {"type": "builtin"},
                    }
                ),
                encoding="utf-8",
            )

            definition = _parse_native_skill_manifest(manifest, SkillSourceScope.GRAPHITE_MANAGED).definition

        self.assertEqual(definition.schema_version, "graphite.skill/v1")
        self.assertEqual(definition.runtime.type, "builtin")
        self.assertEqual(definition.runtime.entrypoint, "normalize_storyboard_shots")
        self.assertEqual(definition.health.type, "builtin")
        self.assertEqual(definition.agent_node_eligibility, SkillAgentNodeEligibility.READY)
        self.assertEqual(definition.agent_node_blockers, [])

    def test_companion_only_manifest_is_not_agent_node_ready(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "profile"
            skill_dir.mkdir()
            manifest = skill_dir / "skill.json"
            manifest.write_text(
                json.dumps(
                    {
                        "schemaVersion": "graphite.skill/v1",
                        "skillKey": "desktop_profile",
                        "label": "Desktop Profile",
                        "targets": ["companion"],
                        "kind": "profile",
                        "mode": "context",
                        "runtime": {"type": "none"},
                    }
                ),
                encoding="utf-8",
            )

            definition = _parse_native_skill_manifest(manifest, SkillSourceScope.GRAPHITE_MANAGED).definition

        self.assertEqual(definition.agent_node_eligibility, SkillAgentNodeEligibility.INCOMPATIBLE)
        self.assertIn("Skill target does not include agent_node.", definition.agent_node_blockers)

    def test_manifest_without_runtime_needs_manifest_before_agent_node_use(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "legacy"
            skill_dir.mkdir()
            manifest = skill_dir / "skill.json"
            manifest.write_text(
                json.dumps(
                    {
                        "schemaVersion": "graphite.skill/v1",
                        "skillKey": "legacy_agent_skill",
                        "label": "Legacy Agent Skill",
                        "targets": ["agent_node"],
                    }
                ),
                encoding="utf-8",
            )

            definition = _parse_native_skill_manifest(manifest, SkillSourceScope.GRAPHITE_MANAGED).definition

        self.assertEqual(definition.agent_node_eligibility, SkillAgentNodeEligibility.NEEDS_MANIFEST)
        self.assertIn("Skill manifest is missing a builtin runtime entrypoint.", definition.agent_node_blockers)


if __name__ == "__main__":
    unittest.main()
