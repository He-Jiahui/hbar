import type { WorkspaceHeaderSortMenuLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export interface WorkspaceSortLabels extends WorkspaceHeaderSortMenuLabels {
  readonly capacityReached: string
  readonly sessionCapacityReached: string
}

export function workspaceSortCopy(locale: ShellLocale): WorkspaceSortLabels {
  const zh = locale === 'zh-CN'
  return {
    menu: zh ? '项目菜单' : 'Projects menu',
    sortCondition: zh ? '排序条件' : 'Sort condition',
    createdAt: zh ? '创建时间' : 'Created time',
    updatedAt: zh ? '更新时间' : 'Updated time',
    restoreHidden: (count) => (zh ? `恢复隐藏项目（${count}）` : `Restore hidden projects (${count})`),
    refresh: zh ? '刷新侧栏' : 'Refresh sidebar',
    updating: zh ? '正在更新排序…' : 'Updating sort…',
    capacityReached: zh
      ? '已显示前 200 个项目和置顶项目。查找其他项目请使用项目选择器。'
      : 'Showing the first 200 projects and pinned projects. Use the project picker to find other projects.',
    sessionCapacityReached: zh
      ? '已达到侧栏会话显示上限。其他会话仍可通过聊天搜索打开。'
      : 'The sidebar session display limit has been reached. Other sessions remain available through chat search.',
  }
}
