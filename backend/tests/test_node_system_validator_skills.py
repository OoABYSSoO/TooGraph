from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.compiler.validator import validate_graph
from app.core.schemas.node_system import NodeSystemGraphDocument
from app.core.schemas.skills import (
    SkillLlmNodeEligibility,
    SkillDefinition,
    SkillIoField,
)


def _agent_skill_definition(
    skill_key: str,
    *,
    eligibility: SkillLlmNodeEligibility = SkillLlmNodeEligibility.READY,
    blockers: list[str] | None = None,
    input_schema: list[SkillIoField] | None = None,
    output_schema: list[SkillIoField] | None = None,
    runtime_entrypoint: str | None = None,
) -> SkillDefinition:
    return SkillDefinition(
        skillKey=skill_key,
        name=skill_key,
        runtime={"type": "python", "entrypoint": runtime_entrypoint or "run.py"},
        inputSchema=input_schema or [],
        outputSchema=output_schema or [SkillIoField(key="summary", name="Summary", valueType="text")],
        runtimeReady=True,
        runtimeRegistered=True,
        configured=True,
        healthy=True,
        llmNodeEligibility=eligibility,
        llmNodeBlockers=blockers or [],
    )


def _graph_with_agent_config(config: dict) -> NodeSystemGraphDocument:
    return NodeSystemGraphDocument.model_validate(
        {
            "graph_id": "graph-1",
            "name": "Graph",
            "state_schema": {
                "source_text": {"type": "text", "value": "Long text"},
                "summary_text": {"type": "text", "value": ""},
            },
            "nodes": {
                "input_source": {
                    "kind": "input",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "writes": [{"state": "source_text"}],
                },
                "agent": {
                    "kind": "agent",
                    "ui": {"position": {"x": 200, "y": 0}},
                    "reads": [{"state": "source_text"}],
                    "writes": [{"state": "summary_text"}],
                    "config": config,
                },
            },
            "edges": [{"source": "input_source", "target": "agent"}],
            "conditional_edges": [],
        }
    )


class NodeSystemValidatorSkillTests(unittest.TestCase):
    def test_needs_manifest_skill_is_rejected_for_agent_nodes(self) -> None:
        graph = _graph_with_agent_config({"skillKey": "legacy_skill"})
        definition = _agent_skill_definition(
            "legacy_skill",
            eligibility=SkillLlmNodeEligibility.NEEDS_MANIFEST,
            blockers=["Skill manifest is missing a script runtime entrypoint."],
        )

        with (
            patch("app.core.compiler.validator.get_skill_registry", return_value={"legacy_skill": object()}),
            patch("app.core.compiler.validator.get_skill_catalog_registry", return_value={"legacy_skill": definition}),
        ):
            validation = validate_graph(graph)

        self.assertIn("agent_skill_not_agent_node_ready", [issue.code for issue in validation.issues])
        self.assertTrue(any("needs a GraphiteUI LLM-node manifest" in issue.message for issue in validation.issues))

    def test_binding_output_mapping_to_unknown_state_is_rejected(self) -> None:
        graph = _graph_with_agent_config(
            {
                "skillKey": "summarize_text",
                "skillBindings": [
                    {
                        "skillKey": "summarize_text",
                        "outputMapping": {"summary": "missing_state"},
                    }
                ],
            }
        )
        definition = _agent_skill_definition("summarize_text")

        with (
            patch("app.core.compiler.validator.get_skill_registry", return_value={"summarize_text": object()}),
            patch("app.core.compiler.validator.get_skill_catalog_registry", return_value={"summarize_text": definition}),
        ):
            validation = validate_graph(graph)

        self.assertIn("agent_skill_output_state_unknown", [issue.code for issue in validation.issues])

    def test_required_skill_inputs_are_generated_at_runtime_not_validated_as_static_bindings(self) -> None:
        graph = _graph_with_agent_config(
            {
                "skillKey": "summarize_text",
                "skillBindings": [
                    {
                        "skillKey": "summarize_text",
                        "outputMapping": {"summary": "summary_text"},
                    }
                ],
            }
        )
        definition = _agent_skill_definition(
            "summarize_text",
            input_schema=[SkillIoField(key="text", name="Text", valueType="text", required=True)],
        )

        with (
            patch("app.core.compiler.validator.get_skill_registry", return_value={"summarize_text": object()}),
            patch("app.core.compiler.validator.get_skill_catalog_registry", return_value={"summarize_text": definition}),
        ):
            validation = validate_graph(graph)

        self.assertNotIn("agent_skill_required_input_missing", [issue.code for issue in validation.issues])

    def test_binding_only_skill_still_goes_through_agent_node_validation(self) -> None:
        graph = _graph_with_agent_config(
            {
                "skillBindings": [
                    {
                        "skillKey": "desktop_profile",
                    }
                ]
            }
        )
        definition = _agent_skill_definition(
            "desktop_profile",
            eligibility=SkillLlmNodeEligibility.NEEDS_MANIFEST,
            blockers=["Skill manifest is missing a script runtime entrypoint."],
        )

        with (
            patch("app.core.compiler.validator.get_skill_registry", return_value={"desktop_profile": object()}),
            patch("app.core.compiler.validator.get_skill_catalog_registry", return_value={"desktop_profile": definition}),
        ):
            validation = validate_graph(graph)

        self.assertIn("agent_skill_not_agent_node_ready", [issue.code for issue in validation.issues])


if __name__ == "__main__":
    unittest.main()
