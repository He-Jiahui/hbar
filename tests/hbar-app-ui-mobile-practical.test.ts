import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenMobile, type LumenMobileContent } from '@lumen/app-ui/catalog'
import {
  createMobilePreviewContent,
  createMobilePreviewSeed,
  mobileRequestNotice,
} from '../apps/hbar-app-ui-preview/src/mobilePreviewFixtures'
import { createMobilePreviewStore } from '../apps/hbar-app-ui-preview/src/mobilePreviewModel'
import { projectMobilePreview } from '../apps/hbar-app-ui-preview/src/mobilePreviewProjection'
import {
  HBAR_APP_UI_MOBILE_FIXTURES,
  createHbarAppUiMobileLocalizedFixtures,
  createHbarAppUiMobileOverflowFixtures,
} from './fixtures/hbar-app-ui-mobile-fixtures'

function owner(variant: number, base = HBAR_APP_UI_MOBILE_FIXTURES, ownerId = 'mobile-a', localized = false) {
  const fixture = createMobilePreviewContent(base, variant, localized)
  const store = createMobilePreviewStore(createMobilePreviewSeed(fixture, variant, ownerId, 'default'))
  const events: { readonly actionId: string; readonly value?: string | undefined }[] = []
  const projection = () =>
    projectMobilePreview(fixture, store.getState(), store, mobileRequestNotice(localized), (event) =>
      events.push(event),
    )
  const html = () =>
    renderToStaticMarkup(
      createElement(LumenMobile, { variant, variantId: `hbar-app-ui-mobile-${variant}`, content: projection() }),
    )
  return { fixture, store, projection, events, html }
}

test('active mobile fixtures match observed row counts and preserve noninteractive Home cards', () => {
  const values = Array.from({ length: 5 }, (_, index) => owner(index + 1))
  expect(values[0]?.fixture.activity?.items).toHaveLength(7)
  expect(values[1]?.fixture.tasks?.tasks).toHaveLength(7)
  expect(values[2]?.fixture.home?.cards).toHaveLength(5)
  expect(values[3]?.fixture.orders?.orders).toHaveLength(6)
  expect(values[4]?.fixture.runs?.runs.filter((run) => run.stateId === 'running')).toHaveLength(8)
  expect(values[4]?.fixture.runs?.runs.filter((run) => run.stateId === 'queue')).toHaveLength(3)
  expect(values.map((value) => Object.keys(value.fixture))).toEqual([
    ['activity'],
    ['tasks'],
    ['home'],
    ['orders'],
    ['runs'],
  ])
  expect(values[2]?.html()).toContain('class="lumen-mobile-card"')
  expect(values[2]?.html()).not.toContain('aria-label="Open Alder Group signed the pilot"')
  expect(values[2]?.html()).toContain('lumen-mobile-icon-lg')
})

test('Mobile1 switches to the observed recent-search page and rejects hidden row intents', () => {
  const value = owner(1)
  const old = value.projection()
  old.activity?.selection?.onChange('search')
  const html = value.html()
  expect(html).toContain('Recent searches')
  expect(html).toContain('invoices status:overdue')
  expect(html).not.toContain('Northwind renewed for 12 months')
  old.onAction?.({ actionId: 'open', value: 'northwind' })
  expect(value.store.getState().lastRequest).toBeUndefined()
  value.projection().onAction?.({ actionId: 'open', value: 'overdue-search' })
  expect(value.store.getState().lastRequest).toMatchObject({ actionId: 'open', value: 'overdue-search' })
  value.projection().activity?.filter?.onChange(true)
  expect(value.projection().activity?.filter?.value).toBe(false)
  expect(value.html()).toContain('Recent searches')
})

