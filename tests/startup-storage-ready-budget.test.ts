import { expect, test } from 'bun:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { Storage } from '@hbar/storage'
import { STARTUP_STORAGE_READY_TIMEOUT_MS } from '../apps/host/src/process-host-runtime'

async function cleanup(root: string, workers: readonly Storage[]): Promise<void> {
  const failures: unknown[] = []
  const closed = await Promise.allSettled(workers.map((worker) => worker.close()))
  for (const outcome of closed) if (outcome.status === 'rejected') failures.push(outcome.reason)
  try {
    const absolute = resolve(root)
    if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith('hbar-startup-budget-'))
      throw new Error('STARTUP_FIXTURE_CLEANUP_PATH_REJECTED')
    await rm(absolute, { recursive: true, force: true })
  } catch (error) {
    failures.push(error)
  }
  if (failures.length) throw new AggregateError(failures, 'Startup fixture cleanup failed')
}

async function workerFixture(delay: number) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-startup-budget-'))
  const workerPath = join(root, 'worker.ts')
  await writeFile(
    workerPath,
    `import { parentPort } from 'node:worker_threads';
    parentPort?.on('message', message => {
      if(message.method==='ready') setTimeout(()=>parentPort?.postMessage({id:message.id,ok:true,result:{version:32}}),${delay});
      else if(message.method==='close') parentPort?.postMessage({id:message.id,ok:true,result:undefined});
    });`,
  )
  return { root, workerPath }
}

test('installation ready may exceed ordinary 30s while serving requests retain the default deadline', async () => {
  const fixture = await workerFixture(31_000)
  const workers: Storage[] = []
  const failures: unknown[] = []
  try {
    const installation = new Storage('installation-fixture', undefined, {
      workerPath: fixture.workerPath,
      requestTimeoutMs: STARTUP_STORAGE_READY_TIMEOUT_MS,
    })
    workers.push(installation)
    const ordinary = new Storage('ordinary-fixture', undefined, { workerPath: fixture.workerPath })
    workers.push(ordinary)
    const [ready, failure] = await Promise.all([
      installation.call('ready'),
      ordinary.call('ready').catch((error: unknown) => error),
    ])
    expect(STARTUP_STORAGE_READY_TIMEOUT_MS).toBe(120_000)
    expect(ready).toEqual({ version: 32 })
    expect(failure).toMatchObject({ code: 'STORAGE_TIMEOUT' })
  } catch (error) {
    failures.push(error)
  }
  try {
    await cleanup(fixture.root, workers)
  } catch (error) {
    failures.push(new Error('Startup cleanup failed', { cause: error }))
  }
  if (failures.length) throw new AggregateError(failures, 'Startup test or cleanup failed', { cause: failures[0] })
}, 40_000)

test('startup close cancels pending ready without waiting for the longer installation deadline', async () => {
  const fixture = await workerFixture(31_000)
  const workers: Storage[] = []
  const failures: unknown[] = []
  try {
    const installation = new Storage('cancelled-installation-fixture', undefined, {
      workerPath: fixture.workerPath,
      requestTimeoutMs: STARTUP_STORAGE_READY_TIMEOUT_MS,
    })
    workers.push(installation)
    const pending = installation.call('ready').catch((error: unknown) => error)
    const started = performance.now()
    await installation.close()
    expect(await pending).toMatchObject({ code: 'STORAGE_CLOSED' })
    expect(performance.now() - started).toBeLessThan(5_000)
    expect(await installation.call('ready').catch((error: unknown) => error)).toMatchObject({ code: 'STORAGE_CLOSED' })
  } catch (error) {
    failures.push(error)
  }
  try {
    await cleanup(fixture.root, workers)
  } catch (error) {
    failures.push(new Error('Startup cleanup failed', { cause: error }))
  }
  if (failures.length) throw new AggregateError(failures, 'Startup test or cleanup failed', { cause: failures[0] })
}, 10_000)
