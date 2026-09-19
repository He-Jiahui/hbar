import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  compileForm,
  createForm,
  encodeResourceReference,
  setField,
  type FieldIssue,
  type FieldValue,
} from '@hbar/schema-core'
import {
  HbarSchemaForm,
  createSchemaComponentRegistry,
  createSchemaEditorRegistry,
  registerStandardSchemaComponents,
  type HbarSchemaFormLabels,
} from '@hbar/schema-react'

const labels: HbarSchemaFormLabels = {
  resolve: (key) => ({ 'i18n:name': 'Display name', 'i18n:count': 'Request limit', 'i18n:mode': 'Mode' })[key] ?? key,
  help: (field) => `Help for ${field.name}`,
  reset: 'Use saved value',
  loading: 'Loading choices',
  empty: 'No choices',
  unavailable: (code) => `Unavailable: ${code}`,
  contentError: (code) => `Content error: ${code}`,
  selectedInvalid: (value) => `Unavailable selection: ${String(value)}`,
  issue: (issue: FieldIssue) => `${issue.field}: ${issue.code}`,
  option: (_field, value: FieldValue) => `Option ${String(value)}`,
  contentText: (text) => (text.kind === 'literal' ? text.text : `Translated ${text.key}`),
  pickResource: (kind) => (kind === 'file' ? 'Choose file' : 'Choose directory'),
  componentUnavailable: (id) => `Missing component: ${id}`,
}

function fixture() {
  const components = createSchemaComponentRegistry()
  registerStandardSchemaComponents(components)
  const schema = compileForm(
    {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'count', 'mode'],
      properties: {
        name: { type: 'string', minLength: 1 },
        count: { type: 'integer', minimum: 1, maximum: 100 },
        mode: { type: 'string' },
      },
    },
    {
      id: 'test.settings@1',
      version: 1,
      fields: {
        name: { labelKey: 'i18n:name', component: 'TextField' },
        count: { labelKey: 'i18n:count', component: 'NumberField' },
        mode: { labelKey: 'i18n:mode', component: 'ComboBox' },
      },
    },
    components.schema,
  )
  return { components, schema }
}

test('schema React registry binds serializable capabilities to schema-core and unloads exact registrations', () => {
  const components = createSchemaComponentRegistry()
  const dispose = components.register(
    'CustomText',
    {
      version: 2,
      fieldTypes: ['string'],
      multiple: false,
      contentKinds: ['options'],
      resourceKinds: [],
      interaction: 'dialog',
    },
    () => <input readOnly />,
  )
  expect(components.schema.supports('CustomText', 'string')).toBe(true)
  expect(components.list()).toEqual([
    {
      id: 'CustomText',
      descriptor: {
        version: 2,
        fieldTypes: ['string'],
        multiple: false,
        contentKinds: ['options'],
        resourceKinds: [],
        interaction: 'dialog',
      },
    },
  ])
  expect(() =>
    components.register(
      'CustomText',
      {
        version: 1,
        fieldTypes: ['string'],
        multiple: false,
        contentKinds: [],
        resourceKinds: [],
        interaction: 'inline',
      },
      () => null,
    ),
  ).toThrow('unique')
  expect(() =>
    components.register(
      'Multiple',
      {
        version: 1,
        fieldTypes: ['string'],
        multiple: true,
        contentKinds: [],
        resourceKinds: [],
        interaction: 'inline',
      },
      () => null,
    ),
  ).toThrow('unsupported')
  dispose()
  expect(components.resolve('CustomText')).toBeUndefined()
  expect(components.schema.supports('CustomText', 'string')).toBe(false)
  registerStandardSchemaComponents(components)
  components.dispose()
  expect(components.schema.supports('TextField', 'string')).toBe(false)
})

test('schema form renders host-owned copy, raw numeric input and dynamic option states without business state', () => {
  const { components, schema } = fixture()
  let state = createForm(schema, { name: 'Ada', count: 8, mode: 'balanced' })
  state = setField(schema, state, 'count', '-')
  state = setField(schema, state, 'mode', 'retired')
  const html = renderToStaticMarkup(
    <HbarSchemaForm
      schema={schema}
      state={state}
      components={components}
      labels={labels}
      content={{
        mode: {
          status: 'ready',
          report: {
            kind: 'options',
            status: 'ready',
            dependencyFingerprint: 'fixture',
            capabilityRevision: '1',
            options: [{ value: 'fast', label: { kind: 'literal', text: 'Fast mode' }, disabled: false }],
          },
        },
      }}
      fieldNames={['count', 'mode']}
      renderFieldContext={(field) => <small className="hbar-schema-form-context">Source for {field.name}</small>}
      renderFieldActions={(field) => <button className="hbar-schema-form-actions">Action for {field.name}</button>}
      onIntent={() => undefined}
    />,
  )
  expect(html).not.toContain('Display name')
  expect(html).toContain('value="-"')
  expect(html).toContain('count: invalid')
  expect(html).toContain('Unavailable selection: retired')
  expect(html).toContain('Fast mode')
  expect(html).toContain('Use saved value')
  expect(html).toContain('Source for mode')
  expect(html).toContain('Action for count')
  expect(html).not.toContain('settings.get')
})

test('standard resource renderers expose host-labelled command intents for declared picker kinds', () => {
  const components = createSchemaComponentRegistry()
  registerStandardSchemaComponents(components)
  const schema = compileForm(
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        source: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
        output: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
      },
    },
    {
      id: 'resource.form',
      version: 1,
      fields: {
        source: {
          labelKey: 'i18n:name',
          component: 'FilePicker',
          resource: { kind: 'file', location: 'client-local' },
        },
        output: {
          labelKey: 'i18n:mode',
          component: 'DirectoryPicker',
          resource: { kind: 'directory', location: 'workspace' },
        },
      },
    },
    components.schema,
  )
  const html = renderToStaticMarkup(
    <HbarSchemaForm
      schema={schema}
      state={createForm(schema, {
        source: encodeResourceReference({
          kind: 'artifact',
          resourceKind: 'file',
          artifactId: 'a'.repeat(64),
          name: 'context.md',
        }),
        output: null,
      })}
      components={components}
      labels={labels}
      onIntent={() => undefined}
    />,
  )
  expect(html).toContain('Choose file')
  expect(html).toContain('Choose directory')
  expect(html).toContain('value="context.md"')
  expect(html).not.toContain('hbar-artifact')
  expect(html).toContain('readOnly=""')
  expect(components.resolve('FilePicker')?.descriptor.resourceKinds).toEqual(['file'])
  expect(components.resolve('DirectoryPicker')?.descriptor.resourceKinds).toEqual(['directory'])
})

test('editor registry keeps ProviderDialog-style renderers versioned and lifecycle scoped', () => {
  const editors = createSchemaEditorRegistry()
  const dispose = editors.register(
    'ProviderDialog',
    { version: 1, modes: ['dialog'], valueKinds: ['array-item'] },
    ({ entryId }) => <section>{entryId}</section>,
  )
  expect(editors.list()).toEqual([
    {
      id: 'ProviderDialog',
      descriptor: { version: 1, modes: ['dialog'], valueKinds: ['array-item'] },
    },
  ])
  dispose()
  expect(editors.resolve('ProviderDialog')).toBeUndefined()
  editors.dispose()
  expect(() =>
    editors.register('AfterDispose', { version: 1, modes: ['panel'], valueKinds: ['object'] }, () => null),
  ).toThrow('disposed')
})
