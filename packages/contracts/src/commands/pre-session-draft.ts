import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { approvalModeSchema, idSchema, thinkingLevelSchema, type ThinkingLevel } from '../index'
import {
  sessionLaunchSelectionSchema,
  sessionLaunchTargetPreparationSnapshotSchema,
  type SessionLaunchSelection,
} from './session-launch-target'
import {
  attachmentReservationTargetSchema,
  attachmentSelectionReservationSchema,
  draftAttachmentTransferSchema,
  promptAttachmentSchema,
} from './draft'
import { attachmentUploadInputSchema } from './files'
import { runAcceptedSchema } from './run'

const metadata = (id: string, kind: 'command' | 'query' = 'command') => ({
  id,
  version: 1,
  owner: 'hbar.pre-session-draft',
  kind,
  execution: 'client' as const,
  stateEffect: kind === 'query' ? ('none' as const) : ('application' as const),
  category: 'run.draft',
  scope: 'client' as const,
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
})

const draftId = z.string().uuid()
const revision = z.number().int().nonnegative()
const workspaceId = idSchema.nullable()
const attachmentDraftResultSchema = z.strictObject({ draftId, revision })
const attachmentTarget = z.strictObject({ draftId }).merge(attachmentReservationTargetSchema)
export const preSessionApprovalChoiceSchema = z.enum(['inherit', ...approvalModeSchema.options])
export const preSessionPlanModeSchema = z.enum(['default', 'plan'])
export const preSessionIntentSchema = z.enum(['default', 'goal'])
const result = z.strictObject({ draftId, revision })

export const preSessionLaunchPreparationStateSchema = z.strictObject({
  phase: z.enum([
    'idle',
    'selection',
    'starting',
    'queued',
    'preparing',
    'cancel-requested',
    'reconciling',
    'ready',
    'cancelled',
    'failed',
    'unknown',
    'paused-navigation',
  ]),
  targetRevision: z.number().int().nonnegative().safe().nullable(),
  snapshot: sessionLaunchTargetPreparationSnapshotSchema.nullable(),
  error: z.string().max(128).nullable(),
  cancelRequested: z.boolean(),
})

export const preSessionDraftStateSchema = z.strictObject({
  draftId,
  workspaceId,
  text: z.string().max(200_000),
  attachments: z.array(promptAttachmentSchema).max(12).default([]),
  attachmentTransfers: z.array(draftAttachmentTransferSchema).max(12).default([]),
  uploading: z.number().int().nonnegative().default(0),
  uploadError: z.string().max(200).nullable().default(null),
  launchSelection: sessionLaunchSelectionSchema,
  modelId: idSchema.nullable(),
  thinkingLevel: thinkingLevelSchema.nullable(),
  approvalChoice: preSessionApprovalChoiceSchema,
  planMode: preSessionPlanModeSchema,
  intent: preSessionIntentSchema,
  revision,
  phase: z.enum(['idle', 'preparing', 'creating', 'configuring', 'submitting', 'unknown', 'failed', 'accepted']),
  unknownStage: z
    .enum([
      'create',
      'launchSelection',
      'launchStart',
      'launchPreparation',
      'model',
      'approval',
      'planMode',
      'goal',
      'run',
    ])
    .nullable(),
  error: z.string().nullable(),
  sessionId: idSchema.nullable(),
  capturedWorkspaceId: idSchema.nullable(),
  capturedRevision: revision.nullable(),
  capturedLaunchSelection: sessionLaunchSelectionSchema.nullable(),
  launchPreparation: preSessionLaunchPreparationStateSchema.nullable(),
  operationId: idSchema.nullable(),
  accepted: runAcceptedSchema.nullable(),
})

