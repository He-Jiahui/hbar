'use client'

import { Building2, LockKeyhole } from 'lucide-react'
import * as React from 'react'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenText } from './primitives'
import './paywall-7-reference.css'

export interface LumenPaywall7ReferenceRecipient {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly role: string
}

export interface LumenPaywall7ReferenceContent {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly requestSectionTitle: string
    readonly requestSectionDescription: string
    readonly recipientsAccessibleName: string
    readonly emptyRecipients: string
    readonly reasonLabel: string
    readonly comparePlans: string
    readonly sendRequest: string
    readonly scaleHint: string
  }
  readonly recipients: readonly LumenPaywall7ReferenceRecipient[]
  readonly draft: string
  readonly listStrategy: {
    readonly kind: 'content-grown' | 'pane-scroll'
    readonly expectedMaximum: number
  }
}

export interface LumenPaywall7ReferenceViewModel {
  readonly content: LumenPaywall7ReferenceContent
  readonly onDraftChange: (value: string) => void
  readonly onComparePlansRequest: () => void
  readonly onSendRequest: () => void
}

export interface LumenPaywall7ReferenceProps {
  readonly variantId: string
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  readonly className?: string | undefined
  readonly viewModel: LumenPaywall7ReferenceViewModel
}

export function uniqueLumenPaywall7Recipients(recipients: readonly LumenPaywall7ReferenceRecipient[]) {
  const seen = new Set<string>()
  return recipients.filter((recipient) => {
    const id = recipient.id.trim()
    if (!id || seen.has(id)) {
      return false
    }
    if (!recipient.initials.trim() || !recipient.name.trim() || !recipient.role.trim()) {
      return false
    }
    seen.add(id)
    return true
  })
}

export function LumenPaywall7Reference({
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  viewModel,
}: LumenPaywall7ReferenceProps) {
  const { content } = viewModel
  const recipients = uniqueLumenPaywall7Recipients(content.recipients)
  const noteId = React.useId()
  const scrollRecipients = content.listStrategy.kind === 'pane-scroll'
  const rootClassName = [
    'lumen-paywall',
    'lumen-paywall7-reference',
    'hbar-app-ui-paywall-variant-7',
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
      className="lumen-paywall7-surface"
      contentClassName={rootClassName}
      data-lumen-component="paywall"
      data-lumen-variant={7}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      <div className="lumen-paywall7-header">
        <span className="lumen-paywall7-lock-frame" aria-hidden="true">
          <LockKeyhole className="lumen-paywall7-lock-icon" data-tier="md" />
        </span>
        <div className="lumen-paywall7-heading-copy">
          <LumenText as="h2" variant="heading" className="lumen-paywall7-title">
            {content.labels.title}
          </LumenText>
          <div className="lumen-paywall7-description-row">
            <Building2 className="lumen-paywall7-building-icon" data-tier="sm" aria-hidden="true" />
            <LumenText as="p" tone="muted" className="lumen-paywall7-description">
              {content.labels.description}
            </LumenText>
          </div>
        </div>
      </div>

      <div className="lumen-paywall7-request-shell">
        <div className="lumen-paywall7-recipient-panel">
          <LumenText as="p" className="lumen-paywall7-panel-title">
            {content.labels.requestSectionTitle}
          </LumenText>
          <LumenText as="p" tone="muted" className="lumen-paywall7-panel-description">
            {content.labels.requestSectionDescription}
          </LumenText>
          <div
            className="lumen-paywall7-recipients"
            data-paywall7-recipients
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
            role={scrollRecipients ? 'region' : undefined}
            aria-label={scrollRecipients ? content.labels.recipientsAccessibleName : undefined}
            tabIndex={scrollRecipients ? 0 : undefined}
          >
            {recipients.length === 0 ? (
              <LumenText as="p" tone="muted" className="lumen-paywall7-empty">
                {content.labels.emptyRecipients}
              </LumenText>
            ) : (
              recipients.map((recipient) => (
                <div className="lumen-paywall7-recipient" key={recipient.id} data-paywall7-recipient-id={recipient.id}>
                  <span className="lumen-paywall7-avatar" aria-hidden="true">
                    {recipient.initials}
                  </span>
                  <div className="lumen-paywall7-recipient-copy">
                    <LumenText as="p" className="lumen-paywall7-recipient-name">
                      {recipient.name}
                    </LumenText>
                    <LumenText as="p" tone="muted" className="lumen-paywall7-recipient-role">
                      {recipient.role}
                    </LumenText>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lumen-paywall7-reason-panel">
          <label className="lumen-paywall7-reason-label" htmlFor={noteId}>
            <LumenText as="span" variant="label">
              {content.labels.reasonLabel}
            </LumenText>
          </label>
          <textarea
            id={noteId}
            className="lumen-paywall7-note"
            data-paywall7-note
            rows={2}
            value={content.draft}
            onChange={(event) => viewModel.onDraftChange(event.currentTarget.value)}
          />
        </div>
      </div>

      <div className="lumen-paywall7-footer">
        <LumenText as="p" tone="muted" className="lumen-paywall7-scale-hint">
          {content.labels.scaleHint}
        </LumenText>
        <div className="lumen-paywall7-actions">
          <LumenButton
            className="lumen-paywall7-compare"
            indicator="none"
            variant="outlined"
            data-paywall7-compare
            onClick={viewModel.onComparePlansRequest}
          >
            {content.labels.comparePlans}
          </LumenButton>
          <LumenButton
            className="lumen-paywall7-send"
            indicator="none"
            tone="primary"
            data-paywall7-send
            onClick={viewModel.onSendRequest}
          >
            {content.labels.sendRequest}
          </LumenButton>
        </div>
      </div>
    </LumenSurface>
  )
}
