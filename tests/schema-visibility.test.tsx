import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { compileForm, createForm, isFieldVisible, setField, type FormDescription } from '@hbar/schema-core'
import { HbarSchemaForm, type HbarSchemaFormLabels } from '@hbar/schema-react'
import { createHbarSchemaComponents } from '@hbar/app-react'
import { settingsDescriptionSchema } from '@hbar/contracts/commands/settings'
import { HBAR_SETTINGS_DESCRIPTION } from '@hbar/kernel'

const data = {
  type: 'object',
  additionalProperties: false,
  properties: {
    enabled: { type: 'boolean', default: false },
    kind: { type: 'string', enum: ['daily', 'weekly'], default: 'daily' },
    hour: { type: 'integer', minimum: 0, maximum: 23, default: 3 },
    days: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 }, uniqueItems: true, default: [0] },
  },
}
const description: FormDescription = {
  id: 'visibility',
  version: 1,
  fields: {
    enabled: { labelKey: 'i18n:enabled', component: 'Switch' },
    kind: {
      labelKey: 'i18n:kind',
      component: 'PopupSelect',
      visibleWhen: { all: [{ field: 'enabled', equals: true }] },
    },
    hour: {
      labelKey: 'i18n:hour',
      component: 'NumberField',
      visibleWhen: { all: [{ field: 'enabled', equals: true }] },
    },
    days: {
      labelKey: 'i18n:days',
      component: 'MultiSelect',
      visibleWhen: {
        all: [
          { field: 'enabled', equals: true },
          { field: 'kind', equals: 'weekly' },
        ],
      },
    },
  },
}
const labels: HbarSchemaFormLabels = {
  resolve: (key) => `长中文标签 ${key}`,
  reset: '恢复',
  loading: '加载',
  empty: '没有选项',
  unavailable: (code) => code,
  contentError: (code) => code,
  selectedInvalid: String,
  issue: (issue) => issue.code,
  option: (_field, value) => String(value),
  contentText: (text) => (text.kind === 'literal' ? text.text : text.key),
  pickResource: (kind) => kind,
  openOptions: (label) => label,
  removeOption: (label) => label,
  componentUnavailable: (id) => id,
}

test('conditional fields follow current draft, omit their whole row and preserve hidden values', () => {
  const components = createHbarSchemaComponents()
  try {
    const schema = compileForm(data, description, components.schema)
    let state = createForm(schema, {})
    const render = () =>
      renderToStaticMarkup(
        <HbarSchemaForm
          schema={schema}
          state={state}
          components={components}
          labels={labels}
          fieldNames={['enabled', 'hour', 'days']}
          renderFieldContext={(field) => <small>{field.name}</small>}
          onIntent={() => {}}
        />,
      )
    expect(render()).not.toContain('data-field="hour"')
    state = setField(schema, state, 'enabled', true)
    expect(render()).toContain('data-field="hour"')
    expect(render()).not.toContain('data-field="days"')
    state = setField(schema, state, 'hour', '18')
    state = setField(schema, state, 'kind', 'weekly')
    state = setField(schema, state, 'days', [1, 5])
    expect(render()).toContain('data-field="days"')
    state = setField(schema, state, 'enabled', false)
    expect(render()).not.toContain('data-field="days"')
    expect(state.draft).toMatchObject({ hour: 18, days: [1, 5] })
    state = setField(schema, state, 'enabled', true)
    expect(render()).toContain('value="18"')
    expect(Object.isFrozen(schema.fields.find((field) => field.name === 'days')?.visibleWhen?.all)).toBe(true)
    const dayField = schema.fields.find((field) => field.name === 'days')!
    expect(isFieldVisible(dayField, state.draft, { kind: 'invalid' })).toBe(false)
    expect(isFieldVisible(dayField, { enabled: true })).toBe(false)
  } finally {
    components.dispose()
  }
})

test('compilation rejects missing, mismatched, duplicate and cyclic visibility dependencies', () => {
  const components = createHbarSchemaComponents()
  try {
    for (const all of [
      [],
      [{ field: 'missing', equals: true }],
      [{ field: 'enabled', equals: 'true' }],
      [
        { field: 'enabled', equals: true },
        { field: 'enabled', equals: false },
      ],
      [{ field: 'hour', equals: 3 }],
      Array.from({ length: 17 }, () => ({ field: 'enabled', equals: true })),
    ])
      expect(() =>
        compileForm(
          data,
          {
            ...description,
            fields: {
              ...description.fields,
              hour: { labelKey: 'i18n:hour', component: 'NumberField', visibleWhen: { all } },
            },
          },
          components.schema,
        ),
      ).toThrow()
    expect(() =>
      compileForm(
        data,
        {
          ...description,
          fields: {
            ...description.fields,
            enabled: {
              labelKey: 'i18n:enabled',
              component: 'Switch',
              visibleWhen: { all: [{ field: 'hour', equals: 3 }] },
            },
          },
        },
        components.schema,
      ),
    ).toThrow('cycle')
  } finally {
    components.dispose()
  }
})

test('settings wire validates serializable conditions, dependency identities and cycles', () => {
  expect(settingsDescriptionSchema.safeParse(HBAR_SETTINGS_DESCRIPTION).success).toBe(true)
  const change = (name: string, all: unknown) => ({
    ...HBAR_SETTINGS_DESCRIPTION,
    fields: HBAR_SETTINGS_DESCRIPTION.fields.map((field) =>
      field.path[0]?.kind === 'field' && field.path[0].name === name ? { ...field, visibleWhen: { all } } : field,
    ),
  })
  for (const all of [
    [],
    [{ path: [{ kind: 'field', name: 'missing' }], equals: true }],
    [{ path: [{ kind: 'field', name: 'chatDatabase.scheduleEnabled' }], equals: 'true' }],
    [{ path: [{ kind: 'field', name: 'chatDatabase.scheduleHour' }], equals: 3 }],
  ])
    expect(settingsDescriptionSchema.safeParse(change('chatDatabase.scheduleHour', all)).success).toBe(false)
  expect(
    settingsDescriptionSchema.safeParse(
      change('chatDatabase.scheduleEnabled', [
        { path: [{ kind: 'field', name: 'chatDatabase.scheduleHour' }], equals: 3 },
      ]),
    ).success,
  ).toBe(false)
})
