import type { HbarCodeBlockLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'

export function codeBlockCopyLabels(locale: ShellLocale): HbarCodeBlockLabels {
  const zh = locale === 'zh-CN'
  return {
    diagram: {
      title: 'Mermaid',
      source: zh ? '图示源码' : 'Diagram source',
      diagram: zh ? '图示' : 'Diagram',
      preview: zh ? '预览' : 'Preview',
      previewTitle: zh ? 'Mermaid 图示' : 'Mermaid diagram',
      close: zh ? '关闭图示预览' : 'Close diagram preview',
      loading: zh ? '正在绘制图示…' : 'Rendering diagram…',
      generating: zh ? '正在生成图示代码…' : 'Generating diagram code…',
      retry: zh ? '重试绘制' : 'Retry diagram',
      failure: (reason) => {
        switch (reason) {
          case 'empty':
            return zh ? '图示代码为空，可查看源码。' : 'The diagram is empty. View its source.'
          case 'too_large':
            return zh
              ? '图示超过绘制容量，可查看或复制完整源码。'
              : 'The diagram exceeds rendering capacity. View or copy the full source.'
          case 'restricted':
            return zh
              ? '当前支持基本静态图示；其他语法、配置或外部资源请查看源码。'
              : 'Basic static diagrams are supported. View the source for other syntax, configuration or external resources.'
          case 'invalid':
            return zh ? '无法绘制这段图示代码，可查看源码。' : 'This diagram could not be rendered. View its source.'
          case 'busy':
            return zh ? '图示绘制繁忙，可重试或查看源码。' : 'Diagram rendering is busy. Retry or view its source.'
          case 'failed':
            return zh
              ? '图示绘制未完成，可重试或查看源码。'
              : 'Diagram rendering did not complete. Retry or view its source.'
        }
      },
      zoomIn: zh ? '放大图示' : 'Zoom in',
      zoomOut: zh ? '缩小图示' : 'Zoom out',
      resetZoom: zh ? '恢复原始比例' : 'Reset diagram zoom',
      fit: zh ? '适应窗口' : 'Fit diagram',
      zoom: (percent) => `${percent}%`,
      panHelp: zh
        ? '拖动平移，或用滚轮及滚动条浏览；按住 Ctrl／Command 滚动可缩放。'
        : 'Drag to pan, or use the wheel and scrollbars. Hold Ctrl/Command while scrolling to zoom.',
    },
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
