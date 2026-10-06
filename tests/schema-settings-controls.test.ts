import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HBAR_SETTINGS_DESCRIPTION } from '@hbar/kernel'
import {
  createSchemaComponentRegistry,
  registerStandardSchemaComponents,
  type SchemaFieldLabels,
} from '@hbar/schema-react'
import type { CompiledField } from '@hbar/schema-core'

test('settings descriptors select popup, toggle, and catalog renderers by intent', () => {
  const fields = new Map(
    HBAR_SETTINGS_DESCRIPTION.fields.map((field) => [field.path[0]?.kind === 'field' ? field.path[0].name : '', field]),
  )
  expect(fields.get('client.chatSendBehavior')?.component).toBe('PopupSelect')
  expect(fields.get('provider.model')?.component).toBe('ComboBox')
  expect(fields.get('provider.thinkingLevel')?.component).toBe('ToggleGroup')
  expect(fields.get('session.approval')?.component).toBe('PopupSelect')
})

test('neutral schema registry accepts the Lumen settings renderer IDs', () => {
  const registry = createSchemaComponentRegistry()
  try {
    const dispose = registerStandardSchemaComponents(registry)
    expect(registry.resolve('PopupSelect')?.descriptor.multiple).toBe(false)
    expect(registry.resolve('ToggleGroup')?.descriptor.multiple).toBe(false)
    expect(registry.resolve('Switch')?.descriptor.fieldTypes).toEqual(['boolean'])
    dispose()
  } finally {
    registry.dispose()
  }
})

test('Lumen ToggleGroup keeps a stale persisted choice visible without allowing a stale write', () => {
  const registry = createSchemaComponentRegistry()
  const disposeStandard = registerStandardSchemaComponents(registry)
  const field: CompiledField = {
    name: 'provider.thinkingLevel',
    labelKey: 'i18n:settings.provider.thinkingLevel.label',
    component: 'ToggleGroup',
    type: 'string',
    multiple: false,
    required: false,
    nullable: true,
    readOnly: false,
    choices: ['low'],
  }
  const labels: SchemaFieldLabels = {
    label: 'Thinking level',
    reset: 'Reset',
    loading: 'Loading',
    empty: 'Empty',
    unavailable: (reason) => `Unavailable ${reason}`,
    contentError: (error) => `Error ${error}`,
    selectedInvalid: (value) => `Stale value ${String(value)}`,
    issue: () => 'Issue',
    option: (_field, value) => String(value),
    contentText: (text) => (text.kind === 'literal' ? text.text : text.key),
    pickResource: (kind) => kind,
    openOptions: (label) => `Open ${label}`,
    removeOption: (label) => `Remove ${label}`,
  }
  try {
    const renderer = registry.resolve('ToggleGroup')?.Renderer
    if (!renderer) throw new Error('ToggleGroup renderer is not registered')
    const html = renderToStaticMarkup(
      createElement(renderer, {
        field,
        value: 'stale',
        raw: undefined,
        issue: undefined,
        content: { status: 'idle' },
        labels,
        disabled: false,
        onIntent: () => undefined,
      }),
    )
    expect(html).toContain('Stale value stale')
    expect(html).toContain('data-value="string:stale"')
    expect(html).toContain('disabled=""')
  } finally {
    disposeStandard()
    registry.dispose()
  }
})
