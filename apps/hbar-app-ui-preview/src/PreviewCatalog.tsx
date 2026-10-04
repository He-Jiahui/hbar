import { LumenFrame, LumenIcon, LumenInput, LumenNavigationButton, LumenText } from '@lumen/app-ui'
import { HbarAppUiIconButton, HBAR_APP_UI_CATEGORY_COUNTS } from 'hbar-app-ui/catalog'
import type { HbarAppUiCategory } from 'hbar-app-ui/catalog'
import { Search, X } from 'lucide-react'
import type { PreviewWorkspaceCopy } from '../../../tests/fixtures/preview-workspace-copy'

export interface PreviewCatalogProps {
  readonly query: string
  readonly categories: readonly HbarAppUiCategory[]
  readonly selectedCategory: HbarAppUiCategory
  readonly shown: number
  readonly total: number
  readonly copy: PreviewWorkspaceCopy
  readonly onQuery: (query: string) => void
  readonly onCategory: (category: HbarAppUiCategory) => void
}
export function PreviewCatalog({
  query,
  categories,
  selectedCategory,
  shown,
  total,
  copy,
  onQuery,
  onCategory,
}: PreviewCatalogProps) {
  return (
    <LumenFrame as="aside" className="hbar-app-ui-preview-sidebar" aria-label={copy.categoryNavigation}>
      <LumenFrame as="label" className="hbar-app-ui-preview-search">
        <LumenIcon icon={Search} tier="sm" />
        <LumenInput
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={copy.search}
          aria-label={copy.search}
        />
        {query && (
          <HbarAppUiIconButton label={copy.clearSearch} onClick={() => onQuery('')}>
            <LumenIcon icon={X} tier="sm" />
          </HbarAppUiIconButton>
        )}
      </LumenFrame>
      <LumenFrame className="hbar-app-ui-preview-catalog-heading">
        <LumenText as="span">{copy.categories}</LumenText>
        <LumenText as="small">{copy.catalogCount(shown, total)}</LumenText>
      </LumenFrame>
      <LumenFrame as="nav" className="hbar-app-ui-preview-category-list">
        {categories.map((category) => (
          <LumenNavigationButton
            key={category}
            size="s"
            selected={selectedCategory === category}
            indicatorEdge="right"
            onClick={() => onCategory(category)}
          >
            <LumenText as="span">{copy.categoryName(category)}</LumenText>
            <LumenText as="small">{HBAR_APP_UI_CATEGORY_COUNTS[category]}</LumenText>
          </LumenNavigationButton>
        ))}
        {!categories.length && (
          <LumenText as="p" className="hbar-app-ui-preview-no-results">
            {copy.noResults}
          </LumenText>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}
