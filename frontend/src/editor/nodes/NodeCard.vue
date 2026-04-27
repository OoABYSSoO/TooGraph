<template>
  <article
    class="node-card"
    :class="{
      'node-card--selected': selected,
      'node-card--condition': view.body.kind === 'condition',
    }"
    @pointerdown.capture="handleLockedNodeCardInteractionCapture"
    @click.capture="handleLockedNodeCardInteractionCapture"
    @keydown.capture="handleLockedNodeCardInteractionCapture"
  >
    <div
      class="node-card__top-actions"
      :class="{ 'node-card__top-actions--visible': isTopActionVisible }"
      data-top-action-surface="true"
      @pointerdown.stop
      @click.stop
    >
      <ElButton
        v-if="humanReviewPending"
        round
        data-top-action-surface="true"
        data-human-review-action="true"
        class="node-card__human-review-button"
        @click.stop="handleHumanReviewActionClick"
      >
        {{ t("nodeCard.humanReview") }}
      </ElButton>
      <ElPopover
        v-if="hasAdvancedSettings"
        :visible="activeTopAction === 'advanced'"
        placement="bottom-end"
        :width="view.body.kind === 'output' ? 340 : 280"
        :show-arrow="false"
        :popper-style="actionPopoverStyle"
        popper-class="node-card__action-popover"
      >
        <template #reference>
          <ElButton round class="node-card__top-action-button node-card__top-action-button--advanced" @click.stop="toggleAdvancedPanel">
            <ElIcon><Operation /></ElIcon>
          </ElButton>
        </template>
        <div class="node-card__top-popover" data-node-popup-surface="true">
          <div class="node-card__top-popover-title">{{ t("nodeCard.advanced") }}</div>
          <div v-if="view.body.kind === 'agent'" class="node-card__advanced-popover-content">
            <label class="node-card__control-row">
              <span class="node-card__control-label">{{ t("nodeCard.temperature") }}</span>
              <ElInput
                :model-value="agentTemperatureInput"
                type="number"
                inputmode="decimal"
                @update:model-value="handleAgentTemperatureInputValue"
              />
            </label>
            <label class="node-card__control-row">
              <span class="node-card__control-label">{{ t("nodeCard.breakpoint") }}</span>
              <ElSelect
                class="node-card__breakpoint-timing-select graphite-select"
                :model-value="agentBreakpointTimingValue"
                popper-class="graphite-select-popper node-card__breakpoint-timing-popper"
                @update:model-value="handleAgentBreakpointTimingSelect"
              >
                <ElOption :label="t('nodeCard.runAfter')" value="after" />
                <ElOption :label="t('nodeCard.runBefore')" value="before" />
              </ElSelect>
            </label>
          </div>
          <div v-else-if="view.body.kind === 'output'" class="node-card__advanced-popover-content">
            <div class="node-card__control-row">
              <span class="node-card__control-label">{{ t("nodeCard.display") }}</span>
              <div class="node-card__control-list">
                <button
                  v-for="option in outputDisplayModeOptions"
                  :key="option.value"
                  type="button"
                  class="node-card__control-button"
                  :class="{ 'node-card__control-button--active': isOutputDisplayModeActive(option.value) }"
                  @pointerdown.stop
                  @click.stop="updateOutputDisplayMode(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
            <div class="node-card__control-row">
              <span class="node-card__control-label">{{ t("nodeCard.format") }}</span>
              <div class="node-card__control-list">
                <button
                  v-for="option in outputPersistFormatOptions"
                  :key="option.value"
                  type="button"
                  class="node-card__control-button"
                  :class="{ 'node-card__control-button--active': isOutputPersistFormatActive(option.value) }"
                  @pointerdown.stop
                  @click.stop="updateOutputPersistFormat(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
            <label class="node-card__control-row">
              <span class="node-card__control-label">{{ t("nodeCard.fileName") }}</span>
              <ElInput
                :model-value="view.body.fileNameTemplate"
                :placeholder="view.title || t('nodeCard.outputFallback')"
                @update:model-value="handleOutputFileNameInputValue"
              />
            </label>
          </div>
        </div>
      </ElPopover>
      <ElPopover
        v-if="canSavePreset"
        :visible="activeTopAction === 'preset'"
        placement="top"
        :show-arrow="false"
        :popper-style="confirmPopoverStyle"
        popper-class="node-card__confirm-popover node-card__confirm-popover--preset"
      >
        <template #reference>
          <ElButton
            round
            data-top-action-surface="true"
            class="node-card__top-action-button node-card__top-action-button--preset"
            :class="{ 'node-card__top-action-button--confirm node-card__top-action-button--confirm-success': activeTopAction === 'preset' }"
            @click.stop="handlePresetActionClick"
          >
            <ElIcon v-if="activeTopAction === 'preset'"><Check /></ElIcon>
            <ElIcon v-else><CollectionTag /></ElIcon>
          </ElButton>
        </template>
        <div class="node-card__confirm-hint node-card__confirm-hint--preset">{{ t("nodeCard.savePresetQuestion") }}</div>
      </ElPopover>
      <ElPopover
        :visible="activeTopAction === 'delete'"
        placement="top"
        :show-arrow="false"
        :popper-style="confirmPopoverStyle"
        popper-class="node-card__confirm-popover node-card__confirm-popover--delete"
      >
        <template #reference>
          <ElButton
            round
            data-top-action-surface="true"
            class="node-card__top-action-button node-card__top-action-button--delete"
            :class="{ 'node-card__top-action-button--confirm node-card__top-action-button--confirm-danger': activeTopAction === 'delete' }"
            @click.stop="handleDeleteActionClick"
          >
            <ElIcon v-if="activeTopAction === 'delete'"><Check /></ElIcon>
            <ElIcon v-else><Delete /></ElIcon>
          </ElButton>
        </template>
        <div class="node-card__confirm-hint node-card__confirm-hint--delete">{{ t("nodeCard.deleteNodeQuestion") }}</div>
      </ElPopover>
    </div>
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
      <div class="node-card__port-row node-card__port-row--single node-card__port-row--input-boundary">
        <ElSegmented
          class="node-card__input-boundary-toggle"
          :model-value="inputBoundarySelection"
          :options="inputTypeOptions"
          :aria-label="t('nodeCard.inputBoundaryMode')"
          :disabled="Boolean(inputAssetEnvelope)"
          @pointerdown.stop
          @click.stop
          @update:model-value="handleInputBoundarySelection"
        >
          <template #default="{ item }">
            <span class="node-card__input-boundary-icon-wrap">
              <component :is="item.icon" class="node-card__input-boundary-icon" aria-hidden="true" />
              <span class="node-card__sr-only">{{ item.label }}</span>
            </span>
          </template>
        </ElSegmented>
        <div v-if="view.body.primaryOutput" class="node-card__port-pill-row node-card__port-pill-row--right">
          <ElPopover
            :visible="
              isStateEditorOpen(`input-primary-output:${view.body.primaryOutput.key}`) ||
              isStateEditorConfirmOpen(`input-primary-output:${view.body.primaryOutput.key}`) ||
              isRemovePortStateConfirmOpen(`input-primary-output:${view.body.primaryOutput.key}`)
            "
            :placement="isStateEditorOpen(`input-primary-output:${view.body.primaryOutput.key}`) ? 'bottom-end' : 'top-end'"
            :width="isStateEditorOpen(`input-primary-output:${view.body.primaryOutput.key}`) ? 320 : undefined"
            :show-arrow="false"
            :popper-style="stateEditorPopoverStyle"
            popper-class="node-card__state-editor-popper"
          >
            <template #reference>
              <span
                class="node-card__port-pill node-card__port-pill--output node-card__port-pill--dock-end"
                :class="{
                  'node-card__port-pill--revealed': isStateEditorPillRevealed(`input-primary-output:${view.body.primaryOutput.key}`),
                  'node-card__port-pill--confirm': isStateEditorConfirmOpen(`input-primary-output:${view.body.primaryOutput.key}`),
                }"
                :style="{ '--node-card-port-accent': view.body.primaryOutput.stateColor }"
                data-state-editor-trigger="true"
                @pointerenter="handleStateEditorPillPointerEnter(`input-primary-output:${view.body.primaryOutput.key}`)"
                @pointerleave="handleStateEditorPillPointerLeave(`input-primary-output:${view.body.primaryOutput.key}`)"
                @pointerdown.stop
                @click.stop="handleStateEditorActionClick(`input-primary-output:${view.body.primaryOutput.key}`, view.body.primaryOutput.key)"
              >
                <span
                  class="node-card__port-pill-label"
                  :class="{ 'node-card__port-pill-label--confirm': isStateEditorConfirmOpen(`input-primary-output:${view.body.primaryOutput.key}`) }"
                >
                  <span class="node-card__port-pill-label-text">{{ view.body.primaryOutput.label }}</span>
                  <ElIcon class="node-card__port-pill-confirm-icon"><Check /></ElIcon>
                </span>
                <span
                  class="node-card__port-pill-anchor-slot"
                  :data-anchor-slot-id="`${nodeId}:state-out:${view.body.primaryOutput.key}`"
                  aria-hidden="true"
                />
              </span>
            </template>
            <div
              v-if="isRemovePortStateConfirmOpen(`input-primary-output:${view.body.primaryOutput.key}`)"
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
              @update:key="handleStateEditorKeyInput"
              @update:name="handleStateEditorNameInput"
              @update:type="handleStateEditorTypeValue"
              @update:color="handleStateEditorColorInput"
              @update:description="handleStateEditorDescriptionInput"
            />
          </ElPopover>
        </div>
      </div>
      <div v-if="showKnowledgeBaseInput" class="node-card__surface node-card__input-picker">
        <label class="node-card__control-row">
          <span class="node-card__control-label">{{ t("nodeCard.knowledgeBase") }}</span>
          <ElSelect
            class="node-card__control-select node-card__input-select graphite-select"
            :model-value="inputKnowledgeBaseValue || undefined"
            :placeholder="inputKnowledgeBaseOptions.length === 0 ? t('nodeCard.noKnowledgeBases') : t('nodeCard.selectKnowledgeBase')"
            :disabled="inputKnowledgeBaseOptions.length === 0"
            :teleported="false"
            popper-class="graphite-select-popper"
            @pointerdown.stop
            @click.stop
            @update:model-value="handleInputKnowledgeBaseSelect"
          >
            <ElOption v-for="option in inputKnowledgeBaseOptions" :key="option.value" :label="option.label" :value="option.value" />
          </ElSelect>
        </label>
        <div class="node-card__input-meta">
          {{ selectedKnowledgeBaseDescription }}
        </div>
      </div>
      <div v-else-if="showAssetUploadInput" class="node-card__input-upload">
        <input
          ref="inputAssetInputRef"
          class="node-card__sr-only"
          type="file"
          :accept="inputAssetAccept"
          @change="handleInputAssetFileChange"
        />
        <button
          v-if="!inputAssetEnvelope"
          type="button"
          class="node-card__asset-dropzone"
          @pointerdown.stop
          @click.stop="openInputAssetPicker"
          @dragover.prevent
          @drop.prevent="handleInputAssetDrop"
        >
          <span class="node-card__asset-dropzone-title">Drop {{ inputAssetLabel }} here</span>
          <span class="node-card__asset-dropzone-copy">Or click to choose a file from your device.</span>
        </button>
        <div
          v-else
          class="node-card__asset-preview-card"
          @dragover.prevent
          @drop.prevent="handleInputAssetDrop"
        >
          <div class="node-card__asset-actions">
            <button
              type="button"
              class="node-card__asset-action"
              @pointerdown.stop
              @click.stop="openInputAssetPicker"
            >
              Replace
            </button>
            <button
              type="button"
              class="node-card__asset-action node-card__asset-action--danger"
              @pointerdown.stop
              @click.stop="clearInputAsset"
            >
              Remove
            </button>
          </div>

          <div
            v-if="inputAssetEnvelope.detectedType === 'image' && inputAssetEnvelope.encoding === 'data_url'"
            class="node-card__asset-media-shell"
          >
            <img :src="inputAssetEnvelope.content" :alt="inputAssetEnvelope.name" class="node-card__asset-image" />
          </div>
          <div
            v-else-if="inputAssetEnvelope.detectedType === 'audio' && inputAssetEnvelope.encoding === 'data_url'"
            class="node-card__asset-media-shell node-card__asset-media-shell--audio"
          >
            <audio controls class="node-card__asset-audio">
              <source :src="inputAssetEnvelope.content" :type="inputAssetEnvelope.mimeType" />
            </audio>
          </div>
          <div
            v-else-if="inputAssetEnvelope.detectedType === 'video' && inputAssetEnvelope.encoding === 'data_url'"
            class="node-card__asset-media-shell"
          >
            <video controls class="node-card__asset-video">
              <source :src="inputAssetEnvelope.content" :type="inputAssetEnvelope.mimeType" />
            </video>
          </div>
          <div v-else class="node-card__asset-file">
            <div class="node-card__asset-name">{{ inputAssetEnvelope.name }}</div>
            <div class="node-card__asset-summary">{{ inputAssetSummary }}</div>
            <pre v-if="inputAssetTextPreview" class="node-card__asset-text">{{ inputAssetTextPreview }}</pre>
          </div>

          <div class="node-card__input-meta">
            {{ inputAssetDescription }}
          </div>
        </div>
        <div v-if="showLegacyUploadedAssetHint" class="node-card__input-meta">
          {{ t("nodeCard.rawTextUploadHint") }}
        </div>
      </div>
      <textarea
        v-else-if="isInputValueEditable"
        class="node-card__surface node-card__surface-textarea"
        :value="inputValueText"
        :placeholder="t('nodeCard.enterInputValue')"
        @pointerdown.stop
        @click.stop
        @input="handleInputValueInput"
      />
      <div v-else class="node-card__surface node-card__surface--tall">{{ view.body.valueText || t("nodeCard.emptyInput") }}</div>
    </section>

    <section v-else-if="view.body.kind === 'agent'" class="node-card__body node-card__body--agent">
      <div class="node-card__port-grid">
        <div class="node-card__port-column">
          <div v-for="port in view.inputs" :key="port.key" class="node-card__port-pill-row">
            <ElPopover
              :visible="
                isStateEditorOpen(`agent-input:${port.key}`) ||
                isStateEditorConfirmOpen(`agent-input:${port.key}`) ||
                isRemovePortStateConfirmOpen(`agent-input:${port.key}`)
              "
              :placement="isStateEditorOpen(`agent-input:${port.key}`) ? 'bottom-start' : 'top-start'"
              :width="isStateEditorOpen(`agent-input:${port.key}`) ? 320 : undefined"
              :show-arrow="false"
              :popper-style="stateEditorPopoverStyle"
              popper-class="node-card__state-editor-popper"
            >
              <template #reference>
                <span
                  class="node-card__port-pill node-card__port-pill--input node-card__port-pill--dock-start"
                  :class="{
                    'node-card__port-pill--removable': !port.virtual,
                    'node-card__port-pill--revealed': isStateEditorPillRevealed(`agent-input:${port.key}`),
                    'node-card__port-pill--confirm': isStateEditorConfirmOpen(`agent-input:${port.key}`),
                  }"
                  :style="{ '--node-card-port-accent': port.stateColor }"
                  data-state-editor-trigger="true"
                  data-anchor-hitarea="true"
                  @pointerenter="handleStateEditorPillPointerEnter(`agent-input:${port.key}`)"
                  @pointerleave="handleStateEditorPillPointerLeave(`agent-input:${port.key}`)"
                  @pointerdown.stop
                  @click.stop="!port.virtual && handleStateEditorActionClick(`agent-input:${port.key}`, port.key)"
                >
                  <span
                    class="node-card__port-pill-anchor-slot node-card__port-pill-anchor-slot--leading"
                    :data-anchor-slot-id="`${nodeId}:state-in:${port.key}`"
                    aria-hidden="true"
                  />
                  <span
                    class="node-card__port-pill-label"
                    :class="{ 'node-card__port-pill-label--confirm': isStateEditorConfirmOpen(`agent-input:${port.key}`) }"
                  >
                    <span class="node-card__port-pill-label-text">{{ port.label }}</span>
                    <ElIcon class="node-card__port-pill-confirm-icon"><Check /></ElIcon>
                  </span>
                  <button
                    v-if="!port.virtual"
                    type="button"
                    class="node-card__port-pill-remove node-card__port-pill-remove--trailing"
                    :class="{ 'node-card__port-pill-remove--confirm': isRemovePortStateConfirmOpen(`agent-input:${port.key}`) }"
                    :aria-label="t('nodeCard.removeStateBinding')"
                    @pointerdown.stop
                    @click.stop="handleRemovePortStateClick(`agent-input:${port.key}`, 'input', port.key)"
                  >
                    <ElIcon v-if="isRemovePortStateConfirmOpen(`agent-input:${port.key}`)"><Check /></ElIcon>
                    <ElIcon v-else><Delete /></ElIcon>
                  </button>
                </span>
              </template>
              <div v-if="isRemovePortStateConfirmOpen(`agent-input:${port.key}`)" class="node-card__confirm-hint node-card__confirm-hint--remove">{{ t("nodeCard.removeStateQuestion") }}</div>
              <div v-else-if="isStateEditorConfirmOpen(`agent-input:${port.key}`)" class="node-card__confirm-hint node-card__confirm-hint--state">{{ t("nodeCard.editStateQuestion") }}</div>
              <StateEditorPopover
                v-else-if="stateEditorDraft"
                class="node-card__state-editor"
                :draft="stateEditorDraft"
                :error="stateEditorError"
                :type-options="stateTypeOptions"
                :color-options="stateColorOptions"
                @update:key="handleStateEditorKeyInput"
                @update:name="handleStateEditorNameInput"
                @update:type="handleStateEditorTypeValue"
                @update:color="handleStateEditorColorInput"
                @update:description="handleStateEditorDescriptionInput"
              />
            </ElPopover>
          </div>
          <div v-if="pendingStateInputSource" class="node-card__port-pill-row">
            <span
              class="node-card__port-pill node-card__port-pill--input node-card__port-pill--dock-start node-card__port-pill--create"
              :style="{ '--node-card-port-accent': pendingStateInputSource.stateColor }"
              data-anchor-hitarea="true"
              @pointerdown.stop
            >
              <span
                class="node-card__port-pill-anchor-slot node-card__port-pill-anchor-slot--leading"
                :data-anchor-slot-id="`${nodeId}:state-in:${CREATE_AGENT_INPUT_STATE_KEY}`"
                aria-hidden="true"
              />
              <span class="node-card__port-pill-create-badge">{{ t("common.new") }}</span>
              <span class="node-card__port-pill-label">
                <span class="node-card__port-pill-label-text">{{ pendingStateInputSource.label }}</span>
              </span>
            </span>
          </div>
        </div>
        <div class="node-card__port-column node-card__port-column--right">
          <div v-for="port in view.outputs" :key="port.key" class="node-card__port-pill-row node-card__port-pill-row--right">
            <ElPopover
              :visible="
                isStateEditorOpen(`agent-output:${port.key}`) ||
                isStateEditorConfirmOpen(`agent-output:${port.key}`) ||
                isRemovePortStateConfirmOpen(`agent-output:${port.key}`)
              "
              :placement="isStateEditorOpen(`agent-output:${port.key}`) ? 'bottom-end' : 'top-end'"
              :width="isStateEditorOpen(`agent-output:${port.key}`) ? 320 : undefined"
              :show-arrow="false"
              :popper-style="stateEditorPopoverStyle"
              popper-class="node-card__state-editor-popper"
            >
              <template #reference>
                <span
                  class="node-card__port-pill node-card__port-pill--output node-card__port-pill--dock-end node-card__port-pill--removable"
                  :class="{
                    'node-card__port-pill--revealed': isStateEditorPillRevealed(`agent-output:${port.key}`),
                    'node-card__port-pill--confirm': isStateEditorConfirmOpen(`agent-output:${port.key}`),
                  }"
                  :style="{ '--node-card-port-accent': port.stateColor }"
                  data-state-editor-trigger="true"
                  @pointerenter="handleStateEditorPillPointerEnter(`agent-output:${port.key}`)"
                  @pointerleave="handleStateEditorPillPointerLeave(`agent-output:${port.key}`)"
                  @pointerdown.stop
                  @click.stop="handleStateEditorActionClick(`agent-output:${port.key}`, port.key)"
                >
                  <button
                    type="button"
                    class="node-card__port-pill-remove node-card__port-pill-remove--leading"
                    :class="{ 'node-card__port-pill-remove--confirm': isRemovePortStateConfirmOpen(`agent-output:${port.key}`) }"
                    :aria-label="t('nodeCard.removeStateBinding')"
                    @pointerdown.stop
                    @click.stop="handleRemovePortStateClick(`agent-output:${port.key}`, 'output', port.key)"
                  >
                    <ElIcon v-if="isRemovePortStateConfirmOpen(`agent-output:${port.key}`)"><Check /></ElIcon>
                    <ElIcon v-else><Delete /></ElIcon>
                  </button>
                  <span
                    class="node-card__port-pill-label"
                    :class="{ 'node-card__port-pill-label--confirm': isStateEditorConfirmOpen(`agent-output:${port.key}`) }"
                  >
                    <span class="node-card__port-pill-label-text">{{ port.label }}</span>
                    <ElIcon class="node-card__port-pill-confirm-icon"><Check /></ElIcon>
                  </span>
                  <span
                    class="node-card__port-pill-anchor-slot"
                    :data-anchor-slot-id="`${nodeId}:state-out:${port.key}`"
                    aria-hidden="true"
                  />
              </span>
            </template>
              <div v-if="isRemovePortStateConfirmOpen(`agent-output:${port.key}`)" class="node-card__confirm-hint node-card__confirm-hint--remove">{{ t("nodeCard.removeStateQuestion") }}</div>
              <div v-else-if="isStateEditorConfirmOpen(`agent-output:${port.key}`)" class="node-card__confirm-hint node-card__confirm-hint--state">{{ t("nodeCard.editStateQuestion") }}</div>
              <StateEditorPopover
                v-else-if="stateEditorDraft"
                class="node-card__state-editor"
                :draft="stateEditorDraft"
                :error="stateEditorError"
                :type-options="stateTypeOptions"
                :color-options="stateColorOptions"
                @update:key="handleStateEditorKeyInput"
                @update:name="handleStateEditorNameInput"
                @update:type="handleStateEditorTypeValue"
                @update:color="handleStateEditorColorInput"
                @update:description="handleStateEditorDescriptionInput"
              />
            </ElPopover>
          </div>
        </div>
      </div>
      <div class="node-card__agent-runtime-row">
        <div class="node-card__agent-model-select-shell" @pointerdown.stop @click.stop>
          <ElSelect
            ref="agentModelSelectRef"
            class="node-card__agent-model-select graphite-select"
            :model-value="agentResolvedModelValue || undefined"
            :placeholder="agentModelOptions.length === 0 ? t('nodeCard.noConfiguredModels') : t('nodeCard.selectModel')"
            :disabled="agentModelOptions.length === 0"
            popper-class="graphite-select-popper node-card__agent-model-popper"
            @visible-change="handleAgentModelSelectVisibleChange"
            @update:model-value="handleAgentModelValueChange"
          >
            <ElOption
              v-for="option in agentModelOptions"
              :key="option.value"
              :label="option.value === trimmedGlobalTextModelRef ? `${option.label} (${t('nodeCard.globalModelSuffix')})` : option.label"
              :value="option.value"
            />
          </ElSelect>
        </div>
        <ElPopover
          trigger="hover"
          placement="top-start"
          :show-arrow="false"
          :popper-style="confirmPopoverStyle"
          popper-class="node-card__agent-toggle-hint-popper"
        >
          <template #reference>
            <div
              class="node-card__agent-toggle-card node-card__agent-toggle-card--thinking"
              :class="{ 'node-card__agent-toggle-card--enabled': agentThinkingEnabled }"
              @pointerdown.stop
              @click.stop
            >
              <span
                class="node-card__agent-thinking-icon"
                :class="{ 'node-card__agent-thinking-icon--enabled': agentThinkingEnabled }"
                aria-hidden="true"
              >
                <Opportunity />
              </span>
              <ElSelect
                class="node-card__agent-thinking-select graphite-select"
                :model-value="agentThinkingModeValue"
                :teleported="false"
                popper-class="graphite-select-popper node-card__agent-thinking-popper"
                :aria-label="t('nodeCard.toggleThinking')"
                @pointerdown.stop
                @click.stop
                @update:model-value="handleAgentThinkingModeSelect"
              >
                <ElOption v-for="option in agentThinkingOptions" :key="option.value" :label="option.label" :value="option.value" />
              </ElSelect>
            </div>
          </template>
          <div class="node-card__confirm-hint node-card__confirm-hint--toggle">{{ t("nodeCard.thinkingMode") }}</div>
        </ElPopover>
        <ElPopover
          trigger="hover"
          placement="top-start"
          :show-arrow="false"
          :popper-style="confirmPopoverStyle"
          popper-class="node-card__agent-toggle-hint-popper"
        >
          <template #reference>
            <div
              class="node-card__agent-toggle-card node-card__agent-toggle-card--breakpoint"
              :class="{ 'node-card__agent-toggle-card--enabled': agentBreakpointEnabled }"
              @pointerdown.stop
              @click.stop
            >
              <ElIcon
                class="node-card__agent-breakpoint-icon"
                :class="{ 'node-card__agent-breakpoint-icon--enabled': agentBreakpointEnabled }"
              >
                <Flag />
              </ElIcon>
              <ElSwitch
                class="node-card__agent-toggle-switch node-card__agent-breakpoint-switch"
                :model-value="agentBreakpointEnabled"
                :width="56"
                inline-prompt
                active-text="ON"
                inactive-text="OFF"
                :aria-label="t('nodeCard.toggleBreakpoint')"
                @pointerdown.stop
                @click.stop
                @update:model-value="handleAgentBreakpointToggleValue"
              />
            </div>
          </template>
          <div class="node-card__confirm-hint node-card__confirm-hint--toggle">{{ t("nodeCard.setBreakpoint") }}</div>
        </ElPopover>
      </div>
      <div class="node-card__action-row">
        <ElPopover
          v-if="showSkillPickerTrigger"
          :visible="isSkillPickerOpen"
          placement="bottom-start"
          :width="360"
          :show-arrow="false"
          :popper-style="agentAddPopoverStyle"
          popper-class="node-card__agent-add-popover-popper"
        >
          <template #reference>
            <button
              type="button"
              class="node-card__action-pill node-card__action-pill--skill node-card__action-pill-button"
              @pointerdown.stop
              @click.stop="toggleSkillPicker"
            >
              + skill
            </button>
          </template>
          <div class="node-card__agent-add-popover node-card__skill-picker" data-node-popup-surface="true" @pointerdown.stop @click.stop>
            <div class="node-card__skill-picker-title">{{ t("nodeCard.addSkill") }}</div>
            <div class="node-card__skill-picker-copy">{{ t("nodeCard.skillCopy") }}</div>
            <div v-if="skillDefinitionsLoading" class="node-card__skill-panel-message">
              {{ t("nodeCard.loadingSkills") }}
            </div>
            <div v-else-if="skillDefinitionsError" class="node-card__skill-panel-message node-card__skill-panel-message--error">
              {{ skillDefinitionsError }}
            </div>
            <div v-else-if="availableSkillDefinitions.length === 0" class="node-card__skill-panel-message">
              {{ t("nodeCard.noSkills") }}
            </div>
            <button
              v-for="definition in availableSkillDefinitions"
              v-else
              :key="definition.skillKey"
              type="button"
              class="node-card__skill-option"
              @pointerdown.stop
              @click.stop="attachAgentSkill(definition.skillKey)"
            >
              <div class="node-card__skill-option-title">{{ definition.label }}</div>
              <div class="node-card__skill-option-copy">{{ definition.description }}</div>
              <div class="node-card__skill-option-meta">
                <span>{{ definition.kind }}</span>
                <span>{{ definition.mode }}</span>
                <span>{{ definition.scope }}</span>
                <span v-if="definition.inputSchema.length > 0">{{ t("nodeCard.inputCount", { count: definition.inputSchema.length }) }}</span>
                <span v-if="definition.outputSchema.length > 0">{{ t("nodeCard.outputCount", { count: definition.outputSchema.length }) }}</span>
              </div>
            </button>
          </div>
        </ElPopover>
        <span v-else class="node-card__action-pill node-card__action-pill--skill node-card__action-pill--disabled">+ skill</span>
        <ElPopover
          v-for="picker in agentPortPickerActions"
          :key="picker.side"
          :visible="activePortPickerSide === picker.side"
          :placement="picker.placement"
          :width="portStateDraft ? 376 : 340"
          :show-arrow="false"
          :popper-style="agentAddPopoverStyle"
          popper-class="node-card__agent-add-popover-popper"
        >
          <template #reference>
            <button
              type="button"
              class="node-card__action-pill node-card__action-pill-button"
              :class="picker.toneClass"
              @pointerdown.stop
              @click.stop="openPortPicker(picker.side)"
            >
              {{ picker.label }}
            </button>
          </template>
          <div
            v-if="activePortPickerSide === picker.side"
            class="node-card__agent-add-popover node-card__port-picker"
            data-node-popup-surface="true"
            @pointerdown.stop
            @click.stop
          >
            <div class="node-card__port-picker-title">{{ portPickerTitle }}</div>
            <div v-if="portStateDraft" class="node-card__port-picker-form">
              <div class="node-card__port-picker-grid">
                <label class="node-card__control-row">
                  <span class="node-card__control-label">{{ t("nodeCard.key") }}</span>
                  <ElInput
                    :aria-label="t('nodeCard.key')"
                    :model-value="portStateDraft.key"
                    @update:model-value="handlePortDraftKeyValue"
                  />
                </label>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">{{ t("nodeCard.name") }}</span>
                  <ElInput
                    :aria-label="t('nodeCard.name')"
                    :model-value="portStateDraft.definition.name"
                    @update:model-value="handlePortDraftNameValue"
                  />
                </label>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">{{ t("nodeCard.type") }}</span>
                  <ElSelect
                    ref="portDraftTypeSelectRef"
                    class="node-card__control-select graphite-select"
                    :model-value="portStateDraft.definition.type"
                    :teleported="false"
                    popper-class="graphite-select-popper node-card__port-picker-select-popper"
                    @update:model-value="handlePortDraftTypeSelect"
                  >
                    <ElOption v-for="typeOption in stateTypeOptions" :key="typeOption" :label="typeOption" :value="typeOption" />
                  </ElSelect>
                </label>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">{{ t("nodeCard.color") }}</span>
                  <ElSelect
                    ref="portDraftColorSelectRef"
                    class="node-card__control-select graphite-select"
                    :model-value="portStateDraft.definition.color"
                    :teleported="false"
                    popper-class="graphite-select-popper node-card__port-picker-select-popper"
                    @update:model-value="handlePortDraftColorSelect"
                  >
                    <template #label>
                      <span class="node-card__port-picker-color-value">
                        <span class="node-card__port-picker-color-dot" :style="portStateSelectedColorStyle" />
                      </span>
                    </template>
                    <ElOption v-for="option in portStateColorOptions" :key="option.value || option.label" :label="option.label" :value="option.value">
                      <div class="node-card__port-picker-color-option">
                        <span class="node-card__port-picker-color-dot" :style="{ backgroundColor: option.swatch }" />
                        <span>{{ option.label }}</span>
                      </div>
                    </ElOption>
                  </ElSelect>
                </label>
              </div>
              <label class="node-card__control-row">
                <span class="node-card__control-label">{{ t("nodeCard.description") }}</span>
                <ElInput
                  :aria-label="t('nodeCard.description')"
                  type="textarea"
                  :rows="2"
                  :model-value="portStateDraft.definition.description"
                  @update:model-value="handlePortDraftDescriptionValue"
                />
              </label>
              <StateDefaultValueEditor
                :field="portStateDraft.definition"
                @update-value="updatePortDraftValue"
              />
              <div class="node-card__port-picker-hint" :class="{ 'node-card__port-picker-hint--error': Boolean(portStateError) }">
                {{ portStateError ?? t("nodeCard.createStateBindHint") }}
              </div>
              <div class="node-card__port-picker-actions">
                <button
                  type="button"
                  class="node-card__port-picker-button"
                  @pointerdown.stop
                  @click.stop="backPortDraft"
                >
                  {{ t("nodeCard.back") }}
                </button>
                <button
                  type="button"
                  class="node-card__port-picker-button node-card__port-picker-button--primary"
                  @pointerdown.stop
                  @click.stop="commitPortStateCreate"
                >
                  {{ t("nodeCard.create") }}
                </button>
              </div>
            </div>
            <div v-else class="node-card__port-picker-form">
              <ElInput
                class="node-card__port-picker-search"
                :model-value="portStateSearch"
                :placeholder="activePortPickerSide === 'input' ? t('nodeCard.searchInputState') : t('nodeCard.searchOutputState')"
                @update:model-value="handlePortStateSearchValue"
              />
              <button
                v-if="portStateSearch.trim()"
                type="button"
                class="node-card__port-create-option"
                @pointerdown.stop
                @click.stop="beginPortStateCreate"
              >
                <span class="node-card__port-create-label">{{ t("nodeCard.create") }}</span>
                <span class="node-card__port-create-title">{{ t("nodeCard.createStateNamed", { name: portStateSearch.trim() }) }}</span>
              </button>
              <button
                v-for="stateRow in portPickerMatchingStates"
                :key="stateRow.key"
                type="button"
                class="node-card__port-state-option"
                @pointerdown.stop
                @click.stop="bindStateToPort(stateRow.key)"
              >
                <span class="node-card__port-state-type">{{ stateRow.definition.type }}</span>
                <span class="node-card__port-state-title">{{ stateRow.label }}</span>
                <span class="node-card__port-state-key">{{ stateRow.key }}</span>
              </button>
              <div class="node-card__port-picker-actions">
                <button
                  type="button"
                  class="node-card__port-picker-button"
                  @pointerdown.stop
                  @click.stop="closePortPicker"
                >
                  {{ t("common.cancel") }}
                </button>
              </div>
            </div>
          </div>
        </ElPopover>
      </div>
      <div v-if="attachedSkillBadges.length > 0" class="node-card__skill-badges">
        <span
          v-for="badge in attachedSkillBadges"
          :key="badge.skillKey"
          class="node-card__skill-badge"
          :title="badge.description || badge.skillKey"
        >
          <span>{{ badge.label }}</span>
          <button
            type="button"
            class="node-card__skill-badge-remove"
            :title="t('nodeCard.removeSkill')"
            @pointerdown.stop
            @click.stop="removeAgentSkill(badge.skillKey)"
          >
            ×
          </button>
        </span>
      </div>
      <textarea
        class="node-card__surface node-card__surface-textarea"
        :value="view.body.taskInstruction"
        :placeholder="t('nodeCard.nodePromptPlaceholder')"
        @pointerdown.stop
        @click.stop
        @input="handleAgentTaskInstructionInput"
      />
    </section>

    <section v-else-if="view.body.kind === 'output'" class="node-card__body node-card__body--output">
      <div class="node-card__output-toolbar">
        <ElPopover
          v-if="view.body.primaryInput"
          :visible="isStateEditorOpen(`output-input:${view.body.primaryInput.key}`) || isStateEditorConfirmOpen(`output-input:${view.body.primaryInput.key}`)"
          :placement="isStateEditorOpen(`output-input:${view.body.primaryInput.key}`) ? 'bottom-start' : 'top-start'"
          :width="isStateEditorOpen(`output-input:${view.body.primaryInput.key}`) ? 320 : undefined"
          :show-arrow="false"
          :popper-style="stateEditorPopoverStyle"
          popper-class="node-card__state-editor-popper"
        >
          <template #reference>
            <span
              class="node-card__port-pill node-card__port-pill--input node-card__port-pill--dock-start"
              :class="{
                'node-card__port-pill--revealed': isStateEditorPillRevealed(`output-input:${view.body.primaryInput.key}`),
                'node-card__port-pill--confirm': isStateEditorConfirmOpen(`output-input:${view.body.primaryInput.key}`),
              }"
              :style="{ '--node-card-port-accent': view.body.primaryInput.stateColor }"
              data-state-editor-trigger="true"
              data-anchor-hitarea="true"
              @pointerenter="handleStateEditorPillPointerEnter(`output-input:${view.body.primaryInput.key}`)"
              @pointerleave="handleStateEditorPillPointerLeave(`output-input:${view.body.primaryInput.key}`)"
              @pointerdown.stop
              @click.stop="!view.body.primaryInput.virtual && handleStateEditorActionClick(`output-input:${view.body.primaryInput.key}`, view.body.primaryInput.key)"
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
          <div v-if="isStateEditorConfirmOpen(`output-input:${view.body.primaryInput.key}`)" class="node-card__confirm-hint node-card__confirm-hint--state">{{ t("nodeCard.editStateQuestion") }}</div>
          <StateEditorPopover
            v-else-if="stateEditorDraft"
            class="node-card__state-editor"
            :draft="stateEditorDraft"
            :error="stateEditorError"
            :type-options="stateTypeOptions"
            :color-options="stateColorOptions"
            @update:key="handleStateEditorKeyInput"
            @update:name="handleStateEditorNameInput"
            @update:type="handleStateEditorTypeValue"
            @update:color="handleStateEditorColorInput"
            @update:description="handleStateEditorDescriptionInput"
          />
        </ElPopover>
        <span v-else class="node-card__port-label">{{ t("nodeCard.unbound") }}</span>
        <div class="node-card__output-persist-card">
          <span
            class="node-card__output-persist-icon"
            :class="{ 'node-card__output-persist-icon--enabled': view.body.persistEnabled }"
            aria-hidden="true"
          >
            <DocumentChecked />
          </span>
          <ElSwitch
            class="node-card__output-persist-switch"
            :model-value="view.body.persistEnabled"
            :width="56"
            inline-prompt
            active-text="ON"
            inactive-text="OFF"
            :aria-label="t('nodeCard.toggleOutputPersistence')"
            @pointerdown.stop
            @click.stop
            @update:model-value="handleOutputPersistToggle"
          />
        </div>
      </div>
      <div class="node-card__surface node-card__surface--output">
        <div class="node-card__surface-meta">
          <span>{{ view.body.previewTitle.toUpperCase() }}</span>
          <span>{{ view.body.displayModeLabel }}</span>
        </div>
        <div
          class="node-card__preview"
          :class="{
            'node-card__preview--plain': outputPreviewContent.kind === 'plain',
            'node-card__preview--markdown': outputPreviewContent.kind === 'markdown',
            'node-card__preview--json': outputPreviewContent.kind === 'json',
            'node-card__preview--empty': outputPreviewContent.isEmpty,
          }"
        >
          <div
            v-if="outputPreviewContent.kind === 'markdown'"
            class="node-card__preview-markdown"
            v-html="outputPreviewContent.html"
          />
          <pre v-else class="node-card__preview-text">{{ outputPreviewContent.text }}</pre>
        </div>
      </div>
    </section>

    <section v-else-if="view.body.kind === 'condition'" class="node-card__body node-card__body--condition">
      <div class="node-card__surface node-card__surface--condition">
        <div class="node-card__condition-panel">
          <div class="node-card__condition-source-row">
            <span class="node-card__control-label">{{ t("nodeCard.source") }}</span>
            <div v-if="view.body.primaryInput" class="node-card__port-pill-row node-card__port-pill-row--condition-source">
              <ElPopover
                :visible="
                  isStateEditorOpen(`condition-input:${view.body.primaryInput.key}`) ||
                  isStateEditorConfirmOpen(`condition-input:${view.body.primaryInput.key}`) ||
                  isRemovePortStateConfirmOpen(`condition-input:${view.body.primaryInput.key}`)
                "
                :placement="isStateEditorOpen(`condition-input:${view.body.primaryInput.key}`) ? 'bottom-start' : 'top-start'"
                :width="isStateEditorOpen(`condition-input:${view.body.primaryInput.key}`) ? 320 : undefined"
                :show-arrow="false"
                :popper-style="stateEditorPopoverStyle"
                popper-class="node-card__state-editor-popper"
              >
                <template #reference>
                  <span
                    class="node-card__port-pill node-card__port-pill--input node-card__port-pill--dock-start node-card__port-pill--condition-source"
                    :class="{
                      'node-card__port-pill--removable': !view.body.primaryInput.virtual,
                      'node-card__port-pill--revealed': isStateEditorPillRevealed(`condition-input:${view.body.primaryInput.key}`),
                      'node-card__port-pill--confirm': isStateEditorConfirmOpen(`condition-input:${view.body.primaryInput.key}`),
                    }"
                    :style="{ '--node-card-port-accent': view.body.primaryInput.stateColor }"
                    data-state-editor-trigger="true"
                    data-anchor-hitarea="true"
                    @pointerenter="handleStateEditorPillPointerEnter(`condition-input:${view.body.primaryInput.key}`)"
                    @pointerleave="handleStateEditorPillPointerLeave(`condition-input:${view.body.primaryInput.key}`)"
                    @pointerdown.stop
                    @click.stop="!view.body.primaryInput.virtual && handleStateEditorActionClick(`condition-input:${view.body.primaryInput.key}`, view.body.primaryInput.key)"
                  >
                    <span
                      class="node-card__port-pill-anchor-slot node-card__port-pill-anchor-slot--leading"
                      :data-anchor-slot-id="`${nodeId}:state-in:${view.body.primaryInput.key}`"
                      aria-hidden="true"
                    />
                    <span
                      class="node-card__port-pill-label"
                      :class="{ 'node-card__port-pill-label--confirm': isStateEditorConfirmOpen(`condition-input:${view.body.primaryInput.key}`) }"
                    >
                      <span class="node-card__port-pill-label-text">{{ view.body.primaryInput.label }}</span>
                      <ElIcon class="node-card__port-pill-confirm-icon"><Check /></ElIcon>
                    </span>
                    <button
                      v-if="!view.body.primaryInput.virtual"
                      type="button"
                      class="node-card__port-pill-remove node-card__port-pill-remove--trailing"
                      :class="{ 'node-card__port-pill-remove--confirm': isRemovePortStateConfirmOpen(`condition-input:${view.body.primaryInput.key}`) }"
                      :aria-label="t('nodeCard.removeSourceBinding')"
                      @pointerdown.stop
                      @click.stop="handleRemovePortStateClick(`condition-input:${view.body.primaryInput.key}`, 'input', view.body.primaryInput.key)"
                    >
                      <ElIcon v-if="isRemovePortStateConfirmOpen(`condition-input:${view.body.primaryInput.key}`)"><Check /></ElIcon>
                      <ElIcon v-else><Delete /></ElIcon>
                    </button>
                  </span>
                </template>
                <div v-if="isRemovePortStateConfirmOpen(`condition-input:${view.body.primaryInput.key}`)" class="node-card__confirm-hint node-card__confirm-hint--remove">{{ t("nodeCard.removeStateQuestion") }}</div>
                <div v-else-if="isStateEditorConfirmOpen(`condition-input:${view.body.primaryInput.key}`)" class="node-card__confirm-hint node-card__confirm-hint--state">{{ t("nodeCard.editStateQuestion") }}</div>
                <StateEditorPopover
                  v-else-if="stateEditorDraft"
                  class="node-card__state-editor"
                  :draft="stateEditorDraft"
                  :error="stateEditorError"
                  :type-options="stateTypeOptions"
                  :color-options="stateColorOptions"
                  @update:key="handleStateEditorKeyInput"
                  @update:name="handleStateEditorNameInput"
                  @update:type="handleStateEditorTypeValue"
                  @update:color="handleStateEditorColorInput"
                  @update:description="handleStateEditorDescriptionInput"
                />
              </ElPopover>
            </div>
            <div v-else class="node-card__condition-source-empty">{{ t("nodeCard.connectSourceState") }}</div>
          </div>
          <div class="node-card__condition-controls-row">
            <label class="node-card__control-row">
              <span class="node-card__control-label">{{ t("nodeCard.operator") }}</span>
              <ElSelect
                class="node-card__control-select node-card__condition-operator-select graphite-select"
                :model-value="node.kind === 'condition' ? node.config.rule.operator : ''"
                :title="view.body.operatorLabel"
                :teleported="false"
                popper-class="graphite-select-popper"
                @pointerdown.stop
                @click.stop
                @update:model-value="handleConditionRuleOperatorSelect"
              >
                <ElOption v-for="option in conditionRuleOperatorOptions" :key="option.value" :label="option.label" :value="option.value" />
              </ElSelect>
            </label>
            <label class="node-card__control-row">
              <span class="node-card__control-label">{{ t("nodeCard.value") }}</span>
              <input
                class="node-card__control-input"
                type="text"
                :value="conditionRuleValueDraft"
                :placeholder="view.body.valueLabel"
                :disabled="conditionRuleValueDisabled"
                @pointerdown.stop
                @click.stop
                @input="handleConditionRuleValueInput"
                @blur="commitConditionRuleValue"
                @keydown.enter.prevent="handleConditionRuleValueEnter"
              />
            </label>
            <label class="node-card__control-row">
              <span class="node-card__control-label">{{ t("nodeCard.maxLoops") }}</span>
              <input
                class="node-card__loop-input node-card__loop-input--condition"
                type="number"
                inputmode="numeric"
                :min="CONDITION_LOOP_LIMIT_MIN"
                :max="CONDITION_LOOP_LIMIT_MAX"
                :value="conditionLoopLimitDraft"
                :placeholder="String(CONDITION_LOOP_LIMIT_DEFAULT)"
                @pointerdown.stop
                @click.stop
                @input="handleConditionLoopLimitInput"
                @blur="commitConditionLoopLimit"
                @keydown.enter.prevent="handleConditionLoopLimitEnter"
              />
            </label>
          </div>
        </div>
      </div>
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
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ElButton, ElIcon, ElInput, ElOption, ElPopover, ElSelect } from "element-plus";
import { Check, Collection, CollectionTag, Delete, Document, DocumentChecked, Flag, FolderOpened, Operation, Opportunity } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

