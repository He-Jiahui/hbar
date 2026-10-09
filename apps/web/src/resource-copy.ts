import type { MessageResourceLabels } from '@hbar/app-react'
import type { ShellLocale } from './shell-copy'
export function resourceCopy(locale: ShellLocale): MessageResourceLabels {
  const zh = locale === 'zh-CN'
  const choose = (a: string, b: string) => (zh ? a : b)
  return {
    open: (reference) =>
      choose(
        `打开 ${reference.kind === 'file' ? reference.path : reference.url}`,
        `Open ${reference.kind === 'file' ? reference.path : reference.url}`,
      ),
    opening: choose('正在打开…', 'Opening…'),
    choose: choose('选择要打开的资源', 'Choose a resource to open'),
    close: choose('关闭', 'Close'),
    truncated: choose(
      '结果过多，请使用更完整的路径缩小范围。',
      'Too many matches. Use a more complete path to narrow the results.',
    ),
    menu: choose('资源打开方式', 'Open resource with'),
    internal: choose('在 hbar 内打开', 'Open in hbar'),
    system: choose('使用系统默认打开', 'Open with system default'),
    error: (code) => {
      switch (code) {
        case 'NOT_FOUND':
          return choose('未找到资源，点击可以重试。', 'Resource not found. Click to retry.')
        case 'TARGET_CHANGED':
        case 'STALE_TARGET':
        case 'COMMAND_CONFLICT':
          return choose('会话或文件已变化，请重新打开。', 'The session or file changed. Open it again.')
        case 'TOO_LARGE':
          return choose(
            '资源超过预览上限，请用系统打开。',
            'Resource exceeds the preview limit. Open it with the system.',
          )
        case 'UNSUPPORTED_TYPE':
        case 'UNSUPPORTED_IMAGE':
          return choose('此格式无法预览，请用系统打开。', 'This format cannot be previewed. Open it with the system.')
        case 'PATH_DENIED':
          return choose('此资源不可访问。', 'This resource is not accessible.')
        case 'PLATFORM_UNAVAILABLE':
        case 'CAPABILITY_UNAVAILABLE':
          return choose(
            '当前客户端不支持此打开方式，可右键选择其他方式。',
            'This client does not support that opening method. Right-click to choose another.',
          )
        case 'CANCELLED':
          return choose('已取消打开。', 'Opening cancelled.')
        default:
          return choose('未能打开资源，点击可以重试。', 'Could not open the resource. Click to retry.')
      }
    },
    gallery: {
      title: choose('图片', 'Image'),
      close: choose('关闭图片', 'Close image'),
      previous: choose('上一张', 'Previous'),
      next: choose('下一张', 'Next'),
      position: (index, total) => `${index} / ${total}`,
      loading: choose('正在加载图片…', 'Loading image…'),
      retry: choose('重试', 'Retry'),
      unavailable: choose('图片不可用', 'Image unavailable'),
      select: (name) => choose(`显示 ${name}`, `Show ${name}`),
    },
  }
}
