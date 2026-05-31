# Model Provider Model Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Model Providers so each provider-owned model is displayed and configured as a model object with explicit capabilities such as chat, embedding, rerank, vision, tool calls, and structured output.

**Architecture:** Keep Provider as the connection boundary and move model-specific behavior into `ProviderModelDraft`. Capability inference lives in the shared settings page model helper so UI and save payload logic stay consistent. The Model Providers page renders selected models as expandable rows instead of simple pills and filters default model selectors by capability.

**Tech Stack:** Vue 3 single-file component, Element Plus, TypeScript helper model, Node `node:test`, existing settings API payload shape.

---

## File Structure

- Modify `frontend/src/pages/settingsPageModel.ts`: add model capability types, inference, normalization, draft storage, and save payload persistence.
- Modify `frontend/src/pages/settingsPageModel.test.ts`: cover embedding/rerank name inference, explicit capability preservation, and save payload persistence.
- Modify `frontend/src/types/settings.ts`: add typed model capability and embedding settings fields while preserving existing `Record<string, boolean>` compatibility.
- Modify `frontend/src/api/settings.ts`: allow provider model update payloads to include model capabilities and embedding settings.
- Modify `frontend/src/pages/ModelProvidersPage.vue`: replace model pill/budget list with expandable model rows, add capability toggles, filter runtime default selectors to chat-capable models, and keep remove separate from collapse.
- Modify `frontend/src/pages/ModelProvidersPage.structure.test.ts`: update structural expectations from model pills to model rows and assert capability UI exists.
- Modify `frontend/src/i18n/messages.ts`: add Chinese and English labels for model rows, capabilities, embedding settings, and empty states.

## Task 1: Model Capability Draft Logic

**Files:**
- Modify: `frontend/src/pages/settingsPageModel.ts`
- Test: `frontend/src/pages/settingsPageModel.test.ts`

- [ ] **Step 1: Write failing tests for capability inference and persistence**

Add these imports to `frontend/src/pages/settingsPageModel.test.ts`:

```ts
import {
  buildProviderDraftsFromSettings,
  buildProviderSavePayload,
  clampSettingsTemperature,
  inferModelCapabilities,
  listAddableProviderTemplates,
  listProviderModelBadges,
  modelHasCapability,
} from "./settingsPageModel.ts";
```

Replace the existing import block rather than adding a second block.

Add these tests after `buildProviderSavePayload includes enabled providers and omits blank api keys`:

```ts
test("inferModelCapabilities marks Qwen embedding names as embedding-only", () => {
  assert.deepEqual(inferModelCapabilities("text-embedding-qwen3-embedding-8b"), {
    chat: false,
    embedding: true,
    rerank: false,
    vision: false,
    tool_call: false,
    structured_output: false,
  });
});

test("inferModelCapabilities marks reranker names as rerank-only", () => {
  assert.deepEqual(inferModelCapabilities("BAAI/bge-reranker-v2-m3"), {
    chat: false,
    embedding: false,
    rerank: true,
    vision: false,
    tool_call: false,
    structured_output: false,
  });
});

test("provider drafts preserve explicit capabilities and infer missing model capabilities", () => {
  const drafts = buildProviderDraftsFromSettings({
    model: {
      text_model: "qwen-chat",
      text_model_ref: "local/qwen-chat",
      video_model: "qwen-chat",
      video_model_ref: "local/qwen-chat",
    },
    model_catalog: {
      provider_templates: [],
      providers: [
        {
          provider_id: "local",
          label: "LM Studio",
          description: "Local gateway",
          transport: "openai-compatible",
          configured: true,
          enabled: true,
          saved: true,
          base_url: "http://127.0.0.1:1234/v1",
          models: [
            {
              model_ref: "local/text-embedding-qwen3-embedding-8b",
              model: "text-embedding-qwen3-embedding-8b",
              label: "text-embedding-qwen3-embedding-8b",
            },
            {
              model_ref: "local/qwen-chat",
              model: "qwen-chat",
              label: "qwen-chat",
              capabilities: { chat: true, structured_output: true, tool_call: true },
            },
          ],
          example_model_refs: [],
        },
      ],
    },
    revision: { max_revision_round: 1 },
    tools: [],
  });

  assert.equal(modelHasCapability(drafts.local, "text-embedding-qwen3-embedding-8b", "embedding"), true);
  assert.equal(modelHasCapability(drafts.local, "text-embedding-qwen3-embedding-8b", "chat"), false);
  assert.equal(modelHasCapability(drafts.local, "qwen-chat", "chat"), true);
  assert.equal(modelHasCapability(drafts.local, "qwen-chat", "structured_output"), true);

  const payload = buildProviderSavePayload(drafts);
  assert.deepEqual(payload.local.models.map((model) => ({ model: model.model, capabilities: model.capabilities })), [
    {
      model: "text-embedding-qwen3-embedding-8b",
      capabilities: {
        chat: false,
        embedding: true,
        rerank: false,
        vision: false,
        tool_call: false,
        structured_output: false,
      },
    },
    {
      model: "qwen-chat",
      capabilities: {
        chat: true,
        embedding: false,
        rerank: false,
        vision: false,
        tool_call: true,
        structured_output: true,
      },
    },
  ]);
});
```

- [ ] **Step 2: Run the settings model test and verify it fails**

Run:

```powershell
node --test frontend\src\pages\settingsPageModel.test.ts
```

Expected: FAIL because `inferModelCapabilities` and `modelHasCapability` are not exported.

