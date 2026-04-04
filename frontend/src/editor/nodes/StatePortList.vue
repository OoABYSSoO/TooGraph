<template>
  <TransitionGroup
    name="node-card-port-reorder"
    tag="div"
    class="node-card__port-reorder-stack"
    :class="{ 'node-card__port-reorder-stack--right': side === 'output' }"
  >
    <div
      v-for="port in ports"
      :key="port.key"
      class="node-card__port-pill-row"
      :class="{ 'node-card__port-pill-row--right': side === 'output' }"
    >
      <ElPopover
        :visible="
          canEditPort(port) &&
          (isStateEditorOpen(anchorId(port.key)) ||
            isStateEditorConfirmOpen(anchorId(port.key)) ||
            isRemovePortStateConfirmOpen(anchorId(port.key)))
        "
        :placement="isStateEditorOpen(anchorId(port.key)) ? editorPlacement : confirmPlacement"
        :width="isStateEditorOpen(anchorId(port.key)) ? 320 : undefined"
        :show-arrow="false"
        :popper-style="popoverStyle"
        popper-class="node-card__state-editor-popper"
      >
        <template #reference>
          <span
            class="node-card__port-pill"
            :class="[
              side === 'input'
                ? 'node-card__port-pill--input node-card__port-pill--dock-start'
                : 'node-card__port-pill--output node-card__port-pill--dock-end',
              {
                'node-card__port-pill--removable': canRemovePort(port),
                'node-card__port-pill--skill-managed': isManagedPort(port),
                'node-card__port-pill--revealed': isStateEditorPillRevealed(anchorId(port.key)),
                'node-card__port-pill--confirm': isStateEditorConfirmOpen(anchorId(port.key)),
                'node-card__port-pill--reordering': canReorderPort(port) && isPortReordering(side, port.key),
                'node-card__port-pill--reorder-placeholder': canReorderPort(port) && isPortReorderPlaceholder(side, port.key),
              },
            ]"
            :style="{ '--node-card-port-accent': port.stateColor }"
            :data-state-editor-trigger="canEditPort(port) ? 'true' : undefined"
            :data-anchor-hitarea="side === 'input' ? 'true' : undefined"
            :data-port-reorder-node-id="canReorderPort(port) ? nodeId : undefined"
            :data-port-reorder-side="canReorderPort(port) ? side : undefined"
            :data-port-reorder-state-key="canReorderPort(port) ? port.key : undefined"
            @pointerenter="emit('pointer-enter', anchorId(port.key))"
            @pointerleave="emit('pointer-leave', anchorId(port.key))"
            @pointerdown.stop="handlePortPointerDown(port, $event)"
            @click.stop="handlePortClick(port)"
          >
            <span
              v-if="side === 'input'"
              class="node-card__port-pill-anchor-slot node-card__port-pill-anchor-slot--leading"
              :data-anchor-slot-id="anchorSlotId(port.key)"
              aria-hidden="true"
            />
            <button
              v-if="side === 'output' && canRemovePort(port)"
              type="button"
              class="node-card__port-pill-remove node-card__port-pill-remove--leading"
              :class="{ 'node-card__port-pill-remove--confirm': isRemovePortStateConfirmOpen(anchorId(port.key)) }"
              :aria-label="t('nodeCard.removeStateBinding')"
              @pointerdown.stop
              @click.stop="emit('remove-click', anchorId(port.key), side, port.key)"
            >
              <ElIcon v-if="isRemovePortStateConfirmOpen(anchorId(port.key))"><Check /></ElIcon>
              <ElIcon v-else><Delete /></ElIcon>
            </button>
            <ElIcon
              v-if="isManagedPort(port)"
              class="node-card__port-pill-source-icon"
              :title="port.managedBySkill ? 'Skill managed output' : 'Dynamic capability managed state'"
            >
              <Connection />
            </ElIcon>
            <span
              class="node-card__port-pill-label"
              :class="{ 'node-card__port-pill-label--confirm': isStateEditorConfirmOpen(anchorId(port.key)) }"
            >
              <span class="node-card__port-pill-label-text">{{ port.label }}</span>
              <ElIcon class="node-card__port-pill-confirm-icon"><Check /></ElIcon>
            </span>
            <button
              v-if="side === 'input' && canRemovePort(port)"
              type="button"
              class="node-card__port-pill-remove node-card__port-pill-remove--trailing"
              :class="{ 'node-card__port-pill-remove--confirm': isRemovePortStateConfirmOpen(anchorId(port.key)) }"
              :aria-label="t('nodeCard.removeStateBinding')"
              @pointerdown.stop
              @click.stop="emit('remove-click', anchorId(port.key), side, port.key)"
            >
              <ElIcon v-if="isRemovePortStateConfirmOpen(anchorId(port.key))"><Check /></ElIcon>
              <ElIcon v-else><Delete /></ElIcon>
            </button>
            <span
              v-if="side === 'output'"
              class="node-card__port-pill-anchor-slot"
              :data-anchor-slot-id="anchorSlotId(port.key)"
              aria-hidden="true"
            />
          </span>
        </template>
        <div
          v-if="isRemovePortStateConfirmOpen(anchorId(port.key))"
          class="node-card__confirm-hint node-card__confirm-hint--remove"
        >
          {{ t("nodeCard.removeStateQuestion") }}
        </div>
        <div
          v-else-if="isStateEditorConfirmOpen(anchorId(port.key))"
          class="node-card__confirm-hint node-card__confirm-hint--state"
        >
          {{ t("nodeCard.editStateQuestion") }}
        </div>
        <StateEditorPopover
          v-else-if="stateEditorDraft"
          class="node-card__state-editor"
          :draft="stateEditorDraft"
          :error="stateEditorError"
          :type-options="typeOptions"
          :color-options="colorOptions"
          @update:name="emit('update:name', $event)"
          @update:type="emit('update:type', $event)"
          @update:color="emit('update:color', $event)"
          @update:description="emit('update:description', $event)"
        />
      </ElPopover>
    </div>
  </TransitionGroup>
  <ElPopover
    :visible="createOpen"
    :placement="createPlacement"
    :width="376"
    :show-arrow="false"
    :popper-style="createPopoverStyle"
    popper-class="node-card__agent-add-popover-popper"
  >
    <template #reference>
      <div
        class="node-card__port-pill-row node-card__port-pill-row--create"
        :class="{
          'node-card__port-pill-row--right': side === 'output',
          'node-card__port-pill-row--create-visible': createVisible,
        }"
      >
        <span
          class="node-card__port-pill node-card__port-pill--create"
          :class="
            side === 'input'
              ? 'node-card__port-pill--input node-card__port-pill--dock-start'
              : 'node-card__port-pill--output node-card__port-pill--dock-end'
          "
          :style="{ '--node-card-port-accent': createAccentColor }"
          :data-agent-create-port="side"
          data-anchor-hitarea="true"
          @pointerdown.stop
          @click.stop="emit('open-create', side)"
        >
          <span
            v-if="side === 'input'"
            class="node-card__port-pill-anchor-slot node-card__port-pill-anchor-slot--leading"
            :data-anchor-slot-id="`${nodeId}:state-in:${createAnchorStateKey}`"
            aria-hidden="true"
          />
          <span class="node-card__port-pill-label">
            <span class="node-card__port-pill-label-text">{{ createLabel }}</span>
          </span>
          <span
            v-if="side === 'output'"
            class="node-card__port-pill-anchor-slot"
            :data-anchor-slot-id="`${nodeId}:state-out:${createAnchorStateKey}`"
            aria-hidden="true"
          />
        </span>
      </div>
    </template>
    <StatePortCreatePopover
      v-if="createOpen && createDraft"
      :draft="createDraft"
      :title="createTitle"
      :error="createError"
      :hint="createHint"
      :type-options="createTypeOptions"
      @update:name="emit('update:create-name', $event)"
      @update:type="emit('update:create-type', $event)"
      @update:color="emit('update:create-color', $event)"
      @update:description="emit('update:create-description', $event)"
      @update:value="emit('update:create-value', $event)"
      @cancel="emit('cancel-create')"
      @create="emit('commit-create')"
    />
  </ElPopover>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { ElIcon, ElPopover } from "element-plus";
