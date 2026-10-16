import { expect, test } from 'bun:test'
import { z } from 'zod'
import { CommandError, CommandRegistry, createCommandRouter, defineCommand } from '@hbar/commands'
import { ClientCommandEndpoint } from '@hbar/client'
import { commandJobSnapshotSchema } from '@hbar/commands/jobs'
import { createCommandExpectation } from '@hbar/commands'
import { clientCommandPreparationSchema } from '@hbar/contracts/client-commands'

function fixture() {
  const registry = new CommandRegistry({ execution: 'client' })
  let executions = 0
  let aborted = false
  const released = Promise.withResolvers<void>()
  const definition = defineCommand(
    {
      id: 'app.testPhysical',
      version: 1,
      owner: 'fixture',
      kind: 'command',
      execution: 'client',
      stateEffect: 'application',
      scope: 'client',
      category: 'app.navigation',
      titleKey: 'title',
      descriptionKey: 'description',
      surfaces: ['api'],
      timeoutMs: 1_000,
      cancelMode: 'cooperative',
    },
    z.strictObject({ value: z.string().default('normalized') }),
    z.strictObject({ value: z.string() }),
  )
  registry.register(definition, async (input, context) => {
    executions++
    context.signal.addEventListener(
      'abort',
      () => {
        aborted = true
      },
      { once: true },
    )
    await released.promise
    return input
  })
  const routing = createCommandRouter({
    catalogs: () => [registry.list()],
    resolve: () => ({
      describe: () => registry.describe(definition.metadata.id),
      prepare: (value) => registry.prepare(value),
      dispatch: (value, actorId) => registry.dispatch(value, { actorId }),
      dispatchPreparedTracked: registry.dispatchPreparedTracked.bind(registry),
    }),
  })
  const target = { clientId: 'chosen-client', generation: 7 }
  const actorId = 'authenticated-owner'
  const binding = { ...target, actorId }
  const published = new Set([definition.metadata.id])
  const endpoint = new ClientCommandEndpoint(binding, published, routing)
  const invocation = {
    protocol: 1,
    requestId: 'client-call',
    commandId: definition.metadata.id,
    commandVersion: 1,
    input: {},
  }
  return {
    registry,
    target,
    actorId,
    endpoint,
    invocation,
    released,
    binding,
    published,
    state: () => ({ executions, aborted }),
    dispatch: (method: string, input: unknown) =>
      endpoint.dispatch({ ...target, requestId: crypto.randomUUID(), operation: { method, input } }),
  }
}

test('client jobs validate read-only, start once, retain physical cancellation and acknowledge only real settlement', async () => {
  const f = fixture()
  const identity = { actorId: f.actorId, jobId: 'original-job' }
  try {
    const prepared = await f.dispatch('prepare', f.invocation)
    const parsed = z.object({ descriptor: z.unknown(), invocation: z.object({ input: z.unknown() }) }).parse(prepared)
    expect(parsed.invocation.input).toEqual({ value: 'normalized' })
    expect(f.state().executions).toBe(0)
    const preparation = await f.endpoint.dispatch({
      ...f.target,
      requestId: crypto.randomUUID(),
      operation: { method: 'prepare', input: f.invocation },
    })
    const original = clientCommandPreparationSchema.parse(preparation)
    const started = commandJobSnapshotSchema.parse(
      await f.dispatch('command.jobs.start', {
        ...identity,
        invocation: original.invocation,
        expectation: createCommandExpectation(original),
      }),
    )
    expect(started.physical.phase).toBe('pending')
    await Bun.sleep(0)
    expect(f.state().executions).toBe(1)
    expect(await f.dispatch('command.jobs.cancel', identity)).toEqual({ accepted: true })
    expect(f.state().aborted).toBe(true)
    expect(commandJobSnapshotSchema.parse(await f.dispatch('command.jobs.get', identity)).physical.phase).toBe(
      'pending',
    )
    let duplicate: unknown
    try {
      await f.dispatch('command.jobs.start', {
        ...identity,
        invocation: original.invocation,
        expectation: createCommandExpectation(original),
      })
    } catch (error) {
      duplicate = error
    }
    expect(duplicate).toMatchObject({ code: 'COMMAND_JOB_CONFLICT' })
    f.released.resolve()
    for (let attempt = 0; attempt < 100; attempt++) {
      if (commandJobSnapshotSchema.parse(await f.dispatch('command.jobs.get', identity)).physical.phase === 'settled')
        break
      await Bun.sleep(1)
    }
    expect(commandJobSnapshotSchema.parse(await f.dispatch('command.jobs.get', identity)).physical.phase).toBe(
      'settled',
    )
    expect(await f.dispatch('command.jobs.acknowledge', identity)).toEqual({ released: true })
    expect(f.state().executions).toBe(1)
  } finally {
    f.released.resolve()
    f.endpoint.dispose()
    f.registry.dispose()
  }
})

