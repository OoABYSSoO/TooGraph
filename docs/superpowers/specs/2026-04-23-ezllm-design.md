# EZLLM 设计说明

日期：2026-04-23

## 1. 背景

当前仓库中的本地 LM 相关能力主要分散在以下脚本中：

- `scripts/lm_core0.py`
- `scripts/lm-server`
- `scripts/download_Gemma_gguf.py`

这批脚本已经具备可用功能，但存在几个明显问题：

- 与 GraphiteUI 主仓库耦合过深，不适合作为独立工具演进
- 存在明显的 Linux 宿主机假设与个人机器路径
- CLI、运行时、日志页、provider 切换、模型路径配置混杂在一起
- systemd 与 shell 习惯成为事实上的主入口，不利于跨平台

本设计的目标是把这部分能力独立成一个新的 Git 仓库 `EZLLM`，作为一个可复用的跨平台本地模型运行时与 CLI 工具，同时保持现有核心功能，尤其是保持 `/logs` 页面与相关接口的行为基本不变。

## 2. 已确认决策

- 新仓库名：`EZLLM`
- 仓库定位：独立的跨平台本地模型运行时与 CLI，GraphiteUI 只是其消费者之一
- 技术栈：继续使用 Python，优先保证稳定和迁移成本可控
- 第一版范围：`运行时 + CLI`
- 兼容性约束：`/logs` 页面与 `/api/logs` 的行为按近乎完全兼容处理
- 端口策略：默认报错退出，仅在显式 `--force` 时才接管非 EZLLM 进程占用的端口
- Linux service 集成：作为可选扩展，不作为跨平台主路径

## 3. 目标

### 3.1 核心目标

1. 将本地 LM runtime 从 GraphiteUI 主仓库独立为单独仓库与远端
2. 在 Windows / macOS / Linux 上提供统一 CLI 与统一运行时能力
3. 保持当前本地代理、provider 切换、日志查看、健康检查等核心功能
4. 保持 `/logs`、`/api/logs`、`/healthz`、`/runtime-config` 的兼容行为
5. 让 GraphiteUI 通过外部 runtime 地址消费 EZLLM，而不是继续依赖内部脚本

### 3.2 非目标

- 第一版不追求单文件二进制发布
- 第一版不重做日志页面
- 第一版不引入 GUI 安装器
- 第一版不要求三端系统服务能力完全等价

## 4. 总体架构

EZLLM 采用四层结构：

1. `runtime core`
   - 负责本地模型进程拉起、状态维护、健康检查、provider 路由、端口与进程管理
2. `compat http layer`
   - 暴露兼容接口，包括 `/logs`、`/api/logs`、`/healthz`、`/runtime-config`
3. `cli layer`
   - 提供统一跨平台命令入口，如 `start`、`stop`、`restart`、`status`
4. `platform adapters`
   - 下沉 Windows / Linux / macOS 的进程、端口、日志 tail、服务注册差异

关键原则：

- runtime core 不知道 GraphiteUI
- GraphiteUI 只消费 HTTP 接口与配置
- `/logs` 视为冻结兼容面，不作为常规 UI 重写对象
- Linux 特有逻辑不进入跨平台主路径

## 5. 推荐目录结构

```text
EZLLM/
├── pyproject.toml
├── README.md
├── src/
│   └── ezllm/
│       ├── cli.py
│       ├── config/
│       ├── runtime/
│       ├── providers/
│       ├── proxy/
│       ├── logs/
│       ├── compat/
│       ├── platform/
│       └── models/
├── scripts/
├── tests/
└── assets/
```

模块职责如下：

- `config/`：配置模型、默认值、环境变量覆盖、profile 加载
- `runtime/`：进程拉起、停止、状态文件、端口检测、健康探针
- `providers/`：provider 定义与切换逻辑
- `proxy/`：HTTP 应用、路由、转发、流式响应整理
- `logs/`：日志读写与主日志存储
- `compat/`：旧接口契约与日志页兼容挂载
- `platform/`：不同系统下的 process / port / service 能力实现
- `models/`：模型下载与本地模型相关辅助逻辑

