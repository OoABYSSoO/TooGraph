# GraphiteUI Skill 编写指南

本文说明 GraphiteUI 当前 Skill 包的结构、运行意义和编写约束。它同时面向两类读者：

- 想手工创建或维护 Skill 的用户。
- 后续 `graphiteUI_skill_builder` 模板或技能生成能力，用来判断应该生成哪些文件、哪些内容不该生成。

## 核心心智

Skill 是 GraphiteUI 图运行中的显式能力单元。它不是一个隐藏 Agent，也不应该自己决定图如何继续执行。

一个 LLM 节点使用 Skill 时，职责链路是：

```text
图 state 输入
-> 可选 before_llm.py 补充技能上下文
-> LLM 根据 state、skill.json 和有效 llmInstruction 生成结构化技能参数
-> 可选 after_llm.py 执行、校验或规范化
-> GraphiteUI runtime 根据 outputSchema 和 outputMapping 写入 state
```

因此：

- Skill 脚本只产出 JSON 结果，不直接写图 state。
- state 绑定永远由 GraphiteUI runtime 负责。
- 一个 LLM 节点一次最多使用一个显式能力。
- 如果需要多步工具链，应拆成多个节点和边，而不是让一个 Skill 内部多轮自主调用。

## 文件结构

官方 Skill 位于：

```text
skill/<skill_key>/
```

用户自定义 Skill 位于：

```text
backend/data/skills/user/<skill_key>/
```

推荐的新 Skill 包结构：

```text
skill/<skill_key>/
  skill.json
  SKILL.md
  before_llm.py   # 可选
  after_llm.py    # 可选，确定性执行或校验时使用
```

`before_llm.py` 和 `after_llm.py` 使用固定文件名，不在 `skill.json` 中配置入口。

现有未迁移 Skill 仍可能使用 `runtime.entrypoint` 指向脚本入口，这是过渡期兼容路径。新建 Skill 应优先使用固定生命周期文件。

## `skill.json`

`skill.json` 是机器可读协议。它决定这个 Skill 如何出现在技能目录中、什么时候可被选择、LLM 应该生成什么结构，以及最终会返回什么输出。

推荐结构：

```json
{
  "schemaVersion": "graphite.skill/v1",
  "skillKey": "example_skill",
  "name": "示例技能",
  "description": "当用户需要执行某类明确能力时选择此技能。",
  "llmInstruction": "你已绑定示例技能。根据当前输入生成符合 inputSchema 的结构化参数；不要总结技能结果。",
  "version": "1.0.0",
  "timeoutSeconds": 30,
  "capabilityPolicy": {
    "default": {
      "selectable": true,
      "requiresApproval": false
    },
    "origins": {
      "companion": {
        "selectable": true,
        "requiresApproval": false
      }
    }
  },
  "permissions": [],
  "inputSchema": [
    {
      "key": "result",
      "name": "Result",
      "valueType": "text",
      "required": true,
      "description": "LLM 需要生成的结构化参数。"
    }
  ],
  "outputSchema": [
    {
      "key": "result",
      "name": "Result",
      "valueType": "text",
      "description": "写入下游 state 的最终结果。"
    }
  ]
}
```

字段含义：

- `schemaVersion`：当前使用 `graphite.skill/v1`。
- `skillKey`：稳定机器标识，也用于目录名。只能使用安全的相对标识，不要包含 `/`、`\`、`:`。
- `name`：用户可见名称。
- `description`：什么时候应该选择这个技能。能力选择器会把它作为适用场景说明。
- `llmInstruction`：当 LLM 节点已经绑定该 Skill 后，如何生成技能参数。
- `version`：Skill 包版本。
- `timeoutSeconds`：生命周期脚本执行超时时间。
- `capabilityPolicy`：不同来源是否可以选择该能力，以及是否需要确认。
- `permissions`：声明网络、文件、子进程、浏览器自动化等能力需求。
- `inputSchema`：LLM 需要生成并传给 Skill 的结构化参数。
- `outputSchema`：Skill 最终返回并由 runtime 绑定到 state 的字段。

当前 `inputSchema` 的名字容易误解。它不是“图 state 输入列表”，而是“LLM 要为 Skill 生成的结构化调用参数”。图 state 是否进入上下文由节点 `reads` 决定。

## `SKILL.md`

`SKILL.md` 是给人看的说明文档。它应该帮助用户理解这个 Skill，而不是替代 `skill.json`。

建议包含：

- 这个 Skill 适合什么任务。
- 输入字段含义。
- 输出字段含义。
- 是否会访问网络、读写文件、执行脚本或产生持久 artifact。
- 使用限制和失败情况。
- 如果有 `before_llm.py` 或 `after_llm.py`，说明它们分别做什么。

不要把关键机器协议只写在 `SKILL.md` 中。真正的字段契约必须写进 `skill.json`。

## `before_llm.py`

`before_llm.py` 是 LLM 调用前的可选上下文补充脚本。

适合做：

- 补充当前日期、运行来源或局部环境信息。
- 列出当前启用的候选能力。
- 读取只读目录或配置摘要。
- 生成短小、明确、可审计的提示上下文。

不适合做：

- 写文件。
- 执行命令。
- 下载网页。
- 修改图、记忆、人设或设置。
- 隐藏调用其他能力。

输入来自 stdin，是 JSON 对象，通常包含：

```json
{
  "skill_key": "web_search",
  "graph_state": {}
}
```

输出必须是 JSON 对象。推荐返回：

```json
{
  "context": "Current date: 2026-05-08"
}
```

GraphiteUI 会把 `context` 注入技能入参规划提示词中的 `Skill Pre-LLM Context` 区域。这个上下文应短而准，避免塞入大段日志、完整文件树或无关数据。

## `after_llm.py`

`after_llm.py` 是 LLM 生成结构化技能参数后的可选执行或后处理脚本。

适合做：

- 根据 LLM 生成的 `query` 发起联网搜索。
- 校验 LLM 选择的 capability 是否存在且启用。
- 下载资源并返回 artifact 路径。
- 调用受控本地脚本。
- 把 LLM 输出规范化为 `outputSchema`。

不适合做：

- 自己选择或修改图 state 名称。
- 直接写 GraphiteUI state。
- 私下进行多轮模型调用。
- 绕过权限、启用状态、审计记录或白名单。

输入来自 stdin，是 LLM 生成的结构化技能参数。输出必须是 JSON 对象，字段应与 `outputSchema` 对齐。

最小结构：

```python
from __future__ import annotations

