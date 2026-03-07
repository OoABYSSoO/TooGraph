<template>
  <article
    v-bind="$attrs"
    class="node-card"
    :class="{
      'node-card--selected': selected,
      'node-card--hovered': hovered,
      'node-card--condition': view.body.kind === 'condition',
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
          <div v-if="view.body.primaryOutput" class="node-card__port-pill-row node-card__port-pill-row--right">
            <ElPopover
              :visible="
                view.body.primaryOutput.virtual
                  ? isPortCreateOpen('output')
                  : isStateEditorOpen(`input-primary-output:${view.body.primaryOutput.key}`) ||
                    isStateEditorConfirmOpen(`input-primary-output:${view.body.primaryOutput.key}`) ||
                    isRemovePortStateConfirmOpen(`input-primary-output:${view.body.primaryOutput.key}`)
              "
              :placement="view.body.primaryOutput.virtual || isStateEditorOpen(`input-primary-output:${view.body.primaryOutput.key}`) ? 'bottom-end' : 'top-end'"
              :width="view.body.primaryOutput.virtual ? 376 : isStateEditorOpen(`input-primary-output:${view.body.primaryOutput.key}`) ? 320 : undefined"
              :show-arrow="false"
              :popper-style="view.body.primaryOutput.virtual ? agentAddPopoverStyle : stateEditorPopoverStyle"
              :popper-class="view.body.primaryOutput.virtual ? 'node-card__agent-add-popover-popper' : 'node-card__state-editor-popper'"
            >
              <template #reference>
                <span
                  class="node-card__port-pill node-card__port-pill--output node-card__port-pill--dock-end"
                  :class="{
                    'node-card__port-pill--create': view.body.primaryOutput.virtual,
                    'node-card__port-pill--revealed': !view.body.primaryOutput.virtual && isStateEditorPillRevealed(`input-primary-output:${view.body.primaryOutput.key}`),
                    'node-card__port-pill--confirm': !view.body.primaryOutput.virtual && isStateEditorConfirmOpen(`input-primary-output:${view.body.primaryOutput.key}`),
                  }"
                  :style="{
                    '--node-card-port-accent': view.body.primaryOutput.virtual ? (pendingStateOutputTarget?.stateColor ?? view.body.primaryOutput.stateColor) : view.body.primaryOutput.stateColor,
                  }"
                  data-state-editor-trigger="true"
                  data-anchor-hitarea="true"
                  @pointerenter="handleStateEditorPillPointerEnter(`input-primary-output:${view.body.primaryOutput.key}`)"
                  @pointerleave="handleStateEditorPillPointerLeave(`input-primary-output:${view.body.primaryOutput.key}`)"
                  @pointerdown.stop
                  @click.stop="view.body.primaryOutput.virtual ? openPortStateCreate('output') : handleStateEditorActionClick(`input-primary-output:${view.body.primaryOutput.key}`, view.body.primaryOutput.key)"
                >
                  <span
                    class="node-card__port-pill-label"
                    :class="{ 'node-card__port-pill-label--confirm': isStateEditorConfirmOpen(`input-primary-output:${view.body.primaryOutput.key}`) }"
                  >
                    <span class="node-card__port-pill-label-text">
                      {{ view.body.primaryOutput.virtual ? (pendingStateOutputTarget?.label ?? view.body.primaryOutput.label) : view.body.primaryOutput.label }}
                    </span>
                    <ElIcon class="node-card__port-pill-confirm-icon"><Check /></ElIcon>
                  </span>
                  <span
                    class="node-card__port-pill-anchor-slot"
                    :data-anchor-slot-id="`${nodeId}:state-out:${view.body.primaryOutput.key}`"
                    aria-hidden="true"
                  />
                </span>
              </template>
              <StatePortCreatePopover
                v-if="view.body.primaryOutput.virtual && isPortCreateOpen('output') && portStateDraft"
                :draft="portStateDraft"
                :title="portPickerTitle"
                :error="portStateError"
                :hint="t('nodeCard.createStateBindHint')"
                :type-options="stateTypeOptions"
                @update:name="handlePortDraftNameValue"
                @update:type="handlePortDraftTypeSelect"
                @update:color="handlePortDraftColorSelect"
                @update:description="handlePortDraftDescriptionValue"
                @update:value="updatePortDraftValue"
                @cancel="closePortPicker"
                @create="commitPortStateCreate"
              />
              <div
                v-else-if="isRemovePortStateConfirmOpen(`input-primary-output:${view.body.primaryOutput.key}`)"
                class="node-card__confirm-hint node-card__confirm-hint--remove"
              >
                {{ t("nodeCard.removeStateQuestion") }}
              </div>
              <div
                v-else-if="isStateEditorConfirmOpen(`input-primary-output:${view.body.primaryOutput.key}`)"
                class="node-card__confirm-hint node-card__confirm-hint--state"
              >
                {{ t("nodeCard.editStateQuestion") }}
              </div>
              <StateEditorPopover
                v-else-if="stateEditorDraft"
                class="node-card__state-editor"
                :draft="stateEditorDraft"
                :error="stateEditorError"
                :type-options="stateTypeOptions"
                :color-options="stateColorOptions"
                @update:name="handleStateEditorNameInput"
                @update:type="handleStateEditorTypeValue"
                @update:color="handleStateEditorColorInput"
                @update:description="handleStateEditorDescriptionInput"
              />
            </ElPopover>
          </div>
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
        :skill-picker-open="isSkillPickerOpen"
        :show-skill-picker-trigger="showSkillPickerTrigger"
        :skill-definitions-loading="skillDefinitionsLoading"
        :skill-definitions-error="skillDefinitionsError"
        :available-skill-definitions="availableSkillDefinitions"
        :attached-skill-badges="attachedSkillBadges"
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
        @toggle-skill-picker="toggleSkillPicker"
        @attach-skill="attachAgentSkill"
        @remove-skill="removeAgentSkill"
        @task-input="handleAgentTaskInstructionInput"
      />
    </section>

    <section v-else-if="view.body.kind === 'output'" class="node-card__body node-card__body--output">
      <OutputNodeBody
        :body="view.body"
        :output-preview-content="outputPreviewContent"
        @update:persist-enabled="handleOutputPersistToggle"
      >
        <template #primary-input>
          <ElPopover
            v-if="view.body.primaryInput"
            :visible="
              view.body.primaryInput.virtual
                ? isPortCreateOpen('input')
                : isStateEditorOpen(`output-input:${view.body.primaryInput.key}`) || isStateEditorConfirmOpen(`output-input:${view.body.primaryInput.key}`)
            "
            :placement="view.body.primaryInput.virtual || isStateEditorOpen(`output-input:${view.body.primaryInput.key}`) ? 'bottom-start' : 'top-start'"
            :width="view.body.primaryInput.virtual ? 376 : isStateEditorOpen(`output-input:${view.body.primaryInput.key}`) ? 320 : undefined"
            :show-arrow="false"
            :popper-style="view.body.primaryInput.virtual ? agentAddPopoverStyle : stateEditorPopoverStyle"
            :popper-class="view.body.primaryInput.virtual ? 'node-card__agent-add-popover-popper' : 'node-card__state-editor-popper'"
          >
            <template #reference>
              <span
                class="node-card__port-pill node-card__port-pill--input node-card__port-pill--dock-start"
                :class="{
                  'node-card__port-pill--create': view.body.primaryInput.virtual,
                  'node-card__port-pill--revealed': !view.body.primaryInput.virtual && isStateEditorPillRevealed(`output-input:${view.body.primaryInput.key}`),
                  'node-card__port-pill--confirm': !view.body.primaryInput.virtual && isStateEditorConfirmOpen(`output-input:${view.body.primaryInput.key}`),
                }"
                :style="{ '--node-card-port-accent': view.body.primaryInput.stateColor }"
                data-state-editor-trigger="true"
                data-anchor-hitarea="true"
                @pointerenter="handleStateEditorPillPointerEnter(`output-input:${view.body.primaryInput.key}`)"
                @pointerleave="handleStateEditorPillPointerLeave(`output-input:${view.body.primaryInput.key}`)"
                @pointerdown.stop
                @click.stop="view.body.primaryInput.virtual ? openPortStateCreate('input') : handleStateEditorActionClick(`output-input:${view.body.primaryInput.key}`, view.body.primaryInput.key)"
              >
                <span
                  class="node-card__port-pill-anchor-slot node-card__port-pill-anchor-slot--leading"
                  :data-anchor-slot-id="`${nodeId}:state-in:${view.body.primaryInput.key}`"
                  aria-hidden="true"
                />
                <span
                  class="node-card__port-pill-label"
                  :class="{ 'node-card__port-pill-label--confirm': isStateEditorConfirmOpen(`output-input:${view.body.primaryInput.key}`) }"
                >
                  <span class="node-card__port-pill-label-text">{{ view.body.primaryInput.label }}</span>
                  <ElIcon class="node-card__port-pill-confirm-icon"><Check /></ElIcon>
                </span>
              </span>
            </template>
            <StatePortCreatePopover
              v-if="view.body.primaryInput.virtual && isPortCreateOpen('input') && portStateDraft"
              :draft="portStateDraft"
              :title="portPickerTitle"
              :error="portStateError"
              :hint="t('nodeCard.createStateBindHint')"
              :type-options="stateTypeOptions"
              @update:name="handlePortDraftNameValue"
              @update:type="handlePortDraftTypeSelect"
              @update:color="handlePortDraftColorSelect"
              @update:description="handlePortDraftDescriptionValue"
              @update:value="updatePortDraftValue"
              @cancel="closePortPicker"
              @create="commitPortStateCreate"
            />
            <div v-else-if="isStateEditorConfirmOpen(`output-input:${view.body.primaryInput.key}`)" class="node-card__confirm-hint node-card__confirm-hint--state">{{ t("nodeCard.editStateQuestion") }}</div>
            <StateEditorPopover
              v-else-if="stateEditorDraft"
              class="node-card__state-editor"
              :draft="stateEditorDraft"
              :error="stateEditorError"
              :type-options="stateTypeOptions"
              :color-options="stateColorOptions"
              @update:name="handleStateEditorNameInput"
              @update:type="handleStateEditorTypeValue"
              @update:color="handleStateEditorColorInput"
              @update:description="handleStateEditorDescriptionInput"
            />
          </ElPopover>
          <span v-else class="node-card__port-label">{{ t("nodeCard.unbound") }}</span>
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
        :condition-loop-limit-draft="conditionLoopLimitDraft"
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
        @rule-value-input="handleConditionRuleValueInput"
        @commit-rule-value="commitConditionRuleValue"
        @rule-value-enter="handleConditionRuleValueEnter"
        @loop-limit-input="handleConditionLoopLimitInput"
        @commit-loop-limit="commitConditionLoopLimit"
        @loop-limit-enter="handleConditionLoopLimitEnter"
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
  <Teleport to="body">
    <span
      v-if="portReorderFloatingPort"
      class="node-card__port-pill node-card__port-pill--floating node-card__port-pill--removable"
      :class="{
        'node-card__port-pill--input': portReorderFloatingPort.side === 'input',
        'node-card__port-pill--output': portReorderFloatingPort.side === 'output',
      }"
      :style="portReorderFloatingStyle"
      aria-hidden="true"
    >
      <span
        v-if="portReorderFloatingPort.side === 'input'"
        class="node-card__port-pill-anchor-slot node-card__port-pill-anchor-slot--leading"
      />
      <span class="node-card__port-pill-label">
        <span class="node-card__port-pill-label-text">{{ portReorderFloatingPort.port.label }}</span>
      </span>
      <span
        v-if="portReorderFloatingPort.side === 'output'"
        class="node-card__port-pill-anchor-slot"
      />
    </span>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ElIcon, ElInput, ElPopover } from "element-plus";
