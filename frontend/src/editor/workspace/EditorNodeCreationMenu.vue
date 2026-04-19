<template>
  <div
    v-if="open && position"
    ref="menuRef"
    class="editor-node-creation-menu"
    :style="menuStyle"
    data-node-popup-surface="true"
    @pointerdown.stop
    @click.stop
  >
    <div class="editor-node-creation-menu__header">
      <div>
        <div class="editor-node-creation-menu__eyebrow">Create Node</div>
        <p class="editor-node-creation-menu__summary">
          {{ context?.sourceValueType ? `Choose a node for ${context.sourceValueType} output` : "Choose a node to create" }}
        </p>
      </div>
      <button type="button" class="editor-node-creation-menu__close" @click="$emit('close')">Close</button>
    </div>

    <ElInput
      class="editor-node-creation-menu__search"
      :model-value="query"
      placeholder="Search nodes and presets"
      @update:model-value="$emit('update:query', String($event ?? ''))"
    />

    <div class="editor-node-creation-menu__entries">
      <button
        v-for="entry in entries"
        :key="entry.id"
        type="button"
        class="editor-node-creation-menu__entry"
        @click="$emit('select-entry', entry)"
      >
        <span class="editor-node-creation-menu__entry-family">{{ entry.family }}</span>
        <strong>{{ entry.label }}</strong>
        <p>{{ entry.description }}</p>
      </button>
      <div v-if="entries.length === 0" class="editor-node-creation-menu__empty">No matching nodes or presets.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ElInput } from "element-plus";

import type { NodeCreationContext, NodeCreationEntry } from "@/types/node-system";

const props = defineProps<{
  open: boolean;
  entries: NodeCreationEntry[];
  context: NodeCreationContext | null;
  query: string;
  position: { x: number; y: number } | null;
}>();

const emit = defineEmits<{
  (event: "update:query", value: string): void;
  (event: "select-entry", entry: NodeCreationEntry): void;
  (event: "close"): void;
}>();

const menuRef = ref<HTMLElement | null>(null);

const menuStyle = computed(() => {
  if (!props.position) {
    return {};
  }

  const viewportPadding = 12;
  const menuWidth = 320;
  const left =
    typeof window === "undefined"
      ? props.position.x
      : Math.min(Math.max(props.position.x, viewportPadding), window.innerWidth - menuWidth - viewportPadding);
  const top =
    typeof window === "undefined"
      ? props.position.y
      : Math.min(Math.max(props.position.y, viewportPadding), window.innerHeight - viewportPadding);

  return {
    left: `${left}px`,
    top: `${top}px`,
  };
});

function isMenuSurfaceTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(menuRef.value?.contains(target));
}

function handleGlobalPointerDown(event: PointerEvent) {
  if (!props.open || isMenuSurfaceTarget(event.target)) {
    return;
  }
  emit("close");
}

function handleGlobalFocusIn(event: FocusEvent) {
  if (!props.open || isMenuSurfaceTarget(event.target)) {
    return;
  }
  emit("close");
}

function handleGlobalKeyDown(event: KeyboardEvent) {
  if (!props.open || event.key !== "Escape") {
    return;
  }
  emit("close");
}

function addGlobalListeners() {
  document.addEventListener("pointerdown", handleGlobalPointerDown);
  document.addEventListener("focusin", handleGlobalFocusIn);
  document.addEventListener("keydown", handleGlobalKeyDown);
}

function removeGlobalListeners() {
  document.removeEventListener("pointerdown", handleGlobalPointerDown);
  document.removeEventListener("focusin", handleGlobalFocusIn);
  document.removeEventListener("keydown", handleGlobalKeyDown);
}

onMounted(() => {
  if (props.open) {
    addGlobalListeners();
  }
});

watch(
  () => props.open,
  (open) => {
    if (open) {
      addGlobalListeners();
      return;
    }
    removeGlobalListeners();
  },
);

onBeforeUnmount(() => {
  removeGlobalListeners();
});
</script>

<style scoped>
.editor-node-creation-menu {
  position: fixed;
  z-index: 20;
  width: 320px;
  max-width: calc(100vw - 24px);
  max-height: min(70vh, 420px);
  overflow: auto;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 18px;
  background: rgba(255, 250, 241, 0.98);
  padding: 12px;
  box-shadow: 0 20px 40px rgba(60, 41, 20, 0.12);
  backdrop-filter: blur(12px);
}

.editor-node-creation-menu__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.editor-node-creation-menu__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.editor-node-creation-menu__summary {
  margin: 6px 0 0;
  font-size: 0.9rem;
  color: rgba(60, 41, 20, 0.72);
}

.editor-node-creation-menu__close {
  min-height: 32px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: rgba(60, 41, 20, 0.72);
  padding: 0 12px;
  cursor: pointer;
}

.editor-node-creation-menu__search {
  margin-top: 12px;
}

:deep(.editor-node-creation-menu__search .el-input__wrapper) {
  min-height: 40px;
  border-radius: 14px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: none;
}

.editor-node-creation-menu__entries {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.editor-node-creation-menu__entry {
  display: grid;
  gap: 4px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.88);
  padding: 12px;
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.editor-node-creation-menu__entry:hover {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 252, 247, 0.98);
  transform: translateY(-1px);
}

.editor-node-creation-menu__entry-family {
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.76);
}

.editor-node-creation-menu__entry p,
.editor-node-creation-menu__empty {
  margin: 0;
  color: rgba(60, 41, 20, 0.72);
}
</style>
