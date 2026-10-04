import type { ShellLocale } from './shell-copy'

export function mobileShellNavigationLabel(locale: ShellLocale): string {
  return locale === 'zh-CN' ? '会话工具与页签' : 'Session tools and tabs'
}
