import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenDataTable, type LumenDataTableContent } from '@lumen/app-ui/catalog'
import { createDataTablePreviewReferenceContent } from '../apps/hbar-app-ui-preview/src/dataTablePreviewReferenceFixtures'
import { createTablePreviewStore } from '../apps/hbar-app-ui-preview/src/dataTablePreviewModel'
import { createTablePreviewSeed, projectTablePreview } from '../apps/hbar-app-ui-preview/src/dataTablePreviewProjection'

function owner(
  variant: number,
  mode = 'default',
  content = createDataTablePreviewReferenceContent(variant, mode),
  ownerId = 'table-a',
) {
  const store = createTablePreviewStore(createTablePreviewSeed(content, variant, ownerId, mode))
  const events: { readonly actionId: string; readonly value?: string | undefined }[] = []
  const project = () => projectTablePreview(content, store, (event) => events.push(event))
  const html = () =>
    renderToStaticMarkup(
      createElement(LumenDataTable, { variant, variantId: `hbar-app-ui-data-table-${variant}`, content: project() }),
    )
  return { store, project, html, content, events }
}
test('eight table compositions retain their actual columns, records and default states', () => {
  const values = Array.from({ length: 8 }, (_, index) => owner(index + 1))
  expect(values.map((value) => value.content.reference?.kind)).toEqual([
    'accounts',
    'payments',
    'budget',
    'checks',
    'dispatch',
    'shipments',
    'sources',
    'capacity',
  ])
  expect(new Set(values.map((value) => value.html())).size).toBe(8)
  expect(values[0]?.html()).toContain('Customer accounts')
  expect(values[0]?.html()).toContain('Longleaf Clinical Research Network International')
  expect(values[0]?.html()).not.toContain('Project Atlas')
  expect(values[1]?.html()).toContain('2 selected')
  expect(values[1]?.html()).toContain('$16,300')
  expect(values[2]?.html()).toContain('$48,985')
  expect(values[3]?.html()).toContain('ledger.carrier_claims')
  expect(values[4]?.html()).toContain('ORD-4430')
  expect(values[5]?.html()).toContain('Crossline Freight')
  expect(values[6]?.html().match(/lumen-data-table-reference-skeleton/g)).toHaveLength(11)
  expect(values[7]?.html()).toContain('Long Beach Import Annex With Extended Customs Queue')
})
test('accounts filter, sort, columns and no-match recovery update actual content', () => {
  const value = owner(1)
  const initial = value.project().reference
  if (initial?.kind !== 'accounts') throw new Error('Expected accounts')
  initial.onFilter?.('scale')
  expect(value.store.getState().visibleRowIds).toHaveLength(3)
  value.project().reference?.kind === 'accounts' && initial.onSort?.('mrr')
  expect(value.store.getState().visibleRowIds[0]).toBe('kite')
  initial.onColumn?.('region', false)
  expect(value.html()).not.toContain('scope="col">Region')
  initial.onQuery?.('not a matching account')
  expect(value.html()).toContain('No matching accounts')
  initial.onClearFilters?.()
  expect(value.store.getState().visibleRowIds).toHaveLength(10)
  expect(value.store.getState().flagsById['column:region']).toBe(false)
})
test('payments own selection sum and pagination; Hold does not mutate payment facts', () => {
  const value = owner(2)
  const initial = value.project().reference
  if (initial?.kind !== 'payments') throw new Error('Expected payments')
  initial.onSelectPage?.(true)
  expect(value.html()).toContain('10 selected')
  expect(value.html()).toContain('$91,780')
  initial.onClear?.()
  initial.onSelect?.('PAY-0183', true)
  value.project().onAction?.({ actionId: 'hold' })
  expect(value.events.at(-1)).toEqual({ actionId: 'hold', value: '["PAY-0183"]' })
  expect(value.html()).toContain('1 selected')
  expect(value.html()).toContain('Scheduled')
  initial.onPage?.(2)
  expect(value.html()).toContain('11–20 of 28')
  expect(value.html()).toContain('No preview records available for this page.')
  initial.onSelect?.('PAY-0182', true)
  expect(value.store.getState().flagsById['select:PAY-0182']).toBe(false)
})
test('budget numeric edits update local totals, invalid input recovers and locked cells remain guarded', () => {
  const value = owner(3)
  const initial = value.project().reference
  if (initial?.kind !== 'budget') throw new Error('Expected budget')
  initial.onBeginEdit?.('warehouse', 'hours')
  initial.onDraft?.('-1')
  initial.onCommit?.()
  expect(value.html()).toContain('Enter a valid non-negative number.')
  expect(value.html()).toContain('$48,985')
  initial.onDraft?.('40')
  initial.onCommit?.()
  expect(value.html()).toContain('$5,800')
  expect(value.html()).toContain('$49,275')
  initial.onBeginEdit?.('packet', 'hours')
  expect(value.store.getState().editDraft).toBeUndefined()
  initial.onBeginEdit?.('warehouse', 'rate')
  initial.onDraft?.('500')
  initial.onCancel?.()
  expect(value.html()).toContain('$49,275')
  expect(value.store.getState().lastRequest).toBeUndefined()
})
test('checks, density and shipment projections isolate local state and request only external actions', () => {
  const checks = owner(4)
  const reference = checks.project().reference
  if (reference?.kind !== 'checks') throw new Error('Expected checks')
  reference.onExpand?.('RUN-8041', false)
  expect(checks.html()).not.toContain('Matched carrier claims')
  reference.onQuery?.('invoice')
  expect(checks.store.getState().visibleRowIds).toEqual(['RUN-8044'])
  reference.onExpand?.('RUN-8041', true)
  expect(checks.store.getState().flagsById['expand:RUN-8041']).toBe(false)
  const dispatch = owner(5)
  const groups = dispatch.project().reference
  if (groups?.kind !== 'dispatch') throw new Error('Expected dispatch')
  groups.onDensity?.('compact')
  expect(dispatch.html()).toContain('data-density="compact"')
  const shipment = owner(6)
  const shipments = shipment.project().reference
  if (shipments?.kind !== 'shipments') throw new Error('Expected shipments')
  shipments.onSelect?.('meridian')
  expect(shipment.html()).toContain('No preview detail available for this shipment.')
  shipment.project().onAction?.({ actionId: 'deliver', value: 'SHP-9284' })
  expect(shipment.store.getState().lastRequest).toBeUndefined()
  shipment.project().onAction?.({ actionId: 'message', value: 'meridian' })
  expect(shipment.html()).toContain('no external action was performed')
})
test('source states and capacity sorting support empty/one/boundary and long host copy without invented records', () => {
  const sources = owner(7)
  const reference = sources.project().reference
  if (reference?.kind !== 'sources') throw new Error('Expected sources')
  reference.onState?.('error')
  sources.project().onAction?.({ actionId: 'retry' })
  expect(sources.html()).toContain('Could not load sources')
  expect(sources.store.getState().lastRequest?.actionId).toBe('retry')
  const capacity = owner(8)
  const table = capacity.project().reference
  if (table?.kind !== 'capacity') throw new Error('Expected capacity')
  table.onSort?.('peak')
  expect(capacity.store.getState().visibleRowIds[0]).toBe('phoenix')
  const empty: LumenDataTableContent = { ...capacity.content, reference: { ...table, rows: [], total: 0 } }
  expect(owner(8, 'default', empty).html()).toContain('No matching records')
  expect(
    owner(8, 'default', { ...empty, reference: { ...table, rows: table.rows.slice(0, 1), total: 1 } }).html(),
  ).toContain('Long Beach')
  expect(owner(8, 'overflow').html()).toContain('Distribution site 80')
  expect(owner(1, 'localized').html()).toContain('Kundenkonten und gemeinsame Unternehmensbeziehungen')
})
