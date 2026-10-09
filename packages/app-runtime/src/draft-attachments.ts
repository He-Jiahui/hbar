import { CommandError, createCommandClient, type CommandExecutor, type CommandRegistry } from '@hbar/commands'
import { artifactSchema } from '@hbar/contracts'
import {
  draftCommands,
  type AttachmentReservationTarget,
  type DraftAttachmentTransfer,
  type PromptAttachment,
} from '@hbar/contracts/commands/draft'
import { fileCommands, type AttachmentUploadInput } from '@hbar/contracts/commands/files'
import type { SessionDraftState } from './types'
import type { SessionExecutionPreparationPort } from './session-execution-preparation'
import type { DraftArtifactReferencePort } from './draft-artifact-references'

export interface AttachmentOwnerSnapshot {
  readonly revision: number
  readonly attachments: readonly PromptAttachment[]
  readonly attachmentTransfers: readonly DraftAttachmentTransfer[]
  readonly uploading: number
  readonly uploadError: string | null
}

export interface AttachmentTransferTarget<OwnerId extends string = string> extends AttachmentReservationTarget {
  readonly ownerId: OwnerId
}

export interface AttachmentTransferCorePorts<OwnerId extends string, State extends AttachmentOwnerSnapshot> {
  readonly read: (ownerId: OwnerId) => State
  readonly replace: (ownerId: OwnerId, next: State) => void
  /** Throws the owning draft's appropriate error if it cannot be edited now. */
  readonly assertEditable: (ownerId: OwnerId, state: State) => void
  /** A dispatched upload must remain a confirmed-but-unaccepted transfer if its owner is now blocked. */
  readonly isBlocked: (ownerId: OwnerId, state: State) => boolean
  /** Identifies a submission generation, so an upload never silently joins a newer draft. */
  readonly generation: (state: State) => string | null
  readonly uploads: CommandExecutor | undefined
  readonly queries: CommandExecutor | undefined
  readonly isDisposed: () => boolean
  readonly beforeReserve?: (ownerId: OwnerId, signal: AbortSignal) => Promise<void> | void
  readonly beforeUpload?: (ownerId: OwnerId, signal: AbortSignal) => Promise<void> | void
  readonly prepareUpload?: (
    ownerId: OwnerId,
    snapshot: State,
    descriptor: AttachmentUploadInput,
    signal: AbortSignal,
  ) => Promise<AttachmentUploadInput>
}

