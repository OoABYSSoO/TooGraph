# 结构化输出与 Function Calling 待办

TooGraph 的产品主协议仍是 `node_system`、`state_schema`、Action、Subgraph 和 graph run。Provider 原生 structured output、JSON Schema、tool/function calling 只应作为模型调用适配层，用来提高单个 LLM 节点写 state 的稳定性，不能绕过 Action registry、权限、审批和审计。

当前代码已经有 `structured_output_schema` 参数、OpenAI-compatible `response_format` / Codex Responses text format 适配、provider 拒绝后的 fallback 和运行时校验基础。本文只记录后续还要补齐的部分。

## 待做

### Provider 能力矩阵

- 为每个 Provider 记录是否支持 JSON Schema、strict schema、tool calling、parallel tool calls、streaming structured output 和 fallback 行为。
- 在 Model Providers 页面展示结构化输出能力，避免用户误以为所有本地网关都支持同一协议。
- 在运行记录中记录实际策略：native JSON Schema、tool schema、prompt validation、repair retry 或 fallback。

### Function/Tool Calling 适配层

- 增加 provider 级 tool/function schema 归一化，把 TooGraph 的 LLM 输出 schema 转成对应 provider 的工具调用格式。
- Tool/function calling 只服务“结构化输出约束”，不直接执行 TooGraph Action；Action 执行仍由图运行时在结构化参数通过校验后触发。
- 禁止模型通过 provider tool call 名称绕过 `config.actionKey`、`capability` state、权限模式或 human review。
- 对不支持 tool calling 的本地模型继续使用 JSON Schema prompt fallback。

### Repair Retry

- 对 JSON parse 失败、schema validation 失败、缺字段、错类型和业务约束失败建立统一 repair prompt。
- Repair retry 必须有最大次数、错误路径、原始输出、修复输出和最终状态。
- repair 后仍失败时，节点应输出可审计错误，不应静默给下游一个半结构化对象。

### 审计与运行详情

- 运行详情展示 schema、provider 策略、原始模型文本、解析结果、validation errors、repair 次数和 fallback 原因。
- 对 Action 输入规划、动态 capability 输入规划和普通 LLM state 写入使用同一套审计字段。
- 模型日志页只展示必要摘要和可展开原文，避免长 JSON 把 UI 撑爆。

### 测试覆盖

- Provider client 单元测试覆盖 native schema、provider 拒绝、fallback、repair 和 streaming。
- Runtime 测试覆盖 LLM 节点按 `state_schema` 写 state、Action 入参规划、动态 `result_package` 写入和错误回传。
- 为至少一个本地 OpenAI-compatible 网关保留手动验证说明，但不要把本机网关配置写进启动环境变量文档。

## 非目标

- 不把 function calling 升级为 TooGraph 的主协议。
- 不允许 provider tool call 直接执行文件写入、联网、图编辑、记忆写入或脚本运行。
- 不为旧图协议恢复 `config.skills`、绑定推断或 prompt-only 隐式工具调用。
