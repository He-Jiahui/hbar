import type { SessionToolFeedbackLabels } from '@hbar/app-react'

export function toolFeedbackLabels(locale: 'zh-CN' | 'en-US'): SessionToolFeedbackLabels {
  const zh = locale === 'zh-CN'
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const duration = (milliseconds: number): string => {
    if (milliseconds < 1) return zh ? '<1 毫秒' : '<1 ms'
    if (milliseconds < 1000) return `${Math.floor(milliseconds)} ${zh ? '毫秒' : 'ms'}`
    const seconds = Math.floor(milliseconds / 1000)
    if (seconds < 60) return `${seconds} ${zh ? '秒' : 's'}`
    const minutes = Math.floor(seconds / 60)
    const rest = seconds % 60
    if (minutes < 60) return zh ? `${minutes} 分 ${rest} 秒` : `${minutes}m ${rest}s`
    const hours = Math.floor(minutes / 60)
    return zh ? `${hours} 小时 ${minutes % 60} 分 ${rest} 秒` : `${hours}h ${minutes % 60}m ${rest}s`
  }
  return {
    pending: zh ? '待执行' : 'Pending',
    duration: (milliseconds, state) =>
      `${zh ? (state === 'running' ? '已执行' : state === 'settled' ? '耗时' : '最后记录') : state === 'running' ? 'Elapsed' : state === 'settled' ? 'Took' : 'Last observed'} ${duration(milliseconds)}`,
    cumulativeDuration: (milliseconds) => `${zh ? '累计耗时' : 'Cumulative time'} ${duration(milliseconds)}`,
    counts: ({ settled, running, pending, skipped, unknown, outcomes }) =>
      [
        zh ? `已结束 ${settled}` : `${settled} settled`,
        zh ? `进行中 ${running}` : `${running} running`,
        zh ? `待执行 ${pending}` : `${pending} pending`,
        ...(outcomes
          ? [
              zh ? `成功 ${outcomes.succeeded}` : `${outcomes.succeeded} succeeded`,
              zh ? `失败 ${outcomes.failed}` : `${outcomes.failed} failed`,
            ]
          : []),
        ...(skipped ? [zh ? `跳过 ${skipped}` : `${skipped} skipped`] : []),
        ...(unknown ? [zh ? `结果未知 ${unknown}` : `${unknown} unknown`] : []),
      ].join(' · '),
    progress: (percentage) => `${format.format(percentage)}%`,
    progressAccessible: (completed, total) =>
      zh ? `已处理 ${completed} / ${total}` : `${completed} of ${total} processed`,
  }
}
