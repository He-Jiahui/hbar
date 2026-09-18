# P4：Host 业务命令化与监控数据能力

状态：实施中；工作区/会话、预算、Run、审批问卷、目标计划、Session 模型配置、文件附件、子 Agent、browser、computer 与现有 Git 命令已交付，其余业务迁移和监控数据仍待实施。上级：[总计划](command-first-architecture-plan.md)。依赖 P1 调用契约、P2 消费端口与 P3 设置应用服务。本计划交付 CLI 可验证的数据/业务闭环；图表在 P5 接入。

## 1. Host 模块保持 MVC 与领域边界

`apps/host` 负责 Bun 生命周期、认证、Controller 和装配。Controller 验证网络请求、注入身份、路由到命令/查询 dispatcher，不在 RPC switch 中实现 Session 或表单业务。

`packages/kernel` 或领域插件提供用例和 handler；`packages/storage` 在 Worker 内实现数据库与事务。commands 包提供注册/执行机制及端口。命令重构复用现有运行、审批、意图日志、结算、增量事件和权限入口，不能另造平行的执行链。

新增具名网络方法以 `command.catalog`、`command.execute`、`query.execute`、`operation.get/watch/cancel` 等为目标设计，纳入现有 JSON-RPC/WS 协议与 Zod 校验。协议版本、producer、client、兼容 adapter 一起更新；通用入口仍按规范 ID 校验输入/输出，不能接受随意 payload。

旧 RPC 在迁移期可成为同一 dispatcher 的 adapter。没有新命令的一项功能不能先删掉旧能力。完成一个领域后移除该领域的重复业务分支；最终 UI 不公开原始写 RPC。

## 2. 全功能命令迁移清单

| 领域             | 代表命令/查询                                                              | 实现归属与验收闭环                                     |
| ---------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| 工作区/会话      | workspace.create/open/list；session.create/list/rename/archive/fork/export | kernel 会话用例；目标权限、分页、历史/分支保真         |
| 运行/交互        | run.submit/cancel/retry；approval.resolve；questionnaire.answer            | 运行与审批服务；受理、队列、流、取消、结算、重连       |
| 模型/预算        | session.setModel/setThinkingLevel/setBudget/getBudget/clearBudget          | 模型配置用例及 budget 插件；有效值、版本、限制一致     |
| 目标/计划        | goal.create/update/clear；plan.update/clear/query                          | goal/plan 插件；保留已有运行钩子与约束                 |
| 子 Agent         | agent.create/list/cancel、父子关系查询                                     | 领域插件；独立子 Session、取消传播、预算归属           |
| 文件/附件        | file.list/read/write；attachment.upload/query                              | 文件/附件服务；路径限制、分页、artifact 鉴权、写入审批 |
| browser/computer | 已交付的会话启动、状态、动作、释放命令                                     | 原能力插件；输入/截图等走受管端口与权限                |
| 供应商/设置      | provider/model 查询与配置；settings.get/set/unset/apply/content            | 设置用例/能力服务；三层覆盖、凭据端口、动态校验        |
| 系统/扩展        | connection、pairing、device、plugin、paths、diagnose                       | Host/客户端各自所有者；依赖验证、撤销、卸载释放        |
| 状态查询         | metrics.query/watch；usage.query/export；git.status/log/stats              | 监控服务/领域插件；真实数据、过滤、容量与口径          |

这些为目标语义，具体旧 ID 映射由 P6 逐项记录。某个子 Agent/统计能力如果仅在旧文档中列为后续扩展，登记为“本次新建能力”，不能标为已经迁移。既有且不在主界面示意图上的配对、设备、路径、插件、浏览器等功能仍必须可访问。

A11a 已将 `approval.resolve` 与 `questionnaire.answer` 注册为 session scope 的 Host commands。二者都显式携带 `sessionId` 并在领域 handler 核对原请求归属；审批返回权威终态，重复或相反决定不会改写首次结果，问卷只接受仍在内存中等待的原 request，过期、错误 Session 和重复回答返回 `accepted: false`。CLI、REPL、TUI 与无头审批路径共用 typed Client adapter；旧 `approval.resolve` / `user_input.resolve` RPC 暂作兼容入口并调用相同 Kernel 用例。

A11b 已将 `goal.get/create/set/update/clear` 与 `plan.get/update/clear` 注册到 `agent.goal.plan` 分类。Command adapter 只依赖公开 GoalService/PlanService，继续使用插件已有的事件持久化、目标状态机、token 结算、expectedGoalId 冲突检查、Plan 约束和通知；Host、typed Client、CLI/REPL/TUI 共用定义。非幂等写在响应未知时通过 `.get` 核对权威状态后再决定是否重试，clear 保持收敛返回。