test('client endpoint rejects replaced generations, unsupported commands and forged actors before execution', async () => {
  const f = fixture()
  try {
    for (const [generation, method, input, code] of [
      [8, 'prepare', f.invocation, 'COMMAND_TARGET_STALE'],
      [7, 'prepare', { ...f.invocation, commandId: 'app.unpublished' }, 'CAPABILITY_UNAVAILABLE'],
      [7, 'command.jobs.get', { actorId: 'forged', jobId: 'job' }, 'FORBIDDEN'],
    ] as const) {
      let rejected: unknown
      try {
        await f.endpoint.dispatch({
          ...f.target,
          generation,
          requestId: crypto.randomUUID(),
          operation: { method, input },
        })
      } catch (error) {
        rejected = error
      }
      expect(rejected).toBeInstanceOf(CommandError)
      expect(rejected).toMatchObject({ code })
    }
    expect(f.state().executions).toBe(0)
  } finally {
    f.endpoint.dispose()
    f.registry.dispose()
  }
})

test('client endpoint detaches its original identity and published commands from caller-owned objects', async () => {
  const f = fixture()
  try {
    f.binding.clientId = 'mutated-client'
    f.binding.generation = 100
    f.binding.actorId = 'mutated-actor'
    f.published.clear()
    expect(await f.dispatch('prepare', f.invocation)).toMatchObject({ invocation: { input: { value: 'normalized' } } })
    let rejected: unknown
    try {
      await f.endpoint.dispatch({
        clientId: f.binding.clientId,
        generation: f.binding.generation,
        requestId: crypto.randomUUID(),
        operation: { method: 'prepare', input: f.invocation },
      })
    } catch (error) {
      rejected = error
    }
    expect(rejected).toMatchObject({ code: 'COMMAND_TARGET_STALE' })
    expect(f.state().executions).toBe(0)
  } finally {
    f.endpoint.dispose()
    f.registry.dispose()
  }
})

test('ending a connection watch frees its wait without cancelling or discarding the original physical job', async () => {
  const f = fixture()
  const identity = { actorId: f.actorId, jobId: 'physical-job-after-watch' }
  try {
    const prepared = clientCommandPreparationSchema.parse(await f.dispatch('prepare', f.invocation))
    await f.dispatch('command.jobs.start', {
      ...identity,
      invocation: prepared.invocation,
      expectation: createCommandExpectation(prepared),
    })
    const before = commandJobSnapshotSchema.parse(await f.dispatch('command.jobs.get', identity))
    const connection = new AbortController()
    const watching = f.endpoint.dispatch(
      {
        ...f.target,
        requestId: crypto.randomUUID(),
        operation: {
          method: 'command.jobs.watch',
          input: { ...identity, afterRevision: before.revision, waitMs: 25_000 },
        },
      },
      connection.signal,
    )
    const failed = watching.catch((error: unknown) => error)
    await Bun.sleep(0)
    connection.abort()
    expect(await failed).toMatchObject({ code: 'CANCELLED' })
    expect(f.state()).toEqual({ executions: 1, aborted: false })
    expect(commandJobSnapshotSchema.parse(await f.dispatch('command.jobs.get', identity)).physical.phase).toBe(
      'pending',
    )
  } finally {
    f.released.resolve()
    f.endpoint.dispose()
    f.registry.dispose()
  }
})
