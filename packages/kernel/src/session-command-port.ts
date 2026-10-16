import type { CommandCatalogPage, CommandCatalogQuery, CommandDescriptor } from '@hbar/commands'
import { commandIdSchema, commandDescriptorSchema, invocationSchema } from '@hbar/commands'
import { z } from 'zod'
import { toolCallAdmissionSchema } from './tool-call-binding'

export const SESSION_COMMAND_DIRECTORY_QUERY_IDS = [
  'workspace.list',
  'workspace.get',
  'session.list',
  'session.get',
] as const

export const sessionCommandCallSchema = z.strictObject({
  commandId: commandIdSchema,
  commandVersion: z.number().int().positive(),
  operationKey: z.string().min(1).max(128).regex(/\S/),
  input: z.record(z.string().max(256), z.json()),
  target: z
    .strictObject({ clientId: z.string().min(1).max(160), generation: z.number().int().positive().safe() })
    .optional(),
})
export type SessionCommandCall = z.output<typeof sessionCommandCallSchema>

/** Host-signed, source-bound preparation. It is not a model parameter or a permission grant. */
export const sessionCommandPreparationSchema = z.strictObject({
  signature: z.string().regex(/^[a-f0-9]{64}$/),
  descriptor: commandDescriptorSchema,
  invocation: invocationSchema,
  admission: toolCallAdmissionSchema,
  arguments: sessionCommandCallSchema,
})
export type SessionCommandPreparation = z.output<typeof sessionCommandPreparationSchema>
export const sessionCommandToolResultSchema = z.strictObject({ text: z.string().max(131_072), isError: z.boolean() })
export type SessionCommandToolResult = z.output<typeof sessionCommandToolResultSchema>

/** Execution identity comes from the tool gateway; it is absent from model-facing parameters. */
export interface SessionCommandContext {
  readonly sessionId: string
  readonly runId: string
  readonly callId: string
  readonly signal: AbortSignal
}

/** Stable Host discovery. No command handler or permission grant is exposed by these reads. */
export interface SessionCommandDiscoveryPort {
  list(query: CommandCatalogQuery, context: SessionCommandContext): Promise<CommandCatalogPage>
  describe(commandId: string, context: SessionCommandContext): Promise<CommandDescriptor>
}
