import { LumenActionMenu } from '@lumen/app-ui'
import { globalFeatureCopy, type GlobalFeaturePageId } from './global-feature-copy'
import { getShellCopy } from './shell-copy'
import type { ShellLocale } from './shell-copy'

export interface GlobalFeatureNavigationProps {
  readonly locale: ShellLocale
  readonly connected: boolean
  readonly hasWorkspace: boolean
  readonly onOpen: (page: GlobalFeaturePageId) => void
  readonly compact?: boolean
  readonly onStatus: () => void
  readonly onCommands: () => void
}

/** A bounded menu owns secondary destinations; notifications and settings remain directly reachable. */
export function GlobalFeatureNavigation({
  locale,
  connected,
  hasWorkspace,
  onOpen,
  compact,
  onStatus,
  onCommands,
}: GlobalFeatureNavigationProps) {
  const copy = globalFeatureCopy(locale)
  const shell = getShellCopy(locale).shell
  type Action = GlobalFeaturePageId | 'status' | 'commands'
  return (
    <LumenActionMenu<Action>
      label={copy.navigation}
      labelVisible={!compact}
      items={[
        { id: 'status', label: shell.status },
        ...(['run-board', 'schedules', 'prompt-templates', 'onboarding'] as const).map((id) => ({
          id,
          label: copy.titles[id],
          disabled:
            (id === 'run-board' || id === 'schedules' || id === 'prompt-templates') && (!connected || !hasWorkspace),
        })),
        { id: 'commands', label: shell.commands },
      ]}
      onAction={(id) => (id === 'status' ? onStatus() : id === 'commands' ? onCommands() : onOpen(id))}
    />
  )
}