import { Check, Collection, Document, FolderOpened } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

import AgentNodeBody from "./AgentNodeBody.vue";
import ConditionNodeBody from "./ConditionNodeBody.vue";
import InputNodeBody from "./InputNodeBody.vue";
import NodeCardTopActions from "./NodeCardTopActions.vue";
import OutputNodeBody from "./OutputNodeBody.vue";
import StateEditorPopover from "./StateEditorPopover.vue";
import StatePortCreatePopover from "./StatePortCreatePopover.vue";
import type { KnowledgeBaseRecord } from "@/types/knowledge";
import type { AgentNode, ConditionNode, GraphNode, InputNode, OutputNode, StateDefinition } from "@/types/node-system";
import type { SkillDefinition } from "@/types/skills";
import { CREATE_AGENT_INPUT_STATE_KEY, VIRTUAL_ANY_INPUT_STATE_KEY, VIRTUAL_ANY_OUTPUT_COLOR, VIRTUAL_ANY_OUTPUT_STATE_KEY } from "@/lib/virtual-any-input";

import {
  DEFAULT_AGENT_TEMPERATURE,
  buildAgentModelSelectOptions,
  normalizeAgentThinkingMode,
  normalizeAgentTemperature,
  resolveAgentTemperatureInputValue,
  resolveAgentModelSelection,
  type AgentThinkingControlMode,
} from "./agentConfigModel";
import {
  resolveConditionLoopLimitDraft,
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
import { isSwitchableInputBoundaryType, resolveNextInputValueForBoundaryType, resolveStateTypeForInputBoundary } from "./inputValueTypeModel";
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
  listAttachableSkillDefinitions,
  resolveAttachAgentSkillPatch,
  resolveAttachedSkillBadges,
  resolveRemoveAgentSkillPatch,
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
    runtime: {
      latestRunStatus: props.latestRunStatus ?? null,
      outputPreviewText: props.runOutputPreviewText ?? null,
      outputDisplayMode: props.runOutputDisplayMode ?? null,
      failedMessage: props.runFailureMessage ?? null,
    },
  }),
);
const agentInputPorts = computed<NodePortViewModel[]>(() =>
  view.value.body.kind === "agent" ? view.value.inputs.filter((port) => !port.virtual) : [],
);
const agentOutputPorts = computed<NodePortViewModel[]>(() =>
  view.value.body.kind === "agent" ? view.value.outputs.filter((port) => !port.virtual) : [],
);
const shouldShowAgentCreateInputPort = computed(() => agentInputPorts.value.length === 0);
const shouldShowAgentCreateOutputPort = computed(() => agentOutputPorts.value.length === 0);
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
const conditionLoopLimitDraft = ref("");
const isSkillPickerOpen = ref(false);
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
    isSkillPickerOpen.value = false;
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
const inputAssetEnvelope = computed(() => (props.node.kind === "input" ? tryParseUploadedAssetEnvelope(inputStateValue.value) : null));
const inputAssetAccept = computed(() => resolveUploadedAssetInputAccept(inputAssetType.value));
const inputStateKey = computed(() =>
  view.value.body.kind === "input" && !view.value.body.primaryOutput?.virtual ? view.value.body.primaryOutput?.key ?? null : null,
);
const inputStateType = computed(() => {
  const stateKey = inputStateKey.value;
  return stateKey ? String(props.stateSchema[stateKey]?.type ?? "text") : "text";
});
const inputBoundarySelection = computed<"text" | "file" | "knowledge_base">(() => {
  if (showKnowledgeBaseInput.value) {
    return "knowledge_base";
  }
  if (showAssetUploadInput.value) {
    return "file";
  }
  return "text";
});
const inputAssetLabel = computed(() => resolveUploadedAssetLabel(inputAssetType.value));
const inputAssetSummary = computed(() => resolveUploadedAssetSummary(inputAssetEnvelope.value));
const inputAssetTextPreview = computed(() => resolveUploadedAssetTextPreview(inputAssetEnvelope.value));
const inputAssetDescription = computed(() => resolveUploadedAssetDescription(inputAssetEnvelope.value, inputAssetType.value));
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
    return trimmedGlobalTextModelRef.value;
  }
  const overrideModel = props.node.config.model.trim();
  return props.node.config.modelSource === "override" && overrideModel ? overrideModel : trimmedGlobalTextModelRef.value;
});
const agentThinkingModeValue = computed<AgentThinkingControlMode>(() =>
  props.node.kind === "agent" ? normalizeAgentThinkingMode(props.node.config.thinkingMode) : "off",
);
const agentThinkingEnabled = computed(() => props.node.kind === "agent" ? agentThinkingModeValue.value !== "off" : true);
const agentBreakpointTimingValue = computed(() => props.agentBreakpointTiming ?? "after");
const agentModelOptions = computed(() =>
  buildAgentModelSelectOptions(agentResolvedModelValue.value, props.availableAgentModelRefs, props.agentModelDisplayLookup),
);
const attachedSkillBadges = computed(() =>
  props.node.kind === "agent" ? resolveAttachedSkillBadges(props.node.config.skills, props.skillDefinitions) : [],
);
const availableSkillDefinitions = computed(() =>
  props.node.kind === "agent" ? listAttachableSkillDefinitions(props.skillDefinitions, props.node.config.skills) : [],
);
const showSkillPickerTrigger = computed(
  () => availableSkillDefinitions.value.length > 0 || props.skillDefinitionsLoading || Boolean(props.skillDefinitionsError),
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
const agentTemperatureInput = computed(() => {
  if (props.node.kind !== "agent") {
    return String(DEFAULT_AGENT_TEMPERATURE);
  }
  return String(normalizeAgentTemperature(props.node.config.temperature));
});
const hasAdvancedSettings = computed(() => props.node.kind === "agent" || props.node.kind === "output");
const canSavePreset = computed(() => props.node.kind === "agent");
const isTopActionVisible = computed(() => props.humanReviewPending || props.selected || activeTopAction.value !== null);
const hasFloatingPanelOpen = computed(
  () =>
    activeTopAction.value !== null ||
    activeTextEditorConfirmField.value !== null ||
    activeTextEditor.value !== null ||
    activeStateEditorConfirmAnchorId.value !== null ||
    activeRemovePortStateConfirmAnchorId.value !== null ||
    activeStateEditorAnchorId.value !== null ||
    activePortPickerSide.value !== null ||
    isSkillPickerOpen.value,
);
const shouldRevealAgentCreateInputPort = computed(() => shouldShowAgentCreateInputPort.value || props.selected || Boolean(props.hovered) || hasFloatingPanelOpen.value);
const shouldRevealAgentCreateOutputPort = computed(() => shouldShowAgentCreateOutputPort.value || props.selected || Boolean(props.hovered) || hasFloatingPanelOpen.value);

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
  () => (props.node.kind === "condition" ? props.node.config.loopLimit : null),
  (loopLimit) => {
    conditionLoopLimitDraft.value = resolveConditionLoopLimitDraft(loopLimit);
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
  isSkillPickerOpen.value = false;
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

function toggleSkillPicker() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (!showSkillPickerTrigger.value) {
    return;
  }
  clearTopActionTimeout();
  activeTopAction.value = null;
  clearTextEditorConfirmState();
  clearStateEditorConfirmState();
  clearRemovePortStateConfirmState();
  commitOpenTextEditorIfNeeded();
  closeStateEditor();
  activePortPickerSide.value = null;
  portStateDraft.value = null;
  portStateError.value = null;
  isSkillPickerOpen.value = !isSkillPickerOpen.value;
}

function attachAgentSkill(skillKey: string) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "agent") {
    return;
  }
  const patch = resolveAttachAgentSkillPatch(props.node.config.skills, skillKey);
  if (!patch) {
    return;
  }
  emitAgentConfigPatch(patch);
  isSkillPickerOpen.value = false;
}

