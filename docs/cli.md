# CLI 与终端

`hbar` 是 Host 的键盘客户端。它不会复制 Session、模型、插件或审批逻辑；所有操作通过同一个 HTTP/JSON-RPC + WebSocket Client SDK 发送到 Bun Host。

```text
hbar                         # 当前目录项目的 OpenTUI
hbar "检查当前工作区"          # 打开 TUI，并预填输入框，不自动发送
hbar --help
hbar --headless --message "总结变更" --output-format text
hbar --headless --message "总结变更" --output-format jsonl
hbar session list
hbar exec session.setBudget 120000 --session <Session ID|名称> --idempotency-key <稳定键> --expected-revision null
hbar exec session.getBudget --session <Session ID|名称>
hbar exec receipt <原幂等键> --session <Session ID|名称>
hbar commands list --category run.approval --limit 100
hbar commands describe run.submit
hbar exec app.setSession "审查会话" --workspace <Workspace ID|名称> --context review
hbar repl
hbar exec run.submit --message "检查变更" --session <Session ID|名称> --idempotency-key <稳定键>
hbar exec operation.get <operationId>
hbar exec operation.cancel <operationId>
hbar exec receipt run.submit <原幂等键> --session <Session ID|名称>
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

`jsonl` stdout 每行都是一个 JSON 对象，包含 `run.started`、有独立偏移的 `message.delta`、工具与审批事件、`message.committed` 和 `run.completed`。错误也以 `{ "type": "error", "code": ... }` 输出，不混入 ANSI 或 Host 日志。退出码为 `0` 成功、`2` 参数错误、`3` 审批失败、`4` 模型/供应商错误、`5` 插件错误、`6` Session/存储恢复错误、`7` 其他内部错误；命令执行的未知结果为 `8`，版本或幂等冲突为 `9`。

`hbar exec` 是无界面命令入口，单行输出 JSON。`session.setBudget` 的 `tokens` 是正整数；`--expected-revision null` 表示仅允许尚无预算的会话，已有预算时传上一回读到的正整数版本。持久写入必须传 `--idempotency-key`；如果请求断线或返回未知结果，以相同 Session、设备身份和键运行 `hbar exec receipt <键>`，查到成功回执后不要换新键重复提交。同键同参数重试返回首次回执，同键不同参数返回冲突。回执含事件 ID、预算版本与提交时的预算快照；预算后续用量变化请用 `session.getBudget` 读取。CLI 与 Host 预算服务共享同一命令定义，旧 `budget.set/get` 仍走同一预算规则。

`hbar commands list/describe` 从已认证 Host 读取按 `category` 分类的可序列化定义，查询不需要配置模型或选择会话。`hbar exec run.submit` 可用 `--message` 或 `--input-json <JSON 对象>` 传入输入，必须给稳定幂等键；立即返回受理回执和 operationId，不把受理当完成。`operation.get` 查询当前状态，`operation.cancel` 对排队任务返回 cancelled、对活动任务先返回 cancelRequested，随后用 get 确认终态。断线后用同一设备身份、Session 和键运行 `hbar exec receipt run.submit <键>`，再决定是否重试。当前 CLI 命令目录、命名 context 和这些业务入口已可用；通用 REPL/TUI 分派及其余领域迁移仍在 A6 后续切片。

`app.setSession` 通过独立 app-runtime 解析明确 ID，或在 `--workspace` 限定范围内解析精确名称，不修改 Host 的 Session 事实。未传 `--context` 时选择只存在于该 CLI 进程；传入名称后，选择以 Host 数据根和本机用户为边界原子保存，后续 `hbar exec ... --context review` 可复用目标。保存结果带单调 revision；自动化可传 `--context-revision <revision>` 做显式 CAS，版本已经变化时返回冲突退出码 9，不静默覆盖另一个进程的选择。显式 `--project` / `--session` 优先于 context，适合自动化脚本固定目标。

`hbar repl` 使用与一次性 CLI 相同的 tokenizer、参数校验和 command handler。REPL 可省略 `exec` 前缀直接输入 `session.getBudget` 等点分命令；非 TTY 输入按行执行，错误沿用 CLI 退出码且不会等待表单交互。TUI 的 `/exec <command> [arguments]` 也调用这条执行路径，并把结果留在当前终端界面；现有短命令继续作为兼容别名，在相应领域迁移时改为同一 command 的语法映射。

## TUI 快捷键

OpenTUI 和 React TerminalPanel 共享 `/命令` 语法。`Enter` 发送，`Shift+Enter` 插入多行，`Tab` 接受补全，`Ctrl+C` 取消当前 Session 的 Run 或清空输入，`Ctrl+L` 清空可见输出，`Ctrl+P` 循环活动 Session，`Ctrl+`` 打开终端，`Ctrl+Shift+P` 打开命令补全。

内置命令包括 `/help`、`/new`、`/sessions`、`/switch`、`/fork`、`/archive`、`/model`、`/thinking`、`/compact`、`/approve`、`/deny`、`/stop`、`/retry`、`/export`、`/plugins`、`/skills`、`/settings`、`/paths`、`/diagnose`、`/clear` 和 `/quit`。要发送以 `/` 开头的模型消息，输入 `//`，终端会把第一个 `/` 还原为消息内容。

客户端插件使用 `api.registerTerminalCommand` 注册同一套命令元数据，返回的 disposer 会在停用和配置变化时移除补全、执行器和相关事件监听。可信 Host 插件的 package manifest 也必须在 `hbar.contributes.commands` 中声明 ID、usage、作用域、权限、是否允许 headless 及是否修改数据。
