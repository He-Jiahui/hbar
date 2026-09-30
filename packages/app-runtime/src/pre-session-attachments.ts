import { type CommandRegistry, type CommandExecutor } from '@hbar/commands'
import type { AttachmentReservationTarget } from '@hbar/contracts/commands/draft'
import { preSessionDraftCommands, type PreSessionDraftState } from '@hbar/contracts/commands/pre-session-draft'
import { createAttachmentTransferCore, type AttachmentTransferTarget } from './draft-attachments'

export interface PreSessionAttachmentPorts {
  readonly read: (draftId: string) => PreSessionDraftState
  readonly replace: (draftId: string, next: PreSessionDraftState) => void
  /** The owning pre-session draft manager applies pending-operation and revision policy. */
  readonly assertEditable: (draftId: string, state: PreSessionDraftState) => void
  readonly uploads: CommandExecutor | undefined
  readonly queries: CommandExecutor | undefined
  readonly isDisposed: () => boolean
}

/** Pre-session adapter; attachment facts stay in the canonical pre-session draft store. */
export function registerPreSessionAttachments(local: CommandRegistry, ports: PreSessionAttachmentPorts): void {
  const blocked = (draft: PreSessionDraftState) =>
    ['preparing', 'creating', 'configuring', 'submitting', 'unknown', 'accepted'].includes(draft.phase)
  const core = createAttachmentTransferCore({
    read: ports.read,
    replace: ports.replace,
    assertEditable: ports.assertEditable,
    isBlocked: (_draftId, draft) => blocked(draft),
    generation: (draft) => draft.operationId,
    uploads: ports.uploads,
    queries: ports.queries,
    isDisposed: ports.isDisposed,
  })
  const draftTarget = ({
    draftId,
    reservationId,
    ownerRevision,
  }: { readonly draftId: string } & AttachmentReservationTarget): AttachmentTransferTarget<string> => ({
    ownerId: draftId,
    reservationId,
    ownerRevision,
  })
  const result = <T extends { readonly ownerId: string; readonly revision: number }>(value: T) => ({
    draftId: value.ownerId,
    revision: value.revision,
  })

  local.register(
    preSessionDraftCommands['preSessionDraft.reserveAttachments'],
    async ({ draftId, expectedRevision, files }, context) => {
      const value = await core.reserve(draftId, expectedRevision, files, context.signal)
      return { ...result(value), reservations: [...value.reservations] }
    },
  )
  local.register(
    preSessionDraftCommands['preSessionDraft.uploadAttachment'],
    async ({ kind, upload: descriptor, ...target }, context) => {
      const value = await core.upload(draftTarget(target), kind, descriptor, context.signal)
      return { ...result(value), attachment: value.attachment }
    },
  )
  local.register(
    preSessionDraftCommands['preSessionDraft.failAttachmentPreparation'],
    ({ draftId, error, ...target }) => result(core.failPreparation(draftTarget({ draftId, ...target }), error)),
  )
  local.register(preSessionDraftCommands['preSessionDraft.removeAttachmentTransfer'], (target) =>
    result(core.removeTransfer(draftTarget(target))),
  )
  local.register(
    preSessionDraftCommands['preSessionDraft.removeAttachment'],
    ({ draftId, expectedRevision, kind, artifactId }) =>
      result(core.removeAttachment(draftId, expectedRevision, kind, artifactId)),
  )
  local.register(preSessionDraftCommands['preSessionDraft.reconcileAttachment'], async (target, context) =>
    result(await core.reconcile(draftTarget(target), context.signal)),
  )
  local.register(preSessionDraftCommands['preSessionDraft.acceptReadyAttachment'], ({ expectedRevision, ...target }) =>
    result(core.acceptReady(draftTarget(target), expectedRevision)),
  )
  local.register(preSessionDraftCommands['preSessionDraft.reportAttachmentError'], ({ draftId, error }) =>
    result(core.reportError(draftId, error)),
  )
}
