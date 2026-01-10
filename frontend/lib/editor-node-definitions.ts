export type EditorPortType = "text" | "json" | "any";

export type EditorNodeWidgetDefinition = {
  key: string;
  label: string;
  widget: "text" | "textarea";
  valueType: EditorPortType;
  bindable?: boolean;
  rows?: number;
  placeholder?: string;
  defaultValue?: unknown;
};

export type EditorNodePortDefinition = {
  key: string;
  label: string;
  valueType: EditorPortType;
};

export type EditorNodeRuntimeReadMapping = {
  from: `widget:${string}` | `input:${string}`;
  stateKey: string;
  mode?: "local_only" | "bound_or_local";
};

export type EditorNodeRuntimeWriteMapping = {
  from: `output:${string}`;
  stateKey: string;
};

export type EditorNodeRuntimeParamMapping = {
  from: `widget:${string}`;
  paramKey: string;
  mode?: "local_only" | "bound_or_local";
};

export type EditorNodePortBindingDefinition = {
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
};

export type EditorNodeWidgetHydrationDefinition = {
  source: "param" | "input_values";
  paramKey: string;
  statePort?: {
    side: "input" | "output";
    key: string;
  };
};

export type EditorNodeUiDefinition = {
  showDescription?: boolean;
  inlineInputs?: string[];
  inlineOutputs?: string[];
  widgetSocketAnchor?: "center-left" | "top-left";
  outputPreview?: {
    inputKey: string;
    emptyText?: string;
  };
};

export type EditorNodeInspectorFieldDefinition = {
  key: string;
  label: string;
  control: "text" | "select" | "checkbox";
  paramKey: string;
  options?: Array<{ label: string; value: string }>;
  syncPort?: {
    side: "input" | "output";
    key: string;
  };
};

export type EditorNodeDefinition = {
  type: string;
  version: string;
  label: string;
  category: string;
  kind: "input_boundary" | "process" | "condition" | "output_boundary";
  description: string;
  inputs: EditorNodePortDefinition[];
  outputs: EditorNodePortDefinition[];
  widgets: EditorNodeWidgetDefinition[];
  runtime: {
    handlerKey: string;
    toolKeys?: string[];
    reads: EditorNodeRuntimeReadMapping[];
    writes: EditorNodeRuntimeWriteMapping[];
    params?: EditorNodeRuntimeParamMapping[];
  };
  editor?: {
    widgetParamKeys?: Record<string, string>;
    widgetHydration?: Record<string, EditorNodeWidgetHydrationDefinition>;
    portParamKeys?: EditorNodePortBindingDefinition;
    ui?: EditorNodeUiDefinition;
    inspectorFields?: EditorNodeInspectorFieldDefinition[];
  };
  defaults: {
    reads: string[];
    writes: string[];
    params: Record<string, unknown>;
  };
};

export type EditorNodePreset = {
  type: string;
  label: string;
  description: string;
  reads: string[];
  writes: string[];
  params: Record<string, unknown>;
  inputs?: EditorNodePortDefinition[];
  outputs?: EditorNodePortDefinition[];
  widgets?: EditorNodeWidgetDefinition[];
};

const DEFAULT_NODE_UI: Required<EditorNodeUiDefinition> = {
  showDescription: true,
  inlineInputs: [],
  inlineOutputs: [],
  widgetSocketAnchor: "center-left",
  outputPreview: {
    inputKey: "",
    emptyText: "No output yet",
  },
};

