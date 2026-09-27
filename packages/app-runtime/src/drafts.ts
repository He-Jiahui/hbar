import { CommandError, type CommandRegistry, type ExecuteOptions } from '@hbar/commands'
import { draftCommands, type PromptAttachment } from '@hbar/contracts/commands/draft'
import {
  retryRunInputSchema,
  runAcceptedSchema,
  type RunAccepted,
  type SubmitRunInput,
} from '@hbar/contracts/commands/run'
import type { SessionExecutionPreparationPort } from './session-execution-preparation'
import { createState } from './state'
import { registerDraftAttachments } from './draft-attachments'
import { serializeMentions, validateMentions } from './composer-mentions'
import type { DraftsState, RunActionsState, RunActionState, RunCommandPort, SessionDraftState } from './types'
import type { CommandExecutor } from '@hbar/commands'
import { createRunCancellation } from './run-cancellation'

const MAX_DRAFTS = 100
// Public Run ports are not required to be the SDK adapter. Once dispatched, these
// errors cannot prove rejection; preserve the same key until its receipt is read.
const UNCERTAIN_SUBMIT_CODES = new Set([
  'RESULT_UNKNOWN',
  'TIMEOUT',
  'TIMED_OUT',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'CANCELLED',
  'INVALID_OUTPUT',
  'EXECUTION_FAILED',
])

interface PendingSubmission {
  readonly key: string
  readonly revision: number
  readonly matchesDraft: boolean
  readonly detached: boolean
}

