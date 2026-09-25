import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'
import {
  getHbarAppUiVariant,
  HbarAppUiAppDialogProvider,
  selectHbarAppUiAppDialogItem,
  uniqueHbarAppUiAppDialogItems,
  type HbarAppUiAppDialogContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiAppDialogLocalizedFixtures,
  HBAR_APP_UI_APP_DIALOG_FIXTURES,
} from './fixtures/hbar-app-ui-app-dialog-fixtures'

function render(variant: number, content: HbarAppUiAppDialogContent = HBAR_APP_UI_APP_DIALOG_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiAppDialogProvider, {
      content,
      children: createElement(getHbarAppUiVariant('app-dialog', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui app dialog surfaces', () => {
  test('renders seven distinct Lumen dialog workflows from host content', () => {
    const values = Array.from({ length: 7 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(7)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="app-dialog"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiAppDialogLocalizedFixtures())
    expect(value).toContain('应用方案变更')
    expect(value).toContain('规模版')
    expect(value).not.toContain('Apply plan change')
  })

  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiAppDialogItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiAppDialogItem(items, 'missing')).toBe(items[0])
  })

  test('honors empty dialog records and explicit capacity strategies', () => {
    const content: HbarAppUiAppDialogContent = {
      ...HBAR_APP_UI_APP_DIALOG_FIXTURES,
      plan: { ...HBAR_APP_UI_APP_DIALOG_FIXTURES.plan!, rows: [] },
      menu: { ...HBAR_APP_UI_APP_DIALOG_FIXTURES.menu!, items: [] },
    }
    expect(render(1, content)).toContain('No plan changes')
    expect(render(7, content)).toContain('No actions')
    expect(render(1)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(render(7)).toContain('data-hbar-app-ui-list-strategy="content-grown"')
  })

  test('plan comparison keeps source landmarks, row semantics and host-owned arrow', () => {
    const value = render(1)
    expect(value).toContain('role="dialog"')
    expect(value).toContain('role="banner"')
    expect(value).toContain('role="contentinfo"')
    expect(value).toContain('aria-label="Close dialog"')
    expect(value).toContain('hbar-app-ui-full-canvas-owner')
    expect(value).toContain('<span>→</span>')
    expect(value.match(/<dt>/g)).toHaveLength(5)
  })

  test('plan data deduplicates and stays host-owned at zero, one, 64 and 65 rows', () => {
    const original = HBAR_APP_UI_APP_DIALOG_FIXTURES.plan!
    for (const count of [0, 1, 64, 65]) {
      const rows = Array.from({ length: count }, (_, index) => ({
        id: `row-${index}`,
        label: `Field ${index}`,
        from: `Previous ${index}`,
        to: `Current ${index}`,
      }))
      const value = render(1, { plan: { ...original, rows: [...rows, ...rows.slice(0, 1)] } })
      expect(value.match(/<dt>/g)?.length ?? 0).toBe(count)
      if (count) expect(value).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
      else expect(value).toContain(original.labels.empty)
    }
  })

  test('audit samples distinct plan-dialog feedback without clicking passive rows', () => {
    const plan = auditSamplingPlan('hbar-app-ui-app-dialog-1')!
    expect(plan.samples.map((sample) => sample.suffix)).toEqual([
      '1:click', '2:press-space', '3:click', 'dialog-plan-closed:0:click',
    ])
    expect(plan.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
  })

  test('destructive confirmation keeps source landmarks and the exact target label', () => {
    const value = render(2)
    expect(value).toContain('role="dialog"')
    expect(value).toContain('role="banner"')
    expect(value).toContain('role="contentinfo"')
    expect(value).toContain('aria-label="Close dialog"')
    expect(value).toContain('hbar-app-ui-full-canvas-owner')
    expect(value).toContain('Type <span class="lumen-delete-project-name">atlas-production</span> to confirm')
    expect(value).toContain('disabled=""')
    expect(value.match(/<dd>/g)).toHaveLength(4)
    expect(render(2, createHbarAppUiAppDialogLocalizedFixtures())).toContain('输入 <span class="lumen-delete-project-name">生产项目</span> 确认')
    const legacy = HBAR_APP_UI_APP_DIALOG_FIXTURES.deleteProject!
    expect(render(2, {
      deleteProject: {
        ...legacy,
        labels: {
          ...legacy.labels,
          confirmationBefore: undefined,
          confirmationAfter: undefined,
          successTitle: undefined,
          successDetail: undefined,
        },
      },
    })).toContain('Type atlas-production to confirm')
  })

  test('destructive metrics are host supplied and pane owned at capacity boundaries', () => {
    const original = HBAR_APP_UI_APP_DIALOG_FIXTURES.deleteProject!
    for (const count of [0, 1, 80, 81]) {
      const metrics = Array.from({ length: count }, (_, index) => ({
        id: `metric-${index}`, label: `Metric ${index}`, value: String(index),
      }))
      const value = render(2, { deleteProject: { ...original, metrics: [...metrics, ...metrics.slice(0, 1)] } })
      expect(value.match(/<dd>/g)?.length ?? 0).toBe(count)
      expect(value).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
      if (!count) expect(value).toContain(original.labels.empty)
    }
  })

  test('delete dialog sampling exercises invalid, valid, confirm and dismissal mechanisms', () => {
    const plan = auditSamplingPlan('hbar-app-ui-app-dialog-2')!
    expect(plan.samples.map((sample) => sample.suffix)).toEqual([
      '2:fill', '2:fill-valid', 'dialog-delete-valid:4:click',
      '3:click', '1:press-space', 'dialog-delete-closed:0:click',
    ])
    expect(plan.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
  })
})
