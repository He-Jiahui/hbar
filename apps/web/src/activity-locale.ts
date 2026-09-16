import type { SupportedLocale } from './locale'
export function getActivityCopy(locale: SupportedLocale) {
  const en = locale === 'en-US'
  return {
    totals: en ? 'Session totals' : '整段会话累计',
    runs: (count: number) => (en ? `${count} loaded runs` : `已加载 ${count} 次运行`),
    events: (count: number) => (en ? `${count} loaded events; recent history` : `近期已加载 ${count} 条事件`),
    empty: en ? 'No loaded events' : '暂无已加载事件',
    loading: en ? 'Loading events' : '正在加载事件',
    retry: en ? 'Retry' : '重试',
    resync: en
      ? 'History changed while loading. Retry to load recent events.'
      : '加载期间历史记录已更新，请重试读取近期事件。',
  }
}
