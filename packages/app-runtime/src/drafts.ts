import { CommandError, type CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { artifactSchema } from '@hbar/contracts'
import { draftCommands, type PromptAttachment } from '@hbar/contracts/commands/draft'
import { runAcceptedSchema, type RunAccepted, type SubmitRunInput } from '@hbar/contracts/commands/run'
import { createState } from './state'
import type { DraftsState, RunActionsState, RunActionState, RunCommandPort, SessionDraftState } from './types'
import type { CommandExecutor } from '@hbar/commands'

const MAX_DRAFTS = 100

interface PendingSubmission {
  readonly key: string
  readonly revision: number
  readonly matchesDraft: boolean
}

function initial(sessionId: string): SessionDraftState {
  return {
    sessionId,
    text: '',
    attachments: [],
    uploading: 0,
    uploadError: null,
    revision: 0,
    status: 'idle',
    error: null,
    lastOperationId: null,
  }
}

function errorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code
  return null
}

function attachmentKey(attachment: PromptAttachment): string {
  return `${attachment.kind}:${attachment.artifact.id}`
}

function matchesInput(draft: SessionDraftState, input: SubmitRunInput): boolean {
  const expected = [
    ...input.input.images.map((artifact) => ({ kind: 'image' as const, artifact })),
    ...(input.input.files ?? []).map((artifact) => ({ kind: 'file' as const, artifact })),
  ]
  return (
    draft.text === input.input.text &&
    draft.attachments.length === expected.length &&
    draft.attachments.every((item, index) => attachmentKey(item) === attachmentKey(expected[index]!))
  )
}