## 6. 配置模型

EZLLM 使用 `TOML 配置文件 + 环境变量覆盖 + CLI 参数覆盖`。

优先级从低到高：

1. 内置默认值
2. 全局配置文件
3. 指定 profile
4. 环境变量
5. CLI 参数

建议配置分为以下几块：

- `runtime`
  - `host`
  - `proxy_port`
  - `llama_port`
  - `log_dir`
  - `state_dir`
- `llama`
  - `server_bin`
  - `model_path`
  - `mmproj_path`
  - `ctx_size`
  - `n_predict`
  - `parallel`
  - `gpu_layers`
  - `batch_size`
  - `flash_attn`
- `proxy`
  - `local_model_name`
  - `upstream_model_name`
  - `local_model_aliases`
- `providers`
  - `active`
  - 各 provider 的 `api_base` 与凭证环境变量名
- `aliases`
  - `sonnet`
  - `opus`
  - `haiku`
- `logs`
  - `history_file`
  - `retention_days`
  - `max_bytes`

重要要求：

- 不再把 `/home/abyss/...` 这类宿主机路径写成默认值
- `MMPROJ_PATH` 必须改为配置项或可选项，不能继续写死
- 密钥不写入默认配置文件本体

## 7. CLI 设计

CLI 主命令为：

```bash
ezllm
```

第一版命令集：

- `ezllm run`
- `ezllm start`
- `ezllm stop`
- `ezllm restart`
- `ezllm status`
- `ezllm logs`
- `ezllm logs --web`
- `ezllm doctor`
- `ezllm config init`
- `ezllm config path`
- `ezllm config show`
- `ezllm config validate`
- `ezllm provider list`
- `ezllm provider current`
- `ezllm provider use <name>`
- `ezllm service install`（Linux 可选）
- `ezllm service uninstall`（Linux 可选）
- `ezllm service status`（Linux 可选）

兼容策略：

- 可以保留 `lm` 作为兼容别名，但文档与发布主入口统一为 `ezllm`
- 旧 shell 脚本不再是主实现，只能是兼容包装层或迁移辅助

## 8. 跨平台运行时策略

### 8.1 运行模式

- `ezllm run`：前台调试模式
- `ezllm start`：后台运行模式

后台启动统一走 Python CLI 的内部服务入口，不再依赖 shell 技巧。

### 8.2 进程管理

推荐使用 Python 统一管理，并引入 `psutil` 做进程树处理。

- Windows：使用新进程组 / detached 方式启动
- Unix：使用 `start_new_session=True`

停止流程：

1. 读取 PID / state 文件
2. 校验进程归属
3. 尝试优雅终止
4. 超时后强制终止整棵进程树
5. 清理陈旧状态文件

### 8.3 端口策略

- 如果端口被 EZLLM 自己的旧实例占用：允许按 restart 语义接管
- 如果端口被非 EZLLM 进程占用：默认报错退出
- 仅在显式 `--force` 时允许接管非 EZLLM 进程占用的端口

## 9. 状态与日志

建议状态目录包含：

```text
state/
├── runtime.json
├── pids.json
├── lock
└── last-start.json
```

建议日志至少包含：

- `proxy.log`
- `llama.log`
- 当前日志页所依赖的主日志数据文件

内部可以整理实现，但 `/api/logs` 的输出结构必须先保持兼容。

## 10. `/logs` 兼容策略

这是本设计的最高优先级兼容面之一。

必须保持兼容的内容：

- 路由：
  - `/logs`
  - `/api/logs`
- 页面行为：
  - DOM 结构尽量不动
  - 内嵌脚本逻辑尽量不动
  - 查询参数语义不变
  - 返回字段命名不变
  - 分页 / 筛选 / 展示 / 空状态 / 错误状态行为不变

