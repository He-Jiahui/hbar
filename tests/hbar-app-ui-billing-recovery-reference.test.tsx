import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiBillingProvider,
  type HbarAppUiBillingContent,
} from '../packages/hbar-app-ui/src/index'
import { createBillingRecoveryReferenceFixture } from './fixtures/hbar-app-ui-billing-recovery-reference-fixtures'

type RecoveryContent = NonNullable<HbarAppUiBillingContent['recovery']>

function render(content: RecoveryContent): string {
  return renderToStaticMarkup(
    createElement(HbarAppUiBillingProvider, {
      content: { recovery: content },
      children: createElement(getHbarAppUiVariant('billing', 4).component, {}),
    }),
  )
}

function subscription(id: string): RecoveryContent['subscriptions'][number] {
  return {
    id,
    customer: `Customer ${id}`,
    customerMeta: `SUB-${id} · Usage service`,
    status: 'Retrying',
    statusTone: 'warning',
    plan: 'Growth',
    planMeta: 'Usage based',
    owner: `Owner ${id}`,
    amount: '$240',
    paymentMethod: `PM-${id}`,
    nextRetry: 'Tomorrow',
    attemptSummary: 'Attempt 1 of 4',
    retryTitle: 'Retry attempts',
    retryDescription: 'A retry is scheduled.',
    invoice: `INV-${id}`,
    actionLabel: `Retry attempts for Customer ${id}`,
    attempts: [],
  }
}

describe('billing recovery reference view', () => {
  test('renders source summary groups and a semantic six-column recovery table', () => {
    const content = createBillingRecoveryReferenceFixture()
    const markup = render(content)

    expect(markup).toContain('Recovery queue')
    expect(markup).toContain('Past due subscriptions')
    expect(markup).toContain('<table')
    expect(markup).toContain('<caption>Past due subscriptions</caption>')
    expect(markup).toContain('data-hbar-app-ui-region="recovery-subscriptions"')
    expect(markup).toContain('data-hbar-app-ui-action="billing-recovery:retry-due"')
    expect(markup).toContain('data-hbar-app-ui-action="billing-recovery:toggle-retry-attempts"')
    expect(markup).not.toContain('data-hbar-app-ui-action="billing-recovery:retry-now"')
    expect(markup).toContain('Failed')
    expect(markup).toContain('Exhausted')
    expect(markup).toContain('Capacity')
    expect(markup).toContain('data-hbar-app-ui-subscription-id="sub-4712"')
    expect(markup).toContain('insufficient_funds')
    expect(markup).toContain('generic_decline')
    expect((markup.match(/<dt>/g) ?? []).length).toBe(9)
    expect((markup.match(/<tr data-hbar-app-ui-item-id=/g) ?? []).length).toBe(6)
  })

  test('uses controlled expanded ids, ignores stale ids, and keeps only the first duplicate record', () => {
    const content = createBillingRecoveryReferenceFixture()
    const first = content.subscriptions[0]
    if (!first) throw new Error('The recovery fixture needs a subscription.')
    const collapsed = render({
      ...content,
      subscriptions: [...content.subscriptions, { ...first, customer: 'Duplicate customer' }],
      referenceFlow: { expandedIds: [], onToggleSubscription: () => {} },
    })
    const staleExpanded = render({
      ...content,
      referenceFlow: { expandedIds: ['removed-subscription'], onToggleSubscription: () => {} },
    })
    const selected = render({
      ...content,
      referenceFlow: { expandedIds: ['sub-4712'], onToggleSubscription: () => {} },
    })

    expect(collapsed).not.toContain('insufficient_funds')
    expect(collapsed).not.toContain('Duplicate customer')
    expect(collapsed).toContain('aria-expanded="false"')
    expect((collapsed.match(/<tr data-hbar-app-ui-item-id=/g) ?? []).length).toBe(6)
    expect(staleExpanded).not.toContain('insufficient_funds')
    expect(selected).toContain('aria-expanded="true"')
    expect(selected).toContain('insufficient_funds')
  })

  test('renders empty, one-row, expected-boundary and over-bound subscriptions', () => {
    const content = createBillingRecoveryReferenceFixture()
    const emptyMarkup = render({ ...content, subscriptions: [] })
    const singleMarkup = render({
      ...content,
      subscriptions: content.subscriptions.slice(0, 1),
      initialExpandedId: 'removed-subscription',
    })
    const expectedMaximum = content.listStrategy.expectedMaximum
    const boundarySubscriptions = Array.from({ length: expectedMaximum }, (_, index) =>
      subscription(`boundary-${index}`),
    )
    const overflowSubscriptions = [...boundarySubscriptions, subscription('over-bound')]

    expect(emptyMarkup).toContain(content.labels.emptySubscriptions)
    expect(singleMarkup).toContain('Halcyon Pay')
    expect(singleMarkup).not.toContain('insufficient_funds')
    expect(
      (render({ ...content, subscriptions: boundarySubscriptions }).match(/<tr data-hbar-app-ui-item-id=/g) ?? [])
        .length,
    ).toBe(expectedMaximum)
    const overflowMarkup = render({ ...content, subscriptions: overflowSubscriptions })
    expect((overflowMarkup.match(/<tr data-hbar-app-ui-item-id=/g) ?? []).length).toBe(expectedMaximum + 1)
    expect(overflowMarkup).toContain('data-hbar-app-ui-item-id="over-bound"')
    expect(overflowMarkup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })

  test('keeps long German labels and expanded details in the host fixture', () => {
    const content = createBillingRecoveryReferenceFixture('de-long')
    const markup = render(content)

    expect(markup).toContain('Zahlungswiederherstellung')
    expect(markup).toContain('Überfällige Abonnements')
    expect(markup).toContain('Wiederherstellungsregeln')
    expect(markup).toContain('Wiederholungsversuche für Halcyon Pay')
    expect(markup).toContain('Nicht ausreichende Deckung')
  })
})
