import { expect, test } from 'bun:test'
import { z } from 'zod'
import {
  CommandError,
  CommandRegistry,
  createCommandExpectation,
  createTrackedCommandDispatcher,
  defineCommand,
} from '@hbar/commands'

function gate() {
  let open: () => void = () => {
    throw new Error('Gate has not initialized')
  }
  const wait = new Promise<void>((resolve) => {
    open = resolve
  })
  return { open, wait }
}
async function failure(action: Promise<unknown>): Promise<unknown> {
  try {
    await action
  } catch (error) {
    return error
  }
  throw new Error('Expected command rejection')
}
const input = z.strictObject({ path: z.string().default('proof.txt') })
const output = z.strictObject({ path: z.string().min(5) })
const definition = (timeoutMs = 1_000) =>
  defineCommand(
    {
      id: 'settlement.write',
      owner: 'settlement.fixture',
      version: 1,
      execution: 'host',
      kind: 'command',
      stateEffect: 'persistent',
      scope: 'workspace',
      category: 'settlement',
      titleKey: 'settlement',
      descriptionKey: 'settlement',
      surfaces: ['api'],
      timeoutMs,
    },
    input,
    output,
  )
const invocation = {
  protocol: 1,
  commandId: 'settlement.write',
  commandVersion: 1,
  requestId: 'request',
  idempotencyKey: 'receipt',
  input: {},
}

