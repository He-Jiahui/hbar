export type FieldValue = string | number | boolean | null
export type FieldType = 'string' | 'integer' | 'number' | 'boolean'

export interface FormDescription {
  readonly id: string
  readonly version: number
  readonly fields: Readonly<
    Record<string, { readonly labelKey: string; readonly component: string; readonly readOnly?: boolean }>
  >
}

export interface CompiledField {
  readonly name: string
  readonly labelKey: string
  readonly component: string
  readonly type: FieldType
  readonly required: boolean
  readonly nullable: boolean
  readonly readOnly: boolean
  readonly minimum?: number
  readonly exclusiveMinimum?: number
  readonly maximum?: number
  readonly exclusiveMaximum?: number
  readonly minLength?: number
  readonly maxLength?: number
  readonly choices?: readonly FieldValue[]
  readonly defaultValue?: FieldValue
}

export interface CompiledForm {
  readonly id: string
  readonly version: number
  readonly fields: readonly CompiledField[]
}

export class SchemaError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SchemaError'
  }
}

export interface ComponentRegistry {
  register(id: string, supportedTypes: readonly FieldType[]): () => void
  supports(id: string, type: FieldType): boolean
}

export function createComponentRegistry(): ComponentRegistry {
  const components = new Map<string, ReadonlySet<FieldType>>()
  return {
    register(id, supportedTypes) {
      if (!id || components.has(id) || !supportedTypes.length)
        throw new SchemaError('COMPONENT_CONFLICT', 'Component needs a unique ID and supported types')
      const types = new Set(supportedTypes)
      components.set(id, types)
      return () => {
        if (components.get(id) === types) components.delete(id)
      }
    },
    supports: (id, type) => components.get(id)?.has(type) ?? false,
  }
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new SchemaError('INVALID_SCHEMA', 'Expected an object schema')
  return value as Record<string, unknown>
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const unknown = Object.keys(value).find((key) => !keys.includes(key))
  if (unknown) throw new SchemaError('UNSUPPORTED_SCHEMA', `Unsupported schema keyword: ${unknown}`)
}

function finiteNumber(value: unknown, key: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new SchemaError('INVALID_SCHEMA', `${key} must be finite`)
  return value
}

function unknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

const fieldKeywords = [
  'type',
  'anyOf',
  'minimum',
  'exclusiveMinimum',
  'maximum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'enum',
  'default',
  'description',
  'title',
] as const

