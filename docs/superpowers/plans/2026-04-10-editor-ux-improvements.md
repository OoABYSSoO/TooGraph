# Editor UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复三个编辑器体验问题：1) 输出节点显示原始 JSON 而非提取后的字段值；2) 节点支持手动 resize；3) hello_world 模板新建时节点间距基于实际宽度自动计算。

**Architecture:**
- 后端在 `_generate_agent_response()` 里加 JSON 解析层，清理 markdown 代码块标记后解析 LLM 输出，按 output key 逐字段提取；前端 `NodeCard` 引入 `NodeResizer`，resize 结束时把新尺寸写入节点 style；前端在 `useNodesInitialized` 触发后检测是否为模板新建状态，若是则用实际节点宽度重新计算水平坐标。
- 所有 agent 节点统一用 JSON 模式，LLM 契约一致；resize 尺寸随 Save 操作持久化，不额外发请求；布局自动对齐只在模板新建时触发一次，已有 graph 加载不受影响。

**Tech Stack:** Python / FastAPI（后端），React / Next.js / TypeScript / @xyflow/react（前端），@xyflow/react 已导出 `NodeResizer` 和 `useNodesInitialized`。

---

## 文件变更清单

| 文件 | 变更类型 | 职责 |
|------|----------|------|
| `backend/app/core/runtime/node_system_executor.py` | 修改 | `_generate_agent_response()` 加 JSON 解析层 |
| `frontend/components/editor/node-system-editor.tsx` | 修改 | NodeCard 加 NodeResizer；onNodeResizeEnd 持久化尺寸；useNodesInitialized 自动布局 |

---

## Task 1: 后端 LLM 响应 JSON 解析

**Files:**
- Modify: `backend/app/core/runtime/node_system_executor.py`

---

- [ ] **Step 1: 在文件顶部加 `re` import**

打开 `backend/app/core/runtime/node_system_executor.py`，在第 3 行（`import json` 下方）添加：

```python
import re
```

- [ ] **Step 2: 新增 `_parse_llm_json_response` 函数**

在 `node_system_executor.py` 的 `_generate_agent_response` 函数**之前**插入以下函数（约在第 356 行前）：

```python
def _parse_llm_json_response(content: str, output_keys: list[str]) -> dict[str, Any]:
    """清理 LLM 返回的 markdown 代码块标记，尝试解析 JSON，按 output_keys 提取字段值。
    解析失败时，将原始字符串作为每个 key 的 fallback 值。"""
    cleaned = re.sub(r"```(?:json)?\s*|\s*```", "", content).strip()
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return {key: parsed.get(key, cleaned) for key in output_keys}
    except json.JSONDecodeError:
        pass
    return {key: cleaned for key in output_keys}
```

- [ ] **Step 3: 修改 `_generate_agent_response` 使用新函数**

找到 `_generate_agent_response` 函数（约第 356 行），找到以下代码段：

```python
    response_payload: dict[str, Any] = {"summary": content}
    if len(output_keys) == 1:
        response_payload[output_keys[0]] = content
        return response_payload

    for key in output_keys:
        response_payload[key] = content
    return response_payload
```

替换为：

```python
    parsed_fields = _parse_llm_json_response(content, output_keys)
    response_payload: dict[str, Any] = {"summary": content, **parsed_fields}
    return response_payload
```

- [ ] **Step 4: 手动验证逻辑（无需跑测试框架）**

在项目根目录打开 Python REPL 验证核心逻辑：

```bash
cd /home/abyss/GraphiteUI
python3 -c "
import re, json
from typing import Any

def _parse_llm_json_response(content: str, output_keys: list[str]) -> dict:
    cleaned = re.sub(r'\`\`\`(?:json)?\s*|\s*\`\`\`', '', content).strip()
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return {key: parsed.get(key, cleaned) for key in output_keys}
    except json.JSONDecodeError:
        pass
    return {key: cleaned for key in output_keys}

# 测试1: 带代码块标记的 JSON
r1 = _parse_llm_json_response('\`\`\`json\n{\"greeting\": \"你好\"}\n\`\`\`', ['greeting'])
assert r1 == {'greeting': '你好'}, f'Test1 failed: {r1}'

# 测试2: 干净的 JSON
r2 = _parse_llm_json_response('{\"brief\": \"攻城战\", \"hook\": \"震惊\"}', ['brief', 'hook'])
assert r2 == {'brief': '攻城战', 'hook': '震惊'}, f'Test2 failed: {r2}'

# 测试3: 纯文本 fallback（LLM 没返回 JSON）
r3 = _parse_llm_json_response('你好，Abyss！', ['greeting'])
assert r3 == {'greeting': '你好，Abyss！'}, f'Test3 failed: {r3}'

# 测试4: JSON 里缺少某个 key 时，用 cleaned 字符串兜底
r4 = _parse_llm_json_response('{\"greeting\": \"你好\"}', ['greeting', 'score'])
assert r4['greeting'] == '你好', f'Test4a failed: {r4}'
assert r4['score'] == '{\"greeting\": \"你好\"}', f'Test4b failed: {r4}'

print('All tests passed.')
"
```

