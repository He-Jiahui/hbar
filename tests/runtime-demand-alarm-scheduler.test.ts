import { expect, test } from 'bun:test'
import {
  RuntimeDemandAlarmScheduler,
  type RuntimeAlarmAttempt,
  type RuntimeAlarmClock,
  type RuntimeAlarmOutcome,
  type RuntimeDemandAlarm,
} from '../apps/host/src/runtime-demand-alarm-scheduler'

class Clock implements RuntimeAlarmClock {
  time = 1_000
  readonly timers = new Set<{ at: number; callback(): void }>()
  readonly allocated: { at: number; callback(): void }[] = []
  now() {
    return this.time
  }
  schedule(callback: () => void, delayMs: number) {
    const timer = { at: this.time + delayMs, callback }
    this.timers.add(timer)
    this.allocated.push(timer)
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
function alarm(key = 'a', version = 1, dueAt = 2_000): RuntimeDemandAlarm {
  return { key, version, dueAt, id: `${key}-${version}`, epoch: 'parent-epoch', unitId: 'kernel' }
}
function deferred() {
  let finish: (outcome: RuntimeAlarmOutcome) => void = () => {
    throw new Error('Missing outcome gate')
  }
  const promise = new Promise<RuntimeAlarmOutcome>((resolve) => {
    finish = resolve
  })
  return { promise, finish }
}
async function turns() {
  for (let index = 0; index < 8; index++) await Promise.resolve()
}

test('bounded admission rejects invalid metadata and the129th key without evicting an existing deadline', () => {
  const clock = new Clock()
  const scheduler = new RuntimeDemandAlarmScheduler('parent-epoch', { due: async () => ({ kind: 'handled' }) }, clock)
  try {
    for (const input of [
      { ...alarm(), key: 'bad\u0001key' },
      { ...alarm(), id: 'x'.repeat(201) },
      { ...alarm(), version: Number.MAX_SAFE_INTEGER + 1 },
      { ...alarm(), dueAt: -1 },
    ])
      expect(() => scheduler.upsert(input)).toThrow()
    expect(clock.allocated).toHaveLength(0)
    expect(scheduler.upsert({ ...alarm(), epoch: 'old-parent' })).toBe('stale')
    expect(clock.allocated).toHaveLength(0)
    const admitted = Array.from({ length: 128 }, (_, index) => scheduler.upsert(alarm(`key-${index}`)))
    expect(admitted.every((value) => value === 'accepted')).toBe(true)
    const before = scheduler.peek()
    expect(scheduler.upsert(alarm('overflow'))).toBe('capacity')
    expect(scheduler.peek()).toEqual(before)
    expect(clock.timers.size).toBe(1)
    expect(scheduler.upsert(alarm('key-0', 2))).toBe('accepted')
    expect(scheduler.peek().entries).toHaveLength(128)
  } finally {
    scheduler.stop()
  }
  expect(clock.timers.size).toBe(0)
  expect(
    () =>
      new RuntimeDemandAlarmScheduler('epoch', { due: async () => ({ kind: 'handled' }) }, clock, { maxKeys: 4097 }),
  ).toThrow()
  expect(
    () =>
      new RuntimeDemandAlarmScheduler('epoch', { due: async () => ({ kind: 'handled' }) }, clock, { maxAttempts: 0 }),
  ).toThrow()
  expect(
    () =>
      new RuntimeDemandAlarmScheduler('epoch', { due: async () => ({ kind: 'handled' }) }, clock, {
        initialBackoffMs: 2,
        maxBackoffMs: 1,
      }),
  ).toThrow()
})

test('monotone metadata and detached inspection neither wake nor allocate another timer', () => {
  const clock = new Clock()
  let calls = 0
  const scheduler = new RuntimeDemandAlarmScheduler(
    'parent-epoch',
    {
      due: async () => {
        calls++
        return { kind: 'handled' }
      },
    },
    clock,
  )
  const input = {
    key: 'x'.repeat(200),
    id: 'y'.repeat(200),
    epoch: 'parent-epoch',
    version: 2,
    unitId: 'kernel',
    dueAt: 2_000,
  }
  try {
    expect(scheduler.upsert(input)).toBe('accepted')
    expect(scheduler.upsert({ ...input, version: 1 })).toBe('stale')
    expect(scheduler.upsert(input)).toBe('unchanged')
    expect(() => scheduler.upsert({ ...input, dueAt: 3_000 })).toThrow('ALARM_REVISION_CONFLICT')
    input.dueAt = 9_000
    const snapshot = scheduler.peek(),
      first = snapshot.entries[0]
    if (!first) throw new Error('Missing admitted alarm')
    Object.assign(first.alarm, { dueAt: 0 })
    for (let index = 0; index < 100; index++) expect(scheduler.peek().entries[0]?.alarm.dueAt).toBe(2_000)
    expect(clock.allocated).toHaveLength(1)
    expect(calls).toBe(0)
  } finally {
    scheduler.stop()
  }
})

test('foreground and alarm join one physical flight, and cancel does not release it before callback settlement', async () => {
  const clock = new Clock(),
    gate = deferred(),
    calls: string[] = [],
    signals: AbortSignal[] = []
  const scheduler = new RuntimeDemandAlarmScheduler(
    'parent-epoch',
    {
      due: async (value, signal) => {
        calls.push(value.key)
        signals.push(signal)
        return value.key === 'a' ? gate.promise : { kind: 'handled' }
      },
    },
    clock,
  )
  try {
    scheduler.upsert(alarm('a'))
    scheduler.upsert(alarm('b'))
    const first = scheduler.runNow(alarm('a')),
      joined = scheduler.runNow(alarm('a'))
    if (first.kind !== 'started' || joined.kind !== 'joined') throw new Error('Missing joined physical flight')
    expect(joined.settled).toBe(first.settled)
    expect(joined.attempt).toEqual(first.attempt)
    await turns()
    expect(calls).toEqual(['a'])
    expect(scheduler.runNow(alarm('b')).kind).toBe('busy')
    expect(scheduler.cancel(alarm('a'))).toBe(true)
    expect(signals[0]?.aborted).toBe(true)
    expect(scheduler.peek().inFlight?.key).toBe('a')
    expect(scheduler.runNow(alarm('b')).kind).toBe('busy')
    gate.finish({ kind: 'handled' })
    await first.settled
    expect(scheduler.peek().entries.find((value) => value.alarm.key === 'a')?.phase).toBe('cancelled')
    clock.advance(1_001)
    await scheduler.whenSettled()
    expect(calls).toEqual(['a', 'b'])
  } finally {
    gate.finish({ kind: 'handled' })
    scheduler.stop()
    await scheduler.whenSettled()
  }
})

test('superseded physical completion cannot acknowledge a successor revision', async () => {
  const clock = new Clock(),
    gate = deferred(),
    calls: number[] = [],
    signals: AbortSignal[] = []
  const scheduler = new RuntimeDemandAlarmScheduler(
    'parent-epoch',
    {
      due: async (value, signal) => {
        calls.push(value.version)
        signals.push(signal)
        return value.version === 1 ? gate.promise : { kind: 'handled' }
      },
    },
    clock,
  )
  try {
    scheduler.upsert(alarm())
    const old = scheduler.runNow(alarm())
    if (old.kind !== 'started') throw new Error('Missing predecessor flight')
    await turns()
    scheduler.upsert(alarm('a', 2))
    expect(signals[0]?.aborted).toBe(true)
    expect(scheduler.runNow(alarm('a', 2)).kind).toBe('busy')
    gate.finish({ kind: 'handled' })
    await old.settled
    expect(scheduler.peek().entries[0]).toMatchObject({ phase: 'queued', attempts: 0, alarm: { version: 2 } })
    clock.advance(1_000)
    await scheduler.whenSettled()
    expect(calls).toEqual([1, 2])
    expect(scheduler.peek().entries[0]).toMatchObject({ phase: 'handled', attempts: 1 })
  } finally {
    gate.finish({ kind: 'handled' })
    scheduler.stop()
    await scheduler.whenSettled()
  }
})

for (const rejects of [false, true])
  test(`UNKNOWN keeps the physical fence after logical settlement; rejects=${String(rejects)}`, async () => {
    const clock = new Clock(),
      calls: string[] = []
    let attempt: RuntimeAlarmAttempt | undefined
    const scheduler = new RuntimeDemandAlarmScheduler(
      'parent-epoch',
      {
        due: async (value, _signal, current) => {
          calls.push(value.key)
          if (value.key === 'a') {
            attempt = current
            if (rejects) throw new Error('Unknown external outcome')
            return { kind: 'unknown' }
          }
          return { kind: 'handled' }
        },
      },
      clock,
    )
    try {
      scheduler.upsert(alarm('a'))
      scheduler.upsert(alarm('b'))
      scheduler.runNow(alarm('a'))
      await scheduler.whenSettled()
      expect(scheduler.peek().inFlightFenced).toBe(true)
      clock.advance(100_000)
      await turns()
      expect(calls).toEqual(['a'])
      expect(scheduler.runNow(alarm('a')).kind).toBe('blocked')
      expect(scheduler.runNow(alarm('b')).kind).toBe('busy')
      if (!attempt) throw new Error('Missing exact trusted attempt')
      expect(scheduler.confirmPhysicalCompletion({ ...attempt, attempt: attempt.attempt + 1 })).toBe(false)
      expect(scheduler.confirmPhysicalCompletion({ ...attempt, epoch: 'forged' })).toBe(false)
      expect(scheduler.confirmPhysicalCompletion(attempt)).toBe(true)
      expect(scheduler.confirmPhysicalCompletion(attempt)).toBe(false)
      expect(scheduler.peek().entries.find((value) => value.alarm.key === 'a')).toMatchObject({
        phase: 'blocked',
        reason: rejects ? 'callback-failed' : 'unknown',
      })
      expect(scheduler.runNow(alarm('a')).kind).toBe('blocked')
      clock.advance(1)
      await scheduler.whenSettled()
      expect(calls).toEqual(['a', 'b'])
    } finally {
      scheduler.stop()
      await scheduler.whenSettled()
    }
  })

test('positively safe retries use bounded backoff without changing the original deadline and stop at the attempt limit', async () => {
  const clock = new Clock()
  let calls = 0
  const scheduler = new RuntimeDemandAlarmScheduler(
    'parent-epoch',
    {
      due: async () => {
        calls++
        return { kind: 'retry', reason: 'not-dispatched' }
      },
    },
    clock,
    { maxAttempts: 3, initialBackoffMs: 100, maxBackoffMs: 150 },
  )
  try {
    scheduler.upsert(alarm())
    clock.advance(1_000)
    await scheduler.whenSettled()
    expect(calls).toBe(1)
    expect(scheduler.peek().entries[0]).toMatchObject({ attempts: 1, nextAttemptAt: 2_100, alarm: { dueAt: 2_000 } })
    clock.advance(99)
    await turns()
    expect(calls).toBe(1)
    clock.advance(1)
    await scheduler.whenSettled()
    expect(scheduler.peek().entries[0]).toMatchObject({ attempts: 2, nextAttemptAt: 2_250, alarm: { dueAt: 2_000 } })
    clock.advance(150)
    await scheduler.whenSettled()
    expect(calls).toBe(3)
    expect(scheduler.peek().entries[0]).toMatchObject({ phase: 'blocked', attempts: 3, reason: 'retry-limit' })
    clock.advance(100_000)
    await turns()
    expect(calls).toBe(3)
  } finally {
    scheduler.stop()
  }
})

test('pause rejects foreground work and stale callbacks, then resumes the same queued deadline once', async () => {
  const clock = new Clock()
  let calls = 0
  const scheduler = new RuntimeDemandAlarmScheduler(
    'parent-epoch',
    {
      due: async () => {
        calls++
        return { kind: 'handled' }
      },
    },
    clock,
  )
  try {
    scheduler.upsert(alarm())
    const original = scheduler.peek().entries[0],
      stale = clock.allocated[0]
    if (!original || !stale) throw new Error('Missing queued timer')
    scheduler.pause()
    clock.advance(5_000)
    stale.callback()
    await turns()
    expect(calls).toBe(0)
    expect(scheduler.runNow(alarm()).kind).toBe('paused')
    expect(scheduler.peek().entries[0]).toEqual(original)
    scheduler.resume()
    clock.advance(1)
    await scheduler.whenSettled()
    expect(calls).toBe(1)
    expect(scheduler.peek().entries[0]).toMatchObject({ attempts: 1, alarm: original.alarm })
  } finally {
    scheduler.stop()
  }
})

test('stop preserves active responsibility and physical occupancy until the accepted callback really settles', async () => {
  const clock = new Clock(),
    gate = deferred()
  const scheduler = new RuntimeDemandAlarmScheduler('parent-epoch', { due: async () => gate.promise }, clock)
  try {
    scheduler.upsert(alarm())
    scheduler.runNow(alarm())
    await turns()
    scheduler.stop()
    scheduler.stop()
    expect(scheduler.peek().inFlight).toMatchObject({ key: 'a', version: 1 })
    expect(scheduler.peek().entries[0]).toMatchObject({ phase: 'blocked', reason: 'stopped-active' })
    expect(scheduler.runNow(alarm()).kind).toBe('stopped')
    expect(clock.timers.size).toBe(0)
    expect(() => scheduler.upsert(alarm('new'))).toThrow('ALARM_SCHEDULER_STOPPED')
    gate.finish({ kind: 'handled' })
    await scheduler.whenSettled()
    expect(scheduler.peek().inFlight).toBeNull()
    expect(scheduler.peek().entries[0]?.phase).toBe('blocked')
  } finally {
    gate.finish({ kind: 'handled' })
    scheduler.stop()
    await scheduler.whenSettled()
  }
})

test('long absolute deadline survives bounded timer chunks without an early dispatch', async () => {
  const clock = new Clock()
  let calls = 0
  const scheduler = new RuntimeDemandAlarmScheduler(
    'parent-epoch',
    {
      due: async () => {
        calls++
        return { kind: 'handled' }
      },
    },
    clock,
  )
  try {
    scheduler.upsert(alarm('later', 1, 121_000))
    clock.advance(60_000)
    await turns()
    expect(calls).toBe(0)
    expect(clock.timers.size).toBe(1)
    clock.advance(59_999)
    await turns()
    expect(calls).toBe(0)
    clock.advance(1)
    await scheduler.whenSettled()
    expect(calls).toBe(1)
    expect(scheduler.peek().entries[0]?.alarm.dueAt).toBe(121_000)
  } finally {
    scheduler.stop()
  }
})
