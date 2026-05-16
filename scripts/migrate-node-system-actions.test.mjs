import assert from "node:assert/strict";
import test from "node:test";

import { migrateNodeSystemActions } from "./migrate-node-system-actions.mjs";

test("migrateNodeSystemActions rewrites legacy node capability Skill protocol to Action protocol", () => {
  const source = {
    nodes: {
      llm_1: {
        kind: "agent",
        config: {
          skillKey: "web_search",
          skillBindings: [{ skillKey: "web_search", outputMapping: { results: "search_results" } }],
          skillInstructionBlocks: {
            web_search: { skillKey: "web_search", content: "Search first." },
          },
        },
        reads: [
          {
            state: "query",
            binding: { kind: "skill_input", skillKey: "web_search", fieldKey: "query", managed: true },
          },
          {
            state: "capability",
          },
        ],
        writes: [{ state: "search_results" }],
      },
    },
    state_schema: {
      search_results: {
        type: "json",
        binding: { kind: "skill_output", skillKey: "web_search", nodeId: "llm_1", fieldKey: "results", managed: true },
      },
      capability: {
        type: "capability",
        value: { kind: "skill", key: "web_search", name: "Web Search" },
      },
    },
    metadata: {
      requiredSkills: ["web_search"],
    },
  };

  const { migrated, report } = migrateNodeSystemActions(source);
  const agentConfig = migrated.nodes.llm_1.config;

  assert.equal(agentConfig.actionKey, "web_search");
  assert.equal(agentConfig.actionBindings[0].actionKey, "web_search");
  assert.equal(agentConfig.actionInstructionBlocks.web_search.actionKey, "web_search");
  assert.equal(migrated.nodes.llm_1.reads[0].binding.kind, "action_input");
  assert.equal(migrated.nodes.llm_1.reads[0].binding.actionKey, "web_search");
  assert.equal(migrated.state_schema.search_results.binding.kind, "action_output");
  assert.equal(migrated.state_schema.search_results.binding.actionKey, "web_search");
  assert.equal(migrated.state_schema.capability.value.kind, "action");
  assert.deepEqual(migrated.metadata.requiredActions, ["web_search"]);
  assert.equal(report.renamedKeys.skillKey, 5);
  assert.equal(report.renamedKeys.skillBindings, 1);
  assert.equal(report.renamedKeys.skillInstructionBlocks, 1);
  assert.equal(report.renamedKeys.requiredSkills, 1);
  assert.equal(report.rewrittenKinds.skill_input, 1);
  assert.equal(report.rewrittenKinds.skill_output, 1);
  assert.equal(report.rewrittenKinds.skill, 1);
});
