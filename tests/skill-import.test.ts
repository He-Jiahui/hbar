import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSkillImportService, convertSkillMarkdown, type SkillImportService } from '@hbar/kernel/skill-import'
import type { SkillImportJob } from '@hbar/contracts/commands/skill-import'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { createPathLayout } from '@hbar/storage'
import { HbarClient, createExtensionCommandClient } from '@hbar/client'
import { startServer } from '../apps/host/src/server'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-skill-import-'))
  const source = join(root, 'claude-skills'),
    destination = join(root, 'hbar-skills'),
    journalRoot = join(root, 'configuration', 'imports')
  await mkdir(source)
  await mkdir(destination)
  cleanups.push(async () => {
    const path = await realpath(root)
    if (
      dirname(path).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
      !basename(path).startsWith('hbar-skill-import-')
    )
      throw new Error('Invalid skill test root')
    await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })
  const service = createSkillImportService({ destination, journalRoot, sources: { claude: [source], codex: [source] } })
  cleanups.push(() => service.dispose())
  return { root, source, destination, journalRoot, service }
}
async function skill(
  source: string,
  name: string,
  text = '---\nname: "例子 😀"\ndescription: "测试技能"\nallowed-tools: Bash\n---\n\nUse Claude Code and CLAUDE.md.\n\n```sh\nclaude --version\n```\n',
) {
  const root = join(source, name)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'SKILL.md'), text)
  return root
}
async function settled(service: SkillImportService, id: string, owner = 'test-device'): Promise<SkillImportJob> {
  for (let i = 0; i < 500; i++) {
    const job = await service.get(id, owner)
    if (job && job.status !== 'running') return job
    await Bun.sleep(10)
  }
  throw new Error('Import did not settle within its test deadline')
}
test('Claude and Codex conversion preserves source, scripts, assets and code fences while adapting Markdown', async () => {
  const { source, destination, service } = await fixture()
  const original = await skill(source, 'example')
  await mkdir(join(original, 'scripts'))
  await writeFile(join(original, 'scripts', 'run.sh'), '#!/bin/sh\nclaude --version\n')
  const binary = new Uint8Array([0, 255, 42, 4])
  await writeFile(join(original, 'asset.bin'), binary)
  await writeFile(join(original, 'CLAUDE.md'), 'Claude Code guide')
  const preview = await service.preview({ source: 'claude' })
  expect(preview.candidates[0]).toMatchObject({
    id: 'example',
    name: '例子 😀',
    status: 'ready',
    warnings: ['platform_metadata'],
    files: 4,
  })
  const input = { request: preview.request, expectedRevision: preview.revision, operationId: 'convert-once' }
  expect((await service.start(input, 'test-device')).status).toBe('running')
  const job = await settled(service, input.operationId)
  expect(job.status).toBe('succeeded')
  expect(job.items).toMatchObject([{ id: 'example', status: 'imported' }])
  const text = await readFile(join(destination, 'example', 'SKILL.md'), 'utf8')
  expect(text).toContain('name: "例子 😀"')
  expect(text).toContain('Use hbar and AGENTS.md.')
  expect(text).toContain('claude --version')
  expect(text).not.toContain('allowed-tools:')
  expect(await readFile(join(destination, 'example', 'AGENTS.md'), 'utf8')).toBe('hbar guide')
  expect(await readFile(join(destination, 'example', 'scripts', 'run.sh'), 'utf8')).toBe(
    '#!/bin/sh\nclaude --version\n',
  )
  expect(new Uint8Array(await readFile(join(destination, 'example', 'asset.bin')))).toEqual(binary)
  expect(await readFile(join(original, 'CLAUDE.md'), 'utf8')).toBe('Claude Code guide')
  expect((await service.start(input, 'test-device')).status).toBe('succeeded')
  await expect(service.start({ ...input, expectedRevision: 'changed' }, 'test-device')).rejects.toMatchObject({
    code: 'IDEMPOTENCY_CONFLICT',
  })
  expect((await service.latest('test-device'))?.operationId).toBe(input.operationId)
  const codex = await skill(
    source,
    'codex-example',
    '---\nname: codex\ndescription: Example\n---\n\nUse Codex CLI. Keep gpt-5-codex and CodexHelper unchanged.\n',
  )
  const next = await service.preview({ source: 'codex', sourceRoot: source })
  await service.start({ request: next.request, expectedRevision: next.revision, operationId: 'codex' }, 'test-device')
  expect((await settled(service, 'codex')).status).toBe('succeeded')
  expect(await readFile(join(destination, basename(codex), 'SKILL.md'), 'utf8')).toContain(
    'Use hbar. Keep gpt-5-codex and CodexHelper unchanged.',
  )
})
test('same names, invalid frontmatter and document collisions are skipped without overwriting', async () => {
  const { source, destination, service } = await fixture()
  await skill(source, 'existing')
  await mkdir(join(destination, 'existing'))
  await writeFile(join(destination, 'existing', 'SKILL.md'), 'user-owned existing skill')
  const collision = await skill(source, 'collision')
  await writeFile(join(collision, 'CLAUDE.md'), 'old')
  await writeFile(join(collision, 'AGENTS.md'), 'existing')
  await skill(source, 'invalid', '---\nname: [broken\n---\nbody')
  await skill(source, 'ready')
  const preview = await service.preview({ source: 'claude' })
  expect(preview.candidates.find((item) => item.id === 'existing')?.status).toBe('existing')
  expect(preview.candidates.find((item) => item.id === 'collision')?.warnings).toContain('document_collision')
  expect(preview.candidates.find((item) => item.id === 'invalid')?.warnings).toContain('invalid_entry')
  await service.start(
    { request: preview.request, expectedRevision: preview.revision, operationId: 'safe-copy' },
    'test-device',
  )
  const result = await settled(service, 'safe-copy')
  expect(result.status).toBe('succeeded')
  expect(result.items.filter((item) => item.status === 'imported')).toHaveLength(1)
  expect(await readFile(join(destination, 'existing', 'SKILL.md'), 'utf8')).toBe('user-owned existing skill')
})
test('changed sources fail closed and request cancellation prevents a late start', async () => {
  const { source, destination, service } = await fixture()
  const root = await skill(source, 'changing')
  const preview = await service.preview({ source: 'claude' })
  await writeFile(join(root, 'SKILL.md'), '# Changed source text')
  await service.start(
    { request: preview.request, expectedRevision: preview.revision, operationId: 'stale' },
    'test-device',
  )
  expect(await settled(service, 'stale')).toMatchObject({ status: 'failed', error: 'SKILL_SOURCE_CHANGED' })
  expect(await Bun.file(join(destination, 'changing', 'SKILL.md')).exists()).toBe(false)
  const next = await service.preview({ source: 'claude' })
  expect(await service.cancel('late-request', 'test-device')).toBeNull()
  expect(
    await service.start(
      { request: next.request, expectedRevision: next.revision, operationId: 'late-request' },
      'test-device',
    ),
  ).toMatchObject({ status: 'cancelled' })
  expect(await Bun.file(join(destination, 'changing', 'SKILL.md')).exists()).toBe(false)
})
test('a persisted running intent resumes after service restart and remains device-owned', async () => {
  const { source, destination, journalRoot, service } = await fixture()
  await skill(source, 'restart')
  const preview = await service.preview({ source: 'claude' })
  await service.start(
    { request: preview.request, expectedRevision: preview.revision, operationId: 'recover' },
    'test-device',
  )
  await service.dispose()
  const resumed = createSkillImportService({ destination, journalRoot, sources: { claude: [source] } })
  cleanups.push(() => resumed.dispose())
  expect((await settled(resumed, 'recover')).status).toBe('succeeded')
  await expect(resumed.get('recover', 'another-device')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  expect((await resumed.latest('test-device'))?.items[0]?.status).toBe('imported')
})
test('discovery has a bounded preview and rejects overlapping or relative source roots', async () => {
  const { source, destination, service } = await fixture()
  for (let i = 0; i < 129; i++) await skill(source, `skill-${String(i).padStart(3, '0')}`, '# Simple skill')
  const preview = await service.preview({ source: 'claude' })
  expect(preview.candidates).toHaveLength(128)
  expect(preview.truncated).toBe(true)
  await expect(service.preview({ source: 'claude', sourceRoot: 'relative' })).rejects.toMatchObject({
    code: 'SKILL_SOURCE_INVALID',
  })
  await expect(service.preview({ source: 'claude', sourceRoot: destination })).rejects.toMatchObject({
    code: 'SKILL_SOURCE_INVALID',
  })
})
test('Markdown adapts platform instructions without changing identifiers or fenced programs', () => {
  expect(convertSkillMarkdown('Use ~/.codex/skills.', 'D:/cash$&/skills')).toBe('Use D:/cash$&/skills.')
  expect(
    convertSkillMarkdown(
      'Codex CLI reads CLAUDE.md.\n```ts\nconst Codex = "CLAUDE.md"\n```\nUse ~/.codex/skills.\n',
      'D:/global-skills',
    ),
  ).toBe('hbar reads AGENTS.md.\n```ts\nconst Codex = "CLAUDE.md"\n```\nUse D:/global-skills.\n')
})
test('real Host import updates skill discovery and inspection with no model request', async () => {
  const { root, source, destination } = await fixture()
  await skill(source, 'host-import')
  const layout = createPathLayout(
    join(root, 'host-data'),
    join(root, 'host-cache'),
    join(root, 'bootstrap', 'paths.json'),
    { skillsRoot: destination },
  )
  const kernel = await Kernel.create({ layout, workspace: root, demo: true, secrets: new MemorySecrets() })
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
  })
  await client.pair(host.pairing.code, 'skill import integration')
  const commands = createExtensionCommandClient(client)
  const preview = await commands.execute('skill.import.preview', { source: 'claude', sourceRoot: source })
  const accepted = await commands.execute(
    'skill.import.start',
    { request: preview.request, expectedRevision: preview.revision, operationId: 'host-copy' },
    { idempotencyKey: 'host-copy' },
  )
  expect(accepted.operationId).toBe('host-copy')
  for (let i = 0; i < 100; i++) {
    const job = await commands.execute('skill.import.get', { operationId: 'host-copy' })
    if (job?.status !== 'running') {
      expect(job?.status).toBe('succeeded')
      break
    }
    await Bun.sleep(10)
  }
  expect((await commands.execute('skill.list', {})).some((item) => item.id === 'host-import')).toBe(true)
  const inspected = await commands.execute('skill.inspect', { id: 'host-import' })
  expect(inspected).toMatchObject({
    displayName: '例子 😀',
    description: '测试技能',
  })
  expect(inspected?.body).toContain('Use hbar')
  expect(kernel.active.size).toBe(0)
  await expect(client.call('plugin.disableTree', { id: 'goal.codex' })).rejects.toMatchObject({
    code: 'REQUIRED_PLUGIN',
  })
})
