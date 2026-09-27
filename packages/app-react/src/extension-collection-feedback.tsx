import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import type { ExtensionWorkspaceEntryState } from '@hbar/app-runtime'
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

export interface ExtensionCollectionLabels {
  readonly notLoaded: string
  readonly loading: string
  readonly stale: string
  readonly retry: string
  readonly error: (code: string | null) => string
}

export function ExtensionCollectionFeedback({
  state,
  labels,
  connected,
  onRetry,
  owner,
  instanceId,
  heading,
}: {
  readonly state: ExtensionWorkspaceEntryState['collections']['plugins'] | undefined
  readonly labels: ExtensionCollectionLabels
  readonly connected: boolean
  readonly onRetry: () => Promise<void>
  readonly owner: object
  readonly instanceId: string
  readonly heading: RefObject<HTMLElement | null>
}) {
  const button = useRef<HTMLButtonElement>(null)
  const generation = useRef(0)
  const latestState = useRef(state)
  const lease = useRef<{
    readonly generation: number
    readonly startState: typeof state
    readonly trigger: HTMLButtonElement | null
    readonly release: () => void
    cancelled: boolean
  } | null>(null)
  const [retryRequested, setRetryRequested] = useState(false)
  const loading = state?.status === 'loading' || (!state && connected)
  const failed = state?.status === 'error'
  const stale = state?.hasSnapshot && state.status !== 'ready'
  const busy = loading || state?.requestInFlight === true
  useLayoutEffect(() => {
    generation.current += 1
    setRetryRequested(false)
    return () => {
      generation.current += 1
      lease.current?.release()
      lease.current = null
    }
  }, [owner, instanceId])
  useLayoutEffect(() => {
    latestState.current = state
    const captured = lease.current
    if (!captured || captured.generation !== generation.current || state === captured.startState || busy) return
    if (state?.status !== 'ready' && state?.status !== 'error') return
    captured.release()
    lease.current = null
    const active = document.activeElement
    if (
      !captured.cancelled &&
      !document.querySelector('dialog:modal, [popover]:popover-open') &&
      (active === captured.trigger || active === document.body || !active?.isConnected)
    ) {
      const target = state.status === 'ready' ? heading.current : button.current
      if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true })
    }
    setRetryRequested(false)
  }, [state, busy, heading])
  const retry = () => {
    if (!connected || busy || lease.current) return
    const captured = {
      generation: generation.current,
      startState: state,
      trigger: button.current,
      cancelled: false,
      release: () => {
        document.removeEventListener('pointerdown', cancel, true)
        document.removeEventListener('keydown', cancel, true)
        document.removeEventListener('focusin', moved, true)
      },
    }
    const cancel = () => {
      captured.cancelled = true
    }
    const moved = (event: FocusEvent) => {
      if (event.target !== captured.trigger) cancel()
    }
    document.addEventListener('pointerdown', cancel, true)
    document.addEventListener('keydown', cancel, true)
    document.addEventListener('focusin', moved, true)
    lease.current = captured
    setRetryRequested(true)
    void Promise.resolve()
      .then(() => {
        if (captured.generation === generation.current) return onRetry()
        return undefined
      })
      .catch(() => undefined)
      .finally(() => {
        // Pre-dispatch rejection has no new collection snapshot to drive settlement.
        if (lease.current !== captured || latestState.current !== captured.startState) return
        captured.release()
        lease.current = null
        if (captured.generation === generation.current) setRetryRequested(false)
      })
  }
  return (
    <LumenFrame
      className="hbar-app-react-extension-collection-feedback"
      data-collection-status={state?.status ?? 'idle'}
    >
      {loading ? (
        <LumenText as="p" role="status">
          {labels.loading}
        </LumenText>
      ) : failed ? (
        <LumenText as="p" role="alert">
          {labels.error(state.error)}
        </LumenText>
      ) : !state?.hasSnapshot ? (
        <LumenText as="p" role="status">
          {labels.notLoaded}
        </LumenText>
      ) : null}
      {stale && <LumenText as="p">{labels.stale}</LumenText>}
      {(failed || retryRequested) && (
        <LumenButton
          ref={button}
          type="button"
          variant="outlined"
          disabled={!connected || busy}
          loading={busy}
          onClick={retry}
        >
          {busy ? labels.loading : labels.retry}
        </LumenButton>
      )}
    </LumenFrame>
  )
}