export const EDITOR_NODE_DEFINITIONS: Record<string, EditorNodeDefinition> = {
  text_input: {
    type: "text_input",
    version: "1.0",
    label: "Text Input",
    category: "boundary/input",
    kind: "input_boundary",
    description: "Provide a text value to the workflow.",
    inputs: [],
    outputs: [{ key: "text", label: "text", valueType: "text" }],
    widgets: [
      {
        key: "text",
        label: "Text",
        widget: "textarea",
        valueType: "text",
        bindable: true,
        rows: 5,
        placeholder: "Enter text",
        defaultValue: "Abyss",
      },
    ],
    runtime: {
      handlerKey: "start",
      reads: [{ from: "widget:text", stateKey: "name", mode: "bound_or_local" }],
      writes: [{ from: "output:text", stateKey: "name" }],
    },
    editor: {
      widgetParamKeys: {
        text: "default_value",
      },
      widgetHydration: {
        text: {
          source: "input_values",
          paramKey: "default_value",
          statePort: {
            side: "output",
            key: "text",
          },
        },
      },
      portParamKeys: {
        outputs: {
          text: "input_key",
        },
      },
      ui: {
        showDescription: false,
        inlineOutputs: ["text"],
        widgetSocketAnchor: "top-left",
      },
      inspectorFields: [
        {
          key: "input_key",
          label: "Bound State Key",
          control: "text",
          paramKey: "input_key",
          syncPort: {
            side: "output",
            key: "text",
          },
        },
        {
          key: "default_value",
          label: "Default Value",
          control: "text",
          paramKey: "default_value",
        },
        {
          key: "placeholder",
          label: "Placeholder",
          control: "text",
          paramKey: "placeholder",
        },
      ],
    },
    defaults: {
      reads: [],
      writes: ["name"],
      params: {
        input_key: "name",
        default_value: "Abyss",
        placeholder: "Enter text",
        multiline: true,
      },
    },
  },
  hello_model: {
    type: "hello_model",
    version: "1.0",
    label: "Hello Model",
    category: "core/text",
    kind: "process",
    description: "Send a name to the local OpenAI-compatible model.",
    inputs: [],
    outputs: [
      { key: "greeting", label: "greeting", valueType: "text" },
      { key: "final_result", label: "final_result", valueType: "text" },
      { key: "llm_response", label: "llm_response", valueType: "text" },
    ],
    widgets: [
      {
        key: "name",
        label: "Name",
        widget: "text",
        valueType: "text",
        bindable: true,
        placeholder: "Enter a name",
        defaultValue: "Abyss",
      },
    ],
    runtime: {
      handlerKey: "hello_model",
      toolKeys: ["generate_hello_greeting"],
      reads: [{ from: "widget:name", stateKey: "name", mode: "bound_or_local" }],
      writes: [
        { from: "output:greeting", stateKey: "greeting" },
        { from: "output:final_result", stateKey: "final_result" },
        { from: "output:llm_response", stateKey: "llm_response" },
      ],
      params: [{ from: "widget:name", paramKey: "name", mode: "bound_or_local" }],
    },
    editor: {
      widgetParamKeys: {
        name: "name",
      },
      widgetHydration: {
        name: {
          source: "param",
          paramKey: "name",
        },
      },
    },
    defaults: {
      reads: ["name"],
      writes: ["greeting", "final_result", "llm_response"],
      params: {
        name: "Abyss",
        temperature: 0.2,
        max_tokens: 40,
      },
    },
  },
  text_output: {
    type: "text_output",
    version: "1.0",
    label: "Text Output",
    category: "boundary/output",
    kind: "output_boundary",
    description: "Preview text output and optionally persist it.",
    inputs: [{ key: "text", label: "text", valueType: "text" }],
    outputs: [],
    widgets: [],
    runtime: {
      handlerKey: "end",
      reads: [{ from: "input:text", stateKey: "final_result" }],
      writes: [],
    },
    editor: {
      portParamKeys: {
        inputs: {
          text: "source_state_key",
        },
      },
      ui: {
        showDescription: false,
        inlineInputs: ["text"],
        outputPreview: {
          inputKey: "text",
          emptyText: "No output yet",
        },
      },
      inspectorFields: [
        {
          key: "source_state_key",
          label: "Source State Key",
          control: "text",
          paramKey: "source_state_key",
          syncPort: {
            side: "input",
            key: "text",
          },
        },
        {
          key: "display_mode",
          label: "Display Mode",
          control: "select",
          paramKey: "display_mode",
          options: [
            { label: "auto", value: "auto" },
            { label: "plain", value: "plain" },
            { label: "markdown", value: "markdown" },
            { label: "json", value: "json" },
          ],
        },
        {
          key: "persist_format",
          label: "Persist Format",
          control: "select",
          paramKey: "persist_format",
          options: [
            { label: "txt", value: "txt" },
            { label: "md", value: "md" },
            { label: "json", value: "json" },
          ],
        },
        {
          key: "file_name_template",
          label: "File Name",
          control: "text",
          paramKey: "file_name_template",
        },
        {
          key: "persist_enabled",
          label: "Persist Enabled",
          control: "checkbox",
          paramKey: "persist_enabled",
        },
      ],
    },
    defaults: {
      reads: ["final_result"],
      writes: [],
      params: {
        source_state_key: "final_result",
        display_mode: "auto",
        persist_enabled: false,
        persist_format: "txt",
        file_name_template: "result",
      },
    },
  },
};

export function getEditorNodeDefinition(nodeType: string) {
  return EDITOR_NODE_DEFINITIONS[nodeType];
}

