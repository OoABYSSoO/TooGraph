# Node Source Of Truth Strategy

## 1. Purpose

本文档用于整理当前关于“节点唯一源定义”的讨论结论。

它回答的不是具体实现细节，而是方向问题：

- GraphiteUI 未来新增节点时，开发者希望改几个地方
- 节点定义应当放在什么地方
- `JSON` 单源与 `Python` 单源各自的优缺点是什么
- 为什么这个问题必须先定清楚，再继续推进节点系统

当前结论仍处于**讨论收敛阶段**，不是最终拍板后的强制规范。

---

## 2. Current Goal

当前目标不是简单做一个“能显示节点”的前端，而是：

**让 GraphiteUI 成为一个能够可视化编排 LangGraph 能力的工作流框架。**

这意味着节点系统最终需要同时承接：

- editor 节点渲染
- inspector 配置
- state 读写映射
- graph 编译
- runtime handler 派发
- skill / tool 下沉后的能力调用
- template 对节点类型的引用

因此，节点“定义源”必须足够强，能支撑前后端共同消费。

---

## 3. User Requirement

当前最重要的用户诉求是：

**新增一个节点时，希望像 ComfyUI 自定义节点那样，尽量只修改一个地方。**

用户不希望：

- 改多个重复定义文件
- 同时手动维护前端节点 schema 和后端节点 schema
- 每新增一个节点就去改多处注册表和组件分支

用户真正关心的不是格式本身，而是开发体验：

- 一个唯一源
- 其他层自动派生
- 尽可能接近 ComfyUI 的接入方式

---

## 4. What ComfyUI Actually Does

拿 ComfyUI 做参照时，需要注意：

- 开发者通常只需要新增一个 Python 自定义节点文件
- 后端会扫描自定义节点模块
- 节点类中的声明会被转成前端可消费的定义
- 前端主要依据后端导出的节点定义自动渲染

所以 ComfyUI 的核心不是“没有定义”，而是：

**Python 节点模块本身就是唯一源。**

这点很重要，因为它说明：

- ComfyUI 不是“完全没有 schema”
- 它是把 schema 和实现都放进了 Python 单源里

---

## 5. The Real Design Question

GraphiteUI 现在要回答的真正问题不是：

- 到底用 `json` 还是 `.py`

而是：

**唯一源定义应该放在哪一层，才能同时支撑 editor、compiler、runtime 和模板系统。**

这会直接影响后续：

- 节点目录结构
- registry 设计
- 前端如何加载节点定义
- 后端如何绑定 handler
- skill/tool 如何被节点消费

---

## 6. Option A: JSON As Single Source

### 6.1 Idea

以 `JSON/YAML` 作为唯一源定义。

它负责声明：

- node meta
- inputs / outputs / widgets
- inspector fields
- runtime mapping
- handler key
- 默认参数
- editor UI 规则

前端和后端都从同一份 JSON 读取节点定义。

### 6.2 Strengths

- 前后端都容易消费
- 前端按 schema 自动渲染最自然
- 模板、节点库、配置管理更方便
- 更适合做 registry、市场、模板导入导出
- 节点定义天然可序列化

### 6.3 Weaknesses

它并不能自动消灭执行实现。

如果一个节点只是“声明式装配”，那 JSON 可以描述。

但如果节点包含：

- 复杂业务逻辑
- 条件判断
- 文件系统副作用
- 外部网络交互
- skill/tool 的复杂调度

那么仍然需要 Python 实现层。

所以：

**JSON 可以作为唯一定义源，但不能自动代替所有执行代码。**

### 6.4 Missing Infrastructure

如果要让很多节点真的只靠 JSON 接入，还缺这些基础设施：

1. 通用 skill 调用执行器
2. 机器可读的 skill schema
3. 条件路由 DSL
4. artifact 持久化 DSL
5. prompt/template DSL
6. 从 JSON 编译到 LangGraph 的完整编译器
7. 后端节点定义 loader
8. 前端从后端拉取定义的接口

换句话说：

JSON 单源不是不能做，而是要先把“声明式 runtime”做强。

---

## 7. Option B: Python As Single Source

### 7.1 Idea

以 `Python` 节点模块作为唯一源定义。

一个节点文件同时声明：

- 节点 schema
- editor schema
- runtime mapping
- handler 实现

