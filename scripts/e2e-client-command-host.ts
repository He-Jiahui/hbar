import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'

const root = process.env.HBAR_E2E_DATA_ROOT
const port = Number(process.env.HBAR_E2E_HOST_PORT)
if (!root || !Number.isInteger(port) || port < 1)
  throw new Error('Client command fixture requires an owned data root and port')
const runtime = await ProcessHostRuntime.create({
  layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
  sourceRoot: process.cwd(),
  workspace: root,
  demo: true,
  secrets: new MemorySecrets(),
  profileModule: join(process.cwd(), 'tests/fixtures/client-command-profile.ts'),
})
const workspace = (await runtime.storage.call('workspaces'))[0]
if (!workspace) throw new Error('Client command fixture has no workspace')
const session = await runtime.storage.call('createSession', workspace.id, 'Web command client fixture')
const server = await startServer(runtime.kernel, {
  port,
  runtime,
  controller: runtime.controller,
  ...(process.env.HBAR_E2E_WEB_ORIGIN ? { origins: [process.env.HBAR_E2E_WEB_ORIGIN] } : {}),
})
const device = await server.auth.createDevice('Owned Web command fixture')
process.stdout.write(
  JSON.stringify({
    token: device.token,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    sessionId: session.id,
    sessionTitle: session.title,
  }) + '\n',
)
let closing = false
async function close() {
  if (closing) return
  closing = true
  await server.close()
  await runtime.close()
  process.exit(0)
}
const stop = () => {
  void close().catch(() => process.exit(1))
}
createInterface({ input: process.stdin }).on('line', (line) => {
  if (line === 'close') stop()
})
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
