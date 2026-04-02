from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas.skills import SkillLlmNodeEligibility, SkillSourceScope
from app.skills.definitions import _parse_native_skill_manifest


def _write_manifest(skill_dir: Path, payload: dict[str, object]) -> Path:
    manifest = skill_dir / "skill.json"
    manifest.write_text(json.dumps(payload), encoding="utf-8")
    return manifest


def _ready_manifest(skill_key: str) -> dict[str, object]:
    return {
        "schemaVersion": "graphite.skill/v1",
        "skillKey": skill_key,
        "name": skill_key.replace("_", " ").title(),
        "llmInstruction": f"Use {skill_key} only when it is explicitly bound to the LLM node.",
        "inputSchema": [
            {"key": "text", "name": "Text", "valueType": "text", "required": True}
        ],
        "outputSchema": [
            {"key": "result", "name": "Result", "valueType": "text"}
        ],
        "runtime": {"type": "python", "entrypoint": "run.py"},
    }


class SkillManifestContractTests(unittest.TestCase):
    def test_skill_definition_payload_exposes_capability_policy_and_omits_legacy_targets(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "summarize_text"
            skill_dir.mkdir()
            payload = _ready_manifest("summarize_text")
            payload["capabilityPolicy"] = {
                "default": {
                    "selectable": True,
                    "requiresApproval": False,
                },
                "origins": {
                    "companion": {
                        "selectable": True,
                        "requiresApproval": True,
                    }
                },
            }
            manifest = _write_manifest(skill_dir, payload)
            (skill_dir / "run.py").write_text("print('{}')\n", encoding="utf-8")

            definition = _parse_native_skill_manifest(manifest, SkillSourceScope.INSTALLED).definition

        serialized = definition.model_dump(by_alias=True)
        self.assertEqual(serialized["name"], "Summarize Text")
        self.assertEqual(
            serialized["llmInstruction"],
            "Use summarize_text only when it is explicitly bound to the LLM node.",
        )
        self.assertNotIn("agentInstruction", serialized)
        self.assertNotIn("label", serialized)
        self.assertNotIn("compatibility", serialized)
        self.assertNotIn("targets", serialized)
        self.assertNotIn("health", serialized)
        self.assertNotIn("configured", serialized)
        self.assertNotIn("healthy", serialized)
        self.assertEqual(
            serialized["capabilityPolicy"],
            {
                "default": {
                    "selectable": True,
                    "requiresApproval": False,
                },
                "origins": {
                    "companion": {
                        "selectable": True,
                        "requiresApproval": True,
                    }
                },
            },
        )

    def test_native_manifest_exposes_runtime_and_ready_eligibility(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "normalize_storyboard_shots"
            skill_dir.mkdir()
            payload = _ready_manifest("normalize_storyboard_shots")
            payload["inputSchema"] = [
                {"key": "shots", "name": "Shots", "valueType": "json", "required": True}
            ]
            payload["outputSchema"] = [
                {"key": "normalized_shots", "name": "Normalized Shots", "valueType": "json"}
            ]
            manifest = _write_manifest(skill_dir, payload)
            (skill_dir / "run.py").write_text("print('{}')\n", encoding="utf-8")

            definition = _parse_native_skill_manifest(manifest, SkillSourceScope.INSTALLED).definition

        self.assertEqual(definition.schema_version, "graphite.skill/v1")
        self.assertEqual(definition.runtime.type, "python")
        self.assertEqual(definition.runtime.entrypoint, "run.py")
        self.assertEqual(definition.llm_node_eligibility, SkillLlmNodeEligibility.READY)
        self.assertEqual(definition.llm_node_blockers, [])
        self.assertTrue(definition.capability_policy.default.selectable)
        self.assertFalse(definition.capability_policy.default.requires_approval)

    def test_static_health_fields_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "static_health"
            skill_dir.mkdir()
            payload = _ready_manifest("static_health")
            payload["health"] = {"type": "none"}
            payload["configured"] = True
            payload["healthy"] = True
            manifest = _write_manifest(skill_dir, payload)
            (skill_dir / "run.py").write_text("print('{}')\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "health.*no longer supported"):
                _parse_native_skill_manifest(manifest, SkillSourceScope.INSTALLED)

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

    def test_legacy_agent_instruction_field_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "legacy_agent_instruction"
            skill_dir.mkdir()
            payload = _ready_manifest("legacy_agent_instruction")
            payload.pop("llmInstruction")
            payload["agentInstruction"] = "Old field."
            manifest = _write_manifest(skill_dir, payload)
            (skill_dir / "run.py").write_text("print('{}')\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "agentInstruction.*llmInstruction"):
                _parse_native_skill_manifest(manifest, SkillSourceScope.INSTALLED)

    def test_legacy_execution_targets_field_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "legacy_execution_targets"
            skill_dir.mkdir()
            payload = _ready_manifest("legacy_execution_targets")
            payload["executionTargets"] = ["agent_node"]
            manifest = _write_manifest(skill_dir, payload)
            (skill_dir / "run.py").write_text("print('{}')\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "executionTargets.*no longer supported"):
                _parse_native_skill_manifest(manifest, SkillSourceScope.INSTALLED)

    def test_legacy_skill_protocol_fields_are_rejected(self) -> None:
        legacy_fields = {
            "runPolicies": "capabilityPolicy",
            "supportedValueTypes": "outputSchema",
            "sideEffects": "permissions",
            "kind": "no longer supported",
            "mode": "no longer supported",
            "scope": "no longer supported",
        }
        for legacy_field, replacement in legacy_fields.items():
            with self.subTest(legacy_field=legacy_field):
                with tempfile.TemporaryDirectory() as temp_dir:
                    skill_dir = Path(temp_dir) / f"legacy_{legacy_field}"
                    skill_dir.mkdir()
                    payload = _ready_manifest(f"legacy_{legacy_field}")
                    payload[legacy_field] = "atomic"
                    manifest = _write_manifest(skill_dir, payload)
                    (skill_dir / "run.py").write_text("print('{}')\n", encoding="utf-8")

                    with self.assertRaisesRegex(ValueError, f"{legacy_field}.*{replacement}"):
                        _parse_native_skill_manifest(manifest, SkillSourceScope.INSTALLED)

    def test_legacy_capability_policy_keys_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "legacy_capability_policy"
            skill_dir.mkdir()
            payload = _ready_manifest("legacy_capability_policy")
            payload["capabilityPolicy"] = {
                "default": {
                    "selectable": True,
                    "autoSelectable": True,
                    "requiresApproval": False,
                },
                "origins": {},
            }
            manifest = _write_manifest(skill_dir, payload)
            (skill_dir / "run.py").write_text("print('{}')\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "autoSelectable"):
                _parse_native_skill_manifest(manifest, SkillSourceScope.INSTALLED)

    def test_legacy_top_level_label_field_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "legacy_label"
            skill_dir.mkdir()
            payload = _ready_manifest("legacy_label")
            payload["label"] = "Legacy Label"
            manifest = _write_manifest(skill_dir, payload)
            (skill_dir / "run.py").write_text("print('{}')\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "label.*no longer supported"):
                _parse_native_skill_manifest(manifest, SkillSourceScope.INSTALLED)

    def test_legacy_io_field_label_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            skill_dir = Path(temp_dir) / "legacy_io_label"
            skill_dir.mkdir()
            payload = _ready_manifest("legacy_io_label")
            payload["inputSchema"] = [
                {"key": "text", "label": "Text", "valueType": "text", "required": True}
            ]
            manifest = _write_manifest(skill_dir, payload)
            (skill_dir / "run.py").write_text("print('{}')\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "IO field 'label'.*no longer supported"):
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
                    "name": "Legacy Agent Skill",
                },
            )

            definition = _parse_native_skill_manifest(manifest, SkillSourceScope.INSTALLED).definition

        self.assertEqual(definition.llm_node_eligibility, SkillLlmNodeEligibility.NEEDS_MANIFEST)
        self.assertIn("Skill manifest is missing a script runtime entrypoint.", definition.llm_node_blockers)

    def test_web_search_manifest_is_ready_with_origin_capability_policy_and_network_permissions(self) -> None:
        manifest = Path(__file__).resolve().parents[2] / "skill" / "web_search" / "skill.json"

        definition = _parse_native_skill_manifest(manifest, SkillSourceScope.INSTALLED).definition
        serialized = definition.model_dump(by_alias=True)

        self.assertEqual(definition.skill_key, "web_search")
        self.assertNotIn("targets", serialized)
        self.assertTrue(definition.capability_policy.default.selectable)
        self.assertFalse(definition.capability_policy.default.requires_approval)
        self.assertTrue(definition.capability_policy.origins["companion"].selectable)
        self.assertFalse(definition.capability_policy.origins["companion"].requires_approval)
        self.assertEqual(definition.runtime.type, "none")
        self.assertEqual(definition.runtime.entrypoint, "")
        self.assertEqual(definition.llm_node_eligibility, SkillLlmNodeEligibility.READY)
        self.assertEqual([field.key for field in definition.input_schema], ["query"])
        self.assertEqual([field.key for field in definition.output_schema], ["query", "source_urls", "artifact_paths", "errors"])
        self.assertIn("network", definition.permissions)
        self.assertIn("browser_automation", definition.permissions)


if __name__ == "__main__":
    unittest.main()
