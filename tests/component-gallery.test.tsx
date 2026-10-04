import { expect, test } from 'bun:test'
import { HBAR_APP_UI_VARIANT_SPECS } from '../packages/hbar-app-ui/src/catalog-metadata'
import {
  componentGalleryEntries,
  componentGalleryLayout,
  componentGalleryPage,
  componentGalleryParameters,
  componentPreviewUrl,
  readComponentGalleryState,
} from '../apps/hbar-app-ui-preview/src/component-gallery-model'
import { createComponentGalleryStore } from '../apps/hbar-app-ui-preview/src/component-gallery-store'
import { componentGalleryCopy } from './fixtures/component-gallery-copy'

const entries = componentGalleryEntries(HBAR_APP_UI_VARIANT_SPECS)
const initial = readComponentGalleryState(new URLSearchParams())
const copy = componentGalleryCopy['zh-CN']

test('the gallery exposes all 300 variants exactly once through bounded pages', () => {
  const ids: string[] = []
  const first = componentGalleryPage(entries, initial, copy.categoryLabels)
  expect(first.categories).toHaveLength(38)
  expect(first.total).toBe(300)
  expect(first.pages).toBe(50)
  for (let page = 1; page <= first.pages; page += 1) {
    const result = componentGalleryPage(entries, { ...initial, page }, copy.categoryLabels)
    expect(result.entries.length).toBeLessThanOrEqual(componentGalleryLayout.pageSize)
    ids.push(...result.entries.map((entry) => entry.id))
  }
  expect(new Set(ids).size).toBe(300)
  expect(ids).toEqual(entries.map((entry) => entry.id))
})

test('empty, single, boundary and next-page catalogs preserve capacity and visible ranges', () => {
  for (const count of [0, 1, 4, 6, 7]) {
    const result = componentGalleryPage(entries.slice(0, count), initial, copy.categoryLabels)
    expect(result.entries).toHaveLength(Math.min(count, 6))
    expect(result.first).toBe(count ? 1 : 0)
    expect(result.last).toBe(Math.min(count, 6))
    expect(result.pages).toBe(count > 6 ? 2 : 1)
    if (count > 6) {
      const nextEntry = entries[6]
      if (!nextEntry) throw new Error('Missing next-page gallery fixture')
      const second = componentGalleryPage(entries.slice(0, count), { ...initial, page: 2 }, copy.categoryLabels)
      expect(second.entries.map((entry) => entry.id)).toEqual([nextEntry.id])
      expect(second.first).toBe(7)
      expect(second.last).toBe(7)
    }
  }
})

test('Chinese category names, technical names and IDs are searchable and stale pages are clamped', () => {
  const chinese = componentGalleryPage(entries, { ...initial, query: '文件管理' }, copy.categoryLabels)
  expect(chinese.total).toBe(4)
  expect(chinese.entries.every((entry) => entry.category === 'file-manager')).toBe(true)
  const named = componentGalleryPage(entries, { ...initial, query: ' Data Table ' }, copy.categoryLabels)
  expect(named.total).toBe(8)
  const single = componentGalleryPage(
    entries,
    { ...initial, query: 'hbar-app-ui-forms-12', page: 50 },
    copy.categoryLabels,
  )
  expect(single.page).toBe(1)
  expect(single.entries.map((entry) => entry.id)).toEqual(['hbar-app-ui-forms-12'])
  const staleCategory = componentGalleryPage(
    chinese.entries,
    { ...initial, category: 'analytics' },
    copy.categoryLabels,
  )
  expect(staleCategory.total).toBe(0)
  expect(staleCategory.entries).toHaveLength(0)
})

test('duplicate registrations do not produce duplicate previews, and URLs remain bound to their original entry', () => {
  const first = HBAR_APP_UI_VARIANT_SPECS[0]
  if (!first) throw new Error('Missing gallery fixture')
  const unique = componentGalleryEntries([first, ...HBAR_APP_UI_VARIANT_SPECS])
  expect(unique).toHaveLength(300)
  const entryId = unique[0]?.id
  if (!entryId) throw new Error('Missing original preview entry')
  const url = componentPreviewUrl(entryId, 'light', true)
  const parameters = new URL(url, 'http://localhost').searchParams
  expect(parameters.get('variant')).toBe(first.id)
  expect(parameters.get('theme')).toBe('light')
  expect(parameters.get('mode')).toBe('isolated')
  expect(componentGalleryEntries(HBAR_APP_UI_VARIANT_SPECS.slice(1)).some((entry) => entry.id === entryId)).toBe(false)
  expect(parameters.get('variant')).toBe(entryId)
})

test('URL restoration validates unknown values and round-trips view preferences', () => {
  expect(
    readComponentGalleryState(new URLSearchParams('category=missing&page=Infinity&theme=invalid&locale=missing')),
  ).toEqual(initial)
  for (const page of ['0', '-2', '1.5', 'NaN', '9007199254740992']) {
    expect(readComponentGalleryState(new URLSearchParams({ page })).page).toBe(1)
  }
  const state = {
    ...initial,
    category: 'analytics' as const,
    query: '分析 & 报告',
    page: 3,
    theme: 'light' as const,
    locale: 'en-US' as const,
  }
  expect(readComponentGalleryState(componentGalleryParameters(state))).toEqual(state)
})

test('filter actions reset pagination and recovery retains theme and locale', () => {
  const store = createComponentGalleryStore(initial)
  store.getState().goToPage(12)
  store.getState().chooseCategory('analytics')
  expect(store.getState().page).toBe(1)
  store.getState().goToPage(3)
  store.getState().setQuery('missing')
  expect(store.getState().page).toBe(1)
  store.getState().toggleTheme()
  store.getState().setLocale('en-US')
  store.getState().resetFilters()
  expect(store.getState()).toMatchObject({ category: 'all', query: '', page: 1, theme: 'light', locale: 'en-US' })
})
