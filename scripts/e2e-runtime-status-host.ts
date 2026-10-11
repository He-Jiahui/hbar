import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'

const root = process.env.HBAR_E2E_DATA_ROOT
const port = Number(process.env.HBAR_E2E_HOST_PORT)
if (!root || !Number.isInteger(port)) throw new Error('Owned runtime status fixture requires a data root and port')
const runtime = await ProcessHostRuntime.create({
  layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
  sourceRoot: process.cwd(),
  workspace: root,
  demo: true,
  secrets: new MemorySecrets(),
})
const updateDirectory = await mkdtemp(join(process.cwd(), 'artifacts', 'runtime-status-e2e-'))
const artifact = runtime.buildUnits.find((unit) => unit.descriptor.id === 'controller')
if (!artifact) throw new Error('Controller build unit is required')
const source = join(updateDirectory, 'controller.ts')
const implementation = (await readFile(artifact.entrypoint, 'utf8')).replaceAll("'./", "'../../apps/host/src/")
const anchor = 'async prepare() {'
if (implementation.split(anchor).length !== 2) throw new Error('Controller prepare fixture anchor changed')
await writeFile(source, implementation.replace(anchor, `${anchor}\n      await Bun.sleep(2500)`))
runtime.artifacts.registerSet([await runtime.artifacts.build({ ...artifact, entrypoint: source })])
const workspace = (await runtime.storage.call('workspaces'))[0]!
const session = await runtime.storage.call('createSession', workspace.id, 'Runtime status fixture')
const server = await startServer(runtime.kernel, {
  port,
  runtime,
  controller: runtime.controller,
  ...(process.env.HBAR_E2E_WEB_ORIGIN ? { origins: [process.env.HBAR_E2E_WEB_ORIGIN] } : {}),
})
const response = await fetch(`http://127.0.0.1:${port}/auth/pair`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: server.pairing.code, name: 'Owned runtime status E2E' }),
})
const token: unknown = await response.json()
if (!response.ok || !token || typeof token !== 'object' || !('token' in token) || typeof token.token !== 'string')
  throw new Error('Runtime fixture pairing failed')
process.stdout.write(
  JSON.stringify({
    token: token.token,
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
  const target = resolve(updateDirectory),
    boundary = resolve(process.cwd(), 'artifacts')
  const path = relative(boundary, target)
  if (path.startsWith('..') || path === '')
    throw new Error('Fixture cleanup target escaped its owned artifact directory')
  await rm(target, { recursive: true, force: true })
  process.exit(0)
}
createInterface({ input: process.stdin }).on('line', (line) => {
  if (line === 'close') void close()
  if (line === 'crash-controller') {
    const owned = runtime
      .snapshot()
      .units.find((unit) => unit.descriptor.id === 'controller')
      ?.generations.find((generation) => generation.role === 'default')
    if (owned?.pid) process.kill(owned.pid, 'SIGKILL')
  }
})
process.on('SIGTERM', () => {
  void close()
})
process.on('SIGINT', () => {
  void close()
})
