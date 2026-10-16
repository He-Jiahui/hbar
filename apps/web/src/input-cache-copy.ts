import type { HbarInputCacheLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function inputCacheCopy(locale: ShellLocale): HbarInputCacheLabels {
  const zh = locale === 'zh-CN'
  const text = (chinese: string, english: string) => (zh ? chinese : english)
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 })
  const number = new Intl.NumberFormat(locale)
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const ratio = (value: number | null) => (value === null ? text('不可用', 'Unavailable') : percent.format(value))
  return {
    title: text('输入缓存命中率', 'Input cache hit rate'),
    description: text(
      '缓存读取 ÷ 总输入，按词元加权；总体包含冷启动。',
      'Cached input ÷ total input, weighted by tokens; overall includes cold starts.',
    ),
    overall: text('总体命中率', 'Overall hit rate'),
    recent: text('近期加权命中率', 'Recent weighted rate'),
    lowest: text('近期单次最低', 'Lowest recent request'),
    cacheRead: text('缓存读取：', 'Cache read: '),
    uncached: text('未缓存输入：', 'Uncached input: '),
    trend: text(
      '输入缓存命中率趋势，标注 90% 下限与 95% 目标',
      'Input cache hit rate trend, with 90% minimum and 95% target',
    ),
    empty: text('暂无可用的输入缓存样本。', 'No input cache samples available.'),
    status: {
      empty: text('暂无样本', 'No samples'),
      unavailable: text('数据不完整，无法验收', 'Incomplete data'),
      insufficient: text('样本不足，继续观察', 'More samples needed'),
      'below-minimum': text('低于 90% 下限', 'Below 90% minimum'),
      'below-target': text('尚未稳定达到 95%', 'Below stable 95% target'),
      healthy: text('已稳定达到 95%', 'Stable at 95% or above'),
    },
    percent: ratio,
    tokens: (value) => number.format(value),
    targets: (minimum, target) =>
      text(
        `验收：总体 > ${ratio(minimum)}；最近连续 10 次均 ≥ ${ratio(target)}。`,
        `Acceptance: overall > ${ratio(minimum)}; each of the latest 10 requests ≥ ${ratio(target)}.`,
      ),
    samples: (count, window, low, below) =>
      text(
        `最近 ${number.format(count)}/${window} 次：${low} 次低于下限，${below} 次未达目标。`,
        `Latest ${number.format(count)}/${window}: ${low} below minimum, ${below} below target.`,
      ),
    window: (from, to) => `${date.format(from)} – ${date.format(to)}`,
    bucket: (start, end, value, input, cached) =>
      text(
        `${date.format(start)}–${date.format(end)} · ${ratio(value)} · 缓存 ${number.format(cached)} / 输入 ${number.format(input)}`,
        `${date.format(start)}–${date.format(end)} · ${ratio(value)} · ${number.format(cached)} cached / ${number.format(input)} input`,
      ),
  }
}
