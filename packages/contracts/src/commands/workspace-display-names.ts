import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'

export const WORKSPACE_DISPLAY_NAMES_MAX_ENTRIES = 2_000
export const WORKSPACE_DISPLAY_NAMES_MAX_BYTES = 256 * 1_024
export const WORKSPACE_DISPLAY_NAME_MAX_LENGTH = 80
const revisionSchema = z.number().int().nonnegative().safe()

/** A single-line display label, measured in UTF-16 code units, never a filesystem path. */
export const workspaceDisplayNameSchema = z
  .string()
  .min(1)
  .max(WORKSPACE_DISPLAY_NAME_MAX_LENGTH)
  .refine((value) => value.length <= WORKSPACE_DISPLAY_NAME_MAX_LENGTH, {
    message: 'Workspace display name exceeds its UTF-16 length budget',
  })
  .refine((value) => value === value.trim() && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value), {
    message: 'Workspace display name must be trimmed and single-line without control characters',
  })
  .refine((value) => !/[\p{Cs}\p{Bidi_Control}]/u.test(value) && /[^\p{White_Space}\p{Cf}\p{M}]/u.test(value), {
    message: 'Workspace display name must contain visible text and well-formed Unicode without bidi controls',
  })

/** Independent from directory identity and workspaceOrganization v1; Host/data-root owned. */
export const workspaceDisplayNamesSnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    revision: revisionSchema,
    entries: z
      .array(z.strictObject({ workspaceId: idSchema, displayName: workspaceDisplayNameSchema }))
      .max(WORKSPACE_DISPLAY_NAMES_MAX_ENTRIES),
  })
  .refine((value) => new Set(value.entries.map((entry) => entry.workspaceId)).size === value.entries.length, {
    message: 'Workspace display name IDs must be unique',
  })
  .refine((value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= WORKSPACE_DISPLAY_NAMES_MAX_BYTES, {
    message: 'Workspace display names snapshot exceeds its byte budget',
  })

/** null removes only this alias. Both captured version and captured alias must match. */
export const workspaceDisplayNamesApplyInputSchema = z.strictObject({
  expectedRevision: revisionSchema,
  workspaceId: idSchema,
  expectedDisplayName: workspaceDisplayNameSchema.nullable(),
  displayName: workspaceDisplayNameSchema.nullable(),
})

/** Exact historical acknowledgement, never evidence of the current display name. */
export const workspaceDisplayNamesReceiptSchema = z
  .strictObject({
    commitId: idSchema,
    revision: revisionSchema,
    request: workspaceDisplayNamesApplyInputSchema,
    changed: z.boolean(),
  })
  .refine((value) => value.revision === value.request.expectedRevision + (value.changed ? 1 : 0), {
    message: 'Receipt revision must describe exactly this commit',
  })
  .refine((value) => value.changed === (value.request.expectedDisplayName !== value.request.displayName), {
    message: 'Receipt change must agree with the captured display name',
  })

export const workspaceDisplayNamesReceiptInputSchema = z.strictObject({
  idempotencyKey: z.string().min(1).max(128),
  request: workspaceDisplayNamesApplyInputSchema,
})

export type WorkspaceDisplayNamesSnapshot = z.infer<typeof workspaceDisplayNamesSnapshotSchema>
export type WorkspaceDisplayNamesApplyInput = z.infer<typeof workspaceDisplayNamesApplyInputSchema>
export type WorkspaceDisplayNamesReceipt = z.infer<typeof workspaceDisplayNamesReceiptSchema>
export type WorkspaceDisplayNamesReceiptInput = z.infer<typeof workspaceDisplayNamesReceiptInputSchema>

export function workspaceDisplayNamesRequestsEqual(
  left: WorkspaceDisplayNamesApplyInput,
  right: WorkspaceDisplayNamesApplyInput,
): boolean {
  return (
    left.expectedRevision === right.expectedRevision &&
    left.workspaceId === right.workspaceId &&
    left.expectedDisplayName === right.expectedDisplayName &&
    left.displayName === right.displayName
  )
}

const metadata = (id: string, kind: 'command' | 'query') => ({
  id,
  version: 1,
  owner: 'hbar.workspace-display-names',
  kind,
  execution: 'host' as const,
  stateEffect: kind === 'command' ? ('persistent' as const) : ('none' as const),
  category: 'workspace.display-names',
  scope: 'global' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  visibility: 'internal' as const,
  surfaces: ['api'] as 'api'[],
})

export const workspaceDisplayNamesCommands = {
  'workspaceDisplayNames.get': defineCommand(
    metadata('workspaceDisplayNames.get', 'query'),
    z.strictObject({}),
    workspaceDisplayNamesSnapshotSchema,
  ),
  'workspaceDisplayNames.apply': defineCommand(
    { ...metadata('workspaceDisplayNames.apply', 'command'), idempotency: 'required' },
    workspaceDisplayNamesApplyInputSchema,
    workspaceDisplayNamesReceiptSchema,
  ),
  'workspaceDisplayNames.receipt': defineCommand(
    metadata('workspaceDisplayNames.receipt', 'query'),
    workspaceDisplayNamesReceiptInputSchema,
    workspaceDisplayNamesReceiptSchema.nullable(),
  ),
}
