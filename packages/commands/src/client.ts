import { z } from 'zod'
import { CommandError, validationError, type CommandDefinition } from './protocol'
import type { ExecuteOptions } from './registry'
import { checkInvocationSize } from './limits'

export interface CommandExecutor {
  execute(name: string, input: unknown, options?: ExecuteOptions): Promise<unknown>
}

function parseOutput<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw validationError('INVALID_OUTPUT', parsed.error)
  return parsed.data
}

export function createCommandClient<Definitions extends Readonly<Record<string, CommandDefinition>>>(
  definitions: Definitions,
  executor: CommandExecutor,
) {
  for (const [id, definition] of Object.entries(definitions)) {
    if (id !== definition.metadata.id)
      throw new CommandError('INVALID_DEFINITION', 'Typed client keys must be canonical command IDs')
  }
  return {
    async execute<Key extends keyof Definitions & string>(
      id: Key,
      input: z.input<Definitions[Key]['input']>,
      options: ExecuteOptions = {},
    ): Promise<z.output<Definitions[Key]['output']>> {
      const definition = definitions[id]
      if (!definition) throw new CommandError('COMMAND_NOT_FOUND', 'Command definition not found')
      checkInvocationSize(input)
      const parsed = definition.input.safeParse(input)
      if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
      const output = await executor.execute(definition.metadata.id, parsed.data, {
        ...options,
        version: definition.metadata.version,
      })
      return parseOutput<Definitions[Key]['output']>(definition.output, output)
    },
  }
}
