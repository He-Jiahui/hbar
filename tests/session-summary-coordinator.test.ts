import { expect, test } from 'bun:test'
import { SessionSummaryCoordinator } from '../packages/kernel/src/session-summary-coordinator'
import type { SessionSummaryOverride } from '../packages/kernel/src/session-summary-coordinator'

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
