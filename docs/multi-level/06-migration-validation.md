# P6：迁移顺序、验收矩阵与交付纪律

状态：实施中；A0–A10 已完成，A11 已开始逐领域迁移，第二阶段 UI 尚待实施。上级：[总计划](command-first-architecture-plan.md)。本计划将 P0–P5 转为可执行切片，所有代码切片均按[质量与交付](../../.agents/skills/hbar-engineering/references/quality.md)验证后立即独立提交。

## 1. 基线证据与迁移记录

2026-09-16 开始核对时 HEAD 为 `7ae9740`（原架构计划），上一实现提交为 `6248a95`。核对期间另一项工作提交了 `6ec3b46`，删除旧 Web 业务视图并挂载不连接 Host 的结构性 AppShell。已读取该提交及 Web README，确认它未交付新命令运行时；本计划将其作为新的外壳基线。开始时已有的 `docs/command-first-architecture-plan.md` 删除及其他未提交改动单独保留，不夹带本次提交。

| 已核对事实                                        | 证据位置/版本                                                            | 实施含义                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| 旧面板保存 `PaletteCommand.execute` 闭包          | `git show 7ae9740:apps/web/src/command-model.ts`                         | 新目录不能继续把 UI 闭包当领域执行器           |
| 旧共享 store 同时含 client、上下文、草稿和布局    | `git show 7ae9740:apps/web/src/stores.ts`                                | 按 P2 分所有者，不能只整体移动这个文件         |
| 旧 Web 有独立工作台命令描述                       | `git show 7ae9740:apps/web/src/workbench/command-descriptors.ts`         | 映射到规范 ID，最终由统一目录提供              |
| CLI 直接以分支调用多种 RPC                        | 当前 `apps/cli/src/commands.ts`                                          | 迁为语法/输出 adapter，业务归同一 dispatcher   |
| terminal 将 ID 转小写，contracts regex 只允许小写 | 当前 `packages/terminal/src/index.ts`、`packages/contracts/src/index.ts` | camelCase 需同步 parser/schema/SDK/贡献迁移    |
| 已有独立预算规则和结算                            | 当前 `plugins/budget/src/index.ts`                                       | 不借重构降低/重置预算或改变口径                |
| 已有结构性 AppShell/AppSidebar 生产出口           | 当前 `packages/hbar-app-ui/src/workbench.ts`                             | 可复用受控结构，完整绑定仍须验证               |
| Web 已挂载纯外壳，业务控件与原 store 已移除       | `6ec3b46`；`apps/web/README.md`、`apps/web/src/App.tsx`                  | 复用外壳；依历史清单补齐功能，不回填旧写入架构 |
| 严格 lint 与 TS 已接入当前配置                    | 当前 `package.json`、`tsconfig.json`                                     | 延续门禁，不沿用旧技能背景里“未接入”的状态     |

上表“当前”仅指本次规划观察，不承诺实施时仍相同。每个实施切片重新核对 status/diff/history，历史路径如已删除用 `git show` 查证，不通过重置工作树找代码。

实施时创建功能映射清单，最少列：

```text
featureId / 用户入口 / 历史实现位置 / 当前实现状态
canonical command/query / scope / target / 输入输出 Schema
状态所有者 / handler 所有者 / 只读投影 / CLI 支持 / 分类
权限 / 异步与恢复 / 旧 alias 或 RPC / 测试 / 删除条件 / 完成提交
```

覆盖按钮、菜单、快捷键、表单、窗口/子页面开关、RPC、CLI/TUI、插件贡献。普通内部 UI 行为也登记为明确豁免类别。未实现能力标为新增，不冒充已有迁移；已删除实现但无替代的功能仍是待完成。

## 2. 第一阶段的实际实施顺序

主题编号不等于流水顺序。先贯通实际业务，再扩展框架，不批量建立只有转发函数的空包。