import StateDefaultValueEditor from "@/editor/workspace/StateDefaultValueEditor.vue";
import StateEditorPopover from "./StateEditorPopover.vue";
import type { KnowledgeBaseRecord } from "@/types/knowledge";
import type { AgentNode, ConditionNode, GraphNode, InputNode, OutputNode, StateDefinition } from "@/types/node-system";
import type { SkillDefinition } from "@/types/skills";
import { CREATE_AGENT_INPUT_STATE_KEY } from "@/lib/virtual-any-input";

import { DEFAULT_AGENT_TEMPERATURE, buildAgentModelSelectOptions, normalizeAgentTemperature, resolveAgentModelSelection } from "./agentConfigModel";
import {
  CONDITION_LOOP_LIMIT_DEFAULT,
  CONDITION_LOOP_LIMIT_MAX,
  CONDITION_LOOP_LIMIT_MIN,
  normalizeConditionLoopLimit,
  parseConditionLoopLimitDraft,
} from "./conditionLoopLimit";
import { CONDITION_RULE_OPERATOR_OPTIONS } from "./conditionRuleEditorModel";
import { isSwitchableInputBoundaryType, resolveNextInputValueForBoundaryType, resolveStateTypeForInputBoundary } from "./inputValueTypeModel";
import { buildNodeCardViewModel } from "./nodeCardViewModel";
import { resolveOutputPreviewContent } from "./outputPreviewContentModel";
import { listAttachableSkillDefinitions, resolveAttachedSkillBadges } from "./skillPickerModel";
import { createStateDraftFromQuery, matchesStatePortSearch } from "./statePortCreateModel";
import { createUploadedAssetEnvelope, resolveUploadedAssetInputAccept, tryParseUploadedAssetEnvelope } from "./uploadedAssetModel";
import {
  defaultValueForStateType,
  resolveStateColorOptions,
  STATE_FIELD_TYPE_OPTIONS,
  type StateFieldDraft,
  type StateFieldType,
} from "@/editor/workspace/statePanelFields";

