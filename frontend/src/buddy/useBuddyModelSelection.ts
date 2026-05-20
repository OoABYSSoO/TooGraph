import { computed, ref, watch } from "vue";

import { fetchSettings } from "../api/settings.ts";
import { buildRuntimeModelOptions } from "../lib/runtimeModelCatalog.ts";
import type { SettingsPayload } from "../types/settings.ts";

type BuddyModelOption = {
  value: string;
  label: string;
};

type BuddyModelSelectionOptions = {
  t: (key: string) => string;
};

const BUDDY_MODEL_STORAGE_KEY = "toograph:buddy-model";

export function useBuddyModelSelection({ t }: BuddyModelSelectionOptions) {
  const buddyModelRef = ref("");
  const buddyModelOptions = ref<BuddyModelOption[]>([]);
  const buddyModelLoadError = ref("");

  const buddyModelLabel = computed(() => {
    const option = buddyModelOptions.value.find((candidate) => candidate.value === buddyModelRef.value);
    if (option) {
      return `${t("buddy.modelLabel")} - ${option.label}`;
    }
    return buddyModelLoadError.value || t("buddy.modelUnavailable");
  });

  const buddyModelPlaceholder = computed(() =>
    buddyModelLoadError.value ? t("buddy.modelLoadFailed") : t("buddy.modelLoading"),
  );

  watch(buddyModelRef, (nextModel) => {
    const normalized = nextModel.trim();
    if (normalized) {
      window.localStorage.setItem(BUDDY_MODEL_STORAGE_KEY, normalized);
      return;
    }
    window.localStorage.removeItem(BUDDY_MODEL_STORAGE_KEY);
  });

  function hydrateBuddyModel() {
    buddyModelRef.value = window.localStorage.getItem(BUDDY_MODEL_STORAGE_KEY)?.trim() ?? "";
  }

  async function loadBuddyModelOptions() {
    buddyModelLoadError.value = "";
    try {
      const settings = await fetchSettings();
      const options = buildBuddyModelOptions(settings);
      buddyModelOptions.value = options;
      if (options.length === 0) {
        return;
      }
      if (!options.some((option) => option.value === buddyModelRef.value)) {
        buddyModelRef.value = options[0].value;
      }
    } catch (error) {
      buddyModelLoadError.value = error instanceof Error ? error.message : t("buddy.modelLoadFailed");
    }
  }

  function handleBuddyModelSelectVisibleChange(visible: boolean) {
    if (visible) {
      void loadBuddyModelOptions();
    }
  }

  return {
    buddyModelRef,
    buddyModelOptions,
    buddyModelLabel,
    buddyModelPlaceholder,
    hydrateBuddyModel,
    loadBuddyModelOptions,
    handleBuddyModelSelectVisibleChange,
  };
}

function buildBuddyModelOptions(settings: SettingsPayload): BuddyModelOption[] {
  return buildRuntimeModelOptions(settings);
}
