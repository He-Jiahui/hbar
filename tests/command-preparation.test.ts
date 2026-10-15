import { expect, test } from 'bun:test'
import { z } from 'zod'
import {
  CommandRegistry,
  prepareCommandInvocation,
  createCommandRouter,
  defineCommand,
  MAX_INVOCATION_BYTES,
  invocationSchema,
  type CommandRoute,
} from '@hbar/commands'

function fixture(defaultText = 'normalized') {
  const definition = defineCommand(
    {
      id: 'preparation.write',
      version: 1,
      owner: 'preparation.fixture',
      kind: 'command',
      execution: 'host',
      stateEffect: 'persistent',
      scope: 'session',
      category: 'preparation',
      surfaces: ['api', 'cli'],
      titleKey: 'preparation',
      descriptionKey: 'preparation',
      idempotency: 'required',
      maxConcurrent: 1,
    },
    z
      .strictObject({ text: z.string().default(defaultText), count: z.number().int().positive().default(7) })
      .refine((value) => value.text !== 'forbidden', { message: 'Owner refinement rejected this input' }),
    z.strictObject({ text: z.string() }),
  )
  let executions = 0
  const registry = new CommandRegistry({ execution: 'host', maxConcurrent: 1 })
  registry.register(
    definition,
    ({ text }) => {
      executions++
      return { text }
    },
    { durable: true },
  )
  const prepare = (value: unknown) => prepareCommandInvocation({ 'preparation.write': definition }, value)
  const route: CommandRoute = {
    describe: () => registry.describe('preparation.write'),
    prepare: (value) => registry.prepare(value),
    dispatch: (value, actorId) => registry.dispatch(value, { actorId }),
  }
  const router = createCommandRouter({ catalogs: () => [registry.list()], resolve: () => route })
  const invocation = {
    protocol: 1 as const,
    requestId: 'preparation-request',
    commandId: 'preparation.write',
    commandVersion: 1,
    idempotencyKey: 'preparation-key',
    input: {},
  }
  return {
    definition,
    registry,
    prepare,
    route,
    router,
    invocation,
    get executions() {
      return executions
    },
  }
}

test('registry, schema helper and router normalize with owner defaults and refinements without running a write', async () => {
  const f = fixture()
  try {
    const normalized = { ...f.invocation, input: { text: 'normalized', count: 7 } }
    expect(f.registry.prepare(f.invocation)).toEqual(normalized)
    expect(f.prepare(f.invocation)).toEqual(normalized)
    expect(await f.router.prepare(f.invocation)).toEqual({
      descriptor: f.registry.describe('preparation.write'),
      invocation: normalized,
    })
    expect(f.executions).toBe(0)
    for (const prepare of [
      () => f.registry.prepare({ ...f.invocation, input: { text: 'forbidden' } }),
      () => f.prepare({ ...f.invocation, input: { count: 0 } }),
    ])
      expect(prepare).toThrow()
    await expect(f.router.prepare({ ...f.invocation, input: { text: 'forbidden' } })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
    expect(f.executions).toBe(0)
    expect(await f.router.execute(normalized, 'actual-host-actor')).toEqual({ text: 'normalized' })
    expect(f.executions).toBe(1)
  } finally {
    f.registry.dispose()
  }
})

test('preparation rejects forged actors, stale versions, unknown commands, malformed envelopes and byte overflow', async () => {
  const f = fixture()
  try {
    for (const invalid of [
      { ...f.invocation, actorId: 'forged' },
      { ...f.invocation, commandVersion: 2 },
      { ...f.invocation, protocol: 2 },
      { ...f.invocation, input: { unknown: true } },
      { ...f.invocation, input: { text: 'x'.repeat(MAX_INVOCATION_BYTES) } },
    ]) {
      expect(() => f.registry.prepare(invalid)).toThrow()
      expect(() => f.prepare(invalid)).toThrow()
      await expect(f.router.prepare(invalid)).rejects.toThrow()
    }
    expect(() => f.registry.prepare({ ...f.invocation, commandId: 'preparation.unknown' })).toThrow('not registered')
    expect(() => f.prepare({ ...f.invocation, commandId: 'preparation.unknown' })).toThrow('not found')
    expect(f.executions).toBe(0)
    f.registry.dispose()
    expect(() => f.registry.prepare(f.invocation)).toThrow('disposed')
  } finally {
    f.registry.dispose()
  }
})

test('owner defaults cannot expand a small request beyond the normalized invocation byte limit', () => {
  const f = fixture('值'.repeat(Math.ceil(MAX_INVOCATION_BYTES / 3)))
  try {
    expect(() => f.registry.prepare(f.invocation)).toThrow('byte limit')
    expect(() => f.prepare(f.invocation)).toThrow('byte limit')
    expect(f.executions).toBe(0)
  } finally {
    f.registry.dispose()
  }
})

test('routing refuses an owner that changes invocation identity or cannot validate without execution', async () => {
  const f = fixture()
  try {
    for (const replacement of [
      { requestId: 'another-request' },
      { commandId: 'preparation.another' },
      { commandVersion: 2 },
      { idempotencyKey: 'another-key' },
    ]) {
      const router = createCommandRouter({
        catalogs: () => [],
        resolve: () => ({
          ...f.route,
          prepare: () => ({ ...f.invocation, ...replacement }),
        }),
      })
      await expect(router.prepare(f.invocation)).rejects.toThrow('identity')
    }
    const router = createCommandRouter({
      catalogs: () => [],
      resolve: () => ({
        describe: f.route.describe,
        dispatch: f.route.dispatch,
      }),
    })
    await expect(router.prepare(f.invocation)).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
    const mutating = createCommandRouter({
      catalogs: () => [],
      resolve: () => ({
        ...f.route,
        prepare(value) {
          if (value && typeof value === 'object') Reflect.set(value, 'requestId', 'mutated-owner-request')
          return invocationSchema.parse(value)
        },
      }),
    })
    await expect(mutating.prepare(f.invocation)).rejects.toThrow('identity')
    expect(f.invocation.requestId).toBe('preparation-request')
    expect(f.executions).toBe(0)
  } finally {
    f.registry.dispose()
  }
})
