import { LumenUsage } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

/** Compatibility adapter; all eight usage surfaces and their state live in @lumen/app-ui. */
export function AiUsage({ spec, className }: HbarAppUiVariantProps) {
  return (
    <LumenUsage
      variant={spec.variant}
      variantId={spec.id}
      className={className}
      density={spec.density}
      surface={spec.profile.surface}
      state={spec.profile.initialState}
      visualMode={spec.profile.visualMode}
    />
  )
}