export interface AttachmentTransferCore<OwnerId extends string> {
  reserve(
    ownerId: OwnerId,
    expectedRevision: number,
    files: readonly { readonly name: string; readonly mime: string; readonly size: number }[],
    signal?: AbortSignal,
  ): Promise<{
    readonly ownerId: OwnerId
    readonly revision: number
    readonly reservations: readonly (AttachmentReservationTarget & { readonly preparing: boolean })[]
  }>
  upload(
    target: AttachmentTransferTarget<OwnerId>,
    kind: 'image' | 'file',
    descriptor: AttachmentUploadInput,
    signal: AbortSignal,
  ): Promise<{ readonly ownerId: OwnerId; readonly revision: number; readonly attachment: PromptAttachment }>
  failPreparation(
    target: AttachmentTransferTarget<OwnerId>,
    error: string,
  ): { readonly ownerId: OwnerId; readonly revision: number }
  removeTransfer(target: AttachmentTransferTarget<OwnerId>): { readonly ownerId: OwnerId; readonly revision: number }
  removeAttachment(
    ownerId: OwnerId,
    expectedRevision: number,
    kind: 'image' | 'file',
    artifactId: string,
  ): { readonly ownerId: OwnerId; readonly revision: number }
  reconcile(
    target: AttachmentTransferTarget<OwnerId>,
    signal: AbortSignal,
  ): Promise<{ readonly ownerId: OwnerId; readonly revision: number }>
  acceptReady(
    target: AttachmentTransferTarget<OwnerId>,
    expectedRevision: number,
  ): { readonly ownerId: OwnerId; readonly revision: number }
  reportError(ownerId: OwnerId, error: string): { readonly ownerId: OwnerId; readonly revision: number }
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

/** Shared transfer state machine; each draft type supplies only its typed owner port and policy. */
export function createAttachmentTransferCore<OwnerId extends string, State extends AttachmentOwnerSnapshot>(
  ports: AttachmentTransferCorePorts<OwnerId, State>,
): AttachmentTransferCore<OwnerId> {
  const result = (ownerId: OwnerId) => ({ ownerId, revision: ports.read(ownerId).revision })
  const write = (ownerId: OwnerId, draft: State) =>
    ports.replace(ownerId, {
      ...draft,
      uploading: draft.attachmentTransfers.filter((item) =>
        ['preparing', 'uploading', 'reconciling'].includes(item.status),
      ).length,
    })
  const owned = (target: AttachmentTransferTarget<OwnerId>) => {
    const draft = ports.read(target.ownerId)
    const transfer = draft.attachmentTransfers.find(
      (item) => item.id === target.reservationId && item.ownerRevision === target.ownerRevision,
    )
    if (!transfer || ports.isDisposed())
      throw new CommandError('STALE_TARGET', 'The attachment no longer belongs to the original draft reservation')
    return { draft, transfer }
  }
  const update = (target: AttachmentTransferTarget<OwnerId>, patch: Partial<DraftAttachmentTransfer>) => {
    const { draft, transfer } = owned(target)
    write(target.ownerId, {
      ...draft,
      attachmentTransfers: draft.attachmentTransfers.map((item) =>
        item.id === transfer.id ? { ...item, ...patch } : item,
      ),
    })
  }
  const reserve = async (
    ownerId: OwnerId,
    expectedRevision: number,
    files: readonly { readonly name: string; readonly mime: string; readonly size: number }[],
    signal: AbortSignal,
  ) => {
    if (ports.beforeReserve) await ports.beforeReserve(ownerId, signal)
    const draft = ports.read(ownerId)
    ports.assertEditable(ownerId, draft)
    if (draft.revision !== expectedRevision)
      throw new CommandError('VERSION_CONFLICT', 'The draft changed before attachment selection')
    if (draft.attachmentTransfers.some((item) => item.status === 'unknown' || item.status === 'reconciling'))
      throw new CommandError('BUSY', 'Resolve the original pending operation before selecting more files')
    if (draft.attachments.length + draft.attachmentTransfers.length + files.length > 12)
      throw new CommandError('ATTACHMENT_LIMIT', 'A draft supports at most twelve selected attachments')
    const revision = draft.revision + 1
    const transfers = files.map((file): DraftAttachmentTransfer => {
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
        originalOperationId: ports.generation(draft),
        name: file.name.slice(0, 240),
        mime: mime.slice(0, 120),
        size: file.size,
        status: error ? 'failed' : 'preparing',
        kind: mime.startsWith('image/') ? 'image' : 'file',
        upload: null,
        confirmed: null,
        error,
      }
    })
    write(ownerId, {
      ...draft,
      revision,
      uploadError: null,
      attachmentTransfers: [...draft.attachmentTransfers, ...transfers],
    })
    return {
      ownerId,
      revision,
      reservations: transfers.map((item) => ({
        reservationId: item.id,
        ownerRevision: item.ownerRevision,
        preparing: item.status === 'preparing',
      })),
    }
  }
  const attach = (target: AttachmentTransferTarget<OwnerId>, attachment: PromptAttachment, acceptCurrent = false) => {
    const { draft, transfer } = owned(target)
    // Typing is fine, but an accepted or otherwise locked operation is a new owner generation.
    if (
      !acceptCurrent &&
      (ports.isBlocked(target.ownerId, draft) || ports.generation(draft) !== transfer.originalOperationId)
    ) {
      update(target, { status: 'ready', confirmed: attachment, error: 'DRAFT_CHANGED' })
      return result(target.ownerId)
    }
    const existing = draft.attachments.some((item) => key(item) === key(attachment))
    write(target.ownerId, {
      ...draft,
      revision: draft.revision + 1,
      uploadError: null,
      attachments: existing ? draft.attachments : [...draft.attachments, attachment],
      attachmentTransfers: draft.attachmentTransfers.filter((item) => item.id !== transfer.id),
    })
    return result(target.ownerId)
  }
  const upload = async (
    target: AttachmentTransferTarget<OwnerId>,
    kind: 'image' | 'file',
    descriptor: AttachmentUploadInput,
    signal: AbortSignal,
  ) => {
    const { draft, transfer } = owned(target)
    ports.assertEditable(target.ownerId, draft)
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
      if (ports.beforeUpload) await ports.beforeUpload(target.ownerId, signal)
      if (ports.prepareUpload) {
        descriptor = await ports.prepareUpload(target.ownerId, ports.read(target.ownerId), descriptor, signal)
        update(target, { upload: descriptor })
      }
      owned(target)
      signal.throwIfAborted()
      dispatched = true
      const artifact = artifactSchema.parse(
        await ports.uploads.execute('attachment.upload', descriptor, { requestId: transfer.id, signal }),
      )
      if (artifact.id !== descriptor.sha256 || artifact.size !== descriptor.size || artifact.mime !== descriptor.mime)
        throw new CommandError('CONTENT_MISMATCH', 'Uploaded content does not match the original file')
      const attachment = { kind, artifact: { ...artifact, name: transfer.name } }
      attach(target, attachment)
      return { ...result(target.ownerId), attachment }
    } catch (error) {
      if (!ports.isDisposed()) {
        const code = codeOf(error)
        update(target, { status: !dispatched || rejected.has(code) ? 'failed' : 'unknown', error: code })
        const current = ports.read(target.ownerId)
        write(target.ownerId, { ...current, uploadError: code })
      }
      throw error
    }
  }

  return {
    reserve: (ownerId, expectedRevision, files, signal = new AbortController().signal) =>
      reserve(ownerId, expectedRevision, files, signal),
    upload,
    failPreparation(target, error) {
      const { draft, transfer } = owned(target)
      ports.assertEditable(target.ownerId, draft)
      if (transfer.status !== 'preparing') throw new CommandError('BUSY', 'Preparation has already finished')
      update(target, { status: 'failed', error })
      return result(target.ownerId)
    },
    removeTransfer(target) {
      const { draft, transfer } = owned(target)
      ports.assertEditable(target.ownerId, draft)
      if (!['preparing', 'failed', 'ready'].includes(transfer.status))
        throw new CommandError('BUSY', 'An uncertain upload cannot be cancelled as if it never reached the Host')
      write(target.ownerId, {
        ...draft,
        revision: draft.revision + 1,
        uploadError: null,
        attachmentTransfers: draft.attachmentTransfers.filter((item) => item.id !== transfer.id),
      })
      return result(target.ownerId)
    },
    removeAttachment(ownerId, expectedRevision, kind, artifactId) {
      const draft = ports.read(ownerId)
      ports.assertEditable(ownerId, draft)
      if (draft.revision !== expectedRevision)
        throw new CommandError('VERSION_CONFLICT', 'The draft changed before attachment removal')
      write(ownerId, {
        ...draft,
        revision: draft.revision + 1,
        uploadError: null,
        attachments: draft.attachments.filter((item) => item.kind !== kind || item.artifact.id !== artifactId),
      })
      return result(ownerId)
    },
    async reconcile(target, signal) {
      const { draft, transfer } = owned(target)
      ports.assertEditable(target.ownerId, draft)
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
          { signal },
        )
        if (
          artifact.id !== transfer.upload.sha256 ||
          artifact.size !== transfer.size ||
          artifact.mime !== transfer.mime
        )
          throw new CommandError('CONTENT_MISMATCH', 'The queried artifact does not match the original upload')
        return attach(target, { kind: transfer.kind, artifact: { ...artifact, name: transfer.name } })
      } catch (error) {
        if (!ports.isDisposed()) update(target, { status: 'unknown', error: codeOf(error) })
        throw error
      }
    },
    acceptReady(target, expectedRevision) {
      const { draft, transfer } = owned(target)
      ports.assertEditable(target.ownerId, draft)
      if (draft.revision !== expectedRevision)
        throw new CommandError('VERSION_CONFLICT', 'The draft changed before accepting the confirmed attachment')
      if (transfer.status !== 'ready' || !transfer.confirmed)
        throw new CommandError('INVALID_INPUT', 'No confirmed attachment is waiting for a new draft')
      return attach(target, transfer.confirmed, true)
    },
    reportError(ownerId, error) {
      const draft = ports.read(ownerId)
      write(ownerId, { ...draft, uploadError: error })
      return result(ownerId)
    },
  }
}

