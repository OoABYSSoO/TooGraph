import type { StateDefinition } from "../../types/node-system.ts";
import { defaultValueForStateType, type StateFieldDraft, type StateFieldType } from "../workspace/statePanelFields.ts";

export function buildStateEditorDraftFromSchema(
  stateKey: string,
  stateSchema: Record<string, StateDefinition>,
): StateFieldDraft | null {
  const definition = stateSchema[stateKey];
  if (!definition) {
    return null;
  }

  return {
    key: stateKey,
    definition: {
      name: definition.name,
      description: definition.description,
      type: definition.type,
      value: definition.value,
      color: definition.color,
    },
  };
}

export function updateStateEditorDraftName(draft: StateFieldDraft, name: string): StateFieldDraft {
  return updateStateEditorDraftDefinition(draft, { name });
}

export function updateStateEditorDraftDescription(draft: StateFieldDraft, description: string): StateFieldDraft {
  return updateStateEditorDraftDefinition(draft, { description });
}

export function updateStateEditorDraftColor(draft: StateFieldDraft, color: string): StateFieldDraft {
  return updateStateEditorDraftDefinition(draft, { color });
}

export function updateStateEditorDraftType(draft: StateFieldDraft, type: string): StateFieldDraft {
  const nextType = type as StateFieldType;
  return updateStateEditorDraftDefinition(draft, {
    type: nextType,
    value: defaultValueForStateType(nextType),
  });
}

export function resolveStateEditorAnchorStateKey(anchorId: string) {
  return anchorId.split(":").at(-1) ?? "";
}

export function resolveStateEditorUpdatePatch(draft: StateFieldDraft, currentStateKey: string): StateDefinition {
  return {
    name: draft.definition.name.trim() || currentStateKey,
    description: draft.definition.description,
    type: draft.definition.type,
    value: draft.definition.value,
    color: draft.definition.color,
  };
}

function updateStateEditorDraftDefinition(draft: StateFieldDraft, patch: Partial<StateDefinition>): StateFieldDraft {
  return {
    ...draft,
    definition: {
      ...draft.definition,
      ...patch,
    },
  };
}
