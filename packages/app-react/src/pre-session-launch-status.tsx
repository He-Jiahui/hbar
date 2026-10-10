import { useState } from 'react'
import { LumenContentText, LumenButton, LumenFrame } from '@lumen/app-ui'
import type { PreSessionDraftState } from '@hbar/app-runtime'
import { useHbarRuntime } from './runtime'
import { firstSendNeedsContinue } from './pre-session-launch-model'
export { firstSendIsLocked } from './pre-session-launch-model'
import './pre-session-launch-status.css'

export interface HbarPreSessionLaunchStatusLabels {
  readonly preparing: string
  readonly paused: string
  readonly unknown: string
  readonly cancelled: string
  readonly cancelRequested: string
  readonly continue: string
  readonly cancel: string
  readonly check: string
  readonly dismiss: string
  readonly error: (code: string) => string
}

export function HbarPreSessionLaunchStatus({
  draft,
  labels,
  connected,
}: {
  readonly draft: PreSessionDraftState
  readonly labels: HbarPreSessionLaunchStatusLabels
  readonly connected: boolean
}) {
  const runtime = useHbarRuntime()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preparation = draft.launchPreparation
  const paused = preparation?.phase === 'paused-navigation'
  const needsContinue = firstSendNeedsContinue(draft)
  const cancelled = draft.error === 'CANCELLED' || preparation?.phase === 'cancelled'
  const cancelRequested = preparation?.cancelRequested && !cancelled
  const inFlight = ['preparing', 'creating', 'configuring', 'submitting'].includes(draft.phase)
  const recoverableLaunch = draft.unknownStage?.startsWith('launch')
  const canContinue =
    !cancelRequested &&
    (needsContinue || (recoverableLaunch && ['ready', 'reconciling'].includes(preparation?.phase ?? '')))
  const canCancel =
    !cancelled && !cancelRequested && draft.phase !== 'submitting' && (inFlight || needsContinue || recoverableLaunch)
  const perform = (
    command:
      'preSessionDraft.cancel' | 'preSessionDraft.continue' | 'preSessionDraft.reconcile' | 'preSessionDraft.close',
  ) => {
    if (pending || (!connected && command !== 'preSessionDraft.close')) return
    setPending(true)
    setError(null)
    const input =
      command === 'preSessionDraft.reconcile' || command === 'preSessionDraft.close'
        ? { draftId: draft.draftId }
        : { draftId: draft.draftId, expectedRevision: draft.revision }
    void runtime.commands
      .execute(command, input)
      .catch((reason: unknown) => {
        setError(
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'EXECUTION_FAILED',
        )
      })
      .finally(() => setPending(false))
  }
  if (draft.phase === 'idle' || draft.phase === 'accepted') return null
  const status = cancelRequested
    ? labels.cancelRequested
    : cancelled
      ? labels.cancelled
      : needsContinue
        ? labels.paused
        : draft.phase === 'unknown'
          ? labels.unknown
          : draft.phase === 'failed'
            ? labels.error(draft.error ?? 'EXECUTION_FAILED')
            : labels.preparing
  return (
    <LumenFrame className="hbar-pre-session-launch-status" data-first-send-phase={draft.phase}>
      <LumenContentText
        context="feedback.message"
        role={draft.phase === 'failed' || draft.phase === 'unknown' ? 'alert' : 'status'}
      >
        {error ? labels.error(error) : status}
      </LumenContentText>
      <LumenFrame className="hbar-pre-session-launch-actions">
        {(draft.phase === 'unknown' || cancelRequested || paused) && !inFlight && (
          <LumenButton
            type="button"
            size="s"
            disabled={!connected || pending}
            onClick={() => perform('preSessionDraft.reconcile')}
          >
            {labels.check}
          </LumenButton>
        )}
        {canContinue && (
          <LumenButton
            type="button"
            size="s"
            disabled={!connected || pending}
            onClick={() => perform('preSessionDraft.continue')}
          >
            {labels.continue}
          </LumenButton>
        )}
        {canCancel && (
          <LumenButton
            type="button"
            size="s"
            disabled={!connected || pending}
            onClick={() => perform('preSessionDraft.cancel')}
          >
            {labels.cancel}
          </LumenButton>
        )}
        {draft.phase === 'failed' && !needsContinue && (
          <LumenButton type="button" size="s" disabled={pending} onClick={() => perform('preSessionDraft.close')}>
            {labels.dismiss}
          </LumenButton>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}
