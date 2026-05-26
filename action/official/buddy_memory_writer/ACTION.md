# 伙伴结构化记忆写入器

该 Action 只写入 `memory_entries`，用于 Buddy 召回系统的 FTS/embedding 检索。

它不负责更新 `MEMORY.md`、`SOUL.md`、`USER.md`、profile 或 policy。稳定长期上下文文件仍由 Buddy Home 写入器处理。

允许命令：

- `memory_entry.create`
- `memory_entry.update`
- `memory_entry.archive`

每条命令都会通过 Buddy command 路径执行，并保留 command record 与 memory revision。
