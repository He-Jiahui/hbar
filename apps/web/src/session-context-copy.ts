import type { HbarSessionProjectContextLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function sessionContextCopy(locale: ShellLocale): HbarSessionProjectContextLabels {
  const choose = (zh: string, en: string) => (locale === 'zh-CN' ? zh : en)
  return {
    project: (name) => choose(`当前工程：${name}`, `Current project: ${name}`),
    branch: (name) => choose(`当前分支：${name}`, `Current branch: ${name}`),
    branchCaption: (name) => {
      const generated = /^hbar\/session-launch\/([a-f0-9]{64})$/.exec(name)?.[1]
      return generated ? choose(`隔离 · ${generated.slice(0, 8)}`, `Isolated · ${generated.slice(0, 8)}`) : name
    },
    loading: choose('读取分支中…', 'Reading branch…'),
    unavailable: (code) => choose(`分支不可用：${code}`, `Branch unavailable: ${code}`),
    disconnected: choose('分支离线', 'Branch offline'),
    retry: choose('重试', 'Retry'),
  }
}
