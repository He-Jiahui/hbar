import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout, ensurePathLayout, Storage, createChatDatabaseVacuumRecords } from '@hbar/storage'
import { HbarClient, createChatDatabaseCommandClient, createSystemCommandClient } from '@hbar/client'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { hostRuntimeBuildUnits, hostRuntimeBaseBuildUnit } from '../apps/host/src/runtime-build'
import { startServer } from '../apps/host/src/server'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
async function until(check: () => boolean | Promise<boolean>, describe: () => unknown = () => null) {
  const deadline = Date.now() + 40_000
  while (!await check()) { if (Date.now() >= deadline) throw new Error('Owned maintenance did not settle: ' + JSON.stringify(describe())); await Bun.sleep(10) }
}
async function fixture(gate: 'job' | 'writer') {
  const root = await mkdtemp(join(tmpdir(), 'hbar-owned-maintenance-'))
  const source = await mkdtemp(join(process.cwd(), 'artifacts', 'owned-maintenance-'))
  const marker = join(root, 'entered.json'), release = join(root, 'release')
  cleanups.push(async () => {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes('hbar-owned-maintenance-') || dirname(resolve(source)) !== resolve(process.cwd(), 'artifacts'))
      throw new Error('Maintenance fixture cleanup leaves its owned directories')
    await writeFile(release, 'released'); await rm(root, { recursive: true, force: true }); await rm(source, { recursive: true, force: true })
  })
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  await ensurePathLayout(layout)
  const initial = new Storage(layout.database, layout)
  await initial.call('ready')
  const workspace = await initial.call('createWorkspace', root, 'retained workspace')
  const session = await initial.call('createSession', workspace.id)
  await initial.call('commit', session.id, 'fixture', 'user', [{ type: 'text', text: 'retained maintenance history' }])
  await initial.close()
  const database = new Database(layout.database, { strict: true })
  database.exec('CREATE TABLE maintenance_fixture(value BLOB); INSERT INTO maintenance_fixture VALUES(randomblob(4194304)); PRAGMA wal_checkpoint(TRUNCATE); DELETE FROM maintenance_fixture; PRAGMA wal_checkpoint(TRUNCATE);')
  database.close()
  const delay = `await Bun.write(${JSON.stringify(marker)}, JSON.stringify({ pid: process.pid })); while (!await Bun.file(${JSON.stringify(release)}).exists()) await Bun.sleep(10);`
  let owner = (await readFile('apps/host/src/runtime-maintenance-process.ts', 'utf8')).replaceAll("'./", "'../../apps/host/src/")
  if (gate === 'job') owner = owner.replace("started: operation => context.peer.call('maintenance.job.started', { operation }, z.undefined()),", `started: async operation => { await context.peer.call('maintenance.job.started', { operation }, z.undefined()); ${delay} },`)
  const ownerPath = join(source, 'owner.ts')
  await writeFile(ownerPath, owner)
  let worker = (await readFile('packages/storage/src/maintenance-worker.ts', 'utf8')).replace("'./chat-database-vacuum'", "'../../packages/storage/src/chat-database-vacuum'")
  if (gate === 'writer') worker = worker.replace('runChatDatabaseVacuum(input)', `runChatDatabaseVacuum(input, async () => { ${delay} })`)
  const workerPath = join(source, 'maintenance-worker.ts')
  await writeFile(workerPath, worker)
  const units = hostRuntimeBuildUnits().map(unit => unit.descriptor.id === 'maintenance' ? { ...unit, entrypoint: ownerPath, workers: [workerPath] } : unit)
  const runtime = await ProcessHostRuntime.create({ layout, sourceRoot: process.cwd(), buildUnits: units, demo: true, secrets: new MemorySecrets() })
  cleanups.push(async () => { await writeFile(release, 'released'); await runtime.close() })
  const host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  await client.pair(host.pairing.code, 'owned maintenance verification'); await client.connect()
  cleanups.push(async () => { client.disconnect(); await host.close() })
  const commands = createChatDatabaseCommandClient(client), system = createSystemCommandClient(client)
  const operation = (operationId: string) => commands.execute('chatDatabase.operation', { operationId })
  const terminal = async (operationId: string) => {
    await until(async () => ['completed', 'cancelled', 'failed', 'unknown'].includes((await operation(operationId)).status))
    return operation(operationId)
  }
  return { root, source, marker, release, layout, runtime, host, client, commands, system, session, terminal, operation }
}
async function updatedMaintenance(f: Awaited<ReturnType<typeof fixture>>) {
  const source = join(f.source, 'updated.ts')
  await writeFile(source, (await readFile('apps/host/src/runtime-maintenance-process.ts', 'utf8')).replaceAll("'./", "'../../apps/host/src/") + '\nexport const compatibleMaintenanceRevision = 2\n')
  const unit = f.runtime.buildUnits.find(unit => unit.descriptor.id === 'maintenance')!
  return f.runtime.artifacts.registerSet([await f.runtime.artifacts.build({ ...unit, entrypoint: source, workers: ['packages/storage/src/maintenance-worker.ts'] })])
}

