import {
  Clock3,
  Copy,
  FileText,
  Folder,
  Grid2X2,
  Hash,
  Keyboard,
  KeyRound,
  Palette,
  Settings2,
  UserRound,
  UsersRound,
  Workflow,
} from 'lucide-react'
import type { HbarAppUiCommandItem, HbarAppUiCommandListProps } from '../../packages/hbar-app-ui/src/command-menu'

export const COMMAND_LABELS: HbarAppUiCommandListProps['labels'] = {
  navigateKeys: '↑↓',
  executeKey: '↵',
  closeKey: 'Esc',
  search: 'Search or run a command',
  available: 'Available commands',
  empty: 'No matching commands',
  unavailable: 'This command is no longer available. Select another command.',
  navigate: 'to navigate',
  execute: 'to open',
  close: 'Close menu',
  count: (count) => (count === 1 ? '1 result' : `${count} results`),
}
export const GROUPED_COMMANDS: readonly HbarAppUiCommandItem[] = [
  {
    id: 'launch',
    group: 'Recent',
    label: 'Launch readiness review',
    description: 'Opened 6 minutes ago',
    shortcut: '1',
    icon: Clock3,
  },
  {
    id: 'incident',
    group: 'Recent',
    label: 'Incident 4821, checkout latency',
    description: 'Opened yesterday',
    shortcut: '2',
    icon: Clock3,
  },
  {
    id: 'roadmap',
    group: 'Recent',
    label: 'Q3 roadmap draft',
    description: 'Opened 2 days ago',
    shortcut: '3',
    icon: Clock3,
  },
  { id: 'overview', group: 'Navigation', label: 'Release overview', shortcut: 'G O', icon: Grid2X2 },
  { id: 'docs', group: 'Navigation', label: 'Runbooks and docs', shortcut: 'G D', icon: FileText },
  { id: 'team', group: 'Navigation', label: 'Team directory', shortcut: 'G P', icon: UsersRound },
  { id: 'settings', group: 'Navigation', label: 'Workspace settings', shortcut: 'G S', icon: Settings2 },
  {
    id: 'invite',
    group: 'Actions',
    label: 'Invite a teammate',
    description: 'Send a workspace invite by email',
    shortcut: 'I',
    icon: UserRound,
  },
  {
    id: 'schedule',
    group: 'Actions',
    label: 'Schedule a launch review',
    description: 'Hold a slot with product and infra',
    shortcut: 'S',
    icon: Clock3,
  },
  {
    id: 'rotate',
    group: 'Actions',
    label: 'Rotate an API key',
    description: 'Retire a key and issue a replacement',
    shortcut: 'R',
    icon: KeyRound,
  },
]
export const QUICK_COMMANDS: readonly HbarAppUiCommandItem[] = [
  { id: 'project', label: 'Switch project', description: 'Currently Northwind', icon: Workflow, navigates: true },
  { id: 'theme', label: 'Change theme', description: 'Currently system', icon: Palette, navigates: true },
  { id: 'status', label: 'Set your status', description: 'Currently active', icon: UserRound, navigates: true },
  { id: 'copy', label: 'Copy link to this view', icon: Copy },
  { id: 'keyboard', label: 'Open keyboard shortcuts', icon: Keyboard },
]
export const ROOM_COMMANDS: readonly HbarAppUiCommandItem[] = [
  { id: 'northwind', label: 'Northwind', description: 'Current room', icon: Hash, shortcut: '1' },
  { id: 'aurora', label: 'Aurora mobile', description: 'Active 4m ago', icon: Hash, shortcut: '2' },
  { id: 'ledger', label: 'Ledger billing', description: 'Active 1h ago', icon: Hash, shortcut: '3' },
  { id: 'atlas', label: 'Atlas search platform', description: 'Active yesterday', icon: Hash, shortcut: '4' },
  { id: 'relay', label: 'Relay notifications', description: 'Active 2 days ago', icon: Hash, shortcut: '5' },
  { id: 'vault', label: 'Vault access control', description: 'Active last week', icon: Hash, shortcut: '6' },
]
export const PROJECT_COMMANDS: readonly HbarAppUiCommandItem[] = [
  { id: 'project-northwind', label: 'Northwind', icon: Folder },
  { id: 'project-aurora', label: 'Aurora', icon: Folder },
]
export const COMMAND_PROJECT_LABELS = { home: 'Home', project: 'Project' }
