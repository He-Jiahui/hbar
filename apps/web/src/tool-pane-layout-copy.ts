import type { ShellLocale } from './shell-copy'

export interface ToolPaneLayoutLabels {
  readonly resize: string
  readonly width: (widthRem: number) => string
  readonly saving: string
  readonly failed: (code: string) => string
  readonly retry: string
}

export function toolPaneLayoutCopy(locale: ShellLocale): ToolPaneLayoutLabels {
  const zh = locale === 'zh-CN'
  return {
    resize: zh ? '调整工具面板宽度' : 'Resize tool pane',
    width: (widthRem) =>
      zh ? `工具面板宽度 ${Number(widthRem.toFixed(2))} rem` : `Tool pane width ${Number(widthRem.toFixed(2))} rem`,
    saving: zh ? '正在保存面板宽度…' : 'Saving pane width…',
    failed: (code) =>
      code === 'COMMAND_CONFLICT'
        ? zh
          ? '布局已变化。可重试保存此宽度，其余布局会保留。'
          : 'The layout changed. Retry this width; other layout choices will be preserved.'
        : zh
          ? '面板宽度未能保存。请重试。'
          : 'The pane width could not be saved. Try again.',
    retry: zh ? '重试保存宽度' : 'Retry saving width',
  }
}
