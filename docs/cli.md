# CLI 与终端

想先按任务使用 CLI，请从 [Wiki 的 CLI 与无头模式](wiki/CLI.md) 开始；本页记录完整的命令与协议边界。

`hbar` 是 Host 的键盘客户端。它不会复制 Session、模型、插件或审批逻辑；所有操作通过同一个 HTTP/JSON-RPC + WebSocket Client SDK 发送到 Bun Host。

To explicitly enable an OpenAI Images compatible model, add `imageGeneration: true` to that model in the provider passed to `provider.save`. The `image_generate` tool only accepts model selections with this flag; it posts to `<baseUrl>/images/generations`, stores validated image bytes as authenticated artifacts, and may incur provider charges.

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
hbar exec permission.get
hbar exec permission.set allow
hbar exec mode.get --session <Session ID|名称>
hbar exec mode.set plan --session <Session ID|名称>
hbar exec provider.save --input-json '{"provider":{"id":"openai","name":"OpenAI","protocol":"openai-responses","baseUrl":"https://api.openai.com/v1","model":"gpt-5"},"apiKey":"..."}'
hbar exec provider.delete openai
hbar exec system.diagnose
hbar exec system.paths.get
hbar exec system.paths.validate <dataRoot> <cacheRoot>
hbar exec system.paths.set <dataRoot> <cacheRoot>
hbar exec device.list
hbar exec device.revoke <deviceId>
hbar exec pairing.create
hbar exec system.restart
hbar exec plugin.list
hbar exec plugin.inspect <package-name>
hbar exec plugin.install <directory-or-archive>
hbar exec plugin.enable|plugin.disable|plugin.remove <package-name>
hbar exec plugin.resolve|plugin.graph|plugin.lock|plugin.doctor
hbar exec plugin.set --input-json '{"id":"my-plugin","enabled":true,"config":{}}'
hbar exec skill.list
hbar exec context.compact --session <Session ID|名称> --model <provider/model|id|name>
hbar exec connection.status
hbar exec connection.reconnect
hbar exec connection.disconnect
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
hbar exec workflow.get --session <Session ID|名称>
hbar exec workflow.focus.set --session <Session ID|名称> --input-json '<focus JSON>'
hbar exec workflow.checkpoint --session <Session ID|名称> --input-json '<检查点 JSON>'
hbar exec workflow.acceptCheck --session <Session ID|名称> --input-json '<验收 JSON>'
hbar exec agent.result.get <Agent ID> --session <Session ID|名称>
hbar exec agent.patch.apply <Agent ID> --session <Session ID|名称> --plan-revision <revision> --idempotency-key <稳定键>
hbar exec workflow.complete --session <Session ID|名称> --input-json '{"expectedRevision":4}'
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

## 远程节点 CLI

`hbar serve` 默认启动兼容本机执行的混合 Host。A 也可显式用 `hbar serve --role conversation --no-local-exec` 关闭 A 本机工具执行；这不会关闭对话、模型、审批或节点路由。B 作为工作区节点运行 `hbar serve --role workspace --home <B数据目录> --join <A地址> --code <8位码> --fingerprint <A指纹>` 完成首次固定身份握手；保存成功后，之后只需以相同 `--home` 启动 workspace role，B 会自动重连。

```text
# B 本机上分享目录，然后启动 B 服务
hbar node share <本机目录> --id engine --access write --home <B数据目录>
hbar serve --role workspace --home <B数据目录> --join https://a.example:4317 --code 12345678 --fingerprint SHA256:<A指纹>

# B 本机单独生成 observer 邀请码；observer 必须限定一个或多个现有 root
hbar node pair --name reviewer --role observer --root engine --home <B数据目录>

# 第一次 attach 输入该码；之后使用已保存的 B 专属设备密钥
hbar attach https://b.example:4318 --code 12345678
hbar attach https://b.example:4318

# A 上登记并创建远程工作区
hbar exec node.list
hbar exec workspace.create --node <节点名或ID> --root engine --name "Remote engine"
```

