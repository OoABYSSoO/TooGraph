<template>
  <div class="node-card__agent-capability-stack">
    <div class="node-card__agent-capability-row">
      <div class="node-card__agent-action-select-shell" @pointerdown.stop @click.stop>
        <ToographSelect
          class="node-card__agent-action-select"
          :class="{ 'node-card__agent-action-select--empty': isActionEmpty }"
          :model-value="selectedActionKey"
          :placeholder="actionPlaceholder"
          :disabled="actionSelectDisabled"
          filterable
          popper-class="node-card__agent-action-popper"
          :aria-label="t('nodeCard.selectAction')"
          @update:model-value="emit('update:selected-action', String($event ?? ''))"
        >
          <ElOption :label="t('nodeCard.noActionOption')" value="" />
          <ElOption
            v-if="selectedActionMissing"
            :label="selectedActionKey"
            :value="selectedActionKey"
            disabled
          />
          <ElOption
            v-for="definition in availableActionDefinitions"
            :key="definition.actionKey"
            :label="definition.name"
            :value="definition.actionKey"
          />
        </ToographSelect>
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
            class="node-card__agent-toggle-card node-card__agent-toggle-card--breakpoint"
            :class="{ 'node-card__agent-toggle-card--enabled': breakpointEnabled }"
            @pointerdown.stop
            @click.stop
          >
            <ElIcon
              class="node-card__agent-breakpoint-icon"
              :class="{ 'node-card__agent-breakpoint-icon--enabled': breakpointEnabled }"
            >
              <Flag />
            </ElIcon>
            <ToographCapsuleSwitch
              class="node-card__agent-toggle-switch node-card__agent-breakpoint-switch"
              :model-value="breakpointEnabled"
              :width="56"
              active-text="ON"
              inactive-text="OFF"
              :aria-label="t('nodeCard.toggleBreakpoint')"
              @update:model-value="emit('update:breakpoint-enabled', $event)"
            />
          </div>
        </template>
        <div class="node-card__confirm-hint node-card__confirm-hint--toggle">{{ t("nodeCard.setBreakpoint") }}</div>
      </ElPopover>
    </div>
    <div v-if="loading" class="node-card__action-panel-message">
      {{ t("nodeCard.loadingActions") }}
    </div>
    <div v-else-if="error" class="node-card__action-panel-message node-card__action-panel-message--error">
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";
import { computed } from "vue";
import { ElIcon, ElOption, ElPopover } from "element-plus";
import { Flag } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

import ToographCapsuleSwitch from "@/components/ToographCapsuleSwitch.vue";
import ToographSelect from "@/components/ToographSelect.vue";
import type { ActionDefinition } from "@/types/actions";

const props = defineProps<{
  selectedActionKey: string;
  loading: boolean;
  error: string | null;
  availableActionDefinitions: ActionDefinition[];
  breakpointEnabled: boolean;
  confirmPopoverStyle: CSSProperties;
}>();

const emit = defineEmits<{
  (event: "update:selected-action", actionKey: string): void;
  (event: "update:breakpoint-enabled", value: string | number | boolean): void;
}>();

const { t } = useI18n();
const isActionEmpty = computed(() => !props.selectedActionKey.trim());
const selectedActionMissing = computed(
  () => Boolean(props.selectedActionKey) && !props.availableActionDefinitions.some((definition) => definition.actionKey === props.selectedActionKey),
);
const actionSelectDisabled = computed(
  () => props.loading || Boolean(props.error),
);
const actionPlaceholder = computed(() => {
  if (props.loading) {
    return t("nodeCard.loadingActions");
  }
  if (props.error) {
    return t("nodeCard.actionLoadFailed");
  }
  return isActionEmpty.value ? t("nodeCard.noAction") : t("nodeCard.selectAction");
});
</script>

<style scoped>
.node-card__agent-capability-stack {
  display: grid;
  gap: 8px;
}

.node-card__agent-capability-row {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(132px, 0.65fr);
  gap: 10px;
  align-items: center;
  justify-content: stretch;
}

.node-card__agent-action-select-shell {
  width: 100%;
  min-width: 0;
}

.node-card__agent-action-select {
  width: 100%;
  --el-color-primary: #2563eb;
  --el-border-radius-base: 16px;
  --el-border-color: rgba(37, 99, 235, 0.18);
  --el-text-color-primary: #1d4ed8;
}

.node-card__agent-action-select :deep(.el-select__wrapper) {
  min-height: 48px;
  border-radius: 16px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  background: rgba(239, 246, 255, 0.9);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.58);
  padding: 0 14px;
}

.node-card__agent-action-select--empty :deep(.el-select__wrapper) {
  border-style: dashed;
  border-width: 1.5px;
  border-color: rgba(37, 99, 235, 0.5);
  background: rgba(239, 246, 255, 0.58);
}

.node-card__agent-action-select--empty :deep(.el-select__wrapper:hover) {
  border-color: rgba(37, 99, 235, 0.68);
  background: rgba(219, 234, 254, 0.66);
}

.node-card__agent-action-select :deep(.el-select__wrapper:hover) {
  border-color: rgba(37, 99, 235, 0.3);
  background: rgba(219, 234, 254, 0.82);
}

.node-card__agent-action-select :deep(.el-select__wrapper.is-focused) {
  border-color: rgba(37, 99, 235, 0.42);
  box-shadow:
    0 0 0 3px rgba(37, 99, 235, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.58);
}

.node-card__agent-action-select :deep(.el-select__placeholder) {
  color: rgba(29, 78, 216, 0.62);
}

.node-card__agent-action-select :deep(.el-select__selected-item),
.node-card__agent-action-select :deep(.el-select__input-text),
.node-card__agent-action-select :deep(.el-select__selection .el-tag) {
  color: #1d4ed8;
  font-size: 0.92rem;
  font-weight: 650;
}

.node-card__agent-action-select :deep(.is-disabled .el-select__wrapper) {
  opacity: 0.62;
  background: rgba(239, 246, 255, 0.58);
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

.node-card__agent-breakpoint-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: rgba(111, 67, 30, 0.72);
  transition: color 140ms ease;
}

.node-card__agent-breakpoint-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.node-card__agent-breakpoint-icon--enabled {
  color: #b45309;
}

.node-card__agent-toggle-switch {
  justify-self: end;
  --el-switch-on-color: #c96b1f;
  --el-switch-off-color: rgba(154, 52, 18, 0.24);
}

:deep(.node-card__agent-toggle-hint-popper.el-popper) {
  border: 0;
  background: transparent;
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

.node-card__confirm-hint--toggle {
  border-color: rgba(201, 107, 31, 0.24);
  background: rgb(255, 247, 237);
  color: rgb(154, 52, 18);
}

.node-card__action-panel-message {
  border-radius: 14px;
  border: 1px solid rgba(37, 99, 235, 0.12);
  background: rgba(239, 246, 255, 0.74);
  padding: 10px 12px;
  font-size: 0.8rem;
  line-height: 1.45;
  color: rgba(30, 58, 138, 0.76);
}

.node-card__action-panel-message--error {
  border-color: rgba(185, 28, 28, 0.18);
  background: rgba(254, 242, 242, 0.92);
  color: rgb(153, 27, 27);
}
</style>
