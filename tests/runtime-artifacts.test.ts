import { expect, test } from 'bun:test'
import { RuntimeArtifactStore } from '@hbar/runtime'
import type { RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function descriptor(id: string, dependencies: string[] = []): RuntimeUnitDescriptor {
  return {
    id,
    kind: 'plugin',
    isolation: 'process',
    dependencies,
    reloadable: true,
    required: true,
    contractFingerprint: 'a'.repeat(64),
    storageSchema: 23,
  }
}

test('immutable builds derive actual source ownership and reject modified registered artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-artifacts-'))
  const source = join(root, 'source')
  await mkdir(source)
  await writeFile(join(source, 'shared.ts'), 'export const value = 1\n')
  await writeFile(join(source, 'first.ts'), "export { value } from './shared'\n")
  await writeFile(join(source, 'second.ts'), 'export const independent = 2\n')
  const store = new RuntimeArtifactStore(join(root, 'bundles'), source)
  try {
    const first = await store.build({ descriptor: descriptor('first'), entrypoint: 'first.ts' })
    const second = await store.build({ descriptor: descriptor('second'), entrypoint: 'second.ts' })
    expect(store.affected(['shared.ts'], [first, second])).toEqual(['first'])
    expect(store.affected(['second.ts'], [first, second])).toEqual(['second'])
    const again = await store.build({ descriptor: descriptor('first'), entrypoint: 'first.ts' })
    expect(again.id).toBe(first.id)
    const set = store.registerSet([first, second])
    expect(store.artifactSet(set.id).artifacts).toHaveLength(2)
    const path = await store.modulePath(first.id)
    expect(await readFile(path, 'utf8')).toContain('value = 1')
    await writeFile(path, 'export const tampered = true\n')
    await expect(store.modulePath(first.id)).rejects.toMatchObject({ code: 'RUNTIME_ARTIFACT_CHANGED' })
    await expect(store.modulePath('b'.repeat(64))).rejects.toMatchObject({ code: 'RUNTIME_ARTIFACT_UNREGISTERED' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('port-only dependencies do not cascade reloads, while emitted shared code still owns every actual consumer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-artifact-ports-'))
  const source = join(root, 'source')
  await mkdir(source)
  await writeFile(join(source, 'shared.ts'), 'export const shared = 1')
  await writeFile(join(source, 'producer.ts'), "export { shared } from './shared'")
  await writeFile(join(source, 'consumer.ts'), "export { shared } from './shared'")
  const store = new RuntimeArtifactStore(join(root, 'bundles'), source)
  try {
    const producer = await store.build({ descriptor: descriptor('producer'), entrypoint: 'producer.ts' })
    const consumer = await store.build({
      descriptor: { ...descriptor('consumer', ['producer']), reloadDependencies: [] },
      entrypoint: 'consumer.ts',
    })
    expect(store.affected(['producer.ts'], [producer, consumer])).toEqual(['producer'])
    expect(store.affected(['shared.ts'], [producer, consumer])).toEqual(['consumer', 'producer'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('new source content and declared dynamic resources affect hashes and explicit capability dependents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-artifact-resources-'))
  const source = join(root, 'source')
  await mkdir(join(source, 'resources'), { recursive: true })
  await writeFile(join(source, 'plugin.ts'), 'export const plugin = true\n')
  await writeFile(join(source, 'consumer.ts'), 'export const consumer = true\n')
  await writeFile(join(source, 'resources', 'prompt.md'), 'first\n')
  const store = new RuntimeArtifactStore(join(root, 'bundles'), source)
  try {
    const plugin = await store.build({
      descriptor: descriptor('plugin'),
      entrypoint: 'plugin.ts',
      resources: ['resources'],
    })
    const consumer = await store.build({ descriptor: descriptor('consumer', ['plugin']), entrypoint: 'consumer.ts' })
    const oldResources = await store.resourcePaths(plugin.id)
    expect(await readFile(oldResources['resources/prompt.md']!, 'utf8')).toBe('first\n')
    expect(store.affected(['resources/new.md', 'resources/prompt.md'], [plugin, consumer])).toEqual([
      'consumer',
      'plugin',
    ])
    await writeFile(join(source, 'resources', 'prompt.md'), 'second\n')
    const modified = await store.build({
      descriptor: descriptor('plugin'),
      entrypoint: 'plugin.ts',
      resources: ['resources'],
    })
    expect(modified.id).not.toBe(plugin.id)
    expect(await readFile(oldResources['resources/prompt.md']!, 'utf8')).toBe('first\n')
    await writeFile(join(source, 'plugin.ts'), 'export const plugin = false\n')
    const sourceModified = await store.build({
      descriptor: descriptor('plugin'),
      entrypoint: 'plugin.ts',
      resources: ['resources'],
    })
    expect(sourceModified.id).not.toBe(modified.id)
    expect(await store.get(plugin.id)).toEqual(plugin)
    await writeFile(oldResources['resources/prompt.md']!, 'tampered\n')
    await expect(store.get(plugin.id)).rejects.toMatchObject({ code: 'RUNTIME_ARTIFACT_CHANGED' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('build and artifact set failures cannot replace a registered compatible version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-artifact-build-failure-'))
  await writeFile(join(root, 'entry.ts'), 'export const compiled = true\n')
  const store = new RuntimeArtifactStore(join(root, 'bundles'), root)
  try {
    const first = await store.build({ descriptor: descriptor('plugin'), entrypoint: 'entry.ts' })
    const set = store.registerSet([first])
    await writeFile(join(root, 'entry.ts'), 'export const broken = (\n')
    await expect(store.build({ descriptor: descriptor('plugin'), entrypoint: 'entry.ts' })).rejects.toMatchObject({
      code: 'RUNTIME_BUILD_FAILED',
    })
    expect(store.artifactSet(set.id).artifacts[0]?.id).toBe(first.id)
    expect(() => store.registerSet([first, first])).toThrow('duplicate units')
    expect(() => store.artifactSet('missing')).toThrow('not registered')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('ownership excludes code removed from a defined isolated unit and includes its actual Worker bundle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-artifact-output-'))
  await writeFile(join(root, 'unrelated.ts'), 'export function unused() { return "unrelated" }\n')
  await writeFile(join(root, 'used.ts'), 'export const used = 1\n')
  await writeFile(join(root, 'worker.ts'), 'export const workerVersion = 1\n')
  await writeFile(
    join(root, 'entry.ts'),
    "import { unused } from './unrelated'; import { used } from './used'; export function create() { if (!ISOLATED) return unused(); return used }\n",
  )
  const store = new RuntimeArtifactStore(join(root, 'bundles'), root)
  try {
    const artifact = await store.build({
      descriptor: descriptor('unit'),
      entrypoint: 'entry.ts',
      workers: ['worker.ts'],
      define: { ISOLATED: 'true' },
    })
    expect(artifact.inputs).toContain('used.ts')
    expect(artifact.inputs).toContain('worker.ts')
    expect(artifact.inputs).not.toContain('unrelated.ts')
    expect(store.affected(['unrelated.ts'], [artifact])).toHaveLength(0)
    expect(store.affected(['worker.ts'], [artifact])).toEqual(['unit'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('declared owned modules compile from explicit local roots, retain their code and dependencies, and cannot escape undeclared roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-owned-module-'))
  const outside = await mkdtemp(join(tmpdir(), 'hbar-explicit-profile-'))
  await writeFile(join(root, 'entry.ts'), 'export const entry = true\n')
  await writeFile(join(outside, 'helper.ts'), 'export const version = 1\n')
  await writeFile(join(outside, 'custom.ts'), "import { version } from './helper'; export default { version }\n")
  const registry = new RuntimeArtifactStore(join(root, 'bundles'), root)
  const module = { name: 'profile', path: join(outside, 'custom.ts') }
  try {
    expect(
      await registry
        .build({ descriptor: descriptor('owner'), entrypoint: 'entry.ts', modules: [module] })
        .catch((error: unknown) => error),
    ).toMatchObject({ code: 'RUNTIME_BUILD_INVALID' })
    const artifact = await registry.build({
      descriptor: descriptor('owner'),
      entrypoint: 'entry.ts',
      modules: [module],
      sourceRoots: [outside],
    })
    const first = await readFile(join(registry.root, artifact.id, 'profile.js'), 'utf8')
    expect(first).toContain('version = 1')
    expect(registry.affected([join(outside, 'helper.ts')], [artifact])).toEqual(['owner'])
    await writeFile(join(outside, 'helper.ts'), 'export const version = 2\n')
    const next = await registry.build({
      descriptor: descriptor('owner'),
      entrypoint: 'entry.ts',
      modules: [module],
      sourceRoots: [outside],
    })
    expect(next.id).not.toBe(artifact.id)
    expect(await readFile(join(registry.root, artifact.id, 'profile.js'), 'utf8')).toBe(first)
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})
