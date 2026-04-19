<template>
  <article class="node-card" :class="{ 'node-card--selected': selected }" @click.capture="handleNodeCardClickCapture">
    <div
      class="node-card__top-actions"
      :class="{ 'node-card__top-actions--visible': isTopActionVisible }"
      data-top-action-surface="true"
      @pointerdown.stop
      @click.stop
    >
      <ElPopover
        v-if="hasAdvancedSettings"
        :visible="activeTopAction === 'advanced'"
        placement="bottom-end"
        :width="view.body.kind === 'output' ? 340 : 280"
        popper-class="node-card__action-popover"
      >
        <template #reference>
          <ElButton circle class="node-card__top-action-button node-card__top-action-button--advanced" @click.stop="toggleAdvancedPanel">
            <ElIcon><Operation /></ElIcon>
          </ElButton>
        </template>
        <div class="node-card__top-popover" data-node-popup-surface="true">
          <div class="node-card__top-popover-title">Advanced</div>
          <div v-if="view.body.kind === 'agent'" class="node-card__advanced-popover-content">
            <label class="node-card__control-row">
              <span class="node-card__control-label">Temperature</span>
              <ElInput
                :model-value="agentTemperatureInput"
                type="number"
                inputmode="decimal"
                @update:model-value="handleAgentTemperatureInputValue"
              />
            </label>
          </div>
          <div v-else-if="view.body.kind === 'output'" class="node-card__advanced-popover-content">
            <div class="node-card__control-row">
              <span class="node-card__control-label">Display</span>
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
              <span class="node-card__control-label">Format</span>
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
              <span class="node-card__control-label">FileName</span>
              <ElInput
                :model-value="view.body.fileNameTemplate"
                :placeholder="view.title || 'Output'"
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
            circle
            data-top-action-surface="true"
            class="node-card__top-action-button node-card__top-action-button--preset"
            :class="{ 'node-card__top-action-button--confirm node-card__top-action-button--confirm-success': activeTopAction === 'preset' }"
            @click.stop="handlePresetActionClick"
          >
            <ElIcon v-if="activeTopAction === 'preset'"><Check /></ElIcon>
            <ElIcon v-else><CollectionTag /></ElIcon>
          </ElButton>
        </template>
        <div class="node-card__confirm-hint node-card__confirm-hint--preset">Save preset?</div>
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
            circle
            data-top-action-surface="true"
            class="node-card__top-action-button node-card__top-action-button--delete"
            :class="{ 'node-card__top-action-button--confirm node-card__top-action-button--confirm-danger': activeTopAction === 'delete' }"
            @click.stop="handleDeleteActionClick"
          >
            <ElIcon v-if="activeTopAction === 'delete'"><Check /></ElIcon>
            <ElIcon v-else><Delete /></ElIcon>
          </ElButton>
        </template>
        <div class="node-card__confirm-hint node-card__confirm-hint--delete">Delete node?</div>
      </ElPopover>
    </div>
    <header class="node-card__header">
      <div class="node-card__eyebrow">{{ view.kindLabel }}</div>
      <h3 class="node-card__title">{{ view.title }}</h3>
    </header>

    <p class="node-card__description">{{ view.description }}</p>

    <section v-if="view.body.kind === 'input'" class="node-card__body node-card__body--input">
      <div class="node-card__port-row node-card__port-row--single node-card__port-row--input-boundary">
        <ElSegmented
          class="node-card__input-boundary-toggle"
          :model-value="inputBoundarySelection"
          :options="inputTypeOptions"
          aria-label="Input boundary mode"
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
            :visible="isStateEditorOpen(`input-primary-output:${view.body.primaryOutput.key}`)"
            placement="bottom-end"
            :width="340"
            popper-class="node-card__state-editor-popper"
          >
            <template #reference>
              <span
                class="node-card__port-pill node-card__port-pill--output node-card__port-pill--dock-end"
                :style="{ '--node-card-port-accent': view.body.primaryOutput.stateColor }"
              >
                <span
                  class="node-card__port-pill-label"
                  @dblclick.stop="openStateEditor(`input-primary-output:${view.body.primaryOutput.key}`, view.body.primaryOutput.key)"
                >
                  {{ view.body.primaryOutput.label }}
                </span>
                <span
                  class="node-card__port-pill-anchor-slot"
                  :data-anchor-slot-id="`${nodeId}:state-out:${view.body.primaryOutput.key}`"
                  aria-hidden="true"
                />
              </span>
            </template>
            <div v-if="stateEditorDraft" class="node-card__state-editor" data-node-popup-surface="true">
              <div class="node-card__state-editor-title">Edit State</div>
              <label class="node-card__control-row">
                <span class="node-card__control-label">Name</span>
                <ElInput :model-value="stateEditorDraft.definition.name" @update:model-value="handleStateEditorNameInput" />
              </label>
              <label class="node-card__control-row">
                <span class="node-card__control-label">Key</span>
                <ElInput :model-value="stateEditorDraft.key" @update:model-value="handleStateEditorKeyInput" />
              </label>
              <label class="node-card__control-row">
                <span class="node-card__control-label">Type</span>
                <select class="node-card__control-select" :value="stateEditorDraft.definition.type" @change="handleStateEditorTypeChange">
                  <option v-for="typeOption in stateTypeOptions" :key="typeOption" :value="typeOption">{{ typeOption }}</option>
                </select>
              </label>
              <label class="node-card__control-row">
                <span class="node-card__control-label">Description</span>
                <ElInput
                  type="textarea"
                  :rows="3"
                  :model-value="stateEditorDraft.definition.description"
                  @update:model-value="handleStateEditorDescriptionInput"
                />
              </label>
              <label class="node-card__control-row">
                <span class="node-card__control-label">Color</span>
                <ElInput :model-value="stateEditorDraft.definition.color" @update:model-value="handleStateEditorColorInput" />
              </label>
              <StateDefaultValueEditor :field="stateEditorDraft.definition" @update-value="updateStateEditorValue" />
              <div v-if="stateEditorError" class="node-card__port-picker-hint node-card__port-picker-hint--error">{{ stateEditorError }}</div>
              <div class="node-card__top-popover-actions">
                <ElButton size="small" @click="closeStateEditor">Cancel</ElButton>
                <ElButton size="small" type="primary" @click="commitStateEditor">Save</ElButton>
              </div>
            </div>
          </ElPopover>
        </div>
      </div>
      <div v-if="showKnowledgeBaseInput" class="node-card__surface node-card__input-picker">
        <label class="node-card__control-row">
          <span class="node-card__control-label">Knowledge Base</span>
          <select
            class="node-card__control-select node-card__input-select"
            :value="inputKnowledgeBaseValue"
            :disabled="inputKnowledgeBaseOptions.length === 0"
            @pointerdown.stop
            @click.stop
            @change="handleInputKnowledgeBaseChange"
          >
            <option value="">{{ inputKnowledgeBaseOptions.length === 0 ? "No knowledge bases found" : "Select knowledge base" }}</option>
            <option v-for="option in inputKnowledgeBaseOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
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
          Current value is raw text. Uploading a file will replace it with an uploaded asset envelope.
        </div>
      </div>
      <textarea
        v-else-if="isInputValueEditable"
        class="node-card__surface node-card__surface-textarea"
        :value="inputValueText"
        placeholder="Enter input value"
        @pointerdown.stop
        @click.stop
        @input="handleInputValueInput"
      />
      <div v-else class="node-card__surface node-card__surface--tall">{{ view.body.valueText || "Empty input" }}</div>
    </section>

    <section v-else-if="view.body.kind === 'agent'" class="node-card__body node-card__body--agent">
      <div class="node-card__port-grid">
        <div class="node-card__port-column">
          <div v-for="port in view.inputs" :key="port.key" class="node-card__port-pill-row">
            <ElPopover
              :visible="isStateEditorOpen(`agent-input:${port.key}`)"
              placement="bottom-start"
              :width="340"
              popper-class="node-card__state-editor-popper"
            >
              <template #reference>
                <span
                  class="node-card__port-pill node-card__port-pill--input node-card__port-pill--dock-start"
                  :style="{ '--node-card-port-accent': port.stateColor }"
                >
                  <span
                    class="node-card__port-pill-anchor-slot node-card__port-pill-anchor-slot--leading"
                    :data-anchor-slot-id="`${nodeId}:state-in:${port.key}`"
                    aria-hidden="true"
                  />
                  <span class="node-card__port-pill-label" @dblclick.stop="openStateEditor(`agent-input:${port.key}`, port.key)">{{ port.label }}</span>
                </span>
              </template>
              <div v-if="stateEditorDraft" class="node-card__state-editor" data-node-popup-surface="true">
                <div class="node-card__state-editor-title">Edit State</div>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">Name</span>
                  <ElInput :model-value="stateEditorDraft.definition.name" @update:model-value="handleStateEditorNameInput" />
                </label>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">Key</span>
                  <ElInput :model-value="stateEditorDraft.key" @update:model-value="handleStateEditorKeyInput" />
                </label>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">Type</span>
                  <select class="node-card__control-select" :value="stateEditorDraft.definition.type" @change="handleStateEditorTypeChange">
                    <option v-for="typeOption in stateTypeOptions" :key="typeOption" :value="typeOption">{{ typeOption }}</option>
                  </select>
                </label>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">Description</span>
                  <ElInput
                    type="textarea"
                    :rows="3"
                    :model-value="stateEditorDraft.definition.description"
                    @update:model-value="handleStateEditorDescriptionInput"
                  />
                </label>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">Color</span>
                  <ElInput :model-value="stateEditorDraft.definition.color" @update:model-value="handleStateEditorColorInput" />
                </label>
                <StateDefaultValueEditor :field="stateEditorDraft.definition" @update-value="updateStateEditorValue" />
                <div v-if="stateEditorError" class="node-card__port-picker-hint node-card__port-picker-hint--error">{{ stateEditorError }}</div>
                <div class="node-card__top-popover-actions">
                  <ElButton size="small" @click="closeStateEditor">Cancel</ElButton>
                  <ElButton size="small" type="primary" @click="commitStateEditor">Save</ElButton>
                </div>
              </div>
            </ElPopover>
          </div>
        </div>
        <div class="node-card__port-column node-card__port-column--right">
          <div v-for="port in view.outputs" :key="port.key" class="node-card__port-pill-row node-card__port-pill-row--right">
            <ElPopover
              :visible="isStateEditorOpen(`agent-output:${port.key}`)"
              placement="bottom-end"
              :width="340"
              popper-class="node-card__state-editor-popper"
            >
              <template #reference>
                <span
                  class="node-card__port-pill node-card__port-pill--output node-card__port-pill--dock-end"
                  :style="{ '--node-card-port-accent': port.stateColor }"
                >
                  <span class="node-card__port-pill-label" @dblclick.stop="openStateEditor(`agent-output:${port.key}`, port.key)">{{ port.label }}</span>
                  <span
                    class="node-card__port-pill-anchor-slot"
                    :data-anchor-slot-id="`${nodeId}:state-out:${port.key}`"
                    aria-hidden="true"
                  />
                </span>
              </template>
              <div v-if="stateEditorDraft" class="node-card__state-editor" data-node-popup-surface="true">
                <div class="node-card__state-editor-title">Edit State</div>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">Name</span>
                  <ElInput :model-value="stateEditorDraft.definition.name" @update:model-value="handleStateEditorNameInput" />
                </label>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">Key</span>
                  <ElInput :model-value="stateEditorDraft.key" @update:model-value="handleStateEditorKeyInput" />
                </label>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">Type</span>
                  <select class="node-card__control-select" :value="stateEditorDraft.definition.type" @change="handleStateEditorTypeChange">
                    <option v-for="typeOption in stateTypeOptions" :key="typeOption" :value="typeOption">{{ typeOption }}</option>
                  </select>
                </label>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">Description</span>
                  <ElInput
                    type="textarea"
                    :rows="3"
                    :model-value="stateEditorDraft.definition.description"
                    @update:model-value="handleStateEditorDescriptionInput"
                  />
                </label>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">Color</span>
                  <ElInput :model-value="stateEditorDraft.definition.color" @update:model-value="handleStateEditorColorInput" />
                </label>
                <StateDefaultValueEditor :field="stateEditorDraft.definition" @update-value="updateStateEditorValue" />
                <div v-if="stateEditorError" class="node-card__port-picker-hint node-card__port-picker-hint--error">{{ stateEditorError }}</div>
                <div class="node-card__top-popover-actions">
                  <ElButton size="small" @click="closeStateEditor">Cancel</ElButton>
                  <ElButton size="small" type="primary" @click="commitStateEditor">Save</ElButton>
                </div>
              </div>
            </ElPopover>
          </div>
        </div>
      </div>
      <div class="node-card__agent-runtime-row">
        <div class="node-card__agent-model-select-shell" @pointerdown.stop @click.stop>
          <ElSelect
            class="node-card__agent-model-select"
            :model-value="agentResolvedModelValue || undefined"
            :placeholder="agentModelOptions.length === 0 ? 'No configured models' : 'Select model'"
            :disabled="agentModelOptions.length === 0"
            popper-class="node-card__agent-model-popper"
            @update:model-value="handleAgentModelValueChange"
          >
            <ElOption
              v-for="option in agentModelOptions"
              :key="option.value"
              :label="option.value === trimmedGlobalTextModelRef ? `${option.label} (Global)` : option.label"
              :value="option.value"
            />
          </ElSelect>
        </div>
        <div class="node-card__agent-thinking-card">
          <span
            class="node-card__agent-thinking-icon"
            :class="{ 'node-card__agent-thinking-icon--enabled': agentThinkingEnabled }"
            aria-hidden="true"
          >
            <Opportunity />
          </span>
          <ElSwitch
            class="node-card__agent-thinking-switch"
            :model-value="agentThinkingEnabled"
            :width="56"
            inline-prompt
            active-text="ON"
            inactive-text="OFF"
            aria-label="Toggle thinking mode"
            @pointerdown.stop
            @click.stop
            @update:model-value="handleAgentThinkingToggle"
          />
        </div>
      </div>
      <div class="node-card__action-row">
        <button
          v-if="showSkillPickerTrigger"
          type="button"
          class="node-card__action-pill node-card__action-pill--skill node-card__action-pill-button"
          @pointerdown.stop
          @click.stop="toggleSkillPicker"
        >
          + skill
        </button>
        <span v-else class="node-card__action-pill node-card__action-pill--skill node-card__action-pill--disabled">+ skill</span>
        <button
          type="button"
          class="node-card__action-pill node-card__action-pill--input node-card__action-pill-button"
          @pointerdown.stop
          @click.stop="openPortPicker('input')"
        >
          + input
        </button>
        <button
          type="button"
          class="node-card__action-pill node-card__action-pill--output node-card__action-pill-button"
          @pointerdown.stop
          @click.stop="openPortPicker('output')"
        >
          + output
        </button>
      </div>
      <div v-if="activePortPickerSide" class="node-card__port-picker" data-node-popup-surface="true" @pointerdown.stop @click.stop>
        <div class="node-card__port-picker-title">{{ portPickerTitle }}</div>
        <div v-if="portStateDraft" class="node-card__port-picker-form">
          <label class="node-card__control-row">
            <span class="node-card__control-label">Name</span>
            <input
              class="node-card__control-input"
              type="text"
              :value="portStateDraft.definition.name"
              @pointerdown.stop
              @click.stop
              @input="handlePortDraftNameInput"
            />
          </label>
          <label class="node-card__control-row">
            <span class="node-card__control-label">Key</span>
            <input
              class="node-card__control-input"
              type="text"
              :value="portStateDraft.key"
              @pointerdown.stop
              @click.stop
              @input="handlePortDraftKeyInput"
            />
          </label>
          <label class="node-card__control-row">
            <span class="node-card__control-label">Type</span>
            <select
              class="node-card__control-select"
              :value="portStateDraft.definition.type"
              @pointerdown.stop
              @click.stop
              @change="handlePortDraftTypeChange"
            >
              <option v-for="typeOption in stateTypeOptions" :key="typeOption" :value="typeOption">{{ typeOption }}</option>
            </select>
          </label>
          <label class="node-card__control-row">
            <span class="node-card__control-label">Description</span>
            <textarea
              class="node-card__control-textarea"
              :value="portStateDraft.definition.description"
              @pointerdown.stop
              @click.stop
              @input="handlePortDraftDescriptionInput"
            />
          </label>
          <label class="node-card__control-row">
            <span class="node-card__control-label">Color</span>
            <input
              class="node-card__control-input"
              type="text"
              :value="portStateDraft.definition.color"
              placeholder="#d97706"
              @pointerdown.stop
              @click.stop
              @input="handlePortDraftColorInput"
            />
          </label>
          <StateDefaultValueEditor
            :field="portStateDraft.definition"
            @update-value="updatePortDraftValue"
          />
          <div class="node-card__port-picker-hint" :class="{ 'node-card__port-picker-hint--error': Boolean(portStateError) }">
            {{ portStateError ?? "Create the state and bind this port to it immediately." }}
          </div>
          <div class="node-card__port-picker-actions">
            <button
              type="button"
              class="node-card__port-picker-button"
              @pointerdown.stop
              @click.stop="backPortDraft"
            >
              Back
            </button>
            <button
              type="button"
              class="node-card__port-picker-button node-card__port-picker-button--primary"
              @pointerdown.stop
              @click.stop="commitPortStateCreate"
            >
              Create
            </button>
          </div>
        </div>
        <div v-else class="node-card__port-picker-form">
          <input
            class="node-card__control-input"
            type="text"
            :value="portStateSearch"
            :placeholder="activePortPickerSide === 'input' ? 'Search or create input state' : 'Search or create output state'"
            @pointerdown.stop
            @click.stop
            @input="handlePortStateSearchInput"
          />
          <button
            v-if="portStateSearch.trim()"
            type="button"
            class="node-card__port-create-option"
            @pointerdown.stop
            @click.stop="beginPortStateCreate"
          >
            <span class="node-card__port-create-label">Create</span>
            <span class="node-card__port-create-title">新增 “{{ portStateSearch.trim() }}”</span>
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
              Cancel
            </button>
          </div>
        </div>
      </div>
      <div v-if="isSkillPickerOpen" class="node-card__skill-picker" data-node-popup-surface="true" @pointerdown.stop @click.stop>
        <div class="node-card__skill-picker-title">Add Skill</div>
        <div class="node-card__skill-picker-copy">这里只负责附加已有 skill，不在编排界面里编辑 skill 内容。</div>
        <div v-if="skillDefinitionsLoading" class="node-card__skill-panel-message">
          Loading skills...
        </div>
        <div v-else-if="skillDefinitionsError" class="node-card__skill-panel-message node-card__skill-panel-message--error">
          {{ skillDefinitionsError }}
        </div>
        <div v-else-if="availableSkillDefinitions.length === 0" class="node-card__skill-panel-message">
          No available skills to attach.
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
            <span v-if="definition.inputSchema.length > 0">In {{ definition.inputSchema.length }}</span>
            <span v-if="definition.outputSchema.length > 0">Out {{ definition.outputSchema.length }}</span>
          </div>
        </button>
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
            title="Remove skill"
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
        placeholder="Describe what this node should do"
        @pointerdown.stop
        @click.stop
        @input="handleAgentTaskInstructionInput"
      />
    </section>

    <section v-else-if="view.body.kind === 'output'" class="node-card__body node-card__body--output">
      <div class="node-card__output-toolbar">
        <ElPopover
          v-if="view.body.connectedStateKey && view.body.connectedStateLabel"
          :visible="isStateEditorOpen(`output-input:${view.body.connectedStateKey}`)"
          placement="bottom-start"
          :width="340"
          popper-class="node-card__state-editor-popper"
        >
          <template #reference>
            <span
              class="node-card__port-pill node-card__port-pill--input node-card__port-pill--dock-start"
              :style="{ '--node-card-port-accent': stateSchema[view.body.connectedStateKey]?.color ?? '#2563eb' }"
            >
              <span
                class="node-card__port-pill-anchor-slot node-card__port-pill-anchor-slot--leading"
                :data-anchor-slot-id="`${nodeId}:state-in:${view.body.connectedStateKey}`"
                aria-hidden="true"
              />
              <span
                class="node-card__port-pill-label"
                @dblclick.stop="openStateEditor(`output-input:${view.body.connectedStateKey}`, view.body.connectedStateKey)"
              >
                {{ view.body.connectedStateLabel }}
              </span>
            </span>
          </template>
          <div v-if="stateEditorDraft" class="node-card__state-editor" data-node-popup-surface="true">
            <div class="node-card__state-editor-title">Edit State</div>
            <label class="node-card__control-row">
              <span class="node-card__control-label">Name</span>
              <ElInput :model-value="stateEditorDraft.definition.name" @update:model-value="handleStateEditorNameInput" />
            </label>
            <label class="node-card__control-row">
              <span class="node-card__control-label">Key</span>
              <ElInput :model-value="stateEditorDraft.key" @update:model-value="handleStateEditorKeyInput" />
            </label>
            <label class="node-card__control-row">
              <span class="node-card__control-label">Type</span>
              <select class="node-card__control-select" :value="stateEditorDraft.definition.type" @change="handleStateEditorTypeChange">
                <option v-for="typeOption in stateTypeOptions" :key="typeOption" :value="typeOption">{{ typeOption }}</option>
              </select>
            </label>
            <label class="node-card__control-row">
              <span class="node-card__control-label">Description</span>
              <ElInput
                type="textarea"
                :rows="3"
                :model-value="stateEditorDraft.definition.description"
                @update:model-value="handleStateEditorDescriptionInput"
              />
            </label>
            <label class="node-card__control-row">
              <span class="node-card__control-label">Color</span>
              <ElInput :model-value="stateEditorDraft.definition.color" @update:model-value="handleStateEditorColorInput" />
            </label>
            <StateDefaultValueEditor :field="stateEditorDraft.definition" @update-value="updateStateEditorValue" />
            <div v-if="stateEditorError" class="node-card__port-picker-hint node-card__port-picker-hint--error">{{ stateEditorError }}</div>
            <div class="node-card__top-popover-actions">
              <ElButton size="small" @click="closeStateEditor">Cancel</ElButton>
              <ElButton size="small" type="primary" @click="commitStateEditor">Save</ElButton>
            </div>
          </div>
        </ElPopover>
        <span v-else class="node-card__port-label">Unbound</span>
        <button
          type="button"
          class="node-card__persist-button"
          :aria-pressed="view.body.persistEnabled"
          @pointerdown.stop
          @click.stop="toggleOutputPersist"
        >
          <span class="node-card__persist">
            <span>{{ view.body.persistLabel }}</span>
            <span class="node-card__toggle" :class="{ 'node-card__toggle--on': view.body.persistEnabled }">
              <span class="node-card__toggle-thumb" />
            </span>
          </span>
        </button>
      </div>
      <div class="node-card__surface node-card__surface--output">
        <div class="node-card__surface-meta">
          <span>{{ view.body.previewTitle.toUpperCase() }}</span>
          <span>{{ view.body.displayModeLabel }}</span>
        </div>
        <div class="node-card__preview">{{ view.body.previewText || `Connected to ${view.body.connectedStateLabel ?? "state"}` }}</div>
      </div>
    </section>

    <section v-else class="node-card__body node-card__body--condition">
      <div class="node-card__condition-topline">
        <div class="node-card__port-column">
          <div v-for="port in view.inputs" :key="port.key" class="node-card__port-pill-row">
            <ElPopover
              :visible="isStateEditorOpen(`condition-input:${port.key}`)"
              placement="bottom-start"
              :width="340"
              popper-class="node-card__state-editor-popper"
            >
              <template #reference>
                <span
                  class="node-card__port-pill node-card__port-pill--input node-card__port-pill--dock-start"
                  :style="{ '--node-card-port-accent': port.stateColor }"
                >
                  <span
                    class="node-card__port-pill-anchor-slot node-card__port-pill-anchor-slot--leading"
                    :data-anchor-slot-id="`${nodeId}:state-in:${port.key}`"
                    aria-hidden="true"
                  />
                  <span class="node-card__port-pill-label" @dblclick.stop="openStateEditor(`condition-input:${port.key}`, port.key)">{{ port.label }}</span>
                </span>
              </template>
              <div v-if="stateEditorDraft" class="node-card__state-editor" data-node-popup-surface="true">
                <div class="node-card__state-editor-title">Edit State</div>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">Name</span>
                  <ElInput :model-value="stateEditorDraft.definition.name" @update:model-value="handleStateEditorNameInput" />
                </label>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">Key</span>
                  <ElInput :model-value="stateEditorDraft.key" @update:model-value="handleStateEditorKeyInput" />
                </label>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">Type</span>
                  <select class="node-card__control-select" :value="stateEditorDraft.definition.type" @change="handleStateEditorTypeChange">
                    <option v-for="typeOption in stateTypeOptions" :key="typeOption" :value="typeOption">{{ typeOption }}</option>
                  </select>
                </label>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">Description</span>
                  <ElInput
                    type="textarea"
                    :rows="3"
                    :model-value="stateEditorDraft.definition.description"
                    @update:model-value="handleStateEditorDescriptionInput"
                  />
                </label>
                <label class="node-card__control-row">
                  <span class="node-card__control-label">Color</span>
                  <ElInput :model-value="stateEditorDraft.definition.color" @update:model-value="handleStateEditorColorInput" />
                </label>
                <StateDefaultValueEditor :field="stateEditorDraft.definition" @update-value="updateStateEditorValue" />
                <div v-if="stateEditorError" class="node-card__port-picker-hint node-card__port-picker-hint--error">{{ stateEditorError }}</div>
                <div class="node-card__top-popover-actions">
                  <ElButton size="small" @click="closeStateEditor">Cancel</ElButton>
                  <ElButton size="small" type="primary" @click="commitStateEditor">Save</ElButton>
                </div>
              </div>
            </ElPopover>
          </div>
        </div>
        <label class="node-card__loop-control" @pointerdown.stop @click.stop>
          <span class="node-card__loop-label">Loop</span>
          <input
            class="node-card__loop-input"
            type="text"
            inputmode="numeric"
            :value="conditionLoopLimitDraft"
            @pointerdown.stop
            @click.stop
            @input="handleConditionLoopLimitInput"
            @blur="commitConditionLoopLimit"
            @keydown.enter.prevent="handleConditionLoopLimitEnter"
          />
        </label>
      </div>
      <div class="node-card__surface">
        <div class="node-card__condition-editor">
          <label class="node-card__control-row">
            <span class="node-card__control-label">Source</span>
            <select
              class="node-card__control-select"
              :value="conditionRuleEditor?.resolvedSource ?? ''"
              :disabled="!conditionRuleEditor || conditionRuleEditor.sourceOptions.length === 0"
              @pointerdown.stop
              @click.stop
              @change="handleConditionRuleSourceChange"
            >
              <option v-if="!conditionRuleEditor || conditionRuleEditor.sourceOptions.length === 0" value="">No state</option>
              <option v-for="option in conditionRuleEditor?.sourceOptions ?? []" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <div class="node-card__condition-editor-grid">
            <label class="node-card__control-row">
              <span class="node-card__control-label">Operator</span>
              <select
                class="node-card__control-select"
                :value="node.kind === 'condition' ? node.config.rule.operator : ''"
                @pointerdown.stop
                @click.stop
                @change="handleConditionRuleOperatorChange"
              >
                <option v-for="option in conditionRuleOperatorOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label class="node-card__control-row">
              <span class="node-card__control-label">Value</span>
              <input
                class="node-card__control-input"
                type="text"
                :value="conditionRuleValueText"
                :disabled="conditionRuleEditor?.isValueDisabled"
                @pointerdown.stop
                @click.stop
                @input="handleConditionRuleValueInput"
              />
            </label>
          </div>
        </div>
        <div class="node-card__condition-rule">{{ view.body.ruleSummary }}</div>
        <div class="node-card__branch-list">
          <div v-for="branch in view.body.branchMappings" :key="branch.branch" class="node-card__branch-editor">
            <label class="node-card__branch-field">
              <span class="node-card__branch-field-label">Branch</span>
              <input
                class="node-card__branch-input"
                type="text"
                autocomplete="off"
                :value="conditionBranchDrafts[branch.branch]?.branchKey ?? branch.branch"
                @pointerdown.stop
                @click.stop
                @input="handleConditionBranchKeyInput(branch.branch, $event)"
                @blur="commitConditionBranch(branch.branch)"
                @keydown.enter.prevent="handleConditionBranchEnter(branch.branch, $event)"
              />
            </label>
            <label class="node-card__branch-field">
              <span class="node-card__branch-field-label">Matches</span>
              <input
                class="node-card__branch-input node-card__branch-input--mapping"
                type="text"
                autocomplete="off"
                :value="conditionBranchDrafts[branch.branch]?.mappingText ?? branch.matchValueLabel"
                placeholder="true, false"
                @pointerdown.stop
                @click.stop
                @input="handleConditionBranchMappingInput(branch.branch, $event)"
                @blur="commitConditionBranch(branch.branch)"
                @keydown.enter.prevent="handleConditionBranchEnter(branch.branch, $event)"
              />
            </label>
            <button
              v-if="canRemoveConditionBranch"
              type="button"
              class="node-card__branch-remove"
              @pointerdown.stop
              @click.stop="removeConditionBranch(branch.branch)"
            >
              Remove
            </button>
            <div
              class="node-card__branch-route"
              :class="{ 'node-card__branch-route--unrouted': !branch.routeTargetLabel }"
            >
              <span class="node-card__branch-route-label">Route</span>
              <span class="node-card__branch-route-target">{{ branch.routeTargetLabel ?? "Unrouted" }}</span>
            </div>
          </div>
          <button
            type="button"
            class="node-card__branch-add"
            @pointerdown.stop
            @click.stop="addConditionBranch"
          >
            + branch
          </button>
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ElButton, ElIcon, ElInput, ElPopover } from "element-plus";
import { Check, Collection, CollectionTag, Delete, Document, FolderOpened, Operation, Opportunity } from "@element-plus/icons-vue";

