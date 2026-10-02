import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyWorkspaceCleanup, inspectWorkspaceCleanup } from '../scripts/workspace-cleanup'

const temporary: string[] = []
const idle = { javascriptActive: false, previewActive: false, rustActive: false }
afterEach(async () => {
  for (const directory of temporary.splice(0)) await rm(directory, { recursive: true, force: true })
})
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-cleanup-'))
  temporary.push(root)
  const child = Bun.spawn(['git', 'init', '--quiet', root], { stdout: 'pipe', stderr: 'pipe' })
  if ((await child.exited) !== 0) throw new Error('Could not initialize cleanup fixture')
  await writeFile(join(root, '.gitignore'), 'dist/\ntarget/\nnode_modules/\n')
  await mkdir(join(root, 'dist'), { recursive: true })
  await writeFile(join(root, 'dist', 'generated.js'), 'generated output')
  await writeFile(join(root, 'source.ts'), 'user-owned source')
  return root
}
test('default inspection leaves generated files, source and unrelated ignored evidence intact', async () => {
  const root = await fixture()
  await mkdir(join(root, 'artifacts'))
  await writeFile(join(root, 'artifacts', 'review.png'), 'review evidence')
  const plan = await inspectWorkspaceCleanup(root, idle)
  expect(plan.find((entry) => entry.target.path === 'dist')?.state).toBe('eligible')
  expect(await readFile(join(root, 'dist', 'generated.js'), 'utf8')).toBe('generated output')
  await applyWorkspaceCleanup(root, async () => idle)
  expect(await readFile(join(root, 'source.ts'), 'utf8')).toBe('user-owned source')
  expect(await readFile(join(root, 'artifacts', 'review.png'), 'utf8')).toBe('review evidence')
  expect(await Bun.file(join(root, 'dist', 'generated.js')).exists()).toBe(false)
})
test('tracked files inside an ignored build directory protect the entire directory', async () => {
  const root = await fixture()
  const child = Bun.spawn(['git', '-C', root, 'add', '-f', 'dist/generated.js'], { stdout: 'pipe', stderr: 'pipe' })
  if ((await child.exited) !== 0) throw new Error('Could not track cleanup fixture')
  const plan = await inspectWorkspaceCleanup(root, idle)
  expect(plan.find((entry) => entry.target.path === 'dist')?.protection).toBe('tracked-content')
  await applyWorkspaceCleanup(root, async () => idle)
  expect(await readFile(join(root, 'dist', 'generated.js'), 'utf8')).toBe('generated output')
})
test('a process starting after inspection protects its build and cache outputs', async () => {
  const root = await fixture()
  await mkdir(join(root, 'target'))
  await writeFile(join(root, 'target', 'native.bin'), 'native output')
  await mkdir(join(root, 'node_modules', '.vite'), { recursive: true })
  await writeFile(join(root, 'node_modules', '.vite', 'cache.js'), 'live cache')
  const plan = await inspectWorkspaceCleanup(root, idle)
  expect(plan.filter((entry) => entry.state === 'eligible')).toHaveLength(3)
  await applyWorkspaceCleanup(root, async () => ({ javascriptActive: true, previewActive: true, rustActive: true }))
  expect(await readFile(join(root, 'target', 'native.bin'), 'utf8')).toBe('native output')
  expect(await readFile(join(root, 'node_modules', '.vite', 'cache.js'), 'utf8')).toBe('live cache')
})
test('directory links cannot redirect cleanup into another directory', async () => {
  const root = await fixture()
  const outside = await mkdtemp(join(tmpdir(), 'hbar-cleanup-outside-'))
  temporary.push(outside)
  await writeFile(join(outside, 'keep.txt'), 'external source')
  await rm(join(root, 'dist'), { recursive: true })
  await symlink(outside, join(root, 'dist'), process.platform === 'win32' ? 'junction' : 'dir')
  const plan = await inspectWorkspaceCleanup(root, idle)
  expect(plan.find((entry) => entry.target.path === 'dist')?.protection).toBe('linked-path')
  await applyWorkspaceCleanup(root, async () => idle)
  expect(await readFile(join(outside, 'keep.txt'), 'utf8')).toBe('external source')
})
test('unignored output names and a non-root workspace are rejected', async () => {
  const root = await fixture()
  await writeFile(join(root, '.gitignore'), '')
  const plan = await inspectWorkspaceCleanup(root, idle)
  expect(plan.find((entry) => entry.target.path === 'dist')?.protection).toBe('not-ignored')
  await expect(inspectWorkspaceCleanup(join(root, 'dist'), idle)).rejects.toThrow('exact root')
})
