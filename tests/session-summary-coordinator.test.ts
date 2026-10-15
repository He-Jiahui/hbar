import { expect, test } from 'bun:test'
import { SessionSummaryCoordinator } from '../packages/kernel/src/session-summary-coordinator'
import type { SessionSummaryOverride } from '../packages/kernel/src/session-summary-coordinator'
import { SessionSummaryDrainError } from '../packages/kernel/src/session-summary-coordinator'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for the summary coordinator')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

test('serializes one session summary read and publishes only the latest coalesced result', async () => {
  const firstRead = deferred<void>()
  const secondRead = deferred<void>()
  const firstEntered = deferred<void>()
  const secondEntered = deferred<void>()
  const calls: SessionSummaryOverride[] = []
  const currentAtSettlement: boolean[] = []
  const published: SessionSummaryOverride[] = []
  let active = 0
  let maxActive = 0
  const coordinator = new SessionSummaryCoordinator(async (_sessionId, override, isCurrent) => {
    calls.push(override)
    active += 1
    maxActive = Math.max(maxActive, active)
    const call = calls.length
    if (call === 1) {
      firstEntered.resolve()
      await firstRead.promise
    } else {
      secondEntered.resolve()
      await secondRead.promise
    }
    currentAtSettlement.push(isCurrent())
    if (isCurrent()) published.push(override)
    active -= 1
  })
  coordinator.schedule('session-a', 'thinking', 'run-a')
  await firstEntered.promise
  coordinator.schedule('session-a', 'output', 'run-b')
  coordinator.schedule('session-a', 'tool', 'run-c')
  coordinator.schedule('session-a', 'completed', null)
  await new Promise((resolve) => setTimeout(resolve, 120))
  expect(calls).toHaveLength(1)
  expect(maxActive).toBe(1)

  firstRead.resolve()
  await secondEntered.promise
  expect(calls).toHaveLength(2)
  expect(calls[1]).toEqual({ activity: 'completed', activeRunId: null })
  expect(maxActive).toBe(1)
  secondRead.resolve()
  await waitFor(() => published.length === 1)
  expect(currentAtSettlement).toEqual([false, true])
  expect(published).toEqual([{ activity: 'completed', activeRunId: null }])
  coordinator.close()
})

function manualSummaryTimers() {
  const callbacks = new Map<ReturnType<typeof setTimeout>, () => void>()
  return {
    setTimer(callback: () => void) {
      const timer = setTimeout(() => {}, 60_000)
      callbacks.set(timer, callback)
      return timer
    },
    clearTimer(timer: ReturnType<typeof setTimeout>) {
      callbacks.delete(timer)
      clearTimeout(timer)
    },
    fireAll() {
      for (const [timer, callback] of [...callbacks]) {
        clearTimeout(timer)
        callbacks.delete(timer)
        callback()
      }
    },
    get pending() {
      return callbacks.size
    },
  }
}

test('pre-start state replacement preserves the ordinary callback and schedules the next pending state', async () => {
  const timers = manualSummaryTimers()
  const first = deferred<void>()
  const second = deferred<void>()
  const calls: Array<{ activity: SessionSummaryOverride['activity']; current: boolean }> = []
  const coordinator = new SessionSummaryCoordinator((_id, override, current) => {
    calls.push({ activity: override.activity, current: current() })
    if (calls.length === 1) first.resolve()
    else second.resolve()
    return Promise.resolve()
  }, timers)
  try {
    coordinator.schedule('same', 'output', 'run-a')
    timers.fireAll()
    // Replace the state before the queued publication microtask starts; this is not shutdown.
    coordinator.schedule('same', 'completed', null)
    await first.promise
    expect(calls).toEqual([{ activity: 'output', current: false }])
    await waitFor(() => timers.pending === 1)
    timers.fireAll()
    await second.promise
    expect(calls).toEqual([
      { activity: 'output', current: false },
      { activity: 'completed', current: true },
    ])
  } finally {
    await coordinator.closeAndWait()
  }
})

test('a failed session does not finish shutdown before another issued session settles', async () => {
  const timers = manualSummaryTimers()
  const enteredA = deferred<void>()
  const enteredB = deferred<void>()
  const releaseA = deferred<void>()
  const releaseB = deferred<void>()
  let joined = false
  const coordinator = new SessionSummaryCoordinator(async (id) => {
    if (id === 'failure') {
      enteredA.resolve()
      await releaseA.promise
      throw new Error('controlled-failure')
    }
    enteredB.resolve()
    await releaseB.promise
  }, timers)
  coordinator.schedule('failure', 'output', 'run-a')
  coordinator.schedule('blocked', 'output', 'run-b')
  timers.fireAll()
  await Promise.all([enteredA.promise, enteredB.promise])
  const outcome = coordinator.closeAndWait().then(
    () => {
      joined = true
      return null
    },
    (error: unknown) => {
      joined = true
      return error
    },
  )
  try {
    releaseA.resolve()
    await Bun.sleep(0)
    expect(joined).toBe(false)
    releaseB.resolve()
    expect(await outcome).toBeInstanceOf(SessionSummaryDrainError)
    expect(joined).toBe(true)
  } finally {
    releaseA.resolve()
    releaseB.resolve()
    await outcome
  }
})

