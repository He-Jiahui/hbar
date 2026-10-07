import type { ComponentType, ReactNode } from 'react'
import type { CompiledField } from '@hbar/schema-core'

export interface SchemaFormContainerProps {
  readonly layout: 'rows' | 'stacked'
  readonly children: ReactNode
}

export interface SchemaFormFieldPresentationProps extends SchemaFormContainerProps {
  readonly field: CompiledField
  readonly controlId: string
  readonly label: string
  readonly help: string | undefined
  readonly context: ReactNode
}

export interface SchemaFormFeedbackProps {
  readonly id?: string
  readonly kind: 'status' | 'error' | 'help'
  readonly children: string
}

export interface SchemaFormResetProps {
  readonly field: CompiledField
  readonly label: string
  readonly disabled: boolean
  readonly onReset: () => void
}

/** The host owns field presentation; registration, validation and intents remain in Schema. */
export interface SchemaFormPresentation {
  readonly Form: ComponentType<SchemaFormContainerProps>
  readonly Field: ComponentType<SchemaFormFieldPresentationProps>
  readonly Feedback: ComponentType<SchemaFormFeedbackProps>
  readonly Reset: ComponentType<SchemaFormResetProps>
}

export const nativeSchemaFormPresentation: SchemaFormPresentation = {
  Form: ({ layout, children }) => (
    <div className="hbar-schema-form" data-schema-form="" data-field-layout={layout}>
      {children}
    </div>
  ),
  Field: ({ field, controlId, label, help, context, children }) => (
    <div className="hbar-schema-form-field" data-field={field.name} data-control-id={controlId}>
      <div className="hbar-schema-form-copy">
        <label htmlFor={controlId}>{label}</label>
        {help && <small id={`${controlId}-description`}>{help}</small>}
        {context}
      </div>
      <div className="hbar-schema-form-control">{children}</div>
    </div>
  ),
  Feedback: ({ id, kind, children }) => (
    <small id={id} role={kind === 'error' ? 'alert' : kind === 'status' ? 'status' : undefined}>
      {children}
    </small>
  ),
  Reset: ({ label, disabled, onReset }) => (
    <button type="button" disabled={disabled} onClick={onReset}>
      {label}
    </button>
  ),
}