type TextEditorField = "title" | "description";

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
  humanReviewPending: boolean;
  selected: boolean;
  interactionLocked?: boolean;
}>();

const emit = defineEmits<{
  (event: "update-node-metadata", payload: { nodeId: string; patch: Partial<Pick<GraphNode, "name" | "description">> }): void;
  (event: "update-input-config", payload: { nodeId: string; patch: Partial<InputNode["config"]> }): void;
  (event: "update-input-state", payload: { stateKey: string; patch: Partial<StateDefinition> }): void;
  (event: "rename-state", payload: { currentKey: string; nextKey: string }): void;
  (event: "update-state", payload: { stateKey: string; patch: Partial<StateDefinition> }): void;
  (event: "remove-port-state", payload: { nodeId: string; side: "input" | "output"; stateKey: string }): void;
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

const outputDisplayModeOptions: Array<{ value: OutputNode["config"]["displayMode"]; label: string }> = [
  { value: "auto", label: "AUTO" },
  { value: "plain", label: "PLAIN" },
  { value: "markdown", label: "MD" },
  { value: "json", label: "JSON" },
];
const outputPersistFormatOptions: Array<{ value: OutputNode["config"]["persistFormat"]; label: string }> = [
  { value: "auto", label: "AUTO" },
  { value: "txt", label: "TXT" },
  { value: "md", label: "MD" },
  { value: "json", label: "JSON" },
];
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
const actionPopoverStyle = {
  "--el-popover-bg-color": "transparent",
  "--el-popover-border-color": "transparent",
  "--el-popover-padding": "0px",
  background: "transparent",
  border: "none",
  boxShadow: "none",
  padding: "0",
  "min-width": "0",
} as const;
const stateEditorPopoverStyle = {
  "--el-popover-bg-color": "transparent",
  "--el-popover-border-color": "transparent",
  "--el-popover-padding": "0px",
  background: "transparent",
  border: "none",
  boxShadow: "none",
  padding: "0",
  "min-width": "0",
} as const;
const agentAddPopoverStyle = {
  "--el-popover-bg-color": "transparent",
  "--el-popover-border-color": "transparent",
  "--el-popover-padding": "0px",
  background: "transparent",
  border: "none",
  boxShadow: "none",
  padding: "0",
  "min-width": "0",
} as const;
const stateTypeOptions = STATE_FIELD_TYPE_OPTIONS;
const conditionRuleOperatorOptions = CONDITION_RULE_OPERATOR_OPTIONS;
type AgentThinkingControlMode = "off" | "low" | "medium" | "high" | "xhigh";
const agentThinkingOptions = computed<Array<{ value: AgentThinkingControlMode; label: string }>>(() => [
  { value: "off", label: t("nodeCard.thinkingOff") },
  { value: "low", label: t("nodeCard.thinkingLow") },
  { value: "medium", label: t("nodeCard.thinkingMedium") },
  { value: "high", label: t("nodeCard.thinkingHigh") },
  { value: "xhigh", label: t("nodeCard.thinkingExtraHigh") },
]);
const agentPortPickerActions: Array<{ side: "input" | "output"; label: string; toneClass: string; placement: "bottom-start" | "bottom-end" }> = [
  { side: "input", label: "+ input", toneClass: "node-card__action-pill--input", placement: "bottom-start" },
  { side: "output", label: "+ output", toneClass: "node-card__action-pill--output", placement: "bottom-end" },
];

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
const outputPreviewContent = computed(() => {
  if (view.value.body.kind !== "output") {
    return resolveOutputPreviewContent("", "plain");
  }
  return resolveOutputPreviewContent(view.value.body.previewText, view.value.body.displayMode);
});
const conditionRuleValueDraft = ref("");
const conditionLoopLimitDraft = ref("");
const inputAssetInputRef = ref<HTMLInputElement | null>(null);
const isSkillPickerOpen = ref(false);
const activePortPickerSide = ref<"input" | "output" | null>(null);
const portStateSearch = ref("");
const portStateDraft = ref<StateFieldDraft | null>(null);
const portStateError = ref<string | null>(null);
const agentModelSelectRef = ref<{ blur?: () => void; toggleMenu?: () => void; expanded?: boolean } | null>(null);
type SelectExpose = { blur?: () => void; toggleMenu?: () => void; expanded?: boolean };
const portDraftTypeSelectRef = ref<SelectExpose | SelectExpose[] | null>(null);
const portDraftColorSelectRef = ref<SelectExpose | SelectExpose[] | null>(null);
const activeTopAction = ref<"advanced" | "delete" | "preset" | null>(null);
const topActionTimeoutRef = ref<number | null>(null);
const activeTextEditor = ref<TextEditorField | null>(null);
const activeTextEditorConfirmField = ref<TextEditorField | null>(null);
const textTriggerPointerState = ref<{
  field: TextEditorField;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
} | null>(null);
const textEditorConfirmTimeoutRef = ref<number | null>(null);
const textEditorFocusTimeoutRef = ref<number | null>(null);
const titleEditorDraft = ref("");
const descriptionEditorDraft = ref("");
const titleEditorInputRef = ref<{ focus?: () => void } | null>(null);
const descriptionEditorInputRef = ref<{ focus?: () => void } | null>(null);
const activeStateEditorConfirmAnchorId = ref<string | null>(null);
const activeRemovePortStateConfirmAnchorId = ref<string | null>(null);
const hoveredStateEditorPillAnchorId = ref<string | null>(null);
const stateEditorConfirmTimeoutRef = ref<number | null>(null);
const removePortStateConfirmTimeoutRef = ref<number | null>(null);
const activeStateEditorAnchorId = ref<string | null>(null);
const stateEditorDraft = ref<StateFieldDraft | null>(null);
const stateEditorError = ref<string | null>(null);
const stateColorOptions = computed(() => resolveStateColorOptions(stateEditorDraft.value?.definition.color ?? ""));
const portStateColorOptions = computed(() => resolveStateColorOptions(portStateDraft.value?.definition.color ?? ""));
const portStateSelectedColorStyle = computed(() => {
  const selectedColor = portStateDraft.value?.definition.color ?? "";
  const matchedOption = portStateColorOptions.value.find((option) => option.value === selectedColor);
  return {
    backgroundColor: matchedOption?.swatch || selectedColor || "#d97706",
  };
});
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
const inputStateKey = computed(() => (view.value.body.kind === "input" ? view.value.body.primaryOutput?.key ?? null : null));
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
const inputAssetLabel = computed(() => {
  switch (inputAssetType.value) {
    case "image":
      return "image";
    case "audio":
      return "audio clip";
    case "video":
      return "video";
    default:
      return "file";
  }
});
const inputAssetSummary = computed(() => {
  const asset = inputAssetEnvelope.value;
  if (!asset) {
    return "";
  }
  return `${asset.mimeType} · ${Math.max(1, Math.round(asset.size / 1024))} KB`;
});
const inputAssetTextPreview = computed(() => {
  const asset = inputAssetEnvelope.value;
  if (!asset || asset.encoding !== "text") {
    return "";
  }
  return asset.content.slice(0, 3000);
});
const inputAssetDescription = computed(() => {
  const asset = inputAssetEnvelope.value;
  if (asset) {
    return `Stored as ${asset.detectedType} upload. ${inputAssetSummary.value}`;
  }
  switch (inputAssetType.value) {
    case "image":
      return "Upload a reference image for this workflow.";
    case "audio":
      return "Upload an audio clip that this workflow should read.";
    case "video":
      return "Upload a video asset that this workflow should inspect.";
    default:
      return "Upload a file to seed this workflow.";
  }
});
const showLegacyUploadedAssetHint = computed(
  () => showAssetUploadInput.value && !inputAssetEnvelope.value && inputValueText.value.trim().length > 0,
);
const inputKnowledgeBaseOptions = computed(() => {
  const options = props.knowledgeBases.map((knowledgeBase) => ({
    value: knowledgeBase.name,
    label: knowledgeBase.label?.trim() || knowledgeBase.name,
    description: knowledgeBase.description?.trim() || "",
  }));

  const currentValue = inputKnowledgeBaseValue.value.trim();
  if (currentValue && !options.some((option) => option.value === currentValue)) {
    return [
      {
        value: currentValue,
        label: `${currentValue} (current)`,
        description: "This knowledge base is no longer available in the imported catalog.",
      },
      ...options,
    ];
  }

  return options;
});
const selectedKnowledgeBaseDescription = computed(() => {
  if (!showKnowledgeBaseInput.value) {
    return "";
  }
  const selectedOption = inputKnowledgeBaseOptions.value.find((option) => option.value === inputKnowledgeBaseValue.value);
  if (selectedOption?.description) {
    return selectedOption.description;
  }
  if (inputKnowledgeBaseOptions.value.length === 0) {
    return t("nodeCard.importKnowledgeHint");
  }
  return t("nodeCard.pickKnowledgeHint");
});
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
const portPickerMatchingStates = computed(() =>
  Object.entries(props.stateSchema)
    .map(([key, definition]) => ({
      key,
      definition,
      label: definition.name.trim() || key,
    }))
    .filter(({ key, definition }) =>
      matchesStatePortSearch(
        {
          key,
          name: definition.name,
          description: definition.description,
        },
        portStateSearch.value,
      ),
    )
    .sort((left, right) => left.label.localeCompare(right.label) || left.key.localeCompare(right.key)),
);
const portPickerTitle = computed(() => {
  if (!activePortPickerSide.value) {
    return "";
  }
  if (portStateDraft.value) {
    return activePortPickerSide.value === "input" ? t("nodeCard.createInputState") : t("nodeCard.createOutputState");
  }
  return activePortPickerSide.value === "input" ? t("nodeCard.selectInputState") : t("nodeCard.selectOutputState");
});
const conditionRuleValueDisabled = computed(
  () => props.node.kind === "condition" && props.node.config.rule.operator === "exists",
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

watch(
  () => (props.node.kind === "condition" ? props.node.config.rule.value : null),
  (ruleValue) => {
    conditionRuleValueDraft.value = ruleValue === null || ruleValue === undefined ? "" : String(ruleValue);
  },
  { immediate: true },
);

watch(
  () => (props.node.kind === "condition" ? props.node.config.loopLimit : null),
  (loopLimit) => {
    conditionLoopLimitDraft.value = loopLimit === null ? "" : String(normalizeConditionLoopLimit(loopLimit));
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

function emitConditionBranchUpdate(currentKey: string, nextKey: string, mappingKeys: string[]) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "condition") {
    return;
  }
  emit("update-condition-branch", {
    nodeId: props.nodeId,
    currentKey,
    nextKey,
    mappingKeys,
  });
}

function addConditionBranch() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "condition") {
    return;
  }
  emit("add-condition-branch", {
    nodeId: props.nodeId,
  });
}

