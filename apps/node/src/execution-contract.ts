import { createHash } from 'node:crypto'
import { z } from 'zod'
import { NODE_LIMITS } from '@hbar/contracts/node'

export const nodeProcessInputSchema = z.strictObject({
  workspace: z.string().min(1).max(4_000),
  command: z.string().min(1).max(NODE_LIMITS.commandCharacters),
  timeoutMs: z.number().int().positive().max(1_200_000),
  environment: z
    .record(z.string().max(256), z.string().max(32_768))
    .refine((value) => Object.keys(value).length <= 256),
})
export const nodeProcessOutputSchema = z.strictObject({
  text: z.string().max(NODE_LIMITS.outputBytes),
  isError: z.boolean(),
  details: z.strictObject({
    code: z.union([z.string(), z.number()]),
    exitCode: z.number().int(),
    truncated: z.boolean(),
    executionStarted: z.literal(true),
  }),
})
export const NODE_PROCESS_FINGERPRINT = createHash('sha256')
  .update('hbar.node.execution.v1')
  .update(JSON.stringify(z.toJSONSchema(nodeProcessInputSchema)))
  .update(JSON.stringify(z.toJSONSchema(nodeProcessOutputSchema)))
  .digest('hex')