function removeAgentSkill(skillKey: string) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "agent") {
    return;
  }
  const patch = resolveRemoveAgentSkillPatch(props.node.config.skills, skillKey);
  if (!patch) {
    return;
  }
  emitAgentConfigPatch(patch);
}

function openPortStateCreate(side: "input" | "output") {
  if (guardLockedGraphInteraction()) {
    return;
  }
  clearTopActionTimeout();
  activeTopAction.value = null;
  clearTextEditorConfirmState();
  clearStateEditorConfirmState();
  clearRemovePortStateConfirmState();
  commitOpenTextEditorIfNeeded();
  closeStateEditor();
  isSkillPickerOpen.value = false;
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

function handleStateEditorActionClick(anchorId: string, stateKey: string | null | undefined) {
  if (!stateKey) {
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
  isSkillPickerOpen.value = false;
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
  isSkillPickerOpen.value = false;
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
  isSkillPickerOpen.value = false;
}

function handlePresetActionClick() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  isSkillPickerOpen.value = false;
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
  isSkillPickerOpen.value = false;
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

function handleNodeCardClickCapture(event: Event) {
  if (activeTopAction.value !== "delete" && activeTopAction.value !== "preset") {
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
  emitAgentConfigPatch(resolveAgentModelSelection(normalizedValue, trimmedGlobalTextModelRef.value));
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
  if (!stateKey || !isSwitchableInputBoundaryType(nextType)) {
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
  emitInputStatePatch(stateKey, {
    type: nextStateType,
    value: nextValue ?? defaultValueForStateType(nextStateType),
  });
  emitInputConfigPatch({ value: nextValue });
}

function clearInputAsset() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  emitInputValuePatch("");
}

async function commitInputAssetFile(file: File | null) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  const stateKey = inputStateKey.value;
  if (!file || !stateKey) {
    return;
  }

  try {
    const envelope = await createUploadedAssetEnvelope(file);
    emitInputStatePatch(stateKey, {
      type: resolveStateTypeForInputBoundary(envelope.detectedType),
      value: defaultValueForStateType(resolveStateTypeForInputBoundary(envelope.detectedType) as StateFieldType),
    });
    emitInputValuePatch(JSON.stringify(envelope));
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

function handleConditionLoopLimitInput(event: Event) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  conditionLoopLimitDraft.value = target.value;
}

function commitConditionLoopLimit() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "condition") {
    return;
  }

  const result = resolveConditionLoopLimitPatch(conditionLoopLimitDraft.value, props.node.config.loopLimit);
  if (result.kind === "reset") {
    conditionLoopLimitDraft.value = result.draftValue;
    return;
  }
  if (result.kind === "noop") {
    return;
  }

  emitConditionConfigPatch(result.patch);
}

function handleConditionLoopLimitEnter(event: KeyboardEvent) {
  const target = event.currentTarget;
  if (target instanceof HTMLInputElement) {
    target.blur();
  }
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
  position: relative;
  width: var(--node-card-width, 460px);
  min-height: var(--node-card-min-height, 260px);
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: var(--node-card-radius, 28px);
  overflow: visible;
  background: var(--graphite-surface-card);
  box-shadow: 0 22px 40px rgba(60, 41, 20, 0.08);
  user-select: none;
  display: flex;
  flex-direction: column;
}

.node-card--condition {
  width: var(--node-card-width, 560px);
}

.node-card--selected {
  border-color: rgba(154, 52, 18, 0.32);
  box-shadow: 0 22px 40px rgba(154, 52, 18, 0.14);
}

.node-card__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px var(--node-card-inline-padding) 8px var(--node-card-inline-padding);
}