test('an owned maintenance job stays on its old generation while a compatible update activates the new default and preserves connections', async () => {
  const f = await fixture('job'), before = f.runtime.snapshot()
  const base = await f.runtime.artifacts.build(hostRuntimeBaseBuildUnit())
  const activeArtifacts = await Promise.all(before.units.map(unit => f.runtime.artifacts.get(f.runtime.manager.currentVersion(unit.descriptor.id).artifactId)))
  expect(base.inputs).not.toContain('packages/kernel/src/chat-database-maintenance.ts')
  expect(f.runtime.artifacts.affected(['packages/kernel/src/chat-database-maintenance.ts'], [...activeArtifacts, base])).toEqual(['maintenance'])
  const first = await f.commands.execute('chatDatabase.preview', { kind: 'sessions', scope: { kind: 'global' } }, { idempotencyKey: 'old-maintenance' })
  await until(() => existsSync(f.marker))
  const ownerPid: unknown = JSON.parse(await readFile(f.marker, 'utf8'))
  expect(ownerPid).toMatchObject({ pid: before.units.find(unit => unit.descriptor.id === 'maintenance')?.generations[0]?.pid })
  const prepared = await updatedMaintenance(f), reload = f.runtime.reload(prepared.id, ['maintenance'])
  await until(() => f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'maintenance')?.generations.some(generation => generation.role === 'default' && generation.generation === 2 && generation.phase === 'serving') ?? false)
  expect(f.runtime.getReload(reload.operationId).phase).toBe('draining')
  expect(await f.operation(first.operationId)).toMatchObject({ status: 'accepted' })
  expect(f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'maintenance')?.generations.find(generation => generation.generation === 1)?.references.resources).toBeGreaterThan(0)
  expect(f.client.connectionStatus()).toBe('connected')
  await writeFile(f.release, 'released')
  expect(await f.terminal(first.operationId)).toMatchObject({ status: 'completed' })
  await until(() => f.runtime.getReload(reload.operationId).phase === 'completed')
  const second = await f.commands.execute('chatDatabase.preview', { kind: 'sessions', scope: { kind: 'global' } }, { idempotencyKey: 'new-maintenance' })
  expect(await f.terminal(second.operationId)).toMatchObject({ status: 'completed' })
  for (const unit of before.units.filter(unit => unit.descriptor.id !== 'maintenance'))
    expect(f.runtime.snapshot().units.find(current => current.descriptor.id === unit.descriptor.id)?.generations[0]?.pid).toBe(unit.generations[0]?.pid)
  expect(f.runtime.coordinator.snapshot().resources).toBe(0)
}, 120_000)

test('a lost maintenance process is verified without replaying VACUUM, restores the sole writer and keeps the stable socket and runtime queries', async () => {
  const f = await fixture('writer'), before = f.runtime.snapshot()
  await f.runtime.waitForIdle()
  const preview = await f.commands.execute('chatDatabase.preview', { kind: 'database', scope: { kind: 'global' } }, { idempotencyKey: 'database-preview' })
  expect(await f.terminal(preview.operationId)).toMatchObject({ status: 'completed', candidateCount: 1 })
  const cleanup = await f.commands.execute('chatDatabase.cleanup', { previewId: preview.operationId }, { idempotencyKey: 'database-cleanup' })
  await until(() => existsSync(f.marker))
  expect(f.runtime.storage.snapshot().phase).toBe('handover')
  expect((await f.commands.execute('chatDatabase.operation', { operationId: cleanup.operationId })).status).toBe('running')
  expect((await f.system.execute('system.runtime.get', {})).instanceId).toBe(before.instanceId)
  expect((await fetch(`http://127.0.0.1:${f.host.server.port}/livez`)).status).toBe(200)
  const maintenance = before.units.find(unit => unit.descriptor.id === 'maintenance')!.generations[0]!
  if (!maintenance.pid || maintenance.pid === process.pid) throw new Error('Expected the owned maintenance PID')
  process.kill(maintenance.pid, 'SIGKILL')
  await until(() => f.runtime.snapshot().ready)
  const result = await f.terminal(cleanup.operationId)
  expect(result).toMatchObject({ status: 'unknown', deletedCount: 0 })
  const receipt = createChatDatabaseVacuumRecords(f.layout.sessions).read(cleanup.operationId)
  expect(receipt).toMatchObject({ integrityVerified: true, didVacuum: false })
  expect((await f.runtime.storage.call('chatDatabaseUsage', { kind: 'global' })).freePageBytes).toBeGreaterThan(3 * 1_048_576)
  expect((await f.runtime.storage.call('context', f.session.id)).messages[0]?.content).toEqual([{ type: 'text', text: 'retained maintenance history' }])
  expect(f.runtime.snapshot().units.find(unit => unit.descriptor.id === 'maintenance')?.generations[0]?.generation).toBe(1)
  expect(f.client.connectionStatus()).toBe('connected')
  for (const unit of before.units.filter(unit => unit.descriptor.id !== 'maintenance'))
    expect(f.runtime.snapshot().units.find(current => current.descriptor.id === unit.descriptor.id)?.generations[0]?.pid).toBe(unit.generations[0]?.pid)
}, 120_000)