后端扫描这些 Python 节点模块，并自动导出前端所需的节点定义。

### 7.2 Strengths

- 开发体验最接近 ComfyUI
- 新增节点时更容易做到“只写一个 `.py` 文件”
- 定义和执行实现不会分离
- 对复杂节点更友好

### 7.3 Weaknesses

- editor 配置会逐渐进入 Python 声明
- 前端需要依赖后端导出的节点 schema
- 节点协议如果设计不好，Python 节点类会越来越臃肿
- 不如 JSON 方案那样天然适合模板系统和配置管理

---

## 8. Why Python May Fit Better Right Now

结合当前项目阶段，Python 单源更接近当前真正想要的开发体验。

原因是：

1. 用户明确偏好 ComfyUI 式接入方式
2. 当前项目的很多节点能力仍然不是纯声明式
3. `demo/slg_langgraph_single_file_modified_v2.py` 里的许多节点本质上带明显程序逻辑
4. skill/tool 体系还没有完全 schema 化
5. 如果强推 JSON 单源，短期会先被 runtime DSL 缺口拖住

因此在当前阶段，Python 单源会更现实。

---

## 9. Why JSON Still Remains Valuable

即便最终选择 Python 单源，也不代表 JSON 思路没有价值。

JSON 仍然很重要，因为它代表了一种目标能力：

- 节点定义可序列化
- editor 可以自动消费
- 模板系统可以稳定引用
- 前后端不需要手写重复 schema

所以更准确地说：

- `JSON` 更像“理想的声明式协议形态”
- `Python` 更像“当前最像 ComfyUI 的开发体验形态”

---

## 10. Important Distinction

必须区分两个概念：

### 10.1 Definition

定义回答的是：

- 节点长什么样
- 输入输出是什么
- 读写什么 state
- 用什么 handler key
- inspector 怎么生成

### 10.2 Implementation

实现回答的是：

- 节点到底怎么执行
- 具体调用哪个 skill/tool
- 如何处理副作用
- 如何与外部系统交互

即使未来只保留一个“定义源”，也不代表所有实现都能由定义自动生成。

这是讨论里需要持续保持清晰的边界。

---

## 11. Current Working Conclusion

当前阶段的工作性结论是：

### 11.1 对“唯一源”的判断

- 应该只有一个唯一源定义
- 不应该出现前端一份、后端一份、文档再一份的重复维护

### 11.2 对“ComfyUI 式体验”的判断

如果优先级是：

**“新增节点尽量只写一个地方”**

那么当前更接近目标的方向是：

**Python 单源，前端 schema 由后端自动派生。**

### 11.3 对“JSON 方案”的判断

如果优先级是：

**“节点系统高度声明式、前后端共享统一 schema、模板系统天然兼容”**

那么更适合的方向是：

**JSON 单源 + 强 runtime DSL。**

但这条路当前还缺不少基础设施。

---

## 12. Demo Alignment

从 demo 文件看：

[slg_langgraph_single_file_modified_v2.py](/home/abyss/GraphiteUI/demo/slg_langgraph_single_file_modified_v2.py)

GraphiteUI 未来不是要“导入这个 demo 直接运行”，而是要承接它表达的能力：

- `PipelineState`
- 节点函数
- 条件路由
- state 读写
- artifact 输出
- skill/tool 能力编排

因此，demo 仍然应该作为：

- 模板样板
- 节点拆分参考
- 能力校准参考

而不是框架运行时直接依赖的模块。

---

## 13. Questions Still Open

当前还没有完全拍板的关键问题包括：

1. 节点唯一源最终是 `Python` 还是 `JSON`
2. skill 是否要先补充 schema，再推进声明式节点
3. 条件分支是否要进入节点 DSL
4. artifact 产物写出是否做成通用 executor
5. 示例节点最终应该以 `.py`、`.json` 还是“双样板但单源”方式存在

这些问题需要继续讨论后再进入正式实施。

---

## 14. Immediate Recommendation

在正式大改之前，建议先做三件事：

1. 继续把“唯一源”问题讨论定清楚
2. 明确 skill/tool schema 是否要成为前置条件
3. 再决定节点系统走：
   - Python 单源
   - JSON 单源
   - 或者“Python 单源优先，后续再导出标准 schema”

当前不建议在这个问题没有收敛前，贸然把节点系统大规模迁移到某一种单源方案。
