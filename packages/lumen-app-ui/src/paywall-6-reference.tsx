'use client'

import * as React from 'react'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenText } from './primitives'
import './paywall-6-reference.css'

export interface LumenPaywall6ReferenceSegment {
  readonly id: string
  readonly used: boolean
}

export interface LumenPaywall6ReferenceAssurance {
  readonly id: string
  readonly text: string
}

export interface LumenPaywall6ReferenceContent {
  readonly labels: {
    readonly counterImage: string
    readonly eyebrow: string
    readonly title: string
    readonly description: string
    readonly emailLabel: string
    readonly emailPlaceholder: string
    readonly keepReading: string
    readonly alreadySubscribed: string
    readonly signIn: string
    readonly assuranceList: string
    readonly emptyAssurances: string
  }
  readonly emailDraft: string
  readonly segments: readonly LumenPaywall6ReferenceSegment[]
  readonly assurances: readonly LumenPaywall6ReferenceAssurance[]
  readonly listStrategy: {
    readonly kind: 'content-grown' | 'pane-scroll'
    readonly expectedMaximum: number
  }
}

export interface LumenPaywall6ReferenceViewModel {
  readonly content: LumenPaywall6ReferenceContent
  readonly onEmailDraftChange: (value: string) => void
  readonly onKeepReadingRequest: () => void
  readonly onSignInRequest: () => void
}

export interface LumenPaywall6ReferenceProps {
  readonly variantId: string
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  readonly className?: string | undefined
  readonly viewModel: LumenPaywall6ReferenceViewModel
}

function uniqueById<Item extends { readonly id: string }>(items: readonly Item[]): Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function LumenPaywall6Reference({
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  viewModel,
}: LumenPaywall6ReferenceProps) {
  const { content } = viewModel
  const segments = uniqueById(content.segments)
  const assurances = uniqueById(content.assurances)
  const paneScroll = content.listStrategy.kind === 'pane-scroll'
  const inputId = `lumen-paywall6-email-${React.useId().replaceAll(/[^a-zA-Z0-9_-]/g, '-')}`
  const rootClassName = [
    'lumen-paywall',
    'lumen-paywall6-reference',
    'hbar-app-ui-paywall-variant-6',
    density ? `hbar-app-ui-density-${density}` : '',
    surface ? `hbar-app-ui-surface-${surface}` : '',
    state ? `hbar-app-ui-state-${state}` : '',
    visualMode ? `hbar-app-ui-visual-${visualMode}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    viewModel.onKeepReadingRequest()
  }

  const assuranceList =
    assurances.length === 0 ? (
      <LumenText as="p" tone="muted" className="lumen-paywall6-empty-assurances">
        {content.labels.emptyAssurances}
      </LumenText>
    ) : (
      <ul
        className="lumen-paywall6-assurance-list"
        data-paywall6-assurance-list
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
      >
        {assurances.map((assurance) => (
          <li key={assurance.id} data-paywall6-assurance-id={assurance.id}>
            {assurance.text}
          </li>
        ))}
      </ul>
    )
  const assuranceScrollRegionProps: React.HTMLAttributes<HTMLDivElement> = {
    role: 'region',
    'aria-label': content.labels.assuranceList,
    tabIndex: 0,
  }

  return (
    <LumenSurface
      as="div"
      material="solid"
      className="lumen-paywall6-surface"
      contentClassName={rootClassName}
      data-lumen-component="paywall"
      data-lumen-variant={6}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      <div className="lumen-paywall6-counter" role="img" aria-label={content.labels.counterImage} data-paywall6-counter>
        {segments.map((segment) => (
          <span
            key={segment.id}
            className="lumen-paywall6-counter-segment"
            data-paywall6-segment-id={segment.id}
            data-used={segment.used ? 'true' : 'false'}
            aria-hidden="true"
          />
        ))}
      </div>
      <LumenText as="p" tone="muted" className="lumen-paywall6-eyebrow">
        {content.labels.eyebrow}
      </LumenText>
      <LumenText as="h2" variant="heading" className="lumen-paywall6-title">
        {content.labels.title}
      </LumenText>
      <LumenText as="p" tone="muted" className="lumen-paywall6-description">
        {content.labels.description}
      </LumenText>
      <form className="lumen-paywall6-email-form" onSubmit={handleSubmit} data-paywall6-email-form>
        <label className="lumen-paywall6-email-label" htmlFor={inputId}>
          {content.labels.emailLabel}
        </label>
        <input
          id={inputId}
          className="lumen-paywall6-email-input"
          type="email"
          name="email"
          autoComplete="email"
          placeholder={content.labels.emailPlaceholder}
          value={content.emailDraft}
          onChange={(event) => viewModel.onEmailDraftChange(event.currentTarget.value)}
          data-paywall6-email
        />
        <LumenButton
          className="lumen-paywall6-keep-reading"
          indicator="none"
          tone="primary"
          type="submit"
          data-paywall6-keep-reading
        >
          {content.labels.keepReading}
        </LumenButton>
      </form>
      <LumenText as="p" className="lumen-paywall6-sign-in-prompt">
        <span>{content.labels.alreadySubscribed} </span>
        <LumenButton
          className="lumen-paywall6-sign-in"
          indicator="none"
          variant="text"
          type="button"
          onClick={viewModel.onSignInRequest}
          data-paywall6-sign-in
        >
          {content.labels.signIn}
        </LumenButton>
      </LumenText>
      {paneScroll ? (
        <div {...assuranceScrollRegionProps} className="lumen-paywall6-assurance-scroll">
          {assuranceList}
        </div>
      ) : (
        assuranceList
      )}
    </LumenSurface>
  )
}
