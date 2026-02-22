# Skill 产品命名、分类与桌宠使用边界

## 背景

GraphiteUI 后续会同时出现两类 AI 使用者：

- 图里的 Agent 节点：服务于某次 graph 运行，强调输入输出、可复现、运行记录和 artifacts。
- 全局桌宠 Agent：服务于整个工作台体验，强调陪伴、解释、建议、规划、图编辑协作和长期上下文。

这两类 Agent 都需要能力扩展，但它们的使用范围、风险和用户心智不同。一个网页抓取能力可以被 Agent 节点用于运行，也可以被桌宠用来查资料；一个“女娲.skill”式的认知框架可能更适合给桌宠提供思考风格；一个“同事.skill”式的工作经验包则涉及隐私、授权和人格模拟边界。

问题是：这些东西是否都应该叫 Skill，还是需要引入新概念？

## 产品判断

建议继续使用 **Skill / 技能** 作为统一主概念，不额外发明一个全新的顶层名称。

理由：

1. 用户已经能把 Skill 理解为“可安装、可复用的能力”。
2. Agent 节点 Skill、桌宠 Skill、workflow Skill、profile Skill 的共同点大于差异：它们都是可管理、可授权、可诊断、可被 AI 使用的能力包。
3. 如果把桌宠使用的能力改叫 Persona、Plugin、Extension 或 Capability，用户会以为这是另一套系统，管理、安装、权限和诊断也会被迫割裂。
4. 真正需要解决的不是“换名字”，而是“分层分类是否清楚”。

推荐产品定义：

> Skill 是 GraphiteUI 中可安装、可管理、可授权、可诊断、可被 Agent 使用的能力包。它可以服务于某个 Agent 节点，也可以服务于全局桌宠 Agent。

## 命名体系

面向用户，保留一个主词：

```text
Skill / 技能
```

在产品界面和文档中使用二级分类：

```text
Skill
  Agent Skill       给图里的 Agent 节点使用
  Companion Skill   给全局桌宠 Agent 使用
  Shared Skill      两者都可使用
```

从能力形态上再分：

```text
Skill
  Atomic Skill      原子执行能力
  Workflow Skill    多步骤流程能力
  Tool Skill        模型可按需调用的工具
  Context Skill     规则、说明、模板注入
  Profile Skill     认知画像、工作方式、表达风格
  Adapter Skill     外部 API、本地命令或私有服务适配
  Control Skill     批处理、重试、路由、map-reduce 等流程控制
```

开发文档中可以使用 `Skill Package` 作为安装单位，但用户界面不需要强推“能力包”这个词：

```text
用户看到：Skill / 技能
工程定义：Skill Package / 技能包
集合配置：Skill Loadout / 技能配置组
```

## 不推荐的替代词

### Plugin

太像系统扩展或前后端插件。用户会预期它能改 UI、扩展路由、安装依赖，边界比 Skill 更大。

### Tool

太窄。Tool 更像函数调用，覆盖不了女娲.skill、同事.skill、品牌语气、输出规范、认知框架这类能力。

### Persona

太偏角色和人格，只能覆盖 Profile Skill，覆盖不了网页抓取、OCR、视频拆帧、数据提取。

### Capability

语义准确，但产品感弱，中文“能力”也容易和权限、模型能力、节点能力混淆。

### Module / Extension

太工程化，且容易让用户以为这是开发者插件系统，而不是 Agent 可使用的能力系统。

## 核心字段

建议原生 `skill.json` 中用三个字段解决大部分混乱：

```json
{
  "targets": ["agent_node", "companion"],
  "kind": "workflow",
  "mode": "workflow",
  "scope": "graph"
}
```

### targets

表示这个 Skill 可以被谁使用：

- `agent_node`：可被图中的 Agent 节点引用。
- `companion`：可被全局桌宠 Agent 使用。

### kind

表示这个 Skill 是什么能力形态：

- `atomic`
- `workflow`
- `tool`
- `context`
- `profile`
- `adapter`
- `control`

### mode

表示运行方式：

