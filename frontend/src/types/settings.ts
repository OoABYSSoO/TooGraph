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
    providers: Array<{
      provider_id: string;
      label: string;
      description: string;
      transport: string;
      configured: boolean;
      base_url: string;
      api_key_configured?: boolean;
      models: Array<{
        model_ref: string;
        model: string;
        label: string;
        route_target?: string | null;
        reasoning?: boolean;
        modalities?: string[];
        context_window?: number | null;
        max_tokens?: number | null;
      }>;
      example_model_refs: string[];
      gateway?: Record<string, unknown>;
    }>;
  };
  model_providers?: Record<
    string,
    {
      label?: string;
      base_url: string;
      api_key?: string;
      models: Array<{
        model: string;
        label?: string;
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
