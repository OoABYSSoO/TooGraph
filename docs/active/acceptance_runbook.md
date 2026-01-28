# State-Aware Editor Acceptance Runbook

## 1. Purpose

本文件定义当前 editor 的本地验收方式。

本轮验收重点是验证新 node_system 架构：

- 当前 preset-driven editor 是否已为 state-aware editor 打下可运行基础
- 前端边界模型与后端 LangGraph 编译模型是否一致
- `hello_world` 是否能完成保存、校验、运行闭环
- 输出结果是否能在 editor 内回填，节点级详情是否至少可在 run detail 查看

## 2. Startup

推荐启动方式：

```bash
./scripts/start.sh
```

默认地址：

- Frontend: `http://127.0.0.1:3477`
- Backend: `http://127.0.0.1:8765`

健康检查：

```bash
curl --noproxy '*' -fsS http://127.0.0.1:8765/health
```

## 3. Entry Routes

优先验收入口：

- `/editor`
- `/editor/new`
- `/editor/{graphId}`

验收入口为 `/editor/new` 和 `/editor/{graphId}`，`creative_factory` 模板已下线。

## 4. Core Acceptance Cases

当前验收重点：

- 边界节点是否已经替代显式 `start / end`
- 节点输入输出与边界语义是否足够清晰
- `hello_world` 是否能按新边界模型闭环运行

## AC-1 Editor Shell

步骤：

1. 打开 `/editor`
2. 确认能看到：
   - 新建图入口
   - 已有图列表
   - 模板信息

通过标准：

- 页面可访问
- 可跳转到 `/editor/new`

## AC-2 Canvas Base

步骤：

1. 打开 `/editor/new`
2. 检查画布背景
3. 使用鼠标滚轮缩放
4. 拖动画布
5. 点击 `Fit View`

通过标准：

- 网格或点阵背景清晰
- 缩放正常
- 平移正常
- Fit View 生效

## AC-3 Left Rail

步骤：

1. 打开 `/editor/new`
2. 检查左侧是否存在：
   - `Node Palette`

通过标准：

- 节点库可搜索
- 可从左侧点击或拖拽创建节点

## AC-4 Node Creation

步骤：

1. 在节点库中点击一个节点
2. 再拖拽一个节点到画布

通过标准：

- 点击建点成功
- 拖拽建点成功
- 新节点自动选中

## AC-5 Node Semantics

步骤：

1. 使用 `hello_world` 模板或最小图
2. 观察 `Input Boundary / Agent / Output Boundary`
4. 观察节点呈现

通过标准：

- 节点能区分输入和输出
- 用户不需要依赖显式 `start/end` 才能理解图
- 输入、处理、输出三类节点边界清晰

## AC-5.1 Parameter Socket Override

当前状态说明：

- 该项暂不作为当前代码库的通过标准
- 当前 editor 仍以节点级 input/output port 为主，参数级 socket 后续再验收

## AC-6 Edge Semantics

步骤：

1. 将 `Question Input.question` 连到 `GraphiteUI Onboarding Helper.question`
2. 将 `Knowledge Base.knowledge_base` 连到 `GraphiteUI Onboarding Helper.knowledge_base`
3. 将处理节点的 `answer` 连到输出边界
4. 检查输入输出端口和连线表达

通过标准：

- 连线方向正确
- 输入输出关系清晰可读

## AC-7 Save and Reload

步骤：

1. 在 `/editor/new` 搭建最小 `hello_world` 图
2. 点击 `Save`
3. 记录跳转后的 `graphId`
4. 刷新页面

通过标准：

- graph 成功保存
- 可从 `/editor/{graphId}` 重新打开
- 刷新后仍能加载原图，节点尺寸等样式信息保持

## AC-8 Validate

步骤：

1. 点击 `Validate`
2. 观察顶部状态反馈或错误提示

通过标准：

- 合法图返回通过
- 非法图能看到明确 issue

## AC-9 Hello World Run

步骤：

1. 使用 `hello_world` 模板或等价最小图
2. 在 `Question Input` 中填写问题，并确认 `Knowledge Base` 为可用知识库
3. 点击 `Run`
4. 等待运行结束

通过标准：

- run 状态可见
- 运行成功或失败状态明确
- 输出节点或状态区可见 answer 或错误信息

## AC-10 Node Result Inspection

步骤：

1. 完成一次 run
2. 在 editor 中查看输出节点 preview 与 run 状态
3. 打开 `/runs/{runId}`

通过标准：

- editor 内至少能看到最新 run 已回填的结果或失败提示
- run detail 页面可看到节点时间线与输出摘要

## AC-11 Boundary Compilation Semantics

步骤：

1. 完成一次 `hello_world` run
2. 观察输入、处理节点和输出的表达
3. 确认前端模型可以被保存、校验和运行

通过标准：

- 用户能理解真实输入和真实输出
- `answer` 能被明确读取
- 前端边界模型不会阻碍后端 LangGraph 运行

## AC-12 Node Resize

步骤：

1. 打开任意 graph
2. 点击选中一个节点，确认出现 resize 手柄
3. 对 Input Boundary 节点拖动手柄尝试向内缩小
4. 点击 Save，刷新页面

通过标准：

- 选中时显示 resize 手柄（橙色圆点）
- Input Boundary 不能缩小到文本框不可见（minHeight=240）
- Output Boundary minHeight=180，Agent minHeight=120
- 刷新后节点尺寸保持

## AC-13 Template Auto Layout

步骤：

1. 打开 `/editor/new?template=hello_world` 或从模板新建 hello_world
2. 观察节点加载完成后的排列

通过标准：

- 节点水平排列，相邻节点间距视觉均匀
- 不出现节点重叠

## AC-14 Output Node Displays Extracted Text

步骤：

1. 运行 hello_world 图
2. 等待运行完成
3. 观察 Output Boundary 节点的 Preview 区域

通过标准：

- 显示干净的问候文本
- 不显示原始 JSON 结构或 ` ```json ``` ` 标记

## 5. Exit Criteria

当前阶段可认为通过验收的条件：

- 新 editor 路由可用
- state-aware 基本心智成立
- 前端边界模型明确
- 节点输入输出和逐项连线可读
- 节点运行结果可在 editor 内查看
- `hello_world` 可保存、校验、运行
- 输出节点展示提取后的字段值，不展示原始 JSON
- 节点 resize 正常，各类型 minHeight 防内容截断
- 模板新建时节点间距自动对齐