- `workflow`：GraphiteUI Runtime 按定义流程执行。
- `tool`：模型在执行过程中按需调用。
- `context`：只注入说明、规则、模板或画像。

### scope

表示影响范围：

- `node`：只影响某个 Agent 节点。
- `graph`：影响当前 graph。
- `workspace`：影响当前工作台。
- `global`：影响全局桌宠体验。

## Agent 节点 Skill 与 Companion Skill 的区别

### Agent 节点 Skill

Agent 节点 Skill 是 graph 运行能力。

它应该强调：

- 输入输出清晰。
- 可复现。
- 可被 graph 校验。
- 可记录到 Run Detail。
- 可生成 artifacts。
- 权限随本次 graph 运行生效。
- 失败时能定位到节点和步骤。

适合：

- 网页抓取。
- 图片理解。
- 视频拆帧和理解。
- OCR。
- 结构化提取。
- 文档处理。
- 知识库检索。

### Companion Skill

Companion Skill 是全局桌宠能力。

它应该强调：

- 工作台级上下文理解。
- 解释当前图。
- 提醒潜在问题。
- 规划节点和连线。
- 生成图草案。
- 在用户授权后调用 GraphCommandBus。
- 长期偏好和工作方式。

适合：

- 女娲.skill 这类认知顾问。
- 同事.skill 这类工作经验包。
- GraphiteUI 使用教练。
- 图规划顾问。
- 项目协作规范。
- 产品/代码审查框架。

## Companion Skill Loadout

桌宠不应该默认拥有所有 Skill。它应该有自己的技能配置组：

```text
Companion Skill Loadout
  当前启用的 Profile Skill
  当前启用的 Tool Skill
  当前启用的 Workflow Skill
  可读上下文范围
  可执行命令范围
  主动建议开关
  图编辑权限开关
```

用户在桌宠设置中应该能看到：

- 当前启用了哪些 Skill。
- 这些 Skill 会影响什么页面或工作流。
- 哪些 Skill 能联网。
- 哪些 Skill 能读取当前 graph。
- 哪些 Skill 能调用模型。
- 哪些 Skill 能建议编辑。
- 哪些 Skill 能执行编辑命令。

桌宠的默认状态应是低权限：

- 可以解释当前图。
- 可以提出建议。
- 不能默认修改 graph。
- 不能默认联网。
- 不能默认读取本地敏感文件。
- 不能默认使用人物/同事画像影响所有回答。

## 同事.skill 与女娲.skill 的产品归类

### 女娲.skill

女娲.skill 更接近 `Profile Skill` 或 `Context Skill`。

它的价值是把公开材料里的认知框架、表达 DNA、决策启发式、反模式和诚实边界提炼成可调用入口。

在 GraphiteUI 中适合：

- 桌宠思维顾问。
- 图规划顾问。
- 产品决策顾问。
- 代码审查顾问。
- Agent 节点的 context 规则。

建议默认限制：

- 默认不拥有执行权限。
- 默认不联网。
- 默认不编辑 graph。
- 必须声明来源和边界。
- 必须避免假装本人。

### 同事.skill

同事.skill 更接近 `Profile Skill + Knowledge Skill + Workflow Skill` 的组合。

它可能包含：

- 某个人的工作流程。
- 项目经验。
- 代码习惯。
- 沟通方式。
- 决策路径。
- 文档和消息中提取的知识。

这类 Skill 风险更高，因为它可能涉及隐私、公司资料、内部文档和人格模拟。

在 GraphiteUI 中应默认进入更严格的治理路径：

- 必须显示资料来源和授权状态。
- 必须声明“这是资料蒸馏出的工作助手，不是本人”。
- 不允许伪装成真实同事本人。
- 不允许默认进入全局记忆。
- 不允许默认对外输出内部资料。
- 需要区分工作能力层和表达画像层。
- 如果用于公司内部，应支持管理员策略和审计。

## 统一系统，不同入口

GraphiteUI 不需要为 Agent 节点和桌宠建立两套 Skill 系统。应该是同一个 Skill Package 系统，不同入口消费：

