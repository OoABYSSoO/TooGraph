# 如何开始使用 TooGraph

第一次使用 TooGraph，推荐按下面的顺序走：

1. 在仓库根目录运行 `npm run dev`，确保前后端都启动。
2. 打开 `/editor/new`，从模板创建一张图，例如 `Hello World`。
3. 先看清节点链路：`input -> agent -> output`。
4. 在问题输入里改一个你关心的问题。
5. 想验证联网能力时，从模板创建 `联网研究循环`，修改 input 里的研究问题。
6. 想验证视频下载和广告创意分析链路时，从模板创建 `广告创意分析demo模板`，保留默认 `SLG` 或改成其他游戏类型。
7. 确认相关 agent 节点已经挂载对应 skill，并且 Output 节点读取的是 `source_documents` 或 `downloaded_video_files` 这类 artifact state。
8. 点击 `Validate`，确认图结构合法。
9. 点击 `Run`，然后去 Output 节点和 Run Activity 面板看实时输出；如果抓取了网页正文或下载了媒体，Output 会展示对应本地 artifact。

如果你想快速理解 TooGraph 自己的产品形态，建议先问这些问题：

- TooGraph 是什么？
- TooGraph 现在已经做到了什么程度？
- State Panel 是怎么工作的？
- web_search skill 是怎么把摘要、证据链接和本地 source documents 交给 workflow 的？
- 广告创意分析demo模板是怎么下载公开视频并让 Output 展示本地视频 artifact 的？

如果你想验证知识库源文档，推荐先导入这些库再作为显式输入使用：

- 用 `toograph-official` 问项目本身
- 用 `python-official-3.14` 问 Python API
- 用 `langgraph-official-v1` 问 LangGraph 概念和机制

知识库输入本身不再自动带检索 skill；需要检索时，应把检索能力做成 `skill/<skill_key>` 文件夹里的显式 skill 后再挂到 agent 节点。