import StateDefaultValueEditor from "@/editor/workspace/StateDefaultValueEditor.vue";
import { listConditionBranchMappingKeys, parseConditionBranchMappingDraft } from "@/lib/condition-branch-mapping";
import type { KnowledgeBaseRecord } from "@/types/knowledge";
import type { AgentNode, ConditionNode, GraphNode, InputNode, OutputNode, StateDefinition } from "@/types/node-system";
import type { SkillDefinition } from "@/types/skills";

import { DEFAULT_AGENT_TEMPERATURE, buildAgentModelSelectOptions, normalizeAgentTemperature, resolveAgentModelSelection } from "./agentConfigModel";
import { parseConditionLoopLimitDraft } from "./conditionLoopLimit";
import { buildConditionRuleEditorModel, CONDITION_RULE_OPERATOR_OPTIONS } from "./conditionRuleEditorModel";
import { isSwitchableInputBoundaryType, resolveNextInputValueForBoundaryType, resolveStateTypeForInputBoundary } from "./inputValueTypeModel";
import { buildNodeCardViewModel } from "./nodeCardViewModel";
import { listAttachableSkillDefinitions, resolveAttachedSkillBadges } from "./skillPickerModel";
import { createStateDraftFromQuery, matchesStatePortSearch } from "./statePortCreateModel";
import { createUploadedAssetEnvelope, resolveUploadedAssetInputAccept, tryParseUploadedAssetEnvelope } from "./uploadedAssetModel";
import { defaultValueForStateType, STATE_FIELD_TYPE_OPTIONS, type StateFieldDraft, type StateFieldType } from "@/editor/workspace/statePanelFields";

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
  conditionRouteTargets?: Record<string, string | null>;
  latestRunStatus?: string | null;
  runOutputPreviewText?: string | null;
  runOutputDisplayMode?: string | null;
  runFailureMessage?: string | null;
  selected: boolean;
}>();