A11c 已将 `model.list`、`session.getModel`、`session.setModel` 与 `session.setThinkingLevel` 注册到 `model.configuration`。Session 命令与通用 settings command 共用 SettingsService；模型存在性与 thinking capability 作为注入的候选验证器作用于两个入口。切换模型时，不兼容的显式 thinking override 与模型值原子更新。CLI/TUI 使用持久配置作为 Run 缺省值，Run 的显式 model/thinking 仍只影响该次执行。

A11d 已完成文件与附件无界面闭环：workspace 文本文件通过 Host command 读取、分页和 SHA-256 baseline 写入；附件由 client command 绑定短生命周期 `File` source，二进制经认证 HTTP transport 上传，持久状态只保留内容寻址 artifact。共享 artifact 不提供破坏性删除；草稿移除由客户端草稿命令负责。

A11e 新增 `@hbar/agent` 领域插件。`agent.create/list/cancel` 将每个子 Agent 建模为同工程内独立子 Session，父子关系使用既有 `parentId`，创建事实和 actor 幂等键写入规范事件；可选预算落到子 Session 的 BudgetService，Run 用量由原预算钩子结算。取消按有界后代树由叶到根传播，列表和响应未知恢复从 Session、Run 与 agent 事件重建，不依赖 UI 生命周期。

A11f 已将 `browser.status/navigate/snapshot/click/type/press/screenshot/evaluate/close/history` 注册为 session scope 的 Host commands。所有定义、CLI 参数和 typed Client 共用一份契约，adapter 只通过公开 BrowserUseService 调用原有 origin/CDP policy、容量限制、超时与受管 backend。会触发浏览器外部副作用的动作标记为 `external`：进入 handler 前取消返回 `CANCELLED`，进入后取消或丢失响应返回 `RESULT_UNKNOWN`，调用者用 status、snapshot 或 history 核对页面事实后再决定后续操作；查询和 page/context 释放按实际状态影响单独分类。旧 browser RPC 暂作兼容入口并调用同一服务。

A11g 已将 `computer.status/screenshot/click/doubleClick/type/key/scroll/move/wait/launch` 注册为 session scope 的 Host commands，并把旧 `computer.double_click` 明确映射为新 command ID `computer.doubleClick`。adapter 只依赖 ComputerUseService，继续执行原有应用授权、锁屏策略、坐标/文本边界、截图容量、超时与受管 native backend。点击、输入、按键、滚动、移动、等待和启动均声明为 `external`；动作开始后的取消、backend 超时、传输超时或断线返回 `RESULT_UNKNOWN`，status/screenshot 查询保留其原始失败码。CLI、REPL、TUI 和 typed Client 共用契约，旧 computer RPC 暂作同服务兼容入口。

A11h 已将 `git.info/status/diff/log/commit/branch/worktree/diffToRemote` 注册为 workspace scope 的 Host commands，旧 `git.diff_to_remote` 映射为 `git.diffToRemote`。adapter 只依赖 GitService，复用 workspace realpath/symlink 边界、pathspec/branch 校验、参数数组进程执行、输出上限、超时和成功后的观察通知。只读入口是 query；commit、branch 与 worktree 统一按 `external` 处理，动作进入后的取消、Git timeout 或丢失回执要求先查询 repository 状态。CLI 用 descriptor 解析 cwd、paths JSON、分页和 mutation 参数；A14 另行增加来源事实与 `git.stats`，本切片不把现有 log 推断成统计账本。

A11i 已将 `workspace.list/get/create` 与 `session.list/get/create/rename/archive/fork/export` 注册到 Host command catalog。create/fork 使用数据库 v4 的 actor-scoped 事务回执：同 key 同载荷在并发和重启后返回原 Session，异载荷或跨命令复用冲突；workspace.create 依靠规范 realpath 唯一键收敛。export 改为每页最多 500 个规范事件并要求游标前进，CLI/TUI helper 最多汇总 100000 条。AppRuntime 的 read-only DirectoryPort、CLI、REPL、TUI 与 typed Client 已切到统一命令入口。`session.snapshot/follow/unfollow` 保留为有界状态快照和连接订阅端口，它们不代表用户业务动作；`workspace.open` 在 B1 由客户端导航命令接入。

## 3. 预算切片保持现有业务语义

