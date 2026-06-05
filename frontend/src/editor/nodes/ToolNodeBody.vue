<template>
  <div class="tool-node-body">
    <div class="tool-node-body__controls">
      <label class="tool-node-body__tool-field">
        <span class="tool-node-body__field-label">Tool</span>
        <ToographSelect
          class="tool-node-body__tool-select"
          :model-value="selectedToolKey"
          :placeholder="toolPlaceholder"
          :disabled="toolSelectDisabled"
          filterable
          remount-on-select
          popper-class="tool-node-body__tool-popper"
          @update:model-value="emit('select-tool', String($event ?? ''))"
        >
          <ElOption label="No tool" value="" />
          <ElOption
            v-if="selectedToolMissing"
            :label="selectedToolKey"
            :value="selectedToolKey"
            disabled
          />
          <ElOption
            v-for="definition in availableToolDefinitions"
            :key="definition.toolKey"
            :label="definition.name"
            :value="definition.toolKey"
          />
        </ToographSelect>
      </label>
      <label v-if="showsTargetAgentSelect" class="tool-node-body__tool-field">
        <span class="tool-node-body__field-label">Target LLM</span>
        <ToographSelect
          class="tool-node-body__tool-select"
          :model-value="targetAgentNodeId"
          placeholder="Select LLM node"
          :disabled="targetAgentNodeOptions.length === 0"
          filterable
          remount-on-select
          popper-class="tool-node-body__tool-popper"
          @update:model-value="emit('update-target-agent-node', String($event ?? ''))"
        >
          <ElOption label="No target" value="" />
          <ElOption
            v-for="option in targetAgentNodeOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </ToographSelect>
      </label>
    </div>

    <div v-if="selectedToolCardInputFields.length > 0" class="tool-node-body__static-panel">
      <div class="tool-node-body__static-inputs-header">
        <span class="tool-node-body__field-label">Card values</span>
      </div>
      <div v-if="compactStaticInputFields.length > 0" class="tool-node-body__static-compact-grid">
        <div
          v-for="field in compactStaticInputFields"
          :key="field.key"
          class="tool-node-body__static-compact-field"
        >
          <div class="tool-node-body__static-field-heading">
            <span class="tool-node-body__static-input-name">{{ field.name || field.key }}</span>
            <button
              type="button"
              class="tool-node-body__promote-button"
              title="Promote to graph input"
              @pointerdown.stop
              @click.stop="promoteStaticInputField(field.key)"
            >
              Input
            </button>
          </div>
          <ToographSelect
            v-if="isSelectStaticField(field)"
            class="tool-node-body__static-select"
            :model-value="staticInputSelectValue(field)"
            popper-class="tool-node-body__tool-popper"
            remount-on-select
            @update:model-value="$event => updateSelectStaticInputValue(field, $event)"
          >
            <ElOption
              v-for="option in staticInputOptions(field)"
              :key="String(option.value)"
              :label="option.label"
              :value="option.value"
            />
          </ToographSelect>
          <ElSwitch
            v-else-if="isBooleanStaticField(field)"
            class="tool-node-body__static-value-switch"
            :model-value="Boolean(staticInputValue(field))"
            :width="76"
            inline-prompt
            active-text="True"
            inactive-text="False"
            @update:model-value="$event => updateStaticInputValue(field.key, Boolean($event))"
          />
          <ElInputNumber
            v-else-if="isNumberStaticField(field)"
            class="tool-node-body__static-number"
            :model-value="staticInputNumberValue(field.key)"
            controls-position="right"
            @update:model-value="$event => updateStaticInputValue(field.key, Number($event ?? 0))"
          />
          <ElInput
            v-else
            class="tool-node-body__static-text"
            :model-value="staticInputDraftText(field)"
            :type="isJsonStaticField(field) ? 'textarea' : 'text'"
            :autosize="{ minRows: 2, maxRows: 5 }"
            @update:model-value="$event => updateStaticInputDraft(field.key, String($event ?? ''))"
            @blur="commitStaticInputDraft(field)"
            @keydown.ctrl.enter.prevent="commitStaticInputDraft(field)"
            @keydown.meta.enter.prevent="commitStaticInputDraft(field)"
          />
          <div v-if="staticInputErrors[field.key]" class="tool-node-body__static-error">
            {{ staticInputErrors[field.key] }}
          </div>
        </div>
      </div>

      <section
        v-for="field in objectStaticInputFields"
        :key="field.key"
        class="tool-node-body__limits-card"
      >
        <div class="tool-node-body__limits-header">
          <div class="tool-node-body__limits-title">
            <span class="tool-node-body__static-input-name">{{ field.name || field.key }}</span>
            <span class="tool-node-body__static-input-key">{{ field.key }} · {{ field.valueType }}</span>
          </div>
          <button
            type="button"
            class="tool-node-body__promote-button"
            title="Promote to graph input"
            @pointerdown.stop
            @click.stop="promoteStaticInputField(field.key)"
          >
            Input
          </button>
        </div>
        <div class="tool-node-body__limits-grid">
          <label
            v-for="property in staticInputObjectProperties(field)"
            :key="property.key"
            class="tool-node-body__limit-field"
          >
            <span class="tool-node-body__limit-label">{{ property.name || property.key }}</span>
            <ElInputNumber
              v-if="isNumberObjectProperty(property)"
              class="tool-node-body__limit-number"
              :model-value="staticInputObjectPropertyNumberValue(field, property)"
              :min="property.min ?? undefined"
              :max="property.max ?? undefined"
              :step="property.step ?? 1"
              controls-position="right"
              @update:model-value="$event => updateObjectStaticInputProperty(field.key, property.key, Number($event ?? 0))"
            />
            <ToographSelect
              v-else-if="hasObjectPropertySelectOptions(property)"
              class="tool-node-body__static-select"
              :model-value="String(staticInputObjectPropertyValue(field, property) ?? '')"
              popper-class="tool-node-body__tool-popper"
              remount-on-select
              @update:model-value="$event => updateObjectStaticInputProperty(field.key, property.key, $event)"
            >
              <ElOption
                v-for="option in property.options ?? []"
                :key="String(option.value)"
                :label="option.label"
                :value="option.value"
              />
            </ToographSelect>
            <ElSwitch
              v-else-if="isBooleanObjectProperty(property)"
              class="tool-node-body__static-value-switch"
              :model-value="Boolean(staticInputObjectPropertyValue(field, property))"
              :width="58"
              inline-prompt
              active-text="On"
              inactive-text="Off"
              @update:model-value="$event => updateObjectStaticInputProperty(field.key, property.key, Boolean($event))"
            />
            <ElInput
              v-else
              class="tool-node-body__static-text"
              :model-value="String(staticInputObjectPropertyValue(field, property) ?? '')"
              @update:model-value="$event => updateObjectStaticInputProperty(field.key, property.key, String($event ?? ''))"
            />
          </label>
        </div>
      </section>
    </div>

    <div class="node-card__port-grid">
      <div class="node-card__port-column">
        <StatePortList
          side="input"
          :ports="orderedInputPorts"
          :node-id="nodeId"
          :popover-style="stateEditorPopoverStyle"
          :state-editor-draft="stateEditorDraft"
          :state-editor-error="stateEditorError"
          :type-options="typeOptions"
          :color-options="colorOptions"
          :is-state-editor-open="isStateEditorOpen"
          :is-state-editor-confirm-open="isStateEditorConfirmOpen"
          :is-remove-port-state-confirm-open="isRemovePortStateConfirmOpen"
          :is-state-editor-pill-revealed="isStateEditorPillRevealed"
          :is-port-reordering="isPortReordering"
          :is-port-reorder-placeholder="isPortReorderPlaceholder"
          :create-visible="false"
          :create-open="false"
          create-accent-color="#16a34a"
          create-label="+ input"
          create-anchor-state-key="__toograph_virtual_any_input__"
          :create-draft="createDraft"
          :create-title="createTitle"
          :create-error="createError"
          :create-hint="createHint"
          :create-selection-value="createSelectionValue"
          :create-existing-state-options="createExistingStateOptions"
          :create-type-options="typeOptions"
          :create-popover-style="agentAddPopoverStyle"
          @pointer-enter="emit('pointer-enter', $event)"
          @pointer-leave="emit('pointer-leave', $event)"
          @reorder-pointer-down="(side, stateKey, pointerEvent) => emit('reorder-pointer-down', side, stateKey, pointerEvent)"
          @port-click="(anchorId, stateKey) => emit('port-click', anchorId, stateKey)"
          @remove-click="(anchorId, side, stateKey) => emit('remove-click', anchorId, side, stateKey)"
          @open-create="emit('open-create', $event)"
          @update:name="emit('update:name', $event)"
          @update:type="emit('update:type', $event)"
          @update:color="emit('update:color', $event)"
          @update:description="emit('update:description', $event)"
          @update:create-selection="emit('update:create-selection', $event)"
          @update:create-name="emit('update:create-name', $event)"
          @update:create-type="emit('update:create-type', $event)"
          @update:create-color="emit('update:create-color', $event)"
          @update:create-description="emit('update:create-description', $event)"
          @update:create-value="emit('update:create-value', $event)"
          @cancel-create="emit('cancel-create')"
          @commit-create="emit('commit-create')"
        />
      </div>

      <div class="node-card__port-column node-card__port-column--right">
        <StatePortList
          side="output"
          :ports="orderedOutputPorts"
          :node-id="nodeId"
          :popover-style="stateEditorPopoverStyle"
          :state-editor-draft="stateEditorDraft"
          :state-editor-error="stateEditorError"
          :type-options="typeOptions"
          :color-options="colorOptions"
          :is-state-editor-open="isStateEditorOpen"
          :is-state-editor-confirm-open="isStateEditorConfirmOpen"
          :is-remove-port-state-confirm-open="isRemovePortStateConfirmOpen"
          :is-state-editor-pill-revealed="isStateEditorPillRevealed"
          :is-port-reordering="isPortReordering"
          :is-port-reorder-placeholder="isPortReorderPlaceholder"
          :create-visible="false"
          :create-open="false"
          create-accent-color="#9a3412"
          create-label="+ output"
          create-anchor-state-key="__toograph_virtual_any_output__"
          :create-draft="createDraft"
          :create-title="createTitle"
          :create-error="createError"
          :create-hint="createHint"
          :create-selection-value="createSelectionValue"
          :create-existing-state-options="createExistingStateOptions"
          :create-type-options="typeOptions"
          :create-popover-style="agentAddPopoverStyle"
          @pointer-enter="emit('pointer-enter', $event)"
          @pointer-leave="emit('pointer-leave', $event)"
          @reorder-pointer-down="(side, stateKey, pointerEvent) => emit('reorder-pointer-down', side, stateKey, pointerEvent)"
          @port-click="(anchorId, stateKey) => emit('port-click', anchorId, stateKey)"
          @remove-click="(anchorId, side, stateKey) => emit('remove-click', anchorId, side, stateKey)"
          @open-create="emit('open-create', $event)"
          @update:name="emit('update:name', $event)"
          @update:type="emit('update:type', $event)"
          @update:color="emit('update:color', $event)"
          @update:description="emit('update:description', $event)"
          @update:create-selection="emit('update:create-selection', $event)"
          @update:create-name="emit('update:create-name', $event)"
          @update:create-type="emit('update:create-type', $event)"
          @update:create-color="emit('update:create-color', $event)"
          @update:create-description="emit('update:create-description', $event)"
          @update:create-value="emit('update:create-value', $event)"
          @cancel-create="emit('cancel-create')"
          @commit-create="emit('commit-create')"
        />
      </div>
    </div>

    <div v-if="toolDefinitionsLoading" class="tool-node-body__message">Loading tools</div>
    <div v-else-if="toolDefinitionsError" class="tool-node-body__message tool-node-body__message--error">
      {{ toolDefinitionsError }}
    </div>
    <div v-else-if="body.toolDescription" class="tool-node-body__description">
      {{ body.toolDescription }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from "vue";
import { ElInput, ElInputNumber, ElOption, ElSwitch } from "element-plus";

import ToographSelect from "@/components/ToographSelect.vue";
import StatePortList from "./StatePortList.vue";
import type { StatePortExistingStateOption } from "./statePortCreateModel";
import type { NodeCardViewModel, NodePortViewModel } from "./nodeCardViewModel";
import type { ToolDefinition, ToolInputPresentation, ToolInputPresentationProperty, ToolIoField } from "@/types/tools";
import type { StateColorOption, StateFieldDraft, StateFieldType } from "@/editor/workspace/statePanelFields";

type ToolBodyViewModel = Extract<NodeCardViewModel["body"], { kind: "tool" }>;

const props = defineProps<{
  nodeId: string;
  body: ToolBodyViewModel;
  selectedToolKey: string;
  staticInputs: Record<string, unknown>;
  promotedInputFields: string[];
  targetAgentNodeId: string;
  targetAgentNodeOptions: Array<{ value: string; label: string }>;
  toolDefinitions: ToolDefinition[];
  toolDefinitionsLoading: boolean;
  toolDefinitionsError: string | null;
  orderedInputPorts: NodePortViewModel[];
  orderedOutputPorts: NodePortViewModel[];
  stateEditorPopoverStyle: CSSProperties;
  agentAddPopoverStyle: CSSProperties;
  stateEditorDraft: StateFieldDraft | null;
  stateEditorError: string | null;
  typeOptions: StateFieldType[];
  colorOptions: StateColorOption[];
  createDraft: StateFieldDraft | null;
  createTitle: string;
  createError: string | null;
  createHint: string;
  createSelectionValue: string;
  createExistingStateOptions: StatePortExistingStateOption[];
  isStateEditorOpen: (anchorId: string) => boolean;
  isStateEditorConfirmOpen: (anchorId: string) => boolean;
  isRemovePortStateConfirmOpen: (anchorId: string) => boolean;
  isStateEditorPillRevealed: (anchorId: string) => boolean;
  isPortReordering: (side: "input" | "output", stateKey: string) => boolean;
  isPortReorderPlaceholder: (side: "input" | "output", stateKey: string) => boolean;
}>();

const emit = defineEmits<{
  (event: "select-tool", toolKey: string): void;
  (event: "update-static-inputs", staticInputs: Record<string, unknown>): void;
  (event: "promote-static-input", fieldKey: string): void;
  (event: "update-target-agent-node", nodeId: string): void;
  (event: "pointer-enter", anchorId: string): void;
  (event: "pointer-leave", anchorId: string): void;
  (event: "reorder-pointer-down", side: "input" | "output", stateKey: string, pointerEvent: PointerEvent): void;
  (event: "port-click", anchorId: string, stateKey: string): void;
  (event: "remove-click", anchorId: string, side: "input" | "output", stateKey: string): void;
  (event: "open-create", side: "input" | "output"): void;
  (event: "update:name", value: string): void;
  (event: "update:type", value: string): void;
  (event: "update:color", value: string): void;
  (event: "update:description", value: string): void;
  (event: "update:create-selection", value: string): void;
  (event: "update:create-name", value: string | number): void;
  (event: "update:create-type", value: string | number | boolean | undefined): void;
  (event: "update:create-color", value: string | number | boolean | undefined): void;
  (event: "update:create-description", value: string | number): void;
  (event: "update:create-value", value: unknown): void;
  (event: "cancel-create"): void;
  (event: "commit-create"): void;
}>();

const availableToolDefinitions = computed(() =>
  props.toolDefinitions.filter((definition) => definition.status !== "disabled"),
);
const selectedToolDefinition = computed(() =>
  availableToolDefinitions.value.find((definition) => definition.toolKey === props.selectedToolKey),
);
const selectedToolInputFields = computed(() => selectedToolDefinition.value?.inputSchema ?? []);
const promotedInputFieldKeys = computed(() => new Set(props.promotedInputFields));
const selectedToolCardInputFields = computed(() =>
  selectedToolInputFields.value.filter((field) => isCardStaticInputField(field)),
);
const compactStaticInputFields = computed(() =>
  selectedToolCardInputFields.value.filter((field) => !hasObjectStaticInputProperties(field)),
);
const objectStaticInputFields = computed(() =>
  selectedToolCardInputFields.value.filter((field) => hasObjectStaticInputProperties(field)),
);
const selectedToolMissing = computed(
  () => Boolean(props.selectedToolKey) && !availableToolDefinitions.value.some((definition) => definition.toolKey === props.selectedToolKey),
);
const toolSelectDisabled = computed(() => props.toolDefinitionsLoading || Boolean(props.toolDefinitionsError));
const toolPlaceholder = computed(() => {
  if (props.toolDefinitionsLoading) {
    return "Loading tools";
  }
  if (props.toolDefinitionsError) {
    return "Tool catalog unavailable";
  }
  return props.selectedToolKey ? "Select tool" : "No tool";
});
const showsTargetAgentSelect = computed(() => props.selectedToolKey === "buddy_context_pressure_check");
const staticInputDrafts = ref<Record<string, string>>({});
const staticInputErrors = ref<Record<string, string>>({});

watch(
  () => props.selectedToolKey,
  () => {
    staticInputDrafts.value = {};
    staticInputErrors.value = {};
  },
);

watch(
  () => props.staticInputs,
  () => {
    const activeKeys = new Set(selectedToolCardInputFields.value.map((field) => field.key));
    staticInputDrafts.value = Object.fromEntries(Object.entries(staticInputDrafts.value).filter(([fieldKey]) => activeKeys.has(fieldKey)));
    staticInputErrors.value = Object.fromEntries(Object.entries(staticInputErrors.value).filter(([fieldKey]) => activeKeys.has(fieldKey)));
  },
  { deep: true },
);

function isCardStaticInputField(field: ToolIoField) {
  if (promotedInputFieldKeys.value.has(field.key)) {
    return false;
  }
  const presentation = resolveInputPresentation(field.key);
  if (presentation?.mode === "state") {
    return false;
  }
  return presentation?.mode === "static" || Object.prototype.hasOwnProperty.call(props.staticInputs, field.key);
}

function resolveInputPresentation(fieldKey: string): ToolInputPresentation | undefined {
  return selectedToolDefinition.value?.inputPresentation?.[fieldKey];
}

function updateStaticInputValue(fieldKey: string, value: unknown) {
  emit("update-static-inputs", { ...props.staticInputs, [fieldKey]: value });
  clearStaticInputDraft(fieldKey);
}

function updateSelectStaticInputValue(field: ToolIoField, value: string | number | boolean | undefined) {
  const option = staticInputOptions(field).find((candidate) => String(candidate.value) === String(value ?? ""));
  const nextStaticInputs = applyStaticInputOptionUpdates(
    { ...props.staticInputs, [field.key]: value },
    option?.updates,
  );
  emit("update-static-inputs", nextStaticInputs);
  clearStaticInputDrafts([field.key, ...Object.keys(option?.updates ?? {})]);
}

function applyStaticInputOptionUpdates(
  staticInputs: Record<string, unknown>,
  updates: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!updates || Array.isArray(updates) || typeof updates !== "object") {
    return staticInputs;
  }
  return {
    ...staticInputs,
    ...(cloneStaticInputValue(updates) as Record<string, unknown>),
  };
}