export function createDrafts(
  local: CommandRegistry,
  run: RunCommandPort | undefined,
  attachmentCommands: CommandExecutor | undefined,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<DraftsState>({}, onSubscriberError)
  const actions = createState<RunActionsState>({}, onSubscriberError)
  const pending = new Map<string, PendingSubmission>()

  const replaceAction = (operationId: string, action: RunActionState) => {
    if (isDisposed()) return
    const current = actions.reader.getSnapshot()
    const next: Record<string, RunActionState> = { ...current }
    if (!next[operationId] && Object.keys(next).length >= 100) {
      const settled = Object.entries(next).find(([, item]) => ['failed', 'succeeded'].includes(item.status))
      if (!settled) throw new CommandError('BUSY', 'Too many run actions are pending')
      delete next[settled[0]]
    }
    next[operationId] = action
    actions.replace(next)
  }

  const entry = (sessionId: string): SessionDraftState => state.reader.getSnapshot()[sessionId] ?? initial(sessionId)
  const replace = (sessionId: string, value: SessionDraftState): void => {
    if (isDisposed()) return
    const current = state.reader.getSnapshot()
    if (!current[sessionId] && Object.keys(current).length >= MAX_DRAFTS)
      throw new CommandError('BUSY', 'Too many session drafts are open')
    state.replace({ ...current, [sessionId]: value })
  }
  const checkRevision = (current: SessionDraftState, expected: number | undefined) => {
    if (expected !== undefined && expected !== current.revision)
      throw new CommandError('VERSION_CONFLICT', 'The session draft changed before this edit')
  }
  const editedStatus = (current: SessionDraftState): Pick<SessionDraftState, 'status' | 'error'> =>
    current.status === 'failed' ? { status: 'idle', error: null } : { status: current.status, error: current.error }

  local.register(draftCommands['draft.setText'], ({ sessionId, text, expectedRevision }) => {
    const current = entry(sessionId)
    checkRevision(current, expectedRevision)
    const next = { ...current, ...editedStatus(current), text, revision: current.revision + 1 }
    replace(sessionId, next)
    return { sessionId, revision: next.revision }
  })

  local.register(draftCommands['draft.setAttachments'], ({ sessionId, attachments, expectedRevision }) => {
    const current = entry(sessionId)
    checkRevision(current, expectedRevision)
    const keys = attachments.map(attachmentKey)
    if (new Set(keys).size !== keys.length) throw new CommandError('INVALID_INPUT', 'Draft attachments must be unique')
    if (attachments.length + current.uploading > 12)
      throw new CommandError('BUSY', 'Pending uploads reserve the remaining attachment slots')
    const next = {
      ...current,
      ...editedStatus(current),
      attachments: attachments.map((attachment) => ({ ...attachment, artifact: { ...attachment.artifact } })),
      revision: current.revision + 1,
    }
    replace(sessionId, next)
    return { sessionId, revision: next.revision }
  })

  local.register(draftCommands['draft.reportAttachmentError'], ({ sessionId, error }) => {
    const current = entry(sessionId)
    replace(sessionId, { ...current, uploadError: error })
    return { sessionId, revision: current.revision }
  })

  local.register(draftCommands['draft.addAttachment'], async ({ sessionId, kind, upload }, context) => {
    if (!attachmentCommands)
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'Attachment uploads are unavailable in this runtime')
    const current = entry(sessionId)
    if (current.attachments.length + current.uploading >= 12)
      throw new CommandError('BUSY', 'The session draft attachment limit is reached')
    replace(sessionId, { ...current, uploading: current.uploading + 1, uploadError: null })
    try {
      const uploaded = artifactSchema.safeParse(await attachmentCommands.execute('attachment.upload', upload, context))
      if (!uploaded.success) throw new CommandError('INVALID_OUTPUT', 'Attachment upload returned an invalid artifact')
      const artifact = uploaded.data
      const latest = entry(sessionId)
      const attachment: PromptAttachment = { kind, artifact }
      const existing = latest.attachments.find((item) => attachmentKey(item) === attachmentKey(attachment))
      if (!existing && latest.attachments.length + latest.uploading > 12)
        throw new CommandError('BUSY', 'The session draft attachment limit changed during upload')
      const next = {
        ...latest,
        attachments: existing ? latest.attachments : [...latest.attachments, attachment],
        uploading: Math.max(0, latest.uploading - 1),
        uploadError: null,
        revision: latest.revision + (existing ? 0 : 1),
      }
      replace(sessionId, next)
      return { sessionId, revision: next.revision, attachment: existing ?? attachment }
    } catch (error) {
      const latest = entry(sessionId)
      replace(sessionId, {
        ...latest,
        uploading: Math.max(0, latest.uploading - 1),
        uploadError: errorCode(error) ?? (error instanceof Error ? error.message : 'EXECUTION_FAILED'),
      })
      throw error
    }
  })

  const settle = (sessionId: string, submission: PendingSubmission, accepted: RunAccepted): void => {
    if (pending.get(sessionId) !== submission) return
    const current = entry(sessionId)
    const clear = submission.matchesDraft && current.revision === submission.revision
    replace(sessionId, {
      ...current,
      ...(clear ? { text: '', attachments: [], revision: current.revision + 1 } : {}),
      status: 'idle',
      error: null,
      lastOperationId: accepted.operationId,
    })
    pending.delete(sessionId)
  }

  local.register(draftCommands['draft.reconcileSubmission'], async ({ sessionId }) => {
    const submission = pending.get(sessionId)
    const current = entry(sessionId)
    if (!run || !submission || current.status !== 'unknown')
      throw new CommandError('INVALID_INPUT', 'The session draft has no unknown submission to reconcile')
    const receipt = await run.getReceipt(sessionId, submission.key, 'run.submit')
    if (receipt) settle(sessionId, submission, receipt)
    return receipt
  })

  return {
    reader: state.reader,
    actions: actions.reader,
    async executeRun(name: string, input: unknown, options: ExecuteOptions = {}): Promise<unknown> {
      if (!run) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Run commands are unavailable in this runtime')
      if (name === 'operation.cancel') {
        const operationId = (input as { operationId: string }).operationId
        const current = actions.reader.getSnapshot()[operationId]
        if (current && ['submitting', 'unknown'].includes(current.status))
          throw new CommandError('BUSY', 'Run cancellation is already pending')
        const action: RunActionState = { operationId, status: 'submitting', error: null }
        replaceAction(operationId, action)
        try {
          const result = await run.execute(name, input, options)
          replaceAction(operationId, { ...action, status: 'succeeded' })
          return result
        } catch (error) {
          const value = errorCode(error) ?? (error instanceof Error ? error.message : 'EXECUTION_FAILED')
          replaceAction(operationId, {
            ...action,
            status: value === 'RESULT_UNKNOWN' ? 'unknown' : 'failed',
            error: value,
          })
          throw error
        }
      }
      if (name !== 'run.submit') return run.execute(name, input, options)
      const submit = input as SubmitRunInput
      const current = entry(submit.sessionId)
      if (current.status === 'submitting' || current.status === 'unknown')
        throw new CommandError('BUSY', 'The session draft already has a pending submission')
      const submission: PendingSubmission = {
        key: options.idempotencyKey ?? crypto.randomUUID(),
        revision: current.revision,
        matchesDraft: matchesInput(current, submit),
      }
      pending.set(submit.sessionId, submission)
      replace(submit.sessionId, { ...current, status: 'submitting', error: null })
      try {
        const accepted = runAcceptedSchema.parse(
          await run.execute(name, input, { ...options, idempotencyKey: submission.key }),
        )
        settle(submit.sessionId, submission, accepted)
        return accepted
      } catch (error) {
        if (pending.get(submit.sessionId) === submission) {
          const latest = entry(submit.sessionId)
          const unknown = errorCode(error) === 'RESULT_UNKNOWN'
          replace(submit.sessionId, {
            ...latest,
            status: unknown ? 'unknown' : 'failed',
            error: errorCode(error) ?? (error instanceof Error ? error.message : 'EXECUTION_FAILED'),
          })
          if (!unknown) pending.delete(submit.sessionId)
        }
        throw error
      }
    },
    dispose() {
      pending.clear()
      state.dispose()
      actions.dispose()
    },
  }
}
