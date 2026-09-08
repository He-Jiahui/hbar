# CLI 与终端

`hbar` 是 Host 的键盘客户端。它不会复制 Session、模型、插件或审批逻辑；所有操作通过同一个 HTTP/JSON-RPC + WebSocket Client SDK 发送到 Bun Host。

```text
hbar                         # 当前目录项目的 OpenTUI
hbar "检查当前工作区"          # 打开 TUI，并预填输入框，不自动发送
hbar --help
hbar --headless --message "总结变更" --output-format text
hbar --headless --message "总结变更" --output-format jsonl
hbar session list
hbar plugins doctor
hbar config paths
hbar serve
hbar attach http://192.168.1.20:3210
```

默认 Host 数据目录为 Windows `%LOCALAPPDATA%\hbar\data`，缓存目录为 `%LOCALAPPDATA%\hbar\cache`。`--data-root` 和 `--cache-root` 只覆盖当前进程；设置页写入系统级 `%LOCALAPPDATA%\hbar\paths.json` 后，重启 Host 才切换目录。CLI 会先复用当前数据根的 `settings/connection.json`，没有可用 Host 时启动一个后台 Host；关闭 TUI 不会中断后台 Run。

## 无头模式

```text
hbar --headless \
  --message <消息> \
  --model <provider/model、模型 ID 或名称> \
  --thinking <off|minimal|low|medium|high|xhigh|max> \
  --project <路径|项目名> \
  --session <Session ID|名称> \
  --output-format <text|jsonl> \
  --approval <deny|allow|ask>
```

`--message` 省略时从 stdin 读取一条消息。默认审批为 `deny`，默认输出为 `text`。`ask` 只能在 stdin/stdout 都是 TTY 时使用；管道模式返回结构化错误。`allow` 必须显式传入，仍经过执行服务、资源限制、调用意图和用量审计。

`jsonl` stdout 每行都是一个 JSON 对象，包含 `run.started`、有独立偏移的 `message.delta`、工具与审批事件、`message.committed` 和 `run.completed`。错误也以 `{ "type": "error", "code": ... }` 输出，不混入 ANSI 或 Host 日志。退出码为 `0` 成功、`2` 参数错误、`3` 审批失败、`4` 模型/供应商错误、`5` 插件错误、`6` Session/存储恢复错误、`7` 其他内部错误。

## TUI 快捷键

OpenTUI 和 React TerminalPanel 共享 `/命令` 语法。`Enter` 发送，`Shift+Enter` 插入多行，`Tab` 接受补全，`Ctrl+C` 取消当前 Session 的 Run 或清空输入，`Ctrl+L` 清空可见输出，`Ctrl+P` 循环活动 Session，`Ctrl+`` 打开终端，`Ctrl+Shift+P` 打开命令补全。

内置命令包括 `/help`、`/new`、`/sessions`、`/switch`、`/fork`、`/archive`、`/model`、`/thinking`、`/compact`、`/approve`、`/deny`、`/stop`、`/retry`、`/export`、`/plugins`、`/skills`、`/settings`、`/paths`、`/diagnose`、`/clear` 和 `/quit`。要发送以 `/` 开头的模型消息，输入 `//`，终端会把第一个 `/` 还原为消息内容。

客户端插件使用 `api.registerTerminalCommand` 注册同一套命令元数据，返回的 disposer 会在停用和配置变化时移除补全、执行器和相关事件监听。可信 Host 插件的 package manifest 也必须在 `hbar.contributes.commands` 中声明 ID、usage、作用域、权限、是否允许 headless 及是否修改数据。
