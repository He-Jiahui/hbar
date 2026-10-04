import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenNavbar, uniqueLumenNavbarItems, type LumenNavbarContent } from '@lumen/app-ui'
import {
  HBAR_APP_UI_NAVBAR_FIXTURES,
  createHbarAppUiNavbarLocalizedFixtures,
} from './fixtures/hbar-app-ui-navbar-fixtures'
import {
  createNavbarPreviewContent,
  createNavbarPreviewCopy,
  createNavbarPreviewSeed,
} from '../apps/hbar-app-ui-preview/src/navbarPreviewFixtures'
import { createNavbarPreviewStore } from '../apps/hbar-app-ui-preview/src/navbarPreviewModel'
import { projectNavbarPreview } from '../apps/hbar-app-ui-preview/src/navbarPreviewProjection'

function preview(variant: number, localized = false) {
  const base = localized ? createHbarAppUiNavbarLocalizedFixtures() : HBAR_APP_UI_NAVBAR_FIXTURES
  const fixture = createNavbarPreviewContent(base, variant, localized)
  const ownerId = `navbar-test-${variant}`
  const store = createNavbarPreviewStore(createNavbarPreviewSeed(fixture, variant, ownerId, 'test'))
  const events: { readonly actionId: string; readonly value?: string | undefined }[] = []
  const project = () =>
    projectNavbarPreview(fixture, store.getState(), store, createNavbarPreviewCopy(localized), (event) =>
      events.push(event),
    )
  const render = () =>
    renderToStaticMarkup(
      createElement(LumenNavbar, { variant, variantId: `hbar-app-ui-navbar-${variant}`, content: project() }),
    )
  return { fixture, ownerId, store, project, render, events }
}

test('project tabs replace their actual groups and local starring has a checked state and localized label', () => {
  const p = preview(1, true)
  p.project().projectBoard!.selection!.onTabChange('discussion')
  expect(p.render()).toContain('Open threads')
  expect(p.render()).toContain('Refund copy review')
  expect(p.render()).not.toContain('Wallet sheet')
  p.project().projectBoard!.starred!.onChange(true)
  expect(p.render()).toContain('aria-checked="true"')
  expect(p.render()).toContain('Projektmarkierung entfernen')
  p.project().projectBoard!.selection!.onTabChange('files')
  expect(p.render()).toContain('checkout-flow.pdf')
  expect(p.store.getState().flagsById.starred).toBe(true)
  expect(p.store.getState().lastRequest).toBeUndefined()
})

test('analytics primary scope resets dependent options and metrics, rejecting a late obsolete secondary callback', () => {
  const p = preview(7)
  const obsolete = p.project().analytics!.selection!
  obsolete.onPrimaryChange('customers')
  obsolete.onSecondaryChange('churn')
  const content = p.project().analytics!
  expect(content.secondaryOptions?.map(({ id }) => id)).toEqual(['accounts', 'segments', 'health'])
  expect(p.store.getState().selectedBySlot.secondary).toBe('accounts')
  expect(p.render()).toContain('Customers · Accounts')
  expect(p.render()).toContain('412 on Scale')
  expect(p.render()).not.toContain('$248k')
  content.selection!.onSecondaryChange('segments')
  expect(p.render()).toContain('Customers · Segments')
  p.project().analytics!.selection!.onPrimaryChange('usage')
  expect(p.render()).toContain('94.2M')
  expect(p.store.getState().selectedBySlot.secondary).toBe('requests')
})

test('activity query projects owned results and an empty message while keeping the Today list', () => {
  const p = preview(6, true)
  p.project().activity!.search!.onQueryChange('billing')
  const obsolete = p.project().activity!.search!
  expect(p.render()).toContain('Billing retry policy')
  expect(p.render()).toContain('ERGEBNISSE')
  expect(p.render()).toContain('Today')
  expect(p.render()).toContain('Harbor Coffee')
  p.project().activity!.search!.onQueryChange('zzz')
  obsolete.onResult('billing-retry-policy')
  expect(p.store.getState().lastRequest).toBeUndefined()
  expect(p.render()).toContain('Keine Treffer für „zzz“.')
  p.project().activity!.search!.onQueryChange('a')
  expect(p.project().activity!.search!.results).toHaveLength(0)
  p.project().activity!.search!.onQueryChange('bi')
  expect(p.project().activity!.search!.results.map(({ id }) => id)).toEqual(['billing-retry-policy'])
  p.project().activity!.search!.onQueryChange('')
  expect(p.render()).not.toContain('lumen-navbar-search-results')
})

