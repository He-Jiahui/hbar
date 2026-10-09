import { z } from 'zod'
import { idSchema } from '@hbar/contracts'
import {
  promptAttachmentSchema,
  promptMentionSchema,
  promptWorkspaceContextsSchema,
  draftAttachmentTransferSchema,
} from '@hbar/contracts/commands/draft'
import { validateMentions } from './composer-mentions'
import { serializeComposerModelText } from './composer-workspace-contexts'
import type { DraftsState, SessionDraftState } from './types'

export const MAX_PERSISTED_SESSION_DRAFTS = 100
export const MAX_PERSISTED_SESSION_DRAFT_BYTES = 1_000_000
const pendingSubmissionSchema = z.strictObject({
  key: z.string().min(1).max(128),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  matchesDraft: z.boolean(),
  detached: z.boolean(),
})
const persistedDraftSchema = z
  .strictObject({
    sessionId: idSchema,
    text: z.string().max(200_000),
    mentions: z.array(promptMentionSchema).max(40),
    workspaceContexts: promptWorkspaceContextsSchema,
    attachments: z.array(promptAttachmentSchema).max(12),
    attachmentTransfers: z.array(draftAttachmentTransferSchema).max(12).optional(),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    status: z.enum(['idle', 'failed', 'unknown', 'submitting']),
    error: z.string().max(4_000).nullable(),
    lastOperationId: idSchema.nullable(),
    pendingSubmission: pendingSubmissionSchema.optional(),
  })
  .superRefine((value, context) => {
    if ((value.status === 'unknown' || value.status === 'submitting') && !value.pendingSubmission)
      context.addIssue({ code: 'custom', message: 'Unconfirmed submissions require their original receipt owner' })
    if (value.pendingSubmission && value.pendingSubmission.revision > value.revision)
      context.addIssue({ code: 'custom', message: 'Submission revision exceeds the current draft' })
    if ((value.status === 'idle' || value.status === 'failed') && value.pendingSubmission)
      context.addIssue({ code: 'custom', message: 'Settled drafts cannot retain a pending submission' })
  })
const envelopeSchema = z.strictObject({
  version: z.literal(1),
  drafts: z.record(idSchema, z.unknown()).refine((value) => Object.keys(value).length <= MAX_PERSISTED_SESSION_DRAFTS),
})

/** Restores receipt/hash ownership. Interrupted transfers become unknown and cannot be redispatched. */
export function restoreSessionDrafts(value: unknown): DraftsState | undefined {
  const envelope = envelopeSchema.safeParse(value)
  if (!envelope.success) return undefined
  const restored: Record<string, SessionDraftState> = {}
  let bytes = 0
  for (const [sessionId, raw] of Object.entries(envelope.data.drafts)) {
    const parsed = persistedDraftSchema.safeParse(raw)
    if (!parsed.success || parsed.data.sessionId !== sessionId) continue
    const draft = parsed.data
    bytes += new TextEncoder().encode(JSON.stringify(draft)).byteLength
    if (bytes > MAX_PERSISTED_SESSION_DRAFT_BYTES) return undefined
    try {
      validateMentions(draft.text, draft.mentions)
      serializeComposerModelText(draft.text, draft.mentions, draft.workspaceContexts)
    } catch {
      continue
    }
    const { pendingSubmission, attachmentTransfers, ...content } = draft
    restored[sessionId] = {
      ...content,
      status: draft.status === 'submitting' ? 'unknown' : draft.status,
      error: draft.status === 'submitting' ? 'RESULT_UNKNOWN' : draft.error,
      attachmentTransfers: (attachmentTransfers ?? []).map((transfer) => ({
        ...transfer,
        status: ['uploading', 'reconciling'].includes(transfer.status)
          ? 'unknown'
          : transfer.status === 'preparing'
            ? 'failed'
            : transfer.status,
        error: ['uploading', 'reconciling'].includes(transfer.status)
          ? 'RESULT_UNKNOWN'
          : transfer.status === 'preparing'
            ? 'SOURCE_RESELECT'
            : transfer.error,
      })),
      uploading: 0,
      uploadError: null,
      ...(pendingSubmission ? { pendingSubmission } : {}),
    }
  }
  return restored
}

export function serializeSessionDrafts(drafts: DraftsState): string | null {
  if (Object.keys(drafts).length > MAX_PERSISTED_SESSION_DRAFTS) return null
  const records: Record<string, z.infer<typeof persistedDraftSchema>> = {}
  for (const [sessionId, draft] of Object.entries(drafts)) {
    const parsed = persistedDraftSchema.safeParse({
      sessionId: draft.sessionId,
      text: draft.text,
      mentions: draft.mentions,
      workspaceContexts: draft.workspaceContexts ?? [],
      attachments: draft.attachments,
      attachmentTransfers: draft.attachmentTransfers,
      revision: draft.revision,
      status: draft.status,
      error: draft.error,
      lastOperationId: draft.lastOperationId,
      ...(draft.pendingSubmission ? { pendingSubmission: draft.pendingSubmission } : {}),
    })
    if (!parsed.success || parsed.data.sessionId !== sessionId) return null
    records[sessionId] = parsed.data
  }
  const serialized = JSON.stringify({ version: 1, drafts: records })
  return new TextEncoder().encode(serialized).byteLength <= MAX_PERSISTED_SESSION_DRAFT_BYTES ? serialized : null
}
