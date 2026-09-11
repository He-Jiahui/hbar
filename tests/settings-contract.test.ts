import { expect, test } from 'bun:test'
import {
  jsonSchemaDescriptorSchema,
  settingDescriptorSchema,
  settingKey,
  settingsCatalogSchema,
  settingsContributionSchema,
} from '@hbar/contracts'

test('accepts a safe declaration-driven plugin settings contribution', () => {
  const contribution = settingsContributionSchema.parse({
    schemaVersion: 1,
    title: 'Git 管理',
    sections: [
      {
        id: 'limits',
        title: '限制',
        settings: [
          {
            id: 'timeout-ms',
            title: '超时时间',
            root: 'plugins',
            group: 'git',
            scopes: ['global', 'project', 'session'],
            schema: { type: 'integer', minimum: 1000, maximum: 120000 },
            default: 30000,
          },
        ],
      },
    ],
  })
  expect(contribution.sections[0]?.settings[0]?.restartPolicy).toBe('live')
})

test('rejects executable or unknown schema fields', () => {
  expect(() =>
    jsonSchemaDescriptorSchema.parse({
      type: 'string',
      component: './arbitrary-module.ts',
    }),
  ).toThrow()
})

test('rejects setting descriptors without a writable scope', () => {
  expect(() =>
    settingDescriptorSchema.parse({
      id: 'appearance.theme',
      title: '主题',
      root: 'appearance',
      schema: { type: 'string', enum: ['dark', 'light'] },
      scopes: [],
    }),
  ).toThrow()
})

test('validates catalog structure and namespaces plugin settings', () => {
  const catalog = settingsCatalogSchema.parse({
    schemaVersion: 1,
    navigation: { schemaVersion: 1, roots: [] },
    settings: [],
  })
  expect(catalog.schemaVersion).toBe(1)
  expect(settingKey('git.codex', 'timeout-ms')).toBe('plugin.git.codex.timeout-ms')
  expect(settingKey(undefined, 'appearance.theme')).toBe('appearance.theme')
})
