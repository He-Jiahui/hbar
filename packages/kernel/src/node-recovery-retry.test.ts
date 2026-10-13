import { describe, expect, test } from 'bun:test'
import { NodeRecoveryRetryScheduler, type NodeRecoveryRetryTimers } from './node-recovery-retry'

function fakeTimers() {
  const callbacks = new Map<ReturnType<typeof setTimeout>, () => void>()
  const delays = new Map<ReturnType<typeof setTimeout>, number>()
  const port: NodeRecoveryRetryTimers = {
    set: (callback, delayMs) => {
      const timer = setTimeout(() => {}, 60_000)
      callbacks.set(timer, callback)
      delays.set(timer, delayMs)
      return timer
    },
    clear: (timer) => {
      clearTimeout(timer)
      callbacks.delete(timer)
      delays.delete(timer)
    },
  }
  const fire = (timer: ReturnType<typeof setTimeout>) => {
    clearTimeout(timer)
    const callback = callbacks.get(timer)
    callbacks.delete(timer)
    delays.delete(timer)
    callback?.()
  }
  return { port, callbacks, delays, fire }
}

describe('NodeRecoveryRetryScheduler', () => {
  test('keeps one timer per Run and backs off from 15 to 30 seconds', async () => {
    const fake = fakeTimers()
    const retried: string[] = []
    const scheduler = new NodeRecoveryRetryScheduler(async (runId) => {
      retried.push(runId)
    }, fake.port)
    scheduler.schedule('run-a')
    scheduler.schedule('run-a')
    expect(fake.delays.size).toBe(1)
    expect([...fake.delays.values()]).toEqual([15_000])
    const firstTimer = fake.delays.keys().next().value
    expect(firstTimer).toBeDefined()
    const first = firstTimer ? fake.callbacks.get(firstTimer) : undefined
    expect(first).toBeDefined()
    if (firstTimer) fake.fire(firstTimer)
    await Promise.resolve()
    expect(retried).toEqual(['run-a'])
    scheduler.schedule('run-a')
    expect([...fake.delays.values()]).toEqual([30_000])
    scheduler.clear('run-a')
    expect(fake.delays.size).toBe(0)
    scheduler.close()
  })

  test('close cancels pending retries and prevents later callbacks', () => {
    const fake = fakeTimers()
    const scheduler = new NodeRecoveryRetryScheduler(async () => {}, fake.port)
    scheduler.schedule('run-a')
    scheduler.schedule('run-b')
    scheduler.close()
    expect(fake.callbacks.size).toBe(0)
    expect(fake.delays.size).toBe(0)
    scheduler.schedule('run-c')
    expect(fake.callbacks.size).toBe(0)
  })
})