.node-card__eyebrow {
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 999px;
  padding: 4px 14px;
  font-family: var(--graphite-font-mono);
  font-size: 0.86rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.84);
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
  border-color: rgba(154, 52, 18, 0.14);
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

.node-card__state-summary {
  display: grid;
  gap: 10px;
  padding: 0 24px 18px;
}

.node-card__state-group {
  display: grid;
  gap: 8px;
}

.node-card__state-group-label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.72);
}

.node-card__state-token-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.node-card__state-token {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  border-radius: 999px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  padding: 0 10px;
  font-size: 0.82rem;
  color: rgba(60, 41, 20, 0.82);
  background: rgba(255, 250, 241, 0.92);
}

.node-card__state-token--read {
  border-color: rgba(37, 99, 235, 0.18);
  color: rgba(37, 99, 235, 0.9);
  background: rgba(239, 246, 255, 0.9);
}

.node-card__state-token--write {
  border-color: rgba(217, 119, 6, 0.18);
  color: rgba(217, 119, 6, 0.92);
  background: rgba(255, 247, 237, 0.94);
}

.node-card__body {
  border-top: 1px solid rgba(154, 52, 18, 0.14);
  padding: 18px var(--node-card-inline-padding) 24px;
  display: grid;
  gap: 14px;
  flex: 1 1 auto;
  min-height: 0;
}

