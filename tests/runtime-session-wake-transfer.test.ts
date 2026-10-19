import { expect, test } from 'bun:test'
import { IpcPeer, procedure } from '@hbar/runtime'
import type { RuntimePhysicalRetirementReceipt } from '@hbar/runtime'
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
    physicalRetirement: () => null,
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
    physicalRetirement: () => null,
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

test('native ledger proof releases exactly the held attempt before cleanup; UNKNOWN remains blocked', async () => {
  const clock = new Clock(),
    child = new SessionWakeups(() => {}, clock),
    a = entry('a', 2_000)
  child.schedule('a', a.dueAt, a)
  let ledger: RuntimePhysicalRetirementReceipt | null = null
  let releases = 0,
    calls = 0
  let rejectReply: (error: Error) => void = () => {
    throw new Error('reply gate missing')
  }
  const reply = new Promise<'notified'>((_resolve, reject) => {
    rejectReply = reject
  })
  const transfer = new RuntimeSessionWakeTransfer({
    clock,
    physicalRetirement: () => ledger,
    acquire: async () => ({
      owner,
      release: () => {
        releases++
      },
    }),
    notify: async () => {
      calls++
      return reply
    },
    fault: () => {},
  })
  const ack = transfer.offer(child.preview(owner))
  child.quiesce(ack, owner)
  child.commit(ack)
  transfer.commit(ack, { token: ack.token, revision: ack.manifest.revision, phase: 'committed' })
  transfer.arm(ack)
  clock.advance(1_000)
  await settled()
  const pending = transfer.pendingPhysicalAttempt()
  if (!pending) throw new Error('Missing exact physical attempt')
  const receipt: RuntimePhysicalRetirementReceipt = {
    owner,
    childPid: 17,
    exitCode: 76,
    nativeJoined: true,
    onExitCompleted: true,
    forced: true,
    cleanDisposeAck: false,
  }
  // Caller-supplied receipt alone is not authority, even with matching fields.
  expect(transfer.physicalExitConfirmed(receipt)).toBe(false)
  expect(releases).toBe(0)
  ledger = { ...receipt, owner: { ...owner, incarnation: 'wrong-incarnation' } }
  expect(transfer.physicalExitConfirmed(receipt)).toBe(false)
  ledger = receipt
  expect(transfer.physicalExitConfirmed(receipt)).toBe(true)
  expect(releases).toBe(1)
  expect(transfer.peek().inFlightFenced).toBe(false)
  expect(transfer.reconcile(pending.attempt)).toBe(false) // Native hook may precede logical rejection.
  expect(transfer.pendingPhysicalAttempt()).toEqual({ ...pending, physicalReleased: true })
  rejectReply(new Error('IPC_DISCONNECTED'))
  await transfer.whenSettled()
  await settled()
  expect(transfer.peek().inFlightFenced).toBe(true)
  expect(transfer.reconcile({ ...pending.attempt, attempt: pending.attempt.attempt + 1 })).toBe(false)
  expect(transfer.reconcile(pending.attempt)).toBe(true)
  expect(transfer.pendingPhysicalAttempt()).toBeUndefined()
  expect(transfer.reconcile(pending.attempt)).toBe(false)
  expect(releases).toBe(1)
  expect(transfer.restoreAck(owner)).toBeUndefined()
  expect(transfer.emptyCheckpointAllowed()).toBe(false)
  transfer.resume()
  clock.advance(300_000)
  await settled()
  expect(calls).toBe(1)
  transfer.close()
  child.close()
})

test('new owner cannot replace outstanding responsibility; full recheckpoint permits second sleep and changes the token', async () => {
  const clock = new Clock(),
    old = new SessionWakeups(() => {}, clock)
  const a = entry('a', 2_000),
    b = entry('b', 4_000)
  old.schedule('a', a.dueAt, a)
  old.schedule('b', b.dueAt, b)
  const nextOwner = { ...owner, generation: 2, incarnation: 'wake-new' }
  let selected = old
  const notified: string[] = []
  const transfer = new RuntimeSessionWakeTransfer({
    clock,
    physicalRetirement: () => null,
    acquire: async () => ({ owner: nextOwner, release: () => {} }),
    notify: async (_hold, ack, value) => {
      expect(selected.delivered(ack.token, value)).toBe(true)
      notified.push(value.sessionId)
      return 'notified'
    },
    fault: () => {
      throw new Error('unexpected unknown')
    },
  })
  const first = transfer.offer(old.preview(owner))
  old.quiesce(first, owner)
  old.commit(first)
  transfer.commit(first, { token: first.token, revision: first.manifest.revision, phase: 'committed' })
  transfer.arm(first)
  clock.advance(1_000)
  await transfer.whenSettled()
  await settled()
  expect(notified).toEqual(['a'])
  expect(() => transfer.offer({ schemaVersion: 1, owner: nextOwner, revision: 5, entries: [] })).toThrow()
  const fresh = new SessionWakeups(() => {}, clock)
  fresh.restore(first, [b])
  selected = fresh
  const next = transfer.offer(fresh.preview(nextOwner))
  expect(next.token).not.toBe(first.token)
  fresh.quiesce(next, nextOwner)
  fresh.commit(next)
  transfer.commit(next, { token: next.token, revision: next.manifest.revision, phase: 'committed' })
  transfer.arm(next)
  expect(fresh.pendingCount).toBe(0)
  expect(fresh.preview(nextOwner).entries).toEqual([b])
  expect(fresh.delivered(first.token, b)).toBe(false)
  expect(transfer.restoreAck(owner)).toBeUndefined()
  expect(transfer.restoreAck(nextOwner)?.token).toBe(next.token)
  clock.advance(2_000)
  await transfer.whenSettled()
  await settled()
  expect(notified).toEqual(['a', 'b'])
  expect(transfer.restoreAck(nextOwner)).toBeUndefined()
  expect(transfer.peek().entries.every((value) => value.alarm.dueAt === b.dueAt)).toBe(true)
  expect(transfer.emptyCheckpointAllowed()).toBe(true)
  transfer.close()
  expect(transfer.emptyCheckpointAllowed()).toBe(false)
  transfer.close()
  old.close()
  fresh.close()
})

