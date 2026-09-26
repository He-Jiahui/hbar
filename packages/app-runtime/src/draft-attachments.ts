import { CommandError, createCommandClient, type CommandExecutor, type CommandRegistry } from '@hbar/commands'
import { artifactSchema } from '@hbar/contracts'
import { draftCommands, type PromptAttachment } from '@hbar/contracts/commands/draft'
import { fileCommands, type AttachmentUploadInput } from '@hbar/contracts/commands/files'
import type { SessionAttachmentTransfer, SessionDraftState } from './types'
import type { SessionExecutionPreparationPort } from './session-execution-preparation'

interface TransferTarget {
  readonly sessionId: string
  readonly reservationId: string
  readonly ownerRevision: number
}
interface AttachmentDraftPorts {
  readonly read: (sessionId: string) => SessionDraftState
  readonly replace: (sessionId: string, next: SessionDraftState) => void
  readonly uploads: CommandExecutor | undefined
  readonly queries: CommandExecutor | undefined
  readonly isDisposed: () => boolean
  readonly preparation?: SessionExecutionPreparationPort | undefined
}
const codeOf = (error: unknown) =>
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
const rejected = new Set([
  'INVALID_INPUT',
  'UNSUPPORTED_TYPE',
  'FILE_LIMIT',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'SOURCE_NOT_FOUND',
  'SOURCE_CHANGED',
  'BUSY',
  'CAPABILITY_UNAVAILABLE',
])
const key = (attachment: PromptAttachment) => `${attachment.kind}:${attachment.artifact.id}`