`hbar node pair` 通过 B 的 loopback `control.json` 引导端创建独立的 operator 或 observer 配对码，不经过 A。`hbar attach <B-url>` 先请求公开 `GET /node-info`：严格的 workspace 描述表示 B；404 表示旧式 A，继续使用 A 的 WebSocket Client 流程；其他状态或无效描述失败关闭。B 的描述只含角色、协议、node ID、指纹及固定路径。首次配对后，CLI 将 Ed25519 PKCS8 私钥存入当前 CLI 数据根的 `node-console/`，按 B origin 和 node ID 隔离，POSIX 文件权限为 0600；它不与 A 的设备 token 或 Host 凭据共用。B 指纹变化时 CLI 拒绝旧凭据。公网地址必须用 HTTPS；HTTP 仅允许 loopback。可用 `--code` 非交互配对，否则需要终端交互。

B 控制台 CLI 命令为 `status`、`sessions [cursor]`、`snapshot <sessionId> [beforeSeq]`、`follow <sessionId> <afterSeq>`、`audit [after] [limit]`、`policy`、`pause`、`resume`、`kill <operationId|--all>`、`help` 和 `quit`。观察者只可执行 status 与会话观察命令；服务端也逐请求校验权限。operator 可用其他列出的本机控制操作。当前会话观察为有界分页/快照/持久事件查询；应根据返回的 cursor/seq 续读，过期游标需重新读取快照。Ctrl+C 取消当前 CLI 请求；退出控制台会释放提示符与当前调用。

远程工作区以 `hbar-node://<nodeId>/<rootId>` 定位，不能交给 A 的本机文件 API。B 上的 managed worktree 与 Session、目标 revision 和 B 生成的 worktree ID 绑定；同名目录不构成身份。Remote launch-target 支持 `shared-current` 与隔离 worktree；`shared-branch` 在 A enqueue 前返回 `REMOTE_SHARED_BRANCH_UNSUPPORTED`，UI 将其禁用。A 上已有的审批仍由 A 处理，B 的本地执行确认是独立的额外门禁。节点终端默认关闭，只有 B 本地底线启用后才可用。B 的持久回执上限为 10,000 条并保留 7 天；结果未知返回 `EFFECT_UNKNOWN`，不得以新 operation ID 重放。输出和游标均有字节、序号、保留容量及信用窗口限制。

