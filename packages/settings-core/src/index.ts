import { encodePath, type SchemaPath } from '@hbar/schema-core'

export type Primitive = string | number | boolean | null
export type SettingsValue = Primitive | readonly SettingsValue[] | { readonly [key: string]: SettingsValue }

interface SchemaBase {
  readonly nullable?: boolean
}
export type ValueSchema =
  | (SchemaBase & { readonly kind: 'string'; readonly enum?: readonly string[] })
  | (SchemaBase & { readonly kind: 'number' | 'integer'; readonly minimum?: number; readonly maximum?: number })
  | (SchemaBase & { readonly kind: 'boolean' })
  | (SchemaBase & {
      readonly kind: 'object'
      readonly properties: Readonly<Record<string, ValueSchema>>
      readonly required?: readonly string[]
    })
  | (SchemaBase & { readonly kind: 'array'; readonly items: ValueSchema })

export interface KeyedOverride {
  readonly entries: readonly (
    | { readonly key: string; readonly delete: true }
    | { readonly key: string; readonly value: Readonly<Record<string, unknown>> }
  )[]
  readonly order?: readonly string[]
}

interface DefinitionBase {
  readonly path: SchemaPath
  readonly allowedLayers: readonly string[]
  readonly sensitive?: boolean
}
export type SettingDefinition =
  | (DefinitionBase & {
      readonly merge?: 'replace'
      readonly schema: ValueSchema
      readonly defaultValue: unknown
    })
  | (DefinitionBase & {
      readonly merge: 'object'
      readonly schema: Extract<ValueSchema, { kind: 'object' }>
      readonly defaultValue: unknown
    })
  | (DefinitionBase & {
      readonly merge: 'keyed'
      readonly keyField: string
      readonly itemSchema: Extract<ValueSchema, { kind: 'object' }>
      readonly defaultValue: readonly Readonly<Record<string, unknown>>[]
      readonly nullable?: boolean
    })

export interface SettingsLayer {
  readonly id: string
  readonly kind: string
  readonly revision: number
  readonly values: Readonly<Record<string, unknown>>
}
export interface ValueSource {
  readonly layerId: string
  readonly layerKind: string
  readonly revision: number | null
}
export interface SettingReport {
  readonly path: string
  readonly localPresence: boolean
  readonly localValue?: unknown
  readonly effectiveValue: unknown
  readonly sourceLayer: string | 'default' | 'mixed'
  readonly sourceRevision: number | null
  readonly inherited: boolean
  readonly validation: 'valid'
  readonly applyState: 'applied'
  readonly provenance: Readonly<Record<string, ValueSource>>
}
export interface SettingsResolution {
  readonly layers: readonly { readonly id: string; readonly kind: string; readonly revision: number }[]
  readonly reports: Readonly<Record<string, SettingReport>>
}

export class SettingsError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SettingsError'
  }
}

const MAX_DEFINITIONS = 2_000
const MAX_LAYERS = 16
const MAX_COLLECTION_ITEMS = 10_000
const MAX_SERIALIZED_BYTES = 2 * 1024 * 1024

function bounded(value: unknown, label: string): void {
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new SettingsError('INVALID_VALUE', `${label} must be finite JSON data`)
  }
  if (serialized === undefined || serialized.length > MAX_SERIALIZED_BYTES)
    throw new SettingsError('VALUE_TOO_LARGE', `${label} exceeds the size limit`)
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new SettingsError('INVALID_VALUE', message)
  return value as Record<string, unknown>
}
function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string')
}

