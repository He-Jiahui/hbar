import {
  Activity,
  CalendarDays,
  Blocks,
  ChevronDown,
  ChevronRight,
  Command,
  Folder,
  FolderOpen,
  ListChecks,
  Menu,
  PanelLeftClose,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SquarePen,
  type LucideIcon,
} from 'lucide-react'
import { LumenIcon, LumenSidebarAction, type LumenIconTier, type LumenSidebarActionProps } from '@lumen/app-ui'

import './lumen-workspace-shell.css'
import './sidebar-entry-layout.css'
import './workspace-session-entry.css'
import './sidebar-navigation.css'

const workspaceShellIcons = {
  activity: Activity,
  blocks: Blocks,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  command: Command,
  folder: Folder,
  'folder-open': FolderOpen,
  menu: Menu,
  'panel-close': PanelLeftClose,
  pin: Pin,
  plus: Plus,
  refresh: RefreshCw,
  search: Search,
  'list-checks': ListChecks,
  settings: Settings,
  calendar: CalendarDays,
  'new-session': SquarePen,
} satisfies Readonly<Record<string, LucideIcon>>
type WorkspaceShellIconName = keyof typeof workspaceShellIcons
export function WorkspaceShellIcon({
  name,
  tier = 'md',
}: {
  readonly name: WorkspaceShellIconName
  readonly tier?: LumenIconTier
}) {
  return <LumenIcon icon={workspaceShellIcons[name]} tier={tier} />
}
export function WorkspaceSidebarAction({
  icon,
  ...props
}: Omit<LumenSidebarActionProps, 'icon'> & { readonly icon: WorkspaceShellIconName }) {
  return <LumenSidebarAction {...props} icon={<WorkspaceShellIcon name={icon} />} />
}
