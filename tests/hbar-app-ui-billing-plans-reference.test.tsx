import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { HbarAppUiBillingPlansContent } from '../packages/hbar-app-ui/src/index'
import { ReferenceBillingPlans } from '../packages/lumen-app-ui/src/billing/ReferenceBillingPlans'
import { createBillingPlansReferenceFixture } from './fixtures/hbar-app-ui-billing-plans-reference-fixtures'

function renderPlans(content: HbarAppUiBillingPlansContent): string {
  return renderToStaticMarkup(
    createElement(ReferenceBillingPlans, {
      spec: { id: 'billing-plans-preview', variant: 2, profile: {} },
      content,
      layout: content.referenceLayout ?? { ownerId: 'billing:plans:test' },
    }),
  )
}

describe('billing reference plans', () => {
  test('renders the source plan summary, bounded feature lists, and accessible toggles', () => {
    const content = createBillingPlansReferenceFixture('en')
    const markup = renderPlans(content)

    expect(markup).toContain('3 plans · 3 live · edited 14 min ago by Amelia Whitfield')
    expect(markup).toContain('4 edits across Scale and Enterprise are not published yet.')
    expect(markup).toContain('Starter')
    expect(markup).toContain('Growth')
    expect(markup).toContain('Scale')
    expect(markup.match(/data-hbar-app-ui-item-id="(starter|growth|scale)"/g)).toHaveLength(3)
    expect(markup).toContain('aria-label="Scale: Listed publicly"')
    expect(markup.match(/<input(?=[^>]*aria-label="Scale: Listed publicly")[^>]*>/)?.[0]).not.toContain('checked')
    expect(markup).toContain('data-hbar-app-ui-list-strategy="content-grown"')
    expect(markup).toContain('Extra storage')
    expect(markup).toContain('SSO and SAML')
  })

  test('projects controlled flag, pending, error, and feedback without local confirmation', () => {
    const content = createBillingPlansReferenceFixture('en')
    const flow: NonNullable<HbarAppUiBillingPlansContent['referenceFlow']> = {
      flags: [
        { planId: 'starter', toggleId: 'active', enabled: false },
        { planId: 'removed-plan', toggleId: 'active', enabled: false },
      ],
      dirty: false,
      pending: true,
      error: 'The preview save was rejected.',
      feedback: 'Waiting for the local preview host.',
      onToggle: () => undefined,
      onDiscard: () => undefined,
      onSave: () => undefined,
    }
    const markup = renderPlans({ ...content, referenceFlow: flow })
    const starterToggle = markup.match(/<input(?=[^>]*aria-label="Starter: Active")[^>]*>/)?.[0]

    expect(starterToggle).toBeDefined()
    expect(starterToggle).not.toContain('checked')
    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('The preview save was rejected.')
    expect(markup).toContain('Waiting for the local preview host.')
    expect(markup).not.toContain('4 edits across Scale and Enterprise are not published yet.')
  })

  test('handles localized copy, empty plans, duplicate identities, and a pane-scroll collection', () => {
    const localized = createBillingPlansReferenceFixture('de-long')
    expect(renderPlans(localized)).toContain('Drei veröffentlichte Tarife')

    const base = createBillingPlansReferenceFixture('en')
    const duplicateAndOverflow = {
      ...base,
      plans: [
        ...base.plans,
        { ...base.plans[0]!, name: 'Duplicate starter' },
        ...Array.from({ length: 6 }, (_, index) => ({
          ...base.plans[0]!,
          id: `overflow-plan-${index}`,
          name: `Overflow plan ${index + 1}`,
        })),
      ],
      listStrategy: { kind: 'pane-scroll' as const, expectedMaximum: base.plans.length },
    }
    const overflowMarkup = renderPlans(duplicateAndOverflow)
    expect(overflowMarkup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(overflowMarkup).not.toContain('Duplicate starter')
    expect(overflowMarkup).toContain('Overflow plan 6')

    const empty = { ...base, plans: [] }
    expect(renderPlans(empty)).toContain(base.labels.emptyPlans)
  })

  test('keeps compound plan/toggle identities separate when either ID includes a colon', () => {
    const base = createBillingPlansReferenceFixture('en')
    const first = base.plans[0]!
    const toggle = first.toggles[0]!
    const markup = renderPlans({
      ...base,
      plans: [
        { ...first, id: 'a:b', name: 'First', toggles: [{ ...toggle, id: 'c' }] },
        { ...first, id: 'a', name: 'Second', toggles: [{ ...toggle, id: 'b:c' }] },
      ],
      referenceFlow: {
        flags: [{ planId: 'a:b', toggleId: 'c', enabled: false }],
        pending: false,
        dirty: true,
        error: null,
        feedback: null,
        onToggle: () => undefined,
        onDiscard: () => undefined,
        onSave: () => undefined,
      },
    })
    expect(markup.match(/<input(?=[^>]*aria-label="First: Active")[^>]*>/)?.[0]).not.toContain('checked')
    expect(markup.match(/<input(?=[^>]*aria-label="Second: Active")[^>]*>/)?.[0]).toContain('checked')
  })
})
