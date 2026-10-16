import { expect, test } from 'bun:test'
import { SessionWakeups, type SessionWakeClock } from '../packages/kernel/src/session-wakeups'
const owner = { unitId: 'kernel', generation: 1, incarnation: 'waiter-test' }
function fixture() {
  let cancelled = 0,
    fired = 0
  const clock: SessionWakeClock = {
    now: () => 1_000,
    schedule: () => ({
      cancel: () => {
        cancelled++
      },
    }),
  }
  const child = new SessionWakeups(() => {
    fired++
  }, clock)
  const entry = { sessionId: 's', goalId: 'g', intentId: 'i', requestId: 'goal-i', goalRevision: 1, dueAt: 2_000 }
  child.schedule(entry.sessionId, entry.dueAt, entry)
  return { child, entry, counts: () => ({ cancelled, fired }) }
}
test('closed local and UNKNOWN timers expose no pending waiters while retaining responsibility evidence', async () => {
  const { child, counts } = fixture()
  const original = child.waiting
  expect(original).toHaveLength(1)
  child.close()
  // Synchronous assertion precedes any await: red does not enter Kernel.waitForIdle.
  expect(child.waiting).toHaveLength(0)
  expect(child.has('s')).toBe(true)
  expect(child.pendingCount).toBe(1)
  expect(counts()).toEqual({ cancelled: 1, fired: 0 })
  expect(() => child.schedule('late', 3_000)).toThrow()
  expect(() => child.preview(owner)).toThrow()
  await Promise.all(original)
  const unknown = fixture()
  const unresolved = unknown.child.waiting
  const ack = { token: 'unknown', manifest: unknown.child.preview(owner) }
  unknown.child.quiesce(ack, owner)
  expect(() => unknown.child.cancel('s')).toThrow()
  expect(unknown.child.waiting).toHaveLength(1)
  unknown.child.close()
  expect(unknown.child.waiting).toHaveLength(0)
  expect(unknown.child.has('s')).toBe(true)
  expect(unknown.child.pendingCount).toBeGreaterThan(0)
  expect(() => unknown.child.abort(ack)).toThrow()
  expect(() => unknown.child.schedule('late', 3_000)).toThrow()
  await Promise.all(unresolved)
})
test('commit settles local waiters but preserves exact parent ACK and transferred responsibility', async () => {
  const { child, entry } = fixture()
  try {
    const original = child.waiting
    const ack = { token: 'exact-parent', manifest: child.preview(owner) }
    child.quiesce(ack, owner)
    expect(child.waiting).toHaveLength(1)
    child.commit(ack)
    // Synchronous assertion also fails safely on the unfixed getter.
    expect(child.waiting).toHaveLength(0)
    expect(child.has(entry.sessionId)).toBe(true)
    expect(child.matches(ack.token, entry)).toBe(true)
    expect(child.matches('another-parent', entry)).toBe(false)
    expect(child.pendingCount).toBe(0)
    await Promise.all(original)
    child.schedule('new-local', 3_000)
    expect(child.waiting).toHaveLength(1)
    expect(child.matches(ack.token, entry)).toBe(true)
  } finally {
    child.close()
  }
})
