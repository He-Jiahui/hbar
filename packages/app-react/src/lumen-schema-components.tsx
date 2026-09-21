import { useEffect, useMemo, useState } from 'react'
import {
  decodeResourceReference,
  resourceReferenceLabel,
  type FieldItemValue,
  type FieldValue,
} from '@hbar/schema-core'
import {
  createSchemaComponentRegistry,
  type SchemaComponentRegistry,
  type SchemaFieldRendererProps,
} from '@hbar/schema-react'
import {
  LumenFrame,
  LumenButton,
  LumenCheckBoxControl,
  LumenComboBox,
  LumenInput,
  LumenMultiSelect,
  type LumenControlOption,
} from '@lumen/app-ui'
import './lumen-schema-components.css'

interface VisualOption extends LumenControlOption {
  readonly value: FieldItemValue
}

function optionId(value: FieldItemValue): string {
  return `${typeof value}:${String(value)}`
}

function isMultipleValue(value: FieldValue | undefined): value is readonly FieldItemValue[] {
  return Array.isArray(value)
}

function fieldOptions(props: SchemaFieldRendererProps): readonly VisualOption[] {
  const options =
    props.content.status === 'ready'
      ? props.content.report.options.map((item) => ({
          value: item.value,
          label: props.labels.contentText(item.label),
          disabled: item.disabled,
        }))
      : (props.field.choices?.map((value) => ({
          value,
          label: props.labels.option(props.field, value),
          disabled: false,
        })) ?? [])
  return options.map((option) => ({ ...option, id: optionId(option.value) }))
}

function scalarValue(value: FieldValue | undefined): FieldItemValue | null {
  return value === undefined || value === null || isMultipleValue(value) ? null : value
}

function textValue(props: SchemaFieldRendererProps): string {
  if (props.raw !== undefined) return props.raw
  const value = scalarValue(props.value)
  return value === null ? '' : String(value)
}

function describedBy(props: SchemaFieldRendererProps): string | undefined {
  if (props.issue) return `${props.field.name}-issue`
  if (props.content.status === 'unavailable' || props.content.status === 'error') return `${props.field.name}-content`
  return undefined
}

function TextField(props: SchemaFieldRendererProps) {
  const numeric = props.field.type === 'integer' || props.field.type === 'number'
  return (
    <LumenInput
      id={`hbar-schema-field-${props.field.name}`}
      name={props.field.name}
      type="text"
      inputMode={numeric ? (props.field.type === 'integer' ? 'numeric' : 'decimal') : undefined}
      value={textValue(props)}
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
    <LumenInput
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
    <LumenCheckBoxControl
      id={`hbar-schema-field-${props.field.name}`}
      name={props.field.name}
      checked={props.value === true}
      readOnly={props.field.readOnly}
      disabled={props.disabled || props.field.readOnly}
      aria-invalid={Boolean(props.issue)}
      aria-describedby={describedBy(props)}
      onChange={(event) => props.onIntent({ kind: 'set', field: props.field.name, value: event.currentTarget.checked })}
    />
  )
}

function usePickerState(selectedLabel: string) {
  const [query, setQuery] = useState(selectedLabel)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) setQuery(selectedLabel)
  }, [open, selectedLabel])
  return { query, setQuery, open, setOpen }
}