const emit = defineEmits<{
  (event: "update-input-config", payload: { nodeId: string; patch: Partial<InputNode["config"]> }): void;
  (event: "update-input-state", payload: { stateKey: string; patch: Partial<StateDefinition> }): void;
  (event: "rename-state", payload: { currentKey: string; nextKey: string }): void;
  (event: "update-state", payload: { stateKey: string; patch: Partial<StateDefinition> }): void;
  (event: "update-output-config", payload: { nodeId: string; patch: Partial<OutputNode["config"]> }): void;
  (event: "update-agent-config", payload: { nodeId: string; patch: Partial<AgentNode["config"]> }): void;
  (event: "update-condition-config", payload: { nodeId: string; patch: Partial<ConditionNode["config"]> }): void;
  (event: "update-condition-branch", payload: { nodeId: string; currentKey: string; nextKey: string; mappingKeys: string[] }): void;
  (event: "add-condition-branch", payload: { nodeId: string }): void;
  (event: "remove-condition-branch", payload: { nodeId: string; branchKey: string }): void;
  (event: "bind-port-state", payload: { nodeId: string; side: "input" | "output"; stateKey: string }): void;
  (event: "create-port-state", payload: { nodeId: string; side: "input" | "output"; field: StateFieldDraft }): void;
  (event: "delete-node", payload: { nodeId: string }): void;
  (event: "save-node-preset", payload: { nodeId: string }): void;
}>();

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
const inputTypeOptions: Array<{
  value: "text" | "file" | "knowledge_base";
  label: string;
  icon: typeof Document;
}> = [
  { value: "text", label: "Text", icon: Document },
  { value: "file", label: "File", icon: FolderOpened },
  { value: "knowledge_base", label: "Knowledge Base", icon: Collection },
];
const confirmPopoverStyle = {
  padding: "0",
  border: "none",
  background: "transparent",
  boxShadow: "none",
};
const stateTypeOptions = STATE_FIELD_TYPE_OPTIONS;
const conditionRuleOperatorOptions = CONDITION_RULE_OPERATOR_OPTIONS;

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
const canRemoveConditionBranch = computed(() => props.node.kind === "condition" && props.node.config.branches.length > 1);
const conditionLoopLimitDraft = ref("");
const conditionBranchDrafts = ref<Record<string, { branchKey: string; mappingText: string }>>({});
const inputAssetInputRef = ref<HTMLInputElement | null>(null);
const isSkillPickerOpen = ref(false);
const activePortPickerSide = ref<"input" | "output" | null>(null);
const portStateSearch = ref("");
const portStateDraft = ref<StateFieldDraft | null>(null);
const portStateError = ref<string | null>(null);
const activeTopAction = ref<"advanced" | "delete" | "preset" | null>(null);
const topActionTimeoutRef = ref<number | null>(null);
const activeStateEditorAnchorId = ref<string | null>(null);
const stateEditorDraft = ref<StateFieldDraft | null>(null);
const stateEditorError = ref<string | null>(null);
const conditionRuleEditor = computed(() =>
  props.node.kind === "condition" ? buildConditionRuleEditorModel(props.node.config.rule, props.stateSchema) : null,
);
const showKnowledgeBaseInput = computed(() => view.value.body.kind === "input" && view.value.body.editorMode === "knowledge_base");
const showAssetUploadInput = computed(() => view.value.body.kind === "input" && view.value.body.editorMode === "asset");
const isInputValueEditable = computed(() => view.value.body.kind === "input" && view.value.body.editorMode === "text");
const inputValueText = computed(() => {
  if (props.node.kind !== "input") {
    return "";
  }
  if (typeof props.node.config.value === "string") {
    return props.node.config.value;
  }
  if (props.node.config.value === null || props.node.config.value === undefined) {
    return "";
  }
  return view.value.body.kind === "input" ? view.value.body.valueText : "";
});
const inputKnowledgeBaseValue = computed(() => {
  if (props.node.kind !== "input") {
    return "";
  }
  return typeof props.node.config.value === "string" ? props.node.config.value : "";
});
const inputAssetType = computed(() => (view.value.body.kind === "input" ? view.value.body.assetType : null));
const inputAssetEnvelope = computed(() => (props.node.kind === "input" ? tryParseUploadedAssetEnvelope(props.node.config.value) : null));
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
    return "Import or sync knowledge bases to make this input selectable.";
  }
  return "Pick the knowledge base that should ground this workflow.";
});
const trimmedGlobalTextModelRef = computed(() => props.globalTextModelRef.trim());
const agentResolvedModelValue = computed(() => {
  if (props.node.kind !== "agent") {
    return trimmedGlobalTextModelRef.value;
  }
  const overrideModel = props.node.config.model.trim();
  return props.node.config.modelSource === "override" && overrideModel ? overrideModel : trimmedGlobalTextModelRef.value;
});
const agentThinkingEnabled = computed(() => props.node.kind === "agent" ? props.node.config.thinkingMode === "on" : true);
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
    return activePortPickerSide.value === "input" ? "Create Input State" : "Create Output State";
  }
  return activePortPickerSide.value === "input" ? "Select Input State" : "Select Output State";
});
const conditionRuleValueText = computed(() => {
  if (props.node.kind !== "condition") {
    return "";
  }
  return props.node.config.rule.value === null ? "" : String(props.node.config.rule.value);
});
const agentTemperatureInput = computed(() => {
  if (props.node.kind !== "agent") {
    return String(DEFAULT_AGENT_TEMPERATURE);
  }
  return String(normalizeAgentTemperature(props.node.config.temperature));
});
const hasAdvancedSettings = computed(() => props.node.kind === "agent" || props.node.kind === "output");
const canSavePreset = computed(() => props.node.kind === "agent");
const isTopActionVisible = computed(() => props.selected || activeTopAction.value !== null);
const hasFloatingPanelOpen = computed(() => activeTopAction.value !== null || activeStateEditorAnchorId.value !== null || activePortPickerSide.value !== null || isSkillPickerOpen.value);

