import { Activity, Folder, MessageSquare, Settings2 } from 'lucide-react'
import type { HbarAppUiNavigationItem, HbarAppUiShellLabels } from '../../packages/hbar-app-ui/src/production'

export const SHELL_FIXTURE = {
  brand: 'hbar',
  connection: { label: 'Connected', connected: true },
  labels: {
    toggleSidebar: 'Toggle navigation',
    workspace: 'Select workspace',
    addWorkspace: 'Add workspace',
    commands: 'Search commands',
    navigation: 'Workspace navigation',
  } satisfies HbarAppUiShellLabels,
  workspaces: [
    { id: 'atlas', label: 'Project Atlas' },
    { id: 'personal', label: 'Personal workspace' },
  ],
  navigation: [
    { id: 'sessions', label: 'Sessions', icon: MessageSquare },
    { id: 'files', label: 'Files', icon: Folder },
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings2 },
  ] satisfies readonly HbarAppUiNavigationItem[],
  title: 'Workspace content',
  detail: 'Select a workspace or navigate to another page.',
}
