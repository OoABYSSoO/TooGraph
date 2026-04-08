# GraphiteUI Acceptance Runbook

## 1. 文档目的

这份文档用于基于当前最新实现执行本地验收、演示前检查与交接说明。

当前验收重点已经从“最小骨架能不能启动”升级为：

- 标准 graph 协议是否可用
- editor 是否能完成 state 驱动编排
- creative factory 模板是否能跑通
- run detail 与产物是否可回看

补充说明：

- 当前 editor 在点击 `Run` 后会拉取一次 run detail，但尚未实现持续轮询
- 当前模板注册表中实际只有一个模板：`creative_factory`

---

## 2. 启动准备

默认开发端口：

- 前端：`3477`
- 后端：`8765`

推荐启动方式：

```bash
./scripts/dev_up.sh
```

也可以手动启动：

```bash
make backend-install
make frontend-install
make backend-dev
make frontend-dev
```

健康检查：

```bash
make backend-health
```

访问地址：

```bash
http://127.0.0.1:3477
http://127.0.0.1:8765
```

---

## 3. 推荐验收入口

当前最推荐直接使用标准模板入口：

- `http://127.0.0.1:3477/editor/creative-factory`

这个入口已经预置：

- `theme_config`
- `state_schema`
- creative factory 标准节点链
- condition 路由
- 图片 / 视频 TODO 产物链

---

## 4. 基础环境验收

### AC-ENV-1 前端可启动

验证：

1. 运行 `./scripts/dev_up.sh`
2. 打开 `http://127.0.0.1:3477`

通过标准：

- 首页可访问
- 左侧导航正常
- 默认语言为中文

### AC-ENV-2 后端可启动

验证：

1. 访问 `http://127.0.0.1:8765/health`

通过标准：

- 返回 `{"status":"ok"}`

### AC-ENV-3 本地数据目录可用

检查目录：

- `backend/data/graphs/`
- `backend/data/kb/`
- `backend/data/memories/`
- `backend/data/runs/`

通过标准：

- 目录存在
- 运行时不会因目录缺失报错

---

## 5. Editor 标准协议验收

### AC-GRAPH-1 / AC-GRAPH-2 / AC-GRAPH-3

验证：

1. 打开 `http://127.0.0.1:3477/editor/creative-factory`
2. 检查左侧 `State Panel`
3. 选中任意节点，检查右侧 `Inputs / Outputs / Structured Params`
4. 点击 `Validate Graph`
5. 点击 `Save Graph`
6. 保存后确认路由切换到真实 `/editor/{graphId}`
7. 刷新页面，确认 graph 能从后端重新加载

通过标准：

- 校验通过
- graph 能保存
- graph 刷新后仍可读取

---

## 6. 编排交互验收

### AC-FE-3 / AC-FE-4 / AC-FE-5

检查：

- 左侧存在 `State Panel`
- 节点为自定义卡片而不是默认方块
- 节点左侧为输入、右侧为输出
- 可新增节点
- 可拖拽节点
- 可连线
- 选中节点后可以勾选 `reads / writes`

附加检查：

- 在节点右侧的 `Inputs` 或 `Outputs` 区域输入新 key，点击 `+ Add`
- 新 state key 应自动加入全局 `State Panel`
- 同时绑定到当前节点

通过标准：

- 编排与 state 编辑联动正常

---

## 7. Theme 与模板验收

验证：

1. 在 `creative-factory` 编辑器顶部修改：
   - `Domain`
   - `Genre`
   - `Market`
   - `Platform`
   - `Language`
   - `Creative Style`
   - `Tone`
2. 点击 `Save Graph`
3. 点击 `Run Graph`
4. 打开对应 run detail

通过标准：

- `theme_config` 可保存
- run detail 的 `artifacts.theme_config` 中能看到主题配置

---

## 8. Runtime 验收

### AC-RUNTIME-1 标准模板可运行

验证：

1. 在 `creative-factory` 页面点击 `Run Graph`
2. 等待 editor 更新当前 run
3. 打开 `/runs/{runId}`

通过标准：

- 返回 `run_id`
- run 状态为 `completed` 或 `failed`
- 画布节点状态发生变化

当前实现说明：

- 当前节点状态会在运行后更新一次
- 若要看到持续变化，需要后续补 editor 轮询

### AC-RUNTIME-2 条件路由

验证：

1. 选中 `Condition` 节点
2. 检查其分支边是否存在：
   - `pass`
   - `revise`
   - `fail`
3. 运行 graph

通过标准：

- graph 可以通过 condition 路由完成收束或回修

备注：

- 当前标准 runtime 要求普通节点只有一个主后继
- 如需分支，必须使用 `condition` 节点

### AC-RUNTIME-3 / AC-RUNTIME-4 / AC-RUNTIME-5

验证：

1. 打开 run detail
2. 检查：
   - `current_node_id`
   - `node_status_map`
   - `evaluation_result`
   - `final_result`
   - `artifacts`
3. 在 editor 中点击已执行节点，查看 `Latest Execution`

通过标准：

- node execution 至少包含：
  - `node_id`
  - `node_type`
  - `status`
  - `duration_ms`
  - `input_summary`
  - `output_summary`

---

## 9. Creative Factory 全链路验收

当前标准 creative factory 主链应覆盖：

`start -> research -> collect_assets -> normalize_assets -> select_assets -> analyze_assets -> extract_patterns -> build_brief -> generate_variants -> generate_storyboards -> generate_video_prompts -> review_variants -> condition -> prepare_image_todo -> prepare_video_todo -> finalize -> end`

验证：

1. 打开 `creative-factory`
2. 直接运行
3. 打开 run detail
4. 检查 artifacts 中是否存在：
   - `creative_brief`
   - `best_variant`
   - `storyboard_packages`
   - `video_prompt_packages`
   - `image_generation_todo`
   - `video_generation_todo`
   - `final_package`

通过标准：

- 上述字段存在
- `best_variant` 非空
- `final_package` 非空

---

## 10. 页面联通验收

检查：

- `/workspace`
- `/runs`
- `/runs/[runId]`
- `/knowledge`
- `/memories`
- `/settings`

通过标准：

- 页面都可访问
- 数据源来自真实后端接口

---

## 11. 当前未完成项提示

当前仍未完全补齐的体验项：

- Runs 搜索与筛选
- Knowledge / Memories 搜索与详情
- 持续轮询与更强调试体验
- 更完整的 edge bus 表达

所以这份 runbook 的目标是验证“标准主链可用”，而不是验证所有增强项都已经完成。
