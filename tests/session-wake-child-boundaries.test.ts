import { expect, test } from 'bun:test'
import {
  sessionWakeManifestSchema,
  sessionWakeTransferSchema,
  type SessionWakeEntry,
} from '@hbar/contracts/session-wake'
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
test('long deadline re-arms bounded chunks without early wake and abort preserves dueAt', () => {
  const clock = new Clock(),
    wakes: string[] = [],
    child = new SessionWakeups((id) => wakes.push(id), clock)
  try {
    child.schedule('a', 121_000, entry('a', 121_000))
    clock.advance(60_000)
    expect(wakes).toEqual([])
    const ack = { token: 'long', manifest: child.preview(owner) }
    child.quiesce(ack, owner)
    clock.advance(20_000)
    child.abort(ack)
    clock.advance(39_999)
    expect(wakes).toEqual([])
    clock.advance(1)
    expect(wakes).toEqual(['a'])
    expect(child.pendingCount).toBe(0)
  } finally {
    child.close()
  }
})
test('restore validates all entries before mutation and DTO authority remains strict', () => {
  const child = new SessionWakeups(() => {}),
    a = entry('a'),
    b = entry('b', 3_000)
  const ack = { token: 'restore', manifest: { schemaVersion: 1 as const, owner, revision: 2, entries: [a, b] } }
  try {
    expect(() => child.restore(ack, [a, { ...b, goalRevision: 2 }])).toThrow()
    expect(child.has('a')).toBe(false)
    expect(child.has('b')).toBe(false)
    child.restore(ack, [a, b])
    expect(child.matches(ack.token, a)).toBe(true)
    expect(child.matches('wrong', b)).toBe(false)
    expect(() => sessionWakeTransferSchema.parse({ ack, physicalExit: true })).toThrow()
    expect(() => sessionWakeManifestSchema.parse({ ...ack.manifest, entries: [a, a] })).toThrow()
    expect(() =>
      sessionWakeManifestSchema.parse({ ...ack.manifest, entries: [{ ...a, requestId: 'wrong' }] }),
    ).toThrow()
    expect(() =>
      sessionWakeManifestSchema.parse({
        ...ack.manifest,
        entries: Array.from({ length: 129 }, (_, i) => entry(`s${i}`)),
      }),
    ).toThrow()
  } finally {
    child.close()
  }
})
test('128 capacity rejects new identity without damage and permits full-capacity replacement', () => {
  const clock = new Clock(),
    wakes: string[] = [],
    child = new SessionWakeups((id) => wakes.push(id), clock)
  try {
    for (let i = 0; i < 128; i++) child.schedule(`s${i}`, 3_000, entry(`s${i}`, 3_000))
    const before = child.preview(owner)
    expect(() => child.schedule('overflow', 3_000, entry('overflow', 3_000))).toThrow('Wake capacity exhausted')
    expect(child.preview(owner)).toEqual(before)
    expect(clock.timers.size).toBe(128)
    child.schedule('s0', 4_000, entry('s0', 4_000))
    expect(child.pendingCount).toBe(128)
    expect(clock.timers.size).toBe(128)
    clock.advance(2_000)
    expect(wakes).toHaveLength(127)
    expect(wakes.includes('s0')).toBe(false)
    clock.advance(1_000)
    expect(wakes.filter((id) => id === 's0')).toHaveLength(1)
  } finally {
    child.close()
  }
})
test('legacy untyped schedule/cancel and close settle waiters without waking or clearing UNKNOWN', async () => {
  const clock = new Clock(),
    wakes: string[] = [],
    child = new SessionWakeups((id) => wakes.push(id), clock)
  child.schedule('cancelled', 3_000)
  const cancelled = child.waiting
  child.cancel('cancelled')
  await Promise.all(cancelled)
  expect(child.pendingCount).toBe(0)
  child.schedule('closed', 3_000)
  const closed = child.waiting
  child.close()
  await Promise.all(closed)
  clock.advance(3_000)
  expect(wakes).toEqual([])
  expect(clock.timers.size).toBe(0)
  expect(() => child.schedule('late', 5_000)).toThrow()
  const fenced = new SessionWakeups(() => {}, clock)
  const value = entry('unknown', 6_000)
  fenced.schedule(value.sessionId, value.dueAt, value)
  const ack = { token: 'unknown', manifest: fenced.preview(owner) }
  fenced.quiesce(ack, owner)
  expect(() => fenced.cancel(value.sessionId)).toThrow()
  fenced.close()
  expect(fenced.pendingCount).toBeGreaterThan(0)
  expect(() => fenced.abort(ack)).toThrow()
})
