# GraphiteUI Node Definition Spec

## 1. Purpose

本文档定义 GraphiteUI 当前推荐的节点定义协议。

目标不是复刻 ComfyUI 的后端 Python 节点声明格式，而是吸收它的“定义驱动渲染”思想，并结合 GraphiteUI 自己的 editor / graph / runtime 模型，形成一套更适合本项目的节点协议。

一句话目标：

**新增一个节点时，优先新增节点定义与 handler，而不是去手写前端节点组件。**

---

## 2. Why

当前 editor 已经开始出现以下需求：

- 输入、输出、widget 需要由定义驱动渲染
- widget 需要支持 ComfyUI 风格的 `local widget + optional socket override`
- 前端展示的端口语义不应直接等于后端真实 state key
- 同一个节点需要同时表达：
  - 前端怎么渲染
  - 前端怎么连线
  - 后端怎么编译成 graph payload

因此节点协议至少需要覆盖四层：

1. node meta
2. ui shape
3. runtime mapping
4. validation / constraints

---

## 3. Design Principles

### 3.1 Definition First

节点的：

- 标题
- 输入
- 输出
- widget
- 可绑定性
- 值类型

都应优先来自节点定义，而不是写死在组件分支里。

### 3.2 UI Port vs Runtime State Key

前端端口语义与后端真实 state key 必须解耦。

例子：

- 节点 UI 可以显示输出端口 `text`
- 但编译到后端 graph 时，它可以映射到真实 state key `name`

### 3.3 Widget + Socket Fallback

任何 `bindable` widget 都应遵循同一规则：

- 未连接时使用本地 widget 值
- 拖线时显示可接入 socket
- 已连接时上游值覆盖本地 widget 值
- 已连接时 widget 保留显示但切换为禁用态

### 3.4 Runtime Mapping Is First-Class

GraphiteUI 不是纯画布工具，节点定义必须能表达：

- 如何生成 `reads`
- 如何生成 `writes`
- 如何生成 `params`
- 如何映射到 runtime handler

这层是 GraphiteUI 相比 ComfyUI 额外必须有的能力。

---

## 4. Top-Level Shape

推荐顶层结构：

```ts
type ValueType =
  | "text"
  | "number"
  | "boolean"
  | "json"
  | "markdown"
  | "image"
  | "audio"
  | "video"
  | "any";

type GraphNodeDefinition = {
  type: string;
  version: string;
  label: string;
  category: string;
  kind: "input_boundary" | "process" | "condition" | "output_boundary";
  description?: string;
  inputs: NodePortDefinition[];
  outputs: NodePortDefinition[];
  widgets: NodeWidgetDefinition[];
  ui?: NodeUiDefinition;
  editor?: NodeEditorDefinition;
  runtime: NodeRuntimeDefinition;
  constraints?: NodeConstraintDefinition;
};
```

---

## 5. Port Definition

```ts
type NodePortDefinition = {
  key: string;
  label: string;
  value_type: ValueType;
  description?: string;
  optional?: boolean;
};
```

说明：

- `key` 是端口内部标识
- `label` 是前端展示名
- `value_type` 用于连线兼容性判断
- `optional` 用于后续更复杂节点

规则：

- `inputs` 负责左侧常驻输入端口
- `outputs` 负责右侧常驻输出端口
- widget 的 socket 不应混入 `inputs`

---

## 6. Widget Definition

```ts
type NodeWidgetDefinition = {
  key: string;
  label: string;
  widget:
    | "text"
    | "textarea"
    | "number"
    | "select"
    | "checkbox"
    | "json";
  value_type: ValueType;
  bindable?: boolean;
  default?: unknown;
  placeholder?: string;
  rows?: number;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string }>;
};
```

说明：

- `bindable=true` 表示该 widget 支持外部 socket 覆盖
- `value_type` 用于拖线兼容性判断
- `default` 是本地 widget 初值

---

## 7. UI Definition

```ts
type NodeUiDefinition = {
  layout?: "comfy_like";
  show_description?: boolean;
  bindable_socket_mode?: "show_on_connect_or_bound";
  bound_widget_style?: "disabled_with_override_badge";
  output_alignment?: "right";
};
```

当前阶段只保留少量必要项，不把视觉配置做得过细。

当前推荐默认值：

