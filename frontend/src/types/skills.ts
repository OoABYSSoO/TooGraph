export type SkillIoField = {
  key: string;
  label: string;
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

export type SkillHealthSpec = {
  type: string;
};

export type SkillRunPolicy = {
  discoverable: boolean;
  autoSelectable: boolean;
  requiresApproval: boolean;
};

export type SkillRunPolicies = {
  default: SkillRunPolicy;
  origins: Record<string, SkillRunPolicy>;
};

export type SkillDefinition = {
  skillKey: string;
  label: string;
  description: string;
  schemaVersion: string;
  version: string;
  runPolicies: SkillRunPolicies;
  kind: string;
  mode: string;
  scope: string;
  permissions: string[];
  runtime: SkillRuntimeSpec;
  health: SkillHealthSpec;
  inputSchema: SkillIoField[];
  outputSchema: SkillIoField[];
  supportedValueTypes: string[];
  sideEffects: string[];
  agentNodeEligibility: string;
  agentNodeBlockers: string[];
  sourceFormat: string;
  sourceScope: string;
  sourcePath: string;
  runtimeReady: boolean;
  runtimeRegistered: boolean;
  configured: boolean;
  healthy: boolean;
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
