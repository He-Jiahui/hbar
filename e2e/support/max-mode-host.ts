import { resolve, join } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { Kernel, MemorySecrets, SettingsService } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { HarnessDriver } from '@hbar/plugin-sdk'
import { PiDriver } from '@hbar/pi-driver'
import { startServer } from '../../apps/host/src/server'

const root = z.string().min(1).parse(process.env.HBAR_MAX_TEST_ROOT)
const pi = new PiDriver()
let release = () => {}
const driver = definePlugin({
  manifest: {
    id: 'driver.pi',
    name: 'MAX UI fixture',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    scope: 'host',
    description: 'Local execution for MAX end-to-end testing',
    provides: { driver: '1.0.0' },
    permissions: [],
  },
  apply(context) {
    provide<HarnessDriver>(context, 'driver', {
      async run(input) {
        await input.beforeRequest(input.request, 'fixture-step')
        if (input.run.input.text === 'hold')
          await new Promise<void>((done) => {
            release = done
          })
        await input.commit('assistant', [{ type: 'text', text: 'MAX fixture completed.' }])
        await input.stepEnded('fixture-step')
      },
      summarize: (request, key, signal) => pi.summarize(request, key, signal),
    })
  },
})
const kernel = await Kernel.create({
  home: join(root, 'data'),
  workspace: root,
  demo: true,
  secrets: new MemorySecrets(),
  profile: { replacements: { 'driver.pi': driver } },
})
await kernel.changePlugin('budget.codex', true, { autoContinue: false })
await kernel.saveProvider({
  id: 'max-fixture',
  name: 'MAX fixture provider',
  protocol: 'mock',
  baseUrl: 'http://localhost',
  model: 'large',
  models: [
    {
      id: 'large',
      name: 'Tiered model',
      contextWindow: 4096,
      maxOutput: 512,
      inputPrice: 2,
      outputPrice: 10,
      thinkingLevels: ['off', 'high', 'max'],
      defaultThinkingLevel: 'high',
      contextTiers: [
        {
          id: 'long',
          contextWindow: 16_384,
          inputTokensAbove: 4096,
          inputPrice: 4,
          outputPrice: 15,
          cacheReadPrice: 0.4,
        },
      ],
    },
    { id: 'plain', name: 'Single window model', contextWindow: 4096, maxOutput: 512, thinkingLevels: ['off'] },
    {
      id: 'no-reasoning',
      name: 'Tiered non-reasoning model',
      contextWindow: 4096,
      maxOutput: 512,
      thinkingLevels: ['off'],
      contextTiers: [{ id: 'long', contextWindow: 16_384, inputTokensAbove: 4096, inputPrice: 1, outputPrice: 2 }],
    },
  ],
})
const workspace = (await kernel.storage.call('workspaces'))[0]!
const session = await kernel.createSession(workspace.id, 'MAX mode session')
const settings = new SettingsService(kernel.storage)
const before = await settings.get({ kind: 'global' })
await settings.apply({
  schemaVersion: 1,
  scope: { kind: 'global' },
  changes: [{ op: 'set', path: [{ kind: 'field', name: 'provider.model' }], value: 'max-fixture/large' }],
  baselineRevisions: before.revisions,
  actorId: 'max-fixture',
  idempotencyKey: 'initial-model',
})
const host = await startServer(kernel, { hostname: '127.0.0.1', port: 0, staticRoot: resolve(root, 'assets') })
const device = await host.auth.createDevice('MAX E2E fixture')
process.stdout.write(
  `${JSON.stringify({ url: `http://127.0.0.1:${host.server.port}`, token: device.token, sessionId: session.id, workspaceId: workspace.id })}\n`,
)
const lines = createInterface({ input: process.stdin })
lines.on('line', (line) => {
  if (line === 'release') release()
})
let closing = false
async function close() {
  if (closing) return
  closing = true
  release()
  lines.close()
  await host.close()
  await kernel.close()
  process.exit(0)
}
process.on('SIGTERM', () => {
  void close().catch((error) => {
    console.error(error)
    process.exit(1)
  })
})
