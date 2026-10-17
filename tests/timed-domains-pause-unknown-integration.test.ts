import { expect, test } from 'bun:test'
import { IpcPeer, procedure } from '@hbar/runtime'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import { sessionWakeStatusSchema, sessionWakeTransferSchema, type SessionWakeEntry } from '@hbar/contracts/session-wake'
import { SessionWakeups, type SessionWakeClock } from '../packages/kernel/src/session-wakeups'
import { RuntimeSessionWakeTransfer } from '../apps/host/src/runtime-session-wake-transfer'

const owner: RuntimeOwner = { unitId: 'kernel', generation: 1, incarnation: 'wake-old' }
const parent: RuntimeOwner = { unitId: 'host', generation: 1, incarnation: 'wake-parent' }
function entry(sessionId: string, dueAt: number): SessionWakeEntry {
  return {
    sessionId,
    dueAt,
    goalId: `goal-${sessionId}`,
    intentId: `intent-${sessionId}`,
    requestId: `goal-intent-${sessionId}`,
    goalRevision: 8,
  }
}
class Clock implements SessionWakeClock {
  time = 1_000
  readonly timers = new Set<{ at: number; callback: () => void }>()
  now() {
    return this.time
  }
  schedule(callback: () => void, delayMs: number) {
    const timer = { callback, at: this.time + delayMs }
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
async function settled() {
  for (let turn = 0; turn < 12; turn++) await Promise.resolve()
}

test('absolute local deadline never fires at the 60s backoff chunk and quiesce/abort keeps its original deadline', () => {
  const clock = new Clock(),
    wakes: string[] = [],
    child = new SessionWakeups((id) => wakes.push(id), clock)
  const value = entry('a', 121_000)
  child.schedule('a', value.dueAt, value)
  clock.advance(60_000)
  expect(wakes).toEqual([])
  const ack = { token: 'checkpoint-a', manifest: child.preview(owner) }
  child.quiesce(ack, owner)
  expect(child.pendingCount).toBe(1)
  clock.advance(20_000)
  expect(wakes).toEqual([])
  child.abort(ack)
  clock.advance(40_000)
  expect(wakes).toEqual(['a'])
  expect(child.pendingCount).toBe(0)
})

test('late invalid restore is atomic, empty stale restore leaves a usable checkpoint, and whole valid manifest restores', () => {
  const clock = new Clock(),
    old = new SessionWakeups(() => {}, clock)
  const a = entry('a', 2_000),
    b = entry('b', 4_000)
  old.schedule('a', a.dueAt, a)
  old.schedule('b', b.dueAt, b)
  const ack = { token: 'restore-all', manifest: old.preview(owner) }
  const fresh = new SessionWakeups(() => {}, clock)
  expect(() => fresh.restore(ack, [a, { ...b, goalRevision: 9 }])).toThrow()
  expect(fresh.has('a')).toBe(false)
  fresh.restore(ack, [])
  expect(fresh.preview(owner).entries).toEqual([])
  const restored = new SessionWakeups(() => {}, clock)
  restored.restore(ack, [a, b])
  expect(restored.pendingCount).toBe(0)
  expect(restored.has('a')).toBe(true)
  expect(restored.has('b')).toBe(true)
  expect(restored.delivered('wrong-token', a)).toBe(false)
})

test('paired IPC child commit must precede parent arm; future entries survive the first due notification', async () => {
  const clock = new Clock(),
    wakes: string[] = [],
    child = new SessionWakeups((id) => wakes.push(id), clock)
  const a = entry('a', 2_000),
    b = entry('b', 4_000)
  child.schedule('a', a.dueAt, a)
  child.schedule('b', b.dueAt, b)
  let releases = 0
  const delivered: string[] = []
  const transfer = new RuntimeSessionWakeTransfer({
    clock,
    physicalRetirement: () => null, // This paired IPC fixture has no native retirement ledger.
    acquire: async () => ({
      owner,
      release: () => {
        releases++
      },
    }),
    notify: async (_hold, ack, value) => {
      expect(child.delivered(ack.token, value)).toBe(true)
      delivered.push(value.sessionId)
      return 'notified'
    },
    fault: () => {
      throw new Error('unexpected fault')
    },
  })
  let right: IpcPeer | undefined
  const left = new IpcPeer({ owner: parent, remote: owner, transport: { send: (frame) => right?.receive(frame) } })
  right = new IpcPeer({ owner, remote: parent, transport: { send: (frame) => left.receive(frame) } })
  right.register(
    'kernel.sessionWakes.commit',
    procedure(sessionWakeTransferSchema, sessionWakeStatusSchema, (input) => {
      child.commit(input.ack)
      return { token: input.ack.token, revision: input.ack.manifest.revision, phase: 'committed' as const }
    }),
  )
  try {
    const ack = transfer.offer(child.preview(owner))
    expect(() => transfer.arm(ack)).toThrow()
    child.quiesce(ack, owner)
    const result = await left.call('kernel.sessionWakes.commit', { ack }, sessionWakeStatusSchema)
    transfer.commit(ack, result)
    transfer.arm(ack)
    expect(child.pendingCount).toBe(0)
    expect(wakes).toEqual([])
    clock.advance(1_000)
    await transfer.whenSettled()
    await settled()
    expect(delivered).toEqual(['a'])
    expect(child.has('b')).toBe(true)
    expect(transfer.restoration(owner)?.entries).toEqual([a, b])
    clock.advance(2_000)
    await transfer.whenSettled()
    await settled()
    expect(delivered).toEqual(['a', 'b'])
    expect(releases).toBe(2)
    expect(wakes).toEqual([]) // Domain delivery is a notification; admission remains Kernel-owned.
  } finally {
    transfer.close()
    child.close()
    left.close()
    right.close()
  }
})

test('notification UNKNOWN retains its physical hold and never retries on later ticks or close', async () => {
  const clock = new Clock(),
    child = new SessionWakeups(() => {}, clock),
    a = entry('a', 2_000)
  child.schedule('a', a.dueAt, a)
  let calls = 0,
    releases = 0,
    faults = 0
  const transfer = new RuntimeSessionWakeTransfer({
    clock,
    physicalRetirement: () => null, // UNKNOWN cannot be cleared by fabricated physical absence.
    acquire: async () => ({
      owner,
      release: () => {
        releases++
      },
    }),
    notify: async () => {
      calls++
      throw new Error('IPC_TIMEOUT')
    },
    fault: () => {
      faults++
    },
  })
  const ack = transfer.offer(child.preview(owner))
  child.quiesce(ack, owner)
  child.commit(ack)
  transfer.commit(ack, { token: ack.token, revision: ack.manifest.revision, phase: 'committed' })
  transfer.arm(ack)
  clock.advance(1_000)
  await transfer.whenSettled()
  await settled()
  clock.advance(300_000)
  await settled()
  transfer.close()
  expect({ calls, releases, faults }).toEqual({ calls: 1, releases: 0, faults: 1 })
  expect(transfer.restoreAck(owner)).toBeUndefined()
  child.close()
})

test('transfer DTO rejects extra authority fields and mismatched durable request identity', () => {
  expect(() =>
    sessionWakeTransferSchema.parse({
      ack: { token: 'forged', manifest: { schemaVersion: 1, owner, revision: 1, entries: [entry('a', 2_000)] } },
      physicalExit: true,
    }),
  ).toThrow()
  expect(() =>
    sessionWakeTransferSchema.parse({
      ack: {
        token: 'forged',
        manifest: {
          schemaVersion: 1,
          owner,
          revision: 1,
          entries: [{ ...entry('a', 2_000), requestId: 'another-request' }],
        },
      },
    }),
  ).toThrow()
})

test('reversible pause preserves later deadlines and a reply accepted before pause settles as known', async () => {
  const clock = new Clock(),
    child = new SessionWakeups(() => {}, clock)
  const a = entry('a', 2_000),
    b = entry('b', 4_000)
  child.schedule('a', a.dueAt, a)
  child.schedule('b', b.dueAt, b)
  let reply: () => void = () => {
    throw new Error('notification has not started')
  }
  const gate = new Promise<void>((resolve) => {
    reply = resolve
  })
  const calls: string[] = []
  let releases = 0
  const transfer = new RuntimeSessionWakeTransfer({
    clock,
    physicalRetirement: () => null,
    acquire: async () => ({
      owner,
      release: () => {
        releases++
      },
    }),
    notify: async (_hold, ack, value) => {
      calls.push(value.sessionId)
      if (value.sessionId === 'a') await gate
      child.delivered(ack.token, value)
      return 'notified'
    },
    fault: () => {
      throw new Error('unexpected unknown')
    },
  })
  const ack = transfer.offer(child.preview(owner))
  child.quiesce(ack, owner)
  child.commit(ack)
  transfer.commit(ack, { token: ack.token, revision: ack.manifest.revision, phase: 'committed' })
  expect(transfer.restoreAck(owner)).toBeUndefined() // committed is not armed.
  transfer.arm(ack)
  clock.advance(1_000)
  await settled()
  expect(calls).toEqual(['a'])
  transfer.pause()
  reply()
  await transfer.whenSettled()
  await settled()
  expect(releases).toBe(1)
  expect(transfer.peek().inFlightFenced).toBe(false)
  clock.advance(3_000)
  await settled()
  expect(calls).toEqual(['a'])
  expect(child.has('b')).toBe(true)
  transfer.resume()
  clock.advance(1)
  await transfer.whenSettled()
  await settled()
  expect(calls).toEqual(['a', 'b'])
  expect(releases).toBe(2)
  transfer.close()
  child.close()
})

test('more than eight empty transfers retain no historic capacity or fabricated restoration ACK', () => {
  const clock = new Clock()
  const transfer = new RuntimeSessionWakeTransfer({
    clock,
    physicalRetirement: () => null,
    acquire: async () => {
      throw new Error('empty transfer must not acquire')
    },
    notify: async () => {
      throw new Error('empty transfer must not notify')
    },
    fault: () => {},
  })
  for (let revision = 0; revision < 20; revision++) {
    const ack = transfer.offer({ schemaVersion: 1, owner, revision, entries: [] })
    transfer.commit(ack, { token: ack.token, revision, phase: 'committed' })
    transfer.arm(ack)
    expect(transfer.restoreAck(owner)).toBeUndefined()
  }
  expect(transfer.peek().entries).toHaveLength(0)
  transfer.close()
})

test('pause while physical acquire is pending is known not-notified and keeps deadline for later resume', async () => {
  const clock = new Clock(),
    child = new SessionWakeups(() => {}, clock),
    value = entry('pause-before-notify', 2_000)
  child.schedule(value.sessionId, value.dueAt, value)
  let grant: (() => void) | undefined
  const acquisition = new Promise<void>((resolve) => {
    grant = resolve
  })
  let releases = 0,
    notifications = 0,
    faults = 0
  const transfer = new RuntimeSessionWakeTransfer({
    clock,
    physicalRetirement: () => null,
    acquire: async () => {
      await acquisition
      return {
        owner,
        release: () => {
          releases++
        },
      }
    },
    notify: async () => {
      notifications++
      return 'notified'
    },
    fault: () => {
      faults++
    },
  })
  try {
    const ack = transfer.offer(child.preview(owner))
    child.quiesce(ack, owner)
    child.commit(ack)
    transfer.commit(ack, { token: ack.token, revision: ack.manifest.revision, phase: 'committed' })
    transfer.arm(ack)
    clock.advance(1_000)
    await settled()
    transfer.pause()
    if (!grant) throw new Error('Acquire gate missing')
    grant()
    await transfer.whenSettled()
    await settled()
    expect({ releases, notifications, faults }).toEqual({ releases: 1, notifications: 0, faults: 0 })
    expect(child.has(value.sessionId)).toBe(true)
    expect(transfer.peek().inFlightFenced).toBe(false)
  } finally {
    transfer.close()
    child.close()
  }
})
