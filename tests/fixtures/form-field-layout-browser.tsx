import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  DEFAULT_LUMEN_APPEARANCE,
  LumenButton,
  LumenContentText,
  LumenFormField,
  LumenFrame,
  LumenInput,
  LumenProvider,
  type LumenInputProps,
} from '@lumen/app-ui'
import '@lumen/app-ui/styles.css'

export interface FormLayoutFixtureInput {
  readonly mode: 'light' | 'dark'
  readonly layout: 'rows' | 'stacked'
  readonly copy: {
    readonly label: string
    readonly help: string
    readonly context: string
    readonly error: string
    readonly reset: string
    readonly value: string
  }
}
function RegisteredControl(
  props: Pick<LumenInputProps, 'id' | 'aria-describedby' | 'aria-labelledby' | 'aria-invalid'> & {
    readonly value: string
    readonly onChange: (value: string) => void
  },
) {
  return <LumenInput {...props} onChange={(event) => props.onChange(event.currentTarget.value)} />
}
function Fixture({ mode, layout, copy }: FormLayoutFixtureInput) {
  const [draft, setDraft] = useState(copy.value)
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode, motion: false }}>
      <LumenFrame as="main" className="form-layout-fixture">
        <LumenFormField
          controlId="registered-original-control"
          label={copy.label}
          description={copy.help}
          error={copy.error}
          layout={layout}
          context={<LumenContentText context="form.help">{copy.context}</LumenContentText>}
        >
          <LumenFrame className="form-layout-controls">
            <RegisteredControl id="registered-original-control" value={draft} onChange={setDraft} />
            <LumenButton onClick={() => setDraft(copy.value)}>{copy.reset}</LumenButton>
          </LumenFrame>
        </LumenFormField>
      </LumenFrame>
    </LumenProvider>
  )
}
declare global {
  interface Window {
    mountFormLayoutFixture(input: FormLayoutFixtureInput): void
  }
}
window.mountFormLayoutFixture = (input) => {
  const container = document.getElementById('form-layout-fixture')
  if (!container) throw new Error('Missing form layout fixture root')
  createRoot(container).render(<Fixture {...input} />)
}
