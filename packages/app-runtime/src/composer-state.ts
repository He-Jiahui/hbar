import type { PreSessionDraftState } from '@hbar/contracts/commands/pre-session-draft'
import type { SessionWorkspaceMoveEntry } from './session-workspace-move'
import type { SessionDraftState, SessionTimelineState } from './types'
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
  readonly sessionLoaded: boolean
  readonly timelineStatus: SessionTimelineState['status']
  readonly cancelAllowed: boolean
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
export type ComposerBlockedReason =
  | 'disconnected'
  | 'first-send'
  | 'workspace-move'
  | 'history'
  | 'execution-unavailable'
  | 'draft-pending'
  | 'model-pending'
  | 'intent-pending'
  | 'permission'
  | 'plan-pending'
  | 'uploading'
  | 'model-required'
  | 'empty'
  | 'run-active'
  | 'compacting'
  | 'goal-pending'
export interface ComposerState {
  readonly firstSendLocked: boolean
  readonly workspaceMoveLocked: boolean
  readonly locked: boolean
  readonly canPrepare: boolean
  readonly draftWritable: boolean
  readonly hasContent: boolean
  readonly canSubmit: boolean
  readonly blockedReason: ComposerBlockedReason | null
  readonly editorDisabled: boolean
  readonly optionControlsLocked: boolean
  readonly intentControlsLocked: boolean
  readonly showStop: boolean
  readonly canStop: boolean
}
/** Read-only policy shared by Views. Runtime command handlers still validate their captured targets. */
export function getComposerState(input: ComposerStateInput): ComposerState {
  const firstSendLocked = firstSendIsLocked(input.firstSend)
  const workspaceMoveLocked = isSessionWorkspaceMoveLocked(input.workspaceMove)
  const locked = firstSendLocked || workspaceMoveLocked
  const historyUnavailable =
    !input.sessionLoaded || input.timelineStatus === 'loading' || input.timelineStatus === 'error'
  const draftPending = input.draft?.status === 'submitting' || input.draft?.status === 'unknown'
  const canPrepare = input.preparation === 'ready' && !firstSendLocked && !workspaceMoveLocked
  const draftWritable = Boolean(input.draft && input.draft.status !== 'submitting' && input.draft.status !== 'unknown')
  const hasContent = Boolean(
    input.draft &&
    (input.draft.text.trim() || input.draft.attachments.length || input.draft.workspaceContexts?.length) &&
    (input.intent !== 'goal' || input.draft.text.trim()),
  )
  const canSubmit =
    input.connected &&
    !historyUnavailable &&
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
  const blockedReason: ComposerBlockedReason | null = canSubmit
    ? null
    : !input.connected
      ? 'disconnected'
      : firstSendLocked
        ? 'first-send'
        : workspaceMoveLocked
          ? 'workspace-move'
          : historyUnavailable
            ? 'history'
            : !canPrepare && input.slash !== 'settings'
              ? 'execution-unavailable'
              : draftPending || !input.draft
                ? 'draft-pending'
                : input.modelPending
                  ? 'model-pending'
                  : input.intentPending
                    ? 'intent-pending'
                    : input.permissionLocked && !(input.slash === 'goal' && input.goalReplacement)
                      ? 'permission'
                      : input.slash === 'goal' && input.goalActionPending
                        ? 'goal-pending'
                        : input.slash === 'compact' && input.runActive
                          ? 'run-active'
                          : input.slash === 'compact' && input.compactionRunning
                            ? 'compacting'
                            : !input.slash && !input.configured
                              ? 'model-required'
                              : !input.slash && !input.planModeReady
                                ? 'plan-pending'
                                : !input.slash && input.draft.attachmentTransfers.length > 0
                                  ? 'uploading'
                                  : 'empty'
  return {
    firstSendLocked,
    workspaceMoveLocked,
    locked,
    canPrepare,
    draftWritable,
    hasContent,
    canSubmit,
    blockedReason,
    editorDisabled:
      locked ||
      (input.connected &&
        ((!input.firstSend && !input.sessionLoaded) ||
          input.timelineStatus === 'loading' ||
          input.timelineStatus === 'error')),
    optionControlsLocked: locked || draftPending || input.intentPending,
    intentControlsLocked: locked || draftPending || input.permissionLocked,
    showStop: input.runActive,
    canStop: input.connected && input.runActive && input.cancelAllowed,
  }
}
