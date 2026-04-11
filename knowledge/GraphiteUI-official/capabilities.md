# GraphiteUI 能做些什么

GraphiteUI 现在最适合用来展示和验证以下工作方式：

- 通过 input 节点接收文本或文件，并把它们传给下游节点。
- 通过 agent 节点编排系统提示词、任务提示词、输入端口、输出端口以及 skill 挂载。
- 通过 condition 节点根据结构化结果做分支判断。
- 通过 output 节点预览文本、JSON 或上传资源相关结果。
- 通过 skill 调用知识检索、内容清洗、素材分析或其他 GraphiteUI 管理的能力。

在当前产品形态里，GraphiteUI 更像一个“可视化 workflow playground”，用于把 LLM、知识库、skill 和输出结果放进同一个界面里观察。

如果你想快速理解它，最好的方式通常是直接打开现成模板，修改输入，然后运行一次，观察每个节点输出了什么。
