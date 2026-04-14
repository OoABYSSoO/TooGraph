# Node System Design

这份文档记录 GraphiteUI 下一阶段 `node_system` 改造的正式设计结论。后续与节点、state、模板、edge、State Panel 相关的开发，默认都以这份文档为基准。

## 目标

当前系统里，节点端口定义、`state_schema`、模板数据和运行时语义并没有完全收口。新的 `node_system` 目标是把 GraphiteUI 收成一套更接近 LangGraph 原生心智的模型：

- `state` 是唯一且第一的数据源
- 节点不再定义自己的字段内容，只定义“读哪些 state、写哪些 state”
- `edge` 表达执行依赖和显式数据连接关系，但不再承担另一套独立 schema
- 模板改为 JSON 单一来源，不再用 `.py` 作为模板内容存储层

## 核心心智

### 1. `state` 是唯一数据源

Graph 中所有业务数据都来自 `state_schema`。

节点上的输入名、输出名、描述、类型、默认值，本质上都引用同一份 state 定义，而不是各自保存副本。

因此：

- 在 State Panel 改 state 名称、说明、类型，等于直接修改源数据
- 在节点上双击输入或输出名称进行修改，也等于直接修改源数据
- 系统里不再存在“节点显示名一份、state 面板一份，再做双向同步”的模式

### 2. 节点是 state 的 reader / writer

节点只表达：

- 读哪些 state
- 写哪些 state
- 节点自身特有的运行配置

节点不再拥有独立字段定义。

### 3. edge 对齐 LangGraph 心智

Graph 中使用两类边命名：

- `edges`
- `conditional_edges`

其中：

- `edges` 用于普通执行链路和显式的数据引用连接
- `conditional_edges` 用于条件分支，命名对齐 LangGraph 的 `add_conditional_edges`

### 4. 模板使用 JSON 单一来源

模板不再使用：

- `state.py`
- `template.py`

作为内容存储层。

后续模板应使用 JSON 保存，后端只负责：

- 读取 JSON
- 用 schema 做校验
- 返回给 `/api/templates`

如果后续确实需要动态逻辑，应当作为单独扩展能力存在，而不是默认模板机制。

## Graph 数据结构

### `state_schema`

`state_schema` 使用对象映射，键名就是 state 的唯一身份。

示例：

```json
{
  "question": {
    "description": "User question for the workflow.",
    "type": "text",
    "value": "",
    "color": "#d97706"
  },
  "knowledge_base": {
    "description": "Selected knowledge base.",
    "type": "knowledge_base",
    "value": "graphiteui-official",
    "color": "#0f766e"
  },
  "final_result": {
    "description": "Final result shown in the UI.",
    "type": "text",
    "value": "",
    "color": "#7c3aed"
  }
}
```

### 约束

- state 名称全局唯一
- state 名称本身就是身份，不再额外维护 `id / key / title`
- 同一个 state 在任何地方显示的名称、解释、类型都一致

### `nodes`

`nodes` 也使用对象映射，键名就是节点 key。节点 key 全图唯一，不允许重复。

示例：

```json
{
  "input_question": {
    "kind": "input",
    "name": "Input Question",
    "ui": {
      "position": { "x": 80, "y": 160 },
      "collapsed": false,
      "expandedSize": { "width": 300, "height": 210 },
      "collapsedSize": { "width": 300, "height": 72 }
    },
    "writes": [
      { "state": "question", "mode": "replace" }
    ],
    "config": {
      "value": "什么是 GraphiteUI？"
    }
  },
  "agent_answer": {
    "kind": "agent",
    "name": "Agent Answer",
    "ui": {
      "position": { "x": 560, "y": 160 },
      "collapsed": false,
      "expandedSize": { "width": 340, "height": 260 },
      "collapsedSize": { "width": 340, "height": 72 }
    },
    "reads": [
      { "state": "question", "required": true },
      { "state": "knowledge_base", "required": true }
    ],
    "writes": [
      { "state": "final_result", "mode": "replace" }
    ],
    "config": {
      "skills": ["search_knowledge_base"],
      "systemInstruction": "",
      "taskInstruction": ""
    }
  }
}
```

### 约束

- 节点名全局唯一
- 节点配置中不再保存独立的 `label / valueType`
- 节点可保留单独的 `name` 作为显示名，和节点 key 分离
- 节点的输入、输出显示内容都直接来自绑定的 state
- 节点需要保存自身 UI 信息，至少包括：
  - `position`
  - `collapsed`
  - `expandedSize`
  - `collapsedSize`

