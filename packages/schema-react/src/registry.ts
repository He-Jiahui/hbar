import type { ComponentType } from 'react'
import {
  createComponentRegistry as createCoreComponentRegistry,
  SchemaError,
  type CompiledField,
  type ComponentRegistry,
  type FieldIssue,
  type FieldType,
  type FieldValue,
  type LocalizedText,
  type OptionContentReport,
} from '@hbar/schema-core'

const MAX_COMPONENTS = 128
const MAX_EDITORS = 64
const idPattern = /^[A-Z][A-Za-z0-9.]{0,63}$/

export type SchemaContentKind = 'options'
export type SchemaInteractionMode = 'inline' | 'dialog' | 'panel' | 'readonly'

export interface SchemaComponentDescriptor {
  readonly version: number
  readonly fieldTypes: readonly FieldType[]
  readonly multiple: boolean
  readonly contentKinds: readonly SchemaContentKind[]
  readonly interaction: SchemaInteractionMode
}

export type SchemaFieldContent =
  | { readonly status: 'idle' | 'loading' }
  | { readonly status: 'ready'; readonly report: Extract<OptionContentReport, { readonly status: 'ready' }> }
  | {
      readonly status: 'unavailable'
      readonly report: Extract<OptionContentReport, { readonly status: 'unavailable' }>
    }
  | { readonly status: 'error'; readonly errorCode: string }

export type SchemaFieldIntent =
  | { readonly kind: 'set'; readonly field: string; readonly value: string | boolean | null }
  | { readonly kind: 'reset'; readonly field: string }

export interface SchemaFieldLabels {
  readonly label: string
  readonly help?: string
  readonly reset: string
  readonly loading: string
  readonly empty: string
  readonly unavailable: (reasonCode: string) => string
  readonly contentError: (errorCode: string) => string
  readonly selectedInvalid: (value: FieldValue) => string
  readonly issue: (issue: FieldIssue) => string
  readonly option: (field: CompiledField, value: FieldValue) => string
  readonly contentText: (text: LocalizedText) => string
}

export interface SchemaFieldRendererProps {
  readonly field: CompiledField
  readonly value: FieldValue | undefined
  readonly raw: string | undefined
  readonly issue: FieldIssue | undefined
  readonly content: SchemaFieldContent
  readonly labels: SchemaFieldLabels
  readonly disabled: boolean
  readonly controlRevision?: number
  readonly onIntent: (intent: SchemaFieldIntent) => void
}

export interface SchemaComponentRegistration {
  readonly id: string
  readonly descriptor: SchemaComponentDescriptor
  readonly Renderer: ComponentType<SchemaFieldRendererProps>
}

export interface SchemaComponentRegistry {
  readonly schema: ComponentRegistry
  register(
    id: string,
    descriptor: SchemaComponentDescriptor,
    Renderer: ComponentType<SchemaFieldRendererProps>,
  ): () => void
  resolve(id: string): SchemaComponentRegistration | undefined
  list(): readonly Omit<SchemaComponentRegistration, 'Renderer'>[]
  dispose(): void
}

function validVersion(version: number): boolean {
  return Number.isSafeInteger(version) && version > 0
}

function unique<Value extends string>(values: readonly Value[]): boolean {
  return values.length === new Set(values).size
}

function freezeDescriptor(descriptor: SchemaComponentDescriptor): SchemaComponentDescriptor {
  if (
    !validVersion(descriptor.version) ||
    !descriptor.fieldTypes.length ||
    !unique(descriptor.fieldTypes) ||
    !unique(descriptor.contentKinds) ||
    descriptor.multiple
  )
    throw new SchemaError('INVALID_COMPONENT', 'Component capabilities are invalid or unsupported')
  return Object.freeze({
    ...descriptor,
    fieldTypes: Object.freeze([...descriptor.fieldTypes]),
    contentKinds: Object.freeze([...descriptor.contentKinds]),
  })
}

