export type ValueType = "text" | "json" | "image" | "audio" | "video" | "file" | "any";

export type PortDefinition = {
  key: string;
  label: string;
  valueType: ValueType;
  required?: boolean;
};

export type SkillAttachment = {
  name: string;
  skillKey: string;
  inputMapping: Record<string, string>;
  contextBinding: Record<string, string>;
  usage?: "required" | "optional";
};

export type AgentModelSource = "global" | "override";
export type AgentThinkingMode = "inherit" | "off" | "on";

export type InputBoundaryNode = {
  presetId: string;
  label: string;
  description: string;
  family: "input";
  valueType: ValueType;
  output: PortDefinition;
  defaultValue: string;
  placeholder: string;
};

export type AgentNode = {
  presetId: string;
  label: string;
  description: string;
  family: "agent";
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  systemInstruction: string;
  taskInstruction: string;
  skills: SkillAttachment[];
  outputBinding: Record<string, string>;
  modelSource?: AgentModelSource;
  model?: string;
  thinkingMode?: AgentThinkingMode;
  temperature?: number;
};

export type ConditionRule = {
  source: string;
  operator: "==" | "!=" | ">=" | "<=" | ">" | "<" | "exists";
  value: string | number | boolean;
};

export type BranchDefinition = {
  key: string;
  label: string;
};

export type ConditionNode = {
  presetId: string;
  label: string;
  description: string;
  family: "condition";
  inputs: PortDefinition[];
  branches: BranchDefinition[];
  conditionMode: "rule" | "model";
  rule: ConditionRule;
  branchMapping: Record<string, string>;
};

export type OutputBoundaryNode = {
  presetId: string;
  label: string;
  description: string;
  family: "output";
  input: PortDefinition;
  displayMode: "auto" | "plain" | "markdown" | "json";
  persistEnabled: boolean;
  persistFormat: "txt" | "md" | "json";
  fileNameTemplate: string;
};

export type NodePresetDefinition =
  | InputBoundaryNode
  | AgentNode
  | ConditionNode
  | OutputBoundaryNode;

export type NodeFamily = NodePresetDefinition["family"];

export function isValueTypeCompatible(source: ValueType, target: ValueType) {
  return source === "any" || target === "any" || source === target;
}
