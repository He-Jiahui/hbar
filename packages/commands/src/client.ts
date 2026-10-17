import { z } from 'zod'
import {
  CommandError,
  invocationSchema,
  validationError,
  type CommandDefinition,
  type CommandInvocation,
  type CommandExecutionExpectation,
  type CommandPreparedOptions,
  type CommandExecutionTicket,
} from './protocol'
import type { ExecuteOptions } from './registry'
import { checkInvocationSize } from './limits'

export interface CommandExecutor {
  execute(name: string, input: unknown, options?: ExecuteOptions): Promise<unknown>
  dispatchPrepared?(
    invocation: unknown,
    actorId: string,
    expectation: CommandExecutionExpectation,
    options?: CommandPreparedOptions,
  ): Promise<unknown>
  dispatchPreparedTracked?(
    invocation: unknown,
    actorId: string,
    expectation: CommandExecutionExpectation,
    options?: CommandPreparedOptions,
  ): CommandExecutionTicket
}

/** Owner-local tracking must be explicitly supported; a logical dispatcher cannot synthesize physical completion. */
export function createTrackedCommandDispatcher(executor: CommandExecutor) {
  return (
    value: unknown,
    actorId: string,
    expectation: CommandExecutionExpectation,
    options: CommandPreparedOptions = {},
  ): CommandExecutionTicket => {
    if (!executor.dispatchPreparedTracked)
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'The command owner does not expose physical settlement tracking')
    return executor.dispatchPreparedTracked(value, actorId, expectation, options)
  }
}

/** Explicit owner adapter; ordinary typed clients do not acquire a private execution capability. */
export function createGuardedCommandDispatcher(executor: CommandExecutor) {
  return (
    value: unknown,
    actorId: string,
    expectation: CommandExecutionExpectation,
    options: CommandPreparedOptions = {},
  ): Promise<unknown> => {
    if (!executor.dispatchPrepared)
      return Promise.reject(
        new CommandError('CAPABILITY_UNAVAILABLE', 'The command owner does not support guarded dispatch'),
      )
    return executor.dispatchPrepared(value, actorId, expectation, options)
  }
}

function parseOutput<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw validationError('INVALID_OUTPUT', parsed.error)
  return parsed.data
}

/** Validate an invocation with its owner's executable schemas, without executing or reserving capacity. */
export function prepareCommandInvocation(
  definitions: Readonly<Record<string, CommandDefinition>>,
  value: unknown,
): CommandInvocation {
  checkInvocationSize(value)
  const invocation = invocationSchema.safeParse(value)
  if (!invocation.success) throw validationError('INVALID_INPUT', invocation.error)
  const definition = definitions[invocation.data.commandId]
  if (!definition) throw new CommandError('COMMAND_NOT_FOUND', 'Command definition not found')
  if (invocation.data.commandVersion !== definition.metadata.version)
    throw new CommandError('VERSION_MISMATCH', 'Command version is incompatible')
  const input = definition.input.safeParse(invocation.data.input)
  if (!input.success) throw validationError('INVALID_INPUT', input.error)
  const prepared = { ...invocation.data, input: input.data }
  checkInvocationSize(prepared)
  return prepared
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
