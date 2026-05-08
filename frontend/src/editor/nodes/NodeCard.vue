<template>
  <article
    v-bind="$attrs"
    class="node-card"
    :class="{
      'node-card--selected': selected,
      'node-card--hovered': hovered,
      'node-card--input': view.body.kind === 'input',
      'node-card--agent': view.body.kind === 'agent',
      'node-card--condition': view.body.kind === 'condition',
      'node-card--output': view.body.kind === 'output',
      'node-card--subgraph': view.body.kind === 'subgraph',
      'node-card--floating-panel-open': hasFloatingPanelOpen,
    }"
    @pointerdown.capture="handleLockedNodeCardInteractionCapture"
    @click.capture="handleLockedNodeCardInteractionCapture"
    @keydown.capture="handleLockedNodeCardInteractionCapture"
  >
    <NodeCardTopActions
      :body-kind="view.body.kind"
      :active-top-action="activeTopAction"
      :is-top-action-visible="isTopActionVisible"
      :human-review-pending="humanReviewPending"
      :has-advanced-settings="hasAdvancedSettings"
      :can-save-preset="canSavePreset"
      :advanced-popover-width="view.body.kind === 'output' ? 340 : 280"
      :action-popover-style="actionPopoverStyle"
      :confirm-popover-style="confirmPopoverStyle"
      :agent-temperature-input="agentTemperatureInput"
      :agent-breakpoint-timing-value="agentBreakpointTimingValue"
      :output-display-mode-options="outputDisplayModeOptions"
      :output-persist-format-options="outputPersistFormatOptions"
      :output-file-name-template="view.body.kind === 'output' ? view.body.fileNameTemplate : ''"
      :output-file-name-placeholder="view.title || t('nodeCard.outputFallback')"
      :is-output-display-mode-active="isOutputDisplayModeActive"
      :is-output-persist-format-active="isOutputPersistFormatActive"
      @toggle-advanced="toggleAdvancedPanel"
      @preset-action="handlePresetActionClick"
      @delete-action="handleDeleteActionClick"
      @edit-subgraph-action="handleEditSubgraphActionClick"
      @human-review="handleHumanReviewActionClick"
      @update:agent-temperature="handleAgentTemperatureInputValue"
      @update:agent-breakpoint-timing="handleAgentBreakpointTimingSelect"
      @update:output-display-mode="updateOutputDisplayMode"
      @update:output-persist-format="updateOutputPersistFormat"
      @update:output-file-name="handleOutputFileNameInputValue"
    />
    <header class="node-card__header">
      <div class="node-card__eyebrow">{{ view.kindLabel }}</div>
      <ElPopover
        :visible="isTextEditorOpen('title') || isTextEditorConfirmOpen('title')"
        :placement="isTextEditorOpen('title') ? 'bottom-start' : 'top-start'"
        :width="isTextEditorOpen('title') ? textEditorWidth('title') : undefined"
        :show-arrow="false"
        :popper-style="isTextEditorOpen('title') ? stateEditorPopoverStyle : confirmPopoverStyle"
        popper-class="node-card__text-editor-popper"
      >
        <template #reference>
          <span
            class="node-card__text-trigger node-card__text-trigger--title"
            :class="{ 'node-card__text-trigger--confirm': isTextEditorConfirmOpen('title') }"
            role="button"
            tabindex="0"
            data-text-editor-trigger="true"
            @pointerdown="handleTextTriggerPointerDown('title', $event)"
            @pointermove="handleTextTriggerPointerMove('title', $event)"
            @pointerup="handleTextTriggerPointerUp('title', $event)"
            @pointercancel="clearTextTriggerPointerState"
            @click.stop.prevent="noop"
            @keydown.enter.prevent="handleTextEditorAction('title')"
            @keydown.space.prevent="handleTextEditorAction('title')"
          >
            <span class="node-card__text-trigger-content" :class="{ 'node-card__text-trigger-content--confirm': isTextEditorConfirmOpen('title') }">
              <h3 class="node-card__title">{{ view.title }}</h3>
              <ElIcon class="node-card__text-trigger-confirm-icon"><Check /></ElIcon>
            </span>
          </span>
        </template>
        <div v-if="isTextEditorConfirmOpen('title')" class="node-card__confirm-hint node-card__confirm-hint--text">{{ t("nodeCard.editNameQuestion") }}</div>
        <div v-else-if="isTextEditorOpen('title')" class="node-card__text-editor" data-node-popup-surface="true">
          <div class="node-card__text-editor-title">{{ textEditorTitle('title') }}</div>
          <ElInput
            ref="titleEditorInputRef"
            :model-value="textEditorDraftValue('title')"
            @update:model-value="handleTextEditorDraftInput('title', $event)"
            @keydown.enter.prevent="commitTextEditor('title')"
            @keydown.esc.prevent="closeTextEditor()"
          />
        </div>
      </ElPopover>
    </header>

    <ElPopover
      :visible="isTextEditorOpen('description') || isTextEditorConfirmOpen('description')"
      :placement="isTextEditorOpen('description') ? 'bottom-start' : 'top-start'"
      :width="isTextEditorOpen('description') ? textEditorWidth('description') : undefined"
      :show-arrow="false"
      :popper-style="isTextEditorOpen('description') ? stateEditorPopoverStyle : confirmPopoverStyle"
      popper-class="node-card__text-editor-popper"
    >
      <template #reference>
        <div
          class="node-card__text-trigger node-card__text-trigger--description"
          :class="{ 'node-card__text-trigger--confirm': isTextEditorConfirmOpen('description') }"
          role="button"
          tabindex="0"
          data-text-editor-trigger="true"
          @pointerdown="handleTextTriggerPointerDown('description', $event)"
          @pointermove="handleTextTriggerPointerMove('description', $event)"
          @pointerup="handleTextTriggerPointerUp('description', $event)"
          @pointercancel="clearTextTriggerPointerState"
          @click.stop.prevent="noop"
          @keydown.enter.prevent="handleTextEditorAction('description')"
          @keydown.space.prevent="handleTextEditorAction('description')"
        >
          <div class="node-card__text-trigger-content" :class="{ 'node-card__text-trigger-content--confirm': isTextEditorConfirmOpen('description') }">
            <p class="node-card__description">{{ view.description }}</p>
            <ElIcon class="node-card__text-trigger-confirm-icon"><Check /></ElIcon>
          </div>
        </div>
      </template>
      <div v-if="isTextEditorConfirmOpen('description')" class="node-card__confirm-hint node-card__confirm-hint--text">{{ t("nodeCard.editDescriptionQuestion") }}</div>
      <div v-else-if="isTextEditorOpen('description')" class="node-card__text-editor" data-node-popup-surface="true">
        <div class="node-card__text-editor-title">{{ textEditorTitle('description') }}</div>
        <ElInput
          ref="descriptionEditorInputRef"
          :model-value="textEditorDraftValue('description')"
          type="textarea"
          :autosize="{ minRows: 4, maxRows: 7 }"
          @update:model-value="handleTextEditorDraftInput('description', $event)"
          @keydown.ctrl.enter.prevent="commitTextEditor('description')"
          @keydown.meta.enter.prevent="commitTextEditor('description')"
          @keydown.esc.prevent="closeTextEditor()"
        />
      </div>
    </ElPopover>

    <section v-if="view.body.kind === 'input'" class="node-card__body node-card__body--input">
      <InputNodeBody
        :body="view.body"
        :input-boundary-selection="inputBoundarySelection"
        :input-type-options="inputTypeOptions"
        :input-asset-envelope="inputAssetEnvelope"
        :input-asset-summary="inputAssetSummary"
        :input-asset-text-preview="inputAssetTextPreview"
        :input-asset-description="inputAssetDescription"
        :input-asset-preview-url="inputAssetPreviewUrl"
        :input-asset-accept="inputAssetAccept"
        :input-asset-label="inputAssetLabel"
        :input-knowledge-base-options="inputKnowledgeBaseOptions"
        :input-knowledge-base-value="inputKnowledgeBaseValue"
        :selected-knowledge-base-description="selectedKnowledgeBaseDescription"
        :show-knowledge-base-input="showKnowledgeBaseInput"
        :show-asset-upload-input="showAssetUploadInput"
        :show-legacy-uploaded-asset-hint="showLegacyUploadedAssetHint"
        :is-input-value-editable="isInputValueEditable"
        :input-value-text="inputValueText"
        @update:boundary-selection="handleInputBoundarySelection"
        @update:knowledge-base="handleInputKnowledgeBaseSelect"
        @asset-file-change="handleInputAssetFileChange"
        @asset-drop="handleInputAssetDrop"
        @clear-asset="clearInputAsset"
        @input-value="handleInputValueInput"
      >
        <template #primary-output>
          <PrimaryStatePort
            side="output"
            :port="view.body.primaryOutput"
            :node-id="nodeId"
            anchor-prefix="input-primary-output"
            :pending-virtual-target="pendingStateOutputTarget"
            allow-remove-confirm
            :create-open="isPortCreateOpen('output')"
            :create-draft="portStateDraft"
            :create-title="portPickerTitle"
            :create-error="portStateError"
            :create-hint="t('nodeCard.createStateBindHint')"
            :state-editor-popover-style="stateEditorPopoverStyle"
            :create-popover-style="agentAddPopoverStyle"
            :state-editor-draft="stateEditorDraft"
            :state-editor-error="stateEditorError"
            :type-options="stateTypeOptions"
            :color-options="stateColorOptions"
            :is-state-editor-open="isStateEditorOpen"
            :is-state-editor-confirm-open="isStateEditorConfirmOpen"
            :is-remove-port-state-confirm-open="isRemovePortStateConfirmOpen"
            :is-state-editor-pill-revealed="isStateEditorPillRevealed"
            @pointer-enter="handleStateEditorPillPointerEnter"
            @pointer-leave="handleStateEditorPillPointerLeave"
            @open-create="openPortStateCreate"
            @port-click="handleStateEditorActionClick"
            @update:name="handleStateEditorNameInput"
            @update:type="handleStateEditorTypeValue"
            @update:color="handleStateEditorColorInput"
            @update:description="handleStateEditorDescriptionInput"
            @update:create-name="handlePortDraftNameValue"
            @update:create-type="handlePortDraftTypeSelect"
            @update:create-color="handlePortDraftColorSelect"
            @update:create-description="handlePortDraftDescriptionValue"
            @update:create-value="updatePortDraftValue"
            @cancel-create="closePortPicker"
            @commit-create="commitPortStateCreate"
          />
        </template>
      </InputNodeBody>
    </section>

    <section v-else-if="view.body.kind === 'agent'" class="node-card__body node-card__body--agent">
      <AgentNodeBody
        ref="agentNodeBodyRef"
        :node-id="nodeId"
        :body="view.body"
        :ordered-input-ports="orderedAgentInputPorts"
        :ordered-output-ports="orderedAgentOutputPorts"
        :state-editor-popover-style="stateEditorPopoverStyle"
        :agent-add-popover-style="agentAddPopoverStyle"
        :confirm-popover-style="confirmPopoverStyle"
        :state-editor-draft="stateEditorDraft"
        :state-editor-error="stateEditorError"
        :type-options="stateTypeOptions"
        :color-options="stateColorOptions"
        :is-state-editor-open="isStateEditorOpen"
        :is-state-editor-confirm-open="isStateEditorConfirmOpen"
        :is-remove-port-state-confirm-open="isRemovePortStateConfirmOpen"
        :is-state-editor-pill-revealed="isStateEditorPillRevealed"
        :is-port-reordering="isPortReordering"
        :is-port-reorder-placeholder="isPortReorderPlaceholder"
        :input-create-visible="shouldRevealAgentCreateInputPort"
        :input-create-open="isPortCreateOpen('input')"
        :input-create-accent-color="pendingStateInputTarget?.stateColor ?? pendingStateInputSource?.stateColor ?? '#16a34a'"
        :input-create-label="pendingStateInputTarget?.label ?? pendingStateInputSource?.label ?? '+ input'"
        :input-create-anchor-state-key="agentCreateInputAnchorStateKey"
        :output-create-visible="shouldRevealAgentCreateOutputPort"
        :output-create-open="isPortCreateOpen('output')"
        :output-create-accent-color="pendingStateOutputTarget?.stateColor ?? VIRTUAL_ANY_OUTPUT_COLOR"
        :output-create-label="pendingStateOutputTarget?.label ?? '+ output'"
        :output-create-anchor-state-key="VIRTUAL_ANY_OUTPUT_STATE_KEY"
        :create-draft="portStateDraft"
        :create-title="portPickerTitle"
        :create-error="portStateError"
        :create-hint="t('nodeCard.createStateBindHint')"
        :model-value="agentResolvedModelValue || undefined"
        :model-options="agentModelOptions"
        :global-model-ref="trimmedGlobalTextModelRef"
        :thinking-mode-value="agentThinkingModeValue"
        :thinking-options="agentThinkingOptions"
        :thinking-enabled="agentThinkingEnabled"
        :breakpoint-enabled="Boolean(agentBreakpointEnabled)"
        :selected-skill-key="selectedSkillKey"
        :skill-definitions-loading="skillDefinitionsLoading"
        :skill-definitions-error="skillDefinitionsError"
        :available-skill-definitions="availableSkillDefinitions"
        @pointer-enter="handleStateEditorPillPointerEnter"
        @pointer-leave="handleStateEditorPillPointerLeave"
        @reorder-pointer-down="handlePortReorderPointerDown"
        @port-click="handlePortStatePillClick"
        @remove-click="handleRemovePortStateClick"
        @update:name="handleStateEditorNameInput"
        @update:type="handleStateEditorTypeValue"
        @update:color="handleStateEditorColorInput"
        @update:description="handleStateEditorDescriptionInput"
        @open-create="openPortStateCreate"
        @update:create-name="handlePortDraftNameValue"
        @update:create-type="handlePortDraftTypeSelect"
        @update:create-color="handlePortDraftColorSelect"
        @update:create-description="handlePortDraftDescriptionValue"
        @update:create-value="updatePortDraftValue"
        @cancel-create="closePortPicker"
        @commit-create="commitPortStateCreate"
        @model-visible-change="handleAgentModelSelectVisibleChange"
        @update:model-value="handleAgentModelValueChange"
        @update:thinking-mode="handleAgentThinkingModeSelect"
        @update:breakpoint-enabled="handleAgentBreakpointToggleValue"
        @select-skill="selectAgentSkill"
        @update-skill-instruction="handleSkillInstructionInput"
        @task-input="handleAgentTaskInstructionInput"
      />
    </section>

    <section v-else-if="view.body.kind === 'subgraph'" class="node-card__body node-card__body--subgraph">
      <SubgraphNodeBody
        :node-id="nodeId"
        :body="view.body"
        :ordered-input-ports="orderedAgentInputPorts"
        :ordered-output-ports="orderedAgentOutputPorts"
        :state-editor-popover-style="stateEditorPopoverStyle"
        :agent-add-popover-style="agentAddPopoverStyle"
        :state-editor-draft="stateEditorDraft"
        :state-editor-error="stateEditorError"
        :type-options="stateTypeOptions"
        :color-options="stateColorOptions"
        :is-state-editor-open="isStateEditorOpen"
        :is-state-editor-confirm-open="isStateEditorConfirmOpen"
        :is-remove-port-state-confirm-open="isRemovePortStateConfirmOpen"
        :is-state-editor-pill-revealed="isStateEditorPillRevealed"
        :is-port-reordering="isPortReordering"
        :is-port-reorder-placeholder="isPortReorderPlaceholder"
        @pointer-enter="handleStateEditorPillPointerEnter"
        @pointer-leave="handleStateEditorPillPointerLeave"
        @reorder-pointer-down="handlePortReorderPointerDown"
        @port-click="handlePortStatePillClick"
        @remove-click="handleRemovePortStateClick"
        @update:name="handleStateEditorNameInput"
        @update:type="handleStateEditorTypeValue"
        @update:color="handleStateEditorColorInput"
        @update:description="handleStateEditorDescriptionInput"
      />
    </section>

    <section v-else-if="view.body.kind === 'output'" class="node-card__body node-card__body--output">
      <OutputNodeBody
        :body="view.body"
        :output-preview-content="outputPreviewContent"
        @update:persist-enabled="handleOutputPersistToggle"
      >
        <template #primary-input>
          <PrimaryStatePort
            side="input"
            :port="view.body.primaryInput"
            :node-id="nodeId"
            anchor-prefix="output-input"
            :fallback-label="t('nodeCard.unbound')"
            :create-open="isPortCreateOpen('input')"
            :create-draft="portStateDraft"
            :create-title="portPickerTitle"
            :create-error="portStateError"
            :create-hint="t('nodeCard.createStateBindHint')"
            :state-editor-popover-style="stateEditorPopoverStyle"
            :create-popover-style="agentAddPopoverStyle"
            :state-editor-draft="stateEditorDraft"
            :state-editor-error="stateEditorError"
            :type-options="stateTypeOptions"
            :color-options="stateColorOptions"
            :is-state-editor-open="isStateEditorOpen"
            :is-state-editor-confirm-open="isStateEditorConfirmOpen"
            :is-remove-port-state-confirm-open="isRemovePortStateConfirmOpen"
            :is-state-editor-pill-revealed="isStateEditorPillRevealed"
            @pointer-enter="handleStateEditorPillPointerEnter"
            @pointer-leave="handleStateEditorPillPointerLeave"
            @open-create="openPortStateCreate"
            @port-click="handleStateEditorActionClick"
            @update:name="handleStateEditorNameInput"
            @update:type="handleStateEditorTypeValue"
            @update:color="handleStateEditorColorInput"
            @update:description="handleStateEditorDescriptionInput"
            @update:create-name="handlePortDraftNameValue"
            @update:create-type="handlePortDraftTypeSelect"
            @update:create-color="handlePortDraftColorSelect"
            @update:create-description="handlePortDraftDescriptionValue"
            @update:create-value="updatePortDraftValue"
            @cancel-create="closePortPicker"
            @commit-create="commitPortStateCreate"
          />
        </template>
      </OutputNodeBody>
    </section>

    <section v-else-if="view.body.kind === 'condition'" class="node-card__body node-card__body--condition">
      <ConditionNodeBody
        :body="view.body"
        :node-id="nodeId"
        :rule-operator-value="node.kind === 'condition' ? node.config.rule.operator : ''"
        :condition-rule-value-draft="conditionRuleValueDraft"
        :condition-rule-value-disabled="conditionRuleValueDisabled"
        :condition-loop-limit-value="conditionLoopLimitValue"
        :condition-rule-operator-options="conditionRuleOperatorOptions"
        :state-editor-popover-style="stateEditorPopoverStyle"
        :agent-add-popover-style="agentAddPopoverStyle"
        :state-editor-draft="stateEditorDraft"
        :state-editor-error="stateEditorError"
        :port-state-draft="portStateDraft"
        :port-picker-title="portPickerTitle"
        :port-state-error="portStateError"
        :state-type-options="stateTypeOptions"
        :type-options="stateTypeOptions"
        :color-options="stateColorOptions"
        :is-port-create-open="isPortCreateOpen"
        :is-state-editor-open="isStateEditorOpen"
        :is-state-editor-confirm-open="isStateEditorConfirmOpen"
        :is-remove-port-state-confirm-open="isRemovePortStateConfirmOpen"
        :is-state-editor-pill-revealed="isStateEditorPillRevealed"
        @pointer-enter="handleStateEditorPillPointerEnter"
        @pointer-leave="handleStateEditorPillPointerLeave"
        @open-create="openPortStateCreate"
        @source-click="handleStateEditorActionClick"
        @remove-source-click="handleRemovePortStateClick"
        @update:name="handleStateEditorNameInput"
        @update:type="handleStateEditorTypeValue"
        @update:color="handleStateEditorColorInput"
        @update:description="handleStateEditorDescriptionInput"
        @update:create-name="handlePortDraftNameValue"
        @update:create-type="handlePortDraftTypeSelect"
        @update:create-color="handlePortDraftColorSelect"
        @update:create-description="handlePortDraftDescriptionValue"
        @update:create-value="updatePortDraftValue"
        @cancel-create="closePortPicker"
        @commit-create="commitPortStateCreate"
        @update:operator="handleConditionRuleOperatorSelect"
        @update:loop-limit="handleConditionLoopLimitValue"
        @rule-value-input="handleConditionRuleValueInput"
        @commit-rule-value="commitConditionRuleValue"
        @rule-value-enter="handleConditionRuleValueEnter"
      />
    </section>

    <div
      v-if="view.runtimeNote"
      class="node-card__runtime-note"
      :class="`node-card__runtime-note--${view.runtimeNote.tone}`"
    >
      <span class="node-card__runtime-note-label">{{ view.runtimeNote.label }}</span>
      <div class="node-card__runtime-note-text">{{ view.runtimeNote.text }}</div>
    </div>
  </article>
  <FloatingStatePortPill
    :floating-port="portReorderFloatingPort"
    :floating-style="portReorderFloatingStyle"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ElIcon, ElInput, ElPopover } from "element-plus";
