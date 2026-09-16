type SupportedLocale = 'zh-CN' | 'en-US'
import type { HbarAppUiCommandListProps } from '../../packages/hbar-app-ui/src/command-menu'
const labels: Readonly<Record<SupportedLocale, HbarAppUiCommandListProps['labels']>> = {
  'zh-CN': {
    navigateKeys: '↑↓',
    executeKey: '↵',
    closeKey: 'Esc',
    search: '搜索命令',
    available: '可用命令',
    empty: '没有匹配命令',
    unavailable: '原先选中的命令已不可用，请重新选择。',
    navigate: '选择',
    execute: '执行',
    close: '关闭',
    count: (count) => `${count} 个命令`,
  },
  'en-US': {
    navigateKeys: '↑↓',
    executeKey: '↵',
    closeKey: 'Esc',
    search: 'Search commands',
    available: 'Available commands',
    empty: 'No matching commands',
    unavailable: 'The selected command is no longer available. Please select again.',
    navigate: 'Navigate',
    execute: 'Run',
    close: 'Close',
    count: (count) => (count === 1 ? '1 command' : `${count} commands`),
  },
}
export const getCommandCopy = (locale: SupportedLocale) => labels[locale]
