from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.compiler.validator import validate_graph
from app.core.schemas.node_system import NodeSystemGraphDocument
from app.core.schemas.actions import (
    ActionLlmNodeEligibility,
    ActionDefinition,
    ActionIoField,
)


def _agent_action_definition(
    action_key: str,
    *,
    eligibility: ActionLlmNodeEligibility = ActionLlmNodeEligibility.READY,
    blockers: list[str] | None = None,
    input_schema: list[ActionIoField] | None = None,
    output_schema: list[ActionIoField] | None = None,
    runtime_entrypoint: str | None = None,
) -> ActionDefinition:
    return ActionDefinition(
        actionKey=action_key,
        name=action_key,
        runtime={"type": "python", "entrypoint": runtime_entrypoint or "run.py"},
        llmOutputSchema=input_schema or [],
        stateOutputSchema=output_schema or [ActionIoField(key="summary", name="Summary", valueType="text")],
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


class NodeSystemValidatorActionTests(unittest.TestCase):
    def test_legacy_breakpoint_metadata_is_rejected(self) -> None:
        graph = _graph_with_agent_config({"actionKey": ""})
        graph.metadata = {
            "interrupt_before": ["agent"],
            "interruptAfter": ["agent"],
            "agent_breakpoint_timing": {"agent": "before"},
        }

        validation = validate_graph(graph)

        self.assertIn("legacy_breakpoint_metadata_not_supported", [issue.code for issue in validation.issues])

    def test_needs_manifest_action_is_rejected_for_agent_nodes(self) -> None:
        graph = _graph_with_agent_config({"actionKey": "legacy_action"})
        definition = _agent_action_definition(
            "legacy_action",
            eligibility=ActionLlmNodeEligibility.NEEDS_MANIFEST,
            blockers=["Action manifest is missing a script runtime entrypoint."],
        )

        with (
            patch("app.core.compiler.validator.get_action_registry", return_value={"legacy_action": object()}),
            patch("app.core.compiler.validator.get_action_catalog_registry", return_value={"legacy_action": definition}),
        ):
            validation = validate_graph(graph)

        self.assertIn("agent_action_not_agent_node_ready", [issue.code for issue in validation.issues])
        self.assertTrue(any("needs a TooGraph LLM-node manifest" in issue.message for issue in validation.issues))

    def test_binding_output_mapping_to_unknown_state_is_rejected(self) -> None:
        graph = _graph_with_agent_config(
            {
                "actionKey": "summarize_text",
                "actionBindings": [
                    {
                        "actionKey": "summarize_text",
                        "outputMapping": {"summary": "missing_state"},
                    }
                ],
            }
        )
        definition = _agent_action_definition("summarize_text")

        with (
            patch("app.core.compiler.validator.get_action_registry", return_value={"summarize_text": object()}),
            patch("app.core.compiler.validator.get_action_catalog_registry", return_value={"summarize_text": definition}),
        ):
            validation = validate_graph(graph)

        self.assertIn("agent_action_output_state_unknown", [issue.code for issue in validation.issues])

    def test_required_action_inputs_are_generated_at_runtime_not_validated_as_static_bindings(self) -> None:
        graph = _graph_with_agent_config(
            {
                "actionKey": "summarize_text",
                "actionBindings": [
                    {
                        "actionKey": "summarize_text",
                        "outputMapping": {"summary": "summary_text"},
                    }
                ],
            }
        )
        definition = _agent_action_definition(
            "summarize_text",
            input_schema=[ActionIoField(key="text", name="Text", valueType="text")],
        )

        with (
            patch("app.core.compiler.validator.get_action_registry", return_value={"summarize_text": object()}),
            patch("app.core.compiler.validator.get_action_catalog_registry", return_value={"summarize_text": definition}),
        ):
            validation = validate_graph(graph)

        self.assertNotIn("agent_action_required_input_missing", [issue.code for issue in validation.issues])

    def test_binding_only_action_is_rejected_as_legacy_attachment(self) -> None:
        graph = _graph_with_agent_config(
            {
                "actionBindings": [
                    {
                        "actionKey": "desktop_profile",
                    }
                ]
            }
        )

        validation = validate_graph(graph)

        self.assertIn("agent_action_binding_without_action_key", [issue.code for issue in validation.issues])

    def test_dynamic_capability_node_requires_single_result_package_output(self) -> None:
        graph = NodeSystemGraphDocument.model_validate(
            {
                "graph_id": "graph-1",
                "name": "Graph",
                "state_schema": {
                    "selected_capability": {"type": "capability", "value": {"kind": "action", "key": "web_search"}},
                    "question": {"type": "text", "value": "q"},
                    "answer": {"type": "text", "value": ""},
                },
                "nodes": {
                    "agent": {
                        "kind": "agent",
                        "ui": {"position": {"x": 0, "y": 0}},
                        "reads": [{"state": "selected_capability"}, {"state": "question"}],
                        "writes": [{"state": "answer"}],
                        "config": {"actionKey": ""},
                    },
                },
                "edges": [],
                "conditional_edges": [],
            }
        )

        validation = validate_graph(graph)

        self.assertIn("dynamic_capability_output_state_invalid", [issue.code for issue in validation.issues])

    def test_static_action_node_cannot_also_read_dynamic_capability_state(self) -> None:
        graph = NodeSystemGraphDocument.model_validate(
            {
                "graph_id": "graph-1",
                "name": "Graph",
                "state_schema": {
                    "selected_capability": {"type": "capability", "value": {"kind": "action", "key": "file_reader"}},
                    "question": {"type": "text", "value": "q"},
                    "answer": {"type": "text", "value": ""},
                },
                "nodes": {
                    "agent": {
                        "kind": "agent",
                        "ui": {"position": {"x": 0, "y": 0}},
                        "reads": [{"state": "selected_capability"}, {"state": "question"}],
                        "writes": [{"state": "answer"}],
                        "config": {"actionKey": "web_search"},
                    },
                },
                "edges": [],
                "conditional_edges": [],
            }
        )
        definition = _agent_action_definition("web_search")

        with (
            patch("app.core.compiler.validator.get_action_registry", return_value={"web_search": object()}),
            patch("app.core.compiler.validator.get_action_catalog_registry", return_value={"web_search": definition}),
        ):
            validation = validate_graph(graph)

        self.assertIn("agent_static_and_dynamic_capability_mixed", [issue.code for issue in validation.issues])


if __name__ == "__main__":
    unittest.main()