import { Check, Collection, Document, FolderOpened } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

import AgentNodeBody from "./AgentNodeBody.vue";
import ConditionNodeBody from "./ConditionNodeBody.vue";
import FloatingStatePortPill from "./FloatingStatePortPill.vue";
import InputNodeBody from "./InputNodeBody.vue";
import NodeCardTopActions from "./NodeCardTopActions.vue";
import OutputNodeBody from "./OutputNodeBody.vue";
import PrimaryStatePort from "./PrimaryStatePort.vue";
import SubgraphNodeBody from "./SubgraphNodeBody.vue";
import type { KnowledgeBaseRecord } from "@/types/knowledge";
import type { AgentNode, ConditionNode, GraphNode, InputNode, OutputNode, StateDefinition } from "@/types/node-system";
import type { SkillDefinition } from "@/types/skills";
import { buildSkillArtifactFileUrl, uploadSkillArtifactFile } from "@/api/skillArtifacts";
import { isAgentOutputManagedByDynamicCapability } from "@/lib/agent-capability-management";
import { CREATE_AGENT_INPUT_STATE_KEY, VIRTUAL_ANY_INPUT_STATE_KEY, VIRTUAL_ANY_OUTPUT_COLOR, VIRTUAL_ANY_OUTPUT_STATE_KEY } from "@/lib/virtual-any-input";

