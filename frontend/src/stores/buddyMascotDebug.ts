import { defineStore } from "pinia";
import { ref } from "vue";

import type { BuddyMascotDebugAction } from "../buddy/buddyMascotDebug.ts";

export type BuddyMascotDebugRequest = {
  id: number;
  action: BuddyMascotDebugAction;
};

export const useBuddyMascotDebugStore = defineStore("buddyMascotDebug", () => {
  const latestRequest = ref<BuddyMascotDebugRequest | null>(null);
  const virtualCursorEnabled = ref(false);
  const nextRequestId = ref(0);

  function trigger(action: BuddyMascotDebugAction) {
    nextRequestId.value += 1;
    latestRequest.value = {
      id: nextRequestId.value,
      action,
    };
  }

  function setVirtualCursorEnabled(enabled: boolean) {
    virtualCursorEnabled.value = enabled;
  }

  return {
    latestRequest,
    virtualCursorEnabled,
    trigger,
    setVirtualCursorEnabled,
  };
});
