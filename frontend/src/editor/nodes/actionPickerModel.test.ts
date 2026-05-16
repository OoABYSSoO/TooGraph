import test from "node:test";
import assert from "node:assert/strict";

import {
  listSelectableSkillDefinitions,
  resolveDisplayAgentSkillInstructionBlocks,
  resolveSelectAgentSkillPatch,
  resolveSkillInstructionOverridePatch,
} from "./actionPickerModel.ts";
import type { SkillDefinition } from "../../types/actions.ts";

const skillDefinitions: SkillDefinition[] = [
  {
    skillKey: "web_search",
    name: "Web Search",
    description: "Searches the public web.",
    llmInstruction: "Decide the search query and execute this bound web search skill. Do not summarize the result.",
    schemaVersion: "toograph.action/v1",
    llmOutputSchema: [],
    stateOutputSchema: [],
    runtime: { type: "python", entrypoint: "run.py" },
    llmNodeEligibility: "ready",
    llmNodeBlockers: [],
    version: "1.0.0",
    capabilityPolicy: {
      default: { selectable: true, requiresApproval: false },
      origins: {},
    },
    permissions: ["network"],
    sourceScope: "installed",
    sourcePath: "/actions/web_search/action.json",
    runtimeReady: true,
    runtimeRegistered: true,
    status: "active",
    canManage: true,
  },
  {
    skillKey: "append_usage_introduction",
    name: "Append Usage Introduction",
    description: "Appends usage instructions to the answer.",
    llmInstruction: "Use append_usage_introduction only when it is explicitly bound to the LLM node.",
    schemaVersion: "toograph.action/v1",
    llmOutputSchema: [],
    stateOutputSchema: [],
    runtime: { type: "python", entrypoint: "run.py" },
    llmNodeEligibility: "ready",
    llmNodeBlockers: [],
    version: "1.0.0",
    capabilityPolicy: {
      default: { selectable: true, requiresApproval: false },
      origins: {},
    },
    permissions: [],
    sourceScope: "installed",
    sourcePath: "/actions/append_usage_introduction/action.json",
    runtimeReady: true,
    runtimeRegistered: true,
    status: "active",
    canManage: true,
  },
];

const unavailableSkillDefinitions: SkillDefinition[] = [
  skillDefinitions[0],
  {
    ...skillDefinitions[1],
    skillKey: "desktop_buddy_profile",
    name: "Desktop Buddy Profile",
  },
  {
    ...skillDefinitions[1],
    skillKey: "runtime_pending",
    name: "Runtime Pending",
    runtimeRegistered: false,
  },
  {
    ...skillDefinitions[1],
    skillKey: "disabled_skill",
    name: "Disabled Skill",
    status: "disabled",
  },
  {
    ...skillDefinitions[1],
    skillKey: "needs_manifest",
    name: "Needs Manifest",
    llmNodeEligibility: "needs_manifest",
    llmNodeBlockers: ["Skill manifest is missing a script runtime entrypoint."],
  },
];

test("listSelectableSkillDefinitions exposes active runtime-ready LLM node actions", () => {
  assert.deepEqual(
    listSelectableSkillDefinitions(unavailableSkillDefinitions).map((definition) => definition.skillKey),
    ["web_search", "desktop_buddy_profile"],
  );
});

test("resolveSelectAgentSkillPatch replaces the selected skill without persisting default instructions", () => {
  assert.deepEqual(resolveSelectAgentSkillPatch("web_search", "append_usage_introduction", skillDefinitions, {}), {
    actionKey: "append_usage_introduction",
    actionInstructionBlocks: {},
  });
  assert.equal(resolveSelectAgentSkillPatch("web_search", "web_search", skillDefinitions, {}), null);
});

test("resolveSelectAgentSkillPatch clears the selected skill and stale instruction blocks", () => {
  assert.deepEqual(
    resolveSelectAgentSkillPatch("web_search", "", skillDefinitions, {
      web_search: {
        actionKey: "web_search",
        title: "Web Search skill instruction",
        content: "Decide the search query and execute this bound web search skill. Do not summarize the result.",
        source: "action.llmInstruction",
      },
    }),
    {
      actionKey: "",
      actionInstructionBlocks: {},
    },
  );
});

test("resolveDisplayAgentSkillInstructionBlocks derives the default capsule from the selected skill", () => {
  assert.deepEqual(resolveDisplayAgentSkillInstructionBlocks("web_search", skillDefinitions, {}), {
    web_search: {
      actionKey: "web_search",
      title: "Web Search skill instruction",
      content: "Decide the search query and execute this bound web search skill. Do not summarize the result.",
      source: "action.llmInstruction",
    },
  });
});

test("resolveDisplayAgentSkillInstructionBlocks preserves blank node overrides", () => {
  assert.deepEqual(
    resolveDisplayAgentSkillInstructionBlocks("web_search", skillDefinitions, {
      web_search: {
        actionKey: "web_search",
        title: "",
        content: "",
        source: "node.override",
      },
    }),
    {
      web_search: {
        actionKey: "web_search",
        title: "Web Search skill instruction",
        content: "",
        source: "node.override",
      },
    },
  );
});

test("resolveSkillInstructionOverridePatch persists only user-edited skill instructions", () => {
  assert.deepEqual(resolveSkillInstructionOverridePatch("web_search", "Use the edited rule.", skillDefinitions, {}), {
    actionInstructionBlocks: {
      web_search: {
        actionKey: "web_search",
        title: "Web Search skill instruction",
        content: "Use the edited rule.",
        source: "node.override",
      },
    },
  });
});
