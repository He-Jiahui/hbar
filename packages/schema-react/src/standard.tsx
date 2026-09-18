import type { ChangeEvent } from 'react'
import type { FieldValue } from '@hbar/schema-core'
import type { SchemaComponentRegistry, SchemaFieldRendererProps } from './registry'

function value(props: SchemaFieldRendererProps): string {
  if (props.raw !== undefined) return props.raw
  return props.value === undefined || props.value === null ? '' : String(props.value)
}

function describedBy(props: SchemaFieldRendererProps): string | undefined {
  if (props.issue) return `${props.field.name}-issue`
  if (props.content.status === 'unavailable' || props.content.status === 'error') return `${props.field.name}-content`
  return undefined
}

function TextField(props: SchemaFieldRendererProps) {
  const numeric = props.field.type === 'integer' || props.field.type === 'number'
  return (
    <input
      id={`hbar-schema-field-${props.field.name}`}
      name={props.field.name}
      type={numeric ? 'text' : 'text'}
      inputMode={numeric ? (props.field.type === 'integer' ? 'numeric' : 'decimal') : undefined}
      value={value(props)}
      readOnly={props.field.readOnly}
      disabled={props.disabled}
      aria-invalid={Boolean(props.issue)}
      aria-describedby={describedBy(props)}
      onChange={(event) => props.onIntent({ kind: 'set', field: props.field.name, value: event.currentTarget.value })}
    />
  )
}

function CheckBox(props: SchemaFieldRendererProps) {
  return (
    <input
      id={`hbar-schema-field-${props.field.name}`}
      name={props.field.name}
      type="checkbox"
      checked={props.value === true}
      disabled={props.disabled || props.field.readOnly}
      aria-invalid={Boolean(props.issue)}
      aria-describedby={describedBy(props)}
      onChange={(event) => props.onIntent({ kind: 'set', field: props.field.name, value: event.currentTarget.checked })}
    />
  )
}

function optionKey(item: FieldValue): string {
  return `${typeof item}:${String(item)}`
}

function parseOption(props: SchemaFieldRendererProps, source: string): string | boolean | null {
  const options = props.content.status === 'ready' ? props.content.report.options.map((item) => item.value) : []
  const staticOptions = props.field.choices ?? []
  const match = [...staticOptions, ...options].find((item) => optionKey(item) === source)
  return typeof match === 'string' || typeof match === 'boolean' ? match : match === null ? null : source
}

function ComboBox(props: SchemaFieldRendererProps) {
  const dynamic = props.content.status === 'ready' ? props.content.report.options : []
  const options =
    props.field.choices?.map((item) => ({
      value: item,
      disabled: false,
      label: props.labels.option(props.field, item),
    })) ??
    dynamic.map((item) => ({
      value: item.value,
      disabled: item.disabled,
      label: props.labels.contentText(item.label),
    }))
  const selected = props.value
  const selectedValid = selected === undefined || options.some((item) => item.value === selected)
  const onChange = (event: ChangeEvent<HTMLSelectElement>) =>
    props.onIntent({ kind: 'set', field: props.field.name, value: parseOption(props, event.currentTarget.value) })
  return (
    <>
      <select
        id={`hbar-schema-field-${props.field.name}`}
        name={props.field.name}
        value={selected === undefined ? '' : optionKey(selected)}
        disabled={props.disabled || props.field.readOnly || props.content.status === 'loading'}
        aria-invalid={Boolean(props.issue) || !selectedValid}
        aria-describedby={describedBy(props)}
        onChange={onChange}
      >
        {selected === undefined && <option value="" />}
        {!selectedValid && selected !== undefined && (
          <option value={optionKey(selected)}>{props.labels.selectedInvalid(selected)}</option>
        )}
        {options.map((item) => (
          <option key={optionKey(item.value)} value={optionKey(item.value)} disabled={item.disabled}>
            {item.label}
          </option>
        ))}
      </select>
      {props.content.status === 'loading' && <small>{props.labels.loading}</small>}
      {props.content.status === 'ready' && props.content.report.options.length === 0 && (
        <small>{props.labels.empty}</small>
      )}
    </>
  )
}

export function registerStandardSchemaComponents(registry: SchemaComponentRegistry): () => void {
  const disposers = [
    registry.register(
      'TextField',
      { version: 1, fieldTypes: ['string'], multiple: false, contentKinds: [], interaction: 'inline' },
      TextField,
    ),
    registry.register(
      'NumberField',
      {
        version: 1,
        fieldTypes: ['integer', 'number'],
        multiple: false,
        contentKinds: [],
        interaction: 'inline',
      },
      TextField,
    ),
    registry.register(
      'CheckBox',
      { version: 1, fieldTypes: ['boolean'], multiple: false, contentKinds: [], interaction: 'inline' },
      CheckBox,
    ),
    registry.register(
      'ComboBox',
      {
        version: 1,
        fieldTypes: ['string', 'integer', 'number', 'boolean'],
        multiple: false,
        contentKinds: ['options'],
        interaction: 'inline',
      },
      ComboBox,
    ),
  ]
  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}
