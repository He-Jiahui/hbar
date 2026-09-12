import { useMemo } from 'react'
import { useThemeSettings } from './theme-store'

export type SupportedLocale = 'zh-CN' | 'en-US'

const messages = {
  'zh-CN': {
    preview: '预览',
    source: '源码',
    copyCode: '复制代码',
    patchDiff: 'Patch 差异',
    gitComparison: 'Git 前后版本比较',
    plainText: '纯文本',
  },
  'en-US': {
    preview: 'Preview',
    source: 'Source',
    copyCode: 'Copy code',
    patchDiff: 'Patch diff',
    gitComparison: 'Git before and after comparison',
    plainText: 'Plain text',
  },
} as const

export type LocaleMessageKey = keyof typeof messages['zh-CN']

export function resolveLocale(locale: string): SupportedLocale {
  return locale.toLocaleLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
}

export function translate(locale: string, key: LocaleMessageKey): string {
  return messages[resolveLocale(locale)][key]
}

export function useLocale() {
  const locale = useThemeSettings((state) => state.profile.typography.locale)
  return useMemo(() => {
    const resolved = resolveLocale(locale)
    return { locale: resolved, t: (key: LocaleMessageKey) => messages[resolved][key] }
  }, [locale])
}
