import type { SessionAgentTreeLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'
import { workspaceSortCopy } from './workspace-sort-copy'

export function sessionAgentTreeCopy(locale: ShellLocale): SessionAgentTreeLabels {
  const zh = locale === 'zh-CN'
  return {
    expand: (title, count) =>
      zh ? `展开“${title}”的 ${count} 个子 agent` : `Expand ${count} child agents of “${title}”`,
    collapse: (title, count) =>
      zh ? `收起“${title}”的 ${count} 个子 agent` : `Collapse ${count} child agents of “${title}”`,
    children: (title) => (zh ? `“${title}”的子 agent` : `Child agents of “${title}”`),
    count: (count) => (zh ? `${count} 个子 agent` : `${count} child agents`),
    loading: zh ? '正在加载子 agent…' : 'Loading child agents…',
    empty: zh ? '暂无未归档的子 agent' : 'No unarchived child agents',
    noResponse: zh ? '尚未回复' : 'No response yet',
    loadMore: zh ? '加载更多子 agent' : 'Load more child agents',
    retry: zh ? '重新加载子 agent' : 'Retry child agents',
    capacity: zh
      ? '已达到当前加载上限。可先收起其他分组，再重新加载。'
      : 'The loading limit has been reached. Collapse another group, then retry.',
    error: (code) =>
      code === 'DISCONNECTED'
        ? zh
          ? '连接已断开；重新连接后会刷新。'
          : 'Disconnected; the list will refresh after reconnecting.'
        : code === 'CAPACITY_EXCEEDED'
          ? zh
            ? '展开的分组过多，请先收起其他分组。'
            : 'Too many expanded groups. Collapse another group first.'
          : zh
            ? `子 agent 加载失败（${code}）`
            : `Could not load child agents (${code})`,
    execution: workspaceSortCopy(locale).time.execution,
  }
}