test('logical write timeout retains capacity and the actual late successful result without executing again', async () => {
  const entered = gate(),
    release = gate()
  let executions = 0,
    physicallySettled = false
  const registry = new CommandRegistry({ execution: 'host', maxConcurrent: 1 })
  registry.register(
    definition(15),
    async (value) => {
      executions++
      entered.open()
      await release.wait
      return value
    },
    { durable: true },
  )
  try {
    const prepared = { descriptor: registry.describe(invocation.commandId), invocation: registry.prepare(invocation) }
    const ticket = registry.dispatchPreparedTracked(prepared.invocation, 'operator', createCommandExpectation(prepared))
    const observe = ticket.settled.then(() => {
      physicallySettled = true
    })
    await entered.wait
    expect(await failure(ticket.result)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(physicallySettled).toBe(false)
    expect(
      await failure(registry.dispatchPrepared(prepared.invocation, 'operator', createCommandExpectation(prepared))),
    ).toMatchObject({ code: 'BUSY' })
    release.open()
    expect(await ticket.settled).toMatchObject({
      status: 'succeeded',
      executionStarted: true,
      result: { path: 'proof.txt' },
    })
    await observe
    expect(physicallySettled).toBe(true)
    expect(executions).toBe(1)
    expect(await ticket.settled).toEqual(await ticket.settled)
  } finally {
    release.open()
    registry.dispose()
  }
})

test('a handler failure after logical timeout remains an observable physical failure', async () => {
  const release = gate()
  const registry = new CommandRegistry({ execution: 'host' })
  registry.register(
    definition(15),
    async () => {
      await release.wait
      throw new CommandError('PARTIAL_FAILURE', 'Inspect the partial write')
    },
    { durable: true },
  )
  try {
    const prepared = { descriptor: registry.describe(invocation.commandId), invocation: registry.prepare(invocation) }
    const ticket = registry.dispatchPreparedTracked(prepared.invocation, 'operator', createCommandExpectation(prepared))
    expect(await failure(ticket.result)).toMatchObject({ code: 'RESULT_UNKNOWN' })
    release.open()
    expect(await ticket.settled).toMatchObject({
      status: 'failed',
      executionStarted: true,
      error: { code: 'PARTIAL_FAILURE' },
    })
  } finally {
    release.open()
    registry.dispose()
  }
})

test('pre-cancel, input rejection and capacity rejection settle without entering a handler', async () => {
  const release = gate()
  let executions = 0
  const registry = new CommandRegistry({ execution: 'host', maxConcurrent: 1 })
  registry.register(
    definition(),
    async (value) => {
      executions++
      await release.wait
      return value
    },
    { durable: true },
  )
  try {
    const prepared = { descriptor: registry.describe(invocation.commandId), invocation: registry.prepare(invocation) }
    const expected = createCommandExpectation(prepared)
    for (const ticket of [
      registry.dispatchPreparedTracked(prepared.invocation, 'operator', expected, { signal: AbortSignal.abort() }),
      registry.dispatchPreparedTracked({ ...prepared.invocation, input: { path: 3 } }, 'operator', expected),
    ]) {
      await failure(ticket.result)
      expect(await ticket.settled).toMatchObject({ status: 'failed', executionStarted: false })
    }
    const active = registry.dispatchPreparedTracked(prepared.invocation, 'operator', expected)
    const busy = registry.dispatchPreparedTracked(prepared.invocation, 'operator', expected)
    expect(await failure(busy.result)).toMatchObject({ code: 'BUSY' })
    expect(await busy.settled).toMatchObject({ status: 'failed', executionStarted: false, error: { code: 'BUSY' } })
    release.open()
    await active.result
    expect(executions).toBe(1)
  } finally {
    release.open()
    registry.dispose()
  }
})

test('cancel during asynchronous capability admission waits for physical admission work to finish', async () => {
  const entered = gate(),
    release = gate()
  let physicallySettled = false,
    executions = 0
  const registry = new CommandRegistry({
    execution: 'host',
    authorize: async () => {
      entered.open()
      await release.wait
      return true
    },
  })
  const value = definition()
  registry.register(
    { ...value, metadata: { ...value.metadata, capabilities: ['settlement.fixture'] } },
    (data) => {
      executions++
      return data
    },
    { durable: true },
  )
  try {
    const prepared = { descriptor: registry.describe(invocation.commandId), invocation: registry.prepare(invocation) }
    const controller = new AbortController()
    const ticket = registry.dispatchPreparedTracked(
      prepared.invocation,
      'operator',
      createCommandExpectation(prepared),
      { signal: controller.signal },
    )
    const observe = ticket.settled.then(() => {
      physicallySettled = true
    })
    await entered.wait
    controller.abort()
    expect(await failure(ticket.result)).toMatchObject({ code: 'CANCELLED' })
    expect(physicallySettled).toBe(false)
    release.open()
    expect(await ticket.settled).toMatchObject({
      status: 'failed',
      executionStarted: false,
      error: { code: 'CANCELLED' },
    })
    await observe
    expect(executions).toBe(0)
  } finally {
    release.open()
    registry.dispose()
  }
})

test('the final owner guard reports that no handler started when validation changes after authorization', async () => {
  let changed = false,
    executions = 0
  const registry = new CommandRegistry({
    execution: 'host',
    authorize: () => {
      changed = true
      return true
    },
  })
  const value = definition()
  registry.register(
    {
      ...value,
      metadata: { ...value.metadata, capabilities: ['settlement.fixture'] },
      input: input.superRefine((data) => {
        if (changed) data.path = 'outside.txt'
      }),
    },
    (data) => {
      executions++
      return data
    },
    { durable: true },
  )
  try {
    const prepared = { descriptor: registry.describe(invocation.commandId), invocation: registry.prepare(invocation) }
    const ticket = registry.dispatchPreparedTracked(prepared.invocation, 'operator', createCommandExpectation(prepared))
    expect(await failure(ticket.result)).toMatchObject({ code: 'COMMAND_PREPARATION_STALE' })
    expect(await ticket.settled).toMatchObject({
      status: 'failed',
      executionStarted: false,
      error: { code: 'COMMAND_PREPARATION_STALE' },
    })
    expect(executions).toBe(0)
  } finally {
    registry.dispose()
  }
})

test('invalid output keeps the physical handler-started fact', async () => {
  const registry = new CommandRegistry({ execution: 'host' })
  registry.register(definition(), () => ({ path: 'x' }), { durable: true })
  try {
    const prepared = { descriptor: registry.describe(invocation.commandId), invocation: registry.prepare(invocation) }
    const ticket = registry.dispatchPreparedTracked(prepared.invocation, 'operator', createCommandExpectation(prepared))
    expect(await failure(ticket.result)).toMatchObject({ code: 'INVALID_OUTPUT' })
    expect(await ticket.settled).toMatchObject({
      status: 'failed',
      executionStarted: true,
      error: { code: 'INVALID_OUTPUT' },
    })
  } finally {
    registry.dispose()
  }
})

test('tracked owner adapters refuse logical-only implementations', async () => {
  let executions = 0
  const dispatch = createTrackedCommandDispatcher({
    execute: async () => {
      executions++
      return {}
    },
  })
  const registry = new CommandRegistry({ execution: 'host' })
  registry.register(definition(), (value) => value, { durable: true })
  try {
    const prepared = { descriptor: registry.describe(invocation.commandId), invocation: registry.prepare(invocation) }
    expect(() => dispatch(prepared.invocation, 'operator', createCommandExpectation(prepared))).toThrow(
      'physical settlement tracking',
    )
    expect(executions).toBe(0)
    const supported = createTrackedCommandDispatcher(registry)(
      prepared.invocation,
      'operator',
      createCommandExpectation(prepared),
    )
    expect(await supported.result).toEqual({ path: 'proof.txt' })
    expect(await supported.settled).toMatchObject({ status: 'succeeded', result: { path: 'proof.txt' } })
  } finally {
    registry.dispose()
  }
})
