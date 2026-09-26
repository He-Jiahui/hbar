# Desktop 项目组织：参考契约与 Host 持久化基础

2026-09-26。此单元交付隐藏／恢复所需的 Host、Storage 和 Client 契约，**尚未接入侧栏按钮**。不是“项目组织 UI 已完成”，也不是旧客户端偏好的整体迁移。

## 参考依据与入口边界

参考仓库 `D:/Git/cc-haha` 基线 `e28d0a653481ef41b7a329411eeb2f0fd5656731`。重新装载原 `Sidebar`、`ProjectEditorModal`、主题和 store 的隔离夹具，验证 en/zh × 1440/320；另装载当前 hbar Shell、LumenProvider 与 public runtime，验证同样四组。两者都是实际组件 DOM，不冒充完整参考 App、真实 Host 或原生窗口。事实及截图见 [参考复核](../artifacts/project-organization-contract/report.md) 和 [八组观察](../artifacts/project-organization-contract/facts.json)。

- 原项目行更多菜单放 Edit、Pin、File Explorer、Hide；项目标题旁更多菜单放 Organize、Sort、带数量的 Restore hidden projects。
- Hide 只过滤侧栏，当前 session、active tab、全部 tabs/session IDs 不变。隐藏全部三个项目后，标题 Restore 仍可达；Restore 清除所有隐藏标记，不切换当前会话。
- 新操作沿用这个信息层级：项目动作在原行，集合动作在标题。标题与动作使用正常流式布局，菜单才是有证据的覆盖层；不得用截图坐标排列内容。
- 原版隐藏后焦点落 BODY、菜单方向键不移动、持久化错误被吞掉，这些缺陷不照搬。后续 hbar 接线须保留成熟菜单键盘行为和常驻、可核对的反馈。
- Alias、手动排序、全局最近／按时间组织属于其他独立功能；不能改真实目录名或用客户端第一页伪装全局排序。

参考 `5d9d1b00` 已把组织偏好迁到同一个 server 的配置文件；`a0afcc7e` 在该范围内增加别名。采用 Host/data-root 共享状态比仅在浏览器里新增 localStorage 更接近原版语义。

## 已证实的原持久化差距

实际 Edge/public-runtime 双窗口测试发现：现有 whole-envelope preferences 即使先 refresh，也能让两个并发 writer 都得到同 revision 的成功，其中一个无关 key 被覆盖；layout 也能由另窗旧状态覆盖先前栏宽。换 loopback 端口、或在同 origin 下换 Kernel instance 命名空间后，原偏好读不到。语言是独立 key，不在该覆盖中。

根因是 `client-persistence.ts` 只在单 runtime 内串行化，`ClientPersistencePort` 没有持久原子 CAS；Web adapter 以 origin 的 localStorage 保存。初始实现 `d6ce8f8`、恢复保护 `5f28ce9`、pins `84d8102` 都没有提供跨窗口 CAS。原生 Host 使用动态端口，Kernel instance ID 每次创建改变；这是源码核对，不是这个 Edge probe 的原生重启实验。证据见 [偏好审计](../artifacts/project-organization-preferences/audit.md) 和 [原始红测](../artifacts/project-organization-preferences/observations.json)。

本次不把整个 preferences envelope 迁到 Host，否则会意外共享标签、布局等原本不同作用域的数据。**旧 pins、appearance、layout、tabs、language 的作用域和缺陷保持原状，不能宣称已修复。**

## 新公开契约

契约入口：`@hbar/contracts/commands/workspace-organization`。通过既有 `createWorkspaceSessionCommandClient`、Host `command.execute` 和工作区命令组合注册，不增加传输通道，不修改 Controller 的业务规则。

| 命令                            | 输入                                                               | 结果                                                 |
| ------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| `workspaceOrganization.get`     | `{}`                                                               | `{ schemaVersion: 1, revision, hiddenWorkspaceIds }` |
| `workspaceOrganization.apply`   | `{ expectedRevision, change }`，调用 options 必须带 idempotencyKey | 原操作的 durable receipt                             |
| `workspaceOrganization.receipt` | `{ idempotencyKey, request: 原 apply input }`                      | 当前认证 actor 的精确 receipt，或 null               |

`change` 为 `setHidden { workspaceId, expectedHidden, hidden }` 或 `restoreHidden`。Workspace ID 是稳定实体身份；名字、路径、当前导航选择都不是写入目标。`apply` 同时检查集合 revision 和捕获的 item 状态，冲突明确返回，不能静默覆盖别的窗口。

