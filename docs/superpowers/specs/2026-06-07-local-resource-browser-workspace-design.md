# 本地资源浏览器与工作区设计

日期：2026-06-07

## 背景

TooGraph 的知识库导入、Input 节点文件输入、Buddy 本地工作区能力和未来的本地资料处理，都需要同一种底层能力：让用户在应用内选择本机文件或文件夹，并把选择结果作为可审计的路径 state 传入图模板。

浏览器原生的 `webkitdirectory` 会把文件对象上传给后端。它适合远端 Web 应用，但不适合本地 TooGraph：本地应用的后端已经可以读取本机路径，前端不应该把海量文件通过浏览器重新上传一遍。TooGraph 应转向“后端列目录，前端选择路径，图中传递路径包”的形态。

## 目标

- 提供一个可复用的本地资源浏览器，用于选择本机文件夹、文件或文件集合。
- 让知识库导入只传文件夹路径或选择包，不再依赖浏览器上传整个文件夹。
- 引入应用级工作区，让 TooGraph 像 Codex 一样围绕一个可信本地根目录运行。
- 让 Input 节点、知识库页面、Tool 参数和未来能力共享同一套文件选择 state。
- 保持文件访问可见、可审计、可逆，不把隐式文件扫描藏在前端或后端特殊逻辑里。

## 非目标

- 不把本地文件内容塞进 graph state、prompt 或浏览器请求体。
- 不把知识库导入做成知识库页面私有的文件选择特殊逻辑。
- 不在本轮设计中实现远端云盘、同步盘授权或网络文件下载。
- 不让工作区自动授予写入、执行或高风险操作权限；工作区只定义可浏览、可选择的根。

## 推荐形态

系统分三层：

1. Local Resource API

   后端负责列目录、读取文件元信息、校验路径、复制文件夹，并把文件选择包规范化。

2. Local Resource Browser

   前端可复用组件，提供类似 Windows 文件浏览器的面包屑和列表视图，也提供类似 macOS Finder 的列视图。它只选择路径，不上传内容。

3. Workspace System

   保存用户登记的可信本地根目录。首次使用时可以选择一个目录作为工作区；之后本地浏览默认从工作区开始，并把工作区作为路径安全策略的主要 read root。

## 数据协议

本地文件夹 state 使用 `local_folder` 包：

```json
{
  "kind": "local_folder",
  "root": "C:\\Users\\abyss\\Documents\\policy",
  "selection_mode": "all",
  "selected": []
}
```

只选部分文件或子目录时：

```json
{
  "kind": "local_folder",
  "root": "C:\\Users\\abyss\\Documents\\policy",
  "selection_mode": "selected",
  "selected": [
    "2024/a.md",
    "2025/reports"
  ]
}
```

规则：

- `root` 是后端可解析的本机路径，通常位于某个工作区内。
- `selected` 永远是相对 `root` 的路径，不允许绝对路径和 `..`。
- `selection_mode=all` 表示处理整个 `root`，此时 `selected` 为空。
- `selection_mode=selected` 表示只处理 `selected` 列出的文件或目录。
- state 可以被 Input 节点、Tool 节点、Action 输入规划和知识库入库图复用。

## 后端 API

现有 `/api/local-input-sources/folder?path=...` 是起点，但它当前递归返回整棵树。正式浏览器需要拆成“按目录列出”的 API，避免打开大目录时一次性扫描海量文件。

建议 API：

```text
GET /api/local-resources/roots
GET /api/local-resources/entries?path=...
GET /api/local-resources/metadata?path=...
POST /api/local-resources/validate-selection
```

返回目录内容：

```json
{
  "path": "C:\\Users\\abyss\\Documents",
  "parent": "C:\\Users\\abyss",
  "breadcrumbs": [
    { "label": "C:", "path": "C:\\" },
    { "label": "Users", "path": "C:\\Users" },
    { "label": "abyss", "path": "C:\\Users\\abyss" },
    { "label": "Documents", "path": "C:\\Users\\abyss\\Documents" }
  ],
  "entries": [
    {
      "name": "policy",
      "path": "C:\\Users\\abyss\\Documents\\policy",
      "kind": "directory",
      "size": null,
      "modified_at": "2026-06-07T10:00:00Z",
      "selectable": true
    }
  ],
  "denied": false,
  "truncated": false
}
```

原则：

- 后端只返回当前目录的一页或有限数量条目。
- 递归扫描只发生在明确入库、预览统计或 Tool 运行阶段。
- 隐藏目录、危险目录和被拒绝路径返回清晰错误，不静默吞掉。
- 保留现有 `local_input_sources` 能力，但逐步升级为新 API 的实现基础。

## 工作区系统

工作区记录建议存储在本地设置或 SQLite：

```json
{
  "workspace_id": "workspace_abc123",
  "name": "TooGraph",
  "root_path": "C:\\Users\\abyss\\TooGraph",
  "created_at": "2026-06-07T10:00:00Z",
  "last_opened_at": "2026-06-07T10:00:00Z",
  "trusted": true
}
```

