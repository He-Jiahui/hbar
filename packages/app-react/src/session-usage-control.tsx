import { useEffect, useId, useRef, useState } from 'react'
import { ChartNoAxesColumnIncreasing, X } from 'lucide-react'
import { LumenButton, LumenCompactUsage, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
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
      progress: progress ?? 0,
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
  const popup = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const presentation = sessionUsagePresentation(controls, labels)
  const error = controls.errors.usage ?? controls.errors.budget
  const place = () => {
    if (!trigger.current || !popup.current) return
    const rect = trigger.current.getBoundingClientRect()
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    const width = Math.min(24 * rem, innerWidth - 2 * rem)
    popup.current.style.setProperty(
      '--usage-left',
      `${Math.max(rem, Math.min(rect.right - width, innerWidth - width - rem))}px`,
    )
    popup.current.style.setProperty('--usage-bottom', `${innerHeight - rect.top + rem / 2}px`)
    popup.current.style.setProperty('--usage-limit', `${Math.max(0, rect.top - rem * 1.5)}px`)
  }
  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])
  const close = () => {
    popup.current?.hidePopover()
    trigger.current?.focus()
  }
  return (
    <LumenFrame className="hbar-session-usage-control" data-tone={presentation.content.tone}>
      <LumenButton
        ref={trigger}
        type="button"
        size="s"
        variant="text"
        indicator="none"
        className="hbar-session-usage-trigger"
        popoverTarget={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={labels.trigger(presentation.trigger)}
        title={labels.trigger(presentation.trigger)}
      >
        <LumenIcon icon={ChartNoAxesColumnIncreasing} tier="sm" />
        <LumenText as="span">{presentation.trigger}</LumenText>
      </LumenButton>
      <LumenFrame
        ref={popup}
        id={id}
        popover="auto"
        role="dialog"
        aria-label={labels.title}
        className="hbar-session-usage-popover"
        onBeforeToggle={(event) => {
          if (event.newState === 'open') place()
        }}
        onToggle={(event) => setOpen(event.newState === 'open')}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.stopPropagation()
          if (event.key === 'Escape') {
            event.preventDefault()
            close()
          }
        }}
      >
        <LumenFrame className="hbar-session-usage-heading">
          <LumenText as="strong">{labels.title}</LumenText>
          <LumenButton type="button" size="s" variant="text" indicator="none" aria-label={labels.close} onClick={close}>
            <LumenIcon icon={X} tier="sm" />
          </LumenButton>
        </LumenFrame>
        <LumenText as="p">{presentation.content.description}</LumenText>
        {error && (
          <LumenText as="p" role="alert">
            {labels.error(error)}
          </LumenText>
        )}
        {presentation.notice && (
          <LumenText as="p" role="status">
            {presentation.notice}
          </LumenText>
        )}
        <LumenCompactUsage {...presentation.content} />
        <LumenButton
          type="button"
          variant="text"
          indicator="none"
          onClick={() => {
            popup.current?.hidePopover()
            onOpenMonitor()
          }}
        >
          {labels.monitor}
        </LumenButton>
      </LumenFrame>
    </LumenFrame>
  )
}