### `edges`

`edges` 保持数组形式。

示例：

```json
[
  {
    "source": "input_question",
    "target": "agent_answer",
    "sourceHandle": "write:question",
    "targetHandle": "read:question"
  }
]
```

### 约束

- `sourceHandle` 必须引用某个写口
- `targetHandle` 必须引用某个读口
- 两端引用的 state 必须完全一致
- 不允许 `write:question -> read:final_result`

也就是说：

- 边连接不是“类型兼容即可”
- 而是“必须围绕同一个 state 进行连接”

### `conditional_edges`

`conditional_edges` 单独存储，命名对齐 LangGraph。

示例：

```json
[
  {
    "source": "condition_loop",
    "branches": {
      "continue": "agent_answer",
      "stop": "output_result"
    }
  }
]
```

## 节点输入与输出的正式语义

节点输入和输出不再拥有独立 schema，它们只是对 `state_schema` 的引用视图。

例如：

- `agent` 读取 `question`
- `agent` 写入 `final_result`

在节点上显示时：

- 输入口名称默认显示 `question`
- 输出口名称默认显示 `final_result`

用户在节点上修改端口名称时，本质上修改的是 `state_schema` 中对应的 state 名称，因此全图所有引用这个 state 的地方都会一起变化。

## 新增输入 / 输出端口交互

新增输入或输出端口时，统一使用一个搜索选择器，不区分“已有 state 列表”和“新建 state 列表”。

交互规则：

1. 用户点击新增输入或新增输出
2. 打开一个统一的 state 搜索列表
3. 支持模糊搜索、词前缀搜索、缩写搜索
4. 列表第一行固定显示：
   - `新增 "当前输入内容"`
5. 下面显示匹配到的已有 state

例如：

- 输入 `fin r`，应能匹配 `final result`
- 输入 `fr`，也应能匹配 `final result`

### 选择已有 state

- 直接把当前节点端口绑定到该 state

### 新增 state

- 弹出一个小窗口
- 由用户配置这条 state 的属性：
  - `description`
  - `type`
  - `value`
  - `color`
- 保存后自动写入 `state_schema`
- 再把当前节点端口绑定到这条新 state

## State Panel 的正式职责

State Panel 不再是“另一份状态配置 UI”，而是 `state_schema` 的主编辑入口。

它负责：

- 新增 state
- 删除 state
- 编辑 state 名称、说明、类型、默认值、颜色
- 查看哪些节点在读这个 state
- 查看哪些节点在写这个 state

节点上的字段编辑与 State Panel 的字段编辑，最终都直接作用于同一个源数据。

## 校验规则

新的 `node_system` 至少应具备这些正式校验：

1. state 名称不能重复
2. 节点名称不能重复
3. `edges` 两端引用的 state 必须一致
4. 同一个读口最多只能有一条入边
5. 同一个节点中，同方向默认不重复绑定同一个 state
6. 多节点写同一个 state 时：
   - 第一阶段仅支持串行覆盖
   - 歧义并行写默认报错
7. 节点引用的 state 必须存在于 `state_schema`

## 模板迁移原则

当前模板需要从 Python 内容模板迁移为 JSON 内容模板。

### 迁移后的约束

- 模板内容只保存 JSON
- 模板中的 `state_schema`、`nodes`、`edges`、`conditional_edges` 必须自洽
- 不再保留单独的 `state.py`
- 不再允许模板里存在和节点实际引用不一致的硬编码 state

### 第一张迁移模板

`hello_world` 应作为第一张迁移模板，用来验证：

- state 是唯一数据源
- 节点只读写 state
- 新增端口选择已有或新建 state
- State Panel 与节点编辑入口都直接改源数据

## 开发顺序建议

建议按以下顺序推进：

1. 写出新的 `node_system` 正式 schema
2. 让模板系统支持 JSON 单一来源
3. 迁移 `hello_world`
4. 重做 State Panel 和节点端口编辑模型
5. 重做 edge 校验逻辑
6. 再迁移其他模板和 editor 交互

## 非目标

当前阶段不做：

- 保留旧 `state.py + template.py` 双轨模板体系
- 节点本地字段副本与 state 字段副本并存
- “只看类型兼容就允许连线”的宽松连接模型
- 通过双向同步维护节点字段和 state 字段
