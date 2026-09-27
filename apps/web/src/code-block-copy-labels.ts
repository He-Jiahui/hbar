import type { HbarCodeBlockLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function codeBlockCopyLabels(locale: ShellLocale): HbarCodeBlockLabels {
  const zh = locale === 'zh-CN'
  return {
    copy: zh ? '复制代码' : 'Copy code',
    copying: zh ? '正在复制' : 'Copying',
    copied: zh ? '已复制' : 'Copied',
    failed: zh ? '无法复制代码，请重试。' : 'Could not copy the code. Try again.',
    unavailable: zh
      ? '此环境无法使用剪贴板，请选择代码后复制。'
      : 'Clipboard access is unavailable. Select the code to copy it.',
    tooLarge: (limit) =>
      zh
        ? `代码超出单次复制上限（${limit.toLocaleString('zh-CN')} 个 UTF-16 单元），请分段选择复制。`
        : `Code exceeds the single-copy limit (${limit.toLocaleString('en-US')} UTF-16 units). Select smaller sections to copy.`,
    retry: zh ? '重试复制' : 'Retry copy',
    language: (language) => language || (zh ? '代码' : 'Code'),
    lines: (count) => (zh ? `${count} 行` : `${count} ${count === 1 ? 'line' : 'lines'}`),
    showMore: (count) => (zh ? `显示其余 ${count} 行` : `Show ${count} more ${count === 1 ? 'line' : 'lines'}`),
    showLess: zh ? '收起代码' : 'Collapse code',
  }
}