.node-card__body--input,
.node-card__body--agent,
.node-card__body--output {
  display: flex;
  flex-direction: column;
}

.node-card__port-row,
.node-card__port-grid {
  display: grid;
  align-items: center;
}

.node-card__port-row--single {
  grid-template-columns: minmax(0, 1fr) auto;
}

.node-card__port-row--input-boundary {
  gap: 16px;
}

.node-card__port-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}

.node-card__port-column {
  display: grid;
  gap: 6px;
}

.node-card__port-column--right {
  text-align: right;
}

.node-card__port-reorder-stack {
  display: grid;
}

.node-card__port-reorder-stack--right {
  justify-items: end;
}

.node-card-port-reorder-move {
  transition: transform 150ms ease;
}

.node-card__port-pill-row {
  display: flex;
  align-items: center;
  min-height: 34px;
  gap: 10px;
}

.node-card__port-pill-row--right {
  justify-content: flex-end;
}

.node-card__port-stack {
  display: grid;
  gap: 3px;
}

.node-card__port-stack--right {
  justify-items: end;
}

.node-card__port-label-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.node-card__port-spacer {
  min-height: 1px;
}

.node-card__port-pill {
  --node-card-port-accent: rgba(217, 119, 6, 0.92);
  position: relative;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
  min-height: 34px;
  min-width: 132px;
  max-width: min(100%, var(--node-card-port-pill-max-width, 188px));
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  padding: 5px 10px;
  box-shadow: none;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    box-shadow 140ms ease;
}

