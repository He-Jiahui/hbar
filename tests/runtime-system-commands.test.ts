import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { HbarClient, createSystemCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { RuntimeManager, RuntimeArtifactStore, ManagedProcess } from '@hbar/runtime'
import type { RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import { startServer } from '../apps/host/src/server'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-runtime-command-'))
  const kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, demo: true, secrets: new MemorySecrets() })
  const registry = new RuntimeArtifactStore(join(root, 'bundles'), process.cwd())
  const descriptor: RuntimeUnitDescriptor = { id: 'diagnostics.fixture', kind: 'plugin', isolation: 'process', dependencies: [], required: true, reloadable: true, contractFingerprint: 'a'.repeat(64), storageSchema: 23 }
  const artifact = await registry.build({ descriptor, entrypoint: 'tests/fixtures/runtime-service.ts' })
  const set = registry.registerSet([artifact])
  const runtime = new RuntimeManager({ instanceId: kernel.instanceId, artifacts: registry, references: () => ({ runs: 0, resources: 0, tools: 0 }),
    create: (artifact, generation, changed) => new ManagedProcess({ descriptor: artifact.descriptor, artifactId: artifact.id,
      modulePath: join(registry.root, artifact.id, artifact.entry), generation,
      parent: { unitId: 'base', generation: 1, incarnation: 'base-one' }, onState: changed,
    }),
  })
  runtime.register(descriptor)
  runtime.reload(set.id, [descriptor.id], true)
  await runtime.reconcile()
  const host = await startServer(kernel, { port: 0, runtime })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => { client.disconnect(); await host.close(); await runtime.close(); await kernel.close(); await rm(root, { recursive: true, force: true }) })
  await client.pair(host.pairing.code, 'runtime commands')
  return { client, commands: createSystemCommandClient(client), runtime, descriptor, set, host, kernel, registry }
}

test('registered runtime commands return early operation identities and preserve the authenticated connection and Host identity', async () => {
  const f = await fixture()
  const before = await f.commands.execute('system.runtime.get', {})
  const original = f.runtime.currentVersion(f.descriptor.id)
  const sourceRoot = await mkdtemp(join(process.cwd(), 'artifacts', 'runtime-command-fixture-'))
  cleanups.push(() => rm(sourceRoot, { recursive: true, force: true }))
  const source = join(sourceRoot, 'service.ts')
  await writeFile(source, `${await readFile('tests/fixtures/runtime-service.ts', 'utf8')}\nexport const revision = 2\n`)
  const set = f.registry.registerSet([await f.registry.build({ descriptor: f.descriptor, entrypoint: source })])
  const pending = f.runtime.call(f.descriptor.id, 'fixture.wait', 1_500, z.number())
  const accepted = await f.commands.execute('system.runtime.reload', { artifactSetId: set.id, unitIds: [f.descriptor.id] })
  expect(accepted.operationId).toBeString()
  const early = await f.commands.execute('system.runtime.reload.get', accepted)
  expect(early.switchedAt).toBeNull()
  await f.runtime.reconcile()
  const current = f.runtime.currentVersion(f.descriptor.id)
  expect(current.generation).toBeGreaterThan(original.generation)
  await pending
  await f.runtime.reconcile()
  const after = await f.commands.execute('system.runtime.get', {})
  expect(after.instanceId).toBe(before.instanceId)
  expect((await f.client.call('system.bootstrap', {})).host.instanceId).toBe(before.instanceId)
  expect(f.client.connectionStatus()).toBe('connected')
  expect((await f.commands.execute('system.runtime.reload.get', accepted)).phase).toBe('completed')
})

test('unknown artifact sets and paths are rejected without changing the serving generation', async () => {
  const f = await fixture()
  const before = f.runtime.currentVersion(f.descriptor.id)
  expect(await f.commands.execute('system.runtime.reload', { artifactSetId: 'C:/arbitrary/source.ts', unitIds: [f.descriptor.id] }).catch((error: unknown) => error)).toMatchObject({ code: 'RUNTIME_ARTIFACT_UNREGISTERED' })
  expect(f.runtime.currentVersion(f.descriptor.id)).toEqual(before)
  expect(await f.commands.execute('system.runtime.reload.get', { operationId: 'missing' }).catch((error: unknown) => error)).toMatchObject({ code: 'RUNTIME_OPERATION_NOT_FOUND' })
})
