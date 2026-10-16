import { createHash } from 'node:crypto'
import { HbarError } from '@hbar/contracts'
import {
  CHAT_DATABASE_CAPACITY_TARGET,
  type ChatDatabaseScope,
  type ChatDatabasePolicy,
  type ChatDatabaseStatistics,
  type ChatDatabaseTask,
} from '@hbar/contracts/commands/chat-database'
import type { StoragePort, ChatDatabaseTaskRuntime } from '@hbar/storage'
import { resolveChatDatabasePolicy } from './chat-database-policy'
import { latestDueSchedule, previewSchedule } from './schedule-service'
import type { SettingsService } from './settings-service'
import type { ChatDatabaseStatisticsService } from './chat-database-statistics'
import type { ChatDatabaseMaintenanceService } from './chat-database-maintenance'
import {
  chatDatabaseInspectionCheckpointSchema,
  type ChatDatabaseInspectionCheckpoint,
} from './chat-database-inspection'

const spec = (policy: ChatDatabasePolicy) => ({
  timezone: policy.timezone,
  spec:
    policy.scheduleKind === 'daily'
      ? { kind: 'daily' as const, hour: policy.scheduleHour, minute: policy.scheduleMinute }
      : {
          kind: 'weekly' as const,
          hour: policy.scheduleHour,
          minute: policy.scheduleMinute,
          weekdays: policy.scheduleWeekdays,
        },
})
// Journal/WAL growth caused by maintenance itself must not expand the next deletion set.
// A new history/resource fact or a new day permits a fresh bounded attempt.
export function chatDatabaseCapacitySignature(report: ChatDatabaseStatistics, now: number): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        report.history.revision,
        report.history.sessionCount,
        report.history.archivedCount,
        report.history.messageCount,
        report.history.logicalBytes,
        report.history.lastActivityAt,
        report.disk.cacheBytes,
        report.disk.attachmentBytes,
        report.scope.kind === 'global' ? null : report.disk.scopedLogBytes,
        report.scope.kind === 'global' ? null : report.disk.scopedAttachmentBytes,
        Math.floor(now / 86_400_000),
      ]),
    )
    .digest('hex')
}
const done = (status: string) => ['completed', 'cancelled', 'failed'].includes(status)

