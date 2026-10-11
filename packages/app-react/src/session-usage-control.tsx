import { useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { LumenContentText, LumenButton, LumenCompactUsage, LumenFrame, LumenIcon } from '@lumen/app-ui'
import type { SessionControlsState } from '@hbar/app-runtime'
import { FloatingSurface, useFloatingTrigger } from './floating-surface'
import './session-usage-control.css'

export interface HbarSessionUsageLabels {
  readonly title: string
  readonly description: string
  readonly trigger: (value: string) => string
  readonly usedPercent: (value: number) => string
  readonly windowUsage: (used: number, limit: number) => string
  readonly threshold: (percent: number, tokens: number) => string
  readonly compactionThreshold: string
  readonly effectiveThreshold: string
  readonly untilCompaction: (tokens: number) => string
  readonly compactionPending: string
  readonly thresholdLegend: string
  readonly outputReserve: string
  readonly remaining: string
  readonly noModel: string
  readonly unavailable: string
  readonly loading: string
  readonly close: string
  readonly refresh: string
  readonly monitor: string
  readonly budgetWarning: string
  readonly budgetExhausted: string
  readonly number: (value: number) => string
  readonly error: (code: string) => string
}

export function sessionUsagePresentation(controls: SessionControlsState, labels: HbarSessionUsageLabels) {
  const context = controls.context?.sessionId === controls.sessionId ? controls.context : null
  const input = context?.inputTokens ?? null
  const limit = context?.contextWindow ?? null
  const threshold = context?.compactionTokens ?? null
  const usedFraction = input !== null && limit !== null ? input / limit : null
  const thresholdFraction = threshold !== null && limit !== null ? threshold / limit : null
  const tone =
    usedFraction !== null && usedFraction >= 1
      ? ('danger' as const)
      : input !== null && threshold !== null && input >= threshold
        ? ('warning' as const)
        : ('accent' as const)
  const trigger =
    usedFraction !== null
      ? labels.usedPercent(usedFraction * 100)
      : controls.contextStatus === 'loading'
        ? labels.loading
        : context?.status === 'no-model'
          ? labels.noModel
          : labels.unavailable
  const budget = controls.budget
  const notice =
    budget?.phase === 'exhausted'
      ? labels.budgetExhausted
      : budget && budget.remainingTokens < budget.limit * 0.2
        ? labels.budgetWarning
        : null
  const configuredThreshold =
    limit !== null && context
      ? labels.threshold(context.compactionPercent, Math.floor((limit * context.compactionPercent) / 100))
      : labels.unavailable
  return {
    trigger,
    notice,
    usedFraction,
    thresholdFraction,
    tone,
    tooltip: [
      labels.title,
      trigger,
      input !== null && limit !== null ? labels.windowUsage(input, limit) : null,
      `${labels.compactionThreshold}: ${configuredThreshold}`,
      context && threshold !== null && thresholdFraction !== null && thresholdFraction * 100 < context.compactionPercent
        ? `${labels.effectiveThreshold}: ${labels.threshold(thresholdFraction * 100, threshold)}`
        : null,
    ]
      .filter(Boolean)
      .join('\n'),
    content: {
      density: 'inline' as const,
      title: trigger,
      description: labels.description,
      value: input !== null && limit !== null ? labels.windowUsage(input, limit) : labels.unavailable,
      detail:
        input !== null && threshold !== null
          ? input >= threshold
            ? labels.compactionPending
            : labels.untilCompaction(threshold - input)
          : labels.unavailable,
      progress: Math.min(1, Math.max(0, usedFraction ?? 0)),
      progressLabel: input !== null && limit !== null ? labels.windowUsage(input, limit) : labels.unavailable,
      tone,
      sparkline: [],
      sparklineLabel: labels.title,
      metrics: [
        { id: 'threshold', label: labels.compactionThreshold, value: configuredThreshold },
        ...(context &&
        threshold !== null &&
        thresholdFraction !== null &&
        thresholdFraction * 100 < context.compactionPercent
          ? [
              {
                id: 'effective-threshold',
                label: labels.effectiveThreshold,
                value: labels.threshold(thresholdFraction * 100, threshold),
              },
            ]
          : []),
        {
          id: 'reserve',
          label: labels.outputReserve,
          value:
            context?.outputReserve === null || context?.outputReserve === undefined
              ? labels.unavailable
              : labels.number(context.outputReserve),
        },
        {
          id: 'remaining',
          label: labels.remaining,
          value:
            context?.remainingTokens === null || context?.remainingTokens === undefined
              ? labels.unavailable
              : labels.number(context.remainingTokens),
        },
      ],
    },
  }
}

/** A semantic sm glyph: arc = current input / capacity, radial mark = effective compaction point. */
function ContextUsageRing({ used, threshold }: { readonly used: number | null; readonly threshold: number | null }) {
  return (
    <svg
      className="hbar-context-usage-ring"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      data-used={used}
      data-threshold={threshold}
    >
      <circle className="hbar-context-ring-track" cx="12" cy="12" r="9" />
      {used !== null && (
        <circle
          className="hbar-context-ring-used"
          cx="12"
          cy="12"
          r="9"
          pathLength="100"
          strokeDasharray={`${Math.min(100, Math.max(0, used * 100))} 100`}
          transform="rotate(-90 12 12)"
        />
      )}
      {threshold !== null && (
        <line
          className="hbar-context-ring-threshold"
          x1="12"
          y1="0.5"
          x2="12"
          y2="5.5"
          transform={`rotate(${Math.min(1, Math.max(0, threshold)) * 360} 12 12)`}
        />
      )}
    </svg>
  )
}

/** Read-only disclosure; opening does not change the selected session or reload facts. */
export function HbarSessionUsageControl({
  controls,
  labels,
  onOpenMonitor,
  onRefresh,
}: {
  readonly controls: SessionControlsState
  readonly labels: HbarSessionUsageLabels
  readonly onOpenMonitor: () => void
  readonly onRefresh: () => void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const triggerHandlers = useFloatingTrigger(open, setOpen)
  const presentation = sessionUsagePresentation(controls, labels)
  const error = controls.errors.context
  return (
    <LumenFrame className="hbar-session-usage-control" data-tone={presentation.tone}>
      <LumenButton
        {...triggerHandlers}
        ref={trigger}
        type="button"
        size="s"
        variant="text"
        indicator="none"
        className="hbar-session-usage-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={labels.trigger(presentation.trigger)}
        title={presentation.tooltip}
      >
        <ContextUsageRing used={presentation.usedFraction} threshold={presentation.thresholdFraction} />
        <LumenContentText context="control.label">{presentation.trigger}</LumenContentText>
      </LumenButton>
      <FloatingSurface
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={trigger}
        label={labels.title}
        id={id}
        className="hbar-session-usage-popover"
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.stopPropagation()
        }}
      >
        <LumenFrame className="hbar-session-usage-heading">
          <LumenContentText context="popover.title">{labels.title}</LumenContentText>
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            aria-label={labels.close}
            onClick={() => setOpen(false)}
          >
            <LumenIcon icon={X} tier="sm" />
          </LumenButton>
        </LumenFrame>
        <LumenContentText context="popover.body">{labels.description}</LumenContentText>
        {error ? (
          <LumenFrame className="hbar-session-usage-error">
            <LumenContentText context="popover.body" role="alert">
              {labels.error(error)}
            </LumenContentText>
            <LumenButton type="button" variant="text" indicator="none" onClick={onRefresh}>
              {labels.refresh}
            </LumenButton>
          </LumenFrame>
        ) : presentation.usedFraction !== null ? (
          <>
            <LumenCompactUsage {...presentation.content} />
            <LumenContentText context="popover.body">{labels.thresholdLegend}</LumenContentText>
          </>
        ) : (
          <LumenContentText context="popover.body" role="status">
            {presentation.trigger}
          </LumenContentText>
        )}
        {presentation.notice && (
          <LumenContentText context="popover.body" role="status">
            {presentation.notice}
          </LumenContentText>
        )}
        <LumenButton
          type="button"
          variant="text"
          indicator="none"
          onClick={() => {
            setOpen(false)
            onOpenMonitor()
          }}
        >
          {labels.monitor}
        </LumenButton>
      </FloatingSurface>
    </LumenFrame>
  )
}
