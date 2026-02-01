# LangGraph Native Backend Migration Plan

这份文档只处理后端迁移。

目标不是重做前端，而是把当前 GraphiteUI 的后端执行主链，从：

- 自定义 schema + validator + executor + run state

迁移为：

- GraphiteUI graph JSON
- 编译为 LangGraph build plan
- 由 LangGraph runtime 执行

这份计划默认成立的前提：

- 前端视觉和交互先不动
- graph / template / preset 继续使用当前 JSON 文件形态
- 当前 `node_system` 仍然是编辑器协议
- 迁移重点是“运行时实现替换”，不是“产品层推翻重做”

## 总目标

最终后端需要满足这四条：

1. `graph` 能被编译成真正的 LangGraph graph
2. 默认运行主链由 LangGraph runtime 驱动
3. run / checkpoint / interrupt / resume 等运行态数据按 LangGraph 语义记录
4. 当前自定义 executor 不再是主执行器

## 非目标

本计划当前不做：

- 前端视觉改版
- 节点系统推翻重做
- 一次性引入所有 LangGraph 高级能力
- 把当前所有 skill 概念直接删除

## 当前基线

当前主运行链路是：

- schema: [node_system.py](/home/abyss/GraphiteUI/backend/app/core/schemas/node_system.py)
- validator: [validator.py](/home/abyss/GraphiteUI/backend/app/core/compiler/validator.py)
- executor: [node_system_executor.py](/home/abyss/GraphiteUI/backend/app/core/runtime/node_system_executor.py)
- run state: [state.py](/home/abyss/GraphiteUI/backend/app/core/runtime/state.py)

当前系统已经具备这些迁移基础：

- `state_schema`
- `reads / writes`
- `edges / conditional_edges`
- graph/template/preset JSON 化
- knowledge base 资源化

所以这不是从零开始，而是“替换后端运行内核”。

## 迁移策略

采取双轨短暂共存、逐阶段切换的方式：

- 先增加 LangGraph 编译层
- 再增加 LangGraph 运行入口
- 然后用最小子集切默认主链
- 最后补高级能力并退场旧 executor

不建议一步切，因为这样无法定位问题边界。

---

## Phase 0：冻结当前后端行为基线

状态：已完成

### 目标

在动 LangGraph-native 前，先固定住当前后端行为基线，确保后续每一阶段都能对照回归。

### 主要改动

- 补一组最小验收 graph fixture：
  - acyclic hello_world
  - knowledge_base hello_world
  - simple conditional graph
  - simple cycle graph
- 固定当前输出断言：
  - validate 结果
  - run status
  - node execution count
  - state snapshot 结构
  - cycle summary 结构

### 影响文件

- `backend/tests/` 或当前项目已有测试目录
- 可能新增 `fixtures/graphs/*.json`

### 可验证结果

- 当前自定义 executor 跑这些 fixture 全部通过
- 后续每一阶段都能跑同一批 fixture 做对比

### 完成标准

- 至少 4 张代表性 graph 有可重复回归用例
- 后续每次迁移都能拿它们比对结果

---

## Phase 1：引入 LangGraph 编译层，不切执行主链

状态：已完成

### 目标

先把 GraphiteUI graph 编译成 LangGraph build plan，但不立刻执行。

### 主要改动

- 新增编译模块，例如：
  - `backend/app/core/langgraph/compiler.py`
  - `backend/app/core/langgraph/build_plan.py`
- 将当前 graph JSON 编译为中间结构：
  - state schema mapping
  - node callable registry mapping
  - edge mapping
  - conditional edge mapping
  - runtime requirements

### 重点规则

- 当前 graph JSON 仍然是唯一输入协议
- build plan 只描述“怎么生成 LangGraph graph”
- 这一阶段不替换 validate / run

### 可验证结果

- 对 `hello_world` 能输出稳定的 build plan
- build plan 中能明确看到：
  - state schema
  - nodes
  - edges
  - conditional edges
  - knowledge base / tool requirements

### 完成标准

- `hello_world`、条件图、循环图都能成功编译出 build plan
- build 过程中不依赖旧 executor 的私有运行态结构

---

## Phase 2：实现最小 LangGraph runtime 子集

状态：已完成

### 目标

先支持最小可运行子集，证明 GraphiteUI graph 可以真正由 LangGraph 执行。

### 第一批只支持这些节点

- `input`
- `agent`
- `condition`
- `output`

### 第一批只支持这些能力

- `state_schema`
- `reads / writes`
- `edges`
- `conditional_edges`
- 单知识库绑定
- 无 interrupt
- 无 checkpoint
- 无 subgraph
- state write 仍先只支持 `replace`