| 顺序 | 子计划关联         | 一个可独立验收的切片                                            | 通过标准                                             |
| ---- | ------------------ | --------------------------------------------------------------- | ---------------------------------------------------- |
| A0   | P0.1 / P6          | 基线、逐功能映射、检查与依赖门禁                                | 确认已有改动归属、所有者、保留功能和失败基线         |
| A1   | P0.2 / P1.1        | commands 注册/目录/解析/typed invocation                        | 独立测试领域可运行，大小写/别名/输入校验有效         |
| A2   | P2.1               | runtime 只读状态、session.list/app.setSession                   | 两个无 React runtime 上下文互不影响                  |
| A3   | P1.2 / P4.1        | session.setBudget/getBudget + Host/CLI adapter + 持久短命令回执 | 复用账本、同目标同结果、幂等/CAS/未知结果核对        |
| A4   | P3.1 / P2.2        | 最小 Schema/Form、预算参数编辑器和薄 UI adapter                 | open 命令、只读字段、本地编辑、原目标提交、失败保留  |
| A5   | P1.3 / P4.2        | 长命令 operation、run.submit/cancel 与恢复                      | 受理/终态分离、重复/断线/崩溃、取消向执行端传播      |
| A6   | P2.3 / P1.4        | CLI/TUI/REPL、目录与旧入口兼容                                  | 无 GUI 的上述功能闭环；输出/退出码/非 TTY 行为明确   |
| A7   | P2.4               | 逻辑 surfaces、PlatformPort、GUI 定向控制                       | open/close 幂等，多窗口不串目标，无 GUI 返回不可用   |
| A8   | P3.2               | settings-core 三层解析与来源报告                                | null/unset、数组/keyed merge、允许层级可验证         |
| A9   | P3.3               | Schema callback/query bridge、动态内容                          | 类型化报告、依赖失效、取消/迟到/错误、无业务写副作用 |
| A10  | P3.4               | Host 设置原子 apply/CAS/迁移与 CLI                              | 上层冲突、保存/生效、路径/凭据、草稿保留             |
| A11  | P4.2 / P4.3 / P2.5 | 其余业务按领域完成迁移与投影                                    | 每域 CLI 可用、旧入口同用例、恢复正确，再提交下一域  |
| A12  | P4.4               | Usage/Attempt 数据与 CLI 查询                                   | 结算/估算、模型/缓存/价格/延时口径和去重             |
| A13  | P4.5               | 性能采集与 CLI 查询                                             | 真实样本、平台不可用、容量、进程/线程归属            |
| A14  | P4.6               | Git 来源、统计与 CLI                                            | 临时仓库验证自动提交来源、merge/rebase/行数、时间桶  |
| A15  | P0 / P2 / P6       | 旧 UI 写入路径封口与全命令检查                                  | 公开功能齐全、无 View 直写/写 RPC、无 GUI 综合验收   |

A11 至少按“审批问卷、目标计划、模型配置、文件附件、子 Agent、browser/computer、系统/插件/设备/路径”拆独立提交；不是一个大提交。A12–A14 都是新增数据闭环，不能以静态数据或仅有图表组件替代。

实施记录：A0 `664002a` 固定现状与边界门禁，A1 `b8d3029` 交付独立 commands 包，A2 `5931f46` 交付 runtime 选择与 Host 目录查询。A3 已接入预算命令定义、Host/SDK/CLI adapter 和预算事件内的持久回执；同一 actor + key 的请求按规范输入摘要去重，CAS 校验预算修订，丢失追加确认时会话进入 unknown 并要求重启后从规范事件重放回执。真实 Host/CLI 的重试、冲突、重启和故障注入均有测试。

A3 在 `c24ad92` 提交，A4 的无 UI schema-core 在 `3d5e9af` 独立提交。预算表单 runtime adapter 已实现原目标绑定、只读 Zustand 草稿、本地字段命令、Host 提交及未知结果回执核对，并用真实 Host 检查同一预算事实；GUI renderer 与逻辑窗口仍属于后续 A7/B1/B4，A4 不标记完整退出。

A4b 的预算表单 runtime adapter 在 `67a1867` 提交。A5a 以已有 Run 队列作为 operation，`run.submit` 的命令身份与受理回执随 `run.queued` 规范事实原子写入，`operation.get` 读取权威状态，按认证 actor + key 核对首次受理；取消与 watch 在 A5b、无 GUI CLI 入口在 A6 交付。

