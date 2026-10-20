# Driver callback timeout evidence

This feature observes existing execution. It does not change callback deadlines, admission capacities, cancellation, physical permits, owner fences, retries or Goal recovery.

## Incident motivating the change

On 2026-10-16, three R75 operations failed near 13:45:10 UTC:

| Session                              | Operation                            | Ended epoch milliseconds |
| ------------------------------------ | ------------------------------------ | ------------------------ |
| 4de8eee0-81e3-449a-9616-4353b45cae07 | 49013d62-1b71-4eb6-9f38-466de9cf8481 | 1792158309993            |
| 0eafe693-971f-4bb4-a00e-e00f0b9d8d62 | ae9a1b32-8d07-4c83-8215-1b9af577c027 | 1792158310194            |
| e9455345-91a0-4d24-95b1-d0c1b1568f1e | 4465f334-8e46-45a5-a6ef-2e9b2c44ce7f | 1792158310428            |

The public operation report contained fixed message Driver execution stopped, failure code IPC_TIMEOUT, category execution, retryable false. Its SHA256 is 5089e5444afc1c27739af345aa11a6511b05993583e5cb5a26a0e8fa4fa9aa9e; the source review SHA256 is b7acad684071b05702ebe265985e81e27926901d6e8b58c6860d4b95aec6f344. Root's original ignored reports remain evidence, not repository test fixtures or model content.

The fixed message identifies a failed Driver terminal path in runtime-driver-adapter. driver.start returns an invocation receipt; the long Run completion is a local Promise, not one long driver.run RPC. However, the original report cannot distinguish source gate waiting, relay gate waiting, peer queue expiry, a dispatched callback or a cancellation reason. The ordinary diagnostic rotations had already overwritten the incident interval. The exact causal layer remains **unknown**. Passing new tests must never be used to relabel that historical incident.

## Reading the new metadata

host.runtime_driver_callback keeps existing source/relay started and settled events and adds fixed phases:

- waiting: actually queued at the bounded callback admission lane.
- granted: a local admission permit was obtained. The callback may still wait in the IpcPeer queue.
- transport_submitting: IpcPeer begins its local encoded-message transfer attempt. This does not prove remote admission, handler execution or side effects.
- transport_sent: the existing encoded transfer completed its fragment acknowledgements. This is not a business reply or success result.
- transport_send_failed: local transfer failed; the original exception still owns execution outcome. It does not prove no remote effect occurred.
- logical_settled: the caller's Promise resolved/rejected. A timeout/cancellation can leave a physical permit unconfirmed.
- physical_reply: the matching real IPC reply arrived, including an error reply or a reply received after logical cancellation. The existing physical-settlement hook owns permit release.
- not_dispatched: the existing IPC hook, or pre-operation gate recheck, proved no local dispatch occurred.

The actual phase is prefixed source_ or relay_. rpcId joins both hops. callId is the Driver invocation ID, not a model tool-call ID. runId and sessionId come from the actual source Run or relay execution ownership; UUID validation prevents accidental content substitution. requestId is the observed owner incarnation; contextId is its unit ID.

callbackStage retains the last admission/submission stage when the logical failure is recorded. It is not overwritten by the generic logical-settlement phase or a later physical reply. Consequently a retained error with stage waiting differs from stage granted (peer not yet submitted), and from transport_submitting/transport_sent. Compare actual phases and physical proof; do not infer a remote effect from any submission marker.

admissionLane is the existing recursive/leaf classification. admissionActive, queueDepth, and admissionUnconfirmed count that lane, not all model Runs. budgetMs is the original callback budget at that hop; remainingBudgetMs is a nonnegative local remaining value. Both source and relay keep their existing deadline behavior. Expiry does not create a retry or new permit. Asynchronous diagnostic transport remains best effort; absence of a record is not proof no operation occurred.

## Bounded critical retention

The Host reuses DiagnosticJournal to retain only fixed failure events in <ordinary fileName>.critical.jsonl, with four rotated predecessors. Each file is at most1MiB, ring and queue at most128 entries. The fixed allowlist is callback failures, runtime entry call timeout/stop and runtime process fault. A scalar projection excludes nonselected metadata and all payload/error-description graphs. Ordinary success traffic cannot rotate these critical records.

Both writers remain asynchronous and observational. criticalFilePath identifies the file; criticalSnapshot() exposes queued/ring/dropped/invalid/writeFailure/closed counters. Overflow and disk failure remain visible losses, not a claim of durable delivery. Critical failure floods can still exhaust bounded retention. Closing starts both journals concurrently under the same original total close budget; no second serial drain budget or unbounded flush is added. This is not fsync/crash-proof incident storage, a separate monitor, a database or a new public log-query API.

For an investigation, preserve bounded critical files and the relevant ordinary window with file hashes before rotation. Join exact Host instance, Run/session, owner incarnation, invocation and RPC IDs. Pending0/active0 do not establish physical process exit, nor do these observations clear an UNKNOWN fence.

## Validation scope

The new Bun tests use real paired IpcPeers and real registered handlers, with controlled gate and peer queues, logical timeout/cancellation, late replies and transport failures. Canary assertions verify arguments/error descriptions never enter callback metadata. Retention tests use the real bounded journals and real temporary files, ordinary rotation, queue overflow and write failures. There are no provider requests, Live Runs, private databases, fabricated receipts or production time-budget increases.

Run strict type/lint/format checks and the focused tests before accepting this change. At implementation handoff these checks are **NOT RUN**; Root owns serial verification and the independent commit.

## 观察顺序与关闭回执

`transport_sent` 仅指本地 transport/分片提交完成。快速或可重入 transport 中，真实 `physical_reply` 可先于该观察通知到达；这些事件不是远端 handler 或副作用的全序时间线，不按本地通知顺序推断远端执行。

critical journal 继承普通 journal 的 `enabled` 与 `fullCoverage` 选项。现有 `packages/kernel/src/diagnostic-journal.ts` 契约即使 disabled 仍保留 warn/error/fatal；本实现沿用该错误保留行为，不把普通 debug 覆盖偷偷打开。

Host snapshot/close 保留原平面字段并新增 `normal`/`critical` 独立实际回执。平面 dropped、invalid、writeFailures、queued、bytes、ringEntries 为两者之和，closed 为两者均关闭，关键日志关闭失败不会被普通成功隐藏。两 journal 同时开始关闭，共享调用者原单一截止期限。固定 allowlist 均对应当前实际 emit：driver callback、entry call timeout、entry stop、runtime process fault；未发现实际 emit 的 runtime_ipc_failure 不列入保全承诺。