Snapshot 使用 2000 个唯一 ID 与 128KiB UTF-8 编码双上限；ID 沿用 160 字符界限。超限拒绝整个写入，不截断、不驱逐旧 ID。读到未来版本、重复 ID、非法 revision 或坏 JSON 时失败关闭，Restore 不能以空默认值覆盖它们。目录缓存未包含某 ID 不等于项目删除。

Receipt 为 `{ commitId, revision, request, changed }`，不复制整个 snapshot。它只证明原写入，不代表当前状态：后续窗口可能已经完成另一修改。其 revision 必须等于原 expectedRevision 加上实际变化量（0 或 1）；setHidden 的 changed 必须符合捕获的前后值。

Host 和 Client 都校验 receipt 格式、revision 语义及完整原请求。合法格式但错项目、错版本或错 change 的回执不能确认成功。内部命令只标记 API surface，暂不在 CLI／palette 可见目录加入缺少产品文案的新条目；真实 WS `command.describe` 仍可查询契约。

## 原子性、恢复与生命周期

- 独立 `workspace_organization_state` 和 `workspace_organization_receipts` 表；数据库 schema 6→7 增量迁移。不会写 sessions、workspace 名称/路径、settings layers 或 pins。
- Storage Worker 的 `IMMEDIATE` 事务先核对 actor/key/exact request 的旧回执，再执行 CAS、容量校验以及 state+receipt 原子提交。即使当前 revision 已变化，完全相同的重放也只返回原 receipt，不回滚当前投影。
- 同 actor/key 换 payload 返回 `IDEMPOTENCY_CONFLICT`；另一个认证 actor 不能读取这个回执。客户端 options.actorId 无法替代 Host 连接的认证身份。
- 无操作也有 durable receipt，revision 不增加，但仍检查 expectedRevision/expectedHidden。hide=true 要求项目存在；unhide/restore 允许清除已失踪的 ID。
- 只有验证完成且事务已提交后才发送 `host.changed { kind: 'workspace-organization' }`。不广播整个隐藏集合。重放可能再次发失效通知；消费者必须幂等地读取最新版本。
- 格式坏／错目标／SQL／Worker／丢失响应的写入结果保留 `RESULT_UNKNOWN`；确定拒写码为 `COMMAND_CONFLICT`、`IDEMPOTENCY_CONFLICT`、`INVALID_INPUT`、`NOT_FOUND`、`INPUT_TOO_LARGE`、`VERSION_MISMATCH`、`INVALID_STATE`。
- Unknown 只能保留原 key/request 只读核对。**receipt=null 不是“没有执行”的证明**，不能自动换 key 再写；其他窗口刚好产生同一布尔状态也不是原写的证明。
- 预先已 abort 的组织请求不发 RPC；派发后取消等待不承诺撤销 Host 写入。复用既有 Registry 的容量、超时和 durable 边界。

持久 snapshot 随 dataRoot，不随 Web origin、Kernel instance 或认证设备变化。回执则明确属于原 actor；重启集成测试复用了原认证令牌，不宣称新的桌面认证设备能读取旧 actor 的 receipt。不同 dataRoot 相互独立。

## 验证

已运行的定向检查：

- 新 Storage 16 项，连同既有 storage/run-failure-storage 共 24 pass、254 assertions；覆盖 v4 旧迁移、v6 双 Worker 迁移、两连接 CAS、相同 key 一次提交、重启、无操作、错误目标、数量/字节上限、revision 溢出、坏状态/回执、journal 插入失败事务回滚及下面的启动争锁。最终记录见 [存储回归](../artifacts/project-organization-preferences/storage-final.log)。
- Host/Client 故障边界：38 pass、139 assertions；错目标/损坏 ACK、读核对、零自动重试、预 abort 零 RPC、派发后 abort、未知 Worker 错误与明确拒写均有断言。
- 真实临时 Host/WS 集成验证两认证客户端共享与冲突、轻量通知、原目录/会话不变、lost ACK 仅原写一次、按 actor 核对、认证撤销、新 Kernel/端口恢复及不同 dataRoot 隔离。
- 实际新端到端操作不创建 Run，不使用付费模型，不触碰用户 Host。原生 UI 尚未接线，因此没有本功能的 Tauri UI 验收。

可复现命令：

```text
bun test tests/workspace-organization-storage.test.ts tests/workspace-organization-boundary.test.ts tests/workspace-organization-commands.test.ts --timeout 20000
bun test tests/workspace-session-commands.test.ts tests/session-fork-receipt.test.ts tests/storage.test.ts tests/run-failure-storage.test.ts --timeout 20000
```

