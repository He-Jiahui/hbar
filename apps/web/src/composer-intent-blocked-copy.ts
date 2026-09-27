import type { HbarSessionWorkspaceLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'
import { composerGoalRecoveryCopy } from './composer-goal-recovery-copy'
import { composerExecutionCopy } from './composer-execution-copy'

/** Explain preparation blockers without conflating durable Plan, Goal facts and in-flight receipts. */
export function composerIntentBlockedCopy(locale: ShellLocale): HbarSessionWorkspaceLabels['intent']['blocked'] {
  const zh = locale === 'zh-CN'
  return {
    goalRecovery: composerGoalRecoveryCopy(locale),
    title: zh ? '准备目标' : 'Prepare a Goal',
    close: zh ? '关闭目标准备说明' : 'Close Goal preparation help',
    reasons: {
      plan: zh
        ? '此会话仍在计划模式。先退出计划模式，再点击“目标”准备本次输入；退出不会自动创建目标。'
        : 'This session is in Plan mode. Exit Plan mode, then choose Goal to prepare this prompt. Exiting does not create a Goal.',
      existingGoal: zh
        ? '此会话已有未完成的目标。请从会话标题下的当前目标摘要查看或管理它。'
        : 'This session already has an unfinished Goal. Review or manage it from the current Goal summary below the session heading.',
      goalLoading: zh ? '正在确认此会话的当前目标，请稍候。' : 'Checking this session’s current Goal. Please wait.',
      goalFailed: zh
        ? '未能读取此会话的当前目标。重新读取后才能准备新目标。'
        : 'The current Goal could not be read. Reload it before preparing a new Goal.',
      planLoading: zh ? '正在确认此会话的执行模式，请稍候。' : 'Checking this session’s execution mode. Please wait.',
      planFailed: zh
        ? '未能确认此会话的执行模式。请重新读取模式。'
        : 'This session’s execution mode could not be confirmed. Reload the mode.',
      planUnknown: zh
        ? '此前模式更改尚未确认。只能核对原结果，不能再次更改或准备目标。'
        : 'The previous mode change is unconfirmed. Check its result before changing the mode or preparing a Goal.',
      composerUnknown: zh
        ? '此前目标或发送操作尚未确认。请核对原操作，不会重新发送。'
        : 'The previous Goal or send operation is unconfirmed. Check the original operation; it will not be resent.',
      busy: zh ? '当前发送或准备操作尚未结束，请稍候。' : 'A send or preparation is still in progress. Please wait.',
      offline: zh
        ? '连接服务端后才能确认并准备目标。原稿会保留。'
        : 'Reconnect to confirm and prepare a Goal. Your draft is retained.',
      readonly: zh
        ? '此会话目前不能准备新任务。保留的原稿和当前目标仍可查看。'
        : 'This session cannot prepare new work right now. The retained draft and current Goal remain available to inspect.',
      unavailable: zh ? '此连接不提供目标功能。' : 'Goals are not available from this connection.',
    },
    exitPlan: zh ? '退出计划模式' : 'Exit Plan mode',
    refreshGoal: zh ? '重新读取当前目标' : 'Reload current Goal',
    refreshPlan: zh ? '重新读取会话模式' : 'Reload session mode',
    reconcilePlan: zh ? '核对模式更改' : 'Check mode change',
    reconcileComposer: zh ? '核对原操作' : 'Check original operation',
    checkingPlan: composerExecutionCopy(locale).checking,
    planCheckFailed: composerExecutionCopy(locale).checkFailed,
    pending: zh ? '正在处理此操作…' : 'Working on this action…',
    exited: zh
      ? '已退出计划模式。关闭此说明后，再点击“目标”准备输入。'
      : 'Plan mode has ended. Close this help, then choose Goal to prepare your prompt.',
    error: (code) => {
      if (code === 'RESULT_UNKNOWN')
        return zh ? '结果尚未确认，请核对原操作。' : 'The result is unconfirmed. Check the original operation.'
      if (code === 'STALE_TARGET' || code === 'VERSION_CONFLICT')
        return zh
          ? '会话状态已变化，请按当前状态重试。'
          : 'The session state changed. Review the current state and try again.'
      if (code === 'DISCONNECTED' || code === 'CONNECTION_CLOSED')
        return zh
          ? '连接已中断，原操作结果将按当前会话核对。'
          : 'The connection was lost. Check the original operation for this session.'
      if (code === 'BUSY')
        return zh ? '另一操作仍在处理中，请稍候。' : 'Another operation is still in progress. Please wait.'
      return zh
        ? '未能完成此操作，请根据当前状态重新读取或核对。'
        : 'The action could not finish. Reload or check the current state.'
    },
  }
}
