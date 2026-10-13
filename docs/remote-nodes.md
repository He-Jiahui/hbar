# 远程工作区节点

本功能采用两种角色：对话节点保存会话、模型凭据、审批、沙盒快照和工具意图；工作区节点保存共享根目录、本地底线、执行回执与独立审计，并在执行前复核权限。工作区节点默认主动连接对话节点。普通对话节点保留本机执行，可显式关闭。

这是实现与验收记录；尚未完成的项目不代表当前可用能力。

## 当前 CLI 工作流与交付状态

同一个 `hbar` 程序承载两种角色。默认 `hbar serve` 保持混合模式；`hbar serve --role conversation` 启动对话节点，可添加 `--no-local-exec` 禁止 A 本机工具执行。B 用 `hbar serve --role workspace --home <B数据目录> --join <A地址> --code <8位码> --fingerprint <A指纹>` 首次加入。握手验证并固定 A 的 Ed25519 公钥与指纹后，B 将连接身份保存在自己的数据目录；后续启动 `hbar serve --role workspace --home <B数据目录>` 会自动重连。

在 B 本机生成控制台配对码：`hbar node pair --name <设备名> --role operator`，观察者使用 `--role observer --root <rootId>`，可重复提供 `--root`。该命令只访问 B 的本机 `control.json` 控制通道，不使用 A 的凭据。然后运行 `hbar attach <B-url> --code <8位码>`；首次配对之后，CLI 将 B 专属的 Ed25519 私钥保存在其数据目录下的 `node-console/`，POSIX 文件权限设为 0600，并按 B origin 与 node ID 分开保存。后续可直接 `hbar attach <B-url>`。CLI 固定 B 指纹，指纹变化时拒绝使用旧密钥。B 的 `/node-info` 只公开角色、协议版本、节点 ID、指纹和固定 RPC/控制台路径；A 没有该资源时返回 404，attach 继续使用原 A WebSocket 流程。非 loopback B 地址必须使用 HTTPS；loopback 开发地址可使用 HTTP。

```powershell
# A：首次启动时记录命令输出中的 A 指纹
hbar serve --role conversation --no-local-exec --host 0.0.0.0 --port 4317 --cert <A证书PEM> --key <A私钥PEM>

# A 的另一终端：创建一次性链接码，替换下方示例中的八位码
hbar exec node.invite --name build-box

# B：独立数据目录，共享根由 B 本机操作员设置
hbar node share D:/Projects/engine --id engine --access write --home D:/hbar-node
hbar serve --role workspace --home D:/hbar-node --join https://a.example:4317 --code 12345678 --fingerprint SHA256:<A指纹>

# B 本机：为观察者创建只读、限定到 engine 根的配对码；在 A 上 attach 不能代替此本机步骤
hbar node pair --name reviewer --role observer --root engine --home D:/hbar-node

# 操作员或观察者客户端
hbar attach http://127.0.0.1:4318 --code 12345678
```

attach 的 B 控制台可读取节点状态及其绑定会话的分页列表、快照和持久事件增量。观察者只能观察其配对根目录覆盖的会话，不能审批、发送消息、读取操作员策略/审计或控制进程。操作员还可查看审计与底线策略、暂停/恢复节点、终止进程。A 上的工具审批仍由 A 的会话所有者完成；B 的本地执行确认是另一个独立策略，两者不会相互授予权限。终端能力默认关闭，只有 B 本地底线显式开启时才可请求。

对话节点可创建远程工作区：`hbar exec workspace.create --node <节点名或ID> --root <rootId> --name <名称>`。A 保存 `hbar-node://<nodeId>/<rootId>` 定位符；本机路径入口拒绝把它当作本地目录。会话和其子会话按工作区位置限定观察。B 生成的 managed worktree 以会话、目标 revision 和 B 分配的 worktree ID 绑定；同一根目录被重指向、Session 或 revision 不匹配时，操作会失败关闭。Remote `shared-current` 与 `isolated-worktree` 可用；`shared-branch` 目前由 Kernel 在入队前以 `REMOTE_SHARED_BRANCH_UNSUPPORTED` 拒绝，直到 B 端能够安全准备共享 checkout 并固定分支起点。

