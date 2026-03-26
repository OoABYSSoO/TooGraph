from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.skills import SkillAgentNodeEligibility, SkillSideEffect, SkillSourceScope
from app.skills.definitions import _parse_native_skill_manifest


def _write_manifest(skill_dir: Path, payload: dict[str, object]) -> Path:
    manifest = skill_dir / "skill.json"
    manifest.write_text(json.dumps(payload), encoding="utf-8")
    return manifest


def _ready_manifest(skill_key: str) -> dict[str, object]:
    return {
        "schemaVersion": "graphite.skill/v1",
        "skillKey": skill_key,
        "label": skill_key.replace("_", " ").title(),
        "inputSchema": [
            {"key": "text", "label": "Text", "valueType": "text", "required": True}
        ],
        "outputSchema": [
            {"key": "result", "label": "Result", "valueType": "text"}
        ],
        "runtime": {"type": "python", "entrypoint": "run.py"},
        "health": {"type": "none"},
    }


class SkillManifestContractTests(unittest.TestCase):
    def test_skill_definition_payload_exposes_run_policies_and_omits_legacy_targets(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "summarize_text"
            skill_dir.mkdir()
            payload = _ready_manifest("summarize_text")
            payload["runPolicies"] = {
                "default": {
                    "discoverable": True,
                    "autoSelectable": False,
                    "requiresApproval": False,
                },
                "origins": {
                    "companion": {
                        "discoverable": True,
                        "autoSelectable": True,
                        "requiresApproval": True,
                    }
                },
            }
            manifest = _write_manifest(skill_dir, payload)
            (skill_dir / "run.py").write_text("print('{}')\n", encoding="utf-8")

            definition = _parse_native_skill_manifest(manifest, SkillSourceScope.INSTALLED).definition

        serialized = definition.model_dump(by_alias=True)
        self.assertNotIn("compatibility", serialized)
        self.assertNotIn("targets", serialized)
        self.assertEqual(
            serialized["runPolicies"],
            {
                "default": {
                    "discoverable": True,
                    "autoSelectable": False,
                    "requiresApproval": False,
                },
                "origins": {
                    "companion": {
                        "discoverable": True,
                        "autoSelectable": True,
                        "requiresApproval": True,
                    }
                },
            },
        )

    def test_native_manifest_exposes_runtime_health_and_ready_eligibility(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "normalize_storyboard_shots"
            skill_dir.mkdir()
            payload = _ready_manifest("normalize_storyboard_shots")
            payload["inputSchema"] = [
                {"key": "shots", "label": "Shots", "valueType": "json", "required": True}
            ]
            payload["outputSchema"] = [
                {"key": "normalized_shots", "label": "Normalized Shots", "valueType": "json"}
            ]
            manifest = _write_manifest(skill_dir, payload)
            (skill_dir / "run.py").write_text("print('{}')\n", encoding="utf-8")

            definition = _parse_native_skill_manifest(manifest, SkillSourceScope.INSTALLED).definition

        self.assertEqual(definition.schema_version, "graphite.skill/v1")
        self.assertEqual(definition.runtime.type, "python")
        self.assertEqual(definition.runtime.entrypoint, "run.py")
        self.assertEqual(definition.health.type, "none")
        self.assertEqual(definition.agent_node_eligibility, SkillAgentNodeEligibility.READY)
        self.assertEqual(definition.agent_node_blockers, [])
        self.assertTrue(definition.run_policies.default.discoverable)
        self.assertFalse(definition.run_policies.default.auto_selectable)
        self.assertFalse(definition.run_policies.default.requires_approval)

    def test_legacy_targets_field_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "legacy_targets"
            skill_dir.mkdir()
            payload = _ready_manifest("legacy_targets")
            payload["targets"] = ["agent_node"]
            manifest = _write_manifest(skill_dir, payload)
            (skill_dir / "run.py").write_text("print('{}')\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "targets.*no longer supported"):
                _parse_native_skill_manifest(manifest, SkillSourceScope.INSTALLED)

    def test_manifest_without_runtime_needs_manifest_before_agent_node_use(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "legacy"
            skill_dir.mkdir()
            manifest = _write_manifest(
                skill_dir,
                {
                    "schemaVersion": "graphite.skill/v1",
                    "skillKey": "legacy_agent_skill",
                    "label": "Legacy Agent Skill",
                },
            )

            definition = _parse_native_skill_manifest(manifest, SkillSourceScope.INSTALLED).definition

        self.assertEqual(definition.agent_node_eligibility, SkillAgentNodeEligibility.NEEDS_MANIFEST)
        self.assertIn("Skill manifest is missing a script runtime entrypoint.", definition.agent_node_blockers)

    def test_web_search_manifest_is_ready_with_origin_run_policies_and_network_permissions(self) -> None:
        manifest = Path(__file__).resolve().parents[2] / "skill" / "web_search" / "skill.json"

        definition = _parse_native_skill_manifest(manifest, SkillSourceScope.INSTALLED).definition
        serialized = definition.model_dump(by_alias=True)

        self.assertEqual(definition.skill_key, "web_search")
        self.assertNotIn("targets", serialized)
        self.assertTrue(definition.run_policies.default.discoverable)
        self.assertFalse(definition.run_policies.default.auto_selectable)
        self.assertTrue(definition.run_policies.origins["companion"].discoverable)
        self.assertTrue(definition.run_policies.origins["companion"].auto_selectable)
        self.assertTrue(definition.run_policies.origins["companion"].requires_approval)
        self.assertEqual(definition.runtime.type, "python")
        self.assertEqual(definition.runtime.entrypoint, "run.py")
        self.assertEqual(definition.agent_node_eligibility, SkillAgentNodeEligibility.READY)
        self.assertIn("network", definition.permissions)
        self.assertIn(SkillSideEffect.NETWORK, definition.side_effects)
        self.assertIn(SkillSideEffect.SECRET_READ, definition.side_effects)


if __name__ == "__main__":
    unittest.main()