function removeConditionBranch(branchKey: string) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "condition") {
    return;
  }
  emit("remove-condition-branch", {
    nodeId: props.nodeId,
    branchKey,
  });
}

function handleOutputPersistToggle(value: string | number | boolean) {
  if (props.node.kind !== "output") {
    return;
  }
  emitOutputConfigPatch({ persistEnabled: Boolean(value) });
}

function updateOutputDisplayMode(displayMode: OutputNode["config"]["displayMode"]) {
  emitOutputConfigPatch({ displayMode });
}

function isOutputDisplayModeActive(displayMode: OutputNode["config"]["displayMode"]) {
  return props.node.kind === "output" && props.node.config.displayMode === displayMode;
}

function updateOutputPersistFormat(persistFormat: OutputNode["config"]["persistFormat"]) {
  emitOutputConfigPatch({ persistFormat });
}

function isOutputPersistFormatActive(persistFormat: OutputNode["config"]["persistFormat"]) {
  return props.node.kind === "output" && props.node.config.persistFormat === persistFormat;
}

function handleOutputFileNameInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  emitOutputConfigPatch({ fileNameTemplate: target.value });
}

function handleOutputFileNameInputValue(value: string | number) {
  if (typeof value !== "string") {
    return;
  }
  emitOutputConfigPatch({ fileNameTemplate: value });
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
  portStateSearch.value = "";
  portStateError.value = null;
  isSkillPickerOpen.value = !isSkillPickerOpen.value;
}

