export type ActionIoField = {
  key: string;
  name: string;
  valueType: string;
  description: string;
};

export type ActionRuntimeSpec = {
  type: string;
  entrypoint: string;
  command?: string[];
  timeoutSeconds?: number;
};

export type ActionCapabilityPolicy = {
  selectable: boolean;
  requiresApproval: boolean;
};

export type ActionCapabilityPolicies = {
  default: ActionCapabilityPolicy;
  origins: Record<string, ActionCapabilityPolicy>;
};

export type ActionDefinition = {
  actionKey: string;
  name: string;
  description: string;
  llmInstruction: string;
  schemaVersion: string;
  version: string;
  capabilityPolicy: ActionCapabilityPolicies;
  permissions: string[];
  runtime: ActionRuntimeSpec;
  stateInputSchema?: ActionIoField[];
  llmOutputSchema: ActionIoField[];
  stateOutputSchema: ActionIoField[];
  llmNodeEligibility: string;
  llmNodeBlockers: string[];
  sourceScope: string;
  sourcePath: string;
  runtimeReady: boolean;
  runtimeRegistered: boolean;
  status: string;
  canManage: boolean;
};

export type ActionFileNode = {
  name: string;
  path: string;
  type: "directory" | "file";
  size: number;
  language: string;
  previewable: boolean;
  executable: boolean;
  children: ActionFileNode[];
};

export type ActionFileTreeResponse = {
  actionKey: string;
  root: ActionFileNode;
};

export type ActionFileContentResponse = {
  actionKey: string;
  path: string;
  name: string;
  size: number;
  language: string;
  previewable: boolean;
  executable: boolean;
  encoding: "utf-8" | "binary" | "too_large";
  content: string | null;
};
