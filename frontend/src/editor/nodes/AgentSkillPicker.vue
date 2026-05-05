<template>
  <div class="node-card__action-row">
    <ElPopover
      v-if="showTrigger"
      :visible="open"
      placement="bottom-start"
      :width="360"
      :show-arrow="false"
      :popper-style="popoverStyle"
      popper-class="node-card__agent-add-popover-popper"
    >
      <template #reference>
        <button
          type="button"
          class="node-card__action-pill node-card__action-pill--skill node-card__action-pill-button"
          @pointerdown.stop
          @click.stop="emit('toggle')"
        >
          + skill
        </button>
      </template>
      <div class="node-card__agent-add-popover node-card__skill-picker" data-node-popup-surface="true" @pointerdown.stop @click.stop>
        <div class="node-card__skill-picker-title">{{ t("nodeCard.addSkill") }}</div>
        <div class="node-card__skill-picker-copy">{{ t("nodeCard.skillCopy") }}</div>
        <div v-if="loading" class="node-card__skill-panel-message">
          {{ t("nodeCard.loadingSkills") }}
        </div>
        <div v-else-if="error" class="node-card__skill-panel-message node-card__skill-panel-message--error">
          {{ error }}
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
          @click.stop="emit('attach', definition.skillKey)"
        >
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
        </button>
      </div>
    </ElPopover>
    <span v-else class="node-card__action-pill node-card__action-pill--skill node-card__action-pill--disabled">+ skill</span>
  </div>
  <div v-if="attachedSkillBadges.length > 0" class="node-card__skill-badges">
    <span
      v-for="badge in attachedSkillBadges"
      :key="badge.skillKey"
      class="node-card__skill-badge"
      :title="badge.description || badge.skillKey"
    >
      <span>{{ badge.name }}</span>
      <button
        type="button"
        class="node-card__skill-badge-remove"
        :title="t('nodeCard.removeSkill')"
        @pointerdown.stop
        @click.stop="emit('remove', badge.skillKey)"
      >
        &times;
      </button>
    </span>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";
import { ElPopover } from "element-plus";
import { useI18n } from "vue-i18n";

import type { SkillDefinition } from "@/types/skills";
import type { AttachedSkillBadge } from "./skillPickerModel";

defineProps<{
  open: boolean;
  showTrigger: boolean;
  loading: boolean;
  error: string | null;
  availableSkillDefinitions: SkillDefinition[];
  attachedSkillBadges: AttachedSkillBadge[];
  popoverStyle: CSSProperties;
}>();

const emit = defineEmits<{
  (event: "toggle"): void;
  (event: "attach", skillKey: string): void;
  (event: "remove", skillKey: string): void;
}>();

const { t } = useI18n();
</script>

<style scoped>
.node-card__action-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  flex-wrap: wrap;
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
  transition:
    border-color 160ms ease,
    background 160ms ease,
    transform 160ms ease;
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
</style>
