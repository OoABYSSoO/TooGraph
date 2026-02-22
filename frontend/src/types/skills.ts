export type SkillIoField = {
  key: string;
  label: string;
  valueType: string;
  required: boolean;
  description: string;
};

export type SkillCompatibilityReport = {
  target: string;
  status: string;
  summary: string;
  missingCapabilities: string[];
};

export type SkillDefinition = {
  skillKey: string;
  label: string;
  description: string;
  version: string;
  targets: string[];
  kind: string;
  mode: string;
  scope: string;
  permissions: string[];
  inputSchema: SkillIoField[];
  outputSchema: SkillIoField[];
  supportedValueTypes: string[];
  sideEffects: string[];
  sourceFormat: string;
  sourceScope: string;
  sourcePath: string;
  runtimeReady: boolean;
  runtimeRegistered: boolean;
  configured: boolean;
  healthy: boolean;
  status: string;
  canManage: boolean;
  canImport: boolean;
  compatibility: SkillCompatibilityReport[];
};
