# 远程工作区节点

本功能采用两种角色：对话节点保存会话、模型凭据、审批、沙盒快照和工具意图；工作区节点保存共享根目录、本地底线、执行回执与独立审计，并在执行前复核权限。工作区节点默认主动连接对话节点。普通对话节点保留本机执行，可显式关闭。

这是实现与验收记录；尚未完成的项目不代表当前可用能力。

## 实施顺序

- [x] 本地隔离链路：SDK、shell、插件进程的校验和上下文重建保留隔离要求；缺少后端时拒绝启动。
- [x] 共享判定器：`@hbar/sandbox` 保存规则、命令解析、调用判定及规范化快照摘要；文件系统与路径语义通过 `SandboxPathPort` 注入。判定器指纹由实际源码生成。
- [x] 节点协议、工作区位置与设备角色契约：两张独立方法表，严格输入，分块文件传输契约；旧本机工作区与设备保持默认语义。持久化与授权仍由后续步骤实现。
- [x] 观察者授权：只读 RPC 白名单、命令元数据与工作区范围；拒绝提交消息、审批、终端和写命令。迁移 26 保存设备角色与范围，邀请由操作员指定权限；HTTP 上传与全局附件读取受限，使用有作用域的 resource-media 读取。
- [ ] 工作区节点：共享根目录、不可远程修改的底线、保护路径、幂等回执、审计及本机控制台。
- [ ] 专用 `/node` 链路：邀请、固定 Ed25519 公钥指纹、双向挑战、撤销、心跳与重连。
- [ ] 执行路由：`hbar-node://` 定位符、本机服务守卫、所有者路径解析、最终参数及快照复核。
- [ ] 恢复对账：结算回执复用；丢失进程进入 `EFFECT_UNKNOWN`，不重放副作用。
- [ ] OS 隔离：bwrap、容器、Seatbelt、Windows；后端实际能力不足时拒绝执行。
- [ ] 远程 Git、搜索、终端和 worktree；同节点多目录边界。
- [ ] 两端界面：节点设置与邀请、工作区位置、审批执行位置、节点控制台与绑定会话只读观察。

SSH stdio 和 Noise 中继属于附件中的可选扩展。

执行核心已有 `WorkspaceNodeService` 与独立 `NodeStateStorage` Worker：底线与真实路径复核、有界启动、持久执行/写入回执、断链宽限期和审计可单独验证。身份模块提供 Ed25519 指纹与带双方身份、挑战及方向的签名。

源码 CLI 与编译后的单文件程序均支持 `hbar serve --role workspace`。节点使用独立数据根，默认 `~/.hbar-node`，可用 `--home` 指定；不会打开会话 Storage 或启动 Kernel、模型、TUI。本机控制接口只监听 loopback，使用节点数据根中独立生成的凭据。`hbar node` 提供共享、底线、状态、暂停、取消、审计和解除链接命令。Web 控制台、本机设备配对和节点网络连接仍待接入。

```powershell
bun apps/cli/src/main.ts node share D:/Projects/engine --id engine --access write
bun apps/cli/src/main.ts node policy show
bun apps/cli/src/main.ts serve --role workspace --listen 127.0.0.1:4318
bun apps/cli/src/main.ts node status
bun apps/cli/src/main.ts node pause
bun apps/cli/src/main.ts node resume
bun apps/cli/src/main.ts node audit
```

每次进程执行具有独立的原生进程树所有者，结束、取消和故障必须确认后代退出。当前原始后端仅提供进程树管理，不提供文件系统或网络隔离；节点不会因 `osConfinement=off` 绕过始终存在的数据目录和凭据保护，缺少文件系统保护时拒绝进程启动。后端隔离实现与网络连接仍由后续步骤完成。

对话节点的节点登记现由迁移 27 保存，身份私钥、公钥、登记信息和吊销记录与操作员设备表分开。一次性邀请在内存中最多保留 128 个，五分钟到期，加入尝试按来源限流；并发加入只能消费一次。已吊销的公钥保留记录并拒绝重连或重新配对。管理命令与网络握手仍需接线，这些存储和用例能力不代表当前已有可用的跨机连接。

节点端的方法处理器现覆盖共享根目录解析、分块文件读写、回执版本、恢复、搜索和执行入口。部分上传有 32 个任务和 16 MiB 总容量限制、30 秒空闲期限，完成前没有磁盘副作用。节点数据库迁移 2 保存原始目标根目录；旧版或不同根目录的写入版本不能借回执读取。搜索在当前底线和快照下过滤结果，响应超过帧容量时要求缩小页面或分块读取。实际网络接线仍待后续步骤。

连接生命周期已有 `ConversationNodeConnections` 和 `WorkspaceNodeClient`，经真实 loopback WebSocket 验证双向认证、分块文件调用、观察调用、无链接码重连、撤销、心跳失效及判定器不兼容拒绝。变更通知会在正在进行的能力刷新后补一次刷新，避免底线摘要停留在旧值。这些类仍需装配到稳定 Host 监听与 Supervisor 运行单元，以及 Workspace Node 的启动入口；目前 CLI 的 `--join` 尚未启用。

## 权限与故障语义

专用链路已有纯 JSON 请求关联层与双向 Ed25519 握手。两端调用和通知的方法表分别指定；未知方向的方法、函数、AbortSignal、异常对象、深层 JSON、超大帧及超过 32 个并发请求均受限。握手固定双方身份、双方随机挑战与签名方向，拒绝旧证明重放；重新连接使用签名而不发送可重放的 token。非 loopback 连接要求 WSS；身份配对不替代传输加密。实际 Host 监听、节点主动外连和 Supervisor 运行单元还待接入。

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

修改共享判定源码后运行 `bun scripts/generate-sandbox-evaluator.ts` 更新指纹。已有沙盒与目录挂载测试保留，用于核对抽取前后的语义一致性。Linux/macOS 的拒绝执行测试目前在独立进程内模拟平台；真实系统隔离验收需在相应 OS 上运行。