export const preSessionDraftCommands = {
  'preSessionDraft.open': defineCommand(
    metadata('preSessionDraft.open'),
    z.strictObject({ draftId: draftId.optional(), workspaceId: workspaceId.optional() }),
    preSessionDraftStateSchema,
  ),
  'preSessionDraft.setText': defineCommand(
    metadata('preSessionDraft.setText'),
    z.strictObject({ draftId, text: z.string().max(200_000), expectedRevision: revision }),
    result,
  ),
  'preSessionDraft.resolveDefaultModel': defineCommand(
    metadata('preSessionDraft.resolveDefaultModel'),
    z.strictObject({ draftId, expectedRevision: revision }),
    result,
  ),
  'preSessionDraft.reserveAttachments': defineCommand(
    metadata('preSessionDraft.reserveAttachments'),
    z.strictObject({
      draftId,
      expectedRevision: revision,
      files: z
        .array(
          z.strictObject({
            name: z.string().max(4096),
            mime: z.string().max(256),
            size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
          }),
        )
        .min(1)
        .max(12),
    }),
    attachmentDraftResultSchema.extend({ reservations: z.array(attachmentSelectionReservationSchema).max(12) }),
  ),
  'preSessionDraft.uploadAttachment': defineCommand(
    metadata('preSessionDraft.uploadAttachment'),
    attachmentTarget.extend({ kind: z.enum(['image', 'file']), upload: attachmentUploadInputSchema }),
    attachmentDraftResultSchema.extend({ attachment: promptAttachmentSchema }),
  ),
  'preSessionDraft.failAttachmentPreparation': defineCommand(
    metadata('preSessionDraft.failAttachmentPreparation'),
    attachmentTarget.extend({ error: z.string().min(1).max(200) }),
    attachmentDraftResultSchema,
  ),
  'preSessionDraft.removeAttachmentTransfer': defineCommand(
    metadata('preSessionDraft.removeAttachmentTransfer'),
    attachmentTarget,
    attachmentDraftResultSchema,
  ),
  'preSessionDraft.reconcileAttachment': defineCommand(
    metadata('preSessionDraft.reconcileAttachment'),
    attachmentTarget,
    attachmentDraftResultSchema,
  ),
  'preSessionDraft.acceptReadyAttachment': defineCommand(
    metadata('preSessionDraft.acceptReadyAttachment'),
    attachmentTarget.extend({ expectedRevision: revision }),
    attachmentDraftResultSchema,
  ),
  'preSessionDraft.removeAttachment': defineCommand(
    metadata('preSessionDraft.removeAttachment'),
    z.strictObject({
      draftId,
      kind: z.enum(['image', 'file']),
      artifactId: z.string().regex(/^[a-f0-9]{64}$/),
      expectedRevision: revision,
    }),
    attachmentDraftResultSchema,
  ),
  'preSessionDraft.reportAttachmentError': defineCommand(
    metadata('preSessionDraft.reportAttachmentError'),
    z.strictObject({ draftId, error: z.string().min(1).max(200) }),
    attachmentDraftResultSchema,
  ),
  'preSessionDraft.setLaunchSelection': defineCommand(
    metadata('preSessionDraft.setLaunchSelection'),
    z.strictObject({ draftId, selection: sessionLaunchSelectionSchema, expectedRevision: revision }),
    result,
  ),
  'preSessionDraft.setModel': defineCommand(
    metadata('preSessionDraft.setModel'),
    z.strictObject({ draftId, modelId: idSchema.nullable(), expectedRevision: revision }),
    result,
  ),
  'preSessionDraft.setThinkingLevel': defineCommand(
    metadata('preSessionDraft.setThinkingLevel'),
    z.strictObject({
      draftId,
      thinkingLevel: thinkingLevelSchema.nullable(),
      expectedModelId: idSchema.nullable(),
      expectedRevision: revision,
    }),
    result,
  ),
  'preSessionDraft.setApprovalChoice': defineCommand(
    metadata('preSessionDraft.setApprovalChoice'),
    z.strictObject({
      draftId,
      choice: preSessionApprovalChoiceSchema,
      expectedRevision: revision,
      confirmAllow: z.literal(true).optional(),
    }),
    result,
  ),
  'preSessionDraft.setPlanMode': defineCommand(
    metadata('preSessionDraft.setPlanMode'),
    z.strictObject({ draftId, mode: preSessionPlanModeSchema, expectedRevision: revision }),
    result,
  ),
  'preSessionDraft.setIntent': defineCommand(
    metadata('preSessionDraft.setIntent'),
    z.strictObject({ draftId, intent: preSessionIntentSchema, expectedRevision: revision }),
    result,
  ),
  'preSessionDraft.setEntryMode': defineCommand(
    metadata('preSessionDraft.setEntryMode'),
    z.strictObject({
      draftId,
      mode: z.enum(['default', 'goal', 'plan']),
      expectedRevision: revision,
      text: z.string().max(200_000).optional(),
    }),
    result,
  ),
  'preSessionDraft.setWorkspace': defineCommand(
    metadata('preSessionDraft.setWorkspace'),
    z.strictObject({ draftId, workspaceId: idSchema, expectedRevision: revision }),
    result,
  ),
  'preSessionDraft.submit': defineCommand(
    metadata('preSessionDraft.submit'),
    z.strictObject({ draftId, expectedRevision: revision, modelId: idSchema.optional() }),
    z.strictObject({
      draftId,
      sessionId: idSchema,
      accepted: runAcceptedSchema,
    }),
  ),
  'preSessionDraft.reconcile': defineCommand(
    metadata('preSessionDraft.reconcile'),
    z.strictObject({ draftId }),
    preSessionDraftStateSchema,
  ),
  'preSessionDraft.continue': defineCommand(
    metadata('preSessionDraft.continue'),
    z.strictObject({ draftId, expectedRevision: revision }),
    preSessionDraftStateSchema,
  ),
  'preSessionDraft.cancel': defineCommand(
    metadata('preSessionDraft.cancel'),
    z.strictObject({ draftId, expectedRevision: revision }),
    preSessionDraftStateSchema,
  ),
  'preSessionDraft.close': defineCommand(
    metadata('preSessionDraft.close'),
    z.strictObject({ draftId }),
    z.strictObject({ draftId, closed: z.boolean() }),
  ),
}

export type PreSessionDraftState = z.output<typeof preSessionDraftStateSchema>
export type PreSessionAttachmentCommandTarget = z.output<typeof attachmentTarget>
export type PreSessionLaunchPreparationState = z.output<typeof preSessionLaunchPreparationStateSchema>
export type PreSessionDraftLaunchSelection = SessionLaunchSelection
export type PreSessionApprovalChoice = z.output<typeof preSessionApprovalChoiceSchema>
export type PreSessionPlanMode = z.output<typeof preSessionPlanModeSchema>
export type PreSessionIntent = z.output<typeof preSessionIntentSchema>
export type PreSessionThinkingLevel = ThinkingLevel