A5a 在 `187c991` 提交。A5b 为取消请求增加原子队列终态/活动态意图事实，Host 将取消传播到执行端；operation watch 从有界游标读取并在断线后重订阅。真实 Host 验证排队、运行中、重复取消、重连、无关事件过滤和 unwatch。CLI/TUI 路由仍由 A6 交付。

A5b 在 `58f0ee4` 提交。A6a 将 Host 命令目录与描述公开给 CLI，并让 Run 的受理、状态、取消和按键回执从无 GUI 入口调用同一命令定义；不配置模型也可查询目录。命名 context、更多业务命令和 TUI/REPL 统一仍待后续 A6 切片。

A6a 在 `a235f76` 提交。A6b 让 `app.setSession` 使用无 React app-runtime 解析目标，并按显式 `--context` 将选择原子保存到当前 Host 数据根；记录本机用户、Host 根和单调 revision，以 CAS 冲突阻止并发静默覆盖。读取 context 不要求模型，显式目标优先。通用 TUI/REPL 分派随更多领域命令继续迁移。

A6b 在 `0e729d1` 提交。A6c 组合 Host 与 client command 描述，增加行式 `hbar repl`，并让 REPL 与 TUI `/exec` 复用一次性 CLI 的 tokenizer、参数校验和执行函数。非 TTY REPL、直接点分 command ID、client `app.setSession` 描述和旧终端入口均有回归覆盖；旧短命令在 A11 各领域迁移时只保留语法映射。

A6c 在 `8dd58e2` 提交。A7a 在 app-runtime 内建立只读 surface 投影，panel 与 window 只能由类型化 `app.open*` / `app.close*` 命令改变。跟随面板在选择切换后更新目标，固定面板保留原目标；window 操作按 windowId 串行调用注入的 PlatformPort，失败不发布状态。无 renderer/platform 的 runtime 返回 `CAPABILITY_UNAVAILABLE`。Host 定向转发与客户端 capability/generation 属于 A7b。

A7a 在 `0f7cb83` 提交。A7b 增加已鉴权的 surface client 注册与定向 relay；Host 绑定 clientId、连接 generation 与白名单能力，以调用 ID 缓存短期结果并拒绝异参重用。替换、注销、断线、目标过载和超时均结束对应调用，Client adapter 只执行目标 generation 的通知。真实双客户端测试覆盖 CLI adapter、重复调用、能力拒绝、换代旧回调、注销与超时。

A7b 在 `dec53d9` 提交。A8 新增独立 `@hbar/settings-core`：以传入的有序 layer chain 解析设置，不硬编码 hbar 三层实体；缺省继承、显式 null、对象字段合并、普通数组整体替换、keyed tombstone/排序和允许层级均由纯函数验证。报告包含本层 presence/value、effective、整体及逐叶来源 revision、继承和 apply 状态；敏感定义只允许 secretRef 形态。包边界构建证明其不依赖 Host、React、Zustand、commands、contracts 或数据库。

A8 在 `fd3c953` 提交。A9 扩展 schema-core 的动态内容模块：编译具名 callback 与依赖 DAG，只向 callback 传声明依赖，以 Host/身份/作用域/Schema/依赖/搜索和游标隔离有界缓存。resolver 取消同表单旧 generation、限制并发并验证 options 的值类型、文本、去重、指纹、能力 revision 和容量；ready 空列表、unavailable 与失败保持不同语义。Kernel 注册表通过已鉴权 `schema.content.query/cancel` 暴露，Client port 将 AbortSignal 映射到 Host 取消；真实网络测试验证旧请求不能覆盖新依赖结果。

A9 在 `0f93778` 提交。A10a 将设置层与 actor/idempotency receipt 持久化到独立表，并在一个 SQLite 事务中核对完整父层版本向量、写目标层和回执。Kernel SettingsService 验证 scope 实体、精确 baseline、schemaVersion、ChangeSet 与候选 effective；重复同载荷返回原回执，异载荷冲突，父层并发不会产生半写入。测试覆盖 null/unset、原子多字段、不允许层、重启恢复，以及有序迁移注册；commands/CLI 在 A10b 交付。

