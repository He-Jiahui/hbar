import { expect, test } from 'bun:test'
import type { SessionWakeEntry } from '@hbar/contracts/session-wake'
import { SessionWakeups, type SessionWakeClock } from '../packages/kernel/src/session-wakeups'
const owner = { unitId: 'kernel', generation: 1, incarnation: 'rollback-owner' }
function entry(sessionId: string, dueAt: number): SessionWakeEntry {
  return {
    sessionId,
    dueAt,
    goalId: `goal-${sessionId}`,
    intentId: `intent-${sessionId}`,
    requestId: `goal-intent-${sessionId}`,
    goalRevision: 7,
  }
}
class Clock implements SessionWakeClock {
  time = 1_000
  readonly timers = new Set<{ at: number; callback: () => void }>()
  now() {
    return this.time
  }
  schedule(callback: () => void, delayMs: number) {
    const value = { callback, at: this.time + delayMs }
    this.timers.add(value)
    return {
      cancel: () => {
        this.timers.delete(value)
      },
    }
  }
  advance(ms: number) {
    this.time += ms
    for (const value of [...this.timers])
      if (value.at <= this.time) {
        this.timers.delete(value)
        value.callback()
      }
  }
}
for (const restored of [false, true]) {
  test(`recheckpoint abort restores exact old committed token (${restored ? 'restored' : 'local commit'}) without replaying delivered entries`, () => {
    const clock = new Clock(),
      wakes: string[] = [],
      child = new SessionWakeups((id) => wakes.push(id), clock)
    const a = entry('a', 2_000),
      b = entry('b', 3_000)
    const first = { token: 'old-token', manifest: { schemaVersion: 1 as const, owner, revision: 2, entries: [a, b] } }
    if (restored) child.restore(first, [a, b])
    else {
      child.schedule('a', a.dueAt, a)
      child.schedule('b', b.dueAt, b)
      first.manifest = child.preview(owner)
      child.quiesce(first, owner)
      child.commit(first)
    }
    clock.advance(1_000)
    expect(child.delivered(first.token, a)).toBe(true)
    const next = { token: 'aborted-token', manifest: child.preview(owner) }
    child.quiesce(next, owner)
    child.abort(next)
    expect(child.has('a')).toBe(false)
    expect(child.matches(first.token, b)).toBe(true)
    expect(child.matches(next.token, b)).toBe(false)
    clock.advance(1_000)
    expect(child.delivered(first.token, b)).toBe(true)
    expect(child.delivered(first.token, b)).toBe(false)
    expect(wakes).toEqual([])
    expect(child.pendingCount).toBe(0)
    child.close()
  })
}
test('rollback restores old transferred responsibility and re-arms only new local timers at original dueAt', () => {
  const clock = new Clock(),
    wakes: string[] = [],
    child = new SessionWakeups((id) => wakes.push(id), clock)
  const a = entry('a', 2_000),
    b = entry('b', 3_000)
  child.schedule('a', a.dueAt, a)
  const old = { token: 'old', manifest: child.preview(owner) }
  child.quiesce(old, owner)
  child.commit(old)
  child.schedule('b', b.dueAt, b)
  const next = { token: 'next', manifest: child.preview(owner) }
  child.quiesce(next, owner)
  clock.advance(500)
  child.abort(next)
  expect(child.matches(old.token, a)).toBe(true)
  expect(child.matches(old.token, b)).toBe(false)
  expect(child.pendingCount).toBe(1)
  clock.advance(500)
  expect(wakes).toEqual([])
  expect(child.delivered(old.token, a)).toBe(true)
  clock.advance(1_000)
  expect(wakes).toEqual(['b'])
  expect(child.pendingCount).toBe(0)
  child.close()
})
test('fresh abort keeps local deadline while committed or UNKNOWN successor cannot roll back', () => {
  const clock = new Clock(),
    wakes: string[] = [],
    child = new SessionWakeups((id) => wakes.push(id), clock),
    a = entry('a', 2_000)
  child.schedule('a', a.dueAt, a)
  const fresh = { token: 'fresh', manifest: child.preview(owner) }
  child.quiesce(fresh, owner)
  child.abort(fresh)
  expect(child.pendingCount).toBe(1)
  const old = { token: 'old', manifest: child.preview(owner) }
  child.quiesce(old, owner)
  child.commit(old)
  const next = { token: 'new', manifest: child.preview(owner) }
  child.quiesce(next, owner)
  child.commit(next)
  expect(() => child.abort(next)).toThrow()
  expect(child.matches(old.token, a)).toBe(false)
  expect(child.matches(next.token, a)).toBe(true)
  const unknown = { token: 'unknown', manifest: child.preview(owner) }
  child.quiesce(unknown, owner)
  expect(() => child.cancel('a')).toThrow()
  expect(() => child.abort(unknown)).toThrow()
  clock.advance(2_000)
  expect(wakes).toEqual([])
  expect(child.pendingCount).toBe(1)
  child.close()
})