依据核对的 `plugins/budget/src/index.ts`：`session.setBudget <tokens>` 表示当前预算账本的总上限，不是追加 token，也不清零已用量。现有规则限制降低上限，并拒绝修改 completed/stopped 账本；重构先保留规则，领域错误明确返回。

A11j 补齐 `session.clearBudget`，并把旧 `budget.clear` 映射到同一 BudgetService 用例。clear 是收敛的持久命令：有活动账本时追加一次 `budget.cleared`，重复执行返回 `cleared: false`，不重放已经删除的预算事实。Host catalog、typed Client、CLI/REPL/TUI 共用定义；预算域至此不再需要写 RPC 作为主入口。

A11k 将 `permission.get/set`、`mode.get/set` 与 `provider.save/delete` 纳入 Host command catalog。权限偏好仍由 Kernel 设置事实持有，Session 模式继续写入 Plan 插件的 `mode.changed` 事件，供应商配置和凭据分别落入 storage 与 secrets 端口。保存响应只返回无凭据模型描述，删除返回可重复核对的 `deleted` 状态；CLI 的供应商保存通过结构化 `--input-json` 输入，密钥不进入 Session 事件或命令输出。

A11l 将诊断、路径、设备和配对管理发布为 `system.diagnose`、`system.paths.*`、`device.*` 与 `pairing.create`。契约包只保存可序列化 schema，Host adapter 通过注入端口组合 Kernel、Auth 与 socket 撤销通知；Client/CLI/TUI 不直接访问这些实现。路径 set 只写下一次启动使用的 pointer 并明确返回 `restartRequired: true`；当前 `system.restart` 如实返回 `accepted: false`，不声称已重启进程。设备撤销和配对码刷新均为可重复收敛操作。

A11m 将插件安装、配置、启停、卸载、扫描、依赖解析、图、lock、doctor、列表/详情和全局技能发现纳入 `system.extensions` command catalog。Host adapter 仅通过注入端口调用 Kernel/PluginManager 和 skills 根目录；包校验、受管路径、依赖回滚、scope 释放与 lock 完整性仍由原插件领域实现。安装及生命周期 mutation 声明为 external，连接丢失时 Client 返回 `RESULT_UNKNOWN` 并要求先用 `plugin.list` 核对；CLI/REPL/TUI 和旧短命令共用 typed Client。

A11n 将 `context.compact` 纳入 `run.approval` 命令域。命令复用 Kernel 的空闲门禁、模型解析、120 秒 provider 超时、usage 事实和 `context.compacted` 规范事件，并把 command cancellation signal 合入 provider signal。因为模型请求和持久提交可能已发生，执行中取消、超时或断线统一返回 `RESULT_UNKNOWN`，调用者必须检查 Session 的 compaction 事件或上下文投影后再尝试。

A11o 将 `connection.status/connect/disconnect/reconnect` 与 `pairing.accept` 定义为 client-execution commands。它们由 `@hbar/client` registry 执行，不进入需要认证的 Host catalog；因此未配对客户端可以用同一命令接受 pairing code。HbarClient 公开只读连接快照，并用 socket identity 隔离旧连接的迟到 close/message，显式断开会立即终止该连接的 pending 请求。远程 attach、命令描述和 CLI 连接入口共用这套契约。

A11p 补齐持久 `run.retry`。调用方只提交原 operation ID 与 Session；Host 从规范 Run 记录读取原 `modelId` 和完整输入，拒绝跨 Session 目标与尚未结束的 Run，再组合调用 `run.submit`。因此重试沿用唯一的受理、队列、预算、事件和 actor/idempotency 回执链，不复制运行逻辑。CLI 可显式重试；TUI `/retry` 从 Session 快照选择最近 Run，进程重启后仍可用，并且普通发送、停止和 Ctrl+C 也改走 typed run commands。

A12a 新增独立 `@hbar/usage` 事实库。每次模型请求以 step ID 作为稳定 attempt ID，持久记录请求开始、首供应商事件、首思考、首可见正文和最终 usage；usage ID 由 Run/Attempt/source 确定，可跨重建去重。事实同时冻结 provider/model、价格来源和版本、成本估算属性及缓存资格可用性。上下文压缩使用独立 compaction attempt；驱动无法观察其首事件时不补造 TTFT。顶层 input/output/cache/cost 字段保持兼容，预算和目标继续读取同一事实。