/** Reservation and confirmed attachments share the existing draft fact source. File bytes never enter this state. */
export function registerDraftAttachments(local: CommandRegistry, ports: AttachmentDraftPorts): void {
  const result = (sessionId: string) => ({ sessionId, revision: ports.read(sessionId).revision })
  const write = (sessionId: string, draft: SessionDraftState) =>
    ports.replace(sessionId, {
      ...draft,
      uploading: draft.attachmentTransfers.filter((item) =>
        ['preparing', 'uploading', 'reconciling'].includes(item.status),
      ).length,
    })
  const owned = (target: TransferTarget) => {
    const draft = ports.read(target.sessionId)
    const transfer = draft.attachmentTransfers.find(
      (item) => item.id === target.reservationId && item.ownerRevision === target.ownerRevision,
    )
    if (!transfer || ports.isDisposed())
      throw new CommandError('STALE_TARGET', 'The attachment no longer belongs to the original draft reservation')
    return { draft, transfer }
  }
  const update = (target: TransferTarget, patch: Partial<SessionAttachmentTransfer>) => {
    const { draft, transfer } = owned(target)
    write(target.sessionId, {
      ...draft,
      attachmentTransfers: draft.attachmentTransfers.map((item) =>
        item.id === transfer.id ? { ...item, ...patch } : item,
      ),
    })
  }
  const reserve = (
    sessionId: string,
    expectedRevision: number,
    files: readonly { readonly name: string; readonly mime: string; readonly size: number }[],
  ) => {
    const draft = ports.read(sessionId)
    if (draft.revision !== expectedRevision)
      throw new CommandError('VERSION_CONFLICT', 'The draft changed before attachment selection')
    if (
      draft.status === 'submitting' ||
      draft.status === 'unknown' ||
      draft.attachmentTransfers.some((item) => item.status === 'unknown' || item.status === 'reconciling')
    )
      throw new CommandError('BUSY', 'Resolve the original pending operation before selecting more files')
    if (draft.attachments.length + draft.attachmentTransfers.length + files.length > 12)
      throw new CommandError('ATTACHMENT_LIMIT', 'A draft supports at most twelve selected attachments')
    const revision = draft.revision + 1
    const transfers = files.map((file): SessionAttachmentTransfer => {
      const mime = file.mime.trim().split(';', 1)[0]?.toLowerCase() || 'application/octet-stream'
      const error =
        file.size < 1 || file.size > 10 * 1024 * 1024
          ? 'FILE_LIMIT'
          : file.name.length < 1 || file.name.length > 240 || mime.length > 120
            ? 'INVALID_INPUT'
            : null
      return {
        id: crypto.randomUUID(),
        ownerRevision: revision,
        originalOperationId: draft.lastOperationId,
        name: file.name.slice(0, 240),
        mime,
        size: file.size,
        status: error ? 'failed' : 'preparing',
        kind: mime.startsWith('image/') ? 'image' : 'file',
        upload: null,
        confirmed: null,
        error,
      }
    })
    write(sessionId, {
      ...draft,
      revision,
      uploadError: null,
      attachmentTransfers: [...draft.attachmentTransfers, ...transfers],
    })
    return {
      sessionId,
      revision,
      reservations: transfers.map((item) => ({
        reservationId: item.id,
        ownerRevision: item.ownerRevision,
        preparing: item.status === 'preparing',
      })),
    }
  }
  const attach = (target: TransferTarget, attachment: PromptAttachment, acceptCurrent = false) => {
    const { draft, transfer } = owned(target)
    // Text edits are valid. An accepted submission, unlike typing, establishes a new draft generation.
    if (
      !acceptCurrent &&
      (draft.lastOperationId !== transfer.originalOperationId ||
        draft.status === 'submitting' ||
        draft.status === 'unknown')
    ) {
      update(target, { status: 'ready', confirmed: attachment, error: 'DRAFT_CHANGED' })
      return result(target.sessionId)
    }
    const existing = draft.attachments.some((item) => key(item) === key(attachment))
    write(target.sessionId, {
      ...draft,
      revision: draft.revision + 1,
      uploadError: null,
      attachments: existing ? draft.attachments : [...draft.attachments, attachment],
      attachmentTransfers: draft.attachmentTransfers.filter((item) => item.id !== transfer.id),
    })
    return result(target.sessionId)
  }
  const upload = async (
    target: TransferTarget,
    kind: 'image' | 'file',
    descriptor: AttachmentUploadInput,
    signal: AbortSignal,
  ) => {
    const { transfer } = owned(target)
    if (transfer.status !== 'preparing') throw new CommandError('BUSY', 'This upload cannot be repeated')
    if (
      descriptor.name !== transfer.name ||
      descriptor.mime !== transfer.mime ||
      descriptor.size !== transfer.size ||
      kind !== transfer.kind
    ) {
      update(target, { status: 'failed', error: 'SOURCE_CHANGED' })
      throw new CommandError('SOURCE_CHANGED', 'Prepared file does not match its original selection')
    }
    if (!ports.uploads) {
      update(target, { status: 'failed', error: 'CAPABILITY_UNAVAILABLE' })
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'Attachment upload is unavailable')
    }
    update(target, { upload: descriptor, status: 'uploading', error: null })
    let dispatched = false
    try {
      const sessionTarget = await ports.preparation?.capture(target.sessionId, signal)
      owned(target)
      if (sessionTarget) ports.preparation?.assertCanPrepare(sessionTarget)
      signal.throwIfAborted()
      dispatched = true
      const artifact = artifactSchema.parse(
        await ports.uploads.execute('attachment.upload', descriptor, { requestId: transfer.id, signal }),
      )
      if (artifact.id !== descriptor.sha256 || artifact.size !== descriptor.size || artifact.mime !== descriptor.mime)
        throw new CommandError('CONTENT_MISMATCH', 'Uploaded content does not match the original file')
      const attachment = { kind, artifact: { ...artifact, name: transfer.name } }
      attach(target, attachment)
      return { ...result(target.sessionId), attachment }
    } catch (error) {
      if (!ports.isDisposed()) {
        const code = codeOf(error)
        update(target, { status: !dispatched || rejected.has(code) ? 'failed' : 'unknown', error: code })
        const draft = ports.read(target.sessionId)
        write(target.sessionId, { ...draft, uploadError: code })
      }
      throw error
    }
  }
  local.register(draftCommands['draft.reserveAttachments'], async ({ sessionId, expectedRevision, files }, context) => {
    const target = await ports.preparation?.capture(sessionId, context.signal)
    if (target) ports.preparation?.assertCanPrepare(target)
    return reserve(sessionId, expectedRevision, files)
  })
  local.register(draftCommands['draft.uploadAttachment'], ({ kind, upload: descriptor, ...target }, context) =>
    upload(target, kind, descriptor, context.signal),
  )
  local.register(draftCommands['draft.addAttachment'], async ({ sessionId, kind, upload: descriptor }, context) => {
    const draft = ports.read(sessionId)
    if (draft.attachments.length + draft.attachmentTransfers.length >= 12)
      throw new CommandError('BUSY', 'The session draft attachment limit is reached')
    const reserved = reserve(sessionId, draft.revision, [descriptor]).reservations[0]
    if (!reserved?.preparing) throw new CommandError('INVALID_INPUT', 'Attachment metadata cannot be uploaded')
    return upload({ sessionId, ...reserved }, kind, descriptor, context.signal)
  })
  local.register(draftCommands['draft.failAttachmentPreparation'], ({ error, ...target }) => {
    const { transfer } = owned(target)
    if (transfer.status !== 'preparing') throw new CommandError('BUSY', 'Preparation has already finished')
    update(target, { status: 'failed', error })
    return result(target.sessionId)
  })
  local.register(draftCommands['draft.removeAttachmentTransfer'], (target) => {
    const { draft, transfer } = owned(target)
    if (!['preparing', 'failed', 'ready'].includes(transfer.status))
      throw new CommandError('BUSY', 'An uncertain upload cannot be cancelled as if it never reached the Host')
    write(target.sessionId, {
      ...draft,
      revision: draft.revision + 1,
      uploadError: null,
      attachmentTransfers: draft.attachmentTransfers.filter((item) => item.id !== transfer.id),
    })
    return result(target.sessionId)
  })
  local.register(draftCommands['draft.removeAttachment'], ({ sessionId, expectedRevision, kind, artifactId }) => {
    const draft = ports.read(sessionId)
    if (draft.revision !== expectedRevision)
      throw new CommandError('VERSION_CONFLICT', 'The draft changed before attachment removal')
    write(sessionId, {
      ...draft,
      revision: draft.revision + 1,
      uploadError: null,
      attachments: draft.attachments.filter((item) => item.kind !== kind || item.artifact.id !== artifactId),
    })
    return result(sessionId)
  })
  local.register(draftCommands['draft.reconcileAttachment'], async (target, context) => {
    const { transfer } = owned(target)
    if (transfer.status !== 'unknown' || !transfer.upload)
      throw new CommandError('INVALID_INPUT', 'No unknown upload requires reconciliation')
    if (!ports.queries) {
      update(target, { error: 'CAPABILITY_UNAVAILABLE' })
      throw new CommandError('CAPABILITY_UNAVAILABLE', 'Artifact reconciliation is unavailable')
    }
    update(target, { status: 'reconciling', error: null })
    try {
      const artifact = await createCommandClient(fileCommands, ports.queries).execute(
        'attachment.query',
        { artifactId: transfer.upload.sha256 },
        { signal: context.signal },
      )
      if (artifact.id !== transfer.upload.sha256 || artifact.size !== transfer.size || artifact.mime !== transfer.mime)
        throw new CommandError('CONTENT_MISMATCH', 'The queried artifact does not match the original upload')
      return attach(target, { kind: transfer.kind, artifact: { ...artifact, name: transfer.name } })
    } catch (error) {
      if (!ports.isDisposed()) update(target, { status: 'unknown', error: codeOf(error) })
      throw error
    }
  })
  local.register(draftCommands['draft.acceptReadyAttachment'], ({ expectedRevision, ...target }) => {
    const { draft, transfer } = owned(target)
    if (draft.revision !== expectedRevision)
      throw new CommandError('VERSION_CONFLICT', 'The draft changed before accepting the confirmed attachment')
    if (draft.status === 'submitting' || draft.status === 'unknown')
      throw new CommandError('BUSY', 'Resolve the current submission before adding a confirmed attachment')
    if (transfer.status !== 'ready' || !transfer.confirmed)
      throw new CommandError('INVALID_INPUT', 'No confirmed attachment is waiting for a new draft')
    return attach(target, transfer.confirmed, true)
  })
}
