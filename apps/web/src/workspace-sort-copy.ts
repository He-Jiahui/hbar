import type {
  HbarSidebarTimeLabels,
  WorkspaceHeaderOrganizationLabels,
  WorkspaceHeaderSortMenuLabels,
} from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export interface WorkspaceSortLabels extends WorkspaceHeaderSortMenuLabels {
  readonly capacityReached: string
  readonly sessionCapacityReached: string
  readonly organization: WorkspaceHeaderOrganizationLabels
  readonly time: HbarSidebarTimeLabels
  readonly reorder: {
    readonly moveUp: string
    readonly moveDown: string
    readonly dragHint: (name: string) => string
  }
}

export function workspaceSortCopy(locale: ShellLocale): WorkspaceSortLabels {
  const zh = locale === 'zh-CN'
  return {
    menu: zh ? '侧栏菜单' : 'Sidebar menu',
    sortCondition: zh ? '排序条件' : 'Sort condition',
    createdAt: zh ? '创建时间' : 'Created time',
    updatedAt: zh ? '更新时间' : 'Updated time',
    restoreHidden: (count) => (zh ? `恢复隐藏项目（${count}）` : `Restore hidden projects (${count})`),
    refresh: zh ? '刷新侧栏' : 'Refresh sidebar',
    updating: zh ? '正在更新侧栏…' : 'Updating sidebar…',
    reorder: {
      moveUp: zh ? '上移项目' : 'Move project up',
      moveDown: zh ? '下移项目' : 'Move project down',
      dragHint: (name) =>
        zh
          ? `拖动 ${name} 调整近期项目顺序；也可使用项目菜单上下移动。`
          : `Drag ${name} to reorder recent projects, or use the project menu to move up or down.`,
    },
    organization: {
      organize: zh ? '整理侧栏' : 'Organize sidebar',
      byProject: zh ? '按项目' : 'By project',
      recentProjects: zh ? '近期项目' : 'Recent projects',
      byTime: zh ? '按时间' : 'By time',
    },
    time: {
      title: zh ? '任务' : 'Tasks',
      showTime: zh ? '显示任务时间视图' : 'Show tasks by time',
      showProjects: zh ? '返回项目视图' : 'Return to projects',
      groups: {
        running: zh ? '进行中' : 'In progress',
        today: zh ? '今天' : 'Today',
        yesterday: zh ? '昨天' : 'Yesterday',
        last7Days: zh ? '过去 7 天' : 'Previous 7 days',
        last30Days: zh ? '过去 30 天' : 'Previous 30 days',
        earlier: zh ? '更早' : 'Earlier',
      },
      execution: {
        idle: '',
        queued: zh ? '排队中' : 'Queued',
        running: zh ? '运行中' : 'Running',
        waiting_approval: zh ? '等待授权' : 'Needs approval',
        cancelRequested: zh ? '正在停止' : 'Stopping',
      },
    },
    capacityReached: zh
      ? '已显示前 200 个项目和置顶项目。查找其他项目请使用项目选择器。'
      : 'Showing the first 200 projects and pinned projects. Use the project picker to find other projects.',
    sessionCapacityReached: zh
      ? '已达到侧栏会话显示上限。其他会话仍可通过聊天搜索打开。'
      : 'The sidebar session display limit has been reached. Other sessions remain available through chat search.',
  }
}
