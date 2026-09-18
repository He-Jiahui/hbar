import type { HbarWorkspaceShellLabels } from '@hbar/app-react'

export type ShellLocale = 'zh-CN' | 'en-US'
interface ShellCopy {
  readonly shell: HbarWorkspaceShellLabels
  readonly empty: { readonly title: string; readonly description: string }
  readonly selectedSession: (title: string) => string
  readonly panels: Readonly<
    Record<'commands' | 'status' | 'settings', { readonly title: string; readonly description: string }>
  >
}

const copies: Readonly<Record<ShellLocale, ShellCopy>> = {
  'zh-CN': {
    shell: {
      main: '工作台',
      brand: 'hbar',
      projectsAndSessions: '工程与会话',
      noWorkspaces: '尚无工程',
      noSessions: '尚无会话',
      loading: '正在加载',
      loadMore: '加载更多',
      commands: '命令',
      status: '状态中心',
      settings: '设置',
      server: '服务端',
      connected: '已连接',
      disconnected: '未连接',
      reconnect: '重新连接',
      expandWorkspace: (name) => `展开工程 ${name}`,
      collapseWorkspace: (name) => `折叠工程 ${name}`,
      openSession: (name) => `打开会话 ${name}`,
      error: (code) => `加载失败：${code}`,
    },
    empty: { title: '选择一个会话', description: '从左侧工程列表选择会话以打开工作区。' },
    selectedSession: (title) => `当前会话：${title}`,
    panels: {
      commands: { title: '命令', description: '分类命令面板将在此区域打开。' },
      status: { title: '状态中心', description: 'Performance、Usage 与 Git 状态将在此区域显示。' },
      settings: { title: '设置', description: 'Schema 设置工作台将在此区域打开。' },
    },
  },
  'en-US': {
    shell: {
      main: 'Workspace',
      brand: 'hbar',
      projectsAndSessions: 'Projects and sessions',
      noWorkspaces: 'No projects yet',
      noSessions: 'No sessions yet',
      loading: 'Loading',
      loadMore: 'Load more',
      commands: 'Commands',
      status: 'Status center',
      settings: 'Settings',
      server: 'Server',
      connected: 'Connected',
      disconnected: 'Disconnected',
      reconnect: 'Reconnect',
      expandWorkspace: (name) => `Expand project ${name}`,
      collapseWorkspace: (name) => `Collapse project ${name}`,
      openSession: (name) => `Open session ${name}`,
      error: (code) => `Loading failed: ${code}`,
    },
    empty: { title: 'Select a session', description: 'Choose a session from the project list to open its workspace.' },
    selectedSession: (title) => `Current session: ${title}`,
    panels: {
      commands: { title: 'Commands', description: 'The categorized command palette opens in this region.' },
      status: { title: 'Status center', description: 'Performance, Usage, and Git status appear in this region.' },
      settings: { title: 'Settings', description: 'The schema settings workspace opens in this region.' },
    },
  },
}

export function getShellCopy(locale: ShellLocale): ShellCopy {
  return copies[locale]
}

export function resolveShellLocale(languages: readonly string[]): ShellLocale {
  for (const language of languages) {
    if (/^zh(?:-|$)/i.test(language)) return 'zh-CN'
    if (/^en(?:-|$)/i.test(language)) return 'en-US'
  }
  return 'zh-CN'
}
