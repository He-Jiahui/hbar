import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiWizardProvider,
  selectHbarAppUiWizardItem,
  uniqueHbarAppUiWizardItems,
  type HbarAppUiWizardContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiWizardLocalizedFixtures,
  createHbarAppUiWizardOverflowFixtures,
  HBAR_APP_UI_WIZARD_FIXTURES,
} from './fixtures/hbar-app-ui-wizard-fixtures'

function render(variant: number, content: HbarAppUiWizardContent = HBAR_APP_UI_WIZARD_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiWizardProvider, {
      content,
      children: createElement(getHbarAppUiVariant('wizard', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui wizard surfaces', () => {
  test('renders seven distinct Lumen wizard workflows from host content', () => {
    const values = Array.from({ length: 7 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(7)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="wizard"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      if (index === 1) expect(value).toContain('lucide-arrow-right')
      else expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })
  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiWizardLocalizedFixtures())
    expect(value).toContain('你的信息')
    expect(value).toContain('陈玛拉')
    expect(value).not.toContain('Your information')
  })
  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiWizardItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiWizardItem(items, 'missing')).toBe(items[0])
  })
  test('honors empty wizard records and explicit capacity strategies', () => {
    const content: HbarAppUiWizardContent = {
      ...HBAR_APP_UI_WIZARD_FIXTURES,
      environment: { ...HBAR_APP_UI_WIZARD_FIXTURES.environment!, services: [] },
      migration: { ...HBAR_APP_UI_WIZARD_FIXTURES.migration!, items: [] },
    }
    expect(render(4, content)).toContain('No services available')
    expect(render(6, content)).toContain('No migration tasks')
    expect(render(3)).toContain('data-hbar-app-ui-list-strategy="content-grown"')
    expect(render(6)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })
  test('information wizard reproduces source fields, native choices and progress rail', () => {
    const flow = HBAR_APP_UI_WIZARD_FIXTURES.referenceInformation!
    const markup = render(1)
    expect(markup).toContain('hbar-app-ui-wizard-information-form')
    expect((markup.match(/class="hbar-app-ui-wizard-information-field"/g) ?? []).length).toBe(8)
    expect((markup.match(/<li>/g) ?? []).length).toBe(3)
    expect(markup).toContain(flow.labels.emailHint)
    expect(markup).toContain('kepler-works')
    expect(markup).toContain('<option value="Portugal"')
    expect(markup).toContain('disabled=""')
    const second = render(1, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceInformation: {...flow, stepId: 'payment'}})
    expect(second).toContain('is-complete')
    expect(second).toContain('Your information')
    expect(second).not.toContain('disabled=""')
    const last = render(1, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceInformation: {...flow, stepId: 'completed'}})
    expect((last.match(/is-complete/g) ?? []).length).toBe(2)
    expect(last).toContain('Next step')
  })
  test('information wizard localizes, deduplicates and handles empty/over-bound fields', () => {
    const localized = render(1, createHbarAppUiWizardLocalizedFixtures())
    expect(localized).toContain('你的信息')
    expect(localized).toContain('陈玛拉')
    expect(localized).not.toContain('Billing owner details')
    const flow = HBAR_APP_UI_WIZARD_FIXTURES.referenceInformation!
    const empty = render(1, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceInformation: {...flow, fields: []}})
    expect(empty).toContain(flow.labels.empty)
    const duplicate = render(1, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceInformation: {...flow, fields: [flow.fields[0]!, {...flow.fields[0]!, value: 'duplicate'}]}})
    expect((duplicate.match(/class="hbar-app-ui-wizard-information-field"/g) ?? []).length).toBe(1)
    expect(duplicate).not.toContain('duplicate')
    const over = render(1, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceInformation: {...flow, fields: Array.from({length: 40}, (_, index) => ({...flow.fields[0]!, id: `field-${index}`, label: `Review field ${index}`}))}})
    expect((over.match(/class="hbar-app-ui-wizard-information-field"/g) ?? []).length).toBe(40)
  })
  test('invoice wizard renders fixed chrome, two source groups and ten Host fields', () => {
    const flow = HBAR_APP_UI_WIZARD_FIXTURES.referenceInvoice!
    const markup = render(2)
    expect(markup).toContain('hbar-app-ui-wizard-invoice-header')
    expect(markup).toContain('role="progressbar"')
    expect(markup).toContain(flow.labels.customerGroupDetail)
    expect(markup).toContain(flow.labels.termsDetail)
    expect((markup.match(/class="hbar-app-ui-wizard-invoice-field"/g) ?? []).length).toBe(10)
    expect((markup.match(/<select /g) ?? []).length).toBe(3)
    expect(markup).toContain('aria-label="Clear customer"')
    expect(markup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(markup).toContain('Apr 24, 2026')
  })
  test('invoice wizard localizes and preserves empty/duplicate/over-bound data', () => {
    const localized = render(2, createHbarAppUiWizardLocalizedFixtures())
    expect(localized).toContain('发送发票')
    expect(localized).toContain('华港公司')
    expect(localized).not.toContain('Orchid Ledger Group')
    const flow = HBAR_APP_UI_WIZARD_FIXTURES.referenceInvoice!
    const empty = render(2, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceInvoice: {...flow, customerFields: [], termsFields: []}})
    expect(empty).not.toContain('hbar-app-ui-wizard-invoice-field"')
    const duplicate = render(2, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceInvoice: {...flow, customerFields: [flow.customerFields[0]!, {...flow.customerFields[0]!, value: 'duplicate'}]}})
    expect((duplicate.match(/class="hbar-app-ui-wizard-invoice-field"/g) ?? []).length).toBe(7)
    expect(duplicate).not.toContain('duplicate')
    const overflow = render(2, createHbarAppUiWizardOverflowFixtures())
    expect((overflow.match(/class="hbar-app-ui-wizard-invoice-field"/g) ?? []).length).toBe(50)
  })
})