副作用操作的 B 回执最多保留 7 天、总量上限 10,000 条。同一 operation ID 不会重复执行；如果 A 无法确定原操作是否完成，会返回 `EFFECT_UNKNOWN` 并要求对账，不能换新 ID 自动重放。进程输出采用有界序号流、信用窗口与保留游标；超出保留范围时客户端必须重置/重新读取，不会把无界累计输出塞入单帧。单帧文本最多 64 KiB，普通执行输出缓冲最多 256 KiB；终端输出也采用独立有界流与恢复游标。

当前平台证据仅代表实际执行的环境：Linux WSL2 上真实 A/B managed backend 已在 A 使用 `--no-local-exec` 的情况下验证远程工作区创建、读取、写入和同 Session worktree 复用；远程 Git 查询验证了 `main` 与 `feature/remote-e2e` 分支。独立 managed worktree 生产测试验证 create/get/reuse/remove，B 本机确认路径验证通过。Workspace mounts 的 B 端契约、Storage 与隔离执行基础已实现；`e2e/workspace-location-picker.spec.ts` 的真实 A/B UI 保存、删除、重开/reload 与 Host folder get 已通过，commit `720b7b2c` 的验收 1/1、26.4 秒；同一场景还验证重叠状态禁用、独立 observer 只读控件，49 字符英文 root 名称在 390px 下换行且不溢出。父代理人工检查了 picker/folders/observer 的 390px 与 created 状态 1440px 视图。A 侧自动清理已分配的远程 worktree 引用尚未接入 Storage 原子释放路径；目前明确不支持自动 release，B 的受保护 allocator remove 可由 B 本机操作员执行。Linux 容器计划测试通过，但没有安装可用于正向验证的 Docker/Podman，因此容器后端没有 live proof。Windows 最新原生构建和探针使用默认配置（未设置 HBAR 覆盖）运行 16 项测试、52 个断言；filesystem 与 processTree 能力为 true，network 为 false、available 为 false，nonce 握手以 exit 45 失败，所以需要网络隔离的进程仍失败关闭。macOS/Seatbelt 未在实机验证。SSH stdio 与 Noise 中继仍是未实现的可选扩展。

远程输出 UI commit `65479dd3` 的 strict index 覆盖 3,643 个文件；13 个输出 UI 源文件和 10 个 fixture 文件通过类型感知 lint，相关单测为 36 项/405 assertions，受影响 fixtures 为 86 项/1,021 assertions，Web build 通过。受控真实浏览器输出 fixture 在 en/zh 与 1440/390 视口组合下 4/4 通过并经人工检查。恢复验收夹具修复单独提交为 `924717e2`；在运行时 commit `53f789cb` 上实际验证 SIGKILL、宽限清理、A 重启后 `EFFECT_UNKNOWN` 且不重放，1/6 assertions、66.37 秒通过，没有重放副作用。

A 节点设置 UI commit `633d20033623398515b57fba288e8f708c349440` 已通过严格 TSC（3,575 文件）、定向类型感知 lint（0 警告）、7 项测试/35 assertions、内容 guard、3 个 icon 文件、格式检查和生产构建。3 项真实 Nodes Settings E2E 在隔离的 A/B 端口 4330/4318 验证分页、撤销、observer、剪贴板及重载后恢复分组；1440px 与 390px 视口已人工检查。

Workspace UI commit `720b7b2c10ebd0f8a7b21731a0b0129d155e9aba` 的 strict index 覆盖 3,658 个文件；25 个 TS/TSX 类型感知 lint 文件 0 warnings，7 个 model/runtime/SSR suites 共 46 项/270 assertions（含 `session-decisions-react`），41 个临时 React links 均恢复。内容、icon、flow guards 和 Web build 通过；没有新增 Prettier 失败（3 个既有基线失败仍在 App、web-session-host、app-runtime/index）。Playwright 真实 A/B E2E 1/1、26.4 秒，验证只读 root 创建、固定位置、同节点目录保存/删除/reopen 与 Host get、重叠禁用及独立 observer 只读控件。49 字符英文 root 名称在 390px 下换行且无溢出；父代理人工检查 picker/folders/observer 的 390px 和 created 的 1440px 截图。未验证中文 workspace 浏览器流程或 Windows process 正向能力。Terminal UI 已由 commit `b502af7383905f5510aeb34b4b2419a0e6781d13` 的 operator local PTY E2E 验证。当前最终生产图 Linux live proof 已在 Ubuntu 24.04.3 WSL2/bwrap 0.9.0 通过 26 项/138 assertions，包含最终源码图上的 SIGKILL 恢复。Root `bun run check` 已在实现 HEAD `2d0658338e0ccf2bd2b0d980b3238aaae9ad149f` exit 0；全量 lint 3,984 文件/63 批、TSC、evaluator、theme checks 通过，基础测试 6,632 pass/11 skip/0 fail、68,841 assertions，Lumen 84/84。Windows 环境下按平台条件跳过的范围见验证说明。

