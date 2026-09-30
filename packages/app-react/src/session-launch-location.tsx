import { useEffect, useState } from 'react'
import { RuntimeCommandError, type SessionLaunchDraftEntry, type SessionLaunchSelection } from '@hbar/app-runtime'
import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import { HbarPreSessionLocationPicker, type HbarPreSessionLocationLabels } from './pre-session-location-picker'
import type { HbarPreSessionLaunchStatusLabels } from './pre-session-launch-status'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'

export interface HbarSessionLaunchLocationProps {
  readonly sessionId: string
  readonly workspaceId: string
  readonly workspaceName: string
  readonly workspacePath?: string | undefined
  readonly connected: boolean
  readonly labels: HbarPreSessionLocationLabels
  readonly statusLabels: HbarPreSessionLaunchStatusLabels
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

export function HbarSessionLaunchLocation(props: HbarSessionLaunchLocationProps) {
  const runtime = useHbarRuntime()
  const launchDrafts = useHbarRuntimeState(runtime.state.sessionLaunchDrafts)
  const branches = useHbarRuntimeState(runtime.state.preSessionLaunchBranches)
  const branchCreation = useHbarRuntimeState(runtime.state.sessionLaunchBranchCreation)
  const [locationOpen, setLocationOpen] = useState(false)
  const [branchSearch, setBranchSearch] = useState('')
  const [opening, setOpening] = useState(true)
  const [openError, setOpenError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const entry = launchDrafts.entries[props.sessionId]
  const currentEntry = entry?.workspaceId === props.workspaceId ? entry : undefined
  const currentBranchCreation = branchCreation.entries[props.sessionId] ?? null
  const page = branches.workspaceId === props.workspaceId && branches.search === branchSearch ? branches.page : null
  const busy = currentEntry ? lockedPhases.has(currentEntry.phase) : true
  const unavailable = !launchDrafts.available || !currentEntry
  const disabled = !props.connected || opening || unavailable || busy

  useEffect(() => {
    let live = true
    setOpening(true)
    setOpenError(null)
    void runtime.commands
      .execute('sessionLaunchDraft.open', { sessionId: props.sessionId, workspaceId: props.workspaceId })
      .catch((reason: unknown) => {
        if (live)
          setOpenError(
            reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
              ? reason.code
              : 'EXECUTION_FAILED',
          )
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
      .catch((reason: unknown) => {
        setActionError(
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'EXECUTION_FAILED',
        )
      })
      .finally(() => setPending(false))
  }

  const cancel = () => {
    if (pending) return
    setPending(true)
    setActionError(null)
    void runtime.commands
      .execute('sessionLaunchDraft.cancel', { sessionId: props.sessionId })
      .catch((reason: unknown) => {
        setActionError(
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'EXECUTION_FAILED',
        )
      })
      .finally(() => setPending(false))
  }

  const status = currentEntry ? preparationStatus(currentEntry, props.statusLabels) : null
  const showReconcile =
    currentEntry && ['unknown', 'paused-navigation', 'cancel-requested'].includes(currentEntry.phase)
  const showCancel = currentEntry && preparationBusyPhases.has(currentEntry.phase)

  return (
    <LumenFrame className="hbar-session-launch-location">
      <HbarPreSessionLocationPicker
        labels={props.labels}
        directories={[{ id: props.workspaceId, label: props.workspaceName, detail: props.workspacePath ?? '' }]}
        workspaceId={props.workspaceId}
        selection={currentEntry?.selection ?? { mode: 'shared-current' }}
        page={page}
        draftRevision={currentEntry?.revision ?? null}
        branchCreation={currentBranchCreation}
        branchCreationAvailable={props.connected && launchDrafts.available}
        workspaceChangeAvailable={false}
        loading={opening || branches.status === 'loading'}
        error={branches.workspaceId === props.workspaceId && branches.search === branchSearch ? branches.error : null}
        disabled={disabled}
        hasMoreDirectories={false}
        onOpen={() => {
          setLocationOpen(true)
          setBranchSearch('')
          setActionError(null)
        }}
        onClose={() => setLocationOpen(false)}
        onWorkspace={async () => {
          throw new RuntimeCommandError('CAPABILITY_UNAVAILABLE', 'An existing Session cannot change workspaces')
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
        onMoreDirectories={() => undefined}
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
            <LumenButton type="button" size="s" disabled={!props.connected || pending} onClick={cancel}>
              {props.statusLabels.cancel}
            </LumenButton>
          )}
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
