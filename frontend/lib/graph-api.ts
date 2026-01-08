import type {
  BranchLabel,
  EdgeKind,
  GraphCanvasEdge,
  GraphCanvasNode,
  GraphDocument,
  GraphNodeType,
  StateField,
  ThemeConfig,
} from "@/types/editor";

export type BackendGraphPayload = {
  graph_id?: string;
  name: string;
  template_id: string;
  theme_config: {
    theme_preset: string;
    domain: string;
    genre: string;
    market: string;
    platform: string;
    language: string;
    creative_style: string;
    tone: string;
    language_constraints: string[];
    evaluation_policy: Record<string, unknown>;
    asset_source_policy: Record<string, unknown>;
    strategy_profile: Record<string, unknown>;
  };
  state_schema: Array<{
    key: string;
    type: string;
    role: string;
    title: string;
    description: string;
    example?: unknown;
    source_nodes: string[];
    target_nodes: string[];
  }>;
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    position: { x: number; y: number };
    reads: string[];
    writes: string[];
    params: Record<string, unknown>;
    implementation: {
      executor: string;
      handler_key: string;
      tool_keys: string[];
    };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    flow_keys: string[];
    edge_kind: EdgeKind;
    branch_label?: BranchLabel;
  }>;
  metadata: Record<string, unknown>;
};

export type BackendGraphDocument = BackendGraphPayload & {
  graph_id: string;
};

export type BackendTemplateDefinition = {
  template_id: string;
  label: string;
  description: string;
  default_graph_name: string;
  default_theme_preset: string;
  supported_node_types: string[];
  state_keys: string[];
  state_schema: BackendGraphPayload["state_schema"];
  theme_presets: Array<{
    id: string;
    label: string;
    description: string;
    graph_name?: string;
    node_param_overrides?: Record<string, Record<string, unknown>>;
    theme_config: BackendGraphPayload["theme_config"];
  }>;
  default_graph?: BackendGraphPayload;
};

function toBackendThemeConfig(themeConfig: ThemeConfig): BackendGraphPayload["theme_config"] {
  return {
    theme_preset: themeConfig.themePreset,
    domain: themeConfig.domain,
    genre: themeConfig.genre,
    market: themeConfig.market,
    platform: themeConfig.platform,
    language: themeConfig.language,
    creative_style: themeConfig.creativeStyle,
    tone: themeConfig.tone,
    language_constraints: themeConfig.languageConstraints,
    evaluation_policy: themeConfig.evaluationPolicy,
    asset_source_policy: themeConfig.assetSourcePolicy,
    strategy_profile: themeConfig.strategyProfile,
  };
}

export function fromBackendThemeConfig(themeConfig: BackendGraphDocument["theme_config"]): ThemeConfig {
  return {
    themePreset: themeConfig.theme_preset ?? "",
    domain: themeConfig.domain ?? "",
    genre: themeConfig.genre ?? "",
    market: themeConfig.market ?? "",
    platform: themeConfig.platform ?? "",
    language: themeConfig.language ?? "",
    creativeStyle: themeConfig.creative_style ?? "",
    tone: themeConfig.tone ?? "",
    languageConstraints: Array.isArray(themeConfig.language_constraints)
      ? themeConfig.language_constraints.filter((value): value is string => typeof value === "string")
      : [],
    evaluationPolicy:
      themeConfig.evaluation_policy && typeof themeConfig.evaluation_policy === "object"
        ? themeConfig.evaluation_policy
        : {},
    assetSourcePolicy:
      themeConfig.asset_source_policy && typeof themeConfig.asset_source_policy === "object"
        ? themeConfig.asset_source_policy
        : {},
    strategyProfile:
      themeConfig.strategy_profile && typeof themeConfig.strategy_profile === "object"
        ? {
            hookTheme:
              typeof themeConfig.strategy_profile.hookTheme === "string"
                ? themeConfig.strategy_profile.hookTheme
                : typeof themeConfig.strategy_profile.hook_theme === "string"
                  ? String(themeConfig.strategy_profile.hook_theme)
                  : "",
            payoffTheme:
              typeof themeConfig.strategy_profile.payoffTheme === "string"
                ? themeConfig.strategy_profile.payoffTheme
                : typeof themeConfig.strategy_profile.payoff_theme === "string"
                  ? String(themeConfig.strategy_profile.payoff_theme)
                  : "",
            visualPattern:
              typeof themeConfig.strategy_profile.visualPattern === "string"
                ? themeConfig.strategy_profile.visualPattern
                : typeof themeConfig.strategy_profile.visual_pattern === "string"
                  ? String(themeConfig.strategy_profile.visual_pattern)
                  : "",
            pacingPattern:
              typeof themeConfig.strategy_profile.pacingPattern === "string"
                ? themeConfig.strategy_profile.pacingPattern
                : typeof themeConfig.strategy_profile.pacing_pattern === "string"
                  ? String(themeConfig.strategy_profile.pacing_pattern)
                  : "",
            evaluationFocus: Array.isArray(themeConfig.strategy_profile.evaluationFocus)
              ? themeConfig.strategy_profile.evaluationFocus.filter((value): value is string => typeof value === "string")
              : Array.isArray(themeConfig.strategy_profile.evaluation_focus)
                ? themeConfig.strategy_profile.evaluation_focus.filter((value): value is string => typeof value === "string")
                : [],
          }
        : {
            hookTheme: "",
            payoffTheme: "",
            visualPattern: "",
            pacingPattern: "",
            evaluationFocus: [],
          },
  };
}

