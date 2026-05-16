from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.schemas import node_system
from app.core.schemas.node_system import NodeSystemAgentActionBinding, NodeSystemAgentConfig, NodeSystemAgentNode, NodeSystemGraphDocument


def _minimal_agent_graph(config: dict) -> dict:
    return {
        "graph_id": "graph-action-protocol",
        "name": "Action Protocol",
        "state_schema": {
            "query": {"type": "text", "value": "q"},
            "results": {
                "type": "json",
                "value": [],
                "binding": {
                    "kind": "action_output",
                    "actionKey": "web_search",
                    "nodeId": "agent",
                    "fieldKey": "results",
                    "managed": True,
                },
            },
        },
        "nodes": {
            "agent": {
                "kind": "agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [
                    {
                        "state": "query",
                        "binding": {
                            "kind": "action_input",
                            "actionKey": "web_search",
                            "fieldKey": "query",
                            "managed": True,
                        },
                    }
                ],
                "writes": [{"state": "results"}],
                "config": config,
            }
        },
        "edges": [],
        "conditional_edges": [],
    }


class NodeSystemActionProtocolTests(unittest.TestCase):
    def test_node_system_schema_does_not_export_legacy_skill_protocol_aliases(self) -> None:
        self.assertFalse(hasattr(node_system, "NodeSystemAgentSkillBinding"))
        self.assertFalse(hasattr(node_system, "NodeSystemSkillInstructionBlock"))
        self.assertFalse(hasattr(NodeSystemAgentActionBinding(actionKey="web_search"), "skill_key"))
        self.assertFalse(hasattr(NodeSystemAgentConfig(actionKey="web_search"), "skill_key"))
        self.assertFalse(hasattr(NodeSystemAgentConfig(actionKey="web_search"), "skill_bindings"))

    def test_agent_config_accepts_action_protocol_fields(self) -> None:
        graph = NodeSystemGraphDocument.model_validate(
            _minimal_agent_graph(
                {
                    "actionKey": "web_search",
                    "actionBindings": [
                        {
                            "actionKey": "web_search",
                            "outputMapping": {"results": "results"},
                        }
                    ],
                    "actionInstructionBlocks": {
                        "web_search": {
                            "actionKey": "web_search",
                            "title": "Search action instruction",
                            "content": "Use the search action once.",
                            "source": "action.llmInstruction",
                        }
                    },
                }
            )
        )

        agent = graph.nodes["agent"]
        self.assertIsInstance(agent, NodeSystemAgentNode)
        self.assertEqual(agent.config.action_key, "web_search")
        self.assertEqual(agent.config.action_bindings[0].action_key, "web_search")
        self.assertEqual(agent.reads[0].binding.action_key, "web_search")
        self.assertEqual(graph.state_schema["results"].binding.action_key, "web_search")

        dumped = graph.model_dump(by_alias=True, mode="json")
        dumped_config = dumped["nodes"]["agent"]["config"]
        self.assertEqual(dumped_config["actionKey"], "web_search")
        self.assertIn("actionBindings", dumped_config)
        self.assertIn("actionInstructionBlocks", dumped_config)
        self.assertNotIn("skillKey", dumped_config)
        self.assertEqual(dumped["state_schema"]["results"]["binding"]["kind"], "action_output")
        self.assertEqual(dumped["nodes"]["agent"]["reads"][0]["binding"]["kind"], "action_input")

    def test_legacy_skill_protocol_fields_are_rejected(self) -> None:
        legacy_graph = _minimal_agent_graph(
            {
                "skillKey": "web_search",
                "skillBindings": [{"skillKey": "web_search"}],
            }
        )
        legacy_graph["state_schema"]["results"]["binding"] = {
            "kind": "skill_output",
            "skillKey": "web_search",
            "nodeId": "agent",
            "fieldKey": "results",
        }

        with self.assertRaises(ValidationError):
            NodeSystemGraphDocument.model_validate(legacy_graph)


if __name__ == "__main__":
    unittest.main()