```text
Skill Package
  install / enable / disable / diagnose / version
        |
        +-- Agent Node Binding
        |     - node scope
        |     - graph validation
        |     - run artifacts
        |
        +-- Companion Loadout
              - workspace/global scope
              - conversation behavior
              - GraphCommandBus permission
```

这能避免：

- 同一个 Skill 重复安装。
- 权限系统重复实现。
- 诊断逻辑重复。
- 管理页面割裂。
- 用户搞不清“技能库”和“桌宠能力库”的关系。

## 管理页面产品形态

Skill 管理页可以保留“技能库”作为主入口，但增加更明确的视图：

```text
技能库
  全部技能
  Agent 技能
  桌宠技能
  共享技能
  需要处理
```

每个 Skill 详情中展示：

- 适用范围：Agent 节点 / 桌宠 / 两者。
- 技能类型：workflow / atomic / tool / context / profile / adapter / control。
- 运行模式：workflow / tool / context。
- 影响范围：node / graph / workspace / global。
- 权限：联网、读文件、写文件、编辑图、调用模型、读取密钥。
- 使用位置：哪些 Agent 节点、哪些桌宠 loadout。
- 风险提示：人物画像、内部资料、外部联网、执行脚本。
- 健康状态：依赖、配置、入口、权限、最近测试。

Agent 节点里只展示适用 `agent_node` 的 Skill。桌宠设置里只展示适用 `companion` 的 Skill。

## 权限设计

Skill 权限不能只按 Skill 本身授权，还要按使用目标授权。

同一个 Skill 在 Agent 节点和桌宠中可能拥有不同权限：

```json
{
  "skillKey": "web_fetch",
  "targets": ["agent_node", "companion"],
  "permissions": {
    "agent_node": ["network"],
    "companion": ["network"],
    "requiresConfirmation": {
      "companion": true
    }
  }
}
```

桌宠因为是全局长期存在的助理，权限默认应比 Agent 节点更保守。尤其是：

- `canEditGraph`
- `canReadWorkspace`
- `canUseNetwork`
- `canCallModel`
- `canReadSecrets`
- `canPersistMemory`

都应该有显式开关。

## 产品体验原则

### 一个主词，多个维度

用户只需要记住 Skill。其余信息用标签、筛选、详情解释，不引入新的顶层概念。

### 安装不等于可用

导入成功只是安装。还需要配置、启用、权限确认和健康检查。

### 适用范围必须可见

用户必须一眼看出某个 Skill 是给 Agent 节点用、给桌宠用，还是两者都能用。

### 权限必须靠近使用场景

不要只在安装时展示权限。Agent 节点绑定 Skill、桌宠启用 Skill、执行图编辑命令时，都要展示相关权限。

### 人物画像必须有边界

Profile Skill 不能鼓励伪装真实人物。产品文案应该强调“基于资料提炼的思考框架”，不是“本人复活”。

### 工作流能力要可解释

Workflow Skill 的每一步都应该能在运行记录或桌宠行动日志里看到。

## 对 GraphiteUI 的推荐结论

1. 继续把所有可安装能力统称为 Skill。
2. 不造新的顶层名词。
3. 用 `targets` 区分 Agent 节点和桌宠。
4. 用 `kind` 区分能力形态。
5. 用 `mode` 区分运行方式。
6. 用 `scope` 区分影响范围。
7. 桌宠使用 `Companion Skill Loadout` 管理启用 Skill。
8. 同事.skill、女娲.skill 这类能力归类为 `Profile Skill`，默认低权限、强边界、可审计。
9. Agent 节点 Skill 强调运行、输入输出、artifacts 和 graph 校验。
10. Companion Skill 强调建议、解释、规划、用户确认和 GraphCommandBus 权限。

最终产品心智：

> GraphiteUI 只有一个技能系统，但有不同的使用对象。Agent 节点把 Skill 当作可复现的运行能力；桌宠 Agent 把 Skill 当作可授权的协作能力。用户不用学习新名词，但能清楚看到每个 Skill 会影响哪里、能做什么、有什么风险。
