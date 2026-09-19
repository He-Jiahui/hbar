import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createHbarSchemaComponents } from '@hbar/app-react'
import { compileForm, createForm, type FieldIssue, type FieldValue } from '@hbar/schema-core'
import { HbarSchemaForm, type HbarSchemaFormLabels } from '@hbar/schema-react'

const labels: HbarSchemaFormLabels = {
  resolve: (key) => key.replace('i18n:', ''),
  reset: 'Restore',
  loading: 'Loading',
  empty: 'Empty',
  unavailable: (code) => `Unavailable ${code}`,
  contentError: (code) => `Error ${code}`,
  selectedInvalid: (value) => `Invalid ${String(value)}`,
  issue: (issue: FieldIssue) => issue.code,
  option: (_field, value: FieldValue) => String(value),
  contentText: (text) => (text.kind === 'literal' ? text.text : text.key),
  pickResource: (kind) => `Choose ${kind}`,
  openOptions: (label) => `Open ${label}`,
  removeOption: (label) => `Remove ${label}`,
  componentUnavailable: (id) => `Missing ${id}`,
}

test('hbar schema adapter renders the shared visual controls for scalar, secret, boolean and multiple fields', () => {
  const components = createHbarSchemaComponents()
  const schema = compileForm(
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        secret: { type: 'string' },
        enabled: { type: 'boolean' },
        mode: { type: 'string', enum: ['fast', 'safe'] },
        tags: {
          type: 'array',
          items: { type: 'string', enum: ['text', 'image'] },
          uniqueItems: true,
          maxItems: 2,
        },
      },
      required: ['name', 'enabled', 'mode', 'tags'],
    },
    {
      id: 'hbar.visual.settings',
      version: 1,
      fields: {
        name: { labelKey: 'i18n:Name', component: 'TextField' },
        secret: { labelKey: 'i18n:Secret', component: 'SecretField' },
        enabled: { labelKey: 'i18n:Enabled', component: 'CheckBox' },
        mode: { labelKey: 'i18n:Mode', component: 'ComboBox' },
        tags: { labelKey: 'i18n:Tags', component: 'MultiSelect' },
      },
    },
    components.schema,
  )
  const html = renderToStaticMarkup(
    <HbarSchemaForm
      schema={schema}
      state={createForm(schema, {
        name: 'Workbench',
        secret: 'never-render-this-value',
        enabled: true,
        mode: 'safe',
        tags: ['text'],
      })}
      components={components}
      labels={labels}
      onIntent={() => undefined}
    />,
  )
  expect(html).toContain('hbar-app-ui-control')
  expect(html).toContain('hbar-app-ui-combobox')
  expect(html).toContain('hbar-app-ui-multi-select')
  expect(html).toContain('Remove text')
  expect(html).not.toContain('never-render-this-value')
  components.dispose()
})
