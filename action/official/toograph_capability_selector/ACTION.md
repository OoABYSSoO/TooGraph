---
name: TooGraph 能力选择器
description: 判断当前 LLM 节点可见上下文是否还需要调用能力，并从启用目录中选择一个 Action、Subgraph、Tool 或 none。
---

# TooGraph 能力选择器

本 Action 让一个 LLM 节点根据当前可见图状态和当前启用能力目录，判断下一步是否还需要调用动态能力。它只负责选择和校验，不执行被选中的能力。

## State 输入提示

- `current_requirement`：可选提示，表示当前这一步希望能力选择器完成的目标。
- `agent_loop_control`：可选循环预算状态，供选择器了解当前循环次数和能力调用预算。
- 这些字段只是给用户看的连接建议，不是强制输入槽。未显式连接时，选择器仍会读取本 LLM 节点普通连接进来的所有 state。
- 上一轮 `result_package`、`capability_review`、`task_plan` 或其它上下文应作为普通 state 连接到 LLM 节点，由节点说明决定如何使用。

## Pre-LLM 上下文

- `before_llm.py` 会发现当前启用的 Action 包、当前启用且可被能力选择发现的图模板，以及当前可用的 Tool 包。
- 能力目录会作为只读上下文注入到 Action LLM 输出规划提示词中。
- 能力目录按 `Subgraphs`、`Actions`、`Tools` 分区；分区决定 LLM 应输出的 `kind`。
- 每个目录条目包含 `key`、使用场景 `description`、通用 selection metadata 和紧凑历史反馈。
- 通用 selection metadata 包括 `granularity`、`covers`、`produces`、`taskTags`。
- 历史反馈包括使用次数、成功率和近期失败数。
- 目录内部为每个能力生成标准权限画像 `permissionTier` / `permissionProfile`，用于权限策略过滤和排序；LLM 上下文仍保持紧凑，不直接展开权限清单。
- 当运行时上下文提供 `capability_permission_policy.allowed_permission_tiers` 或 `blocked_permission_tiers` 时，目录会过滤不符合当前权限策略的能力。
- 上下文不包含名称、输入输出 schema、source 路径、运行来源或实现细节。
- `toograph_capability_selector` 自身不会作为可选能力出现在目录中，避免选择器递归选择自己。

## LLM 输出

- `needs_capability`：当前下一步仍需要调用一个已启用、可发现的动态能力时为 `true`；当前上下文足够回复或没有合适能力时为 `false`。
- `capability`：单个对象，`kind` 只能是 `action`、`subgraph`、`tool` 或 `none`。
- 当当前状态已经足够回复用户、上一轮结果包可用、或没有必要继续调用能力时，输出 `{"kind":"none"}`。
- 多个能力都能完成需求时，选择优先级是 `subgraph` > `action` > `tool`。
- 当 `kind` 是 `action`、`subgraph` 或 `tool` 时，`key` 必须完全匹配目录中列出的能力。
- 当没有合适能力时，输出 `{"kind":"none"}`，不需要 `reason`。

## After-LLM 行为

- `after_llm.py` 只校验 LLM 选择的 `kind:key` 是否当前启用且可发现。
- 校验通过时，使用目录中的元数据规范化返回的能力对象。
- 当运行时上下文提供权限策略时，`after_llm.py` 会拒绝不符合策略的能力，并在 `capability.reason` 中说明原因。
- 当 LLM 显式选择 `none` 时，返回 `{"kind":"none"}` 和 `needs_capability=false`。
- 当 LLM 选择未知、禁用、不可发现、不支持或选择器自身时，返回带错误 `reason` 的 `kind=none` 和 `needs_capability=false`。
- `after_llm.py` 不根据关键词自行选择能力，也不执行被选中的能力。

## State 输出

- `needs_capability`：只有下一步仍需要调用一个已启用、可发现的 `action`、`subgraph` 或 `tool` 时才为 `true`；模板应使用这个输出驱动循环条件。
- `capability`：校验后的单个动态能力对象。