- `layout = "comfy_like"`
- `show_description = true`
- `bindable_socket_mode = "show_on_connect_or_bound"`
- `bound_widget_style = "disabled_with_override_badge"`
- `output_alignment = "right"`

---

## 8. Editor Definition

GraphiteUI 当前还需要一层更贴近 editor 的配置，用来描述：

- widget 的值实际上存在哪个 param key
- 输入/输出端口对应哪个 editor param key
- runtime payload 回填到 editor 时，widget 如何从 `input_values` / `outputs` 恢复
- inspector 面板如何通过定义自动生成

```ts
type NodeEditorDefinition = {
  widget_param_keys?: Record<string, string>;
  widget_hydration?: Record<
    string,
    {
      source: "param" | "input_values";
      param_key: string;
      state_port?: {
        side: "input" | "output";
        key: string;
      };
    }
  >;
  port_param_keys?: {
    inputs?: Record<string, string>;
    outputs?: Record<string, string>;
  };
  inspector_fields?: InspectorFieldDefinition[];
};

type InspectorFieldDefinition = {
  key: string;
  label: string;
  control: "text" | "select" | "checkbox";
  param_key: string;
  options?: Array<{ label: string; value: string }>;
  sync_port?: {
    side: "input" | "output";
    key: string;
  };
};
```

这层的目标不是污染 runtime，而是把“剩下必须配置化的 editor 组装信息”也从组件里抽出来。

---

## 9. Runtime Definition

```ts
type RuntimeValueSource =
  | { from: `widget:${string}`; mode: "local_only" | "bound_or_local" }
  | { from: `input:${string}` }
  | { from: `output:${string}` };

type RuntimeReadMapping = {
  from: `widget:${string}` | `input:${string}`;
  state_key: string;
  mode?: "local_only" | "bound_or_local";
};

type RuntimeWriteMapping = {
  from: `output:${string}`;
  state_key: string;
};

type RuntimeParamMapping = {
  from: `widget:${string}`;
  param_key: string;
  mode?: "local_only" | "bound_or_local";
};

type NodeRuntimeDefinition = {
  handler_key: string;
  reads: RuntimeReadMapping[];
  writes: RuntimeWriteMapping[];
  params?: RuntimeParamMapping[];
};
```

这是 GraphiteUI 与 ComfyUI 最大差异点之一。

GraphiteUI 必须明确：

- editor 中哪个 widget / input 变成后端 `reads`
- editor 中哪个 output 变成后端 `writes`
- editor 中哪个 widget 变成 handler `params`

### 9.1 Mapping Rules

`mode = "bound_or_local"` 表示：

- 若 widget socket 已绑定，则读取上游 state
- 若 widget socket 未绑定，则使用本地 widget 值

`mode = "local_only"` 表示：

- 只使用本地 widget 值
- 即使 UI 有 widget，也不允许作为可绑定输入

---

## 10. Constraints

```ts
type NodeConstraintDefinition = {
  max_inputs_per_widget?: number;
  output_types_strict?: boolean;
  required_widgets?: string[];
  allow_unbound_widgets?: boolean;
};
```

当前阶段至少建议支持：

- `max_inputs_per_widget = 1`
- `output_types_strict = true`

---

## 11. Example Definitions

## 11.1 Text Input

```json
{
  "type": "text_input",
  "version": "1.0",
  "label": "Text Input",
  "category": "boundary/input",
  "kind": "input_boundary",
  "description": "Provide a text value to the workflow.",
  "inputs": [],
  "outputs": [
    { "key": "text", "label": "text", "value_type": "text" }
  ],
  "widgets": [
    {
      "key": "text",
      "label": "Text",
      "widget": "textarea",
      "value_type": "text",
      "bindable": true,
      "default": "",
      "placeholder": "Enter text",
      "rows": 6
    }
  ],
  "editor": {
    "widget_param_keys": {
      "text": "default_value"
    },
    "widget_hydration": {
      "text": {
        "source": "input_values",
        "param_key": "default_value",
        "state_port": {
          "side": "output",
          "key": "text"
        }
      }
    },
    "port_param_keys": {
      "outputs": {
        "text": "input_key"
      }
    }
  },
  "ui": {
    "layout": "comfy_like",
    "show_description": false,
    "bindable_socket_mode": "show_on_connect_or_bound",
    "bound_widget_style": "disabled_with_override_badge"
  },
  "runtime": {
    "handler_key": "start",
    "reads": [
      { "from": "widget:text", "state_key": "name", "mode": "bound_or_local" }
    ],
    "writes": [
      { "from": "output:text", "state_key": "name" }
    ]
  },
  "constraints": {
    "max_inputs_per_widget": 1,
    "output_types_strict": true
  }
}
```

