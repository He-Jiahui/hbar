import { expect, test } from 'bun:test'
import { z } from 'zod'
import {
  CommandRegistry,
  createGuardedCommandDispatcher,
  createCommandRouter,
  createCommandExpectation,
  defineCommand,
  type CommandContext,
  type CommandDescriptor,
  type CommandExecutionExpectation,
  type CommandInvocation,
  type CommandPreparedOptions,
} from '@hbar/commands'

function definition(
  effect: 'application' | 'persistent' = 'persistent',
  input = z.strictObject({
    path: z.string().default('allowed.txt'),
    options: z.strictObject({ label: z.string() }).default({ label: 'proof' }),
  }),
) {
  return defineCommand(
    {
      id: 'guarded.write',
      version: 1,
      owner: 'guarded.fixture',
      kind: 'command',
      execution: 'host',
      stateEffect: effect,
      scope: 'workspace',
      category: 'guarded',
      titleKey: 'guarded',
      descriptionKey: 'guarded',
      surfaces: ['api'],
      capabilities: ['guarded.fixture'],
    },
    input,
    z.strictObject({ path: z.string() }),
  )
}
const invocation: CommandInvocation = {
  protocol: 1,
  requestId: 'request',
  commandId: 'guarded.write',
  commandVersion: 1,
  idempotencyKey: 'receipt',
  input: {},
}
async function failure(action: Promise<unknown>): Promise<unknown> {
  try {
    await action
  } catch (error) {
    return error
  }
  throw new Error('Expected guarded dispatch rejection')
}
function gate() {
  let open: () => void = () => {
    throw new Error('Gate has not initialized')
  }
  const wait = new Promise<void>((resolve) => {
    open = resolve
  })
  return { open, wait }
}

test('guarded owner dispatch accepts the prepared defaults and preserves actor and request identity', async () => {
  const registry = new CommandRegistry({ execution: 'host', authorize: () => true })
  let context: CommandContext | undefined
  registry.register(
    definition(),
    (input, value) => {
      context = value
      return { path: input.path }
    },
    { durable: true },
  )
  try {
    const prepared = { descriptor: registry.describe(invocation.commandId), invocation: registry.prepare(invocation) }
    const expected = createCommandExpectation(prepared)
    const result = await registry.dispatchPrepared(prepared.invocation, 'operator-a', expected)
    expect(result).toEqual({ path: 'allowed.txt' })
    expect(context).toMatchObject({ actorId: 'operator-a', requestId: 'request', idempotencyKey: 'receipt' })
    const reordered = { ...prepared.invocation, input: { options: { label: 'proof' }, path: 'allowed.txt' } }
    expect(await registry.dispatchPrepared(reordered, 'operator-a', expected)).toEqual(result)
  } finally {
    registry.dispose()
  }
})

test('the final command owner rejects replaced definitions or changed arguments before entering a handler', async () => {
  const registry = new CommandRegistry({ execution: 'host', authorize: () => true })
  let executions = 0
  const dispose = registry.register(definition('application'), (input) => {
    executions++
    return { path: input.path }
  })
  const prepared = { descriptor: registry.describe(invocation.commandId), invocation: registry.prepare(invocation) }
  const expected = createCommandExpectation(prepared)
  try {
    expect(
      await failure(
        registry.dispatchPrepared(
          { ...prepared.invocation, input: { path: 'outside.txt', options: { label: 'proof' } } },
          'operator-a',
          expected,
        ),
      ),
    ).toMatchObject({ code: 'COMMAND_PREPARATION_STALE' })
    dispose()
    registry.register(
      definition(),
      (input) => {
        executions++
        return { path: input.path }
      },
      { durable: true },
    )
    expect(await failure(registry.dispatchPrepared(prepared.invocation, 'operator-a', expected))).toMatchObject({
      code: 'COMMAND_PREPARATION_STALE',
    })
    expect(executions).toBe(0)
  } finally {
    registry.dispose()
  }
})