A10b 将 `settings.get/set/unset/apply` 定义接入统一 Host 目录、认证 dispatcher、typed Client adapter 和共享 CLI/REPL/TUI 分派。CLI 的单字段写入支持显式版本向量，批量 apply 直接提交带 scope 的完整 ChangeSet；真实 Host 测试覆盖目录发现、按路径读取、继承、原子批量、幂等重试/异参冲突与禁止层，CLI 集成覆盖 set/unset/apply 且不要求模型或 GUI。至此 A10 的无界面设置闭环完成；Schema React renderer 仍属于 B3。

A11a 迁移审批与问卷写入口：`approval.resolve` 和 `questionnaire.answer` 使用类型化 session target，经认证 Host dispatcher 执行现有 Kernel 用例；CLI、REPL、TUI 和无头审批不再直接调用写 RPC。审批重复或相反决定收敛到首个持久终态，问卷拒绝错误 Session、过期和重复回答。真实 Host 测试覆盖目录、跨 Session 拒绝、拒绝工具写入、问卷恢复运行和重复提交；旧 RPC 保留为同用例兼容 adapter。A11 的其他领域继续分别提交。

A11b 迁移目标与计划：八个 `goal.*` / `plan.*` command 通过公开 GoalService/PlanService 调用原插件状态机，保留事件持久化、token/时间结算、expectedGoalId 冲突和 Plan schema。CLI 可在无模型环境创建、查询、CAS 编辑、改变状态及清除 Goal，并更新、查询和清除 Plan。真实 Host 测试覆盖重复创建、过期 Goal ID、跨 Session 隔离、Plan 空/清除收敛和查询核对；响应未知的非幂等写要求先查询再重试。旧 RPC 继续调用相同服务。

A11c 迁移模型选择与思考等级：`model.list` 暴露无凭据能力目录，Session get/set 命令把选择写入 A10 的分层设置事实。Host 在 SettingsService 候选提交前验证 Model 和 thinking capability；不兼容模型切换以单一 ChangeSet 修正等级。写命令使用 settings 原子回执、完整版本向量和 actor 幂等键。CLI/TUI/无头 Run 在没有显式覆盖时读取 Session 有效配置。测试覆盖通用 settings 绕过、无模型拒绝、能力拒绝、原子切换、同键重试/异参冲突、CLI 持久缺省与单次显式覆盖。

A11d1 迁移 workspace 文本文件和 artifact 元数据读取：`file.list/read/write` 与 `attachment.query` 进入 `files.tools` Host 目录、类型化 Client 和 CLI。文件操作继续复用 ExecutionProvider 的 workspace/符号链接边界及 2 MiB 限制；读取返回内容哈希，写入要求 SHA-256 baseline（`null` 表示必须新建），同目标命令写串行化，陈旧保存返回 `FILE_CONFLICT`，相同目标内容的未知响应重试收敛。CLI 可用 `--text` 或 `--input-file`，不需要先创建 Session。大二进制仍走已认证 artifact HTTP 传输，不进入 256 KiB command envelope；`attachment.upload` 的客户端命令适配、上传取消与草稿引用移除留在 A11d2，内容寻址共享对象不把“从草稿移除”误实现成物理删除。

A11d2 增加 client execution 的 `attachment.upload`：结构化调用只携带临时 source ID、文件元数据和预计算 SHA-256，`AttachmentSourcePort` 在客户端短生命周期内解析原始 `File`，上传字节仍走带认证和 AbortSignal 的 HTTP transport。handler 在传输前复核名称、类型、大小与内容哈希，Host 回执也必须匹配预期内容 ID；重复上传收敛到同一 artifact，响应未知可用该 ID 调 `attachment.query` 核对。CLI 将本地路径显式绑定为一次性 source，统一命令目录也发布上传描述。传输前取消返回 `CANCELLED`；传输开始后的取消返回 `RESULT_UNKNOWN` 并中止 fetch。artifact 是可能被多个消息引用的不可变共享对象，因此不提供破坏性的 `attachment.remove`；从提示词草稿移除附件属于后续 `draft.setAttachments` 的客户端应用状态命令。