期望输出：`All tests passed.`

- [ ] **Step 5: Commit**

```bash
cd /home/abyss/GraphiteUI
git add backend/app/core/runtime/node_system_executor.py
git commit -m "fix: 解析 LLM JSON 响应并按 output key 提取字段值"
```

---

## Task 2: 节点 NodeResizer — 加入组件并持久化尺寸

**Files:**
- Modify: `frontend/components/editor/node-system-editor.tsx`

---

- [ ] **Step 1: 在 import 里加入 NodeResizer 和 onNodeResizeEnd 相关类型**

找到文件顶部的 `@xyflow/react` import（约第 1-21 行）：

```typescript
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
```

替换为：

```typescript
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  MarkerType,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeResizeControlProps,
} from "@xyflow/react";
```

- [ ] **Step 2: 在 `NodeCard` 函数开头加入 NodeResizer**

找到 `NodeCard` 函数（约第 892 行）：

```typescript
function NodeCard({ data, selected }: NodeProps<FlowNode>) {
  const config = data.config;
  const inputs = listInputPorts(config);
  const outputs = listOutputPorts(config);

  return (
    <div
      data-node-card="true"
      className={cn(
        "min-w-[280px] rounded-[18px] border bg-[linear-gradient(180deg,rgba(255,250,241,0.98)_0%,rgba(248,237,219,0.96)_100%)] shadow-[0_18px_36px_rgba(60,41,20,0.1)]",
        selected ? "border-[var(--accent)]" : "border-[rgba(154,52,18,0.25)]",
      )}
    >
```

替换为：

```typescript
function NodeCard({ data, selected }: NodeProps<FlowNode>) {
  const config = data.config;
  const inputs = listInputPorts(config);
  const outputs = listOutputPorts(config);

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={48}
        handleStyle={{ width: 8, height: 8, borderRadius: 4, background: "var(--accent)", border: "none" }}
        lineStyle={{ borderColor: "var(--accent)", borderWidth: 1 }}
      />
      <div
        data-node-card="true"
        className={cn(
          "h-full min-w-[160px] rounded-[18px] border bg-[linear-gradient(180deg,rgba(255,250,241,0.98)_0%,rgba(248,237,219,0.96)_100%)] shadow-[0_18px_36px_rgba(60,41,20,0.1)]",
          selected ? "border-[var(--accent)]" : "border-[rgba(154,52,18,0.25)]",
        )}
      >
```

- [ ] **Step 3: 闭合外层 Fragment**

找到 `NodeCard` 函数的最后一行（约第 1005 行）：

```typescript
    </div>
  );
}
```

替换为：

```typescript
      </div>
    </>
  );
}
```

- [ ] **Step 4: 在 createFlowNodeFromGraphNode 里保留 width/height**

找到 `createFlowNodeFromGraphNode` 函数（约第 205 行）：

```typescript
function createFlowNodeFromGraphNode(node: any): FlowNode {
  return {
    id: node.id,
    type: node.type ?? "default",
    position: node.position ?? { x: 0, y: 0 },
    data: {
      nodeId: node.data?.nodeId ?? node.id,
      config: deepClonePreset(node.data?.config as NodePresetDefinition),
      previewText: node.data?.previewText ?? "",
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: {
      background: "transparent",
      border: "none",
      padding: 0,
      width: "auto",
    },
  } satisfies FlowNode;
}
```

替换为：

