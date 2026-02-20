export type ModelProviderTransport =
  | "openai-compatible"
  | "anthropic-messages"
  | "gemini-generate-content"
  | "codex-responses";

export type OpenAICodexAuthStatus = {
  provider_id?: string;
  configured: boolean;
  authenticated: boolean;
  auth_mode?: string;
  source?: string;
  base_url?: string;
  last_refresh?: string;
};

export type SettingsProviderModel = {
  model_ref: string;
  model: string;
  label: string;
  route_target?: string | null;
  reasoning?: boolean;
  modalities?: string[];
  context_window?: number | null;
  max_tokens?: number | null;
};

export type SettingsModelProvider = {
  provider_id: string;
  label: string;
  description: string;
  transport: ModelProviderTransport;
  configured: boolean;
  enabled: boolean;
  saved?: boolean;
  base_url: string;
  auth_header?: string;
  auth_scheme?: string;
  auth_mode?: string;
  requires_login?: boolean;
  auth_status?: OpenAICodexAuthStatus;
  api_key_configured?: boolean;
  models: SettingsProviderModel[];
  example_model_refs: string[];
  template_group?: string;
  gateway?: Record<string, unknown>;
};

export type SettingsPayload = {
  model: {
    text_model: string;
    text_model_ref: string;
    video_model: string;
    video_model_ref: string;
  };
  agent_runtime_defaults?: {
    model: string;
    thinking_enabled: boolean;
    temperature: number;
  };
  model_catalog?: {
    providers: SettingsModelProvider[];
    provider_templates?: SettingsModelProvider[];
  };
  model_providers?: Record<
    string,
    {
      label?: string;
      transport?: ModelProviderTransport;
      base_url: string;
      api_key?: string;
      enabled?: boolean;
      auth_header?: string;
      auth_scheme?: string;
      auth_mode?: string;
      models: Array<{
        model: string;
        label?: string;
        route_target?: string | null;
        reasoning?: boolean | null;
        modalities?: string[];
        context_window?: number | null;
        max_tokens?: number | null;
      }>;
    }
  >;
  revision: {
    max_revision_round: number;
  };
  evaluator: {
    default_score_threshold: number;
    routes: string[];
  };
  tools: string[];
};
