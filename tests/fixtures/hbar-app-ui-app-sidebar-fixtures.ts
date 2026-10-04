import type { HbarAppUiAppSidebarContent } from '../../packages/hbar-app-ui/src/index'

export const HBAR_APP_UI_APP_SIDEBAR_FIXTURES: HbarAppUiAppSidebarContent = {
  labels: {
    brand: 'Meridian',
    title: 'Workspace',
    open: 'Open navigation',
    close: 'Close navigation',
    collapse: 'Collapse sidebar',
    expand: 'Expand sidebar',
    theme: 'Theme',
    standard: 'Standard',
    profile: 'Open profile',
    status: 'Connected',
    statusValue: 'Operations host',
    flyoutHint: 'Hover an icon to reveal its submenu.',
    scope: 'Workspace scope',
    search: 'Search pinned',
    pinned: 'Pinned',
    contextual: 'Contextual panel',
    activity: 'Activity',
    files: 'Files',
    showActivity: 'Show activity',
    showFiles: 'Show files',
    tree: 'Navigation tree',
    menu: 'Open menu',
    content: 'Content region',
    empty: 'No navigation items',
  },
  groups: [
    {
      id: 'workspace',
      label: 'Workspace',
      items: [
        { id: 'command', label: 'Command center', badge: '8', detail: 'Operations overview' },
        { id: 'inbox', label: 'Inbox', badge: '12', detail: 'Assigned work' },
        { id: 'approvals', label: 'Approvals', badge: '5', detail: 'Waiting decisions' },
        { id: 'projects', label: 'Projects', detail: 'Shared projects' },
      ],
    },
    {
      id: 'insights',
      label: 'Insights',
      items: [
        { id: 'performance', label: 'Performance' },
        { id: 'usage', label: 'Usage' },
        { id: 'activity', label: 'Activity log' },
      ],
    },
    {
      id: 'account',
      label: 'Account',
      items: [
        { id: 'members', label: 'Members' },
        { id: 'billing', label: 'Billing' },
        { id: 'settings', label: 'Settings' },
      ],
    },
  ],
  initialItemId: 'command',
  rail: [
    { id: 'workspace', label: 'Workspace' },
    { id: 'members', label: 'Members' },
    { id: 'settings', label: 'Settings' },
  ],
  scopes: [
    { id: 'workspace', label: 'Workspace' },
    { id: 'atlas', label: 'Project Atlas' },
    { id: 'personal', label: 'Personal' },
  ],
  initialScopeId: 'workspace',
  pinned: [
    { id: 'overview', label: 'Overview' },
    { id: 'run', label: 'Current run' },
    { id: 'notes', label: 'Release notes' },
    { id: 'design', label: 'Design files' },
  ],
  contextItems: [
    { id: 'current', label: 'Current item' },
    { id: 'recent', label: 'Recent item' },
    { id: 'shared', label: 'Shared item' },
  ],
  tree: [
    {
      id: 'src',
      label: 'src/',
      children: [
        { id: 'app', label: 'App.tsx' },
        { id: 'activity-panel', label: 'ActivityPanel.tsx' },
      ],
    },
    {
      id: 'docs',
      label: 'docs/',
      children: [
        { id: 'architecture', label: 'architecture.md' },
        { id: 'testing', label: 'testing.md' },
      ],
    },
  ],
  profile: { name: 'Iris Renner', detail: 'Operations lead', avatar: 'IR' },
  listStrategy: { kind: 'pane-scroll', expectedMaximum: 64 },
}

export function createHbarAppUiAppSidebarLocalizedFixtures(): HbarAppUiAppSidebarContent {
  return {
    ...HBAR_APP_UI_APP_SIDEBAR_FIXTURES,
    labels: {
      ...HBAR_APP_UI_APP_SIDEBAR_FIXTURES.labels,
      brand: '子午线',
      title: '工作区',
      open: '打开导航',
      close: '关闭导航',
      status: '已连接',
      statusValue: '运营主机',
      empty: '没有导航项目',
    },
    groups: [{ id: 'workspace', label: '工作区', items: [{ id: 'overview', label: '指挥中心', detail: '运营概览' }] }],
    initialItemId: 'overview',
  }
}
