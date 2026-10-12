import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative } from 'node:path'
import { z } from 'zod'
import { ManagedProcess, RuntimeArtifactStore } from '@hbar/runtime'
import { StableStoragePort, Storage, createPathLayout, ensurePathLayout, callStorageRpc, scanSessionLogs, STORAGE_RPC_FINGERPRINT, STORAGE_SCHEMA_VERSION, STORAGE_RPC_METHODS } from '@hbar/storage'
import type { RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import { acquireHostProcessLock } from '../apps/host/src/process-lock'

const resources: { root: string; processes: ManagedProcess[]; port: StableStoragePort }[] = []
afterEach(async () => {
  for (const entry of resources.splice(0)) {
    await entry.port.close()
    await Promise.all(entry.processes.map(process => process.dispose()))
    await rm(entry.root, { recursive: true, force: true })
  }
})
const outcome = (promise: Promise<unknown>) => promise.catch((error: unknown) => error)
async function removeWorkerSource(sourceRoot: string) {
  const path = relative(resolve(process.cwd(), 'artifacts'), resolve(sourceRoot))
  if (path.startsWith('..') || !path.startsWith('failed-storage-worker-')) throw new Error('Worker source cleanup escaped its owned artifact directory')
  await rm(resolve(sourceRoot), { recursive: true, force: true })
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-storage-process-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  await ensurePathLayout(layout)
  const initial = new Storage(layout.database, layout)
  await initial.call('ready')
  const workspace = await initial.call('createWorkspace', root, 'fixture')
  const session = await initial.call('createSession', workspace.id)
  await initial.close()
  const descriptor: RuntimeUnitDescriptor = {
    id: 'storage', kind: 'storage', isolation: 'process', dependencies: [], required: true, reloadable: true,
    contractFingerprint: STORAGE_RPC_FINGERPRINT, storageSchema: STORAGE_SCHEMA_VERSION,
  }
  const registry = new RuntimeArtifactStore(join(root, 'bundles'), process.cwd())
  const artifact = await registry.build({ descriptor, entrypoint: 'apps/host/src/runtime-storage-process.ts', workers: ['packages/storage/src/worker.ts'] })
  const port = new StableStoragePort(5000)
  const entry = { root, port, processes: [] as ManagedProcess[] }
  resources.push(entry)
  const make = async (generation: number, selectedArtifact = artifact) => {
    const process = new ManagedProcess({ descriptor, artifactId: selectedArtifact.id, modulePath: await registry.modulePath(selectedArtifact.id), generation,
      parent: { unitId: 'base', generation: 1, incarnation: 'stable-base' },
      configuration: { database: layout.database, dataRoot: layout.dataRoot, cacheRoot: layout.cacheRoot, pointerFile: layout.pointerFile,
        settingsRoot: layout.settings, sessionsRoot: layout.sessions, skillsRoot: layout.globalSkills, identityRoot: layout.identityRoot,
        workerPath: join(registry.root, selectedArtifact.id, 'worker.js') },
    })
    entry.processes.push(process)
    await process.prepare()
    return process
  }
  const install = (process: ManagedProcess) => port.install({ owner: process.owner(), retire: () => process.dispose(),
    suspend: operationId => process.call('storage.suspend', { operationId }, z.undefined()),
    resume: operationId => process.call('storage.resume', { operationId }, z.undefined()),
    call: (method, args, authority) => callStorageRpc({ execute: input => process.call('storage.call', input, z.unknown()) }, method, args, authority),
  })
  return { root, layout, registry, descriptor, artifact, port, session, make, install }
}

test('prepared storage has no writer, and a real process/Worker switch preserves committed data and sole writer authority', async () => {
  const f = await fixture()
  const first = await f.make(1)
  const originalLog = scanSessionLogs(f.layout.sessions).events.map(item => item.hash)
  expect(originalLog.length).toBeGreaterThan(0)
  expect(f.artifact.inputs).toContain('packages/storage/src/worker.ts')
  expect(f.artifact.files.some(file => file.name === 'worker.js')).toBe(true)
  expect(first.snapshot().phase).toBe('ready')
  expect(await outcome(first.call('storage.call', { method: 'setSetting', args: ['candidate', 'write'] }, z.unknown()))).toMatchObject({ code: 'RUNTIME_RECOVERING' })
  await first.activate()
  f.install(first)
  await f.port.call('setSetting', 'generation', 'one')
  const second = await f.make(2)
  expect(await f.port.call('getSetting', 'generation')).toBe('one')
  const oldPid = first.snapshot().pid
  await f.port.beginHandover()
  expect(first.snapshot()).toMatchObject({ phase: 'disposed', pid: null })
  const waiting = f.port.call('getSetting', 'generation')
  await second.activate()
  f.install(second)
  expect(await waiting).toBe('one')
  expect(second.snapshot().pid).not.toBe(oldPid)
  await f.port.call('setSetting', 'generation', 'two')
  expect(await f.port.call('getSetting', 'candidate')).toBeNull()
  expect(scanSessionLogs(f.layout.sessions).events.map(item => item.hash)).toEqual(originalLog)
})

test('managed maintenance joins the old Storage Worker and releases the OS writer lease before reopening the same process', async () => {
  const f = await fixture(), process = await f.make(1)
  await process.activate(); f.install(process)
  await f.port.call('setSetting', 'maintenance', 'preserved')
  const pid = process.snapshot().pid
  expect(await outcome(acquireHostProcessLock(`${f.layout.database}.runtime-writer.lock`))).toBeInstanceOf(Error)
  await f.port.beginMaintenance('verified-vacuum')
  expect(await outcome(process.call('storage.call', { method: 'ready', args: [] }, z.unknown()))).toMatchObject({ code: 'STORAGE_WRITER_UNAVAILABLE' })
  const release = await acquireHostProcessLock(`${f.layout.database}.runtime-writer.lock`)
  expect(process.snapshot().pid).toBe(pid)
  const waiting = f.port.call('getSetting', 'maintenance')
  await release()
  await f.port.endMaintenance('verified-vacuum')
  expect(await waiting).toBe('preserved')
  expect(process.snapshot()).toMatchObject({ phase: 'serving', pid })
  expect(await outcome(acquireHostProcessLock(`${f.layout.database}.runtime-writer.lock`))).toBeInstanceOf(Error)
})

test('a second activated process cannot write while the existing Worker owner still holds its OS lease', async () => {
  const f = await fixture()
  const first = await f.make(1), candidate = await f.make(2)
  await first.activate()
  f.install(first)
  expect(await outcome(candidate.activate())).toMatchObject({ code: 'STORAGE_WRITER_ACTIVE' })
  await candidate.dispose()
  expect(await f.port.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
})

test('the public storage RPC catalog contains every declared method exactly once', async () => {
  const types = await Bun.file('packages/storage/src/types.ts').text()
  const port = types.slice(types.indexOf('export interface StorageMethods'), types.indexOf('export type StorageCall'))
  const declared = [...port.matchAll(/^ {2}(\w+)(?:\(|:)/gm)].map(match => {
    if (!match[1]) throw new Error('Missing storage method name')
    return match[1]
  }).sort()
  const actual: string[] = [...STORAGE_RPC_METHODS]
  expect(actual.sort()).toEqual(declared)
  expect(new Set(STORAGE_RPC_METHODS).size).toBe(STORAGE_RPC_METHODS.length)
})

test('an actual candidate Worker startup failure is rejected before the serving storage writer retires', async () => {
  const f = await fixture(), first = await f.make(1)
  await first.activate(); f.install(first)
  const sourceRoot = await mkdtemp(join(process.cwd(), 'artifacts', 'failed-storage-worker-'))
  try {
    const path = join(sourceRoot, 'worker.ts')
    await writeFile(path, "throw new Error('Injected actual Worker constructor failure')\n")
    const broken = await f.registry.build({ descriptor: f.descriptor, entrypoint: 'apps/host/src/runtime-storage-process.ts', workers: [path] })
    expect(await outcome(f.make(2, broken))).toMatchObject({ code: 'STORAGE_WORKER_FAILED' })
    expect(first.snapshot()).toMatchObject({ phase: 'serving', failures: 0 })
    expect(f.port.snapshot()).toMatchObject({ phase: 'serving', owner: first.owner() })
    expect(await f.port.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
    expect(await f.port.call('session', f.session.id)).toMatchObject({ id: f.session.id })
  } finally {
    await removeWorkerSource(sourceRoot)
  }
}, 40_000)