- [ ] **Step 3: Add capability types and inference helpers**

In `frontend/src/pages/settingsPageModel.ts`, replace `ProviderModelDraft` with:

```ts
export type ModelCapabilityKey =
  | "chat"
  | "embedding"
  | "rerank"
  | "vision"
  | "tool_call"
  | "structured_output";

export type ProviderModelCapabilities = Record<ModelCapabilityKey, boolean>;

export type ProviderModelEmbeddingDraft = {
  dimensions: number | null;
  use_for_memory: boolean;
  use_for_knowledge: boolean;
};

export type ProviderModelDraft = {
  model: string;
  context_window_ktokens: number | null;
  compression_threshold: number;
  capabilities: ProviderModelCapabilities;
  embedding: ProviderModelEmbeddingDraft;
};
```

Add these constants and helpers below `normalizeContextWindowKTokens`:

```ts
const MODEL_CAPABILITY_KEYS: ModelCapabilityKey[] = [
  "chat",
  "embedding",
  "rerank",
  "vision",
  "tool_call",
  "structured_output",
];

const EMBEDDING_MODEL_PATTERNS = [
  "embedding",
  "embed",
  "text-embedding",
  "qwen3-embedding",
  "bge",
  "e5",
  "gte",
  "jina-embeddings",
  "nomic-embed",
  "snowflake-arctic-embed",
  "voyage",
  "mxbai-embed",
];

const RERANK_MODEL_PATTERNS = [
  "rerank",
  "reranker",
  "bge-reranker",
  "gte-rerank",
  "qwen-rerank",
];

function defaultModelCapabilities(chat = true): ProviderModelCapabilities {
  return {
    chat,
    embedding: false,
    rerank: false,
    vision: false,
    tool_call: false,
    structured_output: false,
  };
}

function normalizeModelCapabilities(value: unknown, fallback: ProviderModelCapabilities): ProviderModelCapabilities {
  const normalized = { ...fallback };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return normalized;
  }
  const record = value as Record<string, unknown>;
  for (const key of MODEL_CAPABILITY_KEYS) {
    if (key in record) {
      normalized[key] = Boolean(record[key]);
    }
  }
  return normalized;
}

function includesAnyPattern(modelName: string, patterns: string[]) {
  const normalized = modelName.trim().toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

export function inferModelCapabilities(modelName: string, explicit?: unknown): ProviderModelCapabilities {
  const normalizedModel = String(modelName || "").trim();
  const embedding = includesAnyPattern(normalizedModel, EMBEDDING_MODEL_PATTERNS);
  const rerank = includesAnyPattern(normalizedModel, RERANK_MODEL_PATTERNS);
  const inferred = defaultModelCapabilities(!embedding && !rerank);
  inferred.embedding = embedding;
  inferred.rerank = rerank;
  return normalizeModelCapabilities(explicit, inferred);
}

function defaultEmbeddingDraft(): ProviderModelEmbeddingDraft {
  return {
    dimensions: null,
    use_for_memory: true,
    use_for_knowledge: true,
  };
}

function normalizeEmbeddingDraft(value: unknown): ProviderModelEmbeddingDraft {
  const fallback = defaultEmbeddingDraft();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  const record = value as Partial<ProviderModelEmbeddingDraft>;
  const dimensions = Number(record.dimensions);
  return {
    dimensions: Number.isFinite(dimensions) && dimensions > 0 ? Math.trunc(dimensions) : null,
    use_for_memory: typeof record.use_for_memory === "boolean" ? record.use_for_memory : true,
    use_for_knowledge: typeof record.use_for_knowledge === "boolean" ? record.use_for_knowledge : true,
  };
}
```

- [ ] **Step 4: Wire helpers into draft construction**

Replace `buildDefaultProviderModelDraft` with:

```ts
function buildDefaultProviderModelDraft(model: string, capabilities?: unknown): ProviderModelDraft {
  return {
    model,
    context_window_ktokens: null,
    compression_threshold: DEFAULT_MODEL_COMPRESSION_THRESHOLD,
    capabilities: inferModelCapabilities(model, capabilities),
    embedding: defaultEmbeddingDraft(),
  };
}
```

In `buildProviderModelSettings`, replace each settings assignment with:

```ts
const rawEmbedding = "embedding" in model ? (model as { embedding?: unknown }).embedding : undefined;
settings[modelName] = {
  model: modelName,
  context_window_ktokens: Number.isFinite(contextWindowTokens) && contextWindowTokens > 0
    ? Math.round(contextWindowTokens / 1000)
    : null,
  compression_threshold: clampModelCompressionThreshold(model.compression_threshold),
  capabilities: inferModelCapabilities(modelName, model.capabilities),
  embedding: normalizeEmbeddingDraft(rawEmbedding),
};
```

Add this exported helper below `ensureProviderModelDraft`:

```ts
export function modelHasCapability(provider: ProviderDraft, modelName: string, capability: ModelCapabilityKey) {
  return Boolean(ensureProviderModelDraft(provider, modelName).capabilities[capability]);
}
```

In `ensureProviderModelDraft`, keep the matching-key behavior but ensure copied drafts include the normalized model:

```ts
if (matchingKey) {
  const matched = provider.model_settings[matchingKey];
  provider.model_settings[normalizedModel] = { ...matched, model: normalizedModel };
  return provider.model_settings[normalizedModel];
}
provider.model_settings[normalizedModel] = buildDefaultProviderModelDraft(normalizedModel);
return provider.model_settings[normalizedModel];
```

