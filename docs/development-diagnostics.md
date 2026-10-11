# 开发期诊断与故障定位

这份文档说明当前 hbar 的诊断实现、日志位置和排查顺序。诊断数据只用于定位运行时问题，不是业务事件日志，也不替代 Session、Run 或 SQLite 的持久事实。当前主库使用 Bun 的 `bun:sqlite`，由 Storage Worker 单连接访问；本手册记录如何判断一次失败发生在 Host 派发、Storage Worker 执行还是返回链路。

## 日志在哪里

Host 和 supervisor 使用当前 `dataRoot/diagnostics`；原生桌面使用 `settingsRoot/diagnostics`。默认设置目录为 `dataRoot/settings`，更改存储位置后应读取实际保存的根目录。

| 组件               | 文件或输出                                                                              | 内容                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host               | `hbar-host-diagnostics.jsonl`                                                           | Host 启动、停止、Storage fatal、RPC 阶段和 Storage roundtrip 诊断。由 `apps/host/src/runtime-diagnostics.ts` 创建。                                                                         |
| Supervisor         | `hbar-supervisor-diagnostics.jsonl`                                                     | 子 Host spawn、exit、恢复退避和恢复次数上限。由 `apps/host/src/main.ts` 与 `apps/host/src/supervisor.ts` 创建。                                                                             |
| Native desktop     | `native-lifecycle.jsonl`                                                                | Tauri launcher、连接文件校验、Host 子进程、health 匹配、窗口/托盘/退出拥有者释放。由 `apps/desktop/src-tauri/src/native_diagnostics.rs` 写入。                                              |
| Host stdout/stderr | `desktop-host.log` 或开发 Host 的 `host-dev.log`                                        | 启动器重定向的原始 console 输出，例如未处理的 observer、通知或关闭错误。它不是结构化诊断的唯一来源。                                                                                        |
| Client/Web         | `apps/web/src/development-diagnostics.ts` 的 4096 条本地 ring 与浏览器 DevTools console | Vite dev，或构建注入的 `VITE_HBAR_DIAGNOSTICS=1` / `HBAR_WEB_DIAGNOSTICS=1` 使用 full rate；生产保留 error/fatal、warn、慢请求和 `connection.*`，不写 app Storage，页面关闭后内存记录消失。 |

Host diagnostics 使用 `DiagnosticEvent` 的严格白名单。当前 JSONL 记录不会写入 token、API key、完整模型 prompt、SQL 文本、SQL 参数、消息正文、工具参数、文件正文或任意路径值。关联 ID 只在需要时记录，日志导出不能由调用方把任意 payload 塞进事件。

### 覆盖开关和容量

开发覆盖默认打开：`HBAR_DESKTOP_DEV=1` 或 `NODE_ENV=development` 会启用完整 Host 诊断；`HBAR_DIAGNOSTICS=1` 启用诊断写入，`HBAR_DIAGNOSTICS_FULL=1` 强制成功请求完整记录。Host journal 在覆盖关闭时仍固定保留 warn、error/fatal、Storage 错误以及 Host/supervisor 生命周期和 SQLite starting/configured/recovery/ready/schema migration 事实；普通 fast debug/info 不落盘。Host 当前成功请求采样率为 10%，耗时至少 100ms 的请求总会保留。生产未启用覆盖时不要把 fast success 采样描述成必然落盘。

Host journal 的默认边界是：当前文件 10 MiB、保留 8 轮滚动文件、内存 ring 4096 条、待写队列 1024 条，关闭等待最多 2 秒。队列溢出、非法事件、文件系统错误和关闭期限到达都会增加 dropped/writeFailures 计数；诊断写入失败不反向失败业务请求。单条事件必须通过 schema，journal 不接受超过单文件上限的事件。

Native Tauri 诊断使用同步、尽力而为的独立实现：单文件 128 KiB，只保留 1 个滚动代，单行上限 4 KiB；写入前用 `try_lock`，锁忙时直接丢弃。它只写固定生命周期字段，并不会等待 Host logger，因此 Host 尚未启动时仍能留下 launcher 证据。

## 关联 ID 的职责

不要把不同层的 ID 当作同一个值，也不要用时间戳猜测关联关系。

