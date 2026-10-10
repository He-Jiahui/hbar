import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MemorySecrets } from '@hbar/kernel'
import { createPathLayout } from '@hbar/storage'
import { HbarClient, createSystemCommandClient } from '@hbar/client'
import { ManagedHostRuntime } from '../apps/host/src/runtime-host'
import { startServer } from '../apps/host/src/server'

const resources: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of resources.splice(0)) await cleanup() })
async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 15_000
  while (!await check()) {
    if (Date.now() >= deadline) throw new Error('Managed Host transition did not settle')
    await Bun.sleep(10)
  }
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-managed-host-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  const runtime = await ManagedHostRuntime.create({ layout, sourceRoot: process.cwd(), demo: true, workspace: root, secrets: new MemorySecrets() })
  resources.push(async () => { await runtime.close(); await rm(root, { recursive: true, force: true }) })
  const workspace = (await runtime.storage.call('workspaces'))[0]!
  const session = await runtime.storage.call('createSession', workspace.id)
  return { root, layout, runtime, workspace, session }
}

test('the composition runs real Storage and Pi child processes and commits a fenced Run through the stable writer', async () => {
  const f = await fixture()
  const state = f.runtime.snapshot()
  expect(state.ready).toBe(true)
  const storage = state.units.find(unit => unit.descriptor.id === 'storage')!
  const driver = state.units.find(unit => unit.descriptor.id === 'driver.pi')!
  expect(storage.generations[0]?.pid).not.toBe(process.pid)
  expect(driver.generations[0]?.pid).not.toBe(storage.generations[0]?.pid)
  expect(f.runtime.kernel.instanceId).toBe(state.instanceId)
  const run = await f.runtime.kernel.submit(f.session.id, 'fenced-request', { text: 'Hello from an isolated driver', images: [] }, 'local-fixture')
  await f.runtime.kernel.waitForIdle()
  expect((await f.runtime.storage.call('run', run.id)).status).toBe('completed')
  expect(await f.runtime.storage.call('runtimeExecutionRead', run.id)).toMatchObject({ state: 'released', lease: { versions: { driver: { generation: 1 } } } })
  expect((await f.runtime.storage.call('snapshot', f.session.id)).messages.map(message => message.role)).toEqual(['user', 'assistant'])
  expect(f.runtime.coordinator.snapshot().sessions).toBe(0)
})

test('a local driver update pins the active Run, keeps the Storage process and authenticated WebSocket, and sends new work to the new generation', async () => {
  const f = await fixture()
  const host = await startServer(f.runtime.kernel, { port: 0, runtime: f.runtime })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  resources.unshift(async () => { client.disconnect(); await host.close() })
  await client.pair(host.pairing.code, 'managed runtime update')
  const system = createSystemCommandClient(client)
  const original = f.runtime.snapshot()
  const sourceRoot = await mkdtemp(join(process.cwd(), 'artifacts', 'managed-driver-update-'))
  resources.push(() => rm(sourceRoot, { recursive: true, force: true }))
  const source = join(sourceRoot, 'driver.ts')
  await writeFile(source, `${await readFile('apps/host/src/runtime-driver-process.ts', 'utf8')}\nexport const revision = 2\n`)
  // Relative implementation imports remain owned by the source module.
  await writeFile(source, (await readFile(source, 'utf8')).replaceAll("'./runtime-driver-contract'", "'../../apps/host/src/runtime-driver-contract'"))
  const build = f.runtime.buildUnits.find(unit => unit.descriptor.id === 'driver.pi')!
  const artifact = await f.runtime.artifacts.build({ ...build, entrypoint: source })
  const set = f.runtime.artifacts.registerSet([artifact])
  const first = await f.runtime.kernel.submit(f.session.id, 'old-generation', { text: '/slow', images: [] }, 'local-fixture')
  await until(() => f.runtime.coordinator.execution(first.id) !== null)
  const operation = await system.execute('system.runtime.reload', { artifactSetId: set.id, unitIds: ['driver.pi'] })
  await f.runtime.manager.reconcile()
  await f.runtime.settled()
  expect(f.runtime.coordinator.execution(first.id)?.versions.driver.generation).toBe(1)
  expect(f.runtime.manager.currentVersion('driver.pi').generation).toBe(2)
  expect(f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'storage')?.generations[0]?.pid).toBe(original.units.find(unit => unit.descriptor.id === 'storage')?.generations[0]?.pid)
  expect((await system.execute('system.runtime.get', {})).instanceId).toBe(original.instanceId)
  expect(client.connectionStatus()).toBe('connected')
  const second = await f.runtime.kernel.submit(f.session.id, 'new-generation', { text: 'new work', images: [] }, 'local-fixture')
  await f.runtime.kernel.waitForIdle()
  expect((await f.runtime.storage.call('runtimeExecutionRead', second.id))?.lease.versions.driver.generation).toBe(2)
  await f.runtime.manager.reconcile()
  expect(f.runtime.getReload(operation.operationId).phase).toBe('completed')
})

