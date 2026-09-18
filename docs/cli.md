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
hbar exec session.clearBudget --session <Session ID|名称>
hbar exec receipt <原幂等键> --session <Session ID|名称>
hbar exec settings.get provider.model --scope session --session <Session ID>
hbar exec settings.set provider.model --scope session --session <Session ID> --value-json '"gpt-5"' --baseline-json '<版本向量 JSON>' --idempotency-key <稳定键>
hbar exec settings.unset provider.model --scope session --session <Session ID> --baseline-json '<版本向量 JSON>' --idempotency-key <稳定键>
hbar exec settings.apply --input-json '<含 scope、changes、baselineRevisions 的 JSON>' --idempotency-key <稳定键>
hbar exec approval.resolve <Approval ID> allowed --session <Session ID|名称>
hbar exec questionnaire.answer <Request ID> --session <Session ID|名称> --input-json '{"scope":{"answers":["App"]}}'
hbar exec goal.create "完成命令迁移" --session <Session ID|名称> --token-budget 120000
hbar exec goal.get --session <Session ID|名称>
hbar exec goal.set --session <Session ID|名称> --input-json '{"status":"active","expectedGoalId":"<Goal ID>"}'
hbar exec goal.update blocked --session <Session ID|名称>
hbar exec goal.clear --session <Session ID|名称>
hbar exec plan.update --session <Session ID|名称> --input-json '{"explanation":"先验证","plan":[{"step":"检查","status":"in_progress"}]}'
hbar exec plan.get --session <Session ID|名称>
hbar exec plan.clear --session <Session ID|名称>
hbar exec model.list
hbar exec session.getModel --session <Session ID|名称>
hbar exec session.setModel <Model ID> --session <Session ID|名称> --baseline-json '<版本向量 JSON>' --idempotency-key <稳定键>
hbar exec session.setThinkingLevel high --session <Session ID|名称> --baseline-json '<版本向量 JSON>' --idempotency-key <稳定键>
hbar commands list --category run.approval --limit 100
hbar commands describe run.submit
hbar exec app.setSession "审查会话" --workspace <Workspace ID|名称> --context review
hbar exec app.openPanel files --client <GUI clientId> --session <Session ID> --invocation-id <stable ID>
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

`hbar exec` 是无界面命令入口，单行输出 JSON。`session.setBudget` 的 `tokens` 是正整数；`--expected-revision null` 表示仅允许尚无预算的会话，已有预算时传上一回读到的正整数版本。持久写入必须传 `--idempotency-key`；如果请求断线或返回未知结果，以相同 Session、设备身份和键运行 `hbar exec receipt <键>`，查到成功回执后不要换新键重复提交。同键同参数重试返回首次回执，同键不同参数返回冲突。回执含事件 ID、预算版本与提交时的预算快照；预算后续用量变化请用 `session.getBudget` 读取。`session.clearBudget` 是收敛清除：首次删除已有账本返回 `cleared: true`，重复调用返回 `false`。CLI 与 Host 预算服务共享同一命令定义，旧 `budget.set/get/clear` 仍走同一预算规则。

分层设置使用 `global`、`workspace` 或 `session` scope。工作区和会话 scope 分别传 `--workspace/--target` 与 `--session/--target`；路径可写字段名（如 `provider.model`）或 schema-core 编码路径。`settings.get` 返回参与解析的完整版本向量以及来源、继承、本层 presence 和生效状态报告。`settings.set/unset` 默认先读取当前版本向量，适合交互式使用；自动化和断线重试应保存读取结果中的 `revisions`，通过 `--baseline-json` 在首次调用和后续同键重试中使用完全相同的向量。`--value-json` 区分字符串、数字、布尔值和显式 `null`。`settings.apply` 的 `--input-json` 自带 scope，可在一次事务中提交多个 set/unset，并对完整父层版本向量执行 CAS。活动 Session 预算仍由 `session.setBudget` 管理，不能通过任意设置路径改写。

`hbar commands list/describe` 从已认证 Host 读取按 `category` 分类的可序列化定义，查询不需要配置模型或选择会话。`hbar exec run.submit` 可用 `--message` 或 `--input-json <JSON 对象>` 传入输入，必须给稳定幂等键；立即返回受理回执和 operationId，不把受理当完成。`operation.get` 查询当前状态，`operation.cancel` 对排队任务返回 cancelled、对活动任务先返回 cancelRequested，随后用 get 确认终态。断线后用同一设备身份、Session 和键运行 `hbar exec receipt run.submit <键>`，再决定是否重试。当前 CLI 命令目录、命名 context 和共享 REPL/TUI 分派已可用；其余业务领域按 A11 独立迁移。

`approval.resolve` 只接受 `allowed` 或 `denied`，并核对 Approval 的真实 Session 归属；首次决定持久化后，重复或相反决定只返回已存在的终态。`questionnaire.answer` 的 `--input-json` 是 question ID 到 `{ "answers": [...] }` 的对象，答案仍由原请求约束验证。只有当前仍在等待且属于所选 Session 的 request 会返回 `accepted: true`；过期、重复或错误 Session 返回 `false`，不会回答另一个会话。两者都走统一 Host command，TUI `/approve`、`/deny` 与无头自动审批使用相同 handler。

