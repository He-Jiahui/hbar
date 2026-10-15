import { diagnosticEventSchema } from '@hbar/contracts/diagnostics'
import { z } from 'zod'
import { partitionOwnerSchema, partitionIdSchema } from './partition-layout'
import { storageRpcCallSchema } from './rpc'
import type { StorageCall } from './types'

export const poolRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('open'),
    id: z.number().int().positive(),
    owner: partitionOwnerSchema,
    pin: z.number().int().min(-1).max(1),
  }),
  z.strictObject({
    kind: z.literal('call'),
    id: z.number().int().positive(),
    owner: partitionOwnerSchema,
    call: storageRpcCallSchema.extend({ id: z.number().int().nonnegative() }),
  }),
  z.strictObject({ kind: z.literal('stats'), id: z.number().int().positive() }),
  z.strictObject({ kind: z.literal('close'), id: z.number().int().positive() }),
])
export const poolWorkerOptionsSchema = z.strictObject({
  root: z.string().min(1),
  generation: partitionIdSchema,
  connections: z.number().int().min(1).max(4),
  diagnostics: z.boolean(),
  fullCoverage: z.boolean(),
})
export const poolResponseSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    id: z.number().int().positive(),
    ok: z.literal(true),
    result: z.unknown(),
    diagnostics: z.array(diagnosticEventSchema).max(32),
    droppedDiagnostics: z.number().int().nonnegative(),
  }),
  z.strictObject({
    id: z.number().int().positive(),
    ok: z.literal(false),
    code: z.string().min(1).max(128),
    diagnostics: z.array(diagnosticEventSchema).max(32),
    droppedDiagnostics: z.number().int().nonnegative(),
  }),
])
export type PoolRequest = z.infer<typeof poolRequestSchema>
export type PoolResponse = z.infer<typeof poolResponseSchema>
export const poolStatsSchema = z.strictObject({
  connections: z.number().int().nonnegative().max(4),
  pins: z.number().int().nonnegative(),
})
export const poolStorageReplySchema = z.discriminatedUnion('ok', [
  z.strictObject({ id: z.number().int().nonnegative(), ok: z.literal(true), result: z.unknown() }),
  z.strictObject({ id: z.number().int().nonnegative(), ok: z.literal(false), error: z.string(), code: z.string() }),
])
export function validatedStorageCall(call: Extract<PoolRequest, { kind: 'call' }>['call']): StorageCall {
  // Same boundary as storageRpcInput: envelope validation cannot express the
  // method/tuple correlation; each original database method retains input validation.
  return call as StorageCall
}
