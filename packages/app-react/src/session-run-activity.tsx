import { useState } from 'react'
import { Activity, RotateCcw, Square } from 'lucide-react'
import {
  LumenButton,
  LumenFrame,
  LumenCollection,
  LumenCollectionItem,
  LumenIcon,
  LumenStatus,
  LumenContentText,
  type LumenRunActivityItem,
  type LumenRunActivityLabels,
  type LumenRunActivityProps,
} from '@lumen/app-ui'
import type { RunStatus } from '@hbar/contracts'
import { HbarLumenDisclosure } from './lumen-disclosure'
import './session-run-activity.css'

const PAGE_SIZE = 20
const MAX_RUNS = 80

export type HbarSessionRunStatus = RunStatus
export type HbarSessionRunItem = Omit<LumenRunActivityItem, 'status'> & { readonly status: HbarSessionRunStatus }

export interface HbarSessionRunLabels extends Omit<LumenRunActivityLabels, 'statusLabel'> {
  readonly statusLabel: (status: HbarSessionRunStatus) => string
  readonly details: (count: number) => string
  readonly more: (count: number) => string
  readonly activeCount: (count: number) => string
  readonly recheckLabel: string
  readonly recheckingLabel: string
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
}

/** Prefer the actual executing Run to a newer queued Run for the current Stop target. */
export function currentSessionRun<T extends { readonly status: string }>(runs: readonly T[]): T | undefined {
  return (
    runs.find((run) => run.status === 'running' || run.status === 'waiting_approval') ??
    runs.find((run) => run.status === 'queued') ??
    runs[0]
  )
}

export function HbarSessionRunActivity({
  runs: sourceRuns,
  labels,
  cancellingRunIds = [],
  retryingRunIds = [],
  canRetryNewRun = true,
  canCancelRun,
  unknownRetryRunIds = [],
  plan,
  feedback,
  onCancelRun,
  onRetryRun,
}: HbarSessionRunActivityProps) {
  const [visible, setVisible] = useState(PAGE_SIZE)
  const ids = new Set<string>()
  // The timeline owns an 80-Run window; the view grows only by explicit 20-row pages.
  const runs = sourceRuns.filter((run) => !ids.has(run.id) && Boolean(ids.add(run.id))).slice(0, MAX_RUNS)
  const current = currentSessionRun(runs)
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
        {cancelling ? labels.cancellingLabel : labels.cancelLabel}
      </LumenButton>
    ) : ['failed', 'interrupted'].includes(run.status) && onRetryRun && (canRetryNewRun || rechecking) ? (
      <LumenButton size="s" variant="text" indicator="none" disabled={retrying} onClick={() => onRetryRun(run.id)}>
        <LumenIcon icon={RotateCcw} tier="sm" />
        {rechecking
          ? retrying
            ? labels.recheckingLabel
            : labels.recheckLabel
          : retrying
            ? labels.retryingLabel
            : labels.retryLabel}
      </LumenButton>
    ) : null
  }
  const status = (run: HbarSessionRunItem) => (
    <LumenStatus
      value={
        cancellingRunIds.includes(run.id) ? labels.cancellingLabel : (run.statusLabel ?? labels.statusLabel(run.status))
      }
      tone={
        run.status === 'failed' || run.status === 'interrupted'
          ? 'danger'
          : isActive(run)
            ? 'warning'
            : run.status === 'completed'
              ? 'success'
              : 'neutral'
      }
    />
  )

  if (!current && !plan && !feedback) return null
  return (
    <LumenFrame as="section" className="hbar-session-run-activity" aria-label={labels.title}>
      {current && (
        <LumenFrame
          as="article"
          className="hbar-session-run-current"
          data-run-id={current.id}
          data-status={current.status}
        >
          <LumenIcon icon={Activity} tier="sm" />
          {status(current)}
          {current.duration && <LumenContentText context="metadata">{current.duration}</LumenContentText>}
          {activeCount > 1 && <LumenContentText context="metadata">{labels.activeCount(activeCount)}</LumenContentText>}
          {actions(current)}
          {['failed', 'interrupted'].includes(current.status) && current.detail && (
            <LumenContentText context="feedback.paragraph" className="hbar-session-run-error" role="alert">
              {current.detail}
            </LumenContentText>
          )}
        </LumenFrame>
      )}
      {feedback && (
        <LumenContentText context="feedback.paragraph" className="hbar-session-run-error" role="alert">
          {feedback}
        </LumenContentText>
      )}
      {current && (
        <HbarLumenDisclosure label={labels.details(runs.length)} className="hbar-session-run-history">
          <LumenFrame className="hbar-session-run-row">
            <LumenContentText context="metadata">{current.label}</LumenContentText>
            {current.detail && <LumenContentText context="tool.summary">{current.detail}</LumenContentText>}
          </LumenFrame>
          {others.length > 0 && (
            <LumenCollection role="list" className="hbar-session-run-list">
              {others.slice(0, visible).map((run) => (
                <LumenCollectionItem role="listitem" key={run.id} data-run-id={run.id} data-status={run.status}>
                  <LumenFrame className="hbar-session-run-row">
                    {status(run)}
                    <LumenContentText context="metadata">{run.label}</LumenContentText>
                    {run.duration && <LumenContentText context="metadata">{run.duration}</LumenContentText>}
                    {actions(run)}
                  </LumenFrame>
                  {run.detail && (
                    <LumenContentText context="tool.description" className="hbar-session-run-metadata">
                      {run.detail}
                    </LumenContentText>
                  )}
                </LumenCollectionItem>
              ))}
            </LumenCollection>
          )}
          {visible < others.length && (
            <LumenButton
              size="s"
              variant="text"
              indicator="none"
              onClick={() => setVisible((count) => count + PAGE_SIZE)}
            >
              {labels.more(Math.min(PAGE_SIZE, others.length - visible))}
            </LumenButton>
          )}
        </HbarLumenDisclosure>
      )}
      {plan && (plan.steps.length > 0 || plan.explanation) && (
        <LumenFrame className="hbar-session-run-plan-context" data-run-id={plan.runId ?? undefined}>
          <HbarLumenDisclosure
            className="hbar-session-run-plan"
            label={
              <LumenFrame as="span" className="hbar-session-run-plan-label">
                <LumenContentText context="control.label">{labels.planTitle}</LumenContentText>
                <LumenContentText context="control.status">
                  {labels.planProgress(
                    plan.steps.filter((step) => step.status === 'completed').length,
                    plan.steps.length,
                  )}
                </LumenContentText>
              </LumenFrame>
            }
          >
            {plan.explanation && <LumenContentText context="reading.paragraph">{plan.explanation}</LumenContentText>}
            <LumenCollection role="list" className="hbar-session-run-list">
              {plan.steps.map((step) => (
                <LumenCollectionItem role="listitem" key={step.id} data-status={step.status}>
                  <LumenContentText context="collection.title">{step.title}</LumenContentText>
                  <LumenContentText context="metadata.detail">{labels.planStatusLabel(step.status)}</LumenContentText>
                </LumenCollectionItem>
              ))}
            </LumenCollection>
          </HbarLumenDisclosure>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