function ComboBox(props: SchemaFieldRendererProps) {
  const selected = scalarValue(props.value)
  const selectedId = selected === null ? null : optionId(selected)
  const declaredOptions = useMemo(() => fieldOptions(props), [props])
  const selectedOption = declaredOptions.find((option) => option.id === selectedId)
  const options = useMemo(
    () =>
      selectedId && !selectedOption
        ? [
            {
              id: selectedId,
              value: selected!,
              label: props.labels.selectedInvalid(selected!),
              disabled: false,
            },
            ...declaredOptions,
          ]
        : declaredOptions,
    [declaredOptions, props.labels, selected, selectedId, selectedOption],
  )
  const picker = usePickerState(
    selectedOption?.label ?? (selected === null ? '' : props.labels.selectedInvalid(selected)),
  )
  return (
    <LumenComboBox
      id={`hbar-schema-field-${props.field.name}`}
      value={selectedId}
      query={picker.query}
      open={picker.open}
      options={options}
      labels={{
        open: props.labels.openOptions(props.labels.label),
        empty: props.labels.empty,
        loading: props.labels.loading,
      }}
      disabled={props.disabled || props.field.readOnly}
      loading={props.content.status === 'loading'}
      invalid={Boolean(props.issue) || Boolean(selectedId && !selectedOption)}
      {...(describedBy(props) ? { describedBy: describedBy(props)! } : {})}
      onQueryChange={picker.setQuery}
      onOpenChange={picker.setOpen}
      onValueChange={(id) => {
        const option = options.find((candidate) => candidate.id === id)
        if (option) props.onIntent({ kind: 'set', field: props.field.name, value: option.value })
      }}
    />
  )
}

function MultiSelect(props: SchemaFieldRendererProps) {
  const selected = isMultipleValue(props.value) ? props.value : []
  const declaredOptions = useMemo(() => fieldOptions(props), [props])
  const selectedIds = selected.map(optionId)
  const missingOptions = selected
    .filter((value) => !declaredOptions.some((option) => option.id === optionId(value)))
    .map((value) => ({
      id: optionId(value),
      value,
      label: props.labels.selectedInvalid(value),
      disabled: false,
    }))
  const options = [...missingOptions, ...declaredOptions]
  const picker = usePickerState('')
  return (
    <LumenMultiSelect
      id={`hbar-schema-field-${props.field.name}`}
      values={selectedIds}
      query={picker.query}
      open={picker.open}
      options={options}
      labels={{
        open: props.labels.openOptions(props.labels.label),
        empty: props.labels.empty,
        loading: props.labels.loading,
        remove: props.labels.removeOption,
      }}
      disabled={props.disabled || props.field.readOnly}
      loading={props.content.status === 'loading'}
      invalid={Boolean(props.issue) || missingOptions.length > 0}
      {...(describedBy(props) ? { describedBy: describedBy(props)! } : {})}
      onQueryChange={picker.setQuery}
      onOpenChange={picker.setOpen}
      onValuesChange={(ids) => {
        const values = ids.flatMap((id) => {
          const option = options.find((candidate) => candidate.id === id)
          return option ? [option.value] : []
        })
        props.onIntent({ kind: 'set', field: props.field.name, value: values })
        picker.setQuery('')
      }}
    />
  )
}

function ResourcePicker(props: SchemaFieldRendererProps) {
  const resource = props.field.resource
  if (!resource) return null
  const reference = typeof props.value === 'string' ? decodeResourceReference(props.value) : null
  return (
    <LumenFrame className="hbar-app-react-schema-resource">
      <LumenInput
        id={`hbar-schema-field-${props.field.name}`}
        name={props.field.name}
        type="text"
        value={reference ? resourceReferenceLabel(reference) : textValue(props)}
        readOnly
        disabled={props.disabled}
        aria-invalid={Boolean(props.issue)}
        aria-describedby={describedBy(props)}
      />
      <LumenButton
        type="button"
        disabled={props.disabled || props.field.readOnly || props.content.status === 'loading'}
        onClick={() => props.onIntent({ kind: 'pick', field: props.field.name })}
      >
        {props.labels.pickResource(resource.kind)}
      </LumenButton>
    </LumenFrame>
  )
}

export function createHbarSchemaComponents(): SchemaComponentRegistry {
  const registry = createSchemaComponentRegistry()
  registry.register(
    'TextField',
    { version: 1, fieldTypes: ['string'], multiple: false, contentKinds: [], resourceKinds: [], interaction: 'inline' },
    TextField,
  )
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
  )
  registry.register(
    'SecretField',
    { version: 1, fieldTypes: ['string'], multiple: false, contentKinds: [], resourceKinds: [], interaction: 'inline' },
    SecretField,
  )
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
  )
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
  )
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
  )
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
  )
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
  )
  return registry
}
