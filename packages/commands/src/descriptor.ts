import { z } from 'zod'
import {
  CommandError,
  commandMetadataSchema,
  validationError,
  type CommandDefinition,
  type CommandDescriptor,
} from './protocol'

export function freezeData<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeData(child)
    Object.freeze(value)
  }
  return value
}

export function describeCommand(definition: CommandDefinition): CommandDescriptor {
  const parsed = commandMetadataSchema.safeParse(definition.metadata)
  if (!parsed.success) throw validationError('INVALID_DEFINITION', parsed.error)
  const metadata = parsed.data
  if (metadata.kind === 'query' && (metadata.stateEffect !== 'none' || metadata.idempotency !== 'none'))
    throw new CommandError('INVALID_DEFINITION', 'Queries cannot declare writes or persistent idempotency')
  if (metadata.kind === 'command' && metadata.stateEffect === 'none')
    throw new CommandError('INVALID_DEFINITION', 'Commands must declare their state effect')
  const names = [metadata.id, ...metadata.aliases]
  if (new Set(names).size !== names.length)
    throw new CommandError('INVALID_DEFINITION', 'Duplicate command name or alias')
  let inputSchema: z.core.JSONSchema.BaseSchema
  let outputSchema: z.core.JSONSchema.BaseSchema
  try {
    inputSchema = z.toJSONSchema(definition.input, { io: 'input' })
    // Inputs are validated at each boundary, so unrepresentable transforms are not supported.
    z.toJSONSchema(definition.input, { io: 'output' })
    outputSchema = z.toJSONSchema(definition.output, { io: 'output' })
  } catch {
    throw new CommandError('INVALID_DEFINITION', 'Schemas must have a serializable JSON Schema representation')
  }
  if (inputSchema.type !== 'object' || inputSchema.additionalProperties !== false)
    throw new CommandError('INVALID_DEFINITION', 'Command inputs must be strict object schemas')
  const fields = new Set<string>(),
    flags = new Set<string>(),
    positions = new Set<number>()
  const properties = inputSchema.properties ?? {}
  for (const argument of metadata.cli.arguments) {
    if (fields.has(argument.field) || !Object.hasOwn(properties, argument.field))
      throw new CommandError('INVALID_DEFINITION', 'CLI arguments must refer to distinct input fields')
    fields.add(argument.field)
    if (argument.flag === undefined && argument.position === undefined)
      throw new CommandError('INVALID_DEFINITION', 'CLI argument needs a flag or position')
    const rawProperty = properties[argument.field]
    const property = typeof rawProperty === 'object' ? rawProperty : undefined
    if (
      argument.type !== 'json' &&
      property?.type !== argument.type &&
      !(argument.type === 'number' && property?.type === 'integer')
    )
      throw new CommandError('INVALID_DEFINITION', 'CLI argument type must match its input field')
    if (argument.flag !== undefined) {
      if (flags.has(argument.flag)) throw new CommandError('INVALID_DEFINITION', 'Duplicate CLI flag')
      flags.add(argument.flag)
    }
    if (argument.position !== undefined) {
      if (positions.has(argument.position)) throw new CommandError('INVALID_DEFINITION', 'Duplicate CLI position')
      positions.add(argument.position)
    }
  }
  const sorted = [...positions].sort((a, b) => a - b)
  if (sorted.some((position, index) => position !== index))
    throw new CommandError('INVALID_DEFINITION', 'CLI positions must be contiguous from zero')
  const remainder = metadata.cli.remainder
  const rawRemainder = remainder === undefined ? undefined : properties[remainder]
  const remainderProperty = typeof rawRemainder === 'object' ? rawRemainder : undefined
  if (remainder !== undefined && (fields.has(remainder) || remainderProperty?.type !== 'string'))
    throw new CommandError('INVALID_DEFINITION', 'CLI remainder must refer to a distinct string field')
  const descriptor = { metadata, inputSchema, outputSchema }
  if (JSON.stringify(descriptor).length > 128_000)
    throw new CommandError('INVALID_DEFINITION', 'Command descriptor exceeds the size limit')
  return freezeData(descriptor)
}