import { Check, Connection, Delete } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

import StateEditorPopover from "./StateEditorPopover.vue";
import StatePortCreatePopover from "./StatePortCreatePopover.vue";
import type { NodePortViewModel } from "./nodeCardViewModel";
import type { StateColorOption, StateFieldDraft, StateFieldType } from "@/editor/workspace/statePanelFields";

const props = defineProps<{
  side: "input" | "output";
  ports: NodePortViewModel[];
  nodeId: string;
  popoverStyle: CSSProperties;
  createVisible: boolean;
  createOpen: boolean;
  createAccentColor: string;
  createLabel: string;
  createAnchorStateKey: string;
  createDraft: StateFieldDraft | null;
  createTitle: string;
  createError: string | null;
  createHint: string;
  createTypeOptions: string[];
  createPopoverStyle: CSSProperties;
  stateEditorDraft: StateFieldDraft | null;
  stateEditorError: string | null;
  typeOptions: StateFieldType[];
  colorOptions: StateColorOption[];
  isStateEditorOpen: (anchorId: string) => boolean;
  isStateEditorConfirmOpen: (anchorId: string) => boolean;
  isRemovePortStateConfirmOpen: (anchorId: string) => boolean;
  isStateEditorPillRevealed: (anchorId: string) => boolean;
  isPortReordering: (side: "input" | "output", stateKey: string) => boolean;
  isPortReorderPlaceholder: (side: "input" | "output", stateKey: string) => boolean;
}>();

