# Desktop 项目组织：参考契约、共享持久化与侧栏入口

2026-09-26。基础提交 `8767e88` 交付 Host、Storage 和 Client 契约；后续 UI 纵切接入项目行隐藏、标题恢复和就近状态反馈。范围是侧栏可见性，不包含别名、排序，也不是旧客户端偏好的整体迁移。

## 参考依据与入口边界

参考仓库 `D:/Git/cc-haha` 基线 `e28d0a653481ef41b7a329411eeb2f0fd5656731`。重新装载原 `Sidebar`、`ProjectEditorModal`、主题和 store 的隔离夹具，验证 en/zh × 1440/320；另装载当前 hbar Shell、LumenProvider 与 public runtime，验证同样四组。两者都是实际组件 DOM，不冒充完整参考 App、真实 Host 或原生窗口。事实及截图见 [参考复核](../artifacts/project-organization-contract/report.md) 和 [八组观察](../artifacts/project-organization-contract/facts.json)。

- 原项目行更多菜单放 Edit、Pin、File Explorer、Hide；项目标题旁更多菜单放 Organize、Sort、带数量的 Restore hidden projects。
- Hide 只过滤侧栏，当前 session、active tab、全部 tabs/session IDs 不变。隐藏全部三个项目后，标题 Restore 仍可达；Restore 清除所有隐藏标记，不切换当前会话。
- 新操作沿用这个信息层级：项目动作在原行，集合动作在标题。标题与动作使用正常流式布局，菜单才是有证据的覆盖层；不得用截图坐标排列内容。
- 原版隐藏后焦点落 BODY、菜单方向键不移动、持久化错误被吞掉，这些缺陷不照搬。hbar 提供菜单方向键、Home/End、Escape 和常驻、可核对的反馈。
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

## 基础提交验证（8767e88）

已运行的定向检查：

- 新 Storage 16 项，连同既有 storage/run-failure-storage 共 24 pass、254 assertions；覆盖 v4 旧迁移、v6 双 Worker 迁移、两连接 CAS、相同 key 一次提交、重启、无操作、错误目标、数量/字节上限、revision 溢出、坏状态/回执、journal 插入失败事务回滚及下面的启动争锁。最终记录见 [存储回归](../artifacts/project-organization-preferences/storage-final.log)。
- Host/Client 故障边界：38 pass、139 assertions；错目标/损坏 ACK、读核对、零自动重试、预 abort 零 RPC、派发后 abort、未知 Worker 错误与明确拒写均有断言。
- 真实临时 Host/WS 集成验证两认证客户端共享与冲突、轻量通知、原目录/会话不变、lost ACK 仅原写一次、按 actor 核对、认证撤销、新 Kernel/端口恢复及不同 dataRoot 隔离。
- 基础单元的端到端操作不创建 Run，不使用付费模型，不触碰用户 Host。该提交尚未接线 UI；后续 UI 验证与这一历史记录分开。

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

### 基础提交前门禁的实际状态

- 本次 12 个 TS 文件严格 ESLint、14 个文件格式检查和 diff 检查通过；Web build 通过（3108 modules）。没有修改共享 UI 包或重建 Tauri launcher。
- 修复后的完整 `bun run test`：**2370 pass / 1 fail / 25509 assertions**，373 files、280.83s；本功能全部通过。唯一失败为原 `lumen-canonical-boundary`，列出未由本任务修改的 `QuoteAuthentication.tsx:native-visible-control` 和并行中的 `WorkspacePickerAuthentication.tsx:native-input`。见 [最终全仓日志](../artifacts/project-organization-preferences/full-test-final.log)。
- 根 typecheck 较早一次通过；最后检查被外部正在修改的 `tests/fixtures/hbar-app-ui-authentication-fixtures.ts:148` 的 TS1117 重复属性阻断。不能把早先结果当作当前全仓绿灯。
- 全仓 strict lint 被共享认证 `primitives.tsx` 中未注册的 `react/no-unused-prop-types` 指令阻断；该文件不是本次所有者范围，未擅自移除或修改。
- 首轮全仓还受到认证样式文件写入中的缺失导入影响（158 连锁模块加载错误）；文件由其所有者补齐后第二轮没有再出现。首轮同时发现的本功能数据库锁竞态已按上文实证修复，不能混同为外部问题。