function initial(sessionId: string): SessionDraftState {
  return {
    sessionId,
    text: '',
    mentions: [],
    attachments: [],
    attachmentTransfers: [],
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
    serializeMentions(draft.text, draft.mentions) === input.input.text &&
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
  attachmentQueries?: CommandExecutor,
  preparation?: SessionExecutionPreparationPort,
) {
  const state = createState<DraftsState>({}, onSubscriberError)
  const actions = createState<RunActionsState>({}, onSubscriberError)
  const pending = new Map<string, PendingSubmission>()
  const retryKeys = new Map<string, { readonly key: string; readonly sessionId: string }>()
  const settledReceipts = new Map<string, RunAccepted>()
  const receiptKey = (sessionId: string, key: string) => JSON.stringify([sessionId, key])

  const replaceAction = (operationId: string, action: RunActionState) => {
    if (isDisposed()) return
    const current = actions.reader.getSnapshot()
    const next: Record<string, RunActionState> = { ...current }
    if (!next[operationId] && Object.keys(next).length >= 100) {
      const settled = Object.entries(next).find(
        ([, item]) => !item.requestInFlight && ['failed', 'succeeded'].includes(item.status),
      )
      if (!settled) throw new CommandError('BUSY', 'Too many run actions are pending')
      delete next[settled[0]]
    }
    next[operationId] = action
    actions.replace(next)
  }

  const entry = (sessionId: string): SessionDraftState => state.reader.getSnapshot()[sessionId] ?? initial(sessionId)
  const cancellation = createRunCancellation({
    local,
    run,
    actions: actions.reader,
    replace: replaceAction,
    isDisposed,
  })
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
    const next = {
      ...current,
      ...editedStatus(current),
      text,
      mentions: text === current.text ? current.mentions : [],
      revision: current.revision + 1,
    }
    replace(sessionId, next)
    return { sessionId, revision: next.revision }
  })

  local.register(draftCommands['draft.setContent'], ({ sessionId, text, mentions, expectedRevision }) => {
    const current = entry(sessionId)
    checkRevision(current, expectedRevision)
    validateMentions(text, mentions)
    const next = {
      ...current,
      ...editedStatus(current),
      text,
      mentions: mentions.map((item) => ({ ...item })),
      revision: current.revision + 1,
    }
    replace(sessionId, next)
    return { sessionId, revision: next.revision }
  })

  local.register(draftCommands['draft.setAttachments'], ({ sessionId, attachments, expectedRevision }) => {
    const current = entry(sessionId)
    checkRevision(current, expectedRevision)
    const keys = attachments.map(attachmentKey)
    if (new Set(keys).size !== keys.length) throw new CommandError('INVALID_INPUT', 'Draft attachments must be unique')
    if (attachments.length + current.attachmentTransfers.length > 12)
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

  registerDraftAttachments(local, {
    read: entry,
    replace,
    uploads: attachmentCommands,
    queries: attachmentQueries,
    isDisposed,
    preparation,
  })

  const settle = (sessionId: string, submission: PendingSubmission, accepted: RunAccepted): void => {
    if (pending.get(sessionId) !== submission) return
    if (accepted.sessionId === sessionId && accepted.idempotencyKey === submission.key) {
      const key = receiptKey(sessionId, submission.key)
      settledReceipts.delete(key)
      if (settledReceipts.size >= MAX_DRAFTS) {
        const oldest = settledReceipts.keys().next().value
        if (oldest !== undefined) settledReceipts.delete(oldest)
      }
      settledReceipts.set(key, { ...accepted })
    }
    const current = entry(sessionId)
    const clear = submission.matchesDraft && current.revision === submission.revision
    replace(sessionId, {
      ...current,
      ...(clear ? { text: '', mentions: [], attachments: [], revision: current.revision + 1 } : {}),
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
    if (
      receipt &&
      (!runAcceptedSchema.safeParse(receipt).success ||
        receipt.sessionId !== sessionId ||
        receipt.idempotencyKey !== submission.key)
    )
      throw new CommandError('RESULT_UNKNOWN', 'Run receipt does not match its original request')
    if (receipt) settle(sessionId, submission, receipt)
    return receipt
  })

  const submitRun = async (
    submit: SubmitRunInput,
    options: ExecuteOptions,
    detached: boolean,
  ): Promise<RunAccepted> => {
    if (!run) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Run commands are unavailable in this runtime')
    const current = entry(submit.sessionId)
    if (current.status === 'submitting' || current.status === 'unknown')
      throw new CommandError('BUSY', 'The session draft already has a pending submission')
    const submission: PendingSubmission = {
      key: options.idempotencyKey ?? crypto.randomUUID(),
      revision: current.revision,
      matchesDraft: !detached && matchesInput(current, submit),
      detached,
    }
    replace(submit.sessionId, { ...current, status: 'submitting', error: null })
    pending.set(submit.sessionId, submission)
    let dispatched = false
    try {
      const target = await preparation?.capture(submit.sessionId, options.signal)
      if (target) preparation?.assertCanPrepare(target)
      if (isDisposed()) throw new CommandError('DISPOSED', 'Run preparation was disposed')
      options.signal?.throwIfAborted()
      dispatched = true
      const parsed = runAcceptedSchema.safeParse(
        await run.execute('run.submit', submit, { ...options, idempotencyKey: submission.key }),
      )
      if (!parsed.success) {
        throw new CommandError('RESULT_UNKNOWN', 'Run acceptance could not be verified')
      }
      const accepted = parsed.data
      if (accepted.sessionId !== submit.sessionId || accepted.idempotencyKey !== submission.key)
        throw new CommandError('RESULT_UNKNOWN', 'Run receipt does not match its original request')
      settle(submit.sessionId, submission, accepted)
      return accepted
    } catch (error) {
      const unknown = dispatched && UNCERTAIN_SUBMIT_CODES.has(errorCode(error) ?? 'EXECUTION_FAILED')
      if (pending.get(submit.sessionId) === submission) {
        const latest = entry(submit.sessionId)
        replace(submit.sessionId, {
          ...latest,
          status: unknown ? 'unknown' : 'failed',
          error: errorCode(error) ?? (error instanceof Error ? error.message : 'EXECUTION_FAILED'),
        })
        if (!unknown) pending.delete(submit.sessionId)
      }
      if (unknown && errorCode(error) !== 'RESULT_UNKNOWN')
        throw new CommandError(
          'RESULT_UNKNOWN',
          'Run acceptance is uncertain; reconcile the original submission receipt',
        )
      throw error
    }
  }

  return {
    reader: state.reader,
    serializeSubmission(sessionId: string, expectedRevision: number, workspaceId: string, displayText: string): string {
      const current = entry(sessionId)
      checkRevision(current, expectedRevision)
      if (current.text !== displayText)
        throw new CommandError('VERSION_CONFLICT', 'The session draft changed before submission')
      return serializeMentions(current.text, current.mentions, workspaceId)
    },
    actions: actions.reader,
    /** Recent confirmed receipts remain readable after either UI entry reconciles their single owner. */
    getSettledReceipt(sessionId: string, key: string): RunAccepted | null {
      const receipt = settledReceipts.get(receiptKey(sessionId, key))
      return receipt ? { ...receipt } : null
    },
    /** A user action outside the composer shares its receipt owner but never consumes the draft. */
    executeDetachedRun(input: SubmitRunInput, options: ExecuteOptions = {}): Promise<RunAccepted> {
      return submitRun(input, options, true)
    },
    async executeRun(name: string, input: unknown, options: ExecuteOptions = {}): Promise<unknown> {
      if (!run) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Run commands are unavailable in this runtime')
      if (name === 'operation.cancel') {
        return cancellation.cancel(input, options)
      }
      if (name === 'run.retry') {
        const retry = retryRunInputSchema.parse(input)
        const sourceOperationId = retry.operationId
        const current = actions.reader.getSnapshot()[sourceOperationId]
        if (current?.commandId === 'operation.cancel' && (current.requestInFlight || current.status === 'unknown'))
          throw new CommandError('BUSY', 'The original cancellation must be reconciled before retrying')
        if (current?.status === 'submitting') throw new CommandError('BUSY', 'Run retry is already pending')
        const original = retryKeys.get(sourceOperationId)
        if (original && original.sessionId !== retry.sessionId)
          throw new CommandError('STALE_TARGET', 'Retry belongs to another captured Session')
        if (original && current?.status === 'unknown') {
          // An unknown retry is an existing request, not permission to enqueue again.
          replaceAction(sourceOperationId, { ...current, phase: 'receipt', status: 'submitting', error: null })
          try {
            const receipt = await run.getReceipt(original.sessionId, original.key, 'run.retry')
            const parsed = runAcceptedSchema.safeParse(receipt)
            if (
              !parsed.success ||
              parsed.data.sessionId !== original.sessionId ||
              parsed.data.idempotencyKey !== original.key
            )
              throw new CommandError('RESULT_UNKNOWN', 'The original retry has no confirmed receipt')
            if (retryKeys.get(sourceOperationId) === original) {
              retryKeys.delete(sourceOperationId)
              replaceAction(sourceOperationId, { ...current, phase: 'receipt', status: 'succeeded', error: null })
            }
            return parsed.data
          } catch (error) {
            if (retryKeys.get(sourceOperationId) === original)
              replaceAction(sourceOperationId, {
                ...current,
                status: 'unknown',
                error: errorCode(error) ?? 'RESULT_UNKNOWN',
              })
            throw error
          }
        }
        const key = options.idempotencyKey ?? crypto.randomUUID()
        const action: RunActionState = {
          operationId: sourceOperationId,
          commandId: 'run.retry',
          phase: 'request',
          status: 'submitting',
          error: null,
        }
        replaceAction(sourceOperationId, action)
        retryKeys.set(sourceOperationId, { key, sessionId: retry.sessionId })
        let dispatched = false
        try {
          const target = await preparation?.capture(retry.sessionId, options.signal)
          if (target) preparation?.assertCanPrepare(target)
          if (isDisposed()) throw new CommandError('DISPOSED', 'Retry preparation was disposed')
          options.signal?.throwIfAborted()
          dispatched = true
          const parsed = runAcceptedSchema.safeParse(
            await run.execute(name, retry, { ...options, idempotencyKey: key }),
          )
          if (!parsed.success) throw new CommandError('RESULT_UNKNOWN', 'Retry acceptance could not be verified')
          const result = parsed.data
          if (result.sessionId !== retry.sessionId || result.idempotencyKey !== key)
            throw new CommandError('RESULT_UNKNOWN', 'Retry receipt does not match the captured request')
          retryKeys.delete(sourceOperationId)
          replaceAction(sourceOperationId, { ...action, status: 'succeeded' })
          return result
        } catch (error) {
          const value = errorCode(error) ?? (error instanceof Error ? error.message : 'EXECUTION_FAILED')
          const unknown = dispatched && UNCERTAIN_SUBMIT_CODES.has(value)
          if (!unknown) retryKeys.delete(sourceOperationId)
          replaceAction(sourceOperationId, {
            ...action,
            status: unknown ? 'unknown' : 'failed',
            error: value,
          })
          throw error
        }
      }
      if (name !== 'run.submit') return run.execute(name, input, options)
      return submitRun(input as SubmitRunInput, options, false)
    },
    dispose() {
      cancellation.dispose()
      pending.clear()
      retryKeys.clear()
      settledReceipts.clear()
      state.dispose()
      actions.dispose()
    },
  }
}