.node-card__port-pill--condition-source {
  --node-card-port-pill-max-width: 212px;
  min-width: 212px;
}

.node-card__port-pill:focus-visible,
.node-card__port-pill--revealed {
  border-color: rgba(154, 52, 18, 0.14);
  background: rgba(255, 250, 241, 0.94);
  box-shadow: 0 10px 22px rgba(60, 41, 20, 0.08);
}

.node-card__port-pill[data-port-reorder-state-key] {
  cursor: grab;
  touch-action: none;
}

.node-card__port-pill--reordering {
  cursor: grabbing;
}

.node-card__port-pill--reorder-placeholder {
  border-color: color-mix(in srgb, var(--node-card-port-accent) 46%, transparent);
  background: color-mix(in srgb, var(--node-card-port-accent) 8%, transparent);
  box-shadow: none;
}

.node-card__port-pill--reorder-placeholder > * {
  opacity: 0;
}

.node-card__port-pill--floating {
  position: fixed;
  z-index: 5000;
  margin: 0;
  pointer-events: none;
  cursor: grabbing;
  border-color: color-mix(in srgb, var(--node-card-port-accent) 42%, transparent);
  background: rgba(255, 250, 241, 0.97);
  box-shadow: 0 16px 34px rgba(60, 41, 20, 0.16);
  transform: translateZ(0);
}

