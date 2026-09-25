import type { HbarWorkspaceTabsLabels } from '@hbar/app-react'
import type { HbarWorkspaceTabsCloseLabels } from '@hbar/app-react'

export function workspaceTabsCopy(choose: (zh: string, en: string) => string): {
  readonly tabs: HbarWorkspaceTabsLabels
  readonly close: HbarWorkspaceTabsCloseLabels
} {
  return {
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
