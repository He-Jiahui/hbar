import type { LucideIcon, LucideProps } from 'lucide-react'

export type HbarAppUiIconTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

/** Drawing size is independent from the owning control's hit area. */
export function HbarAppUiIcon({
  icon: Icon,
  tier = 'md',
  style,
  ...props
}: {
  readonly icon: LucideIcon
  readonly tier?: HbarAppUiIconTier
} & Omit<LucideProps, 'size'>) {
  const dimension = `var(--hbar-app-ui-icon-${tier})`
  return (
    <Icon
      aria-hidden={props['aria-label'] ? undefined : true}
      focusable="false"
      {...props}
      style={{ ...style, inlineSize: dimension, blockSize: dimension, flex: '0 0 auto' }}
    />
  )
}