.node-card__port-pill--create {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--node-card-port-accent) 38%, transparent);
  background: color-mix(in srgb, var(--node-card-port-accent) 10%, transparent);
  color: var(--node-card-port-accent);
  box-shadow: none;
}

.node-card__port-pill--create:focus-visible {
  border-color: color-mix(in srgb, var(--node-card-port-accent) 48%, transparent);
  background: color-mix(in srgb, var(--node-card-port-accent) 14%, transparent);
}

.node-card__port-pill--output {
  color: #1f2937;
}

.node-card__port-pill--input {
  justify-content: flex-start;
  color: #1f2937;
}

.node-card__port-pill--removable.node-card__port-pill--input {
  padding-right: 39px;
}

.node-card__port-pill--removable.node-card__port-pill--output {
  padding-left: 39px;
}

.node-card__port-pill--dock-start {
  margin-left: calc(var(--node-card-inline-padding) * -1 - 10px);
}

.node-card__port-pill--dock-end {
  margin-right: calc(var(--node-card-inline-padding) * -1 - 10px);
}

.node-card__port-pill--confirm {
  border-color: rgba(59, 130, 246, 0.56);
  background: rgba(59, 130, 246, 0.96);
  box-shadow: none;
  color: #eff6ff;
}

.node-card__port-pill--confirm .node-card__port-pill-anchor-slot {
  opacity: 0;
}

.node-card__port-pill-remove {
  position: absolute;
  top: 50%;
  z-index: 2;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  background: rgba(255, 250, 241, 0.88);
  color: rgba(154, 52, 18, 0.74);
  opacity: 0;
  pointer-events: none;
  appearance: none;
  transform: translateY(-50%);
  transition:
    opacity 140ms ease,
    border-color 140ms ease,
    background 140ms ease,
    color 140ms ease;
}

.node-card__port-pill-remove--leading {
  left: 7px;
}

.node-card__port-pill-remove--trailing {
  right: 7px;
}

.node-card__port-pill--revealed .node-card__port-pill-remove,
.node-card__port-pill:focus-visible .node-card__port-pill-remove {
  opacity: 1;
  pointer-events: auto;
}

.node-card__port-pill-remove:hover,
.node-card__port-pill-remove:focus-visible {
  border-color: rgba(185, 28, 28, 0.24);
  background: rgba(254, 242, 242, 0.98);
  color: rgba(185, 28, 28, 0.88);
}

.node-card__port-pill-remove--confirm,
.node-card__port-pill-remove--confirm:hover,
.node-card__port-pill-remove--confirm:focus-visible {
  border-color: rgba(185, 28, 28, 0.28);
  background: rgb(185, 28, 28);
  color: #fff;
}

.node-card__port-pill--confirm .node-card__port-pill-remove {
  opacity: 1;
  pointer-events: auto;
}

.node-card__port-pill-label {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding-inline: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.02rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
}

.node-card__port-pill-label-text {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
  transition: opacity 140ms ease;
}