推荐做法：

- 将当前日志页 HTML/JS 提取为兼容资产
- `compat/logs_page.py` 负责原样挂载
- `compat/api_contracts.py` 负责把内部日志结构映射为旧接口格式

原则是“内部可以整理，外部行为不改”。

## 11. GraphiteUI 集成方式

GraphiteUI 改为消费 EZLLM 的外部地址，而不是继续依赖仓库内部脚本。

推荐方式：

- 文档与设置中引导用户安装 EZLLM
- GraphiteUI 通过 `LOCAL_BASE_URL` 或设置页指向 EZLLM
- GraphiteUI 与 EZLLM 通过 HTTP 接口对接，而不是通过共享脚本实现

不推荐：

- 长期将 EZLLM 作为主仓普通子目录维护
- 长期继续让 GraphiteUI 依赖 `scripts/lm_core0.py`
- 一开始就用 submodule 绑定主仓主流程

## 12. 发布方式

第一版推荐：

- GitHub 仓库
- GitHub Releases
- Python 包发布
- 文档主推 `pipx install ezllm`

支持边界分级：

- 一级支持：Windows / macOS / Linux 的核心 CLI 与 runtime
- 二级支持：更完整的 Unix 端口和进程处理
- Linux 专属可选：systemd service 集成

## 13. 迁移计划

### Phase 0：冻结兼容面

- 固定 `/logs`、`/api/logs`、`/healthz`、`/runtime-config` 的行为样本
- 记录日志页与关键接口的 golden data

### Phase 1：建立 EZLLM 仓库骨架

- 建立包结构、CLI 入口、基础文档与配置模型

### Phase 2：迁移兼容核心

- 从 `lm_core0.py` 拆出 runtime、proxy、logs、compat
- 保住 `/logs` 等兼容接口

### Phase 3：补齐跨平台 CLI 与进程管理

- 完成 `start/stop/restart/status/doctor`
- 完成状态文件与 PID 管理

### Phase 4：清理机器专用配置

- 移除 `/home/...` 路径
- 将模型与 provider 改为正式配置驱动

### Phase 5：GraphiteUI 改为外部消费

- 文档、设置、接入说明切换到 EZLLM
- 旧脚本降级为兼容包装层或迁移提示

### Phase 6：完成解耦

- 从 GraphiteUI 主仓移除本地 LM 内核实现
- 保留外部接入说明与必要兼容文档

## 14. 测试策略

必须单独覆盖兼容测试：

- `/logs` HTML 快照测试
- `/api/logs` 返回结构 golden tests
- 使用固定日志样本验证分页、筛选、空结果、错误结果
- 启动后验证：
  - `/healthz`
  - `/runtime-config`
  - `/logs`
  - `/api/logs`

跨平台测试重点：

- Windows / macOS / Linux 的启动、停止、重启、状态、端口冲突、日志读取

## 15. 风险与缓解

### 风险 1：迁移时误改日志页行为

缓解：

- 先冻结兼容面
- 将日志页视为 compat asset
- 以 snapshot/golden test 约束迁移

### 风险 2：跨平台处理碎片化

缓解：

- 使用统一 Python CLI
- 平台差异集中在 `platform/`
- 优先使用 `psutil` 与 Python 原生能力

### 风险 3：GraphiteUI 迁移期双实现并存带来混乱

缓解：

- 通过阶段化迁移控制范围
- 先让新仓稳定，再删除主仓旧内核

## 16. 结论

EZLLM 将作为一个独立的 Python runtime + CLI 仓库落地，优先保证：

1. 跨平台可用
2. 保持当前核心功能
3. 近乎完全兼容 `/logs` 页面行为
4. 与 GraphiteUI 通过外部接口解耦

这是一条以兼容为先、再逐步整理结构的迁移路线，能够在控制风险的前提下，把当前本地 LM 脚本演进为一个真正可复用的独立工具。
