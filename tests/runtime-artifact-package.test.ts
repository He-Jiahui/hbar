import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { ManagedProcess, RuntimeArtifactStore } from '@hbar/runtime'
import type { RuntimeUnitDescriptor } from '@hbar/contracts/runtime'

const resources: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of resources.splice(0)) await cleanup() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-artifact-package-'))
  const source = await mkdtemp(join(process.cwd(), 'artifacts', 'runtime-package-source-'))
  resources.push(async () => { await rm(root, { recursive: true, force: true }); await rm(source, { recursive: true, force: true }) })
  const native = join(source, 'helper.dll')
  await writeFile(native, new Uint8Array([0, 1, 2, 255]))
  const descriptor: RuntimeUnitDescriptor = { id: 'fixture', kind: 'plugin', isolation: 'process', required: true, reloadable: true,
    dependencies: [], contractFingerprint: 'a'.repeat(64), storageSchema: 23 }
  const builder = new RuntimeArtifactStore(join(root, 'build'), process.cwd())
  const artifact = await builder.build({ descriptor, entrypoint: 'tests/fixtures/runtime-service.ts', resources: [native], workers: ['tests/fixtures/runtime-ipc-owner.ts'] })
  const packaged = await builder.exportPackage([artifact])
  const installed = new RuntimeArtifactStore(join(root, 'installed'), join(root, 'source-is-unavailable'))
  return { root, source, artifact, packaged, installed }
}

test('a build-pinned package installs immutable process, Worker and native resources without the original source checkout', async () => {
  const f = await fixture()
  const set = await f.installed.installPackage(f.packaged, f.packaged.id)
  expect(set.artifacts).toEqual([f.artifact])
  expect((await f.installed.installPackage(f.packaged, f.packaged.id)).id).toBe(set.id)
  const assets = await f.installed.resourcePaths(f.artifact.id)
  expect([...await readFile(Object.values(assets)[0]!)]).toEqual([0, 1, 2, 255])
  expect(await readFile(join(f.installed.root, f.artifact.id, 'runtime-ipc-owner.js'), 'utf8')).toContain('ipc')
  const processUnit = new ManagedProcess({ descriptor: f.artifact.descriptor, artifactId: f.artifact.id, generation: 1,
    modulePath: await f.installed.modulePath(f.artifact.id), parent: { unitId: 'base', generation: 1, incarnation: 'package-test' } })
  resources.unshift(() => processUnit.dispose())
  await processUnit.prepare(); await processUnit.activate()
  expect(await processUnit.call('fixture.echo', 'source-independent runtime', z.string())).toBe('source-independent runtime')
})

test('a changed package, metadata or payload is rejected before writing modules or registering an artifact set', async () => {
  const f = await fixture()
  for (const change of ['bytes', 'metadata', 'expected'] as const) {
    const packaged = structuredClone(f.packaged)
    if (change === 'bytes') packaged.units[0]!.files[0]!.base64 = Buffer.from('changed executable').toString('base64')
    if (change === 'metadata') packaged.units[0]!.artifact.descriptor.reloadable = false
    const error = await f.installed.installPackage(packaged, change === 'expected' ? 'b'.repeat(64) : f.packaged.id).catch((value: unknown) => value)
    expect(error).toMatchObject({ code: 'RUNTIME_PACKAGE_CHANGED' })
    expect(f.installed.preparedSets()).toEqual([])
    expect(await Bun.file(join(f.installed.root, f.artifact.id, 'manifest.json')).exists()).toBe(false)
  }
})
