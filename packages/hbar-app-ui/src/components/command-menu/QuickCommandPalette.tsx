import type { HbarAppUiVariantProps } from '../../types'
import { CommandCatalogSurface } from './CommandCatalogSurface'
import { useCommandMenuContent } from './CommandContent'
export function QuickCommandPalette(props: HbarAppUiVariantProps) {
  const content = useCommandMenuContent()
  return <CommandCatalogSurface {...props} content={content.quick} />
}
