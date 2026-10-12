'use client'

import LumenSurface from './LumenSurface'
import { LumenButton, LumenText } from './primitives'
import './paywall-5-reference.css'

export interface LumenPaywall5ReferenceRow {
  readonly id: string
  readonly label: string
  readonly value: string
}

export interface LumenPaywall5ReferenceContent {
  readonly labels: {
    readonly eyebrow: string
    readonly title: string
    readonly description: string
    readonly retainedData: string
    readonly emptyRows: string
    readonly paymentTitle: string
    readonly paymentDescription: string
    readonly change: string
    readonly reactivate: string
    readonly renewalNote: string
  }
  readonly rows: readonly LumenPaywall5ReferenceRow[]
  readonly listStrategy: {
    readonly kind: 'content-grown' | 'pane-scroll'
    readonly expectedMaximum: number
  }
}

export interface LumenPaywall5ReferenceViewModel {
  readonly content: LumenPaywall5ReferenceContent
  readonly onPaymentChangeRequest: () => void
  readonly onReactivateRequest: () => void
}

export interface LumenPaywall5ReferenceProps {
  readonly variantId: string
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  readonly className?: string | undefined
  readonly viewModel: LumenPaywall5ReferenceViewModel
}

export function uniqueLumenPaywall5Rows(rows: readonly LumenPaywall5ReferenceRow[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (!row.id.trim() || seen.has(row.id)) {
      return false
    }
    seen.add(row.id)
    return true
  })
}

export function LumenPaywall5Reference({
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  viewModel,
}: LumenPaywall5ReferenceProps) {
  const { content } = viewModel
  const rows = uniqueLumenPaywall5Rows(content.rows)
  const scrollRows = content.listStrategy.kind === 'pane-scroll'
  const rootClassName = [
    'lumen-paywall',
    'lumen-paywall5-reference',
    'hbar-app-ui-paywall-variant-5',
    density ? `hbar-app-ui-density-${density}` : '',
    surface ? `hbar-app-ui-surface-${surface}` : '',
    state ? `hbar-app-ui-state-${state}` : '',
    visualMode ? `hbar-app-ui-visual-${visualMode}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <LumenSurface
      as="div"
      material="solid"
      className="lumen-paywall5-surface"
      contentClassName={rootClassName}
      data-lumen-component="paywall"
      data-lumen-variant={5}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      <div className="lumen-paywall5-card">
        <LumenText as="p" tone="muted" className="lumen-paywall5-eyebrow">
          {content.labels.eyebrow}
        </LumenText>
        <LumenText as="h2" variant="heading" className="lumen-paywall5-title">
          {content.labels.title}
        </LumenText>
        <LumenText as="p" tone="muted" className="lumen-paywall5-description">
          {content.labels.description}
        </LumenText>
        <div
          className="lumen-paywall5-rows"
          data-paywall5-rows
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          role={scrollRows ? 'region' : undefined}
          aria-label={scrollRows ? content.labels.retainedData : undefined}
          tabIndex={scrollRows ? 0 : undefined}
        >
          {rows.length === 0 ? (
            <LumenText as="p" tone="muted" className="lumen-paywall5-empty">
              {content.labels.emptyRows}
            </LumenText>
          ) : (
            rows.map((row) => (
              <div className="lumen-paywall5-row" key={row.id} data-paywall5-row-id={row.id}>
                <LumenText as="p" tone="muted">
                  {row.label}
                </LumenText>
                <LumenText as="p">{row.value}</LumenText>
              </div>
            ))
          )}
        </div>
        <div className="lumen-paywall5-payment">
          <svg
            data-tier="md"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden="true"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M2 10h20" />
          </svg>
          <div>
            <LumenText as="p">{content.labels.paymentTitle}</LumenText>
            <LumenText as="p" tone="muted">
              {content.labels.paymentDescription}
            </LumenText>
          </div>
          <LumenButton
            indicator="none"
            variant="text"
            className="lumen-paywall5-change"
            data-paywall5-change
            onClick={viewModel.onPaymentChangeRequest}
          >
            {content.labels.change}
          </LumenButton>
        </div>
        <LumenButton
          indicator="none"
          tone="primary"
          className="lumen-paywall5-reactivate"
          data-paywall5-reactivate
          onClick={viewModel.onReactivateRequest}
        >
          {content.labels.reactivate}
        </LumenButton>
        <LumenText as="p" tone="muted" className="lumen-paywall5-renewal">
          {content.labels.renewalNote}
        </LumenText>
      </div>
    </LumenSurface>
  )
}
