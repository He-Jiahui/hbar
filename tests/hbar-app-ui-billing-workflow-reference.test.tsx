import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiBillingProvider,
  type HbarAppUiBillingContent,
} from '../packages/hbar-app-ui/src/catalog'
import { createBillingWorkflowReferenceFixtures } from './fixtures/hbar-app-ui-billing-workflow-reference-fixtures'

function render(variant: number, content: HbarAppUiBillingContent): string {
  const component = getHbarAppUiVariant('billing', variant).component
  return renderToStaticMarkup(createElement(HbarAppUiBillingProvider, { content, children: createElement(component) }))
}

describe('Billing observed workflow reference views', () => {
  test('renders only the observed Customer/Terms form with native Host-controlled values and adjacent feedback', () => {
    const content = createBillingWorkflowReferenceFixtures()
    const invoice = content.invoiceComposer!
    const markup = render(3, {
      ...content,
      invoiceComposer: {
        ...invoice,
        referenceFlow: {
          values: { customer: 'A retained Host draft' },
          pending: true,
          error: 'No invoice was saved remotely.',
          feedback: null,
          onFieldChange: () => undefined,
          onSaveDraft: () => undefined,
          onNext: () => undefined,
        },
      },
    })
    expect(markup).toContain('data-hbar-app-ui-region="invoice-composer"')
    expect(markup.match(/data-hbar-app-ui-field=/g) ?? []).toHaveLength(10)
    expect(markup.match(/class="lumen-billing-workflow-section"/g) ?? []).toHaveLength(2)
    expect(markup.match(/<li(?: |>)/g) ?? []).toHaveLength(4)
    expect(markup.match(/<select /g) ?? []).toHaveLength(3)
    expect(markup.match(/type="date"/g) ?? []).toHaveLength(2)
    expect(markup).toContain('value="A retained Host draft"')
    expect(markup).toContain('14 Warren Street, Suite 620')
    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('No invoice was saved remotely.')
    expect(markup).toContain('Next step')
    expect(markup).not.toContain('Previous step')
    expect(markup).not.toContain('hbar-app-ui-billing-invoice-composer-surface')
  })

  test('projects each selected plan summary instead of leaving Scale amounts under a different radio', () => {
    const content = createBillingWorkflowReferenceFixtures()
    const change = content.changePlan!
    const initial = render(5, content)
    expect(initial.match(/type="radio"/g) ?? []).toHaveLength(4)
    expect(initial).toContain('$1,920')
    expect(initial).toContain('$2,988')
    expect(initial).toContain('$4,980')
    const selected = render(5, {
      ...content,
      changePlan: {
        ...change,
        referenceFlow: {
          choiceId: 'starter',
          onChoiceChange: () => undefined,
          onContinue: () => undefined,
          onCancel: () => undefined,
        },
      },
    })
    expect(selected).toContain('Downgrade')
    expect(selected).toContain('$0')
    expect(selected).toContain('$348')
    expect(selected).toContain('$580')
    expect(selected).not.toContain('$1,920')
    expect(selected).toContain('aria-current="step"')
    expect(selected).toContain(change.labels.footerNotice)
    const twice = renderToStaticMarkup(
      createElement(HbarAppUiBillingProvider, {
        content,
        children: [
          createElement(getHbarAppUiVariant('billing', 5).component, { key: 'one' }),
          createElement(getHbarAppUiVariant('billing', 5).component, { key: 'two' }),
        ],
      }),
    )
    expect(new Set(Array.from(twice.matchAll(/name="(billing-choice-[^"]+)"/g), (match) => match[1])).size).toBe(2)
    const german = createBillingWorkflowReferenceFixtures('de-long')
    expect(render(3, german)).toContain('Rechnungsadresse')
    expect(render(5, german)).toContain('Anteilig berechneter Betrag')
  })
})
