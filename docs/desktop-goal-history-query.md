# Goal 历史读取：Host/Client 有界契约

本纵切落实 [Goal 生命周期审计](desktop-goal-lifecycle-audit.md) 的 Host 历史读取前提，提供真实持久事实，不改变 Goal 调度、续作、预算结算或消息历史合同。UI 与 runtime 的装配和视觉验收属于另一单元；本文不宣称历史界面已经完成。

## 公开 API

`createGoalPlanCommandClient(client).history(input)` 与同一 client 的 `execute('goal.history', input)` 走既有 `command.execute` 认证链，不新增 legacy RPC 方法。

```ts
type GoalHistoryInput = {
  sessionId: string
  anchorSeq?: number
  beforeSeq?: number
  limit?: number // 默认 50，范围 1..100
}

type GoalHistoryPage = {
  sessionId: string
  anchorSeq: number
  items: GoalHistoryFact[] // 当前逆向页内按 seq 升序
  preceding: { seq: number; goal: GoalHistorySnapshot | null }
  nextBeforeSeq: number | null
}
```

命令元数据为 Host `query`、`stateEffect: none`、`scope: session`、API-only。一次查询最多返回 100 项；`nextBeforeSeq` 非空只表示该锚点之前确实还有更早的 Goal 事实，不能据此声称消息历史已经连续恢复。Host 不设置累计历史截断上限，消费者应自行限制内存、查询次数和展示容量，并明确告知截断。

首次省略 `anchorSeq` 时，Storage 在同一读事务中读取该会话当前持久序号。后续页传回该锚点与上页的 `nextBeforeSeq`，使用严格小于 `beforeSeq` 的逆向分页。新写入不会穿入旧锚点。`anchorSeq=0` 返回无历史；不存在的会话返回 `NOT_FOUND`；未来锚点及超出 `anchorSeq+1` 的边界返回 `INVALID_CURSOR`；非法结构与容量返回 `INVALID_INPUT`。

## 事实与隐私边界

`GoalHistoryFact` 仅包含 `eventId/sessionId/seq/time/runId/type/goal`。规范事件类型限于 `goal.created`、`goal.updated`、`goal.accounted`、`goal.cleared`；清除事实的 `goal` 为 `null`，且持久 `data.sessionId` 必须与事件的会话一致。

`GoalHistorySnapshot` 公开字段为 `goalId/objective/status/tokenBudget/tokensUsed/timeUsedSeconds/createdAt/updatedAt`。`continuationCount` 与四字段 `executionBudget` 仅在真实持久事件提供时存在，不补零、不按当前配置重算。`threadId`、账户账本、去重键、修复记录、触发器及其他任意私有 payload 不进入 DTO。

公开 `parseGoalHistoryEvent(event)` 用于 canonical 实时事件与分页共享同一规范化逻辑：非 Goal 事件返回 `null`；畸形 canonical 事实以经清理的 `INVALID_OUTPUT` 失败，不能跳过坏记录后伪称连续。`preceding` 是当前页第一项之前最近的规范 Goal 事实；若其为清除，则保留非零 `seq` 与 `goal: null`，不能复活更旧的目标；若不存在则为 `{seq: 0, goal: null}`。它没有伪造事件 ID，不能作为独立历史行。

查询只返回请求会话自己的持久日志，Fork 的历史不借用父会话 Goal。当前配对设备的既有 Host 认证和访问模型保持不变，本查询没有新增会话级权限模型，也不变更删除、归档或保留策略。

## Storage 实现与成本

`events_goal_history` 是按四种 canonical 类型过滤的 `(sessionId, seq)` 部分索引。每次查询在同一个 Worker 读事务中读取锚点，再按 `seq DESC` 获取至多 `limit+1` 个匹配候选。多出的最多一项直接提供前置状态，不做正向全日志扫描，也不从当前 `goal.get` 重建旧目标。返回时只反转本页为升序。

用真实 Storage Worker 测试，在两个 Goal 事实之间插入 2005 个普通事件，`EXPLAIN QUERY PLAN` 确认使用 `events_goal_history`，没有全表扫描或临时排序。该 Windows 本机 20 次单项 Worker 读取样本的 p95 约 0.95 ms、max 约 2.38 ms；这是一次本机观测，不是所有设备的延迟承诺。

## 已执行验证

- 严格 scoped ESLint：通过。
- 根 TypeScript `typecheck`：通过。
- 18 个聚焦 Bun 测试、257 条断言：通过，包括 schema/公开字段、真实 Storage 逆向分页和稀疏日志、固定锚点、clear 首项与前置状态、旧 objective/替换身份、100 项容量、畸形数据失败、Fork 无 Goal 历史、真实配对 Host/typed Client、未认证拒绝、只读不改序号或 Run，以及命令目录/迁移 inventory。
- 本单元文件格式与差异检查：新增文件及自身修改通过。`apps/host/src/server.ts` 的既有 `legacy requestId` 长行不符合 Prettier；本单元只增加装配的 `kernel.storage` 参数，不夹带该无关格式化。

本单元不涉及 UI、浏览器截图或 Rust；没有把上述 Host 验证冒充原生桌面或历史界面 E2E。
