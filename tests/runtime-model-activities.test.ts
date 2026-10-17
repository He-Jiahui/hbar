import { expect, test } from 'bun:test'
import { z } from 'zod'
import { emptyUsage } from '@hbar/contracts'
import { procedure } from '@hbar/runtime'
import {
  runtimeDriverSummarySchema,
  runtimeDriverSummaryResultSchema,
  runtimeDriverDecisionSchema,
  runtimeDriverDecisionResultSchema,
} from '@hbar/plugin-sdk/runtime-driver'
import { RuntimeModelActivities } from '../apps/host/src/runtime-model-activities'
import { driverRelayFixture } from './fixtures/runtime-driver-relay'

async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected rejection')
}
test('physical model receipts are distinct, idempotent and conservative until every original request settles', () => {
  const activities = new RuntimeModelActivities()
  expect(activities.quiescent).toBe(false)
  const first = crypto.randomUUID(),
    second = crypto.randomUUID()
  expect(activities.begin(first)).toBe(first)
  expect(activities.begin(first)).toBe(first)
  activities.begin(second)
  activities.settle(first)
  activities.settle(first)
  expect(activities.quiescent).toBe(false)
  activities.settle(second)
  expect(activities.quiescent).toBe(true)
  expect(() => activities.begin(first)).toThrow('cannot start another request')
  expect(() => activities.settle(crypto.randomUUID())).toThrow('unavailable')
})
test('active receipts and settled retention are bounded without allowing late receipts to settle a successor', () => {
  const activities = new RuntimeModelActivities()
  const active = Array.from({ length: 64 }, () => activities.begin(crypto.randomUUID()))
  expect(() => activities.begin(crypto.randomUUID())).toThrow('capacity is full')
  for (const id of active) activities.settle(id)
  for (let index = 0; index < 256; index++) activities.settle(activities.begin(crypto.randomUUID()))
  expect(activities.snapshot()).toEqual({ known: true, active: 0, settled: 128 })
  const successor = activities.begin(crypto.randomUUID())
  const old = active[0]
  if (!old) throw new Error('Missing original request')
  expect(() => activities.settle(old)).toThrow('unavailable')
  expect(activities.quiescent).toBe(false)
  activities.settle(successor)
  expect(activities.quiescent).toBe(true)
})

test('an opaque provider transition remains conservative even after a later observed request settles', () => {
  const activities = new RuntimeModelActivities()
  activities.settle(activities.begin(crypto.randomUUID()))
  expect(activities.quiescent).toBe(true)
  activities.markOpaque()
  activities.settle(activities.begin(crypto.randomUUID()))
  expect(activities.quiescent).toBe(false)
})
test('only the actual bound driver can report physical model receipts for an admitted invocation', async () => {
  const f = driverRelayFixture()
  try {
    const input = await f.payload('model-receipts')
    await f.start(input)
    const execution = input.ownership
    if (!execution) throw new Error('Missing original execution')
    expect(f.relay.modelQuiescent(execution)).toBe(false)
    const requestId = crypto.randomUUID(),
      request = { invocationId: input.invocationId, requestId }
    expect(await f.driverPeer.call('driver.modelActivity.begin', request, z.string().uuid())).toBe(requestId)
    expect(await f.driverPeer.call('driver.modelActivity.begin', request, z.string().uuid())).toBe(requestId)
    expect(await failure(f.kernelPeer.call('driver.modelActivity.settle', request, z.undefined()))).toMatchObject({
      code: 'IPC_METHOD_UNAVAILABLE',
    })
    expect(f.relay.modelQuiescent(execution)).toBe(false)
    await f.driverPeer.call('driver.modelActivity.settle', request, z.undefined())
    expect(f.relay.modelQuiescent(execution)).toBe(true)
    expect(await failure(f.driverPeer.call('driver.modelActivity.begin', request, z.string().uuid()))).toMatchObject({
      code: 'MODEL_ACTIVITY_EXPIRED',
    })
    expect(
      await failure(
        f.driverPeer.call('driver.modelActivity.settle', { ...request, invocationId: 'foreign' }, z.undefined()),
      ),
    ).toMatchObject({ code: 'DRIVER_INVOCATION_EXPIRED' })
    await f.terminal(input.invocationId)
    await Bun.sleep(5)
    expect(f.relay.modelQuiescent(execution)).toBe(false)
  } finally {
    f.close()
  }
})
test('a cancelled summary retains the original Run claim and physical model resource until the actual reply', async () => {
  const f = driverRelayFixture(),
    entered = Promise.withResolvers<void>(),
    actual = Promise.withResolvers<{ text: string; usage: ReturnType<typeof emptyUsage> }>(),
    controller = new AbortController()
  f.driverPeer.register(
    'driver.summarize',
    procedure(runtimeDriverSummarySchema, runtimeDriverSummaryResultSchema, () => {
      entered.resolve()
      return actual.promise
    }),
  )
  try {
    const input = await f.payload('summary-receipt')
    await f.start(input)
    const execution = input.ownership
    if (!execution) throw new Error('Missing original execution')
    const requestId = crypto.randomUUID(),
      request = { invocationId: input.invocationId, requestId }
    await f.driverPeer.call('driver.modelActivity.begin', request, z.string().uuid())
    await f.driverPeer.call('driver.modelActivity.settle', request, z.undefined())
    const summary = f.kernelPeer.callTracked(
      'driver.summarize',
      {
        request: { ...input.request, context: { runId: execution.runId, sessionId: execution.sessionId } },
        apiKey: null,
      },
      runtimeDriverSummaryResultSchema,
      { signal: controller.signal },
    )
    void summary.result.catch(() => {})
    await entered.promise
    let released = false
    await f.coordinator.requestRelease(execution, async () => {
      released = true
    })
    controller.abort()
    expect(await failure(summary.result)).toMatchObject({ code: 'IPC_CANCELLED' })
    expect(f.relay.modelQuiescent(execution)).toBe(false)
    expect(released).toBe(false)
    expect(f.coordinator.snapshot()).toMatchObject({ sessions: 1, resources: 1 })
    const response = { text: 'actual physical reply', usage: emptyUsage() }
    actual.resolve(response)
    expect(await summary.settled).toEqual(response)
    await Bun.sleep(5)
    expect(released).toBe(true)
    expect(f.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0 })
  } finally {
    actual.resolve({ text: 'cleanup', usage: emptyUsage() })
    f.close()
  }
})