Host 测试另含本机 40 次读取和 40 次事务提交的延迟采样，输出 p95/max；交互目标为 p95<100ms，测试负载容忍上限为 p95<1000ms。Windows、Bun 1.4.0、Ryzen 7 7700X、16 逻辑处理器、31GiB 内存，本次定向样本读取 p95/max 为 0.539/0.687ms，提交为 1.166/2.212ms。测量从 Client 调用到 WS 响应，不包含模型推理或将来的 React 重绘，不能作为所有部署环境的性能承诺。定向 Host + workspace-session + fork receipt 共 10 pass、130 assertions，记录于 [真实 Host 测试](../artifacts/project-organization-preferences/host-tests.log)。

### 全仓暴露的并发启动竞态

第一次完整测试在 v6 双 Worker 打开时捕获 `database is locked`，约 161ms 就失败，没有按配置等待 5s。历史追踪 `fb64989` 的初始化顺序为先配置 WAL，再配置 busy_timeout，因此初始争锁发生时等待策略还未生效。

新增实际 SQLite `BEGIN EXCLUSIVE` 持锁 500ms 的测试，以及 20 轮双 Worker 打开/升级/CAS 测试；未修版本二者均失败。最小修复只把 `PRAGMA busy_timeout=5000` 提前单独执行，之后仍设置原 WAL、foreign_keys、synchronous。没有无限重试，没有降低迁移/CAS 验证。修后两个测试 2 pass、105 assertions；原始 [红证据](../artifacts/project-organization-preferences/startup-before.log) 和 [绿证据](../artifacts/project-organization-preferences/startup-after.log) 保留。新 v7 事务仍在取得锁后重新读取版本。

这也符合 SQLite 对[连接级 busy handler](https://sqlite.org/c3ref/busy_timeout.html)及[WAL 打开／恢复仍可能遇到 BUSY](https://sqlite.org/wal.html#sometimes_queries_return_sqlite_busy_in_wal_mode)的说明；没有由此宣称所有磁盘或进程故障都可恢复。

### 提交前门禁的实际状态

- 本次 12 个 TS 文件严格 ESLint、14 个文件格式检查和 diff 检查通过；Web build 通过（3108 modules）。没有修改共享 UI 包或重建 Tauri launcher。
- 修复后的完整 `bun run test`：**2370 pass / 1 fail / 25509 assertions**，373 files、280.83s；本功能全部通过。唯一失败为原 `lumen-canonical-boundary`，列出未由本任务修改的 `QuoteAuthentication.tsx:native-visible-control` 和并行中的 `WorkspacePickerAuthentication.tsx:native-input`。见 [最终全仓日志](../artifacts/project-organization-preferences/full-test-final.log)。
- 根 typecheck 较早一次通过；最后检查被外部正在修改的 `tests/fixtures/hbar-app-ui-authentication-fixtures.ts:148` 的 TS1117 重复属性阻断。不能把早先结果当作当前全仓绿灯。
- 全仓 strict lint 被共享认证 `primitives.tsx` 中未注册的 `react/no-unused-prop-types` 指令阻断；该文件不是本次所有者范围，未擅自移除或修改。
- 首轮全仓还受到认证样式文件写入中的缺失导入影响（158 连锁模块加载错误）；文件由其所有者补齐后第二轮没有再出现。首轮同时发现的本功能数据库锁竞态已按上文实证修复，不能混同为外部问题。

上述遗留门禁如实保留；只提交本功能文件，不夹带或清除并行认证、工具脚本、样式、Tauri 与架构文档变更。

## 下一 UI 纵切的固定边界

独立 Zustand/runtime owner 负责 snapshot、单个待定意图、通知失效、单飞读取、断线/重连和 dispose fence。Shell 保留全部 canonical+pin 列表供新建会话选择器，只对项目树使用隐藏过滤投影。

项目行提供 Hide，标题常驻菜单提供 Restore hidden projects(count)。数量来自完整 snapshot，不是当前目录第一页交集。全隐藏空态与真正无工程分开；未知/失败/已提交但刷新失败的反馈放在标题附近，不能随行消失。Hide 不导航、不关闭 tab、不清草稿/附件/dirty Files、不停止 Run；pin 保持独立。焦点只在本地原行消失且用户尚未主动移走时回到稳定入口。

显式打开／创建成功可通过专属 owner action 解除隐藏，后台 hydrate、普通 tab 恢复、失败或取消打开不能写组织状态。解除隐藏失败不得把已经成功的 workspace.open 伪装成打开失败。接线后需重新做真实 Host 双窗口、en/zh 宽窄、焦点和原生验收；此基础提交不提前声称这些 UI 行为已实现。

已有 0→6 首次建库迁移不支持两个 Worker 同时首次创建同一文件，本次未扩大重构；只验证既有 v6 数据库的并发升级和已初始化库的并发访问。常规产品每个 Host 仍由已有 Storage Worker 持有数据连接。
