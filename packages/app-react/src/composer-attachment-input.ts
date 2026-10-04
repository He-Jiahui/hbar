import type { SessionAttachmentUpload, SessionDraftState } from '@hbar/app-runtime'
import type { HbarRuntimeView } from './runtime'

type AttachmentTransfer = SessionDraftState['attachmentTransfers'][number]

export interface HbarSessionAttachmentSelection {
  readonly kind: 'image' | 'file'
  readonly upload: SessionAttachmentUpload
  release(): void
}

export interface AttachmentInputTarget {
  /** A live session keeps the established draft command owner. */
  readonly sessionId: string
  readonly revision: number
}

export interface PreSessionAttachmentInputTarget {
  readonly draftId: string
  readonly sessionId?: never
  readonly revision: number
}

export type ComposerAttachmentInputTarget = AttachmentInputTarget | PreSessionAttachmentInputTarget

export interface ComposerAttachmentInputOptions {
  /** Serialize only the reservation with local draft writes; hashing and upload continue after it releases. */
  readonly reserve?: <Result>(operation: () => Promise<Result>) => Promise<Result>
  /** Read the latest owner revision when a queued reservation actually runs. */
  readonly currentRevision?: () => number
}

type AttachmentReservations = {
  readonly reservations: readonly {
    readonly reservationId: string
    readonly ownerRevision: number
    readonly preparing: boolean
  }[]
}
type AttachmentFileMetadata = { readonly name: string; readonly mime: string; readonly size: number }

interface AttachmentInputOwner {
  reserve(expectedRevision: number, files: AttachmentFileMetadata[]): Promise<AttachmentReservations>
  currentTransfer(reservationId: string, ownerRevision: number): AttachmentTransfer | undefined
  upload(
    reservationId: string,
    ownerRevision: number,
    kind: 'image' | 'file',
    upload: SessionAttachmentUpload,
  ): Promise<unknown>
  fail(reservationId: string, ownerRevision: number, error: string): Promise<unknown>
  report(error: string): Promise<unknown>
}

function attachmentInputOwner(view: HbarRuntimeView, target: ComposerAttachmentInputTarget): AttachmentInputOwner {
  if ('draftId' in target) {
    const draftId = target.draftId
    return {
      reserve: (expectedRevision, files) =>
        view.commands.execute('preSessionDraft.reserveAttachments', { draftId, expectedRevision, files }),
      currentTransfer: (reservationId, ownerRevision) => {
        const currentDraft = view.state.preSessionDrafts.getSnapshot()[draftId]
        return currentDraft?.attachmentTransfers.find(
          (item) => item.id === reservationId && item.ownerRevision === ownerRevision,
        )
      },
      upload: (reservationId, ownerRevision, kind, upload) =>
        view.commands.execute('preSessionDraft.uploadAttachment', {
          draftId,
          reservationId,
          ownerRevision,
          kind,
          upload,
        }),
      fail: (reservationId, ownerRevision, error) =>
        view.commands.execute('preSessionDraft.failAttachmentPreparation', {
          draftId,
          reservationId,
          ownerRevision,
          error,
        }),
      report: (error) => view.commands.execute('preSessionDraft.reportAttachmentError', { draftId, error }),
    }
  }
  const sessionId = target.sessionId
  return {
    reserve: (expectedRevision, files) =>
      view.commands.execute('draft.reserveAttachments', { sessionId, expectedRevision, files }),
    currentTransfer: (reservationId, ownerRevision) => {
      const currentDraft = view.state.drafts.getSnapshot()[sessionId]
      return currentDraft?.attachmentTransfers.find(
        (item) => item.id === reservationId && item.ownerRevision === ownerRevision,
      )
    },
    upload: (reservationId, ownerRevision, kind, upload) =>
      view.commands.execute('draft.uploadAttachment', {
        sessionId,
        reservationId,
        ownerRevision,
        kind,
        upload,
      }),
    fail: (reservationId, ownerRevision, error) =>
      view.commands.execute('draft.failAttachmentPreparation', {
        sessionId,
        reservationId,
        ownerRevision,
        error,
      }),
    report: (error) => view.commands.execute('draft.reportAttachmentError', { sessionId, error }),
  }
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code.slice(0, 200)
    : 'EXECUTION_FAILED'
}

function runReservation<Result>(operation: () => Promise<Result>): Promise<Result> {
  return operation()
}

/** File references live only for this bounded intake; progress belongs to the existing draft store. */
export async function addComposerAttachments(
  view: HbarRuntimeView,
  target: ComposerAttachmentInputTarget,
  files: readonly File[],
  prepare: (file: File) => Promise<HbarSessionAttachmentSelection>,
  options: ComposerAttachmentInputOptions = {},
): Promise<void> {
  if (files.length === 0) return
  const owner = attachmentInputOwner(view, target)
  if (files.length > 12) {
    await owner.report('ATTACHMENT_LIMIT').catch(() => {})
    return
  }
  try {
    // Reserve the entire selection before hashing, not after asynchronous preparation.
    const fileMetadata = files.map((file) => ({ name: file.name, mime: file.type, size: file.size }))
    const reserve = options.reserve ?? runReservation
    const selected = await reserve(() => owner.reserve(options.currentRevision?.() ?? target.revision, fileMetadata))
    for (const [index, reservation] of selected.reservations.entries()) {
      const file = files[index]
      if (!reservation.preparing || !file) continue
      const current = () => owner.currentTransfer(reservation.reservationId, reservation.ownerRevision)
      if (current()?.status !== 'preparing') continue
      let selection: HbarSessionAttachmentSelection | undefined
      try {
        selection = await prepare(file)
        if (current()?.status !== 'preparing') continue
        await owner.upload(reservation.reservationId, reservation.ownerRevision, selection.kind, selection.upload)
      } catch (error) {
        // Upload failures are already owned by the runtime; a removed reservation must not be resurrected.
        if (current()?.status === 'preparing') {
          const code = errorCode(error)
          await owner
            .fail(
              reservation.reservationId,
              reservation.ownerRevision,
              code === 'EXECUTION_FAILED' ? 'PREPARATION_FAILED' : code,
            )
            .catch(() => {})
        }
      } finally {
        selection?.release()
      }
    }
  } catch (error) {
    await owner.report(errorCode(error)).catch(() => {})
  }
}

/** Ordinary clipboard text is deliberately left to the text control's native paste. */
export function composerFiles(data: Pick<DataTransfer, 'files' | 'items'>): readonly File[] {
  if (data.files.length > 0) return Array.from(data.files)
  return Array.from(data.items).flatMap((item) => {
    if (item.kind !== 'file') return []
    const file = item.getAsFile()
    return file ? [file] : []
  })
}
