import { defineStore } from "pinia";
import { markRaw, ref } from "vue";

import type { CompanionEditorContextSnapshot } from "../companion/companionPageContext.ts";

export const useCompanionContextStore = defineStore("companionContext", () => {
  const editorSnapshot = ref<CompanionEditorContextSnapshot | null>(null);

  function setEditorSnapshot(nextSnapshot: CompanionEditorContextSnapshot | null) {
    editorSnapshot.value = nextSnapshot
      ? {
          ...nextSnapshot,
          document: nextSnapshot.document ? markRaw(nextSnapshot.document) : nextSnapshot.document,
        }
      : null;
  }

  function clearEditorSnapshot() {
    editorSnapshot.value = null;
  }

  return {
    editorSnapshot,
    setEditorSnapshot,
    clearEditorSnapshot,
  };
});
