import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { compileForm, createForm, setField, type FormDescription } from '@hbar/schema-core'
import { HbarSchemaForm, type HbarSchemaFormLabels } from '@hbar/schema-react'
import { createHbarSchemaComponents } from '@hbar/app-react'
import { settingsDescriptionSchema } from '@hbar/contracts/commands/settings'
import { HBAR_SETTINGS_DESCRIPTION } from '@hbar/kernel'

const data = {
  type: 'object',
  additionalProperties: false,
  properties: {
    enabled: { type: 'boolean', default: true },
    hour: { type: 'integer', minimum: 0, maximum: 23, default: 3 },
    minute: { type: 'integer', minimum: 0, maximum: 59, default: 0 },
    timezone: { type: 'string', default: 'Asia/Shanghai' },
  },
}
const view: FormDescription = {
  id: 'clock',
  version: 1,
  fields: {
    enabled: { labelKey: 'i18n:enabled', component: 'Switch' },
    hour: {
      labelKey: 'i18n:time',
      component: 'TimePicker',
      time: { minuteField: 'minute', timezoneField: 'timezone' },
      visibleWhen: { all: [{ field: 'enabled', equals: true }] },
    },
    minute: { labelKey: 'i18n:minute', component: 'NumberField' },
    timezone: { labelKey: 'i18n:timezone', component: 'TextField' },
  },
}
const labels: HbarSchemaFormLabels = {
  resolve: (key) => `长中文说明 ${key}`,
  reset: '恢复已保存时间',
  loading: '加载',
  empty: '没有选项',
  unavailable: String,
  contentError: String,
  selectedInvalid: String,
  issue: (issue) => issue.code,
  option: (_field, value) => String(value),
  contentText: (text) => (text.kind === 'literal' ? text.text : text.key),
  pickResource: String,
  openOptions: String,
  removeOption: String,
  componentUnavailable: String,
}
test('time editor consumes numeric and timezone fields as one labelled native picker with grouped reset and issues', () => {
  const components = createHbarSchemaComponents()
  try {
    const schema = compileForm(data, view, components.schema)
    let state = createForm(schema, {})
    const render = (disabled = false) =>
      renderToStaticMarkup(
        <HbarSchemaForm
          schema={schema}
          state={state}
          components={components}
          labels={labels}
          disabled={disabled}
          onIntent={() => {}}
        />,
      )
    expect(render()).toContain('type="time"')
    expect(render()).toContain('value="03:00"')
    expect(render()).toContain('Asia/Shanghai')
    expect(render()).not.toContain('type="text"')
    expect(render()).not.toContain('data-field="minute"')
    state = setField(schema, state, 'minute', '45')
    expect(render()).toContain('value="03:45"')
    expect(render()).toContain(labels.reset)
    state = setField(schema, state, 'minute', '-')
    expect(render()).toContain('role="alert"')
    expect(render(true)).toContain('disabled=""')
    state = setField(schema, state, 'enabled', false)
    expect(render()).not.toContain('type="time"')
    expect(state.raw.minute).toBe('-')
    expect(state.draft.minute).toBe(45)
  } finally {
    components.dispose()
  }
})
test('time metadata rejects unknown parts, incompatible bounds, hidden editors and malformed wire ownership', () => {
  const components = createHbarSchemaComponents()
  try {
    for (const time of [
      { minuteField: 'missing', timezoneField: 'timezone' },
      { minuteField: 'hour', timezoneField: 'timezone' },
      { minuteField: 'minute', timezoneField: 'minute' },
    ])
      expect(() =>
        compileForm(
          data,
          { ...view, fields: { ...view.fields, hour: { ...view.fields.hour!, time } } },
          components.schema,
        ),
      ).toThrow()
    expect(() =>
      compileForm(
        { ...data, properties: { ...data.properties, minute: { ...data.properties.minute, maximum: 60 } } },
        view,
        components.schema,
      ),
    ).toThrow()
    expect(() =>
      compileForm(
        data,
        { ...view, fields: { ...view.fields, hour: { labelKey: 'i18n:time', component: 'TimePicker' } } },
        components.schema,
      ),
    ).toThrow()
  } finally {
    components.dispose()
  }
  expect(settingsDescriptionSchema.safeParse(HBAR_SETTINGS_DESCRIPTION).success).toBe(true)
  const malformed = {
    ...HBAR_SETTINGS_DESCRIPTION,
    fields: HBAR_SETTINGS_DESCRIPTION.fields.map((field) =>
      field.time ? { ...field, time: { ...field.time, minutePath: field.path } } : field,
    ),
  }
  expect(settingsDescriptionSchema.safeParse(malformed).success).toBe(false)
})
