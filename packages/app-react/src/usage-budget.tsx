import { LumenButton, LumenContentText, LumenFrame, LumenUsage05 } from '@lumen/app-ui'
import type { UsageBudgetRuntime } from '@hbar/app-runtime'
import { useHbarRuntimeState } from './runtime'
import './usage-feedback.css'
export interface HbarUsageBudgetLabels {
  readonly title: string
  readonly description: string
  readonly cap: string
  readonly save: string
  readonly saving: string
  readonly unknown: string
  readonly reconcile: string
  readonly retry: string
  readonly pendingTarget: (sessionId: string) => string
  readonly error: (message: string) => string
}
export interface HbarUsageBudgetProps {
  readonly runtime: UsageBudgetRuntime
  readonly labels: HbarUsageBudgetLabels
}
export function HbarUsageBudget({ runtime, labels }: HbarUsageBudgetProps) {
  const state = useHbarRuntimeState(runtime.state)
  const busy = state.status === 'loading' || state.pendingStatus !== null
  const value = state.draftLimit
  const valid = /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 1_000_000_000
  const budget = {
    title: labels.title,
    description: labels.description,
    labels: { cap: labels.cap, save: labels.save, saving: labels.saving },
    cap: { value, display: value, input: 'number' as const, minimum: 1, maximum: 1_000_000_000, step: 1 },
    busy,
    canSave: valid && !busy && state.status === 'ready' && state.targetSessionId !== null,
    ...(state.error ? { error: labels.error(state.error) } : {}),
    ...(state.pendingStatus === 'unknown' ? { status: { label: labels.unknown, tone: 'warning' as const } } : {}),
    onCapChange: runtime.setDraftLimit,
    onSave: () => {
      void runtime.save().catch(() => undefined)
    },
  }
  return (
    <LumenFrame as="section" aria-label={labels.title} className="hbar-usage-feedback">
      <LumenUsage05 content={{ budget }} />
      {state.pendingSessionId ? (
        <LumenContentText context="feedback.paragraph">{labels.pendingTarget(state.pendingSessionId)}</LumenContentText>
      ) : null}
      {state.pendingStatus === 'unknown' ? (
        <LumenFrame role="group" aria-label={labels.reconcile} tabIndex={0} className="hbar-usage-feedback-actions">
          <LumenButton
            onClick={() => {
              void runtime.reconcile().catch(() => undefined)
            }}
          >
            {labels.reconcile}
          </LumenButton>
        </LumenFrame>
      ) : null}
      {state.status === 'error' && !state.pendingStatus ? (
        <LumenFrame role="group" aria-label={labels.retry} tabIndex={0} className="hbar-usage-feedback-actions">
          <LumenButton
            onClick={() => {
              void runtime.refresh().catch(() => undefined)
            }}
          >
            {labels.retry}
          </LumenButton>
        </LumenFrame>
      ) : null}
    </LumenFrame>
  )
}
