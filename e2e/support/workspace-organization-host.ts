import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { HbarClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../../apps/host/src/server'

// Dedicated Bun process: real temporary Host and production static assets.
// Only historical text is seeded through StoragePort; no provider or Run executes.
const options = z.object({ root: z.string().min(1), assets: z.string().min(1) }).parse({
  root: process.env.HBAR_ORGANIZATION_FIXTURE_ROOT,
  assets: process.env.HBAR_ORGANIZATION_WEB_DIST ?? 'dist/web',
})
const firstPath = join(options.root, 'Project with a long shared name — 同名工程')
const secondPath = join(options.root, 'nested', 'Project with a long shared name — 同名工程')
await mkdir(firstPath, { recursive: true })
await mkdir(secondPath, { recursive: true })
await writeFile(join(firstPath, 'organization-notes.md'), '# Original file on disk\n', 'utf8')
const kernel = await Kernel.create({
  home: join(options.root, 'data'),
  workspace: firstPath,
  demo: true,
  secrets: new MemorySecrets(),
})
const host = await startServer(kernel, { hostname: '127.0.0.1', port: 0, staticRoot: resolve(options.assets) })
const firstDevice = await host.auth.createDevice('Organization browser fixture')
const secondDevice = await host.auth.createDevice('Organization external observer fixture')
const url = `http://127.0.0.1:${host.server.port}`
const client = new HbarClient(url, firstDevice.token)
await client.connect()
const commands = createWorkspaceSessionCommandClient(client)
const directory = await commands.execute('workspace.list', { limit: 100 })
const firstWorkspace = directory.items.find((item) => item.path === firstPath)
if (!firstWorkspace) throw new Error('Original fixture workspace is missing')
const secondWorkspace = await commands.execute('workspace.create', { path: secondPath })
const firstSession = await commands.execute(
  'session.create',
  {
    workspaceId: firstWorkspace.id,
    title: 'Original A — 原会话',
  },
  { idempotencyKey: 'organization-fixture-session-a' },
)
const secondSession = await commands.execute(
  'session.create',
  {
    workspaceId: secondWorkspace.id,
    title: 'Independent B — 独立会话',
  },
  { idempotencyKey: 'organization-fixture-session-b' },
)
await kernel.storage.call('commit', firstSession.id, 'historical-fixture-only', 'assistant', [
  { type: 'text', text: 'Original retained history — 原会话历史保留' },
])
client.disconnect()
process.stdout.write(
  `${JSON.stringify({
    url,
    token: firstDevice.token,
    externalToken: secondDevice.token,
    firstWorkspace,
    secondWorkspace,
    firstSession,
    secondSession,
  })}\n`,
)

let closing = false
async function close() {
  if (closing) return
  closing = true
  await host.close()
  await kernel.close()
  process.exit(0)
}
const input = createInterface({ input: process.stdin })
input.on('line', (line) => {
  if (line === 'stop') void close().catch(() => process.exit(1))
})
process.on('SIGTERM', () => {
  void close().catch(() => process.exit(1))
})
process.on('SIGINT', () => {
  void close().catch(() => process.exit(1))
})
await new Promise<void>(() => {})
