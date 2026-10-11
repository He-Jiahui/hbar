import { LumenActionMenu } from '@lumen/app-ui'
import { globalFeatureCopy, type GlobalFeaturePageId } from './global-feature-copy'
import type { ShellLocale } from './shell-copy'

export interface GlobalFeatureNavigationProps {
  readonly locale: ShellLocale
  readonly connected: boolean
  readonly hasWorkspace: boolean
  readonly onOpen: (page: GlobalFeaturePageId) => void
}

/** Secondary destinations share one nearby menu; schedules and notifications retain their primary entries. */
export function GlobalFeatureNavigation({ locale, connected, hasWorkspace, onOpen }: GlobalFeatureNavigationProps) {
  const copy = globalFeatureCopy(locale)
  return (
    <LumenActionMenu
      label={copy.navigation}
      labelVisible
      items={(['run-board', 'prompt-templates', 'onboarding'] as const).map((id) => ({
        id,
        label: copy.titles[id],
        disabled: id === 'run-board' && (!connected || !hasWorkspace),
      }))}
      onAction={onOpen}
    />
  )
}