function toBackendStateField(field: StateField): BackendGraphPayload["state_schema"][number] {
  return {
    key: field.key,
    type: field.type,
    role: field.role,
    title: field.title,
    description: field.description,
    example: field.example,
    source_nodes: field.sourceNodes,
    target_nodes: field.targetNodes,
  };
}

function fromBackendStateField(field: BackendGraphDocument["state_schema"][number]): StateField {
  return {
    key: field.key,
    type: field.type as StateField["type"],
    role: field.role as StateField["role"],
    title: field.title ?? "",
    description: field.description ?? "",
    example: field.example,
    sourceNodes: Array.isArray(field.source_nodes)
      ? field.source_nodes.filter((value): value is string => typeof value === "string")
      : [],
    targetNodes: Array.isArray(field.target_nodes)
      ? field.target_nodes.filter((value): value is string => typeof value === "string")
      : [],
  };
}

export function toBackendGraphPayload(document: GraphDocument): BackendGraphPayload {
  return {
    graph_id:
      document.graphId.startsWith("template-") || document.graphId === "creative-factory"
        ? undefined
        : document.graphId,
    name: document.name,
    template_id: document.templateId,
    theme_config: toBackendThemeConfig(document.themeConfig),
    state_schema: document.stateSchema.map(toBackendStateField),
    nodes: document.nodes.map((node) => ({
      id: node.id,
      type: node.data.kind,
      label: node.data.label,
      position: {
        x: node.position.x,
        y: node.position.y,
      },
      reads: node.data.reads,
      writes: node.data.writes,
      params: node.data.params,
      implementation: {
        executor: "node_handler",
        handler_key: node.data.kind,
        tool_keys: [],
      },
    })),
    edges: document.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      flow_keys: edge.data?.flowKeys ?? [],
      edge_kind: edge.data?.edgeKind ?? "normal",
      ...(edge.data?.edgeKind === "branch" && edge.data.branchLabel
        ? { branch_label: edge.data.branchLabel }
        : {}),
    })),
    metadata: {},
  };
}

export function fromBackendGraphDocument(document: BackendGraphDocument): GraphDocument {
  return {
    graphId: document.graph_id,
    name: document.name,
    templateId: document.template_id ?? "",
    themeConfig: fromBackendThemeConfig(document.theme_config),
    stateSchema: Array.isArray(document.state_schema) ? document.state_schema.map(fromBackendStateField) : [],
    nodes: document.nodes.map((node) => ({
      id: node.id,
      type: "workflow",
      className: "graph-node status-idle",
      position: {
        x: node.position.x,
        y: node.position.y,
      },
      data: {
        label: node.label,
        kind: node.type as GraphNodeType,
        description: typeof node.params?.description === "string" ? node.params.description : "",
        status: "idle",
        reads: Array.isArray(node.reads) ? node.reads.filter((value): value is string => typeof value === "string") : [],
        writes: Array.isArray(node.writes) ? node.writes.filter((value): value is string => typeof value === "string") : [],
        params: node.params && typeof node.params === "object" ? node.params : {},
      },
    })),
    edges: document.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "workflow",
      label: edge.branch_label ?? (edge.flow_keys?.length ? edge.flow_keys.slice(0, 2).join(", ") : undefined),
      animated: false,
      data: {
        flowKeys: Array.isArray(edge.flow_keys)
          ? edge.flow_keys.filter((value): value is string => typeof value === "string")
          : [],
        edgeKind: edge.edge_kind,
        branchLabel: edge.branch_label,
      },
    })),
    updatedAt: new Date().toISOString(),
  };
}

export function fromBackendTemplateDefaultGraph(
  templateId: string,
  graphId: string,
  document: BackendGraphPayload,
): GraphDocument {
  return fromBackendGraphDocument({
    ...document,
    graph_id: graphId,
    template_id: document.template_id || templateId,
  });
}

export function fromBackendThemePreset(preset: BackendTemplateDefinition["theme_presets"][number]) {
  return {
    id: preset.id,
    label: preset.label,
    description: preset.description,
    graphName: preset.graph_name,
    nodeParamOverrides: preset.node_param_overrides ?? {},
    themeConfig: fromBackendThemeConfig(preset.theme_config),
  };
}