test('close joins issued reads across sessions before resolving and suppresses all later publication', async () => {
  const timers = manualSummaryTimers()
  const enteredA = deferred<void>()
  const enteredB = deferred<void>()
  const releaseA = deferred<void>()
  const releaseB = deferred<void>()
  let calls = 0
  let published = 0
  let joined = false
  const coordinator = new SessionSummaryCoordinator(async (id, _override, current) => {
    calls++
    if (id === 'a') {
      enteredA.resolve()
      await releaseA.promise
    } else {
      enteredB.resolve()
      await releaseB.promise
    }
    if (current()) published++
  }, timers)
  try {
    coordinator.schedule('a', 'output', 'run-a')
    coordinator.schedule('b', 'output', 'run-b')
    timers.fireAll()
    await Promise.all([enteredA.promise, enteredB.promise])
    coordinator.schedule('a', 'completed', null)
    const drain = coordinator.closeAndWait().then(() => {
      joined = true
    })
    coordinator.schedule('c', 'output', 'run-c')
    releaseA.resolve()
    await Bun.sleep(0)
    expect(joined).toBe(false)
    releaseB.resolve()
    await drain
    expect(calls).toBe(2)
    expect(published).toBe(0)
    expect(timers.pending).toBe(0)
    await coordinator.closeAndWait()
  } finally {
    releaseA.resolve()
    releaseB.resolve()
    await coordinator.closeAndWait()
  }
})

test('close before a queued publication microtask does not issue the read', async () => {
  const timers = manualSummaryTimers()
  let calls = 0
  const coordinator = new SessionSummaryCoordinator(() => {
    calls++
    return Promise.resolve()
  }, timers)
  coordinator.schedule('queued', 'output', 'run-a')
  timers.fireAll()
  await coordinator.closeAndWait()
  expect(calls).toBe(0)
})

test('a shutdown read failure is retained and propagated even after earlier close invalidation', async () => {
  const timers = manualSummaryTimers()
  const entered = deferred<void>()
  const read = deferred<void>()
  const failure = new Error('controlled-summary-read-failure')
  const coordinator = new SessionSummaryCoordinator(async () => {
    entered.resolve()
    await read.promise
  }, timers)
  coordinator.schedule('failure', 'output', 'run-a')
  timers.fireAll()
  await entered.promise
  coordinator.close()
  read.reject(failure)
  try {
    await coordinator.closeAndWait()
    throw new Error('EXPECTED_SUMMARY_DRAIN_FAILED')
  } catch (error) {
    expect(error).toBeInstanceOf(SessionSummaryDrainError)
    if (!(error instanceof SessionSummaryDrainError)) throw error
    expect(error.code).toBe('SUMMARY_DRAIN_FAILED')
    expect(error.pendingOperations).toBe(0)
    expect(error.cause).toBeInstanceOf(AggregateError)
    if (!(error.cause instanceof AggregateError)) throw error
    expect(error.cause.errors).toEqual([failure])
  }
  await expect(coordinator.closeAndWait()).rejects.toMatchObject({ code: 'SUMMARY_DRAIN_FAILED' })
})

test('timeout rejects join while the real read remains active and allows a later successful join', async () => {
  const timers = manualSummaryTimers()
  const entered = deferred<void>()
  const release = deferred<void>()
  let active = false
  const coordinator = new SessionSummaryCoordinator(async () => {
    active = true
    entered.resolve()
    await release.promise
    active = false
  }, timers)
  try {
    coordinator.schedule('timeout', 'output', 'run-a')
    timers.fireAll()
    await entered.promise
    await expect(coordinator.closeAndWait({ timeoutMs: 10 })).rejects.toMatchObject({
      code: 'SUMMARY_DRAIN_TIMEOUT',
      pendingOperations: 1,
    })
    expect(active).toBe(true)
    release.resolve()
    await coordinator.closeAndWait()
    expect(active).toBe(false)
  } finally {
    release.resolve()
    await coordinator.closeAndWait()
  }
})

test.each([new Error('controlled-summary-drain-abort'), null, false, 0])(
  'abort rejects only the wait, retains the issued read, and keeps future work gated (%p)',
  async (reason) => {
    const timers = manualSummaryTimers()
    const entered = deferred<void>()
    const release = deferred<void>()
    const controller = new AbortController()
    let active = false
    let calls = 0
    const coordinator = new SessionSummaryCoordinator(async () => {
      calls++
      active = true
      entered.resolve()
      await release.promise
      active = false
    }, timers)
    try {
      coordinator.schedule('abort', 'output', 'run-a')
      timers.fireAll()
      await entered.promise
      const outcome = coordinator.closeAndWait({ signal: controller.signal }).then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      )
      controller.abort(reason)
      const result = await outcome
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('EXPECTED_SUMMARY_DRAIN_ABORT')
      expect(result.error).toBe(reason)
      expect(active).toBe(true)
      coordinator.schedule('later', 'output', 'run-b')
      expect(timers.pending).toBe(0)
      release.resolve()
      await coordinator.closeAndWait()
      expect(calls).toBe(1)
      expect(active).toBe(false)
    } finally {
      release.resolve()
      await coordinator.closeAndWait()
    }
  },
)

