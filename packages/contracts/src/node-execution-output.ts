import { z } from 'zod'
import { nodeOperationIdSchema } from './node-operation'

const operationId = nodeOperationIdSchema

export const nodeExecOutputChunkSchema = z.strictObject({
  operationId,
  streamId: z.string().uuid(),
  seq: z.number().int().positive().safe(),
  text: z
    .string()
    .min(1)
    .max(8 * 1024),
})
export type NodeExecOutputChunk = z.infer<typeof nodeExecOutputChunkSchema>
export const nodeExecOutputReadSchema = z.strictObject({
  operationId,
  afterSeq: z.number().int().nonnegative().safe(),
  limitBytes: z
    .number()
    .int()
    .min(1)
    .max(32 * 1024)
    .default(32 * 1024),
})
export const nodeExecOutputReadResultSchema = z.strictObject({
  operationId,
  streamId: z.string().uuid(),
  items: z.array(nodeExecOutputChunkSchema).max(32),
  cursor: z.number().int().nonnegative().safe(),
  reset: z.boolean(),
  terminal: z.boolean(),
})
export const nodeExecOutputCreditSchema = z.strictObject({
  operationId,
  streamId: z.string().uuid(),
  throughSeq: z.number().int().nonnegative().safe(),
  bytes: z
    .number()
    .int()
    .min(0)
    .max(64 * 1024),
})
export const nodeExecOutputCreditResultSchema = z.strictObject({
  accepted: z.literal(true),
  availableBytes: z
    .number()
    .int()
    .min(0)
    .max(64 * 1024),
})
export const nodeExecOutputMethods = {
  'exec.output.read': { input: nodeExecOutputReadSchema, output: nodeExecOutputReadResultSchema },
  'exec.output.credit': { input: nodeExecOutputCreditSchema, output: nodeExecOutputCreditResultSchema },
} as const
