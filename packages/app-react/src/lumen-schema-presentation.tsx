import { LumenButton, LumenContentText, LumenFormField, LumenFrame } from '@lumen/app-ui'
import type { SchemaFormPresentation } from '@hbar/schema-react'
import './lumen-schema-presentation.css'

/** Desktop copy, controls and feedback use Lumen; Schema owns all field data and intents. */
export const lumenSchemaFormPresentation: SchemaFormPresentation = {
  Form: ({ layout, children }) => (
    <LumenFrame className="hbar-lumen-schema-form" data-schema-form="" data-field-layout={layout}>
      {children}
    </LumenFrame>
  ),
  Field: ({ field, controlId, label, help, context, children, layout }) => (
    <LumenFrame className="hbar-lumen-schema-field" data-field={field.name} data-control-id={controlId}>
      <LumenFormField controlId={controlId} label={label} description={help} layout={layout} context={context ?? null}>
        <LumenFrame className="hbar-lumen-schema-controls">{children}</LumenFrame>
      </LumenFormField>
    </LumenFrame>
  ),
  Feedback: ({ id, kind, children }) => (
    <LumenContentText
      context="form.help"
      id={id}
      tone={kind === 'error' ? 'danger' : 'muted'}
      role={kind === 'error' ? 'alert' : kind === 'status' ? 'status' : undefined}
    >
      {children}
    </LumenContentText>
  ),
  Reset: ({ label, disabled, onReset }) => (
    <LumenButton type="button" disabled={disabled} onClick={onReset}>
      {label}
    </LumenButton>
  ),
}
