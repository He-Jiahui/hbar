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