This block may already match the file; keep it unchanged if it does.

- [ ] **Step 5: Persist capabilities in provider save payload**

In `buildProviderSavePayload`, replace the returned model object with:

```ts
return {
  model,
  label: model,
  modalities: modelSettings.capabilities.vision ? ["text", "image"] : ["text"],
  capabilities: { ...modelSettings.capabilities },
  context_window: modelSettings.capabilities.chat && contextWindowKTokens !== null ? contextWindowKTokens * 1000 : null,
  compression_threshold: modelSettings.capabilities.chat
    ? clampModelCompressionThreshold(modelSettings.compression_threshold)
    : null,
  embedding: modelSettings.capabilities.embedding ? { ...modelSettings.embedding } : undefined,
};
```

- [ ] **Step 6: Run the settings model test and verify it passes**

Run:

```powershell
node --test frontend\src\pages\settingsPageModel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

Run:

```powershell
git add frontend\src\pages\settingsPageModel.ts frontend\src\pages\settingsPageModel.test.ts
git commit -m "添加模型能力草稿逻辑"
```

Expected: commit succeeds on local `dev`.

## Task 2: Type API Payloads For Embedding Settings

**Files:**
- Modify: `frontend/src/types/settings.ts`
- Modify: `frontend/src/api/settings.ts`
- Test: `frontend/src/pages/settingsPageModel.test.ts`

- [ ] **Step 1: Extend settings types**

In `frontend/src/types/settings.ts`, add these types after `SettingsProviderCredential`:

```ts
export type ModelCapabilityKey =
  | "chat"
  | "embedding"
  | "rerank"
  | "vision"
  | "tool_call"
  | "structured_output";

export type SettingsProviderModelCapabilities = Partial<Record<ModelCapabilityKey, boolean>> & Record<string, boolean>;

export type SettingsProviderModelEmbedding = {
  dimensions?: number | null;
  use_for_memory?: boolean;
  use_for_knowledge?: boolean;
};
```

In `SettingsProviderModel`, replace:

```ts
capabilities?: Record<string, boolean>;
```

with:

```ts
capabilities?: SettingsProviderModelCapabilities;
embedding?: SettingsProviderModelEmbedding;
```

In `SettingsPayload.model_providers.models[]`, replace the existing `capabilities?: Record<string, boolean>;` field with:

```ts
capabilities?: SettingsProviderModelCapabilities;
embedding?: SettingsProviderModelEmbedding;
```

- [ ] **Step 2: Extend update payload type**

In `frontend/src/api/settings.ts`, import the new types:

```ts
  SettingsProviderCredential,
  SettingsProviderModelCapabilities,
  SettingsProviderModelEmbedding,
  SettingsPayload,
```

In `SettingsModelProviderUpdate.models[]`, replace:

```ts
capabilities?: Record<string, boolean>;
```

with:

```ts
capabilities?: SettingsProviderModelCapabilities;
embedding?: SettingsProviderModelEmbedding;
```

- [ ] **Step 3: Run TypeScript-facing unit test**

Run:

```powershell
node --test frontend\src\pages\settingsPageModel.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit Task 2**

Run:

```powershell
git add frontend\src\types\settings.ts frontend\src\api\settings.ts
git commit -m "扩展模型能力类型"
```

Expected: commit succeeds.

## Task 3: Filter Default Runtime Selectors By Chat Capability

**Files:**
- Modify: `frontend/src/pages/ModelProvidersPage.vue`
- Test: `frontend/src/pages/ModelProvidersPage.structure.test.ts`

- [ ] **Step 1: Write failing structure assertions**

In `frontend/src/pages/ModelProvidersPage.structure.test.ts`, add this test after `ModelProvidersPage keeps the page usable when no models are available`:

```ts
test("ModelProvidersPage filters default runtime selectors to chat-capable models", () => {
  assert.match(pageSource, /const configuredChatModels = computed/);
  assert.match(pageSource, /const configuredChatModelOptions = computed/);
  assert.match(pageSource, /modelHasCapability\(provider, modelName, "chat"\)/);
  assert.match(pageSource, /:disabled="configuredChatModelOptions\.length === 0"/);
  assert.match(pageSource, /v-for="option in configuredChatModelOptions"/);
  assert.match(pageSource, /const availableRefs = new Set\(configuredChatModelOptions\.value\.map/);
});
```

- [ ] **Step 2: Run structure test and verify it fails**

Run:

```powershell
node --test frontend\src\pages\ModelProvidersPage.structure.test.ts
```

Expected: FAIL because `configuredChatModels` and `configuredChatModelOptions` do not exist.

- [ ] **Step 3: Import capability helper**

In `frontend/src/pages/ModelProvidersPage.vue`, extend the existing settings page model import:

```ts
  ensureProviderModelDraft,
  listAddableProviderTemplates,
  modelHasCapability,
  normalizeContextWindowKTokens,
```

- [ ] **Step 4: Replace configured model computed values**

Replace the existing `configuredModels` and `configuredModelOptions` computed blocks with:

```ts
const configuredModels = computed(() =>
  providerDraftList.value
    .filter((provider) => provider.enabled)
    .flatMap((provider) =>
      provider.selected_models.map((modelName) => ({
        model_ref: `${provider.provider_id}/${modelName}`,
        model: modelName,
        label: modelName,
        route_target: null,
        provider,
      })),
    ),
);
const configuredChatModels = computed(() =>
  configuredModels.value.filter(({ provider, model }) => modelHasCapability(provider, model, "chat")),
);
const modelDisplayLookup = computed(() => buildModelDisplayLookup(configuredModels.value));
const configuredChatModelOptions = computed(() =>
  Array.from(
    new Map(
      configuredChatModels.value.map((model) => [
        model.model_ref,
        {
          value: model.model_ref,
          label: modelDisplayLookup.value[model.model_ref] || model.model_ref,
        },
      ]),
    ).values(),
  ),
);
```

