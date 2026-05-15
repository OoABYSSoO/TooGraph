# Mature Page Operation System Design

状态：已认可的成熟版一期设计。

日期：2026-05-15。

关联文档：`docs/superpowers/specs/2026-05-14-virtual-operator-skill-boundary-design.md`。本文档细化成熟版一期的页面操作系统；旧文档中的 Skill 边界和 Virtual Operator Runtime 方向继续有效。

## 目标

TooGraph 伙伴需要能像人类一样操作网页，但不移动系统鼠标，也不依赖 LLM 视觉截图理解页面。成熟版一期的目标是建立一套通用页面操作系统：

- 前端从当前真实页面生成结构化页面快照和页面操作书。
- 页面操作书只暴露允许伙伴操作的目标，过滤伙伴页面、伙伴浮窗、伙伴形象和调试入口。
- LLM 根据用户目标和页面操作书输出语义命令，不输出 DOM selector、坐标或鼠标轨迹。
- `toograph_page_operator` 校验语义命令，把合法请求交给 Virtual Operator Runtime。
- Virtual Operator Runtime 控制伙伴自己的虚拟鼠标和虚拟键盘，触发真实页面事件。
- 运行详情能审计伙伴选择了什么、实际点击或输入了什么、结果是否成功。

第一阶段完成标准：

- 用户说“打开运行历史”或“切到某个已注册页签/按钮”时，伙伴能从页面操作书选择目标。
- 虚拟鼠标可见飞到目标、点击目标、触发真实页面逻辑。
- 对普通输入框，伙伴能通过虚拟键盘输入短文本并触发对应输入事件。
- Buddy 自身界面、伙伴形象、调试面板和 Buddy 导航目标不会出现在可操作目标里。
- 每次操作都有结构化 journal 和 `activity_events`。

## 非目标

- 不在成熟版一期实现画布拖拽建图、节点连线、节点布局和图运行编辑。
- 不把底层 `move_mouse`、`click`、`type_text` 拆成 LLM 可自由选择的一组 Skill。
- 不把 DOM 点击作为图修改或持久副作用的唯一真实来源。
- 不让 LLM 根据裸 CSS selector、XPath、坐标或截图做决策。
- 不让 `after_llm.py` 播放鼠标动画、计算目标坐标或维护伙伴形象状态。
- 不自动暴露页面上所有 DOM 控件；必须经过注册或安全过滤。

## 推荐路线

采用“注册式 Affordance Registry + 保守自动发现补充”。

核心控件必须显式注册。前端组件使用稳定的 affordance id 标记可操作对象，并提供 role、label、动作类型、禁用状态、输入类型和安全区域。运行时扫描注册表，生成页面操作书。

保守自动发现只作为补充。它可以发现白名单区域内的普通按钮、链接、页签和输入框，但默认不会暴露 Buddy 自身区域、调试控件、隐藏元素、禁用元素、危险操作或缺少可读标签的控件。

这条路线比纯静态操作书更不容易过期，也比全 DOM 自动扫描更可控。LLM 看到的是语义目标，不是页面实现细节。

## 架构

```text
Frontend Affordance Registry
  -> 收集当前页面可操作目标
  -> 过滤 Buddy 自身和禁止区域
  -> 生成 Page Snapshot

Page Operation Book
  -> 把 snapshot 压缩成 LLM 可读上下文
  -> 暴露 action、target_id、label、role、状态和限制

toograph_page_operator before_llm.py
  -> 从运行时上下文读取 page snapshot / operation book
  -> 返回 Skill Pre-LLM Context

LLM
  -> 读取 graph state 的 user_goal
  -> 读取 Skill Pre-LLM Context
  -> 输出一条命令或短序列语义命令

toograph_page_operator after_llm.py
  -> 校验命令目标和权限
  -> 发送 virtual_ui_operation request
  -> 返回 ok、next_page_path、journal、error

Virtual Operator Runtime
  -> 解析 affordance id
  -> 控制虚拟鼠标和虚拟键盘
  -> dispatch click/input/keyboard/wait
  -> 记录 activity_events 和低层执行结果
```

## Affordance Registry

每个可操作对象使用稳定 id。id 是协议的一部分，不应该依赖 CSS 层级或临时组件结构。

建议描述结构：

```json
{
  "id": "app.nav.runs",
  "label": "运行历史",
  "role": "navigation-link",
  "zone": "app-shell",
  "actions": ["click"],
  "enabled": true,
  "visible": true,
  "current": false,
  "pathAfterClick": "/runs",
  "safety": {
    "selfSurface": false,
    "requiresConfirmation": false,
    "destructive": false
  }
}
```

输入框示例：

