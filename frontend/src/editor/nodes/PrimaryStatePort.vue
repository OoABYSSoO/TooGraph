<template>
  <div
    v-if="port"
    class="node-card__port-pill-row"
    :class="{ 'node-card__port-pill-row--right': side === 'output' }"
  >
    <ElPopover
      :visible="isPopoverVisible"
      :placement="popoverPlacement"
      :width="popoverWidth"
      :show-arrow="false"
      :popper-style="port.virtual ? createPopoverStyle : stateEditorPopoverStyle"
      :popper-class="port.virtual ? 'node-card__agent-add-popover-popper' : 'node-card__state-editor-popper'"
    >
      <template #reference>
        <span
          class="node-card__port-pill"
          :class="[
            side === 'input'
              ? 'node-card__port-pill--input node-card__port-pill--dock-start'
              : 'node-card__port-pill--output node-card__port-pill--dock-end',
            {
              'node-card__port-pill--create': port.virtual,
              'node-card__port-pill--skill-managed': isManagedPort,
              'node-card__port-pill--revealed': !port.virtual && isStateEditorPillRevealed(anchorId),
              'node-card__port-pill--confirm': !port.virtual && isStateEditorConfirmOpen(anchorId),
            },
          ]"
          :style="{ '--node-card-port-accent': portAccentColor }"
          :data-state-editor-trigger="canEditPort ? 'true' : undefined"
          data-anchor-hitarea="true"
          @pointerenter="emit('pointer-enter', anchorId)"
          @pointerleave="emit('pointer-leave', anchorId)"
          @pointerdown.stop
          @click.stop="handlePortClick"
        >
          <span
            v-if="side === 'input'"
            class="node-card__port-pill-anchor-slot node-card__port-pill-anchor-slot--leading"
            :data-anchor-slot-id="anchorSlotId"
            aria-hidden="true"
          />
          <ElIcon
            v-if="isManagedPort"
            class="node-card__port-pill-source-icon"
            :title="port.managedBySkill ? 'Skill managed output' : 'Dynamic capability managed state'"
          >
            <Connection />
          </ElIcon>
          <span
            class="node-card__port-pill-label"
            :class="{ 'node-card__port-pill-label--confirm': isStateEditorConfirmOpen(anchorId) }"
          >
            <span class="node-card__port-pill-label-text">{{ portLabel }}</span>
            <ElIcon class="node-card__port-pill-confirm-icon"><Check /></ElIcon>
          </span>
          <span
            v-if="side === 'output'"
            class="node-card__port-pill-anchor-slot"
            :data-anchor-slot-id="anchorSlotId"
            aria-hidden="true"
          />
        </span>
      </template>
      <StatePortCreatePopover
        v-if="port.virtual && createOpen && createDraft"
        :draft="createDraft"
        :title="createTitle"
        :error="createError"
        :hint="createHint"
        :type-options="typeOptions"
        @update:name="emit('update:create-name', $event)"
        @update:type="emit('update:create-type', $event)"
        @update:color="emit('update:create-color', $event)"
        @update:description="emit('update:create-description', $event)"
        @update:value="emit('update:create-value', $event)"
        @cancel="emit('cancel-create')"
        @create="emit('commit-create')"
      />
      <div
        v-else-if="allowRemoveConfirm && isRemovePortStateConfirmOpen(anchorId)"
        class="node-card__confirm-hint node-card__confirm-hint--remove"
      >
        {{ t("nodeCard.removeStateQuestion") }}
      </div>
      <div v-else-if="isStateEditorConfirmOpen(anchorId)" class="node-card__confirm-hint node-card__confirm-hint--state">
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
  <span v-else-if="fallbackLabel" class="node-card__port-label">{{ fallbackLabel }}</span>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { ElIcon, ElPopover } from "element-plus";
import { Check, Connection } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

import StateEditorPopover from "./StateEditorPopover.vue";
import StatePortCreatePopover from "./StatePortCreatePopover.vue";
import type { NodePortViewModel } from "./nodeCardViewModel";
import type { StateColorOption, StateFieldDraft, StateFieldType } from "@/editor/workspace/statePanelFields";

