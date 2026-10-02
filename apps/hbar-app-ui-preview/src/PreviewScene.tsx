import type { HbarAppUiRegistryEntry, HbarAppUiEvent } from 'hbar-app-ui/catalog'
import { usePreviewFixtures } from './usePreviewFixtures'
import { PreviewContentProviders } from './PreviewContentProviders'
import { PreviewCategoryHost } from './PreviewCategoryHost'
export interface PreviewSceneProps {
  readonly selected: HbarAppUiRegistryEntry
  readonly onAction: (event: HbarAppUiEvent) => void
}
/** Both isolated canvases and workspace previews use this same interaction owner. */
export function PreviewScene({ selected, onAction }: PreviewSceneProps) {
  const fixtures = usePreviewFixtures(selected.spec.variant)
  const SelectedComponent = selected.component
  return (
    <PreviewContentProviders selected={selected} onAction={onAction} fixtures={fixtures}>
      <PreviewCategoryHost selected={selected} onAction={onAction} fixtures={fixtures}>
        <SelectedComponent spec={selected.spec} onAction={onAction} />
      </PreviewCategoryHost>
    </PreviewContentProviders>
  )
}
