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
      if (index === 1 || index === 2) expect(value).toContain('lucide-arrow-right')
      else if (index === 3) expect(value).toContain('lucide-database')
      else if (index === 4) expect(value).toContain('lucide-pencil')
      else if (index === 5) expect(value).toContain('lucide-triangle-alert')
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
      referenceEnvironment: undefined,
      referenceMigration: undefined,
      environment: { ...HBAR_APP_UI_WIZARD_FIXTURES.environment!, services: [] },
      migration: { ...HBAR_APP_UI_WIZARD_FIXTURES.migration!, items: [] },
    }
    expect(render(4, content)).toContain('No services available')
    expect(render(6, content)).toContain('No migration tasks')
    expect(render(3)).toContain('data-hbar-app-ui-list-strategy="content-grown"')
    expect(render(6, {...content, migration: HBAR_APP_UI_WIZARD_FIXTURES.migration})).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
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
  test('upgrade wizard separates selected plan from passive invoice values', () => {
    const flow = HBAR_APP_UI_WIZARD_FIXTURES.referenceUpgrade!
    const markup = render(3)
    expect((markup.match(/<li>/g) ?? []).length).toBe(4)
    expect((markup.match(/role="radio"/g) ?? []).length).toBe(3)
    expect(markup).toContain('aria-checked="true"')
    expect(markup).toContain('Business · 42 seats · billed once')
    expect(markup).toContain('Term credit')
    expect(markup).toContain('PO-2026-184')
    const team = render(3, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceUpgrade: {...flow, selectedPlanId: 'team'}})
    expect(team).toContain('Business · 42 seats · billed once')
    expect(team).toContain('$31,235')
    const review = render(3, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceUpgrade: {...flow, stepId: 'review'}})
    expect((review.match(/is-complete/g) ?? []).length).toBe(3)
  })
  test('upgrade wizard localizes and bounds missing/duplicate/overflowing plans', () => {
    const localized = render(3, createHbarAppUiWizardLocalizedFixtures())
    expect(localized).toContain('账单升级')
    expect(localized).toContain('团队版')
    expect(localized).not.toContain('Billing upgrade')
    const flow = HBAR_APP_UI_WIZARD_FIXTURES.referenceUpgrade!
    const empty = render(3, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceUpgrade: {...flow, plans: [], summaryRows: [], metadataRows: []}})
    expect(empty).not.toContain('role="radio"')
    const duplicate = render(3, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceUpgrade: {...flow, plans: [flow.plans[0]!, {...flow.plans[0]!, label: 'duplicate'}]}})
    expect((duplicate.match(/role="radio"/g) ?? []).length).toBe(1)
    expect(duplicate).not.toContain('duplicate')
    const overflow = render(3, createHbarAppUiWizardOverflowFixtures())
    expect((overflow.match(/role="radio"/g) ?? []).length).toBe(33)
  })
  test('environment uses eight controlled services and all weighted summary subsets', () => {
    const flow = HBAR_APP_UI_WIZARD_FIXTURES.referenceEnvironment!
    const markup = render(4)
    expect((markup.match(/role="checkbox"/g) ?? []).length).toBe(8)
    expect(markup).toContain('3 of 8 selected')
    expect(markup).toContain('Adds about 24s to each deploy')
    expect(markup).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect((markup.match(/<li>/g) ?? []).length).toBe(4)
    expect((markup.match(/<button /g) ?? []).length).toBe(11)
    for (let bits = 0; bits < 256; bits++) {
      const selected = flow.services.filter((_, index) => (bits & (1 << index)) !== 0)
      const value = render(4, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceEnvironment: {...flow, selectedServiceIds: [...selected.map((service) => service.id), 'stale']}})
      expect(value).toContain(flow.labels.selection(selected.length, 8))
      expect(value).toContain(flow.labels.estimate(selected.reduce((total, service) => total + service.deploySeconds, 0)))
      expect((value.match(/aria-checked="true"/g) ?? []).length).toBe(selected.length)
      expect(value).not.toContain('disabled=""')
    }
  })
  test('environment localizes and preserves empty, duplicate and over-bound services', () => {
    const flow = HBAR_APP_UI_WIZARD_FIXTURES.referenceEnvironment!
    const localized = render(4, createHbarAppUiWizardLocalizedFixtures())
    expect(localized).toContain('新环境')
    expect(localized).toContain('托管数据库')
    expect(localized).not.toContain('New environment')
    const empty = render(4, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceEnvironment: {...flow, services: []}})
    expect(empty).toContain(flow.labels.empty)
    expect(empty).toContain('0 of 0 selected')
    expect(empty).toContain('Adds about 0s to each deploy')
    const duplicate = render(4, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceEnvironment: {...flow, services: [flow.services[0]!, {...flow.services[0]!, label: 'duplicate', deploySeconds: 99}]}})
    expect((duplicate.match(/role="checkbox"/g) ?? []).length).toBe(1)
    expect(duplicate).toContain('Adds about 12s to each deploy')
    expect(duplicate).not.toContain('duplicate')
    const invalid = render(4, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceEnvironment: {...flow, steps: [flow.steps[0]!, flow.steps[0]!], services: [{...flow.services[0]!, deploySeconds: Number.NaN}]}})
    expect((invalid.match(/<li>/g) ?? []).length).toBe(1)
    expect(invalid).toContain('Adds about 0s to each deploy')
    expect((render(4, createHbarAppUiWizardOverflowFixtures()).match(/role="checkbox"/g) ?? []).length).toBe(48)
  })
  test('review renders Host-owned groups and gates send on confirmation', () => {
    const flow = HBAR_APP_UI_WIZARD_FIXTURES.referenceReview!
    const markup = render(5)
    expect((markup.match(/<li>/g) ?? []).length).toBe(4)
    expect((markup.match(/class="hbar-app-ui-wizard-review-section"/g) ?? []).length).toBe(3)
    expect((markup.match(/<dt>/g) ?? []).length).toBe(9)
    expect(markup).toContain('Kepler Works &lt;news@kepler.works&gt;')
    expect(markup).toContain('aria-label="Edit Campaign details"')
    expect(markup).toContain('data-hbar-app-ui-list-strategy="content-grown"')
    expect(markup).toContain('role="checkbox" aria-checked="false"')
    expect(markup).toContain('disabled=""')
    const confirmed = render(5, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceReview: {...flow, confirmed: true}})
    expect(confirmed).toContain('role="checkbox" aria-checked="true"')
    expect(confirmed).not.toContain('disabled=""')
    expect(confirmed).not.toContain('Request sent')
  })
  test('review localizes and bounds empty, duplicate and over-capacity records', () => {
    const flow = HBAR_APP_UI_WIZARD_FIXTURES.referenceReview!
    const localized = render(5, createHbarAppUiWizardLocalizedFixtures())
    expect(localized).toContain('发送前审核')
    expect(localized).toContain('春季产品更新')
    expect(localized).not.toContain('Review before sending')
    const empty = render(5, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceReview: {...flow, sections: []}})
    expect(empty).toContain(flow.labels.empty)
    const duplicate = render(5, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceReview: {...flow, sections: [flow.sections[0]!, {...flow.sections[0]!, title: 'duplicate'}]}})
    expect((duplicate.match(/class="hbar-app-ui-wizard-review-section"/g) ?? []).length).toBe(1)
    expect(duplicate).not.toContain('duplicate')
    const repeatedRow = render(5, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceReview: {...flow, sections: [{...flow.sections[0]!, rows: [flow.sections[0]!.rows[0]!, {...flow.sections[0]!.rows[0]!, value: 'duplicate'}]}]}})
    expect((repeatedRow.match(/<dt>/g) ?? []).length).toBe(1)
    expect(repeatedRow).not.toContain('duplicate')
    expect((render(5, createHbarAppUiWizardOverflowFixtures()).match(/class="hbar-app-ui-wizard-review-section"/g) ?? []).length).toBe(28)
  })
  test('migration renders six source states and a bounded Host progress contract', () => {
    const flow = HBAR_APP_UI_WIZARD_FIXTURES.referenceMigration!
    const markup = render(6)
    expect((markup.match(/<li>/g) ?? []).length).toBe(6)
    expect((markup.match(/class="hbar-app-ui-wizard-migration-task-copy"/g) ?? []).length).toBe(6)
    expect((markup.match(/is-complete/g) ?? []).length).toBe(2)
    expect((markup.match(/is-queued/g) ?? []).length).toBe(2)
    expect(markup).toContain('role="progressbar" aria-label="Migration progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="64"')
    expect(markup).toContain('data-hbar-app-ui-list-strategy="content-grown"')
    expect(markup).toContain(flow.labels.safety)
    expect(markup).toContain('Review')
    const bounded = render(6, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceMigration: {...flow, progress: 120}})
    expect(bounded).toContain('aria-valuenow="100"')
    const invalid = render(6, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceMigration: {...flow, progress: Number.NaN}})
    expect(invalid).toContain('aria-valuenow="0"')
  })
  test('migration localizes and preserves empty, duplicate and over-bound tasks', () => {
    const flow = HBAR_APP_UI_WIZARD_FIXTURES.referenceMigration!
    const localized = render(6, createHbarAppUiWizardLocalizedFixtures())
    expect(localized).toContain('迁移工作区')
    expect(localized).toContain('备份源数据库')
    expect(localized).not.toContain('Migrating workspace')
    const empty = render(6, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceMigration: {...flow, tasks: []}})
    expect(empty).toContain(flow.labels.empty)
    const duplicate = render(6, {...HBAR_APP_UI_WIZARD_FIXTURES, referenceMigration: {...flow, tasks: [flow.tasks[0]!, {...flow.tasks[0]!, label: 'duplicate'}]}})
    expect((duplicate.match(/<li>/g) ?? []).length).toBe(1)
    expect(duplicate).not.toContain('duplicate')
    expect((render(6, createHbarAppUiWizardOverflowFixtures()).match(/<li>/g) ?? []).length).toBe(41)
  })
})
