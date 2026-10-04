import { useEffect, useState } from 'react'
import {
  RuntimeCommandError,
  parseWorkspacePage,
  workspaceDisplayName,
  type SessionLaunchDraftEntry,
  type SessionLaunchSelection,
  type SessionWorkspaceMoveEntry,
  type SessionWorkspaceMovePhase,
} from '@hbar/app-runtime'
import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import { HbarPreSessionLocationPicker, type HbarPreSessionLocationLabels } from './pre-session-location-picker'
import type { HbarPreSessionLaunchStatusLabels } from './pre-session-launch-status'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
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

const preparationBusyPhases = new Set(['queued', 'starting', 'preparing', 'cancel-requested', 'reconciling'])
const lockedPhases = new Set([...preparationBusyPhases, 'unknown', 'paused-navigation'])

function preparationStatus(entry: SessionLaunchDraftEntry, labels: HbarPreSessionLaunchStatusLabels): string | null {
  switch (entry.phase) {
    case 'idle':
    case 'ready':
      return null
    case 'unknown':
      return labels.unknown
    case 'paused-navigation':
      return labels.paused
    case 'cancelled':
      return labels.cancelled
    case 'cancel-requested':
      return labels.cancelRequested
    case 'failed':
      return labels.error(entry.error ?? 'EXECUTION_FAILED')
    case 'queued':
    case 'starting':
    case 'preparing':
    case 'reconciling':
      return labels.preparing
    case 'selection':
      return labels.preparing
  }
}

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

  const status = currentEntry ? preparationStatus(currentEntry, props.statusLabels) : null
  const showReconcile =
    currentEntry && ['unknown', 'paused-navigation', 'cancel-requested'].includes(currentEntry.phase)
  const showCancel = currentEntry && preparationBusyPhases.has(currentEntry.phase)
  const moveNeedsAllowConfirmation = moveEntry?.status === 'failed' && moveEntry.error === 'CONFIRMATION_REQUIRED'
  const moveNeedsMentionConfirmation =
    moveEntry?.status === 'failed' && moveEntry.error === 'UNRESOLVED_MENTIONS_CONFIRMATION_REQUIRED'
  const moveStatus = moveEntry
    ? moveEntry.status === 'busy'
      ? props.moveLabels.phases[moveEntry.phase]
      : moveEntry.status === 'unknown'
        ? props.moveLabels.unknown
        : moveEntry.status === 'paused'
          ? props.moveLabels.paused
          : moveEntry.status === 'cancelled'
            ? props.moveLabels.cancelled
            : moveEntry.status === 'succeeded'
              ? props.moveLabels.succeeded(
                  workspaceChoices.find((workspace) => workspace.id === moveEntry.targetWorkspaceId)?.label ??
                    moveEntry.targetWorkspaceId,
                )
              : moveNeedsAllowConfirmation
                ? props.moveLabels.allowConfirmation
                : moveNeedsMentionConfirmation
                  ? props.moveLabels.unresolvedMentions(moveEntry.unresolvedMentionCount)
                  : props.moveLabels.error(moveEntry.error ?? 'EXECUTION_FAILED')
    : null
  const hasMoveStatus = Boolean(
    moveStatus || moveActionError || directoryError || (!workspaceMoves.available && props.connected),
  )
  const moveStatusPanel = hasMoveStatus ? (
    <LumenFrame className="hbar-session-launch-location-status hbar-session-workspace-move-status">
      <LumenText as="p" role={moveActionError || moveEntry?.status === 'failed' ? 'alert' : 'status'}>
        {!workspaceMoves.available
          ? props.moveLabels.unavailable
          : moveActionError
            ? props.moveLabels.error(moveActionError)
            : directoryError
              ? props.labels.error(directoryError)
              : moveStatus}
      </LumenText>
      {directoryError && (
        <LumenButton
          type="button"
          size="s"
          disabled={!props.connected || directoryLoading}
          onClick={() => setDirectoryRefresh((refresh) => refresh + 1)}
        >
          {props.moveLabels.retryDirectories}
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
          {props.moveLabels.confirmAllow}
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
          {props.moveLabels.confirmUnresolvedMentions}
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
            {props.moveLabels.continue}
          </LumenButton>
        )}
      {moveEntry && moveEntry.status !== 'succeeded' && moveEntry.status !== 'cancelled' && (
        <LumenButton type="button" size="s" disabled={!props.connected || cancelCommandPending} onClick={cancelMove}>
          {props.moveLabels.cancel}
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
            {props.moveLabels.retry}
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
          {props.moveLabels.retry}
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
          <LumenText
            as="p"
            role={
              currentEntry?.phase === 'unknown' || currentEntry?.phase === 'failed' || openError || actionError
                ? 'alert'
                : 'status'
            }
          >
            {!launchDrafts.available
              ? props.statusLabels.error('CAPABILITY_UNAVAILABLE')
              : openError
                ? props.labels.error(openError)
                : actionError
                  ? props.statusLabels.error(actionError)
                  : status}
          </LumenText>
          {showReconcile && (
            <LumenButton type="button" size="s" disabled={!props.connected || pending} onClick={reconcile}>
              {props.statusLabels.check}
            </LumenButton>
          )}
          {showCancel && (
            <LumenButton type="button" size="s" disabled={!props.connected || pending} onClick={cancelFirstSend}>
              {props.statusLabels.cancel}
            </LumenButton>
          )}
        </LumenFrame>
      )}
      {!locationOpen && moveStatusPanel}
    </LumenFrame>
  )
}
