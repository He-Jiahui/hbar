import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { z } from 'zod'
import { ManagedProcess, RuntimeArtifactStore } from '@hbar/runtime'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'
import type { RuntimeOwner, RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import {
  Storage,
  createPathLayout,
  ensurePathLayout,
  callStorageRpc,
  scanSessionLogs,
  STORAGE_RPC_FINGERPRINT,
  STORAGE_RPC_METHODS,
  STORAGE_SCHEMA_VERSION,
  storageActivatedCatalogSchema,
} from '@hbar/storage'
import type { StorageMethods } from '@hbar/storage'
import { acquireHostProcessLock } from '../apps/host/src/process-lock'

const checkpointSchema = z.strictObject({
  operationId: z.string(),
  owner: z.strictObject({ unitId: z.string(), generation: z.number(), incarnation: z.string() }),
  databaseCloseAcknowledged: z.literal(true),
  workerExitConfirmed: z.literal(true),
  writerLeaseReleased: z.literal(true),
  queuedSessionCount: z.literal(0),
})

// Uses actual native process ownership, a bundled production Storage service and real SQLite.
// No full Host, fake native receipt or model participates. Generations never overlap.
test('real Storage hibernates its Worker, releases the writer lease and wakes a fresh durable generation without replay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-storage-idle-real-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  const processes: ManagedProcess[] = []
  const exited: RuntimeOwner[] = []
  const failures: unknown[] = []
  let initial: Storage | undefined
  let testFailed = false
  let testFailure: unknown
  try {
    await ensurePathLayout(layout)
    initial = new Storage(layout.database, layout)
    expect(() => initial?.activatedCatalog()).toThrow()
    await initial.ready(120_000)
    const catalog = initial.activatedCatalog()
    expect(catalog.coverage).toBe('complete-single-source')
    const methodsSource = await Bun.file('packages/storage/src/types.ts').text()
    const publicPort = methodsSource.slice(
      methodsSource.indexOf('export interface StorageMethods'),
      methodsSource.indexOf('export type StorageCall'),
    )
    const declaredMethods = [...publicPort.matchAll(/^ {2}(\w+)(?:\(|:)/gm)]
      .map((match) => {
        if (!match[1]) throw new Error('Missing public Storage method name')
        return match[1]
      })
      .sort()
    const actualMethods: string[] = [...STORAGE_RPC_METHODS]
    expect(actualMethods.sort()).toEqual(declaredMethods)
    expect(new Set(STORAGE_RPC_METHODS).size).toBe(declaredMethods.length)
    expect(STORAGE_SCHEMA_VERSION).toBe(32)
    const workspace = await initial.call('createWorkspace', root, 'real-idle')
    const session = await initial.call('createSession', workspace.id)
    await initial.close()
    initial = undefined
    const descriptor: RuntimeUnitDescriptor = {
      id: 'storage',
      kind: 'storage',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: STORAGE_RPC_FINGERPRINT,
      storageSchema: STORAGE_SCHEMA_VERSION,
    }
    const registry = new RuntimeArtifactStore(join(root, 'bundles'), process.cwd())
    const artifact = await registry.build({
      descriptor,
      entrypoint: 'apps/host/src/runtime-storage-process.ts',
      workers: ['packages/storage/src/worker.ts', 'packages/storage/src/session-log-scan-worker.ts'],
    })
    const make = async (generation: number): Promise<ManagedProcess> => {
      const runtime = new ManagedProcess({
        descriptor,
        artifactId: artifact.id,
        modulePath: await registry.modulePath(artifact.id),
        generation,
        purpose: generation === 1 ? 'startup' : 'idle-wake',
        parent: { unitId: 'base', generation: 1, incarnation: 'storage-real-parent' },
        processTree: createRuntimeProcessTreePort(),
        shutdownMs: 5_000,
        onExit: (owner) => {
          exited.push(structuredClone(owner))
          return Promise.resolve()
        },
        configuration: {
          database: layout.database,
          dataRoot: layout.dataRoot,
          cacheRoot: layout.cacheRoot,
          pointerFile: layout.pointerFile,
          settingsRoot: layout.settings,
          sessionsRoot: layout.sessions,
          skillsRoot: layout.globalSkills,
          identityRoot: layout.identityRoot,
          workerPath: join(registry.root, artifact.id, 'worker.js'),
        },
      })
      processes.push(runtime)
      await runtime.prepare()
      await runtime.activate()
      return runtime
    }
    const rpc = <K extends keyof StorageMethods>(
      runtime: ManagedProcess,
      method: K,
      ...args: Parameters<StorageMethods[K]>
    ) => callStorageRpc({ execute: (input) => runtime.call('storage.call', input, z.unknown()) }, method, args)
    const first = await make(1)
    const firstOwner = first.owner()
    expect(await first.call('storage.catalog', undefined, storageActivatedCatalogSchema)).toEqual(catalog)
    expect((await first.idleSnapshot()).eligible).toBe(false) // Open DB and OS writer lease remain real resources.
    await rpc(first, 'setSetting', 'idle-durable', 'committed-once')
    const run = await rpc(
      first,
      'enqueue',
      session.id,
      'idle-one-request',
      { text: 'owned fixture', images: [] },
      'fixture',
    )
    expect(await rpc(first, 'hasQueuedRuns')).toBe(true)
    let queuedFailure: unknown
    try {
      await first.call('storage.hibernate', { operationId: 'queue-denial', owner: firstOwner }, checkpointSchema)
    } catch (error) {
      queuedFailure = error
    }
    expect(queuedFailure).toMatchObject({ code: 'STORAGE_IDLE_QUEUE_NOT_EMPTY' })
    expect(await rpc(first, 'getSetting', 'idle-durable')).toBe('committed-once')
    expect((await rpc(first, 'claim', session.id))?.id).toBe(run.id)
    await rpc(first, 'setRun', run.id, 'completed')
    expect(await rpc(first, 'hasQueuedRuns')).toBe(false)
    let wrongOwnerFailure: unknown
    try {
      await first.call(
        'storage.hibernate',
        { operationId: 'wrong-owner', owner: { ...firstOwner, incarnation: 'different-owner' } },
        checkpointSchema,
      )
    } catch (error) {
      wrongOwnerFailure = error
    }
    expect(wrongOwnerFailure).toMatchObject({ code: 'STORAGE_IDLE_OWNER_CHANGED' })
    const logHashes = scanSessionLogs(layout.sessions).events.map((event) => event.hash)
    expect(logHashes.length).toBeGreaterThan(0)
    const checkpoint = await first.call(
      'storage.hibernate',
      { operationId: 'real-idle-1', owner: firstOwner },
      checkpointSchema,
    )
    expect(checkpoint).toMatchObject({
      owner: firstOwner,
      operationId: 'real-idle-1',
      databaseCloseAcknowledged: true,
      workerExitConfirmed: true,
      writerLeaseReleased: true,
      queuedSessionCount: 0,
    })
    // The service released its OS writer lease only after closeIdle joined the actual Worker.
    const release = await acquireHostProcessLock(`${layout.database}.runtime-writer.lock`)
    await release()
    expect((await first.idleSnapshot()).eligible).toBe(true)
    expect(await first.retireIdle(firstOwner)).toMatchObject({ status: 'confirmed-physical-exit', owner: firstOwner })
    expect(first.retirementReceipt(firstOwner)).toMatchObject({
      owner: firstOwner,
      exitCode: 0,
      nativeJoined: true,
      onExitCompleted: true,
      forced: false,
      cleanDisposeAck: true,
    })
    expect(first.snapshot()).toMatchObject({ phase: 'disposed', pid: null })
    expect(exited).toEqual([firstOwner])
    // New process/Worker is created only after exact native retirement of the first process.
    const second = await make(2)
    expect(second.owner().incarnation).not.toBe(firstOwner.incarnation)
    expect(await second.call('storage.catalog', undefined, storageActivatedCatalogSchema)).toEqual(catalog)
    expect(await rpc(second, 'getSetting', 'idle-durable')).toBe('committed-once')
    const replay = await rpc(
      second,
      'enqueue',
      session.id,
      'idle-one-request',
      { text: 'owned fixture', images: [] },
      'fixture',
    )
    expect(replay.id).toBe(run.id)
    expect(replay.status).toBe('completed')
    expect(await rpc(second, 'hasQueuedRuns')).toBe(false)
    expect(scanSessionLogs(layout.sessions).events.map((event) => event.hash)).toEqual(logHashes)
    const secondOwner = second.owner()
    await second.call('storage.hibernate', { operationId: 'real-idle-2', owner: secondOwner }, checkpointSchema)
    expect(await second.retireIdle(secondOwner)).toMatchObject({
      status: 'confirmed-physical-exit',
      owner: secondOwner,
    })
    expect(second.retirementReceipt(secondOwner)).toMatchObject({
      forced: false,
      cleanDisposeAck: true,
      nativeJoined: true,
      onExitCompleted: true,
    })
    expect(exited).toEqual([firstOwner, secondOwner])
  } catch (error) {
    testFailed = true
    testFailure = error
  }
  // Attempt every owner cleanup, including when assertions or artifact preparation failed.
  if (initial)
    try {
      await initial.close()
    } catch (error) {
      failures.push(error)
    }
  for (const runtime of processes)
    try {
      await runtime.dispose()
    } catch (error) {
      failures.push(error)
    }
  const absolute = resolve(root)
  const delta = relative(resolve(tmpdir()), absolute)
  if (
    !delta ||
    delta.startsWith('..') ||
    resolve(tmpdir(), delta) !== absolute ||
    !delta.startsWith('hbar-storage-idle-real-')
  )
    failures.push(new Error('Storage idle fixture cleanup escaped its owned temporary root'))
  else if (failures.length === 0)
    try {
      await rm(absolute, { recursive: true, force: true })
    } catch (error) {
      failures.push(error)
    }
  if (testFailed) failures.unshift(testFailure)
  if (failures.length)
    throw new AggregateError(failures, 'Real Storage idle fixture or cleanup failed', { cause: failures[0] })
}, 120_000)
