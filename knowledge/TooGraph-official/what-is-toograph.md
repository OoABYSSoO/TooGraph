# 什么是 TooGraph

TooGraph 是一个面向 Agent workflow 的可视化编辑器和运行工作台。它的目标不是只“调一次模型”，而是把一条完整流程拆成可见、可改、可重复执行、可审计的节点图。

当前主链围绕 `node_system` 这一套统一协议展开。用户在画布里组合以下节点：

- `input`：把文本、文件、媒体或知识库引用引入图中。
- `agent`：当前协议里的 LLM 节点，定义任务说明、输入输出端口、模型配置、一个显式 Skill 或一个动态能力输入。
- `condition`：把 LangGraph 条件边具象化为可编辑节点，根据规则决定 true / false / exhausted 分支走向。
- `output`：预览、展示、导出或链接最终结果和 artifacts。
- `subgraph`：把一张完整图模板嵌入父图，作为可编辑、可运行、可审计的子流程。

TooGraph 的核心价值在于把原本散在代码里的流程关系，变成可以直接观察和调试的图：

- 你可以看到每个节点的输入和输出是怎么连起来的。
- 你可以显式管理 graph state，而不是把状态藏在代码里。
- 你可以看到运行历史、节点执行结果、技能输出、状态快照、warnings、errors 和本地 artifacts。
- 你可以把联网搜索、能力选择、Skill 生成、脚本测试、本地文件操作这类能力做成显式 Skill，由 graph 负责决定何时调用、如何审计和如何把结果传给下游。
- 你可以把稳定流程保存为图模板，或作为 `subgraph` 节点嵌入更大的图。
- Buddy 也是按 `buddy_autonomous_loop` 发起的一次 graph run，不是绕过图协议的第二套 agent runtime。

从产品心智上讲，TooGraph 更像一个可视化的 workflow workspace：

- 用图来组织流程。
- 用 state_schema 管理数据契约。
- 用 Skill 扩展 LLM 节点能力。
- 用 graph template 和 subgraph 复用流程。
- 用 knowledge base 给回答提供 grounded context。
- 用 run detail、Run Activity、Output 和 artifacts 查看整个执行链路。