### 主要改动

- 新增 LangGraph runtime adapter，例如：
  - `backend/app/core/langgraph/runtime.py`
- 将 build plan 编译为真正的 `StateGraph`
- 为每类节点提供 LangGraph node callable 包装器

### 风险点

- 当前 agent skill 执行方式需要先适配到 callable/tool 形式
- output 节点的产物持久化要从 executor 逻辑中拆出来

### 可验证结果

- `hello_world` 能真正由 LangGraph runtime 跑通
- 输出内容、state snapshot、node execution 数量与当前自定义 executor 大致一致
- 后端日志里可明确区分：
  - current executor path
  - langgraph runtime path

### 完成标准

- 至少一张 `hello_world` 图已经不是自定义 executor 在跑
- LangGraph runtime 跑出的结果能被当前前端消费

---

## Phase 3：引入运行主链开关并切默认执行

状态：已完成

### 目标

在保留回退开关的前提下，把默认运行主链切到 LangGraph。

### 主要改动

- 在 `/api/graphs/run` 增加明确的 runtime 选择逻辑
- 默认选择 LangGraph runtime
- 自定义 executor 暂时保留为 fallback
- 将运行结果统一整理为当前前端能消费的 run detail 结构

### 设计要求

- 前端不感知后端是否切换了运行内核
- 同一个 graph JSON 可以被：
  - LangGraph runtime 执行
  - fallback executor 执行

### 可验证结果

- `/api/graphs/run` 默认走 LangGraph runtime
- 有明确日志或响应元数据标记 runtime backend
- 当前主要模板都能跑通

### 完成标准

- 默认运行路径切到 LangGraph
- 当前主链图不需要手工指定 fallback

---

## Phase 4：重构运行状态模型，对齐 LangGraph 生命周期

状态：已完成

### 目标

让 run state 不再围绕旧 executor 设计，而是对齐 LangGraph-native 的生命周期。

### 主要改动

- 重构 [state.py](/home/abyss/GraphiteUI/backend/app/core/runtime/state.py)
- 扩展 run status，至少准备：
  - `queued`
  - `running`
  - `paused`
  - `awaiting_human`
  - `resuming`
  - `completed`
  - `failed`
- 规范化这些结构：
  - node executions
  - state snapshot
  - state events
  - cycle summary
  - checkpoint metadata

### 风险点

- 当前 run detail UI 是按旧结构来的
- 需要保证新增字段不破坏现有页面读取

### 可验证结果

- run JSON 中已出现更接近 LangGraph 的运行态结构
- 现有前端 run detail 不崩

### 完成标准

- run state 已不再只围绕旧 executor 的四状态模型设计
- checkpoint / interrupt 相关字段已有正式位置

---

## Phase 5：接入 checkpoint / resume

状态：已完成

### 目标

让 LangGraph-native 的关键能力开始落地，而不是只替换 executor。

### 主要改动

- 为 LangGraph runtime 增加 checkpoint saver
- 定义 checkpoint 存储位置和序列化格式
- run 恢复入口接到 checkpoint

### 后端需要明确的问题

- checkpoint 存哪里
- graph 更新后旧 checkpoint 如何处理
- 同一个 run/thread 的恢复边界如何定义

### 可验证结果

- 某张运行中的 graph 可以从 checkpoint 恢复
- run 记录中能看到 checkpoint id / thread id / resume source

### 完成标准

- 至少一个可暂停恢复的最小图跑通

---

## Phase 6：接入 interrupt / 人类在环

状态：已完成

### 目标

把 LangGraph-native 的另一块关键差异补上。

### 主要改动

- 在后端引入 interrupt 语义
- 允许图在指定节点前后暂停
- 允许 run 进入：
  - `paused`
  - `awaiting_human`
  - `resuming`

### 注意

这一阶段后端优先，不要求前端一步到位做完全部交互。

可以先做到：

- 后端可暂停
- 后端可恢复
- API 可暴露暂停点和恢复入口

### 可验证结果

- 一个最小 interrupt 图能够：
  - 运行到断点
  - 暂停
  - 注入人工决策
  - 恢复

### 完成标准

- interrupt 已不是设计稿，而是后端正式能力

---

## Phase 7：把 cycles 从自定义调度迁到 LangGraph 语义

状态：已完成

### 目标

当前 cycles 虽然可用，但还是自定义 runtime 逻辑。这个阶段要把它迁到真正的 LangGraph 语义表达。

### 主要改动

- 不再由自定义 executor 管理 iteration
- 用 LangGraph 图结构和条件路由表达循环
- `cycle_summary / cycle_iterations` 改为从 LangGraph 运行轨迹推导