test('guarded dispatch snapshots nested input and expectation before async authorization', async () => {
  const entered = gate(),
    release = gate()
  const registry = new CommandRegistry({
    execution: 'host',
    authorize: async () => {
      entered.open()
      await release.wait
      return true
    },
  })
  let observed = ''
  registry.register(
    definition(),
    (input) => {
      observed = input.options.label
      return { path: input.path }
    },
    { durable: true },
  )
  try {
    const input = { path: 'allowed.txt', options: { label: 'proof' } }
    const value = { ...invocation, input }
    const expected = createCommandExpectation({
      descriptor: registry.describe(invocation.commandId),
      invocation: registry.prepare(value),
    })
    const running = registry.dispatchPrepared(value, 'operator-a', expected)
    await entered.wait
    input.path = 'outside.txt'
    input.options.label = 'changed'
    expected.input = { path: 'outside.txt', options: { label: 'changed' } }
    release.open()
    expect(await running).toEqual({ path: 'allowed.txt' })
    expect(observed).toBe('proof')
  } finally {
    release.open()
    registry.dispose()
  }
})

test('an owner validator cannot change approved arguments at the last handler boundary', async () => {
  let changed = false,
    executions = 0
  const input = z
    .strictObject({
      path: z.string().default('allowed.txt'),
      options: z.strictObject({ label: z.string() }).default({ label: 'proof' }),
    })
    .superRefine((value) => {
      if (changed) value.path = 'outside.txt'
    })
  const registry = new CommandRegistry({
    execution: 'host',
    authorize: () => {
      changed = true
      return true
    },
  })
  registry.register(
    definition('persistent', input),
    (value) => {
      executions++
      return { path: value.path }
    },
    { durable: true },
  )
  try {
    const prepared = { descriptor: registry.describe(invocation.commandId), invocation: registry.prepare(invocation) }
    expect(
      await failure(registry.dispatchPrepared(prepared.invocation, 'operator-a', createCommandExpectation(prepared))),
    ).toMatchObject({ code: 'COMMAND_PREPARATION_STALE' })
    expect(executions).toBe(0)
  } finally {
    registry.dispose()
  }
})

test('router guarded dispatch reaches the owner guard and never falls back to ordinary dispatch', async () => {
  const registry = new CommandRegistry({ execution: 'host', authorize: () => true })
  registry.register(definition(), (value) => ({ path: value.path }), { durable: true })
  let ordinary = 0,
    guarded = true
  const router = createCommandRouter({
    catalogs: () => [registry.list()],
    resolve: () => ({
      describe: () => registry.describe(invocation.commandId),
      prepare: (value) => registry.prepare(value),
      dispatch: async () => {
        ordinary++
        return null
      },
      ...(guarded
        ? {
            dispatchPrepared: (value: unknown, actorId: string, expected: CommandExecutionExpectation) =>
              registry.dispatchPrepared(value, actorId, expected),
          }
        : {}),
    }),
  })
  try {
    const prepared = await router.prepare(invocation)
    const expected = createCommandExpectation(prepared)
    expect(await router.executePrepared(prepared.invocation, 'operator-a', expected)).toEqual({ path: 'allowed.txt' })
    guarded = false
    expect(await failure(router.executePrepared(prepared.invocation, 'operator-a', expected))).toMatchObject({
      code: 'CAPABILITY_UNAVAILABLE',
    })
    expect(await failure(router.executePrepared(prepared.invocation, ' ', expected))).toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(ordinary).toBe(0)
  } finally {
    registry.dispose()
  }
})

test('typed owner adapters require explicit guarded capability and cannot silently use a transport that drops it', async () => {
  const value = definition()
  const registry = new CommandRegistry({ execution: 'host', authorize: () => true })
  registry.register(value, (input) => ({ path: input.path }), { durable: true })
  const prepared = { descriptor: registry.describe(invocation.commandId), invocation: registry.prepare(invocation) }
  const expected = createCommandExpectation(prepared)
  let executions = 0
  const legacy = createGuardedCommandDispatcher({
    execute: async () => {
      executions++
      return {}
    },
  })
  const owner = createGuardedCommandDispatcher(registry)
  try {
    expect(await failure(legacy(prepared.invocation, 'operator-a', expected))).toMatchObject({
      code: 'CAPABILITY_UNAVAILABLE',
    })
    expect(executions).toBe(0)
    expect(await owner(prepared.invocation, 'operator-a', expected)).toEqual({ path: 'allowed.txt' })
    expect(
      await failure(owner(prepared.invocation, 'operator-a', expected, { signal: AbortSignal.abort() })),
    ).toMatchObject({ code: 'CANCELLED' })
  } finally {
    registry.dispose()
  }
})