function attachAgentSkill(skillKey: string) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "agent" || props.node.config.skills.includes(skillKey)) {
    return;
  }
  emitAgentConfigPatch({ skills: [...props.node.config.skills, skillKey] });
  isSkillPickerOpen.value = false;
}

function removeAgentSkill(skillKey: string) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "agent" || !props.node.config.skills.includes(skillKey)) {
    return;
  }
  emitAgentConfigPatch({ skills: props.node.config.skills.filter((candidateKey) => candidateKey !== skillKey) });
}

function openPortPicker(side: "input" | "output") {
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
  portStateSearch.value = "";
  portStateDraft.value = null;
  portStateError.value = null;
  activePortPickerSide.value = activePortPickerSide.value === side ? null : side;
}

function closePortPicker() {
  activePortPickerSide.value = null;
  portStateSearch.value = "";
  portStateDraft.value = null;
  portStateError.value = null;
}

function handlePortStateSearchInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  portStateSearch.value = target.value;
}

function handlePortStateSearchValue(value: string | number) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  portStateSearch.value = String(value ?? "");
}

function beginPortStateCreate() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  portStateDraft.value = createStateDraftFromQuery(portStateSearch.value, Object.keys(props.stateSchema));
  portStateError.value = null;
}

function backPortDraft() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  portStateDraft.value = null;
  portStateError.value = null;
}

function handlePortDraftNameInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !portStateDraft.value) {
    return;
  }
  handlePortDraftNameValue(target.value);
}

function handlePortDraftNameValue(value: string | number) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (!portStateDraft.value) {
    return;
  }
  portStateDraft.value = {
    ...portStateDraft.value,
    definition: {
      ...portStateDraft.value.definition,
      name: String(value ?? ""),
    },
  };
}

function handlePortDraftKeyInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !portStateDraft.value) {
    return;
  }
  handlePortDraftKeyValue(target.value);
}

function handlePortDraftKeyValue(value: string | number) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (!portStateDraft.value) {
    return;
  }
  portStateDraft.value = {
    ...portStateDraft.value,
    key: String(value ?? ""),
  };
}

async function handlePortDraftTypeSelect(value: string | number | boolean | undefined) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (!portStateDraft.value) {
    return;
  }
  const nextType = String(value ?? "text");
  portStateDraft.value = {
    ...portStateDraft.value,
    definition: {
      ...portStateDraft.value.definition,
      type: nextType,
      value: defaultValueForStateType(nextType as StateFieldType),
    },
  };
  await collapsePortDraftTypeSelect();
}

function handlePortDraftDescriptionInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement) || !portStateDraft.value) {
    return;
  }
  handlePortDraftDescriptionValue(target.value);
}

function handlePortDraftDescriptionValue(value: string | number) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (!portStateDraft.value) {
    return;
  }
  portStateDraft.value = {
    ...portStateDraft.value,
    definition: {
      ...portStateDraft.value.definition,
      description: String(value ?? ""),
    },
  };
}

function handlePortDraftColorInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !portStateDraft.value) {
    return;
  }
  updatePortDraftColor(target.value);
}

async function handlePortDraftColorSelect(value: string | number | boolean | undefined) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  updatePortDraftColor(String(value ?? ""));
  await collapsePortDraftColorSelect();
}

function updatePortDraftColor(color: string) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (!portStateDraft.value) {
    return;
  }
  portStateDraft.value = {
    ...portStateDraft.value,
    definition: {
      ...portStateDraft.value.definition,
      color,
    },
  };
}

async function collapsePortDraftTypeSelect() {
  await nextTick();
  const select = resolveFirstSelectExpose(portDraftTypeSelectRef.value);
  if (select?.expanded) {
    select.toggleMenu?.();
  }
  select?.blur?.();
}

async function collapsePortDraftColorSelect() {
  await nextTick();
  const select = resolveFirstSelectExpose(portDraftColorSelectRef.value);
  if (select?.expanded) {
    select.toggleMenu?.();
  }
  select?.blur?.();
}

function resolveFirstSelectExpose(select: SelectExpose | SelectExpose[] | null) {
  return Array.isArray(select) ? select[0] ?? null : select;
}

function updatePortDraftValue(value: unknown) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (!portStateDraft.value) {
    return;
  }
  portStateDraft.value = {
    ...portStateDraft.value,
    definition: {
      ...portStateDraft.value.definition,
      value,
    },
  };
}

function bindStateToPort(stateKey: string) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (!activePortPickerSide.value) {
    return;
  }
  emit("bind-port-state", {
    nodeId: props.nodeId,
    side: activePortPickerSide.value,
    stateKey,
  });
  closePortPicker();
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

function buildStateDraftFromSchema(stateKey: string): StateFieldDraft | null {
  const definition = props.stateSchema[stateKey];
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

function syncTextEditorDraftsFromNode() {
  titleEditorDraft.value = props.node.name;
  descriptionEditorDraft.value = props.node.description;
}

function isTextEditorOpen(field: TextEditorField) {
  return activeTextEditor.value === field;
}

function textEditorWidth(field: TextEditorField) {
  return field === "title" ? 360 : 420;
}

function textEditorTitle(field: TextEditorField) {
  return field === "title" ? "Edit Name" : "Edit Description";
}

function textEditorDraftValue(field: TextEditorField) {
  return field === "title" ? titleEditorDraft.value : descriptionEditorDraft.value;
}

function setTextEditorDraftValue(field: TextEditorField, value: string) {
  if (field === "title") {
    titleEditorDraft.value = value;
    return;
  }
  descriptionEditorDraft.value = value;
}

function noop() {}

function clearTextTriggerPointerState() {
  textTriggerPointerState.value = null;
}

function handleTextTriggerPointerDown(field: TextEditorField, event: PointerEvent) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (event.button !== 0) {
    return;
  }
  textTriggerPointerState.value = {
    field,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    moved: false,
  };
}

function handleTextTriggerPointerMove(field: TextEditorField, event: PointerEvent) {
  const pointerState = textTriggerPointerState.value;
  if (!pointerState || pointerState.field !== field || pointerState.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - pointerState.startClientX;
  const deltaY = event.clientY - pointerState.startClientY;
  if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
    pointerState.moved = true;
  }
}

function handleTextTriggerPointerUp(field: TextEditorField, event: PointerEvent) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  const pointerState = textTriggerPointerState.value;
  clearTextTriggerPointerState();
  if (!pointerState || pointerState.field !== field || pointerState.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - pointerState.startClientX;
  const deltaY = event.clientY - pointerState.startClientY;
  if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
    return;
  }
  if (pointerState.moved) {
    return;
  }
  handleTextEditorAction(field);
}

function focusTextEditorField(field: TextEditorField) {
  void nextTick(() => {
    clearTextEditorFocusTimeout();
    textEditorFocusTimeoutRef.value = window.setTimeout(() => {
      textEditorFocusTimeoutRef.value = null;
      if (field === "title") {
        titleEditorInputRef.value?.focus?.();
        return;
      }
      descriptionEditorInputRef.value?.focus?.();
    }, 0);
  });
}

function clearTextEditorFocusTimeout() {
  if (textEditorFocusTimeoutRef.value !== null) {
    window.clearTimeout(textEditorFocusTimeoutRef.value);
    textEditorFocusTimeoutRef.value = null;
  }
}

function clearTextEditorConfirmTimeout() {
  if (textEditorConfirmTimeoutRef.value !== null) {
    window.clearTimeout(textEditorConfirmTimeoutRef.value);
    textEditorConfirmTimeoutRef.value = null;
  }
}

function clearTextEditorConfirmState() {
  clearTextEditorConfirmTimeout();
  activeTextEditorConfirmField.value = null;
}

function startTextEditorConfirmWindow(field: TextEditorField) {
  clearTextEditorConfirmTimeout();
  activeTextEditorConfirmField.value = field;
  textEditorConfirmTimeoutRef.value = window.setTimeout(() => {
    textEditorConfirmTimeoutRef.value = null;
    if (activeTextEditorConfirmField.value === field) {
      activeTextEditorConfirmField.value = null;
    }
  }, 2000);
}