function validate(value: unknown, schema: ValueSchema, partial = false): void {
  if (value === null) {
    if (!schema.nullable) throw new SettingsError('INVALID_VALUE', 'Null is not allowed by this setting schema')
    return
  }
  switch (schema.kind) {
    case 'string':
      if (typeof value !== 'string' || (schema.enum && !schema.enum.includes(value)))
        throw new SettingsError('INVALID_VALUE', 'Expected an allowed string')
      return
    case 'number':
    case 'integer':
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (schema.kind === 'integer' && !Number.isInteger(value)) ||
        (schema.minimum !== undefined && value < schema.minimum) ||
        (schema.maximum !== undefined && value > schema.maximum)
      )
        throw new SettingsError('INVALID_VALUE', `Expected a valid ${schema.kind}`)
      return
    case 'boolean':
      if (typeof value !== 'boolean') throw new SettingsError('INVALID_VALUE', 'Expected a boolean')
      return
    case 'array':
      if (!Array.isArray(value) || value.length > MAX_COLLECTION_ITEMS)
        throw new SettingsError('INVALID_VALUE', 'Expected a bounded array')
      for (const item of value) validate(item, schema.items)
      return
    case 'object': {
      const object = record(value, 'Expected an object')
      if (Object.keys(object).length > 1_000) throw new SettingsError('VALUE_TOO_LARGE', 'Object has too many fields')
      const unknown = Object.keys(object).find((key) => !Object.hasOwn(schema.properties, key))
      if (unknown) throw new SettingsError('UNKNOWN_FIELD', `Unknown setting field: ${unknown}`)
      if (!partial)
        for (const required of schema.required ?? [])
          if (!Object.hasOwn(object, required)) throw new SettingsError('INVALID_VALUE', `Missing field: ${required}`)
      for (const [key, child] of Object.entries(object)) {
        const childSchema = schema.properties[key]!
        validate(child, childSchema, partial && childSchema.kind === 'object')
      }
      return
    }
  }
}

function clone<Value>(value: Value): Value {
  return structuredClone(value)
}
function freeze<Value>(value: Value): Value {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
function source(layer?: SettingsLayer): ValueSource {
  return layer
    ? { layerId: layer.id, layerKind: layer.kind, revision: layer.revision }
    : { layerId: 'default', layerKind: 'default', revision: null }
}
function markLeaves(
  provenance: Record<string, ValueSource>,
  value: unknown,
  valueSource: ValueSource,
  prefix = '$',
): void {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value)
    if (entries.length) {
      for (const [key, child] of entries) markLeaves(provenance, child, valueSource, `${prefix}.${key}`)
      return
    }
  }
  provenance[prefix] = valueSource
}

function mergeObject(
  base: unknown,
  patch: unknown,
  schema: Extract<ValueSchema, { kind: 'object' }>,
  provenance: Record<string, ValueSource>,
  valueSource: ValueSource,
  prefix = '$',
): unknown {
  if (patch === null) {
    validate(patch, schema)
    provenance[prefix] = valueSource
    return null
  }
  validate(patch, schema, true)
  const patchRecord = record(patch, 'Expected an object patch')
  const result = base === null ? {} : { ...record(base, 'Expected an inherited object') }
  delete provenance[prefix]
  for (const [key, child] of Object.entries(patchRecord)) {
    const childSchema = schema.properties[key]!
    const childPrefix = `${prefix}.${key}`
    if (childSchema.kind === 'object' && child !== null)
      result[key] = mergeObject(result[key] ?? {}, child, childSchema, provenance, valueSource, childPrefix)
    else {
      validate(child, childSchema)
      result[key] = clone(child)
      for (const marked of Object.keys(provenance))
        if (marked === childPrefix || marked.startsWith(`${childPrefix}.`)) delete provenance[marked]
      markLeaves(provenance, child, valueSource, childPrefix)
    }
  }
  validate(result, schema)
  return result
}

