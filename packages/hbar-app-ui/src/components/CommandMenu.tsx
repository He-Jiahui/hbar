import { LumenCommandMenu, type LumenCommandMenuContent } from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiCommandMenuProps = HbarAppUiVariantProps & {
  readonly commandMenuContent?: LumenCommandMenuContent | undefined
}

/** Thin legacy-contract adapter; all command rendering and interaction controls are Lumen-owned. */
export function CommandMenu({ spec, commandMenuContent, className }: HbarAppUiCommandMenuProps) {
  return (
    <LumenCommandMenu
      variant={spec.variant}
      variantId={spec.id}
      content={commandMenuContent}
      className={className}
      density={spec.density}
      surface={spec.profile.surface}
      state={spec.profile.initialState}
      visualMode={spec.profile.visualMode}
    />
  )
}
