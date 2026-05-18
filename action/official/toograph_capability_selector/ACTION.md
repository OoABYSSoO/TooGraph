---
name: TooGraph 能力选择器
description: 从当前启用的 TooGraph 能力目录中选择一个 Action、Subgraph、Tool 或 none。
---

# TooGraph 能力选择器

本 Action 让一个 LLM 节点根据用户本轮需求选择一个动态能力。它只负责选择和校验，不执行被选中的能力。

## State 输入

- `requirement`：用户本轮需要完成的目标或请求。

## Pre-LLM 上下文

- `before_llm.py` 会发现当前启用的 Action 包、当前启用且可被能力选择发现的图模板，以及当前可用的 Tool 包。
- 能力目录会作为只读上下文注入到 Action LLM 输出规划提示词中。
- 能力目录按 `Subgraphs`、`Actions`、`Tools` 分区；分区决定 LLM 应输出的 `kind`。
- 每个目录条目只包含 `key` 和使用场景 `description`。
- 上下文不包含名称、输入输出 schema、权限、source 路径、统计、运行来源或实现细节。
- `toograph_capability_selector` 自身不会作为可选能力出现在目录中，避免选择器递归选择自己。

## LLM 输出

- `capability`：单个对象，`kind` 只能是 `action`、`subgraph`、`tool` 或 `none`。
- 当 `kind` 是 `action`、`subgraph` 或 `tool` 时，`key` 必须完全匹配目录中列出的能力。
- 当没有合适能力时，输出 `kind=none`，并包含简短 `reason`。

## After-LLM 行为

- `after_llm.py` 只校验 LLM 选择的 `kind:key` 是否当前启用且可发现。
- 校验通过时，使用目录中的元数据规范化返回的能力对象。
- 当 LLM 选择未知、禁用、不可发现、不支持或选择器自身时，返回 `kind=none` 和 `found=false`。
- `after_llm.py` 不根据关键词自行选择能力，也不执行被选中的能力。

## State 输出

- `capability`：校验后的单个动态能力对象。
- `found`：只有选中的 `action`、`subgraph` 或 `tool` 存在于当前启用目录时才为 `true`。
