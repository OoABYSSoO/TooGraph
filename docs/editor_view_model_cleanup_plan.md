# Editor View Model Cleanup Plan

这份文档只处理一件事：

- 在不改变当前编辑器视觉设计和交互路径的前提下，
- 逐步删除前端内部残留的旧视图模型壳子，
- 让编辑器组件直接围绕正式 `node_system` 协议工作。

这里说的“旧视图模型壳子”不是后端兼容层，也不是接口协议。
它只指前端编辑器内部仍在使用的这些 UI 数据形态：

- `NodePresetDefinition`
- `PortDefinition`
- `StateField`
- `SkillAttachment`
- `outputBinding`

当前真实 source of truth 已经是 canonical `node_system`。
但节点卡片、端口编辑、技能面板、State Panel 等组件，还在先把 canonical 数据投影成旧 UI shape 再渲染。

## 目标

最终状态需要同时满足：

1. 前端页面视觉完全不变。
2. 用户操作路径完全不变。
3. 节点卡片、State Panel、技能面板直接读 canonical 数据或极薄的只读 selector。
4. `NodePresetDefinition` 不再作为编辑器主状态。
5. `outputBinding`、旧 skill attachment 包装、旧端口 label 副本都被删除。

## 当前残留项

### 1. 节点卡片主视图

当前仍主要围绕这些字段工作：

- `config.family`
- `config.inputs`
- `config.outputs`
- `config.input`
- `config.output`

目标是改成直接围绕：

- `node.kind`
- `node.reads`
- `node.writes`
- `node.config`

### 2. State Panel

当前仍先把 canonical `state_schema` 投影为 `StateField[]` 后再渲染。

目标是：

- 直接读 `canonicalGraph.state_schema`
- `StateField[]` 只在必要时作为局部临时 UI 草稿，不再作为主视图类型

### 3. 技能面板

当前 agent 节点技能区仍围绕：

- `SkillAttachment[]`

而正式协议实际只需要：

- `string[]`

目标是：

- UI 直接展示和编辑 `string[]`
- skill metadata 仅作为只读查表数据存在

### 4. outputBinding

当前该字段仍在前端 agent 高级编辑区里存在。

它已经不是正式协议字段，也不是主链能力。

目标是：

- 直接删除

### 5. 预设视图层

当前 preset 主链已是 canonical，但前端本地仍保留：

- `EditorPresetRecord`
- `definition: NodePresetDefinition`
- `stateSchema: StateField[]`

目标是：

- 预设创建菜单和保存交互仍保持不变
- 但节点创建与读取直接基于 canonical preset definition

## 执行顺序

### Phase A：删除 `outputBinding`

范围：

- 删除前端类型里的 `outputBinding`
- 删除 agent 高级面板中的对应编辑区域
- 删除和它相关的保存、读取、默认值逻辑

完成标准：

- UI 上不再出现 `Output Binding`
- 编译、保存、运行都不受影响

### Phase B：技能面板直接改为 `string[]`

范围：

- 去掉 `SkillAttachment`
- agent 配置中的 `skills` 直接变成 `string[]`
- 技能定义元数据通过 `skillDefinitions` 查表获取显示名和 schema

完成标准：

- 节点技能区显示不变
- 自动挂载知识库 skill 逻辑不变
- 保存 / 校验 / 运行不需要再组装 skill attachment 对象

### Phase C：端口名彻底去副本

范围：

- 删除 `PortDefinition.label`
- 端口显示名统一直接取绑定的 `state.name`
- 双击端口改名时直接修改对应 state

完成标准：

- 端口名没有第二份存储
- state 改名和端口改名完全共用同一源数据

### Phase D：State Panel 直接读 canonical state

范围：

- `StatePanel` 直接消费 `canonicalGraph.state_schema`
- `StateField[]` 降为局部辅助结构，或直接删除
- State Panel 里的 reader / writer 摘要全部从 canonical `reads / writes` 派生

完成标准：

- State Panel 不再依赖 `StateField[]` 主状态
- state 的增删改查直接落到 canonical graph

### Phase E：节点卡片直接围绕 canonical node 渲染

范围：

- `NodeCard` 直接读 canonical node
- `listInputPorts` / `listOutputPorts` 等旧 config 辅助函数逐步退场
- `NodePresetDefinition` 不再作为节点卡片主输入类型

完成标准：

- 节点卡片不再依赖旧 `config.inputs / outputs`
- `NodePresetDefinition` 降为历史类型或被彻底删除

### Phase F：预设视图层收口

范围：

- 创建节点时直接基于 canonical preset
- 删除 `EditorPresetRecord` 里的旧 definition 壳子
- 预设菜单只保留当前 UI 所需的最薄投影

完成标准：

- preset 主链完全围绕 canonical
- 不再需要把 preset definition 转成旧节点配置对象

## 每一步的统一验收清单

每完成一个阶段，都必须检查：

1. `/editor/new?template=hello_world` 正常打开
2. `hello_world` 可保存
3. `hello_world` 可校验
4. `hello_world` 可运行
5. 节点卡片视觉不变
6. State Panel 交互不变
7. 节点预设保存仍可用
8. `./scripts/start.sh` 重启后页面正常

## 推荐推进顺序

建议严格按下面顺序进行：

1. Phase A：删除 `outputBinding`
2. Phase B：技能面板改为 `string[]`
3. Phase C：端口名去副本
4. Phase D：State Panel 直接读 canonical state
5. Phase E：节点卡片直接围绕 canonical node
6. Phase F：预设视图层收口

原因：

- `outputBinding` 最独立、风险最低
- 技能面板和端口名副本都属于中等影响、可局部验证
- State Panel 和 NodeCard 是最大改动面，放后面更稳
- 预设放最后，避免在主编辑器结构未稳定前反复返工
