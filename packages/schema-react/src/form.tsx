import type { CompiledField, CompiledForm, FieldIssue, FormState } from '@hbar/schema-core'
import type { ReactNode } from 'react'
import type { SchemaComponentRegistry, SchemaFieldContent, SchemaFieldIntent, SchemaFieldLabels } from './registry'
import './schema-form.css'

export interface HbarSchemaFormLabels {
  readonly resolve: (key: string) => string
  readonly help?: (field: CompiledField) => string | undefined
  readonly reset: string
  readonly loading: string
  readonly empty: string
  readonly unavailable: (reasonCode: string) => string
  readonly contentError: (errorCode: string) => string
  readonly selectedInvalid: SchemaFieldLabels['selectedInvalid']
  readonly issue: SchemaFieldLabels['issue']
  readonly option: SchemaFieldLabels['option']
  readonly contentText: SchemaFieldLabels['contentText']
  readonly pickResource: SchemaFieldLabels['pickResource']
  readonly componentUnavailable: (componentId: string) => string
}

export interface HbarSchemaFormProps {
  readonly schema: CompiledForm
  readonly state: FormState
  readonly components: SchemaComponentRegistry
  readonly labels: HbarSchemaFormLabels
  readonly content?: Readonly<Record<string, SchemaFieldContent>>
  readonly controlRevisions?: Readonly<Record<string, number>>
  readonly fieldNames?: readonly string[]
  readonly disabled?: boolean
  readonly renderFieldContext?: (field: CompiledField) => ReactNode
  readonly renderFieldActions?: (field: CompiledField) => ReactNode
  readonly onIntent: (intent: SchemaFieldIntent) => void
}

function issueFor(state: FormState, field: CompiledField): FieldIssue | undefined {
  return state.issues.find((issue) => issue.field === field.name)
}

export function HbarSchemaForm({
  schema,
  state,
  components,
  labels,
  content = {},
  controlRevisions = {},
  fieldNames,
  disabled = false,
  renderFieldContext,
  renderFieldActions,
  onIntent,
}: HbarSchemaFormProps) {
  const visible = fieldNames ? new Set(fieldNames) : null
  return (
    <div className="hbar-schema-form">
      {schema.fields
        .filter((field) => !visible || visible.has(field.name))
        .map((field) => {
          const registration = components.resolve(field.component)
          const issue = issueFor(state, field)
          const fieldContent = content[field.name] ?? ({ status: 'idle' } as const)
          const help = labels.help?.(field)
          const fieldLabels: SchemaFieldLabels = {
            label: labels.resolve(field.labelKey),
            ...(help ? { help } : {}),
            reset: labels.reset,
            loading: labels.loading,
            empty: labels.empty,
            unavailable: labels.unavailable,
            contentError: labels.contentError,
            selectedInvalid: labels.selectedInvalid,
            issue: labels.issue,
            option: labels.option,
            contentText: labels.contentText,
            pickResource: labels.pickResource,
          }
          const incompatible =
            !registration ||
            !registration.descriptor.fieldTypes.includes(field.type) ||
            registration.descriptor.multiple ||
            (field.resource
              ? !registration.descriptor.resourceKinds.includes(field.resource.kind)
              : registration.descriptor.resourceKinds.length > 0)
          return (
            <div className="hbar-schema-form-field" key={field.name} data-field={field.name}>
              <div className="hbar-schema-form-copy">
                <label htmlFor={`hbar-schema-field-${field.name}`}>{fieldLabels.label}</label>
                {help && <small>{help}</small>}
                {renderFieldContext?.(field)}
              </div>
              <div className="hbar-schema-form-control">
                {incompatible ? (
                  <p role="status">{labels.componentUnavailable(field.component)}</p>
                ) : (
                  <registration.Renderer
                    field={field}
                    value={state.draft[field.name]}
                    raw={state.raw[field.name]}
                    issue={issue}
                    content={fieldContent}
                    labels={fieldLabels}
                    disabled={disabled}
                    {...(controlRevisions[field.name] === undefined
                      ? {}
                      : { controlRevision: controlRevisions[field.name] })}
                    onIntent={onIntent}
                  />
                )}
                {issue && (
                  <small id={`${field.name}-issue`} role="alert">
                    {labels.issue(issue)}
                  </small>
                )}
                {fieldContent.status === 'unavailable' && (
                  <small id={`${field.name}-content`}>{labels.unavailable(fieldContent.report.reasonCode)}</small>
                )}
                {fieldContent.status === 'error' && (
                  <small id={`${field.name}-content`} role="alert">
                    {labels.contentError(fieldContent.errorCode)}
                  </small>
                )}
                {!field.readOnly && state.dirty.includes(field.name) && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onIntent({ kind: 'reset', field: field.name })}
                  >
                    {labels.reset}
                  </button>
                )}
                {renderFieldActions?.(field)}
              </div>
            </div>
          )
        })}
    </div>
  )
}
