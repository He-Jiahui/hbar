import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'

export const WORKSPACE_ORGANIZATION_MAX_HIDDEN = 2_000
export const WORKSPACE_ORGANIZATION_MAX_BYTES = 128 * 1_024
const revisionSchema = z.number().int().nonnegative().safe()
const idempotencyKeySchema = z.string().min(1).max(128)

/** Host/data-root owned presentation state; hiding never archives or deletes a workspace. */
export const workspaceOrganizationSnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    revision: revisionSchema,
    hiddenWorkspaceIds: z.array(idSchema).max(WORKSPACE_ORGANIZATION_MAX_HIDDEN),
  })
  .refine((value) => new Set(value.hiddenWorkspaceIds).size === value.hiddenWorkspaceIds.length, {
    message: 'Hidden workspace IDs must be unique',
  })
  .refine((value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= WORKSPACE_ORGANIZATION_MAX_BYTES, {
    message: 'Workspace organization snapshot exceeds its byte budget',
  })

/** Both revision and the captured item state must match; callers must not silently overwrite a conflict. */
export const workspaceOrganizationApplyInputSchema = z.strictObject({
  expectedRevision: revisionSchema,
  change: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('setHidden'),
      workspaceId: idSchema,
      expectedHidden: z.boolean(),
      hidden: z.boolean(),
    }),
    z.strictObject({ kind: z.literal('restoreHidden') }),
  ]),
})

/** A durable acknowledgement, not a current snapshot: later commits may already have changed the state. */
export const workspaceOrganizationReceiptSchema = z
  .strictObject({
    commitId: idSchema,
    revision: revisionSchema,
    request: workspaceOrganizationApplyInputSchema,
    changed: z.boolean(),
  })
  .refine((receipt) => receipt.revision === receipt.request.expectedRevision + (receipt.changed ? 1 : 0), {
    message: 'Receipt revision must describe exactly this commit',
  })
  .refine(
    (receipt) =>
      receipt.request.change.kind !== 'setHidden' ||
      receipt.changed === (receipt.request.change.expectedHidden !== receipt.request.change.hidden),
    {
      message: 'Receipt change must agree with the captured item state',
    },
  )

export const workspaceOrganizationReceiptInputSchema = z.strictObject({
  idempotencyKey: idempotencyKeySchema,
  request: workspaceOrganizationApplyInputSchema,
})

export type WorkspaceOrganizationSnapshot = z.infer<typeof workspaceOrganizationSnapshotSchema>
export type WorkspaceOrganizationApplyInput = z.infer<typeof workspaceOrganizationApplyInputSchema>
export type WorkspaceOrganizationReceipt = z.infer<typeof workspaceOrganizationReceiptSchema>
export type WorkspaceOrganizationReceiptInput = z.infer<typeof workspaceOrganizationReceiptInputSchema>

export function workspaceOrganizationRequestsEqual(
  left: WorkspaceOrganizationApplyInput,
  right: WorkspaceOrganizationApplyInput,
): boolean {
  if (left.expectedRevision !== right.expectedRevision || left.change.kind !== right.change.kind) return false
  if (left.change.kind === 'restoreHidden') return true
  return (
    right.change.kind === 'setHidden' &&
    left.change.workspaceId === right.change.workspaceId &&
    left.change.expectedHidden === right.change.expectedHidden &&
    left.change.hidden === right.change.hidden
  )
}

const metadata = (id: string, kind: 'command' | 'query') => ({
  id,
  version: 1,
  owner: 'hbar.workspace-organization',
  kind,
  execution: 'host' as const,
  stateEffect: kind === 'command' ? ('persistent' as const) : ('none' as const),
  category: 'workspace.organization',
  scope: 'global' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  visibility: 'internal' as const,
  surfaces: ['api'] as 'api'[],
})

export const workspaceOrganizationCommands = {
  'workspaceOrganization.get': defineCommand(
    metadata('workspaceOrganization.get', 'query'),
    z.strictObject({}),
    workspaceOrganizationSnapshotSchema,
  ),
  'workspaceOrganization.apply': defineCommand(
    { ...metadata('workspaceOrganization.apply', 'command'), idempotency: 'required' },
    workspaceOrganizationApplyInputSchema,
    workspaceOrganizationReceiptSchema,
  ),
  'workspaceOrganization.receipt': defineCommand(
    metadata('workspaceOrganization.receipt', 'query'),
    workspaceOrganizationReceiptInputSchema,
    workspaceOrganizationReceiptSchema.nullable(),
  ),
}
