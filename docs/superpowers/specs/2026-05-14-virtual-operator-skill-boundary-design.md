# Virtual Operator Skill Boundary Design

状态：已认可的设计方向。

日期：2026-05-14。

## 目标

TooGraph 的伙伴需要能通过可见的虚拟鼠标和虚拟键盘操作页面。成熟目标不是移动系统鼠标，也不是让 LLM 通过截图视觉理解页面，而是让伙伴读取结构化页面内容和操作书，输出语义命令，再由 TooGraph 内建运行时把命令映射成可见、可审计、可恢复的页面操作。

第一阶段成功标准：

- 用户用自然语言要求伙伴切换到某个页签。
- 伙伴读取当前页面路径对应的页面操作书。
- LLM 只输出一条语义命令，例如点击“历史”页签。
- TooGraph 激活伙伴自己的虚拟鼠标，移动、点击并触发真实页面逻辑。
- 运行返回下一页路径、操作日志和成功或失败结果。

## 非目标

- 不把每个底层动作拆成独立 Skill，例如 `move_mouse`、`click`、`double_click`、`type_text`。
- 不让 `after_llm.py` 直接计算 DOM 坐标、播放鼠标动画或维护伙伴形象状态。
- 不把 DOM 点击作为图修改的唯一真实来源。
- 不让伙伴操作自己的形象、伙伴浮窗、伙伴页面或调试入口。
- 不通过截图或 LLM 视觉能力理解当前页面。

## 推荐架构

采用一个页面操作 Skill、一套应用内 Virtual Operator Runtime，以及一个可循环的页面操作子图。

```text
before_llm.py
  -> 读取运行时页面上下文
  -> 返回页面结构化内容、可操作对象和操作说明

LLM
  -> 输出一条语义命令
  -> 例如 { action: "click", target: { kind: "tab", label: "历史" } }

after_llm.py
  -> 校验命令和操作权限
  -> 调用 Virtual Operator Runtime 执行
  -> 返回 ok、next_page_path、journal、cursor_session_id

Virtual Operator Runtime
  -> 解析 affordance
  -> 调用 Virtual Input Driver
  -> 播放虚拟鼠标、点击、拖拽、键入和等待
  -> 通过页面原有 action adapter 触发业务逻辑
  -> 记录 operation journal 和 activity_events
```

`after_llm.py` 是单次 Skill 调用的执行收口，但不拥有虚拟鼠标动画细节。它的职责更像门卫和调度员：确认 LLM 选择的命令合法，然后把命令交给运行时。

## 为什么不把虚拟鼠标移动写进 `after_llm.py`

虚拟鼠标移动依赖浏览器页面状态、真实 DOM layout、affordance bounds、伙伴形象位置、虚拟鼠标会话、动画参数和可中断状态。这些信息属于前端和 TooGraph 应用运行时，不属于 Python Skill 生命周期脚本。

如果把移动逻辑写进 `after_llm.py`，会产生几个问题：

- 复用差：未来图编辑、Buddy 页面操作、设置页操作都会复制一套鼠标控制逻辑。
- 审计分裂：Skill 可能只知道自己“请求点击”，前端才知道实际移动和点击，日志容易对不上。
- 状态困难：Python 脚本很难可靠管理当前虚拟鼠标位置、动画中断、用户接管和伙伴追随。
- 架构越界：Skill 应该是一次受控能力调用，不应该变成隐藏的多步 UI 自动化引擎。

因此，`after_llm.py` 可以发起执行请求和等待结果，但具体移动、点击、键入、等待和失败恢复由 Virtual Operator Runtime 承担。

## 备选方案

### 方案 A：所有操作都写在 `after_llm.py`

优点是最容易理解，Skill 输入什么就直接执行什么。

缺点是很快会和前端状态、动画、审计、权限、会话生命周期纠缠在一起。它不适合长期路线。

### 方案 B：`after_llm.py` 只返回 operation request，前端异步执行

优点是前端能自然处理虚拟鼠标和 DOM 事件。

缺点是图运行本身不一定能同步拿到执行结果，容易出现“图已经结束，但页面还在操作”的割裂。除非运行时有明确的等待和回传协议，否则不适合作为成熟形态。

### 方案 C：`after_llm.py` 调用运行时 Virtual Operator 服务

这是推荐方案。`after_llm.py` 保持 Skill 生命周期的单次执行语义，同时把真实页面操作委托给 TooGraph 运行时。运行时负责和当前前端页面会话通信、等待完成、回填结果和审计。

## 操作会话

虚拟鼠标不应该每执行一个动作就自动回到伙伴头顶。是否回收鼠标应该由操作会话决定。

建议参数：

```json
{
  "cursor_session_id": "optional-session-id",
  "cursor_lifecycle": "keep | return_after_step | return_at_end"
}
```

规则：

