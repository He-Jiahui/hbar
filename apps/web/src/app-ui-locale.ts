import type {
  HbarAppUiShellLabels,
  HbarAppUiSessionLabels,
  HbarAppUiWorkspaceFileLabels,
  HbarAppUiPromptLabels,
} from 'hbar-app-ui'
import type { SupportedLocale } from './locale'

interface WorkbenchCopy {
  readonly shell: HbarAppUiShellLabels
  readonly sessions: string
  readonly files: string
  readonly activity: string
  readonly settings: string
  readonly chat: string
  readonly runs: string
  readonly terminal: string
  readonly plugins: string
  readonly reconnecting: string
  readonly host: string
  readonly windowsHost: string
}

const workspaceFileCopy: Readonly<Record<SupportedLocale, HbarAppUiWorkspaceFileLabels>> = {
  'zh-CN': {
    title: '文件',
    parent: '上级目录',
    refresh: '刷新文件',
    loading: '正在读取…',
    empty: '目录为空',
    retry: '重试',
    readOnly: '只读',
  },
  'en-US': {
    title: 'Files',
    parent: 'Parent directory',
    refresh: 'Refresh files',
    loading: 'Loading…',
    empty: 'This directory is empty',
    retry: 'Retry',
    readOnly: 'Read only',
  },
}
export function getWorkspaceFileCopy(locale: SupportedLocale): HbarAppUiWorkspaceFileLabels {
  return workspaceFileCopy[locale]
}

export function getPromptCopy(locale: SupportedLocale, archived: boolean, running: boolean): HbarAppUiPromptLabels {
  return locale === 'zh-CN'
    ? {
        input: '消息',
        placeholder: archived ? '会话已归档' : '发送消息…',
        send: '发送',
        submitTitle: running ? '加入队列' : '发送',
        stop: '停止运行',
        uploading: '上传中',
        removeAttachment: (attachment) => (attachment.kind === 'image' ? '移除图片' : `移除文件 ${attachment.name}`),
      }
    : {
        input: 'Message',
        placeholder: archived ? 'Session archived' : 'Send a message…',
        send: 'Send',
        submitTitle: running ? 'Add to queue' : 'Send',
        stop: 'Stop run',
        uploading: 'Uploading',
        removeAttachment: (attachment) => `Remove ${attachment.kind} ${attachment.name}`,
      }
}
export function getMessageCopy(locale: SupportedLocale) {
  return locale === 'zh-CN'
    ? { user: '你', assistant: 'hbar', userAvatar: 'U', assistantAvatar: 'h', copy: '复制消息', thinking: '思考过程' }
    : {
        user: 'You',
        assistant: 'hbar',
        userAvatar: 'U',
        assistantAvatar: 'h',
        copy: 'Copy message',
        thinking: 'Thinking',
      }
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
    chat: '对话',
    runs: '运行',
    terminal: '终端',
    plugins: '插件',
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
    chat: 'Chat',
    runs: 'Runs',
    terminal: 'Terminal',
    plugins: 'Plugins',
    reconnecting: 'Reconnecting',
    host: 'Host',
    windowsHost: 'Windows Host',
  },
}

export function getWorkbenchCopy(locale: SupportedLocale): WorkbenchCopy {
  return workbenchCopy[locale]
}

export function getSessionNavigatorCopy(
  locale: SupportedLocale,
  archived: boolean,
  searching: boolean,
): {
  readonly labels: HbarAppUiSessionLabels
  readonly date: (timestamp: number, branch: boolean) => string
} {
  const chinese = locale === 'zh-CN'
  return {
    labels: chinese
      ? {
          title: archived ? '已归档' : '会话',
          search: '搜索会话',
          create: '新建会话',
          empty: searching ? '没有匹配会话' : archived ? '没有归档会话' : '暂无会话',
          archiveFilter: archived ? '活动会话' : '已归档会话',
          fork: (title) => `创建分支 ${title}`,
          archive: (title) => `${archived ? '恢复' : '归档'} ${title}`,
          rename: (title) => `重命名 ${title}`,
          name: '会话名称',
          save: '保存',
          cancel: '取消',
        }
      : {
          title: archived ? 'Archived' : 'Sessions',
          search: 'Search sessions',
          create: 'New session',
          empty: searching ? 'No matching sessions' : archived ? 'No archived sessions' : 'No sessions yet',
          archiveFilter: archived ? 'Active sessions' : 'Archived sessions',
          fork: (title) => `Fork ${title}`,
          archive: (title) => `${archived ? 'Restore' : 'Archive'} ${title}`,
          rename: (title) => `Rename ${title}`,
          name: 'Session name',
          save: 'Save',
          cancel: 'Cancel',
        },
    date: (timestamp, branch) =>
      new Date(timestamp).toLocaleDateString(locale, { month: 'short', day: 'numeric' }) +
      (branch ? (chinese ? ' · 分支' : ' · Branch') : ''),
  }
}
