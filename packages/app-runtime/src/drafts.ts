import { CommandError, type CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { draftCommands, type PromptAttachment } from '@hbar/contracts/commands/draft'
import { runAcceptedSchema, type RunAccepted, type SubmitRunInput } from '@hbar/contracts/commands/run'
import { createState } from './state'
import type { DraftsState, RunCommandPort, SessionDraftState } from './types'

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
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<DraftsState>({}, onSubscriberError)
  const pending = new Map<string, PendingSubmission>()

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
    const next = {
      ...current,
      ...editedStatus(current),
      attachments: attachments.map((attachment) => ({ ...attachment, artifact: { ...attachment.artifact } })),
      revision: current.revision + 1,
    }
    replace(sessionId, next)
    return { sessionId, revision: next.revision }
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
    async executeRun(name: string, input: unknown, options: ExecuteOptions = {}): Promise<unknown> {
      if (!run) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Run commands are unavailable in this runtime')
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
    },
  }
}
