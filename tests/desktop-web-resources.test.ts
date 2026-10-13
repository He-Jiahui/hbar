import { afterEach, expect, test } from 'bun:test'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  createWebBuildProvenance,
  currentWebBuildSettings,
  hashWebBuildFile,
  WEB_BUILD_PROVENANCE_FILE,
} from '../scripts/web-build-provenance'
import { syncDesktopWebResources } from '../scripts/sync-desktop-web'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (dirname(root) !== tmpdir() || !root.startsWith(join(tmpdir(), 'hbar-desktop-web-sync-')))
      throw new Error('Unexpected desktop resource fixture path')
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-desktop-web-sync-'))
  roots.push(root)
  const web = join(root, 'dist', 'web')
  const resources = join(root, 'dist', 'desktop-resources')
  const target = join(resources, 'web')
  await mkdir(join(root, 'apps', 'web', 'src'), { recursive: true })
  await mkdir(join(root, 'packages', 'app-react'), { recursive: true })
  await mkdir(join(web, 'assets'), { recursive: true })
  await mkdir(join(root, 'apps', 'web'), { recursive: true })
  await writeFile(join(root, 'package.json'), '{"name":"fixture"}')
  await writeFile(join(root, 'bun.lock'), 'fixture lock')
  await writeFile(join(root, 'tsconfig.json'), '{"compilerOptions":{}}')
  await writeFile(join(root, 'apps', 'web', 'package.json'), '{"name":"@hbar/web-fixture"}')
  await writeFile(join(root, 'apps', 'web', 'vite.config.ts'), 'export default {}')
  await writeFile(join(root, 'packages', 'app-react', 'package.json'), '{"sideEffects":["**/*.css"]}')
  const sourceModule = join(root, 'apps', 'web', 'src', 'main.ts')
  await writeFile(sourceModule, 'export const fixture = true')
  const entry = '<html><script src="/assets/current.js"></script></html>'
  await writeFile(join(web, 'index.html'), entry)
  await writeFile(join(web, 'assets', 'current.js'), 'current bundle')
  const sourceModules = [await hashWebBuildFile(root, 'apps/web/src/main.ts')]
  const inputPaths = [
    'package.json',
    'bun.lock',
    'tsconfig.json',
    'apps/web/package.json',
    'apps/web/vite.config.ts',
    'packages/app-react/package.json',
  ]
  const buildInputs = await Promise.all(inputPaths.map((path) => hashWebBuildFile(root, path)))
  const emittedAssets = [await hashWebBuildFile(web, 'index.html'), await hashWebBuildFile(web, 'assets/current.js')]
  const provenance = createWebBuildProvenance({
    entryPath: 'index.html',
    sourceModules,
    buildInputs,
    emittedAssets,
    buildSettings: currentWebBuildSettings(),
    externalPackages: ['react'],
    externalModuleCount: 1,
    bundledDependencyCount: 0,
    virtualModuleCount: 0,
  })
  await writeFile(join(web, WEB_BUILD_PROVENANCE_FILE), JSON.stringify(provenance))
  return { root, web, resources, target, entry, sourceModule }
}

test('desktop Web publication replaces the whole old bundle and retains source and Host resources', async () => {
  const f = await fixture()
  await mkdir(join(f.target, 'assets'), { recursive: true })
  await writeFile(join(f.target, 'index.html'), 'old entry')
  await writeFile(join(f.target, 'assets', 'old.css'), 'old native popover defaults')
  await writeFile(join(f.resources, 'host.js'), 'unchanged Host')
  expect(await syncDesktopWebResources(f.root)).toBe(createHash('sha256').update(f.entry).digest('hex'))
  expect(await readFile(join(f.target, 'index.html'), 'utf8')).toBe(f.entry)
  expect(await readdir(join(f.target, 'assets'))).toEqual(['current.js'])
  expect(await readFile(join(f.resources, 'host.js'), 'utf8')).toBe('unchanged Host')
  expect(await readFile(join(f.web, 'assets', 'current.js'), 'utf8')).toBe('current bundle')
  expect(await readdir(f.resources)).toEqual(['host.js', 'web'])
  expect(await syncDesktopWebResources(f.root)).toBe(createHash('sha256').update(f.entry).digest('hex'))
})

test('missing source entry never removes an existing desktop bundle', async () => {
  const f = await fixture()
  await mkdir(f.target, { recursive: true })
  await writeFile(join(f.target, 'index.html'), 'old entry retained')
  await rm(join(f.web, 'index.html'))
  await expect(syncDesktopWebResources(f.root)).rejects.toThrow()
  expect(await readFile(join(f.target, 'index.html'), 'utf8')).toBe('old entry retained')
  expect(await readdir(f.resources)).toEqual(['web'])
})