test('a failed summary read releases its session slot and retries the latest pending state once', async () => {
  const releaseFailure = deferred<void>()
  const firstEntered = deferred<void>()
  const secondEntered = deferred<void>()
  const calls: SessionSummaryOverride[] = []
  const coordinator = new SessionSummaryCoordinator(async (_sessionId, override) => {
    calls.push(override)
    if (calls.length === 1) {
      firstEntered.resolve()
      await releaseFailure.promise
      throw new Error('fixture read failure')
    }
    secondEntered.resolve()
  })

  coordinator.schedule('session-b', 'thinking', 'run-a')
  await firstEntered.promise
  coordinator.schedule('session-b', 'reading', 'run-b')
  coordinator.schedule('session-b', 'failed', null)
  releaseFailure.resolve()
  await secondEntered.promise
  expect(calls).toEqual([
    { activity: 'thinking', activeRunId: 'run-a' },
    { activity: 'failed', activeRunId: null },
  ])
  coordinator.close()
})

test('same-run stream updates do not starve publication while changed state waits for the next read', async () => {
  const finishFirst = deferred<void>()
  const enteredFirst = deferred<void>()
  const enteredSecond = deferred<void>()
  const published: SessionSummaryOverride[] = []
  const coordinator = new SessionSummaryCoordinator(async (_sessionId, override, isCurrent) => {
    if (published.length === 0) {
      enteredFirst.resolve()
      await finishFirst.promise
    } else {
      enteredSecond.resolve()
    }
    if (isCurrent()) published.push(override)
  })

  coordinator.schedule('session-stream', 'output', 'run-a')
  await enteredFirst.promise
  for (let index = 0; index < 6; index += 1) {
    coordinator.schedule('session-stream', 'output', 'run-a')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  finishFirst.resolve()
  await enteredSecond.promise
  await waitFor(() => published.length === 2)
  expect(published).toEqual([
    { activity: 'output', activeRunId: 'run-a' },
    { activity: 'output', activeRunId: 'run-a' },
  ])
  coordinator.close()
})

test('one blocked session does not block other sessions and failures without pending work do not retry', async () => {
  const blocked = deferred<void>()
  const blockedEntered = deferred<void>()
  const failedEntered = deferred<void>()
  const independentEntered = deferred<void>()
  const calls: string[] = []
  const coordinator = new SessionSummaryCoordinator(async (sessionId) => {
    calls.push(sessionId)
    if (sessionId === 'blocked') {
      blockedEntered.resolve()
      await blocked.promise
    } else if (sessionId === 'failed') {
      failedEntered.resolve()
      throw new Error('fixture failure without pending updates')
    } else {
      independentEntered.resolve()
    }
  })

  coordinator.schedule('blocked', 'output', 'run-a')
  coordinator.schedule('failed', 'output', 'run-b')
  await Promise.all([blockedEntered.promise, failedEntered.promise])
  coordinator.schedule('independent', 'completed', null)
  await independentEntered.promise
  await new Promise((resolve) => setTimeout(resolve, 120))
  expect(calls).toEqual(['blocked', 'failed', 'independent'])
  blocked.resolve()
  await new Promise((resolve) => setTimeout(resolve, 20))
  coordinator.schedule('failed', 'completed', null)
  await waitFor(() => calls.filter((sessionId) => sessionId === 'failed').length === 2)
  expect(calls.filter((sessionId) => sessionId === 'failed')).toHaveLength(2)
  coordinator.close()
})

test('cancel invalidates an in-flight publication and clears the pending update; close rejects later work', async () => {
  const finish = deferred<void>()
  const entered = deferred<void>()
  const settlementCurrent: boolean[] = []
  let calls = 0
  const coordinator = new SessionSummaryCoordinator(async (_sessionId, _override, isCurrent) => {
    calls += 1
    entered.resolve()
    await finish.promise
    settlementCurrent.push(isCurrent())
  })

  coordinator.schedule('session-c', 'thinking', 'run-a')
  await entered.promise
  coordinator.schedule('session-c', 'output', 'run-b')
  coordinator.cancel('session-c')
  finish.resolve()
  await new Promise((resolve) => setTimeout(resolve, 120))
  expect(calls).toBe(1)
  expect(settlementCurrent).toEqual([false])

  coordinator.schedule('session-c', 'completed', null)
  await new Promise((resolve) => setTimeout(resolve, 120))
  expect(calls).toBe(2)
  coordinator.close()
  coordinator.schedule('session-c', 'failed', 'run-z')
  await new Promise((resolve) => setTimeout(resolve, 120))
  expect(calls).toBe(2)
})
