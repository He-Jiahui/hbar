import { expect, test } from 'bun:test'
import {
  compileContentGraph,
  createContentResolver,
  createSchemaCallbackRegistry,
  encodePath,
  SchemaContentError,
  type OptionContentReport,
  type SchemaPath,
} from '@hbar/schema-core'

const field = (name: string): SchemaPath => [{ kind: 'field', name }]
const provider = field('provider')
const model = field('model')
const thinking = field('thinkingLevels')
const providerKey = encodePath(provider)
const modelKey = encodePath(model)

function graph() {
  return compileContentGraph([
    { path: provider, valueType: 'string' },
    { path: model, valueType: 'string' },
    {
      path: thinking,
      valueType: 'string',
      callback: { id: 'settings.getThinkingLevels', version: 1, dependsOn: [provider, model] },
    },
  ])
}
function input(data: Record<string, unknown>, formId = 'form') {
  return {
    schemaId: 'hbar.provider',
    schemaVersion: 1,
    scope: { kind: 'session', id: 's1' },
    formId,
    formRevision: 1,
    path: thinking,
    data,
  }
}
function ready(fingerprint: string, values: string[]): OptionContentReport {
  return {
    kind: 'options',
    status: 'ready',
    options: values.map((value) => ({
      value,
      label: { kind: 'literal', text: value },
      disabled: false,
    })),
    dependencyFingerprint: fingerprint,
    capabilityRevision: 'models:1',
  }
}

test('dynamic content sends only declared dependencies, validates typed reports and caches per identity', async () => {
  const registry = createSchemaCallbackRegistry()
  let calls = 0
  registry.registerQuery('settings.getThinkingLevels', {
    version: 1,
    valueType: 'string',
    async execute(request) {
      calls++
      expect(Object.keys(request.dependencies).sort()).toEqual([modelKey, providerKey].sort())
      expect(JSON.stringify(request.dependencies)).not.toContain('secret')
      return ready(request.dependencyFingerprint, ['low', 'high'])
    },
  })
  const resolver = createContentResolver({ graph: graph(), port: registry, hostId: 'host', identityId: 'device-a' })
  const data = { [providerKey]: 'openai', [modelKey]: 'gpt', 'f:secret': 'must-not-leak' }
  const first = await resolver.resolve(input(data))
  expect(first).toMatchObject({ status: 'ready', capabilityRevision: 'models:1' })
  expect(Object.isFrozen(first)).toBe(true)
  expect(await resolver.resolve(input(data))).toBe(first)
  expect(calls).toBe(1)
  const refreshed = await resolver.resolve({ ...input(data), bypassCache: true })
  expect(refreshed).not.toBe(first)
  expect(calls).toBe(2)
  const otherIdentity = createContentResolver({
    graph: graph(),
    port: registry,
    hostId: 'host',
    identityId: 'device-b',
  })
  await otherIdentity.resolve(input(data))
  expect(calls).toBe(3)
  expect(await resolver.resolve(input({ [providerKey]: 'openai' }))).toEqual({
    kind: 'options',
    status: 'unavailable',
    reasonCode: 'missing_dependency',
  })
  resolver.dispose()
  otherIdentity.dispose()
  registry.dispose()
})

test('dependency changes cancel old generations and never apply a late ignored response', async () => {
  const registry = createSchemaCallbackRegistry()
  let release: (report: OptionContentReport) => void = () => undefined
  const delayed = new Promise<OptionContentReport>((resolve) => {
    release = resolve
  })
  registry.registerQuery('settings.getThinkingLevels', {
    version: 1,
    valueType: 'string',
    execute(request) {
      return request.dependencies[modelKey] === 'old'
        ? delayed
        : Promise.resolve(ready(request.dependencyFingerprint, ['high']))
    },
  })
  const resolver = createContentResolver({ graph: graph(), port: registry, hostId: 'host', identityId: 'device' })
  const old = resolver.resolve(input({ [providerKey]: 'openai', [modelKey]: 'old' }))
  const oldOutcome = old.then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  )
  await Bun.sleep(5)
  const current = await resolver.resolve(input({ [providerKey]: 'openai', [modelKey]: 'new' }))
  expect(current.status === 'ready' ? current.options.map((option) => option.value) : []).toEqual(['high'])
  release(ready('ignored', ['low']))
  const stale = await oldOutcome
  if (!('error' in stale)) throw new Error('Expected old content generation to fail')
  expect(stale.error).toBeInstanceOf(SchemaContentError)
  expect((stale.error as SchemaContentError).code).toBe('CONTENT_SUPERSEDED')
  resolver.dispose()
})

