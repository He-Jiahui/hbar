export function notificationFixtureTitle(locale: 'en-US' | 'zh-CN'): string {
  return (locale === 'zh-CN' ? '完整原始通知名称' : 'Complete original notification title ').repeat(50).slice(0, 240)
}

export function notificationFixtureDetail(locale: 'en-US' | 'zh-CN'): string {
  return (
    locale === 'zh-CN'
      ? '原会话中的完整通知详情需要自然换行并保持原动作目标。'
      : 'The complete notification detail belongs to its original session and action target. '
  )
    .repeat(200)
    .slice(0, 4000)
}