watch(
  () => (props.node.kind === "condition" ? props.node.config.loopLimit : null),
  (loopLimit) => {
    conditionLoopLimitDraft.value = loopLimit === null ? "" : String(loopLimit);
  },
  { immediate: true },
);

watch(
  () =>
    props.node.kind === "condition"
      ? JSON.stringify({
          branches: props.node.config.branches,
          branchMapping: props.node.config.branchMapping,
        })
      : "",
  () => {
    conditionBranchDrafts.value = props.node.kind === "condition" ? buildConditionBranchDrafts(props.node) : {};
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
    closeStateEditor();
  },
);

onBeforeUnmount(() => {
  removeGlobalFloatingPanelListeners();
  clearTopActionTimeout();
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

function emitOutputConfigPatch(patch: Partial<OutputNode["config"]>) {
  if (props.node.kind !== "output") {
    return;
  }
  emit("update-output-config", { nodeId: props.nodeId, patch });
}

function emitInputConfigPatch(patch: Partial<InputNode["config"]>) {
  if (props.node.kind !== "input") {
    return;
  }
  emit("update-input-config", { nodeId: props.nodeId, patch });
}

function emitInputStatePatch(stateKey: string, patch: Partial<StateDefinition>) {
  emit("update-input-state", { stateKey, patch });
}

function emitAgentConfigPatch(patch: Partial<AgentNode["config"]>) {
  if (props.node.kind !== "agent") {
    return;
  }
  emit("update-agent-config", { nodeId: props.nodeId, patch });
}

function emitConditionConfigPatch(patch: Partial<ConditionNode["config"]>) {
  if (props.node.kind !== "condition") {
    return;
  }
  emit("update-condition-config", { nodeId: props.nodeId, patch });
}

function emitConditionBranchUpdate(currentKey: string, nextKey: string, mappingKeys: string[]) {
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
  if (props.node.kind !== "condition") {
    return;
  }
  emit("add-condition-branch", {
    nodeId: props.nodeId,
  });
}

function removeConditionBranch(branchKey: string) {
  if (props.node.kind !== "condition") {
    return;
  }
  emit("remove-condition-branch", {
    nodeId: props.nodeId,
    branchKey,
  });
}

function toggleOutputPersist() {
  if (props.node.kind !== "output") {
    return;
  }
  emitOutputConfigPatch({ persistEnabled: !props.node.config.persistEnabled });
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
  if (!showSkillPickerTrigger.value) {
    return;
  }
  clearTopActionTimeout();
  activeTopAction.value = null;
  closeStateEditor();
  activePortPickerSide.value = null;
  portStateDraft.value = null;
  portStateSearch.value = "";
  portStateError.value = null;
  isSkillPickerOpen.value = !isSkillPickerOpen.value;
}

function attachAgentSkill(skillKey: string) {
  if (props.node.kind !== "agent" || props.node.config.skills.includes(skillKey)) {
    return;
  }
  emitAgentConfigPatch({ skills: [...props.node.config.skills, skillKey] });
  isSkillPickerOpen.value = false;
}

function removeAgentSkill(skillKey: string) {
  if (props.node.kind !== "agent" || !props.node.config.skills.includes(skillKey)) {
    return;
  }
  emitAgentConfigPatch({ skills: props.node.config.skills.filter((candidateKey) => candidateKey !== skillKey) });
}

function openPortPicker(side: "input" | "output") {
  clearTopActionTimeout();
  activeTopAction.value = null;
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

function beginPortStateCreate() {
  portStateDraft.value = createStateDraftFromQuery(portStateSearch.value, Object.keys(props.stateSchema));
  portStateError.value = null;
}

function backPortDraft() {
  portStateDraft.value = null;
  portStateError.value = null;
}

function handlePortDraftNameInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !portStateDraft.value) {
    return;
  }
  portStateDraft.value = {
    ...portStateDraft.value,
    definition: {
      ...portStateDraft.value.definition,
      name: target.value,
    },
  };
}

function handlePortDraftKeyInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !portStateDraft.value) {
    return;
  }
  portStateDraft.value = {
    ...portStateDraft.value,
    key: target.value,
  };
}

