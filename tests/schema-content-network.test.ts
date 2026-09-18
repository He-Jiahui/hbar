import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createSchemaCallbackClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { compileContentGraph, createContentResolver, encodePath, type SchemaPath } from '@hbar/schema-core'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

const path = (name: string): SchemaPath => [{ kind: 'field', name }]
const provider = path('provider')
const model = path('model')
const choices = path('thinkingLevels')
const providerKey = encodePath(provider)
const modelKey = encodePath(model)

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-schema-content-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    demo: true,
    workspace: root,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  await client.pair(host.pairing.code, 'schema content client')
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  return { kernel, client }
}

test('schema callback bridge uses authenticated Host queries and cancels superseded generations', async () => {
  const { kernel, client } = await fixture()
  let cancellations = 0
  kernel.schemaCallbacks.registerQuery('settings.getThinkingLevels', {
    version: 1,
    valueType: 'string',
    async execute(request, context) {
      expect(Object.keys(request.dependencies).sort()).toEqual([modelKey, providerKey].sort())
      if (request.dependencies[modelKey] === 'old')
        await new Promise<void>((_resolve, reject) => {
          context.signal.addEventListener(
            'abort',
            () => {
              cancellations++
              reject(context.signal.reason)
            },
            { once: true },
          )
        })
      return {
        kind: 'options',
        status: 'ready',
        options: [{ value: 'high', label: { kind: 'i18n', key: 'thinking.high' }, disabled: false }],
        dependencyFingerprint: request.dependencyFingerprint,
        capabilityRevision: 'provider:1',
      }
    },
  })
  const graph = compileContentGraph([
    { path: provider, valueType: 'string' },
    { path: model, valueType: 'string' },
    {
      path: choices,
      valueType: 'string',
      callback: { id: 'settings.getThinkingLevels', version: 1, dependsOn: [provider, model] },
    },
  ])
  const resolver = createContentResolver({
    graph,
    port: createSchemaCallbackClient(client),
    hostId: kernel.instanceId,
    identityId: 'paired-device',
  })
  const request = (modelValue: string) => ({
    schemaId: 'provider.settings',
    schemaVersion: 1,
    scope: { kind: 'session', id: 's1' },
    formId: 'provider-form',
    formRevision: 1,
    path: choices,
    data: { [providerKey]: 'openai', [modelKey]: modelValue, 'f:secret': 'not-forwarded' },
  })
  const stale = resolver.resolve(request('old')).then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  )
  await Bun.sleep(10)
  const current = await resolver.resolve(request('new'))
  expect(current).toMatchObject({ status: 'ready', capabilityRevision: 'provider:1' })
  const staleOutcome = await stale
  if (!('error' in staleOutcome)) throw new Error('Expected superseded query failure')
  expect(staleOutcome.error).toMatchObject({ code: 'CONTENT_SUPERSEDED' })
  expect(cancellations).toBe(1)
  resolver.dispose()
})
