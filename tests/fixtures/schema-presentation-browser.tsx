import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HbarSchemaForm, type SchemaFieldIntent } from '@hbar/schema-react'
import { lumenSchemaFormPresentation } from '@hbar/app-react'
import { resetField, setField } from '@hbar/schema-core'
import { DEFAULT_LUMEN_APPEARANCE, LumenButton, LumenContentText, LumenFrame, LumenProvider } from '@lumen/app-ui'
import { schemaPresentationCopies, schemaPresentationFixture } from './schema-presentation'
import '@lumen/app-ui/styles.css'

export interface SchemaPresentationInput {
  readonly mode: 'light' | 'dark'
  readonly locale: 'en-US' | 'zh-CN'
  readonly layout: 'rows' | 'stacked'
  readonly count: number
  readonly visible?: readonly string[]
  readonly duplicateForm?: boolean
}
function Fixture(input: SchemaPresentationInput) {
  const copy = schemaPresentationCopies[input.locale]
  const fixture = useMemo(() => schemaPresentationFixture(input.count, copy), [copy, input.count])
  const [state, setState] = useState(fixture.state)
  const [visible, setVisible] = useState(input.visible)
  window.setSchemaFixtureVisible = setVisible
  window.readSchemaFixture = () => ({ state, intents: window.schemaFixtureIntents })
  const onIntent = (intent: SchemaFieldIntent) => {
    window.schemaFixtureIntents.push(intent)
    if (intent.kind === 'set') setState((previous) => setField(fixture.schema, previous, intent.field, intent.value))
    if (intent.kind === 'reset') setState((previous) => resetField(fixture.schema, previous, intent.field))
  }
  const form = (
    <HbarSchemaForm
      schema={fixture.schema}
      components={fixture.components}
      state={state}
      labels={fixture.labels}
      presentation={lumenSchemaFormPresentation}
      layout={input.layout}
      {...(visible === undefined ? {} : { fieldNames: visible })}
      renderFieldContext={() => <LumenContentText context="form.help">{copy.context}</LumenContentText>}
      renderFieldActions={(field) => (
        <LumenButton onClick={() => window.schemaFixtureActions.push(field.name)}>{copy.action}</LumenButton>
      )}
      onIntent={onIntent}
    />
  )
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
      <LumenFrame as="main" className="schema-presentation-fixture">
        {form}
        {input.duplicateForm && form}
      </LumenFrame>
    </LumenProvider>
  )
}
declare global {
  interface Window {
    mountSchemaPresentation(input: SchemaPresentationInput): void
    schemaFixtureIntents: SchemaFieldIntent[]
    schemaFixtureActions: string[]
    setSchemaFixtureVisible(value: readonly string[]): void
    readSchemaFixture(): {
      readonly state: ReturnType<typeof schemaPresentationFixture>['state']
      readonly intents: readonly SchemaFieldIntent[]
    }
  }
}
window.mountSchemaPresentation = (input) => {
  const container = document.getElementById('schema-presentation-fixture')
  if (!container) throw new Error('Missing Schema presentation fixture root')
  window.schemaFixtureIntents = []
  window.schemaFixtureActions = []
  createRoot(container).render(<Fixture {...input} />)
}
