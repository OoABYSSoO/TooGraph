export type ToolIoField = {
  key: string;
  name: string;
  valueType: string;
  description: string;
};

export type ToolRuntimeSpec = {
  type: string;
  entrypoint: string;
  command?: string[];
  timeoutSeconds?: number;
};

export type ToolDefinition = {
  toolKey: string;
  name: string;
  description: string;
  schemaVersion: string;
  version: string;
  permissions: string[];
  runtime: ToolRuntimeSpec;
  inputSchema: ToolIoField[];
  outputSchema: ToolIoField[];
  sourceScope: string;
  sourcePath: string;
  runtimeReady: boolean;
  runtimeRegistered: boolean;
  status: string;
  canManage: boolean;
};