function updateStaticInputDraft(fieldKey: string, value: string) {
  staticInputDrafts.value = { ...staticInputDrafts.value, [fieldKey]: value };
  if (staticInputErrors.value[fieldKey]) {
    staticInputErrors.value = { ...staticInputErrors.value, [fieldKey]: "" };
  }
}

function commitStaticInputDraft(field: ToolIoField) {
  const parseResult = parseStaticInputValue(field, staticInputDraftText(field));
  if (parseResult.kind === "error") {
    staticInputErrors.value = { ...staticInputErrors.value, [field.key]: parseResult.message };
    return;
  }
  updateStaticInputValue(field.key, parseResult.value);
}

function staticInputDraftText(field: ToolIoField) {
  return staticInputDrafts.value[field.key] ?? formatStaticInputValue(staticInputValue(field), field);
}

function staticInputValue(field: ToolIoField) {
  if (Object.prototype.hasOwnProperty.call(props.staticInputs, field.key)) {
    return props.staticInputs[field.key];
  }
  return defaultStaticInputValue(field);
}

function staticInputSelectValue(field: ToolIoField) {
  return String(staticInputValue(field) ?? "");
}

function staticInputNumberValue(fieldKey: string) {
  const field = selectedToolInputFields.value.find((candidate) => candidate.key === fieldKey);
  const numericValue = Number(field ? staticInputValue(field) : props.staticInputs[fieldKey]);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function isSelectStaticField(field: ToolIoField) {
  return resolveInputPresentation(field.key)?.control === "select";
}

function staticInputOptions(field: ToolIoField) {
  return resolveInputPresentation(field.key)?.options ?? [];
}

function hasObjectStaticInputProperties(field: ToolIoField) {
  const presentation = resolveInputPresentation(field.key);
  return presentation?.control === "object" && (presentation.properties?.length ?? 0) > 0;
}

function staticInputObjectProperties(field: ToolIoField) {
  return (resolveInputPresentation(field.key)?.properties ?? []).filter((property) => isObjectPropertyVisible(property));
}

function isObjectPropertyVisible(property: ToolInputPresentationProperty) {
  const condition = property.visibleWhen;
  if (!condition?.field) {
    return true;
  }
  const sourceField = selectedToolInputFields.value.find((field) => field.key === condition.field);
  const sourceValue = sourceField ? staticInputValue(sourceField) : props.staticInputs[condition.field];
  return String(sourceValue ?? "") === String(condition.equals ?? "");
}

function staticInputObjectValue(field: ToolIoField): Record<string, unknown> {
  const value = staticInputValue(field);
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function staticInputObjectPropertyValue(field: ToolIoField, property: ToolInputPresentationProperty) {
  const objectValue = staticInputObjectValue(field);
  if (Object.prototype.hasOwnProperty.call(objectValue, property.key)) {
    return objectValue[property.key];
  }
  return defaultObjectPropertyValue(property);
}

function staticInputObjectPropertyNumberValue(field: ToolIoField, property: ToolInputPresentationProperty) {
  const numericValue = Number(staticInputObjectPropertyValue(field, property));
  return Number.isFinite(numericValue) ? numericValue : Number(defaultObjectPropertyValue(property) ?? 0);
}

function updateObjectStaticInputProperty(fieldKey: string, propertyKey: string, value: unknown) {
  const field = selectedToolInputFields.value.find((candidate) => candidate.key === fieldKey);
  const currentValue = field ? staticInputObjectValue(field) : {};
  updateStaticInputValue(fieldKey, { ...currentValue, [propertyKey]: value });
}

function promoteStaticInputField(fieldKey: string) {
  emit("promote-static-input", fieldKey);
}

function hasObjectPropertySelectOptions(property: ToolInputPresentationProperty) {
  return (property.options?.length ?? 0) > 0;
}

function isBooleanObjectProperty(property: ToolInputPresentationProperty) {
  return property.valueType?.trim().toLowerCase() === "boolean";
}

function isNumberObjectProperty(property: ToolInputPresentationProperty) {
  const valueType = property.valueType?.trim().toLowerCase() ?? "";
  return valueType === "number" || valueType === "integer";
}

function isBooleanStaticField(field: ToolIoField) {
  return resolveInputPresentation(field.key)?.control === "boolean" || normalizeStaticFieldValueType(field) === "boolean";
}

function isNumberStaticField(field: ToolIoField) {
  const valueType = normalizeStaticFieldValueType(field);
  return resolveInputPresentation(field.key)?.control === "number" || valueType === "number" || valueType === "integer";
}

function isJsonStaticField(field: ToolIoField) {
  const valueType = normalizeStaticFieldValueType(field);
  const control = resolveInputPresentation(field.key)?.control;
  return control === "json" || control === "object" || valueType === "json" || valueType === "object" || valueType === "array";
}

function normalizeStaticFieldValueType(field: ToolIoField) {
  return field.valueType.trim().toLowerCase();
}

function defaultStaticInputValue(field: ToolIoField): unknown {
  const presentation = resolveInputPresentation(field.key);
  if (presentation && Object.prototype.hasOwnProperty.call(presentation, "default")) {
    return cloneStaticInputValue(presentation.default);
  }
  if (isBooleanStaticField(field)) {
    return false;
  }
  if (isNumberStaticField(field)) {
    return 0;
  }
  if (presentation?.control === "object" && (presentation.properties?.length ?? 0) > 0) {
    return Object.fromEntries(presentation.properties?.map((property) => [property.key, defaultObjectPropertyValue(property)]) ?? []);
  }
  if (isJsonStaticField(field)) {
    return {};
  }
  return "";
}

function defaultObjectPropertyValue(property: ToolInputPresentationProperty) {
  if (Object.prototype.hasOwnProperty.call(property, "default")) {
    return cloneStaticInputValue(property.default);
  }
  if (isBooleanObjectProperty(property)) {
    return false;
  }
  if (isNumberObjectProperty(property)) {
    return 0;
  }
  return "";
}

function cloneStaticInputValue(value: unknown): unknown {
  return value === undefined ? undefined : structuredClone(value);
}

function formatStaticInputValue(value: unknown, field: ToolIoField) {
  if (isJsonStaticField(field)) {
    return JSON.stringify(value ?? null, null, 2);
  }
  if (typeof value === "string") {
    return value;
  }
  return value == null ? "" : String(value);
}

function parseStaticInputValue(field: ToolIoField, value: string): { kind: "ok"; value: unknown } | { kind: "error"; message: string } {
  if (isJsonStaticField(field)) {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return { kind: "ok", value: null };
    }
    try {
      return { kind: "ok", value: JSON.parse(trimmedValue) };
    } catch {
      return { kind: "error", message: "Invalid JSON" };
    }
  }
  if (isNumberStaticField(field)) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return { kind: "error", message: "Invalid number" };
    }
    return { kind: "ok", value: numericValue };
  }
  return { kind: "ok", value };
}