A11e 新增子 Agent 领域插件与 `agent.create/list/cancel` Host commands。每个 Agent 是带 `parentId` 的独立 Session，创建事件保存 objective、model、子预算、request ID 和认证 actor 的幂等摘要；同 key 并发只创建一个子 Session，异参复用返回冲突，重启后从规范事件与 Run 投影恢复。子预算由 BudgetService 设置并独立结算；取消以最多 128 个 Agent 的有界后代树从叶到根传播。CLI/REPL/TUI 共用 typed adapter，测试覆盖并发重试、独立预算、错误父目标、重启恢复和父 Agent 对嵌套 Agent 的取消传播。

A11f 迁移 browser-use 的十个已有入口：契约包发布同源的 command descriptor 与 CLI 参数，Kernel adapter 仅依赖 BrowserUseService，Host 目录、typed Client、CLI/REPL/TUI 走统一执行路径。导航、点击、输入、按键和脚本求值声明为外部副作用，命令层允许这类 authenticated durable handler，并在 handler 已进入后把取消或超时报告为 `RESULT_UNKNOWN`；BrowserUseService 同时收到 AbortSignal，调用者用 status/snapshot/history 核对结果。测试覆盖完整目录与 effect 元数据、查询和释放、执行前取消、执行中取消传播、真实 Host 下的 CLI 导航/快照/关闭；原有 backend policy/timeout 测试继续验证浏览器能力本身。

A11g 迁移 computer-use 的十个已有入口，并按命名映射把 `computer.double_click` 提升为 `computer.doubleClick` command。Host adapter 通过 ComputerUseService 复用应用访问策略、锁屏门禁、容量限制和 native backend；typed Client 在 desktop external action 丢失回执时返回 `RESULT_UNKNOWN`，查询仍返回原始连接错误。CLI/REPL/TUI 从同一 descriptor 生成数字、文本、app target 和 scroll 参数。测试使用 fake service 覆盖全部动作映射、effect 元数据、执行前/执行中取消、backend/transport timeout；真实 Host CLI smoke 只读取 status，不在测试机器上触发点击、输入或应用启动。

A11h 迁移 Git 已有的八个入口，并把 `git.diff_to_remote` 规范为 `git.diffToRemote`。查询和 mutation 共用 GitService 的受限 cwd、pathspec、branch/worktree 校验、无 shell 参数执行、超时与输出容量；commit/branch/worktree 声明 external effect，断线或超时后的调用者通过 status/log/branch/worktree 查询核对，不自动重放。测试在临时真实仓库覆盖 status/log/diff、提交和列表，在 fake service 覆盖取消与 transport unknown；CLI smoke 验证无仓库时仍返回有界空状态。Git 来源记录、时间桶和 `git.stats` 保持为 A14 独立能力，未在迁移 adapter 中伪造。

A11i1 将数据库升级到 v4，增加 actor/key、command ID、payload hash 和原 Session 结果组成的实体命令回执，并把 create/fork 的业务事务与回执写入绑定。同 key 同载荷重放返回原对象，跨命令或异载荷返回 `IDEMPOTENCY_CONFLICT`；存储测试覆盖并发顺序、唯一子 Session 和进程重开恢复。

A11i2 发布 workspace/session typed commands，并把既有四个 directory queries 纳入认证 Host catalog。create/fork 强制 idempotency key；rename/archive 走 Kernel 用例并保留 active-run 门禁；export 使用 500 条事件分页和单调 cursor。AppRuntime DirectoryPort 改经 command transport 读取，CLI/TUI 的 new/fork/archive/export 不再调用写 RPC。测试覆盖完整目录、workspace path 收敛、create 并发/冲突、rename/archive 过滤、分页 export、同 actor 重启回执，以及显式 `hbar exec session.*`。snapshot/follow/unfollow 继续作为状态同步协议，`workspace.open` 留给 B1 客户端导航。

A11j 补齐预算域的收敛清除命令 `session.clearBudget`。命令复用 BudgetService 的串行账本写入和 Session 存在性检查；首次清除追加规范事件并返回 `cleared: true`，后续调用返回 `false`。Host catalog、typed Client 和 CLI 的点分入口使用同一契约，旧 `budget.clear` 仅作为兼容 adapter。

