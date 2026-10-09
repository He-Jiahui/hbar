import {
  decodeResourceReference,
  resourceReferenceMatches,
  type ResourceFieldDescription,
  type ResourceKind,
} from './resource'

export type FieldItemValue = string | number | boolean
export type FieldValue = FieldItemValue | null | readonly FieldItemValue[]
export type FieldType = 'string' | 'integer' | 'number' | 'boolean'

/** Presentation only: every typed comparison must match the current draft. */
export interface FieldVisibility {
  readonly all: readonly { readonly field: string; readonly equals: FieldValue }[]
}

export interface FormDescription {
  readonly id: string
  readonly version: number
  readonly fields: Readonly<
    Record<
      string,
      {
        readonly labelKey: string
        readonly component: string
        readonly readOnly?: boolean
        readonly resource?: ResourceFieldDescription
        readonly visibleWhen?: FieldVisibility
      }
    >
  >
}

export interface CompiledField {
  readonly name: string
  readonly labelKey: string
  readonly component: string
  readonly type: FieldType
  readonly multiple: boolean
  readonly required: boolean
  readonly nullable: boolean
  readonly readOnly: boolean
  readonly resource?: ResourceFieldDescription
  readonly visibleWhen?: FieldVisibility
  readonly minimum?: number
  readonly exclusiveMinimum?: number
  readonly maximum?: number
  readonly exclusiveMaximum?: number
  readonly minLength?: number
  readonly maxLength?: number
  readonly minItems?: number
  readonly maxItems?: number
  readonly choices?: readonly FieldItemValue[]
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
  register(
    id: string,
    supportedTypes: readonly FieldType[],
    resourceKinds?: readonly ResourceKind[],
    multiple?: boolean,
  ): () => void
  supports(id: string, type: FieldType, multiple?: boolean): boolean
  supportsResource(id: string, kind: ResourceKind): boolean
  requiresResource(id: string): boolean
}