A12b 由同一包提供 UsageService，以 Storage 的有界事件页为读取端口，发布 `usage.query` 与 `usage.export`。查询支持 global/workspace/session（可含后代）/run scope、时间窗、模型/供应商/source 过滤、桶宽与最大样本；返回 token、按模型和时间桶聚合、窗口速率、p50/p95 attempt 时序、价格与缓存命中可用性及截断 gap。usage ID 去重后再聚合；未知或部分价格、缺少 cache eligible input 和历史缺少首事件均返回 null 与明确 reason。导出按稳定的结束时间/usage ID 游标分页。CLI、typed Client 与 Host catalog 共用契约。

A13a 新增独立 `@hbar/metrics` 采样库和注入式 PerformanceProvider。共享 collector 立即采样并按固定周期更新，限制间隔、样本数和输出点数；慢采样跳过而不重叠，淘汰或跳样在查询中形成 gap。Host OS adapter 用单调差值采集系统/Host CPU、系统/Host 内存和事件循环延迟，并注入活动/排队 Run；Linux 额外读取 procfs 线程、Host 磁盘和系统网络计数。平台没有可靠来源、计数器尚未预热或 managed child registry 尚未建立时返回 null 与具体 reason。

A13b 将 Host 唯一 PerformanceCollector 接入 `metrics.current` 与 `metrics.query`。Host 启动时立即取样，所有认证客户端读取同一个环；查询限制时间窗、桶宽与点数，返回进程身份、采样间隔、保留容量、当前值、聚合点和 gap/skipped。typed Client、CLI 和 command catalog 共用契约，不允许 CLI 或 View 直接读取本机 OS，远程连接因此自然展示远程 Host 数据。

A13c 增加 `metrics.watch/unwatch` 状态同步端口。只有显式订阅的已认证 socket 接收 `metrics.sample`；collector 以单调观测时间作为游标，最多补取 200 个样本，保留窗口越界或慢消费者溢出返回 reset。typed Client 在订阅应答前缓冲推送、按游标去重，重连后重新 watch 并补取断线样本；close 同时释放本地 listener 与 Host 订阅。

A14a 为提交来源建立规范事实。`@hbar/git` 在专用 `refs/notes/hbar-provenance` 中保存版本化 JSON，普通 Host command 明确记录为 `manual`，AI `git_commit` 工具根据真实 ToolContext 记录为 `auto`，并保存 session/run/operation 关联；没有该 note 的提交明确返回 `external`。读取不分析提交 message，损坏或未知版本的 hbar note 直接报错，避免把不可解释记录猜成外部提交。note 独立于工作树并在重启后保留，为后续统计与 rebase 可达性刷新提供审计来源。

A14b 发布 `git.stats`。`@hbar/git` 由受管 Git 子进程扫描有界 first-parent 历史，以 committer time/UTC 分桶，按 commit ID 去重，并分别累计 auto/manual/external、文件数、增删行、rename 与 binary 文件；merge 只计算相对第一 parent 的差异，binary 增删行返回不可用。索引按 repo/common-dir 与 HEAD 缓存：HEAD 未变时命中，fast-forward 只扫描新范围，rebase、amend 或分支回退时重扫当前可达历史，notes 中不可达提交的来源审计仍保留。提交数、输出字节、桶数和时间窗均有上限，进程接受取消；截断且查询触及未保留历史时返回 gap。

返回 limit、used、remaining、phase、revision 和 accountingVersion。当前用量结算为 `max(input - cacheRead, 0) + output`；重构核对供应商归一的缓存包含关系并版本化口径，不能把预算数字当作普通设置值。

预算耗尽限制发生在已有执行检查点，在途供应商消耗可能超出剩余额度；记录与说明实际检查时机，不因名称叫上限便保证绝不超额。降低上限、重置账本、改变消耗口径另立明确命令和迁移，不混在本次 adapter 中改变。

## 4. 可观测数据模块

| 模块                      | 数据源                           | 交付数据                                                                       |
| ------------------------- | -------------------------------- | ------------------------------------------------------------------------------ |
| Host performance service  | 受管 OS adapter、Host 自身计数器 | CPU、内存、进程树、线程数/可观测线程 CPU、磁盘读写、网络收发、事件循环、队列   |
| Execution metrics service | Run/Step/Attempt/ToolCall 事实   | 工具调用次数/耗时、活动/排队/并发、成功失败、总计耗时                          |
| Usage service             | 归一 usage 账本、Attempt 时间    | 输入/输出/cache read/write、消耗速率、模型用量、估算金额、TTFT、请求总响应耗时 |
| Git statistics provider   | Git diff/log、自动提交来源记录   | 自动提交时间柱状图、提交文件数、增删行数时间序列、repo 状态                    |

