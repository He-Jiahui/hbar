import type { ShellLocale } from './shell-copy'
import type { ToolPaneLayoutLabels } from './tool-pane-layout-copy'

export interface SidebarLayoutLabels extends ToolPaneLayoutLabels {
  readonly reset: string
}

export function sidebarLayoutCopy(locale: ShellLocale): SidebarLayoutLabels {
  const zh = locale === 'zh-CN'
  return {
    resize: zh ? '调整工程侧栏宽度' : 'Resize project sidebar',
    reset: zh ? '双击或按 Enter 恢复默认宽度' : 'Double-click or press Enter to reset the width',
    width: (widthRem) =>
      zh ? `侧栏宽度 ${Number(widthRem.toFixed(2))} rem` : `Sidebar width ${Number(widthRem.toFixed(2))} rem`,
    saving: zh ? '正在保存侧栏宽度…' : 'Saving sidebar width…',
    failed: (code) =>
      code === 'COMMAND_CONFLICT'
        ? zh
          ? '布局已变化。可重试保存侧栏宽度，其余布局会保留。'
          : 'The layout changed. Retry the sidebar width; other layout choices will be preserved.'
        : zh
          ? '侧栏宽度未能保存。请重试。'
          : 'The sidebar width could not be saved. Try again.',
    retry: zh ? '重试保存侧栏宽度' : 'Retry saving sidebar width',
  }
}
