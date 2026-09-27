import type { HbarSessionWorkspaceLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function composerGoalRecoveryCopy(locale: ShellLocale): HbarSessionWorkspaceLabels['intent']['recovery'] {
  const zh = locale === 'zh-CN'
  return {
    unknown: zh
      ? '原目标操作尚未确认。请核对当前状态，不会重新执行。'
      : 'The original Goal action is unconfirmed. Check the current state without repeating it.',
    checking: zh ? '正在核对原目标操作…' : 'Checking the original Goal action…',
    waiting: zh
      ? '原核对请求仍在等待结果，请稍候。不会重复执行目标操作。'
      : 'The original check is still waiting. The Goal action will not be repeated.',
    failed: zh
      ? '未能读取目标状态，原操作仍未确认。请重试核对。'
      : 'The Goal state could not be read, so the original action remains unconfirmed. Try checking again.',
    offline: zh
      ? '连接已中断。原操作会保留，重连后可继续核对。'
      : 'Disconnected. The original action is retained; reconnect to check its result.',
    reconcile: zh ? '核对原目标操作' : 'Check original Goal action',
  }
}
