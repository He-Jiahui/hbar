import type { HbarAppUiShellLabels } from 'hbar-app-ui'
import type { SupportedLocale } from './locale'

interface WorkbenchCopy {
  readonly shell: HbarAppUiShellLabels
  readonly sessions: string
  readonly files: string
  readonly activity: string
  readonly settings: string
  readonly reconnecting: string
  readonly host: string
  readonly windowsHost: string
}

const workbenchCopy: Readonly<Record<SupportedLocale, WorkbenchCopy>> = {
  'zh-CN': {
    shell: {
      toggleSidebar: '会话侧栏',
      workspace: '选择工作区',
      addWorkspace: '添加工作区',
      commands: '打开命令面板',
      navigation: '导航',
    },
    sessions: '会话',
    files: '文件',
    activity: '运行与事件',
    settings: '设置',
    reconnecting: '重新连接中',
    host: 'Host',
    windowsHost: 'Windows Host',
  },
  'en-US': {
    shell: {
      toggleSidebar: 'Session sidebar',
      workspace: 'Select workspace',
      addWorkspace: 'Add workspace',
      commands: 'Open command palette',
      navigation: 'Navigation',
    },
    sessions: 'Sessions',
    files: 'Files',
    activity: 'Runs and events',
    settings: 'Settings',
    reconnecting: 'Reconnecting',
    host: 'Host',
    windowsHost: 'Windows Host',
  },
}

export function getWorkbenchCopy(locale: SupportedLocale): WorkbenchCopy {
  return workbenchCopy[locale]
}
