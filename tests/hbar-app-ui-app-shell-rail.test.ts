import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAppShell02, type LumenAppShellRailContent, stableLumenShellRailItems } from '@lumen/app-ui'
import { HBAR_APP_UI_APP_SHELL_FIXTURES } from './fixtures/hbar-app-ui-app-shell-fixtures'
import { appShellRailFixture } from './fixtures/hbar-app-ui-app-shell-rail-fixtures'
import {
  createAppShellRailPreviewStore,
  projectAppShellRailPreview,
} from '../apps/hbar-app-ui-preview/src/app-shell-rail-preview-model'
import { auditSamplingPlan } from '../scripts/reactbits-audit-sampling'

const render = (rail: LumenAppShellRailContent) =>
  renderToStaticMarkup(createElement(LumenAppShell02, { content: { ...HBAR_APP_UI_APP_SHELL_FIXTURES, rail } }))
test('rail shell has five areas, three nav groups, 11 native record actions and no fake record selection', () => {
  const content = appShellRailFixture(null)
  const html = render(content)
  expect(html).toContain('aria-label="Areas"')
  expect(html).toContain('aria-label="Marta Kowalczyk, dispatch manager"')
  expect(html).toContain('aria-haspopup="menu"')
  expect((html.match(/data-record-id=/g) ?? []).length).toBe(11)
  expect((html.match(/href="#shipments"/g) ?? []).length).toBe(18)
  expect(html).not.toContain('aria-pressed=')
  expect(html).not.toContain('Connected')
  expect(content.areas).toHaveLength(5)
  expect(content.areas.every((area) => area.records.length === 11 && area.sections.length === 3)).toBe(true)
  expect(
    content.areas.find((area) => area.id === 'dispatch')!.records.filter((row) => row.tone === 'warning'),
  ).toHaveLength(3)
  expect(
    content.areas.find((area) => area.id === 'fleet')!.records.filter((row) => row.tone === 'warning'),
  ).toHaveLength(2)
})
test('area replacement is atomic and workspace selection leaves area data intact', () => {
  const content = appShellRailFixture(null)
  const store = createAppShellRailPreviewStore()
  const start = projectAppShellRailPreview(store.getState(), content)
  start.onSelectArea('dispatch')
  const dispatch = projectAppShellRailPreview(store.getState(), content)
  expect(dispatch.selectedAreaId).toBe('dispatch')
  const html = render(dispatch)
  for (const text of ['Load board', 'Assign driver', 'Open loads', 'DX-8841', 'Driver roster'])
    expect(html).toContain(text)
  expect(html).not.toContain('KF-40218')
  dispatch.onSelectWorkspace('europe')
  const next = projectAppShellRailPreview(store.getState(), content)
  expect(next.selectedAreaId).toBe('dispatch')
  expect(next.selectedWorkspaceId).toBe('europe')
  expect(render(next)).toContain('Kestrel Freight Europe')
  expect(next.areas).toEqual(dispatch.areas)
})
test('callbacks retain their explicit area/record identity and source no-op actions do not mutate state', () => {
  const actions: string[] = []
  const content = appShellRailFixture(null, (action, value) => actions.push(`${action}:${value ?? ''}`))
  const store = createAppShellRailPreviewStore()
  const old = projectAppShellRailPreview(store.getState(), content)
  old.onSelectArea('fleet')
  old.onRecord('shipments', 'shipments-0')
  old.onPrimaryAction('shipments')
  old.onNavigate('shipments', 'shipments-0-1')
  old.onAccount()
  old.onAddWorkspace()
  expect(store.getState().areaId).toBe('fleet')
  expect(actions).toEqual([
    'area:fleet',
    'record:shipments:shipments-0',
    'primary:shipments',
    'navigate:shipments:shipments-0-1',
    'account:',
    'add-workspace:',
  ])
})
test('invalid IDs remain empty; stable duplicate IDs update values without adding rows', () => {
  const content = appShellRailFixture(null)
  const area = content.areas[0]!
  const updated = {
    ...area,
    title: 'Updated shipments',
    records: [area.records[0]!, { ...area.records[0]!, title: 'Updated record' }],
  }
  const html = render({ ...content, areas: [area, updated] })
  expect((html.match(/data-record-id=/g) ?? []).length).toBe(1)
  expect(html).toContain('Updated record')
  expect(html).toContain('Updated shipments')
  expect(stableLumenShellRailItems([area, updated, content.areas[1]!]).map((item) => item.id)).toEqual([
    'shipments',
    'dispatch',
  ])
  const stale = render({ ...content, selectedAreaId: 'removed', selectedWorkspaceId: 'removed' })
  expect(stale).toContain('No product areas available')
  expect(stale).toContain('No workspace selected')
  expect(stale).not.toContain('data-record-id=')
  const store = createAppShellRailPreviewStore()
  const projected = projectAppShellRailPreview(store.getState(), content)
  projected.onSelectArea('invalid')
  projected.onSelectWorkspace('invalid')
  expect(store.getState().areaId).toBe('shipments')
  expect(store.getState().workspaceId).toBe('kestrel')
})
test('empty, one, normal, boundary and one-over stay in explicit scroll owners', () => {
  const content = appShellRailFixture(null)
  const area = content.areas[0]!
  for (const count of [0, 1, 11, 100, 101]) {
    const html = render({
      ...content,
      areas: [
        { ...area, records: Array.from({ length: count }, (_, i) => ({ ...area.records[0]!, id: `record-${i}` })) },
      ],
    })
    expect((html.match(/data-record-id=/g) ?? []).length).toBe(count)
    expect(html).toContain('data-lumen-list-strategy="pane-scroll"')
    if (!count) expect(html).toContain('No records available')
  }
  for (const count of [0, 1, 18, 50, 51]) {
    const html = render({
      ...content,
      areas: [
        {
          ...area,
          sections: [
            {
              id: 'links',
              label: 'Links',
              links: Array.from({ length: count }, (_, i) => ({ id: `link-${i}`, label: `Link ${i}`, href: '#links' })),
            },
          ],
        },
      ],
    })
    expect((html.match(/href="#links"/g) ?? []).length).toBe(count)
  }
})
test('localized fixtures, separate instances and removed selections do not inherit another view state', () => {
  expect(render(appShellRailFixture('localized'))).toContain('Neue Sendung')
  expect(render(appShellRailFixture('localized'))).not.toContain('New shipment')
  expect(render(appShellRailFixture('empty-records'))).toContain('No records available')
  expect(render(appShellRailFixture('empty'))).toContain('No product areas available')
  const a = createAppShellRailPreviewStore(),
    b = createAppShellRailPreviewStore()
  const content = appShellRailFixture(null)
  projectAppShellRailPreview(a.getState(), content).onSelectArea('billing')
  expect(projectAppShellRailPreview(b.getState(), content).selectedAreaId).toBe('shipments')
  expect(projectAppShellRailPreview(a.getState(), { ...content, areas: [] }).selectedAreaId).toBeNull()
  expect(appShellRailFixture('overflow').areas[0]!.records).toHaveLength(101)
  expect(content.areas.find((area) => area.id === 'billing')!.recordsCount).toBe('119')
})
test('representative audit distinguishes changed areas from equivalent repeated row actions', () => {
  const plan = auditSamplingPlan('hbar-app-ui-app-shell-2')!
  expect(plan.samples).toHaveLength(13)
  expect(plan.inferences.every((entry) => entry.verification === 'inferred-not-replayed')).toBe(true)
  expect(plan.samples.some((entry) => entry.suffix === '42:click')).toBe(true)
})
