import { z } from 'zod'
import { HBAR_APP_UI_CATEGORIES, type HbarAppUiCategory, type HbarAppUiVariantSpec } from 'hbar-app-ui/types'
import description from './component-gallery-layout.json'

const layoutSchema = z.object({
  schemaVersion: z.literal(1),
  regions: z.tuple([z.literal('header'), z.literal('toolbar'), z.literal('catalog'), z.literal('previews')]),
  pageSize: z.number().int().min(1).max(12),
  previewBlockSize: z.string().regex(/^\d+(?:\.\d+)?rem$/),
})

export const componentGalleryLayout = layoutSchema.parse(description)
export type ComponentGalleryLocale = 'zh-CN' | 'en-US'
export type ComponentGalleryTheme = 'dark' | 'light'
export type ComponentGalleryCategory = HbarAppUiCategory

export interface ComponentGalleryEntry {
  readonly id: string
  readonly category: HbarAppUiCategory
  readonly variant: number
  readonly title: string
  readonly entry: string
}

export interface ComponentGalleryState {
  readonly query: string
  readonly category: HbarAppUiCategory | 'all'
  readonly page: number
  readonly theme: ComponentGalleryTheme
  readonly locale: ComponentGalleryLocale
}

export function readComponentGalleryState(parameters: URLSearchParams): ComponentGalleryState {
  const requestedCategory = parameters.get('category')
  const category = HBAR_APP_UI_CATEGORIES.find((candidate) => candidate === requestedCategory) ?? 'all'
  const requestedPage = Number(parameters.get('page'))
  return {
    query: parameters.get('q') ?? '',
    category,
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    theme: parameters.get('theme') === 'light' ? 'light' : 'dark',
    locale: parameters.get('locale') === 'en-US' ? 'en-US' : 'zh-CN',
  }
}

export function componentGalleryParameters(state: ComponentGalleryState): URLSearchParams {
  const parameters = new URLSearchParams({ locale: state.locale, theme: state.theme })
  if (state.query) parameters.set('q', state.query)
  if (state.category !== 'all') parameters.set('category', state.category)
  if (state.page > 1) parameters.set('page', String(state.page))
  return parameters
}

/** Metadata comes from the public catalog. A duplicate ID keeps its first registered entry. */
export function componentGalleryEntries(specs: readonly HbarAppUiVariantSpec[]): readonly ComponentGalleryEntry[] {
  const entries = new Map<string, ComponentGalleryEntry>()
  for (const spec of specs) {
    if (!entries.has(spec.id)) {
      entries.set(spec.id, {
        id: spec.id,
        category: spec.category,
        variant: spec.variant,
        title: spec.title,
        entry: spec.entry,
      })
    }
  }
  return [...entries.values()]
}

/** Six live preview viewports per page; the full catalog remains searchable. */
export function componentGalleryPage(
  entries: readonly ComponentGalleryEntry[],
  state: ComponentGalleryState,
  categoryLabels: Readonly<Record<HbarAppUiCategory, string>>,
) {
  const query = state.query.trim().toLocaleLowerCase(state.locale)
  const matchingQuery = entries.filter((entry) =>
    `${entry.title} ${entry.entry} ${entry.id} ${entry.category} ${categoryLabels[entry.category]}`
      .toLocaleLowerCase(state.locale)
      .includes(query),
  )
  const filtered = matchingQuery.filter((entry) => state.category === 'all' || entry.category === state.category)
  const pages = Math.max(1, Math.ceil(filtered.length / componentGalleryLayout.pageSize))
  const page = Math.max(1, Math.min(pages, state.page))
  const start = (page - 1) * componentGalleryLayout.pageSize
  return {
    entries: filtered.slice(start, start + componentGalleryLayout.pageSize),
    categories: HBAR_APP_UI_CATEGORIES.flatMap((category) => {
      const count = matchingQuery.filter((entry) => entry.category === category).length
      return count ? [{ category, count }] : []
    }),
    matchingCount: matchingQuery.length,
    total: filtered.length,
    page,
    pages,
    first: filtered.length ? start + 1 : 0,
    last: Math.min(start + componentGalleryLayout.pageSize, filtered.length),
  }
}

export function componentPreviewUrl(entryId: string, theme: ComponentGalleryTheme, isolated: boolean): string {
  const parameters = new URLSearchParams({ variant: entryId, theme })
  if (isolated) parameters.set('mode', 'isolated')
  return `/?${parameters.toString()}`
}