function compileField(
  name: string,
  raw: unknown,
  view: FormDescription['fields'][string],
  required: boolean,
): CompiledField {
  const source = record(raw)
  onlyKeys(source, fieldKeywords)
  let nullable = false
  let data = source
  if (source.anyOf !== undefined) {
    if (!Array.isArray(source.anyOf) || source.anyOf.length !== 2)
      throw new SchemaError('UNSUPPORTED_SCHEMA', 'Only primitive nullable unions are supported')
    const variants = source.anyOf.map(record)
    const nullVariant = variants.find((part) => part.type === 'null')
    const primitive = variants.find((part) => part.type !== 'null')
    if (!nullVariant || !primitive || Object.keys(nullVariant).length !== 1 || source.type !== undefined)
      throw new SchemaError('UNSUPPORTED_SCHEMA', 'Only primitive nullable unions are supported')
    data = primitive
    onlyKeys(
      data,
      fieldKeywords.filter((key) => key !== 'anyOf'),
    )
    nullable = true
  }
  const type = data.type
  if (type !== 'string' && type !== 'integer' && type !== 'number' && type !== 'boolean')
    throw new SchemaError('UNSUPPORTED_SCHEMA', `Unsupported field type: ${name}`)
  if (
    typeof view.labelKey !== 'string' ||
    !view.labelKey.startsWith('i18n:') ||
    typeof view.component !== 'string' ||
    !view.component ||
    (view.readOnly !== undefined && typeof view.readOnly !== 'boolean')
  )
    throw new SchemaError('INVALID_DESCRIPTION', `Field ${name} needs a label key and component`)
  const minLength = finiteNumber(data.minLength, 'minLength')
  const maxLength = finiteNumber(data.maxLength, 'maxLength')
  if ((minLength !== undefined || maxLength !== undefined) && type !== 'string')
    throw new SchemaError('INVALID_SCHEMA', 'Length constraints require a string')
  const minimum = finiteNumber(data.minimum, 'minimum')
  const exclusiveMinimum = finiteNumber(data.exclusiveMinimum, 'exclusiveMinimum')
  const maximum = finiteNumber(data.maximum, 'maximum')
  const exclusiveMaximum = finiteNumber(data.exclusiveMaximum, 'exclusiveMaximum')
  if (
    [minimum, exclusiveMinimum, maximum, exclusiveMaximum].some((value) => value !== undefined) &&
    type !== 'integer' &&
    type !== 'number'
  )
    throw new SchemaError('INVALID_SCHEMA', 'Numeric constraints require a number')
  if (
    (minimum !== undefined && exclusiveMinimum !== undefined) ||
    (maximum !== undefined && exclusiveMaximum !== undefined)
  )
    throw new SchemaError('INVALID_SCHEMA', 'Conflicting numeric bounds')
  const choices = data.enum
  if (choices !== undefined && (!unknownArray(choices) || !choices.length || choices.length > 256))
    throw new SchemaError('INVALID_SCHEMA', 'Enum must contain 1–256 choices')
  const constraints: CompiledField = {
    name,
    labelKey: view.labelKey,
    component: view.component,
    type,
    required,
    nullable,
    readOnly: view.readOnly ?? false,
    ...(minimum !== undefined ? { minimum } : {}),
    ...(exclusiveMinimum !== undefined ? { exclusiveMinimum } : {}),
    ...(maximum !== undefined ? { maximum } : {}),
    ...(exclusiveMaximum !== undefined ? { exclusiveMaximum } : {}),
    ...(minLength !== undefined ? { minLength } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
  }
  const validatedChoices: FieldValue[] = []
  if (choices !== undefined) {
    for (const choice of choices) {
      if (!validValue(constraints, choice) || validatedChoices.includes(choice))
        throw new SchemaError('INVALID_SCHEMA', 'Enum contains duplicate or invalid values')
      validatedChoices.push(choice)
    }
  }
  const field: CompiledField = {
    ...constraints,
    ...(choices !== undefined ? { choices: Object.freeze(validatedChoices) } : {}),
  }
  const defaultValue = data.default
  if (Object.hasOwn(data, 'default')) {
    if (!validValue(field, defaultValue)) throw new SchemaError('INVALID_SCHEMA', 'Default violates field constraints')
    return Object.freeze({ ...field, defaultValue })
  }
  return Object.freeze(field)
}

export function validValue(field: CompiledField, value: unknown): value is FieldValue {
  if (value === null) return field.nullable
  if (field.type === 'string') {
    if (
      typeof value !== 'string' ||
      value.length < (field.minLength ?? 0) ||
      value.length > (field.maxLength ?? Infinity)
    )
      return false
  } else if (field.type === 'boolean') {
    if (typeof value !== 'boolean') return false
  } else if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (field.type === 'integer' && !Number.isSafeInteger(value)) ||
    (field.minimum !== undefined && value < field.minimum) ||
    (field.exclusiveMinimum !== undefined && value <= field.exclusiveMinimum) ||
    (field.maximum !== undefined && value > field.maximum) ||
    (field.exclusiveMaximum !== undefined && value >= field.exclusiveMaximum)
  )
    return false
  return field.choices === undefined || field.choices.includes(value)
}

export function compileForm(
  schema: unknown,
  description: FormDescription,
  components: ComponentRegistry,
): CompiledForm {
  if (!description.id || !Number.isSafeInteger(description.version) || description.version < 1)
    throw new SchemaError('INVALID_DESCRIPTION', 'Form ID and positive version are required')
  const root = record(schema)
  onlyKeys(root, ['$schema', 'type', 'properties', 'required', 'additionalProperties', 'description', 'title'])
  if (root.type !== 'object' || root.additionalProperties !== false)
    throw new SchemaError('INVALID_SCHEMA', 'Form input must be a strict object')
  const properties = record(root.properties)
  const names = Object.keys(properties)
  if (!names.length || names.length > 64 || Object.keys(description.fields).length !== names.length)
    throw new SchemaError('INVALID_DESCRIPTION', 'Form fields must exactly match a bounded schema')
  const required = root.required === undefined ? [] : root.required
  if (!Array.isArray(required) || required.some((name) => typeof name !== 'string' || !Object.hasOwn(properties, name)))
    throw new SchemaError('INVALID_SCHEMA', 'Required fields must exist')
  const fields = names.map((name) => {
    const view = description.fields[name]
    if (!view) throw new SchemaError('INVALID_DESCRIPTION', `Missing field description: ${name}`)
    const field = compileField(name, properties[name], view, required.includes(name))
    if (!components.supports(field.component, field.type))
      throw new SchemaError('COMPONENT_UNAVAILABLE', `Component ${field.component} cannot edit ${field.type}`)
    return field
  })
  return Object.freeze({ id: description.id, version: description.version, fields: Object.freeze(fields) })
}
