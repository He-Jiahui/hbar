import { useState, type ReactNode } from 'react'
import { Activity, CheckCircle2, Circle, LoaderCircle, RotateCcw, Square } from 'lucide-react'
import {
  LumenContentText,
  LumenButton,
  LumenFrame,
  LumenIcon,
  type LumenRunActivityItem,
  type LumenRunActivityLabels,
  type LumenRunActivityProps,
} from '@lumen/app-ui'
import type { RunStatus } from '@hbar/contracts'
import { HbarLumenDisclosure } from './lumen-disclosure'
import './session-run-activity.css'
import { HbarSessionExecutionStatus } from './session-execution-status'
import { createMessageScope } from './messages'

const PAGE_SIZE = 20
const MAX_RUNS = 80

export type HbarSessionRunStatus = RunStatus
export type HbarSessionRunItem = Omit<LumenRunActivityItem, 'status' | 'duration'> & {
  readonly status: HbarSessionRunStatus
  readonly duration?: ReactNode
  readonly model?: string
  readonly source?: string
}

export interface HbarSessionRunLabels extends Omit<LumenRunActivityLabels, 'statusLabel'> {
  readonly statusLabel: (status: HbarSessionRunStatus) => string
  readonly details: (count: number) => string
  readonly more: (count: number) => string
  readonly activeCount: (count: number) => string
  readonly recheckLabel: string
  readonly recheckingLabel: string
  readonly failureHistory: (count: number) => string
  readonly unconfirmed: string
}

export interface HbarSessionRunActivityProps extends Omit<
  LumenRunActivityProps,
  'runs' | 'labels' | 'listStrategy' | 'selectedRunId' | 'onSelectRun'
> {
  readonly runs: readonly HbarSessionRunItem[]
  readonly labels: HbarSessionRunLabels
  readonly canRetryNewRun?: boolean
  readonly canCancelRun?: (operationId: string) => boolean
  readonly unknownRetryRunIds?: readonly string[]
  /** null renders only collapsed history; undefined retains the usual current Run selection. */
  readonly currentRunId?: string | null
  readonly historyLabel?: ReactNode
  readonly overview?: ReactNode
  readonly executionConfirmed?: boolean
}
const { Provider: SessionRunMessagesProvider, useMessages: useSessionRunMessages } =
  createMessageScope<HbarSessionRunLabels>()

/** Prefer the actual executing Run to a newer queued Run for the current Stop target. */
export function currentSessionRun<T extends { readonly status: string }>(runs: readonly T[]): T | undefined {
  return (
    runs.find((run) => run.status === 'running' || run.status === 'waiting_approval') ??
    runs.find((run) => run.status === 'queued') ??
    runs[0]
  )
}