import {
  DEFAULT_AGENT_TEMPERATURE,
  GLOBAL_RUNTIME_MODEL_OPTION_VALUE,
  buildAgentModelSelectOptions,
  normalizeAgentThinkingMode,
  normalizeAgentTemperature,
  resolveAgentTemperatureInputValue,
  resolveAgentModelSelection,
  type AgentThinkingControlMode,
} from "./agentConfigModel";
import {
  normalizeConditionLoopLimit,
  resolveConditionLoopLimitPatch,
} from "./conditionLoopLimit";
import {
  CONDITION_RULE_OPERATOR_OPTIONS,
  isConditionRuleValueInputDisabled,
  resolveConditionRuleOperatorPatch,
  resolveConditionRuleValueDraft,
  resolveConditionRuleValuePatch,
} from "./conditionRuleEditorModel";
import { buildInputKnowledgeBaseOptions, resolveSelectedKnowledgeBaseDescription } from "./inputKnowledgeBaseModel";
import {
  isSwitchableInputBoundaryType,
  normalizeInputBoundaryConfigType,
  resolveInputBoundarySelection,
  resolveNextInputValueForBoundaryType,
  resolveStateTypeForInputBoundary,
} from "./inputValueTypeModel";
import { buildNodeCardViewModel, type NodePortViewModel } from "./nodeCardViewModel";
import {
  OUTPUT_DISPLAY_MODE_OPTIONS,
  OUTPUT_PERSIST_FORMAT_OPTIONS,
  isOutputDisplayModeActive as resolveOutputDisplayModeActive,
  isOutputPersistFormatActive as resolveOutputPersistFormatActive,
  resolveOutputFileNameTemplatePatch,
  resolveOutputPersistEnabledPatch,
} from "./outputConfigModel";
import { resolveOutputPreviewContent } from "./outputPreviewContentModel";
import { usePortReorder } from "./usePortReorder";
import {
  listSelectableSkillDefinitions,
  resolveSkillInstructionOverridePatch,
  resolveSelectAgentSkillPatch,
} from "./skillPickerModel";
import {
  buildStateEditorDraftFromSchema,
  resolveStateEditorAnchorStateKey,
  resolveStateEditorUpdatePatch,
  updateStateEditorDraftColor,
  updateStateEditorDraftDescription,
  updateStateEditorDraftName,
  updateStateEditorDraftType,
} from "./stateEditorModel";
import {
  createStateDraftFromQuery,
  updateStatePortDraftColor,
  updateStatePortDraftDescription,
  updateStatePortDraftName,
  updateStatePortDraftType,
  updateStatePortDraftValue,
} from "./statePortCreateModel";
import { useNodeFloatingPanels } from "./useNodeFloatingPanels";
import { useNodeCardTextEditor } from "./useNodeCardTextEditor";
import {
  createUploadedAssetEnvelope,
  resolveUploadedAssetDescription,
  resolveUploadedAssetInputAccept,
  resolveUploadedAssetLabel,
  resolveUploadedAssetSummary,
  resolveUploadedAssetTextPreview,
  tryParseUploadedAssetEnvelope,
} from "./uploadedAssetModel";
import {
  defaultValueForStateType,
  resolveStateColorOptions,
  STATE_FIELD_TYPE_OPTIONS,
  type StateFieldDraft,
  type StateFieldType,
} from "@/editor/workspace/statePanelFields";

const props = defineProps<{
  nodeId: string;
  node: GraphNode;
  stateSchema: Record<string, StateDefinition>;
  knowledgeBases: KnowledgeBaseRecord[];
  skillDefinitions: SkillDefinition[];
  skillDefinitionsLoading: boolean;
  skillDefinitionsError: string | null;
  availableAgentModelRefs: string[];
  agentModelDisplayLookup: Record<string, string>;
  globalTextModelRef: string;
  agentBreakpointEnabled?: boolean;
  agentBreakpointTiming?: "before" | "after";
  conditionRouteTargets?: Record<string, string | null>;
  latestRunStatus?: string | null;
  runOutputPreviewText?: string | null;
  runOutputDisplayMode?: string | null;
  runFailureMessage?: string | null;
  subgraphRunStatusByInnerNodeId?: Record<string, string>;
  pendingStateInputSource?: { stateKey: string; label: string; stateColor: string } | null;
  pendingStateInputTarget?: { stateKey: string; label: string; stateColor: string } | null;
  pendingStateOutputTarget?: { stateKey: string; label: string; stateColor: string } | null;
  humanReviewPending: boolean;
  selected: boolean;
  hovered?: boolean;
  interactionLocked?: boolean;
}>();