export function createComponentRegistry(): ComponentRegistry {
  const components = new Map<
    string,
    {
      readonly types: ReadonlySet<FieldType>
      readonly resources: ReadonlySet<ResourceKind>
      readonly multiple: boolean
    }
  >()
  return {
    register(id, supportedTypes, resourceKinds = [], multiple = false) {
      if (!id || components.has(id) || !supportedTypes.length)
        throw new SchemaError('COMPONENT_CONFLICT', 'Component needs a unique ID and supported types')
      const types = new Set(supportedTypes)
      const resources = new Set(resourceKinds)
      if (
        types.size !== supportedTypes.length ||
        resources.size !== resourceKinds.length ||
        resourceKinds.some((kind) => kind !== 'file' && kind !== 'directory')
      )
        throw new SchemaError('INVALID_COMPONENT', 'Component capabilities must be unique')
      const capabilities = { types, resources, multiple }
      components.set(id, capabilities)
      return () => {
        if (components.get(id) === capabilities) components.delete(id)
      }
    },
    supports: (id, type, multiple = false) => {
      const component = components.get(id)
      return Boolean(component?.types.has(type) && component.multiple === multiple)
    },
    supportsResource: (id, kind) => components.get(id)?.resources.has(kind) ?? false,
    requiresResource: (id) => Boolean(components.get(id)?.resources.size),
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

function itemValueArray(value: unknown): value is readonly FieldItemValue[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
  )
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
  'items',
  'minItems',
  'maxItems',
  'uniqueItems',
  'enum',
  'default',
  'description',
  'title',
] as const

const scalarKeywords = [
  'type',
  'minimum',
  'exclusiveMinimum',
  'maximum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'enum',
  'description',
  'title',
] as const

const scalarFieldKeywords = [...scalarKeywords, 'default'] as const
const arrayKeywords = [
  'type',
  'items',
  'minItems',
  'maxItems',
  'uniqueItems',
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
  const multiple = data.type === 'array'
  const arrayData = multiple ? data : null
  if (multiple) {
    onlyKeys(data, arrayKeywords)
    if (data.uniqueItems !== true) throw new SchemaError('UNSUPPORTED_SCHEMA', 'Array fields require uniqueItems')
    data = record(data.items)
    onlyKeys(data, scalarKeywords)
  } else onlyKeys(data, scalarFieldKeywords)
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
  if (
    view.resource &&
    (!['file', 'directory'].includes(view.resource.kind) ||
      !['client-local', 'host', 'workspace'].includes(view.resource.location))
  )
    throw new SchemaError('INVALID_DESCRIPTION', `Field ${name} has invalid resource metadata`)
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
    multiple,
    required,
    nullable,
    readOnly: view.readOnly ?? false,
    ...(view.resource ? { resource: Object.freeze({ ...view.resource }) } : {}),
    ...(minimum !== undefined ? { minimum } : {}),
    ...(exclusiveMinimum !== undefined ? { exclusiveMinimum } : {}),
    ...(maximum !== undefined ? { maximum } : {}),
    ...(exclusiveMaximum !== undefined ? { exclusiveMaximum } : {}),
    ...(minLength !== undefined ? { minLength } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
  }
  const minItems = multiple ? finiteNumber(arrayData?.minItems, 'minItems') : undefined
  const maxItems = multiple ? finiteNumber(arrayData?.maxItems, 'maxItems') : undefined
  if (
    (minItems !== undefined && (!Number.isSafeInteger(minItems) || minItems < 0)) ||
    (maxItems !== undefined && (!Number.isSafeInteger(maxItems) || maxItems < 0 || maxItems > 256)) ||
    (minItems !== undefined && maxItems !== undefined && minItems > maxItems)
  )
    throw new SchemaError('INVALID_SCHEMA', 'Array bounds must be ordered integers between 0 and 256')
  const boundedConstraints: CompiledField = {
    ...constraints,
    ...(minItems !== undefined ? { minItems } : {}),
    ...(maxItems !== undefined ? { maxItems } : {}),
  }
  const validatedChoices: FieldItemValue[] = []
  if (choices !== undefined) {
    for (const choice of choices) {
      if (!validItemValue(boundedConstraints, choice) || validatedChoices.includes(choice))
        throw new SchemaError('INVALID_SCHEMA', 'Enum contains duplicate or invalid values')
      validatedChoices.push(choice)
    }
  }
  const field: CompiledField = {
    ...boundedConstraints,
    ...(choices !== undefined ? { choices: Object.freeze(validatedChoices) } : {}),
  }
  const defaultValue = multiple ? arrayData?.default : data.default
  if (multiple ? Object.hasOwn(arrayData ?? {}, 'default') : Object.hasOwn(data, 'default')) {
    if (!validValue(field, defaultValue)) throw new SchemaError('INVALID_SCHEMA', 'Default violates field constraints')
    return Object.freeze({
      ...field,
      defaultValue: itemValueArray(defaultValue) ? Object.freeze([...defaultValue]) : defaultValue,
    })
  }
  return Object.freeze(field)
}

function validItemValue(field: CompiledField, value: unknown): value is FieldItemValue {
  if (field.type === 'string') {
    if (
      typeof value !== 'string' ||
      value.length < (field.minLength ?? 0) ||
      value.length > (field.maxLength ?? Infinity)
    )
      return false
    if (field.resource) {
      const reference = decodeResourceReference(value)
      if (!reference || !resourceReferenceMatches(reference, field.resource)) return false
    }
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

export function validValue(field: CompiledField, value: unknown): value is FieldValue {
  if (value === null) return field.nullable
  if (!field.multiple) return validItemValue(field, value)
  if (
    !Array.isArray(value) ||
    value.length < (field.minItems ?? 0) ||
    value.length > (field.maxItems ?? 256) ||
    new Set(value.map((item) => `${typeof item}:${String(item)}`)).size !== value.length
  )
    return false
  return value.every((item) => validItemValue(field, item))
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
    if (!components.supports(field.component, field.type, field.multiple))
      throw new SchemaError(
        'COMPONENT_UNAVAILABLE',
        `Component ${field.component} cannot edit ${field.multiple ? 'multiple ' : ''}${field.type}`,
      )
    if (field.resource) {
      if (
        field.multiple ||
        field.type !== 'string' ||
        !components.supportsResource(field.component, field.resource.kind)
      )
        throw new SchemaError(
          'COMPONENT_UNAVAILABLE',
          `Component ${field.component} cannot select ${field.resource.kind}`,
        )
    } else if (components.requiresResource(field.component))
      throw new SchemaError('INVALID_DESCRIPTION', `Component ${field.component} requires resource metadata`)
    return field
  })
  const compiled = fields.map((field): CompiledField => {
    const condition = description.fields[field.name]?.visibleWhen
    if (condition === undefined) return field
    if (!condition || !Array.isArray(condition.all) || condition.all.length < 1 || condition.all.length > 16)
      throw new SchemaError('INVALID_DESCRIPTION', 'Visibility requires 1–16 field comparisons')
    const all = condition.all.map((comparison: FieldVisibility['all'][number]) => {
      if (!comparison || typeof comparison.field !== 'string')
        throw new SchemaError('INVALID_DESCRIPTION', 'Visibility requires named field comparisons')
      const dependency = fields.find((candidate) => candidate.name === comparison.field)
      if (!dependency || dependency.name === field.name || !validValue(dependency, comparison.equals))
        throw new SchemaError('INVALID_DESCRIPTION', `Invalid visibility dependency for ${field.name}`)
      return Object.freeze({
        field: comparison.field,
        equals: itemValueArray(comparison.equals) ? Object.freeze([...comparison.equals]) : comparison.equals,
      })
    })
    if (new Set(all.map((comparison) => comparison.field)).size !== all.length)
      throw new SchemaError('INVALID_DESCRIPTION', 'Visibility dependencies must be unique')
    return Object.freeze({ ...field, visibleWhen: Object.freeze({ all: Object.freeze(all) }) })
  })
  const visited = new Set<string>(),
    active = new Set<string>()
  const visit = (field: CompiledField): void => {
    if (active.has(field.name)) throw new SchemaError('INVALID_DESCRIPTION', 'Visibility dependencies cannot cycle')
    if (visited.has(field.name)) return
    active.add(field.name)
    for (const comparison of field.visibleWhen?.all ?? []) {
      const dependency = compiled.find((candidate) => candidate.name === comparison.field)
      if (dependency) visit(dependency)
    }
    active.delete(field.name)
    visited.add(field.name)
  }
  compiled.forEach(visit)
  return Object.freeze({ id: description.id, version: description.version, fields: Object.freeze(compiled) })
}
