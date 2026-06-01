import type { SettingsModelProviderUpdate } from "../api/settings.ts";
import type {
  ModelProviderTransport,
  OpenAICodexAuthStatus,
  SettingsModelProvider,
  SettingsPayload,
  SettingsProviderCredential,
  SettingsProviderModel,
  StructuredOutputMode,
} from "../types/settings.ts";

const DEFAULT_AGENT_TEMPERATURE = 0.2;
const DEFAULT_PROVIDER_REQUEST_TIMEOUT_SECONDS = 180;
export const DEFAULT_MODEL_COMPRESSION_THRESHOLD = 0.9;
export const DEFAULT_STRUCTURED_OUTPUT_MODE: StructuredOutputMode = "validate_then_repair";
type SettingsProvider = SettingsModelProvider;

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
  reasoning: boolean | null;
  context_window_ktokens: number | null;
  compression_threshold: number;
  capabilities: ProviderModelCapabilities;
  embedding: ProviderModelEmbeddingDraft;
};

export type ProviderDraft = {
  provider_id: string;
  label: string;
  transport: ModelProviderTransport;
  structured_output_mode: StructuredOutputMode;
  base_url: string;
  enabled: boolean;
  saved?: boolean;
  auth_header: string;
  auth_scheme: string;
  auth_mode?: string;
  requires_login?: boolean;
  auth_status?: OpenAICodexAuthStatus;
  request_timeout_seconds?: number;
  credential_pool: SettingsProviderCredential[];
  api_key: string;
  api_key_configured: boolean;
  discovered_models: string[];
  selected_models: string[];
  model_settings: Record<string, ProviderModelDraft>;
};

export function dedupeStrings(values: string[]) {
  const items: string[] = [];
  const seen = new Set<string>();
  for (const rawValue of values) {
    const value = String(rawValue || "").trim();
    if (!value) {
      continue;
    }
    const identity = value.toLowerCase();
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    items.push(value);
  }
  return items;
}

export function clampSettingsTemperature(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_AGENT_TEMPERATURE;
  }
  return Math.min(2, Math.max(0, value));
}

export function clampProviderRequestTimeoutSeconds(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return DEFAULT_PROVIDER_REQUEST_TIMEOUT_SECONDS;
  }
  return Math.min(3600, Math.max(1, Number(value)));
}

export function clampModelCompressionThreshold(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return DEFAULT_MODEL_COMPRESSION_THRESHOLD;
  }
  return Math.min(1, Math.max(0.01, Number(value)));
}

export function normalizeContextWindowKTokens(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.round(Number(value));
  return normalized > 0 ? normalized : null;
}

export function normalizeStructuredOutputMode(value: unknown): StructuredOutputMode {
  return value === "native_schema_first" ? "native_schema_first" : DEFAULT_STRUCTURED_OUTPUT_MODE;
}

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
  const rerank = includesAnyPattern(normalizedModel, RERANK_MODEL_PATTERNS);
  const embedding = !rerank && includesAnyPattern(normalizedModel, EMBEDDING_MODEL_PATTERNS);
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

function normalizeProviderCredentialPool(value: unknown): SettingsProviderCredential[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const credentials: SettingsProviderCredential[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Partial<SettingsProviderCredential>;
    const credentialId = String(record.credential_id || "").trim();
    if (!credentialId) {
      continue;
    }
    const identity = credentialId.toLowerCase();
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    const failureCount = Number(record.failure_count);
    credentials.push({
      credential_id: credentialId,
      status: String(record.status || "active").trim() || "active",
      cooldown_until: record.cooldown_until ? String(record.cooldown_until).trim() : null,
      failure_count: Number.isFinite(failureCount) ? Math.max(0, Math.trunc(failureCount)) : 0,
    });
  }
  return credentials;
}

function buildDefaultProviderModelDraft(model: string, capabilities?: unknown): ProviderModelDraft {
  return {
    model,
    reasoning: null,
    context_window_ktokens: null,
    compression_threshold: DEFAULT_MODEL_COMPRESSION_THRESHOLD,
    capabilities: inferModelCapabilities(model, capabilities),
    embedding: defaultEmbeddingDraft(),
  };
}