test('Storage replacement waits for the maintenance writer, cancellation remains callable, and only Storage changes after verified handoff', async () => {
  const f = await fixture('writer'), before = f.runtime.snapshot()
  await f.runtime.waitForIdle()
  const preview = await f.commands.execute('chatDatabase.preview', { kind: 'database', scope: { kind: 'global' } }, { idempotencyKey: 'handoff-preview' })
  expect(await f.terminal(preview.operationId)).toMatchObject({ status: 'completed', candidateCount: 1 })
  const cleanup = await f.commands.execute('chatDatabase.cleanup', { previewId: preview.operationId }, { idempotencyKey: 'handoff-cleanup' })
  await until(() => existsSync(f.marker))
  const source = join(f.source, 'updated-storage.ts')
  await writeFile(source, (await readFile('apps/host/src/runtime-storage-process.ts', 'utf8')).replaceAll("'./", "'../../apps/host/src/") + '\nexport const compatibleStorageRevision = 2\n')
  const unit = f.runtime.buildUnits.find(unit => unit.descriptor.id === 'storage')!
  const prepared = f.runtime.artifacts.registerSet([await f.runtime.artifacts.build({ ...unit, entrypoint: source })])
  let reload = f.runtime.reload(prepared.id, ['storage'])
  const diagnostic = () => ({ operation: f.runtime.getReload(reload.operationId), storage: f.runtime.storage.snapshot(), units: f.runtime.snapshot().units.filter(unit => ['storage', 'maintenance'].includes(unit.descriptor.id)) })
  await until(() => f.runtime.getReload(reload.operationId).units[0]?.phase === 'activating', diagnostic)
  expect(f.runtime.getReload(reload.operationId).cancellable).toBe(true)
  expect(await f.system.execute('system.runtime.reload.cancel', { operationId: reload.operationId })).toMatchObject({ phase: 'cancelled', switchedAt: null })
  expect(f.runtime.manager.currentVersion('storage').generation).toBe(1)
  expect(f.runtime.storage.snapshot().phase).toBe('handover')
  reload = f.runtime.reload(prepared.id, ['storage'])
  await until(() => f.runtime.getReload(reload.operationId).units[0]?.phase === 'activating', diagnostic)
  expect(f.runtime.storage.snapshot().phase).toBe('handover')
  expect((await f.system.execute('system.runtime.get', {})).instanceId).toBe(before.instanceId)
  expect(await f.commands.execute('chatDatabase.cancel', { operationId: cleanup.operationId }, { idempotencyKey: 'cancel-owned-writer' }))
    .toMatchObject({ status: 'cancelRequested', cancellationRequested: true })
  await writeFile(f.release, 'released')
  expect(await f.terminal(cleanup.operationId)).toMatchObject({ status: 'cancelled', deletedCount: 0 })
  await until(() => f.runtime.getReload(reload.operationId).phase === 'completed', diagnostic)
  expect(f.runtime.manager.currentVersion('storage').generation).toBe(3)
  expect(f.runtime.snapshot().ready).toBe(true)
  expect(f.client.connectionStatus()).toBe('connected')
  for (const current of before.units.filter(unit => unit.descriptor.id !== 'storage'))
    expect(f.runtime.snapshot().units.find(unit => unit.descriptor.id === current.descriptor.id)?.generations[0]?.pid).toBe(current.generations[0]?.pid)
  expect((await f.runtime.storage.call('context', f.session.id)).messages[0]?.content).toEqual([{ type: 'text', text: 'retained maintenance history' }])
}, 120_000)
