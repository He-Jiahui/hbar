import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin } from '@hbar/plugin-sdk'
import { validateSettingValue } from '../packages/kernel/src/settings.ts'

const resources: { root: string; kernel: Kernel }[] = []

afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(process.env.TEMP ?? '.', 'hbar-settings-'))
  const kernel = await Kernel.create({ home: join(root, 'data'), secrets: new MemorySecrets() })
  resources.push({ root, kernel })
  return { root, kernel }
}

test('builds a catalog from built-in and plugin descriptors', async () => {
  const { kernel } = await fixture()
  kernel.plugins.add(
    definePlugin({
      manifest: {
        id: 'test.settings',
        name: 'Settings fixture',
        version: '1.0.0',
        apiVersion: '^1.0.0',
        scope: 'workspace',
        description: 'Settings fixture',
        permissions: [],
        contributes: {
          commands: [],
          panels: [],
          renderers: [],
          settings: {
            schemaVersion: 1,
            sections: [
              {
                id: 'general',
                title: 'General',
                settings: [
                  {
                    id: 'message',
                    title: 'Message',
                    root: 'plugins',
                    scopes: ['global', 'project'],
                    schema: { type: 'string', minLength: 1 },
                  },
                ],
              },
            ],
          },
        },
      },
      configSchema: z.object({ message: z.string().default('hello') }),
      apply() {},
    }),
  )
  const catalog = await kernel.settingsCatalog()
  expect(catalog.settings.map((setting) => setting.id)).toContain('plugin.test.settings.message')
  expect(catalog.navigation.roots.find((root) => root.id === 'plugins')?.groups[0]?.title).toBe('Settings fixture')
  const rootIds = catalog.navigation.roots.map((root) => root.id)
  for (const rootId of ['appearance', 'automation', 'devices', 'models', 'paths', 'permissions', 'plugins', 'skills'])
    expect(rootIds).toContain(rootId)
})

test('exposes the global budget default and task notification switches', async () => {
  const { kernel } = await fixture()
  const catalog = await kernel.settingsCatalog()
  expect(catalog.navigation.roots.find((root) => root.id === 'automation')?.title).toBe('任务与通知')
  expect(catalog.settings.filter((setting) => setting.root === 'automation').map((setting) => setting.id)).toEqual([
    'session.defaultBudgetTokens',
    'notifications.taskCompleted',
    'notifications.userInteraction',
    'notifications.retryFailed',
  ])
  const snapshot = await kernel.settingsSnapshot('global')
  expect(snapshot.values['session.defaultBudgetTokens']?.effectiveValue).toBe(10_000)
  expect(snapshot.values['notifications.taskCompleted']?.effectiveValue).toBe(true)
})

test('resolves global, project, and session overrides with source metadata', async () => {
  const { root, kernel } = await fixture()
  const workspace = await kernel.createWorkspace(root)
  const session = await kernel.createSession(workspace.id)

  const global = await kernel.setSetting('global', undefined, 'appearance.theme', 'light')
  expect(global.values['appearance.theme']?.effectiveValue).toBe('light')
  expect(global.values['appearance.theme']?.source).toBe('global')

  const project = await kernel.setSetting('project', workspace.id, 'appearance.theme', 'white')
  expect(project.values['appearance.theme']?.effectiveValue).toBe('white')
  expect(project.values['appearance.theme']?.source).toBe('project')

  const sessionSnapshot = await kernel.setSetting('session', session.id, 'appearance.theme', 'dark')
  expect(sessionSnapshot.values['appearance.theme']?.effectiveValue).toBe('dark')
  expect(sessionSnapshot.values['appearance.theme']?.source).toBe('session')
  expect(sessionSnapshot.values['appearance.theme']?.overridden).toBe(false)

  const reset = await kernel.resetSetting('session', session.id, 'appearance.theme')
  expect(reset.values['appearance.theme']?.effectiveValue).toBe('white')
  expect(reset.values['appearance.theme']?.source).toBe('project')
  expect(reset.values['appearance.theme']?.overridden).toBe(true)
})

test('rejects values outside the descriptor and searches complete setting paths', async () => {
  const { kernel } = await fixture()
  let failure: unknown
  try {
    await kernel.setSetting('global', undefined, 'appearance.theme', 'blue')
  } catch (error) {
    failure = error
  }
  expect(failure instanceof Error ? failure.message : String(failure)).toContain('allowed options')
  const results = await kernel.searchSettings('permission')
  expect(results.some((entry) => entry.path.includes('权限 / 工具权限 / 默认权限模式'))).toBeTrue()
})

test('validates nested schema values, unions, and collection bounds', () => {
  const schema = {
    type: 'object' as const,
    required: ['mode', 'rules'],
    properties: {
      mode: { oneOf: [{ type: 'string' as const, enum: ['safe'] }, { type: 'integer' as const, minimum: 1 }] },
      rules: {
        type: 'array' as const,
        minItems: 1,
        maxItems: 2,
        items: {
          type: 'object' as const,
          required: ['name'],
          properties: { name: { type: 'string' as const, minLength: 2 } },
        },
      },
    },
  }
  validateSettingValue(schema, { mode: 'safe', rules: [{ name: 'io' }] })
  expect(() => validateSettingValue(schema, { mode: false, rules: [{ name: 'io' }] })).toThrow('does not match any allowed schema')
  expect(() => validateSettingValue(schema, { mode: 'safe', rules: [] })).toThrow('too few items')
  expect(() => validateSettingValue(schema, { mode: 'safe', rules: [{ name: 'x' }] })).toThrow('too short')
  expect(() => validateSettingValue(schema, { mode: 'safe' })).toThrow('rules is required')
})