export function createEditorNodePreset(definition: EditorNodeDefinition): EditorNodePreset {
  return {
    type: definition.type,
    label: definition.label,
    description: definition.description,
    reads: [...definition.defaults.reads],
    writes: [...definition.defaults.writes],
    params: { ...definition.defaults.params },
    inputs: definition.inputs,
    outputs: definition.outputs,
    widgets: definition.widgets,
  };
}

export function getEditorNodeUi(definition?: EditorNodeDefinition) {
  return {
    ...DEFAULT_NODE_UI,
    ...(definition?.editor?.ui ?? {}),
    outputPreview: {
      ...DEFAULT_NODE_UI.outputPreview,
      ...(definition?.editor?.ui?.outputPreview ?? {}),
    },
  };
}

export function getEditorNodeInspectorFields(definition?: EditorNodeDefinition) {
  return definition?.editor?.inspectorFields ?? [];
}

export function getInlinePortKeys(definition: EditorNodeDefinition | undefined, side: "input" | "output") {
  const ui = getEditorNodeUi(definition);
  return side === "input" ? ui.inlineInputs : ui.inlineOutputs;
}

export function getVisiblePorts(definition: EditorNodeDefinition | undefined, side: "input" | "output") {
  const ports = side === "input" ? definition?.inputs ?? [] : definition?.outputs ?? [];
  const inlineKeys = new Set(getInlinePortKeys(definition, side));
  return ports.filter((port) => !inlineKeys.has(port.key));
}

export function resolvePortStateKey(params: {
  definition?: EditorNodeDefinition;
  nodeParams: Record<string, unknown>;
  nodeReads?: string[];
  nodeWrites?: string[];
  side: "input" | "output";
  portKey: string;
}) {
  const { definition, nodeParams, nodeReads = [], nodeWrites = [], side, portKey } = params;
  const mappedParamKey =
    side === "input" ? definition?.editor?.portParamKeys?.inputs?.[portKey] : definition?.editor?.portParamKeys?.outputs?.[portKey];
  const fallback = side === "input" ? nodeReads[0] ?? portKey : nodeWrites[0] ?? portKey;

  if (!mappedParamKey) {
    return fallback;
  }

  return String(nodeParams[mappedParamKey] ?? "").trim() || fallback;
}

export function hydrateEditorNodeParams(params: {
  definition?: EditorNodeDefinition;
  rawParams: Record<string, unknown>;
  nodeReads: string[];
  nodeWrites: string[];
}) {
  const { definition, rawParams, nodeReads, nodeWrites } = params;
  if (!definition) {
    return { ...rawParams };
  }

  const nextParams: Record<string, unknown> = {
    ...definition.defaults.params,
  };

  Object.entries(rawParams).forEach(([key, value]) => {
    if (key === "__param_bindings" || key === "input_values" || key === "outputs") {
      return;
    }
    nextParams[key] = value;
  });

  const firstOutputConfig =
    Array.isArray(rawParams.outputs) && rawParams.outputs[0] && typeof rawParams.outputs[0] === "object"
      ? (rawParams.outputs[0] as Record<string, unknown>)
      : null;

  if (firstOutputConfig) {
    Object.assign(nextParams, firstOutputConfig);
  }

  Object.entries(definition.editor?.portParamKeys?.inputs ?? {}).forEach(([portKey, paramKey]) => {
    nextParams[paramKey] = nodeReads[0] ?? nextParams[paramKey] ?? portKey;
  });

  Object.entries(definition.editor?.portParamKeys?.outputs ?? {}).forEach(([portKey, paramKey]) => {
    nextParams[paramKey] = nodeWrites[0] ?? nextParams[paramKey] ?? portKey;
  });

  Object.values(definition.editor?.widgetHydration ?? {}).forEach((widgetConfig) => {
    if (widgetConfig.source === "param") {
      if (rawParams[widgetConfig.paramKey] !== undefined) {
        nextParams[widgetConfig.paramKey] = rawParams[widgetConfig.paramKey];
      }
      return;
    }

    if (widgetConfig.source === "input_values") {
      const inputValues =
        rawParams.input_values && typeof rawParams.input_values === "object"
          ? (rawParams.input_values as Record<string, unknown>)
          : {};
      const stateKey = widgetConfig.statePort
        ? resolvePortStateKey({
            definition,
            nodeParams: nextParams,
            nodeReads,
            nodeWrites,
            side: widgetConfig.statePort.side,
            portKey: widgetConfig.statePort.key,
          })
        : "";
      if (stateKey && inputValues[stateKey] !== undefined) {
        nextParams[widgetConfig.paramKey] = inputValues[stateKey];
      }
    }
  });

  return nextParams;
}

