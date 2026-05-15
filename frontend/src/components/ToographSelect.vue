<template>
  <ElSelect
    :key="renderKey"
    ref="selectRef"
    class="toograph-select"
    :model-value="modelValue"
    :teleported="teleported"
    :persistent="persistent"
    :popper-class="resolvedPopperClass"
    @pointerdown.stop
    @click.stop
    @update:model-value="handleUpdate"
    @change="emit('change', $event)"
    @visible-change="emit('visible-change', $event)"
    @focus="emit('focus', $event)"
    @blur="emit('blur', $event)"
    @popup-scroll="emit('popup-scroll', $event)"
  >
    <slot />
    <template v-if="$slots.label" #label>
      <slot name="label" />
    </template>
    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
    <template v-if="$slots.empty" #empty>
      <slot name="empty" />
    </template>
    <template v-if="$slots.prefix" #prefix>
      <slot name="prefix" />
    </template>
    <template v-if="$slots.loading" #loading>
      <slot name="loading" />
    </template>
  </ElSelect>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { ElSelect } from "element-plus";

export type ToographSelectValue = string | number | boolean | undefined;

type ToographSelectInstance = {
  blur?: () => void;
  dropdownMenuVisible?: boolean;
  expanded?: boolean;
  toggleMenu?: () => void;
};

const props = withDefaults(
  defineProps<{
    modelValue?: ToographSelectValue;
    popperClass?: string;
    teleported?: boolean;
    persistent?: boolean;
    collapseOnSelect?: boolean;
    remountOnSelect?: boolean;
  }>(),
  {
    popperClass: "",
    teleported: true,
    persistent: false,
    collapseOnSelect: true,
    remountOnSelect: false,
  },
);

const emit = defineEmits<{
  (event: "update:modelValue", value: ToographSelectValue): void;
  (event: "change", value: ToographSelectValue): void;
  (event: "visible-change", visible: boolean): void;
  (event: "focus", focusEvent: FocusEvent): void;
  (event: "blur", focusEvent: FocusEvent): void;
  (event: "popup-scroll", scrollEvent: Event): void;
}>();

const selectRef = ref<ToographSelectInstance | null>(null);
const renderKey = ref(0);
const resolvedPopperClass = computed(() => {
  return ["toograph-select-popper", props.popperClass].filter(Boolean).join(" ");
});

function handleUpdate(value: ToographSelectValue) {
  emit("update:modelValue", value);
  if (!props.collapseOnSelect) {
    return;
  }
  void nextTick(() => {
    collapseSelect();
    if (props.remountOnSelect) {
      renderKey.value += 1;
      globalThis.setTimeout(() => collapseSelect(), 0);
    }
  });
}

function collapseSelect() {
  const select = selectRef.value;
  if (!select) {
    return;
  }
  select.dropdownMenuVisible = false;
  select.expanded = false;
  select.blur?.();
}

defineExpose({
  collapseSelect,
});
</script>
