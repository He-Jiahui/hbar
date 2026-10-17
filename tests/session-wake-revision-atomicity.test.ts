import { expect, test } from 'bun:test'
import type { SessionWakeEntry } from '@hbar/contracts/session-wake'
import { SessionWakeups, type SessionWakeClock } from '../packages/kernel/src/session-wakeups'
const owner = { unitId: 'kernel', generation: 1, incarnation: 'revision-boundary' }
function entry(sessionId: string, dueAt = 2_000): SessionWakeEntry {
  return {
    sessionId,
    dueAt,
    goalId: `goal-${sessionId}`,
    intentId: sessionId,
    requestId: `goal-${sessionId}`,
    goalRevision: 1,
  }
}
class Clock implements SessionWakeClock {
  time = 1_000
  readonly timers = new Set<{ at: number; callback(): void }>()
  now() {
    return this.time
  }
  schedule(callback: () => void, delay: number) {
    const timer = { at: this.time + delay, callback }
    this.timers.add(timer)
    return {
      cancel: () => {
        this.timers.delete(timer)
      },
    }
  }
  advance(ms: number) {
    this.time += ms
    for (const timer of [...this.timers])
      if (timer.at <= this.time) {
        this.timers.delete(timer)
        timer.callback()
      }
  }
}
function restored(revision: number, oldDueAt = 2_000) {
  const clock = new Clock(),
    wakes: string[] = [],
    child = new SessionWakeups((id) => wakes.push(id), clock),
    original = entry('old', oldDueAt)
  const ack = { token: 'exact-old', manifest: { schemaVersion: 1 as const, owner, revision, entries: [original] } }
  child.restore(ack, [original])
  return { child, clock, wakes, original, ack }
}
for (const action of ['schedule', 'delivered', 'cancel'] as const) {
  test(`MAX revision rejects ${action} before altering acknowledged responsibility`, () => {
    const { child, original, ack, clock } = restored(Number.MAX_SAFE_INTEGER)
    try {
      expect(() => {
        if (action === 'schedule') child.schedule('new', 3_000, entry('new', 3_000))
        else if (action === 'delivered') child.delivered(ack.token, original)
        else child.cancel(original.sessionId)
      }).toThrow('Wake revision exhausted')
      expect(child.has('new')).toBe(false)
      expect(child.has('old')).toBe(true)
      expect(child.matches(ack.token, original)).toBe(true)
      expect(child.preview(owner)).toEqual(ack.manifest)
      expect(clock.timers.size).toBe(0)
    } finally {
      child.close()
    }
  })
}
test('MAX-1 replacement refuses atomically and preserves exact old ACK', () => {
  const { child, original, ack, clock } = restored(Number.MAX_SAFE_INTEGER - 1)
  try {
    expect(() => child.schedule('old', 3_000, entry('old', 3_000))).toThrow('Wake revision exhausted')
    expect(child.matches(ack.token, original)).toBe(true)
    expect(child.preview(owner)).toEqual(ack.manifest)
    expect(clock.timers.size).toBe(0)
  } finally {
    child.close()
  }
})
for (const action of ['fire', 'cancel'] as const) {
  test(`last admissible local timer reserves revision for ${action}`, async () => {
    const { child, clock, wakes } = restored(Number.MAX_SAFE_INTEGER - 2, 5_000)
    try {
      child.schedule('local', 3_000, entry('local', 3_000))
      const waiting = child.waiting
      expect(child.preview(owner).revision).toBe(Number.MAX_SAFE_INTEGER - 1)
      if (action === 'fire') clock.advance(2_000)
      else child.cancel('local')
      await Promise.all(waiting)
      expect(child.has('local')).toBe(false)
      expect(child.has('old')).toBe(true)
      expect(child.preview(owner).revision).toBe(Number.MAX_SAFE_INTEGER)
      expect(wakes).toEqual(action === 'fire' ? ['local'] : [])
      expect(clock.timers.size).toBe(0)
    } finally {
      child.close()
    }
  })
}
