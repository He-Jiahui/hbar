import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRuntimeSkillCatalog, rankSkills, SKILL_LIMITS } from '@hbar/kernel/skills'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-runtime-skills-'))
  roots.push(root)
  const workspace = join(root, 'workspace')
  const global = join(root, 'relocated', 'skills')
  await mkdir(workspace, { recursive: true })
  await mkdir(global, { recursive: true })
  return { root, workspace, global, catalog: createRuntimeSkillCatalog(global) }
}
async function skill(root: string, id: string, description: string, body = 'Use the reference.', header = '') {
  const directory = join(root, id)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'SKILL.md'), `---\nname: ${id}\ndescription: ${description}\n${header}---\n${body}`)
  return directory
}

test('discovers workspace and relocated global skills, with nearest native override and no empty pseudo-skills', async () => {
  const { workspace, global, catalog } = await fixture()
  const native = join(workspace, '.hbar', 'skills')
  const agents = join(workspace, '.agents', 'skills')
  await skill(global, 'review', 'Global review')
  await skill(agents, 'review', 'Compatible review')
  await skill(native, 'review', 'Native review')
  await skill(join(agents, '.system'), 'nested', 'Nested skill')
  await skill(join(workspace, '.claude', 'skills'), 'claude', 'Claude-compatible entry')
  await skill(join(workspace, '.codex', 'skills'), 'codex', 'Codex-compatible entry')
  await skill(join(workspace, '.opencode', 'skills'), 'opencode', 'OpenCode-compatible entry')
  await skill(global, 'global-only', 'Only global')
  await mkdir(join(global, 'empty'))
  const first = await catalog.snapshot(workspace)
  expect(first.skills).toHaveLength(6)
  expect(first.skills.find((entry) => entry.name === 'review')).toMatchObject({
    description: 'Native review',
    scope: 'workspace',
  })
  expect(first.skills.find((entry) => entry.name === 'global-only')?.scope).toBe('global')
  expect(first.warnings).toEqual([])
  expect((await catalog.snapshot(workspace)).revision).toBe(first.revision)
  catalog.dispose()
})

test('parses multiline YAML, implicit invocation policies and legacy entries without loading unrelated bodies', async () => {
  const { workspace, global, catalog } = await fixture()
  await skill(global, 'continuous-zh', '>\n  修复前端交互布局与视觉问题。\n  适用于中文连续文本。', 'DO_NOT_LOAD_BODY')
  const manual = await skill(global, 'manual-only', 'Explicit use only')
  await mkdir(join(manual, 'agents'))
  await writeFile(join(manual, 'agents', 'openai.yaml'), 'policy:\n  allow_implicit_invocation: false\n')
  await skill(global, 'claude-manual', 'Explicit Claude skill', 'Body', 'disable-model-invocation: true\n')
  await mkdir(join(global, 'legacy'))
  await writeFile(join(global, 'legacy', 'SKILL.md'), '# Legacy entry\n\nA useful legacy workflow.\n')
  await skill(global, 'invalid', '[unterminated')
  const snapshot = await catalog.snapshot(workspace)
  expect(snapshot.skills.map((entry) => entry.name)).not.toContain('invalid')
  expect(snapshot.warnings).toContain('global:invalid:INVALID_SKILL_METADATA')
  expect(snapshot.skills.find((entry) => entry.name === 'manual-only')?.implicit).toBe(false)
  expect(snapshot.skills.find((entry) => entry.name === 'claude-manual')?.implicit).toBe(false)
  expect(snapshot.skills.find((entry) => entry.name === 'legacy')?.description).toBe('A useful legacy workflow.')
  expect(JSON.stringify(snapshot)).not.toContain('DO_NOT_LOAD_BODY')
  expect(rankSkills(snapshot.skills, '请修复前端交互布局')[0]?.name).toBe('continuous-zh')
  expect(rankSkills(snapshot.skills, 'Use $manual-only')[0]?.name).toBe('manual-only')
})

