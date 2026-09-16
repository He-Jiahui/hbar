import type { HbarAppUiAppSidebarProps, HbarAppUiWorkbenchNoticeProps } from 'hbar-app-ui/workbench'

export type ShellLocale = 'zh-CN' | 'en-US'
interface ShellCopy {
  readonly main: string
  readonly sidebar: Pick<HbarAppUiAppSidebarProps, 'brand' | 'title' | 'emptyLabel' | 'status'>
  readonly notice: HbarAppUiWorkbenchNoticeProps
}

const copies: Readonly<Record<ShellLocale, ShellCopy>> = {
  'zh-CN': {
    main: '工作台',
    sidebar: {
      brand: 'hbar',
      title: '工程与会话',
      emptyLabel: '会话列表暂不可用',
      status: { label: '服务端', value: '未连接' },
    },
    notice: {
      title: '工作台正在重建',
      description: '当前网页暂不提供会话操作。已有数据保留，可继续使用 CLI。',
      command: { label: '在项目目录打开 CLI', value: 'bun run cli' },
    },
  },
  'en-US': {
    main: 'Workspace',
    sidebar: {
      brand: 'hbar',
      title: 'Projects and sessions',
      emptyLabel: 'The session list is temporarily unavailable',
      status: { label: 'Server', value: 'Not connected' },
    },
    notice: {
      title: 'The workspace is being rebuilt',
      description:
        'Session controls are temporarily unavailable on the web. Your data is retained; use the CLI to continue.',
      command: { label: 'Open the CLI from the project directory', value: 'bun run cli' },
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
