# GraphiteUI 当前架构

GraphiteUI 当前是一个前后端分离的工作台：

- 前端：Vue 3 + Vite，负责首页、编辑器、运行记录、运行详情和设置页。
- 交互：Vue Router + Pinia + Reka UI；画布、节点和连线继续走自定义实现。
- 后端：FastAPI，负责图校验、运行时执行、知识库检索、导出接口和数据持久化。
- 存储：
  - graphs、runs、presets、settings、skills：JSON 文件
  - knowledge base：SQLite + FTS 索引

当前主链已经收口到 `node_system`：

- graph 保存和运行都围绕同一套协议
- `state_schema` 已经是唯一正式数据源
- `nodes` 使用对象映射保存，键名就是全图唯一节点名
- 节点只声明读取哪些 state、写入哪些 state
- agent skill 已经是显式挂载
- knowledge base 已经是正式资源，而不是临时目录名

现在的运行链路大致是：

1. 前端编辑并保存 graph
2. 后端做 schema + validator 校验
3. runtime 执行节点图
4. run 结果写入 JSON 存储
5. 前端轮询 run detail，展示节点状态、skill 输出、知识库摘要和输出产物

从调试角度看，GraphiteUI 现在已经不仅是一个画图工具，而是一个带运行态、知识库和观察能力的 workflow workspace。
