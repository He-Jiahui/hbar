import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { hostRuntimeBuildUnits } from '../apps/host/src/runtime-build'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { createPathLayout } from '@hbar/storage'
import { HbarClient, createSystemCommandClient } from '@hbar/client'
import { startServer } from '../apps/host/src/server'

test('a real source update replaces its Kernel alone, preserves the socket and reports build/native/base failures', async () => {
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'runtime-source-'))
  const source = join(root, 'kernel.ts')
  const implementation = (await readFile('apps/host/src/runtime-kernel-process.ts', 'utf8')).replaceAll(
    "'./",
    "'../../apps/host/src/",
  )
  await writeFile(source, implementation)
  const buildUnits = hostRuntimeBuildUnits().map((unit) =>
    unit.descriptor.id === 'kernel' ? { ...unit, entrypoint: source } : unit,
  )
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  const runtime = await ProcessHostRuntime.create({
    layout,
    demo: true,
    secrets: new MemorySecrets(),
    sourceRoot: process.cwd(),
    buildUnits,
    watchSource: true,
  })
  const host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  try {
    await client.pair(host.pairing.code, 'source generation fixture')
    await client.connect()
    const commands = createSystemCommandClient(client),
      before = await commands.execute('system.runtime.get', {})
    await writeFile(source, `${implementation}\nexport const sourceRevision = 2`)
    await runtime.applySourceChanges([source])
    await runtime.manager.reconcile()
    await runtime.settled()
    expect(runtime.manager.currentVersion('kernel').generation).toBe(2)
    const after = await commands.execute('system.runtime.get', {})
    expect(after.instanceId).toBe(before.instanceId)
    expect(client.connectionStatus()).toBe('connected')
    for (const id of ['controller', 'storage', 'driver.pi', 'maintenance'])
      expect(after.units.find((unit) => unit.descriptor.id === id)?.generations[0]?.pid).toBe(
        before.units.find((unit) => unit.descriptor.id === id)?.generations[0]?.pid,
      )
    expect(after.sourceReload?.unitIds).toEqual(['kernel'])
    expect(after.sourceReload?.phase).toBe('idle')
    await writeFile(source, 'export const invalid = ;')
    await runtime.applySourceChanges([source])
    expect(runtime.snapshot().sourceReload).toMatchObject({ phase: 'failed', reasonCode: 'RUNTIME_BUILD_FAILED' })
    expect(runtime.manager.currentVersion('kernel').generation).toBe(2)
    await runtime.applySourceChanges(['plugins/local-tools/native/src/lib.rs'])
    expect(runtime.snapshot().sourceReload?.phase).toBe('restart_required')
    await runtime.applySourceChanges(['plugins/local-tools/native/Cargo.lock'])
    expect(runtime.snapshot().sourceReload?.phase).toBe('restart_required')
    await runtime.applySourceChanges(['apps/host/src/server.ts'])
    expect(runtime.snapshot().sourceReload).toMatchObject({ phase: 'restart_required', unitIds: ['base'] })
    expect(client.connectionStatus()).toBe('connected')
  } finally {
    client.disconnect()
    await host.close()
    await runtime.close()
    await rm(root, { recursive: true, force: true })
  }
}, 40_000)