test('searches all metadata with bounded stable pages and rejects stale and cross-query cursors', async () => {
  const { workspace, global, catalog } = await fixture()
  for (let index = 0; index < 26; index++)
    await skill(global, `entry-${String(index).padStart(2, '0')}`, 'Fixture skill')
  const first = await catalog.search(workspace, { limit: 7 })
  expect(first.items).toHaveLength(7)
  expect(first.total).toBe(26)
  expect(first.nextCursor).not.toBeNull()
  const second = await catalog.search(workspace, { limit: 7, cursor: first.nextCursor! })
  expect(new Set([...first.items, ...second.items].map((entry) => entry.id)).size).toBe(14)
  await expect(catalog.search(workspace, { query: 'different', cursor: first.nextCursor! })).rejects.toMatchObject({
    code: 'VERSION_CONFLICT',
  })
  await skill(global, 'entry-new', 'Newly installed skill')
  await expect(catalog.search(workspace, { cursor: first.nextCursor! })).rejects.toMatchObject({
    code: 'VERSION_CONFLICT',
  })
  expect((await catalog.search(workspace, { query: 'entry-new' })).items[0]?.name).toBe('entry-new')
  await expect(catalog.search(workspace, { cursor: 'invalid' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
})

test('loads exact current instructions and paged resources without splitting emoji or mixing edits', async () => {
  const { workspace, global, catalog } = await fixture()
  const directory = await skill(global, 'resources', 'Resource workflow')
  await mkdir(join(directory, 'references'))
  const source = `${'a'.repeat(SKILL_LIMITS.pageCharacters - 1)}😀中文${'b'.repeat(8_000)}`
  await writeFile(join(directory, 'references', 'notes.md'), source)
  const entry = await catalog.read(workspace, { name: 'resources', path: 'SKILL.md' })
  expect(entry.text).toContain('name: resources')
  expect(entry.nextOffset).toBeNull()
  const first = await catalog.read(workspace, { name: entry.skill.id, path: 'references/notes.md' })
  expect(first.nextOffset).toBe(SKILL_LIMITS.pageCharacters - 1)
  const second = await catalog.read(workspace, {
    name: 'resources',
    path: 'references/notes.md',
    offset: first.nextOffset!,
    revision: first.revision,
  })
  expect(first.text + second.text).toBe(source)
  expect(second.nextOffset).toBeNull()
  await writeFile(join(directory, 'references', 'notes.md'), 'Changed')
  await expect(
    catalog.read(workspace, { name: 'resources', path: 'references/notes.md', revision: first.revision }),
  ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
  await writeFile(join(directory, 'SKILL.md'), '---\nname: renamed\ndescription: Renamed skill\n---\nNew instructions')
  await expect(catalog.read(workspace, { name: 'resources', path: 'SKILL.md' })).rejects.toMatchObject({
    code: 'SKILL_NOT_FOUND',
  })
  expect((await catalog.read(workspace, { name: 'renamed', path: 'SKILL.md' })).text).toContain('New instructions')
})

test('rejects symlink escapes, traversal, binaries, oversize resources and cancelled operations', async () => {
  const { root, workspace, global, catalog } = await fixture()
  const directory = await skill(global, 'safe', 'Contained workflow')
  const outside = join(root, 'outside')
  await mkdir(outside)
  await writeFile(join(outside, 'private.md'), 'Outside secret')
  await symlink(outside, join(directory, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
  await symlink(outside, join(workspace, '.agents'), process.platform === 'win32' ? 'junction' : 'dir')
  await expect(catalog.read(workspace, { name: 'safe', path: 'escape/private.md' })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  })
  for (const path of [
    '../outside/private.md',
    '/absolute.md',
    'C:\\private.md',
    '.env',
    'notes.md:stream',
    'nested/../../private.md',
  ])
    await expect(catalog.read(workspace, { name: 'safe', path })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await writeFile(join(directory, 'binary.txt'), Buffer.from([0, 1, 2]))
  await expect(catalog.read(workspace, { name: 'safe', path: 'binary.txt' })).rejects.toMatchObject({
    code: 'UNSUPPORTED_TYPE',
  })
  await writeFile(join(directory, 'huge.txt'), 'a'.repeat(SKILL_LIMITS.fileBytes + 1))
  await expect(catalog.read(workspace, { name: 'safe', path: 'huge.txt' })).rejects.toMatchObject({
    code: 'SKILL_FILE_TOO_LARGE',
  })
  const controller = new AbortController()
  controller.abort()
  await expect(catalog.search(workspace, {}, controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' })
  expect((await catalog.resources(directory)).files).not.toContain('escape/private.md')
})

test('resource samples bound both file count and total path text without losing the truncation signal', async () => {
  const { global, catalog } = await fixture()
  const directory = await skill(global, 'many-assets', 'Resource sample bounds')
  for (let index = 0; index < 100; index++)
    await writeFile(join(directory, `${String(index).padStart(3, '0')}-${'n'.repeat(85)}.md`), 'Asset')
  const resources = await catalog.resources(directory)
  expect(resources.truncated).toBe(true)
  expect(resources.files.length).toBeLessThan(SKILL_LIMITS.files)
  expect(resources.files.reduce((total, path) => total + path.length, 0)).toBeLessThanOrEqual(
    SKILL_LIMITS.resourcePathCharacters,
  )
})

test('a directory replaced after loading cannot enumerate outside resources through the saved locator', async () => {
  const { root, workspace, global, catalog } = await fixture()
  const directory = await skill(global, 'swapped', 'Directory identity check')
  const loaded = await catalog.read(workspace, { name: 'swapped', path: 'SKILL.md' })
  const outside = join(root, 'outside')
  await mkdir(outside)
  await writeFile(join(outside, 'private.md'), 'Outside data')
  await rename(directory, `${directory}-before-swap`)
  await symlink(outside, directory, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(catalog.resources(loaded.skill.directory)).rejects.toMatchObject({ code: 'FORBIDDEN' })
})
