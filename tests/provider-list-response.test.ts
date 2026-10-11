import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAppRuntime } from '@hbar/app-runtime'
import {
  createConfigurationCommandClient,
  createDirectoryQueryAdapter,
  createModelCommandClient,
  createSettingsCommandClient,
  HbarClient,
} from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server'

test('provider list refresh accepts priced model responses and retains the global default across the Host boundary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-provider-list-response-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  let runtime: ReturnType<typeof createAppRuntime> | undefined
  try {
    await client.pair(host.pairing.code, 'provider response regression')
    const configuration = createConfigurationCommandClient(client)
    const models = createModelCommandClient(client)
    const settings = createSettingsCommandClient(client)
    const saved = await configuration.execute('provider.save', {
      provider: {
        id: 'priced-provider',
        name: 'Priced provider',
        protocol: 'openai-responses',
        baseUrl: 'https://example.invalid/v1',
        model: 'priced-model',
        contextWindow: 128_000,
        inputPrice: 1.25,
        outputPrice: 6.5,
        maxModePricingMultiplier: 1.2,
        contextTiers: [
          { id: 'expanded', contextWindow: 256_000, inputTokensAbove: 128_000, inputPrice: 2.5, outputPrice: 13 },
        ],
      },
    })
    const scope = { kind: 'global' } as const
    const snapshot = await settings.execute('settings.get', { scope })
    await settings.execute(
      'settings.apply',
      {
        schemaVersion: snapshot.schemaVersion,
        scope,
        baselineRevisions: snapshot.revisions,
        changes: [{ op: 'set', path: [{ kind: 'field', name: 'provider.model' }], value: saved.id }],
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    runtime = createAppRuntime({
      instanceId: 'provider-list-response',
      hostId: 'provider-list-response-host',
      directory: createDirectoryQueryAdapter(client),
      configuration,
      models,
      settings,
    })
    for (let refresh = 0; refresh < 2; refresh += 1) {
      expect(await runtime.view.commands.execute('providerEditor.refresh', {})).toMatchObject({
        status: 'ready',
        error: null,
      })
      const state = runtime.view.state.providers.getSnapshot()
      expect(state.profiles['priced-provider']?.provider).toMatchObject({
        inputPrice: 1.25,
        outputPrice: 6.5,
        maxModePricingMultiplier: 1.2,
        contextTiers: [{ id: 'expanded', inputPrice: 2.5, outputPrice: 13 }],
      })
      expect(state.globalDefault).toMatchObject({
        status: 'ready',
        providerId: 'priced-provider',
        modelSelectionId: saved.id,
        modelId: 'priced-model',
        selectable: true,
        error: null,
      })
    }
    expect((await models.execute('model.list', {})).find((model) => model.id === saved.id)).toMatchObject({
      inputPrice: 1.25,
      outputPrice: 6.5,
      maxModePricingMultiplier: 1.2,
      contextTiers: [{ id: 'expanded', inputPrice: 2.5, outputPrice: 13 }],
    })
  } finally {
    runtime?.dispose()
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