## 实施顺序

- [x] 本地隔离链路：SDK、shell、插件进程的校验和上下文重建保留隔离要求；缺少后端时拒绝启动。
- [x] 共享判定器：`@hbar/sandbox` 保存规则、命令解析、调用判定及规范化快照摘要；文件系统与路径语义通过 `SandboxPathPort` 注入。判定器指纹由实际源码生成。
- [x] 节点协议、工作区位置与设备角色契约：两张独立方法表，严格输入，分块文件传输契约；持久化、工作区位置和设备授权已接入。
- [x] 观察者授权：只读 RPC 白名单、命令元数据与工作区范围；拒绝提交消息、审批、终端和写命令。迁移 26 保存设备角色与范围，邀请由操作员指定权限；HTTP 上传与全局附件读取受限，使用有作用域的 resource-media 读取。
- [x] 工作区节点基础：共享根目录、不可远程修改的底线、保护路径、幂等回执、审计与本机控制接口；B console pair/CLI 已接入。
- [x] 专用 `/node` 链路：邀请、固定 Ed25519 公钥指纹、双向挑战、撤销、心跳与重连。
- [x] 执行路由基础：`hbar-node://` 定位符、本机服务守卫、所有者路径解析、最终参数及快照复核；Linux 的真实隔离 A/B 验证覆盖创建、读写与同 Session worktree 复用。
- [x] 生产恢复验收：commit `53f789cb` 运行时图配合恢复测试夹具 SHA-256 `00719d9a62d2683e342b61f35a0ff1182d1fc2bf5630e4253f47d70ecb7013ad`，真实 Linux A/B SIGKILL、B grace cleanup、A 重启对账为 `EFFECT_UNKNOWN` 且仅执行一次，1 项测试、6 个断言、66.37 秒通过。首次失败是夹具使用 B 私有 `/tmp` 看不见的绝对路径；夹具改用 B workspace cwd 相对路径后通过，未改生产恢复代码。
- [ ] OS 隔离：Linux bwrap 有实机验证；Windows 文件系统/Job 已测试但网络探针不可用；容器未实测，macOS/Seatbelt 未验证。
- [ ] 远程能力剩余项：A/B Git 分支查询及 B managed worktree create/get/reuse/remove 已验证；搜索路由存在。Remote `shared-branch` 在 Kernel 入队前拒绝，A 自动释放 worktree reference 明确尚不支持；B 侧受保护 allocator remove 已实现。节点终端实现可由 B 底线控制，默认关闭。
- [x] 界面：B 控制台及其只读观察可用；A 节点设置分页、撤销、observer、剪贴板与 reload 分组由 3 项真实 E2E 验证；mount 的保存/删除/reload、Host folder get 和 observer 禁用状态通过真实 A/B E2E。Terminal local PTY E2E 与 workspace UI 真实 A/B E2E 已通过；证据及视口范围见上文。Root 完整检查已 exit 0，详细计数与跳过边界见[验证说明](testing.md#远程节点验证)。

SSH stdio 和 Noise 中继属于附件中的可选扩展。

执行核心已有 `WorkspaceNodeService` 与独立 `NodeStateStorage` Worker：底线与真实路径复核、有界启动、持久执行/写入回执、断链宽限期和审计可单独验证。身份模块提供 Ed25519 指纹与带双方身份、挑战及方向的签名。

源码 CLI 支持 `hbar serve --role workspace`；节点使用独立数据根，默认 `~/.hbar-node`，可用 `--home` 指定，不打开 A 的会话 Storage 或模型凭据。本机控制接口默认只监听 loopback，公共控制台不接受 bootstrap bearer。`hbar node` 提供共享、底线、状态、暂停、取消、审计、解除链接及 B 本机 `pair` 命令。B Web 控制台和命令行控制端使用独立设备配对；A 的凭据不能用于 B。

```powershell
bun apps/cli/src/main.ts node share D:/Projects/engine --id engine --access write
bun apps/cli/src/main.ts node policy show
bun apps/cli/src/main.ts serve --role workspace --listen 127.0.0.1:4318
bun apps/cli/src/main.ts node status
bun apps/cli/src/main.ts node pause
bun apps/cli/src/main.ts node resume
bun apps/cli/src/main.ts node audit
```

每次进程执行具有独立的原生进程树所有者，结束、取消和故障必须确认后代退出。受管后端按实际能力和底线执行隔离，能力不足时拒绝进程启动；节点不会因 `osConfinement=off` 绕过始终存在的数据目录和凭据保护。当前平台的 live proof 与不可用能力见本页“当前 CLI 工作流与交付状态”；不能把某个平台的测试结果外推到其他系统。

对话节点的节点登记现由迁移 27 保存，身份私钥、公钥、登记信息和吊销记录与操作员设备表分开。一次性邀请在内存中最多保留 128 个，五分钟到期，加入尝试按来源限流；并发加入只能消费一次。已吊销的公钥保留记录并拒绝重连或重新配对。

节点端的方法处理器现覆盖共享根目录解析、分块文件读写、回执版本、恢复、搜索和执行入口，并已接入专用链路。部分上传有 32 个任务和 16 MiB 总容量限制、30 秒空闲期限，完成前没有磁盘副作用。节点数据库迁移 2 保存原始目标根目录；旧版或不同根目录的写入版本不能借回执读取。搜索在当前底线和快照下过滤结果，响应超过帧容量时要求缩小页面或分块读取。A 的 Kernel 执行路由与 managed B 后端已完成真实 Linux 隔离 A/B create/read/write 验证；受支持的 A/B 端到端能力与剩余 UI/回收边界以本页“当前 CLI 工作流与交付状态”为准。

连接生命周期已有 `ConversationNodeConnections` 和 `WorkspaceNodeClient`，经真实 loopback WebSocket 验证双向认证、分块文件调用、观察调用、无链接码重连、撤销、心跳失效及判定器不兼容拒绝。变更通知会在正在进行的能力刷新后补一次刷新，避免底线摘要停留在旧值。

B 的启动入口现已接受 `--join <A地址> --code <8位码> --fingerprint <A指纹>`。仅在双向签名验证后保存 A 公钥、指纹与地址；邀请不持久化。之后无需这些参数即可从保存的身份自动重连，传输失败采用 12–60 秒退避，身份变化、撤销和判定器不兼容进入需本地处理的 `blocked` 状态。节点状态同时报告连接阶段、错误码和下次重试时间；`node unlink` 立即关闭活跃连接并清除保存记录。真实连接测试覆盖监听重启、B 重启、底线摘要通知及保存身份与解除链接的竞态。

A 已提交登记但 B 未收到最终确认帧时，B 可携旧邀请码发起新挑战；A 对已登记公钥验证新签名后直接恢复，不再消费邀请码。已过期或已消费的邀请码不能用于其他公钥，已撤销身份也不能借新邀请恢复。

对话 Storage 的迁移 28 保存工作区节点位置。远程注册只接受已登记且未撤销的节点与已验证共享根，`nodePath` 来自能力摘要；普通本机注册不能写入节点定位符。工作区、目录活动、侧栏和 Agent 祖先投影均保留位置，旧本机行保持原形。按节点查询会话使用索引和分页，包含绑定工作区内的子会话，排除本机、其他节点、已移走或所属节点已撤销的会话。Kernel、命令和 CLI 已提供远程 workspace 创建；mount 配置已有契约与 Storage 接线，真实设置 UI 的保存、删除、重开/reload、Host folder get 和 observer disabled 控件均已通过 A/B E2E。

本机文件、原生搜索、Git、终端、Skills、Agent patch 和本机 launch-target 入口使用共享 `assertLocalWorkspace()`，在本机路径解析、文件系统访问或启动本机进程前拒绝节点定位符，返回 `WORKSPACE_REMOTE`。本机目录浏览器不把节点工作区列为本机根目录。远程工作区由独立 NodeLink 路由处理；Linux A/B 生产测试验证远程文件读写和 B 上 managed worktree。Workspace mounts 的契约、Storage 与真实 UI 保存/删除/重开/reload 和 Host folder get 验证已通过；A 侧 worktree reference-release 明确尚不支持。

工具上下文与 shell 执行选项携带 Kernel 生成的 `nodeAuthority`：原始会话、Run、调用 ID、固定快照引用及实际准入结果。需要 A 审批的调用携已结算审批 ID；普通准入携 `allow`。hook 可处理参数，但不能改写这些身份、快照、执行位置或注入隔离要求。每次调用使用独立事实副本，嵌套调用重新准入并生成自己的调用 ID；恢复宿主字段时保留上下文对象的关联，避免破坏 Workflow 的准入记录。受管工具进程对身份与快照绑定进行复核；Kernel 在 enqueue 前拒绝不支持的 remote `shared-branch`，其他执行选择按当前 capability 与 B managed backend 状态校验。

带根目录作用域的请求可携 `expectedRoot`，B 在操作前后核对它与当前共享根路径；同一根 ID 被本机管理员重新指向其他目录时，旧工作区请求返回 `NODE_ROOT_CHANGED`。本机登记将共享路径固定为真实路径，执行及重启时拒绝被目录链接替换的根目录；重新登记需要 B 显式修改策略。文件版本回执同时保存原始真实根路径，根目录 ID 复用后不能读出旧版本；没有真实根路径绑定的历史回执拒绝版本读取。执行路由必须使用此根路径绑定。

文件撤销增加 `fs.restore.chunk`：最多 256 个文件、单文件文本 2 MiB、整体 JSON 32 MiB，以 192 KiB 片段传输。B 与普通写入共享 32 个传输槽，恢复上传的总缓冲上限为 32 MiB，30 秒闲置或断线释放；普通写入仍受 16 MiB 缓冲限制。完整内容的 SHA-256、UTF-8、变更契约和当前文件版本全部通过后才恢复；部分上传没有磁盘副作用，已结算的操作不会覆盖之后的本机编辑。UTF-8 BOM 随实际文本版本保留。

`@hbar/node-link` 提供独立 `ExecutionRouter`，将文件、搜索、撤销和进程操作路由到宿主绑定的节点位置，并核对当前真实根路径和判定器指纹。准入前可单独读取属主路径元数据；工具调用需要固定会话、Run、调用 ID 与准入结果，异步读取能力时不能改变这些已捕获事实。路由器验证并下发固定沙盒快照，文件分块核对连续偏移、版本和完整摘要；写入返回 B 的持久前后版本。进程使用 `runId:callId`，保留 provider 调用 ID 的标点，取消按回执结算，链接丢失报告 `EFFECT_UNKNOWN` 并禁止重放。A 的环境与 OS 授权根由 B 的快照和底线重新构造；关闭同时取消本机和远程进程后才释放执行器。真实 Linux A/B 测试已在 A `--no-local-exec` 下验证远程 workspace 创建、读写与同 Session worktree 复用；单独的生产 Git 测试在 B 上查询 `main` 和 `feature/remote-e2e`。剩余能力和平台边界见本页状态表。

`NodeObservationService` 通过私有只读端口提供节点的会话列表、消息分页快照与持久事件增量。读取内容前后都校验工作区归属和撤销状态；移走、撤销或混入其他会话数据时拒绝迟到结果。消息省略 provider 元数据与任意工具详情，Run 省略模型、原始输入和内部恢复数据；事件只投影明确的会话、消息、Run、审批、用量和用户输入请求字段，其余事件保留序号但不传通用载荷。长文本以 UTF-8 边界截取并显式报告 `truncated`；页面在整体序列化前受帧容量限制，缺失或过期游标要求重新获取分页快照。Host 接线和 B 控制台展示均已通过真实受管节点连接与限定根观察测试。

A 的 `node-link` 单元已加入源码和打包后的 Supervisor 目录，通过私有具名登记与观察读取端口工作。准备阶段不写身份，激活后才拥有邀请、握手、节点 peer 和心跳。稳定适配器只保存 socket 和绑定的进程 incarnation，限制每连接 32 个、总体 64 个转发请求；控制转发有预留 IPC 容量。单元故障、退出和替换关闭其旧 socket，重新认证仍使用保存的 A 身份；单元本身的 Supervisor 崩溃恢复已通过测试。A/B 远程副作用恢复已在运行时 commit `53f789cb` 上完成真实 Linux A/B SIGKILL、宽限清理、A 重启后的 `EFFECT_UNKNOWN` 对账和单次执行验证；恢复夹具路径修复单独记录于 `924717e2`，不代表覆盖所有磁盘故障或其他平台。

节点双向传输的 `exec.start` 预算现按校验后的进程时限增加 5 秒结算时间，`exec.cancel` 为 120 秒，其他方法为 30 秒；A 的私有节点转发再增加 15 秒。显式短时限仍可收紧传输预算，取消或链接丢失仍返回需要回执对账的未知结果。真实计时测试验证 31 秒处理不会被普通请求的 30 秒时限提前中断。

B 的取消与启动使用同一操作锁，取消请求立即留下启动阻止标记，待正在落盘的启动回执结算后才返回。暂停、链接宽限期届满和关闭均在真正调用执行后端前重新校验；关闭等待所有已有操作锁和进程结算，再释放执行资源。SQLite Worker 回执的受控延迟测试覆盖已落盘但尚未启动的窗口，验证取消、停机及宽限期届满不会留下迟到进程。

稳定 Host 已接入独立 `/node` 路由：节点 socket 不进入操作员认证、订阅、终端或 Controller RPC 分发。拒绝浏览器 Origin、设备 cookie/token 和带查询参数的节点连接；非 loopback 来源需要原生 TLS。操作员可执行 `hbar exec node.invite --name build-box`、`hbar exec node.list --limit 20` 和 `hbar exec node.revoke <nodeId或唯一名称>`，这些命令直接调用受管链路单元，节点网络方法表不包含它们。Client SDK 提供类型化节点管理客户端；CLI 管理入口不隐式创建会话。Host 实际连接测试覆盖加入、远程工作区创建、共享文件读写、受限观察者拒绝管理与撤销后立即断开。mount UI 的保存/删除/重开/reload 与 Host folder get 已通过 A/B E2E；A 侧 worktree reference-release 尚未实现。

服务命令允许全局选项位于 `serve` 或 `node` 前面，选项值不会被误判为命令。A 可用 `hbar serve --role conversation --host <地址> --port <端口> --cert <证书PEM> --key <私钥PEM>` 启用 TLS；CLI 会转发绑定地址、证书、数据路径与 profile，并在启动前拒绝非法角色、端口及缺失的证书对。B 显式启用 TLS 证书校验。私有 CA 可通过 Bun 的 [SSL_CERT_FILE 配置](https://bun.sh/docs/runtime/environment-variables)追加信任；独立源程序进程测试验证未受信证书被拒绝、追加测试 CA 后 WSS 加入成功，编译程序验证命令前选项的工作区启动。

## 权限与故障语义

专用链路已有纯 JSON 请求关联层与双向 Ed25519 握手。两端调用和通知的方法表分别指定；未知方向的方法、函数、AbortSignal、异常对象、深层 JSON、超大帧及超过 32 个并发请求均受限。握手固定双方身份、双方随机挑战与签名方向，拒绝旧证明重放；重新连接使用签名而不发送可重放的 token。非 loopback 连接要求 WSS；身份配对不替代传输加密。

最终权限为对话节点准入、节点快照复核、本机底线和后端实际能力的交集。节点不接收模型凭据、Storage 端口、任意回调或操作员 RPC。本机底线只能由节点本机修改，进程、网络和终端分别受控。节点数据目录、身份密钥及保护路径不能经文件工具或进程授权开放。

远程工作区保存节点位置与定位符，对话节点不将定位符交给本机路径解析。沙盒检查使用工作区所有者的路径方言和真实路径。节点再次校验内容摘要与规则，快照或指纹不一致必须拒绝。

每次副作用用稳定的 `operationId` 去重。受理记录必须先持久化，再启动进程；同一键换参数拒绝。断链默认有 30 秒宽限期，随后回收进程树。回执区分未接受、受理、已启动、已结算和结果未知，恢复过程不能把“通信超时”当成“未执行”。

## 验证

本地链路的相关验证入口：

```powershell
bun test tests/os-confinement.test.ts tests/runtime-plugin-process.test.ts tests/sandbox-host.test.ts
bun test tests/local-tools.test.ts tests/local-tools-settlement.test.ts
```

共享判定器与既有沙盒规则的验证入口：

```powershell
bun scripts/generate-sandbox-evaluator.ts --check
bun test tests/shared-sandbox.test.ts tests/sandbox-policy.test.ts tests/sandbox-profiles.test.ts tests/sandbox-profiles-runtime.test.ts tests/sandbox-host.test.ts packages/kernel/src/workspace-sandbox.test.ts
```

修改共享判定源码后运行 `bun scripts/generate-sandbox-evaluator.ts` 更新指纹。已有沙盒与目录挂载测试保留，用于核对抽取前后的语义一致性。常规拒绝执行用例在独立进程内模拟平台；Linux WSL2 的 bwrap 已有本页所述的真实 A/B 隔离验证，macOS/Seatbelt 仍需在 macOS 实机验收。