test('a lost summary transport retains its physical resource until the original driver actually exits', async () => {
  const f = driverRelayFixture(),
    entered = Promise.withResolvers<void>(),
    actual = Promise.withResolvers<{ text: string; usage: ReturnType<typeof emptyUsage> }>()
  f.driverPeer.register(
    'driver.summarize',
    procedure(runtimeDriverSummarySchema, runtimeDriverSummaryResultSchema, () => {
      entered.resolve()
      return actual.promise
    }),
  )
  try {
    const input = await f.payload('summary-unknown')
    await f.start(input)
    const execution = input.ownership
    if (!execution) throw new Error('Missing original execution')
    const summary = f.kernelPeer.callTracked(
      'driver.summarize',
      {
        request: { ...input.request, context: { runId: execution.runId, sessionId: execution.sessionId } },
        apiKey: null,
      },
      runtimeDriverSummaryResultSchema,
    )
    void summary.result.catch(() => {})
    await entered.promise
    await f.driverPeer.notify('runtime.deadline.control', {
      id: crypto.randomUUID(),
      token: crypto.randomUUID(),
      phase: 'pause',
    })
    expect(await failure(summary.settled)).toMatchObject({ code: 'IPC_FORBIDDEN' })
    let released = false
    await f.coordinator.requestRelease(execution, async () => {
      released = true
    })
    expect(f.coordinator.snapshot()).toMatchObject({ sessions: 1, resources: 1 })
    expect(released).toBe(false)
    f.relay.driverExited(f.driver)
    f.coordinator.ownerExited(f.driver)
    expect(f.coordinator.snapshot().resources).toBe(0)
  } finally {
    actual.resolve({ text: 'cleanup', usage: emptyUsage() })
    f.close()
  }
})

test('a terminal driver route cannot release an unsettled model request and its original owner can still settle it', async () => {
  const f = driverRelayFixture()
  try {
    const input = await f.payload('late-physical-settlement')
    await f.start(input)
    const execution = input.ownership
    if (!execution) throw new Error('Missing original execution')
    const request = { invocationId: input.invocationId, requestId: crypto.randomUUID() }
    await f.driverPeer.call('driver.modelActivity.begin', request, z.string().uuid())
    await f.terminal(input.invocationId)
    await Bun.sleep(5)
    let released = false
    await f.coordinator.requestRelease(execution, async () => {
      released = true
    })
    expect(released).toBe(false)
    expect(f.coordinator.snapshot()).toMatchObject({ sessions: 1, resources: 1 })
    await f.driverPeer.call('driver.modelActivity.settle', request, z.undefined())
    await Bun.sleep(5)
    expect(released).toBe(true)
    expect(f.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0 })
  } finally {
    f.close()
  }
})

test('an automatic decision retains actual model resources after logical cancellation', async () => {
  const f = driverRelayFixture(),
    entered = Promise.withResolvers<void>(),
    actual = Promise.withResolvers<z.output<typeof runtimeDriverDecisionResultSchema>>(),
    controller = new AbortController()
  f.driverPeer.register(
    'driver.completeDecision',
    procedure(runtimeDriverDecisionSchema, runtimeDriverDecisionResultSchema, () => {
      entered.resolve()
      return actual.promise
    }),
  )
  try {
    const input = await f.payload('decision-physical')
    await f.start(input)
    const execution = input.ownership
    if (!execution) throw new Error('Missing original execution')
    const decision = f.kernelPeer.callTracked(
      'driver.completeDecision',
      {
        request: {
          ...input.request,
          toolNames: [],
          context: { runId: execution.runId, sessionId: execution.sessionId, selectedToolNames: [] },
        },
        apiKey: null,
        maxOutputTokens: 64,
      },
      runtimeDriverDecisionResultSchema,
      { signal: controller.signal },
    )
    void decision.result.catch(() => {})
    await entered.promise
    let released = false
    await f.coordinator.requestRelease(execution, async () => {
      released = true
    })
    controller.abort()
    expect(await failure(decision.result)).toMatchObject({ code: 'IPC_CANCELLED' })
    expect(released).toBe(false)
    expect(f.coordinator.snapshot()).toMatchObject({ sessions: 1, resources: 1 })
    const response = { text: 'actual structured decision', usage: emptyUsage(), diagnostics: [] }
    actual.resolve(response)
    expect(await decision.settled).toEqual(response)
    await Bun.sleep(5)
    expect(released).toBe(true)
    expect(f.coordinator.snapshot()).toMatchObject({ sessions: 0, resources: 0 })
  } finally {
    actual.resolve({ text: 'cleanup', usage: emptyUsage(), diagnostics: [] })
    f.close()
  }
})