function isTextEditorConfirmOpen(field: TextEditorField) {
  return activeTextEditorConfirmField.value === field;
}

function handleTextEditorAction(field: TextEditorField) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (isTextEditorOpen(field)) {
    return;
  }
  const wasConfirmOpen = isTextEditorConfirmOpen(field);
  clearTextEditorConfirmState();
  clearRemovePortStateConfirmState();
  if (wasConfirmOpen) {
    openTextEditor(field);
    return;
  }
  closeTextEditor();
  startTextEditorConfirmWindow(field);
}

function openTextEditor(field: TextEditorField) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  clearTopActionTimeout();
  activeTopAction.value = null;
  clearTextEditorConfirmState();
  clearStateEditorConfirmState();
  clearRemovePortStateConfirmState();
  closeStateEditor();
  closePortPicker();
  isSkillPickerOpen.value = false;
  syncTextEditorDraftsFromNode();
  activeTextEditor.value = field;
  focusTextEditorField(field);
}

function closeTextEditor() {
  clearTextEditorFocusTimeout();
  activeTextEditor.value = null;
  syncTextEditorDraftsFromNode();
}

function handleTextEditorDraftInput(field: TextEditorField, value: string | number) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (typeof value !== "string") {
    return;
  }
  setTextEditorDraftValue(field, value);
}

function commitTextEditor(field: TextEditorField | null = activeTextEditor.value) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (!field) {
    return;
  }

  const nextValue = textEditorDraftValue(field).trim();
  if (field === "title") {
    if (nextValue && nextValue !== props.node.name) {
      emit("update-node-metadata", { nodeId: props.nodeId, patch: { name: nextValue } });
    }
  } else if (nextValue !== props.node.description) {
    emit("update-node-metadata", { nodeId: props.nodeId, patch: { description: nextValue } });
  }
  closeTextEditor();
}

function commitOpenTextEditorIfNeeded() {
  commitTextEditor(activeTextEditor.value);
}

function clearStateEditorConfirmTimeout() {
  if (stateEditorConfirmTimeoutRef.value !== null) {
    window.clearTimeout(stateEditorConfirmTimeoutRef.value);
    stateEditorConfirmTimeoutRef.value = null;
  }
}

function clearStateEditorConfirmState() {
  clearStateEditorConfirmTimeout();
  activeStateEditorConfirmAnchorId.value = null;
}

function clearRemovePortStateConfirmTimeout() {
  if (removePortStateConfirmTimeoutRef.value !== null) {
    window.clearTimeout(removePortStateConfirmTimeoutRef.value);
    removePortStateConfirmTimeoutRef.value = null;
  }
}

function clearRemovePortStateConfirmState() {
  clearRemovePortStateConfirmTimeout();
  activeRemovePortStateConfirmAnchorId.value = null;
}

function startRemovePortStateConfirmWindow(anchorId: string) {
  clearRemovePortStateConfirmTimeout();
  activeRemovePortStateConfirmAnchorId.value = anchorId;
  removePortStateConfirmTimeoutRef.value = window.setTimeout(() => {
    removePortStateConfirmTimeoutRef.value = null;
    if (activeRemovePortStateConfirmAnchorId.value === anchorId) {
      activeRemovePortStateConfirmAnchorId.value = null;
    }
  }, 2000);
}

function startStateEditorConfirmWindow(anchorId: string) {
  clearStateEditorConfirmTimeout();
  activeStateEditorConfirmAnchorId.value = anchorId;
  stateEditorConfirmTimeoutRef.value = window.setTimeout(() => {
    stateEditorConfirmTimeoutRef.value = null;
    if (activeStateEditorConfirmAnchorId.value === anchorId) {
      activeStateEditorConfirmAnchorId.value = null;
    }
  }, 2000);
}

function isStateEditorOpen(anchorId: string) {
  return activeStateEditorAnchorId.value === anchorId;
}

function isStateEditorConfirmOpen(anchorId: string) {
  return activeStateEditorConfirmAnchorId.value === anchorId;
}

function isRemovePortStateConfirmOpen(anchorId: string) {
  return activeRemovePortStateConfirmAnchorId.value === anchorId;
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
  const nextDraft = buildStateDraftFromSchema(stateKey);
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

function syncStateEditorDraft(nextDraft: StateFieldDraft, options?: { allowInvalidKey?: boolean }) {
  if (guardLockedGraphInteraction()) {
    return;
  }
  const currentAnchorId = activeStateEditorAnchorId.value;
  const currentDraft = stateEditorDraft.value;
  if (!currentAnchorId || !currentDraft) {
    return;
  }

  stateEditorDraft.value = nextDraft;

  const currentStateKey = currentAnchorId.split(":").at(-1) ?? "";
  const nextKey = nextDraft.key.trim();
  if (!nextKey) {
    stateEditorError.value = t("nodeCard.stateKeyEmpty");
    return;
  }
  if (nextKey !== currentStateKey && props.stateSchema[nextKey]) {
    stateEditorError.value = t("nodeCard.stateKeyExists", { key: nextKey });
    return;
  }

  stateEditorError.value = null;

  if (nextKey !== currentStateKey) {
    emit("rename-state", { currentKey: currentStateKey, nextKey });
    activeStateEditorAnchorId.value = [...currentAnchorId.split(":").slice(0, -1), nextKey].join(":");
  }

  void options;
  emit("update-state", {
    stateKey: nextKey,
    patch: {
      name: nextDraft.definition.name.trim() || nextKey,
      description: nextDraft.definition.description,
      type: nextDraft.definition.type,
      value: nextDraft.definition.value,
      color: nextDraft.definition.color,
    },
  });
}

function handleStateEditorNameInput(value: string | number) {
  if (!stateEditorDraft.value || typeof value !== "string") {
    return;
  }
  syncStateEditorDraft({
    ...stateEditorDraft.value,
    definition: {
      ...stateEditorDraft.value.definition,
      name: value,
    },
  }, { allowInvalidKey: true });
}

function handleStateEditorKeyInput(value: string | number) {
  if (!stateEditorDraft.value || typeof value !== "string") {
    return;
  }
  syncStateEditorDraft({
    ...stateEditorDraft.value,
    key: value,
  }, { allowInvalidKey: true });
}

function handleStateEditorDescriptionInput(value: string | number) {
  if (!stateEditorDraft.value || typeof value !== "string") {
    return;
  }
  syncStateEditorDraft({
    ...stateEditorDraft.value,
    definition: {
      ...stateEditorDraft.value.definition,
      description: value,
    },
  }, { allowInvalidKey: true });
}

function handleStateEditorColorInput(value: string | number) {
  if (!stateEditorDraft.value || typeof value !== "string") {
    return;
  }
  syncStateEditorDraft({
    ...stateEditorDraft.value,
    definition: {
      ...stateEditorDraft.value.definition,
      color: value,
    },
  }, { allowInvalidKey: true });
}

function handleStateEditorTypeValue(value: string | number | boolean | undefined) {
  if (typeof value !== "string" || !stateEditorDraft.value) {
    return;
  }
  syncStateEditorDraft({
    ...stateEditorDraft.value,
    definition: {
      ...stateEditorDraft.value.definition,
      type: value,
      value: defaultValueForStateType(value as StateFieldType),
    },
  }, { allowInvalidKey: true });
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

function isFloatingPanelSurfaceTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      [
        "[data-top-action-surface='true']",
        "[data-state-editor-trigger='true']",
        "[data-text-editor-trigger='true']",
        "[data-node-popup-surface='true']",
        ".node-card__top-popover",
        ".node-card__text-editor",
        ".node-card__state-editor",
        ".node-card__confirm-hint",
        ".node-card__action-popover",
        ".node-card__confirm-popover",
        ".node-card__text-editor-popper",
        ".node-card__state-editor-popper",
        ".node-card__agent-add-popover-popper",
        ".node-card__port-picker-select-popper",
        ".node-card__agent-model-popper",
      ].join(", "),
    ),
  );
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

function handleGlobalFloatingPanelPointerDown(event: PointerEvent) {
  if (!hasFloatingPanelOpen.value || isFloatingPanelSurfaceTarget(event.target)) {
    return;
  }
  closeFloatingPanels({ commitTextEditor: true });
}

function handleGlobalFloatingPanelFocusIn(event: FocusEvent) {
  if (!hasFloatingPanelOpen.value || isFloatingPanelSurfaceTarget(event.target)) {
    return;
  }
  closeFloatingPanels({ commitTextEditor: true });
}

function handleGlobalFloatingPanelKeyDown(event: KeyboardEvent) {
  if (!hasFloatingPanelOpen.value || event.key !== "Escape") {
    return;
  }
  closeFloatingPanels({ commitTextEditor: false });
}

function addGlobalFloatingPanelListeners() {
  document.addEventListener("pointerdown", handleGlobalFloatingPanelPointerDown);
  document.addEventListener("focusin", handleGlobalFloatingPanelFocusIn);
  document.addEventListener("keydown", handleGlobalFloatingPanelKeyDown);
}

function removeGlobalFloatingPanelListeners() {
  document.removeEventListener("pointerdown", handleGlobalFloatingPanelPointerDown);
  document.removeEventListener("focusin", handleGlobalFloatingPanelFocusIn);
  document.removeEventListener("keydown", handleGlobalFloatingPanelKeyDown);
}

function clearTopActionTimeout() {
  if (topActionTimeoutRef.value !== null) {
    window.clearTimeout(topActionTimeoutRef.value);
    topActionTimeoutRef.value = null;
  }
}

function clearTopActionConfirmState() {
  clearTopActionTimeout();
  if (activeTopAction.value === "delete" || activeTopAction.value === "preset") {
    activeTopAction.value = null;
  }
}

function startTopActionConfirmWindow(action: "delete" | "preset") {
  clearTopActionTimeout();
  activeTopAction.value = action;
  topActionTimeoutRef.value = window.setTimeout(() => {
    topActionTimeoutRef.value = null;
    if (activeTopAction.value === action) {
      activeTopAction.value = null;
    }
  }, 2000);
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
  if (agentModelSelectRef.value?.expanded) {
    agentModelSelectRef.value.toggleMenu?.();
  }
  agentModelSelectRef.value?.blur?.();
}

function normalizeAgentThinkingMode(value: string | null | undefined): AgentThinkingControlMode {
  if (value === "off" || value === "low" || value === "medium" || value === "high" || value === "xhigh") {
    return value;
  }
  if (value === "minimal") {
    return "low";
  }
  if (value === "on") {
    return "medium";
  }
  return "off";
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

function handleAgentBreakpointToggle() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  if (props.node.kind !== "agent") {
    return;
  }
  emit("toggle-agent-breakpoint", { nodeId: props.nodeId, enabled: !props.agentBreakpointEnabled });
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

function handleAgentTemperatureInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const nextValue = target.value === "" ? DEFAULT_AGENT_TEMPERATURE : Number(target.value);
  if (!Number.isFinite(nextValue)) {
    return;
  }
  emitAgentConfigPatch({ temperature: normalizeAgentTemperature(nextValue) });
}

