import type { HbarAppUiAppShellContent } from '../../packages/hbar-app-ui/src/index'

export const HBAR_APP_UI_APP_SHELL_FIXTURES: HbarAppUiAppShellContent = {
  labels: {
    brand: 'hbar workspace',
    title: 'Workspace overview',
    detail: 'October reconciliation · production',
    navigation: 'Workspace navigation',
    toggleNavigation: 'Toggle navigation',
    closeNavigation: 'Close navigation',
    search: 'Search workspace',
    connected: 'Connected',
    records: 'Recent records',
    context: 'Context',
    showContext: 'Show context',
    hideContext: 'Hide context',
    files: 'Files',
    save: 'Save',
    bold: 'Bold',
    italic: 'Italic',
    code: 'Code',
    link: 'Link',
    scopes: 'Workspace scopes',
    frameSize: 'Frame size',
    messages: 'Threads',
    model: 'Model',
    composer: 'Ask the workspace assistant',
    send: 'Send message',
    empty: 'Nothing to show',
    emptyRecords: 'No workspace records',
  },
  navigation: [
    { id: 'overview', label: 'Overview' },
    { id: 'sessions', label: 'Sessions', badge: '12' },
    { id: 'files', label: 'Files' },
    { id: 'settings', label: 'Settings' },
  ],
  initialNavigationId: 'overview',
  metrics: [
    { id: 'tasks', label: 'Active tasks', value: '24' },
    { id: 'reviews', label: 'Reviews', value: '04', tone: 'warning' },
    { id: 'usage', label: 'Usage', value: '64%' },
  ],
  records: [
    {
      id: 'invoices',
      label: 'Invoice reconciliation',
      detail: 'Updated 2m ago',
      status: 'Needs review',
      tone: 'warning',
    },
    { id: 'sync', label: 'Workspace sync', detail: 'Healthy', status: 'Connected', tone: 'success' },
    { id: 'release', label: 'Release review', detail: 'Draft', status: 'Open', tone: 'neutral' },
    { id: 'usage', label: 'Usage alert', detail: '64% of monthly budget', status: 'Tracking', tone: 'neutral' },
  ],
  initialRecordId: 'invoices',
  workspaces: [
    { id: 'northwind', label: 'Northwind Production' },
    { id: 'meridian', label: 'Meridian Staging' },
  ],
  initialWorkspaceId: 'northwind',
  context: [
    { id: 'attachments', label: 'Attachments', detail: '4 files' },
    { id: 'tools', label: 'Tools', detail: '2 connected' },
    { id: 'approvals', label: 'Approvals', detail: '1 waiting' },
  ],
  files: [
    { id: 'readme', label: 'README.md' },
    { id: 'architecture', label: 'docs/architecture.md' },
    { id: 'testing', label: 'docs/testing.md' },
  ],
  initialFileId: 'readme',
  documentValue: '# Workspace notes\n\nCapture decisions and context here.',
  scopes: [
    {
      id: 'organization',
      label: 'Organization',
      options: [{ id: 'default-org', label: 'Kepler Works' }],
      initialOptionId: 'default-org',
    },
    {
      id: 'project',
      label: 'Project',
      options: [
        { id: 'ledger', label: 'Ledger' },
        { id: 'reports', label: 'Reports' },
      ],
      initialOptionId: 'ledger',
    },
    {
      id: 'environment',
      label: 'Environment',
      options: [
        { id: 'production', label: 'Production' },
        { id: 'staging', label: 'Staging' },
      ],
      initialOptionId: 'production',
    },
  ],
  views: [
    { id: 'mobile', label: 'Mobile' },
    { id: 'tablet', label: 'Tablet' },
    { id: 'desktop', label: 'Desktop' },
  ],
  initialViewId: 'desktop',
  threads: [
    { id: 'october', label: 'October reconciliation' },
    { id: 'handoff', label: 'Release handoff' },
    { id: 'activity', label: 'Recent activity' },
  ],
  initialThreadId: 'october',
  models: [
    { id: 'balanced', label: 'Balanced' },
    { id: 'fast', label: 'Fast' },
    { id: 'reasoning', label: 'Reasoning' },
  ],
  initialModelId: 'balanced',
  messages: [
    { id: 'assistant', label: 'Assistant', detail: 'How can I help with this workspace?' },
    { id: 'context', label: 'Pinned context', detail: '3 files · 1 active run' },
  ],
  listStrategy: { kind: 'pane-scroll', expectedMaximum: 80 },
}

export function createHbarAppUiAppShellLocalizedFixtures(): HbarAppUiAppShellContent {
  return {
    ...HBAR_APP_UI_APP_SHELL_FIXTURES,
    labels: {
      ...HBAR_APP_UI_APP_SHELL_FIXTURES.labels,
      brand: '光栅工作台',
      title: '工作区概览',
      detail: '十月对账 · 生产环境',
      navigation: '工作区导航',
      toggleNavigation: '切换导航',
      closeNavigation: '关闭导航',
      search: '搜索工作区',
      connected: '已连接',
      emptyRecords: '没有工作区记录',
    },
    navigation: [{ id: 'overview', label: '概览' }],
    records: [{ id: 'invoice', label: '发票对账', detail: '两分钟前更新' }],
    initialRecordId: 'invoice',
  }
}
