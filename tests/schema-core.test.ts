import { expect, test } from 'bun:test'
import {
  beginSubmit,
  compileForm,
  createComponentRegistry,
  createForm,
  resetField,
  setField,
  settleSubmit,
  rebaseForm,
  validateForm,
  encodePath,
  decodePath,
  decodeResourceReference,
  encodeResourceReference,
} from '@hbar/schema-core'

function fixture() {
  const components = createComponentRegistry()
  const unregisterNumber = components.register('NumberField', ['integer', 'number'])
  components.register('TextField', ['string'])
  const form = compileForm(
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        sessionId: { type: 'string', minLength: 1 },
        tokens: { type: 'integer', exclusiveMinimum: 0, maximum: 1000 },
        note: { type: 'string', maxLength: 20, default: '' },
        expectedRevision: { anyOf: [{ type: 'integer', exclusiveMinimum: 0 }, { type: 'null' }] },
      },
      required: ['sessionId', 'tokens'],
    },
    {
      id: 'budget.parameters',
      version: 1,
      fields: {
        sessionId: { labelKey: 'i18n:session', component: 'TextField', readOnly: true },
        tokens: { labelKey: 'i18n:tokens', component: 'NumberField' },
        note: { labelKey: 'i18n:note', component: 'TextField' },
        expectedRevision: { labelKey: 'i18n:revision', component: 'NumberField' },
      },
    },
    components,
  )
  return { form, components, unregisterNumber }
}

test('numeric picker values retain typed numbers while invalid values keep the last valid draft', () => {
  const { form } = fixture()
  let state = createForm(form, { sessionId: 'target', tokens: 100 })
  state = setField(form, state, 'tokens', 250)
  expect(state.draft.tokens).toBe(250)
  expect(state.raw).toEqual({})
  expect(state.issues).toEqual([])
  state = setField(form, state, 'tokens', 1001)
  expect(state.draft.tokens).toBe(250)
  expect(state.issues).toEqual([{ field: 'tokens', code: 'invalid' }])
  state = setField(form, state, 'tokens', '300')
  expect(state.draft.tokens).toBe(300)
  expect(state.raw).toEqual({})
})

test('compiled form keeps target read-only, preserves numeric intermediate states and validates ranges', () => {
  const { form } = fixture()
  let state = createForm(form, { sessionId: 'original-session', tokens: 100, expectedRevision: null })
  expect(state.draft).toEqual({ sessionId: 'original-session', tokens: 100, note: '', expectedRevision: null })
  expect(() => setField(form, state, 'sessionId', 'another-session')).toThrow('Cannot edit target')
  expect(() => setField(form, state, 'tokens', '1'.repeat(8193))).toThrow('exceeds 8192')
  expect(Object.isFrozen(state.draft)).toBe(true)
  state = setField(form, state, 'tokens', '')
  expect(state.raw.tokens).toBe('')
  expect(state.draft.tokens).toBe(100)
  expect(validateForm(form, state)).toEqual([{ field: 'tokens', code: 'invalid' }])
  expect(() => beginSubmit(form, state)).toThrow('Resolve field issues')
  state = setField(form, state, 'tokens', '1001')
  expect(state.raw.tokens).toBe('1001')
  state = setField(form, state, 'tokens', '250')
  expect(state.draft.tokens).toBe(250)
  expect(state.raw).toEqual({})
  expect(state.dirty).toEqual(['tokens'])
  expect(resetField(form, state, 'tokens').dirty).toEqual([])
})

test('submit confirms captured input while edits during submission remain dirty; failures retain draft', () => {
  const { form } = fixture()
  let state = setField(form, createForm(form, { sessionId: 'target', tokens: 100 }), 'tokens', '200')
  const first = beginSubmit(form, state)
  state = setField(form, first.state, 'tokens', '300')
  const settled = settleSubmit(form, state, first.submission, 'succeeded')
  expect(settled.baseline.tokens).toBe(200)
  expect(settled.draft.tokens).toBe(300)
  expect(settled.dirty).toEqual(['tokens'])
  const rebased = rebaseForm(form, settled, { sessionId: 'target', tokens: 200, expectedRevision: 2 })
  expect(rebased).toMatchObject({
    revision: state.revision,
    baseline: { tokens: 200, expectedRevision: 2 },
    draft: { tokens: 300, expectedRevision: 2 },
    dirty: ['tokens'],
  })
  const next = beginSubmit(form, settled)
  const failed = settleSubmit(form, next.state, next.submission, 'failed', 'DISCONNECTED')
  expect(failed.draft.tokens).toBe(300)
  expect(failed.errorCode).toBe('DISCONNECTED')
  const retry = beginSubmit(form, failed)
  const unknown = settleSubmit(form, retry.state, retry.submission, 'unknown', 'RESULT_UNKNOWN')
  expect(() => beginSubmit(form, unknown)).toThrow('Reconcile')
  expect(settleSubmit(form, unknown, retry.submission, 'succeeded').dirty).toEqual([])
  expect(settleSubmit(form, unknown, first.submission, 'succeeded')).toBe(unknown)
})

