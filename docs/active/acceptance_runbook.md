# State-Aware Editor Acceptance Runbook

## 1. Purpose

本文件定义当前 editor 的本地验收方式。

本轮验收重点不再是旧版 `creative_factory` 体验，而是：

- state-aware editor 语义是否成立
- 前端边界模型与后端 LangGraph 编译模型是否一致
- `hello_world` 是否能完成保存、校验、运行闭环
- 节点级结果是否能在 editor 内直接查看

## 2. Startup

推荐启动方式：

```bash
./scripts/dev_up.sh
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

第一阶段不再把旧 `creative_factory` editor 作为主验收入口。

## 4. Core Acceptance Cases

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
   - `State Panel`
   - `Node Palette`

通过标准：

- 两个区块清晰分开
- state 列表可见
- 节点库可搜索

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

1. 定义输入 state `name`
2. 定义输出 state `greeting / final_result`
3. 创建 `hello_model`
4. 观察节点呈现

通过标准：

- 节点能区分输入和输出
- `hello_model` 只显示真实 `reads / writes`
- 用户不需要依赖显式 `start/end` 才能理解图

## AC-6 Edge Semantics

步骤：

1. 将输入 state `name` 连到 `hello_model`
2. 将 `hello_model` 的输出 state 连到输出边界
3. 检查每个 state 是否有独立连线

通过标准：

- 每个 state 项有独立连线
- 每条线能清楚表达该 state 的来龙去脉

## AC-7 Save and Reload

步骤：

1. 在 `/editor/new` 搭建最小 `hello_world` 图
2. 点击 `Save`
3. 记录跳转后的 `graphId`
4. 刷新页面

通过标准：

- graph 成功保存
- 跳转到 `/editor/{graphId}`
- 刷新后仍能加载原图

## AC-8 Validate

步骤：

1. 点击 `Validate`
2. 观察 inspector 中的反馈

通过标准：

- 合法图返回通过
- 非法图能看到明确 issue

## AC-9 Hello World Run

步骤：

1. 使用最小 `hello_world` 图
2. 在输入边界中设置名字参数
3. 点击 `Run`
4. 等待运行结束

通过标准：

- run 状态可见
- 运行成功或失败状态明确
- 最终结果区域可见 greeting 或错误信息

## AC-10 Node Result Inspection

步骤：

1. 完成一次 run
2. 点击 `hello_model`

通过标准：

- 可看到节点最近一次运行结果
- 至少包含：
  - `status`
  - `input_summary`
  - `output_summary`
  - `warnings`
  - `errors`
  - `artifacts`

## AC-11 Boundary Compilation Semantics

步骤：

1. 完成一次 `hello_world` run
2. 观察输入、处理节点和输出的表达
3. 确认前端模型可以被保存、校验和运行

通过标准：

- 用户能理解真实输入和真实输出
- greeting 或最终结果能被明确读取
- 前端边界模型不会阻碍后端 LangGraph 运行

## 5. Exit Criteria

当前阶段可认为通过验收的条件：

- 新 editor 路由可用
- state-aware 基本心智成立
- 前端边界模型明确
- 节点输入输出和逐项连线可读
- 节点运行结果可在 editor 内查看
- `hello_world` 可保存、校验、运行
