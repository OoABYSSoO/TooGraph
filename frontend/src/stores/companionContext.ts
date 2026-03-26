import { defineStore } from "pinia";
import { markRaw, ref } from "vue";

import type { CompanionEditorContextSnapshot } from "../companion/companionPageContext.ts";

export const useCompanionContextStore = defineStore("companionContext", () => {
  const editorSnapshot = ref<CompanionEditorContextSnapshot | null>(null);
  const dataRefreshNonce = ref(0);

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

  function notifyCompanionDataChanged() {
    dataRefreshNonce.value += 1;
  }

  return {
    editorSnapshot,
    dataRefreshNonce,
    setEditorSnapshot,
    clearEditorSnapshot,
    notifyCompanionDataChanged,
  };
});
