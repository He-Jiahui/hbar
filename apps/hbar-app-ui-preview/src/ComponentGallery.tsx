import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from 'zustand'
import { ChevronLeft, ChevronRight, ExternalLink, Moon, Search, Sun } from 'lucide-react'
import {
  DEFAULT_LUMEN_APPEARANCE,
  LumenButton,
  LumenInput,
  LumenFrame,
  LumenText,
  LumenOption,
  LumenProvider,
  LumenSelect,
} from '@lumen/app-ui'
import { HbarAppUiIcon } from 'hbar-app-ui/icon'
import type { ComponentGalleryCopy } from '../../../tests/fixtures/component-gallery-copy'
import {
  componentGalleryLayout,
  componentGalleryPage,
  componentGalleryParameters,
  componentPreviewUrl,
  readComponentGalleryState,
  type ComponentGalleryEntry,
  type ComponentGalleryLocale,
  type ComponentGalleryTheme,
} from './component-gallery-model'
import type { createComponentGalleryStore } from './component-gallery-store'

type GalleryStyle = CSSProperties & { '--component-gallery-preview-size': string }
const galleryStyle: GalleryStyle = { '--component-gallery-preview-size': componentGalleryLayout.previewBlockSize }

function ComponentPreviewCard({
  entry,
  theme,
  copy,
}: {
  readonly entry: ComponentGalleryEntry
  readonly theme: ComponentGalleryTheme
  readonly copy: ComponentGalleryCopy
}) {
  return (
    <LumenFrame as="article" className="component-gallery-card" data-gallery-entry={entry.id}>
      <LumenFrame as="header" className="component-gallery-card-heading">
        <LumenFrame>
          <LumenText as="h2">{copy.entryTitle(entry)}</LumenText>
          <LumenText as="code">{entry.entry}</LumenText>
        </LumenFrame>
        <LumenFrame as="a"
          className="component-gallery-link"
          href={componentPreviewUrl(entry.id, theme, false)}
          target="_blank"
          rel="noopener"
          aria-label={copy.openTitle(entry)}
        >
          <LumenText as="span">{copy.open}</LumenText>
          <HbarAppUiIcon icon={ExternalLink} tier="sm" />
        </LumenFrame>
      </LumenFrame>
      <LumenFrame as="iframe"
        key={theme}
        className="component-gallery-preview"
        src={componentPreviewUrl(entry.id, theme, true)}
        title={copy.previewTitle(entry)}
        loading="lazy"
      />
    </LumenFrame>
  )
}

