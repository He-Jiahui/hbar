import { expect, expectTypeOf, test } from 'bun:test'
import { z } from 'zod'
import {
  CommandRegistry,
  CommandError,
  createCommandClient,
  defineCommand,
  describeCommand,
  tokenizeCommand,
  type CommandMetadataInput,
} from '@hbar/commands'

const metadata: CommandMetadataInput = {
  id: 'counter.setValue',
  version: 1,
  owner: 'test.counter',
  kind: 'command',
  execution: 'client',
  stateEffect: 'application',
  category: 'test.counter',
  titleKey: 'counter.setValue.title',
  descriptionKey: 'counter.setValue.description',
  scope: 'client',
  surfaces: ['cli', 'api'],
  aliases: ['set'],
  cli: { arguments: [{ field: 'value', type: 'number', position: 0, flag: 'value' }] },
}
const inputSchema = z.strictObject({ value: z.number().int().min(-100).max(100) })
const outputSchema = z.strictObject({ value: z.number(), doubled: z.number() })
const setValue = defineCommand(metadata, inputSchema, outputSchema)

test('one handler accepts typed, text, alias, argv and validated invocation inputs', async () => {
  let state = 0
  const registry = new CommandRegistry()
  registry.namespace('counter').registerCommand('setValue', {
    definition: setValue,
    execute: ({ value }) => {
      state = value
      return { value: state, doubled: state * 2 }
    },
  })
  const client = createCommandClient({ 'counter.setValue': setValue }, registry)
  const result = await client.execute('counter.setValue', { value: 4 })
  expectTypeOf(result).toEqualTypeOf<{ value: number; doubled: number }>()
  expect(result).toEqual({ value: 4, doubled: 8 })
  expect(await registry.executeText('set -5')).toEqual({ value: -5, doubled: -10 })
  expect(registry.parseArgv(['counter.setValue', '--value=6'])).toEqual({
    commandId: 'counter.setValue',
    input: { value: 6 },
  })
  expect(
    await registry.dispatch({
      protocol: 1,
      requestId: 'test',
      commandId: 'counter.setValue',
      commandVersion: 1,
      input: { value: 7 },
    }),
  ).toEqual({ value: 7, doubled: 14 })
  expect(state).toBe(7)
  await expect(registry.executeText('counter.setvalue 3')).rejects.toMatchObject({ code: 'COMMAND_NOT_FOUND' })
  await expect(registry.execute('counter.setValue', { value: 101 })).rejects.toMatchObject({
    code: 'INVALID_INPUT',
    issues: [{ path: ['value'] }],
  })
  // Intentional negative API type tests also verify runtime validation of untyped callers.
  // @ts-expect-error command parameters are inferred as numbers
  await expect(client.execute('counter.setValue', { value: '3' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  // @ts-expect-error arbitrary names are not members of this typed command catalog
  await expect(client.execute('counter.missing', { value: 3 })).rejects.toMatchObject({ code: 'COMMAND_NOT_FOUND' })
  expect(state).toBe(7)
  registry.dispose()
})

test('registration is atomic, aliases are exact, and stale disposers cannot remove replacements', () => {
  const registry = new CommandRegistry()
  const handler = ({ value }: { value: number }) => ({ value, doubled: value * 2 })
  const dispose = registry.register(setValue, handler)
  expect(() =>
    registry.register(defineCommand({ ...metadata, id: 'counter.other' }, inputSchema, outputSchema), handler),
  ).toThrow('already registered')
  expect(() => registry.describe('counter.other')).toThrow('not registered')
  expect(() =>
    registry.register(
      defineCommand({ ...metadata, id: 'counter.other', aliases: ['dup', 'dup'] }, inputSchema, outputSchema),
      handler,
    ),
  ).toThrow('Duplicate')
  expect(registry.revision).toBe(1)
  expect(() =>
    registry.register(
      defineCommand({ ...metadata, id: 'counter.remote', aliases: [], execution: 'host' }, inputSchema, outputSchema),
      handler,
    ),
  ).toThrow('execution domain')
  dispose()
  registry.register(setValue, handler)
  dispose()
  expect(registry.describe('set').metadata.id).toBe('counter.setValue')
  expect(registry.revision).toBe(3)
  registry.dispose()
  expect(() => registry.describe('set')).toThrow('disposed')
})

test('catalog is serializable, immutable, classified, bounded and excludes internal commands', () => {
  const registry = new CommandRegistry({ maxRegistered: 3 })
  const handler = ({ value }: { value: number }) => ({ value, doubled: value * 2 })
  registry.register(setValue, handler)
  registry.register(
    defineCommand({ ...metadata, id: 'counter.resetValue', aliases: [] }, inputSchema, outputSchema),
    handler,
  )
  registry.register(
    defineCommand(
      { ...metadata, id: 'counter.internal', aliases: [], visibility: 'internal' },
      inputSchema,
      outputSchema,
    ),
    handler,
  )
  const first = registry.list({ category: 'test', surface: 'cli', limit: 1 })
  expect(first.items.map((item) => item.metadata.id)).toEqual(['counter.resetValue'])
  expect(first.nextCursor).toBe('counter.resetValue')
  expect(registry.list({ after: first.nextCursor ?? '' }).items.map((item) => item.metadata.id)).toEqual([
    'counter.setValue',
  ])
  expect(registry.list({ surface: 'palette' }).items).toEqual([])
  expect(registry.list({ includeInternal: true }).items).toHaveLength(3)
  expect(registry.complete('s').map((item) => item.metadata.id)).toEqual(['counter.setValue'])
  expect(registry.complete('counter.setv')).toEqual([])
  const descriptor = registry.describe('counter.setValue')
  expect(JSON.parse(JSON.stringify(descriptor)) as unknown).toMatchObject({
    inputSchema: { type: 'object', additionalProperties: false },
  })
  expect(() => {
    descriptor.metadata.aliases.push('hijack')
  }).toThrow()
  expect(() =>
    registry.register(
      defineCommand({ ...metadata, id: 'counter.full', aliases: [] }, inputSchema, outputSchema),
      handler,
    ),
  ).toThrow('capacity')
  registry.dispose()
})

test('REPL preserves empty strings, Unicode, Windows and UNC paths and treats shell syntax literally', () => {
  expect(tokenizeCommand(`sample.echo "" '中文 空格' "C:\\Program Files\\hbar" '\\\\server\\share\\'`)).toEqual([
    'sample.echo',
    '',
    '中文 空格',
    'C:\\Program Files\\hbar',
    '\\\\server\\share\\',
  ])
  expect(tokenizeCommand('sample.echo "a\\"b"')).toEqual(['sample.echo', 'a"b'])
  expect(tokenizeCommand('sample.echo $(whoami) $HOME | >')).toEqual(['sample.echo', '$(whoami)', '$HOME', '|', '>'])
  expect(() => tokenizeCommand('sample.echo "unfinished')).toThrow('Unclosed')
  expect(() => tokenizeCommand('x'.repeat(65_537))).toThrow('limit')
  expect(() => tokenizeCommand(Array(129).fill('arg').join(' '))).toThrow('Too many')
})

test('arguments reject duplicate flags, partial values, unknown flags and nonfinite numbers', () => {
  const registry = new CommandRegistry()
  registry.register(setValue, ({ value }) => ({ value, doubled: value * 2 }))
  for (const text of ['set --bad=1', 'set 1 --value 2', 'set --value', 'set 1 2', 'set NaN', 'set 1e999', 'set 0x10'])
    expect(() => registry.parseText(text), text).toThrow(CommandError)
  const echo = defineCommand(
    {
      ...metadata,
      id: 'sample.echo',
      aliases: [],
      cli: {
        arguments: [
          { field: 'path', type: 'string', position: 0, flag: 'path' },
          { field: 'enabled', type: 'boolean', flag: 'enabled' },
          { field: 'data', type: 'json', flag: 'data' },
        ],
        remainder: 'text',
      },
    },
    z.strictObject({
      path: z.string(),
      enabled: z.boolean().default(false),
      data: z.array(z.number()).default([]),
      text: z.string().optional(),
    }),
    z.string(),
  )
  registry.register(echo, ({ path }) => path)
  expect(
    registry.parseArgv([
      'sample.echo',
      'D:\\a b\\c',
      '--enabled=false',
      '--data',
      '[1,2]',
      '--',
      '--untouched',
      'text',
    ]),
  ).toEqual({
    commandId: 'sample.echo',
    input: { path: 'D:\\a b\\c', enabled: false, data: [1, 2], text: '--untouched text' },
  })
  expect(registry.parseText('sample.echo "" --enabled').input).toMatchObject({ path: '', enabled: true })
  expect(() => registry.parseText('sample.echo p --enabled=maybe')).toThrow('true or false')
  expect(() => registry.parseText("sample.echo p --data '{bad}'")).toThrow('JSON')
  expect(() => registry.parseText('sample.echo p --data "[true]"')).toThrow('INVALID_INPUT')
  registry.dispose()
})

test('definition validation rejects query effects, mismatched form parameters and unrepresentable transforms', () => {
  expect(() => describeCommand(defineCommand({ ...metadata, kind: 'query' }, inputSchema, outputSchema))).toThrow(
    'Queries cannot',
  )
  expect(() =>
    describeCommand(
      defineCommand(
        { ...metadata, cli: { arguments: [{ field: 'value', type: 'string', position: 0 }] } },
        inputSchema,
        outputSchema,
      ),
    ),
  ).toThrow('type must match')
  expect(() =>
    describeCommand(
      defineCommand(
        { ...metadata, cli: { arguments: [{ field: 'missing', type: 'number', position: 0 }] } },
        inputSchema,
        outputSchema,
      ),
    ),
  ).toThrow('input fields')
  expect(() =>
    describeCommand(
      defineCommand(metadata, z.strictObject({ value: z.number().transform((value) => value * 2) }), outputSchema),
    ),
  ).toThrow('serializable')
  expect(() => describeCommand(defineCommand(metadata, z.object({ value: z.number() }), outputSchema))).toThrow(
    'strict object',
  )
})

test('execution validates permissions, wire versions, outputs and rejects unavailable durable execution', async () => {
  const protectedDefinition = defineCommand({ ...metadata, capabilities: ['counter.write'] }, inputSchema, outputSchema)
  const registry = new CommandRegistry()
  registry.register(protectedDefinition, ({ value }) => ({ value, doubled: value * 2 }))
  await expect(registry.execute('set', { value: 3 })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(registry.execute('set', { value: 3 }, { version: 2 })).rejects.toMatchObject({
    code: 'VERSION_MISMATCH',
  })
  await expect(registry.dispatch({ protocol: 2 })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  await expect(registry.execute('set', { value: 3, unknown: true })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  const allowed = new CommandRegistry({ authorize: (definition) => definition.capabilities.includes('counter.write') })
  allowed.register(protectedDefinition, ({ value }) => ({ value, doubled: value * 2 }))
  expect(await allowed.execute('set', { value: 2 })).toMatchObject({ value: 2 })
  const durable = defineCommand(
    { ...metadata, id: 'counter.save', aliases: [], stateEffect: 'persistent', idempotency: 'required' },
    inputSchema,
    outputSchema,
  )
  allowed.register(durable, ({ value }) => ({ value, doubled: value * 2 }))
  await expect(allowed.execute('counter.save', { value: 2 })).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
  allowed.register(
    defineCommand(
      { ...metadata, id: 'counter.badOutput', aliases: [] },
      inputSchema,
      z.boolean().refine((value) => value),
    ),
    () => false,
  )
  await expect(allowed.execute('counter.badOutput', { value: 1 })).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
  allowed.register(
    defineCommand({ ...metadata, id: 'counter.domainError', aliases: [] }, inputSchema, outputSchema),
    () => {
      throw new CommandError('COUNTER_LOCKED', 'Counter is locked')
    },
  )
  await expect(allowed.execute('counter.domainError', { value: 1 })).rejects.toMatchObject({ code: 'COUNTER_LOCKED' })
  registry.dispose()
  allowed.dispose()
})

test('timeout retains capacity until an uncooperative handler settles; writes report unknown', async () => {
  const registry = new CommandRegistry({ maxConcurrent: 1 })
  const pending = Promise.withResolvers<{ value: number; doubled: number }>()
  let signal: AbortSignal | undefined
  registry.register(
    defineCommand({ ...metadata, timeoutMs: 10, cancelMode: 'cooperative' }, inputSchema, outputSchema),
    (_input, context) => {
      signal = context.signal
      return pending.promise
    },
  )
  await expect(registry.execute('set', { value: 1 })).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  expect(signal?.aborted).toBe(true)
  await expect(registry.execute('set', { value: 2 })).rejects.toMatchObject({ code: 'BUSY' })
  pending.resolve({ value: 1, doubled: 2 })
  await pending.promise
  await Bun.sleep(0)
  expect(await registry.execute('set', { value: 2 })).toMatchObject({ value: 1 })
  registry.dispose()
})

test('a convergent durable command requires an actor but does not require a replay key', async () => {
  const registry = new CommandRegistry()
  const cancel = defineCommand(
    { ...metadata, id: 'operation.cancel', aliases: [], stateEffect: 'persistent' },
    inputSchema,
    outputSchema,
  )
  registry.register(cancel, ({ value }) => ({ value, doubled: value * 2 }), { durable: true })
  await expect(registry.execute('operation.cancel', { value: 2 })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  expect(await registry.execute('operation.cancel', { value: 2 }, { actorId: 'paired-device' })).toEqual({
    value: 2,
    doubled: 4,
  })
  registry.dispose()
})

test('pre-cancel never enters a handler; unregister cancels work and removes completion', async () => {
  const registry = new CommandRegistry()
  let calls = 0
  const dispose = registry.register(setValue, ({ value }, { signal }) => {
    calls++
    return new Promise((resolve) =>
      signal.addEventListener('abort', () => resolve({ value, doubled: value * 2 }), { once: true }),
    )
  })
  await expect(registry.execute('set', { value: 1 }, { signal: AbortSignal.abort() })).rejects.toMatchObject({
    code: 'CANCELLED',
  })
  expect(calls).toBe(0)
  const running = registry.execute('set', { value: 1 })
  dispose()
  await expect(running).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  expect(registry.complete('set')).toEqual([])
  registry.dispose()
})

test('structured inputs have byte limits and reject cycles before recursive validation', async () => {
  const registry = new CommandRegistry()
  registry.register(setValue, ({ value }) => ({ value, doubled: value * 2 }))
  await expect(registry.execute('set', { value: '中'.repeat(100_000) })).rejects.toMatchObject({
    code: 'INPUT_TOO_LARGE',
  })
  const cycle: { value: unknown } = { value: null }
  cycle.value = cycle
  await expect(registry.execute('set', cycle)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  registry.dispose()
})

test('the command package bundles without hbar domain, state, UI, transport or native dependencies', async () => {
  const inputs: string[] = []
  const built = await Bun.build({
    entrypoints: ['packages/commands/src/index.ts'],
    target: 'browser',
    plugins: [
      {
        name: 'command-package-imports',
        setup(build) {
          build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, ({ path }) => {
            inputs.push(path.replaceAll('\\', '/'))
            return undefined
          })
        },
      },
    ],
  })
  expect(built.success).toBe(true)
  expect(inputs.some((path) => path.includes('/packages/commands/'))).toBe(true)
  expect(
    inputs.filter(
      (path) =>
        /\/(?:apps|plugins)\//.test(path) ||
        /\/packages\/(?!commands\/)/.test(path) ||
        /\/(?:react|zustand|@tauri-apps)\//.test(path),
    ),
  ).toEqual([])
})