function clearStaticInputDraft(fieldKey: string) {
  clearStaticInputDrafts([fieldKey]);
}

function clearStaticInputDrafts(fieldKeys: string[]) {
  const keySet = new Set(fieldKeys);
  if (keySet.size === 0) {
    return;
  }
  const nextDrafts = Object.fromEntries(Object.entries(staticInputDrafts.value).filter(([fieldKey]) => !keySet.has(fieldKey)));
  const nextErrors = Object.fromEntries(Object.entries(staticInputErrors.value).filter(([fieldKey]) => !keySet.has(fieldKey)));
  staticInputDrafts.value = nextDrafts;
  staticInputErrors.value = nextErrors;
}

</script>

<style scoped>
.tool-node-body {
  display: grid;
  gap: 12px;
}

.tool-node-body__controls {
  display: grid;
  gap: 8px;
}

.tool-node-body__tool-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.tool-node-body__field-label {
  color: #3b82f6;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tool-node-body__tool-select {
  width: 100%;
  --el-color-primary: #2563eb;
  --el-border-radius-base: 16px;
}

.tool-node-body__static-panel {
  display: grid;
  gap: 8px;
  min-width: 0;
  border: 1px solid rgba(59, 130, 246, 0.11);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.48);
  padding: 9px 10px 10px;
}