test('authoritative reply accepted before terminal close settles known without a fabricated UNKNOWN', async () => {
  const clock = new Clock(),
    child = new SessionWakeups(() => {}, clock),
    a = entry('a', 2_000)
  child.schedule('a', a.dueAt, a)
  let finish: () => void = () => {
    throw new Error('reply gate missing')
  }
  const reply = new Promise<void>((resolve) => {
    finish = resolve
  })
  let releases = 0,
    faults = 0
  const transfer = new RuntimeSessionWakeTransfer({
    clock,
    physicalRetirement: () => null,
    acquire: async () => ({
      owner,
      release: () => {
        releases++
      },
    }),
    notify: async () => {
      await reply
      return 'notified'
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
  await settled()
  transfer.close()
  finish()
  await transfer.whenSettled()
  await settled()
  expect({ releases, faults }).toEqual({ releases: 1, faults: 0 })
  expect(transfer.peek().inFlightFenced).toBe(false)
  expect(transfer.pendingPhysicalAttempt()).toBeUndefined()
  child.close()
})

for (const pausePoint of ['restore-pending', 'restore-resolved-before-notify'] as const) {
  test(`explicit not-dispatched during ${pausePoint} preserves deadline and resume delivers once`, async () => {
    const clock = new Clock(),
      child = new SessionWakeups(() => {}, clock),
      a = entry('a', 2_000)
    child.schedule('a', a.dueAt, a)
    let restored: () => void = () => {
      throw new Error('restore gate missing')
    }
    const restore = new Promise<void>((resolve) => {
      restored = resolve
    })
    let paused = false,
      notifyCalls = 0,
      deliverCalls = 0,
      releases = 0,
      faults = 0
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
        notifyCalls++
        await restore // Root's shared restoration has a known outcome before this no-dispatch result.
        if (pausePoint === 'restore-resolved-before-notify' && notifyCalls === 1) {
          paused = true
          transfer.pause()
        }
        if (paused) return 'not-dispatched'
        deliverCalls++
        expect(child.delivered(ack.token, value)).toBe(true)
        return 'notified'
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
    if (pausePoint === 'restore-resolved-before-notify') restored()
    clock.advance(1_000)
    if (pausePoint === 'restore-pending') {
      await settled()
      expect(notifyCalls).toBe(1)
      paused = true
      transfer.pause()
      restored()
    }
    await transfer.whenSettled()
    await settled()
    expect(notifyCalls).toBe(1)
    expect(deliverCalls).toBe(0)
    expect(faults).toBe(0)
    expect(child.has('a')).toBe(true)
    expect(transfer.peek().inFlightFenced).toBe(false)
    expect(transfer.pendingPhysicalAttempt()).toBeUndefined()
    expect(transfer.emptyCheckpointAllowed()).toBe(false)
    paused = false
    transfer.resume()
    clock.advance(1_000)
    await transfer.whenSettled()
    await settled()
    expect(deliverCalls).toBe(1)
    expect(child.has('a')).toBe(false)
    expect(releases).toBeGreaterThanOrEqual(1)
    expect(faults).toBe(0)
    clock.advance(60_000)
    await settled()
    expect(deliverCalls).toBe(1)
    transfer.close()
    child.close()
  })
}

test('close while known restoration is pending returns not-dispatched without any deliver or UNKNOWN', async () => {
  const clock = new Clock(),
    child = new SessionWakeups(() => {}, clock),
    a = entry('a', 2_000)
  child.schedule('a', a.dueAt, a)
  let restored: () => void = () => {
    throw new Error('restore gate missing')
  }
  const restore = new Promise<void>((resolve) => {
    restored = resolve
  })
  let closed = false,
    deliverCalls = 0,
    releases = 0,
    faults = 0
  const transfer = new RuntimeSessionWakeTransfer({
    clock,
    physicalRetirement: () => null,
    acquire: async () => ({
      owner,
      release: () => {
        releases++
      },
    }),
    notify: async () => {
      await restore
      if (closed) return 'not-dispatched'
      deliverCalls++
      return 'notified'
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
  await settled()
  closed = true
  transfer.close()
  restored()
  await transfer.whenSettled()
  await settled()
  expect({ deliverCalls, releases, faults }).toEqual({ deliverCalls: 0, releases: 1, faults: 0 })
  expect(transfer.peek().inFlightFenced).toBe(false)
  expect(transfer.pendingPhysicalAttempt()).toBeUndefined()
  expect(child.has('a')).toBe(true)
  transfer.resume()
  clock.advance(60_000)
  await settled()
  expect(deliverCalls).toBe(0)
  child.close()
})
