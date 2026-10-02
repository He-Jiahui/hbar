import type { ReactNode } from 'react'
import type { HbarAppUiRegistryEntry, HbarAppUiEvent } from 'hbar-app-ui/catalog'
import type { PreviewFixtures } from './usePreviewFixtures'

export interface PreviewSceneProps {
  readonly selected: HbarAppUiRegistryEntry
  readonly onAction: (event: HbarAppUiEvent) => void
}
export interface PreviewHostProps extends PreviewSceneProps {
  readonly fixtures: PreviewFixtures
  readonly children: ReactNode
}
