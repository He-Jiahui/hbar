import type { Run, ThreadGoal } from '@hbar/contracts'

export interface SessionClockSample {
  readonly hostTime: number
  readonly receivedAt: number
}

export function goalElapsedSeconds(goal: ThreadGoal, receivedAt: number | undefined, now: number, connected: boolean) {
  const timing = goal.timing
  if (!timing) return goal.timeUsedSeconds
  const delta =
    connected && goal.status !== 'complete' && timing.running && receivedAt !== undefined
      ? Math.max(0, now - receivedAt)
      : 0
  return Math.floor((timing.elapsedMilliseconds + delta) / 1000)
}

export function runObservedEnd(run: Run, clock: SessionClockSample | undefined, now: number, connected: boolean) {
  if (run.endedAt !== null) return run.endedAt
  if (!clock || run.startedAt === null || !['running', 'waiting_approval'].includes(run.status)) return null
  return Math.max(run.startedAt, clock.hostTime + (connected ? Math.max(0, now - clock.receivedAt) : 0))
}