interface AttachmentDraftPorts {
  readonly read: (sessionId: string) => SessionDraftState
  readonly replace: (sessionId: string, next: SessionDraftState) => void
  readonly uploads: CommandExecutor | undefined
  readonly queries: CommandExecutor | undefined
  readonly isDisposed: () => boolean
  readonly preparation?: SessionExecutionPreparationPort | undefined
  readonly references?: DraftArtifactReferencePort | undefined
}

/** Session command adapter; reservations and confirmed refs remain in SessionDraftState. */
export function registerDraftAttachments(local: CommandRegistry, ports: AttachmentDraftPorts): void {
  const references = ports.references
  const blocked = (draft: SessionDraftState) => draft.status === 'submitting' || draft.status === 'unknown'
  const core = createAttachmentTransferCore<string, SessionDraftState>({
    read: ports.read,
    replace: ports.replace,
    assertEditable: (_sessionId, draft) => {
      if (blocked(draft)) throw new CommandError('BUSY', 'Resolve the current session operation before editing')
    },
    isBlocked: (_sessionId, draft) => blocked(draft),
    generation: (draft) => draft.lastOperationId,
    uploads: ports.uploads,
    queries: ports.queries,
    isDisposed: ports.isDisposed,
    ...(references
      ? {
          prepareUpload: async (ownerId, snapshot, descriptor, signal) => ({
            ...descriptor,
            owner: await references.prepareUpload('session', ownerId, snapshot, descriptor, signal),
          }),
        }
      : {}),
    beforeReserve: async (sessionId, signal) => {
      const target = await ports.preparation?.capture(sessionId, signal)
      if (target) ports.preparation?.assertCanPrepare(target)
    },
    beforeUpload: async (sessionId, signal) => {
      const target = await ports.preparation?.capture(sessionId, signal)
      if (target) ports.preparation?.assertCanPrepare(target)
    },
  })
  const sessionTarget = ({
    sessionId,
    reservationId,
    ownerRevision,
  }: AttachmentReservationTarget & {
    readonly sessionId: string
  }): AttachmentTransferTarget<string> => ({ ownerId: sessionId, reservationId, ownerRevision })
  const result = <T extends { readonly ownerId: string; readonly revision: number }>(value: T) => ({
    sessionId: value.ownerId,
    revision: value.revision,
  })

  local.register(draftCommands['draft.reserveAttachments'], async ({ sessionId, expectedRevision, files }, context) => {
    const value = await core.reserve(sessionId, expectedRevision, files, context.signal)
    return { ...result(value), reservations: [...value.reservations] }
  })
  local.register(draftCommands['draft.uploadAttachment'], async ({ kind, upload: descriptor, ...target }, context) => {
    const value = await core.upload(sessionTarget(target), kind, descriptor, context.signal)
    return { ...result(value), attachment: value.attachment }
  })
  local.register(draftCommands['draft.addAttachment'], async ({ sessionId, kind, upload: descriptor }, context) => {
    const draft = ports.read(sessionId)
    if (draft.attachments.length + draft.attachmentTransfers.length >= 12)
      throw new CommandError('BUSY', 'The session draft attachment limit is reached')
    const reserved = await core.reserve(sessionId, draft.revision, [descriptor], context.signal)
    const reservation = reserved.reservations[0]
    if (!reservation?.preparing) throw new CommandError('INVALID_INPUT', 'Attachment metadata cannot be uploaded')
    const value = await core.upload({ ownerId: sessionId, ...reservation }, kind, descriptor, context.signal)
    return { ...result(value), attachment: value.attachment }
  })
  local.register(draftCommands['draft.failAttachmentPreparation'], ({ error, ...target }) =>
    result(core.failPreparation(sessionTarget(target), error)),
  )
  local.register(draftCommands['draft.removeAttachmentTransfer'], (target) =>
    result(core.removeTransfer(sessionTarget(target))),
  )
  local.register(draftCommands['draft.removeAttachment'], ({ sessionId, expectedRevision, kind, artifactId }) =>
    result(core.removeAttachment(sessionId, expectedRevision, kind, artifactId)),
  )
  local.register(draftCommands['draft.reconcileAttachment'], async (target, context) =>
    result(await core.reconcile(sessionTarget(target), context.signal)),
  )
  local.register(draftCommands['draft.acceptReadyAttachment'], ({ expectedRevision, ...target }) =>
    result(core.acceptReady(sessionTarget(target), expectedRevision)),
  )
}
