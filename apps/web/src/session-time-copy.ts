import type { ShellLocale } from './shell-copy'

/** The sidebar uses a compact age; the native tooltip keeps the full local date. */
export function sessionTimeCopy(locale: ShellLocale) {
  const zh = locale === 'zh-CN'
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
  const datedYear = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' })
  const fullDate = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const valid = (timestamp: number) =>
    Number.isSafeInteger(timestamp) && timestamp >= 0 && timestamp <= 8_640_000_000_000_000
  return {
    compact: (timestamp: number, now = Date.now()) => {
      if (!valid(timestamp)) return zh ? '时间未知' : 'Unknown'
      const age = Math.max(0, now - timestamp)
      if (age < 60_000) return zh ? '刚刚' : 'now'
      if (age < 3_600_000) return zh ? `${Math.floor(age / 60_000)} 分钟` : `${Math.floor(age / 60_000)}m`
      if (age < 86_400_000) return zh ? `${Math.floor(age / 3_600_000)} 小时` : `${Math.floor(age / 3_600_000)}h`
      if (age < 604_800_000) return zh ? `${Math.floor(age / 86_400_000)} 天` : `${Math.floor(age / 86_400_000)}d`
      return new Date(timestamp).getFullYear() === new Date(now).getFullYear()
        ? date.format(timestamp)
        : datedYear.format(timestamp)
    },
    full: (timestamp: number) =>
      valid(timestamp)
        ? zh
          ? `更新于 ${fullDate.format(timestamp)}`
          : `Updated ${fullDate.format(timestamp)}`
        : zh
          ? '更新时间未知'
          : 'Update time unavailable',
  }
}
