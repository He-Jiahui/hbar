import { useEffect, useState } from 'react'
import {
  RuntimeCommandError,
  parseWorkspacePage,
  workspaceDisplayName,
  type SessionLaunchSelection,
  type SessionWorkspaceMoveEntry,
  type SessionWorkspaceMovePhase,
} from '@hbar/app-runtime'
import { LumenContentText, LumenButton, LumenFrame } from '@lumen/app-ui'
import { HbarPreSessionLocationPicker, type HbarPreSessionLocationLabels } from './pre-session-location-picker'
import type { HbarPreSessionLaunchStatusLabels } from './pre-session-launch-status'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { createMessageScope } from './messages'
import './session-launch-location.css'

export interface HbarSessionWorkspaceMoveLabels {
  readonly phases: Readonly<Record<SessionWorkspaceMovePhase, string>>
  readonly unavailable: string
  readonly unknown: string
  readonly paused: string
  readonly cancelled: string
  readonly succeeded: (workspace: string) => string
  readonly error: (code: string) => string
  readonly allowConfirmation: string
  readonly confirmAllow: string
  readonly unresolvedMentions: (count: number) => string
  readonly confirmUnresolvedMentions: string
  readonly continue: string
  readonly retry: string
  readonly cancel: string
  readonly retryDirectories: string
}

export interface HbarSessionLaunchLocationProps {
  readonly sessionId: string
  readonly workspaceId: string
  readonly workspaceName: string
  readonly workspacePath?: string | undefined
  readonly connected: boolean
  readonly labels: HbarPreSessionLocationLabels
  readonly statusLabels: HbarPreSessionLaunchStatusLabels
  readonly moveLabels: HbarSessionWorkspaceMoveLabels
}

type SessionLaunchMessages = {
  readonly phases: HbarSessionWorkspaceMoveLabels['phases']
  readonly moveUnavailable: string
  readonly moveUnknown: string
  readonly movePaused: string
  readonly moveCancelled: string
  readonly moveSucceeded: HbarSessionWorkspaceMoveLabels['succeeded']
  readonly moveError: HbarSessionWorkspaceMoveLabels['error']
  readonly moveAllowConfirmation: string
  readonly moveConfirmAllow: string
  readonly moveUnresolvedMentions: HbarSessionWorkspaceMoveLabels['unresolvedMentions']
  readonly moveConfirmUnresolvedMentions: string
  readonly moveContinue: string
  readonly moveRetry: string
  readonly moveCancel: string
  readonly moveRetryDirectories: string
  readonly statusUnknown: string
  readonly statusPaused: string
  readonly statusCancelled: string
  readonly statusCancelRequested: string
  readonly statusError: HbarPreSessionLaunchStatusLabels['error']
  readonly statusPreparing: string
  readonly statusCheck: string
  readonly statusCancel: string
  readonly locationError: HbarPreSessionLocationLabels['error']
}
const sessionLaunchMessages = createMessageScope<SessionLaunchMessages>()

const preparationBusyPhases = new Set(['queued', 'starting', 'preparing', 'cancel-requested', 'reconciling'])
const lockedPhases = new Set([...preparationBusyPhases, 'unknown', 'paused-navigation'])

function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function moveIsLocked(entry: SessionWorkspaceMoveEntry | undefined): boolean {
  if (!entry || entry.status === 'succeeded') return false
  if (entry.status === 'busy' || entry.status === 'unknown' || entry.status === 'paused') return true
  return entry.targetSessionId !== null
}

