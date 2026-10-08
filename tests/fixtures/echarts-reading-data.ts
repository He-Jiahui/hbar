export function echartsReadingLabel(locale: 'en-US' | 'zh-CN'): string {
  return locale === 'zh-CN'
    ? '原会话完整用量趋势标题与较长本地化说明 '.repeat(12).trim()
    : 'Complete original session usage trend title with a long localized explanation '.repeat(12).trim()
}
