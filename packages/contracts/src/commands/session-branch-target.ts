import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'

const revision = z.number().int().nonnegative().safe()
const ref = z.string().min(12).max(1_011).startsWith('refs/heads/')
const oid = z
  .string()
  .regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i)
  .toLowerCase()
const name = z.string().trim().min(1).max(1_000)
const execution = z.strictObject({
  /** Informational only: clients cannot submit an execution path. */
  path: z.string().min(1).max(4_000),
  kind: z.enum(['checkout', 'worktree']),
  branch: name.nullable(),
})

export const sessionBranchTargetListInputSchema = z.strictObject({
  sessionId: idSchema,
  workspaceId: idSchema,
  search: z.string().max(256).default(''),
  limit: z.number().int().min(1).max(50).default(25),
  cursor: z.string().min(1).max(2_048).optional(),
})
export const sessionBranchTargetPageSchema = z.strictObject({
  sessionId: idSchema,
  workspaceId: idSchema,
  revision,
  execution,
  /** Current creation base remains available even outside the visible branch page. */
  base: z.strictObject({ name, ref, tipOid: oid }).nullable(),
  branches: z
    .array(
      z
        .strictObject({
          name,
          ref,
          tipOid: oid,
          current: z.boolean(),
          /** A registered local worktree is an available directory, rather than a disabled branch. */
          worktreePath: z.string().min(1).max(4_000).nullable(),
        })
        .refine((branch) => branch.ref === `refs/heads/${branch.name}`),
    )
    .max(50),
  nextCursor: z.string().min(1).max(2_048).nullable(),
  incomplete: z.boolean(),
  /** Recovers the original key after reload; another actor's key is never exposed. */
  pending: z
    .strictObject({
      operationId: idSchema,
      owned: z.boolean(),
      idempotencyKey: z.string().min(1).max(128).optional(),
      request: z.lazy(() => sessionBranchTargetSelectInputSchema).optional(),
    })
    .refine((value) =>
      value.owned
        ? value.idempotencyKey !== undefined && value.request !== undefined
        : value.idempotencyKey === undefined && value.request === undefined,
    )
    .nullable(),
})
export const sessionBranchTargetChoiceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('branch'), ref, expectedOid: oid }),
  z.strictObject({ kind: z.literal('new-branch'), name, baseRef: ref, expectedBaseOid: oid }),
  z.strictObject({ kind: z.literal('new-worktree'), name, baseRef: ref, expectedBaseOid: oid }),
])
export const sessionBranchTargetSelectInputSchema = z.strictObject({
  sessionId: idSchema,
  workspaceId: idSchema,
  expectedRevision: revision,
  choice: sessionBranchTargetChoiceSchema,
})
export const sessionBranchTargetOperationInputSchema = z.strictObject({
  sessionId: idSchema,
  idempotencyKey: z.string().min(1).max(128),
})
export const sessionBranchTargetOperationSchema = z
  .strictObject({
    operationId: idSchema,
    request: sessionBranchTargetSelectInputSchema,
    status: z.enum(['switching', 'unknown', 'ready', 'failed']),
    revision: revision,
    execution: execution.nullable(),
    error: z.strictObject({ code: z.string().min(1).max(128), message: z.string().max(1_000) }).nullable(),
  })
  .superRefine((value, context) => {
    if (value.revision !== value.request.expectedRevision + Number(value.status === 'ready'))
      context.addIssue({ code: 'custom', path: ['revision'], message: 'Operation revision must match its result' })
    if ((value.status === 'ready') !== (value.execution !== null))
      context.addIssue({
        code: 'custom',
        path: ['execution'],
        message: 'Only a committed operation has an execution target',
      })
    if ((value.status === 'failed' || value.status === 'unknown') !== (value.error !== null))
      context.addIssue({
        code: 'custom',
        path: ['error'],
        message: 'Unconfirmed and failed operations require an error',
      })
  })

export type SessionBranchTargetPage = z.infer<typeof sessionBranchTargetPageSchema>
export type SessionBranchTargetSelectInput = z.infer<typeof sessionBranchTargetSelectInputSchema>
export type SessionBranchTargetOperation = z.infer<typeof sessionBranchTargetOperationSchema>

const metadata = (id: string, mutation = false) => ({
  id,
  version: 1,
  owner: 'hbar.session-branch-target',
  kind: mutation ? ('command' as const) : ('query' as const),
  execution: 'host' as const,
  stateEffect: mutation ? ('external' as const) : ('none' as const),
  scope: 'session' as const,
  category: 'workspace.session-branch-target',
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  visibility: 'internal' as const,
  surfaces: ['api'] as 'api'[],
  timeoutMs: mutation ? 90_000 : 15_000,
  maxConcurrent: 4,
  cancelMode: 'cooperative' as const,
  ...(mutation ? { idempotency: 'required' as const } : {}),
})
export const sessionBranchTargetCommands = {
  'sessionBranchTarget.list': defineCommand(
    metadata('sessionBranchTarget.list'),
    sessionBranchTargetListInputSchema,
    sessionBranchTargetPageSchema,
  ),
  'sessionBranchTarget.select': defineCommand(
    metadata('sessionBranchTarget.select', true),
    sessionBranchTargetSelectInputSchema,
    sessionBranchTargetOperationSchema,
  ),
  'sessionBranchTarget.operation': defineCommand(
    metadata('sessionBranchTarget.operation'),
    sessionBranchTargetOperationInputSchema,
    sessionBranchTargetOperationSchema.nullable(),
  ),
  'sessionBranchTarget.reconcile': defineCommand(
    metadata('sessionBranchTarget.reconcile', true),
    sessionBranchTargetOperationInputSchema,
    sessionBranchTargetOperationSchema,
  ),
}
