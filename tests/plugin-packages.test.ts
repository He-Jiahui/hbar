import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { create as createTar } from 'tar'
import { Kernel, MemorySecrets } from '@hbar/kernel'

const resources: { root: string; kernel?: Kernel }[] = []
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.kernel?.close()
    await rm(resource.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-plugins-'))
  const project = join(root, 'project')
  await mkdir(project)
  const kernel = await Kernel.create({ home: join(root, 'data'), workspace: project, demo: true, secrets: new MemorySecrets() })
  resources.push({ root, kernel })
  return { root, kernel, projectId: (await kernel.storage.call('workspaces'))[0]!.id }
}

function packageFiles(
  name: string,
  version = '1.0.0',
  dependency: 'dependencies' | 'peerDependencies' | 'optionalDependencies' = 'dependencies',
  dependencies: Record<string, string> = {},
  scope: 'global' | 'project' = 'global',
) {
  return {
    'package.json': JSON.stringify({
      name,
      version,
      type: 'module',
      hbar: { apiVersion: '^1.0.0', scope, host: './index.js', [dependency]: dependencies },
    }),
    'index.js': `export default { manifest: { id: 'source', name: ${JSON.stringify(name)}, version: '0.0.0', apiVersion: '^1.0.0', description: '', scope: ${JSON.stringify(scope === 'project' ? 'workspace' : 'host')}, permissions: [] }, apply() {} }`,
  }
}

async function packageDirectory(root: string, name: string, options: Parameters<typeof packageFiles> = [name]) {
  const directory = join(root, `source-${crypto.randomUUID()}`)
  await mkdir(directory)
  for (const [path, content] of Object.entries(packageFiles(...options))) await writeFile(join(directory, path), content)
  return directory
}

test('package dependencies auto-enable upstreams and block disabling an active dependency', async () => {
  const { root, kernel } = await fixture()
  const upstream = await packageDirectory(root, '@fixture/upstream', ['@fixture/upstream'])
  const downstream = await packageDirectory(root, '@fixture/downstream', [
    '@fixture/downstream',
    '1.0.0',
    'dependencies',
    { '@fixture/upstream': '^1.0.0' },
  ])
  await kernel.installPlugin(upstream)
  await kernel.changePlugin('@fixture/upstream', false)
  await kernel.installPlugin(downstream)
  expect(kernel.plugins.list().find((plugin) => plugin.id === '@fixture/upstream')?.status).toBe('active')
  await expect(kernel.changePlugin('@fixture/upstream', false)).rejects.toThrow('@fixture/downstream depends')
  const lock = JSON.parse(await readFile(kernel.options.layout.pluginLock, 'utf8')) as {
    plugins: Record<string, { enabled: boolean; integrity: string }>
  }
  expect(lock.plugins['@fixture/upstream']).toMatchObject({ enabled: true })
  expect(lock.plugins['@fixture/upstream']?.integrity).toStartWith('sha256-')
})

test('missing peers and incompatible dependency versions reject the whole enable transaction', async () => {
  const { root, kernel } = await fixture()
  const missing = await packageDirectory(root, 'fixture-missing-peer', [
    'fixture-missing-peer',
    '1.0.0',
    'peerDependencies',
    { 'fixture-peer': '^1.0.0' },
  ])
  await expect(kernel.installPlugin(missing)).rejects.toThrow('requires missing fixture-peer')
  expect(kernel.plugins.list().some((plugin) => plugin.id === 'fixture-missing-peer')).toBe(false)

  const upstream = await packageDirectory(root, 'fixture-version-one', ['fixture-version-one'])
  await kernel.installPlugin(upstream)
  const conflict = await packageDirectory(root, 'fixture-conflict', [
    'fixture-conflict',
    '1.0.0',
    'dependencies',
    { 'fixture-version-one': '^2.0.0' },
  ])
  await expect(kernel.installPlugin(conflict)).rejects.toThrow('found 1.0.0')
  expect(kernel.plugins.list().some((plugin) => plugin.id === 'fixture-conflict')).toBe(false)
})

test('optional dependencies may be absent and project plugins install under their project id', async () => {
  const { root, kernel, projectId } = await fixture()
  const optional = await packageDirectory(root, 'fixture-optional', [
    'fixture-optional',
    '1.0.0',
    'optionalDependencies',
    { 'fixture-not-installed': '^1.0.0' },
  ])
  await kernel.installPlugin(optional)
  expect(kernel.plugins.doctor()).toMatchObject({ ok: true })
  const project = await packageDirectory(root, 'fixture-project', [
    'fixture-project',
    '1.0.0',
    'dependencies',
    {},
    'project',
  ])
  await expect(kernel.installPlugin(project)).rejects.toThrow('project id')
  await kernel.installPlugin(project, projectId)
  const installed = kernel.plugins.list().find((plugin) => plugin.id === 'fixture-project')
  expect(installed?.projectId).toBe(projectId)
  expect(installed?.path).toContain(join('plugins', 'projects', projectId))
})

test('zip and tgz packages install without scripts, while archive traversal is rejected', async () => {
  const { root, kernel } = await fixture()
  const zipped = packageFiles('fixture-zip')
  const zipPath = join(root, 'fixture.zip')
  await writeFile(zipPath, zipSync(Object.fromEntries(Object.entries(zipped).map(([path, value]) => [path, strToU8(value)]))))
  await kernel.installPlugin(zipPath)
  expect(kernel.plugins.list().some((plugin) => plugin.id === 'fixture-zip')).toBe(true)

  const tgzSource = await packageDirectory(root, 'fixture-tgz', ['fixture-tgz'])
  const tgzPath = join(root, 'fixture.tgz')
  await createTar({ gzip: true, file: tgzPath, cwd: tgzSource }, ['package.json', 'index.js'])
  await kernel.installPlugin(tgzPath)
  expect(kernel.plugins.list().some((plugin) => plugin.id === 'fixture-tgz')).toBe(true)

  const malicious = join(root, 'malicious.zip')
  await writeFile(malicious, zipSync({ '../escaped.txt': strToU8('escape') }))
  await expect(kernel.installPlugin(malicious)).rejects.toThrow('Unsafe archive path')
  expect(await Bun.file(join(root, 'escaped.txt')).exists()).toBe(false)
})
