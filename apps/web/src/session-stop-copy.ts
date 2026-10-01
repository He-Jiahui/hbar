import type { SessionStopLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

/** Host platform input is explicit so tests and non-browser hosts stay deterministic. */
export function sessionStopButtonLabel(locale: ShellLocale, platform = ''): string {
  const shortcut = /^(?:mac|darwin|iphone|ipad|ipod)/i.test(platform) ? '⌘.' : 'Ctrl+.'
  return `${locale === 'zh-CN' ? '停止' : 'Stop'} (${shortcut})`
}

export function getSessionStopCopy(locale: ShellLocale): SessionStopLabels {
  const zh = locale === 'zh-CN'
  return {
    sending: zh ? '正在发送停止请求…' : 'Sending the stop request…',
    requested: zh ? '已请求停止，正在等待运行结束。' : 'Stop requested. Waiting for the run to finish.',
    unknown: zh ? '停止结果尚未确认。请核对原运行状态。' : 'The stop result is unconfirmed. Check the original run.',
    checking: zh ? '正在核对原运行状态…' : 'Checking the original run…',
    cancelled: zh ? '原运行已取消。' : 'The original run was cancelled.',
    completed: zh ? '原运行已完成。' : 'The original run completed.',
    runFailed: zh ? '原运行已失败。' : 'The original run failed.',
    interrupted: zh ? '原运行已中断。' : 'The original run was interrupted.',
    guided: zh ? '排队消息已引导至原运行。' : 'The queued message was guided into the original run.',
    failure: (code) => {
      switch (code) {
        case 'UNAUTHORIZED':
        case 'FORBIDDEN':
          return zh
            ? '当前连接无权处理此请求。请确认连接权限。'
            : 'This connection cannot perform the request. Check its permissions.'
        case 'DISCONNECTED':
        case 'CONNECTION_CLOSED':
          return zh ? '连接已断开，未能确认结果。' : 'The connection was lost; the result could not be confirmed.'
        case 'TIMEOUT':
        case 'TIMED_OUT':
          return zh ? '等待响应超时，未能确认结果。' : 'The response timed out; the result could not be confirmed.'
        case 'RESULT_UNKNOWN':
        case 'INVALID_OUTPUT':
          return zh
            ? '未收到可确认的结果。请核对原运行状态。'
            : 'No confirmed result was received. Check the original run.'
        case 'NOT_FOUND':
          return zh
            ? '未找到原运行，无法确认停止结果。'
            : 'The original run was not found; its stop result is unconfirmed.'
        case 'BUSY':
          return zh ? '仍有请求正在处理，请稍后再试。' : 'Another request is still being processed. Try again shortly.'
        case 'CAPABILITY_UNAVAILABLE':
        case 'COMMAND_NOT_FOUND':
        case 'VERSION_MISMATCH':
          return zh ? '当前连接暂不支持此操作。' : 'This action is unavailable on the current connection.'
        case 'CANCELLED':
        case 'DISPOSED':
          return zh
            ? '此请求已结束，运行结果仍需核对。'
            : 'This request ended; the run result still needs to be checked.'
        default:
          // Never expose a transport message, private path or unrecognised code.
          return zh
            ? '未能完成此请求。请检查原运行状态后再试。'
            : 'The request could not be completed. Check the original run before trying again.'
      }
    },
    check: zh ? '核对结果' : 'Check result',
    dismiss: zh ? '关闭提示' : 'Dismiss',
    retry: zh ? '重试停止' : 'Retry stop',
    offline: zh ? '连接已断开，恢复连接后可核对原运行状态。' : 'Disconnected. Reconnect to check the original run.',
  }
}
