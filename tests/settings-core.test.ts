import { expect, test } from 'bun:test'
import { encodePath, type SchemaPath } from '@hbar/schema-core'
import { resolveSettings, SettingsError, type SettingDefinition, type SettingsLayer } from '@hbar/settings-core'

const path = (name: string): SchemaPath => [{ kind: 'field', name }]
const modelPath = encodePath(path('model'))
const tagsPath = encodePath(path('tags'))
const providersPath = encodePath(path('providers'))
const secretPath = encodePath(path('apiKey'))
const definitions: SettingDefinition[] = [
  {
    path: path('model'),
    allowedLayers: ['global', 'workspace', 'session'],
    merge: 'object',
    schema: {
      kind: 'object',
      properties: {
        provider: { kind: 'string' },
        name: { kind: 'string', nullable: true },
        tuning: {
          kind: 'object',
          properties: { effort: { kind: 'string', enum: ['low', 'high'] }, temperature: { kind: 'number' } },
          required: ['effort', 'temperature'],
        },
      },
      required: ['provider', 'name', 'tuning'],
    },
    defaultValue: { provider: 'local', name: null, tuning: { effort: 'low', temperature: 0 } },
  },
  {
    path: path('tags'),
    allowedLayers: ['global', 'workspace'],
    schema: { kind: 'array', items: { kind: 'string' } },
    defaultValue: ['default'],
  },
  {
    path: path('providers'),
    allowedLayers: ['global', 'workspace', 'session'],
    merge: 'keyed',
    keyField: 'id',
    itemSchema: {
      kind: 'object',
      properties: { id: { kind: 'string' }, label: { kind: 'string' }, enabled: { kind: 'boolean' } },
      required: ['id', 'label', 'enabled'],
    },
    defaultValue: [
      { id: 'local', label: 'Local', enabled: true },
      { id: 'cloud', label: 'Cloud', enabled: true },
    ],
  },
  {
    path: path('apiKey'),
    allowedLayers: ['global'],
    sensitive: true,
    schema: {
      kind: 'object',
      nullable: true,
      properties: { secretRef: { kind: 'string' } },
      required: ['secretRef'],
    },
    defaultValue: null,
  },
]

function layers(sessionValues: Record<string, unknown> = {}): SettingsLayer[] {
  return [
    {
      id: 'g',
      kind: 'global',
      revision: 2,
      values: {
        [modelPath]: { provider: 'openai', tuning: { effort: 'high' } },
        [tagsPath]: [],
        [providersPath]: { entries: [{ key: 'cloud', value: { label: 'Hosted' } }] },
        [secretPath]: { secretRef: 'credential://openai' },
      },
    },
    {
      id: 'w',
      kind: 'workspace',
      revision: 4,
      values: {
        [modelPath]: { name: 'gpt' },
        [providersPath]: {
          entries: [
            { key: 'local', delete: true },
            { key: 'custom', value: { label: 'Custom', enabled: false } },
          ],
          order: ['custom', 'cloud'],
        },
      },
    },
    { id: 's', kind: 'session', revision: 7, values: sessionValues },
  ]
}

test('layer resolution distinguishes inheritance, explicit null, empty arrays and mixed object sources', () => {
  const resolution = resolveSettings(definitions, layers({ [modelPath]: { name: null } }))
  expect(resolution.reports[modelPath]).toMatchObject({
    localPresence: true,
    localValue: { name: null },
    effectiveValue: { provider: 'openai', name: null, tuning: { effort: 'high', temperature: 0 } },
    sourceLayer: 'mixed',
    sourceRevision: null,
    inherited: false,
  })
  expect(resolution.reports[modelPath]?.provenance).toMatchObject({
    '$.provider': { layerId: 'g', revision: 2 },
    '$.name': { layerId: 's', revision: 7 },
    '$.tuning.effort': { layerId: 'g', revision: 2 },
    '$.tuning.temperature': { layerId: 'default', revision: null },
  })
  expect(resolution.reports[tagsPath]).toMatchObject({
    localPresence: false,
    effectiveValue: [],
    sourceLayer: 'g',
    sourceRevision: 2,
    inherited: true,
  })
  expect(Object.isFrozen(resolution.reports[modelPath]?.effectiveValue)).toBe(true)
  expect(resolution.reports[secretPath]?.effectiveValue).toEqual({ secretRef: 'credential://openai' })
})

test('keyed lists merge by stable ID with tombstones and an independent order', () => {
  const report = resolveSettings(definitions, layers()).reports[providersPath]
  expect(report?.effectiveValue).toEqual([
    { id: 'custom', label: 'Custom', enabled: false },
    { id: 'cloud', label: 'Hosted', enabled: true },
  ])
  expect(report?.provenance).toMatchObject({
    '$.items.custom.label': { layerId: 'w', revision: 4 },
    '$.items.custom.enabled': { layerId: 'w', revision: 4 },
    '$.items.cloud.label': { layerId: 'g', revision: 2 },
    '$.items.cloud.enabled': { layerId: 'default', revision: null },
    '$.order': { layerId: 'w', revision: 4 },
  })
})

test('unset is absence while invalid layers, nulls, fields, keys and order fail explicitly', () => {
  expect(resolveSettings(definitions, layers()).reports[modelPath]).toMatchObject({
    localPresence: false,
    inherited: true,
  })
  const invalid: [Record<string, unknown>, string][] = [
    [{ [tagsPath]: ['ok'], [modelPath]: { missing: true } }, 'UNKNOWN_FIELD'],
    [
      { [providersPath]: { entries: [{ key: 'x', value: { id: 'different', label: 'X', enabled: true } }] } },
      'INVALID_VALUE',
    ],
    [{ [providersPath]: { entries: [], order: ['missing'] } }, 'INVALID_VALUE'],
  ]
  for (const [values, code] of invalid) {
    try {
      resolveSettings(definitions, layers(values))
      throw new Error('Expected settings failure')
    } catch (error) {
      expect(error).toBeInstanceOf(SettingsError)
      expect((error as SettingsError).code).toBe(code)
    }
  }
  try {
    resolveSettings(definitions, [{ id: 'g', kind: 'global', revision: 1, values: { [tagsPath]: null } }])
    throw new Error('Expected null validation failure')
  } catch (error) {
    expect(error).toBeInstanceOf(SettingsError)
    expect((error as SettingsError).code).toBe('INVALID_VALUE')
  }
  expect(() =>
    resolveSettings(definitions, [
      ...layers().slice(0, 2),
      { id: 's', kind: 'session', revision: 1, values: { [tagsPath]: [] } },
    ]),
  ).toThrow('cannot be overridden')
  expect(() =>
    resolveSettings(definitions, [{ id: 'g', kind: 'global', revision: 1, values: { 'f:unknown': 1 } }]),
  ).toThrow('Unknown setting path')
})

test('settings-core bundles without Host, React, Zustand, commands, contracts or database dependencies', async () => {
  const output = await Bun.build({ entrypoints: ['packages/settings-core/src/index.ts'], target: 'browser' })
  expect(output.success).toBe(true)
  const text = await output.outputs[0]!.text()
  for (const forbidden of ['@hbar/kernel', '@hbar/contracts', '@hbar/commands', 'react', 'zustand', 'bun:sqlite'])
    expect(text).not.toContain(forbidden)
})