.node-card__port-pill-label--confirm .node-card__port-pill-label-text {
  opacity: 0;
}

.node-card__port-pill-confirm-icon {
  position: absolute;
  left: 50%;
  top: 50%;
  font-size: 1.08rem;
  opacity: 0;
  transform: translate(-50%, -50%);
  transition: opacity 140ms ease;
  pointer-events: none;
}

.node-card__port-pill-label--confirm .node-card__port-pill-confirm-icon {
  opacity: 1;
}

.node-card__port-pill-anchor-slot {
  flex: none;
  width: 14px;
  height: 14px;
}

.node-card__port-pill-anchor-slot--leading {
  order: -1;
}

.node-card__port-label {
  font-size: 1.08rem;
  font-weight: 600;
  color: #1f2937;
}

.node-card__port-meta {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

:deep(.node-card__agent-add-popover-popper.el-popper) {
  border-radius: 16px;
  background: transparent;
  padding: 0;
  border: 0;
  box-shadow: none;
}

.node-card__state-editor {
  display: grid;
  gap: 12px;
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

.node-card__confirm-hint--preset {
  border-color: rgba(34, 197, 94, 0.16);
  background: rgba(220, 252, 231, 0.98);
  color: rgb(22, 163, 74);
}

.node-card__confirm-hint--delete {
  border-color: rgba(185, 28, 28, 0.16);
  background: rgba(255, 248, 248, 0.98);
  color: rgb(153, 27, 27);
}

.node-card__confirm-hint--state {
  padding: 5px 10px;
  letter-spacing: 0.12em;
  border-color: rgba(37, 99, 235, 0.16);
  background: rgba(239, 246, 255, 0.98);
  color: rgb(37, 99, 235);
}

.node-card__confirm-hint--remove {
  border-color: rgba(185, 28, 28, 0.16);
  background: rgba(255, 248, 248, 0.98);
  color: rgb(153, 27, 27);
}

.node-card__confirm-hint--text {
  border-color: rgba(201, 107, 31, 0.24);
  background: rgb(255, 247, 237);
  color: rgb(154, 52, 18);
}

:deep(.node-card__action-popover.el-popper) {
  border: none;
  border-radius: 16px;
  padding: 0;
  background: transparent;
  box-shadow: none;
}

:deep(.node-card__state-editor-popper.el-popper) {
  border: none;
  border-radius: 16px;
  padding: 0;
  background: transparent;
  box-shadow: none;
}

:deep(.node-card__action-popover .el-popover) {
  padding: 0;
  border-radius: 16px;
  background: transparent;
  box-shadow: none;
}

:deep(.node-card__state-editor-popper .el-popover) {
  padding: 0;
  border-radius: 16px;
  background: transparent;
  box-shadow: none;
}

:deep(.node-card__action-popover .el-input__wrapper) {
  min-height: 38px;
  border-radius: 12px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  background: rgba(255, 251, 246, 0.88);
  box-shadow: none;
}

:deep(.node-card__action-popover .el-input__wrapper.is-focus) {
  border-color: rgba(201, 107, 31, 0.28);
  box-shadow: 0 0 0 3px rgba(201, 107, 31, 0.08);
}

:deep(.node-card__action-popover .el-textarea__inner) {
  border-radius: 12px;
  border-color: rgba(154, 52, 18, 0.16);
  background: rgba(255, 251, 246, 0.88);
  box-shadow: none;
}

:deep(.node-card__action-popover .el-textarea__inner:focus) {
  border-color: rgba(201, 107, 31, 0.28);
  box-shadow: 0 0 0 3px rgba(201, 107, 31, 0.08);
}

:deep(.node-card__confirm-popover.el-popper) {
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

:deep(.node-card__confirm-popover .el-popover) {
  padding: 0;
  background: transparent;
  box-shadow: none;
}

.node-card__port-create-option,
.node-card__port-state-option {
  display: grid;
  gap: 4px;
  border-radius: 16px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  padding: 12px;
  background: rgba(255, 255, 255, 0.84);
  text-align: left;
  cursor: pointer;
}

.node-card__port-create-label,
.node-card__port-state-type {
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.88);
}

.node-card__port-create-title,
.node-card__port-state-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #1f2937;
}

.node-card__surface {
  min-height: 120px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 24px;
  padding: 18px 20px;
  background: rgba(255, 255, 255, 0.86);
  color: #1f2937;
  line-height: 1.6;
  white-space: pre-wrap;
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
