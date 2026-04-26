export type ModelLogMessage = {
  role: string;
  body: string;
};

export type ModelLogEntry = {
  id: string;
  timestamp: string;
  duration_ms: number;
  provider_id: string;
  transport: string;
  model: string;
  path: string;
  status_code?: number | null;
  error?: string;
  request_kind: string;
  messages: ModelLogMessage[];
  reasoning: string;
  content: string;
  request_raw: Record<string, unknown>;
  response_raw: Record<string, unknown>;
};

export type ModelLogPage = {
  entries: ModelLogEntry[];
  total: number;
  page: number;
  size: number;
  pages: number;
};
