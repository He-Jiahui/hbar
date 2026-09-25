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
  appDialogFixture,
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

  test('invite form preserves the source landmarks, labels, role options and host-owned feedback', () => {
    const value = render(3)
    expect(value).toContain('hbar-app-ui-full-canvas-owner')
    expect(value).toContain('role="banner"')
    expect(value).toContain('role="contentinfo"')
    expect(value).toContain('<form id="hbar-app-ui-app-dialog-3-form"')
    expect(value).toContain('type="submit"')
    expect(value).toContain('form="hbar-app-ui-app-dialog-3-form"')
    expect(value).toContain('aria-describedby="hbar-app-ui-app-dialog-3-email-help"')
    expect(value.match(/<option/g)).toHaveLength(4)
    expect(value).not.toContain('Enter the member&#x27;s name.')
    expect(value).not.toContain('Invite sent')
    const localized = render(3, createHbarAppUiAppDialogLocalizedFixtures())
    expect(localized).toContain('邀请成员加入工作区')
    expect(localized).toContain('发送邀请')
    expect(localized).not.toContain('Invite a member')
  })

  test('invite options stay host owned and recover missing or duplicate IDs', () => {
    const original = HBAR_APP_UI_APP_DIALOG_FIXTURES.invite!
    for (const count of [0, 1, 16, 17]) {
      const roles = Array.from({ length: count }, (_, index) => ({ id: `role-${index}`, label: `Role ${index}` }))
      const html = render(3, { invite: { ...original, roles: [...roles, ...roles.slice(0, 1)], initialRoleId: 'stale' } })
      expect(html.match(/<option/g)?.length ?? 0).toBe(count)
      if (count) expect(html).toContain('value="role-0" selected=""')
    }
  })

  test('invite sampling covers distinct validation, selection and dismissal feedback', () => {
    const plan = auditSamplingPlan('hbar-app-ui-app-dialog-3')!
    expect(plan.samples.map((sample) => sample.suffix)).toEqual([
      '6:click', 'dialog-invite-empty:2:fill', '4:select', 'dialog-invite-invalid:3:fill',
      'dialog-invite-valid:6:click', '5:click', '1:press-space', 'dialog-invite-closed:0:click',
    ])
    expect(plan.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
  })

  test('workspace wizard preserves the source header order, form and inline URL flow', () => {
    const value = render(4)
    expect(value).toContain('hbar-app-ui-full-canvas-owner')
    expect(value).toContain('role="banner"')
    expect(value).toContain('role="contentinfo"')
    expect(value.indexOf('Step 1 of 3')).toBeLessThan(value.indexOf('Workspace</h2>'))
    expect(value).toContain('placeholder="Acme"')
    expect(value).toContain('northwind.app/</span><span class="lumen-app-dialog-wizard-slug">northwind</span>')
    expect(value.match(/data-active="true"/g)).toHaveLength(1)
    const localized = render(4, createHbarAppUiAppDialogLocalizedFixtures())
    expect(localized).toContain('跨区域协作工作区')
    expect(localized).toContain('第 1 步，共 3 步')
    expect(localized).not.toContain('Step 1 of 3')
  })

  test('workspace wizard keeps the prior host contract valid while typed regions cover capacity boundaries', () => {
    const wizard = HBAR_APP_UI_APP_DIALOG_FIXTURES.wizard!
    const legacy = render(4, { wizard: { ...wizard, reference: undefined } })
    expect(legacy).toContain('lumen-app-dialog-readonly')
    for (const count of [0, 1, 16, 17]) {
      const regions = Array.from({ length: count }, (_, index) => ({ id: `region-${index}`, label: `Region ${index}` }))
      const content = { wizard: { ...wizard, reference: { ...wizard.reference!, regions: [...regions, ...regions.slice(0, 1)], initialRegionId: 'stale' } } }
      expect(uniqueHbarAppUiAppDialogItems(content.wizard.reference.regions)).toHaveLength(count)
      if (count) expect(selectHbarAppUiAppDialogItem(content.wizard.reference.regions, 'stale')?.id).toBe('region-0')
      expect(render(4, content)).toContain('data-hbar-app-ui-component="hbar-app-ui-app-dialog-4"')
    }
    expect(appDialogFixture('wizard-empty').wizard!.reference!.regions).toHaveLength(0)
    expect(appDialogFixture('wizard-overflow').wizard!.reference!.regions).toHaveLength(17)
    expect(wizard.reference!.slugForName('  Acme Ops  ')).toBe('acme-ops')
    expect(wizard.reference!.slugForName('')).toBe('workspace')
  })

  test('wizard sampling distinguishes step transitions and edits without repeating every region or gesture', () => {
    const plan = auditSamplingPlan('hbar-app-ui-app-dialog-4')!
    expect(plan.samples.map((sample) => sample.suffix)).toEqual([
      '2:fill', '4:click', 'dialog-wizard-region:3:click',
      'dialog-wizard-region-selected:7:click', 'dialog-wizard-team:2:fill',
      'dialog-wizard-team-custom:4:click', 'dialog-wizard-team:3:click',
      'dialog-wizard-region:6:click', '3:click', 'dialog-wizard-region:1:press-space',
      'dialog-wizard-closed:0:click',
    ])
    expect(plan.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
  })
})