### 风险点

- 当前前端对 cycle summary 的展示已经成型
- 需要保持对现有前端字段的兼容输出

### 可验证结果

- 当前循环图由 LangGraph runtime 表达和执行
- max iteration、exit branch、stop reason 仍能返回给前端

### 完成标准

- cycles 不再依赖自定义 executor 内部调度

---

## Phase 8：知识库与技能执行语义重构

### 目标

把当前“自定义 skill runtime”逐步收成更接近 LangGraph-native 的 tool / retriever 模型。

### 主要改动

- `search_knowledge_base` 从当前 skill runtime 主链降级为编译期映射概念
- agent 节点挂载的 skill 逐步转为：
  - node callable
  - tool
  - retriever
- 明确哪些 skill：
  - 可以编译成 LangGraph tool
  - 只能作为 GraphiteUI 产品层抽象保留

### 可验证结果

- 接入知识库的 agent 不再依赖当前自定义 executor 注入 skill 逻辑
- 检索行为已由 LangGraph 运行链承担

### 完成标准

- knowledge base 主链不再依赖当前自定义 skill executor

---

## Phase 9：退役旧 executor

### 目标

当 LangGraph runtime 已覆盖主链能力后，正式退役旧 executor。

### 主要改动

- 删除或封存：
  - [node_system_executor.py](/home/abyss/GraphiteUI/backend/app/core/runtime/node_system_executor.py)
- 删除旧 executor 专属状态结构和 fallback 路径
- 精简 validator 中只为旧 executor 服务的逻辑

### 可验证结果

- 默认主链、知识库主链、循环主链、interrupt 主链都已走 LangGraph
- 删除旧 executor 后，主功能不退化

### 完成标准

- GraphiteUI 后端默认执行链已是 LangGraph-native

---

## Phase 10：导出可执行的 LangGraph Python 文件

### 目标

在后端已经具备 LangGraph-native 执行主链之后，再补“导出 Python LangGraph 脚本”能力。

### 主要改动

- 新增代码生成模块，例如：
  - `backend/app/core/langgraph/codegen.py`
- 将 build plan 编译为可执行 Python 源码
- 明确导出文件结构：
  - imports
  - state schema
  - node callables / stubs
  - `StateGraph` 构建逻辑
  - `add_edge`
  - `add_conditional_edges`
  - compile / invoke 示例
- 新增导出接口，例如：
  - `/api/graphs/export/langgraph-python`

### 设计要求

- 导出的 Python 文件必须是可读、可运行、可二次编辑的源码
- 不能只导出中间 JSON
- 不能只导出 build plan
- 生成结果必须明确区分：
  - 当前 GraphiteUI 可自动生成的部分
  - 仍需开发者手工补完的部分

### 第一阶段建议只支持

- `input`
- `agent`
- `condition`
- `output`
- `state_schema`
- `edges`
- `conditional_edges`

暂不强行覆盖：

- interrupt
- checkpoint
- subgraph
- 高级知识库工具链

### 可验证结果

- `hello_world` 能导出一份可执行的 LangGraph Python 文件
- 生成脚本可以在独立 Python 环境中运行
- 导出的 graph 结构与当前 GraphiteUI graph 一致

### 完成标准

- 后端已具备稳定的 Python 源码导出能力
- 前端后续只需要接一个“导出 LangGraph Python”入口即可

---

## 每阶段统一验收标准

每个阶段都必须跑至少这组检查：

1. `hello_world` 可 validate
2. `hello_world` 可 save
3. `hello_world` 可 run
4. 接入知识库的 `hello_world` 可 run
5. 简单 condition 图可 run
6. 简单 cycle 图可 run
7. 现有前端页面不需要改视觉就能消费结果
8. `./scripts/start.sh` 后服务正常

## 建议的执行顺序

严格建议按下面顺序做，不要跳步：

1. Phase 0：冻结基线
2. Phase 1：编译层
3. Phase 2：最小 LangGraph runtime
4. Phase 3：切默认执行主链
5. Phase 4：run state 重构
6. Phase 5：checkpoint / resume
7. Phase 6：interrupt
8. Phase 7：cycles LangGraph 化
9. Phase 8：知识库与技能执行语义重构
10. Phase 9：退役旧 executor
11. Phase 10：导出 LangGraph Python 文件

## 当前讨论结论

当前最合理的做法不是立刻“全面 LangGraph 化”，而是：

- 先把后端迁移看成一条独立工程线
- 明确编译边界
- 先用最小子集验证 LangGraph runtime
- 成功后再替换主执行链

这份文档后续可以作为正式执行计划继续细化，不再重新起草一份新的迁移稿。