| ID                          | 产生者           | 作用                                                                                           |
| --------------------------- | ---------------- | ---------------------------------------------------------------------------------------------- |
| `instanceId`                | Kernel/Host      | 一次 Host 实例的稳定身份；重启后变化，用来排除旧连接或旧日志。                                 |
| `contextId` / connection ID | Host WebSocket   | 一条客户端连接的范围；用于区分同一 Host 上的多个 Client。                                      |
| `requestId`                 | Client/业务命令  | 一次有幂等语义的业务意图；超时后核对原 ID，不能换新 ID 重放未知写入。                          |
| `rpcId`                     | JSON-RPC Client  | 一次传输请求的帧 ID；只表示 WebSocket 请求/响应配对。                                          |
| `storageRequestId`          | Storage adapter  | Storage Worker `postMessage` 的本地递增序号；用于把主线程 roundtrip 与 Worker execution 配对。 |
| `sessionId` / `runId`       | Kernel/Session   | 业务实体和一次 Run 的范围。                                                                    |
| `stepId`                    | Kernel execution | Run 内一个模型或工具步骤的范围。                                                               |
| `callId`                    | 工具执行/审批    | 一次工具调用及其审批、结果、超时的范围。                                                       |

当前 Host 请求诊断还会通过 AsyncLocal scope 传播这些稳定 ID。事件内容只传播 ID，不传播上下文对象、消息或参数。Web Client 的本地 ring 与 console 诊断独立于 Host JSONL，适合 Host unavailable 时保留连接错误。

## 三段定位法

当前已实现的时间字段要按三个阶段阅读。日志可以证明某阶段耗时，但不能把尚未测量的队列等待写成实测事实。

1. **Dispatch / Host ingress**：`apps/host/src/request-diagnostics.ts` 在 RPC 收到后记录 `rpc.ingress` 和 `admission`、`auth`、`validate`、`invoke`、`reply` 阶段、pending 数和入/出字节数。它说明请求是否进入 Host、是否卡在认证或 handler；没有 `queueWaitMs` 的实测值。
2. **Storage dispatch / Worker execution**：`packages/storage/src/request-diagnostics.ts` 的 `storage.request_dispatched` 表示请求已经 `postMessage` 给 Worker；`packages/storage/src/worker-diagnostics.ts` 在 Worker 内记录 `sqlite.request_started`（完整覆盖时）以及 `sqlite.request_completed`/`sqlite.request_failed`，使用 `executionMs`。Storage Worker 只记录方法名、序号、结果和安全错误码，不记录 SQL 或参数。
3. **Roundtrip / adapter**：`packages/storage/src/request-diagnostics.ts` 在主线程收到 reply 或失败时记录 `storage.request_completed`/`storage.request_failed`，使用从 `Storage.call` 开始计算的 `durationMs`。它与 `storageRequestId`、pending 数和 AsyncLocal 关联一起阅读，可以判断 Worker 执行和返回之间是否出现异常；当前没有独立的 `queueWaitMs`、postMessage 发送耗时或 SQLite 文件 IO 单独实测。

例如 `sessionSummary` 超时应按以下顺序查：先看 Host 的 `rpc.failed` 是否停留在 `invoke`；再看 `storage.request_dispatched` 与相同 `storageRequestId` 的 `sqlite.request_started`、执行耗时和安全错误码；最后看 adapter 的 `storage.timeout`、`storage.worker_exit` 和 `storage.close`。Worker start 只能证明进入执行阶段，单凭它仍不能断定 SQL 锁或文件 IO 是原因。完整覆盖时有 dispatch 而没有 Worker start，说明问题尚未进入该请求的 Worker handler；还需核对 Worker 健康、排队和诊断丢弃计数。日志缺失不能排除日志写入失败或强制退出，当前也没有精确 queue wait 测量。

## 模型请求、上下文压缩与供应商响应

模型诊断中的几个请求身份有不同生命周期，不能互相替代：`providerId` 是注册供应商的稳定 ID，`modelSelectionId` 是 Host 选择的规范模型 ID（例如带供应商前缀的选择值），`modelRequestId` 是本地一次模型请求的 ID。普通模型请求复用该 step 的用量 attempt 身份；摘要请求另有 Kernel 产生的 `attemptId`，将摘要阶段与其用量事实关联，它不代表普通模型 `stepId`。一次 Run 可以产生多个 attempt；上游返回的 `x-request-id` 即使存在，也只能作为脱敏后的 `upstreamRequestIdSha256`，不能写入或覆盖本地 `modelRequestId`。

