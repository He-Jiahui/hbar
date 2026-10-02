import type { ScheduleDefinition } from '@hbar/contracts/commands/schedules'
import { latestDueSchedule } from './schedule-service'

export interface ScheduleDueReaderPort {
  enabledPage(
    after: string | null,
    limit: number,
  ): Promise<{ items: readonly ScheduleDefinition[]; next: string | null }>
  runtime(id: string): Promise<{ lastDueAt: number | null; pendingDueAt: number | null } | null>
  recordCandidate(id: string, dueAt: number, now: number): Promise<unknown>
}

export function createScheduleDueReader(
  port: ScheduleDueReaderPort,
  options: { maxPages?: number; pageSize?: number } = {},
) {
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 100))
  const maxPages = Math.min(4, Math.max(1, options.maxPages ?? 4))
  let cursor: string | null = null
  return async function read(now: number, limit = 32): Promise<readonly { scheduleId: string; dueAt: number }[]> {
    const result: Array<{ scheduleId: string; dueAt: number }> = []
    let pages = 0
    let after = cursor
    while (pages++ < maxPages && result.length < Math.min(32, Math.max(1, limit))) {
      const page = await port.enabledPage(after, pageSize)
      let processed = 0
      for (const schedule of page.items) {
        processed++
        cursor = schedule.id
        const runtime = await port.runtime(schedule.id)
        const baseline = runtime?.lastDueAt ?? schedule.createdAt
        const latest = latestDueSchedule({ spec: schedule.spec, timezone: schedule.timezone, from: baseline }, now)
        const pending = runtime?.pendingDueAt ?? null
        const dueAt = latest === null ? pending : pending === null ? latest : Math.max(latest, pending)
        if (dueAt !== null && dueAt > baseline && dueAt <= now) {
          await port.recordCandidate(schedule.id, dueAt, now)
          result.push({ scheduleId: schedule.id, dueAt })
          if (result.length >= Math.min(32, Math.max(1, limit))) break
        }
      }
      if (result.length >= Math.min(32, Math.max(1, limit)) || page.next === null) {
        // The last page can also contain unprocessed rows when capacity is reached.
        if (processed === page.items.length) cursor = page.next
        break
      }
      after = page.next
      cursor = page.next
    }
    return result
  }
}
