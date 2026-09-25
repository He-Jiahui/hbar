import type { SessionAttachmentUpload } from '@hbar/app-runtime'
import type { HbarRuntimeView } from './runtime'

export interface HbarSessionAttachmentSelection {
  readonly kind: 'image' | 'file'
  readonly upload: SessionAttachmentUpload
  release(): void
}

export interface AttachmentInputTarget {
  readonly sessionId: string
  readonly revision: number
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code.slice(0, 200)
    : 'EXECUTION_FAILED'
}

/** File references live only for this bounded intake; progress belongs to the existing draft store. */
export async function addComposerAttachments(
  view: HbarRuntimeView,
  target: AttachmentInputTarget,
  files: readonly File[],
  prepare: (file: File) => Promise<HbarSessionAttachmentSelection>,
): Promise<void> {
  if (files.length === 0) return
  const report = async (code: string) => {
    await view.commands
      .execute('draft.reportAttachmentError', { sessionId: target.sessionId, error: code })
      .catch(() => {})
  }
  if (files.length > 12) {
    await report('ATTACHMENT_LIMIT')
    return
  }
  try {
    // Reserve the entire selection before hashing, not after asynchronous preparation.
    const selected = await view.commands.execute('draft.reserveAttachments', {
      sessionId: target.sessionId,
      expectedRevision: target.revision,
      files: files.map((file) => ({ name: file.name, mime: file.type, size: file.size })),
    })
    for (const [index, reservation] of selected.reservations.entries()) {
      const file = files[index]
      if (!reservation.preparing || !file) continue
      const transfer = {
        sessionId: target.sessionId,
        reservationId: reservation.reservationId,
        ownerRevision: reservation.ownerRevision,
      }
      const current = () => {
        const currentDraft = view.state.drafts.getSnapshot()[target.sessionId]
        return currentDraft?.attachmentTransfers.find(
          (item) => item.id === transfer.reservationId && item.ownerRevision === transfer.ownerRevision,
        )
      }
      if (current()?.status !== 'preparing') continue
      let selection: HbarSessionAttachmentSelection | undefined
      try {
        selection = await prepare(file)
        if (current()?.status !== 'preparing') continue
        await view.commands.execute('draft.uploadAttachment', {
          ...transfer,
          kind: selection.kind,
          upload: selection.upload,
        })
      } catch (error) {
        // Upload failures are already owned by the runtime; a removed reservation must not be resurrected.
        if (current()?.status === 'preparing') {
          const code = errorCode(error)
          await view.commands
            .execute('draft.failAttachmentPreparation', {
              ...transfer,
              error: code === 'EXECUTION_FAILED' ? 'PREPARATION_FAILED' : code,
            })
            .catch(() => {})
        }
      } finally {
        selection?.release()
      }
    }
  } catch (error) {
    await report(errorCode(error))
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