- [ ] **Step 5: Update template selector bindings**

In both default runtime `ElSelect` controls, replace:

```vue
:disabled="configuredModelOptions.length === 0"
```

with:

```vue
:disabled="configuredChatModelOptions.length === 0"
```

Replace:

```vue
<ElOption v-for="option in configuredModelOptions" :key="option.value" :label="option.label" :value="option.value" />
```

with:

```vue
<ElOption v-for="option in configuredChatModelOptions" :key="option.value" :label="option.label" :value="option.value" />
```

Replace the empty hint condition:

```vue
<div v-if="configuredModelOptions.length === 0" class="model-providers-page__hint">
```

with:

```vue
<div v-if="configuredChatModelOptions.length === 0" class="model-providers-page__hint">
```

Keep the toolbar count as all configured models for now or change it to selected model count in Task 4.

- [ ] **Step 6: Update alignment logic**

Replace `alignDefaultModelsToProviderSelection` with:

```ts
function alignDefaultModelsToProviderSelection() {
  if (!draft.value || configuredChatModelOptions.value.length === 0) {
    return;
  }
  const availableRefs = new Set(configuredChatModelOptions.value.map((option) => option.value));
  const fallbackRef = configuredChatModelOptions.value[0].value;
  if (!availableRefs.has(draft.value.text_model_ref)) {
    draft.value.text_model_ref = fallbackRef;
  }
  if (!availableRefs.has(draft.value.video_model_ref)) {
    draft.value.video_model_ref = fallbackRef;
  }
}
```

- [ ] **Step 7: Run structure test and settings model test**

Run:

```powershell
node --test frontend\src\pages\ModelProvidersPage.structure.test.ts
node --test frontend\src\pages\settingsPageModel.test.ts
```

Expected: both PASS.

- [ ] **Step 8: Commit Task 3**

Run:

```powershell
git add frontend\src\pages\ModelProvidersPage.vue frontend\src\pages\ModelProvidersPage.structure.test.ts
git commit -m "按模型能力过滤默认模型"
```

Expected: commit succeeds.

## Task 4: Replace Model Pills With Expandable Model Rows

**Files:**
- Modify: `frontend/src/pages/ModelProvidersPage.vue`
- Modify: `frontend/src/pages/ModelProvidersPage.structure.test.ts`

- [ ] **Step 1: Update structure test expectations**

In the test named `ModelProvidersPage shows and edits provider models from each card`, replace the model pill assertions:

```ts
assert.match(pageSource, /class="model-providers-page__provider-model-pills"/);
assert.match(pageSource, /v-for="modelName in provider\.selected_models"/);
assert.match(pageSource, /class="model-providers-page__provider-model-pill model-providers-page__provider-model-pill-button"/);
assert.match(pageSource, /class="model-providers-page__provider-model-remove"/);
assert.match(pageSource, /class="model-providers-page__model-budget-list"/);
assert.match(pageSource, /v-for="modelName in provider\.selected_models"[\s\S]*class="model-providers-page__model-budget-row"/);
```

with:

```ts
assert.match(pageSource, /class="model-providers-page__provider-model-rows"/);
assert.match(pageSource, /class="model-providers-page__provider-model-row"/);
assert.match(pageSource, /class="model-providers-page__provider-model-row-main"/);
assert.match(pageSource, /class="model-providers-page__provider-model-capabilities"/);
assert.match(pageSource, /modelCapabilityBadges\(provider, modelName\)/);
assert.match(pageSource, /@click\.stop="toggleModelConfigPanel\(provider, modelName\)"/);
assert.match(pageSource, /@click\.stop="removeProviderModel\(provider, modelName\)"/);
assert.match(pageSource, /isModelConfigExpanded\(provider, modelName\)/);
assert.doesNotMatch(pageSource, /class="model-providers-page__provider-model-pills"/);
assert.doesNotMatch(pageSource, /class="model-providers-page__model-budget-list"/);
```

Keep the existing assertions for `settings.modelContextWindowKTokens`, `settings.modelCompressionThresholdPercent`, `modelContextWindowKTokens`, and `modelCompressionThresholdPercent`.

- [ ] **Step 2: Run structure test and verify it fails**

Run:

```powershell
node --test frontend\src\pages\ModelProvidersPage.structure.test.ts
```

Expected: FAIL because model rows do not exist yet.

- [ ] **Step 3: Add expanded row state helpers**

In `frontend/src/pages/ModelProvidersPage.vue`, add this ref near the existing provider popover refs:

```ts
const expandedModelConfigKeys = ref<Record<string, boolean>>({});
```

Add these functions near `isProviderModelPickerLoading`:

```ts
function modelConfigKey(provider: ProviderDraft, modelName: string) {
  return `${provider.provider_id}:${modelName.trim().toLowerCase()}`;
}

function isModelConfigExpanded(provider: ProviderDraft, modelName: string) {
  return Boolean(expandedModelConfigKeys.value[modelConfigKey(provider, modelName)]);
}

function toggleModelConfigPanel(provider: ProviderDraft, modelName: string) {
  const key = modelConfigKey(provider, modelName);
  expandedModelConfigKeys.value = {
    ...expandedModelConfigKeys.value,
    [key]: !expandedModelConfigKeys.value[key],
  };
}

function modelCapabilityBadges(provider: ProviderDraft, modelName: string) {
  const capabilities = ensureProviderModelDraft(provider, modelName).capabilities;
  const badges: string[] = [];
  if (capabilities.chat) badges.push(t("settings.modelCapabilityChat"));
  if (capabilities.embedding) badges.push(t("settings.modelCapabilityEmbedding"));
  if (capabilities.rerank) badges.push(t("settings.modelCapabilityRerank"));
  if (capabilities.vision) badges.push(t("settings.modelCapabilityVision"));
  if (capabilities.tool_call) badges.push(t("settings.modelCapabilityToolCall"));
  if (capabilities.structured_output) badges.push(t("settings.modelCapabilityStructuredOutput"));
  return badges.length > 0 ? badges : [t("settings.modelCapabilityNone")];
}
```

- [ ] **Step 4: Replace pill and budget markup**

In the Provider card template, replace the entire block from:

```vue
<div class="model-providers-page__provider-model-pills" :aria-label="t('settings.enabledModels')">
```

through the closing `</div>` of `model-providers-page__model-budget-list` with:

```vue
<div class="model-providers-page__provider-model-rows" :aria-label="t('settings.enabledModels')">
  <div
    v-for="modelName in provider.selected_models"
    :key="`${provider.provider_id}-selected-${modelName}`"
    class="model-providers-page__provider-model-row"
  >
    <div class="model-providers-page__provider-model-row-main">
      <div class="model-providers-page__provider-model-identity">
        <span class="model-providers-page__provider-model-name" :title="modelName">{{ modelName }}</span>
        <div class="model-providers-page__provider-model-capabilities">
          <span
            v-for="badge in modelCapabilityBadges(provider, modelName)"
            :key="`${provider.provider_id}-${modelName}-${badge}`"
            class="model-providers-page__provider-model-capability"
          >
            {{ badge }}
          </span>
        </div>
      </div>
      <div class="model-providers-page__provider-model-actions">
        <button
          type="button"
          class="model-providers-page__button model-providers-page__model-config-button"
          @click.stop="toggleModelConfigPanel(provider, modelName)"
        >
          {{ isModelConfigExpanded(provider, modelName) ? t("settings.collapseModelSettings") : t("settings.configureModel") }}
        </button>
        <button
          type="button"
          class="model-providers-page__icon-button"
          :aria-label="t('settings.removeModel', { model: modelName })"
          :title="t('settings.removeModel', { model: modelName })"
          @click.stop="removeProviderModel(provider, modelName)"
        >
          <ElIcon aria-hidden="true"><Close /></ElIcon>
        </button>
      </div>
    </div>
    <div v-if="isModelConfigExpanded(provider, modelName)" class="model-providers-page__provider-model-config-panel">
      <div class="model-providers-page__model-config-placeholder">
        {{ t("settings.modelCapabilities") }}
      </div>
    </div>
  </div>
  <span v-if="provider.selected_models.length === 0" class="model-providers-page__provider-model-empty">
    {{ t("settings.noModelsDiscovered") }}
  </span>
</div>
```

The placeholder is removed in Task 5 after capability controls are added.

- [ ] **Step 5: Run structure test**

Run:

```powershell
node --test frontend\src\pages\ModelProvidersPage.structure.test.ts
```

Expected: PASS after class and handler assertions are satisfied.

- [ ] **Step 6: Commit Task 4**

Run:

```powershell
git add frontend\src\pages\ModelProvidersPage.vue frontend\src\pages\ModelProvidersPage.structure.test.ts
git commit -m "改造模型列表为可展开模型行"
```

Expected: commit succeeds.

## Task 5: Add Capability Configuration Controls

**Files:**
- Modify: `frontend/src/pages/ModelProvidersPage.vue`
- Modify: `frontend/src/pages/ModelProvidersPage.structure.test.ts`
- Modify: `frontend/src/i18n/messages.ts`

- [ ] **Step 1: Add structure assertions for capability controls**

In `frontend/src/pages/ModelProvidersPage.structure.test.ts`, add this test after `ModelProvidersPage shows and edits provider models from each card`:

```ts
test("ModelProvidersPage exposes per-model capability controls inside expanded rows", () => {
  assert.match(pageSource, /settings\.modelCapabilities/);
  assert.match(pageSource, /settings\.modelCapabilityChat/);
  assert.match(pageSource, /settings\.modelCapabilityEmbedding/);
  assert.match(pageSource, /settings\.modelEmbeddingDimensions/);
  assert.match(pageSource, /toggleModelCapability\(provider, modelName, "embedding"\)/);
  assert.match(pageSource, /handleModelEmbeddingDimensionsChange\(provider, modelName, \$event\)/);
  assert.match(pageSource, /v-if="modelHasCapability\(provider, modelName, 'chat'\)"/);
  assert.match(pageSource, /v-if="modelHasCapability\(provider, modelName, 'embedding'\)"/);
  assert.doesNotMatch(pageSource, /model-config-placeholder/);
});
```

- [ ] **Step 2: Run structure test and verify it fails**

Run:

```powershell
node --test frontend\src\pages\ModelProvidersPage.structure.test.ts
```

Expected: FAIL because capability controls are not present.

- [ ] **Step 3: Add model capability handlers**

