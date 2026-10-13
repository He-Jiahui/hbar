import type { ShellLocale } from './shell-copy'

export interface SystemTerminalCopy {
  readonly title: string
  readonly open: string
  readonly retry: string
  readonly close: string
  readonly waiting: string
  readonly disconnected: string
  readonly unavailable: string
  readonly exited: string
  readonly invalidScope: string
  readonly confirmationPending: string
  readonly inputOverflow: string
  readonly outputReset: string
  readonly operationError: (code: string) => string
}

export function systemTerminalCopy(locale: ShellLocale): SystemTerminalCopy {
  const choose = (zh: string, en: string) => (locale === 'zh-CN' ? zh : en)
  return {
    title: choose('系统终端', 'System terminal'),
    open: choose('打开终端', 'Open terminal'),
    retry: choose('批准后重试', 'Retry after approval'),
    close: choose('关闭终端', 'Close terminal'),
    waiting: choose('正在连接工作区终端…', 'Connecting to the workspace terminal…'),
    disconnected: choose(
      '主机连接已断开。重连后可重新打开终端。',
      'Host disconnected. Reconnect to open the terminal again.',
    ),
    unavailable: choose('当前设备无权打开终端。', 'This device cannot open terminals.'),
    exited: choose('终端进程已退出。', 'The terminal process exited.'),
    invalidScope: choose('终端需要当前工作区中的会话。', 'A terminal needs a session in the current workspace.'),
    confirmationPending: choose(
      '节点需要本机确认。请在节点控制台批准，然后使用同一操作重试。',
      'The node needs local confirmation. Approve it in the node console, then retry this same operation.',
    ),
    inputOverflow: choose(
      '输入缓冲区已满，部分待发送输入已取消。请关闭终端后重新打开。',
      'The input queue is full and pending input was cancelled. Close and reopen the terminal.',
    ),
    outputReset: choose(
      '终端输出发生间隙，较早的内容已清除。',
      'Terminal output had a gap; earlier content was cleared.',
    ),
    operationError: (code) => choose(`终端操作失败：${code}`, `Terminal operation failed: ${code}`),
  }
}
