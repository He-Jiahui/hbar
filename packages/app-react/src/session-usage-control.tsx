import { useId, useLayoutEffect, useRef, useState } from 'react'
import { ChartNoAxesColumnIncreasing, X } from 'lucide-react'
import {
  LumenButton,
  LumenCompactUsage,
  LumenFrame,
  LumenIcon,
  LumenIconButton,
  LumenContentText,
  LumenFloatingSurface,
  useFloatingTrigger,
} from '@lumen/app-ui'
import type { SessionControlsState } from '@hbar/app-runtime'
import './session-usage-control.css'

export interface HbarSessionUsageLabels {
  readonly title: string
  readonly description: string
  readonly trigger: (value: string) => string
  readonly budgetPercent: (value: number) => string
  readonly noBudget: string
  readonly budgetWarning: string
  readonly budgetExhausted: string
  readonly close: string
  readonly monitor: string
  readonly total: (tokens: number) => string
  readonly remaining: (remaining: number, limit: number) => string
  readonly progress: (used: number, limit: number) => string
  readonly input: string
  readonly output: string
  readonly cost: string
  readonly rate: string
  readonly unavailable: string
  readonly gap: string
  readonly sparkline: string
  readonly number: (value: number) => string
  readonly currency: (value: number) => string
  readonly tokensPerSecond: (value: number) => string
  readonly error: (code: string) => string
}

export function sessionUsagePresentation(controls: SessionControlsState, labels: HbarSessionUsageLabels) {
  const report = controls.usage
  const budget = controls.budget
  const total = report ? report.totals.input + report.totals.output : null
  const available = (value: number | null, formatter: (item: number) => string) =>
    value === null ? labels.unavailable : formatter(value)
  const exhausted = budget?.phase === 'exhausted'
  const warning = !exhausted && budget !== null && budget.remainingTokens < budget.limit * 0.2
  const progress = budget && budget.limit > 0 ? budget.usedTokens / budget.limit : null
  return {
    trigger: progress === null ? labels.noBudget : labels.budgetPercent(Math.min(100, Math.max(0, progress * 100))),
    notice: exhausted ? labels.budgetExhausted : warning ? labels.budgetWarning : null,
    content: {
      density: 'inline' as const,
      title: labels.title,
      description: report?.gap ? `${labels.description} ${labels.gap}` : labels.description,
      value: total === null ? labels.unavailable : labels.total(total),
      detail: budget ? labels.remaining(budget.remainingTokens, budget.limit) : labels.unavailable,
      progress,
      progressLabel: budget ? labels.progress(budget.usedTokens, budget.limit) : labels.unavailable,
      tone: exhausted ? ('danger' as const) : warning ? ('warning' as const) : ('accent' as const),
      sparkline: (report?.series ?? []).map((point) => ({ id: String(point.start), value: point.billableTokens })),
      sparklineLabel: labels.sparkline,
      metrics: [
        { id: 'input', label: labels.input, value: report ? labels.number(report.totals.input) : labels.unavailable },
        {
          id: 'output',
          label: labels.output,
          value: report ? labels.number(report.totals.output) : labels.unavailable,
        },
        {
          id: 'cost',
          label: labels.cost,
          value: report ? available(report.cost.value, labels.currency) : labels.unavailable,
        },
        {
          id: 'rate',
          label: labels.rate,
          value: report ? available(report.rates.total.value, labels.tokensPerSecond) : labels.unavailable,
        },
      ],
    },
  }
}

/** Read-only local disclosure. Opening never reloads model or budget state or changes the current session. */
export function HbarSessionUsageControl({
  controls,
  labels,
  onOpenMonitor,
}: {
  readonly controls: SessionControlsState
  readonly labels: HbarSessionUsageLabels
  readonly onOpenMonitor: () => void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  const open = openSessionId !== null && openSessionId === controls.sessionId
  useLayoutEffect(() => setOpenSessionId(null), [controls.sessionId])
  const presentation = sessionUsagePresentation(controls, labels)
  const error = controls.errors.usage ?? controls.errors.budget
  const close = () => setOpenSessionId(null)
  const triggerEvents = useFloatingTrigger({ open, onOpen: () => setOpenSessionId(controls.sessionId), onClose: close })
  return (
    <LumenFrame className="hbar-session-usage-control" data-tone={presentation.content.tone}>
      <LumenButton
        ref={trigger}
        type="button"
        size="s"
        variant="text"
        indicator="none"
        className="hbar-session-usage-trigger"
        aria-controls={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={controls.sessionId === null}
        aria-label={labels.trigger(presentation.trigger)}
        title={labels.trigger(presentation.trigger)}
        {...triggerEvents}
      >
        <LumenIcon icon={ChartNoAxesColumnIncreasing} tier="sm" />
        <LumenContentText context="control.status">{presentation.trigger}</LumenContentText>
      </LumenButton>
      <LumenFloatingSurface
        id={id}
        open={open}
        onClose={close}
        anchorRef={trigger}
        mode="anchored"
        placement="above"
        anchorAlignment="end"
        responsivePresentation="narrow-sheet"
        initialFocusRef={closeButton}
        restoreFocus
        keepMounted
        role="dialog"
        label={labels.title}
        className="hbar-session-usage-popover"
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.stopPropagation()
        }}
      >
        <LumenFrame className="hbar-session-usage-heading">
          <LumenContentText context="popover.title">{labels.title}</LumenContentText>
          <LumenIconButton
            ref={closeButton}
            type="button"
            size="s"
            variant="text"
            indicator="none"
            label={labels.close}
            onClick={close}
          >
            <LumenIcon icon={X} tier="sm" />
          </LumenIconButton>
        </LumenFrame>
        <LumenContentText context="section.description">{presentation.content.description}</LumenContentText>
        {error && (
          <LumenContentText context="feedback.detail" role="alert">
            {labels.error(error)}
          </LumenContentText>
        )}
        {presentation.notice && (
          <LumenContentText context="feedback.detail" role="status">
            {presentation.notice}
          </LumenContentText>
        )}
        <LumenCompactUsage {...presentation.content} />
        <LumenFrame className="hbar-session-usage-actions" role="group" aria-label={labels.monitor} tabIndex={0}>
          <LumenButton
            type="button"
            variant="text"
            indicator="none"
            onClick={() => {
              if (openSessionId !== controls.sessionId) return
              close()
              onOpenMonitor()
            }}
          >
            {labels.monitor}
          </LumenButton>
        </LumenFrame>
      </LumenFloatingSurface>
    </LumenFrame>
  )
}
