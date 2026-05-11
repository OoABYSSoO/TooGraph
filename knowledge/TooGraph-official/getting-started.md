# 如何开始使用 TooGraph

第一次使用 TooGraph，推荐按下面的顺序走：

1. 在仓库根目录运行 `npm start`。这会执行 `node scripts/start.mjs`，构建或复用 `frontend/dist`，然后在单端口启动 TooGraph。
2. 打开 `http://127.0.0.1:3477`，进入 Editor。
3. 新建一张图，或从官方模板创建一张图，例如 `advanced_web_research_loop`、`buddy_autonomous_loop` 或 `toograph_skill_creation_workflow`。
4. 先看清节点链路：最小图通常是 `input -> agent -> output`；复杂图会通过 `condition` 和 `subgraph` 表达分支、循环和封装流程。
5. 在 input 节点里改一个你关心的问题。
6. 如果要运行 LLM 节点，先到 Model Providers 页面配置可用的本地 OpenAI-compatible 网关、私有网关或云端 Provider，并选择默认文本模型。
7. 点击 `Validate`，确认图结构合法。
8. 点击 `Run`，然后在 Output 节点、Run Activity 面板或 Runs / Run Detail 页面查看输出、state、artifacts、warnings 和 errors。
9. 如果图进入 `awaiting_human`，在 Human Review 面板或 Buddy 暂停卡片中补充必填 state，再通过 resume 继续运行。

当前官方模板：

- `advanced_web_research_loop`：多轮联网搜索、证据评估、补充检索和最终回复。
- `buddy_autonomous_loop`：Buddy 可见主循环，读取 Buddy Home、本轮消息、页面上下文和对话历史，按需选择能力并输出唯一 `final_reply`。
- `toograph_skill_creation_workflow`：通过澄清、样例确认、Skill 文件生成、脚本测试和写入审批来创建用户自定义 Skill。
- `buddy_self_review`：Buddy 回复完成后的内部后台复盘模板，不作为普通模板入口。

如果你想快速理解 TooGraph 自己的产品形态，建议先问这些问题：

- TooGraph 是什么？
- TooGraph 当前有哪些节点类型？
- `state_schema` 为什么是唯一数据源？
- Skill 和 graph template 的边界是什么？
- Buddy 为什么也是 graph run，而不是第二套 agent runtime？

如果你想验证知识库源文档，推荐先导入这些库再作为显式输入使用：

- 用 `toograph-official` 问项目本身。
- 用 `python-official-3.14` 问 Python API。
- 用 `langgraph-official-v1` 问 LangGraph 概念和机制。

知识库输入本身不再自动带检索 Skill；需要检索时，应通过 `skill/official/<skill_key>/` 或 `skill/user/<skill_key>/` 中的显式 Skill 接入。