test('a killed driver revokes its old Run and resumes once on the same activated artifact while the server connection remains live', async () => {
  const f = await fixture()
  const host = await startServer(f.runtime.kernel, { port: 0, runtime: f.runtime })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  resources.unshift(async () => { client.disconnect(); await host.close() })
  await client.pair(host.pairing.code, 'managed runtime recovery')
  const state = f.runtime.snapshot()
  const driver = state.units.find(unit => unit.descriptor.id === 'driver.pi')!.generations[0]!
  const run = await f.runtime.kernel.submit(f.session.id, 'driver-crash', { text: '/slow', images: [] }, 'local-fixture')
  await until(() => f.runtime.kernel.streams.size > 0)
  if (!driver.pid || driver.pid === process.pid) throw new Error('Expected the owned driver child PID')
  process.kill(driver.pid, 'SIGKILL')
  await until(() => f.runtime.snapshot().ready && f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'driver.pi')?.generations[0]?.pid !== driver.pid)
  await f.runtime.settled()
  await f.runtime.kernel.waitForIdle()
  const old = await f.runtime.storage.call('run', run.id)
  const continuation = await f.runtime.storage.call('runtimeRecoveryRead', run.id)
  expect(old.status).toBe('interrupted')
  expect(continuation?.run?.recovery).toMatchObject({ predecessorRunId: run.id, attempt: 1 })
  if (!continuation?.run) throw new Error('Expected one durable continuation')
  expect((await f.runtime.storage.call('run', continuation.run.id)).status).toBe('completed')
  expect(f.runtime.manager.currentVersion('driver.pi')).toMatchObject({ generation: 1, artifactId: driver.artifactId })
  expect((await f.runtime.storage.call('snapshot', f.session.id)).messages.filter(message => message.role === 'user')).toHaveLength(1)
  expect(f.runtime.coordinator.snapshot().blockedSessions).toEqual([])
  expect(client.connectionStatus()).toBe('connected')
  expect((await createSystemCommandClient(client).execute('system.runtime.get', {})).instanceId).toBe(state.instanceId)
})

test('a prepared storage update hands over its sole writer while retaining the active Run and unrelated driver PID', async () => {
  const f = await fixture()
  const original = f.runtime.snapshot()
  const sourceRoot = await mkdtemp(join(process.cwd(), 'artifacts', 'managed-storage-update-'))
  resources.push(() => rm(sourceRoot, { recursive: true, force: true }))
  const source = join(sourceRoot, 'storage.ts')
  await writeFile(source, `${(await readFile('apps/host/src/runtime-storage-process.ts', 'utf8')).replace("'./process-lock'", "'../../apps/host/src/process-lock'")}\nexport const revision = 2\n`)
  const build = f.runtime.buildUnits.find(unit => unit.descriptor.id === 'storage')!
  const artifact = await f.runtime.artifacts.build({ ...build, entrypoint: source })
  const set = f.runtime.artifacts.registerSet([artifact])
  const run = await f.runtime.kernel.submit(f.session.id, 'storage-update', { text: '/slow', images: [] }, 'local-fixture')
  await until(() => f.runtime.kernel.streams.size > 0)
  f.runtime.reload(set.id, ['storage'])
  await f.runtime.manager.reconcile()
  await f.runtime.settled()
  expect(f.runtime.manager.currentVersion('storage').generation).toBe(2)
  expect(f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'driver.pi')?.generations[0]?.pid).toBe(original.units.find(unit => unit.descriptor.id === 'driver.pi')?.generations[0]?.pid)
  await f.runtime.kernel.waitForIdle()
  expect((await f.runtime.storage.call('run', run.id)).status).toBe('completed')
  expect(await f.runtime.storage.call('runtimeRecoveryRead', run.id)).toBeNull()
})