test('desktop Web resource targets cannot follow a linked output directory', async () => {
  const f = await fixture()
  const unrelated = join(f.root, 'unrelated')
  await mkdir(unrelated)
  await writeFile(join(unrelated, 'sentinel.txt'), 'do not touch')
  await mkdir(f.resources)
  await symlink(unrelated, f.target, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(syncDesktopWebResources(f.root)).rejects.toThrow('not plain')
  expect(await readFile(join(unrelated, 'sentinel.txt'), 'utf8')).toBe('do not touch')
})

test('a first publication creates the desktop Web bundle without touching other directories', async () => {
  const f = await fixture()
  await syncDesktopWebResources(f.root)
  expect(await readFile(join(f.target, 'assets', 'current.js'), 'utf8')).toBe('current bundle')
  expect(await readdir(f.resources)).toEqual(['web'])
})

test('missing provenance retains the previously published desktop bundle', async () => {
  const f = await fixture()
  await mkdir(f.target, { recursive: true })
  await writeFile(join(f.target, 'index.html'), 'previous bundle')
  await rm(join(f.web, WEB_BUILD_PROVENANCE_FILE))
  await expect(syncDesktopWebResources(f.root)).rejects.toThrow('provenance is missing')
  expect(await readFile(join(f.target, 'index.html'), 'utf8')).toBe('previous bundle')
})

test('changed source module rejects stale output before replacing the previous bundle', async () => {
  const f = await fixture()
  await mkdir(f.target, { recursive: true })
  await writeFile(join(f.target, 'index.html'), 'previous bundle')
  await writeFile(f.sourceModule, 'export const fixture = false')
  await expect(syncDesktopWebResources(f.root)).rejects.toThrow('source module changed')
  expect(await readFile(join(f.target, 'index.html'), 'utf8')).toBe('previous bundle')
})

test('missing or changed emitted assets reject stale output before replacement', async () => {
  const f = await fixture()
  await mkdir(f.target, { recursive: true })
  await writeFile(join(f.target, 'index.html'), 'previous bundle')
  await writeFile(join(f.web, 'assets', 'current.js'), 'tampered bundle')
  await expect(syncDesktopWebResources(f.root)).rejects.toThrow('asset changed')
  await writeFile(join(f.web, 'assets', 'current.js'), 'current bundle')
  await rm(join(f.web, 'assets', 'current.js'))
  await expect(syncDesktopWebResources(f.root)).rejects.toThrow()
  expect(await readFile(join(f.target, 'index.html'), 'utf8')).toBe('previous bundle')
})

test('copy failure during staging retains the previously published desktop bundle', async () => {
  const f = await fixture()
  await mkdir(f.target, { recursive: true })
  await writeFile(join(f.target, 'index.html'), 'previous bundle')
  const failCopy: typeof cp = async () => {
    throw new Error('fixture staging copy failure')
  }
  await expect(syncDesktopWebResources(f.root, failCopy)).rejects.toThrow('fixture staging copy failure')
  expect(await readFile(join(f.target, 'index.html'), 'utf8')).toBe('previous bundle')
  expect(await readdir(f.resources)).toEqual(['web'])
})

test('changed workspace side-effect metadata rejects stale output before replacement', async () => {
  const f = await fixture()
  await mkdir(f.target, { recursive: true })
  await writeFile(join(f.target, 'index.html'), 'previous bundle')
  await writeFile(join(f.root, 'packages', 'app-react', 'package.json'), '{"sideEffects":false}')
  await expect(syncDesktopWebResources(f.root)).rejects.toThrow('build input changed')
  expect(await readFile(join(f.target, 'index.html'), 'utf8')).toBe('previous bundle')
})

test('source changes during staging retain the previous bundle and remove only owned staging', async () => {
  const f = await fixture()
  await mkdir(f.target, { recursive: true })
  await writeFile(join(f.target, 'index.html'), 'previous bundle')
  const changeSourceDuringCopy: typeof cp = async (source, destination, options) => {
    await cp(source, destination, options)
    await writeFile(f.sourceModule, 'export const fixture = false')
  }
  await expect(syncDesktopWebResources(f.root, changeSourceDuringCopy)).rejects.toThrow('source module changed')
  expect(await readFile(join(f.target, 'index.html'), 'utf8')).toBe('previous bundle')
  expect(await readdir(f.resources)).toEqual(['web'])
})
