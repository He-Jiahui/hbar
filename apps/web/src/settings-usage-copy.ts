import type { HbarSettingsUsageLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function settingsUsageCopy(locale: ShellLocale): HbarSettingsUsageLabels {
  const zh = locale === 'zh-CN'
  const text = (chinese: string, english: string) => (zh ? chinese : english)
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const currency = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 })
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return {
    title: text('词元用量', 'Token usage'),
    description: text(
      '当前服务端的使用记录，包含所有工程与会话。',
      'Usage recorded by this Host across all projects and sessions.',
    ),
    refresh: text('刷新', 'Refresh'),
    loading: text('正在读取用量…', 'Reading usage…'),
    offline: text('服务端未连接。重连后可刷新。', 'Host disconnected. Refresh after reconnecting.'),
    oldResult: text('以下为上次确认的数据，尚未更新。', 'Showing the last confirmed data, not a fresh result.'),
    empty: text('所选时间范围内暂无使用记录。', 'No usage records in this time range.'),
    gap: text(
      '记录或采样不完整，结果可能不包含全部用量。',
      'Records or samples are incomplete; some usage may be missing.',
    ),
    summary: text('用量摘要', 'Usage summary'),
    tokens: text('输入 + 输出词元', 'Input + output tokens'),
    input: text('输入词元', 'Input tokens'),
    output: text('输出词元', 'Output tokens'),
    cost: text('费用', 'Cost'),
    costUnavailable: text('无可用价格数据', 'Pricing unavailable'),
    costEmpty: text('暂无费用数据', 'No cost data'),
    estimated: (value) => text(`估算 ${value}`, `Estimated ${value}`),
    activity: text('词元使用情况', 'Token activity'),
    windowsLabel: text('用量时间范围', 'Usage time range'),
    windows: [
      { id: '1h', label: text('近 1 小时', 'Last hour') },
      { id: '24h', label: text('近 24 小时', 'Last 24 hours') },
      { id: '7d', label: text('近 7 天', 'Last 7 days') },
      { id: '30d', label: text('近 30 天', 'Last 30 days') },
    ],
    models: text('模型用量', 'Usage by model'),
    noModels: text('暂无模型使用记录。', 'No model usage records.'),
    previous: text('上一页', 'Previous'),
    next: text('下一页', 'Next'),
    page: (from, to, total) =>
      text(
        `${number.format(from)}–${number.format(to)} / ${number.format(total)} 个模型`,
        `${number.format(from)}–${number.format(to)} of ${number.format(total)} models`,
      ),
    tokenCount: (value) => text(`${number.format(value)} Token`, `${number.format(value)} tokens`),
    currency: (value) => currency.format(value),
    model: (provider, model) => `${provider} / ${model}`,
    observedAt: (time) => text(`读取于 ${date.format(time)}`, `Read at ${date.format(time)}`),
    bucket: (start, end, tokens) =>
      `${date.format(start)}–${date.format(end)} · ${number.format(tokens)} ${text('Token', 'tokens')}`,
    error: (code) => text(`用量读取失败：${code}。可刷新重试。`, `Could not read usage: ${code}. Refresh to retry.`),
  }
}