上述遗留门禁如实保留；只提交本功能文件，不夹带或清除并行认证、工具脚本、样式、Tauri 与架构文档变更。

## 侧栏 UI 与导航边界

独立 runtime owner 使用既有 Zustand 状态层，负责 snapshot、单个待定意图、通知失效、单飞读取、断线/重连和 dispose fence。仅在确认 Host 身份后装配组织客户端，不另加 localStorage fallback。Shell 保留全部 canonical+pin 列表供新建会话选择器，只对项目树使用隐藏过滤投影；隐藏项不参与可见会话名册的自动刷新。

项目行提供 Hide，标题常驻菜单提供 Restore hidden projects(count)。数量来自完整 snapshot，不是当前目录第一页交集。全隐藏空态与真正无工程分开；未知/失败/已提交但刷新失败的反馈放在标题附近，不能随行消失。Hide 不导航、不关闭 tab、不清草稿/附件/dirty Files、不停止 Run；pin 保持独立。焦点只在本地原行消失且用户尚未主动移走时回到稳定入口。

显式打开／选择项目／创建会话成功可通过专属 owner action 解除隐藏，后台 hydrate、普通 tab 恢复、失败或取消打开不能写组织状态。解除隐藏失败不把已经成功的 workspace.open 伪装成打开失败。导航 generation、原始 snapshot 身份和 abort 信号共同阻止 A→B→A 后的旧意图重新显示项目；已经派发的写入仍须按原回执核对，不声称取消可回滚事务。

初次读取期间不闪现尚未确认可见性的项目；读取失败时明确说明临时显示已加载项目，保留只读刷新入口。后续失败保留上次确认的投影。状态反馈位于稳定标题附近，不随被隐藏的行卸载；ACK 已确认但 GET 失败显示“已保存”及独立读取错误，不声称行已经隐藏。其他客户端反向改动后，旧回执也不能继续显示与当前投影相反的成功文案。

写入和回执读取持有有界物理槽；即使逻辑等待取消／超时，适配器尚未结束时仍显示等待说明并禁用核对及新写入。只有原请求精确 receipt 可解锁 unknown；读取同值、空回执、错目标回执均不能解锁。失效事件至多合并一个后续读取，不回写观察到的状态。

项目菜单使用共享 Lumen 控件、本地语义 wrapper 和正常流式布局。补充方向键循环与 Home/End；原生延迟 toggle 仅在焦点仍属于打开它的 summary 时初始化菜单焦点，避免覆盖之后的 End、Tab 或其他界面的焦点。关闭仍由共享 Escape 行为处理。不透明菜单背景避免文字透出；不修改共享 UI 包的其他菜单。

所有可见文案由 Web 的 en/zh 类型化适配器提供，状态保存稳定 ID 而非翻译。项目树继续使用原工作台滚动区域及分页加载策略；隐藏集合独立最多 2000 个 ID，恢复计数不受目录缓存／第一页限制。短菜单随内容生长，不额外虚拟化。

已有 0→6 首次建库迁移不支持两个 Worker 同时首次创建同一文件，本次未扩大重构；只验证既有 v6 数据库的并发升级和已初始化库的并发访问。常规产品每个 Host 仍由已有 Storage Worker 持有数据连接。

## UI 纵切验证与实际限制

