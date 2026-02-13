# 什么是 GraphiteUI

GraphiteUI 是一个面向 Agent workflow 的可视化编辑器和运行工作台。它的目标不是只“调一次模型”，而是把一条完整流程拆成可见、可改、可重复执行的节点图。

当前主链围绕 `node_system` 这一套统一协议展开。用户在画布里组合以下节点：

- `input`：把文本、文件或知识库引用引入图中。
- `agent`：定义任务说明、输入输出端口、技能挂载和结构化结果。
- `condition`：把 LangGraph 条件边具象化为可编辑节点，根据规则决定 true / false / exhausted 分支走向。
- `output`：预览和持久化最终结果。

GraphiteUI 的核心价值在于把原本散在代码里的流程关系，变成可以直接观察和调试的图：

- 你可以看到每个节点的输入和输出是怎么连起来的。
- 你可以显式管理 graph state，而不是把状态藏在代码里。
- 你可以看到运行历史、节点执行结果、技能输出和知识库来源。

从产品心智上讲，GraphiteUI 更像一个可视化的 workflow workspace：

- 用图来组织流程
- 用 skill 扩展 agent 能力
- 用 knowledge base 给回答提供 grounded context
- 用 run detail 查看整个执行链路
