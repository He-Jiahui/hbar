import { CommandError, type CommandArgument, type CommandDescriptor } from './protocol'

export type CommandParameterKind = 'string' | 'number' | 'integer' | 'boolean' | 'json'
export type CommandParameterDraftValue = string | boolean

export interface CommandParameterField {
  readonly name: string
  readonly labelKey: string
  readonly kind: CommandParameterKind
  readonly required: boolean
  readonly sensitive: boolean
  readonly choices: readonly (string | number | boolean)[]
  readonly minimum?: number
  readonly maximum?: number
  readonly minLength?: number
  readonly maxLength?: number
  readonly defaultValue?: CommandParameterDraftValue
}

export interface CommandParameterForm {
  readonly commandId: string
  readonly commandVersion: number
  readonly fields: readonly CommandParameterField[]
}

export interface CommandParameterIssue {
  readonly field: string
  readonly code: 'required' | 'invalid' | 'too_small' | 'too_large' | 'not_allowed'
}

export interface CommandParameterDraft {
  readonly commandId: string
  readonly commandVersion: number
  readonly values: Readonly<Record<string, CommandParameterDraftValue>>
  readonly issues: readonly CommandParameterIssue[]
  readonly revision: number
}

type JsonSchema = Record<string, unknown>

function schemaObject(value: unknown): JsonSchema | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonSchema) : undefined
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function nonnegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function propertyVariant(property: JsonSchema): JsonSchema {
  const variants = Array.isArray(property.anyOf)
    ? property.anyOf.map(schemaObject).filter((item): item is JsonSchema => item !== undefined)
    : []
  return variants.find((item) => item.type !== 'null') ?? property
}

function parameterKind(property: JsonSchema, argument: CommandArgument | undefined): CommandParameterKind {
  if (argument?.type === 'json') return 'json'
  if (argument?.type !== undefined) return argument.type
  const variant = propertyVariant(property)
  if (variant.type === 'string' || variant.type === 'boolean' || variant.type === 'integer') return variant.type
  if (variant.type === 'number') return 'number'
  return 'json'
}

function draftValue(kind: CommandParameterKind, value: unknown): CommandParameterDraftValue | undefined {
  if (kind === 'boolean') return typeof value === 'boolean' ? value : undefined
  if (kind === 'string') return typeof value === 'string' ? value : undefined
  if (kind === 'number' || kind === 'integer')
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined
  if (value === undefined) return undefined
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

function freezeField(field: CommandParameterField): CommandParameterField {
  return Object.freeze({ ...field, choices: Object.freeze([...field.choices]) })
}

/** Compile a serializable command descriptor into a UI/TUI-neutral parameter form. */
export function compileCommandParameterForm(descriptor: CommandDescriptor): CommandParameterForm {
  const root = schemaObject(descriptor.inputSchema)
  const properties = schemaObject(root?.properties) ?? {}
  const required = new Set(
    Array.isArray(root?.required) ? root.required.filter((item): item is string => typeof item === 'string') : [],
  )
  const argumentsByField = new Map(descriptor.metadata.cli.arguments.map((argument) => [argument.field, argument]))
  const fields = Object.entries(properties).map(([name, raw]) => {
    const property = schemaObject(raw)
    if (!property) throw new CommandError('INVALID_DEFINITION', `Command field ${name} has no object schema`)
    const variant = propertyVariant(property)
    const kind = parameterKind(property, argumentsByField.get(name))
    const rawChoices = Array.isArray(variant.enum) ? variant.enum : Array.isArray(property.enum) ? property.enum : []
    const choices = rawChoices.filter(
      (item): item is string | number | boolean =>
        typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean',
    )
    const initial = property.default ?? variant.default
    const sensitive = property.writeOnly === true || variant.writeOnly === true
    if (sensitive && initial !== undefined)
      throw new CommandError('INVALID_DEFINITION', `Sensitive command field ${name} cannot publish a default`)
    const defaultValue = sensitive ? undefined : draftValue(kind, initial)
    const minimum = finite(variant.minimum)
    const maximum = finite(variant.maximum)
    const minLength = nonnegativeInteger(variant.minLength)
    const maxLength = nonnegativeInteger(variant.maxLength)
    return freezeField({
      name,
      labelKey:
        typeof property.title === 'string' ? property.title : `commands.${descriptor.metadata.id}.fields.${name}`,
      kind,
      required: required.has(name),
      sensitive,
      choices,
      ...(minimum !== undefined ? { minimum } : {}),
      ...(maximum !== undefined ? { maximum } : {}),
      ...(minLength !== undefined ? { minLength } : {}),
      ...(maxLength !== undefined ? { maxLength } : {}),
      ...(defaultValue !== undefined ? { defaultValue } : {}),
    })
  })
  return Object.freeze({
    commandId: descriptor.metadata.id,
    commandVersion: descriptor.metadata.version,
    fields: Object.freeze(fields),
  })
}

function parsedValue(field: CommandParameterField, raw: CommandParameterDraftValue): unknown {
  if (field.kind === 'boolean') return typeof raw === 'boolean' ? raw : undefined
  if (typeof raw !== 'string') return undefined
  if (field.kind === 'string') return raw
  if (field.kind === 'number' || field.kind === 'integer') {
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)) return undefined
    const value = Number(raw)
    if (!Number.isFinite(value) || (field.kind === 'integer' && !Number.isInteger(value))) return undefined
    return value
  }
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

