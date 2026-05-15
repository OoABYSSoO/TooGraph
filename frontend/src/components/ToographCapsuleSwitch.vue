<template>
  <ElSwitch
    class="toograph-capsule-switch"
    :class="`toograph-capsule-switch--${variant}`"
    :model-value="modelValue"
    :width="width"
    inline-prompt
    :active-text="activeText"
    :inactive-text="inactiveText"
    @pointerdown.stop
    @click.stop
    @update:model-value="emit('update:modelValue', Boolean($event))"
  />
</template>

<script setup lang="ts">
import { ElSwitch } from "element-plus";

withDefaults(
  defineProps<{
    modelValue: boolean;
    width?: number;
    activeText?: string;
    inactiveText?: string;
    variant?: "warm" | "blue";
  }>(),
  {
    width: 56,
    activeText: "ON",
    inactiveText: "OFF",
    variant: "warm",
  },
);

const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
}>();
</script>

<style scoped>
.toograph-capsule-switch {
  justify-self: end;
}

.toograph-capsule-switch--warm {
  --el-switch-on-color: #c96b1f;
  --el-switch-off-color: rgba(154, 52, 18, 0.24);
}

.toograph-capsule-switch--blue {
  --el-switch-on-color: #3b82f6;
  --el-switch-off-color: rgba(59, 130, 246, 0.22);
}

.toograph-capsule-switch :deep(.el-switch__core) {
  border-color: color-mix(in srgb, var(--el-switch-on-color) 34%, transparent);
  transition:
    border-color 140ms ease,
    background 140ms ease,
    box-shadow 140ms ease;
}

.toograph-capsule-switch :deep(.el-switch__inner) {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0;
}

.toograph-capsule-switch:focus-within :deep(.el-switch__core) {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-switch-on-color) 14%, transparent);
}
</style>