Goal 与 Plan 命令直接调用 Host 中已有的 goal/plan 插件，不在 CLI 保存第二份状态。`goal.create` 的 objective 是位置参数，可选 `--token-budget`；已有未完成 Goal 时会拒绝创建。`goal.set` 用 `--input-json` 修改 objective、status 或 tokenBudget，自动化应传查询返回的 `goalId` 作为 `expectedGoalId`，防止把较新的 Goal 当成旧目标修改。`goal.update` 只接受领域状态机允许的 `complete` 或 `blocked`，暂停、恢复和编辑使用 `goal.set`。`plan.update` 的 JSON 含 `plan` 数组及可选 explanation/turnId，并由同一 Plan schema 验证。此类写入没有独立重放键；若连接在响应前中断，先用对应 `.get` 查询持久状态，再决定是否重试，避免生成重复事件。clear 是收敛操作，重复执行返回 `cleared: false`。

`model.list` 返回已归一的 provider/model ID、能力、思考等级和 `hasKey`，不返回凭据。Session 的模型与思考等级保存在 settings-core 的 `provider.model` / `provider.thinkingLevel` 路径；`session.getModel` 同时返回有效值、来源和完整版本向量。`session.setModel` 会验证 Model ID；切换到不支持当前显式思考等级的模型时，在同一原子 ChangeSet 中改为目标模型默认等级。`session.setThinkingLevel` 校验所选模型能力。两种写入均要求幂等键；自动化重试还应复用第一次查询所得的 `--baseline-json`。CLI/TUI 和无头 Run 在未显式传 `--model` / `--thinking` 时读取该 Session 配置；显式参数只覆盖本次 Run，不另写设置。`hbar model use` 是 `session.setModel` 的兼容语法，也要求 `--idempotency-key`。

`app.setSession` 通过独立 app-runtime 解析明确 ID，或在 `--workspace` 限定范围内解析精确名称，不修改 Host 的 Session 事实。未传 `--context` 时选择只存在于该 CLI 进程；传入名称后，选择以 Host 数据根和本机用户为边界原子保存，后续 `hbar exec ... --context review` 可复用目标。保存结果带单调 revision；自动化可传 `--context-revision <revision>` 做显式 CAS，版本已经变化时返回冲突退出码 9，不静默覆盖另一个进程的选择。显式 `--project` / `--session` 优先于 context，适合自动化脚本固定目标。

`hbar repl` 使用与一次性 CLI 相同的 tokenizer、参数校验和 command handler。REPL 可省略 `exec` 前缀直接输入 `session.getBudget` 等点分命令；非 TTY 输入按行执行，错误沿用 CLI 退出码且不会等待表单交互。TUI 的 `/exec <command> [arguments]` 也调用这条执行路径，并把结果留在当前终端界面；现有短命令继续作为兼容别名，在相应领域迁移时改为同一 command 的语法映射。

GUI runtime 只有显式注册 clientId、连接 generation 和允许的 surface command 后才会接收定向界面命令。CLI 的 `app.openPanel`、`app.closePanel`、`app.openSettings`、`app.openStatus`、`app.openSettingsEditor`、`app.openWindow` 与 `app.closeWindow` 必须传 `--client`，Host 不广播也不猜测目标。`--invocation-id` 可让断线重试核对同一次调用；同 ID 改变目标、命令或输入返回冲突。目标未连接、未声明能力、已经换代及超时分别作为结构化错误返回；`--timeout` 的范围为 100–30000 毫秒。复杂输入可用 `--input-json`，窗口 page 也可用 `--page <JSON>`。

## TUI 快捷键

OpenTUI 和 React TerminalPanel 共享 `/命令` 语法。`Enter` 发送，`Shift+Enter` 插入多行，`Tab` 接受补全，`Ctrl+C` 取消当前 Session 的 Run 或清空输入，`Ctrl+L` 清空可见输出，`Ctrl+P` 循环活动 Session，`Ctrl+`` 打开终端，`Ctrl+Shift+P` 打开命令补全。

内置命令包括 `/help`、`/new`、`/sessions`、`/switch`、`/fork`、`/archive`、`/model`、`/thinking`、`/compact`、`/approve`、`/deny`、`/stop`、`/retry`、`/export`、`/plugins`、`/skills`、`/settings`、`/paths`、`/diagnose`、`/clear` 和 `/quit`。要发送以 `/` 开头的模型消息，输入 `//`，终端会把第一个 `/` 还原为消息内容。

客户端插件使用 `api.registerTerminalCommand` 注册同一套命令元数据，返回的 disposer 会在停用和配置变化时移除补全、执行器和相关事件监听。可信 Host 插件的 package manifest 也必须在 `hbar.contributes.commands` 中声明 ID、usage、作用域、权限、是否允许 headless 及是否修改数据。
