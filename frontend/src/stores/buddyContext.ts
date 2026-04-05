import { defineStore } from "pinia";
import { markRaw, ref } from "vue";

import type { BuddyEditorContextSnapshot } from "../buddy/buddyPageContext.ts";

export const useBuddyContextStore = defineStore("buddyContext", () => {
  const editorSnapshot = ref<BuddyEditorContextSnapshot | null>(null);
  const dataRefreshNonce = ref(0);

  function setEditorSnapshot(nextSnapshot: BuddyEditorContextSnapshot | null) {
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

  function notifyBuddyDataChanged() {
    dataRefreshNonce.value += 1;
  }

  return {
    editorSnapshot,
    dataRefreshNonce,
    setEditorSnapshot,
    clearEditorSnapshot,
    notifyBuddyDataChanged,
  };
});
