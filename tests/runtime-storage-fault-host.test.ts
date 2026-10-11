import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'

async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 30_000
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('Storage fault did not reach its observed state')
    await Bun.sleep(20)
  }
}
async function remove(root: string) {
  const owned = relative(resolve(process.cwd(), 'artifacts'), resolve(root))
  if (owned.startsWith('..') || !owned.startsWith('runtime-storage-fault-'))
    throw new Error('Refuse unowned storage fixture cleanup')
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
for (const writes of [false, true])
  test(`a Storage owner fault with an in-flight ${writes ? 'write preserves readonly recovery' : 'read restores admission without replay'}`, async () => {
    const root = await mkdtemp(join(process.cwd(), 'artifacts', 'runtime-storage-fault-'))
    const runtime = await ProcessHostRuntime.create({
      layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
      sourceRoot: process.cwd(),
      demo: true,
      secrets: new MemorySecrets(),
    })
    try {
      const unit = runtime.buildUnits.find((unit) => unit.descriptor.id === 'storage')
      if (!unit) throw new Error('Expected the Storage owner')
      const source = (await readFile(unit.entrypoint, 'utf8')).replaceAll("'./", "'../../apps/host/src/")
      const anchor = '      calls++'
      expect(source.split(anchor)).toHaveLength(2)
      const path = join(root, 'storage.ts')
      await writeFile(
        path,
        source.replace(
          anchor,
          `      if (input.method === '${writes ? 'setSetting' : 'getSetting'}' && input.args[0] === 'fault-in-flight') await Bun.sleep(60_000);\n${anchor}`,
        ),
      )
      const set = runtime.artifacts.registerSet([await runtime.artifacts.build({ ...unit, entrypoint: path })])
      runtime.reload(set.id, ['storage'])
      await until(
        () =>
          runtime.snapshot().ready &&
          runtime
            .snapshot()
            .units.find((unit) => unit.descriptor.id === 'storage')
            ?.generations.find((generation) => generation.role === 'default')?.generation === 2,
      )
      const previous = runtime
        .snapshot()
        .units.find((unit) => unit.descriptor.id === 'storage')
        ?.generations.find((generation) => generation.role === 'default')
      if (!previous?.pid || previous.pid === process.pid) throw new Error('Expected the actual Storage process')
      await runtime.waitForIdle()
      await runtime.settled()
      const pending = (
        writes
          ? runtime.storage.call('setSetting', 'fault-in-flight', 'must not replay')
          : runtime.storage.call('getSetting', 'fault-in-flight')
      ).catch((error: unknown) => error)
      await until(() => runtime.storage.snapshot().inFlight === 1)
      expect(runtime.storage.writeCallsInFlight).toBe(writes ? 1 : 0)
      process.kill(previous.pid, 'SIGKILL')
      expect(await pending).toBeInstanceOf(Error)
      if (writes) {
        await until(
          () =>
            runtime
              .snapshot()
              .units.find((unit) => unit.descriptor.id === 'storage')
              ?.generations.some(
                (generation) => generation.role === 'default' && generation.reasonCode === 'STORAGE_RESULT_UNKNOWN',
              ) === true,
        )
        expect(runtime.snapshot().ready).toBe(false)
        expect(runtime.storage.snapshot()).toMatchObject({ phase: 'fenced', inFlight: 0 })
        expect(runtime.storage.writeCallsInFlight).toBe(0)
        expect(
          runtime
            .snapshot()
            .units.find((unit) => unit.descriptor.id === 'storage')
            ?.generations.find((generation) => generation.role === 'default')?.generation,
        ).toBe(2)
        expect(await runtime.storage.call('getSetting', 'policy').catch((error: unknown) => error)).toBeInstanceOf(
          Error,
        )
      } else {
        await until(
          () =>
            runtime.snapshot().ready &&
            runtime
              .snapshot()
              .units.find((unit) => unit.descriptor.id === 'storage')
              ?.generations.find((generation) => generation.role === 'default')?.incarnation !== previous.incarnation,
        )
        expect(await runtime.storage.call('getSetting', 'other')).toBeNull()
        await until(() => runtime.storage.snapshot().inFlight === 0)
        expect(runtime.storage.snapshot()).toMatchObject({ phase: 'serving', inFlight: 0 })
        expect(runtime.storage.writeCallsInFlight).toBe(0)
      }
    } catch (error) {
      await writeFile('artifacts/runtime-storage-fault-diagnostic.json', JSON.stringify({ runtime: runtime.snapshot(), storage: runtime.storage.snapshot(), coordinator: runtime.coordinator.snapshot() }, null, 2))
      throw error
    } finally {
      await runtime.close()
      await remove(root)
    }
  }, 120_000)
