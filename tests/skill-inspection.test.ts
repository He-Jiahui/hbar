import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createExtensionCommandClient, HbarClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { createSkillInspectionService, skillInspectionLimits } from '../apps/host/src/skill-inspection.ts'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-skill-inspection-'))
  const global = join(root, 'global')
  await mkdir(global, { recursive: true })
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  return { global, service: createSkillInspectionService(global) }
}

test('discovers empty skills and reads a bounded markdown entry and reference', async () => {
  const { global, service } = await fixture()
  await mkdir(join(global, 'empty-skill'))
  const normal = join(global, 'review-skill')
  await mkdir(join(normal, 'references'), { recursive: true })
  await writeFile(
    join(normal, 'SKILL.md'),
    '---\nname: Review helper\ndescription: Read-only review notes\n---\n\n# Review helper\n\nUse the notes.\n',
  )
  await writeFile(join(normal, 'references', 'notes.md'), '# Notes\n\nReference body.\n')
  await writeFile(join(normal, '.secret.md'), 'private')
  await writeFile(join(normal, 'payload.bin'), Buffer.from([0, 1, 2]))

  const descriptors = await service.list()
  expect(descriptors.map((item) => item.id)).toEqual(['empty-skill', 'review-skill'])
  expect(descriptors.every((item) => item.scope === 'global')).toBeTrue()

  const empty = await service.inspect('empty-skill')
  expect(empty).toMatchObject({
    id: 'empty-skill',
    entryPath: null,
    displayName: 'empty-skill',
    description: '',
    body: '',
    files: [],
    filesTruncated: false,
    entryTruncated: false,
  })

  const detail = await service.inspect('review-skill')
  expect(detail).toMatchObject({
    entryPath: 'SKILL.md',
    displayName: 'Review helper',
    description: 'Read-only review notes',
    body: '\n# Review helper\n\nUse the notes.\n',
  })
  expect(detail?.files.map((file) => file.path)).toEqual(['SKILL.md', 'references/notes.md'])
  expect(await service.readFile('review-skill', 'references/notes.md')).toMatchObject({
    id: 'review-skill',
    path: 'references/notes.md',
    text: '# Notes\n\nReference body.\n',
    truncated: false,
  })
  expect(await service.inspect('missing-skill')).toBeNull()
  expect(await service.readFile('review-skill', 'references/missing.md')).toBeNull()
})

