import { z } from 'zod'
import { invocationSchema, commandDescriptorSchema, commandIdSchema } from '@hbar/commands/protocol'
import {
  commandJobIdentitySchema,
  commandJobStartSchema,
  commandJobWatchSchema,
  commandJobReadSchema,
} from '@hbar/commands/jobs'

const id = z.string().min(1).max(160).regex(/\S/)
export const clientCommandTargetSchema = z.strictObject({
  clientId: id,
  generation: z.number().int().positive().safe(),
})
export type ClientCommandTarget = z.infer<typeof clientCommandTargetSchema>
export const CLIENT_COMMAND_DIRECTORY_BYTES = 65_536
export const clientCommandDirectoryQuerySchema = z.strictObject({
  after: id.optional(),
  limit: z.number().int().min(1).max(32).default(16),
})
export type ClientCommandDirectoryQuery = z.input<typeof clientCommandDirectoryQuerySchema>
export const clientCommandDirectorySchema = z
  .strictObject({
    items: z.array(clientCommandTargetSchema.extend({ commands: z.array(commandIdSchema).max(256) })).max(32),
    nextCursor: id.optional(),
  })
  .refine(
    (page) => new TextEncoder().encode(JSON.stringify(page)).byteLength <= CLIENT_COMMAND_DIRECTORY_BYTES,
    'The client directory exceeds its byte capacity',
  )
export type ClientCommandDirectory = z.output<typeof clientCommandDirectorySchema>
export const clientCommandRegistrationSchema = clientCommandTargetSchema.extend({
  commands: z.array(commandIdSchema).max(256),
})
export const clientCommandRegisteredSchema = clientCommandTargetSchema.extend({
  actorId: id,
  commands: z.array(commandIdSchema).max(256),
})
export const clientCommandPreparationSchema = z.strictObject({
  descriptor: commandDescriptorSchema,
  invocation: invocationSchema,
})
export const clientCommandOperationSchema = z.discriminatedUnion('method', [
  z.strictObject({ method: z.literal('prepare'), input: invocationSchema }),
  z.strictObject({ method: z.literal('command.jobs.start'), input: commandJobStartSchema }),
  z.strictObject({ method: z.literal('command.jobs.get'), input: commandJobIdentitySchema }),
  z.strictObject({ method: z.literal('command.jobs.watch'), input: commandJobWatchSchema }),
  z.strictObject({ method: z.literal('command.jobs.read'), input: commandJobReadSchema }),
  z.strictObject({ method: z.literal('command.jobs.cancel'), input: commandJobIdentitySchema }),
  z.strictObject({ method: z.literal('command.jobs.acknowledge'), input: commandJobIdentitySchema }),
])
export const clientCommandRequestSchema = clientCommandTargetSchema.extend({
  requestId: z.string().uuid(),
  operation: clientCommandOperationSchema,
})
export type ClientCommandRequest = z.infer<typeof clientCommandRequestSchema>
export const clientCommandReplySchema = clientCommandTargetSchema.extend({
  requestId: z.string().uuid(),
  outcome: z.discriminatedUnion('ok', [
    z.strictObject({ ok: z.literal(true), result: z.unknown() }),
    z.strictObject({
      ok: z.literal(false),
      error: z.strictObject({ code: z.string().min(1).max(128), message: z.string().min(1).max(8_192) }),
    }),
  ]),
})