const props = withDefaults(defineProps<{
  side: "input" | "output";
  port: NodePortViewModel | null;
  nodeId: string;
  anchorPrefix: string;
  fallbackLabel?: string;
  pendingVirtualTarget?: { label: string; stateColor: string } | null;
  allowRemoveConfirm?: boolean;
  createOpen: boolean;
  createDraft: StateFieldDraft | null;
  createTitle: string;
  createError: string | null;
  createHint: string;
  stateEditorPopoverStyle: CSSProperties;
  createPopoverStyle: CSSProperties;
  stateEditorDraft: StateFieldDraft | null;
  stateEditorError: string | null;
  typeOptions: StateFieldType[];
  colorOptions: StateColorOption[];
  isStateEditorOpen: (anchorId: string) => boolean;
  isStateEditorConfirmOpen: (anchorId: string) => boolean;
  isRemovePortStateConfirmOpen: (anchorId: string) => boolean;
  isStateEditorPillRevealed: (anchorId: string) => boolean;
}>(), {
  fallbackLabel: "",
  pendingVirtualTarget: null,
  allowRemoveConfirm: false,
});

const emit = defineEmits<{
  (event: "pointer-enter", anchorId: string): void;
  (event: "pointer-leave", anchorId: string): void;
  (event: "open-create", side: "input" | "output"): void;
  (event: "port-click", anchorId: string, stateKey: string): void;
  (event: "update:name", value: string): void;
  (event: "update:type", value: string): void;
  (event: "update:color", value: string): void;
  (event: "update:description", value: string): void;
  (event: "update:create-name", value: string | number): void;
  (event: "update:create-type", value: string | number | boolean | undefined): void;
  (event: "update:create-color", value: string | number | boolean | undefined): void;
  (event: "update:create-description", value: string | number): void;
  (event: "update:create-value", value: unknown): void;
  (event: "cancel-create"): void;
  (event: "commit-create"): void;
}>();

const { t } = useI18n();

const anchorSlotKind = computed(() => (props.side === "input" ? "state-in" : "state-out"));
const anchorId = computed(() => (props.port ? `${props.anchorPrefix}:${props.port.key}` : ""));
const anchorSlotId = computed(() => (props.port ? `${props.nodeId}:${anchorSlotKind.value}:${props.port.key}` : ""));
const portLabel = computed(() => {
  const port = props.port;
  if (!port) {
    return "";
  }
  return port.virtual ? props.pendingVirtualTarget?.label ?? port.label : port.label;
});
const portAccentColor = computed(() => {
  const port = props.port;
  if (!port) {
    return "";
  }
  return port.virtual ? props.pendingVirtualTarget?.stateColor ?? port.stateColor : port.stateColor;
});
const isPopoverVisible = computed(() => {
  const port = props.port;
  if (!port) {
    return false;
  }
  if (port.virtual) {
    return props.createOpen;
  }
  return canEditPort.value && (
    props.isStateEditorOpen(anchorId.value) ||
    props.isStateEditorConfirmOpen(anchorId.value) ||
    (props.allowRemoveConfirm && props.isRemovePortStateConfirmOpen(anchorId.value))
  );
});
const popoverPlacement = computed(() => {
  const openedBelow = Boolean(props.port?.virtual) || props.isStateEditorOpen(anchorId.value);
  if (props.side === "output") {
    return openedBelow ? "bottom-end" : "top-end";
  }
  return openedBelow ? "bottom-start" : "top-start";
});
const popoverWidth = computed(() => {
  if (props.port?.virtual) {
    return 376;
  }
  return props.isStateEditorOpen(anchorId.value) ? 320 : undefined;
});
const isManagedPort = computed(() => Boolean(props.port?.managedBySkill || props.port?.managedByCapability));
const canEditPort = computed(() => Boolean(props.port && !props.port.virtual && !isManagedPort.value));

function handlePortClick() {
  if (!props.port) {
    return;
  }
  if (props.port.virtual) {
    emit("open-create", props.side);
    return;
  }
  if (isManagedPort.value) {
    return;
  }
  emit("port-click", anchorId.value, props.port.key);
}
</script>

<style scoped>
.node-card__port-pill-row {
  display: flex;
  align-items: center;
  min-height: 34px;
  gap: 10px;
}

.node-card__port-pill-row--right {
  justify-content: flex-end;
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

.node-card__port-label {
  font-size: 1.08rem;
  font-weight: 600;
  color: #1f2937;
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

:deep(.node-card__agent-add-popover-popper.el-popper),
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
</style>
