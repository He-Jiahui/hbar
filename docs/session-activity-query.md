# 会话关闭前的活动运行查询

用途：为会话页签的关闭确认提供完整、可校验的活动集合；本提交只交付查询基础，不表示页签或停止并关闭界面已经接入。

## 问题依据

`packages/storage/src/worker.ts` 的会话快照只带最近 40 次 Run。该限制在初始提交 `fb64989` 已存在，适合历史窗口，不是完整的活动集合。回归测试构造一个仍在运行的旧任务和 104 个排队任务，证明旧任务不在快照中，但仍必须在关闭确认中被考虑。

## 契约

- 新增只读 Host 命令 `session.activeOperations`，沿用鉴权的 command.execute 和 Client run command adapter。
- 输入为明确的 `sessionId`、可选 cursor 和 1–100 的 limit（默认 40）；输出仅含 operationId、状态和时间，不含提示词、模型输入、工具参数或凭据。
- 每页的 `totalActive`、`sessionSeq`、items 在同一 Storage Worker 事务中读取。排序为 createdAt + operationId，同毫秒的记录也不会重复或跳过。
- 下一页 cursor 绑定会话事件序号；期间新增、取消、结算或其他持久变化返回 `ACTIVITY_CHANGED`，调用方需有界地重读第一页，不能拼接不同修订的集合。
- queued、running、waiting_approval 都计入活动；取消请求已受理的运行投影为 cancelRequested，直到确认终态才退出活动集合。
- 越界输入、跨会话 cursor、不存在的会话、读取失败均返回错误，不能映射为空列表或“已停止”。旧会话快照仍保持原有历史容量。

后续页签消费者必须限制查询并发、总页数、重试次数和等待时间；停止操作只能作用于用户确认的 operation IDs，不能在等待后自动取消新出现的任务。取消受理不等于完成，失联后只能读取核对，不能自动重复副作用。

## 验证

`tests/active-operations.test.ts` 的 4 个测试覆盖窗口遗漏、105 个活动项分页、100 项边界、无敏感载荷、取消待确认、结算、审批中、修订冲突、外来 cursor、无效容量、缺失会话、真实 Host 鉴权与 Client 查询不修改事件序号。

Windows / Bun 1.4.0 本机测量：105 个活动项、每页 100 项、20 次 Storage Worker 读取，p95 0.663 ms、max 0.721 ms；每页小于 20 KiB。此结果不包含模型执行时间、不代表远程网络时延，也不是跨设备性能保证。交互查询预算为 250 ms（本地 Worker 测量），界面仍需超时和恢复状态。

相关回归：`tests/run-commands.test.ts` 7 项与 `tests/storage.test.ts` 5 项通过。工作区并行功能在提交时的统一检查结果以本次提交说明及后续整体验证报告为准。
