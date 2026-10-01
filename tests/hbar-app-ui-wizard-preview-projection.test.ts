import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import { WizardPreviewHost } from '../apps/hbar-app-ui-preview/src/WizardPreviewHost'
import {
  createWizardPreviewStore,
  type WizardPreviewScope,
  type WizardPreviewVariant,
} from '../apps/hbar-app-ui-preview/src/wizardPreviewModel'
import { createWizardPreviewSeed, projectWizardPreview } from '../apps/hbar-app-ui-preview/src/wizardPreviewProjection'
import { HBAR_APP_UI_WIZARD_FIXTURES } from './fixtures/hbar-app-ui-wizard-fixtures'

const input = HBAR_APP_UI_WIZARD_FIXTURES
function setup(variant: WizardPreviewVariant) {
  const scope: WizardPreviewScope = { ownerId: 'preview', variant, fixtureId: 'default' }
  const store = createWizardPreviewStore(createWizardPreviewSeed(input, scope))
  return { scope, store, content: () => projectWizardPreview(input, store) }
}

describe('Wizard active-owner projection', () => {
  test('projects exactly one workflow, with no inactive migration contract or data', () => {
    const variants: readonly WizardPreviewVariant[] = [1, 2, 3, 4, 5, 6, 7]
    const keys: Record<WizardPreviewVariant, string> = {
      1: 'referenceInformation',
      2: 'referenceInvoice',
      3: 'referenceUpgrade',
      4: 'referenceEnvironment',
      5: 'referenceReview',
      6: 'referenceMigration',
      7: 'referenceShipping',
    }
    for (const variant of variants) {
      const { content } = setup(variant)
      const value = content()
      expect(Object.keys(value)).toHaveLength(2)
      expect(Object.keys(value).filter((key) => key.startsWith('reference'))).toEqual([keys[variant]])
      expect(Boolean(value.referenceMigration)).toBe(variant === 6)
    }
  })

  test('keeps edits during step navigation and rejects callbacks after owner refresh', () => {
    const { store, content } = setup(1)
    const oldFlow = content().referenceInformation
    expect(oldFlow).toBeDefined()
    oldFlow?.onFieldChange('company', 'Core workflow company')
    oldFlow?.onFieldChange('role', 'Finance')
    oldFlow?.onStepChange('payment')
    expect(content().referenceInformation?.stepId).toBe('payment')
    expect(content().referenceInformation?.fields.find((field) => field.id === 'company')?.value).toBe(
      'Core workflow company',
    )
    expect(content().referenceInformation?.fields.find((field) => field.id === 'role')?.value).toBe('Finance')
    const nextScope: WizardPreviewScope = { ...store.getState().scope }
    store.getState().refresh(createWizardPreviewSeed(input, nextScope))
    oldFlow?.onFieldChange('company', 'Old callback')
    oldFlow?.onStepChange('completed')
    expect(content().referenceInformation?.fields.find((field) => field.id === 'company')?.value).toBe('Kepler Works')
    expect(content().referenceInformation?.stepId).toBe('information')
  })

  test('updates invoice inputs and plan choices without inventing derived badge or quote behavior', () => {
    const invoice = setup(2)
    invoice.content().referenceInvoice?.onFieldChange('currency', 'EUR')
    invoice.content().referenceInvoice?.onFieldChange('terms', 'Net 30')
    expect(invoice.content().referenceInvoice?.termsFields.find((field) => field.id === 'currency')?.value).toBe('EUR')
    expect(invoice.content().referenceInvoice?.labels.currencyBadge).toBe('USD')
    expect(invoice.content().referenceInvoice?.labels.termsBadge).toBe('Net 14')
    const upgrade = setup(3)
    upgrade.content().referenceUpgrade?.onPlanChange('team')
    upgrade.content().referenceUpgrade?.onStepChange('seats')
    expect(upgrade.content().referenceUpgrade?.selectedPlanId).toBe('team')
    expect(upgrade.content().referenceUpgrade?.stepId).toBe('seats')
    expect(upgrade.content().referenceUpgrade?.total).toBe('$31,235')
    expect(upgrade.content().referenceUpgrade?.summaryRows).toBe(input.referenceUpgrade?.summaryRows)
  })

  test('shipping callbacks only answer the currently displayed question', () => {
    const { content } = setup(7)
    const oldFlow = content().referenceShipping
    oldFlow?.onOptionChange('regions', 'worldwide')
    oldFlow?.onQuestionChange('handoff')
    oldFlow?.onOptionChange('regions', 'domestic')
    expect(content().referenceShipping?.selectedOptionIds.regions).toBe('worldwide')
    content().referenceShipping?.onOptionChange('handoff', 'courier')
    content().referenceShipping?.onQuestionChange('regions')
    expect(content().referenceShipping?.selectedOptionIds).toEqual({
      volume: '100-1000',
      regions: 'worldwide',
      handoff: 'courier',
    })
  })

  test('invoice identity is unique across both field groups', () => {
    const invoice = input.referenceInvoice
    const customer = invoice?.customerFields[0]
    if (!invoice || !customer) throw new Error('Invoice fixture missing')
    const duplicateInput = {
      ...input,
      referenceInvoice: {
        ...invoice,
        termsFields: [{ ...customer, value: 'Duplicate customer' }, ...invoice.termsFields],
      },
    }
    const { scope } = setup(2)
    const store = createWizardPreviewStore(createWizardPreviewSeed(duplicateInput, scope))
    const projected = projectWizardPreview(duplicateInput, store).referenceInvoice
    projected?.onFieldChange(customer.id, 'Edited customer')
    const result = projectWizardPreview(duplicateInput, store).referenceInvoice
    expect(result?.customerFields.find((field) => field.id === customer.id)?.value).toBe('Edited customer')
    expect(result?.termsFields.some((field) => field.id === customer.id)).toBe(false)
  })

  test('non-Wizard wrappers pass children through without a Wizard owner', () => {
    const value = renderToStaticMarkup(
      createElement(WizardPreviewHost, {
        spec: getHbarAppUiVariant('kanban', 1).spec,
        content: input,
        children: createElement('p', {}, 'Outside Wizard'),
      }),
    )
    expect(value).toBe('<p>Outside Wizard</p>')
  })
})