## 11.2 Hello Model

```json
{
  "type": "hello_model",
  "version": "1.0",
  "label": "Hello Model",
  "category": "core/text",
  "kind": "process",
  "description": "Send a name to the local OpenAI-compatible model.",
  "inputs": [],
  "outputs": [
    { "key": "greeting", "label": "greeting", "value_type": "text" },
    { "key": "final_result", "label": "final_result", "value_type": "text" },
    { "key": "llm_response", "label": "llm_response", "value_type": "text" }
  ],
  "widgets": [
    {
      "key": "name",
      "label": "Name",
      "widget": "text",
      "value_type": "text",
      "bindable": true,
      "default": "Abyss",
      "placeholder": "Enter a name"
    }
  ],
  "runtime": {
    "handler_key": "hello_model",
    "reads": [
      { "from": "widget:name", "state_key": "name", "mode": "bound_or_local" }
    ],
    "writes": [
      { "from": "output:greeting", "state_key": "greeting" },
      { "from": "output:final_result", "state_key": "final_result" },
      { "from": "output:llm_response", "state_key": "llm_response" }
    ],
    "params": [
      { "from": "widget:name", "param_key": "name", "mode": "bound_or_local" }
    ]
  }
}
```

## 11.3 Text Output

```json
{
  "type": "text_output",
  "version": "1.0",
  "label": "Text Output",
  "category": "boundary/output",
  "kind": "output_boundary",
  "description": "Preview text output and optionally persist it.",
  "inputs": [
    { "key": "text", "label": "text", "value_type": "text" }
  ],
  "outputs": [],
  "widgets": [],
  "editor": {
    "port_param_keys": {
      "inputs": {
        "text": "source_state_key"
      }
    },
    "inspector_fields": [
      {
        "key": "source_state_key",
        "label": "Source State Key",
        "control": "text",
        "param_key": "source_state_key",
        "sync_port": {
          "side": "input",
          "key": "text"
        }
      }
    ]
  },
  "runtime": {
    "handler_key": "end",
    "reads": [
      { "from": "input:text", "state_key": "final_result" }
    ],
    "writes": []
  }
}
```

---

## 12. Recommended Rollout

### Phase 1

- 在前端建立本地 node registry
- editor 使用定义渲染 `inputs / outputs / widgets`
- 保留少量特判，仅用于边界节点编译映射

### Phase 2

- 抽离统一 renderer
- 降低前端按 `nodeType` 写分支的比例
- 让更多节点只靠定义接入

### Phase 3

- 后端或模板接口下发节点定义
- 新节点接入以“定义 + handler”为主
- 为后续插件/模板节点预留扩展位

---

## 13. Current Decision

当前项目决定：

- 参考 ComfyUI 的定义驱动思想
- 不直接照抄 ComfyUI 的 Python `INPUT_TYPES / RETURN_TYPES`
- 保留 GraphiteUI 自己的 `runtime mapping` 层
- 前端端口语义与后端 state key 解耦

这应作为后续 editor 节点系统的正式方向。

---

## 14. Example File

为了让后续开发者能像参考 ComfyUI example 一样快速上手，仓库里提供了一个独立示例文件：

[editor-node-definition-example.ts](/home/abyss/GraphiteUI/frontend/lib/editor-node-definition-example.ts)

这个示例节点 `EXAMPLE_SUMMARIZE_TEXT_NODE` 演示了完整链路：

- 如何声明一个 `process` 节点
- 如何同时定义 `inputs / outputs / widgets`
- 如何给 widget 开启 `bindable` 覆盖能力
- 如何通过 `editor.portParamKeys` 让端口和 inspector 参数保持同步
- 如何通过 `runtime.reads / writes / params` 编译到后端 payload

这个 example 默认**不会**自动出现在 editor 里，目的是作为开发参考，避免把示例节点混入正式节点库。

如果要把它真正启用，按下面三步做：

1. 把定义加入 `EDITOR_NODE_DEFINITIONS`
2. 在后端实现对应的 `handlerKey`
3. 按需要把它加入模板默认图或节点面板