const emit = defineEmits<{
  (event: "update-node-metadata", payload: { nodeId: string; patch: Partial<Pick<GraphNode, "name" | "description">> }): void;
  (event: "update-input-config", payload: { nodeId: string; patch: Partial<InputNode["config"]> }): void;
  (event: "update-input-state", payload: { stateKey: string; patch: Partial<StateDefinition> }): void;
  (event: "update-state", payload: { stateKey: string; patch: Partial<StateDefinition> }): void;
  (event: "remove-port-state", payload: { nodeId: string; side: "input" | "output"; stateKey: string }): void;
  (event: "reorder-port-state", payload: { nodeId: string; side: "input" | "output"; stateKey: string; targetIndex: number }): void;
  (event: "update-output-config", payload: { nodeId: string; patch: Partial<OutputNode["config"]> }): void;
  (event: "update-agent-config", payload: { nodeId: string; patch: Partial<AgentNode["config"]> }): void;
  (event: "toggle-agent-breakpoint", payload: { nodeId: string; enabled: boolean }): void;
  (event: "update-agent-breakpoint-timing", payload: { nodeId: string; timing: "before" | "after" }): void;
  (event: "update-condition-config", payload: { nodeId: string; patch: Partial<ConditionNode["config"]> }): void;
  (event: "update-condition-branch", payload: { nodeId: string; currentKey: string; nextKey: string; mappingKeys: string[] }): void;
  (event: "add-condition-branch", payload: { nodeId: string }): void;
  (event: "remove-condition-branch", payload: { nodeId: string; branchKey: string }): void;
  (event: "bind-port-state", payload: { nodeId: string; side: "input" | "output"; stateKey: string }): void;
  (event: "create-port-state", payload: { nodeId: string; side: "input" | "output"; field: StateFieldDraft }): void;
  (event: "delete-node", payload: { nodeId: string }): void;
  (event: "save-node-preset", payload: { nodeId: string }): void;
  (event: "open-subgraph-editor", payload: { nodeId: string }): void;
  (event: "open-human-review", payload: { nodeId: string }): void;
  (event: "locked-edit-attempt"): void;
  (event: "refresh-agent-models"): void;
}>();

const { t } = useI18n();

const outputDisplayModeOptions = OUTPUT_DISPLAY_MODE_OPTIONS;
const outputPersistFormatOptions = OUTPUT_PERSIST_FORMAT_OPTIONS;
const inputTypeOptions = computed<Array<{
  value: "text" | "file" | "knowledge_base";
  label: string;
  icon: typeof Document;
}>>(() => [
  { value: "text", label: t("nodeCard.inputTypeText"), icon: Document },
  { value: "file", label: t("nodeCard.inputTypeFile"), icon: FolderOpened },
  { value: "knowledge_base", label: t("nodeCard.inputTypeKnowledgeBase"), icon: Collection },
]);
const confirmPopoverStyle = {
  padding: "0",
  border: "none",
  background: "transparent",
  boxShadow: "none",
};
const transparentPopoverStyle = {
  "--el-popover-bg-color": "transparent",
  "--el-popover-border-color": "transparent",
  "--el-popover-padding": "0px",
  background: "transparent",
  border: "none",
  boxShadow: "none",
  padding: "0",
  "min-width": "0",
} as const;
const actionPopoverStyle = transparentPopoverStyle;
const stateEditorPopoverStyle = transparentPopoverStyle;
const agentAddPopoverStyle = transparentPopoverStyle;
const stateTypeOptions = STATE_FIELD_TYPE_OPTIONS;
const conditionRuleOperatorOptions = CONDITION_RULE_OPERATOR_OPTIONS;
const agentThinkingOptions = computed<Array<{ value: AgentThinkingControlMode; label: string }>>(() => [
  { value: "off", label: t("nodeCard.thinkingOff") },
  { value: "low", label: t("nodeCard.thinkingLow") },
  { value: "medium", label: t("nodeCard.thinkingMedium") },
  { value: "high", label: t("nodeCard.thinkingHigh") },
  { value: "xhigh", label: t("nodeCard.thinkingExtraHigh") },
]);
const view = computed(() =>
  buildNodeCardViewModel(props.nodeId, props.node, props.stateSchema, {
    conditionRouteTargets: props.conditionRouteTargets,
    skillDefinitions: props.skillDefinitions,
    runtime: {
      latestRunStatus: props.latestRunStatus ?? null,
      outputPreviewText: props.runOutputPreviewText ?? null,
      outputDisplayMode: props.runOutputDisplayMode ?? null,
      failedMessage: props.runFailureMessage ?? null,
      subgraphNodeStatusMap: props.subgraphRunStatusByInnerNodeId ?? {},
    },
  }),
);
const agentInputPorts = computed<NodePortViewModel[]>(() =>
  view.value.body.kind === "agent" || view.value.body.kind === "subgraph" ? view.value.inputs.filter((port) => !port.virtual) : [],
);
const agentOutputPorts = computed<NodePortViewModel[]>(() =>
  view.value.body.kind === "agent" || view.value.body.kind === "subgraph" ? view.value.outputs.filter((port) => !port.virtual) : [],
);
const isAgentOutputManagedBySkill = computed(() => props.node.kind === "agent" && props.node.config.skillKey.trim().length > 0);
const isAgentOutputManagedByCapability = computed(() =>
  isAgentOutputManagedByDynamicCapability({
    nodeId: props.nodeId,
    node: props.node,
    stateSchema: props.stateSchema,
  }),
);
const shouldShowAgentCreateInputPort = computed(() => agentInputPorts.value.length === 0);
const shouldShowAgentCreateOutputPort = computed(
  () => !isAgentOutputManagedBySkill.value && !isAgentOutputManagedByCapability.value && agentOutputPorts.value.length === 0,
);
const agentCreateInputAnchorStateKey = computed(() =>
  props.pendingStateInputSource ? CREATE_AGENT_INPUT_STATE_KEY : VIRTUAL_ANY_INPUT_STATE_KEY,
);
const outputPreviewContent = computed(() => {
  if (view.value.body.kind !== "output") {
    return resolveOutputPreviewContent("", "plain");
  }
  return resolveOutputPreviewContent(view.value.body.previewText, view.value.body.displayMode);
});
const conditionRuleValueDraft = ref("");
const activePortPickerSide = ref<"input" | "output" | null>(null);
const portStateDraft = ref<StateFieldDraft | null>(null);
const portStateError = ref<string | null>(null);
const agentNodeBodyRef = ref<{ collapseModelSelect?: () => void } | null>(null);
const titleEditorInputRef = ref<{ focus?: () => void } | null>(null);
const descriptionEditorInputRef = ref<{ focus?: () => void } | null>(null);
const hoveredStateEditorPillAnchorId = ref<string | null>(null);
const activeStateEditorAnchorId = ref<string | null>(null);
const stateEditorDraft = ref<StateFieldDraft | null>(null);
const stateEditorError = ref<string | null>(null);
const {
  activeRemovePortStateConfirmAnchorId,
  activeStateEditorConfirmAnchorId,
  activeTopAction,
  addGlobalFloatingPanelListeners,
  clearRemovePortStateConfirmState,
  clearRemovePortStateConfirmTimeout,
  clearStateEditorConfirmState,
  clearStateEditorConfirmTimeout,
  clearTopActionConfirmState,
  clearTopActionTimeout,
  isRemovePortStateConfirmOpen,
  isStateEditorConfirmOpen,
  removeGlobalFloatingPanelListeners,
  startRemovePortStateConfirmWindow,
  startStateEditorConfirmWindow,
  startTopActionConfirmWindow,
} = useNodeFloatingPanels({
  isFloatingPanelOpen: () => hasFloatingPanelOpen.value,
  closeFloatingPanels: (options) => {
    closeFloatingPanels(options);
  },
});
const {
  activeTextEditor,
  activeTextEditorConfirmField,
  clearTextEditorConfirmState,
  clearTextEditorConfirmTimeout,
  clearTextEditorFocusTimeout,
  clearTextTriggerPointerState,
  closeTextEditor,
  commitOpenTextEditorIfNeeded,
  commitTextEditor,
  handleTextEditorAction,
  handleTextEditorDraftInput,
  handleTextTriggerPointerDown,
  handleTextTriggerPointerMove,
  handleTextTriggerPointerUp,
  isTextEditorConfirmOpen,
  isTextEditorOpen,
  textEditorDraftValue,
  textEditorTitle,
  textEditorWidth,
} = useNodeCardTextEditor({
  getMetadata: () => props.node,
  guardLockedInteraction: guardLockedGraphInteraction,
  prepareTextEditorAction: () => {
    clearRemovePortStateConfirmState();
  },
  prepareOpenTextEditor: () => {
    clearTopActionTimeout();
    activeTopAction.value = null;
    clearStateEditorConfirmState();
    clearRemovePortStateConfirmState();
    closeStateEditor();
    closePortPicker();
  },
  emitUpdateNodeMetadata: (patch) => {
    emit("update-node-metadata", { nodeId: props.nodeId, patch });
  },
  focusTitleInput: () => {
    titleEditorInputRef.value?.focus?.();
  },
  focusDescriptionInput: () => {
    descriptionEditorInputRef.value?.focus?.();
  },
});
const {
  clearPortReorderPointerState,
  handlePortReorderPointerDown,
  handlePortStatePillClick,
  isPortReorderPlaceholder,
  isPortReordering,
  orderedInputPorts: orderedAgentInputPorts,
  orderedOutputPorts: orderedAgentOutputPorts,
  portReorderFloatingPort,
  portReorderFloatingStyle,
} = usePortReorder<NodePortViewModel>({
  getNodeId: () => props.nodeId,
  getPorts: (side) => (side === "input" ? agentInputPorts.value : agentOutputPorts.value),
  guardLockedInteraction: guardLockedGraphInteraction,
  onActivateReorder: () => {
    clearStateEditorConfirmState();
    clearRemovePortStateConfirmState();
    closeStateEditor();
  },
  onPortPillClick: (anchorId, stateKey) => {
    handleStateEditorActionClick(anchorId, stateKey);
  },
  onReorder: (payload) => {
    emit("reorder-port-state", payload);
  },
});
const stateColorOptions = computed(() => resolveStateColorOptions(stateEditorDraft.value?.definition.color ?? ""));
const showKnowledgeBaseInput = computed(() => view.value.body.kind === "input" && view.value.body.editorMode === "knowledge_base");
const showAssetUploadInput = computed(() => view.value.body.kind === "input" && view.value.body.editorMode === "asset");
const isInputValueEditable = computed(() => view.value.body.kind === "input" && view.value.body.editorMode === "text");
const inputValueText = computed(() => {
  return view.value.body.kind === "input" ? view.value.body.valueText : "";
});
const inputStateValue = computed(() => {
  if (props.node.kind !== "input") {
    return "";
  }
  const stateKey = inputStateKey.value;
  if (stateKey && Object.prototype.hasOwnProperty.call(props.stateSchema[stateKey] ?? {}, "value")) {
    return props.stateSchema[stateKey]?.value;
  }
  return props.node.config.value;
});
const inputKnowledgeBaseValue = computed(() => {
  if (props.node.kind !== "input") {
    return "";
  }
  return typeof inputStateValue.value === "string" ? inputStateValue.value : "";
});
const inputAssetType = computed(() => (view.value.body.kind === "input" ? view.value.body.assetType : null));
const inputAssetEnvelope = computed(() =>
  props.node.kind === "input" ? tryParseUploadedAssetEnvelope(inputStateValue.value, inputAssetType.value) : null,
);
const inputAssetAccept = computed(() => resolveUploadedAssetInputAccept(inputAssetType.value));
const inputStateKey = computed(() =>
  view.value.body.kind === "input" && !view.value.body.primaryOutput?.virtual ? view.value.body.primaryOutput?.key ?? null : null,
);
const inputStateType = computed(() => {
  const stateKey = inputStateKey.value;
  return stateKey
    ? normalizeInputBoundaryConfigType(props.stateSchema[stateKey]?.type)
    : normalizeInputBoundaryConfigType(props.node.kind === "input" ? props.node.config.boundaryType : "text");
});
const inputBoundarySelection = computed<"text" | "file" | "knowledge_base">(() => {
  return resolveInputBoundarySelection(inputStateType.value);
});
const inputAssetLabel = computed(() => resolveUploadedAssetLabel(inputAssetType.value));
const inputAssetSummary = computed(() => resolveUploadedAssetSummary(inputAssetEnvelope.value));
const inputAssetTextPreview = computed(() => resolveUploadedAssetTextPreview(inputAssetEnvelope.value));
const inputAssetDescription = computed(() => resolveUploadedAssetDescription(inputAssetEnvelope.value, inputAssetType.value));
const inputAssetPreviewUrl = computed(() => {
  const asset = inputAssetEnvelope.value;
  if (!asset || !asset.localPath || !["image", "audio", "video"].includes(asset.detectedType)) {
    return "";
  }
  return buildSkillArtifactFileUrl(asset.localPath);
});
const showLegacyUploadedAssetHint = computed(
  () => showAssetUploadInput.value && !inputAssetEnvelope.value && inputValueText.value.trim().length > 0,
);
const inputKnowledgeBaseOptions = computed(() => buildInputKnowledgeBaseOptions(props.knowledgeBases, inputKnowledgeBaseValue.value));
const selectedKnowledgeBaseDescription = computed(() =>
  resolveSelectedKnowledgeBaseDescription({
    showKnowledgeBaseInput: showKnowledgeBaseInput.value,
    selectedValue: inputKnowledgeBaseValue.value,
    options: inputKnowledgeBaseOptions.value,
    emptyOptionsDescription: t("nodeCard.importKnowledgeHint"),
    fallbackDescription: t("nodeCard.pickKnowledgeHint"),
  }),
);
const trimmedGlobalTextModelRef = computed(() => props.globalTextModelRef.trim());
const agentResolvedModelValue = computed(() => {
  if (props.node.kind !== "agent") {
    return GLOBAL_RUNTIME_MODEL_OPTION_VALUE;
  }
  const overrideModel = props.node.config.model.trim();
  return props.node.config.modelSource === "override" && overrideModel ? overrideModel : GLOBAL_RUNTIME_MODEL_OPTION_VALUE;
});
const agentThinkingModeValue = computed<AgentThinkingControlMode>(() =>
  props.node.kind === "agent" ? normalizeAgentThinkingMode(props.node.config.thinkingMode) : "off",
);
const agentThinkingEnabled = computed(() => props.node.kind === "agent" ? agentThinkingModeValue.value !== "off" : true);
const agentBreakpointTimingValue = computed(() => props.agentBreakpointTiming ?? "after");
const agentModelOptions = computed(() =>
  buildAgentModelSelectOptions(trimmedGlobalTextModelRef.value, props.availableAgentModelRefs, props.agentModelDisplayLookup),
);
const selectedSkillKey = computed(() => props.node.kind === "agent" ? props.node.config.skillKey.trim() : "");
const availableSkillDefinitions = computed(() =>
  props.node.kind === "agent" ? listSelectableSkillDefinitions(props.skillDefinitions) : [],
);
const portPickerTitle = computed(() => {
  if (!activePortPickerSide.value) {
    return "";
  }
  return activePortPickerSide.value === "input" ? t("nodeCard.createInputState") : t("nodeCard.createOutputState");
});
const conditionRuleValueDisabled = computed(
  () => props.node.kind === "condition" && isConditionRuleValueInputDisabled(props.node.config.rule.operator),
);
const conditionLoopLimitValue = computed(() =>
  props.node.kind === "condition" ? normalizeConditionLoopLimit(props.node.config.loopLimit) : 5,
);
const agentTemperatureInput = computed(() => {
  if (props.node.kind !== "agent") {
    return String(DEFAULT_AGENT_TEMPERATURE);
  }
  return String(normalizeAgentTemperature(props.node.config.temperature));
});
const hasAdvancedSettings = computed(() => props.node.kind === "agent" || props.node.kind === "output");
const canSavePreset = computed(() => props.node.kind === "agent");
const isTopActionVisible = computed(() => props.humanReviewPending || props.selected || Boolean(props.hovered) || activeTopAction.value !== null);
const hasFloatingPanelOpen = computed(
  () =>
    activeTopAction.value !== null ||
    activeTextEditorConfirmField.value !== null ||
    activeTextEditor.value !== null ||
    activeStateEditorConfirmAnchorId.value !== null ||
    activeRemovePortStateConfirmAnchorId.value !== null ||
    activeStateEditorAnchorId.value !== null ||
    activePortPickerSide.value !== null,
);
const shouldRevealAgentCreateInputPort = computed(() => shouldShowAgentCreateInputPort.value || props.selected || Boolean(props.hovered) || hasFloatingPanelOpen.value);
const shouldRevealAgentCreateOutputPort = computed(
  () =>
    !isAgentOutputManagedBySkill.value &&
    !isAgentOutputManagedByCapability.value &&
    (shouldShowAgentCreateOutputPort.value || props.selected || Boolean(props.hovered) || hasFloatingPanelOpen.value),
);