function SessionRunActivityContent({
  runs: sourceRuns,
  cancellingRunIds = [],
  retryingRunIds = [],
  canRetryNewRun = true,
  canCancelRun,
  unknownRetryRunIds = [],
  currentRunId,
  historyLabel,
  overview,
  executionConfirmed = true,
  plan,
  feedback,
  onCancelRun,
  onRetryRun,
}: Omit<HbarSessionRunActivityProps, 'labels'>) {
  const { t } = useSessionRunMessages()
  const [visible, setVisible] = useState(PAGE_SIZE)
  const ids = new Set<string>()
  // The timeline owns an 80-Run window; the view grows only by explicit 20-row pages.
  const runs = sourceRuns.filter((run) => !ids.has(run.id) && Boolean(ids.add(run.id))).slice(0, MAX_RUNS)
  const current = currentRunId === undefined ? currentSessionRun(runs) : runs.find((run) => run.id === currentRunId)
  const others = runs.filter((run) => run.id !== current?.id)
  const isActive = (run: HbarSessionRunItem) => ['queued', 'running', 'waiting_approval'].includes(run.status)
  const activeCount = runs.filter(isActive).length
  const actions = (run: HbarSessionRunItem) => {
    const cancelling = cancellingRunIds.includes(run.id)
    const retrying = retryingRunIds.includes(run.id)
    const rechecking = unknownRetryRunIds.includes(run.id)
    return isActive(run) && onCancelRun ? (
      <LumenButton
        size="s"
        variant="text"
        indicator="none"
        disabled={cancelling || canCancelRun?.(run.id) === false}
        onClick={() => onCancelRun(run.id)}
      >
        <LumenIcon icon={Square} tier="sm" />
        {cancelling ? t('cancellingLabel') : t('cancelLabel')}
      </LumenButton>
    ) : ['failed', 'interrupted'].includes(run.status) && onRetryRun && (canRetryNewRun || rechecking) ? (
      <LumenButton size="s" variant="text" indicator="none" disabled={retrying} onClick={() => onRetryRun(run.id)}>
        <LumenIcon icon={RotateCcw} tier="sm" />
        {rechecking
          ? retrying
            ? t('recheckingLabel')
            : t('recheckLabel')
          : retrying
            ? t('retryingLabel')
            : t('retryLabel')}
      </LumenButton>
    ) : null
  }
  const status = (run: HbarSessionRunItem) => (
    <HbarSessionExecutionStatus
      state={!executionConfirmed && isActive(run) ? 'unconfirmed' : run.status}
      label={
        !executionConfirmed && isActive(run)
          ? t('unconfirmed')
          : cancellingRunIds.includes(run.id)
            ? t('cancellingLabel')
            : (run.statusLabel ?? t('statusLabel')(run.status))
      }
      tone={
        run.status === 'failed' || run.status === 'interrupted'
          ? 'danger'
          : run.status === 'running' && executionConfirmed
            ? 'info'
            : run.status === 'waiting_approval' || (!executionConfirmed && isActive(run))
              ? 'warning'
              : run.status === 'completed'
                ? 'success'
                : 'neutral'
      }
    />
  )

  if (!runs.length && !plan && !feedback) return null
  return (
    <LumenFrame as="section" className="hbar-session-run-activity" aria-label={t('title')}>
      {current && (
        <LumenFrame
          as="article"
          className="hbar-session-run-current"
          data-run-id={current.id}
          data-status={current.status}
        >
          <LumenIcon icon={Activity} tier="sm" />
          {status(current)}
          {current.duration && (
            <LumenContentText context="metadata" className="hbar-session-run-duration">
              {current.duration}
            </LumenContentText>
          )}
          {activeCount > 1 && (
            <LumenContentText context="message.inline">{t('activeCount')(activeCount)}</LumenContentText>
          )}
          {actions(current)}
          {current.source && (
            <LumenContentText context="message.inline" className="hbar-session-run-source">
              {current.source}
            </LumenContentText>
          )}
          {current.model && (
            <LumenContentText context="section.description" className="hbar-session-run-model">
              {current.model}
            </LumenContentText>
          )}
          {['failed', 'interrupted'].includes(current.status) && current.detail && (
            <LumenContentText context="feedback.message" className="hbar-session-run-error" role="alert">
              {current.detail}
            </LumenContentText>
          )}
        </LumenFrame>
      )}
      {overview}
      {feedback && (
        <LumenContentText context="feedback.message" className="hbar-session-run-error" role="alert">
          {feedback}
        </LumenContentText>
      )}
      {runs.length > 0 && (
        <HbarLumenDisclosure label={historyLabel ?? t('details')(runs.length)} className="hbar-session-run-history">
          {current && (
            <LumenFrame className="hbar-session-run-row">
              <LumenContentText context="control.label">{current.label}</LumenContentText>
              {current.detail && <LumenContentText context="record.description">{current.detail}</LumenContentText>}
            </LumenFrame>
          )}
          {others.length > 0 && (
            <LumenFrame role="list" className="hbar-session-run-list">
              {others.slice(0, visible).map((run) => (
                <LumenFrame role="listitem" key={run.id} data-run-id={run.id} data-status={run.status}>
                  <LumenFrame className="hbar-session-run-row">
                    {status(run)}
                    <LumenContentText context="control.label">{run.label}</LumenContentText>
                    {run.duration && <LumenContentText context="control.label">{run.duration}</LumenContentText>}
                    {run.source && (
                      <LumenContentText context="control.label" className="hbar-session-run-source">
                        {run.source}
                      </LumenContentText>
                    )}
                    {actions(run)}
                  </LumenFrame>
                  {run.model && (
                    <LumenContentText context="section.description" className="hbar-session-run-model">
                      {run.model}
                    </LumenContentText>
                  )}
                  {run.detail && (
                    <LumenContentText context="section.description" className="hbar-session-run-metadata">
                      {run.detail}
                    </LumenContentText>
                  )}
                </LumenFrame>
              ))}
            </LumenFrame>
          )}
          {visible < others.length && (
            <LumenButton
              size="s"
              variant="text"
              indicator="none"
              onClick={() => setVisible((count) => count + PAGE_SIZE)}
            >
              {t('more')(Math.min(PAGE_SIZE, others.length - visible))}
            </LumenButton>
          )}
        </HbarLumenDisclosure>
      )}
      {plan && (plan.steps.length > 0 || plan.explanation) && (
        <LumenFrame className="hbar-session-run-plan-context" data-run-id={plan.runId ?? undefined}>
          {plan.steps.length > 0 && (
            <progress
              className="hbar-session-run-plan-progress"
              max={plan.steps.length}
              value={plan.steps.filter((step) => step.status === 'completed').length}
              aria-label={t('planProgress')(
                plan.steps.filter((step) => step.status === 'completed').length,
                plan.steps.length,
              )}
            />
          )}
          <HbarLumenDisclosure
            className="hbar-session-run-plan"
            label={
              <LumenContentText context="control.label" className="hbar-session-run-plan-label">
                <LumenContentText context="control.label">{t('planTitle')}</LumenContentText>
                <LumenContentText context="control.label">
                  {t('planProgress')(
                    plan.steps.filter((step) => step.status === 'completed').length,
                    plan.steps.length,
                  )}
                </LumenContentText>
              </LumenContentText>
            }
          >
            {plan.explanation && <LumenContentText context="section.description">{plan.explanation}</LumenContentText>}
            <LumenFrame role="list" className="hbar-session-run-list">
              {plan.steps.map((step) => (
                <LumenFrame role="listitem" key={step.id} data-status={step.status}>
                  <LumenIcon
                    tier="sm"
                    icon={
                      step.status === 'completed' ? CheckCircle2 : step.status === 'in_progress' ? LoaderCircle : Circle
                    }
                  />
                  <LumenContentText context="control.label">{step.title}</LumenContentText>
                  <LumenContentText context="choice.description">{t('planStatusLabel')(step.status)}</LumenContentText>
                </LumenFrame>
              ))}
            </LumenFrame>
          </HbarLumenDisclosure>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}

export function HbarSessionRunActivity(props: HbarSessionRunActivityProps) {
  const { labels, ...activity } = props
  return (
    <SessionRunMessagesProvider messages={labels}>
      <SessionRunActivityContent {...activity} />
    </SessionRunMessagesProvider>
  )
}