- 单步页签切换可以使用 `return_after_step`。
- 连续图编辑应使用 `keep`，让鼠标在多次 Skill 调用之间保持激活。
- 子图或操作链完成时，再用 `return_at_end` 统一回收鼠标。
- 用户点击伙伴形象时，应立即停止当前操作会话、关闭虚拟鼠标并恢复伙伴可交互状态。

## 页面操作 Skill

建议官方 Skill 名称为 `toograph_page_operator`。

输入：

- `user_goal`：用户目标或当前子目标。
- `cursor_session_id`：可选，延续已有虚拟鼠标会话。
- `cursor_lifecycle`：本步操作后的鼠标生命周期策略。

运行时上下文：

- `page_path`：当前页面路径。
- `page_context`：当前页面结构化内容摘要，伙伴页面、伙伴浮窗、伙伴形象和调试入口应过滤。

`before_llm.py`：

- 根据运行时页面上下文读取页面操作书。
- 返回结构化页面内容、可操作对象、禁止区域和操作说明。
- 不返回裸坐标作为 LLM 决策依据。

LLM 输出：

- 一条语义命令。
- 不输出 DOM selector。
- 不输出低层鼠标轨迹。
- 不改写 output mapping。

`after_llm.py`：

- 校验命令是否在页面操作书允许范围内。
- 校验目标 affordance 是否存在、可见、启用、未被禁止。
- 调用 Virtual Operator Runtime。
- 返回结构化结果。

输出：

```json
{
  "ok": true,
  "next_page_path": "/buddy/history",
  "cursor_session_id": "cursor-session-1",
  "journal": [
    {
      "kind": "click",
      "target_id": "buddy.tab.history",
      "status": "succeeded"
    }
  ],
  "error": null
}
```

## 页面操作子图

建议建立一个可复用子图 `buddy_operate_current_page`：

```text
input: page_path, user_goal
  -> toograph_page_operator
  -> 判断 ok / task_done / needs_next_operation / failed
  -> 需要继续时回到 page_operator
  -> 完成时清理 cursor session
  -> output: final page_path, operation journal
```

它负责多步智能，而不是让一个 Skill 自己循环。这样符合 TooGraph 的 graph-first 架构：一个 LLM 节点做一轮判断，一个 Skill 做一次受控执行，多步行为由图表达。

## Virtual Operator Runtime

运行时负责连接 Skill 执行和页面真实操作。

职责：

- 维护当前可操作页面会话。
- 把语义命令映射到 affordance。
- 读取 affordance 当前 bounds 和状态。
- 控制 Virtual Input Driver 播放移动、点击、拖拽、键入和等待。
- 调用页面或编辑器已有 action adapter。
- 写入 operation journal 和低层 `activity_events`。
- 把结果返回给 `after_llm.py`。

Virtual Input Driver 是运行时内部能力，不是 Skill。它可以有底层动作词表，但这些动作不直接暴露为 LLM 可自由调用的一组 Skill。

## 审计与失败处理

每次操作至少记录：

- run id、node id、skill key。
- LLM 输出的语义命令。
- 解析后的 affordance id、label、role 和动作。
- 虚拟鼠标是否激活、是否延续会话、是否回收。
- 操作前后页面路径。
- 操作前后关键状态。
- 成功、失败、取消或用户接管结果。

失败时返回结构化错误：

```json
{
  "ok": false,
  "next_page_path": "/buddy",
  "error": {
    "code": "target_not_enabled",
    "message": "历史页签当前不可点击",
    "recoverable": true
  }
}
```

图编辑类操作还应追加 graph diff、validator 结果、revision id 和 undo/redo 线索。

## 第一阶段实现边界

第一阶段只做页面页签点击闭环：

- 建立页面操作书读取路径。
- 支持当前页面的页签 affordance。
- 支持 LLM 输出 `click_tab` 或等价语义命令。
- `after_llm.py` 调用运行时执行。
- 虚拟鼠标可见移动并触发真实页签切换。
- 返回 `next_page_path` 和 journal。

不在第一阶段做：

- 图节点创建、拖拽连线和运行。
- 跨页面复杂流程。
- 人工审批。
- 完整 graph revision。
- 视觉截图理解。

## 验证策略

最小验证集：

- Skill 单元测试：给定页面操作书和 LLM 命令，校验 `after_llm.py` 拒绝非法目标、接受合法页签命令。
- Runtime 测试：给定 affordance，Virtual Operator 能产生 journal 并返回下一页路径。
- 浏览器视觉检查：启用伙伴虚拟鼠标后，页签切换时鼠标可见移动、点击、回收或保持会话。
- 审计检查：运行详情中能看到伙伴选择的命令、目标、动作结果和路径变化。

## 设计决策

本设计选择方案 C：`after_llm.py` 调用运行时 Virtual Operator 服务。它保留 Skill 的单步能力边界，也让虚拟鼠标和页面真实操作留在最适合它们的位置。
