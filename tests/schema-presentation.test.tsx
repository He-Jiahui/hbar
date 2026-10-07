import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarSchemaForm } from '@hbar/schema-react'
import { lumenSchemaFormPresentation } from '@hbar/app-react'
import { setField } from '@hbar/schema-core'
import { LumenContentText } from '@lumen/app-ui'
import { schemaPresentationCopies, schemaPresentationFixture } from './fixtures/schema-presentation'

for (const locale of ['en-US', 'zh-CN'] as const) {
  const copy = schemaPresentationCopies[locale]
  for (const count of [1, 3, 64]) {
    test(`Lumen schema projection preserves every original field at capacity ${count}: ${locale}`, () => {
      const { schema, components, state, labels } = schemaPresentationFixture(count, copy)
      try {
        const html = renderToStaticMarkup(
          <HbarSchemaForm
            schema={schema}
            components={components}
            state={state}
            labels={labels}
            presentation={lumenSchemaFormPresentation}
            onIntent={() => undefined}
          />,
        )
        expect(html.match(/data-field="field_/g)?.length).toBe(count)
        expect(html.match(/data-text-context="form.label"/g)?.length).toBe(count)
        expect(html).toContain(copy.help)
        expect(html).toContain(copy.value)
      } finally {
        components.dispose()
      }
    })
  }
  test(`filtered fields deduplicate IDs and retain numeric raw draft, issue and content feedback: ${locale}`, () => {
    const { schema, components, state, labels } = schemaPresentationFixture(3, copy)
    try {
      const html = renderToStaticMarkup(
        <HbarSchemaForm
          schema={schema}
          components={components}
          state={setField(schema, state, 'field_1', '-')}
          labels={labels}
          presentation={lumenSchemaFormPresentation}
          fieldNames={['field_1', 'missing', 'field_1']}
          content={{ field_1: { status: 'error', errorCode: 'ISOLATED_READ_FAILURE' } }}
          renderFieldContext={() => <LumenContentText context="form.help">{copy.context}</LumenContentText>}
          onIntent={() => undefined}
        />,
      )
      expect(html.match(/data-field="/g)?.length).toBe(1)
      expect(html).toContain('value="-"')
      expect(html.match(/role="alert"/g)?.length).toBe(2)
      expect(html).toContain(copy.reset)
      expect(html).toContain(copy.context)
      expect(html).not.toContain('data-field="field_0"')
      expect(html).not.toContain('ISOLATED_READ_FAILURE')
      const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])
      expect(new Set(ids).size).toBe(ids.length)
      expect(html).toContain(`${ids.find((id) => id?.endsWith('-field_1'))}-description`)
      const empty = renderToStaticMarkup(
        <HbarSchemaForm
          schema={schema}
          components={components}
          state={state}
          labels={labels}
          presentation={lumenSchemaFormPresentation}
          fieldNames={[]}
          onIntent={() => undefined}
        />,
      )
      expect(empty).not.toContain('data-field="')
    } finally {
      components.dispose()
    }
  })
  test(`generic Schema presentation remains independent and keeps existing control IDs: ${locale}`, () => {
    const { schema, components, state, labels } = schemaPresentationFixture(1, copy)
    try {
      const html = renderToStaticMarkup(
        <HbarSchemaForm
          schema={schema}
          components={components}
          state={state}
          labels={labels}
          onIntent={() => undefined}
        />,
      )
      expect(html).toContain('hbar-schema-field-field_0')
      expect(html).toContain('<label for="hbar-schema-field-field_0">')
      expect(html).not.toContain('lumen-form-field')
    } finally {
      components.dispose()
    }
  })
}

test('Schema rejects the first field over its existing 64-field bound', () => {
  expect(() => schemaPresentationFixture(65, schemaPresentationCopies['zh-CN'])).toThrow('bounded schema')
})