上下文压缩按阶段读取 `context.compaction_stage`：`prepared` 表示输入已经准备，`summary_started`/`summary_completed`/`summary_failed`/`summary_cancelled` 表示摘要模型生命周期，`chunk_limit` 表示分块次数门禁，`rebuilt_capacity` 表示重建后的容量，`persist_started`/`persist_completed`/`persist_failed` 表示摘要事实持久化。阶段事件只允许有限的预算数、输入估算 token 数、输入上限和 chunk index/count；耗时由供应商请求终态与压缩汇总事件记录，不能由阶段名推断摘要内容已经成功写入。预算用量和 chunk 计数描述容量处理，不能当作供应商 HTTP 成功。

供应商 HTTP 响应与模型业务终态分开记录。`phase=response` 只表示 per-request transport 收到了一个真实 HTTP `Response`；其 `httpStatus` 必须是 100–599 的整数。OpenAI Completions 和 OpenAI Responses 两个本地协议都通过每次请求自己的 `fetch` wrapper 捕获状态，包括 200、401 和 502；wrapper 原样返回响应，不读取响应 body，也不修改 SDK 的异常。没有收到 `Response`（例如 abort、DNS 或连接建立失败）时不生成状态。SDK 的 `onResponse` 只覆盖 `withResponse()` 成功路径，不能单独承担失败状态采集。当前 `maxRetries: 0` 的请求边界必须保持，状态采集不能引入隐藏重试。

如果响应含有 allowlist 内的 `x-request-id`，长度不超过 256 字符时日志只保存其 SHA-256（`upstreamRequestIdSha256`），过长值丢弃，不保存原始 header。请求先记录 `started`，随后可能记录 `response`，最终独立记录 `settled`、`failed` 或 `cancelled`。Driver 的响应回调映射成 Host 日志 `provider.response`；HTTP 401/502 响应以 warn 级保留，也可以同时有模型失败终态；HTTP 200 则可能因为流解析失败而有响应与失败。`failed` 表示模型业务流程失败，不能仅凭响应阶段推断模型输出或 Run 已失败；反过来，当前 `model.settled` 事件只表示模型步骤的 bookkeeping 终态，不能被当作 API 已返回成功。

本地适配器当前明确覆盖 OpenAI Completions 与 OpenAI Responses 两种协议。Anthropic 或其他协议是否发出相同的响应阶段，需要以最终 Host/Provider 实现和对应的真实测试为准；本手册不提前声明其他协议、安装版本、原生桌面或全矩阵已经部署或通过。

## SQLite 与 Storage 故障

Storage 使用 `bun:sqlite` 的单 Worker/单连接模型。启动时连接配置为：

- `journal_mode=WAL`
- `synchronous=FULL`
- `foreign_keys=ON`
- `busy_timeout=5000`

Worker 会记录安全的 SQLite/Bun 运行时事实，例如 SQLite 版本、runtime 版本、schema/user version、journal mode、synchronous、busy timeout、foreign keys 和 page size。它不记录数据库文件内容、SQL 语句或绑定参数。`system.diagnose` 的 database 计数仍是有限的表计数，不能替代这些生命周期事件。

Storage 请求超时或 Worker error/exit 时，adapter 只发布一次 Storage fatal；在途请求会结束为未知/失败，属于未知结果的写操作不能自动重放。`storage.fatal` 会使受监督 Host 在有界关闭后以退出码 76 交给 supervisor 恢复。健康检查在 Storage 不可用时返回 HTTP 503，带有脱敏后的 `kind`、`code`、`method` 和发生时间；新的 WebSocket upgrade 返回 503，已建立的连接使用关闭码 1012 要求重连。健康 `503` 代表 Host 进程仍可能存活，但不能接受依赖 Storage 的 RPC。

Supervisor 对退出码 76 使用最多 3 次、60 秒窗口；退避为 250ms、1s、4s，超过上限记录 `supervisor.recovery_limit` 并停止恢复。正常 `system.restart` 使用退出码 75，不应和 Storage fatal 混淆。恢复后要用新的 `instanceId`、health、连接文件和原始 `requestId`/receipt 核对事实；不能因为旧 UI 仍显示 running 就认定 Run 仍在执行。