A11k 迁移供应商、默认审批权限和 Session 运行模式。六个 typed commands 只调用现有 Kernel/ModeService 用例；重复设置模式不追加事件，供应商删除收敛返回是否实际删除。Provider API key 只进入 secrets 写端口，command 输出与测试日志只包含 `hasKey`。CLI/REPL/TUI 的设置入口改用 typed Client，旧 RPC 继续作为同用例兼容入口。

A11l 迁移 Host 系统控制面：诊断、路径查询/验证/切换、重启能力报告、设备列表/撤销和新配对码进入认证 command catalog。Host adapter 以窄依赖接口组合 Kernel、Auth 和连接关闭回调；CLI 的这些命令不创建 Session，也不要求配置模型。测试使用临时 pointer 文件验证路径写入，覆盖重复设备撤销、配对码期限、无凭据诊断和 `system.restart` 未接入进程监管时的诚实结果。

A11m 迁移扩展管理。`plugin.list/inspect/set/install/scan/remove/enable/disable/resolve/graph/lock/doctor` 和 `skill.list` 使用可序列化契约、Host 依赖端口与 typed Client；CLI 的 `plugins`/`skills` 别名不再读取 bootstrap 或本地目录。真实临时插件包测试覆盖安装、配置、停启、依赖报告、lock、doctor、全局技能发现和停用后卸载；transport 测试区分 mutation 的未知结果与 query 的原始断线错误。

A11n 迁移上下文压缩：`context.compact` 进入 run command catalog，CLI/TUI 与旧 RPC 调用同一 adapter。Kernel 接受 command cancellation signal 并与领域 120 秒超时组合；typed Client 为 command transport 保留 300 秒响应窗口。真实 Host 测试先形成足够对话，再验证压缩投影缩短、原始历史不删除、规范事件只由领域用例提交；丢失响应报告未知结果。

A11o 完成客户端连接命令：连接状态、连接、断开、重连和接受配对码在 Client registry 中执行，Host 仅保留认证握手和配对 HTTP 边界。HbarClient 记录当前 Host 快照，旧 socket 的迟到事件不得覆盖新连接；disconnect 同步拒绝 pending 调用。真实 Host 测试覆盖未授权进入 pairing、接受一次性 code、连接态拒绝换绑、断开后凭据重连和显式 reconnect；CLI catalog 可描述 client command。

A11p 交付 `run.retry`：命令按 operation ID 读取已经持久化的原模型与输入，校验 Session 归属及原 Run 已结束，然后嵌套执行规范 `run.submit`。同 actor/key 的并发重试只产生一个新 Run，返回可恢复的 `run.submit` 受理回执；不同 Session 和活动 Run 明确拒绝。CLI 提供带幂等键的显式入口，TUI 不再用进程内最后输入模拟重试，并将普通发送与取消一并切换到 typed run commands。

A12a 建立可查询前的 Usage/Attempt 规范事实：`@hbar/usage` 根据实际请求模型生成带稳定 usage/attempt ID、计价快照与 accounting version 的记录；Pi driver 只在真实观察到首供应商、首思考和首正文时写时间标记。普通运行和 compaction 都写同一 usage 结构，旧预算与目标解析保持兼容。测试验证标记顺序、模型归属、去重身份、压缩用量以及未知价格不会被宣称为可计价。

A12b 完成 Usage 查询和导出闭环。Storage 用固定事件类型、时间范围、scope 与稳定游标执行有界 SQL；`@hbar/usage` 负责旧/新事实归一、usage ID 去重、后代聚合、价格覆盖、缓存资格、速率、模型分组、时间桶和 p50/p95。Host commands、typed Client、CLI 与 API 返回同一报告；超过事件/样本上限显式 `gap: true`。真实父子 Session、Run scope、过滤、分页导出和 CLI 场景均由 fixture provider 验证。

A13a 建立 `@hbar/metrics` 有界 collector 与 Host OS adapter。collector 对共享采样做容量、重入、跳样和时间桶管理；adapter 区分 system、Host 和尚不可归属的 managed child 数据。Windows 无可靠线程/磁盘/网络来源时明确 unavailable；Linux procfs 路径提供真实计数并在首个差分样本报告 warming up。纯 fake 测试验证平均聚合和保留 gap，真实进程 smoke 验证来源与平台差异。