const emit = defineEmits<{
  (event: "pointer-enter", anchorId: string): void;
  (event: "pointer-leave", anchorId: string): void;
  (event: "reorder-pointer-down", side: "input" | "output", stateKey: string, pointerEvent: PointerEvent): void;
  (event: "port-click", anchorId: string, stateKey: string): void;
  (event: "remove-click", anchorId: string, side: "input" | "output", stateKey: string): void;
  (event: "update:name", value: string): void;
  (event: "update:type", value: string): void;
  (event: "update:color", value: string): void;
  (event: "update:description", value: string): void;
  (event: "open-create", side: "input" | "output"): void;
  (event: "update:create-name", value: string | number): void;
  (event: "update:create-type", value: string | number | boolean | undefined): void;
  (event: "update:create-color", value: string | number | boolean | undefined): void;
  (event: "update:create-description", value: string | number): void;
  (event: "update:create-value", value: unknown): void;
  (event: "cancel-create"): void;
  (event: "commit-create"): void;
}>();

const { t } = useI18n();

const anchorPrefix = computed(() => (props.side === "input" ? "agent-input" : "agent-output"));
const anchorSlotKind = computed(() => (props.side === "input" ? "state-in" : "state-out"));
const editorPlacement = computed(() => (props.side === "input" ? "bottom-start" : "bottom-end"));
const confirmPlacement = computed(() => (props.side === "input" ? "top-start" : "top-end"));
const createPlacement = computed(() => (props.side === "input" ? "bottom-start" : "bottom-end"));

function anchorId(stateKey: string) {
  return `${anchorPrefix.value}:${stateKey}`;
}

function anchorSlotId(stateKey: string) {
  return `${props.nodeId}:${anchorSlotKind.value}:${stateKey}`;
}

function canEditPort(port: NodePortViewModel) {
  return !port.virtual && !isManagedPort(port);
}

function canRemovePort(port: NodePortViewModel) {
  return !port.virtual && !(props.side === "output" && isManagedPort(port));
}

function canReorderPort(port: NodePortViewModel) {
  return canEditPort(port);
}

function isManagedPort(port: NodePortViewModel) {
  return Boolean(port.managedBySkill || port.managedByCapability);
}

function handlePortPointerDown(port: NodePortViewModel, pointerEvent: PointerEvent) {
  if (!canReorderPort(port)) {
    return;
  }
  emit("reorder-pointer-down", props.side, port.key, pointerEvent);
}

function handlePortClick(port: NodePortViewModel) {
  if (!canEditPort(port)) {
    return;
  }
  emit("port-click", anchorId(port.key), port.key);
}
</script>

<style scoped>
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

.node-card__port-pill-row--create {
  display: none;
  min-height: 0;
  pointer-events: none;
}

.node-card__port-pill-row--create-visible {
  display: flex;
  min-height: 34px;
  pointer-events: auto;
}

.node-card__port-pill {
  --node-card-port-accent: rgba(217, 119, 6, 0.92);
  position: relative;
  box-sizing: border-box;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
  min-height: 34px;
  min-width: 132px;
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

.node-card__port-pill--skill-managed {
  cursor: default;
}

.node-card__port-pill--skill-managed:focus-visible,
.node-card__port-pill--skill-managed.node-card__port-pill--revealed {
  border-color: color-mix(in srgb, var(--node-card-port-accent) 22%, transparent);
  background: color-mix(in srgb, var(--node-card-port-accent) 8%, #fff);
}

.node-card__port-pill-source-icon {
  flex: none;
  width: 16px;
  height: 16px;
  color: color-mix(in srgb, var(--node-card-port-accent) 78%, #1f2937);
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
  flex: 0 0 auto;
  align-items: center;
  min-width: 0;
  padding-inline: 0;
  white-space: nowrap;
  font-size: 1.02rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
}

.node-card__port-pill-label-text {
  display: block;
  min-width: 0;
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
</style>