export function HbarSessionLaunchLocation(props: HbarSessionLaunchLocationProps) {
  const { statusLabels, moveLabels } = props
  return (
    <sessionLaunchMessages.Provider
      messages={{
        phases: moveLabels.phases,
        moveUnavailable: moveLabels.unavailable,
        moveUnknown: moveLabels.unknown,
        movePaused: moveLabels.paused,
        moveCancelled: moveLabels.cancelled,
        moveSucceeded: moveLabels.succeeded,
        moveError: moveLabels.error,
        moveAllowConfirmation: moveLabels.allowConfirmation,
        moveConfirmAllow: moveLabels.confirmAllow,
        moveUnresolvedMentions: moveLabels.unresolvedMentions,
        moveConfirmUnresolvedMentions: moveLabels.confirmUnresolvedMentions,
        moveContinue: moveLabels.continue,
        moveRetry: moveLabels.retry,
        moveCancel: moveLabels.cancel,
        moveRetryDirectories: moveLabels.retryDirectories,
        statusUnknown: statusLabels.unknown,
        statusPaused: statusLabels.paused,
        statusCancelled: statusLabels.cancelled,
        statusCancelRequested: statusLabels.cancelRequested,
        statusError: statusLabels.error,
        statusPreparing: statusLabels.preparing,
        statusCheck: statusLabels.check,
        statusCancel: statusLabels.cancel,
        locationError: props.labels.error,
      }}
    >
      <SessionLaunchLocationContent {...props} />
    </sessionLaunchMessages.Provider>
  )
}

