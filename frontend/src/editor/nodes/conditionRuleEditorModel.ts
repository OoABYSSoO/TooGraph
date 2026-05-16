import type { ConditionNode, StateDefinition } from "@/types/node-system";

export type ConditionRuleSourceOption = {
  value: string;
  label: string;
};

export type ConditionRuleEditorModel = {
  sourceOptions: ConditionRuleSourceOption[];
  resolvedSource: string;
  sourceType: string;
  isValueDisabled: boolean;
  valueEditorMode: "text" | "number" | "boolean" | "disabled";
  inputType: "text" | "number";
  booleanValue: boolean;
};

export const CONDITION_RULE_OPERATOR_OPTIONS: Array<{
  value: ConditionNode["config"]["rule"]["operator"];
  label: string;
}> = [
  { value: "==", label: "==" },
  { value: "!=", label: "!=" },
  { value: ">=", label: ">=" },
  { value: "<=", label: "<=" },
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
  { value: "exists", label: "exists" },
];

export function buildConditionRuleEditorModel(
  rule: ConditionNode["config"]["rule"],
  stateSchema: Record<string, StateDefinition>,
): ConditionRuleEditorModel {
  const sourceOptions = Object.entries(stateSchema).map(([stateKey, definition]) => ({
    value: stateKey,
    label: definition.name?.trim() || stateKey,
  }));
  const resolvedSource = sourceOptions.some((option) => option.value === rule.source) ? rule.source : (sourceOptions[0]?.value ?? "");
  const sourceType = resolveConditionRuleSourceType(rule.source, stateSchema);
  const isValueDisabled = isConditionRuleValueInputDisabled(rule.operator);
  const valueEditorMode = isValueDisabled ? "disabled" : resolveConditionRuleValueEditorMode(sourceType);

  return {
    sourceOptions,
    resolvedSource,
    sourceType,
    isValueDisabled,
    valueEditorMode,
    inputType: valueEditorMode === "number" ? "number" : "text",
    booleanValue: resolveConditionRuleBooleanValue(rule.value),
  };
}

export function isConditionRuleValueInputDisabled(operator: string | null | undefined) {
  return operator === "exists";
}

export function resolveConditionRuleValueDraft(value: ConditionNode["config"]["rule"]["value"] | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

export function resolveConditionRuleOperatorPatch(
  value: string | number | boolean | undefined,
): Pick<ConditionNode["config"]["rule"], "operator"> {
  return { operator: String(value ?? "exists") };
}

export function resolveConditionRuleValuePatch(
  nextDraftValue: string,
  currentValue: ConditionNode["config"]["rule"]["value"] | undefined,
  sourceType = "",
): Pick<ConditionNode["config"]["rule"], "value"> | null {
  if (sourceType === "number") {
    const nextNumber = Number(nextDraftValue);
    if (!Number.isFinite(nextNumber)) {
      return null;
    }
    return currentValue === nextNumber ? null : { value: nextNumber };
  }

  if (nextDraftValue === resolveConditionRuleValueDraft(currentValue)) {
    return null;
  }
  return { value: nextDraftValue };
}

export function resolveConditionRuleBooleanValuePatch(
  nextValue: boolean,
  currentValue: ConditionNode["config"]["rule"]["value"] | undefined,
): Pick<ConditionNode["config"]["rule"], "value"> | null {
  return currentValue === nextValue ? null : { value: nextValue };
}

export function resolveConditionRuleSourceType(
  source: string,
  stateSchema: Record<string, StateDefinition>,
) {
  const sourceStateKey = resolveConditionRuleSourceStateKey(source, stateSchema);
  return sourceStateKey ? stateSchema[sourceStateKey]?.type?.trim() ?? "" : "";
}

function resolveConditionRuleValueEditorMode(sourceType: string): ConditionRuleEditorModel["valueEditorMode"] {
  if (sourceType === "boolean") {
    return "boolean";
  }
  if (sourceType === "number") {
    return "number";
  }
  return "text";
}

function resolveConditionRuleBooleanValue(value: ConditionNode["config"]["rule"]["value"] | undefined) {
  if (typeof value === "boolean") {
    return value;
  }
  return String(value).trim().toLowerCase() === "true";
}

function resolveConditionRuleSourceStateKey(
  source: string,
  stateSchema: Record<string, StateDefinition>,
) {
  if (stateSchema[source]) {
    return source;
  }

  if (!source.startsWith("$state.")) {
    return "";
  }

  const statePath = source.slice("$state.".length);
  return statePath && !statePath.includes(".") && stateSchema[statePath] ? statePath : "";
}