test('callback registration, dependency graph and report contracts reject ambiguous behavior', async () => {
  expect(() =>
    compileContentGraph([
      { path: provider, valueType: 'string', callback: { id: 'settings.provider', version: 1, dependsOn: [model] } },
      { path: model, valueType: 'string', callback: { id: 'settings.model', version: 1, dependsOn: [provider] } },
    ]),
  ).toThrow('cycle')
  expect(() =>
    compileContentGraph([
      { path: provider, valueType: 'string' },
      {
        path: thinking,
        valueType: 'string',
        callback: { id: 'settings.options', version: 1, dependsOn: [field('missing')] },
      },
    ]),
  ).toThrow('does not exist')

  const registry = createSchemaCallbackRegistry()
  const registration = {
    version: 1,
    valueType: 'string' as const,
    async execute(request: { dependencyFingerprint: string }) {
      return ready(request.dependencyFingerprint, ['duplicate', 'duplicate'])
    },
  }
  const dispose = registry.registerQuery('settings.getThinkingLevels', registration)
  expect(() => registry.registerQuery('settings.getThinkingLevels', registration)).toThrow('already registered')
  const resolver = createContentResolver({ graph: graph(), port: registry, hostId: 'host', identityId: 'device' })
  await expect(resolver.resolve(input({ [providerKey]: 'openai', [modelKey]: 'gpt' }))).rejects.toMatchObject({
    code: 'INVALID_OUTPUT',
  })
  dispose()
  await expect(
    resolver.resolve(input({ [providerKey]: 'openai', [modelKey]: 'other' }, 'other-form')),
  ).rejects.toMatchObject({
    code: 'CALLBACK_UNAVAILABLE',
  })
  registry.dispose()
  expect(() => registry.registerQuery('settings.afterDispose', registration)).toThrow('disposed')
  resolver.dispose()

  const mismatched = createSchemaCallbackRegistry()
  mismatched.registerQuery('settings.getThinkingLevels', { ...registration, valueType: 'number' })
  const mismatchResolver = createContentResolver({
    graph: graph(),
    port: mismatched,
    hostId: 'host',
    identityId: 'device',
  })
  await expect(mismatchResolver.resolve(input({ [providerKey]: 'openai', [modelKey]: 'gpt' }))).rejects.toMatchObject({
    code: 'INVALID_CALLBACK',
  })
  mismatchResolver.dispose()
  mismatched.dispose()
})

test('resolver bounds concurrent callbacks and distinguishes ready-empty from unavailable and failure', async () => {
  const registry = createSchemaCallbackRegistry()
  let active = 0
  let peak = 0
  registry.registerQuery('settings.getThinkingLevels', {
    version: 1,
    valueType: 'string',
    async execute(request) {
      active++
      peak = Math.max(peak, active)
      await Bun.sleep(15)
      active--
      if (request.search === 'fail') throw new Error('provider unavailable')
      return ready(request.dependencyFingerprint, [])
    },
  })
  const resolver = createContentResolver({
    graph: graph(),
    port: registry,
    hostId: 'host',
    identityId: 'device',
    maxConcurrent: 1,
    cacheTtlMs: 0,
  })
  const data = { [providerKey]: 'openai', [modelKey]: 'gpt' }
  const [first, second] = await Promise.all([
    resolver.resolve({ ...input(data, 'one'), search: 'a' }),
    resolver.resolve({ ...input(data, 'two'), search: 'b' }),
  ])
  expect(peak).toBe(1)
  expect(first).toMatchObject({ status: 'ready', options: [] })
  expect(second).toMatchObject({ status: 'ready', options: [] })
  await expect(resolver.resolve({ ...input(data, 'three'), search: 'fail' })).rejects.toMatchObject({
    code: 'CALLBACK_FAILED',
  })
  resolver.dispose()
})