function SessionLaunchLocationContent(props: HbarSessionLaunchLocationProps) {
  const { t } = sessionLaunchMessages.useMessages()
  const runtime = useHbarRuntime()
  const launchDrafts = useHbarRuntimeState(runtime.state.sessionLaunchDrafts)
  const branches = useHbarRuntimeState(runtime.state.preSessionLaunchBranches)
  const branchCreation = useHbarRuntimeState(runtime.state.sessionLaunchBranchCreation)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const displayNames = useHbarRuntimeState(runtime.state.workspaceDisplayNameSnapshot)
  const workspaceMoves = useHbarRuntimeState(runtime.state.sessionWorkspaceMove)
  const [locationOpen, setLocationOpen] = useState(false)
  const [branchSearch, setBranchSearch] = useState('')
  const [opening, setOpening] = useState(true)
  const [openError, setOpenError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [workspaceCursor, setWorkspaceCursor] = useState<string | null>(null)
  const [directoryLoading, setDirectoryLoading] = useState(false)
  const [directoryError, setDirectoryError] = useState<string | null>(null)
  const [directoryRefresh, setDirectoryRefresh] = useState(0)
  const [moveCommandPending, setMoveCommandPending] = useState(false)
  const [cancelCommandPending, setCancelCommandPending] = useState(false)
  const [moveActionError, setMoveActionError] = useState<string | null>(null)
  const [allowConfirmed, setAllowConfirmed] = useState(false)
  const entry = launchDrafts.entries[props.sessionId]
  const currentEntry = entry?.workspaceId === props.workspaceId ? entry : undefined
  const currentBranchCreation = branchCreation.entries[props.sessionId] ?? null
  const page = branches.workspaceId === props.workspaceId && branches.search === branchSearch ? branches.page : null
  const moveEntry =
    workspaceMoves.entries[props.sessionId] ??
    Object.values(workspaceMoves.entries).find(
      (candidate) => candidate.targetSessionId === props.sessionId && candidate.targetWorkspaceId === props.workspaceId,
    )
  const moveLocked = moveIsLocked(moveEntry)
  const busy = currentEntry ? lockedPhases.has(currentEntry.phase) : true
  const unavailable = !launchDrafts.available || !currentEntry
  const disabled = !props.connected || opening || unavailable || busy || moveLocked
  const workspaceChoices = Object.values(directory.workspaces).map((workspace) => ({
    id: workspace.id,
    label: workspaceDisplayName(workspace, displayNames),
    detail: workspace.path,
  }))
  if (!workspaceChoices.some((workspace) => workspace.id === props.workspaceId))
    workspaceChoices.unshift({
      id: props.workspaceId,
      label: props.workspaceName,
      detail: props.workspacePath ?? '',
    })

  useEffect(() => {
    let live = true
    setOpening(true)
    setOpenError(null)
    void runtime.commands
      .execute('sessionLaunchDraft.open', { sessionId: props.sessionId, workspaceId: props.workspaceId })
      .catch((reason: unknown) => {
        if (live) setOpenError(errorCode(reason))
      })
      .finally(() => {
        if (live) setOpening(false)
      })
    return () => {
      live = false
    }
  }, [props.sessionId, props.workspaceId, runtime])

  useEffect(() => {
    if (!locationOpen || !props.connected) return
    let live = true
    setDirectoryLoading(true)
    setDirectoryError(null)
    void runtime.commands
      .execute('workspace.list', { limit: 100 })
      .then((value) => {
        if (live) setWorkspaceCursor(parseWorkspacePage(value).nextCursor)
      })
      .catch((reason: unknown) => {
        if (live) setDirectoryError(errorCode(reason))
      })
      .finally(() => {
        if (live) setDirectoryLoading(false)
      })
    return () => {
      live = false
    }
  }, [directoryRefresh, locationOpen, props.connected, runtime])

  useEffect(() => {
    if (!locationOpen || !props.connected) return
    const timeout = setTimeout(
      () => {
        void runtime.commands
          .execute('preSessionLaunchBranches.load', {
            workspaceId: props.workspaceId,
            search: branchSearch,
          })
          .catch(() => undefined)
      },
      branchSearch ? 150 : 0,
    )
    return () => clearTimeout(timeout)
  }, [branchSearch, locationOpen, props.connected, props.workspaceId, runtime])

  useEffect(() => {
    setAllowConfirmed(false)
    setMoveActionError(null)
  }, [props.sessionId])

  const chooseSelection = async (selection: SessionLaunchSelection) => {
    const captured = runtime.state.sessionLaunchDrafts.getSnapshot().entries[props.sessionId]
    if (!captured || captured.workspaceId !== props.workspaceId)
      throw new RuntimeCommandError('STALE_TARGET', 'Session launch Location is no longer available')
    await runtime.commands.execute('sessionLaunchDraft.setSelection', {
      sessionId: props.sessionId,
      expectedRevision: captured.revision,
      selection,
    })
  }

  const reconcile = () => {
    if (pending) return
    setPending(true)
    setActionError(null)
    void runtime.commands
      .execute('sessionLaunchDraft.reconcile', { sessionId: props.sessionId })
      .catch((reason: unknown) => setActionError(errorCode(reason)))
      .finally(() => setPending(false))
  }

  const cancelFirstSend = () => {
    if (pending) return
    setPending(true)
    setActionError(null)
    void runtime.commands
      .execute('sessionLaunchDraft.cancel', { sessionId: props.sessionId })
      .catch((reason: unknown) => setActionError(errorCode(reason)))
      .finally(() => setPending(false))
  }

  const loadMoreDirectories = () => {
    if (!workspaceCursor || directoryLoading) return
    const cursor = workspaceCursor
    setDirectoryLoading(true)
    setDirectoryError(null)
    void runtime.commands
      .execute('workspace.list', { after: cursor, limit: 100 })
      .then((value) => setWorkspaceCursor(parseWorkspacePage(value).nextCursor))
      .catch((reason: unknown) => setDirectoryError(errorCode(reason)))
      .finally(() => setDirectoryLoading(false))
  }

  const runMove = async (input: {
    readonly targetWorkspaceId: string
    readonly confirmAllow?: true
    readonly confirmUnresolvedMentions?: true
  }): Promise<boolean> => {
    if (moveCommandPending || !workspaceMoves.available || moveLocked || input.targetWorkspaceId === props.workspaceId)
      return false
    const pendingSource = moveEntry && moveEntry.targetSessionId === null ? moveEntry : undefined
    const sourceSessionId = pendingSource?.sourceSessionId ?? props.sessionId
    const sourceWorkspaceId = pendingSource?.sourceWorkspaceId ?? props.workspaceId
    const expectedDraftRevision = runtime.state.drafts.getSnapshot()[sourceSessionId]?.revision ?? 0
    setMoveCommandPending(true)
    setMoveActionError(null)
    try {
      await runtime.commands.execute('sessionWorkspaceMove.move', {
        sessionId: sourceSessionId,
        workspaceId: sourceWorkspaceId,
        targetWorkspaceId: input.targetWorkspaceId,
        expectedDraftRevision,
        ...(input.confirmAllow ? { confirmAllow: true } : {}),
        ...(input.confirmUnresolvedMentions ? { confirmUnresolvedMentions: true } : {}),
      })
      return runtime.state.sessionWorkspaceMove.getSnapshot().entries[sourceSessionId]?.status === 'succeeded'
    } catch (reason) {
      setMoveActionError(errorCode(reason))
      return false
    } finally {
      setMoveCommandPending(false)
    }
  }

  const continueMove = () => {
    if (!moveEntry || moveCommandPending) return
    setMoveCommandPending(true)
    setMoveActionError(null)
    void runtime.commands
      .execute('sessionWorkspaceMove.continue', { sessionId: moveEntry.sourceSessionId })
      .catch((reason: unknown) => setMoveActionError(errorCode(reason)))
      .finally(() => setMoveCommandPending(false))
  }

  const cancelMove = () => {
    if (!moveEntry || cancelCommandPending) return
    setCancelCommandPending(true)
    setMoveActionError(null)
    void runtime.commands
      .execute('sessionWorkspaceMove.cancel', { sessionId: moveEntry.sourceSessionId })
      .catch((reason: unknown) => setMoveActionError(errorCode(reason)))
      .finally(() => setCancelCommandPending(false))
  }

  const status = currentEntry
    ? (() => {
        switch (currentEntry.phase) {
          case 'idle':
          case 'ready':
            return null
          case 'unknown':
            return t('statusUnknown')
          case 'paused-navigation':
            return t('statusPaused')
          case 'cancelled':
            return t('statusCancelled')
          case 'cancel-requested':
            return t('statusCancelRequested')
          case 'failed':
            return t('statusError')(currentEntry.error ?? 'EXECUTION_FAILED')
          case 'queued':
          case 'starting':
          case 'preparing':
          case 'reconciling':
          case 'selection':
            return t('statusPreparing')
        }
      })()
    : null
  const showReconcile =
    currentEntry && ['unknown', 'paused-navigation', 'cancel-requested'].includes(currentEntry.phase)
  const showCancel = currentEntry && preparationBusyPhases.has(currentEntry.phase)
  const moveNeedsAllowConfirmation = moveEntry?.status === 'failed' && moveEntry.error === 'CONFIRMATION_REQUIRED'
  const moveNeedsMentionConfirmation =
    moveEntry?.status === 'failed' && moveEntry.error === 'UNRESOLVED_MENTIONS_CONFIRMATION_REQUIRED'
  const moveStatus = moveEntry
    ? moveEntry.status === 'busy'
      ? t('phases')[moveEntry.phase]
      : moveEntry.status === 'unknown'
        ? t('moveUnknown')
        : moveEntry.status === 'paused'
          ? t('movePaused')
          : moveEntry.status === 'cancelled'
            ? t('moveCancelled')
            : moveEntry.status === 'succeeded'
              ? t('moveSucceeded')(
                  workspaceChoices.find((workspace) => workspace.id === moveEntry.targetWorkspaceId)?.label ??
                    moveEntry.targetWorkspaceId,
                )
              : moveNeedsAllowConfirmation
                ? t('moveAllowConfirmation')
                : moveNeedsMentionConfirmation
                  ? t('moveUnresolvedMentions')(moveEntry.unresolvedMentionCount)
                  : t('moveError')(moveEntry.error ?? 'EXECUTION_FAILED')
    : null
  const hasMoveStatus = Boolean(
    moveStatus || moveActionError || directoryError || (!workspaceMoves.available && props.connected),
  )
  const moveStatusPanel = hasMoveStatus ? (
    <LumenFrame className="hbar-session-launch-location-status hbar-session-workspace-move-status">
      <LumenContentText
        context="feedback.message"
        role={moveActionError || moveEntry?.status === 'failed' ? 'alert' : 'status'}
      >
        {!workspaceMoves.available
          ? t('moveUnavailable')
          : moveActionError
            ? t('moveError')(moveActionError)
            : directoryError
              ? t('locationError')(directoryError)
              : moveStatus}
      </LumenContentText>
      {directoryError && (
        <LumenButton
          type="button"
          size="s"
          disabled={!props.connected || directoryLoading}
          onClick={() => setDirectoryRefresh((refresh) => refresh + 1)}
        >
          {t('moveRetryDirectories')}
        </LumenButton>
      )}
      {moveNeedsAllowConfirmation && moveEntry && (
        <LumenButton
          type="button"
          size="s"
          disabled={!props.connected || moveCommandPending}
          onClick={() => {
            setAllowConfirmed(true)
            void runMove({ targetWorkspaceId: moveEntry.targetWorkspaceId, confirmAllow: true })
          }}
        >
          {t('moveConfirmAllow')}
        </LumenButton>
      )}
      {moveNeedsMentionConfirmation && moveEntry && (
        <LumenButton
          type="button"
          size="s"
          disabled={!props.connected || moveCommandPending}
          onClick={() =>
            void runMove({
              targetWorkspaceId: moveEntry.targetWorkspaceId,
              ...(allowConfirmed ? { confirmAllow: true as const } : {}),
              confirmUnresolvedMentions: true,
            })
          }
        >
          {t('moveConfirmUnresolvedMentions')}
        </LumenButton>
      )}
      {moveEntry &&
        moveEntry.status !== 'busy' &&
        moveEntry.status !== 'succeeded' &&
        (moveEntry.targetSessionId !== null ||
          moveEntry.status === 'unknown' ||
          moveEntry.status === 'paused' ||
          moveEntry.status === 'cancelled') && (
          <LumenButton type="button" size="s" disabled={!props.connected || moveCommandPending} onClick={continueMove}>
            {t('moveContinue')}
          </LumenButton>
        )}
      {moveEntry && moveEntry.status !== 'succeeded' && moveEntry.status !== 'cancelled' && (
        <LumenButton type="button" size="s" disabled={!props.connected || cancelCommandPending} onClick={cancelMove}>
          {t('moveCancel')}
        </LumenButton>
      )}
      {moveEntry &&
        moveEntry.status === 'failed' &&
        moveEntry.targetSessionId === null &&
        !moveNeedsAllowConfirmation &&
        !moveNeedsMentionConfirmation && (
          <LumenButton
            type="button"
            size="s"
            disabled={!props.connected || moveCommandPending}
            onClick={() =>
              void runMove({
                targetWorkspaceId: moveEntry.targetWorkspaceId,
                ...(allowConfirmed ? { confirmAllow: true as const } : {}),
              })
            }
          >
            {t('moveRetry')}
          </LumenButton>
        )}
      {moveEntry && moveEntry.status === 'cancelled' && moveEntry.targetSessionId === null && (
        <LumenButton
          type="button"
          size="s"
          disabled={!props.connected || moveCommandPending}
          onClick={() =>
            void runMove({
              targetWorkspaceId: moveEntry.targetWorkspaceId,
              ...(allowConfirmed ? { confirmAllow: true as const } : {}),
            })
          }
        >
          {t('moveRetry')}
        </LumenButton>
      )}
    </LumenFrame>
  ) : null

  return (
    <LumenFrame className="hbar-session-launch-location">
      <HbarPreSessionLocationPicker
        labels={props.labels}
        directories={workspaceChoices}
        workspaceId={props.workspaceId}
        selection={currentEntry?.selection ?? { mode: 'shared-current' }}
        page={page}
        draftRevision={currentEntry?.revision ?? null}
        branchCreation={currentBranchCreation}
        branchCreationAvailable={props.connected && launchDrafts.available}
        workspaceChangeAvailable={props.connected && workspaceMoves.available && !disabled && !moveCommandPending}
        sharedBranchAvailable={
          !workspaceChoices.find((workspace) => workspace.id === props.workspaceId)?.detail.startsWith('hbar-node:')
        }
        loading={opening || branches.status === 'loading' || directoryLoading}
        error={branches.workspaceId === props.workspaceId && branches.search === branchSearch ? branches.error : null}
        disabled={disabled || moveCommandPending}
        hasMoreDirectories={Boolean(workspaceCursor)}
        statusExtra={locationOpen ? moveStatusPanel : undefined}
        onOpen={() => {
          setLocationOpen(true)
          setBranchSearch('')
          setActionError(null)
          if (directoryError) setDirectoryRefresh((refresh) => refresh + 1)
        }}
        onClose={() => setLocationOpen(false)}
        onWorkspace={async (targetWorkspaceId) => {
          if (targetWorkspaceId === props.workspaceId) return
          const succeeded = await runMove({
            targetWorkspaceId,
            ...(allowConfirmed ? { confirmAllow: true as const } : {}),
          })
          return succeeded ? undefined : false
        }}
        onSelection={chooseSelection}
        onSearch={setBranchSearch}
        onMoreBranches={() => {
          const cursor = branches.page?.nextCursor
          if (!cursor || branches.workspaceId !== props.workspaceId || branches.search !== branchSearch) return
          void runtime.commands
            .execute('preSessionLaunchBranches.load', {
              workspaceId: props.workspaceId,
              search: branchSearch,
              cursor,
            })
            .catch(() => undefined)
        }}
        onMoreDirectories={loadMoreDirectories}
        onCaptureBranchBase={(expectedRevision) =>
          runtime.commands.execute('sessionLaunchBranchCreation.capture', {
            draftId: props.sessionId,
            expectedRevision,
          })
        }
        onCreateBranch={(name, expectedRevision) =>
          runtime.commands.execute('sessionLaunchBranchCreation.create', {
            draftId: props.sessionId,
            expectedRevision,
            name,
          })
        }
        onReconcileBranch={(expectedRevision) =>
          runtime.commands.execute('sessionLaunchBranchCreation.reconcile', {
            draftId: props.sessionId,
            expectedRevision,
          })
        }
        onAdoptBranch={(expectedRevision) =>
          runtime.commands.execute('sessionLaunchBranchCreation.adopt', {
            draftId: props.sessionId,
            expectedRevision,
          })
        }
        onCancelBranchCreate={() =>
          runtime.commands.execute('sessionLaunchBranchCreation.cancel', { draftId: props.sessionId })
        }
      />
      {(status || openError || actionError || !launchDrafts.available) && (
        <LumenFrame className="hbar-session-launch-location-status">
          <LumenContentText
            context="feedback.message"
            role={
              currentEntry?.phase === 'unknown' || currentEntry?.phase === 'failed' || openError || actionError
                ? 'alert'
                : 'status'
            }
          >
            {!launchDrafts.available
              ? t('statusError')('CAPABILITY_UNAVAILABLE')
              : openError
                ? t('locationError')(openError)
                : actionError
                  ? t('statusError')(actionError)
                  : status}
          </LumenContentText>
          {showReconcile && (
            <LumenButton type="button" size="s" disabled={!props.connected || pending} onClick={reconcile}>
              {t('statusCheck')}
            </LumenButton>
          )}
          {showCancel && (
            <LumenButton type="button" size="s" disabled={!props.connected || pending} onClick={cancelFirstSend}>
              {t('statusCancel')}
            </LumenButton>
          )}
        </LumenFrame>
      )}
      {!locationOpen && moveStatusPanel}
    </LumenFrame>
  )
}
