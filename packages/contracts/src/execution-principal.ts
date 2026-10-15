import { z } from 'zod'
import { idSchema } from './index'

/** A durable source identity, never a cached permission grant. Device access is checked again at execution. */
export const executionPrincipalSchema = z.strictObject({
  version: z.literal(1),
  actorId: idSchema,
  originSessionId: idSchema,
  originRunId: idSchema.nullable(),
})
export type ExecutionPrincipal = z.infer<typeof executionPrincipalSchema>

/** Private StoragePort inputs, supplied by authenticated commands or the owning Run. */
export const sessionCreationSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('command'), actorId: idSchema }),
  z.strictObject({ kind: z.literal('run'), runId: idSchema }),
])
export type SessionCreationSource = z.infer<typeof sessionCreationSourceSchema>