function isPortCreateOpen(side: "input" | "output") {
  return activePortPickerSide.value === side && Boolean(portStateDraft.value);
}

watch(
  () => (props.node.kind === "condition" ? props.node.config.rule.value : null),
  (ruleValue) => {
    conditionRuleValueDraft.value = resolveConditionRuleValueDraft(ruleValue);
  },
  { immediate: true },
);

watch(
  () => props.selected,
  (selected) => {
    if (selected) {
      return;
    }
    clearTopActionTimeout();
    activeTopAction.value = null;
    clearTextEditorConfirmState();
    hoveredStateEditorPillAnchorId.value = null;
    clearStateEditorConfirmState();
    clearRemovePortStateConfirmState();
    closeStateEditor();
  },
);

watch(
  () => props.interactionLocked,
  (locked) => {
    if (locked) {
      closeLockedFloatingPanels();
    }
  },
);

onBeforeUnmount(() => {
  removeGlobalFloatingPanelListeners();
  clearTopActionTimeout();
  clearTextTriggerPointerState();
  clearPortReorderPointerState();
  clearTextEditorConfirmTimeout();
  clearTextEditorFocusTimeout();
  clearStateEditorConfirmTimeout();
  clearRemovePortStateConfirmTimeout();
});

onMounted(() => {
  if (hasFloatingPanelOpen.value) {
    addGlobalFloatingPanelListeners();
  }
});

watch(hasFloatingPanelOpen, (open) => {
  if (open) {
    addGlobalFloatingPanelListeners();
    return;
  }
  removeGlobalFloatingPanelListeners();
});

function closeLockedFloatingPanels() {
  clearTopActionTimeout();
  activeTopAction.value = null;
  clearTextTriggerPointerState();
  clearPortReorderPointerState();
  clearTextEditorConfirmState();
  clearStateEditorConfirmState();
  clearRemovePortStateConfirmState();
  closePortPicker();
  closeStateEditor();
  closeTextEditor();
}

