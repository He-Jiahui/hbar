import type { ShellLocale } from './shell-copy'

export interface RunBoardPageLabels {
  readonly title: string
  readonly description: string
  readonly refresh: string
  readonly loading: string
  readonly empty: string
  readonly emptyColumn: string
  readonly loadMore: string
  readonly pageLoadError: string
  readonly unknownFeedback: string
  readonly missingWorkspace: string
  readonly missingSession: string
  readonly staleRun: string
  readonly missingRun: string
  readonly operationFailed: string
  readonly columnLabel: (status: string) => string
  readonly statusLabel: (status: string) => string
  readonly cardLabel: (title: string, status: string) => string
  readonly usageLabel: (value: string) => string
  readonly planLabel: (value: string) => string
  readonly count: (count: number) => string
  readonly openRun: (title: string) => string
  readonly cancelRun: (title: string) => string
  readonly retryRun: (title: string) => string
  readonly boardDetail: (count: number) => string
  readonly add: (column: string) => string
  readonly newCard: string
  readonly move: string
  readonly theme: string
  readonly standard: string
  readonly participants: string
  readonly board: string
  readonly swimlaneTitle: string
  readonly swimlaneDetail: string
  readonly workstream: string
  readonly regroupTitle: string
  readonly regroupDetail: string
  readonly groupBy: string
  readonly detailTitle: string
  readonly detailDetail: string
  readonly addCard: string
  readonly properties: string
  readonly assignee: string
  readonly priority: string
  readonly activity: string
  readonly save: string
  readonly sprintTitle: string
  readonly sprintDetail: string
  readonly blocked: string
  readonly capacity: (label: string) => string
  readonly moved: string
  readonly compactTitle: string
  readonly compactDetail: string
  readonly column: string
  readonly steps: string
  readonly nextStep: string
  readonly more: string
}

export function runBoardCopy(locale: ShellLocale): RunBoardPageLabels {
  const zh = locale === 'zh-CN'
  return {
    title: zh ? '运行看板' : 'Run board', description: zh ? '查看当前工作区的运行状态' : 'Inspect runs in the current workspace', refresh: zh ? '刷新' : 'Refresh', loading: zh ? '正在加载运行' : 'Loading runs', empty: zh ? '暂无运行' : 'No runs', emptyColumn: zh ? '此列暂无运行' : 'No runs in this column', loadMore: zh ? '加载更多' : 'Load more', pageLoadError: zh ? '运行看板加载失败' : 'Run board failed to load', unknownFeedback: zh ? '操作结果未知，请刷新确认' : 'The operation result is unknown; refresh to confirm', missingWorkspace: zh ? '工作区名称不可用' : 'Workspace name unavailable', missingSession: zh ? '会话名称不可用' : 'Session name unavailable', staleRun: zh ? '运行已过期，请刷新' : 'Run is stale; refresh to continue', missingRun: zh ? '运行已不存在' : 'Run is no longer available', operationFailed: zh ? '操作失败' : 'Operation failed', columnLabel: (status) => zh ? ({ queued: '排队中', running: '运行中', waiting_approval: '等待批准', guided: '等待引导', completed: '已完成', cancelled: '已取消', failed: '失败', interrupted: '已中断' } as Record<string, string>)[status] ?? status : status.replace('_', ' '), statusLabel: (status) => zh ? ({ queued: '排队中', running: '运行中', waiting_approval: '等待批准', guided: '等待引导', completed: '已完成', cancelled: '已取消', failed: '失败', interrupted: '已中断' } as Record<string, string>)[status] ?? status : status.replace('_', ' '), cardLabel: (title, status) => `${title} · ${status}`, usageLabel: (value) => zh ? `用量 ${value}` : `Usage ${value}`, planLabel: (value) => zh ? `计划 ${value}` : `Plan ${value}`, count: (count) => zh ? `${count} 个运行` : `${count} runs`, openRun: (title) => zh ? `打开 ${title}` : `Open ${title}`, cancelRun: (title) => zh ? `取消 ${title}` : `Cancel ${title}`, retryRun: (title) => zh ? `重试 ${title}` : `Retry ${title}`, boardDetail: (count) => zh ? `${count} 个运行` : `${count} runs`, add: (column) => `${column}`, newCard: '', move: '', theme: '', standard: '', participants: zh ? '参与者' : 'Participants', board: zh ? '运行看板' : 'Run board', swimlaneTitle: '', swimlaneDetail: '', workstream: '', regroupTitle: '', regroupDetail: '', groupBy: '', detailTitle: '', detailDetail: '', addCard: '', properties: '', assignee: '', priority: '', activity: '', save: '', sprintTitle: '', sprintDetail: '', blocked: '', capacity: (label) => label, moved: '', compactTitle: '', compactDetail: '', column: '', steps: '', nextStep: '', more: '',
  }
}