test('guarded routing forwards cancellation and retains owner capacity until asynchronous admission actually settles', async () => {
  const entered = gate(),
    release = gate()
  let admissions = 0,
    executions = 0
  const registry = new CommandRegistry({
    execution: 'host',
    maxConcurrent: 1,
    authorize: async () => {
      admissions++
      if (admissions === 1) {
        entered.open()
        await release.wait
      }
      return true
    },
  })
  registry.register(
    definition(),
    (input) => {
      executions++
      return { path: input.path }
    },
    { durable: true },
  )
  const router = createCommandRouter({
    catalogs: () => [registry.list()],
    resolve: () => ({
      describe: () => registry.describe(invocation.commandId),
      prepare: (value) => registry.prepare(value),
      dispatch: (value, actorId) => registry.dispatch(value, { actorId }),
      dispatchPrepared: (
        value: unknown,
        actorId: string,
        expected: CommandExecutionExpectation,
        options?: CommandPreparedOptions,
      ) => registry.dispatchPrepared(value, actorId, expected, options),
    }),
  })
  try {
    const prepared = await router.prepare(invocation),
      expected = createCommandExpectation(prepared)
    const controller = new AbortController()
    const running = router.executePrepared(prepared.invocation, 'operator-a', expected, { signal: controller.signal })
    await entered.wait
    controller.abort()
    expect(await failure(running)).toMatchObject({ code: 'CANCELLED' })
    expect(await failure(router.executePrepared(prepared.invocation, 'operator-a', expected))).toMatchObject({
      code: 'BUSY',
    })
    expect(executions).toBe(0)
    release.open()
    await Bun.sleep(0)
    expect(await router.executePrepared(prepared.invocation, 'operator-a', expected)).toEqual({ path: 'allowed.txt' })
    expect(executions).toBe(1)
  } finally {
    release.open()
    registry.dispose()
  }
})

test('expectations have independent UTF-8 descriptor/input budgets and reject cycles, deep or non-JSON payloads', async () => {
  const registry = new CommandRegistry({ execution: 'host', authorize: () => true })
  registry.register(definition(), (value) => ({ path: value.path }), { durable: true })
  try {
    const prepared = { descriptor: registry.describe(invocation.commandId), invocation: registry.prepare(invocation) }
    const withInput = (input: unknown) => ({ ...prepared, invocation: { ...prepared.invocation, input } })
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    expect(() => createCommandExpectation(withInput(cycle))).toThrow('acyclic JSON')
    expect(() => createCommandExpectation(withInput({ unsupported: () => 1 }))).toThrow('acyclic JSON')
    expect(() => createCommandExpectation(withInput({ text: '界'.repeat(90_000) }))).toThrow('byte bound')
    let nested: unknown = null
    for (let index = 0; index < 70; index++) nested = { child: nested }
    expect(() => createCommandExpectation(withInput(nested))).toThrow('structural bound')
    const large: CommandDescriptor = { ...prepared.descriptor, inputSchema: { description: '界'.repeat(90_000) } }
    const detached = createCommandExpectation({ ...prepared, descriptor: large })
    expect(detached.descriptor.inputSchema.description).toBe(large.inputSchema.description)
    const invalid = { ...prepared.invocation, actorId: 'injected' }
    expect(
      await failure(registry.dispatchPrepared(invalid, 'operator-a', createCommandExpectation(prepared))),
    ).toMatchObject({ name: 'ZodError' })
  } finally {
    registry.dispose()
  }
})
