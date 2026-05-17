# 如何开始使用 TooGraph

第一次使用 TooGraph，推荐按下面的顺序走：

1. 在仓库根目录运行 `npm start`。这会执行 `node scripts/start.mjs`，构建或复用 `frontend/dist`，然后在单端口启动 TooGraph。
2. 打开 `http://127.0.0.1:3477`，进入 Editor。
3. 新建一张图，或从官方模板创建一张图，例如 `advanced_web_research_loop`、`buddy_autonomous_loop`、`buddy_capability_loop`、`toograph_page_operation_workflow` 或 `toograph_action_creation_workflow`。
4. 先看清节点链路：最小图通常是 `input -> agent -> output`；复杂图会通过 `condition` 和 `subgraph` 表达分支、循环和封装流程。
5. 在 input 节点里改一个你关心的问题。
6. 如果要运行 LLM 节点，先到 Model Providers 页面配置可用的本地 OpenAI-compatible 网关、私有网关或云端 Provider，并选择默认文本模型。
7. 点击 `Validate`，确认图结构合法。
8. 点击 `Run`，然后在 Output 节点、Run Activity 面板或 Runs / Run Detail 页面查看输出、state、artifacts、warnings 和 errors。
9. 如果图进入 `awaiting_human`，在 Human Review 面板、运行详情或伙伴页面确认页签中处理必填 state 或权限确认，再通过标准 resume 路径继续运行。Buddy 聊天输入不会作为隐藏 resume payload。

当前官方模板：

- `advanced_web_research_loop`：多轮联网搜索、证据评估、补充检索和最终回复。
- `buddy_autonomous_loop`：Buddy 可见主循环，读取 Buddy Home、本轮消息、页面上下文和对话历史，完成请求理解、按需任务计划、能力循环和最终回复；澄清和能力缺口通过最终回复结束本轮。
- `buddy_capability_loop`：Buddy 官方能力循环子图，负责选择 Action、Subgraph、Tool 或可运行图模板能力、执行、复盘和决定是否继续。
- `toograph_page_operation_workflow`：操作 TooGraph 页面和运行指定图模板的官方可见操作入口。
- `toograph_action_creation_workflow`：通过澄清、样例生成、Action 文件生成、脚本测试和受控写入来创建用户自定义 Action。
- `buddy_autonomous_review`：Buddy 回复完成后的内部后台自主复盘模板，显示名为“自主复盘”，不作为普通模板入口。

如果你想快速理解 TooGraph 自己的产品形态，建议先问这些问题：

- TooGraph 是什么？
- TooGraph 当前有哪些节点类型？
- `state_schema` 为什么是唯一数据源？
- Action 和 graph template 的边界是什么？
- Buddy 为什么也是 graph run，而不是第二套 agent runtime？

如果你想验证知识库源文档，推荐先导入这些库再作为显式输入使用：

- 用 `toograph-official` 问项目本身。
- 用 `python-official-3.14` 问 Python API。
- 用 `langgraph-official-v1` 问 LangGraph 概念和机制。

知识库输入本身不再自动带隐式检索能力；需要检索时，应通过显式 Action 或图模板接入。