In `frontend/src/pages/ModelProvidersPage.vue`, add this type to the settings model import:

```ts
  type ModelCapabilityKey,
```

Add these functions near the existing model budget handlers:

```ts
function toggleModelCapability(provider: ProviderDraft, modelName: string, capability: ModelCapabilityKey) {
  const modelSettings = ensureProviderModelDraft(provider, modelName);
  modelSettings.capabilities = {
    ...modelSettings.capabilities,
    [capability]: !modelSettings.capabilities[capability],
  };
  providerDrafts.value = {
    ...providerDrafts.value,
    [provider.provider_id]: provider,
  };
  alignDefaultModelsToProviderSelection();
  void persistSettings();
}

function modelEmbeddingDimensions(provider: ProviderDraft, modelName: string) {
  return ensureProviderModelDraft(provider, modelName).embedding.dimensions;
}

function handleModelEmbeddingDimensionsChange(provider: ProviderDraft, modelName: string, event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const parsed = Number(target.value);
  const modelSettings = ensureProviderModelDraft(provider, modelName);
  modelSettings.embedding.dimensions = Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
  providerDrafts.value = {
    ...providerDrafts.value,
    [provider.provider_id]: provider,
  };
  void persistSettings();
}

function handleModelEmbeddingScopeChange(
  provider: ProviderDraft,
  modelName: string,
  scope: "use_for_memory" | "use_for_knowledge",
) {
  const modelSettings = ensureProviderModelDraft(provider, modelName);
  modelSettings.embedding = {
    ...modelSettings.embedding,
    [scope]: !modelSettings.embedding[scope],
  };
  providerDrafts.value = {
    ...providerDrafts.value,
    [provider.provider_id]: provider,
  };
  void persistSettings();
}
```

- [ ] **Step 4: Replace the model config placeholder with controls**

Replace:

```vue
<div class="model-providers-page__model-config-placeholder">
  {{ t("settings.modelCapabilities") }}
</div>
```

with:

```vue
<div class="model-providers-page__model-capability-controls">
  <span class="model-providers-page__provider-field-label">{{ t("settings.modelCapabilities") }}</span>
  <div class="model-providers-page__model-capability-grid">
    <label class="model-providers-page__model-capability-toggle">
      <input
        type="checkbox"
        :checked="modelHasCapability(provider, modelName, 'chat')"
        @change="toggleModelCapability(provider, modelName, 'chat')"
      />
      <span>{{ t("settings.modelCapabilityChat") }}</span>
    </label>
    <label class="model-providers-page__model-capability-toggle">
      <input
        type="checkbox"
        :checked="modelHasCapability(provider, modelName, 'embedding')"
        @change="toggleModelCapability(provider, modelName, 'embedding')"
      />
      <span>{{ t("settings.modelCapabilityEmbedding") }}</span>
    </label>
    <label class="model-providers-page__model-capability-toggle">
      <input
        type="checkbox"
        :checked="modelHasCapability(provider, modelName, 'rerank')"
        @change="toggleModelCapability(provider, modelName, 'rerank')"
      />
      <span>{{ t("settings.modelCapabilityRerank") }}</span>
    </label>
    <label class="model-providers-page__model-capability-toggle">
      <input
        type="checkbox"
        :checked="modelHasCapability(provider, modelName, 'vision')"
        @change="toggleModelCapability(provider, modelName, 'vision')"
      />
      <span>{{ t("settings.modelCapabilityVision") }}</span>
    </label>
    <label class="model-providers-page__model-capability-toggle">
      <input
        type="checkbox"
        :checked="modelHasCapability(provider, modelName, 'tool_call')"
        @change="toggleModelCapability(provider, modelName, 'tool_call')"
      />
      <span>{{ t("settings.modelCapabilityToolCall") }}</span>
    </label>
    <label class="model-providers-page__model-capability-toggle">
      <input
        type="checkbox"
        :checked="modelHasCapability(provider, modelName, 'structured_output')"
        @change="toggleModelCapability(provider, modelName, 'structured_output')"
      />
      <span>{{ t("settings.modelCapabilityStructuredOutput") }}</span>
    </label>
  </div>
</div>

<div v-if="modelHasCapability(provider, modelName, 'chat')" class="model-providers-page__model-config-section">
  <span class="model-providers-page__provider-field-label">{{ t("settings.modelChatSettings") }}</span>
  <div class="model-providers-page__model-config-fields">
    <label class="model-providers-page__model-budget-field">
      <span>{{ t("settings.modelContextWindowKTokens") }}</span>
      <input
        class="model-providers-page__model-budget-input"
        :value="modelContextWindowKTokens(provider, modelName) ?? ''"
        type="number"
        min="1"
        step="1"
        inputmode="numeric"
        @change="handleModelContextWindowChange(provider, modelName, $event)"
      />
    </label>
    <label class="model-providers-page__model-budget-field">
      <span>{{ t("settings.modelCompressionThresholdPercent") }}</span>
      <input
        class="model-providers-page__model-budget-input"
        :value="modelCompressionThresholdPercent(provider, modelName)"
        type="number"
        min="1"
        max="100"
        step="1"
        inputmode="numeric"
        @change="handleModelCompressionThresholdChange(provider, modelName, $event)"
      />
    </label>
  </div>
</div>

<div v-if="modelHasCapability(provider, modelName, 'embedding')" class="model-providers-page__model-config-section">
  <span class="model-providers-page__provider-field-label">{{ t("settings.modelEmbeddingSettings") }}</span>
  <div class="model-providers-page__model-config-fields">
    <label class="model-providers-page__model-budget-field">
      <span>{{ t("settings.modelEmbeddingDimensions") }}</span>
      <input
        class="model-providers-page__model-budget-input"
        :value="modelEmbeddingDimensions(provider, modelName) ?? ''"
        type="number"
        min="1"
        step="1"
        inputmode="numeric"
        :placeholder="t('settings.modelEmbeddingDefaultDimensions')"
        @change="handleModelEmbeddingDimensionsChange(provider, modelName, $event)"
      />
    </label>
    <label class="model-providers-page__model-capability-toggle">
      <input
        type="checkbox"
        :checked="ensureProviderModelDraft(provider, modelName).embedding.use_for_memory"
        @change="handleModelEmbeddingScopeChange(provider, modelName, 'use_for_memory')"
      />
      <span>{{ t("settings.modelEmbeddingUseForMemory") }}</span>
    </label>
    <label class="model-providers-page__model-capability-toggle">
      <input
        type="checkbox"
        :checked="ensureProviderModelDraft(provider, modelName).embedding.use_for_knowledge"
        @change="handleModelEmbeddingScopeChange(provider, modelName, 'use_for_knowledge')"
      />
      <span>{{ t("settings.modelEmbeddingUseForKnowledge") }}</span>
    </label>
  </div>
</div>
```