export function createSchemaComponentRegistry(): SchemaComponentRegistry {
  const schema = createCoreComponentRegistry()
  const entries = new Map<string, SchemaComponentRegistration>()
  const schemaDisposers = new Map<string, () => void>()
  let disposed = false
  return {
    schema,
    register(id, descriptor, Renderer) {
      if (disposed) throw new SchemaError('DISPOSED', 'Component registry is disposed')
      if (!idPattern.test(id) || entries.has(id) || entries.size >= MAX_COMPONENTS)
        throw new SchemaError('COMPONENT_CONFLICT', 'Component needs a unique bounded ID')
      const compiled = freezeDescriptor(descriptor)
      const disposeSchema = schema.register(id, compiled.fieldTypes)
      const registration = Object.freeze({ id, descriptor: compiled, Renderer })
      entries.set(id, registration)
      schemaDisposers.set(id, disposeSchema)
      return () => {
        if (entries.get(id) !== registration) return
        entries.delete(id)
        schemaDisposers.delete(id)
        disposeSchema()
      }
    },
    resolve: (id) => entries.get(id),
    list: () =>
      Object.freeze(
        [...entries.values()]
          .map(({ id, descriptor }) => Object.freeze({ id, descriptor }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      ),
    dispose() {
      if (disposed) return
      disposed = true
      for (const disposeSchema of schemaDisposers.values()) disposeSchema()
      schemaDisposers.clear()
      entries.clear()
    },
  }
}

export type SchemaEditorMode = 'dialog' | 'panel'
export type SchemaEditorValueKind = 'object' | 'array-item'

export interface SchemaEditorDescriptor {
  readonly version: number
  readonly modes: readonly SchemaEditorMode[]
  readonly valueKinds: readonly SchemaEditorValueKind[]
}

export interface SchemaEditorProps {
  readonly editorId: string
  readonly formId: string
  readonly path: string
  readonly entryId?: string
  readonly value: unknown
  readonly disabled: boolean
  readonly onIntent: (intent: Readonly<{ readonly kind: string; readonly value?: unknown }>) => void
}

export interface SchemaEditorRegistration {
  readonly id: string
  readonly descriptor: SchemaEditorDescriptor
  readonly Renderer: ComponentType<SchemaEditorProps>
}

export interface SchemaEditorRegistry {
  register(id: string, descriptor: SchemaEditorDescriptor, Renderer: ComponentType<SchemaEditorProps>): () => void
  resolve(id: string): SchemaEditorRegistration | undefined
  list(): readonly Omit<SchemaEditorRegistration, 'Renderer'>[]
  dispose(): void
}

export function createSchemaEditorRegistry(): SchemaEditorRegistry {
  const entries = new Map<string, SchemaEditorRegistration>()
  let disposed = false
  return {
    register(id, descriptor, Renderer) {
      if (disposed) throw new SchemaError('DISPOSED', 'Editor registry is disposed')
      if (
        !idPattern.test(id) ||
        entries.has(id) ||
        entries.size >= MAX_EDITORS ||
        !validVersion(descriptor.version) ||
        !descriptor.modes.length ||
        !descriptor.valueKinds.length ||
        !unique(descriptor.modes) ||
        !unique(descriptor.valueKinds)
      )
        throw new SchemaError('EDITOR_CONFLICT', 'Editor capabilities are invalid or conflicting')
      const compiled = Object.freeze({
        version: descriptor.version,
        modes: Object.freeze([...descriptor.modes]),
        valueKinds: Object.freeze([...descriptor.valueKinds]),
      })
      const registration = Object.freeze({ id, descriptor: compiled, Renderer })
      entries.set(id, registration)
      return () => {
        if (entries.get(id) === registration) entries.delete(id)
      }
    },
    resolve: (id) => entries.get(id),
    list: () =>
      Object.freeze(
        [...entries.values()]
          .map(({ id, descriptor }) => Object.freeze({ id, descriptor }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      ),
    dispose() {
      disposed = true
      entries.clear()
    },
  }
}