import json
import sys


def main() -> None:
    payload = json.loads(sys.stdin.read() or "{}")
    result = {
        "result": str(payload.get("result") or "")
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

脚本 stdout 必须只输出 JSON 对象。调试信息不要打印到 stdout，否则 runtime 会解析失败。

## 何时需要哪些文件

### 纯 LLM 结构化输出

适合文本改写、分类、提取、格式转换等任务。

推荐：

- `skill.json`
- `SKILL.md`
- 可选 `before_llm.py`
- 通常不需要 `after_llm.py`

当前生成这类 Skill 时，应确保目标运行时支持“LLM 输出直接作为 Skill 输出”的路径。如果运行时还未启用该路径，则先提供一个很薄的 `after_llm.py` 做原样校验和返回。

### 需要动态上下文

适合能力选择、日期敏感查询、读取本地只读目录摘要等任务。

推荐：

- `before_llm.py` 补充上下文。
- `after_llm.py` 只在需要校验或执行时添加。

### 需要确定性执行

适合联网搜索、文件写入、脚本运行、资源下载、结构校验等任务。

推荐：

- 必须提供 `after_llm.py`。
- `permissions` 必须声明需要的能力。
- 输出必须返回 artifact 路径、错误和状态等可审计信息。

## 输出设计原则

`outputSchema` 只放下游节点真正需要读取的内容。

应该输出：

- 任务结果。
- 本地 artifact 路径。
- 来源 URL。
- 错误列表。
- 状态字段。
- 需要人工确认的阻断信息。

不应该随便输出：

- 内部调试日志。
- 过长的原始响应。
- 和下游无关的过程字段。
- runtime 已经能在 run detail 中记录的审计细节。

如果某个字段只用于审计，优先放在运行记录或完整 skill output 中，不一定要做成单独 state。

## 权限和安全

Skill 能力必须显式声明，不靠 prompt 文本约束安全边界。

常见 `permissions`：

- `network`
- `secret_read`
- `browser_automation`
- `file_read`
- `file_write`
- `subprocess`

涉及破坏性、覆盖、运行命令、联网、读取敏感信息、写图或写长期记忆的能力，都应该通过图模板、权限策略或人工确认表达。

不要在 Skill 中：

- 读取 `.env`、`.git` 或受保护设置目录。
- 把密钥写入 state、文档或日志。
- 把大文件或媒体内容 base64 塞入 state。
- 绕过 `local_workspace_executor` 的白名单策略。

## 与图 state 的关系

Skill 不负责决定输出写入哪个 state。

静态绑定时：

```text
skill_result[output_key]
-> skillBindings.outputMapping
-> 目标 state
```

动态 capability 执行时：

```text
skill_result
-> runtime 封装成 result_package
-> 下游 LLM 拆包为虚拟 state
```

这条边界很重要：同一个 Skill 可以在不同图里绑定到不同 state，因此 Skill 包不能硬编码 state 名称。

## 新建 Skill 检查清单

创建或生成 Skill 前，逐项检查：

- `skillKey` 是否稳定、唯一、适合做目录名。
- `description` 是否清楚说明什么时候应该选择它。
- `llmInstruction` 是否只说明如何生成技能参数，而不是让同一节点总结结果。
- `inputSchema` 是否是 LLM 需要生成的结构化参数。
- `outputSchema` 是否只包含下游真正需要的字段。
- `permissions` 是否覆盖所有外部能力。
- 是否真的需要 `before_llm.py`。
- 是否真的需要 `after_llm.py`。
- 如果会写文件或下载资源，是否返回本地路径或 artifact 引用，而不是把大内容塞入 state。
- stdout 是否只输出 JSON 对象。
- 错误是否结构化返回，方便下游判断和修复。
- 是否避免旧字段：`targets`、`executionTargets`、`label`、`agentInstruction`、`runPolicies`、`health`、`configured`、`healthy`、`kind`、`mode`、`scope`。

## 给 Skill Builder 模板的方针

后续生成 Skill 的模板应遵守：

1. 先由图模板澄清需求、确认示例输入输出和权限边界。
2. Skill Builder 只负责产出 Skill 包文件内容，不负责写入、测试、安装、启用、回滚。
3. 生成内容至少包含 `skill.json` 和 `SKILL.md`。
4. 只有需要 LLM 前置上下文时才生成 `before_llm.py`。
5. 只有需要确定性执行、校验或规范化时才生成 `after_llm.py`。
6. 写入用户目录、运行 smoke test、读取错误并再次修复，应由后续图节点和受控能力完成。
7. 每次修复都应重新生成完整文件内容，而不是让 Skill Builder 输出不透明补丁。

这个边界可以防止 Skill Builder 再次膨胀成安装器、测试器、修复器和权限执行器的混合体。
