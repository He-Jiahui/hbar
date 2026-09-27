import type { HbarSessionWorkspaceLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function composerExecutionCopy(
  locale: ShellLocale,
): HbarSessionWorkspaceLabels['permissionPicker']['execution'] {
  const zh = locale === 'zh-CN'
  return {
    loading: zh ? '正在读取执行模式…' : 'Loading execution mode…',
    pending: zh ? '正在切换执行模式…' : 'Changing execution mode…',
    checking: zh ? '正在核对执行模式…' : 'Checking execution mode…',
    unknown: zh ? '执行模式未确认' : 'Execution mode unconfirmed',
    failed: zh ? '执行模式未能确认' : 'Execution mode unavailable',
    approvalFrozen: zh
      ? '确认执行模式后才能调整审批选项。之前的审批选择已保留。'
      : 'Confirm the execution mode before changing approval options. Your previous approval choice is retained.',
    checkFailed: zh
      ? '执行模式仍未确认。请重新核对原切换结果；不会重复切换。'
      : 'The execution mode remains unconfirmed. Check the original change again without repeating it.',
    readFailed: zh
      ? '未能确认执行模式。请重新读取，确认前不会更改审批选择。'
      : 'The execution mode could not be confirmed. Retry the read; your approval choice stays unchanged until it is confirmed.',
  }
}