归一/聚合属于 Host 业务模块；OS 采集/价格表/Git 实现由公开 provider 端口注入。现有领域模块能承载时先就近分模块，不无理由新造 telemetry/analytics 大框架包。

所有查询支持 scope、时间窗、桶宽、过滤、单位和有界分页/最大点数。返回 `value | null`、availability/reason、source、estimated、sample count、gap、observedAt 与口径版本；缺失、无权限、平台不支持不能填 0。

## 5. 指标口径固定项

- CPU/进程/磁盘/网络区分整机、Host 和受管子进程。差分计数采用单调时钟，处理启动、重启、回绕；不能把整机 CPU 按 token 比例分摊给 Session。
- 线程信息按平台能力报告，区分线程数量与线程 CPU 时间；不承诺浏览器环境能采集完整 OS 线程/磁盘数据。远程连接默认显示远程 Host 的数据。
- 工具与请求并发分别计数。排队、模型请求、工具执行、审批等待与总 Run 时间分开，不将重叠区间简单相加。
- 用量按 usage/Attempt ID 去重，保留供应商、模型、Session 和父子 Agent 维度。单体与包含后代的查询分开，聚合避免重复计费。
- 结算 token 与流式估算分开；只有最终 usage 时不伪造逐秒真实 token。速率带窗口和来源，总消耗速率、输入速率、输出速率分别定义。
- 输入速率默认是时间窗接纳的 input tokens；没有供应商 prefill 数据时不称为模型预填充吞吐。输出速率按可靠 token 数与对应生成时段计算，估算明确标记。
- TTFT 记录 Attempt 发起、首供应商事件、首思考、首可见正文、结束；首字指标采用首可见正文定义，同时保留其他时间。超时/取消分组，支持 p50/p95；历史缺时间不得补造。
- 缓存命中率由兼容口径的总 cacheRead 除以 cacheEligibleInput；零分母无样本，不平均每请求百分比。未报告缓存资格输入时返回不可计算或有版本的明确估算。
- 估算金额基于带来源、币种、模型映射、版本和生效时间的价格表，区分输入、输出与缓存价格。未知价格为 null；不冒充供应商账单。
- Git 提交来源记录 `auto | manual | external` 与 session/run/operation 关联，不猜提交 message。按 repoId/commitId 去重，定义 author/committer 时间、时区与桶宽。
- merge 首版按第一 parent 统计并返回该口径；rename 独立识别，binary 不估增删行。rebase 后可达性变化需增量重索引，保留来源审计。统计自动提交不代表自动启用定时提交。

## 6. 容量、生命周期与可靠性

OS collector 由 Bun Host 管理，多个订阅共享采集任务；原生辅助进程只承担采集，不运行会话业务。采样频率、并发、进程数、队列、最大帧/批次和保留时间配置化，确定默认前用固定负载基准验证。

原始遥测使用有界缓存和保留窗口，长期趋势持久化分级聚合；使用量账本与提交来源事实按持久数据策略保存，不随遥测 TTL 删除。高频数据丢样显式 gap；持久业务事件按 P2 恢复。

历史查询分页/降采样，导出用受鉴权引用或流式结果。重型 Git 扫描/聚合不阻塞 Host 事件循环，通过 Worker/受管任务执行，支持取消与进度；增量缓存按 repo/revision 失效。

预算、用量、监控共享归一事实但各有计算责任；AIUsage 和图表不由组件自行累加。一个 Session panel 的订阅不触发全站广播所有历史。

## 7. 独立交付与验收

| 切片 | 交付与验证                                                       |
| ---- | ---------------------------------------------------------------- |
| P4.1 | 预算/会话最小命令贯通，保留领域语义，CLI/API 同结果              |
| P4.2 | 按运行审批、目标计划、文件附件、系统扩展逐域迁移；每域独立提交   |
| P4.3 | 子 Agent 完整父子关系/取消/预算闭环；区分已有迁移与新增能力      |
| P4.4 | Usage/Attempt 时序与查询；去重、缓存口径、价格版本、历史缺值     |
| P4.5 | OS collector 与 CLI 查询；平台差异、计数回绕、慢消费者、有界保留 |
| P4.6 | Git 来源与统计；merge/rename/binary/rebase、时间桶、取消扫描     |

使用临时数据库/仓库、本地 fixture provider 和确定时间源测试，不请求商业模型。至少一组真实 Host 采集 smoke 和 git fixture 集成验证数据来源。新能力只有数据服务与 CLI 可独立验收后才交给 P5 画图。
