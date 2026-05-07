<template>
  <div class="node-card__agent-capability-stack">
    <div class="node-card__agent-capability-row">
      <div class="node-card__agent-skill-select-shell" @pointerdown.stop @click.stop>
        <ElSelect
          class="node-card__agent-skill-select graphite-select"
          :class="{ 'node-card__agent-skill-select--empty': isSkillEmpty }"
          :model-value="selectedSkillKey"
          :placeholder="skillPlaceholder"
          :disabled="skillSelectDisabled"
          filterable
          fit-input-width
          popper-class="graphite-select-popper node-card__agent-skill-popper"
          :aria-label="t('nodeCard.selectSkill')"
          @update:model-value="emit('update:selected-skill', String($event ?? ''))"
        >
          <ElOption :label="t('nodeCard.noSkillOption')" value="" />
          <ElOption
            v-if="selectedSkillMissing"
            :label="selectedSkillKey"
            :value="selectedSkillKey"
            disabled
          />
          <ElOption
            v-for="definition in availableSkillDefinitions"
            :key="definition.skillKey"
            :label="definition.name"
            :value="definition.skillKey"
          >
            <div class="node-card__skill-option">
              <div class="node-card__skill-option-title">{{ definition.name }}</div>
              <div class="node-card__skill-option-copy">{{ definition.description }}</div>
              <div class="node-card__skill-option-meta">
                <span>{{ definition.kind }}</span>
                <span>{{ definition.mode }}</span>
                <span>{{ definition.scope }}</span>
                <span>{{ definition.runtime.type }}:{{ definition.runtime.entrypoint || definition.skillKey }}</span>
                <span v-if="definition.inputSchema.length > 0">{{ t("nodeCard.inputCount", { count: definition.inputSchema.length }) }}</span>
                <span v-if="definition.outputSchema.length > 0">{{ t("nodeCard.outputCount", { count: definition.outputSchema.length }) }}</span>
              </div>
            </div>
          </ElOption>
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
            <ElSwitch
              class="node-card__agent-toggle-switch node-card__agent-breakpoint-switch"
              :model-value="breakpointEnabled"
              :width="56"
              inline-prompt
              active-text="ON"
              inactive-text="OFF"
              :aria-label="t('nodeCard.toggleBreakpoint')"
              @pointerdown.stop
              @click.stop
              @update:model-value="emit('update:breakpoint-enabled', $event)"
            />
          </div>
        </template>
        <div class="node-card__confirm-hint node-card__confirm-hint--toggle">{{ t("nodeCard.setBreakpoint") }}</div>
      </ElPopover>
    </div>
    <div v-if="loading" class="node-card__skill-panel-message">
      {{ t("nodeCard.loadingSkills") }}
    </div>
    <div v-else-if="error" class="node-card__skill-panel-message node-card__skill-panel-message--error">
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";
import { computed } from "vue";
import { ElIcon, ElOption, ElPopover, ElSelect, ElSwitch } from "element-plus";
import { Flag } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

import type { SkillDefinition } from "@/types/skills";

const props = defineProps<{
  selectedSkillKey: string;
  loading: boolean;
  error: string | null;
  availableSkillDefinitions: SkillDefinition[];
  breakpointEnabled: boolean;
  confirmPopoverStyle: CSSProperties;
}>();

const emit = defineEmits<{
  (event: "update:selected-skill", skillKey: string): void;
  (event: "update:breakpoint-enabled", value: string | number | boolean): void;
}>();

const { t } = useI18n();
const isSkillEmpty = computed(() => !props.selectedSkillKey.trim());
const selectedSkillMissing = computed(
  () => Boolean(props.selectedSkillKey) && !props.availableSkillDefinitions.some((definition) => definition.skillKey === props.selectedSkillKey),
);
const skillSelectDisabled = computed(
  () => props.loading || Boolean(props.error),
);
const skillPlaceholder = computed(() => {
  if (props.loading) {
    return t("nodeCard.loadingSkills");
  }
  if (props.error) {
    return t("nodeCard.skillLoadFailed");
  }
  return isSkillEmpty.value ? t("nodeCard.noSkill") : t("nodeCard.selectSkill");
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

.node-card__agent-skill-select-shell {
  width: 100%;
  min-width: 0;
}

.node-card__agent-skill-select {
  width: 100%;
  --el-color-primary: #2563eb;
  --el-border-radius-base: 16px;
  --el-border-color: rgba(37, 99, 235, 0.18);
  --el-text-color-primary: #1d4ed8;
}

.node-card__agent-skill-select :deep(.el-select__wrapper) {
  min-height: 48px;
  border-radius: 16px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  background: rgba(239, 246, 255, 0.9);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.58);
  padding: 0 14px;
}

.node-card__agent-skill-select--empty :deep(.el-select__wrapper) {
  border-style: dashed;
  border-width: 1.5px;
  border-color: rgba(37, 99, 235, 0.5);
  background: rgba(239, 246, 255, 0.58);
}

.node-card__agent-skill-select--empty :deep(.el-select__wrapper:hover) {
  border-color: rgba(37, 99, 235, 0.68);
  background: rgba(219, 234, 254, 0.66);
}

.node-card__agent-skill-select :deep(.el-select__wrapper:hover) {
  border-color: rgba(37, 99, 235, 0.3);
  background: rgba(219, 234, 254, 0.82);
}

.node-card__agent-skill-select :deep(.el-select__wrapper.is-focused) {
  border-color: rgba(37, 99, 235, 0.42);
  box-shadow:
    0 0 0 3px rgba(37, 99, 235, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.58);
}

.node-card__agent-skill-select :deep(.el-select__placeholder) {
  color: rgba(29, 78, 216, 0.62);
}

.node-card__agent-skill-select :deep(.el-select__selected-item),
.node-card__agent-skill-select :deep(.el-select__input-text),
.node-card__agent-skill-select :deep(.el-select__selection .el-tag) {
  color: #1d4ed8;
  font-size: 0.92rem;
  font-weight: 650;
}

.node-card__agent-skill-select :deep(.is-disabled .el-select__wrapper) {
  opacity: 0.62;
  background: rgba(239, 246, 255, 0.58);
}

.node-card__skill-option {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.node-card__skill-option-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: #1e3a8a;
}

.node-card__skill-option-copy {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.76rem;
  line-height: 1.4;
  color: rgba(30, 58, 138, 0.72);
}

.node-card__skill-option-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #2563eb;
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

.node-card__skill-panel-message {
  border-radius: 14px;
  border: 1px solid rgba(37, 99, 235, 0.12);
  background: rgba(239, 246, 255, 0.74);
  padding: 10px 12px;
  font-size: 0.8rem;
  line-height: 1.45;
  color: rgba(30, 58, 138, 0.76);
}

.node-card__skill-panel-message--error {
  border-color: rgba(185, 28, 28, 0.18);
  background: rgba(254, 242, 242, 0.92);
  color: rgb(153, 27, 27);
}
</style>