function handleAgentTemperatureInputValue(value: string | number) {
  const nextValue = typeof value === "number" ? value : value === "" ? DEFAULT_AGENT_TEMPERATURE : Number(value);
  if (!Number.isFinite(nextValue)) {
    return;
  }
  emitAgentConfigPatch({ temperature: normalizeAgentTemperature(nextValue) });
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

function openInputAssetPicker() {
  if (guardLockedGraphInteraction()) {
    return;
  }
  inputAssetInputRef.value?.click();
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

  const nextLoopLimit = parseConditionLoopLimitDraft(conditionLoopLimitDraft.value);
  if (nextLoopLimit === null) {
    conditionLoopLimitDraft.value = String(normalizeConditionLoopLimit(props.node.config.loopLimit));
    return;
  }
  if (nextLoopLimit === props.node.config.loopLimit) {
    return;
  }

  emitConditionConfigPatch({ loopLimit: nextLoopLimit });
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
  updateConditionRule({ operator: String(value ?? "exists") });
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
  const nextValue = conditionRuleValueDraft.value;
  const currentValue =
    props.node.config.rule.value === null || props.node.config.rule.value === undefined ? "" : String(props.node.config.rule.value);
  if (nextValue === currentValue) {
    return;
  }
  updateConditionRule({ value: conditionRuleValueDraft.value });
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
  border-radius: 28px;
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

.node-card__top-actions {
  position: absolute;
  top: 0;
  right: 18px;
  z-index: 12;
  isolation: isolate;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  background: var(--graphite-glass-bg);
  box-shadow: var(--graphite-glass-shadow), var(--graphite-glass-highlight), var(--graphite-glass-rim);
  backdrop-filter: blur(24px) saturate(1.6) contrast(1.02);
  opacity: 0;
  pointer-events: none;
  transform: translateY(calc(-100% - 8px));
  transition: opacity 160ms ease, transform 160ms ease;
}

.node-card__top-actions::before {
  content: "";
  pointer-events: none;
  position: absolute;
  inset: 1px;
  z-index: 0;
  border-radius: inherit;
  background: var(--graphite-glass-specular), var(--graphite-glass-lens);
  mix-blend-mode: screen;
  opacity: 0.5;
}

.node-card__top-actions::after {
  content: "";
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: -12px;
  height: 12px;
}

.node-card:hover .node-card__top-actions,
.node-card--selected .node-card__top-actions,
.node-card__top-actions--visible {
  opacity: 1;
  pointer-events: auto;
}

.node-card__top-actions:hover {
  opacity: 1;
  pointer-events: auto;
}

.node-card__top-action-button {
  --el-color-primary: #c96b1f;
  position: relative;
  z-index: 1;
  width: 56px;
  height: 40px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  background: rgba(255, 252, 247, 0.94);
  color: rgba(90, 58, 28, 0.82);
  border-radius: 999px;
  box-shadow: none;
}

.node-card__top-action-button :deep(.el-icon) {
  font-size: 1.18rem;
}

.node-card__human-review-button {
  min-width: 118px;
  height: 40px;
  border: 1px solid rgba(217, 119, 6, 0.26);
  border-radius: 999px;
  background: rgba(217, 119, 6, 0.12);
  color: #9a3412;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  box-shadow: none;
}

.node-card__human-review-button:hover {
  border-color: rgba(217, 119, 6, 0.34);
  background: rgba(217, 119, 6, 0.18);
  color: #7c2d12;
}

.node-card__top-action-button:hover {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 255, 255, 0.98);
  color: #9a3412;
}

.node-card__top-action-button--delete:hover {
  color: rgb(185, 28, 28);
}

.node-card__top-action-button--confirm {
  color: #fff;
}

.node-card__top-action-button--confirm:hover {
  color: #fff;
}

.node-card__top-action-button--confirm-success,
.node-card__top-action-button--confirm-success:hover {
  border-color: rgba(34, 197, 94, 0.34);
  background: rgb(34, 197, 94);
  color: #fff;
}

.node-card__top-action-button--confirm-danger,
.node-card__top-action-button--confirm-danger:hover {
  border-color: rgba(185, 28, 28, 0.3);
  background: rgb(185, 28, 28);
  color: #fff;
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

.node-card__body--input > .node-card__surface-textarea,
.node-card__body--agent > .node-card__surface-textarea {
  flex: 1 1 auto;
  min-height: 0;
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
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
  min-height: 34px;
  min-width: 132px;
  max-width: 100%;
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
  min-width: 212px;
}

.node-card__port-pill:focus-visible,
.node-card__port-pill--revealed {
  border-color: rgba(154, 52, 18, 0.14);
  background: rgba(255, 250, 241, 0.94);
  box-shadow: 0 10px 22px rgba(60, 41, 20, 0.08);
}

.node-card__port-pill--create {
  border-color: color-mix(in srgb, var(--node-card-port-accent) 34%, transparent);
  background: color-mix(in srgb, var(--node-card-port-accent) 10%, rgba(255, 250, 241, 0.96));
  color: #1f2937;
  box-shadow: 0 10px 20px rgba(60, 41, 20, 0.08);
}

.node-card__port-pill-create-badge {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  border-radius: 999px;
  padding: 0 7px;
  background: color-mix(in srgb, var(--node-card-port-accent) 16%, rgba(255, 255, 255, 0.92));
  color: var(--node-card-port-accent);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  line-height: 1;
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
  opacity: 0;
  pointer-events: none;
}

.node-card__port-pill-label {
  display: inline-flex;
  align-items: center;
  padding-inline: 0;
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
  font-size: 1.02rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}

.node-card__port-pill-label-text {
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

.node-card__chip-row,
.node-card__action-row,
.node-card__output-toolbar,
.node-card__condition-topline {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}

.node-card__chip-row {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.node-card__chip {
  display: inline-flex;
  align-items: center;
  min-height: 52px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 22px;
  padding: 0 18px;
  background: rgba(255, 255, 255, 0.9);
  font-size: 1rem;
  color: #3c2914;
}

.node-card__chip--muted {
  color: rgba(60, 41, 20, 0.72);
  background: rgba(250, 243, 231, 0.9);
}

.node-card__action-row {
  justify-content: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}

.node-card__agent-runtime-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  align-items: center;
  justify-content: stretch;
}

.node-card__agent-model-select {
  width: 100%;
  --el-color-primary: #c96b1f;
  --el-border-radius-base: 16px;
  --el-border-color: rgba(154, 52, 18, 0.14);
  --el-text-color-primary: #3c2914;
}

.node-card__agent-model-select-shell {
  width: 100%;
  min-width: 0;
}

.node-card__agent-model-select :deep(.el-select__wrapper) {
  min-height: 48px;
  border-radius: 16px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
  padding: 0 14px;
}

.node-card__agent-model-select :deep(.el-select__wrapper:hover) {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 252, 247, 0.94);
}

.node-card__agent-model-select :deep(.el-select__wrapper.is-focused) {
  border-color: rgba(201, 107, 31, 0.32);
  box-shadow:
    0 0 0 3px rgba(201, 107, 31, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.node-card__agent-model-select :deep(.el-select__placeholder) {
  color: rgba(60, 41, 20, 0.48);
}

.node-card__agent-model-select :deep(.el-select__selected-item),
.node-card__agent-model-select :deep(.el-select__input-text),
.node-card__agent-model-select :deep(.el-select__selection .el-tag) {
  color: #3c2914;
  font-size: 0.92rem;
}

.node-card__agent-model-select :deep(.is-disabled .el-select__wrapper) {
  opacity: 0.62;
  background: rgba(250, 243, 231, 0.78);
}

:deep(.node-card__agent-model-popper.el-popper) {
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 16px;
  background: rgba(255, 250, 241, 0.98);
  box-shadow: 0 20px 40px rgba(60, 41, 20, 0.12);
}

:deep(.node-card__agent-model-popper .el-select-dropdown__list) {
  padding: 8px;
}

:deep(.node-card__agent-model-popper .el-select-dropdown__item) {
  min-height: 38px;
  border-radius: 12px;
  color: #3c2914;
}

:deep(.node-card__agent-model-popper .el-select-dropdown__item.hover),
:deep(.node-card__agent-model-popper .el-select-dropdown__item:hover) {
  background: rgba(154, 52, 18, 0.08);
}

:deep(.node-card__agent-model-popper .el-select-dropdown__item.is-selected) {
  color: #9a3412;
  background: rgba(154, 52, 18, 0.12);
}

.node-card__agent-toggle-card {
  display: grid;
  grid-template-columns: 20px 56px;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  min-height: 48px;
  gap: 10px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 16px;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
  transition:
    border-color 140ms ease,
    background 140ms ease,
    box-shadow 140ms ease;
}

.node-card__agent-toggle-card--thinking {
  grid-template-columns: 20px minmax(0, 1fr);
}

.node-card__agent-toggle-card:hover {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 252, 247, 0.94);
}

.node-card__agent-toggle-card:focus-within {
  border-color: rgba(201, 107, 31, 0.32);
  box-shadow:
    0 0 0 3px rgba(201, 107, 31, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.node-card__agent-toggle-card--enabled {
  border-color: rgba(201, 107, 31, 0.28);
  background: rgba(201, 107, 31, 0.1);
}

.node-card__agent-thinking-icon {
  width: 20px;
  height: 20px;
}

.node-card__agent-breakpoint-icon {
  width: 20px;
  height: 20px;
}

.node-card__agent-thinking-icon,
.node-card__agent-breakpoint-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(111, 67, 30, 0.72);
  transition: color 140ms ease;
}

.node-card__agent-thinking-icon :deep(svg),
.node-card__agent-breakpoint-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.node-card__agent-thinking-icon--enabled,
.node-card__agent-breakpoint-icon--enabled {
  color: #b45309;
}

.node-card__agent-toggle-switch {
  justify-self: end;
  --el-switch-on-color: #c96b1f;
  --el-switch-off-color: rgba(154, 52, 18, 0.24);
}

.node-card__agent-thinking-select {
  width: 100%;
  min-width: 0;
  --el-color-primary: #c96b1f;
  --el-border-radius-base: 999px;
}

.node-card__agent-thinking-select :deep(.el-select__wrapper) {
  min-height: 32px;
  border-radius: 999px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 0 0 1px rgba(154, 52, 18, 0.12) inset;
}

.node-card__agent-thinking-select :deep(.el-select__placeholder) {
  color: #7c3d12;
  font-size: 12px;
  font-weight: 700;
}

:deep(.node-card__agent-toggle-hint-popper.el-popper) {
  border: 0;
  background: transparent;
  box-shadow: none;
}

.node-card__breakpoint-timing-select {
  --el-color-primary: #c96b1f;
  --el-border-radius-base: 12px;
}

.node-card__breakpoint-timing-select :deep(.el-select__wrapper) {
  min-height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  background: rgba(255, 255, 255, 0.86);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

:deep(.node-card__breakpoint-timing-popper.el-popper) {
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 14px;
  background: rgba(255, 250, 241, 0.98);
}

.node-card__action-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 8px 16px;
  border: 1px dashed rgba(154, 52, 18, 0.24);
  font-size: 0.92rem;
  font-weight: 500;
}

.node-card__action-pill-button {
  cursor: pointer;
}

.node-card__action-pill--skill {
  color: #2563eb;
  border-color: rgba(37, 99, 235, 0.28);
  background: rgba(239, 246, 255, 0.84);
}

.node-card__action-pill--input {
  color: #16a34a;
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(220, 252, 231, 0.72);
}

.node-card__action-pill--output {
  color: #d97706;
  border-color: rgba(217, 119, 6, 0.3);
  background: rgba(254, 243, 199, 0.72);
}

.node-card__action-pill--disabled {
  opacity: 0.58;
}

.node-card__agent-add-popover {
  display: grid;
  gap: 12px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 16px;
  padding: 12px;
  background: rgba(255, 244, 232, 0.96);
  box-shadow: 0 16px 34px rgba(60, 41, 20, 0.12);
  color: #3c2914;
}

:deep(.node-card__agent-add-popover-popper.el-popper) {
  border-radius: 16px;
  background: transparent;
  padding: 0;
  border: 0;
  box-shadow: none;
}

:deep(.node-card__agent-add-popover .el-input__wrapper),
:deep(.node-card__agent-add-popover .el-select__wrapper) {
  min-height: 36px;
  border-radius: 12px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  background: rgba(255, 251, 246, 0.88);
  box-shadow: none;
}

:deep(.node-card__agent-add-popover .el-input__wrapper.is-focus),
:deep(.node-card__agent-add-popover .el-select__wrapper.is-focused) {
  border-color: rgba(201, 107, 31, 0.28);
  box-shadow: 0 0 0 2px rgba(201, 107, 31, 0.1);
}

:deep(.node-card__agent-add-popover .el-textarea__inner) {
  border-radius: 12px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  background: rgba(255, 251, 246, 0.88);
  box-shadow: none;
  color: #3c2914;
}

:deep(.node-card__agent-add-popover .el-textarea__inner:focus) {
  border-color: rgba(201, 107, 31, 0.28);
  box-shadow: 0 0 0 2px rgba(201, 107, 31, 0.1);
}

.node-card__skill-picker {
  display: grid;
  gap: 10px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 18px;
  padding: 14px;
  background: rgba(255, 250, 241, 0.98);
  box-shadow: 0 20px 40px rgba(60, 41, 20, 0.12);
}

.node-card__skill-picker-title {
  font-size: 0.98rem;
  font-weight: 600;
  color: #1f2937;
}

.node-card__skill-picker-copy {
  font-size: 0.82rem;
  line-height: 1.55;
  color: rgba(60, 41, 20, 0.72);
}

.node-card__skill-panel-message {
  border-radius: 16px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  background: rgba(255, 255, 255, 0.82);
  padding: 12px 14px;
  font-size: 0.84rem;
  line-height: 1.5;
  color: rgba(60, 41, 20, 0.72);
}

.node-card__skill-panel-message--error {
  border-color: rgba(185, 28, 28, 0.18);
  background: rgba(254, 242, 242, 0.92);
  color: rgb(153, 27, 27);
}

.node-card__skill-option {
  display: grid;
  gap: 6px;
  border-radius: 16px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  background: rgba(255, 255, 255, 0.88);
  padding: 12px 14px;
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.node-card__skill-option:hover {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 252, 247, 0.98);
  transform: translateY(-1px);
}

.node-card__skill-option-title {
  font-size: 0.92rem;
  font-weight: 600;
  color: #1f2937;
}

.node-card__skill-option-copy {
  font-size: 0.8rem;
  line-height: 1.5;
  color: rgba(60, 41, 20, 0.72);
}

.node-card__skill-option-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #2563eb;
}

.node-card__skill-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.node-card__skill-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  background: rgba(239, 246, 255, 0.88);
  padding: 6px 10px;
  font-size: 0.76rem;
  font-weight: 600;
  color: #2563eb;
}

.node-card__skill-badge-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: currentColor;
  cursor: pointer;
}

.node-card__port-picker {
  display: grid;
  gap: 12px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 18px;
  padding: 14px;
  background: rgba(255, 250, 241, 0.98);
  box-shadow: 0 20px 40px rgba(60, 41, 20, 0.12);
}

.node-card__port-picker-title {
  font-size: 0.98rem;
  font-weight: 600;
  color: #1f2937;
}

.node-card__port-picker-form {
  display: grid;
  gap: 10px;
}

.node-card__port-picker-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.node-card__port-picker-color-value,
.node-card__port-picker-color-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.node-card__port-picker-color-dot {
  width: 10px;
  height: 10px;
  flex: none;
  border: 1px solid rgba(60, 41, 20, 0.16);
  border-radius: 999px;
}

.node-card__port-picker-search {
  width: 100%;
}

.node-card__port-picker-hint {
  font-size: 0.76rem;
  line-height: 1.55;
  color: rgba(60, 41, 20, 0.68);
}

.node-card__port-picker-hint--error {
  color: rgb(153, 27, 27);
}

.node-card__port-picker-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.node-card__port-picker-button {
  min-height: 32px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.88);
  color: rgba(60, 41, 20, 0.78);
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.node-card__port-picker-button--primary {
  border-color: rgba(21, 128, 61, 0.18);
  background: rgba(240, 253, 244, 0.92);
  color: #15803d;
}

.node-card__agent-add-popover.node-card__skill-picker,
.node-card__agent-add-popover.node-card__port-picker {
  border-radius: 16px;
  padding: 12px;
  background: rgba(255, 244, 232, 0.96);
  box-shadow: 0 16px 34px rgba(60, 41, 20, 0.12);
}

.node-card__state-editor {
  display: grid;
  gap: 12px;
}

.node-card__state-editor-title,
.node-card__top-popover-title {
  font-size: 0.96rem;
  font-weight: 600;
  color: #2f2114;
}

.node-card__top-popover {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 14px;
  background: rgba(255, 244, 232, 0.96);
  box-shadow: 0 16px 34px rgba(60, 41, 20, 0.12);
}

.node-card__advanced-popover-content {
  display: grid;
  gap: 10px;
}

.node-card__top-popover-copy {
  font-size: 0.82rem;
  line-height: 1.5;
  color: rgba(60, 41, 20, 0.72);
}

.node-card__top-popover-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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

.node-card__confirm-hint--toggle {
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

.node-card__port-state-key {
  font-size: 0.78rem;
  line-height: 1.5;
  color: rgba(60, 41, 20, 0.68);
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

.node-card__surface--tall {
  min-height: 180px;
}

.node-card__surface--output {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
}

.node-card__input-picker {
  display: grid;
  gap: 10px;
}

.node-card__input-upload {
  display: grid;
  gap: 10px;
}

.node-card__input-boundary-toggle {
  justify-self: start;
  min-width: 136px;
  --el-segmented-bg-color: rgba(255, 248, 240, 0.92);
  --el-segmented-item-selected-bg-color: rgba(255, 255, 255, 0.98);
  --el-segmented-item-selected-color: #8c4a14;
  --el-segmented-color: rgba(90, 58, 28, 0.82);
  --el-fill-color-light: rgba(255, 248, 240, 0.92);
  --el-border-radius-base: 999px;
  --el-border-radius-round: 999px;
  --el-border-color: rgba(154, 52, 18, 0.14);
  --el-color-primary: #c96b1f;
  --el-text-color-primary: rgba(90, 58, 28, 0.88);
}

.node-card__input-boundary-toggle :deep(.el-segmented) {
  padding: 4px;
  border-radius: 999px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.58),
    0 8px 18px rgba(120, 53, 15, 0.06);
}

.node-card__input-boundary-toggle :deep(.el-segmented__group) {
  gap: 4px;
}

.node-card__input-boundary-toggle :deep(.el-segmented__item) {
  min-height: 30px;
  min-width: 38px;
  border-radius: 999px;
}

.node-card__input-boundary-toggle :deep(.el-segmented__item-label) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 100%;
  line-height: 1;
}

.node-card__input-boundary-toggle :deep(.el-segmented__item-selected) {
  box-shadow: 0 6px 14px rgba(120, 53, 15, 0.1);
}

.node-card__input-boundary-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
}

