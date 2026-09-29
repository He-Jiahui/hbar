import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema, thinkingLevelSchema, type ThinkingLevel } from '../index'
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
export const preSessionApprovalChoiceSchema = z.enum(['inherit', 'ask', 'deny', 'allow'])
export const preSessionPlanModeSchema = z.enum(['default', 'plan'])
export const preSessionIntentSchema = z.enum(['default', 'goal'])
const result = z.strictObject({ draftId, revision })

export const preSessionDraftStateSchema = z.strictObject({
  draftId,
  workspaceId,
  text: z.string().max(200_000),
  modelId: idSchema.nullable(),
  thinkingLevel: thinkingLevelSchema.nullable(),
  approvalChoice: preSessionApprovalChoiceSchema,
  planMode: preSessionPlanModeSchema,
  intent: preSessionIntentSchema,
  revision,
  phase: z.enum(['idle', 'preparing', 'creating', 'configuring', 'submitting', 'unknown', 'failed', 'accepted']),
  unknownStage: z.enum(['create', 'model', 'approval', 'planMode', 'goal', 'run']).nullable(),
  error: z.string().nullable(),
  sessionId: idSchema.nullable(),
  capturedWorkspaceId: idSchema.nullable(),
  capturedRevision: revision.nullable(),
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
  'preSessionDraft.close': defineCommand(
    metadata('preSessionDraft.close'),
    z.strictObject({ draftId }),
    z.strictObject({ draftId, closed: z.boolean() }),
  ),
}

export type PreSessionDraftState = z.output<typeof preSessionDraftStateSchema>
export type PreSessionApprovalChoice = z.output<typeof preSessionApprovalChoiceSchema>
export type PreSessionPlanMode = z.output<typeof preSessionPlanModeSchema>
export type PreSessionIntent = z.output<typeof preSessionIntentSchema>
export type PreSessionThinkingLevel = ThinkingLevel