test('filter selection updates the source count but does not invent a different item dataset', () => {
  const p = preview(8)
  const originalIds = p.project().filterList!.items.map(({ id }) => id)
  p.project().filterList!.selection!.onFilterChange('all')
  expect(p.project().filterList!.items.map(({ id }) => id)).toEqual(originalIds)
  expect(p.render()).toContain('248 items in all')
  expect(p.render()).toContain('role="tablist"')
})

test('workspace choices remain local and create organisation only records an exact preview request', () => {
  const p = preview(3)
  p.project().onAction!({ actionId: 'workspace', value: 'cedar' })
  expect(p.project().deployment!.workspace).toBe('Cedar Labs')
  expect(p.store.getState().lastRequest).toBeUndefined()
  p.project().onAction!({ actionId: 'workspace', value: 'create' })
  expect(p.store.getState().lastRequest).toMatchObject({ actionId: 'workspace', value: 'create' })
  expect(p.project().deployment!.workspace).toBe('Cedar Labs')
  expect(p.render()).toContain('No external action was performed')
})

test('project search and environment choices update their owned deployment projection', () => {
  const p = preview(3)
  p.project().deployment!.projectMenu!.search!.onChange('billing')
  expect(p.project().deployment!.projectMenu!.items.map(({ id }) => id)).toEqual(['billing-api'])
  p.project().onAction!({ actionId: 'project', value: 'marketing-site' })
  expect(p.store.getState().selectedBySlot.project).toBe('web-app')
  p.project().onAction!({ actionId: 'project', value: 'billing-api' })
  p.project().onAction!({ actionId: 'environment', value: 'staging' })
  expect(p.project().deployment!.project).toBe('billing-api')
  expect(p.project().deployment!.deploymentSummary).toBe('Northwind · staging deployment')
  expect(p.store.getState().lastRequest).toBeUndefined()
})

test('owned row requests reject removed IDs and another owner; public first-wins semantics omit blanks', () => {
  const p = preview(2)
  const oldContent = p.project()
  const refreshed: LumenNavbarContent = {
    taskList: { ...p.fixture.taskList!, rows: p.fixture.taskList!.rows.slice(1) },
  }
  p.store.getState().refresh(p.ownerId, createNavbarPreviewSeed(refreshed, 2, p.ownerId, 'test'))
  oldContent.onAction!({ actionId: 'open', value: 'payment-retries' })
  expect(p.store.getState().lastRequest).toBeUndefined()
  expect(p.store.getState().request('other-owner', { actionId: 'open', targetId: 'guest-checkout' })).toBeUndefined()
  oldContent.onAction!({ actionId: 'open', value: 'guest-checkout' })
  expect(p.store.getState().lastRequest).toMatchObject({ value: 'guest-checkout' })
  expect(
    uniqueLumenNavbarItems([
      { id: ' ', label: 'Blank' },
      { id: ' a ', label: 'First' },
      { id: ' a ', label: 'Second' },
    ]),
  ).toEqual([{ id: ' a ', label: 'First' }])
})

test('centered desktop CTA, single cart count, typed document drawer, and bookmarked article remain distinct', () => {
  expect(preview(12).render()).toContain('Get started')
  const landing = preview(4).render()
  expect(landing).toContain('hbar-app-ui-button hbar-app-ui-navbar-landing-primary')
  expect(landing).toContain('hbar-app-ui-icon-button')
  const commerce = preview(9).render()
  expect(commerce).toContain('hbar-app-ui-navbar-wishlist-marker')
  expect(commerce.match(/<i>3<\/i>/g)).toHaveLength(1)
  expect(preview(10).project().docs!.navigation).toEqual({
    label: 'Documentation navigation',
    title: 'Docs',
    close: 'Close navigation',
  })
  const article = preview(14)
  article.project().article!.bookmarked!.onChange(true)
  expect(article.render()).toContain('aria-label="Remove bookmark"')
  expect(article.render()).toContain('aria-checked="true"')
  expect(article.render()).toContain('aria-haspopup="menu"')
  expect(article.project().article!.sections).toHaveLength(4)
})