function handlePortDraftTypeChange(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) || !portStateDraft.value) {
    return;
  }
  portStateDraft.value = {
    ...portStateDraft.value,
    definition: {
      ...portStateDraft.value.definition,
      type: target.value,
      value: defaultValueForStateType(target.value as StateFieldType),
    },
  };
}

function handlePortDraftDescriptionInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement) || !portStateDraft.value) {
    return;
  }
  portStateDraft.value = {
    ...portStateDraft.value,
    definition: {
      ...portStateDraft.value.definition,
      description: target.value,
    },
  };
}

function handlePortDraftColorInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !portStateDraft.value) {
    return;
  }
  portStateDraft.value = {
    ...portStateDraft.value,
    definition: {
      ...portStateDraft.value.definition,
      color: target.value,
    },
  };
}

function updatePortDraftValue(value: unknown) {
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
  if (!activePortPickerSide.value || !portStateDraft.value) {
    return;
  }

  const nextKey = portStateDraft.value.key.trim();
  const nextName = portStateDraft.value.definition.name.trim() || nextKey;
  if (!nextKey) {
    portStateError.value = "State key cannot be empty.";
    return;
  }
  if (props.stateSchema[nextKey]) {
    portStateError.value = `State key '${nextKey}' already exists.`;
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

function isStateEditorOpen(anchorId: string) {
  return activeStateEditorAnchorId.value === anchorId;
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
  activePortPickerSide.value = null;
  isSkillPickerOpen.value = false;
  activeStateEditorAnchorId.value = anchorId;
  stateEditorDraft.value = nextDraft;
  stateEditorError.value = null;
}

function closeStateEditor() {
  activeStateEditorAnchorId.value = null;
  stateEditorDraft.value = null;
  stateEditorError.value = null;
}

function handleStateEditorNameInput(value: string | number) {
  if (!stateEditorDraft.value || typeof value !== "string") {
    return;
  }
  stateEditorDraft.value = {
    ...stateEditorDraft.value,
    definition: {
      ...stateEditorDraft.value.definition,
      name: value,
    },
  };
}

function handleStateEditorKeyInput(value: string | number) {
  if (!stateEditorDraft.value || typeof value !== "string") {
    return;
  }
  stateEditorDraft.value = {
    ...stateEditorDraft.value,
    key: value,
  };
}

function handleStateEditorDescriptionInput(value: string | number) {
  if (!stateEditorDraft.value || typeof value !== "string") {
    return;
  }
  stateEditorDraft.value = {
    ...stateEditorDraft.value,
    definition: {
      ...stateEditorDraft.value.definition,
      description: value,
    },
  };
}

function handleStateEditorColorInput(value: string | number) {
  if (!stateEditorDraft.value || typeof value !== "string") {
    return;
  }
  stateEditorDraft.value = {
    ...stateEditorDraft.value,
    definition: {
      ...stateEditorDraft.value.definition,
      color: value,
    },
  };
}

function handleStateEditorTypeChange(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) || !stateEditorDraft.value) {
    return;
  }
  stateEditorDraft.value = {
    ...stateEditorDraft.value,
    definition: {
      ...stateEditorDraft.value.definition,
      type: target.value,
      value: defaultValueForStateType(target.value as StateFieldType),
    },
  };
}

