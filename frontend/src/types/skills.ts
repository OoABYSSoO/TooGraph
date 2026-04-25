export type SkillIoField = {
  key: string;
  name: string;
  valueType: string;
  required: boolean;
  description: string;
};

export type SkillRuntimeSpec = {
  type: string;
  entrypoint: string;
  command?: string[];
  timeoutSeconds?: number;
};

export type SkillCapabilityPolicy = {
  selectable: boolean;
  requiresApproval: boolean;
};

export type SkillCapabilityPolicies = {
  default: SkillCapabilityPolicy;
  origins: Record<string, SkillCapabilityPolicy>;
};

export type SkillDefinition = {
  skillKey: string;
  name: string;
  description: string;
  llmInstruction: string;
  schemaVersion: string;
  version: string;
  capabilityPolicy: SkillCapabilityPolicies;
  permissions: string[];
  runtime: SkillRuntimeSpec;
  stateInputSchema?: SkillIoField[];
  inputSchema: SkillIoField[];
  outputSchema: SkillIoField[];
  llmNodeEligibility: string;
  llmNodeBlockers: string[];
  sourceScope: string;
  sourcePath: string;
  runtimeReady: boolean;
  runtimeRegistered: boolean;
  status: string;
  canManage: boolean;
};

export type SkillFileNode = {
  name: string;
  path: string;
  type: "directory" | "file";
  size: number;
  language: string;
  previewable: boolean;
  executable: boolean;
  children: SkillFileNode[];
};

export type SkillFileTreeResponse = {
  skillKey: string;
  root: SkillFileNode;
};

export type SkillFileContentResponse = {
  skillKey: string;
  path: string;
  name: string;
  size: number;
  language: string;
  previewable: boolean;
  executable: boolean;
  encoding: "utf-8" | "binary" | "too_large";
  content: string | null;
};