function guardLockedGraphInteraction() {
  if (!props.interactionLocked) {
    return false;
  }
  closeLockedFloatingPanels();
  emit("locked-edit-attempt");
  return true;
}

function isLockedInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      [
        "button",
        "input",
        "textarea",
        "select",
        "[role='button']",
        "[data-top-action-surface='true']",
        "[data-state-editor-trigger='true']",
        "[data-text-editor-trigger='true']",
        "[data-node-popup-surface='true']",
        ".el-switch",
        ".el-select",
        ".el-input",
      ].join(", "),
    ),
  );
}

function handleLockedNodeCardInteractionCapture(event: Event) {
  if (!props.interactionLocked) {
    if (event.type === "click") {
      handleNodeCardClickCapture(event);
    }
    return;
  }
  if (!isLockedInteractiveTarget(event.target)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  guardLockedGraphInteraction();
}

function emitOutputConfigPatch(patch: Partial<OutputNode["config"]>) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "output") {
    return;
  }
  emit("update-output-config", { nodeId: props.nodeId, patch });
}

function emitInputConfigPatch(patch: Partial<InputNode["config"]>) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "input") {
    return;
  }
  emit("update-input-config", { nodeId: props.nodeId, patch });
}

function emitInputStatePatch(stateKey: string, patch: Partial<StateDefinition>) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  emit("update-input-state", { stateKey, patch });
}

function emitInputValuePatch(value: unknown) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  const stateKey = inputStateKey.value;
  if (stateKey) {
    emitInputStatePatch(stateKey, { value });
  }
  emitInputConfigPatch({ value });
}

function emitAgentConfigPatch(patch: Partial<AgentNode["config"]>) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "agent") {
    return;
  }
  emit("update-agent-config", { nodeId: props.nodeId, patch });
}

function emitConditionConfigPatch(patch: Partial<ConditionNode["config"]>) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "condition") {
    return;
  }
  emit("update-condition-config", { nodeId: props.nodeId, patch });
}

function handleOutputPersistToggle(value: string | number | boolean) {
  if (props.node.kind !== "output") {
    return;
  }
  emitOutputConfigPatch(resolveOutputPersistEnabledPatch(value));
}

function updateOutputDisplayMode(displayMode: OutputNode["config"]["displayMode"]) {
  emitOutputConfigPatch({ displayMode });
}

function isOutputDisplayModeActive(displayMode: OutputNode["config"]["displayMode"]) {
  return resolveOutputDisplayModeActive(view.value.body.kind === "output" ? view.value.body.displayMode : null, displayMode);
}

function updateOutputPersistFormat(persistFormat: OutputNode["config"]["persistFormat"]) {
  emitOutputConfigPatch({ persistFormat });
}

function isOutputPersistFormatActive(persistFormat: OutputNode["config"]["persistFormat"]) {
  return resolveOutputPersistFormatActive(props.node.kind === "output" ? props.node.config.persistFormat : null, persistFormat);
}

function handleOutputFileNameInputValue(value: string | number) {
  const patch = resolveOutputFileNameTemplatePatch(value);
  if (!patch) {
    return;
  }
  emitOutputConfigPatch(patch);
}

function handleAgentTaskInstructionInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) {
    return;
  }
  emitAgentConfigPatch({ taskInstruction: target.value });
}

function selectAgentSkill(skillKey: string) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "agent") {
    return;
  }
  const patch = resolveSelectAgentSkillPatch(
    props.node.config.skillKey,
    skillKey,
    props.skillDefinitions,
    props.node.config.skillInstructionBlocks ?? {},
  );
  if (!patch) {
    return;
  }
  emitAgentConfigPatch(patch);
}

function handleSkillInstructionInput(payload: { skillKey: string; content: string }) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "agent") {
    return;
  }
  const currentBlocks = props.node.config.skillInstructionBlocks ?? {};
  const patch = resolveSkillInstructionOverridePatch(
    payload.skillKey,
    payload.content,
    props.skillDefinitions,
    currentBlocks,
  );
  if (!patch) {
    return;
  }
  emitAgentConfigPatch(patch);
}

function openPortStateCreate(side: "input" | "output") {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (side === "output" && (isAgentOutputManagedBySkill.value || isAgentOutputManagedByCapability.value)) {
    return;
  }
  clearTopActionTimeout();
  activeTopAction.value = null;
  clearTextEditorConfirmState();
  clearStateEditorConfirmState();
  clearRemovePortStateConfirmState();
  commitOpenTextEditorIfNeeded();
  closeStateEditor();
  portStateError.value = null;
  activePortPickerSide.value = side;
  portStateDraft.value = createStateDraftFromQuery("", Object.keys(props.stateSchema));
}

function closePortPicker() {
  activePortPickerSide.value = null;
  portStateDraft.value = null;
  portStateError.value = null;
}

function handlePortDraftNameValue(value: string | number) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (!portStateDraft.value) {
    return;
  }
  portStateDraft.value = updateStatePortDraftName(portStateDraft.value, value);
}

function handlePortDraftTypeSelect(value: string | number | boolean | undefined) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (!portStateDraft.value) {
    return;
  }
  portStateDraft.value = updateStatePortDraftType(portStateDraft.value, value);
}

function handlePortDraftDescriptionValue(value: string | number) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (!portStateDraft.value) {
    return;
  }
  portStateDraft.value = updateStatePortDraftDescription(portStateDraft.value, value);
}

function handlePortDraftColorSelect(value: string | number | boolean | undefined) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  updatePortDraftColor(String(value ?? ""));
}

function updatePortDraftColor(color: string) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (!portStateDraft.value) {
    return;
  }
  portStateDraft.value = updateStatePortDraftColor(portStateDraft.value, color);
}

function updatePortDraftValue(value: unknown) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (!portStateDraft.value) {
    return;
  }
  portStateDraft.value = updateStatePortDraftValue(portStateDraft.value, value);
}

function commitPortStateCreate() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (!activePortPickerSide.value || !portStateDraft.value) {
    return;
  }

  const nextKey = portStateDraft.value.key.trim();
  const nextName = portStateDraft.value.definition.name.trim() || nextKey;
  if (!nextKey) {
    portStateError.value = t("nodeCard.stateKeyEmpty");
    return;
  }
  if (props.stateSchema[nextKey]) {
    portStateError.value = t("nodeCard.stateKeyExists", { key: nextKey });
    return;
  }

  emit("create-port-state", {
    nodeId: props.nodeId,
    side: activePortPickerSide.value,
    field: {
      key: nextKey,
      definition: {
        ...portStateDraft.value.definition,
        name: nextName,
      },
    },
  });
  closePortPicker();
}

function noop() {}

function isStateEditorOpen(anchorId: string) {
  return activeStateEditorAnchorId.value === anchorId;
}

function isStateEditorPillRevealed(anchorId: string) {
  return (
    hoveredStateEditorPillAnchorId.value === anchorId ||
    isStateEditorOpen(anchorId) ||
    isStateEditorConfirmOpen(anchorId) ||
    isRemovePortStateConfirmOpen(anchorId)
  );
}

function handleStateEditorPillPointerEnter(anchorId: string) {
  hoveredStateEditorPillAnchorId.value = anchorId;
}

function handleStateEditorPillPointerLeave(anchorId: string) {
  if (hoveredStateEditorPillAnchorId.value === anchorId) {
    hoveredStateEditorPillAnchorId.value = null;
  }
}

function isSkillManagedOutputState(stateKey: string) {
  const binding = props.stateSchema[stateKey]?.binding;
  return (
    props.node.kind === "agent" &&
    binding?.kind === "skill_output" &&
    binding.nodeId === props.nodeId &&
    binding.managed !== false
  );
}

function handleStateEditorActionClick(anchorId: string, stateKey: string | null | undefined) {
  if (!stateKey) {
    return;
  }
  if (isSkillManagedOutputState(stateKey)) {
    return;
  }
  if (guardLockedStateEditAttempt()) {
    return;
  }
  if (isStateEditorOpen(anchorId)) {
    return;
  }
  clearRemovePortStateConfirmState();
  if (activeStateEditorConfirmAnchorId.value === anchorId) {
    clearStateEditorConfirmState();
    openStateEditor(anchorId, stateKey);
    return;
  }
  closeStateEditor();
  startStateEditorConfirmWindow(anchorId);
}

function handleRemovePortStateClick(anchorId: string, side: "input" | "output", stateKey: string | null | undefined) {
  if (!stateKey) {
    return;
  }
  if (side === "output" && isSkillManagedOutputState(stateKey)) {
    return;
  }
  if (guardLockedStateEditAttempt()) {
    return;
  }
  clearStateEditorConfirmState();
  if (activeRemovePortStateConfirmAnchorId.value === anchorId) {
    clearRemovePortStateConfirmState();
    closeStateEditor();
    emit("remove-port-state", {
      nodeId: props.nodeId,
      side,
      stateKey,
    });
    return;
  }
  closeStateEditor();
  startRemovePortStateConfirmWindow(anchorId);
}