.node-card__input-boundary-icon {
  width: 18px;
  height: 18px;
}

.node-card__input-select {
  min-height: 48px;
}

.node-card__input-meta {
  font-size: 0.84rem;
  line-height: 1.5;
  color: rgba(60, 41, 20, 0.7);
}

.node-card__asset-dropzone {
  display: grid;
  min-height: 176px;
  place-items: center;
  gap: 8px;
  border: 1px dashed rgba(154, 52, 18, 0.24);
  border-radius: 24px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.84);
  color: #3c2914;
  text-align: center;
  cursor: pointer;
}

.node-card__asset-dropzone-title {
  font-size: 1rem;
  font-weight: 600;
}

.node-card__asset-dropzone-copy {
  font-size: 0.84rem;
  line-height: 1.5;
  color: rgba(60, 41, 20, 0.68);
}

.node-card__asset-preview-card {
  display: grid;
  gap: 12px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 24px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.88);
}

.node-card__asset-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.node-card__asset-action {
  min-height: 30px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  padding: 0 12px;
  background: rgba(255, 250, 241, 0.92);
  color: rgba(60, 41, 20, 0.78);
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
}

.node-card__asset-action--danger {
  border-color: rgba(185, 28, 28, 0.2);
  color: rgb(153, 27, 27);
  background: rgba(254, 242, 242, 0.94);
}

.node-card__asset-media-shell {
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  background: rgba(248, 242, 234, 0.84);
}

.node-card__asset-media-shell--audio {
  padding: 14px;
  background: rgba(255, 255, 255, 0.9);
}

.node-card__asset-image,
.node-card__asset-video {
  display: block;
  max-height: 240px;
  width: 100%;
  object-fit: contain;
}

.node-card__asset-audio {
  width: 100%;
}

.node-card__asset-file {
  display: grid;
  gap: 8px;
}

.node-card__asset-name {
  font-size: 1rem;
  font-weight: 600;
  color: #1f2937;
}

.node-card__asset-summary {
  font-size: 0.82rem;
  line-height: 1.5;
  color: rgba(60, 41, 20, 0.68);
}

.node-card__asset-text {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  border-radius: 16px;
  background: rgba(248, 242, 234, 0.84);
  padding: 14px;
  font-size: 0.78rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  color: #1f2937;
}

.node-card__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.node-card__surface-textarea {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  resize: none;
  font: inherit;
}

.node-card__surface-meta {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 0.88rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.82);
}

.node-card__preview {
  flex: 1 1 auto;
  min-height: 0;
  display: block;
  overflow: auto;
  border-radius: 20px;
  background: rgba(248, 242, 234, 0.84);
  padding: 18px;
  text-align: left;
  font-size: 0.95rem;
  line-height: 1.62;
  color: #1f2937;
}

.node-card__preview--empty {
  display: grid;
  place-items: center;
  text-align: center;
  color: rgba(31, 41, 55, 0.82);
}

.node-card__preview-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
}

.node-card__preview--json .node-card__preview-text {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.84rem;
  line-height: 1.55;
}

.node-card__preview-markdown {
  display: grid;
  gap: 0.65rem;
}

.node-card__preview-markdown :deep(h1),
.node-card__preview-markdown :deep(h2),
.node-card__preview-markdown :deep(h3),
.node-card__preview-markdown :deep(p),
.node-card__preview-markdown :deep(ul) {
  margin: 0;
}

.node-card__preview-markdown :deep(h1) {
  font-size: 1.22rem;
  line-height: 1.25;
}

.node-card__preview-markdown :deep(h2) {
  font-size: 1.08rem;
  line-height: 1.3;
}

.node-card__preview-markdown :deep(h3) {
  font-size: 1rem;
  line-height: 1.35;
}

.node-card__preview-markdown :deep(ul) {
  display: grid;
  gap: 0.35rem;
  padding-left: 1.1rem;
}

.node-card__preview-markdown :deep(code) {
  border-radius: 6px;
  background: rgba(154, 52, 18, 0.08);
  padding: 0.08rem 0.28rem;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.88em;
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

.node-card__output-persist-card {
  display: grid;
  grid-template-columns: auto 56px;
  align-items: center;
  justify-self: end;
  min-height: 48px;
  gap: 10px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 16px;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.node-card__output-persist-card:hover {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 252, 247, 0.94);
}

.node-card__output-persist-card:focus-within {
  border-color: rgba(201, 107, 31, 0.32);
  box-shadow:
    0 0 0 3px rgba(201, 107, 31, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.node-card__output-persist-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: max-content;
  color: rgba(111, 67, 30, 0.72);
  font-size: 0.84rem;
  font-weight: 600;
  transition: color 140ms ease;
}

.node-card__output-persist-icon::after {
  content: "Save";
  margin-left: 7px;
}

.node-card__output-persist-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.node-card__output-persist-icon--enabled {
  color: #b45309;
}

.node-card__output-persist-switch {
  justify-self: end;
  --el-switch-on-color: #c96b1f;
  --el-switch-off-color: rgba(154, 52, 18, 0.24);
}

.node-card__advanced {
  display: flex;
  justify-content: center;
  font-size: 0.94rem;
  letter-spacing: 0.12em;
  color: rgba(60, 41, 20, 0.8);
}

.node-card__advanced-panel {
  overflow: hidden;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.76);
  padding: 0;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease;
}

.node-card__advanced-panel[open] {
  border-color: rgba(154, 52, 18, 0.18);
  background: rgba(255, 252, 247, 0.88);
  box-shadow: 0 10px 22px rgba(120, 53, 15, 0.06);
}

.node-card__advanced-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;
  padding: 12px 16px;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.node-card__advanced-summary-copy {
  display: grid;
  gap: 3px;
}

.node-card__advanced-summary-label {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(60, 41, 20, 0.84);
}

.node-card__advanced-summary-meta {
  font-size: 0.68rem;
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.56);
}

.node-card__advanced-summary-icon {
  position: relative;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  background: rgba(255, 255, 255, 0.82);
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease;
}

.node-card__advanced-summary-icon::before {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  width: 8px;
  height: 8px;
  border-right: 2px solid rgba(154, 52, 18, 0.74);
  border-bottom: 2px solid rgba(154, 52, 18, 0.74);
  transform: rotate(45deg) translateY(-1px);
}

.node-card__advanced-panel[open] .node-card__advanced-summary {
  border-bottom: 1px solid rgba(154, 52, 18, 0.1);
  background: rgba(255, 248, 240, 0.72);
}

.node-card__advanced-panel[open] .node-card__advanced-summary-icon {
  border-color: rgba(201, 107, 31, 0.24);
  background: rgba(255, 250, 242, 0.96);
  transform: rotate(180deg);
}

.node-card__advanced-summary::-webkit-details-marker {
  display: none;
}

.node-card__advanced-content {
  display: grid;
  gap: 12px;
  padding: 14px 16px 16px;
}

.node-card__control-row {
  display: grid;
  gap: 8px;
}

.node-card__control-label {
  font-size: 0.76rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.74);
}

.node-card__control-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.node-card__control-button {
  min-height: 30px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.8);
  color: rgba(60, 41, 20, 0.74);
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.node-card__control-button--active {
  border-color: rgba(154, 52, 18, 0.34);
  background: rgba(154, 52, 18, 0.12);
  color: rgba(154, 52, 18, 0.96);
}

.node-card__control-input {
  min-height: 36px;
  width: 100%;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 14px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.86);
  color: #1f2937;
  font-size: 0.82rem;
}

.node-card__control-select {
  width: 100%;
}

.node-card__control-textarea {
  min-height: 112px;
  width: 100%;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 14px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.86);
  color: #1f2937;
  font: inherit;
  resize: vertical;
}

.node-card__condition-editor {
  display: grid;
  gap: 12px;
  margin-bottom: 4px;
}

.node-card__surface--condition {
  display: grid;
  gap: 14px;
}

.node-card__condition-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  align-items: stretch;
}

.node-card__condition-source-row {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.node-card__port-pill-row--condition-source {
  width: 100%;
  min-width: 0;
}

.node-card__condition-source-empty {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  width: 100%;
  border: 1px dashed rgba(154, 52, 18, 0.2);
  border-radius: 18px;
  padding: 0 14px;
  background: rgba(255, 252, 245, 0.86);
  color: rgba(120, 53, 15, 0.72);
  font-size: 0.84rem;
}

.node-card__condition-controls-row {
  --node-card-condition-loop-column: clamp(6.5rem, 22%, 8rem);
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) var(--node-card-condition-loop-column);
  gap: 12px;
  align-items: end;
}

.node-card__condition-controls-row > .node-card__control-row {
  min-width: 0;
}

.node-card__condition-editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.node-card__loop-control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.node-card__loop-label {
  font-size: 0.76rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.74);
}

.node-card__loop-input {
  min-height: 36px;
  width: 88px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 14px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.86);
  color: #1f2937;
  font-size: 0.84rem;
  text-align: right;
}

.node-card__loop-input--condition {
  width: 100%;
}

.node-card__condition-rule {
  font-size: 1rem;
  color: #1f2937;
}

.node-card__branch-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.node-card__branch-editor {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.35fr) auto;
  gap: 10px;
  border-radius: 16px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  padding: 12px;
  background: rgba(255, 248, 240, 0.84);
}

.node-card__branch-field {
  display: grid;
  gap: 6px;
}

.node-card__branch-field-label {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.72);
}

.node-card__branch-input {
  min-height: 38px;
  width: 100%;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 12px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.88);
  color: #1f2937;
  font-size: 0.84rem;
}

.node-card__branch-input--mapping {
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
}

.node-card__branch-remove {
  align-self: end;
  min-height: 38px;
  border: 1px solid rgba(185, 28, 28, 0.16);
  border-radius: 12px;
  padding: 0 12px;
  background: rgba(254, 242, 242, 0.9);
  color: rgba(185, 28, 28, 0.9);
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.node-card__branch-route {
  grid-column: 1 / -1;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  justify-self: start;
  min-height: 34px;
  border: 1px solid rgba(124, 58, 237, 0.16);
  border-radius: 999px;
  padding: 0 12px;
  background: rgba(245, 243, 255, 0.92);
  color: rgba(91, 33, 182, 0.9);
}

.node-card__branch-route-label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.node-card__branch-route-target {
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  text-transform: none;
}

.node-card__branch-route--unrouted {
  border-color: rgba(120, 53, 15, 0.14);
  background: rgba(255, 251, 235, 0.94);
  color: rgba(120, 53, 15, 0.72);
}

.node-card__branch-add {
  min-height: 40px;
  justify-self: end;
  border: 1px dashed rgba(154, 52, 18, 0.24);
  border-radius: 999px;
  padding: 0 16px;
  background: rgba(255, 252, 245, 0.92);
  color: rgba(154, 52, 18, 0.9);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}
</style>
