import type { VerificationCommand } from "./verification.ts";

export type ToolIoField = {
  key: string;
  name: string;
  valueType: string;
  description: string;
};

export type ToolInputPresentationOption = {
  label: string;
  value: string | number | boolean;
  updates?: Record<string, unknown>;
};

export type ToolInputPresentationVisibleWhen = {
  field: string;
  equals?: unknown;
};

export type ToolInputPresentationProperty = {
  key: string;
  name: string;
  valueType?: string;
  default?: unknown;
  min?: number | null;
  max?: number | null;
  step?: number | null;
  options?: ToolInputPresentationOption[];
  visibleWhen?: ToolInputPresentationVisibleWhen | null;
};

export type ToolInputPresentation = {
  mode?: "state" | "static";
  control?: "text" | "textarea" | "json" | "object" | "number" | "boolean" | "select" | null;
  default?: unknown;
  options?: ToolInputPresentationOption[];
  properties?: ToolInputPresentationProperty[];
};

export type ToolLocalizedText = {
  name: string;
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
  localized?: Record<string, ToolLocalizedText>;
  schemaVersion: string;
  version: string;
  permissions: string[];
  runtime: ToolRuntimeSpec;
  verificationCommands?: VerificationCommand[];
  dynamicStateInputs?: boolean;
  inputPresentation?: Record<string, ToolInputPresentation>;
  inputSchema: ToolIoField[];
  outputSchema: ToolIoField[];
  sourceScope: string;
  sourcePath: string;
  runtimeReady: boolean;
  runtimeRegistered: boolean;
  status: "active" | "disabled" | "deleted";
  canManage: boolean;
};

export type ToolFileNode = {
  name: string;
  path: string;
  type: "directory" | "file";
  size: number;
  language: string;
  previewable: boolean;
  executable: boolean;
  children: ToolFileNode[];
};

export type ToolFileTreeResponse = {
  toolKey: string;
  root: ToolFileNode;
};

export type ToolFileContentResponse = {
  toolKey: string;
  path: string;
  name: string;
  size: number;
  language: string;
  previewable: boolean;
  executable: boolean;
  encoding: "utf-8" | "binary" | "too_large";
  content: string | null;
};