export function createChatDatabaseScheduler(
  storage: StoragePort,
  settings: SettingsService,
  statistics: ChatDatabaseStatisticsService,
  maintenance: ChatDatabaseMaintenanceService,
  options: { start?: boolean; now?: () => number } = {},
) {
  const clock = options.now ?? Date.now
  const controller = new AbortController()
  let cursor: string | null = null
  let current: Promise<void> | null = null
  let closed = false
  let paused = false
  let nextDueAt: number | null = null
  let quiescing: Promise<ChatDatabaseInspectionCheckpoint> | null = null
  async function tick(now: number): Promise<void> {
    for (let pages = 0; pages < 4 && !closed; pages++) {
      const page = await storage.call('chatDatabaseTaskScopes', cursor, 50)
      for (const entry of page.items) {
        if (closed) return
        cursor = entry.key
        try {
          const saved = await settings.get(entry.scope)
          const policy = resolveChatDatabasePolicy(saved.resolution)
          const token = JSON.stringify(policy)
          let state = await storage.call('chatDatabaseTaskRead', entry.scope)
          if (!state || state.policyToken !== token) {
            state = await storage.call('chatDatabaseTaskSave', {
              scope: entry.scope,
              policyToken: token,
              baselineAt: Math.min(now, entry.updatedAt || now),
              lastDueAt: state?.lastDueAt ?? null,
              pendingDueAt: null,
              lastCapacityAt: state?.lastCapacityAt ?? null,
              lastCapacitySignature: null,
              lastOperationId: state?.lastOperationId ?? null,
              lastCapacityPolicyToken: null,
              lastRunAt: state?.lastRunAt ?? null,
              error: null,
            })
          }
          if (state.lastOperationId) {
            const previous = await maintenance.read(state.lastOperationId)
            if (!done(previous.status)) continue
            if (
              previous.trigger === 'capacity' &&
              state.lastCapacitySignature === null &&
              state.lastCapacityPolicyToken === token
            ) {
              const report = await statistics.readComplete(entry.scope, controller.signal)
              state = await storage.call('chatDatabaseTaskSave', {
                ...state,
                lastCapacitySignature: chatDatabaseCapacitySignature(report, now),
                error: previous.error,
              })
            }
          }
          if (!policy.autoEnabled) continue
          const baseline = Math.max(state.baselineAt, state.lastDueAt ?? 0)
          const latest = policy.scheduleEnabled ? latestDueSchedule({ ...spec(policy), from: baseline }, now) : null
          const dueAt = latest !== null && latest > baseline ? latest : state.pendingDueAt
          if (dueAt !== null && dueAt !== state.pendingDueAt)
            state = await storage.call('chatDatabaseTaskSave', { ...state, pendingDueAt: dueAt })
          const report = policy.capacityEnabled ? await statistics.readComplete(entry.scope, controller.signal) : null
          const signature = report ? chatDatabaseCapacitySignature(report, now) : null
          const capacity = Boolean(
            report &&
            report.totalBytes > policy.capacityLimitMiB * 1_048_576 &&
            signature !== state.lastCapacitySignature,
          )
          const trigger = capacity ? 'capacity' : dueAt !== null ? 'schedule' : null
          if (!trigger) continue
          const key = createHash('sha256')
            .update(JSON.stringify([entry.key, token, trigger, trigger === 'capacity' ? signature : dueAt]))
            .digest('hex')
          await maintenance.automatic(
            {
              scope: entry.scope,
              trigger,
              totalBytes: report?.totalBytes ?? 0,
              targetBytes:
                trigger === 'capacity'
                  ? Math.floor(policy.capacityLimitMiB * 1_048_576 * CHAT_DATABASE_CAPACITY_TARGET)
                  : null,
            },
            { actorId: 'host:chat-database', idempotencyKey: key },
            {
              ...state,
              lastRunAt: now,
              error: null,
              lastDueAt: dueAt ?? state.lastDueAt,
              pendingDueAt: null,
              lastCapacityAt: trigger === 'capacity' ? now : state.lastCapacityAt,
              lastCapacitySignature: trigger === 'capacity' ? null : state.lastCapacitySignature,
              lastCapacityPolicyToken: trigger === 'capacity' ? token : state.lastCapacityPolicyToken,
            },
          )
          return
        } catch (reason) {
          if (closed) return
          if (reason instanceof HbarError && ['BUSY', 'NOT_FOUND', 'AUTO_DISABLED'].includes(reason.code)) continue
          const state = await storage.call('chatDatabaseTaskRead', entry.scope)
          if (state)
            await storage.call('chatDatabaseTaskSave', {
              ...state,
              error: reason instanceof HbarError ? reason.code : 'SCHEDULER_FAILED',
            })
          console.error('Chat database automatic task failed', entry.key, reason)
        }
      }
      cursor = page.next
      if (!cursor) return
    }
  }
  function check(now = clock()): Promise<void> {
    if (closed || paused) return Promise.resolve()
    if (current) return current
    const task = tick(now).finally(() => {
      if (current === task) current = null
    })
    current = task
    return task
  }
  function run(): void {
    nextDueAt = clock() + 60_000
    void check().catch((reason: unknown) => {
      if (!closed) console.error('Chat database scheduler check failed', reason)
    })
  }
  let timer: ReturnType<typeof setInterval> | null = null
  function start(): void {
    if (closed || timer || quiescing) return
    paused = false
    timer = setInterval(run, 60_000)
    timer.unref()
    run()
  }
  if (options.start !== false) start()
  async function get(scope: ChatDatabaseScope): Promise<ChatDatabaseTask> {
    const saved = await settings.get(scope)
    const policy = resolveChatDatabasePolicy(saved.resolution)
    const explicit =
      scope.kind === 'global' ||
      Object.entries(saved.resolution.reports).some(
        ([key, report]) => key.startsWith('f:chatDatabase.') && report.localPresence,
      )
    const state: ChatDatabaseTaskRuntime | null = await storage.call('chatDatabaseTaskRead', scope)
    return {
      schemaVersion: 1,
      scope,
      explicit,
      autoEnabled: explicit && policy.autoEnabled,
      scheduleEnabled: policy.scheduleEnabled,
      capacityEnabled: policy.capacityEnabled,
      lastDueAt: state?.lastDueAt ?? null,
      nextDueAt:
        explicit && policy.autoEnabled && policy.scheduleEnabled
          ? (previewSchedule(spec(policy), clock())[0] ?? null)
          : null,
      lastRunAt: state?.lastRunAt ?? null,
      operation: state?.lastOperationId ? await maintenance.read(state.lastOperationId) : null,
      error: state?.error ?? null,
    }
  }
  return {
    inspectionCheckpoint(): ChatDatabaseInspectionCheckpoint {
      return chatDatabaseInspectionCheckpointSchema.parse({ version: 1, cursor, nextCheckAt: nextDueAt })
    },
    /** Fences new checks synchronously; admitted work drains with its original identity. */
    quiesceInspection(): Promise<ChatDatabaseInspectionCheckpoint> {
      if (closed) return Promise.reject(new HbarError('DISPOSED', 'Scheduler is closed'))
      if (quiescing) return quiescing
      paused = true
      if (timer) clearInterval(timer)
      timer = null
      const admitted = current
      quiescing = Promise.resolve(admitted).then(() =>
        chatDatabaseInspectionCheckpointSchema.parse({ version: 1, cursor, nextCheckAt: nextDueAt }),
      )
      return quiescing
    },
    /** Pure restore: deliberately does not start/run/check or call storage/settings. */
    idleRestore(raw: ChatDatabaseInspectionCheckpoint): void {
      if (closed || timer || current) throw new HbarError('BUSY', 'Scheduler restore requires a quiet unarmed instance')
      const checkpoint = chatDatabaseInspectionCheckpointSchema.parse(raw)
      if (checkpoint.nextCheckAt !== null && checkpoint.nextCheckAt > clock() + 60_000)
        throw new HbarError('INVALID_INPUT', 'Inspection checkpoint exceeds the polling horizon')
      paused = true
      cursor = checkpoint.cursor
      nextDueAt = checkpoint.nextCheckAt
      quiescing = null
    },
    /** Rearm the exact inspection slot asynchronously; no immediate startup replay. */
    armInspection(): void {
      if (closed || timer || current || !paused || nextDueAt === null)
        throw new HbarError('BUSY', 'Scheduler inspection cannot be armed')
      quiescing = null
      paused = false
      timer = setTimeout(
        () => {
          timer = null
          if (closed || paused) return
          timer = setInterval(run, 60_000)
          timer.unref()
          run()
        },
        Math.max(0, Math.min(2_147_483_647, nextDueAt - clock())),
      )
      timer.unref()
    },
    idleSnapshot() {
      return { closed, paused, cursor, current: current !== null, timer: timer !== null, nextDueAt }
    },
    start,
    check,
    get,
    async pause(): Promise<void> {
      paused = true
      if (timer) clearInterval(timer)
      timer = null
      nextDueAt = null
      await current
    },
    async close(): Promise<void> {
      closed = true
      if (timer) clearInterval(timer)
      timer = null
      nextDueAt = null
      controller.abort(new HbarError('DISPOSED', 'Chat database scheduler is closing'))
      await current?.catch(() => undefined)
    },
  }
}
export type ChatDatabaseScheduler = ReturnType<typeof createChatDatabaseScheduler>