function issueFor(field: CommandParameterField, values: Readonly<Record<string, CommandParameterDraftValue>>) {
  if (!Object.hasOwn(values, field.name))
    return field.required ? ({ field: field.name, code: 'required' } as const) : undefined
  const value = parsedValue(field, values[field.name]!)
  if (value === undefined) return { field: field.name, code: 'invalid' } as const
  if (field.choices.length && !field.choices.some((choice) => Object.is(choice, value)))
    return { field: field.name, code: 'not_allowed' } as const
  if (typeof value === 'string') {
    if (field.minLength !== undefined && value.length < field.minLength)
      return { field: field.name, code: 'too_small' } as const
    if (field.maxLength !== undefined && value.length > field.maxLength)
      return { field: field.name, code: 'too_large' } as const
  }
  if (typeof value === 'number') {
    if (field.minimum !== undefined && value < field.minimum) return { field: field.name, code: 'too_small' } as const
    if (field.maximum !== undefined && value > field.maximum) return { field: field.name, code: 'too_large' } as const
  }
  return undefined
}

function freezeDraft(
  form: CommandParameterForm,
  values: Readonly<Record<string, CommandParameterDraftValue>>,
  revision: number,
): CommandParameterDraft {
  const issues = form.fields.map((field) => issueFor(field, values)).filter((issue) => issue !== undefined)
  return Object.freeze({
    commandId: form.commandId,
    commandVersion: form.commandVersion,
    values: Object.freeze({ ...values }),
    issues: Object.freeze(issues.map((issue) => Object.freeze(issue))),
    revision,
  })
}

function checkDraft(form: CommandParameterForm, draft: CommandParameterDraft): void {
  if (draft.commandId !== form.commandId || draft.commandVersion !== form.commandVersion)
    throw new CommandError('INVALID_INPUT', 'Parameter draft belongs to another command revision')
}

/** Context supplies stable IDs such as workspaceId/sessionId without hiding them from the user. */
export function createCommandParameterDraft(
  form: CommandParameterForm,
  context: Readonly<Record<string, unknown>> = {},
): CommandParameterDraft {
  const values: Record<string, CommandParameterDraftValue> = {}
  for (const field of form.fields) {
    const contextual = Object.hasOwn(context, field.name) ? draftValue(field.kind, context[field.name]) : undefined
    const value = contextual ?? field.defaultValue
    if (value !== undefined) values[field.name] = value
  }
  return freezeDraft(form, values, 0)
}

export function setCommandParameter(
  form: CommandParameterForm,
  draft: CommandParameterDraft,
  fieldName: string,
  value: CommandParameterDraftValue,
): CommandParameterDraft {
  checkDraft(form, draft)
  const field = form.fields.find((item) => item.name === fieldName)
  if (!field) throw new CommandError('INVALID_INPUT', `Unknown command parameter: ${fieldName}`)
  if ((field.kind === 'boolean') !== (typeof value === 'boolean'))
    throw new CommandError('INVALID_INPUT', `Invalid command parameter input type: ${fieldName}`)
  return freezeDraft(form, { ...draft.values, [fieldName]: value }, draft.revision + 1)
}

export function unsetCommandParameter(
  form: CommandParameterForm,
  draft: CommandParameterDraft,
  fieldName: string,
): CommandParameterDraft {
  checkDraft(form, draft)
  if (!form.fields.some((item) => item.name === fieldName))
    throw new CommandError('INVALID_INPUT', `Unknown command parameter: ${fieldName}`)
  const values = { ...draft.values }
  delete values[fieldName]
  return freezeDraft(form, values, draft.revision + 1)
}

export function commandParameterInput(
  form: CommandParameterForm,
  draft: CommandParameterDraft,
): Readonly<Record<string, unknown>> {
  checkDraft(form, draft)
  if (draft.issues.length)
    throw new CommandError(
      'INVALID_INPUT',
      'Resolve command parameter issues before execution',
      draft.issues.map((issue) => ({ path: [issue.field], code: issue.code })),
    )
  const input: Record<string, unknown> = {}
  for (const field of form.fields)
    if (Object.hasOwn(draft.values, field.name)) input[field.name] = parsedValue(field, draft.values[field.name]!)
  return Object.freeze(input)
}
