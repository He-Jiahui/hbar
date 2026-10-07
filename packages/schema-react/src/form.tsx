import type { CompiledField, CompiledForm, FieldIssue, FormState } from '@hbar/schema-core'
import { useId, type ReactNode } from 'react'
import type { SchemaComponentRegistry, SchemaFieldContent, SchemaFieldIntent, SchemaFieldLabels } from './registry'
import { nativeSchemaFormPresentation, type SchemaFormPresentation } from './presentation'
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
  readonly openOptions: SchemaFieldLabels['openOptions']
  readonly removeOption: SchemaFieldLabels['removeOption']
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
  readonly layout?: 'rows' | 'stacked'
  readonly disabled?: boolean
  readonly presentation?: SchemaFormPresentation
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
  layout = 'rows',
  disabled = false,
  presentation,
  renderFieldContext,
  renderFieldActions,
  onIntent,
}: HbarSchemaFormProps) {
  const formId = useId()
  const View = presentation ?? nativeSchemaFormPresentation
  const visible = fieldNames ? new Set(fieldNames) : null
  return (
    <View.Form layout={layout}>
      {schema.fields
        .filter((field) => !visible || visible.has(field.name))
        .map((field) => {
          const registration = components.resolve(field.component)
          const issue = issueFor(state, field)
          const fieldContent = content[field.name] ?? ({ status: 'idle' } as const)
          const help = labels.help?.(field)
          const controlId = presentation ? `hbar-schema-${formId}-${field.name}` : `hbar-schema-field-${field.name}`
          const issueId = presentation ? `${controlId}-issue` : `${field.name}-issue`
          const contentId = presentation ? `${controlId}-content` : `${field.name}-content`
          const describedBy =
            [
              help ? `${controlId}-description` : undefined,
              issue ? issueId : undefined,
              fieldContent.status === 'unavailable' || fieldContent.status === 'error' ? contentId : undefined,
            ]
              .filter(Boolean)
              .join(' ') || undefined
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
            openOptions: labels.openOptions,
            removeOption: labels.removeOption,
          }
          const incompatible =
            !registration ||
            !registration.descriptor.fieldTypes.includes(field.type) ||
            registration.descriptor.multiple !== field.multiple ||
            (field.resource
              ? !registration.descriptor.resourceKinds.includes(field.resource.kind)
              : registration.descriptor.resourceKinds.length > 0)
          return (
            <View.Field
              key={field.name}
              field={field}
              controlId={controlId}
              label={fieldLabels.label}
              help={help}
              layout={layout}
              context={renderFieldContext?.(field)}
            >
              {incompatible ? (
                <View.Feedback kind="status">{labels.componentUnavailable(field.component)}</View.Feedback>
              ) : (
                <registration.Renderer
                  id={controlId}
                  aria-describedby={describedBy}
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
                <View.Feedback id={issueId} kind="error">
                  {labels.issue(issue)}
                </View.Feedback>
              )}
              {fieldContent.status === 'unavailable' && (
                <View.Feedback id={contentId} kind="help">
                  {labels.unavailable(fieldContent.report.reasonCode)}
                </View.Feedback>
              )}
              {fieldContent.status === 'error' && (
                <View.Feedback id={contentId} kind="error">
                  {labels.contentError(fieldContent.errorCode)}
                </View.Feedback>
              )}
              {!field.readOnly && state.dirty.includes(field.name) && (
                <View.Reset
                  field={field}
                  label={labels.reset}
                  disabled={disabled}
                  onReset={() => onIntent({ kind: 'reset', field: field.name })}
                />
              )}
              {renderFieldActions?.(field)}
            </View.Field>
          )
        })}
    </View.Form>
  )
}
