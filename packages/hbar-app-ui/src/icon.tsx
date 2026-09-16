import type { LucideIcon } from 'lucide-react'

export type HbarAppUiIconTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

/** Drawing size is independent from the owning control's hit area. */
export function HbarAppUiIcon({
  icon: Icon,
  tier = 'md',
}: {
  readonly icon: LucideIcon
  readonly tier?: HbarAppUiIconTier
}) {
  const dimension = `var(--hbar-app-ui-icon-${tier})`
  return (
    <Icon
      aria-hidden="true"
      focusable="false"
      style={{ inlineSize: dimension, blockSize: dimension, flex: '0 0 auto' }}
    />
  )
}