当前 CLI 不提供 SSH stdio 或 Noise 中继；它们是未实现的可选方案。Linux 已通过真实 A/B 远程工作区读写和 B managed worktree 生产验证；A 已有远程 Git 查询验证。A 上 workspace mount 的保存、删除、重开/reload 与 Host folder get 已由真实 A/B E2E 验证；独立 observer 浏览器上下文中 alias、remove 和 save 控件禁用及原因展示也通过验证。A 自动释放 B 上 worktree reference 明确尚不支持；B 本机操作员可使用受保护 allocator remove。平台实测边界见[远程节点交付记录](remote-nodes.md#当前-cli-工作流与交付状态)。

输出 UI commit `65479dd3` 的 Web build、13 个输出 UI 文件与 10 个 fixture 文件的类型感知 lint、36 项单元测试（405 assertions）和 86 个受影响 fixtures（1,021 assertions）通过。受控真实浏览器输出 fixture 覆盖英文/中文及 1440/390 视口，4/4 通过并经人工检查。

A 节点设置 UI commit `633d20033623398515b57fba288e8f708c349440` 的严格 TSC（3,575 文件）、定向类型感知 lint（0 警告）、7 项测试/35 assertions、内容与 icon guards（3 个 icon 文件）、格式检查及生产构建均通过。3 项真实 Nodes Settings E2E 覆盖隔离 A/B 的分页、撤销、observer、剪贴板与重载恢复分组；1440px/390px 视口已人工检查。

Terminal UI commit `b502af7383905f5510aeb34b4b2419a0e6781d13` 的严格 TSC 覆盖 3,648 个文件；11 个文件的类型感知 lint 无警告，12 项模型/Client/HostRPC/shell boundary 测试共 56 assertions 通过，content/icon/flow guards 与生产构建通过。operator local PTY E2E 1/1 通过（9.5 秒），覆盖结果行、焦点、关闭及无溢出；parent 人工检查了 1440/390 视口。浏览器验证使用 Host local PTY；B remote auth/routing 由独立 HostRPC public test 覆盖，不应视为 remote PTY browser proof。

Workspace UI commit `720b7b2c10ebd0f8a7b21731a0b0129d155e9aba` 通过 strict TSC（3,658 文件）、25 个 TS/TSX typed lint 文件（0 warnings）、7 个 model/runtime/SSR suites（46 tests/270 assertions，含 `session-decisions-react`）、content/icon/flow guards 和 Web build；没有新增 Prettier 失败（3 个既有基线失败仍在 App、web-session-host、app-runtime/index）。真实 A/B workspace E2E 1/1（26.4 秒）验证只读 root、固定位置、同节点 folders 保存/删除/reopen 与 Host get、overlap disabled 和 observer 只读控件；49 字符英文 root 名称在 390px 下换行且无溢出。人工检查覆盖 picker/folders/observer 的 390px 与 created 的 1440px。没有声称中文 workspace 浏览器或 Windows process 正向验证。

Root 首轮基础测试曾有 19 failures/1 error；修复后 fresh `bun run check` 在 HEAD `2d0658338e0ccf2bd2b0d980b3238aaae9ad149f` exit 0。最终生产图的 Linux live proof 也通过 26 项/138 assertions。完整门禁计数与平台跳过边界见[验证说明](testing.md#远程节点验证)。

最终 CLI standalone build/help 均通过，SHA-256 为 `60E8EDF0548CAAFFA2B7E47029C8F0218A14669125E0DD1241FD954868B6A5A9`，build metadata HEAD 为 `70435b58`。全仓文档链接检查仍报告 761 个历史发布产物缺失链接：759 个来自截图、审计、`artifacts`、`test-results` 和 `playwright-report` 等忽略产物，另 2 个来自未改的 `docs/ui-layout-repair-delivery-2026-10-06.md` 中 dist/releases 安装包与 manifest；本轮修改的 3 个文档单独核对为 0 个问题，不能据此宣称全仓文档链接检查通过。

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
  --approval <deny|allow|ask|sandbox>
```

`--message` 省略时从 stdin 读取一条消息。默认审批为 `deny`，默认输出为 `text`。`ask` 只能在 stdin/stdout 都是 TTY 时使用；管道模式返回结构化错误。`allow` 必须显式传入，仍经过执行服务、资源限制、调用意图和用量审计。`sandbox` 按会话设置选中的沙盒配置（默认 `:workspace-write`）自动放行、询问或拒绝，见[沙盒审批](sandbox.md)；配置判定为需要询问的调用在管道模式下同样返回结构化错误。

`jsonl` stdout 每行都是一个 JSON 对象，包含 `run.started`、有独立偏移的 `message.delta`、工具与审批事件、`message.committed` 和 `run.completed`。错误也以 `{ "type": "error", "code": ... }` 输出，不混入 ANSI 或 Host 日志。退出码为 `0` 成功、`2` 参数错误、`3` 审批失败、`4` 模型/供应商错误、`5` 插件错误、`6` Session/存储恢复错误、`7` 其他内部错误；命令执行的未知结果为 `8`，版本或幂等冲突为 `9`。

`hbar exec` 是无界面命令入口，单行输出 JSON。`session.setBudget` 的 `tokens` 是正整数；`--expected-revision null` 表示仅允许尚无预算的会话，已有预算时传上一回读到的正整数版本。持久写入必须传 `--idempotency-key`；如果请求断线或返回未知结果，以相同 Session、设备身份和键运行 `hbar exec receipt <键>`，查到成功回执后不要换新键重复提交。同键同参数重试返回首次回执，同键不同参数返回冲突。回执含事件 ID、预算版本与提交时的预算快照；预算后续用量变化请用 `session.getBudget` 读取。`session.clearBudget` 是收敛清除：首次删除已有账本返回 `cleared: true`，重复调用返回 `false`。CLI 与 Host 预算服务共享同一命令定义，旧 `budget.set/get/clear` 仍走同一预算规则。

分层设置使用 `global`、`workspace` 或 `session` scope。工作区和会话 scope 分别传 `--workspace/--target` 与 `--session/--target`；路径可写字段名（如 `provider.model`）或 schema-core 编码路径。`settings.get` 返回参与解析的完整版本向量以及来源、继承、本层 presence 和生效状态报告。`settings.set/unset` 默认先读取当前版本向量，适合交互式使用；自动化和断线重试应保存读取结果中的 `revisions`，通过 `--baseline-json` 在首次调用和后续同键重试中使用完全相同的向量。`--value-json` 区分字符串、数字、布尔值和显式 `null`。`settings.apply` 的 `--input-json` 自带 scope，可在一次事务中提交多个 set/unset，并对完整父层版本向量执行 CAS。活动 Session 预算仍由 `session.setBudget` 管理，不能通过任意设置路径改写。

`hbar commands list/describe` 从已认证 Host 读取按 `category` 分类的可序列化定义，查询不需要配置模型或选择会话。`hbar exec run.submit` 可用 `--message` 或 `--input-json <JSON 对象>` 传入输入，必须给稳定幂等键；立即返回受理回执和 operationId，不把受理当完成。`operation.get` 查询当前状态，`operation.cancel` 对排队任务返回 cancelled、对活动任务先返回 cancelRequested，随后用 get 确认终态。断线后用同一设备身份、Session 和键运行 `hbar exec receipt run.submit <键>`，再决定是否重试。当前 CLI 命令目录、命名 context 和共享 REPL/TUI 分派已可用；其余业务领域按 A11 独立迁移。

`approval.resolve` 只接受 `allowed` 或 `denied`，并核对 Approval 的真实 Session 归属；首次决定持久化后，重复或相反决定只返回已存在的终态。`questionnaire.answer` 的 `--input-json` 是 question ID 到 `{ "answers": [...] }` 的对象，答案仍由原请求约束验证。只有当前仍在等待且属于所选 Session 的 request 会返回 `accepted: true`；过期、重复或错误 Session 返回 `false`，不会回答另一个会话。两者都走统一 Host command，TUI `/approve`、`/deny` 与无头自动审批使用相同 handler。

Goal 与 Plan 命令直接调用 Host 中已有的 goal/plan 插件，不在 CLI 保存第二份状态。`goal.create` 的 objective 是位置参数，可选 `--token-budget`；不同 objective 会替换当前 Goal、生成新 `goalId` 并重置计量，同 objective 更新保留计量。`goal.set` 用 `--input-json` 修改 objective、status 或 tokenBudget，自动化应传查询返回的 `goalId` 作为 `expectedGoalId`。`goal.update` 只接受 `complete` 或 `blocked`。`plan.update` 的 JSON 含 `plan` 数组及可选 explanation/turnId/expectedRevision；它是唯一 Agent 执行清单。若连接在响应前中断，先用对应 `.get` 核对权威状态。

多步修改、自动验收和子 Agent 补丁使用[专注工作流](workflows.md)。Workflow 不持有第二份 TODO；`workflow.focus.set` 把能力范围与验证策略绑定到 Agent Plan revision 和当前步骤。默认由 Agent 自主判定，可选只读 review agent；`workflow.acceptCheck` 仅适用于显式 user 策略。`agent.patch.apply` 仍要求 `--plan-revision`，自动化不得把非零结果当成已应用。

`model.list` 返回已归一的 provider/model ID、能力、思考等级和 `hasKey`，不返回凭据。Session 的模型与思考等级保存在 settings-core 的 `provider.model` / `provider.thinkingLevel` 路径；`session.getModel` 同时返回有效值、来源和完整版本向量。`session.setModel` 会验证 Model ID；切换到不支持当前显式思考等级的模型时，在同一原子 ChangeSet 中改为目标模型默认等级。`session.setThinkingLevel` 校验所选模型能力。两种写入均要求幂等键；自动化重试还应复用第一次查询所得的 `--baseline-json`。CLI/TUI 和无头 Run 在未显式传 `--model` / `--thinking` 时读取该 Session 配置；显式参数只覆盖本次 Run，不另写设置。`hbar model use` 是 `session.setModel` 的兼容语法，也要求 `--idempotency-key`。

`app.setSession` 通过独立 app-runtime 解析明确 ID，或在 `--workspace` 限定范围内解析精确名称，不修改 Host 的 Session 事实。未传 `--context` 时选择只存在于该 CLI 进程；传入名称后，选择以 Host 数据根和本机用户为边界原子保存，后续 `hbar exec ... --context review` 可复用目标。保存结果带单调 revision；自动化可传 `--context-revision <revision>` 做显式 CAS，版本已经变化时返回冲突退出码 9，不静默覆盖另一个进程的选择。显式 `--project` / `--session` 优先于 context，适合自动化脚本固定目标。

`hbar repl` 使用与一次性 CLI 相同的 tokenizer、参数校验和 command handler。REPL 可省略 `exec` 前缀直接输入 `session.getBudget` 等点分命令；非 TTY 输入按行执行，错误沿用 CLI 退出码且不会等待表单交互。TUI 的 `/exec <command> [arguments]` 也调用这条执行路径，并把结果留在当前终端界面；现有短命令继续作为兼容别名，在相应领域迁移时改为同一 command 的语法映射。

GUI runtime 只有显式注册 clientId、连接 generation 和允许的 surface command 后才会接收定向界面命令。CLI 的 `app.openPanel`、`app.closePanel`、`app.openSettings`、`app.openStatus`、`app.openSettingsEditor`、`app.openWindow` 与 `app.closeWindow` 必须传 `--client`，Host 不广播也不猜测目标。`--invocation-id` 可让断线重试核对同一次调用；同 ID 改变目标、命令或输入返回冲突。目标未连接、未声明能力、已经换代及超时分别作为结构化错误返回；`--timeout` 的范围为 100–30000 毫秒。复杂输入可用 `--input-json`，窗口 page 也可用 `--page <JSON>`。

## TUI 快捷键

OpenTUI 和 React TerminalPanel 共享 `/命令` 语法。`Enter` 发送，`Shift+Enter` 插入多行，`Tab` 接受补全，`Ctrl+C` 取消当前 Session 的 Run 或清空输入，`Ctrl+L` 清空可见输出，`Ctrl+P` 循环活动 Session，`Ctrl+`` 打开终端，`Ctrl+Shift+P` 打开命令补全。

内置命令包括 `/help`、`/new`、`/sessions`、`/switch`、`/fork`、`/archive`、`/model`、`/thinking`、`/compact`、`/approve`、`/deny`、`/stop`、`/retry`、`/export`、`/plugins`、`/skills`、`/settings`、`/paths`、`/diagnose`、`/clear` 和 `/quit`。要发送以 `/` 开头的模型消息，输入 `//`，终端会把第一个 `/` 还原为消息内容。

客户端插件使用 `api.registerTerminalCommand` 注册同一套命令元数据，返回的 disposer 会在停用和配置变化时移除补全、执行器和相关事件监听。可信 Host 插件的 package manifest 也必须在 `hbar.contributes.commands` 中声明 ID、usage、作用域、权限、是否允许 headless 及是否修改数据。
