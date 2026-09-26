import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { HbarClient, createConfigurationCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../../apps/host/src/server'

// Dedicated Bun child, real temporary Host + frozen production assets. Mock
// provider records supply metadata only: no Run, provider request or key exists.
const options = z.object({ root: z.string().min(1), assets: z.string().min(1), empty: z.boolean() }).parse({
  root: process.env.HBAR_MODEL_RECOVERY_ROOT,
  assets: process.env.HBAR_MODEL_RECOVERY_WEB_DIST ?? 'dist/web',
  empty: process.env.HBAR_MODEL_RECOVERY_EMPTY === '1',
})
const workspacePath = join(options.root, 'Original model recovery workspace — 原工程')
await mkdir(workspacePath, { recursive: true })
await writeFile(join(workspacePath, 'model-recovery.md'), '# Original file on disk\n', 'utf8')
const kernel = await Kernel.create({
  home: join(options.root, 'data'),
  workspace: workspacePath,
  demo: true,
  secrets: new MemorySecrets(),
})
const host = await startServer(kernel, { hostname: '127.0.0.1', port: 0, staticRoot: resolve(options.assets) })
const device = await host.auth.createDevice('Model recovery browser fixture')
const externalDevice = await host.auth.createDevice('Model recovery external fixture')
const url = `http://127.0.0.1:${host.server.port}`
const client = new HbarClient(url, device.token)
await client.connect()
const configuration = createConfigurationCommandClient(client)
await configuration.execute('provider.delete', { id: 'local-fixture' })
if (!options.empty)
  await configuration.execute('provider.save', {
    provider: {
      id: 'recovery-primary',
      name: 'Original provider — 原供应商',
      protocol: 'mock',
      baseUrl: 'http://127.0.0.1',
      model: 'selected',
      models: [
        { id: 'selected', name: 'Original selected model — 原模型' },
        { id: 'spare', name: 'Spare model — 备用模型' },
      ],
      thinkingLevels: ['low', 'high'],
      defaultThinkingLevel: 'low',
    },
  })
if (!options.empty)
  await configuration.execute('provider.save', {
    provider: {
      id: 'recovery-alternative',
      name: 'Alternative provider — 备用供应商',
      protocol: 'mock',
      baseUrl: 'http://127.0.0.1',
      model: 'alternative',
      models: [{ id: 'alternative', name: 'Alternative model — 备选模型' }],
      thinkingLevels: ['off'],
    },
  })
const commands = createWorkspaceSessionCommandClient(client)
const workspaces = await commands.execute('workspace.list', { limit: 20 })
const workspace = workspaces.items.find((item) => item.path === workspacePath)
if (!workspace) throw new Error('Model recovery workspace missing')
const session = await commands.execute(
  'session.create',
  { workspaceId: workspace.id, title: 'Original recovery session — 原会话' },
  { idempotencyKey: 'model-recovery-session' },
)
client.disconnect()
process.stdout.write(
  `${JSON.stringify({ url, token: device.token, externalToken: externalDevice.token, workspace, session })}\n`,
)
let closing = false
async function close() {
  if (closing) return
  closing = true
  await host.close()
  await kernel.close()
  process.exit(0)
}
createInterface({ input: process.stdin }).on('line', (line) => {
  if (line === 'stop') void close().catch(() => process.exit(1))
})
await new Promise<void>(() => {})
