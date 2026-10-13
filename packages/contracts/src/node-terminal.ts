import { z } from 'zod'
import { sandboxSnapshotRefSchema } from './sandbox'

const id = z.string().min(1).max(160)
const rootId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
const relativePath = z
  .string()
  .min(1)
  .max(4_000)
  .refine((value) => !value.split(/[\\/]+/).includes('..') && !/^([\\/]|[a-z]:)/i.test(value))
export const NODE_TERMINAL_LIMITS = {
  outputRingBytes: 256 * 1024,
  outputFrameBytes: 32 * 1024,
  inputFrameBytes: 32 * 1024,
  maxSessions: 8,
  maxRetainedSessions: 64,
  maxDimension: 500,
} as const

/** Operator opened terminals are explicitly scoped and never inherit A-side process settings. */
export const nodeTerminalScopeSchema = z.strictObject({
  nodeId: id,
  rootId,
  sessionId: id,
  ownerDeviceId: id,
})
export const nodeTerminalOpenSchema = z.strictObject({
  operationId: id,
  scope: nodeTerminalScopeSchema,
  sandbox: sandboxSnapshotRefSchema,
  cwd: relativePath.default('.'),
  cols: z.number().int().min(2).max(NODE_TERMINAL_LIMITS.maxDimension),
  rows: z.number().int().min(2).max(NODE_TERMINAL_LIMITS.maxDimension),
})
export const nodeTerminalInputSchema = z.strictObject({
  terminalId: id,
  scope: nodeTerminalScopeSchema,
  data: z
    .string()
    .min(1)
    .max(NODE_TERMINAL_LIMITS.inputFrameBytes)
    .refine((value) => new TextEncoder().encode(value).byteLength <= NODE_TERMINAL_LIMITS.inputFrameBytes),
})
export const nodeTerminalResizeSchema = z.strictObject({
  terminalId: id,
  scope: nodeTerminalScopeSchema,
  cols: z.number().int().min(2).max(NODE_TERMINAL_LIMITS.maxDimension),
  rows: z.number().int().min(2).max(NODE_TERMINAL_LIMITS.maxDimension),
})
export const nodeTerminalCloseSchema = z.strictObject({ terminalId: id, scope: nodeTerminalScopeSchema })
export const nodeTerminalOutputSchema = z.strictObject({
  terminalId: id,
  afterSeq: z.number().int().min(0),
  nextSeq: z.number().int().min(0),
  reset: z.boolean(),
  closed: z.boolean(),
  frames: z
    .array(
      z.strictObject({ seq: z.number().int().positive(), data: z.string().max(NODE_TERMINAL_LIMITS.outputFrameBytes) }),
    )
    .max(32),
})
export const nodeTerminalInfoSchema = z.strictObject({
  terminalId: id,
  scope: nodeTerminalScopeSchema,
  cwd: relativePath,
  cols: z.number().int(),
  rows: z.number().int(),
  startedAt: z.string().datetime(),
  backend: z.enum(['bwrap', 'seatbelt']),
})
export const nodeTerminalMethods = {
  'terminal.open': { input: nodeTerminalOpenSchema, output: nodeTerminalInfoSchema },
  'terminal.input': { input: nodeTerminalInputSchema, output: z.strictObject({ accepted: z.literal(true) }) },
  'terminal.resize': { input: nodeTerminalResizeSchema, output: z.strictObject({ accepted: z.literal(true) }) },
  'terminal.output': {
    input: z.strictObject({
      terminalId: id,
      scope: nodeTerminalScopeSchema,
      afterSeq: z.number().int().min(0),
      creditBytes: z
        .number()
        .int()
        .min(NODE_TERMINAL_LIMITS.outputFrameBytes)
        .max(NODE_TERMINAL_LIMITS.outputFrameBytes * 2)
        .default(NODE_TERMINAL_LIMITS.outputFrameBytes * 2),
    }),
    output: nodeTerminalOutputSchema,
  },
  'terminal.close': { input: nodeTerminalCloseSchema, output: z.strictObject({ closed: z.boolean() }) },
} as const
export type NodeTerminalScope = z.infer<typeof nodeTerminalScopeSchema>
export type NodeTerminalOpen = z.infer<typeof nodeTerminalOpenSchema>
export type NodeTerminalInfo = z.infer<typeof nodeTerminalInfoSchema>