A13b 发布 `metrics.current/query` Host commands。每个 Host 只启动一个 collector，关闭时释放 timer；命令输出包含动态进程 uptime、当前样本、有界桶、跳样数和保留 gap。真实认证 Host 与 CLI 测试验证目录、进程归属、当前内存、Run 队列和点数上限；视图不接触 OS adapter。

A13c 完成性能增量同步。`metrics.watch/unwatch` 复用 collector 环而不为每个面板创建采集器，只向订阅 socket 推送；Client 对初始响应与并发推送去重，并在连接换代后从最后游标补取。测试覆盖实时样本、断线期间继续采集、重连补取、无重复和关闭后停止通知。

命令并发、限流、幂等和依赖检查从首次涉及的切片实现，后续只扩充覆盖；不能延期到 A15 才第一次检查。A3 的短命令持久回执随业务事务落地，A5 再扩展长任务，不先提供误导性的“可恢复”空 API。

## 3. 第一阶段退出验收

在没有 React renderer、浏览器、Tauri 窗口的环境，用临时 Host 和测试 provider 完成：创建工作区/会话 → 选择上下文 → 设置模型/预算/分层配置 → 提交输入 → 工具/审批 → 取消/重试 → 查询目标计划/子 Agent/用量 → 文件/历史导出。

系统/插件/配对/路径等已有功能另做各自 CLI 闭环；动态选项和性能/Git 数据可查询。重新连接客户端，验证事实投影、预算与设置相同，窗口/当前选择各自独立。支持的 GUI 命令用显式目标客户端验证，无 GUI 时应返回明确不可用。

必须提供功能映射完成情况和依赖门禁报告。第一阶段结束不得留有“UI 仍可以直接修改业务状态”的例外；若旧视图保留，它也只能读状态并发命令。旧视图全删但能力缺失同样不能通过。

## 4. 第二阶段顺序

| 顺序 | 子计划关联  | 独立切片                                                 | 退出标准                                        |
| ---- | ----------- | -------------------------------------------------------- | ----------------------------------------------- |
| B1   | P0.4 / P5.1 | app-react 基础 + AppShell/Workspace→Session              | 滚动底栏、命令导航、布局恢复、窄屏/键盘         |
| B2   | P5.2        | AIChat/PromptInput/AIUsage                               | 真实发送/审批/取消/结算，异步和草稿保护         |
| B3   | P3.5 / P5.4 | Schema renderer + settings sidebar/form + ProviderDialog | 继承/动态内容/版本/保存失败完整                 |
| B4   | P5.5        | 分类命令面板 + 参数表单                                  | 命令可发现、typed 参数、目标/可用性/反馈一致    |
| B5   | P5.3        | 五类会话工具及已有扩展入口，逐工具提交                   | 原目标、切换/关闭/重开、业务闭环                |
| B6   | P5.6        | Performance、Usage、Git，逐分区提交                      | 数据真实、单位/空值/时间窗正确，查询/导出可对应 |
| B7   | P5.7 / P6   | 旧页面/样式/兼容写 API 删除，全平台回归                  | 功能映射闭合，严格检查、E2E、截图与桌面 smoke   |

若同一切片暴露缺失数据/业务接口，先回到 P1–P4 完成并独立验证该能力，再接视图，不能在组件内部补一段临时业务实现。

## 5. 验收矩阵

| 维度       | 必须验证的可观察结果                                                               |
| ---------- | ---------------------------------------------------------------------------------- |
| 框架可复用 | commands/schema-core/settings-core 无 hbar 领域、React、数据库也能运行；包依赖无环 |
| 命令一致性 | UI/CLI/TUI/SDK 同输入、权限和目标得到同结果/错误；表单和 CLI 不漂移                |
| 解析/目标  | 引号、空字符串、Unicode、Windows 路径、无效 flag、别名、重名、失效/归档目标        |
| 状态封装   | View/插件没有 writer/transport，嵌套引用不能污染 store；两 runtime 互不抢选择      |
| 表单       | 临时数值、IME、跨作用域草稿、提交期间继续编辑、关闭/重开、旧响应                   |
| 执行恢复   | 双击/重复键、同键不同参数、CAS、断线 unknown、崩溃、副作用核对、取消真实终态       |
| 设置       | default/unset/null、数组/keyed merge、来源、父层冲突、原子 apply、保存与生效分开   |
| 动态内容   | Provider/Model 切换、返回类型不符、循环依赖、权限、超时、空/失败、缓存隔离         |
| 同步       | snapshot/订阅衔接、重复/乱序/缺口/游标过期、连接换代、慢消费；恢复等于 Host        |
| 监控       | 单位/时间桶、usage 去重、缓存分母、费用版本、缺样、线程能力、Git 来源/历史改写     |
| 插件/平台  | 冲突/缺 renderer、作用域卸载、在途取消、权限撤销、无 GUI/浏览器弹窗限制            |
| 内容/UI    | 非默认语言、长文案、0/1/正常/边界/边界+1、失效/重复 ID、原对象回调                 |
| 交互/容量  | 桌面/窄屏、键盘焦点、滚动/分页/虚拟化、进度/错误就近显示、有界列表和图表           |

