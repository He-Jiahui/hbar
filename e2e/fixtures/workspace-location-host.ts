import { createPathLayout } from '@hbar/storage'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { mkdir } from 'node:fs/promises'
import { ProcessHostRuntime } from '../../apps/host/src/process-host-runtime'
import { startServer } from '../../apps/host/src/server'

const dataRoot = process.env.HBAR_E2E_DATA_ROOT
const port = Number(process.env.HBAR_E2E_HOST_PORT ?? 4317)
if (!dataRoot) throw new Error('The workspace location fixture requires an isolated Host data root')
await mkdir(`${dataRoot}/workspace`, { recursive: true })

const runtime = await ProcessHostRuntime.create({
  layout: createPathLayout(`${dataRoot}/data`, `${dataRoot}/cache`, `${dataRoot}/pointer.json`),
  sourceRoot: process.cwd(),
  workspace: `${dataRoot}/workspace`,
  demo: true,
  secrets: new MemorySecrets(),
})
process.stderr.write('workspace-location fixture: runtime ready\n')
const host = await startServer(runtime.kernel, {
  port,
  runtime,
  controller: runtime.controller,
  nodeLink: runtime.nodeLink,
  origins: [`http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`],
})
process.stderr.write('workspace-location fixture: server listening\n')
const workspace = (await runtime.storage.call('workspaces'))[0]
process.stderr.write(`workspace-location fixture: workspace query ${workspace ? 'ready' : 'empty'}\n`)
if (!workspace) throw new Error('The live Host fixture did not create its local workspace')
const session = await runtime.storage.call('createSession', workspace.id)
process.stderr.write('workspace-location fixture: session ready\n')
const credentials = await host.auth.createDevice('operator')
process.stderr.write('workspace-location fixture: operator ready\n')
const observerCredentials = await host.auth.createDevice('observer', { role: 'observer', workspaceIds: null })
process.stderr.write('workspace-location fixture: observer ready\n')
process.stdout.write(
  `${JSON.stringify({
    token: credentials.token,
    observerToken: observerCredentials.token,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    sessionId: session.id,
    sessionTitle: session.title,
  })}\n`,
)
process.stdin.setEncoding('utf8')
await new Promise<void>((resolve) => process.stdin.once('data', () => resolve()))
await host.close()
await runtime.close()
