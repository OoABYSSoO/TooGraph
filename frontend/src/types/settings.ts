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
      models: Array<{
        model_ref: string;
        model: string;
        label: string;
        route_target?: string | null;
      }>;
      example_model_refs: string[];
    }>;
  };
  revision: {
    max_revision_round: number;
  };
  evaluator: {
    default_score_threshold: number;
    routes: string[];
  };
  tools: string[];
};