不以匹配实现源码或统计文件数量替代行为测试。对低风险文案修改不机械添加测试；本次架构涉及协议/状态/恢复，必须验证相应实际行为。

## 6. 检查与性能预算

当前根 `check` 已串行执行 lint、typecheck 与 Bun 基础测试。每个代码切片运行 `bun run check`；Web/UI 另运行 build 与相关 E2E/截图，协议/存储/并发增加对应集成及故障注入，桌面更改按[验证说明](../testing.md)执行构建和 smoke。

纯文档修改只检查变更文件 Prettier、相对链接、Git 差异；技能变更另运行 skill validator。此规划没有修改技能或实现，不声明执行过业务测试。

性能先分别测量本地命令、Host 受理、投影可见与任务完成。A0 固定环境、数据规模、采样方法；A2/A4 测本地 setSession/form.setField，A5 测 Host 命令与取消，A12–A14 测查询/采集成本。按既有基准报告 p50/p95/max、样本数、推送字节、队列/内存和 UI 提交耗时；在对应切片交付时写明预算与实测，不把模型生成耗时混入受理耗时。

明确每个队列、查询、文本增量批次、遥测保留和分页的硬上限。固定新增片段长度并扩大历史量，增量帧不能线性变大；慢消费者不能拖慢其他客户端。默认值在实测后固定，不凭计划文本宣称性能达标。

## 7. 删除、迁移和回退条件

一个旧领域入口只有在替代命令、CLI、只读投影、权限和恢复测试通过、调用方已转移后才删除。迁移期间旧 RPC/alias 只适配同一用例，不复制副作用逻辑。纯语法兼容可保留，旧 UI 可写 API 必须退出公开 SDK。

恢复布局/草稿带版本，损坏描述回到安全默认并保留可诊断原因；旧有效配置、会话历史与账本不因重建 UI 清空。持久 Schema/数据库迁移遵循事务、备份与版本校验，遇到未来版本拒绝写入；不可逆数据迁移不靠 git revert 声称恢复。

阶段切换可选择新旧 renderer，但只能连接同一个 runtime/command backend，不运行两套业务状态。回退 UI 不撤销已提交业务；未完成操作通过 operation/journal 核对。

当前存在其他修改时，不自动 reset/stash/删文件制造干净工作树。旧文件若被其他任务删除，仅做历史映射和必要替代，不擅自恢复。无法隔离某个文件的提交时如实记录原因，继续可以独立完成的工作。

## 8. 每个切片的提交记录

1. 开始前记录入口、目标、输出、状态所有者、公开契约和验收；查相关 Git 历史及当前差异。
2. 完成一项完整行为及适用的失败/恢复，不积攒已完成子功能。
3. 运行相应检查并记录实际结果；失败或未运行不能标通过。
4. 仅暂存该切片的明确路径/补丁，检查 cached diff、diff --check 与 status。
5. 立即独立本地 commit；正文记录目的、关键边界和真实验证。修复注明症状、证实原因及关联历史提交。
6. 检查提交内容及本切片无残留；保留用户/其他任务已有改动，不夹带提交或清理。

最后交付两个阶段的映射清单、包公开文档、Schema/命令扩展示例、CLI 文档与验证证据，并更新架构现状文档。完成计划文档与完成架构实施是两种不同结果。