工作区职责：

- 作为本地资源浏览器的默认根。
- 作为 `local_folder` 和本地文件 state 的默认 read root。
- 给 Buddy、知识库、Input 节点、Tool 提供共同的本地上下文。
- 未来可以支持最近工作区、切换工作区、工作区权限和工作区内检索。

工作区不代表自动允许写文件或执行命令。写入、执行、删除等高风险行为仍必须走 Action、权限、审计和 revision 路径。

## 前端组件

新增可复用组件可以称为 `LocalResourceBrowser`。

TooGraph 侧边栏新增一个稳定页面“本地文件”。这个页面是本地资源浏览器的第一入口，负责浏览当前工作区和已登记 read roots，也用于验证目录浏览 API、路径选择包和视觉布局。知识库页面、Input 节点和 Tool 参数页后续复用同一个组件，而不是各自实现自己的文件选择器。

主要区域：

- 顶部：路径输入、刷新按钮、面包屑。
- 左侧：工作区、最近路径、常用位置。
- 中间：Windows 风格列表，支持文件夹、文件、大小、修改时间、类型。
- 右侧或切换模式：macOS Finder 风格列视图，用于逐级进入文件夹。
- 底部：当前选择摘要、选择整个文件夹、只选择勾选项、确认和取消。

选择模式：

- 选择单个文件夹。
- 选择多个文件。
- 选择文件夹内部分文件或子目录。
- 只浏览，不选择，用于查看目录结构。

这个组件被知识库页面、Input 节点编辑器、调度任务参数页和未来文件型 Tool 参数复用。

## 知识库导入

知识库页面使用本地资源浏览器选择一个文件夹或选择包。

流程：

```text
选择工作区或本机路径
-> 本地资源浏览器返回 local_folder 选择包
-> 知识库 API 校验路径
-> 后端复制到 knowledge/<collection_id>/source
-> 生成 managed local_folder 包
-> 启动知识库入库图
-> normalizer 遍历 managed source
-> chunk
-> 写入 embedding jobs
```

知识库拥有自己的托管副本。因此导入完成后，原始路径下的文件被删除，不影响已经复制进知识库的数据。重新导入或刷新时才需要重新读取原路径或新的选择包。

当前 `/api/knowledge/imports/uploaded-folder` 属于临时路径，应被移除或保留为非默认 fallback；默认 UI 不再使用浏览器上传文件夹。

## Input 节点

Input 节点的 file/folder 边界应使用同一套本地资源浏览器。

当 Input 节点输出文件夹时：

- 全选整个文件夹：传出 `selection_mode=all` 和 root。
- 只勾选部分文件：传出 `selection_mode=selected` 和相对路径列表。
- UI 预览最多显示 5 行，更多内容用数量摘要和省略提示。

LLM 节点读取这类 state 时，继续走共享的 file-state prompt expansion。不要添加仅供 LLM 使用的隐藏 context assembly 节点。

## 安全与权限

- 默认只允许浏览工作区和明确登记的 read roots。
- 不允许选择 `.git`、`.worktrees`、`node_modules`、`backend/data/settings`、`.env` 等敏感或运行时目录。
- 路径必须在后端解析和校验，前端只负责展示。
- 所有文件选择包都要保持可检查，不允许把绝对路径列表无限扩展进图 state。
- 大文件、二进制文件和不可解析文件应在 normalizer 或 Tool 报告中体现，而不是让选择器提前假装它们可处理。

## 实施顺序

1. 将现有 `local_input_sources` 升级为非递归目录浏览 API，并保留递归列目录给 normalizer 使用。
2. 增加工作区存储与 API：列出、创建/登记、切换当前工作区。
3. 在侧边栏新增“本地文件”页面，承载第一版本地资源浏览器。
4. 建立 `LocalResourceBrowser` 前端组件，先支持列表视图和面包屑。
5. 把知识库页面从浏览器上传文件夹改为使用本地资源浏览器选择路径包。
6. 把 Input 节点的 file/folder 选择接入同一组件。
7. 增加 Finder 三列视图作为同组件的第二显示模式。
8. 移除或隐藏上传文件夹 fallback，保持知识库导入默认走本机路径。

## 验证

后端：

- 路径解析不能越过工作区。
- 大目录只列当前层，不递归爆炸。
- 被拒绝目录返回明确错误。
- 知识库导入复制的是后端路径，不读取 multipart 文件。
- `local_folder` 选择包能被 normalizer 正确处理。

前端：

- 选择整个文件夹时只传 root。
- 选择部分文件时只传相对路径列表。
- 面包屑、路径输入、刷新和错误状态清晰。
- 侧边栏有稳定的“本地文件”入口，路由和高亮状态正确。
- 知识库页面不再包含 `webkitdirectory` 主路径。
- Input 节点和知识库页面使用同一组件。

视觉：

- 列表视图保持 TooGraph 当前玻璃质感和紧凑信息密度。
- 面包屑和文件列表在窄屏不溢出。
- 三列视图不作为第一阶段必须项，但预留组件状态和 API 支撑。
