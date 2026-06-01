import type { NodeCreationEntry, PresetDocument } from "@/types/node-system";
import {
  CONDITION_LOOP_LIMIT_DEFAULT,
  FIXED_CONDITION_BRANCHES,
  FIXED_CONDITION_BRANCH_MAPPING,
} from "../../lib/condition-protocol.ts";

export const NODE_CREATION_FAMILY_PRIORITY: Record<NodeCreationEntry["family"], number> = {
  input: 0,
  output: 1,
  agent: 2,
  new_llm: 3,
  batch: 4,
  condition: 5,
  tool: 6,
  subgraph: 7,
};

export function buildBuiltinNodeCreationEntries(): NodeCreationEntry[] {
  return [
    {
      id: "node-input",
      family: "input",
      label: "Input",
      description: "Create a workflow input boundary.",
      mode: "node",
      origin: "builtin",
      nodeKind: "input",
      acceptsValueTypes: null,
    },
    {
      id: "node-output",
      family: "output",
      label: "Output",
      description: "Create a workflow output boundary.",
      mode: "node",
      origin: "builtin",
      nodeKind: "output",
      acceptsValueTypes: null,
    },
    {
      id: "preset-agent-empty",
      family: "agent",
      label: "Empty LLM Node",
      description: "Blank one-turn LLM node.",
      mode: "preset",
      origin: "builtin",
      presetId: "preset.agent.empty.v0",
      acceptsValueTypes: null,
    },
    {
      id: "node-new-llm",
      family: "new_llm",
      label: "New LLM Node",
      description: "Experimental one-turn LLM node for the next tool-calling protocol.",
      mode: "node",
      origin: "builtin",
      nodeKind: "new_llm",
      acceptsValueTypes: null,
    },
    {
      id: "preset-condition-empty",
      family: "condition",
      label: "Condition Node",
      description: "Branch based on state.",
      mode: "preset",
      origin: "builtin",
      presetId: "preset.condition.empty.v0",
      acceptsValueTypes: null,
    },
    {
      id: "node-batch",
      family: "batch",
      label: "Batch",
      description: "Run one LLM worker across arrays and assemble result arrays.",
      mode: "node",
      origin: "builtin",
      nodeKind: "batch",
      acceptsValueTypes: null,
    },
    {
      id: "node-tool",
      family: "tool",
      label: "Tool",
      description: "Run deterministic processing without an LLM turn.",
      mode: "node",
      origin: "builtin",
      nodeKind: "tool",
      acceptsValueTypes: null,
    },
    {
      id: "node-subgraph",
      family: "subgraph",
      label: "Subgraph",
      description: "Create an empty embedded subgraph instance.",
      mode: "node",
      origin: "builtin",
      nodeKind: "subgraph",
      acceptsValueTypes: null,
    },
  ];
}

const BUILTIN_EMPTY_AGENT_PRESET: PresetDocument = {
  presetId: "preset.agent.empty.v0",
  sourcePresetId: null,
  createdAt: null,
  updatedAt: null,
  status: "active",
  definition: {
    label: "Empty LLM Node",
    description: "Blank one-turn LLM node.",
    state_schema: {},
    node: {
      kind: "agent",
      name: "Empty LLM Node",
      description: "Blank one-turn LLM node.",
      ui: {
        position: { x: 0, y: 0 },
        collapsed: false,
      },
      reads: [],
      writes: [],
      config: {
        actionKey: "",
        taskInstruction: "",
        modelSource: "global",
        model: "",
        thinkingMode: "high",
        temperature: 0.2,
      },
    },
  },
};

const BUILTIN_EMPTY_CONDITION_PRESET: PresetDocument = {
  presetId: "preset.condition.empty.v0",
  sourcePresetId: null,
  createdAt: null,
  updatedAt: null,
  status: "active",
  definition: {
    label: "Condition Node",
    description: "Branch based on state.",
    state_schema: {},
    node: {
      kind: "condition",
      name: "Condition Node",
      description: "Branch based on state.",
      ui: {
        position: { x: 0, y: 0 },
        collapsed: false,
      },
      reads: [],
      writes: [],
      config: {
        branches: [...FIXED_CONDITION_BRANCHES],
        loopLimit: CONDITION_LOOP_LIMIT_DEFAULT,
        branchMapping: { ...FIXED_CONDITION_BRANCH_MAPPING },
        rule: {
          source: "",
          operator: "exists",
          value: null,
        },
      },
    },
  },
};

const BUILTIN_PRESETS_BY_ID: Record<string, PresetDocument> = {
  [BUILTIN_EMPTY_AGENT_PRESET.presetId]: BUILTIN_EMPTY_AGENT_PRESET,
  [BUILTIN_EMPTY_CONDITION_PRESET.presetId]: BUILTIN_EMPTY_CONDITION_PRESET,
};

export function resolveBuiltinNodeCreationPreset(presetId: string): PresetDocument | null {
  return BUILTIN_PRESETS_BY_ID[presetId] ?? null;
}