- Runtime、导航与 React 的五个定向文件：81 pass、501 assertions。覆盖 0/1/2000 和超限隐藏 ID、稳定原目标、单飞、连接/取消/销毁、unknown 精确核对、ACK 与投影分离、物理槽保留、显式导航防迟到，以及双语反馈。记录见 [定向验证](../artifacts/workspace-project-organization/focused-v4.log)。
- 最终真实临时 Host + 生产 UI 的浏览器验收 **8/8，34.4s**：en/zh × 1440/320 四组保留原会话、草稿、附件、dirty Files DOM/磁盘原文及 pin；另外双语 unknown/错目标回执/外部更新/晚到响应，以及双语延迟 toggle 的确定性回归均通过。全部 0 Run、0 文件写入/归档/取消。见 [最终浏览器日志](../artifacts/workspace-project-organization/browser/v4-keyboard-final/final.log) 与 [分轮证据报告](../artifacts/workspace-project-organization/browser/report.md)。
- 最终生产 Web 为 `index-CisI4tXi.js`、`index-DYZeDYfO.css`，3114 modules；同一资源进入 `dist/desktop-resources/web`。只刷新 Host/Web 与原生查询模块，没有重建 Tauri launcher，也没有发布或安装软件。仍有既有大 chunk 警告。
- 原生 WebView2 实测 en/zh × 900×600/1440×960 四组：隐藏当前项目、全部隐藏、稳定标题恢复、原会话和未发送草稿保留均通过。首阶段 13 次组织 apply、0 uploads、0 Run、0 Goal，未调用文件写入、归档、取消或模型准备命令；page/console errors 均为空。
- 保留同一新临时 dataRoot/profile，完全停止自己的第一条进程链，再占用已释放旧端口并重新启动已有 launcher：Host 由 `c351bd8e…:58222` 换成 `65176606…:53834`，revision 13 的隐藏设置仍在，随后真实 UI 恢复通过。见 [重启事实](../artifacts/workspace-project-organization/native/hbar-native-session-organization-xqZOQu/restart-persistence.json)。**这只证明 Host-owned 可见性跨重启，不证明旧 localStorage 的语言、layout、tabs 或草稿跨 origin 保留。**
- 原生 15 张截图留存；主线亲看宽窄菜单和隐藏全部后的恢复入口。验证与清理通过后，仅删除此轮新建的 `xqZOQu` profile 和 `0nmoJX` workspace，测试数据不可恢复、截图与记录保留；失败夹具目录未删除。没有查询或操作保护中的用户进程。详见 [原生报告](../artifacts/workspace-project-organization/native-report.md)。
- 首两轮原生失败分别是测试脚本把原生 summary 当 button，以及 900px 自动收起侧栏与脚本点击竞争；修正脚本定位/等待后才得到上述通过，未修改产品来迁就测试。浏览器另确实发现产品键盘竞态：Enter 后立即 End，被延迟 toggle 拉回第一项；V3 的同任务确定性实验在两语言下均复现，并证明它也会抢回外部输入框焦点。历史共享 `fa0b2b9d9b` 引入打开时无条件 focus first，本地首版包装只保护 ArrowUp 打开路径，遗漏已打开但 toggle 待派发的情况；此次在本地 wrapper 修正焦点所有权，不改变共享组件。
- 浏览器首版 toggle 探针监听在 target，被修复后合法的 capture 拦截阻止；改为 document capture 并设置 3s 上限，断言不放宽。另一轮中文草稿出现旧文+新文，trace 在 `fill()` 完成快照已见重复；增加释放 ACK 前的检查后有界五轮未重现，不据此宣称已修产品编辑器。最终测试改用真实键盘全选与输入，释放前后均严格比较原文，保留异常 trace 和各轮 JSON；产品 composer 没有改动。
- V4 根 typecheck、所改 TS 的严格 ESLint、Prettier、flow/content/icon guards 与 diff 检查通过。全仓 `bun run lint` 仍被外部认证 `primitives.tsx:44` 的未注册 `react/no-unused-prop-types` 规则阻断。
- 本次完整 `bun run test`：**2421 pass / 3 fail / 25819 assertions**，375 files、298.43s。本功能全部通过；三个失败为并行认证 invitation 的两项 DOM 行计数断言，以及 canonical Lumen 对 Invitation/Quote/WorkspacePicker 原生控件的边界断言。见 [全仓日志](../artifacts/workspace-project-organization/full-test-final.log)。不修改或夹带这些外部文件，也不将定向通过描述为全仓 check 全绿。

更广泛的别名、排序、全局会话查找及其公开能力边界仍是独立后续单元；本页不声明完整 Desktop 参考迁移已完成。
