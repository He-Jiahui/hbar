import { LumenContentText, LumenButton, LumenFrame, LumenUsage05 } from '@lumen/app-ui'
import type { UsageBudgetRuntime } from '@hbar/app-runtime'
import { useHbarRuntimeState } from './runtime'
import { createMessageScope } from './messages'
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
export interface HbarUsageBudgetMessages {
  readonly title: string
  readonly description: string
  readonly cap: string
  readonly save: string
  readonly saving: string
  readonly unknown: string
  readonly reconcile: string
  readonly retry: string
  readonly pendingTarget: HbarUsageBudgetLabels['pendingTarget']
  readonly error: HbarUsageBudgetLabels['error']
}
export const HbarUsageBudgetMessageScope = createMessageScope<HbarUsageBudgetMessages>()
export function createHbarUsageBudgetMessages(labels: HbarUsageBudgetLabels): HbarUsageBudgetMessages {
  return { ...labels }
}
export type HbarUsageBudgetViewProps = Pick<HbarUsageBudgetProps, 'runtime'>

export function HbarUsageBudget({ runtime, labels }: HbarUsageBudgetProps) {
  return (
    <HbarUsageBudgetMessageScope.Provider messages={createHbarUsageBudgetMessages(labels)}>
      <HbarUsageBudgetView runtime={runtime} />
    </HbarUsageBudgetMessageScope.Provider>
  )
}

export function HbarUsageBudgetView({ runtime }: HbarUsageBudgetViewProps) {
  const { t } = HbarUsageBudgetMessageScope.useMessages()
  const labels: HbarUsageBudgetLabels = {
    title: t('title'),
    description: t('description'),
    cap: t('cap'),
    save: t('save'),
    saving: t('saving'),
    unknown: t('unknown'),
    reconcile: t('reconcile'),
    retry: t('retry'),
    pendingTarget: t('pendingTarget'),
    error: t('error'),
  }
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
    <LumenFrame as="section" aria-label={labels.title}>
      <LumenUsage05 content={{ budget }} />
      {state.pendingSessionId ? (
        <LumenContentText context="section.description">
          {labels.pendingTarget(state.pendingSessionId)}
        </LumenContentText>
      ) : null}
      {state.pendingStatus === 'unknown' ? (
        <LumenButton
          onClick={() => {
            void runtime.reconcile().catch(() => undefined)
          }}
        >
          {labels.reconcile}
        </LumenButton>
      ) : null}
      {state.status === 'error' && !state.pendingStatus ? (
        <LumenButton
          onClick={() => {
            void runtime.refresh().catch(() => undefined)
          }}
        >
          {labels.retry}
        </LumenButton>
      ) : null}
    </LumenFrame>
  )
}