function updateStateEditorValue(value: unknown) {
  if (!stateEditorDraft.value) {
    return;
  }
  stateEditorDraft.value = {
    ...stateEditorDraft.value,
    definition: {
      ...stateEditorDraft.value.definition,
      value,
    },
  };
}

function commitStateEditor() {
  const currentAnchorId = activeStateEditorAnchorId.value;
  const draft = stateEditorDraft.value;
  if (!currentAnchorId || !draft) {
    return;
  }

  const currentStateKey = currentAnchorId.split(":").at(-1) ?? "";
  const nextKey = draft.key.trim();
  if (!nextKey) {
    stateEditorError.value = "State key cannot be empty.";
    return;
  }
  if (nextKey !== currentStateKey && props.stateSchema[nextKey]) {
    stateEditorError.value = `State key '${nextKey}' already exists.`;
    return;
  }

  if (nextKey !== currentStateKey) {
    emit("rename-state", { currentKey: currentStateKey, nextKey });
  }
  emit("update-state", {
    stateKey: nextKey,
    patch: {
      name: draft.definition.name.trim() || nextKey,
      description: draft.definition.description,
      type: draft.definition.type,
      value: draft.definition.value,
      color: draft.definition.color,
    },
  });
  closeStateEditor();
}

function toggleAdvancedPanel() {
  if (!hasAdvancedSettings.value) {
    return;
  }
  clearTopActionConfirmState();
  isSkillPickerOpen.value = false;
  closePortPicker();
  closeStateEditor();
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
        "[data-node-popup-surface='true']",
        ".node-card__top-popover",
        ".node-card__state-editor",
        ".node-card__confirm-hint",
        ".node-card__action-popover",
        ".node-card__confirm-popover",
        ".node-card__state-editor-popper",
        ".node-card__agent-model-popper",
      ].join(", "),
    ),
  );
}