export function ComponentGallery({
  entries,
  store,
  copies,
}: {
  readonly entries: readonly ComponentGalleryEntry[]
  readonly store: ReturnType<typeof createComponentGalleryStore>
  readonly copies: Readonly<Record<ComponentGalleryLocale, ComponentGalleryCopy>>
}) {
  const query = useStore(store, (state) => state.query)
  const category = useStore(store, (state) => state.category)
  const requestedPage = useStore(store, (state) => state.page)
  const theme = useStore(store, (state) => state.theme)
  const locale = useStore(store, (state) => state.locale)
  const setQuery = useStore(store, (state) => state.setQuery)
  const chooseCategory = useStore(store, (state) => state.chooseCategory)
  const goToPage = useStore(store, (state) => state.goToPage)
  const toggleTheme = useStore(store, (state) => state.toggleTheme)
  const setLocale = useStore(store, (state) => state.setLocale)
  const resetFilters = useStore(store, (state) => state.resetFilters)
  const restore = useStore(store, (state) => state.restore)
  const previewsRef = useRef<HTMLDivElement>(null)
  const copy = copies[locale]
  const page = useMemo(
    () => componentGalleryPage(entries, { query, category, page: requestedPage, theme, locale }, copy.categoryLabels),
    [entries, query, category, requestedPage, theme, locale, copy.categoryLabels],
  )
  const categoryCount = useMemo(() => new Set(entries.map((entry) => entry.category)).size, [entries])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dataset.hbarAppUiTheme = theme
    document.documentElement.dataset.lumenMode = theme
    document.title = copy.title
    const parameters = componentGalleryParameters({ query, category, page: page.page, theme, locale })
    window.history.replaceState(null, '', `${window.location.pathname}?${parameters.toString()}`)
  }, [query, category, page.page, theme, locale, copy.title])

  useEffect(() => {
    const handlePopstate = () => restore(readComponentGalleryState(new URLSearchParams(window.location.search)))
    window.addEventListener('popstate', handlePopstate)
    return () => window.removeEventListener('popstate', handlePopstate)
  }, [restore])

  useEffect(() => {
    previewsRef.current?.scrollTo({ top: 0 })
  }, [query, category, page.page])

  const foundationUrl = `/visual-language.html?${new URLSearchParams({ locale, theme }).toString()}`
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: theme }} withCssBaseline={false}>
      <LumenFrame as="main" className="component-gallery" style={galleryStyle} data-hbar-app-ui-theme={theme}>
        <LumenFrame as="header" className="component-gallery-heading">
          <LumenFrame className="component-gallery-title">
            <LumenText as="h1">{copy.title}</LumenText>
            <LumenText as="p">{copy.catalogCount(entries.length, categoryCount)}</LumenText>
          </LumenFrame>
          <LumenFrame className="component-gallery-heading-actions">
            <LumenFrame as="a" className="component-gallery-link" href={foundationUrl}>
              {copy.foundation}
            </LumenFrame>
            <LumenSelect
              aria-label={copy.language}
              value={locale}
              onChange={(event) => {
                const next = event.target.value
                if (next === 'zh-CN' || next === 'en-US') setLocale(next)
              }}
            >
              <LumenOption value="zh-CN">{copy.locales['zh-CN']}</LumenOption>
              <LumenOption value="en-US">{copy.locales['en-US']}</LumenOption>
            </LumenSelect>
            <LumenButton variant="text" aria-label={copy.theme} onClick={toggleTheme}>
              <HbarAppUiIcon icon={theme === 'dark' ? Sun : Moon} />
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
        <LumenFrame className="component-gallery-toolbar">
          <LumenFrame as="label" className="component-gallery-search lumen-input-group lumen-effect">
            <HbarAppUiIcon icon={Search} />
            <LumenInput
              type="search"
              variant="plain"
              aria-label={copy.search}
              placeholder={copy.searchPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </LumenFrame>
          <LumenText as="span" className="component-gallery-result-count" role="status">
            {copy.resultCount(page.first, page.last, page.total)}
          </LumenText>
          <LumenFrame as="nav" className="component-gallery-pagination" aria-label={copy.pagination}>
            <LumenButton
              variant="text"
              disabled={page.page === 1}
              aria-label={copy.previous}
              onClick={() => goToPage(page.page - 1)}
            >
              <HbarAppUiIcon icon={ChevronLeft} />
            </LumenButton>
            <LumenText as="span">{copy.pageCount(page.page, page.pages)}</LumenText>
            <LumenButton
              variant="text"
              disabled={page.page === page.pages}
              aria-label={copy.next}
              onClick={() => goToPage(page.page + 1)}
            >
              <HbarAppUiIcon icon={ChevronRight} />
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
        <LumenFrame className="component-gallery-body">
          <LumenFrame as="aside" className="component-gallery-sidebar">
            <LumenText as="h2">{copy.categoriesHeading}</LumenText>
            <LumenFrame as="nav" className="component-gallery-categories" aria-label={copy.categoriesHeading}>
              <LumenButton variant="text" aria-pressed={category === 'all'} onClick={() => chooseCategory('all')}>
                <LumenText as="span">{copy.all}</LumenText>
                <LumenText as="small">{page.matchingCount}</LumenText>
              </LumenButton>
              {page.categories.map((item) => (
                <LumenButton
                  key={item.category}
                  variant="text"
                  aria-pressed={category === item.category}
                  onClick={() => chooseCategory(item.category)}
                >
                  <LumenText as="span">{copy.categoryLabels[item.category]}</LumenText>
                  <LumenText as="small">{item.count}</LumenText>
                </LumenButton>
              ))}
            </LumenFrame>
          </LumenFrame>
          <LumenFrame className="component-gallery-results" ref={previewsRef}>
            {page.entries.length ? (
              <LumenFrame className="component-gallery-cards">
                {page.entries.map((entry) => (
                  <ComponentPreviewCard key={entry.id} entry={entry} theme={theme} copy={copy} />
                ))}
              </LumenFrame>
            ) : (
              <LumenFrame as="section" className="component-gallery-empty">
                <LumenText as="h2">{copy.emptyTitle}</LumenText>
                <LumenText as="p">{copy.emptyDescription}</LumenText>
                <LumenButton variant="outlined" onClick={resetFilters}>
                  {copy.reset}
                </LumenButton>
              </LumenFrame>
            )}
          </LumenFrame>
        </LumenFrame>
      </LumenFrame>
    </LumenProvider>
  )
}