- [ ] **Step 5: Add i18n labels**

In `frontend/src/i18n/messages.ts`, add these Chinese keys near `enabledModels`:

```ts
      configureModel: "配置模型",
      collapseModelSettings: "收起",
      modelCapabilities: "模型能力",
      modelCapabilityChat: "聊天",
      modelCapabilityEmbedding: "Embedding",
      modelCapabilityRerank: "Rerank",
      modelCapabilityVision: "视觉",
      modelCapabilityToolCall: "工具调用",
      modelCapabilityStructuredOutput: "结构化输出",
      modelCapabilityNone: "未设置能力",
      modelChatSettings: "聊天设置",
      modelEmbeddingSettings: "Embedding 设置",
      modelEmbeddingDimensions: "向量维度",
      modelEmbeddingDefaultDimensions: "默认",
      modelEmbeddingUseForMemory: "用于记忆召回",
      modelEmbeddingUseForKnowledge: "用于知识库",
```

Add matching English keys near the English `enabledModels`:

```ts
      configureModel: "Configure model",
      collapseModelSettings: "Collapse",
      modelCapabilities: "Model capabilities",
      modelCapabilityChat: "Chat",
      modelCapabilityEmbedding: "Embedding",
      modelCapabilityRerank: "Rerank",
      modelCapabilityVision: "Vision",
      modelCapabilityToolCall: "Tool calls",
      modelCapabilityStructuredOutput: "Structured output",
      modelCapabilityNone: "No capability",
      modelChatSettings: "Chat settings",
      modelEmbeddingSettings: "Embedding settings",
      modelEmbeddingDimensions: "Vector dimensions",
      modelEmbeddingDefaultDimensions: "Default",
      modelEmbeddingUseForMemory: "Use for memory recall",
      modelEmbeddingUseForKnowledge: "Use for knowledge base",
```

- [ ] **Step 6: Run structure test**

Run:

