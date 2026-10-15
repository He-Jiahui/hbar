import { z } from 'zod'

export const COMMAND_PROTOCOL_VERSION = 1
export const commandIdSchema = z
  .string()
  .max(128)
  .regex(/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/)
export const commandAliasSchema = z
  .string()
  .max(128)
  .regex(/^[a-z][a-zA-Z0-9._-]*$/)

const argumentSchema = z.strictObject({
  field: z.string().min(1).max(128),
  type: z.enum(['string', 'number', 'boolean', 'json']),
  flag: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/)
    .max(64)
    .optional(),
  position: z.number().int().min(0).max(63).optional(),
})

export const commandMetadataSchema = z.strictObject({
  id: commandIdSchema,
  version: z.number().int().positive(),
  owner: z.string().min(1).max(128),
  kind: z.enum(['command', 'query']),
  execution: z.enum(['host', 'client', 'platform']),
  stateEffect: z.enum(['none', 'application', 'persistent', 'external']),
  category: z.string().min(1).max(128),
  titleKey: z.string().min(1).max(256),
  descriptionKey: z.string().min(1).max(256),
  scope: z.enum(['global', 'workspace', 'session', 'client']),
  visibility: z.enum(['public', 'advanced', 'internal']).default('public'),
  surfaces: z
    .array(z.enum(['palette', 'cli', 'tui', 'api']))
    .min(1)
    .max(4),
  aliases: z.array(commandAliasSchema).max(20).default([]),
  keywords: z.array(z.string().max(128)).max(30).default([]),
  capabilities: z.array(z.string().min(1).max(128)).max(30).default([]),
  idempotency: z.enum(['none', 'required']).default('none'),
  cancelMode: z.enum(['none', 'cooperative']).default('none'),
  timeoutMs: z.number().int().min(1).max(1_200_000).default(30_000),
  maxConcurrent: z.number().int().min(1).max(128).default(16),
  formSchemaId: z.string().min(1).max(128).optional(),
  cli: z
    .strictObject({
      arguments: z.array(argumentSchema).max(64),
      remainder: z.string().min(1).max(128).optional(),
    })
    .default({ arguments: [] }),
})

export type CommandMetadata = z.output<typeof commandMetadataSchema>
export type CommandMetadataInput = z.input<typeof commandMetadataSchema>
export type CommandArgument = z.output<typeof argumentSchema>

/** Validators stay in code; only the separate descriptor is published. */
export interface CommandDefinition<Input extends z.ZodType = z.ZodType, Output extends z.ZodType = z.ZodType> {
  readonly metadata: CommandMetadata
  readonly input: Input
  readonly output: Output
}

export interface CommandDescriptor {
  readonly metadata: CommandMetadata
  readonly inputSchema: z.core.JSONSchema.BaseSchema
  readonly outputSchema: z.core.JSONSchema.BaseSchema
}

/** Descriptors cross read-only ports; executable validators and functions stay in their owners. */
const commandDescriptorWireSchema = z.strictObject({
  metadata: commandMetadataSchema,
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()),
})
export const commandDescriptorSchema = commandDescriptorWireSchema.transform((value): CommandDescriptor => value)

export const commandCatalogPageSchema = z.strictObject({
  revision: z.number().int().nonnegative().safe(),
  items: z.array(commandDescriptorSchema).max(200),
  nextCursor: z.string().min(1).max(128).optional(),
}).transform(({ nextCursor, ...page }): CommandCatalogPage =>
  nextCursor === undefined ? page : { ...page, nextCursor },
)

export const commandCatalogQuerySchema = z.strictObject({
  category: z.string().min(1).max(128).optional(),
  after: z.string().max(128).optional(),
  limit: z.number().int().min(1).max(200).default(100),
})
export const commandDescriptionQuerySchema = z.strictObject({ commandId: z.string().min(1).max(128) })
export type CommandCatalogQuery = z.input<typeof commandCatalogQuerySchema>
export interface CommandCatalogPage {
  readonly revision: number
  readonly items: CommandDescriptor[]
  readonly nextCursor?: string
}

/** Authenticated composition boundaries provide the actor; command payloads never contain it. */
export interface CommandRoutingPort {
  list(query?: CommandCatalogQuery): CommandCatalogPage
  describe(commandId: string): CommandDescriptor
  /** Read-only owner validation and defaults; never invokes the command handler. */
  prepare(invocation: unknown): Promise<CommandPreparation>
  execute(invocation: unknown, actorId: string): Promise<unknown>
}

export interface CommandPreparation {
  readonly descriptor: CommandDescriptor
  readonly invocation: CommandInvocation
}

/** Trusted admission facts, carried separately from an invocation and its authenticated actor. */
export const commandExecutionExpectationSchema = z.strictObject({ descriptor: commandDescriptorSchema, input: z.unknown() })
export type CommandExecutionExpectation = z.output<typeof commandExecutionExpectationSchema>
export interface CommandPreparedOptions {
  readonly signal?: AbortSignal
}
export interface PreparedCommandRoutingPort extends CommandRoutingPort {
  executePrepared(invocation: unknown, actorId: string, expectation: CommandExecutionExpectation, options?: CommandPreparedOptions): Promise<unknown>
}

export const invocationSchema = z.strictObject({
  protocol: z.literal(COMMAND_PROTOCOL_VERSION),
  requestId: z.string().min(1).max(128),
  commandId: commandIdSchema,
  commandVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(1).max(128).optional(),
  input: z.unknown(),
})
export type CommandInvocation = z.output<typeof invocationSchema>

export const commandErrorCodes = [
  'COMMAND_NOT_FOUND',
  'COMMAND_CONFLICT',
  'COMMAND_PREPARATION_STALE',
  'INVALID_DEFINITION',
  'INVALID_INPUT',
  'INVALID_OUTPUT',
  'INVALID_SYNTAX',
  'INPUT_TOO_LARGE',
  'VERSION_MISMATCH',
  'CAPABILITY_UNAVAILABLE',
  'FORBIDDEN',
  'BUSY',
  'CANCELLED',
  'TIMED_OUT',
  'RESULT_UNKNOWN',
  'EXECUTION_FAILED',
  'DISPOSED',
] as const
export type CommandErrorCode = (typeof commandErrorCodes)[number]

export interface CommandIssue {
  readonly path: readonly (string | number)[]
  readonly code: string
}

export class CommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly issues: readonly CommandIssue[] = [],
  ) {
    super(message)
    this.name = 'CommandError'
  }
}

export function validationError(
  code: 'INVALID_INPUT' | 'INVALID_OUTPUT' | 'INVALID_DEFINITION',
  error: z.ZodError,
): CommandError {
  return new CommandError(
    code,
    code,
    error.issues.map((issue) => ({
      path: issue.path.map((segment) => (typeof segment === 'symbol' ? String(segment) : segment)),
      code: issue.code,
    })),
  )
}

export function defineCommand<Input extends z.ZodType, Output extends z.ZodType>(
  metadata: CommandMetadataInput,
  input: Input,
  output: Output,
): CommandDefinition<Input, Output> {
  const parsed = commandMetadataSchema.safeParse(metadata)
  if (!parsed.success) throw validationError('INVALID_DEFINITION', parsed.error)
  return { metadata: parsed.data, input, output }
}
