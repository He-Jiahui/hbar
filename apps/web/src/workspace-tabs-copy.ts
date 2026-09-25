import type { HbarWorkspaceTabsLabels } from '@hbar/app-react'
import type { HbarWorkspaceTabsCloseLabels } from '@hbar/app-react'

export function workspaceTabsCopy(choose: (zh: string, en: string) => string): {
  readonly tabs: HbarWorkspaceTabsLabels
  readonly close: HbarWorkspaceTabsCloseLabels
  readonly unknownSession: (id: string) => string
  readonly unknownWorkspace: (id: string) => string
  readonly restoring: string
  readonly retry: string
  readonly error: (code: string) => string
} {
  return {
    unknownSession: (id) => choose(`会话 ${id}`, `Conversation ${id}`),
    unknownWorkspace: (id) => choose(`项目 ${id}`, `Project ${id}`),
    restoring: choose('正在恢复页签…', 'Restoring tabs…'),
    retry: choose('重试', 'Retry'),
    error: (code) => {
      if (code === 'TAB_LIMIT')
        return choose('最多可打开 32 个页签。请先关闭一个。', 'You can open up to 32 tabs. Close one first.')
      if (code === 'STOP_PENDING')
        return choose(
          '停止请求已受理，任务尚未结束。请核对状态。',
          'Stop was requested but the run has not ended. Check its status.',
        )
      if (code === 'ACTIVITY_CHANGED')
        return choose('运行状态已变化，请重新核对。', 'Run activity changed. Check again.')
      if (code === 'ACTIVITY_LIMIT')
        return choose(
          '活动任务过多，无法一次确认停止。可保留运行并关闭页签。',
          'Too many active runs to stop together. You can keep them running and close the tabs.',
        )
      if (code === 'TIMEOUT' || code === 'RESULT_UNKNOWN' || code === 'DISCONNECTED')
        return choose(
          '目前无法确认结果，请核对状态或保留运行并关闭页签。',
          'The result is unconfirmed. Check the status or keep running and close the tabs.',
        )
      return choose(`页签操作未完成：${code}`, `Could not finish tab action: ${code}`)
    },
    tabs: {
      tabs: choose('打开的会话与工作台', 'Open conversations and workbenches'),
      empty: choose('没有打开的页签', 'No open tabs'),
      scrollLeft: choose('页签向左滚动', 'Scroll tabs left'),
      scrollRight: choose('页签向右滚动', 'Scroll tabs right'),
      close: (title) => choose(`关闭页签：${title}`, `Close tab: ${title}`),
      menu: (title) => choose(`页签操作：${title}`, `Tab actions: ${title}`),
      activity: (activity) =>
        activity === 'running'
          ? choose('正在运行', 'Running')
          : activity === 'unknown'
            ? choose('运行状态待核对', 'Run status unconfirmed')
            : choose('未在运行', 'Idle'),
      action: (scope) =>
        ({
          one: choose('关闭', 'Close'),
          others: choose('关闭其他', 'Close others'),
          left: choose('关闭左侧', 'Close to the left'),
          right: choose('关闭右侧', 'Close to the right'),
          all: choose('关闭所有', 'Close all'),
        })[scope],
    },
    close: {
      title: choose('关闭页签', 'Close tabs'),
      cancel: choose('取消', 'Cancel'),
      keepRunning: choose('保持运行并关闭页签', 'Keep running and close tabs'),
      stopAndClose: choose('停止并关闭页签', 'Stop and close tabs'),
      recheck: choose('核对运行状态', 'Check run status'),
      target: (title, count) =>
        count ? choose(`${title} · ${count} 个运行`, `${title} · ${count} ${count === 1 ? 'run' : 'runs'}`) : title,
      status: (status) =>
        ({
          checking: choose('正在核对这些页签的运行状态…', 'Checking these tabs for active runs…'),
          choice: choose(
            '这些会话仍在运行。关闭页签不会删除会话；你可以保持运行，或停止后关闭。',
            'These conversations are still running. Closing tabs does not delete them; keep them running or stop them before closing.',
          ),
          stopping: choose(
            '正在停止运行；确认完成后将关闭页签。',
            'Stopping runs; tabs will close after confirmation.',
          ),
          unknown: choose(
            '尚无法确认运行是否已停止。请先核对，不会重复发送停止请求。',
            'Whether the runs stopped is not yet confirmed. Check their status without sending another stop request.',
          ),
          failed: choose(
            '未能完成关闭。请查看错误后重试，或保持运行并关闭页签。',
            'Could not complete closing. Review the error and retry, or keep running and close the tabs.',
          ),
        })[status],
    },
  }
}