export function getWidgetValue(params: {
  definition?: EditorNodeDefinition;
  nodeParams: Record<string, unknown>;
  widgetKey: string;
}) {
  const { definition, nodeParams, widgetKey } = params;
  const paramKey = definition?.editor?.widgetParamKeys?.[widgetKey] ?? widgetKey;
  return String(nodeParams[paramKey] ?? "");
}

export function setWidgetValue(params: {
  definition?: EditorNodeDefinition;
  nodeParams: Record<string, unknown>;
  widgetKey: string;
  nextValue: string;
}) {
  const { definition, nodeParams, widgetKey, nextValue } = params;
  const paramKey = definition?.editor?.widgetParamKeys?.[widgetKey] ?? widgetKey;

  return {
    ...nodeParams,
    [paramKey]: nextValue,
  };
}

function getMappingKey(source: string) {
  const [, key] = source.split(":");
  return key ?? "";
}

export function resolveRuntimeReads(params: {
  definition?: EditorNodeDefinition;
  nodeReads: string[];
  nodeParams: Record<string, unknown>;
  paramBindings: Record<string, string>;
}) {
  const { definition, nodeReads, nodeParams, paramBindings } = params;
  if (!definition) {
    return nodeReads;
  }

  const resolved = definition.runtime.reads
    .map((mapping) => {
      const sourceKey = getMappingKey(mapping.from);

      if (mapping.from.startsWith("widget:")) {
        if (mapping.mode === "bound_or_local") {
          return paramBindings[sourceKey] ?? mapping.stateKey;
        }
        return mapping.stateKey;
      }

      if (mapping.from.startsWith("input:")) {
        return resolvePortStateKey({
          definition,
          nodeParams,
          nodeReads,
          side: "input",
          portKey: sourceKey,
        });
      }

      return null;
    })
    .filter((value): value is string => Boolean(value));

  return resolved.length > 0 ? [...new Set(resolved)] : nodeReads;
}

export function resolveRuntimeWrites(params: {
  definition?: EditorNodeDefinition;
  nodeWrites: string[];
  nodeParams: Record<string, unknown>;
}) {
  const { definition, nodeWrites, nodeParams } = params;
  if (!definition) {
    return nodeWrites;
  }

  const resolved = definition.runtime.writes
    .map((mapping) =>
      resolvePortStateKey({
        definition,
        nodeParams,
        nodeWrites,
        side: "output",
        portKey: getMappingKey(mapping.from),
      }),
    )
    .filter(Boolean);

  return resolved.length > 0 ? [...new Set(resolved)] : nodeWrites;
}

export function resolveRuntimeParams(params: {
  definition?: EditorNodeDefinition;
  nodeParams: Record<string, unknown>;
  nodeLabel: string;
  paramBindings: Record<string, string>;
}) {
  const { definition, nodeParams, nodeLabel, paramBindings } = params;

  if (!definition) {
    return { ...nodeParams, ...(Object.keys(paramBindings).length ? { __param_bindings: paramBindings } : {}) };
  }

  if (definition.kind === "input_boundary") {
    const stateKey = resolveRuntimeWrites({
      definition,
      nodeWrites: [],
      nodeParams,
    })[0];
    const textKey = getMappingKey(definition.widgets[0]?.key ? `widget:${definition.widgets[0].key}` : "widget:text");
    const bindingPayload = { ...paramBindings };
    if (stateKey && bindingPayload[textKey]) {
      delete bindingPayload[textKey];
    }

    return {
      input_values: stateKey
        ? {
            [stateKey]: nodeParams.default_value ?? "",
          }
        : {},
      placeholder: nodeParams.placeholder ?? "",
      multiline: Boolean(nodeParams.multiline),
      ...(Object.keys(bindingPayload).length ? { __param_bindings: bindingPayload } : {}),
    };
  }

  if (definition.kind === "output_boundary") {
    const sourceKey = resolveRuntimeReads({
      definition,
      nodeReads: [],
      nodeParams,
      paramBindings,
    })[0];

    return {
      outputs: sourceKey
        ? [
            {
              state_key: sourceKey,
              label: nodeLabel,
              display_mode: nodeParams.display_mode ?? "auto",
              persist_enabled: Boolean(nodeParams.persist_enabled),
              persist_format: nodeParams.persist_format ?? "txt",
              file_name_template: nodeParams.file_name_template ?? sourceKey,
            },
          ]
        : [],
    };
  }

  return {
    ...nodeParams,
    ...(Object.keys(paramBindings).length ? { __param_bindings: paramBindings } : {}),
  };
}
