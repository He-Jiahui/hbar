import { createHash } from 'node:crypto'
import { z } from 'zod'
import { NODE_LIMITS } from '@hbar/contracts/node'

const argumentSchema = z
  .string()
  .max(NODE_LIMITS.commandCharacters)
  .refine((value) => !value.includes('\0'))
const argvSchema = z
  .tuple([argumentSchema.min(1)])
  .rest(argumentSchema)
  .refine((argv) => argv.length <= 128)
  .refine((argv) => argv.reduce((bytes, argument) => bytes + Buffer.byteLength(argument, 'utf8'), 0) <= 65_536)

export const nodeProcessOperationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('command'), command: z.string().min(1).max(NODE_LIMITS.commandCharacters) }),
  z.strictObject({ kind: z.literal('argv'), argv: argvSchema }),
])
export const nodeProcessInputSchema = z.strictObject({
  workspace: z.string().min(1).max(4_000),
  operation: nodeProcessOperationSchema,
  timeoutMs: z.number().int().positive().max(1_200_000),
  environment: z
    .record(z.string().max(256), z.string().max(32_768))
    .refine((value) => Object.keys(value).length <= 256),
  confinement: z
    .strictObject({
      backend: z.enum(['bwrap', 'seatbelt']).optional(),
      level: z.enum(['unelevated', 'elevated']),
      readableRoots: z.array(z.string().min(1).max(4_000)).max(256),
      writableRoots: z.array(z.string().min(1).max(4_000)).max(256),
      networkEnabled: z.boolean(),
      envOverrides: z.record(z.string().min(1).max(256), z.string().max(16_000)),
    })
    .nullable(),
  protectedPaths: z.array(z.string().min(1).max(4_000)).max(256),
  readOnlyPaths: z.array(z.string().min(1).max(4_000)).max(256).default([]),
  workspaceMounts: z
    .array(
      z.strictObject({
        rootId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
        expectedRoot: z.string().min(1).max(4_000),
        sourceRoot: z.string().min(1).max(4_000),
        alias: z.string().regex(/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u),
        target: z.string().min(1).max(4_000),
        access: z.enum(['read', 'write']),
        writePaths: z
          .array(z.strictObject({ sourcePath: z.string().min(1).max(4_000), targetPath: z.string().min(1).max(4_000) }))
          .max(128)
          .default([]),
        readOnlyPaths: z
          .array(z.strictObject({ sourcePath: z.string().min(1).max(4_000), targetPath: z.string().min(1).max(4_000) }))
          .max(128)
          .default([]),
        protectedPaths: z
          .array(z.strictObject({ sourcePath: z.string().min(1).max(4_000), targetPath: z.string().min(1).max(4_000) }))
          .max(256)
          .default([]),
      }),
    )
    .max(32)
    .default([]),
  internalMounts: z
    .array(
      z.strictObject({
        kind: z.enum(['managed-worktree', 'common-git', 'worktree-metadata']),
        worktreeId: z.string().regex(/^[a-f0-9]{32}$/),
        parentRootId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
        sourcePath: z.string().min(1).max(4_000),
        targetPath: z.string().min(1).max(4_000),
        access: z.enum(['read', 'write']),
      }),
    )
    .max(3)
    .default([]),
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
export const nodeArgvOutputSchema = z.strictObject({
  stdout: z.string().max(NODE_LIMITS.outputBytes),
  stderr: z.string().max(NODE_LIMITS.outputBytes),
  exitCode: z.number().int(),
  truncated: z.boolean(),
  timedOut: z.boolean().optional(),
})
export const nodeProcessOutputReadInputSchema = z.strictObject({ afterSeq: z.number().int().nonnegative().safe() })
export const nodeProcessOutputReadResultSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        seq: z.number().int().positive().safe(),
        text: z
          .string()
          .min(1)
          .max(8 * 1024),
      }),
    )
    .max(32),
  cursor: z.number().int().nonnegative().safe(),
  reset: z.boolean(),
  active: z.boolean(),
})
export const NODE_PROCESS_FINGERPRINT = createHash('sha256')
  .update('hbar.node.execution.v4')
  .update(JSON.stringify(z.toJSONSchema(nodeProcessInputSchema)))
  .update(JSON.stringify(z.toJSONSchema(nodeProcessOutputSchema)))
  .update(JSON.stringify(z.toJSONSchema(nodeArgvOutputSchema)))
  .update(JSON.stringify(z.toJSONSchema(nodeProcessOutputReadInputSchema)))
  .update(JSON.stringify(z.toJSONSchema(nodeProcessOutputReadResultSchema)))
  .digest('hex')
