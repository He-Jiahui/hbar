# Claude / Codex 技能转换

在设置 → 技能或扩展与技能的 Skills 列表中打开“导入 Claude／Codex 技能”。选择来源，预览后转换并导入；来源目录留空时，Claude 使用 `CLAUDE_CONFIG_DIR/skills`（默认 `~/.claude/skills`），Codex 使用 `CODEX_HOME/skills`（默认 `~/.codex/skills`）和 `~/.agents/skills`。也可输入 Host 上的其他绝对目录。

导入到当前 Host 的全局 Skills 目录，遵循 [存储位置](storage-locations.md) 的配置。原技能保留，同名目标跳过；附属脚本、代码块和二进制原样复制。`CLAUDE.md` 文档名称改为 `AGENTS.md`，Markdown 正文中的 Claude Code / Codex 引用和默认技能路径按 hbar 适配。模型标识符和代码块不会因术语替换改变。只保留技能入口的名称、描述和正文，平台专属 frontmatter 不会启用；专属工具、权限与目录引用需要人工检查，预览提供对应提示。不执行技能脚本、不发起模型请求。

流程参考 Codex 的 `codex-rs/external-agent-migration/src/service.rs#import_skills` 与 `rewrite.rs`，由 hbar 的类型化 Host 命令和可恢复后台任务实现。按设备持久化原操作 ID、输入指纹、进度与完成回执，未知结果先读取原操作，重试不生成新复制意图。Host 关闭后保留未完成意图，读取原任务或该设备最近任务时恢复；取消保留已导入技能，并阻止尚未受理的迟到请求。

每个 Host 同时执行一个导入；最多两个扫描请求。预览最多 128 个技能、顶层 4,096 个条目；每个技能最多 256 个文件、1,024 个文件／目录条目、16 层、32 MiB，单批总计 128 MiB，技能入口和改写 Markdown 最多 256 KiB。符号链接、保留目录、文档改名冲突与无效入口会跳过。预览按 20 项分页，界面关闭时停止轮询，后台任务继续；轮询最多持续五分钟，可主动继续检查。
