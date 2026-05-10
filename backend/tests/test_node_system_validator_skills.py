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
    def test_legacy_breakpoint_metadata_is_rejected(self) -> None:
        graph = _graph_with_agent_config({"skillKey": ""})
        graph.metadata = {
            "interrupt_before": ["agent"],
            "interruptAfter": ["agent"],
            "agent_breakpoint_timing": {"agent": "before"},
        }

        validation = validate_graph(graph)

        self.assertIn("legacy_breakpoint_metadata_not_supported", [issue.code for issue in validation.issues])

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
        self.assertTrue(any("needs a TooGraph LLM-node manifest" in issue.message for issue in validation.issues))

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

    def test_binding_only_skill_is_rejected_as_legacy_attachment(self) -> None:
        graph = _graph_with_agent_config(
            {
                "skillBindings": [
                    {
                        "skillKey": "desktop_profile",
                    }
                ]
            }
        )

        validation = validate_graph(graph)

        self.assertIn("agent_skill_binding_without_skill_key", [issue.code for issue in validation.issues])

    def test_dynamic_capability_node_requires_single_result_package_output(self) -> None:
        graph = NodeSystemGraphDocument.model_validate(
            {
                "graph_id": "graph-1",
                "name": "Graph",
                "state_schema": {
                    "selected_capability": {"type": "capability", "value": {"kind": "skill", "key": "web_search"}},
                    "question": {"type": "text", "value": "q"},
                    "answer": {"type": "text", "value": ""},
                },
                "nodes": {
                    "agent": {
                        "kind": "agent",
                        "ui": {"position": {"x": 0, "y": 0}},
                        "reads": [{"state": "selected_capability"}, {"state": "question"}],
                        "writes": [{"state": "answer"}],
                        "config": {"skillKey": ""},
                    },
                },
                "edges": [],
                "conditional_edges": [],
            }
        )

        validation = validate_graph(graph)

        self.assertIn("dynamic_capability_output_state_invalid", [issue.code for issue in validation.issues])

    def test_static_skill_node_cannot_also_read_dynamic_capability_state(self) -> None:
        graph = NodeSystemGraphDocument.model_validate(
            {
                "graph_id": "graph-1",
                "name": "Graph",
                "state_schema": {
                    "selected_capability": {"type": "capability", "value": {"kind": "skill", "key": "file_reader"}},
                    "question": {"type": "text", "value": "q"},
                    "answer": {"type": "text", "value": ""},
                },
                "nodes": {
                    "agent": {
                        "kind": "agent",
                        "ui": {"position": {"x": 0, "y": 0}},
                        "reads": [{"state": "selected_capability"}, {"state": "question"}],
                        "writes": [{"state": "answer"}],
                        "config": {"skillKey": "web_search"},
                    },
                },
                "edges": [],
                "conditional_edges": [],
            }
        )
        definition = _agent_skill_definition("web_search")

        with (
            patch("app.core.compiler.validator.get_skill_registry", return_value={"web_search": object()}),
            patch("app.core.compiler.validator.get_skill_catalog_registry", return_value={"web_search": definition}),
        ):
            validation = validate_graph(graph)

        self.assertIn("agent_static_and_dynamic_capability_mixed", [issue.code for issue in validation.issues])


if __name__ == "__main__":
    unittest.main()