function openStateEditor(anchorId: string, stateKey: string | null | undefined) {
  if (!stateKey) {
    return;
  }
  const nextDraft = buildStateEditorDraftFromSchema(stateKey, props.stateSchema);
  if (!nextDraft) {
    return;
  }
  clearTopActionTimeout();
  activeTopAction.value = null;
  clearTextEditorConfirmState();
  clearStateEditorConfirmState();
  clearRemovePortStateConfirmState();
  commitOpenTextEditorIfNeeded();
  activePortPickerSide.value = null;
  activeStateEditorAnchorId.value = anchorId;
  stateEditorDraft.value = nextDraft;
  stateEditorError.value = null;
}

function closeStateEditor() {
  activeStateEditorAnchorId.value = null;
  hoveredStateEditorPillAnchorId.value = null;
  stateEditorDraft.value = null;
  stateEditorError.value = null;
}

function guardLockedStateEditAttempt() {
  return guardLockedGraphInteraction();
}

function syncStateEditorDraft(nextDraft: StateFieldDraft) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  const currentAnchorId = activeStateEditorAnchorId.value;
  const currentDraft = stateEditorDraft.value;
  if (!currentAnchorId || !currentDraft) {
    return;
  }

  stateEditorDraft.value = nextDraft;

  const currentStateKey = resolveStateEditorAnchorStateKey(currentAnchorId);
  if (!currentStateKey) {
    stateEditorError.value = t("nodeCard.stateKeyEmpty");
    return;
  }

  stateEditorError.value = null;

  emit("update-state", {
    stateKey: currentStateKey,
    patch: resolveStateEditorUpdatePatch(nextDraft, currentStateKey),
  });
}

function handleStateEditorNameInput(value: string | number) {
  if (!stateEditorDraft.value || typeof value !== "string") {
    return;
  }
  syncStateEditorDraft(updateStateEditorDraftName(stateEditorDraft.value, value));
}

function handleStateEditorDescriptionInput(value: string | number) {
  if (!stateEditorDraft.value || typeof value !== "string") {
    return;
  }
  syncStateEditorDraft(updateStateEditorDraftDescription(stateEditorDraft.value, value));
}

function handleStateEditorColorInput(value: string | number) {
  if (!stateEditorDraft.value || typeof value !== "string") {
    return;
  }
  syncStateEditorDraft(updateStateEditorDraftColor(stateEditorDraft.value, value));
}

function handleStateEditorTypeValue(value: string | number | boolean | undefined) {
  if (typeof value !== "string" || !stateEditorDraft.value) {
    return;
  }
  syncStateEditorDraft(updateStateEditorDraftType(stateEditorDraft.value, value));
}

function toggleAdvancedPanel() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (!hasAdvancedSettings.value) {
    return;
  }
  clearTopActionConfirmState();
  clearTextEditorConfirmState();
  clearStateEditorConfirmState();
  clearRemovePortStateConfirmState();
  closePortPicker();
  closeStateEditor();
  commitOpenTextEditorIfNeeded();
  activeTopAction.value = activeTopAction.value === "advanced" ? null : "advanced";
}

function closeFloatingPanels(options?: { commitTextEditor?: boolean }) {
  clearTopActionConfirmState();
  clearTextEditorConfirmState();
  clearStateEditorConfirmState();
  clearRemovePortStateConfirmState();
  if (activeTopAction.value === "advanced") {
    activeTopAction.value = null;
  }
  if (activeTextEditor.value) {
    if (options?.commitTextEditor) {
      commitTextEditor(activeTextEditor.value);
    } else {
      closeTextEditor();
    }
  }
  closeStateEditor();
  closePortPicker();
}

function handlePresetActionClick() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  closePortPicker();
  closeStateEditor();
  clearTextEditorConfirmState();
  clearStateEditorConfirmState();
  clearRemovePortStateConfirmState();
  commitOpenTextEditorIfNeeded();
  if (activeTopAction.value === "preset") {
    confirmSavePreset();
    return;
  }
  startTopActionConfirmWindow("preset");
}

function handleDeleteActionClick() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  closePortPicker();
  closeStateEditor();
  clearTextEditorConfirmState();
  clearStateEditorConfirmState();
  clearRemovePortStateConfirmState();
  commitOpenTextEditorIfNeeded();
  if (activeTopAction.value === "delete") {
    confirmDeleteNode();
    return;
  }
  startTopActionConfirmWindow("delete");
}

function handleEditSubgraphActionClick() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "subgraph") {
    return;
  }
  closePortPicker();
  closeStateEditor();
  clearTextEditorConfirmState();
  clearStateEditorConfirmState();
  clearRemovePortStateConfirmState();
  commitOpenTextEditorIfNeeded();
  if (activeTopAction.value === "edit-subgraph") {
    confirmOpenSubgraphEditor();
    return;
  }
  startTopActionConfirmWindow("edit-subgraph");
}

function handleNodeCardClickCapture(event: Event) {
  if (activeTopAction.value !== "delete" && activeTopAction.value !== "preset" && activeTopAction.value !== "edit-subgraph") {
    return;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  if (target.closest("[data-top-action-surface='true']")) {
    return;
  }
  clearTopActionConfirmState();
}

function handleHumanReviewActionClick() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  emit("open-human-review", { nodeId: props.nodeId });
}

function confirmDeleteNode() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  clearTopActionConfirmState();
  emit("delete-node", { nodeId: props.nodeId });
}

function confirmOpenSubgraphEditor() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "subgraph") {
    return;
  }
  clearTopActionConfirmState();
  emit("open-subgraph-editor", { nodeId: props.nodeId });
}

function confirmSavePreset() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  clearTopActionConfirmState();
  emit("save-node-preset", { nodeId: props.nodeId });
}

function handleAgentModelValueChange(nextValue: string | number | boolean | undefined) {
  if (typeof nextValue !== "string") {
    return;
  }
  const normalizedValue = nextValue.trim();
  if (!normalizedValue) {
    return;
  }
  emitAgentConfigPatch(resolveAgentModelSelection(normalizedValue));
  collapseAgentModelSelect();
}

function handleAgentModelSelectVisibleChange(visible: boolean) {
  if (visible) {
    emit("refresh-agent-models");
  }
}

function collapseAgentModelSelect() {
  agentNodeBodyRef.value?.collapseModelSelect?.();
}

function handleAgentThinkingModeSelect(nextValue: string | number | boolean | undefined) {
  if (typeof nextValue !== "string") {
    return;
  }
  updateAgentThinkingMode(normalizeAgentThinkingMode(nextValue));
}

function updateAgentThinkingMode(thinkingMode: AgentNode["config"]["thinkingMode"]) {
  emitAgentConfigPatch({ thinkingMode });
}

function handleAgentBreakpointToggleValue(value: string | number | boolean) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "agent" || typeof value !== "boolean") {
    return;
  }
  emit("toggle-agent-breakpoint", { nodeId: props.nodeId, enabled: value });
}

function handleAgentBreakpointTimingSelect(nextValue: string | number | boolean | undefined) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (nextValue !== "before" && nextValue !== "after") {
    return;
  }
  emit("update-agent-breakpoint-timing", { nodeId: props.nodeId, timing: nextValue });
}

function handleAgentTemperatureInputValue(value: string | number) {
  const nextValue = resolveAgentTemperatureInputValue(value);
  if (nextValue === null) {
    return;
  }
  emitAgentConfigPatch({ temperature: nextValue });
}

function handleInputValueInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) {
    return;
  }
  emitInputValuePatch(target.value);
}

function handleInputKnowledgeBaseSelect(value: string | number | boolean | undefined) {
  emitInputValuePatch(typeof value === "string" ? value : "");
}

function handleInputBoundarySelection(nextType: string | number | boolean) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (typeof nextType !== "string" || !isSwitchableInputBoundaryType(nextType)) {
    return;
  }
  updateInputBoundaryType(nextType);
}

function updateInputBoundaryType(nextType: "text" | "file" | "knowledge_base") {
  if (guardLockedGraphInteraction()) {
    return;
  }
  const stateKey = inputStateKey.value;
  if (!isSwitchableInputBoundaryType(nextType)) {
    return;
  }
  if (inputStateType.value === nextType) {
    return;
  }

  const nextStateType = resolveStateTypeForInputBoundary(nextType) as StateFieldType;
  const nextValue = resolveNextInputValueForBoundaryType({
    nextType,
    currentType: inputStateType.value,
    currentValue: inputStateValue.value,
    knowledgeBaseNames: props.knowledgeBases.map((knowledgeBase) => knowledgeBase.name),
  });
  if (stateKey) {
    emitInputStatePatch(stateKey, {
      type: nextStateType,
      value: nextValue ?? defaultValueForStateType(nextStateType),
    });
  }
  emitInputConfigPatch({ boundaryType: nextType, value: nextValue });
}

function clearInputAsset() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (!inputStateKey.value) {
    emitInputConfigPatch({ boundaryType: "file", value: "" });
    return;
  }
  emitInputValuePatch("");
}