function parseKeyedOverride(value: unknown): KeyedOverride | null {
  if (value === null) return null
  const object = record(value, 'Expected a keyed list override')
  const unknown = Object.keys(object).find((key) => key !== 'entries' && key !== 'order')
  if (unknown || !Array.isArray(object.entries) || object.entries.length > MAX_COLLECTION_ITEMS)
    throw new SettingsError('INVALID_VALUE', 'Keyed override needs entries and an optional order')
  const entries = object.entries.map((raw) => {
    const entry = record(raw, 'Expected a keyed override entry')
    if (typeof entry.key !== 'string' || !entry.key) throw new SettingsError('INVALID_VALUE', 'Entry key is required')
    if (entry.delete === true && Object.keys(entry).every((key) => ['key', 'delete'].includes(key)))
      return { key: entry.key, delete: true as const }
    if (Object.keys(entry).every((key) => ['key', 'value'].includes(key)))
      return { key: entry.key, value: record(entry.value, 'Entry value must be an object') }
    throw new SettingsError('INVALID_VALUE', 'Entry must be exactly a set or delete operation')
  })
  if (new Set(entries.map((entry) => entry.key)).size !== entries.length)
    throw new SettingsError('INVALID_VALUE', 'Keyed override contains duplicate entry keys')
  let order: string[] | undefined
  if (object.order !== undefined) {
    if (!stringArray(object.order) || object.order.length > MAX_COLLECTION_ITEMS)
      throw new SettingsError('INVALID_VALUE', 'Keyed order must contain string IDs')
    order = [...object.order]
    if (new Set(order).size !== order.length)
      throw new SettingsError('INVALID_VALUE', 'Keyed order contains duplicates')
  }
  return { entries, ...(order ? { order } : {}) }
}

function mergeKeyed(
  base: unknown,
  patch: unknown,
  definition: Extract<SettingDefinition, { merge: 'keyed' }>,
  provenance: Record<string, ValueSource>,
  valueSource: ValueSource,
): unknown {
  const override = parseKeyedOverride(patch)
  if (override === null) {
    if (!definition.nullable) throw new SettingsError('INVALID_VALUE', 'Null is not allowed for this keyed list')
    for (const key of Object.keys(provenance)) delete provenance[key]
    provenance.$ = valueSource
    return null
  }
  const current = base === null ? [] : (clone(base) as Record<string, unknown>[])
  const order = current.map((item) => String(item[definition.keyField]))
  const items = new Map(order.map((id, index) => [id, current[index]!] as const))
  for (const entry of override.entries) {
    const prefix = `$.items.${encodeURIComponent(entry.key)}`
    if ('delete' in entry) {
      items.delete(entry.key)
      const index = order.indexOf(entry.key)
      if (index >= 0) order.splice(index, 1)
      for (const marked of Object.keys(provenance))
        if (marked === prefix || marked.startsWith(`${prefix}.`)) delete provenance[marked]
      continue
    }
    if (Object.hasOwn(entry.value, definition.keyField) && entry.value[definition.keyField] !== entry.key)
      throw new SettingsError('INVALID_VALUE', 'Keyed item cannot change its stable key')
    const existing = items.get(entry.key) ?? { [definition.keyField]: entry.key }
    const patchValue = { ...entry.value, [definition.keyField]: entry.key }
    const merged = mergeObject(existing, patchValue, definition.itemSchema, provenance, valueSource, prefix)
    items.set(entry.key, merged as Record<string, unknown>)
    if (!order.includes(entry.key)) order.push(entry.key)
  }
  if (override.order) {
    const unknown = override.order.find((id) => !items.has(id))
    if (unknown) throw new SettingsError('INVALID_VALUE', `Order references unavailable key: ${unknown}`)
    const mentioned = new Set(override.order)
    order.splice(0, order.length, ...override.order, ...order.filter((id) => !mentioned.has(id)))
    provenance['$.order'] = valueSource
  }
  return order.map((id) => items.get(id)!)
}

function reportSource(provenance: Record<string, ValueSource>): {
  layer: string | 'default' | 'mixed'
  revision: number | null
} {
  const values = Object.values(provenance)
  const unique = new Map(values.map((item) => [`${item.layerId}:${item.revision}`, item]))
  if (unique.size !== 1) return { layer: 'mixed', revision: null }
  const only = unique.values().next().value as ValueSource | undefined
  return only ? { layer: only.layerId, revision: only.revision } : { layer: 'default', revision: null }
}