```typescript
function createFlowNodeFromGraphNode(node: any): FlowNode {
  const hasExplicitSize = typeof node.style?.width === "number" && typeof node.style?.height === "number";
  return {
    id: node.id,
    type: node.type ?? "default",
    position: node.position ?? { x: 0, y: 0 },
    data: {
      nodeId: node.data?.nodeId ?? node.id,
      config: deepClonePreset(node.data?.config as NodePresetDefinition),
      previewText: node.data?.previewText ?? "",
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: hasExplicitSize
      ? { background: "transparent", border: "none", padding: 0, width: node.style.width, height: node.style.height }
      : { background: "transparent", border: "none", padding: 0, width: "auto" },
  } satisfies FlowNode;
}
```

- [ ] **Step 5: 在 `<ReactFlow>` 上添加 `onNodeResizeEnd` 处理器**

找到 `<ReactFlow>` 组件（约第 1506 行），找到 `onNodesChange={onNodesChange}` 这一行：

```typescript
              onNodesChange={onNodesChange}
```

在其后一行插入：

```typescript
              onNodeResizeEnd={(_event, node) => {
                setNodes((current) =>
                  current.map((n) =>
                    n.id === node.id
                      ? { ...n, style: { ...n.style, width: node.width, height: node.height } }
                      : n,
                  ),
                );
              }}
```

- [ ] **Step 6: 在 `buildPayload` 里把节点 style 一起序列化**

找到 `buildPayload` 函数（约第 1380 行），找到 nodes 序列化部分：

```typescript
      nodes: nodes.map((node) => ({
        id: node.id,
        type: "default",
        position: node.position,
        data: {
          nodeId: node.data.nodeId,
          config: node.data.config,
          previewText: node.data.previewText || previewTextByNode[node.id] || "",
        },
      })),
```

替换为：

```typescript
      nodes: nodes.map((node) => ({
        id: node.id,
        type: "default",
        position: node.position,
        style: node.style,
        data: {
          nodeId: node.data.nodeId,
          config: node.data.config,
          previewText: node.data.previewText || previewTextByNode[node.id] || "",
        },
      })),
```

- [ ] **Step 7: 验证 resize 功能**

启动前端：`cd /home/abyss/GraphiteUI/frontend && npm run dev`

打开 `http://localhost:3477/editor/template-hello-world`，点选任意节点，确认出现 resize 手柄（8px 圆形橙色点），拖动手柄改变节点大小，点 Save，重新加载页面，确认节点尺寸保持。

- [ ] **Step 8: Commit**

```bash
cd /home/abyss/GraphiteUI
git add frontend/components/editor/node-system-editor.tsx
git commit -m "feat: 节点支持手动 resize，尺寸随 Save 持久化"
```

---

## Task 3: 模板新建时自动计算节点水平间距

**Files:**
- Modify: `frontend/components/editor/node-system-editor.tsx`

---

- [ ] **Step 1: 在 @xyflow/react import 里加入 `useNodesInitialized`**

找到上一个 Task 修改后的 import，确认已包含 `useNodesInitialized`。若无，在 import 列表里加入：

```typescript
  useNodesInitialized,
```

- [ ] **Step 2: 在 `NodeSystemCanvas` 里添加 `isFromTemplate` ref 和 `useNodesInitialized`**

找到 `NodeSystemCanvas` 函数的 state 声明区（约第 1021 行，`useNodesState` 那行附近），在其后插入：

```typescript
  const nodesInitialized = useNodesInitialized();
  // 用 ref 记录"是否首次从模板加载"，避免 setNodes 触发的重渲染再次进入自动布局
  const autoLayoutDoneRef = useRef(false);
```

- [ ] **Step 3: 给 `NodeSystemCanvas` 增加 `isNewFromTemplate` prop**

找到 `NodeSystemCanvas` 函数签名（约第 1012 行）：

```typescript
function NodeSystemCanvas({ initialGraph }: { initialGraph: GraphPayload }) {
```

替换为：

```typescript
function NodeSystemCanvas({ initialGraph, isNewFromTemplate }: { initialGraph: GraphPayload; isNewFromTemplate: boolean }) {
```

- [ ] **Step 4: 添加自动布局 useEffect**

找到 `useEffect` 初始化节点的代码块（约第 1210 行）：

```typescript
  useEffect(() => {
    const initialNodes = Array.isArray(initialGraph.nodes) ? initialGraph.nodes.map((node) => createFlowNodeFromGraphNode(node)) : [];
    const nodesById = new Map(initialNodes.map((node) => [node.id, node]));
    const initialEdges = Array.isArray(initialGraph.edges)
      ? initialGraph.edges.map((edge) => createFlowEdgeFromGraphEdge(edge, nodesById))
      : [];
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialGraph.edges, initialGraph.nodes, setEdges, setNodes]);
```

