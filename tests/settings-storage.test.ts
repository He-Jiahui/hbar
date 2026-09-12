import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'

const resources: { root: string; kernel: Kernel }[] = []

afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('stores layered settings atomically and rejects stale revisions', async () => {
  const root = await mkdtemp(join(process.env.TEMP ?? '.', 'hbar-settings-'))
  const kernel = await Kernel.create({ home: join(root, 'data'), secrets: new MemorySecrets() })
  resources.push({ root, kernel })
  const storage = kernel.storage

  const empty = await storage.call('getSettings', 'global')
  expect(empty.values).toEqual({})
  const saved = await storage.call('setSettings', 'global', undefined, { 'appearance.theme': 'dark' }, empty.revision)
  expect(saved.values['appearance.theme']).toBe('dark')
  expect((await storage.call('getSettings', 'global')).revision).toBe(saved.revision)
  let conflict: unknown
  try {
    await storage.call('setSettings', 'global', undefined, { 'appearance.theme': 'light' }, empty.revision)
  } catch (error) {
    conflict = error
  }
  expect(conflict instanceof Error ? conflict.message : String(conflict)).toContain('Settings changed since they were read')

  const workspace = await kernel.createWorkspace(root)
  const project = await storage.call('setSettings', 'project', workspace.id, { 'appearance.theme': 'light' })
  const reset = await storage.call('deleteSetting', 'project', workspace.id, 'appearance.theme', project.revision)
  expect(reset.values).toEqual({})

  const file = await readFile(join(root, 'data', 'settings', 'settings.json'), 'utf8')
  expect(file).toContain('appearance.theme')
})

test('rejects unsafe project and session target ids', async () => {
  const root = await mkdtemp(join(process.env.TEMP ?? '.', 'hbar-settings-'))
  const kernel = await Kernel.create({ home: join(root, 'data'), secrets: new MemorySecrets() })
  resources.push({ root, kernel })
  for (const [scope, targetId] of [
    ['project', '../escape'],
    ['session', 'bad/id'],
  ] as const) {
    let failure: unknown
    try {
      await kernel.storage.call('getSettings', scope, targetId)
    } catch (error) {
      failure = error
    }
    expect(failure instanceof Error ? failure.message : String(failure)).toContain('safe target id')
  }
})

test('keeps plugin state isolated for the same id in different projects', async () => {
  const root = await mkdtemp(join(process.env.TEMP ?? '.', 'hbar-settings-'))
  const kernel = await Kernel.create({ home: join(root, 'data'), secrets: new MemorySecrets() })
  resources.push({ root, kernel })
  const storage = kernel.storage
  await storage.call('setPlugin', 'shared.plugin', true, { project: 'one' }, undefined, 'project-one')
  await storage.call('setPlugin', 'shared.plugin', false, { project: 'two' }, undefined, 'project-two')
  await storage.call('setPlugin', 'shared.plugin', true, { global: true })
  const states = await storage.call('plugins')
  expect(states.filter((entry) => entry.id === 'shared.plugin')).toHaveLength(3)
  expect(states.find((entry) => entry.projectId === 'project-one')?.enabled).toBe(true)
  expect(states.find((entry) => entry.projectId === 'project-two')?.enabled).toBe(false)
  expect(states.find((entry) => !entry.projectId)?.config).toEqual({ global: true })
})
