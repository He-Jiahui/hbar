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
    expect(render(7)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
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

  test('alert drawer preserves the source form hierarchy, switch role and host-owned guard copy', () => {
    const value = render(5)
    expect(value).toContain('hbar-app-ui-full-canvas-owner')
    expect(value).toContain('role="banner"')
    expect(value).toContain('role="contentinfo"')
    expect(value).toContain('aria-label="Close drawer"')
    expect(value).toContain('role="switch"')
    expect(value).toContain('aria-checked="true"')
    expect(value).toContain('value="Slack" selected=""')
    expect(value.indexOf('Rule name')).toBeLessThan(value.indexOf('Deliver to'))
    expect(value.indexOf('Deliver to')).toBeLessThan(value.indexOf('Trigger threshold'))
    expect(value.indexOf('Trigger threshold')).toBeLessThan(value.indexOf('Note'))
    const localized = render(5, createHbarAppUiAppDialogLocalizedFixtures())
    expect(localized).toContain('跨区域生产环境错误率持续上升的告警规则')
    expect(localized).toContain('关闭抽屉')
    expect(localized).not.toContain('Edit alert rule')
  })

  test('alert channels are host-owned and retain legacy rendering at capacity boundaries', () => {
    const alert = HBAR_APP_UI_APP_DIALOG_FIXTURES.alert!
    expect(render(5, { alert: { ...alert, reference: undefined } })).toContain('lumen-app-dialog-readonly')
    for (const count of [0, 1, 16, 17]) {
      const channels = Array.from({ length: count }, (_, index) => ({ id: `channel-${index}`, label: `Channel ${index}` }))
      const content = { alert: { ...alert, channels: [...channels, ...channels.slice(0, 1)], initialChannelId: 'stale' } }
      expect(uniqueHbarAppUiAppDialogItems(content.alert.channels)).toHaveLength(count)
      expect(selectHbarAppUiAppDialogItem(content.alert.channels, 'stale')?.id).toBe(channels[0]?.id)
      expect(render(5, content)).toContain('data-hbar-app-ui-component="hbar-app-ui-app-dialog-5"')
    }
    expect(appDialogFixture('alert-empty').alert!.channels).toHaveLength(0)
    expect(appDialogFixture('alert-overflow').alert!.channels).toHaveLength(17)
  })

  test('alert sampling replays distinct feedback and honestly infers equivalent gestures', () => {
    const plan = auditSamplingPlan('hbar-app-ui-app-dialog-5')!
    expect(plan.samples.map((sample) => sample.suffix)).toEqual([
      '2:select', '3:fill', '4:fill', '5:click', '5:press-space', '6:click',
      'dialog-alert-dirty:1:click', 'dialog-alert-guard:8:click',
      'dialog-alert-guard:9:click', 'dialog-alert-dirty:7:click',
      'dialog-alert-closed:0:click',
    ])
    expect(plan.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
  })

  test('evidence sheet preserves reference landmarks, metadata, lists and host-owned inline text', () => {
    const value = render(6)
    expect(value).toContain('hbar-app-ui-full-canvas-owner')
    expect(value).toContain('role="banner"')
    expect(value).toContain('role="contentinfo"')
    expect(value).toContain('aria-label="Close panel"')
    expect(value).toContain('<dl class="lumen-app-dialog-evidence-details">')
    expect(value).toContain('<h3>Controls covered</h3>')
    expect(value).toContain('<h3>History</h3>')
    expect(value).toContain('data-hbar-app-ui-scroll-owner="pane-scroll"')
    expect(value.indexOf('Current')).toBeLessThan(value.indexOf('Independent audit'))
    expect(value.indexOf('Retention')).toBeLessThan(value.indexOf('Controls covered'))
    expect(value.indexOf('Controls covered')).toBeLessThan(value.indexOf('History'))
    const localized = render(6, createHbarAppUiAppDialogLocalizedFixtures())
    expect(localized).toContain('跨部门年度安全审计内容')
    expect(localized).toContain('关闭详情侧栏')
    expect(localized).not.toContain('SOC 2 Type II report')
  })

  test('evidence records remain host-owned with explicit zero, one, capacity and overflow behavior', () => {
    const evidence = HBAR_APP_UI_APP_DIALOG_FIXTURES.evidence!
    expect(render(6, { evidence: { ...evidence, referenceLayout: undefined } })).toContain('lumen-app-dialog-details')
    for (const count of [0, 1, 80, 81]) {
      const details = Array.from({ length: count }, (_, index) => ({ id: `detail-${index}`, label: `Property ${index}`, value: `Value ${index}` }))
      const content = { evidence: { ...evidence, details: [...details, ...details.slice(0, 1)] } }
      expect(uniqueHbarAppUiAppDialogItems(content.evidence.details)).toHaveLength(count)
      expect(render(6, content)).toContain('data-hbar-app-ui-component="hbar-app-ui-app-dialog-6"')
    }
    const empty = render(6, appDialogFixture('evidence-empty'))
    expect(empty).toContain('No evidence details')
    expect(empty).toContain('No controls')
    expect(empty).toContain('No history')
    expect(appDialogFixture('evidence-overflow').evidence!.details).toHaveLength(81)
  })

  test('evidence sampling replays scroll and two independent result mechanisms without passive-row clicks', () => {
    const plan = auditSamplingPlan('hbar-app-ui-app-dialog-6')!
    expect(plan.samples.map((sample) => sample.suffix)).toEqual([
      '2:click', '3:click', 'evidence-body:scroll:end', '2:press-space',
      '1:click', 'dialog-evidence-closed:0:click',
    ])
    expect(plan.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
  })

  test('report actions preserve the reference dialog/menu hierarchy and host-owned submenu options', () => {
    const value = render(7)
    expect(value).toContain('hbar-app-ui-full-canvas-owner')
    expect(value).toContain('aria-haspopup="dialog" aria-expanded="true"')
    expect(value).toContain('role="dialog"')
    expect(value).toContain('role="menu"')
    expect(value).toContain('role="separator"')
    expect(value).toContain('aria-haspopup="menu" aria-expanded="false"')
    expect(value.indexOf('Rename report')).toBeLessThan(value.indexOf('Export as'))
    expect(value.indexOf('Export as')).toBeLessThan(value.indexOf('Delete report'))
    const localized = render(7, createHbarAppUiAppDialogLocalizedFixtures())
    expect(localized).toContain('重命名年度安全审计报告并更新索引')
    expect(localized).toContain('报告操作菜单')
    expect(localized).not.toContain('Rename report')
  })

  test('report actions keep legacy rendering and explicit empty, one, capacity and overflow records', () => {
    const menu = HBAR_APP_UI_APP_DIALOG_FIXTURES.menu!
    expect(render(7, { menu: { ...menu, referenceLayout: undefined } })).toContain('lumen-app-dialog-menu-stage')
    for (const count of [0, 1, 16, 17]) {
      const items = Array.from({ length: count }, (_, index) => ({ id: `item-${index}`, label: `Action ${index}` }))
      const content = { menu: { ...menu, items: [...items, ...items.slice(0, 1)] } }
      expect(uniqueHbarAppUiAppDialogItems(content.menu.items)).toHaveLength(count)
      expect(render(7, content)).toContain('data-hbar-app-ui-component="hbar-app-ui-app-dialog-7"')
    }
    expect(render(7, appDialogFixture('menu-empty'))).toContain('No actions')
    expect(appDialogFixture('menu-overflow').menu!.items).toHaveLength(17)
    for (const [fixture, count] of [
      ['menu-no-export', 0], ['menu-one-export', 1],
      ['menu-export-capacity', 8], ['menu-export-overflow', 9],
    ] as const) {
      const options = appDialogFixture(fixture).menu!.referenceLayout!.exportOptions
      expect(options).toHaveLength(count)
      expect(uniqueHbarAppUiAppDialogItems(options)).toHaveLength(count)
    }
  })

  test('report action sampling separates selection, submenu, keyboard dismissal and reopening', () => {
    const plan = auditSamplingPlan('hbar-app-ui-app-dialog-7')!
    expect(plan.samples.map((sample) => sample.suffix)).toEqual([
      '1:click', '3:hover', 'dialog-menu-export:4:click', 'dialog-menu-delete-keyboard:6:press-space',
      '1:menu-escape', 'dialog-menu-closed:0:click',
    ])
    expect(plan.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
  })
})