export function resolveSettings(
  definitions: readonly SettingDefinition[],
  layers: readonly SettingsLayer[],
): SettingsResolution {
  if (!definitions.length || definitions.length > MAX_DEFINITIONS)
    throw new SettingsError('INVALID_SCHEMA', 'Setting definition count is outside the supported range')
  if (layers.length > MAX_LAYERS) throw new SettingsError('INVALID_LAYER', 'Layer chain exceeds the supported depth')
  const byPath = new Map<string, SettingDefinition>()
  for (const definition of definitions) {
    const path = encodePath(definition.path)
    if (byPath.has(path)) throw new SettingsError('INVALID_SCHEMA', `Duplicate setting path: ${path}`)
    if (!definition.allowedLayers.length || new Set(definition.allowedLayers).size !== definition.allowedLayers.length)
      throw new SettingsError('INVALID_SCHEMA', 'Allowed layer kinds must be nonempty and unique')
    bounded(definition.defaultValue, `Default for ${path}`)
    if (definition.sensitive) {
      if (
        definition.merge === 'keyed' ||
        definition.schema.kind !== 'object' ||
        Object.keys(definition.schema.properties).some((key) => key !== 'secretRef') ||
        definition.schema.properties.secretRef?.kind !== 'string'
      )
        throw new SettingsError('INVALID_SCHEMA', 'Sensitive settings may expose only a string secretRef')
    }
    if (definition.merge === 'keyed') {
      if (!Object.hasOwn(definition.itemSchema.properties, definition.keyField))
        throw new SettingsError('INVALID_SCHEMA', 'Key field must exist in the item schema')
    } else validate(definition.defaultValue, definition.schema)
    byPath.set(path, definition)
  }
  if (new Set(layers.map((layer) => layer.id)).size !== layers.length)
    throw new SettingsError('INVALID_LAYER', 'Layer IDs must be unique')
  for (const layer of layers) {
    if (!layer.id || !layer.kind || !Number.isSafeInteger(layer.revision) || layer.revision < 0)
      throw new SettingsError('INVALID_LAYER', 'Layer identity and revision are invalid')
    const unknown = Object.keys(layer.values).find((path) => !byPath.has(path))
    if (unknown) throw new SettingsError('UNKNOWN_SETTING', `Unknown setting path: ${unknown}`)
    bounded(layer.values, `Layer ${layer.id}`)
  }
  const target = layers.at(-1)
  const reports: Record<string, SettingReport> = {}
  for (const [path, definition] of byPath) {
    const provenance: Record<string, ValueSource> = {}
    let effective: unknown
    if (definition.merge === 'keyed') {
      const keys = new Set<string>()
      effective = definition.defaultValue.map((item) => {
        validate(item, definition.itemSchema)
        const key = item[definition.keyField]
        if (typeof key !== 'string' || !key || keys.has(key))
          throw new SettingsError('INVALID_SCHEMA', 'Default keyed items need unique string keys')
        keys.add(key)
        markLeaves(provenance, item, source(), `$.items.${encodeURIComponent(key)}`)
        return clone(item)
      })
    } else {
      effective = clone(definition.defaultValue)
      markLeaves(provenance, effective, source())
    }
    for (const layer of layers) {
      if (!Object.hasOwn(layer.values, path)) continue
      if (!definition.allowedLayers.includes(layer.kind))
        throw new SettingsError('LAYER_FORBIDDEN', `${path} cannot be overridden by ${layer.kind}`)
      const patch = layer.values[path]
      if (definition.merge === 'keyed') effective = mergeKeyed(effective, patch, definition, provenance, source(layer))
      else if (definition.merge === 'object')
        effective = mergeObject(effective, patch, definition.schema, provenance, source(layer))
      else {
        validate(patch, definition.schema)
        effective = clone(patch)
        for (const key of Object.keys(provenance)) delete provenance[key]
        markLeaves(provenance, effective, source(layer))
      }
    }
    const resolvedSource = reportSource(provenance)
    const localPresence = Boolean(target && Object.hasOwn(target.values, path))
    reports[path] = freeze({
      path,
      localPresence,
      ...(localPresence ? { localValue: clone(target!.values[path]) } : {}),
      effectiveValue: clone(effective),
      sourceLayer: resolvedSource.layer,
      sourceRevision: resolvedSource.revision,
      inherited: !localPresence,
      validation: 'valid' as const,
      applyState: 'applied' as const,
      provenance: clone(provenance),
    })
  }
  return freeze({
    layers: layers.map(({ id, kind, revision }) => ({ id, kind, revision })),
    reports,
  })
}