function normalizeModelReasoning(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function modelSettingsKey(model: string) {
  return String(model || "").trim().toLowerCase();
}

function findProviderModelDraft(provider: ProviderDraft, modelName: string): ProviderModelDraft | null {
  const normalizedModel = modelName.trim();
  if (!normalizedModel || !provider.model_settings) {
    return null;
  }
  const existing = provider.model_settings[normalizedModel];
  if (existing) {
    return existing;
  }
  const matchingKey = Object.keys(provider.model_settings).find(
    (key) => modelSettingsKey(key) === modelSettingsKey(normalizedModel),
  );
  return matchingKey ? provider.model_settings[matchingKey] ?? null : null;
}

function buildProviderModelSettings(provider: SettingsProvider, selectedModels: string[]) {
  const settings: Record<string, ProviderModelDraft> = {};
  const sourceModels = [
    ...(provider.discovered_models ?? []),
    ...provider.models,
  ];
  for (const model of sourceModels) {
    const modelName = String(model.model || "").trim();
    if (!modelName) {
      continue;
    }
    const contextWindowTokens = Number(model.context_window);
    const rawEmbedding = "embedding" in model ? (model as { embedding?: unknown }).embedding : undefined;
    settings[modelName] = {
      model: modelName,
      reasoning: normalizeModelReasoning(model.reasoning),
      context_window_ktokens: Number.isFinite(contextWindowTokens) && contextWindowTokens > 0
        ? Math.round(contextWindowTokens / 1000)
        : null,
      compression_threshold: clampModelCompressionThreshold(model.compression_threshold),
      capabilities: inferModelCapabilities(modelName, model.capabilities),
      embedding: normalizeEmbeddingDraft(rawEmbedding),
    };
  }
  for (const modelName of selectedModels) {
    if (!settings[modelName]) {
      settings[modelName] = buildDefaultProviderModelDraft(modelName);
    }
  }
  return settings;
}

export function ensureProviderModelDraft(provider: ProviderDraft, modelName: string): ProviderModelDraft {
  const normalizedModel = modelName.trim();
  if (!normalizedModel) {
    return buildDefaultProviderModelDraft("");
  }
  provider.model_settings = provider.model_settings ?? {};
  const existing = provider.model_settings[normalizedModel];
  if (existing) {
    existing.reasoning = normalizeModelReasoning(existing.reasoning);
    existing.capabilities = normalizeModelCapabilities(existing.capabilities, inferModelCapabilities(normalizedModel));
    existing.embedding = normalizeEmbeddingDraft(existing.embedding);
    return existing;
  }
  const matchingKey = Object.keys(provider.model_settings).find(
    (key) => modelSettingsKey(key) === modelSettingsKey(normalizedModel),
  );
  if (matchingKey) {
    const matched = provider.model_settings[matchingKey];
    provider.model_settings[normalizedModel] = { ...matched, model: normalizedModel };
    return provider.model_settings[normalizedModel];
  }
  provider.model_settings[normalizedModel] = buildDefaultProviderModelDraft(normalizedModel);
  return provider.model_settings[normalizedModel];
}

export function readProviderModelDraft(provider: ProviderDraft, modelName: string): ProviderModelDraft {
  const normalizedModel = modelName.trim();
  const existing = findProviderModelDraft(provider, normalizedModel);
  if (!existing) {
    return buildDefaultProviderModelDraft(normalizedModel);
  }
  return {
    ...existing,
    model: normalizedModel || existing.model,
    reasoning: normalizeModelReasoning(existing.reasoning),
    capabilities: normalizeModelCapabilities(existing.capabilities, inferModelCapabilities(normalizedModel)),
    embedding: normalizeEmbeddingDraft(existing.embedding),
  };
}

export function modelHasCapability(provider: ProviderDraft, modelName: string, capability: ModelCapabilityKey) {
  return Boolean(readProviderModelDraft(provider, modelName).capabilities[capability]);
}

export function applyDiscoveredModelItemsToDraft(
  provider: ProviderDraft,
  modelItems: Array<Partial<SettingsProviderModel> & { model: string }> | undefined,
) {
  if (!Array.isArray(modelItems)) {
    return;
  }
  for (const item of modelItems) {
    const modelName = String(item.model || "").trim();
    if (!modelName) {
      continue;
    }
    const modelSettings = ensureProviderModelDraft(provider, modelName);
    const contextWindow = Number(item.context_window);
    const reasoning = normalizeModelReasoning(item.reasoning);
    if (reasoning !== null) {
      modelSettings.reasoning = reasoning;
    }
    modelSettings.context_window_ktokens = Number.isFinite(contextWindow) && contextWindow > 0
      ? Math.round(contextWindow / 1000)
      : modelSettings.context_window_ktokens;
    modelSettings.compression_threshold = clampModelCompressionThreshold(
      typeof item.compression_threshold === "number" ? item.compression_threshold : modelSettings.compression_threshold,
    );
    modelSettings.capabilities = inferModelCapabilities(modelName, item.capabilities);
    if (item.embedding) {
      const dimensions = Number(item.embedding.dimensions);
      modelSettings.embedding = {
        dimensions: Number.isFinite(dimensions) && dimensions > 0 ? Math.trunc(dimensions) : null,
        use_for_memory: item.embedding.use_for_memory !== false,
        use_for_knowledge: item.embedding.use_for_knowledge !== false,
      };
    }
  }
}

export function listProviderModelBadges(
  provider: SettingsProvider,
  modelDisplayLookup: Record<string, string>,
) {
  if (provider.models.length > 0) {
    return provider.models.map((model) => modelDisplayLookup[model.model_ref] || model.model_ref);
  }
  return provider.example_model_refs;
}

export function buildProviderDraftsFromSettings(payload: SettingsPayload): Record<string, ProviderDraft> {
  const providers = payload.model_catalog?.providers ?? [];
  return Object.fromEntries(
    providers
      .filter((provider) => provider.configured || provider.saved || provider.provider_id === "local")
      .map((provider) => {
        const enabledModels = dedupeStrings(provider.models.map((model) => model.model));
        const discoveredModels = dedupeStrings(
          (provider.discovered_models && provider.discovered_models.length > 0 ? provider.discovered_models : provider.models).map(
            (model) => model.model,
          ),
        );
        const modelSettings = buildProviderModelSettings(provider, enabledModels);
        return [
          provider.provider_id,
          {
            provider_id: provider.provider_id,
            label: provider.label,
            transport: provider.transport,
            structured_output_mode: normalizeStructuredOutputMode(provider.structured_output_mode),
            base_url: provider.base_url,
            enabled: provider.enabled,
            saved: Boolean(provider.saved),
            auth_header: provider.auth_header ?? "Authorization",
            auth_scheme: provider.auth_scheme ?? "Bearer",
            auth_mode: provider.auth_mode ?? (provider.requires_login ? "chatgpt" : "api_key"),
            requires_login: Boolean(provider.requires_login),
            auth_status: provider.auth_status,
            request_timeout_seconds: clampProviderRequestTimeoutSeconds(provider.request_timeout_seconds),
            credential_pool: normalizeProviderCredentialPool(provider.credential_pool),
            api_key: "",
            api_key_configured: Boolean(provider.api_key_configured),
            discovered_models: discoveredModels,
            selected_models: enabledModels,
            model_settings: modelSettings,
          },
        ];
      }),
  );
}

export function buildProviderSavePayload(drafts: Record<string, ProviderDraft>): Record<string, SettingsModelProviderUpdate> {
  return Object.fromEntries(
    Object.entries(drafts).map(([providerId, draft]) => [
      providerId,
      {
        label: draft.label,
        transport: draft.transport,
        structured_output_mode: normalizeStructuredOutputMode(draft.structured_output_mode),
        base_url: draft.base_url,
        api_key: draft.requires_login ? undefined : draft.api_key.trim() || undefined,
        enabled: draft.enabled,
        auth_header: draft.auth_header,
        auth_scheme: draft.auth_scheme,
        auth_mode: draft.auth_mode ?? (draft.requires_login ? "chatgpt" : "api_key"),
        request_timeout_seconds: clampProviderRequestTimeoutSeconds(draft.request_timeout_seconds),
        credential_pool: normalizeProviderCredentialPool(draft.credential_pool),
        models: dedupeStrings(draft.selected_models).map((model) => {
          const modelSettings = ensureProviderModelDraft(draft, model);
          const contextWindowKTokens = normalizeContextWindowKTokens(modelSettings.context_window_ktokens);
          return {
            model,
            label: model,
            reasoning: modelSettings.reasoning,
            modalities: modelSettings.capabilities.vision ? ["text", "image"] : ["text"],
            capabilities: { ...modelSettings.capabilities },
            context_window: modelSettings.capabilities.chat && contextWindowKTokens !== null ? contextWindowKTokens * 1000 : null,
            compression_threshold: modelSettings.capabilities.chat
              ? clampModelCompressionThreshold(modelSettings.compression_threshold)
              : null,
            embedding: modelSettings.capabilities.embedding ? { ...modelSettings.embedding } : undefined,
          };
        }),
      },
    ]),
  );
}

export function listAddableProviderTemplates(
  payload: SettingsPayload,
  drafts: Record<string, ProviderDraft>,
): SettingsModelProvider[] {
  const existing = new Set(Object.keys(drafts));
  return (payload.model_catalog?.provider_templates ?? []).filter((provider) => !existing.has(provider.provider_id));
}

export function providerDraftsFingerprint(drafts: Record<string, ProviderDraft>): string {
  return JSON.stringify(buildProviderSavePayload(drafts));
}
