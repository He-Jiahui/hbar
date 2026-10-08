import { desktopChromeCopySchema, type DesktopChromeCopy } from '@hbar/contracts'
import catalog from './desktop-chrome-copy.json' with { type: 'json' }
import type { ShellLocale } from './shell-copy'

const copy = {
  'zh-CN': desktopChromeCopySchema.parse(catalog['zh-CN']),
  'en-US': desktopChromeCopySchema.parse(catalog['en-US']),
} satisfies Readonly<Record<ShellLocale, DesktopChromeCopy>>

export function desktopChromeCopy(locale: ShellLocale): DesktopChromeCopy {
  return copy[locale]
}
