import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RuntimeArtifactStore, buildRuntimeArtifact } from '@hbar/runtime'
import type { RuntimeUnitDescriptor } from '@hbar/contracts/runtime'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(process.cwd(), 'artifacts', 'runtime-builder-')); roots.push(root)
  const source = join(root, 'unit.ts'); await writeFile(source, 'export const revision = 1\n')
  const descriptor: RuntimeUnitDescriptor = { id: 'fixture', kind: 'plugin', isolation: 'process', required: true, reloadable: true,
    contractFingerprint: 'a'.repeat(64), storageSchema: 24, dependencies: [] }
  return { root, source, store: new RuntimeArtifactStore(join(root, 'bundles'), process.cwd()), unit: { descriptor, entrypoint: source } }
}
test('isolated local builds register verified immutable bytes and leave the stable loop responsive', async () => {
  const f = await fixture(), signal = new AbortController().signal
  let turns = 0
  const timer = setInterval(() => turns++, 1)
  try {
    const artifact = await buildRuntimeArtifact(f.store, f.unit, signal)
    expect(artifact.inputs).toContain(f.source.slice(process.cwd().length + 1).replaceAll('\\', '/'))
    expect(await readFile(await f.store.modulePath(artifact.id), 'utf8')).toContain('revision')
    expect(f.store.registerSet([artifact]).artifacts).toHaveLength(1)
    expect(turns).toBeGreaterThan(0)
  } finally { clearInterval(timer) }
})
test('a failed build leaves the registered generation available and cancellation has no orphaned builder', async () => {
  const f = await fixture(), controller = new AbortController()
  const artifact = await buildRuntimeArtifact(f.store, f.unit, controller.signal)
  await writeFile(f.source, 'export const broken = ;')
  await expect(buildRuntimeArtifact(f.store, f.unit, controller.signal)).rejects.toMatchObject({ code: 'RUNTIME_BUILD_FAILED' })
  expect(await f.store.get(artifact.id)).toEqual(artifact)
  controller.abort()
  await expect(buildRuntimeArtifact(f.store, f.unit, controller.signal)).rejects.toBeDefined()
})