test('schema rejects unsupported data and unavailable components instead of silently omitting constraints', () => {
  const { form, unregisterNumber, components } = fixture()
  unregisterNumber()
  expect(components.supports('NumberField', 'integer')).toBe(false)
  expect(() => createForm(form, { sessionId: 'target', tokens: 0 })).toThrow('Invalid initial value')
  expect(() => createForm(form, { sessionId: 'target', tokens: 10, extra: true })).toThrow('Unknown form field')
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: { field: { type: 'object' } },
    required: [],
  }
  const view = { id: 'bad', version: 1, fields: { field: { labelKey: 'i18n:field', component: 'TextField' } } }
  expect(() => compileForm(schema, view, components)).toThrow('Unsupported field type')
  expect(() =>
    compileForm({ ...schema, properties: { field: { type: 'string', pattern: '.*' } } }, view, components),
  ).toThrow('Unsupported schema keyword')
  expect(() =>
    compileForm({ ...schema, properties: { field: { type: 'string', minItems: 1 } } }, view, components),
  ).toThrow('Unsupported schema keyword')
})

test('schema arrays use explicit multiple components, bounded unique values and structural dirty checks', () => {
  const components = createComponentRegistry()
  components.register('MultiSelect', ['string'], [], true)
  const form = compileForm(
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        levels: {
          type: 'array',
          items: { type: 'string', enum: ['low', 'medium', 'high'] },
          uniqueItems: true,
          minItems: 1,
          maxItems: 3,
          default: ['medium'],
        },
      },
    },
    {
      id: 'multiple.settings',
      version: 1,
      fields: { levels: { labelKey: 'i18n:levels', component: 'MultiSelect' } },
    },
    components,
  )
  expect(form.fields[0]).toMatchObject({ type: 'string', multiple: true, minItems: 1, maxItems: 3 })
  const initial = createForm(form, {})
  expect(initial.draft.levels).toEqual(['medium'])
  expect(Object.isFrozen(initial.draft.levels)).toBe(true)
  expect(setField(form, initial, 'levels', ['medium']).dirty).toEqual([])
  const changed = setField(form, initial, 'levels', ['low', 'high'])
  expect(changed.draft.levels).toEqual(['low', 'high'])
  expect(changed.dirty).toEqual(['levels'])
  expect(setField(form, changed, 'levels', ['low', 'low']).issues).toEqual([{ field: 'levels', code: 'invalid' }])
  expect(() =>
    compileForm(
      {
        type: 'object',
        additionalProperties: false,
        properties: { levels: { type: 'array', items: { type: 'string' }, uniqueItems: false } },
      },
      {
        id: 'invalid.multiple',
        version: 1,
        fields: { levels: { labelKey: 'i18n:levels', component: 'MultiSelect' } },
      },
      components,
    ),
  ).toThrow('uniqueItems')
})

test('schema paths identify stable item IDs and round-trip punctuation without positional aliases', () => {
  const path = [
    { kind: 'field' as const, name: 'provider.model' },
    { kind: 'item' as const, id: 'openai/gpt 5:4' },
    { kind: 'field' as const, name: 'thinkingLevels' },
  ]
  const encoded = encodePath(path)
  expect(decodePath(encoded)).toEqual(path)
  expect(encoded).not.toContain('openai/gpt 5:4')
  expect(() => decodePath('f:provider/i:%GG')).toThrow('Malformed')
  expect(() => decodePath('i:0/f:label')).toThrow('start with a field')
  expect(() => decodePath('f:provider/i:')).toThrow('stable item ID')
})

test('resource fields compile against picker capabilities and reject ambiguous raw paths', () => {
  const components = createComponentRegistry()
  components.register('TextField', ['string'])
  components.register('FilePicker', ['string'], ['file'])
  const reference = encodeResourceReference({
    kind: 'workspace-path',
    resourceKind: 'file',
    workspaceId: 'workspace',
    path: 'docs/plan.md',
  })
  expect(decodeResourceReference(reference)).toEqual({
    kind: 'workspace-path',
    resourceKind: 'file',
    workspaceId: 'workspace',
    path: 'docs/plan.md',
  })
  const form = compileForm(
    {
      type: 'object',
      additionalProperties: false,
      properties: { plan: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null } },
    },
    {
      id: 'resource.settings',
      version: 1,
      fields: {
        plan: {
          labelKey: 'i18n:plan',
          component: 'FilePicker',
          resource: { kind: 'file', location: 'workspace' },
        },
      },
    },
    components,
  )
  const selected = setField(form, createForm(form, { plan: null }), 'plan', reference)
  expect(selected.draft.plan).toBe(reference)
  expect(setField(form, selected, 'plan', 'D:/client/plan.md').issues).toEqual([{ field: 'plan', code: 'invalid' }])
  expect(() =>
    compileForm(
      { type: 'object', additionalProperties: false, properties: { plan: { type: 'string' } } },
      {
        id: 'resource.mismatch',
        version: 1,
        fields: {
          plan: {
            labelKey: 'i18n:plan',
            component: 'TextField',
            resource: { kind: 'file', location: 'workspace' },
          },
        },
      },
      components,
    ),
  ).toThrow('cannot select file')
})

test('schema-core builds without hbar domain, React, Host, command, or storage dependencies', async () => {
  const result = await Bun.build({ entrypoints: ['packages/schema-core/src/index.ts'], target: 'browser' })
  expect(result.success).toBe(true)
  const code = await result.outputs[0]!.text()
  for (const forbidden of ['@hbar/', 'react', 'zustand', 'node:sqlite', 'session.setBudget'])
    expect(code).not.toContain(forbidden)
})