async function commitInputAssetFile(file: File | null) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  const stateKey = inputStateKey.value;
  if (!file) {
    return;
  }

  try {
    const envelope = await createUploadedAssetEnvelope(file, uploadSkillArtifactFile);
    const nextStateType = resolveStateTypeForInputBoundary(envelope.detectedType) as StateFieldType;
    if (stateKey) {
      emitInputStatePatch(stateKey, {
        type: nextStateType,
        value: defaultValueForStateType(nextStateType),
      });
      emitInputValuePatch(envelope.localPath);
      return;
    }
    emitInputConfigPatch({
      boundaryType: envelope.detectedType,
      value: envelope.localPath,
    });
  } catch (error) {
    console.error("Failed to read uploaded asset", error);
  }
}

function handleInputAssetFileChange(event: Event) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const file = target.files?.[0] ?? null;
  void commitInputAssetFile(file);
  target.value = "";
}

function handleInputAssetDrop(event: DragEvent) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  const file = event.dataTransfer?.files?.[0] ?? null;
  void commitInputAssetFile(file);
}

function updateConditionRule(patch: Partial<ConditionNode["config"]["rule"]>) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "condition") {
    return;
  }
  emitConditionConfigPatch({
    rule: {
      ...props.node.config.rule,
      ...patch,
    },
  });
}

function handleConditionRuleOperatorSelect(value: string | number | boolean | undefined) {
  updateConditionRule(resolveConditionRuleOperatorPatch(value));
}

function handleConditionLoopLimitValue(value: number | undefined) {
  if (props.node.kind !== "condition") {
    return;
  }
  const result = resolveConditionLoopLimitPatch(String(value ?? ""), props.node.config.loopLimit);
  if (result.kind === "patch") {
    emitConditionConfigPatch(result.patch);
  }
}

function handleConditionRuleValueInput(event: Event) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  conditionRuleValueDraft.value = target.value;
}

function commitConditionRuleValue() {
  if (props.node.kind !== "condition") {
    return;
  }
  const patch = resolveConditionRuleValuePatch(conditionRuleValueDraft.value, props.node.config.rule.value);
  if (!patch) {
    return;
  }
  updateConditionRule(patch);
}

function handleConditionRuleValueEnter(event: KeyboardEvent) {
  const target = event.currentTarget;
  if (target instanceof HTMLInputElement) {
    target.blur();
  }
}

</script>

<style scoped>
.node-card {
  --node-card-inline-padding: 24px;
  --node-card-kind-rgb: 154, 52, 18;
  position: relative;
  width: var(--node-card-width, 460px);
  min-height: var(--node-card-min-height, 260px);
  border: 1px solid rgba(var(--node-card-kind-rgb), 0.2);
  border-radius: var(--node-card-radius, 28px);
  overflow: visible;
  background: var(--graphite-surface-card);
  box-shadow: 0 22px 40px rgba(60, 41, 20, 0.08);
  user-select: none;
  display: flex;
  flex-direction: column;
}

.node-card::before {
  content: "";
  position: absolute;
  left: 14px;
  top: 24px;
  width: 7px;
  height: 104px;
  border-radius: 999px;
  background: rgba(var(--node-card-kind-rgb), 0.72);
  opacity: 0.78;
  pointer-events: none;
}

.node-card--input {
  --node-card-kind-rgb: 8, 145, 178;
}

.node-card--agent {
  --node-card-kind-rgb: 37, 99, 235;
}

.node-card--condition {
  --node-card-kind-rgb: 217, 119, 6;
  width: var(--node-card-width, 560px);
}

.node-card--output {
  --node-card-kind-rgb: 79, 70, 229;
}

.node-card--subgraph {
  --node-card-kind-rgb: 13, 148, 136;
  width: var(--node-card-width, 820px);
}

.node-card--selected {
  border-color: rgba(var(--node-card-kind-rgb), 0.38);
  box-shadow:
    0 22px 40px rgba(60, 41, 20, 0.1),
    0 0 0 2px rgba(var(--node-card-kind-rgb), 0.08);
}

.node-card__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px var(--node-card-inline-padding) 8px var(--node-card-inline-padding);
}

.node-card__eyebrow {
  border: 1px solid rgba(var(--node-card-kind-rgb), 0.18);
  border-radius: 999px;
  padding: 4px 14px;
  font-family: var(--graphite-font-mono);
  font-size: 0.86rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(var(--node-card-kind-rgb), 0.84);
  background: rgba(255, 255, 255, 0.78);
}

.node-card__text-trigger {
  position: relative;
  display: inline-flex;
  max-width: 100%;
  border: 1px solid transparent;
  border-radius: 18px;
  background: transparent;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    box-shadow 140ms ease;
}

.node-card__text-trigger:hover,
.node-card__text-trigger:focus-visible {
  border-color: rgba(var(--node-card-kind-rgb), 0.14);
  background: rgba(255, 250, 241, 0.94);
  box-shadow: 0 10px 22px rgba(60, 41, 20, 0.08);
}

.node-card__text-trigger--confirm,
.node-card__text-trigger--confirm:hover,
.node-card__text-trigger--confirm:focus-visible {
  border-color: rgba(201, 107, 31, 0.34);
  background: rgba(201, 107, 31, 0.96);
  box-shadow: none;
  color: #fff7ed;
}

.node-card__text-trigger--title {
  padding: 6px 12px;
}

.node-card__text-trigger--description {
  display: block;
  margin: 0 var(--node-card-inline-padding) 20px;
  padding: 8px 12px;
}

.node-card__text-trigger-content {
  position: relative;
  display: block;
}

.node-card__text-trigger-content--confirm {
  color: inherit;
}

.node-card__text-trigger-content--confirm > .node-card__title,
.node-card__text-trigger-content--confirm > .node-card__description {
  opacity: 0;
}

.node-card__text-trigger-confirm-icon {
  position: absolute;
  left: 50%;
  top: 50%;
  font-size: 1.12rem;
  opacity: 0;
  transform: translate(-50%, -50%);
  transition: opacity 140ms ease;
  pointer-events: none;
}

.node-card__text-trigger-content--confirm > .node-card__text-trigger-confirm-icon {
  opacity: 1;
}

.node-card__title {
  margin: 0;
  font-family: var(--graphite-font-display);
  font-size: 1.72rem;
  line-height: 1.15;
  color: #1f2937;
  cursor: inherit;
  transition: opacity 140ms ease;
}

.node-card__description {
  margin: 0;
  font-size: 0.98rem;
  line-height: 1.55;
  color: rgba(60, 41, 20, 0.74);
  cursor: inherit;
  transition: opacity 140ms ease;
}

.node-card__text-editor {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 16px;
  background: rgba(255, 244, 232, 0.96);
  box-shadow: 0 16px 34px rgba(60, 41, 20, 0.12);
}

.node-card__text-editor-title {
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.8);
}

.node-card__text-editor :deep(.el-input__wrapper),
.node-card__text-editor :deep(.el-textarea__inner) {
  background: rgba(255, 252, 246, 0.98);
  border-color: rgba(154, 52, 18, 0.16);
  box-shadow: inset 0 0 0 1px rgba(154, 52, 18, 0.08);
}

.node-card__text-editor :deep(.el-input__wrapper.is-focus),
.node-card__text-editor :deep(.el-textarea__inner:focus) {
  box-shadow:
    inset 0 0 0 1px rgba(217, 119, 6, 0.28),
    0 0 0 3px rgba(245, 158, 11, 0.12);
}

:deep(.node-card__text-editor-popper.el-popper) {
  border: none;
  background: transparent;
  padding: 0;
  box-shadow: none;
}

.node-card__body {
  border-top: 1px solid rgba(var(--node-card-kind-rgb), 0.14);
  padding: 18px var(--node-card-inline-padding) 24px;
  display: grid;
  gap: 14px;
  flex: 1 1 auto;
  min-height: 0;
}

.node-card__body--input,
.node-card__body--agent,
.node-card__body--output,
.node-card__body--subgraph {
  display: flex;
  flex-direction: column;
}

:deep(.node-card__agent-add-popover-popper.el-popper) {
  border-radius: 16px;
  background: transparent;
  padding: 0;
  border: 0;
  box-shadow: none;
}

.node-card__confirm-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  white-space: nowrap;
  border-radius: 999px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  padding: 6px 14px;
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  box-shadow: 0 14px 32px rgba(60, 41, 20, 0.14);
}

.node-card__confirm-hint--text {
  border-color: rgba(201, 107, 31, 0.24);
  background: rgb(255, 247, 237);
  color: rgb(154, 52, 18);
}

:deep(.node-card__state-editor-popper.el-popper) {
  border: none;
  border-radius: 16px;
  padding: 0;
  background: transparent;
  box-shadow: none;
}

:deep(.node-card__state-editor-popper .el-popover) {
  padding: 0;
  border-radius: 16px;
  background: transparent;
  box-shadow: none;
}

.node-card__runtime-note {
  margin-top: 0.85rem;
  border-radius: 14px;
  padding: 0.8rem 0.9rem;
  border: 1px solid rgba(239, 68, 68, 0.22);
  background: linear-gradient(180deg, rgba(255, 245, 245, 0.98), rgba(254, 242, 242, 0.94));
}

.node-card__runtime-note--danger {
  color: #991b1b;
}

.node-card__runtime-note-label {
  display: inline-flex;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(153, 27, 27, 0.72);
}

.node-card__runtime-note-text {
  margin-top: 0.35rem;
  white-space: pre-wrap;
  line-height: 1.55;
}

</style>