.tool-node-body__static-inputs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.tool-node-body__static-compact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.tool-node-body__static-input-name {
  overflow: hidden;
  color: #1f2937;
  font-size: 11.5px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-node-body__static-input-key {
  overflow: hidden;
  color: rgba(71, 85, 105, 0.72);
  font-family: var(--toograph-font-mono);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-node-body__static-compact-field {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.tool-node-body__static-field-heading,
.tool-node-body__limits-title {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}

.tool-node-body__static-field-heading {
  justify-content: space-between;
}

.tool-node-body__limits-title {
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
}

.tool-node-body__promote-button {
  flex: 0 0 auto;
  min-height: 22px;
  border: 1px solid rgba(37, 99, 235, 0.16);
  border-radius: 999px;
  padding: 2px 7px;
  background: rgba(239, 246, 255, 0.78);
  color: #1d4ed8;
  cursor: pointer;
  font: inherit;
  font-size: 10.5px;
  font-weight: 800;
  line-height: 1.1;
}

.tool-node-body__promote-button:hover {
  border-color: rgba(37, 99, 235, 0.28);
  background: rgba(219, 234, 254, 0.88);
}

.tool-node-body__static-value-switch {
  --el-switch-on-color: #2563eb;
  --el-switch-off-color: rgba(100, 116, 139, 0.3);
}

.tool-node-body__static-number {
  width: 100%;
}

.tool-node-body__static-select {
  width: 100%;
  --el-color-primary: #2563eb;
  --el-border-radius-base: 12px;
}

.tool-node-body__static-text :deep(.el-input__wrapper),
.tool-node-body__static-text :deep(.el-textarea__inner),
.tool-node-body__static-select :deep(.toograph-select__trigger),
.tool-node-body__static-number :deep(.el-input__wrapper),
.tool-node-body__limit-number :deep(.el-input__wrapper) {
  background: rgba(255, 252, 246, 0.96);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.08);
}

.tool-node-body__static-error {
  color: #b91c1c;
  font-size: 11px;
  font-weight: 700;
}

.tool-node-body__limits-card {
  display: grid;
  min-width: 0;
  gap: 7px;
  border: 1px solid rgba(201, 107, 31, 0.14);
  border-radius: 14px;
  background: rgba(255, 250, 241, 0.66);
  padding: 8px;
}

.tool-node-body__limits-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.tool-node-body__limits-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.tool-node-body__limit-field {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.tool-node-body__limit-label {
  overflow: hidden;
  color: rgba(60, 41, 20, 0.72);
  font-size: 10.5px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-node-body__limit-number {
  width: 100%;
}

.node-card__port-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  width: 100%;
  column-gap: 24px;
}

.node-card__port-column {
  display: grid;
  min-width: 0;
  width: 100%;
  gap: 6px;
}

.node-card__port-column--right {
  justify-items: end;
}

.tool-node-body__description,
.tool-node-body__message {
  border-radius: 14px;
  background: rgba(255, 250, 241, 0.74);
  color: #6b5a48;
  font-size: 12px;
  line-height: 1.45;
  padding: 9px 11px;
}

.tool-node-body__message--error {
  color: #b91c1c;
}
</style>
