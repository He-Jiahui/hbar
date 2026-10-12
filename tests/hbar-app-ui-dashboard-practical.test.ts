import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenDashboard } from '@lumen/app-ui/catalog'
import { createDashboardPreviewStore } from '../apps/hbar-app-ui-preview/src/dashboardPreviewModel'
import { createDashboardPreviewReferenceContent } from '../apps/hbar-app-ui-preview/src/dashboardPreviewReferenceFixtures'
import {
  createDashboardPreviewSeed,
  projectDashboardPreview,
} from '../apps/hbar-app-ui-preview/src/dashboardPreviewProjection'

function setup(variant: number, mode = 'default') {
  const content = createDashboardPreviewReferenceContent(variant, mode)
  const seed = createDashboardPreviewSeed(content, variant, `dashboard-${variant}`, mode)
  const store = createDashboardPreviewStore(seed)
  const project = () => projectDashboardPreview(content, store)
  const render = () =>
    renderToStaticMarkup(
      createElement(LumenDashboard, { variant, variantId: `hbar-app-ui-dashboard-${variant}`, content: project() }),
    )
  return { content, seed, store, project, render }
}
test('fourteen dashboard compositions preserve actual information structures and records', () => {
  const kinds = [
    'revenue',
    'signups',
    'web-analytics',
    'status',
    'usage',
    'channels',
    'recurring',
    'modules',
    'delivery',
    'explorer',
    'coverage',
    'payout',
    'goals',
    'service',
  ] as const
  const outputs = kinds.map((kind, index) => {
    const owner = setup(index + 1)
    expect(owner.content.kind).toBe(kind)
    const output = owner.render()
    expect(output).toContain(`data-hbar-app-ui-component="hbar-app-ui-dashboard-${index + 1}"`)
    expect(output).not.toContain('Operations overview')
    return output
  })
  expect(new Set(outputs).size).toBe(14)
  expect(outputs[0]).toContain('$2.59M')
  expect(outputs[1]).toContain('Organic search')
  expect(outputs[2]).toContain('/docs/quickstart')
  expect(outputs[3]).toContain('Webhook delivery failures')
  expect(outputs[4]).toContain('1.24M / 2M')
  expect(outputs[5]).toContain('Conferences')
  expect(outputs[7]).toContain('Webhook Relay')
  expect(outputs[8]).toContain('Junia Alves')
  expect(outputs[9]).toContain('Knowledge index')
  expect(outputs[10]).toContain('Dominic Hale')
  expect(outputs[11]).toContain('MV-40784')
  expect(outputs[12]).toContain('Keep the editor fast under load')
  expect(outputs[13]).toContain('Write queue depth above threshold')
})
test('range and channel selections expose unobserved data honestly; compare owns only its display state', () => {
  const signups = setup(2)
  signups.project().reference?.onSelect('range', '7d')
  expect(signups.render()).toContain('This reference snapshot does not include data')
  signups.project().reference?.onSelect('range', '30d')
  expect(signups.render()).toContain('12,847')
  const channel = setup(6)
  channel.project().reference?.onFlag('compare', false)
  expect(channel.store.getState().flagsById.compare).toBe(false)
  expect(channel.render()).not.toContain('+7.4%')
})
test('recurring revenue has actual ready, loading and empty paths with safe recovery', () => {
  const owner = setup(7)
  owner.project().reference?.onSelect('state', 'loading')
  expect(owner.render()).toContain('Loading revenue')
  expect(owner.render()).not.toContain('$148.2K')
  owner.project().reference?.onSelect('state', 'empty')
  expect(owner.render()).toContain('No revenue data yet')
  owner.project().reference?.onSelect('state', 'ready')
  expect(owner.render()).toContain('$148.2K')
})
test('observed refresh and menu feedback changes local display without inventing business facts', () => {
  const status = setup(4)
  status.project().reference?.onRequest({ id: 'refresh', label: 'Refresh' })
  expect(status.render()).toContain('Updated just now')
  expect(status.render()).toContain('99.98%')
  const widget = setup(3)
  widget.project().reference?.onSelect('menu', 'sessions')
  expect(widget.render()).toContain('Refresh data')
  widget.project().reference?.onRequest({ id: 'hide-widget', label: 'Hide widget', value: 'sessions' })
  expect(widget.render()).not.toContain('Sessions, last 14 days')
  const board = setup(9)
  board.project().reference?.onSelect('week', 'previous')
  expect(board.render()).toContain('234h 30m logged · 77% client billable')
  expect(board.render()).toContain('Mon, Mar 9')
  expect(board.render()).toContain('111% of 32h')
})
test('module queries, actual column sorting, local stars and filters have scoped targets', () => {
  const owner = setup(8)
  const stale = owner.project().reference
  stale?.onQuery('console')
  const query = owner.project().reference
  expect(query?.kind).toBe('modules')
  if (query?.kind !== 'modules') throw new Error('wrong module projection')
  expect(query.table.rows.map(({ id }) => id)).toEqual(['api'])
  stale?.onRequest({ id: 'open-spec', label: 'Open docs', value: 'docs' })
  expect(owner.store.getState().lastRequest).toBeUndefined()
  query.onQuery('')
  owner.project().reference?.onSelect('sort', 'progress')
  let sorted = owner.project().reference
  if (sorted?.kind !== 'modules') throw new Error('wrong module projection')
  expect(sorted.table.rows[0]?.id).toBe('docs')
  sorted.onFlag('descending', true)
  sorted = owner.project().reference
  if (sorted?.kind !== 'modules') throw new Error('wrong module projection')
  expect(sorted.table.rows[0]?.id).toBe('api')
  sorted.onFlag('star-docs', true)
  expect(owner.store.getState().flagsById['star-docs']).toBe(true)
  sorted.onSelect('filter', 'Blocked')
  const filtered = owner.project().reference
  if (filtered?.kind !== 'modules') throw new Error('wrong module projection')
  expect(filtered.table.rows.map(({ id }) => id)).toEqual(['docs'])
})
test('board week, measure, objective and service selections preserve known facts', () => {
  const board = setup(9)
  board.project().reference?.onFlag('bookmark', true)
  expect(board.store.getState().flagsById.bookmark).toBe(true)
  board.project().reference?.onSelect('week', 'next')
  expect(board.render()).not.toContain('237h this week')
  const explorer = setup(10)
  explorer.project().reference?.onSelect('measure', 'duration')
  expect(explorer.render()).toContain('This reference snapshot does not include data')
  const goals = setup(13)
  goals.project().reference?.onSelect('objective', 'expansion')
  expect(goals.store.getState().selectedBySlot.objective).toBe('expansion')
  expect(goals.render()).not.toContain('Reach first saved project')
  const service = setup(14)
  service.project().reference?.onQuery('ledger')
  const projected = service.project().reference
  if (projected?.kind !== 'service') throw new Error('wrong service projection')
  expect(projected.services).toHaveLength(1)
  projected.onRequest({ id: 'rollback', label: 'Roll back', value: 'ledger' })
  expect(service.store.getState().lastRequest?.value).toBe('ledger')
  expect(service.render()).toContain('402ms')
  expect(service.render()).toContain('Degraded')
})
test('payout and workforce requests leave balances, queue counts and statuses unchanged', () => {
  const payout = setup(12)
  payout.project().reference?.onRequest({ id: 'split', label: 'Split' })
  expect(payout.render()).toContain('$505,870')
  expect(payout.render()).toContain('$49,300 still settling')
  const coverage = setup(11)
  coverage.project().reference?.onRequest({ id: 'queue-action', label: 'Review', value: 'swap' })
  expect(coverage.render()).toContain('0 of 7 cleared')
  expect(coverage.store.getState().lastRequest?.value).toBe('swap')
})
test('long host copy, empty/one/over-boundary collections and stale callbacks keep capacity ownership', () => {
  expect(setup(8, 'localized').render()).toContain('langfristigen Betriebsleistung')
  const empty = setup(8, 'empty')
  expect(empty.render()).toContain('No records match')
  expect(empty.store.getState().setFlag(empty.seed.ownerId, 'star-api', true)).toBe(false)
  const one = setup(8, 'one')
  const single = one.project().reference
  if (single?.kind !== 'modules') throw new Error('wrong module projection')
  expect(single.table.rows).toHaveLength(1)
  const overflow = setup(8, 'overflow')
  const growing = overflow.project().reference
  if (growing?.kind !== 'modules') throw new Error('wrong module projection')
  expect(growing.table.rows).toHaveLength(81)
  expect(growing.listStrategy).toEqual({ kind: 'pane-scroll', expectedMaximum: 80 })
  expect(overflow.render()).toContain('capacity-module-80')
})
