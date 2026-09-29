import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'

const revisionSchema = z.number().int().nonnegative().safe()
const branchNameSchema = z.string().trim().min(1).max(1_000)

export const sessionLaunchTargetResolutionSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('idle') }),
  z.strictObject({ status: z.literal('preparing') }),
  z.strictObject({ status: z.literal('ready'), branch: z.string().nullable() }),
  z.strictObject({
    status: z.literal('reconciling'),
    code: z.string().min(1).max(128),
    message: z.string().max(1_000),
  }),
  z.strictObject({ status: z.literal('cancelled'), code: z.string().min(1).max(128), message: z.string().max(1_000) }),
  z.strictObject({ status: z.literal('failed'), code: z.string().min(1).max(128), message: z.string().max(1_000) }),
])

/** Only a Host-derived shared checkout or an isolated session worktree can be selected. */
export const sessionLaunchSelectionSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('shared-current') }),
  z.strictObject({
    mode: z.literal('isolated-worktree'),
    branch: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('existing'), name: branchNameSchema }),
      z.strictObject({
        kind: z.literal('new'),
        name: branchNameSchema,
        startPoint: branchNameSchema.optional(),
      }),
    ]),
  }),
])

/** A revisioned user choice. Filesystem paths are deliberately absent from the client contract. */
export const sessionLaunchTargetSchema = z.strictObject({
  sessionId: idSchema,
  workspaceId: idSchema,
  revision: revisionSchema,
  selection: sessionLaunchSelectionSchema,
  locked: z.boolean(),
  resolution: sessionLaunchTargetResolutionSchema,
  updatedAt: z.number().int().nonnegative(),
})

export const sessionLaunchTargetGetInputSchema = z.strictObject({ sessionId: idSchema })
export const sessionLaunchTargetSetInputSchema = z.strictObject({
  sessionId: idSchema,
  expectedRevision: revisionSchema,
  selection: sessionLaunchSelectionSchema,
})
export const sessionLaunchTargetReceiptInputSchema = z.strictObject({
  sessionId: idSchema,
  idempotencyKey: z.string().min(1).max(128),
})
export const sessionLaunchTargetPrepareInputSchema = z.strictObject({
  sessionId: idSchema,
  expectedRevision: revisionSchema,
})
export const sessionLaunchTargetReconcileInputSchema = z.strictObject({
  sessionId: idSchema,
  expectedRevision: revisionSchema,
})
export const sessionLaunchTargetCancelInputSchema = z.strictObject({
  sessionId: idSchema,
  expectedRevision: revisionSchema,
})

export const sessionLaunchTargetSetReceiptSchema = z
  .strictObject({
    commitId: idSchema,
    request: sessionLaunchTargetSetInputSchema,
    revision: revisionSchema,
    changed: z.boolean(),
    updatedAt: z.number().int().nonnegative(),
  })
  .refine((value) => value.revision === value.request.expectedRevision + Number(value.changed), {
    message: 'Receipt revision must describe exactly this launch-target selection',
  })

export type SessionLaunchSelection = z.infer<typeof sessionLaunchSelectionSchema>
export type SessionLaunchTarget = z.infer<typeof sessionLaunchTargetSchema>
export type SessionLaunchTargetGetInput = z.infer<typeof sessionLaunchTargetGetInputSchema>
export type SessionLaunchTargetSetInput = z.infer<typeof sessionLaunchTargetSetInputSchema>
export type SessionLaunchTargetSetReceipt = z.infer<typeof sessionLaunchTargetSetReceiptSchema>
export type SessionLaunchTargetReceiptInput = z.infer<typeof sessionLaunchTargetReceiptInputSchema>
export type SessionLaunchTargetResolution = z.infer<typeof sessionLaunchTargetResolutionSchema>
export type SessionLaunchTargetPrepareInput = z.infer<typeof sessionLaunchTargetPrepareInputSchema>
export type SessionLaunchTargetReconcileInput = z.infer<typeof sessionLaunchTargetReconcileInputSchema>
export type SessionLaunchTargetCancelInput = z.infer<typeof sessionLaunchTargetCancelInputSchema>

/** A read-only capability; callers cannot choose a filesystem root or mutate a target. */
export interface SessionLaunchTargetReadOptions {
  readonly signal?: AbortSignal
  readonly requestId?: string
}
export interface SessionLaunchTargetReader {
  read(sessionId: string, options?: SessionLaunchTargetReadOptions): Promise<SessionLaunchTarget>
}

const metadata = (id: string, kind: 'query' | 'command') => ({
  id,
  version: 1,
  owner: 'hbar.session-launch-target',
  kind,
  execution: 'host' as const,
  stateEffect: kind === 'query' ? ('none' as const) : ('persistent' as const),
  category: 'workspace.session-launch-target',
  scope: 'session' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  visibility: 'internal' as const,
  surfaces: ['api'] as 'api'[],
})

export const sessionLaunchTargetCommands = {
  'sessionLaunchTarget.get': defineCommand(
    metadata('sessionLaunchTarget.get', 'query'),
    sessionLaunchTargetGetInputSchema,
    sessionLaunchTargetSchema,
  ),
  'sessionLaunchTarget.set': defineCommand(
    { ...metadata('sessionLaunchTarget.set', 'command'), idempotency: 'required' },
    sessionLaunchTargetSetInputSchema,
    sessionLaunchTargetSetReceiptSchema,
  ),
  'sessionLaunchTarget.receipt': defineCommand(
    metadata('sessionLaunchTarget.receipt', 'query'),
    sessionLaunchTargetReceiptInputSchema,
    sessionLaunchTargetSetReceiptSchema.nullable(),
  ),
  'sessionLaunchTarget.prepare': defineCommand(
    {
      ...metadata('sessionLaunchTarget.prepare', 'command'),
      stateEffect: 'external',
      cancelMode: 'cooperative',
      timeoutMs: 120_000,
      idempotency: 'required',
    },
    sessionLaunchTargetPrepareInputSchema,
    sessionLaunchTargetSchema,
  ),
  'sessionLaunchTarget.reconcile': defineCommand(
    {
      ...metadata('sessionLaunchTarget.reconcile', 'command'),
      stateEffect: 'external',
      cancelMode: 'cooperative',
      timeoutMs: 120_000,
      idempotency: 'required',
    },
    sessionLaunchTargetReconcileInputSchema,
    sessionLaunchTargetSchema,
  ),
  'sessionLaunchTarget.cancel': defineCommand(
    {
      ...metadata('sessionLaunchTarget.cancel', 'command'),
      stateEffect: 'external',
      cancelMode: 'cooperative',
      timeoutMs: 120_000,
      idempotency: 'required',
    },
    sessionLaunchTargetCancelInputSchema,
    sessionLaunchTargetSchema,
  ),
}
