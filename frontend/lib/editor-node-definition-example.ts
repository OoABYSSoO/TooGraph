import type { EditorNodeDefinition } from "@/lib/editor-node-definitions";

/**
 * 示例节点定义。
 *
 * 这个文件不默认注册到 editor 里，目的是给后续开发者一个最小但完整的参考：
 * - 如何声明 inputs / outputs / widgets
 * - 如何配置 bindable widget
 * - 如何把 UI 端口语义映射到 runtime 的 reads / writes / params
 * - 如何让 inspector 也通过定义自动生成
 *
 * 如果要真正启用这个节点：
 * 1. 把定义加入 EDITOR_NODE_DEFINITIONS
 * 2. 在后端实现对应的 handler_key
 * 3. 若需要模板默认图，再把它加入模板或图初始化逻辑
 */
export const EXAMPLE_SUMMARIZE_TEXT_NODE: EditorNodeDefinition = {
  type: "example_summarize_text",
  version: "1.0",
  label: "Summarize Text",
  category: "examples/text",
  kind: "process",
  description: "Summarize incoming text with an optional local fallback prompt.",
  inputs: [
    {
      key: "text",
      label: "text",
      valueType: "text",
    },
  ],
  outputs: [
    {
      key: "summary",
      label: "summary",
      valueType: "text",
    },
  ],
  widgets: [
    {
      key: "instruction",
      label: "Instruction",
      widget: "textarea",
      valueType: "text",
      bindable: true,
      rows: 4,
      placeholder: "Summarize in one short paragraph",
      defaultValue: "Summarize in one short paragraph",
    },
  ],
  runtime: {
    handlerKey: "summarize_text",
    toolKeys: ["summarize_text"],
    reads: [
      {
        from: "input:text",
        stateKey: "source_text",
      },
      {
        from: "widget:instruction",
        stateKey: "summary_instruction",
        mode: "bound_or_local",
      },
    ],
    writes: [
      {
        from: "output:summary",
        stateKey: "summary_result",
      },
    ],
    params: [
      {
        from: "widget:instruction",
        paramKey: "instruction",
        mode: "bound_or_local",
      },
    ],
  },
  editor: {
    widgetParamKeys: {
      instruction: "instruction",
    },
    widgetHydration: {
      instruction: {
        source: "param",
        paramKey: "instruction",
      },
    },
    portParamKeys: {
      inputs: {
        text: "source_state_key",
      },
      outputs: {
        summary: "target_state_key",
      },
    },
    ui: {
      showDescription: true,
      widgetSocketAnchor: "center-left",
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
        key: "target_state_key",
        label: "Target State Key",
        control: "text",
        paramKey: "target_state_key",
        syncPort: {
          side: "output",
          key: "summary",
        },
      },
      {
        key: "instruction",
        label: "Default Instruction",
        control: "text",
        paramKey: "instruction",
      },
    ],
  },
  defaults: {
    reads: ["source_text", "summary_instruction"],
    writes: ["summary_result"],
    params: {
      source_state_key: "source_text",
      target_state_key: "summary_result",
      instruction: "Summarize in one short paragraph",
    },
  },
};
