import {
  Activity,
  Folder,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings2,
  TerminalSquare,
} from 'lucide-react'
import type { PaletteCommand } from '../command-model'
import type { SupportedLocale } from '../locale'

export type WorkbenchCommandId =
  | 'new-session'
  | 'toggle-sidebar'
  | 'open-files'
  | 'open-terminal'
  | 'open-settings'
  | 'open-activity'
  | 'restore-layout'
interface CommandDescriptor {
  readonly id: WorkbenchCommandId
  readonly labels: Readonly<Record<SupportedLocale, { readonly title: string; readonly description: string }>>
  readonly keywords: readonly string[]
  readonly icon: NonNullable<PaletteCommand['icon']>
}
/** Workbench modules declare stable command IDs independently of their rendered rows. */
const descriptors: readonly CommandDescriptor[] = [
  {
    id: 'new-session',
    icon: Plus,
    keywords: ['session', 'create'],
    labels: {
      'zh-CN': { title: '新建会话', description: '在当前项目创建一个会话' },
      'en-US': { title: 'New session', description: 'Create a session in this workspace' },
    },
  },
  {
    id: 'toggle-sidebar',
    icon: PanelLeftOpen,
    keywords: ['sidebar', 'navigation'],
    labels: {
      'zh-CN': { title: '展开项目与会话栏', description: '' },
      'en-US': { title: 'Show workspace sidebar', description: '' },
    },
  },
  {
    id: 'open-files',
    icon: Folder,
    keywords: ['file', 'files'],
    labels: {
      'zh-CN': { title: '打开文件', description: '浏览当前项目文件' },
      'en-US': { title: 'Open files', description: 'Browse files in the current workspace' },
    },
  },
  {
    id: 'open-terminal',
    icon: TerminalSquare,
    keywords: ['terminal', 'console'],
    labels: {
      'zh-CN': { title: '打开命令控制台', description: '在底部展开 AI 命令控制台' },
      'en-US': { title: 'Open command console', description: 'Open the AI command console' },
    },
  },
  {
    id: 'open-settings',
    icon: Settings2,
    keywords: ['settings', 'preferences', 'theme'],
    labels: {
      'zh-CN': { title: '打开设置', description: '模型、权限、外观与设备' },
      'en-US': { title: 'Open settings', description: 'Models, permissions, appearance and devices' },
    },
  },
  {
    id: 'open-activity',
    icon: Activity,
    keywords: ['activity', 'events', 'runs'],
    labels: {
      'zh-CN': { title: '打开运行与事件', description: '查看当前会话运行状态' },
      'en-US': { title: 'Open runs and events', description: 'Inspect execution in the current session' },
    },
  },
  {
    id: 'restore-layout',
    icon: LayoutGrid,
    keywords: ['layout', 'reset', 'restore'],
    labels: {
      'zh-CN': { title: '恢复默认布局', description: '重置工具区和标签位置' },
      'en-US': { title: 'Restore default layout', description: 'Reset tool panes and tab positions' },
    },
  },
]
export function workbenchCommands(
  locale: SupportedLocale,
  sidebarOpen: boolean,
  actions: Readonly<Record<WorkbenchCommandId, () => void | Promise<void>>>,
): readonly PaletteCommand[] {
  return descriptors.map((item) => ({
    id: item.id,
    label:
      item.id === 'toggle-sidebar' && sidebarOpen
        ? locale === 'zh-CN'
          ? '收起项目与会话栏'
          : 'Hide workspace sidebar'
        : item.labels[locale].title,
    description: item.labels[locale].description,
    keywords: item.keywords,
    icon: item.id === 'toggle-sidebar' && sidebarOpen ? PanelLeftClose : item.icon,
    execute: actions[item.id],
  }))
}