在该 `useEffect` 代码块**之后**插入以下新 `useEffect`：

```typescript
  // 模板新建时，等节点完成首次渲染后，用实际宽度重新计算水平坐标
  useEffect(() => {
    if (!isNewFromTemplate) return;
    if (!nodesInitialized) return;
    if (autoLayoutDoneRef.current) return;
    autoLayoutDoneRef.current = true;

    setNodes((current) => {
      if (current.length === 0) return current;

      // 按当前 x 坐标排序（保持原来的左到右顺序）
      const sorted = [...current].sort((a, b) => a.position.x - b.position.x);
      const GAP = 80;
      let nextX = sorted[0].position.x;
      const centerY = sorted.reduce((sum, n) => sum + n.position.y, 0) / sorted.length;

      return sorted.map((node) => {
        const width = (node.measured?.width ?? node.style?.width ?? 280);
        const updatedNode = {
          ...node,
          position: { x: nextX, y: centerY },
        };
        nextX += (typeof width === "number" ? width : 280) + GAP;
        return updatedNode;
      });
    });
  }, [isNewFromTemplate, nodesInitialized, setNodes]);
```

- [ ] **Step 5: 在 `NodeSystemEditor` 里传入 `isNewFromTemplate`**

找到 `NodeSystemEditor` 函数（约第 2174 行）：

```typescript
export function NodeSystemEditor(props: EditorClientProps) {
  const graph = props.initialGraph ?? createEditorDefaults(props.templates, props.defaultTemplateId);

  return (
    <ReactFlowProvider>
      <NodeSystemCanvas initialGraph={graph} />
    </ReactFlowProvider>
  );
}
```

替换为：

```typescript
export function NodeSystemEditor(props: EditorClientProps) {
  const graph = props.initialGraph ?? createEditorDefaults(props.templates, props.defaultTemplateId);
  // mode=new 且没有 initialGraph 时说明是从模板新建，需要自动布局
  const isNewFromTemplate = props.mode === "new" && props.initialGraph == null;

  return (
    <ReactFlowProvider>
      <NodeSystemCanvas initialGraph={graph} isNewFromTemplate={isNewFromTemplate} />
    </ReactFlowProvider>
  );
}
```

- [ ] **Step 6: 验证自动布局**

打开 `http://localhost:3477/editor/template-hello-world`（或新建 hello_world 图）。

期望行为：
- 三个节点加载完成后，自动按实际宽度排列，相邻节点间距均为 80px
- 已有 graph（`/editor/[graphId]`）加载时，节点位置不变

- [ ] **Step 7: Commit**

```bash
cd /home/abyss/GraphiteUI
git add frontend/components/editor/node-system-editor.tsx
git commit -m "feat: 模板新建时按实际节点宽度自动计算水平间距"
```

---

## Self-Review

**Spec coverage 检查：**
- ✅ 问题3（JSON显示）→ Task 1 完整覆盖，包含 markdown 清理、JSON 解析、按 key 提取、fallback
- ✅ 问题1.1（resize 内容撑满）→ Task 2 Step 2 中 NodeCard 改为 `h-full`，内容区随容器撑满
- ✅ 问题1.2（resize 持久化）→ Task 2 Step 5-6，onNodeResizeEnd 写入 style，buildPayload 序列化
- ✅ 问题1.3（最小尺寸可见）→ Task 2 Step 2，minWidth=160 / minHeight=48，保证 header 可见
- ✅ 问题2（间距按实际宽度）→ Task 3 完整覆盖，用 `measured?.width` 取实际渲染宽度

**Placeholder 扫描：** 无 TBD / TODO / "similar to" 等占位符，所有步骤都有完整代码。

**类型一致性检查：**
- `autoLayoutDoneRef` 在 Step 2 声明，在 Step 4 使用，ref 类型 `useRef(false)` ✅
- `isNewFromTemplate` 在 Step 3 加入 prop，Step 5 传入，Step 4 使用 ✅
- `node.measured?.width` 是 React Flow 内部字段，`useNodesInitialized` 触发后可用 ✅
- `buildPayload` 里序列化 `node.style`，`createFlowNodeFromGraphNode` 里读取 `node.style?.width` ✅