test('quick actions and destination/navigation intents use exact host targets without generating records', () => {
  const tasks = owner(2)
  expect(tasks.fixture.tasks?.quickActions?.items.map((item) => item.label)).toEqual([
    'New task',
    'Voice note',
    'Photo',
    'Attach file',
  ])
  const before = tasks.store.getState().tasks
  tasks.projection().onAction?.({ actionId: 'quick-action', value: 'new-task' })
  tasks.projection().onAction?.({ actionId: 'quick-action', value: 'new-task' })
  expect(tasks.events).toEqual([{ actionId: 'quick-action', value: 'new-task' }])
  expect(tasks.store.getState().tasks).toBe(before)
  expect(tasks.html()).toContain('no external action was performed')
  const orders = owner(4)
  expect(orders.fixture.orders?.more?.items).toHaveLength(4)
  expect(orders.fixture.orders?.more?.links).toHaveLength(3)
  orders.projection().onAction?.({ actionId: 'destination', value: 'shipments' })
  expect(orders.store.getState().lastRequest).toMatchObject({ actionId: 'destination', value: 'shipments' })
  const runs = owner(5)
  expect(runs.fixture.runs?.navigation?.groups[0]?.items).toHaveLength(4)
  runs.projection().onAction?.({ actionId: 'navigate', value: 'all-workflows' })
  expect(runs.store.getState().lastRequest).toMatchObject({ actionId: 'navigate', value: 'all-workflows' })
  runs.projection().onAction?.({ actionId: 'new-run' })
  expect(runs.fixture.runs?.runs).toHaveLength(11)
  expect(runs.store.getState().lastRequest && 'value' in runs.store.getState().lastRequest!).toBe(false)
})

test('local task completion changes only its owner and is pruned on refresh', () => {
  const first = owner(2)
  const second = owner(2, HBAR_APP_UI_MOBILE_FIXTURES, 'mobile-b')
  first.projection().tasks?.onComplete?.('quote', true)
  expect(first.html()).toContain('6 OPEN')
  expect(first.html()).not.toContain('Send the Northwind renewal quote')
  expect(second.html()).toContain('7 OPEN')
  first.projection().tasks?.onComplete?.('quote', true)
  expect(first.events).toEqual([{ actionId: 'confirm', value: 'quote' }])
  const tasks = first.fixture.tasks
  if (!tasks) throw new Error('Tasks fixture missing')
  const next: LumenMobileContent = { tasks: { ...tasks, tasks: tasks.tasks.filter((task) => task.id !== 'quote') } }
  first.store.getState().refresh('mobile-a', createMobilePreviewSeed(next, 2, 'mobile-a', 'default'))
  expect(first.store.getState().taskCompleteById.quote).toBeUndefined()
})

test('Mobile3 local search projects matching/empty results and rejects stale hidden targets', () => {
  const value = owner(3)
  value.projection().home?.selection?.onChange('search')
  const prior = value.projection()
  prior.home?.draft?.onChange('Harbor')
  expect(value.html()).toContain('lumen-mobile-home-search')
  expect(value.html()).toContain('aria-label="Open Harbor Coffee replied"')
  expect(value.html()).not.toContain('aria-label="Open Alder Group signed the pilot"')
  prior.onAction?.({ actionId: 'open', value: 'pilot' })
  expect(value.store.getState().lastRequest).toBeUndefined()
  value.projection().home?.draft?.onChange('no-such-update')
  expect(value.html()).toContain('No matching updates')
  value.projection().home?.selection?.onChange('home')
  expect(value.html()).not.toContain('lumen-mobile-home-search')
})

test('Runs Queue has three observed records and no hidden Running intent is accepted', () => {
  const value = owner(5)
  const old = value.projection()
  old.runs?.selection?.onChange('queue')
  expect(value.html()).toContain('Nightly ledger export')
  expect(value.html()).not.toContain('Warehouse sync')
  old.onAction?.({ actionId: 'open', value: 'warehouse' })
  expect(value.store.getState().lastRequest).toBeUndefined()
  value.projection().onAction?.({ actionId: 'open', value: 'export' })
  expect(value.store.getState().lastRequest).toMatchObject({ actionId: 'open', value: 'export' })
  value.projection().runs?.selection?.onChange('done')
  expect(value.html()).toContain('No done runs are available.')
})

test('empty, one-row, boundary-overflow and long host copy remain data-driven', () => {
  const base = HBAR_APP_UI_MOBILE_FIXTURES.activity
  if (!base) throw new Error('Activity fixture missing')
  expect(owner(1, { activity: { ...base, items: [] } }).html()).toContain('No activity')
  expect(owner(1, { activity: { ...base, items: base.items.slice(0, 1) } }).fixture.activity?.items).toHaveLength(1)
  const overflow = owner(1, createHbarAppUiMobileOverflowFixtures())
  expect(overflow.fixture.activity?.items).toHaveLength(81)
  expect(overflow.html()).toContain('Workspace activity 80')
  expect(overflow.html()).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  const localized = owner(2, createHbarAppUiMobileLocalizedFixtures(), 'mobile-de', true)
  expect(localized.html()).toContain('Aufgaben für die gemeinsame Veröffentlichung')
  expect(localized.html()).not.toContain('Open quick actions')
})