## 一次实际故障的处理顺序

1. 记录发生时间、Host `instanceId`、数据根 ID、UI 看到的错误码和原始 session/run/request ID。不要复制 token 或完整对话。
2. 读取同一时间窗口内的 Host、Storage Worker、supervisor 和 native JSONL；再对照 `desktop-host.log` 的 console 行。按 `instanceId` 和 `storageRequestId` 过滤，避免混入旧 Host。
3. 先判断 Storage 状态：`storage.timeout`、`storage.worker_error`、`storage.worker_exit`、`storage.fatal` 和 health 503/WS 1012 是否按顺序出现。若出现 fatal，先等待 supervisor 的有界恢复，不重放未知写。
4. 对 `STORAGE_TIMEOUT` 分开记录 dispatch、Worker execution 和 roundtrip 证据。当前没有证据时只写“阶段未知”，不能直接归因于 SQLite 锁或 IO。
5. 恢复后按原 requestId 查询 receipt、Session/Run 事件和 Goal/Plan 状态；确认结果后才能继续 UI 操作。若是写操作，未知结果必须由持久事实核对收敛。
6. 把诊断摘要保存到既有 `artifacts/` 目录，包含 schema 版本、时间窗口、实例 ID、事件数量、丢弃数、错误码和实际运行的测试入口；不要把原始 JSONL 或密钥复制到 issue。

## 测试入口和证据边界

以下入口覆盖当前已经存在的诊断或生命周期行为。运行前仍需根据当次任务的测试策略选择定向命令；这里不宣称安装包、原生桌面或全仓 Gate 已通过。

- `tests/diagnostic-journal.test.ts`：journal 的 ring、队列、滚动、容量、schema 拒绝、文件错误和 close 边界。
- `tests/storage-lifecycle.test.ts`：Worker exit/error、无回复、关闭握手、超时、并发 close 和关闭后请求。
- `tests/storage-request-diagnostics.test.ts`：真实 SQLite 派发、Worker 执行、回复顺序和关联身份，pending 上限、运行时事实、约束错误与 sink 异常隔离。重复写入采用显式 await/catch 后断言。
- `tests/storage-health-integration.test.ts`：真实 HTTP/认证 WebSocket 的 fatal 健康传播、canary 脱敏，以及已提交 append 在 fatal 后晚到的确定性屏障。
- `tests/kernel-execution-diagnostics.test.ts`：排队 Run 的独立 scope、真实模型/工具生命周期和用户取消、Host 关闭、工具超时的不同原因。
- `tests/host-main-diagnostics.test.ts`：实际 Host 子进程、公开命令 Client、真实文件读取和落盘 JSONL 的整条关联链。RPC request ID 与持久化 Run request ID 按公开快照核对。
- `tests/crash.test.ts`：已提交工具意图但结果尚未提交时的崩溃恢复与 WAL 事实，验证未知副作用不自动重放。
- `tests/desktop-dev-lifecycle.test.ts`、`tests/build-host-bundle.test.ts`：开发 Host 启动、资源和生命周期边界。
- `apps/desktop/src-tauri/src/native_diagnostics.rs` 的 Rust 单元测试：native 文件上限、滚动、并发 try-lock 和 JSON 行格式。

历史测试中出现过 Bun 对 Worker-backed Promise 的 `rejects` matcher 长时间不继续调度后续 Worker 消息的现象，显式 await/catch 和独立 Storage 脚本均正常收到相同约束错误。[Bun 上游问题 #37189](https://github.com/oven-sh/bun/issues/37189) 记录了相符的观察。该对照不能建立生产 `STORAGE_CLOSED` 的根因，也不能替代 Storage/Host 的实际失败证据。

## 诊断数据的开发约束

新增诊断时只添加稳定 ID、枚举状态、计数、阶段耗时和有限字节数。不得把 SQL、参数、prompt、凭据、文件路径、消息文本或完整异常复制进事件。成功采样可以帮助建立 p50/p95/max，但失败和生命周期事件必须优先保留；诊断写盘故障、队列溢出和关闭超时必须可计数，同时不能阻塞或改变业务执行。