test('rejects hidden, binary, traversal, and unindexed files', async () => {
  const { global, service } = await fixture()
  const skill = join(global, 'safe')
  await mkdir(join(skill, 'references'), { recursive: true })
  await writeFile(join(skill, 'SKILL.md'), '# Safe\n')
  await writeFile(join(skill, 'references', 'binary.md'), Buffer.from([35, 0, 65]))
  await writeFile(join(skill, '.hidden.md'), 'hidden')

  expect((await service.inspect('safe'))?.files.map((file) => file.path)).toEqual(['SKILL.md', 'references/binary.md'])
  await expect(service.readFile('safe', 'references/binary.md')).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' })
  await expect(service.readFile('safe', '../SKILL.md')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(service.readFile('safe', 'references/../SKILL.md')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  expect(await service.readFile('safe', 'references/unknown.md')).toBeNull()
  await expect(service.readFile('safe', '.hidden.md')).rejects.toMatchObject({ code: 'FORBIDDEN' })

  try {
    await symlink(join(skill, 'SKILL.md'), join(skill, 'references', 'linked.md'))
    expect((await service.inspect('safe'))?.files.map((file) => file.path)).toEqual([
      'SKILL.md',
      'references/binary.md',
    ])
    await expect(service.readFile('safe', 'references/linked.md')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !['EPERM', 'EACCES', 'UNKNOWN'].includes('code' in error ? String(error.code) : '')
    )
      throw error
  }
})

test('marks text over the byte limit as truncated and preserves exact-limit text', async () => {
  const { global, service } = await fixture()
  const skill = join(global, 'limits')
  await mkdir(skill)
  await writeFile(join(skill, 'SKILL.md'), '# Limits\n')
  await writeFile(join(skill, 'exact.txt'), Buffer.alloc(skillInspectionLimits.maxTextBytes, 97))
  await writeFile(join(skill, 'large.txt'), `${'界'.repeat(skillInspectionLimits.maxTextBytes)}\n`)

  const exact = await service.readFile('limits', 'exact.txt')
  expect(exact?.truncated).toBeFalse()
  expect(exact?.text.length).toBe(skillInspectionLimits.maxTextBytes)

  const large = await service.readFile('limits', 'large.txt')
  expect(large?.truncated).toBeTrue()
  expect(Buffer.byteLength(large?.text ?? '', 'utf8')).toBeLessThanOrEqual(skillInspectionLimits.maxTextBytes)
  expect((await service.inspect('limits'))?.entryTruncated).toBeFalse()
})

test('publishes inspect and file reads through the authenticated Host SDK', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-skill-host-'))
  const home = join(root, 'data')
  const skill = join(home, 'skills', 'global', 'host-skill')
  await mkdir(skill, { recursive: true })
  await writeFile(join(skill, 'SKILL.md'), '---\nname: Host skill\n---\n\n# Host body\n')
  await writeFile(join(skill, 'reference.md'), 'Host reference\n')
  const kernel = await Kernel.create({ home, workspace: root, demo: true, secrets: new MemorySecrets() })
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  try {
    await client.pair(host.pairing.code, 'skill inspection test')
    const commands = createExtensionCommandClient(client)
    expect(await commands.execute('skill.list', {})).toContainEqual({
      id: 'host-skill',
      path: skill,
      scope: 'global',
    })
    await expect(commands.execute('skill.inspect', { id: 'host-skill' })).resolves.toMatchObject({
      id: 'host-skill',
      displayName: 'Host skill',
      body: '\n# Host body\n',
      files: [{ path: 'SKILL.md' }, { path: 'reference.md' }],
    })
    await expect(
      commands.execute('skill.file.read', { id: 'host-skill', path: 'reference.md' }),
    ).resolves.toMatchObject({
      id: 'host-skill',
      path: 'reference.md',
      text: 'Host reference\n',
      truncated: false,
    })
  } finally {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('revalidates a missing discovery root on a later read', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-skill-late-root-'))
  const global = join(root, 'global')
  const service = createSkillInspectionService(global)
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  expect(await service.list()).toEqual([])
  await mkdir(join(global, 'created-later'), { recursive: true })
  await writeFile(join(global, 'created-later', 'SKILL.md'), '# Created later\n')
  expect(await service.list()).toMatchObject([{ id: 'created-later', scope: 'global' }])
})

test('caps the file index and denies existing files outside the published index', async () => {
  const { global, service } = await fixture()
  const skill = join(global, 'capacity')
  await mkdir(skill)
  await writeFile(join(skill, 'SKILL.md'), '# Capacity\n')
  for (let index = 1; index < skillInspectionLimits.maxFiles; index++)
    await writeFile(join(skill, `note-${String(index).padStart(3, '0')}.md`), 'Readable note\n')
  const boundary = await service.inspect('capacity')
  expect(boundary?.files).toHaveLength(skillInspectionLimits.maxFiles)
  expect(boundary?.filesTruncated).toBe(false)
  await writeFile(join(skill, 'note-200.md'), 'Outside the published index\n')
  const over = await service.inspect('capacity')
  expect(over?.files).toHaveLength(skillInspectionLimits.maxFiles)
  expect(over?.filesTruncated).toBe(true)
  expect(over?.files.some((file) => file.path === 'note-200.md')).toBe(false)
  await expect(service.readFile('capacity', 'note-200.md')).rejects.toMatchObject({ code: 'FORBIDDEN' })
})

test('keeps malformed frontmatter as source and rejects junction escapes and invalid paths', async () => {
  const { global, service } = await fixture()
  const skill = join(global, 'source')
  const outside = join(global, 'outside')
  await mkdir(skill)
  await mkdir(outside)
  const malformed = '---\nname: [unterminated\n---\n# Original source\n'
  await writeFile(join(skill, 'SKILL.md'), malformed)
  await writeFile(join(outside, 'secret.md'), 'Must not be read through the other skill\n')
  await symlink(outside, join(skill, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  const detail = await service.inspect('source')
  expect(detail?.displayName).toBe('source')
  expect(detail?.body).toBe(malformed)
  expect(detail?.files.map((file) => file.path)).toEqual(['SKILL.md'])
  await expect(service.readFile('source', 'linked/secret.md')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  for (const path of ['SKILL.md:stream', 'bad\u0001.md', '/SKILL.md'])
    await expect(service.readFile('source', path)).rejects.toMatchObject({
      code: path.startsWith('/') ? 'INVALID_INPUT' : 'FORBIDDEN',
    })
})
