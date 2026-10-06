import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { decodeResourceReference, resourceReferenceLabel, type FieldItemValue } from '@hbar/schema-core'
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

function SecretField(props: SchemaFieldRendererProps) {
  const [draft, setDraft] = useState('')
  useEffect(() => setDraft(''), [props.controlRevision])
  return (
    <input
      id={`hbar-schema-field-${props.field.name}`}
      name={props.field.name}
      type="password"
      autoComplete="new-password"
      value={draft}
      readOnly={props.field.readOnly}
      disabled={props.disabled}
      aria-invalid={Boolean(props.issue)}
      aria-describedby={describedBy(props)}
      onChange={(event) => {
        setDraft(event.currentTarget.value)
        props.onIntent({ kind: 'set', field: props.field.name, value: event.currentTarget.value })
      }}
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

function optionKey(item: FieldItemValue): string {
  return `${typeof item}:${String(item)}`
}

function isMultipleValue(value: SchemaFieldRendererProps['value']): value is readonly FieldItemValue[] {
  return Array.isArray(value)
}

function parseOption(props: SchemaFieldRendererProps, source: string): FieldItemValue {
  const options = props.content.status === 'ready' ? props.content.report.options.map((item) => item.value) : []
  const staticOptions = props.field.choices ?? []
  const match = [...staticOptions, ...options].find((item) => optionKey(item) === source)
  return match ?? source
}

function optionsFor(props: SchemaFieldRendererProps) {
  const dynamic = props.content.status === 'ready' ? props.content.report.options : []
  return props.content.status === 'ready'
    ? dynamic.map((item) => ({
        value: item.value,
        disabled: item.disabled,
        label: props.labels.contentText(item.label),
      }))
    : (props.field.choices?.map((item) => ({
        value: item,
        disabled: false,
        label: props.labels.option(props.field, item),
      })) ?? [])
}

function ComboBox(props: SchemaFieldRendererProps) {
  const options = optionsFor(props)
  const selected = isMultipleValue(props.value) ? undefined : props.value
  const selectedValid = selected === undefined || selected === null || options.some((item) => item.value === selected)
  const onChange = (event: ChangeEvent<HTMLSelectElement>) =>
    props.onIntent({ kind: 'set', field: props.field.name, value: parseOption(props, event.currentTarget.value) })
  return (
    <>
      <select
        id={`hbar-schema-field-${props.field.name}`}
        name={props.field.name}
        value={selected === undefined || selected === null ? '' : optionKey(selected)}
        disabled={props.disabled || props.field.readOnly || props.content.status === 'loading'}
        aria-invalid={Boolean(props.issue) || !selectedValid}
        aria-describedby={describedBy(props)}
        onChange={onChange}
      >
        {(selected === undefined || selected === null) && <option value="" />}
        {!selectedValid && selected !== undefined && selected !== null && (
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

function MultiSelect(props: SchemaFieldRendererProps) {
  const options = optionsFor(props)
  const selected = isMultipleValue(props.value) ? props.value : []
  const selectedKeys = new Set(selected.map(optionKey))
  return (
    <>
      <select
        id={`hbar-schema-field-${props.field.name}`}
        name={props.field.name}
        multiple
        value={[...selectedKeys]}
        disabled={props.disabled || props.field.readOnly || props.content.status === 'loading'}
        aria-invalid={Boolean(props.issue)}
        aria-describedby={describedBy(props)}
        onChange={(event) => {
          const values = [...event.currentTarget.selectedOptions].map((option) => parseOption(props, option.value))
          props.onIntent({ kind: 'set', field: props.field.name, value: values })
        }}
      >
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

function PopupSelect(props: SchemaFieldRendererProps) {
  return <ComboBox {...props} />
}

function ToggleGroup(props: SchemaFieldRendererProps) {
  const options = optionsFor(props)
  const selected = isMultipleValue(props.value) ? undefined : props.value
  const selectedKey = selected === undefined || selected === null ? null : optionKey(selected)
  const selectedValid = selectedKey === null || options.some((item) => optionKey(item.value) === selectedKey)
  const visibleOptions =
    selectedKey !== null && !selectedValid && selected !== undefined && selected !== null
      ? [{ value: selected, disabled: true, label: props.labels.selectedInvalid(selected) }, ...options]
      : options
  const select = (item: (typeof visibleOptions)[number]) => {
    if (!item.disabled) props.onIntent({ kind: 'set', field: props.field.name, value: item.value })
  }
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const availableIndices = visibleOptions.flatMap((item, optionIndex) => (item.disabled ? [] : [optionIndex]))
    if (availableIndices.length === 0) return
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
    const currentAvailableIndex = Math.max(0, availableIndices.indexOf(index))
    const nextIndex =
      event.key === 'Home'
        ? availableIndices[0]!
        : event.key === 'End'
          ? availableIndices.at(-1)!
          : availableIndices[(currentAvailableIndex + direction + availableIndices.length) % availableIndices.length]!
    const next = visibleOptions[nextIndex]
    if (!next || next.disabled) return
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[role="radio"][data-value=${JSON.stringify(optionKey(next.value))}]`)
      ?.focus()
    select(next)
  }
  return (
    <div
      id={`hbar-schema-field-${props.field.name}`}
      role="radiogroup"
      aria-label={props.labels.label}
      aria-invalid={Boolean(props.issue) || !selectedValid}
      aria-describedby={describedBy(props)}
    >
      {visibleOptions.map((item, index) => {
        const id = optionKey(item.value)
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selectedKey === id}
            tabIndex={selectedKey === id || (selectedKey === null && index === 0) ? 0 : -1}
            disabled={props.disabled || props.field.readOnly || item.disabled}
            data-value={id}
            onKeyDown={(event) => onKeyDown(event, index)}
            onClick={() => select(item)}
          >
            {item.label}
          </button>
        )
      })}
      {props.content.status === 'loading' && <small>{props.labels.loading}</small>}
      {props.content.status === 'ready' && props.content.report.options.length === 0 && (
        <small>{props.labels.empty}</small>
      )}
    </div>
  )
}

function Switch(props: SchemaFieldRendererProps) {
  return (
    <input
      id={`hbar-schema-field-${props.field.name}`}
      name={props.field.name}
      type="checkbox"
      role="switch"
      checked={props.value === true}
      disabled={props.disabled || props.field.readOnly}
      aria-label={props.labels.label}
      aria-invalid={Boolean(props.issue)}
      aria-describedby={describedBy(props)}
      onChange={(event) => props.onIntent({ kind: 'set', field: props.field.name, value: event.currentTarget.checked })}
    />
  )
}

function ResourcePicker(props: SchemaFieldRendererProps) {
  const resource = props.field.resource
  if (!resource) return null
  const reference = typeof props.value === 'string' ? decodeResourceReference(props.value) : null
  return (
    <div className="hbar-schema-resource-picker">
      <input
        id={`hbar-schema-field-${props.field.name}`}
        name={props.field.name}
        type="text"
        value={reference ? resourceReferenceLabel(reference) : value(props)}
        readOnly
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        aria-describedby={describedBy(props)}
      />
      <button
        type="button"
        disabled={props.disabled || props.field.readOnly || props.content.status === 'loading'}
        onClick={() => props.onIntent({ kind: 'pick', field: props.field.name })}
      >
        {props.labels.pickResource(resource.kind)}
      </button>
      {props.content.status === 'loading' && <small>{props.labels.loading}</small>}
    </div>
  )
}

export function registerStandardSchemaComponents(registry: SchemaComponentRegistry): () => void {
  const disposers = [
    registry.register(
      'TextField',
      {
        version: 1,
        fieldTypes: ['string'],
        multiple: false,
        contentKinds: [],
        resourceKinds: [],
        interaction: 'inline',
      },
      TextField,
    ),
    registry.register(
      'NumberField',
      {
        version: 1,
        fieldTypes: ['integer', 'number'],
        multiple: false,
        contentKinds: [],
        resourceKinds: [],
        interaction: 'inline',
      },
      TextField,
    ),
    registry.register(
      'SecretField',
      {
        version: 1,
        fieldTypes: ['string'],
        multiple: false,
        contentKinds: [],
        resourceKinds: [],
        interaction: 'inline',
      },
      SecretField,
    ),
    registry.register(
      'CheckBox',
      {
        version: 1,
        fieldTypes: ['boolean'],
        multiple: false,
        contentKinds: [],
        resourceKinds: [],
        interaction: 'inline',
      },
      CheckBox,
    ),
    registry.register(
      'ComboBox',
      {
        version: 1,
        fieldTypes: ['string', 'integer', 'number', 'boolean'],
        multiple: false,
        contentKinds: ['options'],
        resourceKinds: [],
        interaction: 'inline',
      },
      ComboBox,
    ),
    registry.register(
      'PopupSelect',
      {
        version: 1,
        fieldTypes: ['string', 'integer', 'number', 'boolean'],
        multiple: false,
        contentKinds: ['options'],
        resourceKinds: [],
        interaction: 'inline',
      },
      PopupSelect,
    ),
    registry.register(
      'ToggleGroup',
      {
        version: 1,
        fieldTypes: ['string', 'integer', 'number', 'boolean'],
        multiple: false,
        contentKinds: ['options'],
        resourceKinds: [],
        interaction: 'inline',
      },
      ToggleGroup,
    ),
    registry.register(
      'Switch',
      {
        version: 1,
        fieldTypes: ['boolean'],
        multiple: false,
        contentKinds: [],
        resourceKinds: [],
        interaction: 'inline',
      },
      Switch,
    ),
    registry.register(
      'MultiSelect',
      {
        version: 1,
        fieldTypes: ['string', 'integer', 'number', 'boolean'],
        multiple: true,
        contentKinds: ['options'],
        resourceKinds: [],
        interaction: 'inline',
      },
      MultiSelect,
    ),
    registry.register(
      'FilePicker',
      {
        version: 1,
        fieldTypes: ['string'],
        multiple: false,
        contentKinds: [],
        resourceKinds: ['file'],
        interaction: 'dialog',
      },
      ResourcePicker,
    ),
    registry.register(
      'DirectoryPicker',
      {
        version: 1,
        fieldTypes: ['string'],
        multiple: false,
        contentKinds: [],
        resourceKinds: ['directory'],
        interaction: 'dialog',
      },
      ResourcePicker,
    ),
  ]
  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}
