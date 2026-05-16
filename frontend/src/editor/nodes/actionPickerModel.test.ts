import test from "node:test";
import assert from "node:assert/strict";

import {
  listSelectableActionDefinitions,
  resolveDisplayAgentActionInstructionBlocks,
  resolveSelectAgentActionPatch,
  resolveActionInstructionOverridePatch,
} from "./actionPickerModel.ts";
import type { ActionDefinition } from "../../types/actions.ts";

const actionDefinitions: ActionDefinition[] = [
  {
    actionKey: "web_search",
    name: "Web Search",
    description: "Searches the public web.",
    llmInstruction: "Decide the search query and execute this bound web search action. Do not summarize the result.",
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
    actionKey: "append_usage_introduction",
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

const unavailableActionDefinitions: ActionDefinition[] = [
  actionDefinitions[0],
  {
    ...actionDefinitions[1],
    actionKey: "desktop_buddy_profile",
    name: "Desktop Buddy Profile",
  },
  {
    ...actionDefinitions[1],
    actionKey: "runtime_pending",
    name: "Runtime Pending",
    runtimeRegistered: false,
  },
  {
    ...actionDefinitions[1],
    actionKey: "disabled_action",
    name: "Disabled Action",
    status: "disabled",
  },
  {
    ...actionDefinitions[1],
    actionKey: "needs_manifest",
    name: "Needs Manifest",
    llmNodeEligibility: "needs_manifest",
    llmNodeBlockers: ["Action manifest is missing a script runtime entrypoint."],
  },
];

test("listSelectableActionDefinitions exposes active runtime-ready LLM node actions", () => {
  assert.deepEqual(
    listSelectableActionDefinitions(unavailableActionDefinitions).map((definition) => definition.actionKey),
    ["web_search", "desktop_buddy_profile"],
  );
});

test("resolveSelectAgentActionPatch replaces the selected action without persisting default instructions", () => {
  assert.deepEqual(resolveSelectAgentActionPatch("web_search", "append_usage_introduction", actionDefinitions, {}), {
    actionKey: "append_usage_introduction",
    actionInstructionBlocks: {},
  });
  assert.equal(resolveSelectAgentActionPatch("web_search", "web_search", actionDefinitions, {}), null);
});

test("resolveSelectAgentActionPatch clears the selected action and stale instruction blocks", () => {
  assert.deepEqual(
    resolveSelectAgentActionPatch("web_search", "", actionDefinitions, {
      web_search: {
        actionKey: "web_search",
        title: "Web Search action instruction",
        content: "Decide the search query and execute this bound web search action. Do not summarize the result.",
        source: "action.llmInstruction",
      },
    }),
    {
      actionKey: "",
      actionInstructionBlocks: {},
    },
  );
});

test("resolveDisplayAgentActionInstructionBlocks derives the default capsule from the selected action", () => {
  assert.deepEqual(resolveDisplayAgentActionInstructionBlocks("web_search", actionDefinitions, {}), {
    web_search: {
      actionKey: "web_search",
      title: "Web Search action instruction",
      content: "Decide the search query and execute this bound web search action. Do not summarize the result.",
      source: "action.llmInstruction",
    },
  });
});

test("resolveDisplayAgentActionInstructionBlocks preserves blank node overrides", () => {
  assert.deepEqual(
    resolveDisplayAgentActionInstructionBlocks("web_search", actionDefinitions, {
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
        title: "Web Search action instruction",
        content: "",
        source: "node.override",
      },
    },
  );
});

test("resolveActionInstructionOverridePatch persists only user-edited action instructions", () => {
  assert.deepEqual(resolveActionInstructionOverridePatch("web_search", "Use the edited rule.", actionDefinitions, {}), {
    actionInstructionBlocks: {
      web_search: {
        actionKey: "web_search",
        title: "Web Search action instruction",
        content: "Use the edited rule.",
        source: "node.override",
      },
    },
  });
});