```powershell
node --test frontend\src\pages\ModelProvidersPage.structure.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

Run:

```powershell
git add frontend\src\pages\ModelProvidersPage.vue frontend\src\pages\ModelProvidersPage.structure.test.ts frontend\src\i18n\messages.ts
git commit -m "添加模型能力配置面板"
```

Expected: commit succeeds.

## Task 6: Style Model Rows And Responsive Layout

**Files:**
- Modify: `frontend/src/pages/ModelProvidersPage.vue`
- Test: `frontend/src/pages/ModelProvidersPage.structure.test.ts`

- [ ] **Step 1: Add structure assertions for style hooks**

In `frontend/src/pages/ModelProvidersPage.structure.test.ts`, add these assertions to the model row test:

```ts
assert.match(pageSource, /\.model-providers-page__provider-model-rows \{/);
assert.match(pageSource, /\.model-providers-page__provider-model-row-main \{/);
assert.match(pageSource, /\.model-providers-page__provider-model-name \{/);
assert.match(pageSource, /\.model-providers-page__provider-model-config-panel \{/);
assert.match(pageSource, /@media \(max-width: 760px\)/);
```

- [ ] **Step 2: Run structure test and verify it fails**

Run:

```powershell
node --test frontend\src\pages\ModelProvidersPage.structure.test.ts
```

Expected: FAIL because new CSS hooks do not exist yet.

- [ ] **Step 3: Replace old pill/budget CSS with row CSS**

In `frontend/src/pages/ModelProvidersPage.vue`, remove these CSS blocks:

```css
.model-providers-page__provider-model-pills { ... }
.model-providers-page__provider-model-pill { ... }
.model-providers-page__provider-model-pill-button { ... }
.model-providers-page__provider-model-pill-button:hover { ... }
.model-providers-page__provider-model-pill span { ... }
.model-providers-page__provider-model-remove { ... }
.model-providers-page__provider-model-pill--empty { ... }
.model-providers-page__model-budget-list { ... }
.model-providers-page__model-budget-row { ... }
.model-providers-page__model-budget-name { ... }
```

Keep `.model-providers-page__model-budget-field` and its input styles because Task 5 reuses them inside expanded panels.

Add this CSS in the same area:

```css
.model-providers-page__provider-model-rows {
  display: grid;
  gap: 8px;
}

.model-providers-page__provider-model-row {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(37, 99, 235, 0.12);
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.76);
  padding: 8px;
}

.model-providers-page__provider-model-row-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.model-providers-page__provider-model-identity {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.model-providers-page__provider-model-name {
  min-width: 0;
  color: rgba(30, 41, 59, 0.86);
  font-family: var(--toograph-font-mono);
  font-size: 0.82rem;
  font-weight: 760;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-providers-page__provider-model-capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.model-providers-page__provider-model-capability {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border: 1px solid rgba(37, 99, 235, 0.16);
  border-radius: 999px;
  padding: 3px 8px;
  background: rgba(239, 246, 255, 0.92);
  color: rgb(37, 99, 235);
  font-size: 0.72rem;
  font-weight: 760;
}

.model-providers-page__provider-model-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.model-providers-page__provider-model-empty {
  color: rgba(60, 41, 20, 0.58);
  font-weight: 650;
}

.model-providers-page__provider-model-config-panel {
  display: grid;
  gap: 12px;
  border-top: 1px solid rgba(37, 99, 235, 0.1);
  padding-top: 10px;
}

.model-providers-page__model-capability-controls,
.model-providers-page__model-config-section {
  display: grid;
  gap: 8px;
}

.model-providers-page__model-capability-grid,
.model-providers-page__model-config-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.model-providers-page__model-capability-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 10px;
  padding: 6px 9px;
  background: rgba(255, 255, 255, 0.72);
  color: rgba(60, 41, 20, 0.74);
  font-size: 0.78rem;
  font-weight: 720;
}

.model-providers-page__model-capability-toggle input {
  width: 15px;
  height: 15px;
  margin: 0;
}
```

In the existing `@media (max-width: 760px)` block, add:

```css
  .model-providers-page__provider-model-row-main {
    grid-template-columns: 1fr;
  }

  .model-providers-page__provider-model-actions {
    justify-content: flex-start;
  }
```

- [ ] **Step 4: Run structure test**

Run:

```powershell
node --test frontend\src\pages\ModelProvidersPage.structure.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

Run:

```powershell
git add frontend\src\pages\ModelProvidersPage.vue frontend\src\pages\ModelProvidersPage.structure.test.ts
git commit -m "优化模型行视觉布局"
```

Expected: commit succeeds.

## Task 7: Full Verification And Runtime Smoke Test

**Files:**
- Verify only unless test failures require fixes.

- [ ] **Step 1: Run focused frontend tests**

Run:

```powershell
node --test frontend\src\pages\settingsPageModel.test.ts
node --test frontend\src\pages\ModelProvidersPage.structure.test.ts
```

Expected: both PASS.

- [ ] **Step 2: Run frontend build**

Run:

```powershell
cd frontend
npm.cmd run build
```

Expected: `vue-tsc --noEmit && vite build` completes successfully.

- [ ] **Step 3: Restart TooGraph with the standard command**

Run from repo root:

```powershell
cd C:\Users\abyss\TooGraph
npm.cmd start
```

Expected: TooGraph starts on `http://127.0.0.1:3477`. If port 3477 is occupied by a process that is not safely identifiable as TooGraph, stop and report the PID and command instead of switching ports.

- [ ] **Step 4: Browser visual check**

Open `http://127.0.0.1:3477/models` in the in-app browser.

Verify:

- Provider cards render without horizontal overflow.
- A model named `text-embedding-qwen3-embedding-8b` shows an `Embedding` badge when present.
- Configure expands a panel below the model row.
- Remove is visually separate from Configure/Collapse.
- Default text model select does not list embedding-only models.

- [ ] **Step 5: Final status check**

Run:

```powershell
git status --short --branch
```

Expected: clean except for intentional uncommitted runtime artifacts ignored by git.

- [ ] **Step 6: Commit final fixes if any were needed**

If Step 1, 2, or 4 required code changes, run:

```powershell
git add frontend\src\pages\settingsPageModel.ts frontend\src\pages\settingsPageModel.test.ts frontend\src\types\settings.ts frontend\src\api\settings.ts frontend\src\pages\ModelProvidersPage.vue frontend\src\pages\ModelProvidersPage.structure.test.ts frontend\src\i18n\messages.ts
git commit -m "完成模型能力配置界面"
```

Expected: commit succeeds if there were verification fixes. If no fixes were needed, do not create an empty commit.

## Self-Review

Spec coverage:

- Provider remains the connection boundary: Tasks 1-6 keep provider cards and only add model-level capability state.
- Model rows replace simple pills: Tasks 4 and 6.
- Capability inference by name with user override: Tasks 1 and 5.
- `text-embedding-qwen3-embedding-8b` auto-detected as embedding: Task 1 test.
- Default selectors filter by capability: Task 3.
- Chat-only settings hidden for embedding-only models and embedding settings hidden for chat-only models: Task 5.
- Remove remains separate from collapse: Task 4 markup and Task 7 visual check.

Placeholder scan:

- This plan contains no placeholder markers.
- Rerank execution is explicitly out of implementation scope; rerank capability display is included as a model capability control.

Type consistency:

- Capability keys are consistently named `chat`, `embedding`, `rerank`, `vision`, `tool_call`, and `structured_output`.
- Embedding settings are consistently named `dimensions`, `use_for_memory`, and `use_for_knowledge`.
- The UI calls `modelHasCapability(provider, modelName, capability)` with the same capability keys used by save payloads.