```json
{
  "id": "settings.modelProviders.local.baseUrl",
  "label": "本地网关地址",
  "role": "textbox",
  "zone": "settings",
  "actions": ["focus", "type", "clear", "press"],
  "enabled": true,
  "visible": true,
  "input": {
    "kind": "text",
    "maxLength": 300,
    "valuePreview": "http://127.0.0.1:8888/v1"
  },
  "safety": {
    "selfSurface": false,
    "requiresConfirmation": false,
    "destructive": false
  }
}
```

禁止规则：

- `zone` 为 `buddy-widget`、`buddy-page`、`buddy-avatar`、`buddy-debug` 的目标不进入操作书。
- `safety.selfSurface` 为 true 的目标不进入操作书。
- `visible=false` 或 `enabled=false` 的目标可以进入只读摘要，但不能作为可执行目标。
- `destructive=true` 或 `requiresConfirmation=true` 的目标在成熟版一期只允许返回“需要确认”，不自动执行。

## 页面操作书

页面操作书是给 LLM 的精简上下文，不是 DOM dump。

建议结构：

```json
{
  "page": {
    "path": "/editor",
    "title": "图编辑器",
    "snapshot_id": "page-snapshot-20260515-001"
  },
  "allowed_operations": [
    {
      "target_id": "app.nav.runs",
      "label": "运行历史",
      "role": "navigation-link",
      "commands": ["click app.nav.runs"],
      "result_hint": {"path": "/runs"}
    }
  ],
  "inputs": [
    {
      "target_id": "settings.modelProviders.local.baseUrl",
      "label": "本地网关地址",
      "commands": [
        "click settings.modelProviders.local.baseUrl",
        "clear settings.modelProviders.local.baseUrl",
        "type settings.modelProviders.local.baseUrl <text>"
      ]
    }
  ],
  "forbidden": [
    "伙伴页面、伙伴浮窗、伙伴形象、伙伴调试入口不可由伙伴自己操作"
  ]
}
```

LLM 不需要知道 bounds。bounds 只在执行时由前端运行时读取。

## Skill 契约

`toograph_page_operator` 保持一个 Skill，一次调用执行一条命令或一个短序列。短序列只允许在同一页面快照上连续执行，不允许根据中间结果分支；如果动作会切换页面或需要观察结果，应由图流程再次调用 Skill。

推荐 `llmOutputSchema`：

- `commands`: JSON 数组。每项包含 `action`、`target_id`、可选 `text`、可选 `key`、可选 `option`。
- `cursor_lifecycle`: `keep`、`return_after_step` 或 `return_at_end`。
- `reason`: 简短说明选择该操作的原因，用于审计。

命令示例：

```json
{
  "commands": [
    {"action": "click", "target_id": "app.nav.runs"}
  ],
  "cursor_lifecycle": "return_after_step",
  "reason": "用户要求打开运行历史"
}
```

输入示例：

```json
{
  "commands": [
    {"action": "click", "target_id": "settings.modelProviders.local.baseUrl"},
    {"action": "clear", "target_id": "settings.modelProviders.local.baseUrl"},
    {"action": "type", "target_id": "settings.modelProviders.local.baseUrl", "text": "http://127.0.0.1:8888/v1"}
  ],
  "cursor_lifecycle": "keep",
  "reason": "用户要求修改本地网关地址"
}
```

`stateInputSchema` 只保留真正需要来自图 state 的 `user_goal`。当前页面路径、页面快照和可操作目标由运行时上下文提供给 `before_llm.py`。

## 运行时上下文

成熟版应把当前页面快照放进 `runtime_context.skill_runtime_context`，供 `before_llm.py` 使用：

```json
{
  "page_path": "/editor",
  "page_snapshot": {
    "snapshot_id": "page-snapshot-20260515-001",
    "affordances": []
  },
  "page_operation_book": {}
}
```

Buddy 图里的 `page_context` state 仍然保留，用于普通对话和请求理解；但页面操作 Skill 的 `before_llm.py` 不应依赖解析这个 Markdown state。这样可以保持“图 state 给 LLM 阅读，运行时上下文给 Skill 补充环境”的边界。

## Virtual Operator Runtime

运行时负责真实操作，不由 LLM 或 Python 生命周期脚本直接操作 DOM。

职责：

- 接收 `virtual_ui_operation` 请求。
- 根据 `target_id` 查找当前页面 affordance。
- 操作前确认目标仍然存在、可见、启用且未被禁止。
- 计算目标 bounds 和虚拟鼠标落点。
- 播放虚拟鼠标移动、点击、键入、按键和等待动画。
- dispatch 真实 DOM 事件或调用页面已有 action adapter。
- 操作后读取结果路径、目标状态和失败原因。
- 记录 journal 和 activity_events。

支持动作：

- `click`: 飞到目标并点击。
- `focus`: 飞到目标并聚焦。
- `clear`: 聚焦后清空文本。
- `type`: 通过虚拟键盘输入文本。
- `press`: 发送键盘按键，例如 Enter 或 Escape。
- `wait`: 等待路径、目标出现、目标消失或短固定时间。

