import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'

const revisionSchema = z.number().int().nonnegative().safe()
const branchNameSchema = z.string().trim().min(1).max(1_000)
const localBranchRefSchema = z
  .string()
  .min('refs/heads/'.length + 1)
  .max(1_011)
  .startsWith('refs/heads/')
export const sessionLaunchDerivedBranchNameSchema = z.string().regex(/^hbar\/session-launch\/[0-9a-f]{64}$/)

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

/** Paths stay Host-owned; a shared branch choice captures the local ref and its observed tip. */
export const sessionLaunchSelectionSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('shared-current') }),
  z.strictObject({
    mode: z.literal('shared-branch'),
    branch: z.strictObject({
      ref: localBranchRefSchema,
      tipOid: z
        .string()
        .regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i)
        .toLowerCase(),
    }),
  }),
  z.strictObject({
    mode: z.literal('isolated-worktree'),
    branch: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('existing'), name: branchNameSchema }),
      z.strictObject({
        kind: z.literal('new'),
        name: branchNameSchema,
        startPoint: branchNameSchema.optional(),
      }),
      z.strictObject({ kind: z.literal('derived'), baseRef: localBranchRefSchema }),
    ]),
  }),
])

/** A revisioned user choice. Filesystem paths are deliberately absent from the client contract. */
export const sessionLaunchTargetSchema = z
  .strictObject({
    sessionId: idSchema,
    workspaceId: idSchema,
    revision: revisionSchema,
    selection: sessionLaunchSelectionSchema,
    locked: z.boolean(),
    resolution: sessionLaunchTargetResolutionSchema,
    updatedAt: z.number().int().nonnegative(),
  })
  .superRefine((target, context) => {
    if (target.resolution.status !== 'ready') return
    if (target.selection.mode === 'shared-current') {
      if (target.resolution.branch !== null)
        context.addIssue({ code: 'custom', path: ['resolution', 'branch'], message: 'Shared targets have no branch' })
      return
    }
    if (target.selection.mode === 'shared-branch') {
      if (target.resolution.branch !== target.selection.branch.ref.slice('refs/heads/'.length))
        context.addIssue({
          code: 'custom',
          path: ['resolution', 'branch'],
          message: 'Resolved shared branch must match the captured local ref',
        })
      return
    }
    if (target.selection.branch.kind === 'derived') {
      if (!sessionLaunchDerivedBranchNameSchema.safeParse(target.resolution.branch).success)
        context.addIssue({
          code: 'custom',
          path: ['resolution', 'branch'],
          message: 'Derived targets must resolve to their generated branch',
        })
      return
    }
    if (target.resolution.branch !== target.selection.branch.name)
      context.addIssue({
        code: 'custom',
        path: ['resolution', 'branch'],
        message: 'Resolved branch must match the selected branch',
      })
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
export const sessionLaunchTargetPreparationStartInputSchema = z.strictObject({
  sessionId: idSchema,
  expectedRevision: revisionSchema,
})
export const sessionLaunchTargetPreparationStartReceiptSchema = z.strictObject({
  operationId: idSchema,
  sessionId: idSchema,
  workspaceId: idSchema,
  targetRevision: revisionSchema,
})
export const sessionLaunchTargetPreparationOperationInputSchema = z.strictObject({
  sessionId: idSchema,
  expectedRevision: revisionSchema,
  operationId: idSchema,
})
const preparationOperationFields = {
  schemaVersion: z.literal(1),
  operationId: idSchema,
  sessionId: idSchema,
  workspaceId: idSchema,
  targetRevision: revisionSchema,
  operationVersion: z.number().int().positive().safe(),
  createdAt: z.number().int().nonnegative().safe(),
  updatedAt: z.number().int().nonnegative().safe(),
}
const preparationOperationErrorSchema = z.strictObject({
  code: z.string().min(1).max(128),
  message: z.string().max(1_000),
})
export const sessionLaunchTargetPreparationSnapshotSchema = z.discriminatedUnion('status', [
  z.strictObject({ ...preparationOperationFields, status: z.literal('queued') }),
  z.strictObject({ ...preparationOperationFields, status: z.literal('preparing') }),
  z.strictObject({ ...preparationOperationFields, status: z.literal('cancel-requested') }),
  z.strictObject({ ...preparationOperationFields, status: z.literal('ready') }),
  z.strictObject({ ...preparationOperationFields, status: z.literal('cancelled') }),
  z.strictObject({
    ...preparationOperationFields,
    status: z.literal('reconciling'),
    error: preparationOperationErrorSchema,
  }),
  z.strictObject({
    ...preparationOperationFields,
    status: z.literal('failed'),
    error: preparationOperationErrorSchema,
  }),
])

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
export type SessionLaunchTargetPreparationStartInput = z.infer<typeof sessionLaunchTargetPreparationStartInputSchema>
export type SessionLaunchTargetPreparationStartReceipt = z.infer<
  typeof sessionLaunchTargetPreparationStartReceiptSchema
>
export type SessionLaunchTargetPreparationOperationInput = z.infer<
  typeof sessionLaunchTargetPreparationOperationInputSchema
>
export type SessionLaunchTargetPreparationSnapshot = z.infer<typeof sessionLaunchTargetPreparationSnapshotSchema>

/** A read-only capability; callers cannot choose a filesystem root or mutate a target. */
export interface SessionLaunchTargetReadOptions {
  readonly signal?: AbortSignal
  readonly requestId?: string
}
export interface SessionLaunchTargetReader {
  read(sessionId: string, options?: SessionLaunchTargetReadOptions): Promise<SessionLaunchTarget>
}

export interface SessionLaunchTargetWriteOptions extends SessionLaunchTargetReadOptions {
  readonly idempotencyKey: string
}

export interface SessionLaunchTargetPreparationManager {
  readTarget(sessionId: string, options?: SessionLaunchTargetReadOptions): Promise<SessionLaunchTarget>
  setSelection(
    input: SessionLaunchTargetSetInput,
    options: SessionLaunchTargetWriteOptions,
  ): Promise<SessionLaunchTargetSetReceipt>
  readSelectionReceipt(
    input: SessionLaunchTargetReceiptInput,
    options?: SessionLaunchTargetReadOptions,
  ): Promise<SessionLaunchTargetSetReceipt | null>
  startPreparation(
    input: SessionLaunchTargetPreparationStartInput,
    options: SessionLaunchTargetWriteOptions,
  ): Promise<SessionLaunchTargetPreparationStartReceipt>
  readPreparation(
    input: SessionLaunchTargetPreparationOperationInput,
    options?: SessionLaunchTargetReadOptions,
  ): Promise<SessionLaunchTargetPreparationSnapshot>
  cancelPreparation(
    input: SessionLaunchTargetPreparationOperationInput,
    options: SessionLaunchTargetWriteOptions,
  ): Promise<SessionLaunchTargetPreparationSnapshot>
  reconcilePreparation(
    input: SessionLaunchTargetPreparationOperationInput,
    options: SessionLaunchTargetWriteOptions,
  ): Promise<SessionLaunchTargetPreparationSnapshot>
}

const metadata = (id: string, kind: 'query' | 'command') => ({
  id,
  version: 3,
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
  'sessionLaunchTarget.startPreparation': defineCommand(
    {
      ...metadata('sessionLaunchTarget.startPreparation', 'command'),
      stateEffect: 'external',
      timeoutMs: 10_000,
      idempotency: 'required',
    },
    sessionLaunchTargetPreparationStartInputSchema,
    sessionLaunchTargetPreparationStartReceiptSchema,
  ),
  'sessionLaunchTarget.preparation': defineCommand(
    { ...metadata('sessionLaunchTarget.preparation', 'query'), timeoutMs: 10_000 },
    sessionLaunchTargetPreparationOperationInputSchema,
    sessionLaunchTargetPreparationSnapshotSchema,
  ),
  'sessionLaunchTarget.cancelPreparation': defineCommand(
    {
      ...metadata('sessionLaunchTarget.cancelPreparation', 'command'),
      stateEffect: 'external',
      timeoutMs: 10_000,
      idempotency: 'required',
    },
    sessionLaunchTargetPreparationOperationInputSchema,
    sessionLaunchTargetPreparationSnapshotSchema,
  ),
  'sessionLaunchTarget.reconcilePreparation': defineCommand(
    {
      ...metadata('sessionLaunchTarget.reconcilePreparation', 'command'),
      stateEffect: 'external',
      timeoutMs: 10_000,
      idempotency: 'required',
    },
    sessionLaunchTargetPreparationOperationInputSchema,
    sessionLaunchTargetPreparationSnapshotSchema,
  ),
}
