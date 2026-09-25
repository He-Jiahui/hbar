# 页签关闭确认：视图与运行分别处理

本单元实现 `createWorkspaceTabClose` 协调器，供后续页签运行时和 React 页签栏接线；它本身不添加用户可见入口，也不声称会话页签已投入使用。

- `request` 捕获 1–32 个明确的 `{id, instanceKey, sessionId}` 视图目标。它用 `session.activeOperations` 查原会话的所有活动 Run，查询失败、超时、修订变更或输出不完整都不能被解读为空闲。
- 活动集合只读取最多 256 个 operation ID，100 项一页；每次最多四个会话并发，修订变更最多重读两次。超出容量进入可见未知态，用户仍可取消或选择保留运行关闭视图。
- `keepRunning` 只调用 `closeCaptured`，不发送取消；会话、运行、对话历史和草稿不随页签被删除。调用方必须检查 instanceKey，只能关闭请求创建时的同一个视图实例。
- `stop` 对原始 operation ID 各发送至多一次 `operation.cancel`。发出前先记录 ID；即便响应丢失也不自动用新请求重发。`cancelRequested` 是等待状态而非终态，已有取消请求不会再发一次。
- 停止后执行只读核对。只有原目标全部无活动 Run 时才关闭；仍在停止则保持未知态与手动重查。若出现新 Run，重新显示选择，不自动扩大旧用户确认的停止范围。
- 调用方取消确认只清掉当前关闭意图，不影响已受理的停止；等待中的异步调用通过 AbortSignal 和 12 秒默认截止释放 UI 等待，不能声称底层插件已强制停止。

`tests/workspace-tab-close.test.ts` 覆盖空闲、保持运行、停止后待确认、丢回复、同时出现新任务、已有取消、畸形读取、容量、超时和 32 页签有界并发。该协调器依赖 Host 查询契约的真实集成验证见 `tests/active-operations.test.ts`。
