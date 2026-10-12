import type { PreSessionDraftState } from '@hbar/contracts/commands/pre-session-draft'
import type { SessionWorkspaceMoveEntry } from './session-workspace-move'
import type { SessionDraftState } from './types'
import { localSlashCanSubmit, type LocalSlashCommand } from './composer-slash'

export function firstSendNeedsContinue(draft: PreSessionDraftState | undefined): boolean {
  return Boolean(
    draft &&
    (draft.launchPreparation?.phase === 'paused-navigation' ||
      (draft.phase === 'failed' && draft.error === 'CONTINUE_REQUIRED')),
  )
}
export function firstSendIsLocked(draft: PreSessionDraftState | undefined): boolean {
  return Boolean(
    draft &&
    (['preparing', 'creating', 'configuring', 'submitting', 'unknown'].includes(draft.phase) ||
      firstSendNeedsContinue(draft)),
  )
}
export function isSessionWorkspaceMoveLocked(
  move: Pick<SessionWorkspaceMoveEntry, 'status' | 'targetSessionId'> | undefined,
): boolean {
  return Boolean(
    move &&
    move.status !== 'succeeded' &&
    (move.status === 'busy' || move.status === 'unknown' || move.status === 'paused' || move.targetSessionId !== null),
  )
}
export interface ComposerStateInput {
  readonly connected: boolean
  readonly preparation: 'ready' | 'archived' | 'unverified'
  readonly firstSend: PreSessionDraftState | undefined
  readonly workspaceMove: Pick<SessionWorkspaceMoveEntry, 'status' | 'targetSessionId'> | undefined
  readonly draft:
    Pick<SessionDraftState, 'status' | 'text' | 'attachments' | 'attachmentTransfers' | 'workspaceContexts'> | undefined
  readonly configured: boolean
  readonly modelPending: boolean
  readonly intentPending: boolean
  readonly permissionLocked: boolean
  readonly planModeReady: boolean
  readonly intent: string
  readonly slash: LocalSlashCommand | null
  readonly goalReplacement: boolean
  readonly goalActionPending: boolean
  readonly runActive: boolean
  readonly compactionRunning: boolean
}
/** Read-only policy shared by Views. Runtime command handlers still validate their captured targets. */
export function getComposerState(input: ComposerStateInput) {
  const firstSendLocked = firstSendIsLocked(input.firstSend)
  const workspaceMoveLocked = isSessionWorkspaceMoveLocked(input.workspaceMove)
  const canPrepare = input.preparation === 'ready' && !firstSendLocked && !workspaceMoveLocked
  const draftWritable = Boolean(input.draft && input.draft.status !== 'submitting' && input.draft.status !== 'unknown')
  const hasContent = Boolean(
    input.draft &&
    (input.draft.text.trim() || input.draft.attachments.length || input.draft.workspaceContexts?.length) &&
    (input.intent !== 'goal' || input.draft.text.trim()),
  )
  const canSubmit =
    input.connected &&
    !firstSendLocked &&
    !workspaceMoveLocked &&
    draftWritable &&
    (canPrepare || input.slash === 'settings') &&
    (input.slash
      ? localSlashCanSubmit({
          draftStatus: input.draft?.status,
          modelPending: input.modelPending,
          intentPending: input.intentPending,
          permissionLocked: input.permissionLocked && !input.goalReplacement,
        }) &&
        (input.slash !== 'compact' || (!input.runActive && !input.compactionRunning)) &&
        (input.slash !== 'goal' || !input.goalActionPending)
      : input.configured &&
        input.planModeReady &&
        !input.modelPending &&
        !input.intentPending &&
        !input.permissionLocked &&
        input.draft?.attachmentTransfers.length === 0 &&
        hasContent)
  return { firstSendLocked, workspaceMoveLocked, canPrepare, draftWritable, hasContent, canSubmit }
}