function closeFloatingPanels() {
  clearTopActionConfirmState();
  if (activeTopAction.value === "advanced") {
    activeTopAction.value = null;
  }
  closeStateEditor();
  closePortPicker();
  isSkillPickerOpen.value = false;
}

function handleGlobalFloatingPanelPointerDown(event: PointerEvent) {
  if (!hasFloatingPanelOpen.value || isFloatingPanelSurfaceTarget(event.target)) {
    return;
  }
  closeFloatingPanels();
}

function handleGlobalFloatingPanelFocusIn(event: FocusEvent) {
  if (!hasFloatingPanelOpen.value || isFloatingPanelSurfaceTarget(event.target)) {
    return;
  }
  closeFloatingPanels();
}

function handleGlobalFloatingPanelKeyDown(event: KeyboardEvent) {
  if (!hasFloatingPanelOpen.value || event.key !== "Escape") {
    return;
  }
  closeFloatingPanels();
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
  isSkillPickerOpen.value = false;
  closePortPicker();
  closeStateEditor();
  if (activeTopAction.value === "preset") {
    confirmSavePreset();
    return;
  }
  startTopActionConfirmWindow("preset");
}

function handleDeleteActionClick() {
  isSkillPickerOpen.value = false;
  closePortPicker();
  closeStateEditor();
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

function confirmDeleteNode() {
  clearTopActionConfirmState();
  emit("delete-node", { nodeId: props.nodeId });
}

function confirmSavePreset() {
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
}

function handleAgentThinkingToggle(nextValue: string | number | boolean) {
  if (typeof nextValue !== "boolean") {
    return;
  }
  updateAgentThinkingMode(nextValue ? "on" : "off");
}

function updateAgentThinkingMode(thinkingMode: AgentNode["config"]["thinkingMode"]) {
  emitAgentConfigPatch({ thinkingMode });
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
  emitInputConfigPatch({ value: target.value });
}

function handleInputKnowledgeBaseChange(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }
  emitInputConfigPatch({ value: target.value });
}

function handleInputBoundarySelection(nextType: string | number | boolean) {
  if (typeof nextType !== "string" || !isSwitchableInputBoundaryType(nextType)) {
    return;
  }
  updateInputBoundaryType(nextType);
}

function updateInputBoundaryType(nextType: "text" | "file" | "knowledge_base") {
  const stateKey = inputStateKey.value;
  if (!stateKey || !isSwitchableInputBoundaryType(nextType)) {
    return;
  }
  if (inputStateType.value === nextType) {
    return;
  }

  emitInputStatePatch(stateKey, {
    type: resolveStateTypeForInputBoundary(nextType),
    value: defaultValueForStateType(resolveStateTypeForInputBoundary(nextType) as StateFieldType),
  });
  emitInputConfigPatch({
    value: resolveNextInputValueForBoundaryType({
      nextType,
      currentType: inputStateType.value,
      currentValue: props.node.kind === "input" ? props.node.config.value : "",
      knowledgeBaseNames: props.knowledgeBases.map((knowledgeBase) => knowledgeBase.name),
    }),
  });
}

function openInputAssetPicker() {
  inputAssetInputRef.value?.click();
}

function clearInputAsset() {
  emitInputConfigPatch({ value: "" });
}

async function commitInputAssetFile(file: File | null) {
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
    emitInputConfigPatch({ value: JSON.stringify(envelope) });
  } catch (error) {
    console.error("Failed to read uploaded asset", error);
  }
}

function handleInputAssetFileChange(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const file = target.files?.[0] ?? null;
  void commitInputAssetFile(file);
  target.value = "";
}

function handleInputAssetDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0] ?? null;
  void commitInputAssetFile(file);
}

function handleConditionLoopLimitInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  conditionLoopLimitDraft.value = target.value;
}

function commitConditionLoopLimit() {
  if (props.node.kind !== "condition") {
    return;
  }

  const nextLoopLimit = parseConditionLoopLimitDraft(conditionLoopLimitDraft.value);
  if (nextLoopLimit === null) {
    conditionLoopLimitDraft.value = String(props.node.config.loopLimit ?? -1);
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

function handleConditionRuleSourceChange(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }
  updateConditionRule({ source: target.value });
}

function handleConditionRuleOperatorChange(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }
  updateConditionRule({ operator: target.value });
}

function handleConditionRuleValueInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  updateConditionRule({ value: target.value });
}

function buildConditionBranchDrafts(node: ConditionNode) {
  return Object.fromEntries(
    node.config.branches.map((branchKey) => [
      branchKey,
      {
        branchKey,
        mappingText: listConditionBranchMappingKeys(node.config.branchMapping, branchKey).join(", "),
      },
    ]),
  );
}

function handleConditionBranchKeyInput(currentKey: string, event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  conditionBranchDrafts.value = {
    ...conditionBranchDrafts.value,
    [currentKey]: {
      branchKey: target.value,
      mappingText: conditionBranchDrafts.value[currentKey]?.mappingText ?? "",
    },
  };
}

function handleConditionBranchMappingInput(currentKey: string, event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  conditionBranchDrafts.value = {
    ...conditionBranchDrafts.value,
    [currentKey]: {
      branchKey: conditionBranchDrafts.value[currentKey]?.branchKey ?? currentKey,
      mappingText: target.value,
    },
  };
}

function commitConditionBranch(currentKey: string) {
  if (props.node.kind !== "condition") {
    return;
  }

  const draft = conditionBranchDrafts.value[currentKey];
  if (!draft) {
    return;
  }

  const nextKey = draft.branchKey.trim();
  if (!nextKey) {
    conditionBranchDrafts.value = buildConditionBranchDrafts(props.node);
    return;
  }
  if (nextKey !== currentKey && props.node.config.branches.includes(nextKey)) {
    conditionBranchDrafts.value = buildConditionBranchDrafts(props.node);
    return;
  }

  const currentMappingKeys = listConditionBranchMappingKeys(props.node.config.branchMapping, currentKey);
  const nextMappingKeys = parseConditionBranchMappingDraft(draft.mappingText);
  const branchChanged = nextKey !== currentKey;
  const mappingChanged = JSON.stringify(currentMappingKeys) !== JSON.stringify(nextMappingKeys);

  if (!branchChanged && !mappingChanged) {
    return;
  }

  emitConditionBranchUpdate(currentKey, nextKey, nextMappingKeys);
}

function handleConditionBranchEnter(_currentKey: string, event: KeyboardEvent) {
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
  width: 460px;
  min-height: 260px;
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 28px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(255, 250, 241, 0.98) 0%, rgba(248, 237, 219, 0.96) 100%);
  box-shadow: 0 22px 40px rgba(60, 41, 20, 0.08);
  user-select: none;
}

.node-card--selected {
  border-color: rgba(154, 52, 18, 0.32);
  box-shadow: 0 22px 40px rgba(154, 52, 18, 0.14);
}

.node-card__top-actions {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 160ms ease;
}

.node-card:hover .node-card__top-actions,
.node-card--selected .node-card__top-actions,
.node-card__top-actions--visible {
  opacity: 1;
  pointer-events: auto;
}

.node-card__top-action-button {
  --el-color-primary: #c96b1f;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  background: rgba(255, 252, 247, 0.94);
  color: rgba(90, 58, 28, 0.82);
  box-shadow: 0 10px 24px rgba(60, 41, 20, 0.08);
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
  padding: 18px calc(var(--node-card-inline-padding) + 112px) 8px var(--node-card-inline-padding);
}

.node-card__eyebrow {
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 0.86rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.84);
  background: rgba(255, 255, 255, 0.78);
}

.node-card__title {
  margin: 0;
  font-size: 2rem;
  line-height: 1.15;
  color: #1f2937;
}

.node-card__description {
  margin: 0;
  padding: 0 var(--node-card-inline-padding) 20px;
  font-size: 0.98rem;
  line-height: 1.55;
  color: rgba(60, 41, 20, 0.74);
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
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
  min-height: 34px;
  max-width: 100%;
  border-radius: 0;
  border: none;
  background: transparent;
  padding: 0;
  box-shadow: none;
}

.node-card__port-pill--output {
  color: #1f2937;
}

.node-card__port-pill--input {
  justify-content: flex-start;
  color: #1d4ed8;
}

.node-card__port-pill--dock-start {
  margin-left: calc(var(--node-card-inline-padding) * -1);
}

.node-card__port-pill--dock-end {
  margin-right: calc(var(--node-card-inline-padding) * -1);
}

.node-card__port-pill-label {
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
  font-size: 1.02rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
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
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
}

.node-card__agent-model-select {
  --el-color-primary: #c96b1f;
  --el-border-radius-base: 16px;
  --el-border-color: rgba(154, 52, 18, 0.14);
  --el-text-color-primary: #3c2914;
}

.node-card__agent-model-select-shell {
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

.node-card__agent-thinking-card {
  display: grid;
  grid-template-columns: 20px 56px;
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

.node-card__agent-thinking-card:hover {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 252, 247, 0.94);
}

.node-card__agent-thinking-card:focus-within {
  border-color: rgba(201, 107, 31, 0.32);
  box-shadow:
    0 0 0 3px rgba(201, 107, 31, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.node-card__agent-thinking-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: rgba(111, 67, 30, 0.72);
  transition: color 140ms ease;
}

.node-card__agent-thinking-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.node-card__agent-thinking-icon--enabled {
  color: #b45309;
}

.node-card__agent-thinking-switch {
  justify-self: end;
  --el-switch-on-color: #c96b1f;
  --el-switch-off-color: rgba(154, 52, 18, 0.24);
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

.node-card__state-editor {
  display: grid;
  gap: 12px;
}

.node-card__state-editor-title,
.node-card__top-popover-title {
  font-size: 0.98rem;
  font-weight: 600;
  color: #1f2937;
}

.node-card__top-popover {
  display: grid;
  gap: 12px;
}

.node-card__advanced-popover-content {
  display: grid;
  gap: 12px;
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

:deep(.node-card__action-popover.el-popper),
:deep(.node-card__state-editor-popper.el-popper) {
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 18px;
  background: rgba(255, 250, 241, 0.98);
  box-shadow: 0 20px 40px rgba(60, 41, 20, 0.12);
}

:deep(.node-card__action-popover .el-popover),
:deep(.node-card__state-editor-popper .el-popover) {
  padding: 14px;
}

:deep(.node-card__state-editor-popper .el-input__wrapper),
:deep(.node-card__action-popover .el-input__wrapper) {
  min-height: 38px;
  border-radius: 14px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: none;
}

:deep(.node-card__state-editor-popper .el-textarea__inner),
:deep(.node-card__action-popover .el-textarea__inner) {
  border-radius: 14px;
  border-color: rgba(154, 52, 18, 0.16);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: none;
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
  display: grid;
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
  resize: vertical;
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
  min-height: 146px;
  display: grid;
  place-items: center;
  border-radius: 20px;
  background: rgba(248, 242, 234, 0.84);
  padding: 18px;
  text-align: center;
  font-size: 1.1rem;
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

.node-card__persist {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 1rem;
  color: rgba(60, 41, 20, 0.8);
}

.node-card__persist-button {
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.node-card__toggle {
  width: 56px;
  height: 32px;
  border-radius: 999px;
  background: rgba(154, 52, 18, 0.18);
  padding: 4px;
  display: inline-flex;
  align-items: center;
}

.node-card__toggle--on {
  justify-content: flex-end;
  background: rgba(154, 52, 18, 0.72);
}

.node-card__toggle-thumb {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
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
  min-height: 36px;
  width: 100%;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 14px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.86);
  color: #1f2937;
  font-size: 0.82rem;
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
