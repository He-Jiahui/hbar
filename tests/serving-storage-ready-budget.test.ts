import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import {
  Storage,
  STORAGE_SCHEMA_VERSION,
  STORAGE_RPC_FINGERPRINT,
  createPathLayout,
  ensurePathLayout,
} from '@hbar/storage'
import { IpcPeer, runtimePrepareSchema } from '@hbar/runtime'
import { create } from '../apps/host/src/runtime-storage-process'
import { acquireHostProcessLock } from '../apps/host/src/process-lock'

async function fixture() {
  const previousWorkerPath = process.env.HBAR_STORAGE_WORKER
  const root = await mkdtemp(join(tmpdir(), 'hbar-serving-ready-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  await ensurePathLayout(layout)
  const workerPath = join(root, 'worker.ts')
  const marker = join(root, 'serving-started')
  await writeFile(
    workerPath,
    `import { parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
parentPort.on('message', message => {
 if(message.method==='ready') {
  if(!workerData.preflight) writeFileSync(${JSON.stringify(marker)}, 'started');
  setTimeout(()=>parentPort.postMessage({id:message.id,ok:true,result:{version:${STORAGE_SCHEMA_VERSION}}}),workerData.preflight?0:31000);
 } else if(message.method==='close') parentPort.postMessage({id:message.id,ok:true,result:undefined});
 else setTimeout(()=>parentPort.postMessage({id:message.id,ok:true,result:null}),31000);
});`,
  )
  const peer = new IpcPeer({
    owner: { unitId: 'storage', generation: 1, incarnation: 'ready-owner' },
    remote: { unitId: 'base', generation: 1, incarnation: 'ready-parent' },
    transport: { send() {} },
  })
  const service = await create({
    peer,
    preparing: () => false,
    configuration: {
      database: layout.database,
      dataRoot: layout.dataRoot,
      cacheRoot: layout.cacheRoot,
      pointerFile: layout.pointerFile,
      settingsRoot: layout.settings,
      sessionsRoot: layout.sessions,
      skillsRoot: layout.skills,
      identityRoot: layout.identityRoot,
      workerPath,
    },
  })
  const preparation = runtimePrepareSchema.parse({
    descriptor: {
      id: 'storage',
      kind: 'storage',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: STORAGE_RPC_FINGERPRINT,
      storageSchema: STORAGE_SCHEMA_VERSION,
    },
    configuration: {},
  })
  return { root, layout, peer, service, preparation, workerPath, marker, previousWorkerPath }
}
async function cleanup(f: Awaited<ReturnType<typeof fixture>>, ordinary?: Storage) {
  const errors: unknown[] = []
  for (const operation of [() => f.service.dispose(), () => ordinary?.close()]) {
    try {
      await operation()
    } catch (error: unknown) {
      errors.push(error)
    }
  }
  f.peer.close()
  if (f.previousWorkerPath === undefined) delete process.env.HBAR_STORAGE_WORKER
  else process.env.HBAR_STORAGE_WORKER = f.previousWorkerPath
  try {
    const owned = resolve(f.root)
    if (dirname(owned) !== resolve(tmpdir()) || !basename(owned).startsWith('hbar-serving-ready-'))
      throw new Error('Refusing non-owned fixture cleanup')
    await rm(owned, { recursive: true, force: true })
  } catch (error: unknown) {
    errors.push(error)
  }
  if (errors.length) throw new AggregateError(errors, 'Serving ready cleanup failed')
}

test('actual storage service activates past30s while ordinary serving method keeps30s deadline', async () => {
  const f = await fixture()
  const ordinary = new Storage('ordinary-fixture', f.layout, { workerPath: f.workerPath })
  const errors: unknown[] = []
  try {
    expect((await f.service.prepare(f.preparation)).contractFingerprint).toBe(STORAGE_RPC_FINGERPRINT)
    const started = performance.now()
    const [activation, ordinaryFailure] = await Promise.all([
      f.service.activate('default'),
      ordinary.call('getSetting', 'fixture').catch((error: unknown) => error),
    ])
    expect(activation).toBeUndefined()
    expect(performance.now() - started).toBeGreaterThanOrEqual(30_000)
    expect(performance.now() - started).toBeLessThan(40_000)
    expect(ordinaryFailure).toMatchObject({ code: 'STORAGE_TIMEOUT' })
    expect(await f.service.drain()).toMatchObject({ resources: 1 })
    await f.service.dispose()
    const release = await acquireHostProcessLock(`${f.layout.database}.runtime-writer.lock`)
    await release()
  } catch (error: unknown) {
    errors.push(error)
  }
  try {
    await cleanup(f, ordinary)
  } catch (error: unknown) {
    errors.push(error)
  }
  if (errors.length) throw new AggregateError(errors, 'Serving ready body or cleanup failed')
}, 45_000)

test('dispose during actual writer startup joins pending Worker and releases writer lease', async () => {
  const f = await fixture()
  const errors: unknown[] = []
  let pending: Promise<unknown> | undefined
  try {
    await f.service.prepare(f.preparation)
    pending = f.service.activate('default').catch((error: unknown) => error)
    const deadline = Date.now() + 3000
    for (;;) {
      try {
        if ((await readFile(f.marker, 'utf8')) === 'started') break
      } catch (error: unknown) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error
      }
      if (Date.now() > deadline) throw new Error('Serving Worker did not start')
      await Bun.sleep(5)
    }
    const started = performance.now()
    await f.service.dispose()
    expect(await pending).toMatchObject({ code: 'STORAGE_CLOSED' })
    expect(performance.now() - started).toBeLessThan(5000)
    expect(await f.service.drain()).toMatchObject({ resources: 0 })
    const release = await acquireHostProcessLock(`${f.layout.database}.runtime-writer.lock`)
    await release()
  } catch (error: unknown) {
    errors.push(error)
  }
  try {
    await cleanup(f)
    await pending
  } catch (error: unknown) {
    errors.push(error)
  }
  if (errors.length) throw new AggregateError(errors, 'Serving cancel body or cleanup failed')
}, 10_000)

test('startup ready budget rejects unbounded or invalid values without changing ordinary Storage call API', async () => {
  const f = await fixture()
  const storage = new Storage('bounds-fixture', f.layout, { workerPath: f.workerPath })
  try {
    for (const timeout of [0, -1, 120_001, Number.NaN, 1.5])
      await expect(storage.ready(timeout)).rejects.toBeInstanceOf(RangeError)
  } finally {
    await cleanup(f, storage)
  }
})