test('an idle storage failure verifies the replacement before reopening admission, and explicit close never resurrects units', async () => {
  const f = await fixture()
  const original = f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'storage')!.generations[0]!
  await f.runtime.storage.call('setSetting', 'preserved', 'committed')
  if (!original.pid || original.pid === process.pid) throw new Error('Expected the owned storage PID')
  process.kill(original.pid, 'SIGKILL')
  await until(() => f.runtime.snapshot().ready && f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'storage')?.generations[0]?.pid !== original.pid)
  expect(await f.runtime.storage.call('getSetting', 'preserved')).toBe('committed')
  expect(f.runtime.manager.currentVersion('storage')).toMatchObject({ generation: 1, artifactId: original.artifactId })
  await f.runtime.close()
  await Bun.sleep(400)
  expect(f.runtime.manager.snapshot().units.flatMap(unit => unit.generations).every(generation => generation.pid === null)).toBe(true)
})

test('a failed storage call is never replayed and unresolved admission remains fenced after process recovery', async () => {
  const f = await fixture()
  const original = f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'storage')!.generations[0]!
  const pending = f.runtime.storage.call('setSetting', 'unknown-receipt', 'must not replay').catch((error: unknown) => error)
  if (!original.pid || original.pid === process.pid) throw new Error('Expected the owned storage PID')
  process.kill(original.pid, 'SIGKILL')
  expect(await pending).toBeInstanceOf(Error)
  await until(() => f.runtime.manager.snapshot().units.find(unit => unit.descriptor.id === 'storage')?.generations[0]?.pid !== original.pid && f.runtime.manager.snapshot().ready)
  await f.runtime.settled()
  expect(f.runtime.storage.snapshot().phase).toBe('fenced')
  expect(f.runtime.snapshot().ready).toBe(false)
  expect(await f.runtime.storage.call('setSetting', 'retry', 'forbidden').catch((error: unknown) => error)).toMatchObject({ code: 'RUNTIME_PROCESS_EXITED' })
})

test('a read-only candidate failure preserves the default driver and does not revoke or stop healthy work', async () => {
  const f = await fixture()
  const original = f.runtime.manager.currentVersion('driver.pi')
  const sourceRoot = await mkdtemp(join(process.cwd(), 'artifacts', 'managed-driver-failed-'))
  resources.push(() => rm(sourceRoot, { recursive: true, force: true }))
  const source = join(sourceRoot, 'failed-driver.ts')
  const implementation = (await readFile('apps/host/src/runtime-driver-process.ts', 'utf8')).replaceAll("'./runtime-driver-contract'", "'../../apps/host/src/runtime-driver-contract'")
    .replace('async prepare() { return', "async prepare() { throw new HbarError('PREPARE_FAILED', 'Injected preparation failure'); return")
  await writeFile(source, implementation)
  const build = f.runtime.buildUnits.find(unit => unit.descriptor.id === 'driver.pi')!
  const set = f.runtime.artifacts.registerSet([await f.runtime.artifacts.build({ ...build, entrypoint: source })])
  const run = await f.runtime.kernel.submit(f.session.id, 'candidate-failure', { text: '/slow', images: [] }, 'local-fixture')
  await until(() => f.runtime.kernel.streams.size > 0)
  const operation = f.runtime.reload(set.id, ['driver.pi'])
  await f.runtime.manager.reconcile()
  await f.runtime.settled()
  expect(f.runtime.getReload(operation.operationId).phase).toBe('failed')
  expect(f.runtime.manager.currentVersion('driver.pi')).toEqual(original)
  expect(f.runtime.snapshot().ready).toBe(true)
  await f.runtime.kernel.waitForIdle()
  expect((await f.runtime.storage.call('run', run.id)).status).toBe('completed')
  expect(await f.runtime.storage.call('runtimeRecoveryRead', run.id)).toBeNull()
})
