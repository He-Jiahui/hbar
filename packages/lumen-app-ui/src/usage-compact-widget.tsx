'use client'

import type { CSSProperties } from 'react'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { LumenButton } from './primitives'
import type { LumenUsageAction, LumenUsageCompactContent } from './usage'
import './usage-compact-widget.css'

export interface LumenUsageCompactWidgetContent {
  readonly primaryLabel: string
  /** Inline suffix, including the host's separator (for example a slash). */
  readonly allowance: string
  readonly details: LumenUsageAction
  /** Content-grown secondary meters, normally three; hosts group inventories above six. */
  readonly meters: readonly {
    readonly id: string
    readonly label: string
    readonly value: string
    readonly progress: number
  }[]
  readonly emptyLabel: string
  readonly emptySparklineLabel: string
  readonly note: string
}
export interface UsageCompactWidgetProps {
  readonly content: LumenUsageCompactContent
  readonly widget: LumenUsageCompactWidgetContent
}
function percent(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
}
export function UsageCompactWidget({ content, widget }: UsageCompactWidgetProps) {
  const meters = [...new Map(widget.meters.map((meter) => [meter.id, meter])).values()]
  const points = [...new Map(content.sparkline.map((point) => [point.id, point])).values()]
  const sparkStyle: CSSProperties & { '--lumen-usage-widget-points': number } = {
    '--lumen-usage-widget-points': Math.max(1, points.length),
  }
  return (
    <div className="lumen-usage-compact-widget hbar-app-ui-usage-variant-8">
      <div className="lumen-usage-widget-heading">
        <div>
          <h2>{content.title}</h2>
          <p title={content.description}>{content.description}</p>
        </div>
        <LumenButton size="s" variant="text" disabled={widget.details.disabled} onClick={widget.details.onInvoke}>
          {widget.details.label}
          <ArrowUpRight className="lumen-usage-widget-icon" aria-hidden="true" />
        </LumenButton>
      </div>
      <div className="lumen-usage-widget-frame">
        <div className="lumen-usage-widget-primary">
          <div className="lumen-usage-widget-primary-row">
            <div>
              <p>{widget.primaryLabel}</p>
              <p className="lumen-usage-widget-value">
                {content.value}
                <span>{widget.allowance}</span>
              </p>
            </div>
            <div
              className="lumen-usage-widget-sparkline"
              aria-hidden="true"
              title={points.length ? content.sparklineLabel : widget.emptySparklineLabel}
              style={sparkStyle}
            >
              {points.map((point) => (
                <span key={point.id} style={{ blockSize: `${percent(point.value * 100)}%` }} />
              ))}
            </div>
          </div>
          {content.progress !== undefined ? (
            <div
              className="lumen-usage-widget-progress"
              role="progressbar"
              aria-label={content.progressLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent(content.progress)}
            >
              <div style={{ inlineSize: `${percent(content.progress)}%` }} />
            </div>
          ) : null}
          <p className="lumen-usage-widget-status">
            <span aria-hidden="true" />
            {content.detail}
          </p>
        </div>
        <div className="lumen-usage-widget-meters" data-lumen-list-strategy="content-grown">
          {meters.length ? (
            meters.map((meter) => (
              <div className="lumen-usage-widget-meter" key={meter.id} data-meter-id={meter.id}>
                <div>
                  <p title={meter.label}>{meter.label}</p>
                  <p>{meter.value}</p>
                </div>
                <div className="lumen-usage-widget-meter-track" aria-hidden="true">
                  <div style={{ inlineSize: `${percent(meter.progress)}%` }} />
                </div>
              </div>
            ))
          ) : (
            <p className="lumen-usage-widget-empty">{widget.emptyLabel}</p>
          )}
        </div>
        <div className="lumen-usage-widget-footer">
          <p>
            <Sparkles className="lumen-usage-widget-icon" aria-hidden="true" />
            <span title={widget.note}>{widget.note}</span>
          </p>
          {content.action ? (
            <LumenButton size="s" variant="solid" disabled={content.action.disabled} onClick={content.action.onInvoke}>
              {content.action.label}
            </LumenButton>
          ) : null}
        </div>
      </div>
    </div>
  )
}