## 审计

每次 Skill 调用记录：

- run id、node id、skill key。
- 页面 snapshot id 和操作前路径。
- LLM 输出的 commands、cursor_lifecycle、reason。
- 每个 command 解析后的 affordance id、label、role、zone。
- 虚拟鼠标是否启用、是否用户接管、是否回收。
- 每个低层动作的状态、耗时、错误。
- 操作后路径和 next_page_path。

journal 示例：

```json
[
  {
    "command_index": 0,
    "action": "click",
    "target_id": "app.nav.runs",
    "target_label": "运行历史",
    "status": "succeeded",
    "path_before": "/editor",
    "path_after": "/runs",
    "duration_ms": 620
  }
]
```

## 失败处理

`after_llm.py` 和运行时统一返回结构化错误。

常见错误码：

- `forbidden_self_surface`: 目标属于伙伴自身区域。
- `target_not_found`: 当前页面没有这个 affordance。
- `target_not_visible`: 目标存在但不可见。
- `target_disabled`: 目标不可操作。
- `unsupported_action`: 目标不支持该动作。
- `stale_snapshot`: LLM 使用的 snapshot 已过期。
- `user_takeover`: 用户拖走虚拟鼠标或点击伙伴，中止当前操作。
- `timeout`: 操作或等待超时。
- `route_mismatch`: 操作后路径和预期不一致。

失败结果示例：

```json
{
  "ok": false,
  "next_page_path": "/editor",
  "journal": [],
  "error": {
    "code": "target_disabled",
    "message": "目标当前不可点击",
    "recoverable": true
  }
}
```

## 用户接管和伙伴自身限制

用户可以用真实鼠标拖走伙伴虚拟鼠标。接管后：

- 当前 Virtual Operator command 标记为 `user_takeover`。
- 如果用户继续拖动虚拟鼠标，伙伴可以自然追随，但不应继续执行原命令。
- 用户点击伙伴形象时，立即关闭虚拟鼠标、停止当前页面操作动画、清理操作会话。

伙伴不可以操作：

- 伙伴形象。
- 伙伴浮窗。
- 伙伴页面。
- 伙伴调试面板。
- Buddy 导航目标。

这些限制既在页面快照生成阶段过滤，也在 `after_llm.py` 和前端执行阶段二次校验。

## 一期实施范围

成熟版一期应覆盖：

- 应用导航链接。
- 普通页签。
- 普通按钮。
- 菜单项。
- 文本输入框。
- 简单等待。
- 单条命令和同页短序列。
- 可见虚拟鼠标和虚拟键盘执行。
- 操作 journal 和 run activity 审计。

暂不覆盖：

- 画布拖拽。
- 节点连线。
- 多页面自动任务规划。
- 危险操作自动确认。
- 文件写入、图修改和持久副作用。

## 测试策略

后端测试：

- Skill manifest 契约测试：`stateInputSchema`、`llmOutputSchema`、`stateOutputSchema` 符合成熟版字段。
- `before_llm.py` 测试：给定 runtime page snapshot，返回过滤后的页面操作书。
- `after_llm.py` 测试：接受合法命令，拒绝 Buddy 自身目标、未知目标、禁用目标和不支持动作。
- 运行时审计测试：Skill result 包含 journal 和 `virtual_ui_operation` activity event。

前端测试：

- Affordance Registry 单元测试：注册、自动发现、过滤、状态读取。
- Page Operation Book 测试：页面快照能生成稳定、简短、无 Buddy 自身内容的操作书。
- Virtual Operator Runtime 测试：click、focus、clear、type、press、wait 生成正确 DOM 事件和 journal。
- BuddyWidget 结构测试：只处理允许的 `virtual_ui_operation`，不接受 Buddy 自身 target。
- Playwright 视觉检查：虚拟鼠标可见移动到目标，点击后页面状态变化，输入框能看到键入结果。

## 迁移策略

当前最小版本只支持 `click_nav runs`。成熟版一期迁移时把公开 Skill 契约切换到 `commands` 数组，不继续把旧的顶层 `action` / `target` 作为正式协议。

```json
{"action": "click_nav", "target": "runs"}
```

新协议表达为：

```json
{
  "commands": [
    {"action": "click", "target_id": "app.nav.runs"}
  ],
  "cursor_lifecycle": "return_after_step",
  "reason": "legacy click_nav runs"
}
```

现有测试、页面操作书、LLM 指令、审计日志和前端运行时都迁移到 `commands` 协议。为了避免协议长期分叉，旧字段不保留为新的文档化能力。

## 设计决策

成熟版一期选择“注册式 Affordance Registry + 保守自动发现补充”。这个方案让伙伴知道页面内容和可操作目标，但不依赖视觉截图、不接触 selector 和坐标，也不会操作自己的页面或形象。多步智能仍由图流程表达，Skill 只执行一次受控页面操作或一个同页短序列。
