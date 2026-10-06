import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
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
  await mkdir(join(web, 'assets'), { recursive: true })
  const entry = '<html><script src="/assets/current.js"></script></html>'
  await writeFile(join(web, 'index.html'), entry)
  await writeFile(join(web, 'assets', 'current.js'), 'current bundle')
  return { root, web, resources, target, entry }
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
